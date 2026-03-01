from __future__ import annotations

from pydantic import BaseModel, Field
from typing import Optional, List


class SSOConfigOut(BaseModel):
    enabled: bool
    issuer_url: Optional[str] = None
    client_id: Optional[str] = None
    allowed_domains: List[str] = []
    has_client_secret: bool = False


class SSOConfigUpdate(BaseModel):
    enabled: Optional[bool] = None
    issuer_url: Optional[str] = Field(default=None, max_length=400)
    client_id: Optional[str] = Field(default=None, max_length=200)
    client_secret: Optional[str] = Field(default=None, max_length=400)
    allowed_domains: Optional[List[str]] = None


class SSOStartRequest(BaseModel):
    email: str
    redirect_uri: str


class SSOStartOut(BaseModel):
    authorization_url: str
    state: str


class SSOCallbackRequest(BaseModel):
    state: str
    code: str
    redirect_uri: str


class SSOCallbackOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
