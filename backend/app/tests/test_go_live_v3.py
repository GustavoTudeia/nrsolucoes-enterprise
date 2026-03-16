from __future__ import annotations

from datetime import datetime

from app.core.security import hash_password
from app.models.billing import Plan, TenantSubscription
from app.models.org import CNPJ, OrgUnit
from app.models.tenant import Tenant, TenantSettings
from app.models.user import Role, User, UserRoleScope


def _mk_enterprise_tenant(db, name: str, slug: str):
    t = Tenant(name=name, slug=slug, is_active=True)
    db.add(t)
    db.flush()
    db.add(TenantSettings(tenant_id=t.id, min_anon_threshold=2))
    plan = db.query(Plan).filter(Plan.key == "PRO").first()
    if plan:
        db.add(TenantSubscription(tenant_id=t.id, status="active", plan_id=plan.id, entitlements_snapshot={"features": plan.features or {}, "limits": plan.limits or {}}))
    else:
        db.add(TenantSubscription(tenant_id=t.id, status="active", entitlements_snapshot={"features": {"RISK_INVENTORY": True, "NR17": True, "REPORTS": True}, "limits": {}}))
    db.commit()
    db.refresh(t)
    return t


def _mk_tenant_admin(db, tenant_id, email: str):
    role = db.query(Role).filter(Role.key == "TENANT_ADMIN").first()
    if not role:
        role = Role(key="TENANT_ADMIN", name="Tenant Admin")
        db.add(role)
        db.commit()
        db.refresh(role)
    u = User(tenant_id=tenant_id, email=email, full_name="Admin", password_hash=hash_password("123"), is_active=True, is_platform_admin=False)
    db.add(u)
    db.flush()
    db.add(UserRoleScope(user_id=u.id, role_id=role.id, tenant_id=tenant_id))
    db.commit()
    db.refresh(u)
    return u


def _login(client, email: str, password: str):
    r = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200
    return r.json()["access_token"]


def test_pgr_formal_approval_flow(client, db):
    t = _mk_enterprise_tenant(db, "T PGR", "tpgr")
    _mk_tenant_admin(db, t.id, "pgr@tenant.com")
    token = _login(client, "pgr@tenant.com", "123")

    cnpj = CNPJ(tenant_id=t.id, legal_name="Empresa PGR", trade_name=None, cnpj_number="00000000001010")
    db.add(cnpj)
    db.flush()
    unit = OrgUnit(tenant_id=t.id, cnpj_id=cnpj.id, name="Operação", unit_type="unit", parent_unit_id=None)
    db.add(unit)
    db.commit()

    payload = {
        "cnpj_id": str(cnpj.id),
        "org_unit_id": str(unit.id),
        "hazard_group": "ergonomic",
        "hazard_name": "Postura inadequada",
        "process_name": "Administrativo",
        "activity_name": "Digitação",
        "position_name": "Assistente",
        "severity": 3,
        "probability": 3,
        "existing_controls": ["Pausas orientadas"],
        "proposed_controls": ["Ajuste de monitor"],
        "evidence_requirements": ["Foto do posto"],
    }
    r = client.post("/api/v1/inventory/items", json=payload, headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200, r.text
    item_id = r.json()["id"]

    r2 = client.post(f"/api/v1/inventory/items/{item_id}/approve", json={"approval_notes": "Aprovado para compor o inventário"}, headers={"Authorization": f"Bearer {token}"})
    assert r2.status_code == 200, r2.text
    assert r2.json()["status"] == "approved"

    r3 = client.post("/api/v1/pgr/approvals", json={"cnpj_id": str(cnpj.id), "org_unit_id": str(unit.id), "document_scope": "inventory", "version_label": "INV-2026.03"}, headers={"Authorization": f"Bearer {token}"})
    assert r3.status_code == 200, r3.text
    body = r3.json()
    assert body["version_label"] == "INV-2026.03"
    assert body["inventory_item_count"] == 1
    assert len(body["snapshot_hash"]) >= 32

    r4 = client.get("/api/v1/pgr/approvals", headers={"Authorization": f"Bearer {token}"})
    assert r4.status_code == 200
    assert r4.json()["total"] == 1

    r5 = client.get("/api/v1/reports/readiness", headers={"Authorization": f"Bearer {token}"})
    assert r5.status_code == 200
    steps = {s["key"]: s["done"] for s in r5.json()["steps"]}
    assert steps["risk_inventory"] is True
    assert steps["pgr_signoff"] is True



def test_ergonomic_assessment_flow(client, db):
    t = _mk_enterprise_tenant(db, "T Ergo", "tergo")
    _mk_tenant_admin(db, t.id, "ergo@tenant.com")
    token = _login(client, "ergo@tenant.com", "123")

    cnpj = CNPJ(tenant_id=t.id, legal_name="Empresa Ergo", trade_name=None, cnpj_number="00000000001011")
    db.add(cnpj)
    db.commit()

    payload = {
        "cnpj_id": str(cnpj.id),
        "assessment_type": "AEP",
        "title": "AEP administrativo",
        "process_name": "Administrativo",
        "activity_name": "Digitação",
        "position_name": "Assistente",
        "psychosocial_factors": ["Prazo curto"],
        "findings": ["Monitor baixo"],
        "recommendations": ["Ajustar altura do monitor"],
    }
    r = client.post("/api/v1/pgr/ergonomics", json=payload, headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200, r.text
    assessment_id = r.json()["id"]

    r2 = client.post(f"/api/v1/pgr/ergonomics/{assessment_id}/approve", json={"approval_notes": "Aprovado"}, headers={"Authorization": f"Bearer {token}"})
    assert r2.status_code == 200, r2.text
    assert r2.json()["status"] == "approved"

    r3 = client.get("/api/v1/pgr/ergonomics", headers={"Authorization": f"Bearer {token}"})
    assert r3.status_code == 200
    assert r3.json()["total"] == 1
    assert r3.json()["items"][0]["assessment_type"] == "AEP"



def test_go_live_health_endpoints(client, platform_admin):
    r = client.get("/api/v1/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"

    r2 = client.get("/api/v1/ready")
    assert r2.status_code == 200
    assert "checks" in r2.json()
    assert r2.json()["checks"]["database"] is True

    token = _login(client, "platform@nr.com", "admin123")
    r3 = client.get("/api/v1/go-live-check", headers={"Authorization": f"Bearer {token}"})
    assert r3.status_code == 200
    assert "checks" in r3.json()
    assert r3.json()["environment"] == "test"
