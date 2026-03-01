"""Modelo de Convite de Usuário."""
from __future__ import annotations
from sqlalchemy import Column, String, ForeignKey, DateTime, Text
from sqlalchemy.orm import relationship
from datetime import datetime, timedelta

from app.models.types import GUID
from app.db.base import Base
from app.models.mixins import UUIDPrimaryKeyMixin


class UserInvitation(Base, UUIDPrimaryKeyMixin):
    """Convite para novo usuário acessar o sistema."""
    __tablename__ = "user_invitation"

    tenant_id = Column(GUID(), ForeignKey("tenant.id"), nullable=False, index=True)
    email = Column(String(200), nullable=False, index=True)
    full_name = Column(String(200), nullable=True)
    role_key = Column(String(60), nullable=False)  # TENANT_ADMIN, CNPJ_MANAGER, etc
    
    # Escopo opcional
    cnpj_id = Column(GUID(), ForeignKey("cnpj.id"), nullable=True)
    org_unit_id = Column(GUID(), ForeignKey("org_unit.id"), nullable=True)
    
    # Token único para aceitar convite
    token = Column(String(100), nullable=False, unique=True, index=True)
    
    # Quem convidou
    invited_by_user_id = Column(GUID(), ForeignKey("user_account.id"), nullable=False)
    
    # Controle de expiração e status
    expires_at = Column(DateTime, nullable=False)
    accepted_at = Column(DateTime, nullable=True)
    created_user_id = Column(GUID(), ForeignKey("user_account.id"), nullable=True)
    status = Column(String(20), nullable=False, default="pending")  # pending | accepted | expired | cancelled
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relacionamentos
    tenant = relationship("Tenant", foreign_keys=[tenant_id])
    invited_by = relationship("User", foreign_keys=[invited_by_user_id])
    created_user = relationship("User", foreign_keys=[created_user_id])
    cnpj = relationship("CNPJ", foreign_keys=[cnpj_id])
    org_unit = relationship("OrgUnit", foreign_keys=[org_unit_id])

    @property
    def is_expired(self) -> bool:
        """Verifica se o convite expirou."""
        return datetime.utcnow() > self.expires_at

    @property
    def is_valid(self) -> bool:
        """Verifica se o convite é válido para uso."""
        return self.status == "pending" and not self.is_expired

    @classmethod
    def create_token(cls) -> str:
        """Gera token único para convite."""
        import secrets
        return secrets.token_urlsafe(48)

    @classmethod
    def default_expires_at(cls, days: int = 7) -> datetime:
        """Retorna data de expiração padrão."""
        return datetime.utcnow() + timedelta(days=days)
