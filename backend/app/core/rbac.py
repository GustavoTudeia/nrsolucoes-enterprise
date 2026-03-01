from __future__ import annotations

from dataclasses import dataclass
from typing import Optional
from uuid import UUID

from app.core.errors import Forbidden

# Roles do sistema
ROLE_PLATFORM_SUPER_ADMIN = "PLATFORM_SUPER_ADMIN"
ROLE_OWNER = "OWNER"  # Dono da conta (1 por tenant)
ROLE_TENANT_ADMIN = "TENANT_ADMIN"
ROLE_TENANT_AUDITOR = "TENANT_AUDITOR"
ROLE_CNPJ_MANAGER = "CNPJ_MANAGER"
ROLE_UNIT_MANAGER = "UNIT_MANAGER"
ROLE_SST_TECH = "SST_TECH"  # Técnico de SST
ROLE_VIEWER = "VIEWER"  # Somente leitura
ROLE_EMPLOYEE = "EMPLOYEE"

# Papéis que podem gerenciar usuários
USER_MANAGEMENT_ROLES = [ROLE_OWNER, ROLE_TENANT_ADMIN]

# Papéis que podem criar campanhas
CAMPAIGN_MANAGEMENT_ROLES = [ROLE_OWNER, ROLE_TENANT_ADMIN, ROLE_SST_TECH]

@dataclass(frozen=True)
class Scope:
    tenant_id: UUID
    cnpj_id: Optional[UUID] = None
    org_unit_id: Optional[UUID] = None

def require(condition: bool, detail: str = "Forbidden") -> None:
    if not condition:
        raise Forbidden(detail=detail)
