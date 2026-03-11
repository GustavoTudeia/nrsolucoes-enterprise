from __future__ import annotations

from fastapi import FastAPI
from app.core.logging import configure_logging
from fastapi.middleware.cors import CORSMiddleware
from app.core.middleware import RequestIdMiddleware
from sqlalchemy.orm import Session

from app.core.config import settings
from app.api.v1.router import router as api_router
from app.db.session import engine
from app.db.base import Base
from app.models import *  # noqa
from app.services.seed import seed_platform_defaults
from app.db.bootstrap_migrations import apply_bootstrap_migrations

import logging
logger = logging.getLogger(__name__)

def create_app() -> FastAPI:
    configure_logging()
    app = FastAPI(title=settings.APP_NAME, version=settings.APP_VERSION)

    app.add_middleware(RequestIdMiddleware)

    if settings.cors_list():
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_list(),
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    app.include_router(api_router)

    @app.on_event("startup")
    def _startup():
        if settings.AUTO_CREATE_SCHEMA:
            Base.metadata.create_all(bind=engine)
        # DEV schema bootstrap: adiciona colunas/tipos que não são criados por create_all()
        if getattr(settings, "AUTO_MIGRATE_SCHEMA", False):
            apply_bootstrap_migrations(engine)
        # seed roles/plans once
        from app.db.session import SessionLocal
        db: Session = SessionLocal()
        try:
            seed_platform_defaults(db)
        finally:
            db.close()

        # Expire overdue enrollments for all active tenants
        try:
            from app.services.enrollment_service import EnrollmentService
            from app.models.tenant import Tenant
            db = SessionLocal()
            try:
                tenants = db.query(Tenant).filter(Tenant.is_active == True).all()
                total_expired = 0
                for tenant in tenants:
                    service = EnrollmentService(db)
                    count = service.expire_overdue(tenant.id)
                    total_expired += count
                db.commit()
                if total_expired > 0:
                    logger.info(f"schema-bootstrap: expired {total_expired} overdue enrollments")
            finally:
                db.close()
        except Exception as e:
            logger.warning(f"Failed to expire overdue enrollments: {e}")

    return app

app = create_app()
