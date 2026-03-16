from __future__ import annotations

from app.models.user import User, Role, UserRoleScope
from app.models.tenant import Tenant, TenantSettings
from app.models.billing import TenantSubscription, Plan
from app.models.org import CNPJ, OrgUnit
from app.models.questionnaire import QuestionnaireTemplate, QuestionnaireVersion
from app.models.risk import RiskAssessment, RiskCriterionVersion
from app.models.campaign import Campaign
from app.core.security import hash_password
from datetime import datetime


def _mk_tenant(db, name: str, slug: str):
    t = Tenant(name=name, slug=slug, is_active=True)
    db.add(t); db.flush()
    db.add(TenantSettings(tenant_id=t.id, min_anon_threshold=5))

    # attach default plan to unlock features in tests
    plan = db.query(Plan).filter(Plan.key == "START").first()
    if plan:
        db.add(TenantSubscription(tenant_id=t.id, status="trial", plan_id=plan.id, entitlements_snapshot={"features": plan.features or {}, "limits": plan.limits or {}}))
    else:
        db.add(TenantSubscription(tenant_id=t.id, status="trial", entitlements_snapshot={"features": {"LMS": True}, "limits": {}}))
    db.commit()
    db.refresh(t)
    return t


def _mk_tenant_admin(db, tenant_id, email: str):
    role = db.query(Role).filter(Role.key == "TENANT_ADMIN").first()
    if not role:
        role = Role(key="TENANT_ADMIN", name="Tenant Admin")
        db.add(role); db.commit(); db.refresh(role)
    u = User(tenant_id=tenant_id, email=email, full_name="Admin", password_hash=hash_password("123"), is_active=True, is_platform_admin=False)
    db.add(u); db.flush()
    db.add(UserRoleScope(user_id=u.id, role_id=role.id, tenant_id=tenant_id))
    db.commit(); db.refresh(u)
    return u


def _login(client, email: str, password: str):
    r = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200
    return r.json()["access_token"]


