from __future__ import annotations
import os
import pytest
from fastapi.testclient import TestClient

# Use SQLite for tests to keep them self-contained
os.environ["DATABASE_URL"] = "sqlite+pysqlite:///./test_nrsolucoes.db"
os.environ["AUTO_CREATE_SCHEMA"] = "true"
os.environ["ENV"] = "test"
os.environ["STRIPE_WEBHOOK_SECRET"] = ""
os.environ["STRIPE_ENABLED"] = "false"
os.environ["JWT_SECRET_KEY"] = "test_secret_key_123"
os.environ["STRIPE_ENABLED"] = "false"

from app.main import create_app
from app.db.session import engine, SessionLocal
from app.db.base import Base
from app.models.user import User
from app.core.security import hash_password

@pytest.fixture(scope="session", autouse=True)
def setup_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)

@pytest.fixture()
def db():
    s = SessionLocal()
    try:
        yield s
    finally:
        s.close()

@pytest.fixture()
def client(db):
    app = create_app()
    return TestClient(app)

@pytest.fixture()
def platform_admin(db):
    u = User(
        tenant_id=None,
        email="platform@nr.com",
        full_name="Platform Admin",
        password_hash=hash_password("admin123"),
        is_active=True,
        is_platform_admin=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u
