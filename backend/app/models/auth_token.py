"""Modelo de Tokens de Autenticação (OTP, Magic Link, Reset)."""
from __future__ import annotations
from sqlalchemy import Column, String, ForeignKey, DateTime, Text
from sqlalchemy.orm import relationship
from datetime import datetime, timedelta
import secrets
import hashlib

from app.models.types import GUID
from app.db.base import Base
from app.models.mixins import UUIDPrimaryKeyMixin


class AuthToken(Base, UUIDPrimaryKeyMixin):
    """Token de autenticação para OTP, magic links, reset de senha."""
    __tablename__ = "auth_token"

    # Tipo do token
    token_type = Column(String(30), nullable=False, index=True)
    # Tipos: magic_link | otp | password_reset | invitation | email_verification
    
    # Hash do token (nunca armazenar token em plain text)
    token_hash = Column(String(100), nullable=False, index=True)
    
    # A quem pertence (user OU employee)
    user_id = Column(GUID(), ForeignKey("user_account.id"), nullable=True, index=True)
    employee_id = Column(GUID(), ForeignKey("employee.id"), nullable=True, index=True)
    
    # Destino alternativo (quando não tem user/employee ainda)
    email = Column(String(200), nullable=True)
    phone = Column(String(20), nullable=True)
    
    # Código OTP (se aplicável) - apenas para verificação
    otp_code = Column(String(6), nullable=True)
    
    # Controle
    expires_at = Column(DateTime, nullable=False)
    used_at = Column(DateTime, nullable=True)
    
    # Metadata de segurança
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(Text, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relacionamentos
    user = relationship("User", foreign_keys=[user_id])
    employee = relationship("Employee", foreign_keys=[employee_id])

    @property
    def is_expired(self) -> bool:
        """Verifica se o token expirou."""
        return datetime.utcnow() > self.expires_at

    @property
    def is_used(self) -> bool:
        """Verifica se o token já foi usado."""
        return self.used_at is not None

    @property
    def is_valid(self) -> bool:
        """Verifica se o token é válido para uso."""
        return not self.is_expired and not self.is_used

    def mark_used(self) -> None:
        """Marca o token como usado."""
        self.used_at = datetime.utcnow()

    @staticmethod
    def generate_token() -> str:
        """Gera token aleatório seguro."""
        return secrets.token_urlsafe(32)

    @staticmethod
    def generate_otp() -> str:
        """Gera código OTP de 6 dígitos."""
        return f"{secrets.randbelow(1000000):06d}"

    @staticmethod
    def hash_token(token: str) -> str:
        """Gera hash do token para armazenamento seguro."""
        return hashlib.sha256(token.encode()).hexdigest()

    @classmethod
    def verify_token(cls, token: str, token_hash: str) -> bool:
        """Verifica se o token corresponde ao hash."""
        return cls.hash_token(token) == token_hash

    @classmethod
    def expires_in_minutes(cls, minutes: int = 15) -> datetime:
        """Retorna data de expiração em minutos."""
        return datetime.utcnow() + timedelta(minutes=minutes)

    @classmethod
    def expires_in_hours(cls, hours: int = 1) -> datetime:
        """Retorna data de expiração em horas."""
        return datetime.utcnow() + timedelta(hours=hours)
