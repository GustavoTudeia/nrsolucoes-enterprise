from __future__ import annotations

"""Migrações idempotentes (bootstrap) para DEV.

Este projeto originalmente usa `Base.metadata.create_all()`, que **não** altera colunas/tipos
em tabelas já existentes. Se você atualizar o código e reutilizar o mesmo volume do Postgres,
o schema pode ficar "atrasado" e gerar erros do tipo:

- UndefinedColumn: column tenant_settings.brand_name does not exist
- UndefinedFunction: operator does not exist: character varying = boolean

Para destravar o desenvolvimento local sem exigir Alembic, este módulo aplica correções
incrementais de schema (ADD COLUMN / ALTER TYPE) de forma segura e idempotente.

Em produção, o recomendado é Alembic (migrations versionadas) e `AUTO_MIGRATE_SCHEMA=false`.
"""

from typing import Optional
import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)


def _pg_column_type(conn, table: str, column: str) -> Optional[str]:
    row = conn.execute(
        text(
            """
            SELECT data_type
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = :table
              AND column_name = :column
            """
        ),
        {"table": table, "column": column},
    ).fetchone()
    return row[0] if row else None


def _pg_table_exists(conn, table: str) -> bool:
    row = conn.execute(
        text(
            """
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name = :table
            """
        ),
        {"table": table},
    ).fetchone()
    return bool(row)


def _ensure_bool_column(conn, table: str, column: str) -> None:
    """Garante que uma coluna exista e seja boolean.

    - Se não existir, cria como boolean NOT NULL DEFAULT true.
    - Se existir com outro tipo (ex: varchar), converte valores comuns para boolean.

    Obs: em bases grandes, ALTER TABLE pode bloquear; aqui é pensado para DEV/local.
    """

    col_type = _pg_column_type(conn, table, column)

    # Não existe? cria
    if not col_type:
        conn.execute(
            text(
                f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} boolean NOT NULL DEFAULT true"
            )
        )
        return

    # Já é boolean, ok
    if col_type == "boolean":
        return

    # Converte valores comuns em boolean; fallback = true
    conn.execute(
        text(
            f"""
            ALTER TABLE {table}
            ALTER COLUMN {column} TYPE boolean
            USING (
                CASE
                    WHEN {column} IS NULL THEN true
                    WHEN lower({column}::text) IN ('t','true','1','yes','y','sim','s') THEN true
                    WHEN lower({column}::text) IN ('f','false','0','no','n','nao','não') THEN false
                    ELSE true
                END
            )
            """
        )
    )

    # Padroniza default e not null
    conn.execute(text(f"ALTER TABLE {table} ALTER COLUMN {column} SET DEFAULT true"))
    conn.execute(text(f"ALTER TABLE {table} ALTER COLUMN {column} SET NOT NULL"))



def _add_column_if_missing(conn, table: str, column: str, ddl_type: str) -> None:
    col_type = _pg_column_type(conn, table, column)
    if col_type:
        return
    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {ddl_type}"))


