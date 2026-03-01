from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import (
    require_any_role,
    tenant_id_from_user,
    get_request_meta,
    require_active_subscription,
)
from app.core.audit import make_audit_event
from app.core.errors import BadRequest, Conflict, Forbidden, NotFound
from app.core.rbac import ROLE_OWNER, ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER
from app.core.validators import only_digits, is_valid_cnpj
from app.db.session import get_db
from app.models.org import CNPJ, OrgUnit
from app.schemas.org import CNPJCreate, CNPJOut, CNPJUpdate, OrgUnitCreate, OrgUnitOut, OrgUnitUpdate
from app.services.plan_limits import enforce_limit
from app.services.rbac_scope import compute_allowed_scope, require_cnpj_access, require_unit_access

router = APIRouter(prefix="/org")


def _assert_tenant_admin(scope) -> None:
    if not scope.is_tenant_admin:
        raise Forbidden("Somente TENANT_ADMIN pode executar esta operação")


@router.post("/cnpjs", response_model=CNPJOut)
def create_cnpj(
    payload: CNPJCreate,
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    user=Depends(require_any_role([ROLE_OWNER, ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER])),
    tenant_id: UUID = Depends(tenant_id_from_user),
    meta: dict = Depends(get_request_meta),
):
    scope = compute_allowed_scope(user)
    _assert_tenant_admin(scope)

    cnpj_digits = only_digits(payload.cnpj_number)
    if not is_valid_cnpj(cnpj_digits):
        raise BadRequest("CNPJ inválido")

    current = db.query(CNPJ).filter(CNPJ.tenant_id == tenant_id, CNPJ.is_active == True).count()
    enforce_limit(db, tenant_id, "cnpj_max", current, 1)

    exists = db.query(CNPJ).filter(CNPJ.tenant_id == tenant_id, CNPJ.cnpj_number == cnpj_digits).first()
    if exists:
        raise BadRequest("CNPJ já cadastrado")

    cnpj = CNPJ(
        tenant_id=tenant_id,
        legal_name=payload.legal_name.strip(),
        trade_name=payload.trade_name.strip() if payload.trade_name else None,
        cnpj_number=cnpj_digits,
        is_active=True,
    )
    db.add(cnpj)
    db.flush()

    db.add(
        make_audit_event(
            tenant_id,
            user.id,
            "CREATE",
            "CNPJ",
            cnpj.id,
            None,
            {"cnpj": cnpj.cnpj_number, "legal_name": cnpj.legal_name},
            meta.get("ip"),
            meta.get("user_agent"),
            meta.get("request_id"),
        )
    )
    db.commit()
    db.refresh(cnpj)
    return CNPJOut(id=cnpj.id, legal_name=cnpj.legal_name, trade_name=cnpj.trade_name, cnpj_number=cnpj.cnpj_number, is_active=cnpj.is_active)


@router.get("/cnpjs", response_model=list[CNPJOut])
def list_cnpjs(
    include_inactive: bool = Query(default=False, description="Se true, inclui CNPJs inativos"),
    db: Session = Depends(get_db),
    user=Depends(require_any_role([ROLE_OWNER, ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER])),
    tenant_id: UUID = Depends(tenant_id_from_user),
):
    scope = compute_allowed_scope(user)
    q = db.query(CNPJ).filter(CNPJ.tenant_id == tenant_id)
    if not include_inactive:
        q = q.filter(CNPJ.is_active == True)

    if not scope.is_tenant_admin:
        if scope.cnpj_ids:
            q = q.filter(CNPJ.id.in_(list(scope.cnpj_ids)))
        else:
            return []

    rows = q.order_by(CNPJ.legal_name.asc()).all()
    return [
        CNPJOut(id=r.id, legal_name=r.legal_name, trade_name=r.trade_name, cnpj_number=r.cnpj_number, is_active=r.is_active)
        for r in rows
    ]


@router.get("/cnpjs/{cnpj_id}", response_model=CNPJOut)
def get_cnpj(
    cnpj_id: UUID,
    db: Session = Depends(get_db),
    user=Depends(require_any_role([ROLE_OWNER, ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER])),
    tenant_id: UUID = Depends(tenant_id_from_user),
):
    scope = compute_allowed_scope(user)
    require_cnpj_access(scope, cnpj_id)
    r = db.query(CNPJ).filter(CNPJ.id == cnpj_id, CNPJ.tenant_id == tenant_id).first()
    if not r:
        raise NotFound("CNPJ não encontrado")
    return CNPJOut(id=r.id, legal_name=r.legal_name, trade_name=r.trade_name, cnpj_number=r.cnpj_number, is_active=r.is_active)


