"""Autenticação do portal do colaborador."""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import BadRequest, Forbidden
from app.core.rate_limit import enforce_rate_limit
from app.core.security import create_access_token
from app.db.session import get_db
from app.models.employee import Employee
from app.models.employee_auth import EmployeeMagicLinkToken, EmployeeOtpToken
from app.services.email_service import email_service

router = APIRouter(prefix="/employee/auth", tags=["employee-auth"])


class OtpRequestPayload(BaseModel):
    tenant_id: UUID
    identifier: str = Field(..., description="CPF, email ou matrícula do colaborador")


class OtpVerifyPayload(BaseModel):
    tenant_id: UUID
    identifier: str
    code: str = Field(..., min_length=6, max_length=6)


class MagicLinkRequestPayload(BaseModel):
    tenant_id: UUID
    identifier: str


class EmployeeLoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    employee: dict



def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()



def _generate_otp() -> str:
    return f"{secrets.randbelow(1000000):06d}"



def _generate_magic_token() -> str:
    return secrets.token_urlsafe(32)



def _find_employee(db: Session, tenant_id: UUID, identifier: str) -> Employee | None:
    return (
        db.query(Employee)
        .filter(Employee.tenant_id == tenant_id, Employee.is_active == True)
        .filter((Employee.identifier == identifier) | (Employee.email == identifier) | (Employee.cpf == identifier))
        .first()
    )



def _create_employee_token(employee: Employee) -> tuple[str, int]:
    expires_minutes = 1440
    access_token = create_access_token(
        subject=str(employee.id),
        extra={"tid": str(employee.tenant_id), "typ": "employee", "eid": str(employee.id)},
        expires_minutes=expires_minutes,
    )
    return access_token, expires_minutes * 60


@router.post("/otp/start")
def request_otp_start(payload: OtpRequestPayload, db: Session = Depends(get_db)):
    return request_otp(payload, db)


@router.post("/otp/request")
def request_otp(payload: OtpRequestPayload, db: Session = Depends(get_db)):
    enforce_rate_limit(
        scope="employee-auth:otp-request",
        identifier=f"{payload.tenant_id}:{payload.identifier}",
        limit=settings.AUTH_RATE_LIMIT_OTP_REQUEST,
        window_seconds=settings.AUTH_RATE_LIMIT_LOGIN_WINDOW_SECONDS,
    )
    employee = _find_employee(db, payload.tenant_id, payload.identifier)
    if not employee:
        return {"message": "Se o identificador estiver cadastrado, você receberá um código."}
    if not employee.portal_access_enabled and settings.ENV not in {"dev", "test"}:
        return {"message": "Se o identificador estiver cadastrado, você receberá um código."}
    if employee.is_portal_locked:
        return {"message": "Acesso temporariamente bloqueado. Tente novamente mais tarde."}

    db.query(EmployeeOtpToken).filter(EmployeeOtpToken.employee_id == employee.id, EmployeeOtpToken.consumed_at == None).update({"consumed_at": datetime.utcnow()})
    otp_code = _generate_otp()
    otp_token = EmployeeOtpToken(
        tenant_id=employee.tenant_id,
        employee_id=employee.id,
        employee_identifier=employee.identifier,
        code_hash=_hash_token(otp_code),
        expires_at=datetime.utcnow() + timedelta(minutes=10),
        attempts=0,
    )
    db.add(otp_token)
    db.commit()

    dest_email = employee.email or (employee.identifier if "@" in (employee.identifier or "") else None)
    if dest_email:
        email_service.queue_otp_code(to_email=dest_email, code=otp_code, user_name=employee.full_name or employee.identifier)

    response = {"message": "Código enviado com sucesso.", "expires_in_seconds": 600}
    if settings.DEV_RETURN_OTP or settings.ENV in {"dev", "test"}:
        response["_dev_code"] = otp_code
        response["dev_code"] = otp_code
    return response


