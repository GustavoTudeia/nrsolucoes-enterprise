from app.models.user import User, Role, UserRoleScope
from app.models.tenant import Tenant, TenantSettings
from app.models.org import CNPJ
from app.core.security import hash_password
from app.core.config import settings

def _mk_tenant(db, name):
    t = Tenant(name=name, is_active=True)
    db.add(t); db.flush()
    db.add(TenantSettings(tenant_id=t.id, min_anon_threshold=5))
    db.commit()
    db.refresh(t)
    return t

def test_tenant_isolation_cnpj(client, db):
    t1 = _mk_tenant(db, "T1")
    t2 = _mk_tenant(db, "T2")

    # seed role TENANT_ADMIN exists in seed, but ensure
    role = db.query(Role).filter(Role.key=="TENANT_ADMIN").first()
    if not role:
        role = Role(key="TENANT_ADMIN", name="Tenant Admin"); db.add(role); db.commit(); db.refresh(role)

    u1 = User(tenant_id=t1.id, email="a@t1.com", full_name="A", password_hash=hash_password("123"), is_active=True, is_platform_admin=False)
    u2 = User(tenant_id=t2.id, email="b@t2.com", full_name="B", password_hash=hash_password("123"), is_active=True, is_platform_admin=False)
    db.add_all([u1,u2]); db.flush()
    db.add(UserRoleScope(user_id=u1.id, role_id=role.id, tenant_id=t1.id))
    db.add(UserRoleScope(user_id=u2.id, role_id=role.id, tenant_id=t2.id))
    db.commit(); db.refresh(u1); db.refresh(u2)

    # create cnpj under tenant1 directly in db
    c = CNPJ(tenant_id=t1.id, legal_name="Empresa T1", trade_name=None, cnpj_number="00000000000191")
    db.add(c); db.commit(); db.refresh(c)

    # login as user2 and list cnpjs -> should be empty
    r = client.post("/api/v1/auth/login", json={"email":"b@t2.com","password":"123"})
    token = r.json()["access_token"]
    r2 = client.get("/api/v1/org/cnpjs", headers={"Authorization": f"Bearer {token}"})
    assert r2.status_code == 200
    assert r2.json() == []
