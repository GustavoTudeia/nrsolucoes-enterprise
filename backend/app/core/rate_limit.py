from __future__ import annotations

import hashlib
import logging
import threading
import time
from dataclasses import dataclass

from fastapi import HTTPException, status
from app.services.cache import get_redis
from app.core.metrics import metrics_registry

logger = logging.getLogger(__name__)

_local_windows: dict[str, tuple[int, float]] = {}
_local_lock = threading.Lock()


class TooManyRequests(HTTPException):
    def __init__(self, detail: str = "Too Many Requests", retry_after_seconds: int | None = None):
        headers = {"Retry-After": str(retry_after_seconds)} if retry_after_seconds else None
        super().__init__(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=detail, headers=headers)


@dataclass
class RateLimitDecision:
    allowed: bool
    remaining: int
    retry_after_seconds: int


def _hash_key(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _redis_consume(key: str, limit: int, window_seconds: int) -> RateLimitDecision:
    client = get_redis()
    if client is None:
        raise RuntimeError("redis-unavailable")
    count = client.incr(key)
    if count == 1:
        client.expire(key, window_seconds)
    ttl = client.ttl(key)
    retry_after = max(int(ttl), 1) if ttl and ttl > 0 else window_seconds
    remaining = max(limit - int(count), 0)
    return RateLimitDecision(allowed=int(count) <= limit, remaining=remaining, retry_after_seconds=retry_after)


def _local_consume(key: str, limit: int, window_seconds: int) -> RateLimitDecision:
    now = time.time()
    with _local_lock:
        count, expires_at = _local_windows.get(key, (0, now + window_seconds))
        if expires_at <= now:
            count = 0
            expires_at = now + window_seconds
        count += 1
        _local_windows[key] = (count, expires_at)
        retry_after = max(int(expires_at - now), 1)
        remaining = max(limit - count, 0)
        return RateLimitDecision(allowed=count <= limit, remaining=remaining, retry_after_seconds=retry_after)


def consume_rate_limit(*, scope: str, identifier: str, limit: int, window_seconds: int) -> RateLimitDecision:
    raw_key = f"rl:{scope}:{_hash_key(identifier)}"
    try:
        return _redis_consume(raw_key, limit, window_seconds)
    except Exception as exc:
        logger.debug("rate-limit fallback local for %s: %s", scope, exc)
        return _local_consume(raw_key, limit, window_seconds)


def enforce_rate_limit(*, scope: str, identifier: str, limit: int, window_seconds: int, detail: str | None = None) -> None:
    decision = consume_rate_limit(scope=scope, identifier=identifier, limit=limit, window_seconds=window_seconds)
    if not decision.allowed:
        metrics_registry.inc_counter("auth_rate_limit_block_total", {"scope": scope})
        raise TooManyRequests(detail or "Limite de tentativas excedido. Tente novamente mais tarde.", retry_after_seconds=decision.retry_after_seconds)
