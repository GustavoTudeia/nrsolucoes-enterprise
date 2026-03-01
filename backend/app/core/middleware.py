from __future__ import annotations

import time
import uuid
import logging
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger("nrsolucoes.request")

class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        rid = request.headers.get("X-Request-Id") or str(uuid.uuid4())
        request.state.request_id = rid
        start = time.time()
        response = await call_next(request)
        elapsed_ms = int((time.time() - start) * 1000)

        response.headers["X-Request-Id"] = rid
        # Minimal structured log
        logger.info("request", extra={
            "rid": rid,
            "method": request.method,
            "path": str(request.url.path),
            "status": response.status_code,
            "elapsed_ms": elapsed_ms,
        })
        return response
