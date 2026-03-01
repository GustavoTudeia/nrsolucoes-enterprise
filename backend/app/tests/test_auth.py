def test_login_and_me(client, platform_admin):
    r = client.post("/api/v1/auth/login", json={"email":"platform@nr.com","password":"admin123"})
    assert r.status_code == 200
    token = r.json()["access_token"]
    r2 = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r2.status_code == 200
    assert r2.json()["email"] == "platform@nr.com"
    assert r2.json()["is_platform_admin"] is True
