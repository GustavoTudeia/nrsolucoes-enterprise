"""Modelo de Log de Auditoria de Autenticação."""
from __future__ import annotations
from sqlalchemy import Column, String, ForeignKey, DateTime, Boolean, Text, JSON
from sqlalchemy.orm import relationship
from datetime import datetime

from app.models.types import GUID
from app.db.base import Base
from app.models.mixins import UUIDPrimaryKeyMixin


class AuthAuditLog(Base, UUIDPrimaryKeyMixin):
    """Log de eventos de autenticação para auditoria e segurança."""
    __tablename__ = "auth_audit_log"

    # Tipo do evento
    event_type = Column(String(50), nullable=False, index=True)
    # Tipos:
    # LOGIN_SUCCESS, LOGIN_FAILED, LOGOUT
    # PASSWORD_CHANGE, PASSWORD_RESET_REQUEST, PASSWORD_RESET_COMPLETE
    # OTP_SENT, OTP_VERIFIED, OTP_FAILED
    # MAGIC_LINK_SENT, MAGIC_LINK_USED
    # INVITATION_SENT, INVITATION_ACCEPTED, INVITATION_EXPIRED
    # ACCOUNT_LOCKED, ACCOUNT_UNLOCKED
    # SESSION_CREATED, SESSION_EXPIRED, SESSION_REVOKED
    # MFA_ENABLED, MFA_DISABLED, MFA_SUCCESS, MFA_FAILED
    
    # Quem (user OU employee)
    user_id = Column(GUID(), ForeignKey("user_account.id"), nullable=True, index=True)
    employee_id = Column(GUID(), ForeignKey("employee.id"), nullable=True, index=True)
    tenant_id = Column(GUID(), ForeignKey("tenant.id"), nullable=True, index=True)
    
    # Identificadores usados na tentativa
    email = Column(String(200), nullable=True)
    cpf = Column(String(14), nullable=True)
    phone = Column(String(20), nullable=True)
    
    # Resultado
    success = Column(Boolean, nullable=False)
    failure_reason = Column(String(100), nullable=True)
    # Razões de falha:
    # INVALID_CREDENTIALS, ACCOUNT_LOCKED, ACCOUNT_INACTIVE
    # EXPIRED_TOKEN, INVALID_TOKEN, ALREADY_USED
    # EXPIRED_OTP, INVALID_OTP, TOO_MANY_ATTEMPTS
    
    # Metadata de segurança
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(Text, nullable=True)
    
    # Geolocalização (via GeoIP)
    location_country = Column(String(2), nullable=True)
    location_region = Column(String(100), nullable=True)
    location_city = Column(String(100), nullable=True)
    
    # Dados adicionais (renomeado de metadata para evitar conflito com SQLAlchemy)
    extra_data = Column(JSON, default=dict)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    # Relacionamentos
    user = relationship("User", foreign_keys=[user_id])
    employee = relationship("Employee", foreign_keys=[employee_id])
    tenant = relationship("Tenant", foreign_keys=[tenant_id])

    @classmethod
    def log_login_success(cls, user_id, tenant_id, ip=None, user_agent=None, email=None, cpf=None):
        """Cria log de login bem-sucedido."""
        return cls(
            event_type="LOGIN_SUCCESS",
            user_id=user_id,
            tenant_id=tenant_id,
            email=email,
            cpf=cpf,
            success=True,
            ip_address=ip,
            user_agent=user_agent,
        )

    @classmethod
    def log_login_failed(cls, reason, email=None, cpf=None, ip=None, user_agent=None, user_id=None, tenant_id=None):
        """Cria log de login falho."""
        return cls(
            event_type="LOGIN_FAILED",
            user_id=user_id,
            tenant_id=tenant_id,
            email=email,
            cpf=cpf,
            success=False,
            failure_reason=reason,
            ip_address=ip,
            user_agent=user_agent,
        )

    @classmethod
    def log_password_reset_request(cls, email=None, user_id=None, ip=None, user_agent=None):
        """Cria log de solicitação de reset de senha."""
        return cls(
            event_type="PASSWORD_RESET_REQUEST",
            user_id=user_id,
            email=email,
            success=True,
            ip_address=ip,
            user_agent=user_agent,
        )

    @classmethod
    def log_password_changed(cls, user_id, tenant_id=None, ip=None, user_agent=None):
        """Cria log de alteração de senha."""
        return cls(
            event_type="PASSWORD_CHANGE",
            user_id=user_id,
            tenant_id=tenant_id,
            success=True,
            ip_address=ip,
            user_agent=user_agent,
        )

    @classmethod
    def log_account_locked(cls, user_id, reason, ip=None, user_agent=None):
        """Cria log de bloqueio de conta."""
        return cls(
            event_type="ACCOUNT_LOCKED",
            user_id=user_id,
            success=True,
            failure_reason=reason,
            ip_address=ip,
            user_agent=user_agent,
        )

    @classmethod
    def log_invitation_sent(cls, email, tenant_id, invited_by_user_id, role_key):
        """Cria log de convite enviado."""
        return cls(
            event_type="INVITATION_SENT",
            user_id=invited_by_user_id,
            tenant_id=tenant_id,
            email=email,
            success=True,
            extra_data={"role_key": role_key},
        )

    @classmethod
    def log_invitation_accepted(cls, email, user_id, tenant_id, ip=None, user_agent=None):
        """Cria log de convite aceito."""
        return cls(
            event_type="INVITATION_ACCEPTED",
            user_id=user_id,
            tenant_id=tenant_id,
            email=email,
            success=True,
            ip_address=ip,
            user_agent=user_agent,
        )

    @classmethod
    def log_otp_sent(cls, phone, method, user_id=None, employee_id=None):
        """Cria log de OTP enviado."""
        return cls(
            event_type="OTP_SENT",
            user_id=user_id,
            employee_id=employee_id,
            phone=phone,
            success=True,
            extra_data={"method": method},
        )

    @classmethod
    def log_logout(cls, user_id, tenant_id=None, ip=None, user_agent=None):
        """Cria log de logout."""
        return cls(
            event_type="LOGOUT",
            user_id=user_id,
            tenant_id=tenant_id,
            success=True,
            ip_address=ip,
            user_agent=user_agent,
        )
