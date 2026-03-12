from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import (
    require_active_subscription,
    require_any_role,
    tenant_id_from_user,
    get_request_meta,
)
from app.core.audit import make_audit_event
from app.core.config import settings
from app.core.errors import NotFound, BadRequest
from app.core.rbac import ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER
from app.db.session import get_db
from app.models.employee import Employee
from app.models.employee_auth import EmployeeMagicLinkToken
from app.schemas.employee import EmployeeCreate, EmployeeOut
from app.services.plan_limits import enforce_limit
from app.services.rbac_scope import compute_allowed_scope, require_unit_access

router = APIRouter(prefix="/employees")


def _sha256(x: str) -> str:
    return hashlib.sha256(x.encode("utf-8")).hexdigest()


def _emp_out(emp: Employee) -> EmployeeOut:
    eid = emp.id if emp.id is None else UUID(str(emp.id))
    return EmployeeOut(
        id=eid,
        identifier=emp.identifier,
        full_name=emp.full_name,
        cpf=emp.cpf,
        email=emp.email,
        phone=emp.phone,
        job_title=emp.job_title,
        admission_date=emp.admission_date,
        cnpj_id=emp.cnpj_id,
        org_unit_id=emp.org_unit_id,
        is_active=emp.is_active,
    )


class EmployeeUpdate(BaseModel):
    identifier: Optional[str] = None
    full_name: Optional[str] = None
    cpf: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    job_title: Optional[str] = None
    admission_date: Optional[datetime] = None
    cnpj_id: Optional[UUID] = None
    org_unit_id: Optional[UUID] = None
    is_active: Optional[bool] = None


class EmployeeImportRow(BaseModel):
    identifier: str
    full_name: Optional[str] = None
    cpf: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    job_title: Optional[str] = None
    admission_date: Optional[datetime] = None
    org_unit_id: Optional[UUID] = None


class EmployeeImportPayload(BaseModel):
    rows: List[EmployeeImportRow]
    skip_duplicates: bool = True


class EmployeeImportResult(BaseModel):
    total: int
    created: int
    skipped: int
    errors: List[dict]


@router.post("", response_model=EmployeeOut)
def create_employee(
    payload: EmployeeCreate,
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    user=Depends(
        require_any_role([ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER])
    ),
    tenant_id: UUID = Depends(tenant_id_from_user),
    meta: dict = Depends(get_request_meta),
):
    current = db.query(Employee).filter(Employee.tenant_id == tenant_id).count()
    enforce_limit(db, tenant_id, "employees_max", current, 1)

    scope = compute_allowed_scope(user)
    if payload.org_unit_id and not scope.is_tenant_admin:
        require_unit_access(scope, payload.org_unit_id)

    emp = Employee(
        tenant_id=tenant_id,
        identifier=payload.identifier,
        full_name=payload.full_name,
        cpf=payload.cpf,
        email=payload.email,
        phone=payload.phone,
        job_title=payload.job_title,
        admission_date=payload.admission_date,
        cnpj_id=payload.cnpj_id,
        org_unit_id=payload.org_unit_id,
        is_active=True,
    )
    db.add(emp)
    db.flush()
    db.add(
        make_audit_event(
            tenant_id,
            user.id,
            "CREATE",
            "EMPLOYEE",
            emp.id if emp.id is None else UUID(str(emp.id)),
            None,
            {"identifier": emp.identifier},
            meta.get("ip"),
            meta.get("user_agent"),
            meta.get("request_id"),
        )
    )
    db.commit()
    db.refresh(emp)
    return _emp_out(emp)


@router.get("", response_model=list[EmployeeOut])
def list_employees(
    include_inactive: bool = Query(
        default=False, description="Se true, inclui colaboradores inativos"
    ),
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    user=Depends(
        require_any_role([ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER])
    ),
    tenant_id: UUID = Depends(tenant_id_from_user),
):
    scope = compute_allowed_scope(user)
    q = db.query(Employee).filter(Employee.tenant_id == tenant_id)

    if not include_inactive:
        q = q.filter(Employee.is_active == True)

    if not scope.is_tenant_admin and scope.unit_ids:
        q = q.filter(Employee.org_unit_id.in_(list(scope.unit_ids)))
    rows = q.order_by(Employee.full_name.asc()).all()
    return [_emp_out(e) for e in rows]


