from __future__ import annotations
from rq import Queue
from redis import Redis
from app.core.config import settings

redis_conn = Redis.from_url(settings.REDIS_URL)
queue = Queue("default", connection=redis_conn)
