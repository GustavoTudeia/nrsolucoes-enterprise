from __future__ import annotations

from datetime import datetime, timedelta, UTC
from typing import Any, Dict
from jose import jwt
from passlib.context import CryptContext

from app.core.config import settings

# pbkdf2_sha256 evita incompatibilidades recentes de bcrypt e continua sendo robusto
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(subject: str, extra: Dict[str, Any], expires_minutes: int | None = None) -> str:
    if expires_minutes is None:
        expires_minutes = settings.ACCESS_TOKEN_EXPIRE_MINUTES
    expire = datetime.now(UTC) + timedelta(minutes=expires_minutes)
    to_encode: Dict[str, Any] = {"sub": subject, "exp": expire, **extra}
    return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> Dict[str, Any]:
    return jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
