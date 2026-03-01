from __future__ import annotations

from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    ENV: str = "dev"
    APP_NAME: str = "NRSolucoes API"
    APP_VERSION: str = "1.0.0"
    AUTO_CREATE_SCHEMA: bool = True

    # Aplica correções de schema incrementais (idempotentes) em dev.
    # Em produção, prefira migrations (Alembic) e deixe isso como false.
    AUTO_MIGRATE_SCHEMA: bool = True

    CORS_ORIGINS: str = ""

    JWT_SECRET_KEY: str = "CHANGE_ME"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    DATABASE_URL: str = "postgresql+psycopg2://nr:nr@localhost:5432/nrsolucoes"

    DEFAULT_MIN_ANON_THRESHOLD: int = 5

    # Onboarding: aplica automaticamente um pack de templates (questionários/LMS) ao criar um novo tenant.
    AUTO_APPLY_TEMPLATE_PACK_KEY: str = "NR1_DEFAULT"  # vazio => não aplica

    # Billing (Stripe)
    STRIPE_ENABLED: bool = False
    STRIPE_SECRET_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""
    STRIPE_SUCCESS_URL: str = "http://localhost:3000/billing/success"
    STRIPE_CANCEL_URL: str = "http://localhost:3000/billing/cancel"
    STRIPE_BILLING_PORTAL_RETURN_URL: str = "http://localhost:3000/billing"

    # Segurança/Autenticação
    # Em ambiente enterprise, esses toggles DEV devem ficar DESLIGADOS.
    # Em dev local (ENV=dev), você pode ligá-los para acelerar testes.
    DEV_RETURN_OTP: bool = False
    DEV_RETURN_PASSWORD_RESET_TOKEN: bool = False
    PASSWORD_RESET_TOKEN_TTL_MINUTES: int = 30

    # LGPD / Termos (controle de aceite)
    LEGAL_TERMS_VERSION: str = "2026-01-01"
    LEGAL_PRIVACY_VERSION: str = "2026-01-01"
    LEGAL_TERMS_URL: str = "http://localhost:3000/termos"
    LEGAL_PRIVACY_URL: str = "http://localhost:3000/privacidade"

    # Storage (LMS uploads) - recomendado: MinIO (S3 compatível) em dev; S3/GCS em produção
    STORAGE_BACKEND: str = "s3"  # s3 recomendado
    STORAGE_LOCAL_DIR: str = "./uploads"

    S3_ENDPOINT_URL: str = "http://minio:9000"
    S3_PUBLIC_ENDPOINT_URL: str = (
        ""  # ex: http://localhost:9000 (para browser)  # ex: http://minio:9000
    )
    S3_ACCESS_KEY_ID: str = "minioadmin"
    S3_SECRET_ACCESS_KEY: str = "minioadmin"
    S3_BUCKET: str = "nrsolucoes"
    S3_REGION: str = "us-east-1"
    S3_USE_SSL: bool = False
    S3_PRESIGN_EXPIRES_SECONDS: int = 3600

    # Infra
    REDIS_URL: str = "redis://redis:6379/0"

    SMTP_HOST: str = ""
    SMTP_PORT: int = 2525
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM_EMAIL: str = "noreply@nrsolucoes.com.br"
    SMTP_FROM_NAME: str = "NR Soluções"
    FRONTEND_URL: str = "http://localhost:3000"

    def cors_list(self) -> List[str]:
        if not self.CORS_ORIGINS:
            return []
        return [x.strip() for x in self.CORS_ORIGINS.split(",") if x.strip()]


settings = Settings()

# Guardrails de produção: evita deploy acidental com segredos/toggles inseguros.
if settings.ENV != "dev":
    # Segredo JWT: evita placeholder e segredos fracos
    if (
        not settings.JWT_SECRET_KEY
        or "CHANGE_ME" in settings.JWT_SECRET_KEY
        or len(settings.JWT_SECRET_KEY.strip()) < 32
    ):
        raise RuntimeError(
            "JWT_SECRET_KEY inválido/fraco para produção. Use um valor aleatório com pelo menos 32 caracteres."
        )

    # DEV toggles
    if settings.DEV_RETURN_OTP or settings.DEV_RETURN_PASSWORD_RESET_TOKEN:
        raise RuntimeError("Toggles DEV_RETURN_* devem ser false fora de ENV=dev.")

    # Schema automation (produção => migrations)
    if settings.AUTO_CREATE_SCHEMA or settings.AUTO_MIGRATE_SCHEMA:
        raise RuntimeError(
            "AUTO_CREATE_SCHEMA/AUTO_MIGRATE_SCHEMA devem ser false fora de ENV=dev. Use migrations (Alembic)."
        )
