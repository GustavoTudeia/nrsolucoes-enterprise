"""API de Autenticação do Portal do Colaborador.

Implementa:
- Login via OTP (SMS/Email)
- Login via Magic Link
- Gestão de sessão do colaborador
"""

from __future__ import annotations

import secrets
import hashlib
from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Body
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.errors import NotFound, BadRequest, Forbidden
from app.core.security import create_access_token
from app.db.session import get_db
from app.models.employee import Employee
from app.models.employee_auth import EmployeeOtpToken, EmployeeMagicLinkToken

router = APIRouter(prefix="/employee/auth", tags=["employee-auth"])


# ==================== Schemas ====================


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


# ==================== Helpers ====================


def _hash_token(token: str) -> str:
    """Hash de token usando SHA256."""
    return hashlib.sha256(token.encode()).hexdigest()


def _generate_otp() -> str:
    """Gera código OTP de 6 dígitos."""
    return f"{secrets.randbelow(1000000):06d}"


def _generate_magic_token() -> str:
    """Gera token para magic link."""
    return secrets.token_urlsafe(32)


def _find_employee(db: Session, tenant_id: UUID, identifier: str) -> Employee:
    """Busca colaborador por identifier, email ou CPF."""
    employee = (
        db.query(Employee)
        .filter(
            Employee.tenant_id == tenant_id,
            Employee.is_active == True,
        )
        .filter(
            (Employee.identifier == identifier)
            | (Employee.email == identifier)
            | (Employee.cpf == identifier)
        )
        .first()
    )
    return employee


def _create_employee_token(employee: Employee) -> tuple[str, int]:
    """Cria JWT para colaborador."""
    expires_minutes = 1440  # 24 horas
    extra = {
        "tid": str(employee.tenant_id),
        "typ": "employee",
        "eid": str(employee.id),
    }
    access_token = create_access_token(
        subject=str(employee.id), extra=extra, expires_minutes=expires_minutes
    )
    return access_token, expires_minutes * 60


# ==================== OTP Endpoints ====================


@router.post("/otp/request")
def request_otp(
    payload: OtpRequestPayload,
    db: Session = Depends(get_db),
):
    """Solicita envio de código OTP para o colaborador.

    O código é enviado por email ou SMS dependendo das configurações.
    Por segurança, sempre retorna sucesso mesmo se colaborador não existir.
    """
    employee = _find_employee(db, payload.tenant_id, payload.identifier)

    if not employee:
        # Por segurança, não revelamos se o colaborador existe
        return {
            "message": "Se o identificador estiver cadastrado, você receberá um código."
        }

    if not employee.portal_access_enabled:
        return {
            "message": "Se o identificador estiver cadastrado, você receberá um código."
        }

    if employee.is_portal_locked:
        return {
            "message": "Acesso temporariamente bloqueado. Tente novamente mais tarde."
        }

    # Invalidar OTPs anteriores
    db.query(EmployeeOtpToken).filter(
        EmployeeOtpToken.employee_id == employee.id,
        EmployeeOtpToken.consumed_at == None,
    ).update({"consumed_at": datetime.utcnow()})

    # Gerar novo OTP
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

    # TODO: Enviar OTP por email/SMS
    # Por enquanto, em desenvolvimento, logamos o código
    print(f"[DEV] OTP para {employee.identifier}: {otp_code}")

    # Em produção, integrar com serviço de email/SMS
    # send_otp_email(employee.email, otp_code)
    # send_otp_sms(employee.phone, otp_code)

    return {
        "message": "Código enviado com sucesso.",
        "expires_in_seconds": 600,
        # Em desenvolvimento, retornamos o código (REMOVER EM PRODUÇÃO!)
        "_dev_code": otp_code,
    }


@router.post("/otp/verify", response_model=EmployeeLoginResponse)
def verify_otp(
    payload: OtpVerifyPayload,
    db: Session = Depends(get_db),
):
    """Verifica código OTP e retorna token de acesso."""
    employee = _find_employee(db, payload.tenant_id, payload.identifier)

    if not employee:
        raise BadRequest("Código inválido ou expirado")

    if employee.is_portal_locked:
        raise Forbidden("Acesso temporariamente bloqueado")

    # Buscar OTP válido
    otp_token = (
        db.query(EmployeeOtpToken)
        .filter(
            EmployeeOtpToken.employee_id == employee.id,
            EmployeeOtpToken.consumed_at == None,
            EmployeeOtpToken.expires_at > datetime.utcnow(),
        )
        .order_by(EmployeeOtpToken.created_at.desc())
        .first()
    )

    if not otp_token:
        employee.increment_portal_failed_login()
        db.commit()
        raise BadRequest("Código inválido ou expirado")

    # Verificar tentativas
    if otp_token.attempts >= 3:
        otp_token.consumed_at = datetime.utcnow()
        employee.increment_portal_failed_login()
        db.commit()
        raise BadRequest("Código expirado por excesso de tentativas")

    # Verificar código
    if _hash_token(payload.code) != otp_token.code_hash:
        otp_token.attempts += 1
        db.commit()
        raise BadRequest("Código inválido")

    # Código válido - consumir token
    otp_token.consumed_at = datetime.utcnow()
    employee.record_portal_login()
    db.commit()

    # Gerar JWT
    access_token, expires_in = _create_employee_token(employee)

    return EmployeeLoginResponse(
        access_token=access_token,
        expires_in=expires_in,
        employee={
            "id": str(employee.id),
            "identifier": employee.identifier,
            "full_name": employee.full_name,
            "email": employee.email,
        },
    )


