"""Add PGR formal approvals and ergonomic assessments

Revision ID: 20260314_go_live_v3
Revises: 20260313_plan_pricing
Create Date: 2026-03-14
"""

from alembic import op

revision = "20260314_go_live_v3"
down_revision = "20260313_plan_pricing"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS pgr_document_approval (
          id uuid PRIMARY KEY,
          tenant_id uuid NOT NULL REFERENCES tenant(id),
          cnpj_id uuid NOT NULL REFERENCES cnpj(id),
          org_unit_id uuid NULL REFERENCES org_unit(id),
          approved_by_user_id uuid NOT NULL REFERENCES user_account(id),
          superseded_by_id uuid NULL REFERENCES pgr_document_approval(id),
          document_scope varchar(30) NOT NULL DEFAULT 'inventory',
          version_label varchar(60) NOT NULL,
          status varchar(20) NOT NULL DEFAULT 'active',
          statement text NOT NULL,
          notes text NULL,
          approver_name varchar(200) NOT NULL,
          approver_role varchar(120) NULL,
          approver_email varchar(200) NULL,
          effective_from timestamp NOT NULL,
          review_due_at timestamp NULL,
          approved_at timestamp NOT NULL,
          inventory_item_count integer NOT NULL DEFAULT 0,
          snapshot_hash varchar(128) NOT NULL,
          snapshot_json json NOT NULL DEFAULT '{}'::json,
          created_at timestamp NOT NULL DEFAULT now(),
          updated_at timestamp NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS ix_pgr_document_approval_tenant_id ON pgr_document_approval(tenant_id);
        CREATE INDEX IF NOT EXISTS ix_pgr_document_approval_cnpj_id ON pgr_document_approval(cnpj_id);
        CREATE INDEX IF NOT EXISTS ix_pgr_document_approval_snapshot_hash ON pgr_document_approval(snapshot_hash);

        CREATE TABLE IF NOT EXISTS ergonomic_assessment (
          id uuid PRIMARY KEY,
          tenant_id uuid NOT NULL REFERENCES tenant(id),
          cnpj_id uuid NOT NULL REFERENCES cnpj(id),
          org_unit_id uuid NULL REFERENCES org_unit(id),
          created_by_user_id uuid NULL REFERENCES user_account(id),
          approved_by_user_id uuid NULL REFERENCES user_account(id),
          assessment_type varchar(10) NOT NULL DEFAULT 'AEP',
          title varchar(200) NOT NULL,
          status varchar(20) NOT NULL DEFAULT 'draft',
          process_name varchar(200) NULL,
          activity_name varchar(200) NULL,
          position_name varchar(200) NULL,
          workstation_name varchar(200) NULL,
          demand_summary text NULL,
          conditions_summary text NULL,
          psychosocial_factors json NOT NULL DEFAULT '[]'::json,
          findings json NOT NULL DEFAULT '[]'::json,
          recommendations json NOT NULL DEFAULT '[]'::json,
          traceability json NOT NULL DEFAULT '{}'::json,
          reviewed_at timestamp NULL,
          review_due_at timestamp NULL,
          approved_at timestamp NULL,
          approval_notes text NULL,
          created_at timestamp NOT NULL DEFAULT now(),
          updated_at timestamp NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS ix_ergonomic_assessment_tenant_id ON ergonomic_assessment(tenant_id);
        CREATE INDEX IF NOT EXISTS ix_ergonomic_assessment_cnpj_id ON ergonomic_assessment(cnpj_id);
        CREATE INDEX IF NOT EXISTS ix_ergonomic_assessment_status ON ergonomic_assessment(status);
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DROP TABLE IF EXISTS ergonomic_assessment;
        DROP TABLE IF EXISTS pgr_document_approval;
        """
    )
