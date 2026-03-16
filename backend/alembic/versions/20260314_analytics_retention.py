"""analytics retention and tenant health

Revision ID: 20260314_analytics_retention
Revises: 20260314_go_live_v3
Create Date: 2026-03-14 22:30:00
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '20260314_analytics_retention'
down_revision = '20260314_go_live_v3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'analytics_event',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('tenant_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('employee_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('event_name', sa.String(length=120), nullable=False),
        sa.Column('source', sa.String(length=20), nullable=False, server_default='backend'),
        sa.Column('actor_role', sa.String(length=80), nullable=True),
        sa.Column('module', sa.String(length=80), nullable=True),
        sa.Column('distinct_key', sa.String(length=160), nullable=True),
        sa.Column('path', sa.String(length=500), nullable=True),
        sa.Column('referrer', sa.String(length=1000), nullable=True),
        sa.Column('channel', sa.String(length=80), nullable=True),
        sa.Column('utm_source', sa.String(length=120), nullable=True),
        sa.Column('utm_medium', sa.String(length=120), nullable=True),
        sa.Column('utm_campaign', sa.String(length=160), nullable=True),
        sa.Column('utm_term', sa.String(length=160), nullable=True),
        sa.Column('utm_content', sa.String(length=160), nullable=True),
        sa.Column('properties', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column('occurred_at', sa.DateTime(), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('NOW()')),
    )
    op.create_index('ix_analytics_event_tenant', 'analytics_event', ['tenant_id'])
    op.create_index('ix_analytics_event_user', 'analytics_event', ['user_id'])
    op.create_index('ix_analytics_event_employee', 'analytics_event', ['employee_id'])
    op.create_index('ix_analytics_event_name', 'analytics_event', ['event_name'])
    op.create_index('ix_analytics_event_occurred', 'analytics_event', ['occurred_at'])

    op.create_table(
        'tenant_health_snapshot',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('tenant_id', postgresql.UUID(as_uuid=True), nullable=False, unique=True),
        sa.Column('score', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('band', sa.String(length=20), nullable=False, server_default='critical'),
        sa.Column('activation_status', sa.String(length=30), nullable=False, server_default='not_started'),
        sa.Column('onboarding_score', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('activation_score', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('depth_score', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('routine_score', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('billing_score', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('metrics', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column('recommendations', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column('risk_flags', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column('last_value_event_at', sa.DateTime(), nullable=True),
        sa.Column('last_active_at', sa.DateTime(), nullable=True),
        sa.Column('recomputed_at', sa.DateTime(), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('NOW()')),
    )
    op.create_index('ix_tenant_health_snapshot_tenant', 'tenant_health_snapshot', ['tenant_id'])
    op.create_index('ix_tenant_health_snapshot_band', 'tenant_health_snapshot', ['band'])

    op.create_table(
        'tenant_nudge',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('tenant_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('nudge_key', sa.String(length=120), nullable=False),
        sa.Column('channel', sa.String(length=30), nullable=False, server_default='in_app'),
        sa.Column('audience_role', sa.String(length=80), nullable=True),
        sa.Column('recipient_email', sa.String(length=200), nullable=True),
        sa.Column('title', sa.String(length=200), nullable=False),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('status', sa.String(length=30), nullable=False, server_default='pending'),
        sa.Column('send_email', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('due_at', sa.DateTime(), nullable=True),
        sa.Column('sent_at', sa.DateTime(), nullable=True),
        sa.Column('resolved_at', sa.DateTime(), nullable=True),
        sa.Column('context', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('NOW()')),
    )
    op.create_index('ix_tenant_nudge_tenant', 'tenant_nudge', ['tenant_id'])
    op.create_index('ix_tenant_nudge_key', 'tenant_nudge', ['nudge_key'])
    op.create_index('ix_tenant_nudge_status', 'tenant_nudge', ['status'])


def downgrade() -> None:
    op.drop_index('ix_tenant_nudge_status', table_name='tenant_nudge')
    op.drop_index('ix_tenant_nudge_key', table_name='tenant_nudge')
    op.drop_index('ix_tenant_nudge_tenant', table_name='tenant_nudge')
    op.drop_table('tenant_nudge')
    op.drop_index('ix_tenant_health_snapshot_band', table_name='tenant_health_snapshot')
    op.drop_index('ix_tenant_health_snapshot_tenant', table_name='tenant_health_snapshot')
    op.drop_table('tenant_health_snapshot')
    op.drop_index('ix_analytics_event_occurred', table_name='analytics_event')
    op.drop_index('ix_analytics_event_name', table_name='analytics_event')
    op.drop_index('ix_analytics_event_employee', table_name='analytics_event')
    op.drop_index('ix_analytics_event_user', table_name='analytics_event')
    op.drop_index('ix_analytics_event_tenant', table_name='analytics_event')
    op.drop_table('analytics_event')
