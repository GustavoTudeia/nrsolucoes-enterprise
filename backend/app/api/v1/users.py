from __future__ import annotations

from datetime import datetime
from uuid import UUID
from typing import Optional, List
import re

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.api.deps import (
    get_current_user,
    require_any_role,
    tenant_id_from_user,
    get_request_meta,
    require_active_subscription,
)
from app.core.audit import make_audit_event
from app.core.errors import BadRequest, Forbidden, NotFound, Conflict
from app.core.rbac import ROLE_TENANT_ADMIN, ROLE_OWNER
from app.core.security import hash_password
from app.db.session import get_db
from app.models.user import Role
from app.models.user import User, UserRoleScope
from app.models.employee import Employee
from app.models.tenant import Tenant
from app.models.org import CNPJ, OrgUnit
from app.models.auth_audit_log import AuthAuditLog
from app.schemas.user import (
    UserCreate,
    UserOut,
    RoleAssign,
    RoleAssignmentOut,
    RoleOut,
    UserMeUpdate,
)
from app.schemas.user_management import (
    UserUpdate,
    UserListItem,
    UserListOut,
    UserRoleInfo,
    UserDeactivateOut,
    UserReactivateOut,
    UserResetPasswordOut,
    UserDeleteOut,
    AuthAuditLogItem,
    AuthAuditLogOut,
)
from app.schemas.common import Page

router = APIRouter(prefix="/users")


def _require_tenant_admin(user: User, tenant_id: UUID | None) -> UUID:
    if user.is_platform_admin:
        if not tenant_id:
            raise BadRequest("tenant_id é obrigatório para admin da plataforma")
        return tenant_id

    if not user.tenant_id:
        raise Forbidden("Usuário sem tenant")
    if user.tenant_id != tenant_id and tenant_id is not None:
        raise Forbidden("tenant_id inválido")
    # role check
    keys = [urs.role.key for urs in user.roles]
    if ROLE_TENANT_ADMIN not in keys and ROLE_OWNER not in keys:
        raise Forbidden("Somente OWNER ou TENANT_ADMIN")
    return user.tenant_id


def _user_list_item(u: User, db: Session) -> UserListItem:
    """Converte User para item de listagem."""
    roles = []
    for rs in u.roles:
        if rs.is_active:
            role = db.query(Role).filter(Role.id == rs.role_id).first()
            if role:
                roles.append(role.name)

    invited_by_name = None
    if u.invited_by_user_id:
        inviter = db.query(User).filter(User.id == u.invited_by_user_id).first()
        if inviter:
            invited_by_name = inviter.full_name or inviter.email

    return UserListItem(
        id=u.id,
        email=u.email,
        cpf=u.cpf,
        full_name=u.full_name,
        is_active=u.is_active,
        last_login_at=u.last_login_at,
        roles=roles,
        invited_by_name=invited_by_name,
        created_at=u.created_at,
    )


