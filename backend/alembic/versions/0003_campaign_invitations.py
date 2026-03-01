"""Add campaign invitation tables for token-based survey access

Revision ID: 0003_campaign_invitations
Revises: 0002_template_packs_esocial
Create Date: 2026-02-12

This migration adds:
- campaign_invitation: Token único por colaborador por campanha
- campaign_invitation_batch: Auditoria de lotes de convites gerados
- Columns require_invitation and invitation_expires_days on campaign table
"""

from alembic import op

revision = "0003_campaign_invitations"
down_revision = "0002_template_packs_esocial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Campaign invitation table
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS campaign_invitation (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id uuid NOT NULL REFERENCES tenant(id),
            campaign_id uuid NOT NULL REFERENCES campaign(id) ON DELETE CASCADE,
            employee_id uuid NOT NULL REFERENCES employee(id),
            
            token_hash varchar(128) NOT NULL,
            status varchar(20) NOT NULL DEFAULT 'pending',
            
            expires_at timestamp NOT NULL,
            sent_at timestamp NULL,
            opened_at timestamp NULL,
            used_at timestamp NULL,
            revoked_at timestamp NULL,
            
            sent_via varchar(30) NULL,
            sent_to_email varchar(200) NULL,
            
            ip_opened varchar(45) NULL,
            ip_used varchar(45) NULL,
            user_agent_used varchar(500) NULL,
            
            reminder_count varchar(10) DEFAULT '0',
            notes text NULL,
            
            created_at timestamp NOT NULL DEFAULT now(),
            updated_at timestamp NOT NULL DEFAULT now()
        );
        
        CREATE UNIQUE INDEX IF NOT EXISTS uq_campaign_invitation_token_hash 
            ON campaign_invitation(token_hash);
        CREATE UNIQUE INDEX IF NOT EXISTS uq_campaign_employee 
            ON campaign_invitation(campaign_id, employee_id);
        CREATE INDEX IF NOT EXISTS ix_campaign_invitation_campaign_id 
            ON campaign_invitation(campaign_id);
        CREATE INDEX IF NOT EXISTS ix_campaign_invitation_employee_id 
            ON campaign_invitation(employee_id);
        CREATE INDEX IF NOT EXISTS ix_campaign_invitation_tenant_id 
            ON campaign_invitation(tenant_id);
        CREATE INDEX IF NOT EXISTS ix_campaign_invitation_status 
            ON campaign_invitation(status);
        CREATE INDEX IF NOT EXISTS ix_campaign_invitation_campaign_status 
            ON campaign_invitation(campaign_id, status);
        CREATE INDEX IF NOT EXISTS ix_campaign_invitation_tenant_status 
            ON campaign_invitation(tenant_id, status);
        """
    )

    # Campaign invitation batch table (auditoria)
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS campaign_invitation_batch (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id uuid NOT NULL REFERENCES tenant(id),
            campaign_id uuid NOT NULL REFERENCES campaign(id) ON DELETE CASCADE,
            created_by_user_id uuid NOT NULL REFERENCES user_account(id),
            
            filter_cnpj_id uuid NULL,
            filter_org_unit_id uuid NULL,
            filter_criteria text NULL,
            
            total_invited varchar(10) NOT NULL DEFAULT '0',
            total_sent varchar(10) NOT NULL DEFAULT '0',
            total_failed varchar(10) NOT NULL DEFAULT '0',
            
            send_started_at timestamp NULL,
            send_completed_at timestamp NULL,
            send_status varchar(30) DEFAULT 'pending',
            
            created_at timestamp NOT NULL DEFAULT now(),
            updated_at timestamp NOT NULL DEFAULT now()
        );
        
        CREATE INDEX IF NOT EXISTS ix_campaign_invitation_batch_campaign_id 
            ON campaign_invitation_batch(campaign_id);
        CREATE INDEX IF NOT EXISTS ix_campaign_invitation_batch_tenant_id 
            ON campaign_invitation_batch(tenant_id);
        """
    )

    # Add columns to campaign table
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'campaign' AND column_name = 'require_invitation'
            ) THEN
                ALTER TABLE campaign ADD COLUMN require_invitation varchar(5) NOT NULL DEFAULT 'true';
            END IF;
            
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'campaign' AND column_name = 'invitation_expires_days'
            ) THEN
                ALTER TABLE campaign ADD COLUMN invitation_expires_days varchar(5) NOT NULL DEFAULT '30';
            END IF;
        END $$;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DROP TABLE IF EXISTS campaign_invitation_batch;
        DROP TABLE IF EXISTS campaign_invitation;
        
        ALTER TABLE campaign DROP COLUMN IF EXISTS require_invitation;
        ALTER TABLE campaign DROP COLUMN IF EXISTS invitation_expires_days;
        """
    )
