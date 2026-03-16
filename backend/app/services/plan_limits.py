from __future__ import annotations

from datetime import datetime
from sqlalchemy.orm import Session
from uuid import UUID

from app.core.errors import Forbidden
from app.services.entitlements import resolve_entitlements

LIMIT_ALIASES = {
    "cnpjs": "cnpj_max",
    "cnpj": "cnpj_max",
    "campaigns_per_month": "campaigns_max",
    "campaigns": "campaigns_max",
    "users": "users_max",
    "employees": "employees_max",
}


def enforce_limit(db: Session, tenant_id: UUID, limit_key: str, current_count: int, increment: int = 1) -> None:
    """Bloqueia criação quando um limite do plano é excedido.

    Se o limite não estiver definido (None/ausente), considera ilimitado.
    """
    ent = resolve_entitlements(db, tenant_id)
    canonical_key = LIMIT_ALIASES.get(limit_key, limit_key)
    limit = ent.limit_int(canonical_key, None)
    if limit is None:
        return
    if current_count + increment > limit:
        raise Forbidden(f"Limite do plano excedido: {canonical_key} ({current_count}/{limit})")

def month_range(dt: datetime) -> tuple[datetime, datetime]:
    start = dt.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if start.month == 12:
        end = start.replace(year=start.year + 1, month=1)
    else:
        end = start.replace(month=start.month + 1)
    return start, end
