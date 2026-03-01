from __future__ import annotations

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from app.core.config import settings

def make_engine():
    url = settings.DATABASE_URL
    if url.startswith('sqlite'):
        return create_engine(url, connect_args={'check_same_thread': False}, pool_pre_ping=True)
    return create_engine(url, pool_pre_ping=True)

engine = make_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

def get_db():
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()