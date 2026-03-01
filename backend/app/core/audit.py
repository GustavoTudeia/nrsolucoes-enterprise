from __future__ import annotations

from typing import Any, Dict, Optional
from uuid import UUID
from datetime import datetime

from app.models.audit_event import AuditEvent

def make_audit_event(
    tenant_id: Optional[UUID],
    actor_user_id: Optional[UUID],
    action: str,
    entity_type: str,
    entity_id: Optional[UUID],
    before: Optional[Dict[str, Any]],
    after: Optional[Dict[str, Any]],
    ip: Optional[str],
    user_agent: Optional[str],
    request_id: Optional[str],
) -> AuditEvent:
    return AuditEvent(
        tenant_id=tenant_id,
        actor_user_id=actor_user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        before_json=before,
        after_json=after,
        ip=ip,
        user_agent=user_agent,
        request_id=request_id,
        created_at=datetime.utcnow(),
    )
