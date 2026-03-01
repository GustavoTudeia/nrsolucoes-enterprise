"""Bootstrap schema patch (idempotent)

This migration is intentionally defensive.

The project still supports AUTO_CREATE_SCHEMA/AUTO_MIGRATE_SCHEMA at runtime.
In Docker, however, we run `alembic upgrade head` before starting the API.

If the database is brand new, tables may not exist yet, so we guard all ALTERs
with existence checks. If tables do exist (common in upgrades), we ensure
critical columns and types match current models.

Revision ID: 0001_bootstrap_schema
Revises:
Create Date: 2026-02-02
"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "0001_bootstrap_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # tenant_settings (branding)
    op.execute(
        """
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'tenant_settings'
          ) THEN
            ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS brand_name VARCHAR(200);
            ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS logo_url VARCHAR(500);
            ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS primary_color VARCHAR(20);
            ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS secondary_color VARCHAR(20);
            ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS support_email VARCHAR(200);
            ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS custom_domain VARCHAR(255);
            ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS login_background_url VARCHAR(500);
          END IF;
        END $$;
        """
    )

    # cnpj.is_active must be boolean (older DBs used varchar)
    op.execute(
        """
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'cnpj' AND column_name = 'is_active'
          ) THEN
            -- Safe for both varchar and boolean.
            ALTER TABLE cnpj
              ALTER COLUMN is_active TYPE boolean
              USING (
                CASE
                  WHEN is_active IS NULL THEN TRUE
                  WHEN lower(is_active::text) IN ('true','t','1','yes','y') THEN TRUE
                  ELSE FALSE
                END
              );
            ALTER TABLE cnpj ALTER COLUMN is_active SET DEFAULT TRUE;
          END IF;
        END $$;
        """
    )

    # org_unit.is_active must exist and be boolean
    op.execute(
        """
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'org_unit'
          ) THEN
            ALTER TABLE org_unit
              ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT TRUE;
          END IF;
        END $$;
        """
    )

    # content_item.storage_key for S3 uploads (LMS)
    op.execute(
        """
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'content_item'
          ) THEN
            ALTER TABLE content_item
              ADD COLUMN IF NOT EXISTS storage_key VARCHAR(500);
          END IF;
        END $$;
        """
    )

    # Fix missing DEFAULT values for id/created_at/updated_at columns
    # SQLAlchemy defines defaults in Python, but they should also exist in PostgreSQL
    # to prevent silent failures during inserts
    op.execute(
        """
        DO $$
        DECLARE
          t TEXT;
          tables TEXT[] := ARRAY[
            'tenant', 'tenant_settings', 'user_account', 'role', 'user_role_scope',
            'cnpj', 'org_unit', 'employee', 'questionnaire_template', 'questionnaire_version',
            'risk_criterion_version', 'campaign', 'survey_response', 'risk_assessment',
            'action_plan', 'action_item', 'action_evidence', 'content_item', 'learning_path',
            'learning_path_item', 'content_assignment', 'content_completion', 'content_progress',
            'plan', 'tenant_subscription', 'affiliate', 'referral_attribution', 'commission_ledger',
            'payout', 'audit_event', 'legal_acceptance', 'password_reset_token', 'tenant_sso_config',
            'employee_otp', 'template_pack', 'template_pack_item', 'esocial_s2240_profile',
            'esocial_s2210_accident', 'esocial_s2220_exam'
          ];
        BEGIN
          FOREACH t IN ARRAY tables LOOP
            -- Check if table exists before altering
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
              -- Set default for id column if it exists and has no default
              IF EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_schema = 'public' AND table_name = t AND column_name = 'id' AND column_default IS NULL
              ) THEN
                EXECUTE format('ALTER TABLE %I ALTER COLUMN id SET DEFAULT gen_random_uuid()', t);
              END IF;
              
              -- Set default for created_at column if it exists and has no default
              IF EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_schema = 'public' AND table_name = t AND column_name = 'created_at' AND column_default IS NULL
              ) THEN
                EXECUTE format('ALTER TABLE %I ALTER COLUMN created_at SET DEFAULT now()', t);
              END IF;
              
              -- Set default for updated_at column if it exists and has no default
              IF EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_schema = 'public' AND table_name = t AND column_name = 'updated_at' AND column_default IS NULL
              ) THEN
                EXECUTE format('ALTER TABLE %I ALTER COLUMN updated_at SET DEFAULT now()', t);
              END IF;
            END IF;
          END LOOP;
        END $$;
        """
    )


def downgrade() -> None:
    # Downgrade is intentionally no-op: this patch is safety-oriented.
    pass
