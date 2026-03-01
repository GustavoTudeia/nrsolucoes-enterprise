from __future__ import annotations
from sqlalchemy import Column, String, Boolean, ForeignKey, DateTime, Integer
from app.models.types import GUID
from sqlalchemy.orm import relationship
from datetime import datetime

from app.db.base import Base
from app.models.mixins import UUIDPrimaryKeyMixin, TimestampMixin


class User(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Usuário com acesso ao console administrativo."""
    __tablename__ = "user_account"

    tenant_id = Column(GUID(), ForeignKey("tenant.id"), nullable=True, index=True)
    email = Column(String(200), unique=True, nullable=True, index=True)  # Pode ser NULL se usar CPF
    cpf = Column(String(14), unique=True, nullable=True, index=True)  # Alternativa ao email
    full_name = Column(String(200), nullable=True)
    password_hash = Column(String(500), nullable=False)
    phone = Column(String(20), nullable=True, index=True)
    is_active = Column(Boolean, default=True, nullable=False)

    # Platform admin (governança do produto)
    is_platform_admin = Column(Boolean, default=False, nullable=False)
    
    # Controle de senha
    must_change_password = Column(Boolean, default=False, nullable=False)
    password_changed_at = Column(DateTime, nullable=True)
    
    # Controle de login
    last_login_at = Column(DateTime, nullable=True)
    login_count = Column(Integer, default=0, nullable=False)
    failed_login_count = Column(Integer, default=0, nullable=False)
    locked_until = Column(DateTime, nullable=True)
    
    # Convite
    invited_by_user_id = Column(GUID(), ForeignKey("user_account.id"), nullable=True)
    invited_at = Column(DateTime, nullable=True)
    
    # ==========================================================================
    # RECUPERAÇÃO DE SENHA / OTP / MAGIC LINK
    # ==========================================================================
    
    # Reset de senha
    password_reset_token = Column(String(100), nullable=True)
    password_reset_expires = Column(DateTime, nullable=True)
    
    # OTP (código por email/SMS)
    otp_code = Column(String(10), nullable=True)
    otp_expires = Column(DateTime, nullable=True)
    
    # Magic link (login sem senha)
    magic_link_token = Column(String(100), nullable=True)
    magic_link_expires = Column(DateTime, nullable=True)

    # Relacionamentos
    roles = relationship("UserRoleScope", back_populates="user", cascade="all, delete-orphan", foreign_keys="[UserRoleScope.user_id]")
    invited_by = relationship("User", remote_side="User.id", foreign_keys=[invited_by_user_id])

    @property
    def is_locked(self) -> bool:
        """Verifica se a conta está bloqueada."""
        if self.locked_until is None:
            return False
        return datetime.utcnow() < self.locked_until

    @property
    def display_name(self) -> str:
        """Retorna nome para exibição."""
        return self.full_name or self.email or self.cpf or "Usuário"

    @property
    def identifier(self) -> str:
        """Retorna identificador principal (email ou CPF)."""
        return self.email or self.cpf or ""

    def increment_failed_login(self) -> None:
        """Incrementa contador de falhas de login."""
        self.failed_login_count += 1
        # Bloqueia após 5 tentativas por 30 minutos
        if self.failed_login_count >= 5:
            from datetime import timedelta
            self.locked_until = datetime.utcnow() + timedelta(minutes=30)

    def reset_failed_login(self) -> None:
        """Reseta contador de falhas após login bem-sucedido."""
        self.failed_login_count = 0
        self.locked_until = None

    def record_login(self) -> None:
        """Registra login bem-sucedido."""
        self.last_login_at = datetime.utcnow()
        self.login_count += 1
        self.reset_failed_login()


class Role(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Papel/perfil de acesso no sistema."""
    __tablename__ = "role"

    key = Column(String(60), unique=True, nullable=False)  # OWNER, TENANT_ADMIN, etc.
    name = Column(String(120), nullable=False)
    description = Column(String(500), nullable=True)
    is_system = Column(Boolean, default=True, nullable=False)  # Papel do sistema (não editável)


class UserRoleScope(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Atribuição de papel com escopo (tenant, CNPJ, unidade)."""
    __tablename__ = "user_role_scope"

    user_id = Column(GUID(), ForeignKey("user_account.id"), nullable=False, index=True)
    role_id = Column(GUID(), ForeignKey("role.id"), nullable=False, index=True)

    # Escopo
    tenant_id = Column(GUID(), ForeignKey("tenant.id"), nullable=True, index=True)
    cnpj_id = Column(GUID(), ForeignKey("cnpj.id"), nullable=True, index=True)
    org_unit_id = Column(GUID(), ForeignKey("org_unit.id"), nullable=True, index=True)
    
    # Quem concedeu
    granted_by_user_id = Column(GUID(), ForeignKey("user_account.id"), nullable=True)
    granted_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Expiração (para acessos temporários)
    expires_at = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)

    # Relacionamentos
    user = relationship("User", back_populates="roles", foreign_keys=[user_id])
    role = relationship("Role")
    granted_by = relationship("User", foreign_keys=[granted_by_user_id])
    tenant = relationship("Tenant", foreign_keys=[tenant_id])
    cnpj = relationship("CNPJ", foreign_keys=[cnpj_id])
    org_unit = relationship("OrgUnit", foreign_keys=[org_unit_id])

    @property
    def is_expired(self) -> bool:
        """Verifica se o acesso expirou."""
        if self.expires_at is None:
            return False
        return datetime.utcnow() > self.expires_at

    @property
    def is_valid(self) -> bool:
        """Verifica se o acesso é válido."""
        return self.is_active and not self.is_expired
