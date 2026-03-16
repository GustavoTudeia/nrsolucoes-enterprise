from __future__ import annotations

from fastapi import Depends, Header
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from typing import Optional, List
from uuid import UUID

from app.db.session import get_db
from app.core.security import decode_token
from app.core.errors import Unauthorized, Forbidden
from app.models.user import User, UserRoleScope, Role
from app.core.rbac import require

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")

def get_current_user(db: Session = Depends(get_db), token: str = Depends(oauth2_scheme)) -> User:
    try:
        payload = decode_token(token)
    except Exception:
        raise Unauthorized("Token inválido ou expirado")

    user_id = payload.get("uid")
    if not user_id:
        raise Unauthorized("Token sem usuário")
    user = db.query(User).filter(User.id == UUID(user_id)).first()
    if not user or not user.is_active:
        raise Unauthorized("Usuário inválido/inativo")
    return user

def get_request_meta(
    x_request_id: Optional[str] = Header(default=None),
    user_agent: Optional[str] = Header(default=None),
    x_forwarded_for: Optional[str] = Header(default=None),
):
    ip = None
    if x_forwarded_for:
        ip = x_forwarded_for.split(",")[0].strip()
    return {"request_id": x_request_id, "user_agent": user_agent, "ip": ip}

def require_platform_admin(user: User = Depends(get_current_user)) -> User:
    require(user.is_platform_admin, "Acesso restrito ao admin da plataforma")
    return user

def user_role_keys(user: User) -> List[str]:
    return [urs.role.key for urs in user.roles if urs.role is not None]

def require_any_role(required: List[str]):
    def _checker(user: User = Depends(get_current_user)) -> User:
        keys = user_role_keys(user)
        require(any(r in keys for r in required), "Permissão insuficiente")
        return user
    return _checker

def tenant_id_from_user(user: User = Depends(get_current_user)) -> UUID:
    if not user.tenant_id:
        raise Forbidden("Usuário sem tenant associado")
    return user.tenant_id


from app.models.employee import Employee

def get_current_employee(db: Session = Depends(get_db), token: str = Depends(oauth2_scheme)) -> Employee:
    # Reuse oauth2 bearer, but token must contain eid/typ=employee
    try:
        payload = decode_token(token)
    except Exception:
        raise Unauthorized("Token inválido ou expirado")
    if payload.get("typ") != "employee":
        raise Unauthorized("Token não é de colaborador")
    eid = payload.get("eid")
    tid = payload.get("tid")
    if not eid or not tid:
        raise Unauthorized("Token incompleto")
    emp = db.query(Employee).filter(Employee.id == UUID(eid), Employee.tenant_id == UUID(tid), Employee.is_active == True).first()
    if not emp:
        raise Unauthorized("Colaborador inválido/inativo")
    return emp


from app.services.entitlements import resolve_entitlements
from app.core.entitlements import Entitlements
from app.models.billing import TenantSubscription

def get_entitlements(db: Session = Depends(get_db), tenant_id: UUID = Depends(tenant_id_from_user)) -> Entitlements:
    return resolve_entitlements(db, tenant_id)

def require_active_subscription(db: Session = Depends(get_db), tenant_id: UUID = Depends(tenant_id_from_user)) -> None:
    sub = db.query(TenantSubscription).filter(TenantSubscription.tenant_id == tenant_id).first()
    if sub and sub.status in ("trial", "active"):
        return
    raise Forbidden("Assinatura inativa. Acesso restrito.")

def require_feature(feature_key: str):
    def _checker(ent: Entitlements = Depends(get_entitlements)) -> None:
        if not ent.feature_enabled(feature_key):
            raise Forbidden(f"Feature não habilitada no plano: {feature_key}")
    return _checker


def tenant_id_from_employee(emp: Employee = Depends(get_current_employee)) -> UUID:
    return emp.tenant_id

def get_entitlements_employee(db: Session = Depends(get_db), tenant_id: UUID = Depends(tenant_id_from_employee)) -> Entitlements:
    return resolve_entitlements(db, tenant_id)

def require_active_subscription_employee(db: Session = Depends(get_db), tenant_id: UUID = Depends(tenant_id_from_employee)) -> None:
    sub = db.query(TenantSubscription).filter(TenantSubscription.tenant_id == tenant_id).first()
    if sub and sub.status in ("trial", "active"):
        return
    raise Forbidden("Assinatura inativa. Acesso restrito.")

def require_feature_employee(feature_key: str):
    def _checker(ent: Entitlements = Depends(get_entitlements_employee)) -> None:
        if not ent.feature_enabled(feature_key):
            raise Forbidden(f"Feature não habilitada no plano: {feature_key}")
    return _checker


from app.models.legal import LegalAcceptance
from app.core.config import settings


def require_legal_acceptance(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> None:
    """Gate de conformidade (LGPD/Termos).

    Em produção/staging deve permanecer ativo. Em dev/test pode ser desligado via configuração
    para facilitar onboarding técnico e execução da suíte automatizada.
    """
    if user.is_platform_admin:
        return
    if not settings.LEGAL_ACCEPTANCE_REQUIRED or settings.ENV in {"dev", "test"}:
        return
    rec = (
        db.query(LegalAcceptance)
        .filter(
            LegalAcceptance.user_id == user.id,
            LegalAcceptance.terms_version == settings.LEGAL_TERMS_VERSION,
            LegalAcceptance.privacy_version == settings.LEGAL_PRIVACY_VERSION,
        )
        .first()
    )
    if not rec:
        raise Forbidden("É necessário aceitar Termos e Política de Privacidade para continuar.")