def apply_bootstrap_migrations(engine: Engine) -> None:
    """Aplica correções idempotentes de schema.

    Regras:
    - Só roda em Postgres.
    - Não cria tabelas (isso é responsabilidade do create_all).
    - Não remove nada; apenas adiciona colunas e ajusta tipos quando claramente incompatíveis.
    """

    if engine.dialect.name != "postgresql":
        return

    logger.info("schema-bootstrap: checking for incremental schema fixes")

    with engine.begin() as conn:
        # tenant_settings: branding/white-label
        if _pg_table_exists(conn, "tenant_settings"):
            logger.info("schema-bootstrap: ensuring tenant_settings branding columns")
            _add_column_if_missing(conn, "tenant_settings", "brand_name", "VARCHAR(200)")
            _add_column_if_missing(conn, "tenant_settings", "logo_url", "VARCHAR(1000)")
            _add_column_if_missing(conn, "tenant_settings", "primary_color", "VARCHAR(32)")
            _add_column_if_missing(conn, "tenant_settings", "secondary_color", "VARCHAR(32)")
            _add_column_if_missing(conn, "tenant_settings", "support_email", "VARCHAR(200)")
            _add_column_if_missing(conn, "tenant_settings", "custom_domain", "VARCHAR(200)")
            _add_column_if_missing(conn, "tenant_settings", "login_background_url", "VARCHAR(1000)")

        # Tipos boolean em tabelas clássicas
        if _pg_table_exists(conn, "tenant"):
            logger.info("schema-bootstrap: ensuring tenant.is_active boolean")
            _ensure_bool_column(conn, "tenant", "is_active")
        if _pg_table_exists(conn, "cnpj"):
            logger.info("schema-bootstrap: ensuring cnpj.is_active boolean")
            _ensure_bool_column(conn, "cnpj", "is_active")
        if _pg_table_exists(conn, "org_unit"):
            logger.info("schema-bootstrap: ensuring org_unit.is_active boolean")
            _ensure_bool_column(conn, "org_unit", "is_active")

        # content_item: coluna storage_key para uploads S3
        if _pg_table_exists(conn, "content_item"):
            logger.info("schema-bootstrap: ensuring content_item.storage_key column")
            _add_column_if_missing(conn, "content_item", "storage_key", "VARCHAR(500)")

        # ========================================
        # ACTION PLAN ENTERPRISE 2.0 MIGRATIONS
        # ========================================
        
        # ActionPlan: novos campos
        if _pg_table_exists(conn, "action_plan"):
            logger.info("schema-bootstrap: ensuring action_plan enterprise columns")
            _add_column_if_missing(conn, "action_plan", "title", "VARCHAR(300)")
            _add_column_if_missing(conn, "action_plan", "description", "TEXT")
            _add_column_if_missing(conn, "action_plan", "target_completion_date", "TIMESTAMP")
            _add_column_if_missing(conn, "action_plan", "closed_at", "TIMESTAMP")
            _add_column_if_missing(conn, "action_plan", "created_by_user_id", "UUID")
            _add_column_if_missing(conn, "action_plan", "closed_by_user_id", "UUID")

        # ActionItem: novos campos
        if _pg_table_exists(conn, "action_item"):
            logger.info("schema-bootstrap: ensuring action_item enterprise columns")
            _add_column_if_missing(conn, "action_item", "responsible_user_id", "UUID")
            _add_column_if_missing(conn, "action_item", "started_at", "TIMESTAMP")
            _add_column_if_missing(conn, "action_item", "completed_at", "TIMESTAMP")
            _add_column_if_missing(conn, "action_item", "priority", "VARCHAR(20) DEFAULT 'medium'")
            _add_column_if_missing(conn, "action_item", "related_dimension", "VARCHAR(50)")
            _add_column_if_missing(conn, "action_item", "notify_on_assignment", "BOOLEAN DEFAULT true")
            _add_column_if_missing(conn, "action_item", "notify_before_due", "BOOLEAN DEFAULT true")
            _add_column_if_missing(conn, "action_item", "notify_days_before", "INTEGER DEFAULT 3")
            _add_column_if_missing(conn, "action_item", "created_by_user_id", "UUID")

        # ActionEvidence: novos campos para upload
        if _pg_table_exists(conn, "action_evidence"):
            logger.info("schema-bootstrap: ensuring action_evidence file upload columns")
            _add_column_if_missing(conn, "action_evidence", "file_name", "VARCHAR(255)")
            _add_column_if_missing(conn, "action_evidence", "file_size", "INTEGER")
            _add_column_if_missing(conn, "action_evidence", "file_type", "VARCHAR(100)")
            _add_column_if_missing(conn, "action_evidence", "storage_key", "VARCHAR(500)")
            _add_column_if_missing(conn, "action_evidence", "created_by_user_id", "UUID")

        # ActionItemComment: nova tabela
        if not _pg_table_exists(conn, "action_item_comment"):
            logger.info("schema-bootstrap: creating action_item_comment table")
            conn.execute(text("""
                CREATE TABLE action_item_comment (
                    id UUID PRIMARY KEY,
                    tenant_id UUID NOT NULL,
                    action_item_id UUID NOT NULL REFERENCES action_item(id) ON DELETE CASCADE,
                    user_id UUID NOT NULL,
                    content TEXT NOT NULL,
                    mentions JSONB DEFAULT '[]',
                    edited_at TIMESTAMP,
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW()
                )
            """))
            conn.execute(text("CREATE INDEX ix_action_item_comment_item ON action_item_comment(action_item_id)"))
            conn.execute(text("CREATE INDEX ix_action_item_comment_tenant ON action_item_comment(tenant_id)"))

        # ActionItemHistory: nova tabela
        if not _pg_table_exists(conn, "action_item_history"):
            logger.info("schema-bootstrap: creating action_item_history table")
            conn.execute(text("""
                CREATE TABLE action_item_history (
                    id UUID PRIMARY KEY,
                    tenant_id UUID NOT NULL,
                    action_item_id UUID NOT NULL REFERENCES action_item(id) ON DELETE CASCADE,
                    user_id UUID,
                    field_changed VARCHAR(50) NOT NULL,
                    old_value VARCHAR(1000),
                    new_value VARCHAR(1000),
                    changed_at TIMESTAMP DEFAULT NOW()
                )
            """))
            conn.execute(text("CREATE INDEX ix_action_item_history_item ON action_item_history(action_item_id)"))
            conn.execute(text("CREATE INDEX ix_action_item_history_tenant ON action_item_history(tenant_id)"))

        # ========================================
        # USER ACCOUNT - NOVOS CAMPOS
        # ========================================
        if _pg_table_exists(conn, "user_account"):
            logger.info("schema-bootstrap: ensuring user_account auth columns")
            _add_column_if_missing(conn, "user_account", "cpf", "VARCHAR(14)")
            _add_column_if_missing(conn, "user_account", "phone", "VARCHAR(20)")
            _add_column_if_missing(conn, "user_account", "must_change_password", "BOOLEAN DEFAULT false")
            _add_column_if_missing(conn, "user_account", "password_changed_at", "TIMESTAMP")
            _add_column_if_missing(conn, "user_account", "last_login_at", "TIMESTAMP")
            _add_column_if_missing(conn, "user_account", "login_count", "INTEGER DEFAULT 0")
            _add_column_if_missing(conn, "user_account", "failed_login_count", "INTEGER DEFAULT 0")
            _add_column_if_missing(conn, "user_account", "locked_until", "TIMESTAMP")
            _add_column_if_missing(conn, "user_account", "invited_by_user_id", "UUID")
            _add_column_if_missing(conn, "user_account", "invited_at", "TIMESTAMP")
            
            # Criar índice único para CPF
            try:
                conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_user_account_cpf ON user_account(cpf) WHERE cpf IS NOT NULL"))
            except:
                pass
            
            # Criar índice para phone
            try:
                conn.execute(text("CREATE INDEX IF NOT EXISTS ix_user_account_phone ON user_account(phone) WHERE phone IS NOT NULL"))
            except:
                pass

        # ========================================
        # ROLE - NOVOS CAMPOS
        # ========================================
        if _pg_table_exists(conn, "role"):
            logger.info("schema-bootstrap: ensuring role columns")
            _add_column_if_missing(conn, "role", "description", "VARCHAR(500)")
            _add_column_if_missing(conn, "role", "is_system", "BOOLEAN DEFAULT true")
            
            # Garantir que papel OWNER existe
            existing_owner = conn.execute(text("SELECT id FROM role WHERE key = 'OWNER' LIMIT 1")).fetchone()
            if not existing_owner:
                import uuid
                conn.execute(text("""
                    INSERT INTO role (id, key, name, description, is_system, created_at, updated_at)
                    VALUES (:id, 'OWNER', 'Proprietário', 'Dono da conta. Acesso total incluindo billing.', true, NOW(), NOW())
                """), {"id": str(uuid.uuid4())})
                logger.info("schema-bootstrap: created OWNER role")

        # ========================================
        # USER_ROLE_SCOPE - NOVOS CAMPOS
        # ========================================
        if _pg_table_exists(conn, "user_role_scope"):
            logger.info("schema-bootstrap: ensuring user_role_scope columns")
            _add_column_if_missing(conn, "user_role_scope", "granted_by_user_id", "UUID")
            _add_column_if_missing(conn, "user_role_scope", "granted_at", "TIMESTAMP DEFAULT NOW()")
            _add_column_if_missing(conn, "user_role_scope", "expires_at", "TIMESTAMP")
            _add_column_if_missing(conn, "user_role_scope", "is_active", "BOOLEAN DEFAULT true")

        # ========================================
        # EMPLOYEE - NOVOS CAMPOS PARA PORTAL
        # ========================================
        if _pg_table_exists(conn, "employee"):
            logger.info("schema-bootstrap: ensuring employee portal columns")
            _add_column_if_missing(conn, "employee", "cpf", "VARCHAR(14)")
            _add_column_if_missing(conn, "employee", "email", "VARCHAR(200)")
            _add_column_if_missing(conn, "employee", "phone", "VARCHAR(20)")
            _add_column_if_missing(conn, "employee", "cnpj_id", "UUID")
            _add_column_if_missing(conn, "employee", "job_title", "VARCHAR(200)")
            _add_column_if_missing(conn, "employee", "admission_date", "TIMESTAMP")
            _add_column_if_missing(conn, "employee", "linked_user_id", "UUID")
            _add_column_if_missing(conn, "employee", "portal_access_enabled", "BOOLEAN DEFAULT false")
            _add_column_if_missing(conn, "employee", "portal_password_hash", "VARCHAR(500)")
            _add_column_if_missing(conn, "employee", "portal_must_change_password", "BOOLEAN DEFAULT true")
            _add_column_if_missing(conn, "employee", "portal_last_login_at", "TIMESTAMP")
            _add_column_if_missing(conn, "employee", "portal_login_count", "INTEGER DEFAULT 0")
            _add_column_if_missing(conn, "employee", "portal_failed_login_count", "INTEGER DEFAULT 0")
            _add_column_if_missing(conn, "employee", "portal_locked_until", "TIMESTAMP")
            _add_column_if_missing(conn, "employee", "preferred_contact", "VARCHAR(20)")
            
            try:
                conn.execute(text("CREATE INDEX IF NOT EXISTS ix_employee_cpf ON employee(cpf) WHERE cpf IS NOT NULL"))
                conn.execute(text("CREATE INDEX IF NOT EXISTS ix_employee_email ON employee(email) WHERE email IS NOT NULL"))
                conn.execute(text("CREATE INDEX IF NOT EXISTS ix_employee_linked_user ON employee(linked_user_id) WHERE linked_user_id IS NOT NULL"))
            except:
                pass

        # ========================================
        # USER_INVITATION - NOVA TABELA
        # ========================================
        if not _pg_table_exists(conn, "user_invitation"):
            logger.info("schema-bootstrap: creating user_invitation table")
            conn.execute(text("""
                CREATE TABLE user_invitation (
                    id UUID PRIMARY KEY,
                    tenant_id UUID NOT NULL,
                    email VARCHAR(200) NOT NULL,
                    full_name VARCHAR(200),
                    role_key VARCHAR(60) NOT NULL,
                    cnpj_id UUID,
                    org_unit_id UUID,
                    token VARCHAR(100) NOT NULL UNIQUE,
                    invited_by_user_id UUID NOT NULL,
                    expires_at TIMESTAMP NOT NULL,
                    accepted_at TIMESTAMP,
                    created_user_id UUID,
                    status VARCHAR(20) NOT NULL DEFAULT 'pending',
                    created_at TIMESTAMP DEFAULT NOW()
                )
            """))
            conn.execute(text("CREATE INDEX ix_user_invitation_tenant ON user_invitation(tenant_id)"))
            conn.execute(text("CREATE INDEX ix_user_invitation_email ON user_invitation(email)"))
            conn.execute(text("CREATE INDEX ix_user_invitation_token ON user_invitation(token)"))
            conn.execute(text("CREATE INDEX ix_user_invitation_status ON user_invitation(status)"))

        # ========================================
        # AUTH_TOKEN - NOVA TABELA
        # ========================================
        if not _pg_table_exists(conn, "auth_token"):
            logger.info("schema-bootstrap: creating auth_token table")
            conn.execute(text("""
                CREATE TABLE auth_token (
                    id UUID PRIMARY KEY,
                    token_type VARCHAR(30) NOT NULL,
                    token_hash VARCHAR(100) NOT NULL,
                    user_id UUID,
                    employee_id UUID,
                    email VARCHAR(200),
                    phone VARCHAR(20),
                    otp_code VARCHAR(6),
                    expires_at TIMESTAMP NOT NULL,
                    used_at TIMESTAMP,
                    ip_address VARCHAR(45),
                    user_agent TEXT,
                    created_at TIMESTAMP DEFAULT NOW()
                )
            """))
            conn.execute(text("CREATE INDEX ix_auth_token_hash ON auth_token(token_hash)"))
            conn.execute(text("CREATE INDEX ix_auth_token_user ON auth_token(user_id)"))
            conn.execute(text("CREATE INDEX ix_auth_token_type ON auth_token(token_type)"))

        # ========================================
        # AUTH_AUDIT_LOG - NOVA TABELA
        # ========================================
        if not _pg_table_exists(conn, "auth_audit_log"):
            logger.info("schema-bootstrap: creating auth_audit_log table")
            conn.execute(text("""
                CREATE TABLE auth_audit_log (
                    id UUID PRIMARY KEY,
                    event_type VARCHAR(50) NOT NULL,
                    user_id UUID,
                    employee_id UUID,
                    tenant_id UUID,
                    email VARCHAR(200),
                    cpf VARCHAR(14),
                    phone VARCHAR(20),
                    success BOOLEAN NOT NULL,
                    failure_reason VARCHAR(100),
                    ip_address VARCHAR(45),
                    user_agent TEXT,
                    location_country VARCHAR(2),
                    location_region VARCHAR(100),
                    location_city VARCHAR(100),
                    extra_data JSONB DEFAULT '{}',
                    created_at TIMESTAMP DEFAULT NOW()
                )
            """))
            conn.execute(text("CREATE INDEX ix_auth_audit_user ON auth_audit_log(user_id)"))
            conn.execute(text("CREATE INDEX ix_auth_audit_tenant ON auth_audit_log(tenant_id)"))
            conn.execute(text("CREATE INDEX ix_auth_audit_event ON auth_audit_log(event_type)"))
            conn.execute(text("CREATE INDEX ix_auth_audit_created ON auth_audit_log(created_at)"))

        # Critério de risco padrão da plataforma (NR-1 Psicossocial)
        if _pg_table_exists(conn, "risk_criterion_version"):
            logger.info("schema-bootstrap: ensuring default risk criterion exists")
            existing = conn.execute(
                text("SELECT id FROM risk_criterion_version WHERE tenant_id IS NULL AND name = 'NR-1 Psicossocial - Padrão' LIMIT 1")
            ).fetchone()
            if not existing:
                import uuid
                import json
                criterion_id = str(uuid.uuid4())
                content = json.dumps({
                    "weights": {
                        "governance": 0.25,
                        "hazards": 0.25,
                        "controls": 0.25,
                        "training": 0.25
                    },
                    "thresholds": {
                        "low": 0.7,
                        "high": 0.4
                    },
                    "description": "Critério padrão para avaliação de riscos psicossociais conforme NR-1. Scores acima de 70% = Risco Baixo, entre 40-70% = Risco Médio, abaixo de 40% = Risco Alto."
                })
                conn.execute(
                    text("""
                        INSERT INTO risk_criterion_version (id, tenant_id, name, status, content, version, published_at, created_at, updated_at)
                        VALUES (:id, NULL, :name, 'published', CAST(:content AS jsonb), 1, NOW(), NOW(), NOW())
                    """),
                    {"id": criterion_id, "name": "NR-1 Psicossocial - Padrão", "content": content}
                )
                logger.info(f"schema-bootstrap: created default risk criterion {criterion_id}")

        # ========================================
        # ACTION ITEM - NR-1 COMPLIANCE FIELDS
        # ========================================
        if _pg_table_exists(conn, "action_item"):
            logger.info("schema-bootstrap: ensuring action_item NR-1 compliance columns")
            _add_column_if_missing(conn, "action_item", "control_hierarchy", "VARCHAR(30)")
            _add_column_if_missing(conn, "action_item", "training_type", "VARCHAR(30)")
            _add_column_if_missing(conn, "action_item", "effectiveness_criteria", "TEXT")
            _add_column_if_missing(conn, "action_item", "monitoring_frequency", "VARCHAR(50)")
            _add_column_if_missing(conn, "action_item", "affected_workers_count", "INTEGER")

        # ========================================
        # TRAINING CERTIFICATE - NR-1 FIELDS
        # ========================================
        if _pg_table_exists(conn, "training_certificate"):
            logger.info("schema-bootstrap: ensuring training_certificate NR-1 fields")
            _add_column_if_missing(conn, "training_certificate", "instructor_name", "VARCHAR(200)")
            _add_column_if_missing(conn, "training_certificate", "instructor_qualification", "VARCHAR(300)")
            _add_column_if_missing(conn, "training_certificate", "training_location", "VARCHAR(300)")
            _add_column_if_missing(conn, "training_certificate", "syllabus", "TEXT")
            _add_column_if_missing(conn, "training_certificate", "training_modality", "VARCHAR(30)")
            _add_column_if_missing(conn, "training_certificate", "formal_hours_minutes", "INTEGER")

    logger.info("schema-bootstrap: done")
