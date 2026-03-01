import json
from datetime import datetime

from app.models.tenant import Tenant, TenantSettings
from app.models.billing import TenantSubscription
from app.models.org import CNPJ, OrgUnit
from app.models.questionnaire import QuestionnaireTemplate, QuestionnaireVersion
from app.models.campaign import Campaign

def test_aggregate_by_org_unit_blocks_below_threshold(client, db):
    # tenant + settings threshold=2
    t = Tenant(name="T", slug="t-agg", is_active=True)
    db.add(t); db.flush()
    db.add(TenantSettings(tenant_id=t.id, min_anon_threshold=2))
    db.add(TenantSubscription(tenant_id=t.id, status="active", entitlements_snapshot={"features":{}, "limits":{}}))
    cnpj = CNPJ(tenant_id=t.id, legal_name="Empresa", trade_name=None, cnpj_number="00000000000191")
    db.add(cnpj); db.flush()
    u1 = OrgUnit(tenant_id=t.id, cnpj_id=cnpj.id, name="Financeiro", unit_type="sector", parent_unit_id=None)
    u2 = OrgUnit(tenant_id=t.id, cnpj_id=cnpj.id, name="RH", unit_type="sector", parent_unit_id=None)
    db.add_all([u1,u2]); db.flush()

    qt = QuestionnaireTemplate(tenant_id=t.id, key="NR1", name="NR1", description=None, is_platform_managed=False, is_active=True)
    db.add(qt); db.flush()
    qv = QuestionnaireVersion(template_id=qt.id, version=1, status="published", content={
        "questions":[
            {"id":"q1","dimension":"workload","text":"...","weight":1,"scale_min":1,"scale_max":5},
            {"id":"q2","dimension":"support","text":"...","weight":1,"scale_min":1,"scale_max":5},
        ]
    })
    db.add(qv); db.flush()

    camp = Campaign(tenant_id=t.id, name="CNPJ-wide", cnpj_id=cnpj.id, org_unit_id=None, questionnaire_version_id=qv.id, status="open", opened_at=datetime.utcnow(), closed_at=None)
    db.add(camp); db.commit()

    # Submit 1 response for each unit -> below threshold 2 per unit
    r = client.post(f"/api/v1/campaigns/{camp.id}/responses", json={"org_unit_id": str(u1.id), "answers":{"q1":5,"q2":4}})
    assert r.status_code == 200
    r = client.post(f"/api/v1/campaigns/{camp.id}/responses", json={"org_unit_id": str(u2.id), "answers":{"q1":2,"q2":3}})
    assert r.status_code == 200

    # Now aggregate by org-unit requires auth; we create tenant admin token via direct DB (reuse auth endpoint needs password hash)
    from app.models.user import User, Role, UserRoleScope
    from app.core.security import hash_password
    role = db.query(Role).filter(Role.key=="TENANT_ADMIN").first()
    if not role:
        role = Role(key="TENANT_ADMIN", name="Tenant Admin")
        db.add(role); db.flush()
    user = User(tenant_id=t.id, email="admin@t.com", full_name="Admin", password_hash=hash_password("123"), is_active=True, is_platform_admin=False)
    db.add(user); db.flush()
    db.add(UserRoleScope(user_id=user.id, role_id=role.id, tenant_id=t.id))
    db.commit()

    login = client.post("/api/v1/auth/login", json={"email":"admin@t.com","password":"123"})
    assert login.status_code == 200
    token = login.json()["access_token"]

    agg = client.get(f"/api/v1/campaigns/{camp.id}/aggregate/by-org-unit", headers={"Authorization": f"Bearer {token}"})
    assert agg.status_code == 200
    data = agg.json()
    # both groups should be blocked because each has 1 response (<2)
    assert len(data["blocked_groups"]) == 2