@router.post("/otp/verify", response_model=EmployeeLoginResponse)
def verify_otp(payload: OtpVerifyPayload, db: Session = Depends(get_db)):
    enforce_rate_limit(
        scope="employee-auth:otp-verify",
        identifier=f"{payload.tenant_id}:{payload.identifier}",
        limit=settings.AUTH_RATE_LIMIT_OTP_VERIFY,
        window_seconds=settings.AUTH_RATE_LIMIT_LOGIN_WINDOW_SECONDS,
    )
    employee = _find_employee(db, payload.tenant_id, payload.identifier)
    if not employee:
        raise BadRequest("Código inválido ou expirado")
    if employee.is_portal_locked:
        raise Forbidden("Acesso temporariamente bloqueado")

    otp_token = (
        db.query(EmployeeOtpToken)
        .filter(EmployeeOtpToken.employee_id == employee.id, EmployeeOtpToken.consumed_at == None, EmployeeOtpToken.expires_at > datetime.utcnow())
        .order_by(EmployeeOtpToken.created_at.desc())
        .first()
    )
    if not otp_token:
        employee.increment_portal_failed_login()
        db.add(employee)
        db.commit()
        raise BadRequest("Código inválido ou expirado")
    if otp_token.attempts >= 3:
        otp_token.consumed_at = datetime.utcnow()
        employee.increment_portal_failed_login()
        db.add(otp_token)
        db.add(employee)
        db.commit()
        raise BadRequest("Código expirado por excesso de tentativas")
    if _hash_token(payload.code) != otp_token.code_hash:
        otp_token.attempts += 1
        db.add(otp_token)
        db.commit()
        raise BadRequest("Código inválido")

    otp_token.consumed_at = datetime.utcnow()
    employee.record_portal_login()
    db.add(otp_token)
    db.add(employee)
    db.commit()
    access_token, expires_in = _create_employee_token(employee)
    return EmployeeLoginResponse(
        access_token=access_token,
        expires_in=expires_in,
        employee={"id": str(employee.id), "identifier": employee.identifier, "full_name": employee.full_name, "email": employee.email},
    )


@router.post("/magic-link/request")
def request_magic_link(payload: MagicLinkRequestPayload, db: Session = Depends(get_db)):
    enforce_rate_limit(
        scope="employee-auth:magic-link",
        identifier=f"{payload.tenant_id}:{payload.identifier}",
        limit=settings.AUTH_RATE_LIMIT_MAGIC_LINK,
        window_seconds=settings.AUTH_RATE_LIMIT_PASSWORD_RESET_WINDOW_SECONDS,
    )
    employee = _find_employee(db, payload.tenant_id, payload.identifier)
    if not employee:
        return {"message": "Se o identificador estiver cadastrado, você receberá um link."}
    if not employee.portal_access_enabled:
        return {"message": "Se o identificador estiver cadastrado, você receberá um link."}

    db.query(EmployeeMagicLinkToken).filter(EmployeeMagicLinkToken.employee_id == employee.id, EmployeeMagicLinkToken.consumed_at == None).update({"consumed_at": datetime.utcnow()})
    magic_token = _generate_magic_token()
    link_token = EmployeeMagicLinkToken(
        tenant_id=employee.tenant_id,
        employee_id=employee.id,
        token_hash=_hash_token(magic_token),
        expires_at=datetime.utcnow() + timedelta(hours=24),
    )
    db.add(link_token)
    db.commit()

    magic_link = f"{settings.FRONTEND_URL}/employee/magic/{magic_token}"
    if employee.email:
        email_service.queue_magic_link(to_email=employee.email, magic_url=magic_link, user_name=employee.full_name or employee.identifier)
    return {"message": "Link enviado com sucesso.", "expires_in_seconds": 86400, "_dev_token": magic_token}


@router.post("/magic-link/verify", response_model=EmployeeLoginResponse)
def verify_magic_link(token: str = Query(..., description="Token do magic link"), db: Session = Depends(get_db)):
    token_hash = _hash_token(token)
    link_token = (
        db.query(EmployeeMagicLinkToken)
        .filter(EmployeeMagicLinkToken.token_hash == token_hash, EmployeeMagicLinkToken.consumed_at == None, EmployeeMagicLinkToken.expires_at > datetime.utcnow())
        .first()
    )
    if not link_token:
        raise BadRequest("Link inválido ou expirado")
    employee = db.query(Employee).filter(Employee.id == link_token.employee_id, Employee.is_active == True).first()
    if not employee:
        raise BadRequest("Colaborador inválido")
    link_token.consumed_at = datetime.utcnow()
    employee.record_portal_login()
    db.add(link_token)
    db.add(employee)
    db.commit()
    access_token, expires_in = _create_employee_token(employee)
    return EmployeeLoginResponse(
        access_token=access_token,
        expires_in=expires_in,
        employee={"id": str(employee.id), "identifier": employee.identifier, "full_name": employee.full_name, "email": employee.email},
    )
