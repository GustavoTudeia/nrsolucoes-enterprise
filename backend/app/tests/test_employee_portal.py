from app.models.tenant import Tenant, TenantSettings
from app.models.employee import Employee
from app.models.user import Role

def test_employee_otp_flow(client, db):
    # create tenant and employee
    t = Tenant(name="T", is_active=True)
    db.add(t); db.flush()
    db.add(TenantSettings(tenant_id=t.id, min_anon_threshold=5))
    e = Employee(tenant_id=t.id, identifier="manoel@empresa.com", full_name="Manoel", org_unit_id=None, is_active=True)
    db.add(e)
    db.commit(); db.refresh(e)

    r = client.post("/api/v1/employee/auth/otp/start", json={"tenant_id": str(t.id), "identifier":"manoel@empresa.com"})
    assert r.status_code == 200
    code = r.json()["dev_code"]
    r2 = client.post("/api/v1/employee/auth/otp/verify", json={"tenant_id": str(t.id), "identifier":"manoel@empresa.com","code":code})
    assert r2.status_code == 200
    token = r2.json()["access_token"]

    r3 = client.get("/api/v1/employee/me", headers={"Authorization": f"Bearer {token}"})
    assert r3.status_code == 200
    assert r3.json()["identifier"] == "manoel@empresa.com"
