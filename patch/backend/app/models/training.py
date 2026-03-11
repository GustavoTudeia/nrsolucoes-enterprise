"""Modelos de Matrícula em Treinamentos e Certificados

Este módulo implementa a integração LMS ↔ Plano de Ação ↔ Colaboradores
conforme requisitos da NR-1 para documentação de capacitações.

Inclui:
- ActionItemEnrollment: Matrícula de colaborador em item de ação educativo
- TrainingCertificate: Certificado de conclusão de treinamento
"""

from __future__ import annotations
from sqlalchemy import (
    Column,
    String,
    ForeignKey,
    DateTime,
    Integer,
    Boolean,
    Text,
    Index,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from datetime import datetime
from uuid import uuid4

from app.db.base import Base
from app.models.mixins import (
    UUIDPrimaryKeyMixin,
    TimestampMixin,
    TenantScopedMixin,
)
from app.models.types import GUID


class ActionItemEnrollment(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantScopedMixin):
    """Matrícula de colaborador em item de ação educativo.
    
    Esta tabela conecta:
    - ActionItem (tipo educativo) → Define o que deve ser feito
    - Employee → Quem deve fazer
    - ContentAssignment (LMS) → O conteúdo a ser consumido
    
    Permite rastrear individualmente a conclusão de cada colaborador
    e gerar evidências automáticas para o Plano de Ação.
    """
    
    __tablename__ = "action_item_enrollment"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id", "action_item_id", "employee_id",
            name="uq_enrollment_item_employee"
        ),
        Index("ix_enrollment_item", "action_item_id"),
        Index("ix_enrollment_employee", "employee_id"),
        Index("ix_enrollment_status", "tenant_id", "status"),
    )
    
    # Vínculo com item do plano de ação
    action_item_id = Column(
        GUID(), ForeignKey("action_item.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    
    # Colaborador matriculado
    employee_id = Column(
        GUID(), ForeignKey("employee.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    
    # Status da matrícula
    status = Column(
        String(30), nullable=False, default="pending"
    )  # pending | in_progress | completed | expired | cancelled
    
    # Datas de controle
    enrolled_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    due_date = Column(DateTime, nullable=True)  # Prazo para conclusão
    started_at = Column(DateTime, nullable=True)  # Quando iniciou o conteúdo
    completed_at = Column(DateTime, nullable=True)  # Quando concluiu
    
    # Progresso (0-100)
    progress_percent = Column(Integer, nullable=False, default=0)
    
    # Vínculo com LMS (ContentAssignment criado automaticamente)
    content_assignment_id = Column(
        GUID(), ForeignKey("content_assignment.id", ondelete="SET NULL"),
        nullable=True, index=True
    )
    
    # Certificado
    certificate_id = Column(
        GUID(), ForeignKey("training_certificate.id", ondelete="SET NULL"),
        nullable=True
    )
    
    # Notificações
    reminder_sent_at = Column(DateTime, nullable=True)
    reminder_count = Column(Integer, default=0)
    
    # Quem matriculou (auditoria)
    enrolled_by_user_id = Column(
        GUID(), ForeignKey("user_account.id", ondelete="SET NULL"),
        nullable=True
    )
    
    # Observações (ex: motivo de cancelamento)
    notes = Column(Text, nullable=True)
    
    # Relacionamentos
    action_item = relationship("ActionItem", back_populates="enrollments")
    employee = relationship("Employee", foreign_keys=[employee_id])
    content_assignment = relationship("ContentAssignment", foreign_keys=[content_assignment_id])
    certificate = relationship("TrainingCertificate", foreign_keys=[certificate_id], back_populates="enrollment")
    enrolled_by_user = relationship("User", foreign_keys=[enrolled_by_user_id])
    
    @property
    def is_overdue(self) -> bool:
        """Verifica se a matrícula está atrasada."""
        if self.status == "completed":
            return False
        if self.due_date is None:
            return False
        return datetime.utcnow() > self.due_date
    
    @property
    def days_until_due(self) -> int | None:
        """Dias até o prazo (negativo se atrasado)."""
        if self.due_date is None:
            return None
        delta = self.due_date - datetime.utcnow()
        return delta.days
    
    def start(self) -> None:
        """Marca início do treinamento."""
        if self.status == "pending":
            self.status = "in_progress"
            self.started_at = datetime.utcnow()
    
    def complete(self) -> None:
        """Marca conclusão do treinamento."""
        self.status = "completed"
        self.completed_at = datetime.utcnow()
        self.progress_percent = 100
    
    def cancel(self, reason: str = None) -> None:
        """Cancela a matrícula."""
        self.status = "cancelled"
        if reason:
            self.notes = reason


class TrainingCertificate(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantScopedMixin):
    """Certificado de conclusão de treinamento.
    
    Armazena dados imutáveis no momento da emissão para garantir
    integridade e validade jurídica do certificado conforme NR-1.
    
    O certificado é gerado em PDF e armazenado com hash SHA256
    para validação de autenticidade.
    """
    
    __tablename__ = "training_certificate"
    __table_args__ = (
        UniqueConstraint("certificate_number", name="uq_certificate_number"),
        Index("ix_certificate_employee", "tenant_id", "employee_id"),
        Index("ix_certificate_action_item", "action_item_id"),
    )
    
    # Número único do certificado (ex: NR1-2026-00001)
    certificate_number = Column(String(50), nullable=False, unique=True)
    
    # Referências
    enrollment_id = Column(
        GUID(), ForeignKey("action_item_enrollment.id", ondelete="SET NULL"),
        nullable=True, index=True
    )
    action_item_id = Column(
        GUID(), ForeignKey("action_item.id", ondelete="SET NULL"),
        nullable=True, index=True
    )
    employee_id = Column(
        GUID(), ForeignKey("employee.id", ondelete="SET NULL"),
        nullable=False, index=True
    )
    content_id = Column(
        GUID(), ForeignKey("content_item.id", ondelete="SET NULL"),
        nullable=True
    )
    
    # Dados do colaborador no momento da emissão (imutáveis)
    employee_name = Column(String(200), nullable=False)
    employee_cpf = Column(String(14), nullable=True)
    employee_identifier = Column(String(200), nullable=False)
    
    # Dados do treinamento (imutáveis)
    training_title = Column(String(300), nullable=False)
    training_description = Column(Text, nullable=True)
    training_duration_minutes = Column(Integer, nullable=True)
    training_type = Column(String(50), nullable=True)  # video | pdf | link | course
    
    # Dados do plano de ação (contexto)
    action_plan_title = Column(String(300), nullable=True)
    risk_dimension = Column(String(50), nullable=True)  # governance | hazards | controls | training
    
    # Datas
    training_started_at = Column(DateTime, nullable=True)
    training_completed_at = Column(DateTime, nullable=False)
    issued_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    valid_until = Column(DateTime, nullable=True)  # Se tiver validade
    
    # Arquivo PDF
    pdf_storage_key = Column(String(500), nullable=True)
    pdf_file_size = Column(Integer, nullable=True)
    pdf_hash = Column(String(64), nullable=True)  # SHA256 para validação
    
    # Assinatura digital (opcional)
    signed_by_user_id = Column(
        GUID(), ForeignKey("user_account.id", ondelete="SET NULL"),
        nullable=True
    )
    signed_at = Column(DateTime, nullable=True)
    signature_hash = Column(String(128), nullable=True)
    
    # QR Code para validação
    validation_code = Column(String(32), nullable=True)  # Código curto para validação
    validation_url = Column(String(500), nullable=True)
    
    # Metadados
    issuer_name = Column(String(200), nullable=True)  # Nome da empresa emissora
    issuer_cnpj = Column(String(18), nullable=True)
    
    # Relacionamentos
    enrollment = relationship("ActionItemEnrollment", back_populates="certificate", foreign_keys=[enrollment_id])
    employee = relationship("Employee", foreign_keys=[employee_id])
    content = relationship("ContentItem", foreign_keys=[content_id])
    signed_by_user = relationship("User", foreign_keys=[signed_by_user_id])
    
    @staticmethod
    def generate_certificate_number(tenant_id: str, sequence: int) -> str:
        """Gera número único do certificado."""
        year = datetime.utcnow().year
        return f"NR1-{year}-{sequence:06d}"
    
    @staticmethod
    def generate_validation_code() -> str:
        """Gera código de validação curto."""
        import secrets
        return secrets.token_hex(8).upper()
    
    @property
    def is_valid(self) -> bool:
        """Verifica se o certificado ainda é válido."""
        if self.valid_until is None:
            return True
        return datetime.utcnow() < self.valid_until
