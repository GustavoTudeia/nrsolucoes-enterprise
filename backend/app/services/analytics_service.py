from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime
from typing import Any, Mapping
from uuid import UUID

import httpx
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.analytics import AnalyticsEvent

logger = logging.getLogger(__name__)

PII_KEYS = {"email", "cpf", "cnpj", "document", "phone", "full_name", "name"}


def _safe_value(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, (list, tuple)):
        return [_safe_value(v) for v in value][:50]
    if isinstance(value, dict):
        return {str(k): _safe_value(v) for k, v in list(value.items())[:50]}
    return str(value)


def sanitize_properties(properties: Mapping[str, Any] | None) -> dict[str, Any]:
    clean: dict[str, Any] = {}
    for key, value in (properties or {}).items():
        k = str(key)
        if k.lower() in PII_KEYS:
            continue
        clean[k] = _safe_value(value)
    return clean


def hash_distinct_key(value: str | None) -> str | None:
    if not value:
        return None
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _flatten_ga4_params(payload: dict[str, Any]) -> dict[str, Any]:
    params: dict[str, Any] = {}
    for key, value in payload.items():
        if value is None:
            continue
        safe_key = key[:40]
        if isinstance(value, (str, int, float)):
            params[safe_key] = value
        elif isinstance(value, bool):
            params[safe_key] = int(value)
        else:
            params[safe_key] = json.dumps(_safe_value(value))[:100]
    return params


def _send_posthog(event_name: str, distinct_id: str, properties: dict[str, Any]) -> None:
    if not settings.POSTHOG_ENABLED or not settings.POSTHOG_PROJECT_API_KEY:
        return
    try:
        url = f"{settings.POSTHOG_HOST.rstrip('/')}/capture/"
        body = {
            "api_key": settings.POSTHOG_PROJECT_API_KEY,
            "event": event_name,
            "properties": {
                "distinct_id": distinct_id,
                **properties,
            },
            "timestamp": datetime.utcnow().isoformat(),
        }
        with httpx.Client(timeout=4.0) as client:
            client.post(url, json=body)
    except Exception as exc:
        logger.warning("posthog capture failed for %s: %s", event_name, exc)


def _send_ga4(event_name: str, distinct_id: str, properties: dict[str, Any]) -> None:
    if not settings.GA4_ENABLED or not settings.GA4_MEASUREMENT_ID or not settings.GA4_API_SECRET:
        return
    try:
        url = (
            "https://www.google-analytics.com/mp/collect"
            f"?measurement_id={settings.GA4_MEASUREMENT_ID}&api_secret={settings.GA4_API_SECRET}"
        )
        payload = {
            "client_id": distinct_id,
            "non_personalized_ads": True,
            "events": [{"name": event_name[:40], "params": _flatten_ga4_params(properties)}],
        }
        with httpx.Client(timeout=4.0) as client:
            client.post(url, json=payload)
    except Exception as exc:
        logger.warning("ga4 capture failed for %s: %s", event_name, exc)


def capture_analytics_event(
    db: Session,
    event_name: str,
    *,
    source: str,
    tenant_id: UUID | None = None,
    user_id: UUID | None = None,
    employee_id: UUID | None = None,
    actor_role: str | None = None,
    module: str | None = None,
    distinct_key: str | None = None,
    path: str | None = None,
    referrer: str | None = None,
    channel: str | None = None,
    utm_source: str | None = None,
    utm_medium: str | None = None,
    utm_campaign: str | None = None,
    utm_term: str | None = None,
    utm_content: str | None = None,
    properties: Mapping[str, Any] | None = None,
    commit: bool = False,
) -> AnalyticsEvent:
    props = sanitize_properties(properties)
    distinct_hash = hash_distinct_key(distinct_key) or (str(user_id) if user_id else str(employee_id) if employee_id else str(tenant_id) if tenant_id else None)
    ev = AnalyticsEvent(
        tenant_id=tenant_id,
        user_id=user_id,
        employee_id=employee_id,
        event_name=event_name,
        source=source,
        actor_role=actor_role,
        module=module,
        distinct_key=distinct_hash,
        path=path,
        referrer=referrer,
        channel=channel,
        utm_source=utm_source,
        utm_medium=utm_medium,
        utm_campaign=utm_campaign,
        utm_term=utm_term,
        utm_content=utm_content,
        event_properties=props,
        occurred_at=datetime.utcnow(),
    )
    db.add(ev)
    db.flush()

    if settings.ANALYTICS_ENABLED and distinct_hash:
        provider_props = {
            **props,
            "tenant_id": str(tenant_id) if tenant_id else None,
            "user_id": str(user_id) if user_id else None,
            "employee_id": str(employee_id) if employee_id else None,
            "source": source,
            "actor_role": actor_role,
            "module": module,
            "path": path,
            "channel": channel,
            "utm_source": utm_source,
            "utm_medium": utm_medium,
            "utm_campaign": utm_campaign,
        }
        _send_posthog(event_name, distinct_hash, provider_props)
        _send_ga4(event_name, distinct_hash, provider_props)

    if commit:
        db.commit()
    return ev
