from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Dict

import httpx
from jose import jwt

_CACHE: dict[str, tuple[datetime, Dict[str, Any]]] = {}
_CACHE_TTL_SECONDS = 600


class OIDCError(Exception):
    pass


def _normalize_issuer(issuer_url: str) -> str:
    return issuer_url.rstrip("/")


def get_discovery(issuer_url: str) -> Dict[str, Any]:
    issuer = _normalize_issuer(issuer_url)
    now = datetime.utcnow()
    cached = _CACHE.get(issuer)
    if cached and cached[0] > now:
        return cached[1]

    url = f"{issuer}/.well-known/openid-configuration"
    try:
        with httpx.Client(timeout=10.0) as client:
            r = client.get(url)
            r.raise_for_status()
            data = r.json()
    except Exception as e:
        raise OIDCError(f"Falha ao obter discovery do issuer: {e}")

    _CACHE[issuer] = (now + timedelta(seconds=_CACHE_TTL_SECONDS), data)
    return data


def build_authorization_url(discovery: Dict[str, Any], client_id: str, redirect_uri: str, state: str, nonce: str, scope: str = "openid email profile") -> str:
    from urllib.parse import urlencode

    auth_endpoint = discovery.get("authorization_endpoint")
    if not auth_endpoint:
        raise OIDCError("authorization_endpoint ausente no discovery")

    params = {
        "client_id": client_id,
        "response_type": "code",
        "scope": scope,
        "redirect_uri": redirect_uri,
        "state": state,
        "nonce": nonce,
    }
    return f"{auth_endpoint}?{urlencode(params)}"


def exchange_code_for_tokens(discovery: Dict[str, Any], client_id: str, client_secret: str, code: str, redirect_uri: str) -> Dict[str, Any]:
    token_endpoint = discovery.get("token_endpoint")
    if not token_endpoint:
        raise OIDCError("token_endpoint ausente no discovery")

    data = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": redirect_uri,
        "client_id": client_id,
        "client_secret": client_secret,
    }
    try:
        with httpx.Client(timeout=10.0) as client:
            r = client.post(token_endpoint, data=data, headers={"Content-Type": "application/x-www-form-urlencoded"})
            r.raise_for_status()
            return r.json()
    except Exception as e:
        raise OIDCError(f"Falha ao trocar code por tokens: {e}")


def verify_id_token(discovery: Dict[str, Any], id_token: str, client_id: str, issuer_url: str) -> Dict[str, Any]:
    jwks_uri = discovery.get("jwks_uri")
    if not jwks_uri:
        raise OIDCError("jwks_uri ausente no discovery")

    issuer = _normalize_issuer(issuer_url)

    try:
        with httpx.Client(timeout=10.0) as client:
            r = client.get(jwks_uri)
            r.raise_for_status()
            jwks = r.json()
        header = jwt.get_unverified_header(id_token)
        kid = header.get("kid")
        alg = header.get("alg")
        keys = jwks.get("keys", [])
        key = next((k for k in keys if k.get("kid") == kid), None) if kid else (keys[0] if keys else None)
        if not key:
            raise OIDCError("Nenhuma chave encontrada para validar id_token")

        claims = jwt.decode(
            id_token,
            key,
            algorithms=[alg] if alg else None,
            audience=client_id,
            issuer=issuer,
            options={"verify_at_hash": False},
        )
        return claims
    except Exception as e:
        raise OIDCError(f"Falha ao validar id_token: {e}")
