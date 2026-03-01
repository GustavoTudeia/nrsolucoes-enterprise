from __future__ import annotations
from sqlalchemy import String, Boolean, ForeignKey, UniqueConstraint, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.types import GUID
from app.db.base import Base
from app.models.mixins import UUIDPrimaryKeyMixin, TimestampMixin, TenantScopedMixin
from uuid import UUID
from datetime import datetime


class Employee(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantScopedMixin):
    """Colaborador da empresa (pessoa física no quadro de funcionários)."""
    __tablename__ = "employee"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id", "identifier", name="uq_tenant_employee_identifier"
        ),
    )

    # Identificação
    identifier: Mapped[str] = mapped_column(String(200), nullable=False, index=True)  # CPF ou matrícula
    cpf: Mapped[str | None] = mapped_column(String(14), nullable=True, index=True)
    full_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    email: Mapped[str | None] = mapped_column(String(200), nullable=True, index=True)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    
    # Organização
    cnpj_id: Mapped[UUID | None] = mapped_column(
        GUID(), ForeignKey("cnpj.id"), nullable=True, index=True
    )
    org_unit_id: Mapped[UUID | None] = mapped_column(
        GUID(), ForeignKey("org_unit.id"), nullable=True, index=True
    )
    job_title: Mapped[str | None] = mapped_column(String(200), nullable=True)
    admission_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    
    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    
    # Vínculo com usuário do console (se tiver acesso administrativo)
    linked_user_id: Mapped[UUID | None] = mapped_column(
        GUID(), ForeignKey("user_account.id"), nullable=True, index=True
    )
    
    # Acesso ao Portal do Colaborador
    portal_access_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    portal_password_hash: Mapped[str | None] = mapped_column(String(500), nullable=True)
    portal_must_change_password: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    portal_last_login_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    portal_login_count: Mapped[int] = mapped_column(default=0, nullable=False)
    portal_failed_login_count: Mapped[int] = mapped_column(default=0, nullable=False)
    portal_locked_until: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    
    # Preferência de contato
    preferred_contact: Mapped[str | None] = mapped_column(String(20), nullable=True)  # email, sms, whatsapp
    
    # Legado - manter por compatibilidade
    password_hash: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Relacionamentos
    linked_user = relationship("User", foreign_keys=[linked_user_id])
    org_unit = relationship("OrgUnit", foreign_keys=[org_unit_id])
    cnpj = relationship("CNPJ", foreign_keys=[cnpj_id])

    @property
    def display_name(self) -> str:
        """Retorna nome para exibição."""
        return self.full_name or self.identifier

    @property
    def portal_identifier(self) -> str:
        """Identificador para login no portal (CPF ou identifier)."""
        return self.cpf or self.identifier

    @property
    def is_portal_locked(self) -> bool:
        """Verifica se o acesso ao portal está bloqueado."""
        if self.portal_locked_until is None:
            return False
        return datetime.utcnow() < self.portal_locked_until

    def increment_portal_failed_login(self) -> None:
        """Incrementa contador de falhas de login no portal."""
        self.portal_failed_login_count += 1
        if self.portal_failed_login_count >= 5:
            from datetime import timedelta
            self.portal_locked_until = datetime.utcnow() + timedelta(minutes=30)

    def reset_portal_failed_login(self) -> None:
        """Reseta contador de falhas após login bem-sucedido."""
        self.portal_failed_login_count = 0
        self.portal_locked_until = None

    def record_portal_login(self) -> None:
        """Registra login bem-sucedido no portal."""
        self.portal_last_login_at = datetime.utcnow()
        self.portal_login_count += 1
        self.reset_portal_failed_login()