@router.patch("/cnpjs/{cnpj_id}", response_model=CNPJOut)
def update_cnpj(
    cnpj_id: UUID,
    payload: CNPJUpdate,
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    user=Depends(require_any_role([ROLE_OWNER, ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER])),
    tenant_id: UUID = Depends(tenant_id_from_user),
    meta: dict = Depends(get_request_meta),
):
    scope = compute_allowed_scope(user)
    _assert_tenant_admin(scope)

    r = db.query(CNPJ).filter(CNPJ.id == cnpj_id, CNPJ.tenant_id == tenant_id).first()
    if not r:
        raise NotFound("CNPJ não encontrado")

    before = {"legal_name": r.legal_name, "trade_name": r.trade_name, "cnpj_number": r.cnpj_number, "is_active": r.is_active}

    if payload.cnpj_number is not None:
        cnpj_digits = only_digits(payload.cnpj_number)
        if not is_valid_cnpj(cnpj_digits):
            raise BadRequest("CNPJ inválido")
        other = db.query(CNPJ).filter(CNPJ.tenant_id == tenant_id, CNPJ.cnpj_number == cnpj_digits, CNPJ.id != r.id).first()
        if other:
            raise BadRequest("CNPJ já cadastrado")
        r.cnpj_number = cnpj_digits

    if payload.legal_name is not None:
        r.legal_name = payload.legal_name.strip()
    if payload.trade_name is not None:
        r.trade_name = payload.trade_name.strip() if payload.trade_name else None
    if payload.is_active is not None:
        # Enterprise rule: não permitir desativar CNPJ com unidades/setores ativos.
        if bool(payload.is_active) is False and r.is_active is True:
            has_active_units = db.query(OrgUnit.id).filter(
                OrgUnit.tenant_id == tenant_id,
                OrgUnit.cnpj_id == r.id,
                OrgUnit.is_active == True,
            ).first()
            if has_active_units:
                raise Conflict("Existem unidades/setores ativos vinculados a este CNPJ. Desative-os antes de desativar o CNPJ.")
        r.is_active = bool(payload.is_active)

    after = {"legal_name": r.legal_name, "trade_name": r.trade_name, "cnpj_number": r.cnpj_number, "is_active": r.is_active}

    db.add(
        make_audit_event(
            tenant_id,
            user.id,
            "UPDATE",
            "CNPJ",
            r.id,
            before,
            after,
            meta.get("ip"),
            meta.get("user_agent"),
            meta.get("request_id"),
        )
    )
    db.add(r)
    db.commit()
    db.refresh(r)
    return CNPJOut(id=r.id, legal_name=r.legal_name, trade_name=r.trade_name, cnpj_number=r.cnpj_number, is_active=r.is_active)


@router.post("/units", response_model=OrgUnitOut)
def create_unit(
    payload: OrgUnitCreate,
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    user=Depends(require_any_role([ROLE_OWNER, ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER])),
    tenant_id: UUID = Depends(tenant_id_from_user),
    meta: dict = Depends(get_request_meta),
):
    scope = compute_allowed_scope(user)
    require_cnpj_access(scope, payload.cnpj_id)

    cnpj = db.query(CNPJ).filter(CNPJ.id == payload.cnpj_id, CNPJ.tenant_id == tenant_id, CNPJ.is_active == True).first()
    if not cnpj:
        raise NotFound("CNPJ não encontrado/ativo")

    if payload.parent_unit_id is not None:
        parent = db.query(OrgUnit).filter(
            OrgUnit.id == payload.parent_unit_id,
            OrgUnit.tenant_id == tenant_id,
            OrgUnit.cnpj_id == payload.cnpj_id,
            OrgUnit.is_active == True,
        ).first()
        if not parent:
            raise BadRequest("parent_unit_id inválido (deve ser do mesmo CNPJ)")

    unit = OrgUnit(
        tenant_id=tenant_id,
        cnpj_id=payload.cnpj_id,
        name=payload.name.strip(),
        unit_type=(payload.unit_type or "unit").strip(),
        parent_unit_id=payload.parent_unit_id,
        is_active=True,
    )
    db.add(unit)
    db.flush()
    db.add(
        make_audit_event(
            tenant_id,
            user.id,
            "CREATE",
            "ORG_UNIT",
            unit.id,
            None,
            {"name": unit.name, "cnpj_id": str(unit.cnpj_id)},
            meta.get("ip"),
            meta.get("user_agent"),
            meta.get("request_id"),
        )
    )
    db.commit()
    db.refresh(unit)
    return OrgUnitOut(
        id=unit.id,
        cnpj_id=unit.cnpj_id,
        name=unit.name,
        unit_type=unit.unit_type,
        parent_unit_id=unit.parent_unit_id,
        is_active=unit.is_active,
    )


