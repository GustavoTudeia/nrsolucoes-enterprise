from app.models.user import User
from app.core.security import hash_password

def test_non_platform_cannot_create_tenant(client, db):
    u = User(tenant_id=None, email="x@x.com", full_name="X", password_hash=hash_password("123"), is_active=True, is_platform_admin=False)
    db.add(u); db.commit(); db.refresh(u)

    r = client.post("/api/v1/auth/login", json={"email":"x@x.com","password":"123"})
    assert r.status_code == 200
    token = r.json()["access_token"]

    r2 = client.post("/api/v1/tenants", json={"name":"Tenant A"}, headers={"Authorization": f"Bearer {token}"})
    assert r2.status_code == 403
