from __future__ import annotations

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel


class AuditEventOut(BaseModel):
    id: UUID
    tenant_id: Optional[UUID] = None
    actor_user_id: Optional[UUID] = None

    action: str
    entity_type: str
    entity_id: Optional[UUID] = None

    before_json: Optional[dict[str, Any]] = None
    after_json: Optional[dict[str, Any]] = None

    ip: Optional[str] = None
    user_agent: Optional[str] = None
    request_id: Optional[str] = None
    created_at: datetime
