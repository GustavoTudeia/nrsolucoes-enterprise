"""add_training_enrollments_and_certificates

Revision ID: 20260306_training
Revises: 0003_campaign_invitations
Create Date: 2026-03-06

Este migration adiciona:
1. Tabela action_item_enrollment - Matrículas de colaboradores em treinamentos
2. Tabela training_certificate - Certificados de conclusão
3. Novos campos em action_item para público-alvo
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = '20260306_training'
down_revision = "0003_campaign_invitations"
branch_labels = None
depends_on = None


def upgrade():
    # ========== TRAINING CERTIFICATE ==========
    op.create_table(
        'training_certificate',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('tenant_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now(), onupdate=sa.func.now()),
        
        # Número único
        sa.Column('certificate_number', sa.String(50), nullable=False, unique=True),
        
        # Referências
        sa.Column('enrollment_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('action_item_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('employee_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('content_id', postgresql.UUID(as_uuid=True), nullable=True),
        
        # Dados imutáveis do colaborador
        sa.Column('employee_name', sa.String(200), nullable=False),
        sa.Column('employee_cpf', sa.String(14), nullable=True),
        sa.Column('employee_identifier', sa.String(200), nullable=False),
        
        # Dados do treinamento
        sa.Column('training_title', sa.String(300), nullable=False),
        sa.Column('training_description', sa.Text(), nullable=True),
        sa.Column('training_duration_minutes', sa.Integer(), nullable=True),
        sa.Column('training_type', sa.String(50), nullable=True),
        
        # Contexto
        sa.Column('action_plan_title', sa.String(300), nullable=True),
        sa.Column('risk_dimension', sa.String(50), nullable=True),
        
        # Datas
        sa.Column('training_started_at', sa.DateTime(), nullable=True),
        sa.Column('training_completed_at', sa.DateTime(), nullable=False),
        sa.Column('issued_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('valid_until', sa.DateTime(), nullable=True),
        
        # PDF
        sa.Column('pdf_storage_key', sa.String(500), nullable=True),
        sa.Column('pdf_file_size', sa.Integer(), nullable=True),
        sa.Column('pdf_hash', sa.String(64), nullable=True),
        
        # Assinatura
        sa.Column('signed_by_user_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('signed_at', sa.DateTime(), nullable=True),
        sa.Column('signature_hash', sa.String(128), nullable=True),
        
        # Validação
        sa.Column('validation_code', sa.String(32), nullable=True),
        sa.Column('validation_url', sa.String(500), nullable=True),
        
        # Emissor
        sa.Column('issuer_name', sa.String(200), nullable=True),
        sa.Column('issuer_cnpj', sa.String(18), nullable=True),
        
        # Constraints
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenant.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['employee_id'], ['employee.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['action_item_id'], ['action_item.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['content_id'], ['content_item.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['signed_by_user_id'], ['user_account.id'], ondelete='SET NULL'),
    )
    
    op.create_index('ix_certificate_tenant_employee', 'training_certificate', ['tenant_id', 'employee_id'])
    op.create_index('ix_certificate_action_item', 'training_certificate', ['action_item_id'])
    op.create_index('ix_certificate_validation_code', 'training_certificate', ['validation_code'])
    
    # ========== ACTION ITEM ENROLLMENT ==========
    op.create_table(
        'action_item_enrollment',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('tenant_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now(), onupdate=sa.func.now()),
        
        # Vínculos
        sa.Column('action_item_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('employee_id', postgresql.UUID(as_uuid=True), nullable=False),
        
        # Status
        sa.Column('status', sa.String(30), nullable=False, default='pending'),
        
        # Datas
        sa.Column('enrolled_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('due_date', sa.DateTime(), nullable=True),
        sa.Column('started_at', sa.DateTime(), nullable=True),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        
        # Progresso
        sa.Column('progress_percent', sa.Integer(), nullable=False, default=0),
        
        # LMS
        sa.Column('content_assignment_id', postgresql.UUID(as_uuid=True), nullable=True),
        
        # Certificado
        sa.Column('certificate_id', postgresql.UUID(as_uuid=True), nullable=True),
        
        # Notificações
        sa.Column('reminder_sent_at', sa.DateTime(), nullable=True),
        sa.Column('reminder_count', sa.Integer(), nullable=False, default=0),
        
        # Auditoria
        sa.Column('enrolled_by_user_id', postgresql.UUID(as_uuid=True), nullable=True),
        
        # Notas
        sa.Column('notes', sa.Text(), nullable=True),
        
        # Constraints
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenant.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['action_item_id'], ['action_item.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['employee_id'], ['employee.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['content_assignment_id'], ['content_assignment.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['certificate_id'], ['training_certificate.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['enrolled_by_user_id'], ['user_account.id'], ondelete='SET NULL'),
        sa.UniqueConstraint('tenant_id', 'action_item_id', 'employee_id', name='uq_enrollment_item_employee'),
    )
    
    op.create_index('ix_enrollment_item', 'action_item_enrollment', ['action_item_id'])
    op.create_index('ix_enrollment_employee', 'action_item_enrollment', ['employee_id'])
    op.create_index('ix_enrollment_status', 'action_item_enrollment', ['tenant_id', 'status'])
    
    # ========== NOVOS CAMPOS EM ACTION_ITEM ==========
    # Campos para público-alvo
    op.add_column('action_item', sa.Column('target_type', sa.String(30), nullable=True))
    op.add_column('action_item', sa.Column('target_org_unit_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column('action_item', sa.Column('target_cnpj_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column('action_item', sa.Column('auto_enroll', sa.Boolean(), nullable=False, server_default='true'))
    op.add_column('action_item', sa.Column('enrollment_due_days', sa.Integer(), nullable=False, server_default='30'))
    op.add_column('action_item', sa.Column('require_all_completions', sa.Boolean(), nullable=False, server_default='true'))
    op.add_column('action_item', sa.Column('auto_complete_on_all_done', sa.Boolean(), nullable=False, server_default='true'))
    
    # Foreign keys para org_unit e cnpj
    op.create_foreign_key(
        'fk_action_item_target_org_unit',
        'action_item', 'org_unit',
        ['target_org_unit_id'], ['id'],
        ondelete='SET NULL'
    )
    op.create_foreign_key(
        'fk_action_item_target_cnpj',
        'action_item', 'cnpj',
        ['target_cnpj_id'], ['id'],
        ondelete='SET NULL'
    )


def downgrade():
    # Remover foreign keys
    op.drop_constraint('fk_action_item_target_cnpj', 'action_item', type_='foreignkey')
    op.drop_constraint('fk_action_item_target_org_unit', 'action_item', type_='foreignkey')

    # Remover colunas de action_item
    op.drop_column('action_item', 'auto_complete_on_all_done')
    op.drop_column('action_item', 'require_all_completions')
    op.drop_column('action_item', 'enrollment_due_days')
    op.drop_column('action_item', 'auto_enroll')
    op.drop_column('action_item', 'target_cnpj_id')
    op.drop_column('action_item', 'target_org_unit_id')
    op.drop_column('action_item', 'target_type')
    
    # Remover tabelas
    op.drop_table('action_item_enrollment')
    op.drop_table('training_certificate')
