from __future__ import annotations

from dataclasses import dataclass
from typing import Set
from uuid import UUID

from app.models.user import User
from app.core.errors import Forbidden

@dataclass(frozen=True)
class AllowedScope:
    tenant_id: UUID
    cnpj_ids: Set[UUID]
    unit_ids: Set[UUID]
    is_tenant_admin: bool

def compute_allowed_scope(user: User) -> AllowedScope:
    if not user.tenant_id:
        raise Forbidden("Usuário sem tenant associado")
    tenant_id = user.tenant_id
    cnpj_ids: Set[UUID] = set()
    unit_ids: Set[UUID] = set()
    is_tenant_admin = False

    for urs in user.roles:
        if not urs.role:
            continue
        if urs.role.key in ("TENANT_ADMIN", "OWNER"):
            is_tenant_admin = True
        if urs.cnpj_id:
            cnpj_ids.add(urs.cnpj_id)
        if urs.org_unit_id:
            unit_ids.add(urs.org_unit_id)

    return AllowedScope(tenant_id=tenant_id, cnpj_ids=cnpj_ids, unit_ids=unit_ids, is_tenant_admin=is_tenant_admin)

def require_cnpj_access(scope: AllowedScope, cnpj_id: UUID) -> None:
    if scope.is_tenant_admin:
        return
    if cnpj_id in scope.cnpj_ids:
        return
    raise Forbidden("Sem acesso ao CNPJ")

def require_unit_access(scope: AllowedScope, unit_id: UUID) -> None:
    if scope.is_tenant_admin:
        return
    if unit_id in scope.unit_ids:
        return
    raise Forbidden("Sem acesso à unidade/setor")
