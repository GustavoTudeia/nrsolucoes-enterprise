from __future__ import annotations

from datetime import datetime

import boto3
from botocore.config import Config as BotoConfig
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import APIRouter, Depends
from fastapi.responses import PlainTextResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.deps import require_platform_admin
from app.core.config import settings
from app.core.metrics import metrics_registry
from app.core.migrations import get_migration_status
from app.db.session import engine, get_db
from app.services.cache import redis_ping

router = APIRouter()


def _check_db(db: Session) -> bool:
    try:
        db.execute(text("SELECT 1"))
        return True
    except Exception:
        return False



def _check_minio() -> bool:
    if settings.STORAGE_BACKEND != "s3":
        return True
    try:
        session = boto3.session.Session()
        client = session.client(
            "s3",
            endpoint_url=settings.S3_ENDPOINT_URL,
            aws_access_key_id=settings.S3_ACCESS_KEY_ID,
            aws_secret_access_key=settings.S3_SECRET_ACCESS_KEY,
            region_name=settings.S3_REGION,
            use_ssl=settings.S3_USE_SSL,
            config=BotoConfig(signature_version="s3v4", connect_timeout=3, read_timeout=3),
        )
        client.head_bucket(Bucket=settings.S3_BUCKET)
        return True
    except (BotoCoreError, ClientError, Exception):
        return False


@router.get("/health")
def health():
    return {"status": "ok", "app": settings.APP_NAME, "version": settings.APP_VERSION, "time": datetime.utcnow().isoformat()}


@router.get("/ready")
def ready(db: Session = Depends(get_db)):
    migration = get_migration_status(engine)
    checks = {
        "database": _check_db(db),
        "redis": redis_ping(),
        "storage": _check_minio(),
        "jwt_secret": bool(settings.JWT_SECRET_KEY and "CHANGE_ME" not in settings.JWT_SECRET_KEY and len(settings.JWT_SECRET_KEY.strip()) >= 16),
        "legal_urls": bool(settings.LEGAL_TERMS_URL and settings.LEGAL_PRIVACY_URL),
        "migrations_current": migration.is_current or settings.ENV in {"dev", "test"},
    }
    metrics_registry.set_gauge("health_ready_database", 1 if checks["database"] else 0)
    metrics_registry.set_gauge("health_ready_redis", 1 if checks["redis"] else 0)
    metrics_registry.set_gauge("health_ready_storage", 1 if checks["storage"] else 0)
    metrics_registry.set_gauge("health_ready_migrations", 1 if checks["migrations_current"] else 0)
    return {
        "status": "ready" if all(checks.values()) else "degraded",
        "checks": checks,
        "migration": {"current_revision": migration.current_revision, "head_revision": migration.head_revision},
    }


@router.get("/go-live-check")
def go_live_check(_user=Depends(require_platform_admin), db: Session = Depends(get_db)):
    migration = get_migration_status(engine)
    checks = {
        "database": _check_db(db),
        "redis": redis_ping(),
        "storage": _check_minio(),
        "smtp": bool(settings.SMTP_HOST and settings.SMTP_FROM_EMAIL),
        "stripe": (not settings.STRIPE_ENABLED) or bool(settings.STRIPE_SECRET_KEY),
        "migrations_current": migration.is_current or settings.ENV in {"dev", "test"},
        "prod_guardrails": True,
    }
    if settings.ENV not in {"dev", "test"}:
        checks["prod_guardrails"] = (
            len((settings.JWT_SECRET_KEY or "").strip()) >= 32
            and not settings.AUTO_CREATE_SCHEMA
            and not settings.AUTO_MIGRATE_SCHEMA
            and not settings.DEV_RETURN_OTP
            and not settings.DEV_RETURN_PASSWORD_RESET_TOKEN
        )
    return {
        "status": "go" if all(checks.values()) else "attention",
        "environment": settings.ENV,
        "checks": checks,
        "migration": {"current_revision": migration.current_revision, "head_revision": migration.head_revision},
    }


@router.get("/metrics", response_class=PlainTextResponse)
def metrics():
    return metrics_registry.render_prometheus()
