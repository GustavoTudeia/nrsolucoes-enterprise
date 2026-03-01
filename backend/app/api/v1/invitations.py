"""API de Convites de Usuários."""

from __future__ import annotations

from datetime import datetime
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
from app.core.config import settings
from app.core.errors import NotFound, BadRequest, Conflict
from app.core.security import hash_password, create_access_token
from app.core.rbac import ROLE_TENANT_ADMIN, ROLE_OWNER
from app.db.session import get_db
from app.models.user import User, Role, UserRoleScope
from app.models.user_invitation import UserInvitation
from app.models.tenant import Tenant
from app.models.org import CNPJ, OrgUnit
from app.models.auth_audit_log import AuthAuditLog
from app.services.email_service import email_service
from app.schemas.invitation import (
    InvitationCreate,
    InvitationOut,
    InvitationListOut,
    InvitationValidateOut,
    InvitationPreview,
    InvitationAcceptNewUser,
    InvitationAcceptExistingUser,
    InvitationAcceptResponse,
    InvitationResendOut,
    InvitationCancelOut,
)
from app.schemas.common import Page

router = APIRouter(prefix="/invitations", tags=["invitations"])


def _invitation_out(inv: UserInvitation, db: Session) -> InvitationOut:
    """Converte modelo para schema de saída."""
    role = db.query(Role).filter(Role.key == inv.role_key).first()
    invited_by = db.query(User).filter(User.id == inv.invited_by_user_id).first()

    cnpj_name = None
    org_unit_name = None
    if inv.cnpj_id:
        cnpj = db.query(CNPJ).filter(CNPJ.id == inv.cnpj_id).first()
        cnpj_name = cnpj.trade_name if cnpj else None
    if inv.org_unit_id:
        org_unit = db.query(OrgUnit).filter(OrgUnit.id == inv.org_unit_id).first()
        org_unit_name = org_unit.name if org_unit else None

    return InvitationOut(
        id=inv.id,
        tenant_id=inv.tenant_id,
        email=inv.email,
        full_name=inv.full_name,
        role_key=inv.role_key,
        role_name=role.name if role else inv.role_key,
        cnpj_id=inv.cnpj_id,
        cnpj_name=cnpj_name,
        org_unit_id=inv.org_unit_id,
        org_unit_name=org_unit_name,
        status=inv.status,
        invited_by_name=invited_by.full_name if invited_by else None,
        invited_by_email=invited_by.email if invited_by else None,
        expires_at=inv.expires_at,
        accepted_at=inv.accepted_at,
        created_at=inv.created_at,
    )


# ==============================================================================
# LISTAR CONVITES
# ==============================================================================


