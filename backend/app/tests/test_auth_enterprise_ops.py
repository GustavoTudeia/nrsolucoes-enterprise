from __future__ import annotations

from app.core.config import settings
from app.models.user import User
from app.core.security import hash_password


def test_login_rate_limit(client, db):
    settings.AUTH_RATE_LIMIT_LOGIN = 2
    settings.AUTH_RATE_LIMIT_LOGIN_WINDOW_SECONDS = 60

    user = User(
        email="rate@nr.com",
        full_name="Rate Limit",
        password_hash=hash_password("senha123"),
        is_active=True,
    )
    db.add(user)
    db.commit()

    r1 = client.post("/api/v1/auth/login", json={"email": "rate@nr.com", "password": "errada"})
    assert r1.status_code == 401
    r2 = client.post("/api/v1/auth/login", json={"email": "rate@nr.com", "password": "errada"})
    assert r2.status_code == 401
    r3 = client.post("/api/v1/auth/login", json={"email": "rate@nr.com", "password": "errada"})
    assert r3.status_code == 429



def test_refresh_token_rotation_and_reuse_detection(client, db):
    user = User(
        email="refresh@nr.com",
        full_name="Refresh",
        password_hash=hash_password("senha123"),
        is_active=True,
    )
    db.add(user)
    db.commit()

    login = client.post("/api/v1/auth/login", json={"email": "refresh@nr.com", "password": "senha123"})
    assert login.status_code == 200
    payload = login.json()
    first_refresh = payload["refresh_token"]

    rotate = client.post("/api/v1/auth/refresh", json={"refresh_token": first_refresh})
    assert rotate.status_code == 200
    rotated_payload = rotate.json()
    assert rotated_payload["refresh_token"] != first_refresh
    assert rotated_payload["access_token"] != payload["access_token"]

    reused = client.post("/api/v1/auth/refresh", json={"refresh_token": first_refresh})
    assert reused.status_code == 401



def test_ready_includes_redis_storage_and_migrations(client):
    r = client.get("/api/v1/ready")
    assert r.status_code == 200
    body = r.json()
    assert "database" in body["checks"]
    assert "redis" in body["checks"]
    assert "storage" in body["checks"]
    assert "migrations_current" in body["checks"]



def test_metrics_endpoint_returns_text(client):
    client.get("/api/v1/health")
    r = client.get("/api/v1/metrics")
    assert r.status_code == 200
    assert "http_requests_total" in r.text or r.text == ""