@router.get("/units", response_model=list[OrgUnitOut])
def list_units(
    cnpj_id: Optional[UUID] = Query(default=None),
    include_inactive: bool = Query(default=False),
    db: Session = Depends(get_db),
    user=Depends(require_any_role([ROLE_OWNER, ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER])),
    tenant_id: UUID = Depends(tenant_id_from_user),
):
    scope = compute_allowed_scope(user)
    q = db.query(OrgUnit).filter(OrgUnit.tenant_id == tenant_id)
    if not include_inactive:
        q = q.filter(OrgUnit.is_active == True)

    if not scope.is_tenant_admin:
        if scope.cnpj_ids:
            q = q.filter(OrgUnit.cnpj_id.in_(list(scope.cnpj_ids)))
        else:
            return []

    if cnpj_id:
        q = q.filter(OrgUnit.cnpj_id == cnpj_id)

    rows = q.order_by(OrgUnit.name.asc()).all()
    return [
        OrgUnitOut(
            id=r.id,
            cnpj_id=r.cnpj_id,
            name=r.name,
            unit_type=r.unit_type,
            parent_unit_id=r.parent_unit_id,
            is_active=r.is_active,
        )
        for r in rows
    ]


@router.get("/units/{unit_id}", response_model=OrgUnitOut)
def get_unit(
    unit_id: UUID,
    db: Session = Depends(get_db),
    user=Depends(require_any_role([ROLE_OWNER, ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER])),
    tenant_id: UUID = Depends(tenant_id_from_user),
):
    scope = compute_allowed_scope(user)
    require_unit_access(scope, unit_id)
    r = db.query(OrgUnit).filter(OrgUnit.id == unit_id, OrgUnit.tenant_id == tenant_id).first()
    if not r:
        raise NotFound("Unidade/Setor não encontrado")
    return OrgUnitOut(
        id=r.id,
        cnpj_id=r.cnpj_id,
        name=r.name,
        unit_type=r.unit_type,
        parent_unit_id=r.parent_unit_id,
        is_active=r.is_active,
    )


@router.patch("/units/{unit_id}", response_model=OrgUnitOut)
def update_unit(
    unit_id: UUID,
    payload: OrgUnitUpdate,
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    user=Depends(require_any_role([ROLE_OWNER, ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER])),
    tenant_id: UUID = Depends(tenant_id_from_user),
    meta: dict = Depends(get_request_meta),
):
    scope = compute_allowed_scope(user)
    require_unit_access(scope, unit_id)

    r = db.query(OrgUnit).filter(OrgUnit.id == unit_id, OrgUnit.tenant_id == tenant_id).first()
    if not r:
        raise NotFound("Unidade/Setor não encontrado")

    before = {"name": r.name, "unit_type": r.unit_type, "parent_unit_id": str(r.parent_unit_id) if r.parent_unit_id else None, "is_active": r.is_active}

    if payload.parent_unit_id is not None:
        if payload.parent_unit_id == r.id:
            raise BadRequest("parent_unit_id não pode referenciar a própria unidade")
        parent = db.query(OrgUnit).filter(
            OrgUnit.id == payload.parent_unit_id,
            OrgUnit.tenant_id == tenant_id,
            OrgUnit.cnpj_id == r.cnpj_id,
            OrgUnit.is_active == True,
        ).first()
        if not parent:
            raise BadRequest("parent_unit_id inválido (deve ser do mesmo CNPJ)")

    if payload.name is not None:
        r.name = payload.name.strip()
    if payload.unit_type is not None:
        r.unit_type = payload.unit_type.strip()
    if payload.parent_unit_id is not None:
        r.parent_unit_id = payload.parent_unit_id
    if payload.is_active is not None:
        r.is_active = bool(payload.is_active)

    after = {"name": r.name, "unit_type": r.unit_type, "parent_unit_id": str(r.parent_unit_id) if r.parent_unit_id else None, "is_active": r.is_active}

    db.add(
        make_audit_event(
            tenant_id,
            user.id,
            "UPDATE",
            "ORG_UNIT",
            r.id,
            before,
            after,
            meta.get("ip"),
            meta.get("user_agent"),
            meta.get("request_id"),
        )
    )
    db.add(r)
    db.commit()
    db.refresh(r)

    return OrgUnitOut(
        id=r.id,
        cnpj_id=r.cnpj_id,
        name=r.name,
        unit_type=r.unit_type,
        parent_unit_id=r.parent_unit_id,
        is_active=r.is_active,
    )
