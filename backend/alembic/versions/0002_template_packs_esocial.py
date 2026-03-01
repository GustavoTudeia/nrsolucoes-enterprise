"""Add template packs + eSocial SST support tables (idempotent)

Revision ID: 0002_template_packs_esocial
Revises: 0001_bootstrap_schema
Create Date: 2026-02-05
"""

from alembic import op

revision = "0002_template_packs_esocial"
down_revision = "0001_bootstrap_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Template packs (plataforma)
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS template_pack (
          id uuid PRIMARY KEY,
          key varchar(100) NOT NULL,
          name varchar(200) NOT NULL,
          description varchar(500),
          is_active boolean NOT NULL DEFAULT true,
          created_at timestamp NOT NULL DEFAULT now(),
          updated_at timestamp NOT NULL DEFAULT now()
        );
        CREATE UNIQUE INDEX IF NOT EXISTS uq_template_pack_key ON template_pack(key);

        CREATE TABLE IF NOT EXISTS template_pack_item (
          id uuid PRIMARY KEY,
          pack_id uuid NOT NULL REFERENCES template_pack(id) ON DELETE CASCADE,
          item_type varchar(50) NOT NULL,
          item_id uuid NOT NULL,
          order_index integer NOT NULL DEFAULT 0,
          created_at timestamp NOT NULL DEFAULT now(),
          updated_at timestamp NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS ix_template_pack_item_pack_id ON template_pack_item(pack_id);
        CREATE INDEX IF NOT EXISTS ix_template_pack_item_item_id ON template_pack_item(item_id);
        """
    )

    # eSocial SST (assistido): S-2240 / S-2210 / S-2220
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS esocial_s2240_profile (
          id uuid PRIMARY KEY,
          tenant_id uuid NOT NULL REFERENCES tenant(id),
          cnpj_id uuid NOT NULL REFERENCES cnpj(id),
          org_unit_id uuid NULL REFERENCES org_unit(id),
          role_name varchar(200) NOT NULL,
          environment_code varchar(50),
          activity_description varchar(500),
          factors json NOT NULL DEFAULT '[]'::json,
          controls json NOT NULL DEFAULT '{}'::json,
          valid_from timestamp NULL,
          valid_to timestamp NULL,
          is_active boolean NOT NULL DEFAULT true,
          created_at timestamp NOT NULL DEFAULT now(),
          updated_at timestamp NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS ix_esocial_s2240_profile_tenant_id ON esocial_s2240_profile(tenant_id);
        CREATE INDEX IF NOT EXISTS ix_esocial_s2240_profile_cnpj_id ON esocial_s2240_profile(cnpj_id);
        CREATE INDEX IF NOT EXISTS ix_esocial_s2240_profile_org_unit_id ON esocial_s2240_profile(org_unit_id);

        CREATE TABLE IF NOT EXISTS esocial_s2210_accident (
          id uuid PRIMARY KEY,
          tenant_id uuid NOT NULL REFERENCES tenant(id),
          employee_id uuid NOT NULL REFERENCES employee(id),
          occurred_at timestamp NOT NULL DEFAULT now(),
          accident_type varchar(50),
          description varchar(1000),
          location varchar(200),
          cat_number varchar(60),
          payload json NOT NULL DEFAULT '{}'::json,
          created_at timestamp NOT NULL DEFAULT now(),
          updated_at timestamp NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS ix_esocial_s2210_accident_tenant_id ON esocial_s2210_accident(tenant_id);
        CREATE INDEX IF NOT EXISTS ix_esocial_s2210_accident_employee_id ON esocial_s2210_accident(employee_id);

        CREATE TABLE IF NOT EXISTS esocial_s2220_exam (
          id uuid PRIMARY KEY,
          tenant_id uuid NOT NULL REFERENCES tenant(id),
          employee_id uuid NOT NULL REFERENCES employee(id),
          exam_date timestamp NOT NULL DEFAULT now(),
          exam_type varchar(80),
          result varchar(200),
          payload json NOT NULL DEFAULT '{}'::json,
          created_at timestamp NOT NULL DEFAULT now(),
          updated_at timestamp NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS ix_esocial_s2220_exam_tenant_id ON esocial_s2220_exam(tenant_id);
        CREATE INDEX IF NOT EXISTS ix_esocial_s2220_exam_employee_id ON esocial_s2220_exam(employee_id);
        """
    )


def downgrade() -> None:
    # Best-effort downgrade.
    op.execute(
        """
        DROP TABLE IF EXISTS esocial_s2220_exam;
        DROP TABLE IF EXISTS esocial_s2210_accident;
        DROP TABLE IF EXISTS esocial_s2240_profile;
        DROP TABLE IF EXISTS template_pack_item;
        DROP TABLE IF EXISTS template_pack;
        """
    )
