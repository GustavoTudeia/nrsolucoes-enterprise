from __future__ import annotations

from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class LegalRequiredOut(BaseModel):
    terms_version: str
    privacy_version: str
    terms_url: str
    privacy_url: str


class LegalStatusOut(BaseModel):
    required: LegalRequiredOut
    accepted_terms_version: Optional[str] = None
    accepted_privacy_version: Optional[str] = None
    accepted_at: Optional[datetime] = None
    is_missing: bool


class LegalAcceptRequest(BaseModel):
    accept: bool = True


class LegalAcceptOut(BaseModel):
    status: str = "ok"
