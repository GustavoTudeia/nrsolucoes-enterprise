from __future__ import annotations

from datetime import datetime
from sqlalchemy.orm import Session
from uuid import UUID

from app.core.errors import Forbidden
from app.services.entitlements import resolve_entitlements

def enforce_limit(db: Session, tenant_id: UUID, limit_key: str, current_count: int, increment: int = 1) -> None:
    """Bloqueia criação quando um limite do plano é excedido.

    Se o limite não estiver definido (None/ausente), considera ilimitado.
    """
    ent = resolve_entitlements(db, tenant_id)
    limit = ent.limit_int(limit_key, None)
    if limit is None:
        return
    if current_count + increment > limit:
        raise Forbidden(f"Limite do plano excedido: {limit_key} ({current_count}/{limit})")

def month_range(dt: datetime) -> tuple[datetime, datetime]:
    start = dt.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if start.month == 12:
        end = start.replace(year=start.year + 1, month=1)
    else:
        end = start.replace(month=start.month + 1)
    return start, end