# ==================== Magic Link Endpoints ====================


@router.post("/magic-link/request")
def request_magic_link(
    payload: MagicLinkRequestPayload,
    db: Session = Depends(get_db),
):
    """Solicita envio de magic link para o colaborador."""
    employee = _find_employee(db, payload.tenant_id, payload.identifier)

    if not employee:
        return {
            "message": "Se o identificador estiver cadastrado, você receberá um link."
        }

    if not employee.portal_access_enabled:
        return {
            "message": "Se o identificador estiver cadastrado, você receberá um link."
        }

    # Invalidar links anteriores
    db.query(EmployeeMagicLinkToken).filter(
        EmployeeMagicLinkToken.employee_id == employee.id,
        EmployeeMagicLinkToken.consumed_at == None,
    ).update({"consumed_at": datetime.utcnow()})

    # Gerar novo token
    magic_token = _generate_magic_token()
    link_token = EmployeeMagicLinkToken(
        tenant_id=employee.tenant_id,
        employee_id=employee.id,
        token_hash=_hash_token(magic_token),
        expires_at=datetime.utcnow() + timedelta(hours=24),
    )
    db.add(link_token)
    db.commit()

    # TODO: Enviar email com link
    magic_link = f"https://app.example.com/employee/magic/{magic_token}"
    print(f"[DEV] Magic Link para {employee.identifier}: {magic_link}")

    return {
        "message": "Link enviado com sucesso.",
        "expires_in_seconds": 86400,
        # Em desenvolvimento (REMOVER EM PRODUÇÃO!)
        "_dev_token": magic_token,
    }


@router.post("/magic-link/verify", response_model=EmployeeLoginResponse)
def verify_magic_link(
    token: str = Query(..., description="Token do magic link"),
    db: Session = Depends(get_db),
):
    """Verifica magic link e retorna token de acesso."""
    token_hash = _hash_token(token)

    link_token = (
        db.query(EmployeeMagicLinkToken)
        .filter(
            EmployeeMagicLinkToken.token_hash == token_hash,
            EmployeeMagicLinkToken.consumed_at == None,
            EmployeeMagicLinkToken.expires_at > datetime.utcnow(),
        )
        .first()
    )

    if not link_token:
        raise BadRequest("Link inválido ou expirado")

    employee = db.query(Employee).filter(Employee.id == link_token.employee_id).first()
    if not employee or not employee.is_active:
        raise BadRequest("Colaborador não encontrado")

    # Consumir token
    link_token.consumed_at = datetime.utcnow()
    employee.record_portal_login()
    db.commit()

    # Gerar JWT
    access_token, expires_in = _create_employee_token(employee)

    return EmployeeLoginResponse(
        access_token=access_token,
        expires_in=expires_in,
        employee={
            "id": str(employee.id),
            "identifier": employee.identifier,
            "full_name": employee.full_name,
            "email": employee.email,
        },
    )


# ==================== Dev/Test Endpoint ====================


@router.post("/dev-login")
def dev_login(
    tenant_id: UUID = Query(...),
    identifier: str = Query(...),
    db: Session = Depends(get_db),
):
    """Login direto para desenvolvimento (DESABILITAR EM PRODUÇÃO!).

    Permite login sem OTP para facilitar testes.
    """
    import os

    if os.getenv("ENVIRONMENT", "development") == "production":
        raise Forbidden("Endpoint desabilitado em produção")

    employee = _find_employee(db, tenant_id, identifier)

    if not employee:
        raise NotFound("Colaborador não encontrado")

    employee.record_portal_login()
    db.commit()

    access_token, expires_in = _create_employee_token(employee)

    return EmployeeLoginResponse(
        access_token=access_token,
        expires_in=expires_in,
        employee={
            "id": str(employee.id),
            "identifier": employee.identifier,
            "full_name": employee.full_name,
            "email": employee.email,
        },
    )
