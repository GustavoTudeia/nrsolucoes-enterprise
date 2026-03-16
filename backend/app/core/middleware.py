from __future__ import annotations

import time
import uuid
import logging
from fastapi import Request
from app.core.metrics import metrics_registry
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
        metrics_registry.inc_counter("http_requests_total", {"method": request.method, "path": str(request.url.path), "status": response.status_code})
        metrics_registry.observe_duration("http_request_duration_seconds", elapsed_ms / 1000.0, {"method": request.method, "path": str(request.url.path), "status": response.status_code})
        logger.info("request", extra={
            "rid": rid,
            "method": request.method,
            "path": str(request.url.path),
            "status": response.status_code,
            "elapsed_ms": elapsed_ms,
        })
        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        scheme = request.headers.get("x-forwarded-proto", request.url.scheme)
        if scheme == "https":
            response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        # CSP simples para a API, evitando efeitos colaterais em documentos já gerados pelo frontend
        response.headers.setdefault("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'")
        return response