@router.get("", response_model=Page[InvitationOut])
def list_invitations(
    status: Optional[str] = Query(
        None, pattern="^(pending|accepted|expired|cancelled)$"
    ),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    user=Depends(require_any_role([ROLE_OWNER, ROLE_TENANT_ADMIN])),
    tenant_id: UUID = Depends(tenant_id_from_user),
):
    """Lista convites do tenant."""
    base = db.query(UserInvitation).filter(UserInvitation.tenant_id == tenant_id)

    if status:
        base = base.filter(UserInvitation.status == status)

    total = base.count()
    rows = (
        base.order_by(UserInvitation.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    # Atualiza status de expirados
    for inv in rows:
        if inv.status == "pending" and inv.is_expired:
            inv.status = "expired"
    db.commit()

    items = [_invitation_out(inv, db) for inv in rows]
    return Page(items=items, total=total, limit=limit, offset=offset)


# ==============================================================================
# CRIAR CONVITE
# ==============================================================================


@router.post("", response_model=InvitationOut, status_code=201)
def create_invitation(
    payload: InvitationCreate,
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    user=Depends(require_any_role([ROLE_OWNER, ROLE_TENANT_ADMIN])),
    tenant_id: UUID = Depends(tenant_id_from_user),
    meta: dict = Depends(get_request_meta),
):
    """Cria convite para novo usuário."""
    email = payload.email.lower().strip()

    # Verifica se já existe convite pendente para este email
    existing = (
        db.query(UserInvitation)
        .filter(
            UserInvitation.tenant_id == tenant_id,
            UserInvitation.email == email,
            UserInvitation.status == "pending",
        )
        .first()
    )

    if existing:
        raise Conflict("Já existe um convite pendente para este email")

    # Verifica se usuário já existe no tenant
    existing_user = (
        db.query(User)
        .join(UserRoleScope, User.id == UserRoleScope.user_id)
        .filter(
            User.email == email,
            UserRoleScope.tenant_id == tenant_id,
            UserRoleScope.is_active == True,
        )
        .first()
    )

    if existing_user:
        raise Conflict("Este email já tem acesso a esta empresa")

    # Verifica se papel existe
    role = db.query(Role).filter(Role.key == payload.role_key).first()
    if not role:
        raise BadRequest(f"Papel '{payload.role_key}' não encontrado")

    # Não pode convidar como OWNER
    if payload.role_key == "OWNER":
        raise BadRequest("Não é possível convidar como Proprietário")

    # Valida CNPJ e OrgUnit se informados
    if payload.cnpj_id:
        cnpj = (
            db.query(CNPJ)
            .filter(CNPJ.id == payload.cnpj_id, CNPJ.tenant_id == tenant_id)
            .first()
        )
        if not cnpj:
            raise BadRequest("CNPJ não encontrado")

    if payload.org_unit_id:
        org_unit = (
            db.query(OrgUnit)
            .filter(OrgUnit.id == payload.org_unit_id, OrgUnit.tenant_id == tenant_id)
            .first()
        )
        if not org_unit:
            raise BadRequest("Unidade organizacional não encontrada")

    # Cria convite
    invitation = UserInvitation(
        tenant_id=tenant_id,
        email=email,
        full_name=payload.full_name,
        role_key=payload.role_key,
        cnpj_id=payload.cnpj_id,
        org_unit_id=payload.org_unit_id,
        token=UserInvitation.create_token(),
        invited_by_user_id=user.id,
        expires_at=UserInvitation.default_expires_at(payload.expires_days),
        status="pending",
    )
    db.add(invitation)

    # Auditoria
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    db.add(
        AuthAuditLog.log_invitation_sent(email, tenant_id, user.id, payload.role_key)
    )
    db.add(
        make_audit_event(
            tenant_id=tenant_id,
            actor_user_id=user.id,
            action="INVITATION_SENT",
            entity_type="USER_INVITATION",
            entity_id=invitation.id,
            before=None,
            after={"email": email, "role": payload.role_key},
            ip=meta.get("ip"),
            user_agent=meta.get("user_agent"),
            request_id=meta.get("request_id"),
        )
    )

    db.commit()

    # Enviar email de convite
    invite_url = f"{settings.FRONTEND_URL}/convite/{invitation.token}"
    email_service.send_invitation(
        to_email=email,
        invite_url=invite_url,
        tenant_name=tenant.name if tenant else "Empresa",
        role_name=role.name,
        invited_by=user.full_name or user.email or "Administrador",
    )

    return _invitation_out(invitation, db)


# ==============================================================================
# VALIDAR TOKEN DE CONVITE (público)
# ==============================================================================


@router.get("/validate/{token}", response_model=InvitationValidateOut)
def validate_invitation(
    token: str,
    db: Session = Depends(get_db),
):
    """Valida token de convite e retorna informações."""
    invitation = db.query(UserInvitation).filter(UserInvitation.token == token).first()

    if not invitation:
        return InvitationValidateOut(valid=False, message="Convite não encontrado")

    if invitation.status != "pending":
        return InvitationValidateOut(
            valid=False, message=f"Convite já foi {invitation.status}"
        )

    if invitation.is_expired:
        invitation.status = "expired"
        db.commit()
        return InvitationValidateOut(valid=False, message="Convite expirado")

    # Busca informações
    tenant = db.query(Tenant).filter(Tenant.id == invitation.tenant_id).first()
    role = db.query(Role).filter(Role.key == invitation.role_key).first()
    invited_by = db.query(User).filter(User.id == invitation.invited_by_user_id).first()

    cnpj_name = None
    org_unit_name = None
    if invitation.cnpj_id:
        cnpj = db.query(CNPJ).filter(CNPJ.id == invitation.cnpj_id).first()
        cnpj_name = cnpj.trade_name if cnpj else None
    if invitation.org_unit_id:
        org_unit = (
            db.query(OrgUnit).filter(OrgUnit.id == invitation.org_unit_id).first()
        )
        org_unit_name = org_unit.name if org_unit else None

    # Verifica se email já existe no sistema
    existing_user = db.query(User).filter(User.email == invitation.email).first()

    return InvitationValidateOut(
        valid=True,
        user_exists=existing_user is not None,
        invitation=InvitationPreview(
            email=invitation.email,
            full_name=invitation.full_name,
            role_name=role.name if role else invitation.role_key,
            tenant_name=tenant.name if tenant else "Empresa",
            cnpj_name=cnpj_name,
            org_unit_name=org_unit_name,
            invited_by_name=invited_by.full_name if invited_by else None,
            expires_at=invitation.expires_at,
        ),
    )


# ==============================================================================
# ACEITAR CONVITE - NOVO USUÁRIO (público)
# ==============================================================================


@router.post("/accept/{token}", response_model=InvitationAcceptResponse)
def accept_invitation_new_user(
    token: str,
    payload: InvitationAcceptNewUser,
    db: Session = Depends(get_db),
    meta: dict = Depends(get_request_meta),
):
    """Aceita convite criando novo usuário."""
    invitation = db.query(UserInvitation).filter(UserInvitation.token == token).first()

    if not invitation:
        raise NotFound("Convite não encontrado")

    if invitation.status != "pending":
        raise BadRequest(f"Convite já foi {invitation.status}")

    if invitation.is_expired:
        invitation.status = "expired"
        db.commit()
        raise BadRequest("Convite expirado")

    # Verifica se email já existe
    existing_user = db.query(User).filter(User.email == invitation.email).first()
    if existing_user:
        raise Conflict(
            "Este email já está cadastrado. Use a opção de aceitar como usuário existente."
        )

    # Busca role
    role = db.query(Role).filter(Role.key == invitation.role_key).first()
    if not role:
        raise BadRequest("Papel inválido")

    # Cria usuário
    new_user = User(
        tenant_id=invitation.tenant_id,
        email=invitation.email,
        cpf=payload.cpf,
        full_name=payload.full_name,
        phone=payload.phone,
        password_hash=hash_password(payload.password),
        is_active=True,
        must_change_password=False,
        invited_by_user_id=invitation.invited_by_user_id,
        invited_at=datetime.utcnow(),
    )
    db.add(new_user)
    db.flush()

    # Atribui papel
    role_scope = UserRoleScope(
        user_id=new_user.id,
        role_id=role.id,
        tenant_id=invitation.tenant_id,
        cnpj_id=invitation.cnpj_id,
        org_unit_id=invitation.org_unit_id,
        granted_by_user_id=invitation.invited_by_user_id,
        granted_at=datetime.utcnow(),
        is_active=True,
    )
    db.add(role_scope)

    # Atualiza convite
    invitation.status = "accepted"
    invitation.accepted_at = datetime.utcnow()
    invitation.created_user_id = new_user.id

    # Auditoria
    db.add(
        AuthAuditLog.log_invitation_accepted(
            invitation.email,
            new_user.id,
            invitation.tenant_id,
            ip=meta.get("ip"),
            user_agent=meta.get("user_agent"),
        )
    )

    db.commit()

    # Gera token de acesso
    access_token = create_access_token(
        subject=new_user.email,
        extra={"uid": str(new_user.id), "tid": str(invitation.tenant_id), "pla": False},
    )

    import secrets

    refresh_token = secrets.token_urlsafe(48)

    return InvitationAcceptResponse(
        message="Conta criada com sucesso!",
        access_token=access_token,
        refresh_token=refresh_token,
        user_id=new_user.id,
        tenant_id=invitation.tenant_id,
    )


# ==============================================================================
# ACEITAR CONVITE - USUÁRIO EXISTENTE (público)
# ==============================================================================


@router.post("/accept-existing/{token}", response_model=InvitationAcceptResponse)
def accept_invitation_existing_user(
    token: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_any_role([])),  # Qualquer usuário logado
    meta: dict = Depends(get_request_meta),
):
    """Aceita convite para usuário já existente (adiciona acesso a nova empresa)."""
    invitation = db.query(UserInvitation).filter(UserInvitation.token == token).first()

    if not invitation:
        raise NotFound("Convite não encontrado")

    if invitation.status != "pending":
        raise BadRequest(f"Convite já foi {invitation.status}")

    if invitation.is_expired:
        invitation.status = "expired"
        db.commit()
        raise BadRequest("Convite expirado")

    # Verifica se é o usuário correto
    if user.email.lower() != invitation.email.lower():
        raise BadRequest("Este convite é para outro email")

    # Busca role
    role = db.query(Role).filter(Role.key == invitation.role_key).first()
    if not role:
        raise BadRequest("Papel inválido")

    # Verifica se já tem acesso a este tenant
    existing_role = (
        db.query(UserRoleScope)
        .filter(
            UserRoleScope.user_id == user.id,
            UserRoleScope.tenant_id == invitation.tenant_id,
            UserRoleScope.is_active == True,
        )
        .first()
    )

    if existing_role:
        raise Conflict("Você já tem acesso a esta empresa")

    # Atribui papel
    role_scope = UserRoleScope(
        user_id=user.id,
        role_id=role.id,
        tenant_id=invitation.tenant_id,
        cnpj_id=invitation.cnpj_id,
        org_unit_id=invitation.org_unit_id,
        granted_by_user_id=invitation.invited_by_user_id,
        granted_at=datetime.utcnow(),
        is_active=True,
    )
    db.add(role_scope)

    # Atualiza convite
    invitation.status = "accepted"
    invitation.accepted_at = datetime.utcnow()
    invitation.created_user_id = user.id

    # Auditoria
    db.add(
        AuthAuditLog.log_invitation_accepted(
            invitation.email,
            user.id,
            invitation.tenant_id,
            ip=meta.get("ip"),
            user_agent=meta.get("user_agent"),
        )
    )

    db.commit()

    # Gera novo token com o tenant do convite
    access_token = create_access_token(
        subject=user.email or user.cpf,
        extra={
            "uid": str(user.id),
            "tid": str(invitation.tenant_id),
            "pla": user.is_platform_admin,
        },
    )

    import secrets

    refresh_token = secrets.token_urlsafe(48)

    return InvitationAcceptResponse(
        message="Acesso adicionado com sucesso!",
        access_token=access_token,
        refresh_token=refresh_token,
        user_id=user.id,
        tenant_id=invitation.tenant_id,
    )


# ==============================================================================
# REENVIAR CONVITE
# ==============================================================================


@router.post("/{invitation_id}/resend", response_model=InvitationResendOut)
def resend_invitation(
    invitation_id: UUID,
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    user=Depends(require_any_role([ROLE_OWNER, ROLE_TENANT_ADMIN])),
    tenant_id: UUID = Depends(tenant_id_from_user),
    meta: dict = Depends(get_request_meta),
):
    """Reenvia convite (gera novo token e estende prazo)."""
    invitation = (
        db.query(UserInvitation)
        .filter(
            UserInvitation.id == invitation_id, UserInvitation.tenant_id == tenant_id
        )
        .first()
    )

    if not invitation:
        raise NotFound("Convite não encontrado")

    if invitation.status not in ["pending", "expired"]:
        raise BadRequest(f"Não é possível reenviar convite {invitation.status}")

    # Regenera token e estende prazo
    invitation.token = UserInvitation.create_token()
    invitation.expires_at = UserInvitation.default_expires_at(7)
    invitation.status = "pending"

    db.add(
        make_audit_event(
            tenant_id=tenant_id,
            actor_user_id=user.id,
            action="INVITATION_RESENT",
            entity_type="USER_INVITATION",
            entity_id=invitation.id,
            before=None,
            after={"email": invitation.email},
            ip=meta.get("ip"),
            user_agent=meta.get("user_agent"),
            request_id=meta.get("request_id"),
        )
    )

    db.commit()

    # Reenviar email de convite
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    role = db.query(Role).filter(Role.key == invitation.role_key).first()

    invite_url = f"{settings.FRONTEND_URL}/convite/{invitation.token}"
    email_service.send_invitation(
        to_email=invitation.email,
        invite_url=invite_url,
        tenant_name=tenant.name if tenant else "Empresa",
        role_name=role.name if role else invitation.role_key,
        invited_by=user.full_name or user.email or "Administrador",
    )

    return InvitationResendOut(new_expires_at=invitation.expires_at)


# ==============================================================================
# CANCELAR CONVITE
# ==============================================================================


@router.delete("/{invitation_id}", response_model=InvitationCancelOut)
def cancel_invitation(
    invitation_id: UUID,
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    user=Depends(require_any_role([ROLE_OWNER, ROLE_TENANT_ADMIN])),
    tenant_id: UUID = Depends(tenant_id_from_user),
    meta: dict = Depends(get_request_meta),
):
    """Cancela convite pendente."""
    invitation = (
        db.query(UserInvitation)
        .filter(
            UserInvitation.id == invitation_id, UserInvitation.tenant_id == tenant_id
        )
        .first()
    )

    if not invitation:
        raise NotFound("Convite não encontrado")

    if invitation.status != "pending":
        raise BadRequest(f"Convite já foi {invitation.status}")

    invitation.status = "cancelled"

    db.add(
        make_audit_event(
            tenant_id=tenant_id,
            actor_user_id=user.id,
            action="INVITATION_CANCELLED",
            entity_type="USER_INVITATION",
            entity_id=invitation.id,
            before={"status": "pending"},
            after={"status": "cancelled"},
            ip=meta.get("ip"),
            user_agent=meta.get("user_agent"),
            request_id=meta.get("request_id"),
        )
    )

    db.commit()

    return InvitationCancelOut()