@router.get("", response_model=Page[UserListItem])
def list_users(
    q: Optional[str] = Query(None, description="Busca por nome, email ou CPF"),
    role: Optional[str] = Query(None, description="Filtrar por papel"),
    status: Optional[str] = Query(None, pattern="^(active|inactive)$"),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    tenant_id: UUID | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Lista usuários do tenant."""
    tid = tenant_id if user.is_platform_admin else user.tenant_id
    if not tid:
        raise Forbidden("Usuário sem tenant")

    user_role_keys = [urs.role.key for urs in user.roles if urs.role]
    is_owner = ROLE_OWNER in user_role_keys
    is_tenant_admin = ROLE_TENANT_ADMIN in user_role_keys

    if not user.is_platform_admin and not is_owner and not is_tenant_admin:
        raise Forbidden("Somente OWNER ou TENANT_ADMIN")

    # Base query - usuários que têm algum papel neste tenant
    user_ids_in_tenant = (
        db.query(UserRoleScope.user_id)
        .filter(UserRoleScope.tenant_id == tid, UserRoleScope.is_active == True)
        .distinct()
    )

    base = db.query(User).filter(
        or_(User.tenant_id == tid, User.id.in_(user_ids_in_tenant))
    )

    # TENANT_ADMIN não pode ver usuários que são OWNER
    if is_tenant_admin and not is_owner and not user.is_platform_admin:
        owner_role = db.query(Role).filter(Role.key == ROLE_OWNER).first()
        if owner_role:
            owner_user_ids = db.query(UserRoleScope.user_id).filter(
                UserRoleScope.role_id == owner_role.id,
                UserRoleScope.tenant_id == tid,
                UserRoleScope.is_active == True,
            )
            base = base.filter(~User.id.in_(owner_user_ids))

    # Filtros
    if q:
        search = f"%{q}%"
        base = base.filter(
            or_(
                User.full_name.ilike(search),
                User.email.ilike(search),
                User.cpf.ilike(search),
            )
        )

    if status == "active":
        base = base.filter(User.is_active == True)
    elif status == "inactive":
        base = base.filter(User.is_active == False)

    if role:
        role_obj = db.query(Role).filter(Role.key == role).first()
        if role_obj:
            users_with_role = db.query(UserRoleScope.user_id).filter(
                UserRoleScope.role_id == role_obj.id,
                UserRoleScope.tenant_id == tid,
                UserRoleScope.is_active == True,
            )
            base = base.filter(User.id.in_(users_with_role))

    total = base.count()
    rows = (
        base.order_by(User.full_name.asc(), User.email.asc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    items = [_user_list_item(u, db) for u in rows]
    return Page(items=items, total=total, limit=limit, offset=offset)


@router.post("", response_model=UserOut)
def create_user(
    payload: UserCreate,
    tenant_id: UUID | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    meta: dict = Depends(get_request_meta),
):
    """Cria novo usuário (uso interno/admin)."""
    tid = _require_tenant_admin(user, tenant_id)

    email = payload.email.lower().strip() if payload.email else None
    cpf = payload.cpf

    # Verifica se já existe
    if email:
        existing = db.query(User).filter(User.email == email).first()
        if existing:
            raise Conflict("Email já cadastrado")

    if cpf:
        existing = db.query(User).filter(User.cpf == cpf).first()
        if existing:
            raise Conflict("CPF já cadastrado")

    u = User(
        email=email,
        cpf=cpf,
        full_name=payload.full_name,
        phone=payload.phone if hasattr(payload, "phone") else None,
        password_hash=hash_password(payload.password),
        tenant_id=tid,
        is_active=True,
        is_platform_admin=False,
        invited_by_user_id=user.id,
        invited_at=datetime.utcnow(),
    )
    db.add(u)
    db.flush()
    db.add(
        make_audit_event(
            tid,
            user.id,
            "CREATE",
            "USER",
            u.id,
            None,
            {"email": u.email, "cpf": u.cpf},
            meta.get("ip"),
            meta.get("user_agent"),
            meta.get("request_id"),
        )
    )
    db.commit()
    db.refresh(u)
    return UserOut(
        id=u.id,
        email=u.email,
        full_name=u.full_name,
        tenant_id=u.tenant_id,
        is_active=u.is_active,
        is_platform_admin=u.is_platform_admin,
    )


@router.get("/roles", response_model=list[RoleOut])
def list_roles(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Lista papéis disponíveis para atribuição."""
    if not user.is_platform_admin:
        keys = [urs.role.key for urs in user.roles]
        if ROLE_TENANT_ADMIN not in keys and ROLE_OWNER not in keys:
            raise Forbidden("Somente OWNER ou TENANT_ADMIN")

    # Papéis protegidos que não devem aparecer na listagem para atribuição
    protected_roles = ["OWNER", "PLATFORM_SUPER_ADMIN"]

    rows = (
        db.query(Role)
        .filter(~Role.key.in_(protected_roles))
        .order_by(Role.key.asc())
        .all()
    )

    return [RoleOut(key=r.key, name=r.name, description=r.description) for r in rows]


@router.get("/me", response_model=UserOut)
def get_me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Retorna dados do usuário autenticado."""
    # Busca nome do tenant
    tenant_name = None
    if user.tenant_id:
        tenant = db.query(Tenant).filter(Tenant.id == user.tenant_id).first()
        if tenant:
            tenant_name = tenant.name

    # Busca roles do usuário
    roles = []
    for rs in user.roles:
        if rs.is_active:
            role = db.query(Role).filter(Role.id == rs.role_id).first()
            if role:
                roles.append(role.name)

    return {
        "id": user.id,
        "email": user.email,
        "cpf": user.cpf,
        "full_name": user.full_name,
        "phone": user.phone,
        "tenant_id": user.tenant_id,
        "tenant": {"name": tenant_name} if tenant_name else None,
        "is_active": user.is_active,
        "is_platform_admin": user.is_platform_admin,
        "must_change_password": user.must_change_password,
        "last_login_at": user.last_login_at,
        "created_at": user.created_at,
        "roles": roles,
    }


@router.patch("/me", response_model=UserOut)
def update_me(
    payload: UserMeUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    meta: dict = Depends(get_request_meta),
):
    """Atualiza dados do próprio usuário."""
    if payload.full_name is not None:
        user.full_name = payload.full_name.strip()
    if payload.phone is not None:
        user.phone = payload.phone.strip() if payload.phone else None
    if payload.cpf is not None:
        # Verifica se CPF já existe em outro usuário
        cpf_clean = re.sub(r"[^\d]", "", payload.cpf) if payload.cpf else None
        if cpf_clean:
            existing = (
                db.query(User).filter(User.cpf == cpf_clean, User.id != user.id).first()
            )
            if existing:
                raise Conflict("CPF já cadastrado em outro usuário")
            user.cpf = cpf_clean
        else:
            user.cpf = None

    db.add(user)
    db.add(
        make_audit_event(
            user.tenant_id,
            user.id,
            "UPDATE",
            "USER",
            user.id,
            None,
            {"full_name": user.full_name, "phone": user.phone, "cpf": user.cpf},
            meta.get("ip"),
            meta.get("user_agent"),
            meta.get("request_id"),
        )
    )
    db.commit()
    db.refresh(user)

    return UserOut(
        id=user.id,
        email=user.email,
        cpf=user.cpf,
        full_name=user.full_name,
        phone=user.phone,
        tenant_id=user.tenant_id,
        is_active=user.is_active,
        is_platform_admin=user.is_platform_admin,
        must_change_password=user.must_change_password,
        last_login_at=user.last_login_at,
    )


@router.get("/{user_id}", response_model=UserOut)
def get_user(
    user_id: UUID,
    tenant_id: UUID | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Retorna dados de um usuário específico."""
    tid = _require_tenant_admin(user, tenant_id)

    # Verifica se usuário pertence ao tenant
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise NotFound("Usuário não encontrado")

    # Verifica se tem papel no tenant
    has_role = (
        db.query(UserRoleScope)
        .filter(
            UserRoleScope.user_id == user_id,
            UserRoleScope.tenant_id == tid,
            UserRoleScope.is_active == True,
        )
        .first()
    )

    if not has_role and target.tenant_id != tid:
        raise NotFound("Usuário não encontrado")

    return UserOut(
        id=target.id,
        email=target.email,
        full_name=target.full_name,
        tenant_id=target.tenant_id,
        is_active=target.is_active,
        is_platform_admin=target.is_platform_admin,
    )


@router.patch("/{user_id}", response_model=UserOut)
def update_user(
    user_id: UUID,
    payload: UserUpdate,
    tenant_id: UUID | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    meta: dict = Depends(get_request_meta),
):
    """Atualiza dados de um usuário."""
    tid = _require_tenant_admin(user, tenant_id)
    target = db.query(User).filter(User.id == user_id).first()

    if not target:
        raise NotFound("Usuário não encontrado")

    # Atualiza campos
    if payload.full_name is not None:
        target.full_name = payload.full_name.strip()
    if payload.phone is not None:
        target.phone = payload.phone.strip() if payload.phone else None
    if payload.cpf is not None:
        # Verifica se CPF já existe em outro usuário
        existing = (
            db.query(User).filter(User.cpf == payload.cpf, User.id != user_id).first()
        )
        if existing:
            raise Conflict("CPF já cadastrado em outro usuário")
        target.cpf = payload.cpf
    if payload.is_active is not None:
        target.is_active = payload.is_active

    db.add(target)
    db.add(
        make_audit_event(
            tid,
            user.id,
            "UPDATE",
            "USER",
            target.id,
            None,
            {"full_name": target.full_name, "is_active": target.is_active},
            meta.get("ip"),
            meta.get("user_agent"),
            meta.get("request_id"),
        )
    )
    db.commit()
    db.refresh(target)

    return UserOut(
        id=target.id,
        email=target.email,
        full_name=target.full_name,
        tenant_id=target.tenant_id,
        is_active=target.is_active,
        is_platform_admin=target.is_platform_admin,
    )


@router.post("/{user_id}/deactivate", response_model=UserDeactivateOut)
def deactivate_user(
    user_id: UUID,
    tenant_id: UUID | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    meta: dict = Depends(get_request_meta),
):
    """Desativa usuário."""
    tid = _require_tenant_admin(user, tenant_id)
    target = db.query(User).filter(User.id == user_id).first()

    if not target:
        raise NotFound("Usuário não encontrado")

    if target.id == user.id:
        raise BadRequest("Você não pode desativar a si mesmo")

    # Verifica se é OWNER
    owner_role = db.query(Role).filter(Role.key == "OWNER").first()
    if owner_role:
        is_owner = (
            db.query(UserRoleScope)
            .filter(
                UserRoleScope.user_id == user_id,
                UserRoleScope.role_id == owner_role.id,
                UserRoleScope.tenant_id == tid,
                UserRoleScope.is_active == True,
            )
            .first()
        )
        if is_owner:
            raise BadRequest("Não é possível desativar o proprietário da conta")

    target.is_active = False

    db.add(target)
    db.add(
        make_audit_event(
            tid,
            user.id,
            "DEACTIVATE",
            "USER",
            target.id,
            {"is_active": True},
            {"is_active": False},
            meta.get("ip"),
            meta.get("user_agent"),
            meta.get("request_id"),
        )
    )
    db.commit()

    return UserDeactivateOut(deactivated_at=datetime.utcnow())


@router.post("/{user_id}/reactivate", response_model=UserReactivateOut)
def reactivate_user(
    user_id: UUID,
    tenant_id: UUID | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    meta: dict = Depends(get_request_meta),
):
    """Reativa usuário."""
    tid = _require_tenant_admin(user, tenant_id)
    target = db.query(User).filter(User.id == user_id).first()

    if not target:
        raise NotFound("Usuário não encontrado")

    target.is_active = True
    target.failed_login_count = 0
    target.locked_until = None

    db.add(target)
    db.add(
        make_audit_event(
            tid,
            user.id,
            "REACTIVATE",
            "USER",
            target.id,
            {"is_active": False},
            {"is_active": True},
            meta.get("ip"),
            meta.get("user_agent"),
            meta.get("request_id"),
        )
    )
    db.commit()

    return UserReactivateOut()


@router.post("/{user_id}/reset-password", response_model=UserResetPasswordOut)
def reset_user_password(
    user_id: UUID,
    tenant_id: UUID | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    meta: dict = Depends(get_request_meta),
):
    """Envia email de reset de senha para o usuário."""
    tid = _require_tenant_admin(user, tenant_id)
    target = db.query(User).filter(User.id == user_id).first()

    if not target:
        raise NotFound("Usuário não encontrado")

    if not target.email:
        raise BadRequest("Usuário não possui email cadastrado")

    import secrets
    from datetime import timedelta
    target.password_reset_token = secrets.token_urlsafe(32)
    target.password_reset_expires = datetime.utcnow() + timedelta(minutes=getattr(settings, "PASSWORD_RESET_TOKEN_TTL_MINUTES", 30))
    reset_url = f"{settings.FRONTEND_URL}/resetar-senha?token={target.password_reset_token}"
    email_service.queue_password_reset(to_email=target.email, reset_url=reset_url, user_name=target.full_name or target.email)
    db.add(target)

    db.add(
        AuthAuditLog.log_password_reset_request(
            email=target.email,
            user_id=target.id,
            ip=meta.get("ip"),
            user_agent=meta.get("user_agent"),
        )
    )
    db.commit()

    return UserResetPasswordOut()


@router.get("/{user_id}/roles", response_model=list[RoleAssignmentOut])
def list_user_roles(
    user_id: UUID,
    tenant_id: UUID | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Lista papéis ativos de um usuário."""
    tid = _require_tenant_admin(user, tenant_id)
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise NotFound("Usuário não encontrado")

    rows = (
        db.query(UserRoleScope)
        .filter(
            UserRoleScope.user_id == target.id,
            UserRoleScope.tenant_id == tid,
            UserRoleScope.is_active == True,  # Apenas papéis ativos
        )
        .all()
    )

    return [
        RoleAssignmentOut(
            id=r.id,
            role_key=r.role.key,
            tenant_id=r.tenant_id,
            cnpj_id=r.cnpj_id,
            org_unit_id=r.org_unit_id,
        )
        for r in rows
    ]


@router.post("/{user_id}/roles", response_model=dict)
def assign_role(
    user_id: UUID,
    payload: RoleAssign,
    tenant_id: UUID | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    meta: dict = Depends(get_request_meta),
):
    """Atribui papel a um usuário."""
    tid = _require_tenant_admin(user, tenant_id)
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise NotFound("Usuário não encontrado")

    role = db.query(Role).filter(Role.key == payload.role_key).first()
    if not role:
        raise BadRequest("Role inválida")

    # Papéis protegidos que não podem ser atribuídos via interface
    protected_roles = ["OWNER", "PLATFORM_SUPER_ADMIN"]
    if payload.role_key in protected_roles:
        raise BadRequest(f"Não é possível atribuir o papel '{payload.role_key}'")

    # normalize: default tenant scope
    scope_tenant_id = payload.tenant_id or tid
    if scope_tenant_id != tid:
        raise BadRequest("tenant_id do escopo inválido")

    existing = (
        db.query(UserRoleScope)
        .filter(
            UserRoleScope.user_id == target.id,
            UserRoleScope.role_id == role.id,
            UserRoleScope.tenant_id == scope_tenant_id,
            UserRoleScope.cnpj_id == payload.cnpj_id,
            UserRoleScope.org_unit_id == payload.org_unit_id,
        )
        .first()
    )
    if existing:
        # Reativa se estava inativo
        if not existing.is_active:
            existing.is_active = True
            db.commit()
        return {"status": "ok", "id": str(existing.id)}

    urs = UserRoleScope(
        user_id=target.id,
        role_id=role.id,
        tenant_id=scope_tenant_id,
        cnpj_id=payload.cnpj_id,
        org_unit_id=payload.org_unit_id,
        granted_by_user_id=user.id,
        granted_at=datetime.utcnow(),
        is_active=True,
    )
    db.add(urs)
    db.flush()

    db.add(
        make_audit_event(
            tid,
            user.id,
            "ASSIGN_ROLE",
            "USER_ROLE_SCOPE",
            urs.id,
            None,
            {"user_id": str(target.id), "role": role.key},
            meta.get("ip"),
            meta.get("user_agent"),
            meta.get("request_id"),
        )
    )
    db.commit()
    return {"status": "ok", "id": str(urs.id)}


@router.delete("/{user_id}/roles/{assignment_id}", response_model=dict)
def revoke_role(
    user_id: UUID,
    assignment_id: UUID,
    tenant_id: UUID | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    meta: dict = Depends(get_request_meta),
):
    """Revoga papel de um usuário."""
    tid = _require_tenant_admin(user, tenant_id)
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise NotFound("Usuário não encontrado")

    urs = (
        db.query(UserRoleScope)
        .filter(UserRoleScope.id == assignment_id, UserRoleScope.user_id == target.id)
        .first()
    )
    if not urs:
        raise NotFound("Atribuição não encontrada")

    # Não pode revogar OWNER
    role = db.query(Role).filter(Role.id == urs.role_id).first()
    if role and role.key == "OWNER":
        raise BadRequest("Não é possível revogar papel de Proprietário")

    # Soft delete
    urs.is_active = False

    db.add(
        make_audit_event(
            tid,
            user.id,
            "REVOKE_ROLE",
            "USER_ROLE_SCOPE",
            assignment_id,
            None,
            {"user_id": str(target.id)},
            meta.get("ip"),
            meta.get("user_agent"),
            meta.get("request_id"),
        )
    )
    db.commit()
    return {"status": "ok"}


@router.get("/{user_id}/audit-log", response_model=Page[AuthAuditLogItem])
def get_user_audit_log(
    user_id: UUID,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    tenant_id: UUID | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Retorna log de auditoria de autenticação do usuário."""
    tid = _require_tenant_admin(user, tenant_id)

    base = db.query(AuthAuditLog).filter(AuthAuditLog.user_id == user_id)

    total = base.count()
    rows = (
        base.order_by(AuthAuditLog.created_at.desc()).offset(offset).limit(limit).all()
    )

    items = [
        AuthAuditLogItem(
            id=r.id,
            event_type=r.event_type,
            email=r.email,
            cpf=r.cpf,
            success=r.success,
            failure_reason=r.failure_reason,
            ip_address=r.ip_address,
            location_city=r.location_city,
            location_country=r.location_country,
            created_at=r.created_at,
        )
        for r in rows
    ]

    return Page(items=items, total=total, limit=limit, offset=offset)
