"""enterprise ops hardening

Revision ID: 20260315_enterprise_ops_hardening
Revises: 20260314_analytics_retention
Create Date: 2026-03-15 01:30:00
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '20260315_enterprise_ops_hardening'
down_revision = '20260314_analytics_retention'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'auth_refresh_session',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('tenant_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('family_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('token_hash', sa.String(length=128), nullable=False),
        sa.Column('replaced_by_token_hash', sa.String(length=128), nullable=True),
        sa.Column('ip_address', sa.String(length=45), nullable=True),
        sa.Column('user_agent', sa.Text(), nullable=True),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('last_used_at', sa.DateTime(), nullable=True),
        sa.Column('rotated_at', sa.DateTime(), nullable=True),
        sa.Column('revoked_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('NOW()')),
    )
    op.create_index('ix_auth_refresh_session_user_id', 'auth_refresh_session', ['user_id'])
    op.create_index('ix_auth_refresh_session_tenant_id', 'auth_refresh_session', ['tenant_id'])
    op.create_index('ix_auth_refresh_session_family_id', 'auth_refresh_session', ['family_id'])
    op.create_index('ix_auth_refresh_session_token_hash', 'auth_refresh_session', ['token_hash'], unique=True)
    op.create_index('ix_auth_refresh_session_replaced_by_hash', 'auth_refresh_session', ['replaced_by_token_hash'])
    op.create_index('ix_auth_refresh_session_expires_at', 'auth_refresh_session', ['expires_at'])


def downgrade() -> None:
    op.drop_index('ix_auth_refresh_session_expires_at', table_name='auth_refresh_session')
    op.drop_index('ix_auth_refresh_session_replaced_by_hash', table_name='auth_refresh_session')
    op.drop_index('ix_auth_refresh_session_token_hash', table_name='auth_refresh_session')
    op.drop_index('ix_auth_refresh_session_family_id', table_name='auth_refresh_session')
    op.drop_index('ix_auth_refresh_session_tenant_id', table_name='auth_refresh_session')
    op.drop_index('ix_auth_refresh_session_user_id', table_name='auth_refresh_session')
    op.drop_table('auth_refresh_session')