def test_questionnaires_list_templates_and_versions(client, db, platform_admin):
    # platform template
    admin_token = _login(client, "platform@nr.com", "admin123")
    r = client.post("/api/v1/questionnaires/templates", json={"key":"nr1_governanca_evidencias","name":"NR1","description":"x","is_platform_managed":True}, headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    platform_template_id = r.json()["id"]

    # tenant template + published version
    t1 = _mk_tenant(db, "T1", "t1")
    u1 = _mk_tenant_admin(db, t1.id, "a@t1.com")
    token = _login(client, "a@t1.com", "123")

    r2 = client.post("/api/v1/questionnaires/templates", json={"key":"custom","name":"Custom","description":"y","is_platform_managed":False}, headers={"Authorization": f"Bearer {token}"})
    assert r2.status_code == 200
    tenant_template_id = r2.json()["id"]

    r3 = client.post(f"/api/v1/questionnaires/templates/{tenant_template_id}/versions", json={"content":{"title":"x","dimensions":[],"questions":[]}}, headers={"Authorization": f"Bearer {token}"})
    assert r3.status_code == 200
    version_id = r3.json()["id"]

    r4 = client.post(f"/api/v1/questionnaires/versions/{version_id}/publish", headers={"Authorization": f"Bearer {token}"})
    assert r4.status_code == 200
    assert r4.json()["status"] == "published"

    # list templates -> should include platform + tenant
    r5 = client.get("/api/v1/questionnaires/templates?limit=50&offset=0", headers={"Authorization": f"Bearer {token}"})
    assert r5.status_code == 200
    items = r5.json()["items"]
    ids = {x["id"] for x in items}
    assert platform_template_id in ids
    assert tenant_template_id in ids

    # list versions
    r6 = client.get(f"/api/v1/questionnaires/templates/{tenant_template_id}/versions?published_only=true", headers={"Authorization": f"Bearer {token}"})
    assert r6.status_code == 200
    assert r6.json()["total"] == 1


def test_campaigns_list(client, db):
    t1 = _mk_tenant(db, "T2", "t2")
    u1 = _mk_tenant_admin(db, t1.id, "b@t2.com")
    token = _login(client, "b@t2.com", "123")

    # Seed cnpj + unit
    cnpj = CNPJ(tenant_id=t1.id, legal_name="Empresa", trade_name=None, cnpj_number="00000000000191")
    db.add(cnpj); db.flush()
    unit = OrgUnit(tenant_id=t1.id, cnpj_id=cnpj.id, name="Financeiro", unit_type="sector", parent_unit_id=None)
    db.add(unit); db.flush()
    db.commit()

    # Seed template/version published for campaign
    tmpl = QuestionnaireTemplate(tenant_id=t1.id, key="k", name="N", description=None, is_platform_managed=False, is_active=True)
    db.add(tmpl); db.flush()
    ver = QuestionnaireVersion(template_id=tmpl.id, version=1, status="published", content={"title":"x","dimensions":[],"questions":[]}, published_at=datetime.utcnow())
    db.add(ver); db.commit(); db.refresh(ver)

    # create campaign
    r = client.post("/api/v1/campaigns", json={"name":"Camp 1","cnpj_id": str(cnpj.id),"org_unit_id": str(unit.id),"questionnaire_version_id": str(ver.id)}, headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    campaign_id = r.json()["id"]

    # list campaigns
    r2 = client.get("/api/v1/campaigns?limit=50&offset=0", headers={"Authorization": f"Bearer {token}"})
    assert r2.status_code == 200
    items = r2.json()["items"]
    assert any(x["id"] == campaign_id for x in items)


def test_lms_list_assignments(client, db):
    t1 = _mk_tenant(db, "T3", "t3")
    u1 = _mk_tenant_admin(db, t1.id, "c@t3.com")
    token = _login(client, "c@t3.com", "123")

    # create content (tenant scoped)
    r = client.post("/api/v1/lms/contents", json={"title":"Video 1","description":"x","content_type":"video","url":"https://example.com/v","duration_minutes":5,"is_platform_managed":False}, headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    content_id = r.json()["id"]

    # create assignment targeting org unit (we can create an org unit quickly)
    cnpj = CNPJ(tenant_id=t1.id, legal_name="Empresa", trade_name=None, cnpj_number="00000000000192")
    db.add(cnpj); db.flush()
    unit = OrgUnit(tenant_id=t1.id, cnpj_id=cnpj.id, name="RH", unit_type="sector", parent_unit_id=None)
    db.add(unit); db.commit(); db.refresh(unit)

    r2 = client.post("/api/v1/lms/assignments", json={"content_item_id": content_id, "org_unit_id": str(unit.id)}, headers={"Authorization": f"Bearer {token}"})
    assert r2.status_code == 200

    r3 = client.get("/api/v1/lms/assignments?limit=50&offset=0", headers={"Authorization": f"Bearer {token}"})
    assert r3.status_code == 200
    assert r3.json()["total"] >= 1


def test_action_plans_list(client, db):
    t1 = _mk_tenant(db, "T4", "t4")
    _mk_tenant_admin(db, t1.id, "d@t4.com")
    token = _login(client, "d@t4.com", "123")

    # Create risk criterion
    crit = RiskCriterionVersion(
        tenant_id=None,
        name="Crit",
        status="published",
        content={"thresholds": []},
        version=1,
        published_at=datetime.utcnow(),
    )
    db.add(crit)
    db.flush()

    # Create cnpj + questionnaire + campaign (campaign_id é obrigatório no RiskAssessment)
    cnpj = CNPJ(tenant_id=t1.id, legal_name="Empresa", trade_name=None, cnpj_number="00000000000193")
    db.add(cnpj)
    db.flush()

    tmpl = QuestionnaireTemplate(tenant_id=t1.id, key="k2", name="N2", description=None, is_platform_managed=False, is_active=True)
    db.add(tmpl)
    db.flush()

    ver = QuestionnaireVersion(
        template_id=tmpl.id,
        version=1,
        status="published",
        content={"title": "x", "dimensions": [], "questions": []},
        published_at=datetime.utcnow(),
    )
    db.add(ver)
    db.flush()

    camp = Campaign(
        tenant_id=t1.id,
        name="Camp",
        cnpj_id=cnpj.id,
        org_unit_id=None,
        questionnaire_version_id=ver.id,
        status="closed",
    )
    db.add(camp)
    db.flush()

    ra = RiskAssessment(
        tenant_id=t1.id,
        campaign_id=camp.id,
        cnpj_id=cnpj.id,
        org_unit_id=None,
        criterion_version_id=crit.id,
        score=1.0,
        level="low",
        dimension_scores={"x": 1.0},
        assessed_at=datetime.utcnow(),
    )
    db.add(ra)
    db.commit()
    db.refresh(ra)

    # Create plan and list
    r = client.post(
        "/api/v1/action-plans",
        json={"risk_assessment_id": str(ra.id)},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200
    plan_id = r.json()["id"]

    r2 = client.get("/api/v1/action-plans?limit=50&offset=0", headers={"Authorization": f"Bearer {token}"})
    assert r2.status_code == 200
    assert any(x["id"] == plan_id for x in r2.json()["items"])