@router.post("/{employee_id}/invite")
def invite_employee(
    employee_id: UUID,
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    user=Depends(
        require_any_role([ROLE_TENANT_ADMIN, ROLE_UNIT_MANAGER, ROLE_CNPJ_MANAGER])
    ),
    tenant_id: UUID = Depends(tenant_id_from_user),
    meta: dict = Depends(get_request_meta),
):
    emp = (
        db.query(Employee)
        .filter(Employee.id == employee_id, Employee.tenant_id == tenant_id)
        .first()
    )
    if not emp:
        raise NotFound("Colaborador não encontrado")

    scope = compute_allowed_scope(user)
    if emp.org_unit_id and not scope.is_tenant_admin:
        require_unit_access(scope, emp.org_unit_id)

    raw = secrets.token_urlsafe(32)
    rec = EmployeeMagicLinkToken(
        tenant_id=tenant_id,
        employee_id=emp.id,
        token_hash=_sha256(raw),
        expires_at=datetime.utcnow() + timedelta(days=7),
        consumed_at=None,
    )
    db.add(rec)
    db.add(
        make_audit_event(
            tenant_id,
            user.id,
            "EMPLOYEE_INVITE",
            "EMPLOYEE",
            emp.id if emp.id is None else UUID(str(emp.id)),
            None,
            {"employee_id": str(emp.id)},
            meta.get("ip"),
            meta.get("user_agent"),
            meta.get("request_id"),
        )
    )
    db.commit()

    # Em produção, envie por email/WhatsApp/SMS; aqui retornamos para facilitar QA
    return {
        "status": "ok",
        "employee_id": str(emp.id),
        "dev_magic_link_token": (raw if settings.DEV_RETURN_OTP else None),
    }


@router.get("/{employee_id}", response_model=EmployeeOut)
def get_employee(
    employee_id: UUID,
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    user=Depends(
        require_any_role([ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER])
    ),
    tenant_id: UUID = Depends(tenant_id_from_user),
):
    emp = (
        db.query(Employee)
        .filter(Employee.id == employee_id, Employee.tenant_id == tenant_id)
        .first()
    )
    if not emp:
        raise NotFound("Colaborador não encontrado")
    return _emp_out(emp)


@router.patch("/{employee_id}", response_model=EmployeeOut)
def update_employee(
    employee_id: UUID,
    payload: EmployeeUpdate,
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    user=Depends(
        require_any_role([ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER])
    ),
    tenant_id: UUID = Depends(tenant_id_from_user),
    meta: dict = Depends(get_request_meta),
):
    emp = (
        db.query(Employee)
        .filter(Employee.id == employee_id, Employee.tenant_id == tenant_id)
        .first()
    )
    if not emp:
        raise NotFound("Colaborador não encontrado")

    scope = compute_allowed_scope(user)
    if emp.org_unit_id and not scope.is_tenant_admin:
        require_unit_access(scope, emp.org_unit_id)

    before = {
        "identifier": emp.identifier,
        "full_name": emp.full_name,
        "org_unit_id": str(emp.org_unit_id) if emp.org_unit_id else None,
        "is_active": emp.is_active,
    }

    if payload.identifier is not None:
        # Verificar duplicidade
        existing = (
            db.query(Employee)
            .filter(
                Employee.tenant_id == tenant_id,
                Employee.identifier == payload.identifier,
                Employee.id != employee_id,
            )
            .first()
        )
        if existing:
            raise BadRequest("Já existe colaborador com este identificador")
        emp.identifier = payload.identifier
    if payload.full_name is not None:
        emp.full_name = payload.full_name
    if payload.cpf is not None:
        emp.cpf = payload.cpf.strip() if payload.cpf else None
    if payload.email is not None:
        emp.email = payload.email.strip() if payload.email else None
    if payload.phone is not None:
        emp.phone = payload.phone.strip() if payload.phone else None
    if payload.job_title is not None:
        emp.job_title = payload.job_title.strip() if payload.job_title else None
    if payload.admission_date is not None:
        emp.admission_date = payload.admission_date
    if payload.cnpj_id is not None:
        emp.cnpj_id = payload.cnpj_id
    if payload.org_unit_id is not None:
        if not scope.is_tenant_admin:
            require_unit_access(scope, payload.org_unit_id)
        emp.org_unit_id = payload.org_unit_id
    if payload.is_active is not None:
        emp.is_active = payload.is_active

    after = {
        "identifier": emp.identifier,
        "full_name": emp.full_name,
        "org_unit_id": str(emp.org_unit_id) if emp.org_unit_id else None,
        "is_active": emp.is_active,
    }

    db.add(emp)
    db.add(
        make_audit_event(
            tenant_id,
            user.id,
            "UPDATE",
            "EMPLOYEE",
            emp.id if emp.id is None else UUID(str(emp.id)),
            before,
            after,
            meta.get("ip"),
            meta.get("user_agent"),
            meta.get("request_id"),
        )
    )
    db.commit()
    db.refresh(emp)
    return _emp_out(emp)


