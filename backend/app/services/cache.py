from __future__ import annotations

import json
import logging
import threading
import time
from typing import Any, Optional

from redis import Redis
from redis.exceptions import RedisError

from app.core.config import settings

logger = logging.getLogger(__name__)

_redis_client: Redis | None = None
_lock = threading.Lock()
_fallback_store: dict[str, tuple[float, str]] = {}


def get_redis() -> Redis | None:
    global _redis_client
    if _redis_client is not None:
        return _redis_client
    with _lock:
        if _redis_client is not None:
            return _redis_client
        try:
            _redis_client = Redis.from_url(settings.REDIS_URL, decode_responses=True)
            _redis_client.ping()
            return _redis_client
        except Exception as exc:
            logger.warning("Redis indisponível, usando fallback local: %s", exc)
            _redis_client = None
            return None


def redis_ping() -> bool:
    client = get_redis()
    if client is None:
        return False
    try:
        return bool(client.ping())
    except RedisError:
        return False


def cache_get_json(key: str) -> Any | None:
    client = get_redis()
    if client is not None:
        try:
            raw = client.get(key)
            return json.loads(raw) if raw else None
        except Exception:
            return None
    now = time.time()
    entry = _fallback_store.get(key)
    if not entry:
        return None
    expires_at, payload = entry
    if expires_at < now:
        _fallback_store.pop(key, None)
        return None
    try:
        return json.loads(payload)
    except Exception:
        return None


def cache_set_json(key: str, value: Any, ttl_seconds: int | None = None) -> None:
    ttl = ttl_seconds or settings.CACHE_DEFAULT_TTL_SECONDS
    payload = json.dumps(value, default=str)
    client = get_redis()
    if client is not None:
        try:
            client.setex(key, ttl, payload)
            return
        except Exception:
            pass
    _fallback_store[key] = (time.time() + ttl, payload)


def cache_delete(key: str) -> None:
    client = get_redis()
    if client is not None:
        try:
            client.delete(key)
            return
        except Exception:
            pass
    _fallback_store.pop(key, None)
