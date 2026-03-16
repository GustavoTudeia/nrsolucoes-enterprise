from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import Unauthorized
from app.core.metrics import metrics_registry
from app.core.security import create_access_token
from app.models.refresh_session import RefreshSession
from app.models.user import User



def _hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()



def issue_token_pair(
    db: Session,
    *,
    user: User,
    tenant_id: UUID | None,
    ip_address: str | None = None,
    user_agent: str | None = None,
    family_id: UUID | None = None,
) -> tuple[str, str]:
    access_token = create_access_token(
        subject=user.email or user.cpf or str(user.id),
        extra={
            "uid": str(user.id),
            "tid": str(tenant_id) if tenant_id else (str(user.tenant_id) if user.tenant_id else None),
            "pla": user.is_platform_admin,
        },
    )
    raw_refresh = secrets.token_urlsafe(48)
    db.add(
        RefreshSession(
            user_id=user.id,
            tenant_id=tenant_id,
            family_id=family_id or uuid4(),
            token_hash=_hash_token(raw_refresh),
            ip_address=ip_address,
            user_agent=user_agent,
            expires_at=datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        )
    )
    metrics_registry.inc_counter("auth_refresh_issued_total")
    return access_token, raw_refresh



def revoke_refresh_family(db: Session, family_id: UUID) -> int:
    rows = (
        db.query(RefreshSession)
        .filter(RefreshSession.family_id == family_id, RefreshSession.revoked_at == None)
        .all()
    )
    now = datetime.utcnow()
    for row in rows:
        row.revoked_at = now
        db.add(row)
    metrics_registry.inc_counter("auth_refresh_family_revoked_total")
    return len(rows)



def revoke_refresh_token(db: Session, raw_refresh_token: str) -> None:
    token_hash = _hash_token(raw_refresh_token)
    row = db.query(RefreshSession).filter(RefreshSession.token_hash == token_hash).first()
    if row and not row.revoked_at:
        row.revoked_at = datetime.utcnow()
        db.add(row)
        metrics_registry.inc_counter("auth_refresh_revoked_total")



def rotate_refresh_token(
    db: Session,
    *,
    raw_refresh_token: str,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> tuple[User, UUID | None, str, str]:
    token_hash = _hash_token(raw_refresh_token)
    row = db.query(RefreshSession).filter(RefreshSession.token_hash == token_hash).first()
    if not row:
        raise Unauthorized("Refresh token inválido")

    if row.revoked_at:
        raise Unauthorized("Refresh token revogado")

    if row.is_expired:
        row.revoked_at = datetime.utcnow()
        db.add(row)
        raise Unauthorized("Refresh token expirado")

    if row.is_rotated:
        if settings.REFRESH_TOKEN_REUSE_DETECTION:
            revoke_refresh_family(db, row.family_id)
        raise Unauthorized("Refresh token reutilizado ou já rotacionado")

    user = db.query(User).filter(User.id == row.user_id, User.is_active == True).first()
    if not user:
        row.revoked_at = datetime.utcnow()
        db.add(row)
        raise Unauthorized("Usuário inválido")

    access_token, new_refresh = issue_token_pair(
        db,
        user=user,
        tenant_id=row.tenant_id,
        ip_address=ip_address,
        user_agent=user_agent,
        family_id=row.family_id,
    )
    row.last_used_at = datetime.utcnow()
    row.rotated_at = datetime.utcnow()
    row.replaced_by_token_hash = _hash_token(new_refresh)
    db.add(row)
    metrics_registry.inc_counter("auth_refresh_rotated_total")
    return user, row.tenant_id, access_token, new_refresh