@router.delete("/{employee_id}")
def delete_employee(
    employee_id: UUID,
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    user=Depends(
        require_any_role([ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER])
    ),
    tenant_id: UUID = Depends(tenant_id_from_user),
    meta: dict = Depends(get_request_meta),
):
    emp = (
        db.query(Employee)
        .filter(Employee.id == employee_id, Employee.tenant_id == tenant_id)
        .first()
    )
    if not emp:
        raise NotFound("Colaborador não encontrado")

    scope = compute_allowed_scope(user)
    if emp.org_unit_id and not scope.is_tenant_admin:
        require_unit_access(scope, emp.org_unit_id)

    before = {"identifier": emp.identifier, "full_name": emp.full_name}

    db.delete(emp)
    db.add(
        make_audit_event(
            tenant_id,
            user.id,
            "DELETE",
            "EMPLOYEE",
            employee_id,
            before,
            None,
            meta.get("ip"),
            meta.get("user_agent"),
            meta.get("request_id"),
        )
    )
    db.commit()
    return {"status": "ok"}


@router.post("/import", response_model=EmployeeImportResult)
def import_employees(
    payload: EmployeeImportPayload,
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    user=Depends(require_any_role([ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER])),
    tenant_id: UUID = Depends(tenant_id_from_user),
    meta: dict = Depends(get_request_meta),
):
    """Importação em lote de colaboradores com validação."""

    # Verificar limite do plano
    current = db.query(Employee).filter(Employee.tenant_id == tenant_id).count()
    enforce_limit(db, tenant_id, "employees_max", current, len(payload.rows))

    scope = compute_allowed_scope(user)

    # Buscar identificadores existentes para checar duplicatas
    existing_identifiers = set(
        r[0]
        for r in db.query(Employee.identifier)
        .filter(Employee.tenant_id == tenant_id)
        .all()
    )

    created = 0
    skipped = 0
    errors = []

    for idx, row in enumerate(payload.rows):
        row_num = idx + 1

        # Validação do identificador
        if not row.identifier or not row.identifier.strip():
            errors.append({"row": row_num, "error": "Identificador é obrigatório"})
            continue

        identifier = row.identifier.strip()

        # Checar duplicata
        if identifier in existing_identifiers:
            if payload.skip_duplicates:
                skipped += 1
                continue
            else:
                errors.append(
                    {
                        "row": row_num,
                        "identifier": identifier,
                        "error": "Identificador já existe",
                    }
                )
                continue

        # Validar org_unit_id se fornecido
        if row.org_unit_id and not scope.is_tenant_admin:
            try:
                require_unit_access(scope, row.org_unit_id)
            except Exception:
                errors.append(
                    {
                        "row": row_num,
                        "identifier": identifier,
                        "error": "Sem permissão para esta unidade",
                    }
                )
                continue

        # Criar colaborador
        emp = Employee(
            tenant_id=tenant_id,
            identifier=identifier,
            full_name=row.full_name.strip() if row.full_name else None,
            cpf=row.cpf.strip() if row.cpf else None,
            email=row.email.strip() if row.email else None,
            phone=row.phone.strip() if row.phone else None,
            job_title=row.job_title.strip() if row.job_title else None,
            admission_date=row.admission_date,
            org_unit_id=row.org_unit_id,
            is_active=True,
        )
        db.add(emp)
        existing_identifiers.add(identifier)
        created += 1

    if created > 0:
        db.add(
            make_audit_event(
                tenant_id,
                user.id,
                "IMPORT",
                "EMPLOYEE",
                None,
                None,
                {
                    "total": len(payload.rows),
                    "created": created,
                    "skipped": skipped,
                    "errors": len(errors),
                },
                meta.get("ip"),
                meta.get("user_agent"),
                meta.get("request_id"),
            )
        )
        db.commit()

    return EmployeeImportResult(
        total=len(payload.rows),
        created=created,
        skipped=skipped,
        errors=errors,
    )
