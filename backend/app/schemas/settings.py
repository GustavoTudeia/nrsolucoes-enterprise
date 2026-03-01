from __future__ import annotations

from pydantic import BaseModel, Field
from typing import Optional


class TenantSettingsOut(BaseModel):
    min_anon_threshold: int
    brand_name: Optional[str] = None
    logo_url: Optional[str] = None
    primary_color: Optional[str] = None
    secondary_color: Optional[str] = None
    support_email: Optional[str] = None
    custom_domain: Optional[str] = None
    login_background_url: Optional[str] = None


class TenantSettingsUpdate(BaseModel):
    min_anon_threshold: Optional[int] = Field(default=None, ge=3, le=100)
    brand_name: Optional[str] = Field(default=None, max_length=200)
    logo_url: Optional[str] = Field(default=None, max_length=1000)
    primary_color: Optional[str] = Field(default=None, max_length=32)
    secondary_color: Optional[str] = Field(default=None, max_length=32)
    support_email: Optional[str] = Field(default=None, max_length=200)
    custom_domain: Optional[str] = Field(default=None, max_length=200)
    login_background_url: Optional[str] = Field(default=None, max_length=1000)
