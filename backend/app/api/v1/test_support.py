
from __future__ import annotations

import hashlib
import re
import secrets
from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import Forbidden, NotFound
from app.core.security import hash_password
from app.db.session import get_db
from app.models.billing import Plan, TenantSubscription
from app.models.employee import Employee
from app.models.employee_auth import EmployeeMagicLinkToken, EmployeeOtpToken
from app.models.org import CNPJ, OrgUnit
from app.models.tenant import Tenant, TenantSettings
from app.models.user import Role, User, UserRoleScope
from app.models.user_invitation import UserInvitation
from app.services.finance_service import ensure_onboarding_row, get_or_create_billing_profile
from app.services.seed import seed_platform_defaults

router = APIRouter(prefix="/test-support", tags=["test-support"])


def _ensure_enabled() -> None:
    if not (settings.ENABLE_E2E_TEST_SUPPORT or settings.ENV == 'test'):
        raise NotFound('Recurso não disponível')


def _sha256(raw: str) -> str:
    return hashlib.sha256(raw.encode('utf-8')).hexdigest()


def _namespace_seed(namespace: str) -> int:
    digest = hashlib.sha256(namespace.encode('utf-8')).hexdigest()
    return int(digest[:12], 16)


def _valid_cpf(seed: int) -> str:
    base = f"{seed % 10**9:09d}"
    def dv(digits: str) -> str:
        if len(digits) == 9:
            weights = list(range(10, 1, -1))
        else:
            weights = list(range(11, 1, -1))
        total = sum(int(d) * w for d, w in zip(digits, weights))
        rem = (total * 10) % 11
        return '0' if rem in (10, 11) else str(rem)
    d1 = dv(base)
    d2 = dv(base + d1)
    return base + d1 + d2


def _valid_cnpj(seed: int) -> str:
    base = f"{seed % 10**12:012d}"
    def calc(digits: str) -> str:
        weights = [5,4,3,2,9,8,7,6,5,4,3,2] if len(digits) == 12 else [6,5,4,3,2,9,8,7,6,5,4,3,2]
        total = sum(int(d) * w for d, w in zip(digits, weights))
        rem = total % 11
        return '0' if rem < 2 else str(11 - rem)
    d1 = calc(base)
    d2 = calc(base + d1)
    return base + d1 + d2


def _ensure_role(db: Session, key: str, name: str) -> Role:
    role = db.query(Role).filter(Role.key == key).first()
    if role:
        return role
    role = Role(key=key, name=name, is_system=True)
    db.add(role)
    db.flush()
    return role


def _upsert_subscription(db: Session, tenant: Tenant, plan_key: str) -> TenantSubscription:
    plan = db.query(Plan).filter(Plan.key == plan_key, Plan.is_active == True).first()
    sub = db.query(TenantSubscription).filter(TenantSubscription.tenant_id == tenant.id).first()
    if not sub:
        sub = TenantSubscription(tenant_id=tenant.id)
        db.add(sub)
    sub.plan_id = plan.id if plan else None
    sub.status = 'active'
    sub.provider = 'manual'
    sub.billing_cycle = 'monthly'
    sub.current_period_start = datetime.utcnow()
    sub.current_period_end = datetime.utcnow() + timedelta(days=30)
    sub.entitlements_snapshot = {"features": (plan.features if plan else {}), "limits": (plan.limits if plan else {})}
    db.flush()
    return sub


def _ensure_user_scope(db: Session, user: User, tenant_id: UUID | None, role_key: str) -> None:
    role = _ensure_role(db, role_key, role_key.replace('_', ' ').title())
    existing = db.query(UserRoleScope).filter(UserRoleScope.user_id == user.id, UserRoleScope.tenant_id == tenant_id, UserRoleScope.role_id == role.id, UserRoleScope.is_active == True).first()
    if not existing:
        db.add(UserRoleScope(user_id=user.id, role_id=role.id, tenant_id=tenant_id, is_active=True, granted_at=datetime.utcnow()))
        db.flush()


def _ensure_platform_admin(db: Session, namespace: str) -> User:
    email = f"platform+{namespace}@e2e-test.example.com"
    user = db.query(User).filter(User.email == email).first()
    if user:
        return user
    user = User(email=email, full_name='Platform Admin E2E', password_hash=hash_password('StrongPass123!'), is_active=True, is_platform_admin=True)
    db.add(user)
    db.flush()
    _ensure_user_scope(db, user, None, 'PLATFORM_SUPER_ADMIN')
    return user


def _ensure_tenant_fixture(db: Session, namespace: str, slug_suffix: str, plan_key: str, label: str) -> dict:
    seed = _namespace_seed(f"{namespace}-{slug_suffix}")
    slug = f"e2e-{namespace}-{slug_suffix}".replace('_', '-')[:70]
    tenant = db.query(Tenant).filter(Tenant.slug == slug).first()
    if not tenant:
        tenant = Tenant(name=f"{label} {namespace}", slug=slug, is_active=True)
        db.add(tenant)
        db.flush()
        db.add(TenantSettings(tenant_id=tenant.id, min_anon_threshold=2))
    cnpj_number = _valid_cnpj(seed)
    cnpj = db.query(CNPJ).filter(CNPJ.tenant_id == tenant.id, CNPJ.cnpj_number == cnpj_number).first()
    if not cnpj:
        cnpj = CNPJ(tenant_id=tenant.id, legal_name=f"{label} {namespace}", trade_name=f"{label} {namespace}", cnpj_number=cnpj_number, is_active=True)
        db.add(cnpj)
        db.flush()
    unit = db.query(OrgUnit).filter(OrgUnit.tenant_id == tenant.id, OrgUnit.cnpj_id == cnpj.id, OrgUnit.name == 'Administrativo').first()
    if not unit:
        unit = OrgUnit(tenant_id=tenant.id, cnpj_id=cnpj.id, name='Administrativo', unit_type='sector', parent_unit_id=None, is_active=True)
        db.add(unit)
        db.flush()

    admin_email = f"admin+{namespace}-{slug_suffix}@e2e-test.example.com"
    admin_cpf = _valid_cpf(seed)
    admin = db.query(User).filter(User.email == admin_email).first()
    if not admin:
        admin = User(tenant_id=tenant.id, email=admin_email, cpf=admin_cpf, full_name=f"Admin {label}", phone='11999990000', password_hash=hash_password('StrongPass123!'), is_active=True, is_platform_admin=False)
        db.add(admin)
        db.flush()
    admin.tenant_id = tenant.id
    admin.cpf = admin_cpf
    admin.phone = '11999990000'
    _ensure_user_scope(db, admin, tenant.id, 'OWNER')
    _ensure_user_scope(db, admin, tenant.id, 'TENANT_ADMIN')

    gestor_email = f"gestor+{namespace}-{slug_suffix}@e2e-test.example.com"
    gestor = db.query(User).filter(User.email == gestor_email).first()
    if not gestor:
        gestor = User(tenant_id=tenant.id, email=gestor_email, cpf=_valid_cpf(seed + 1), full_name=f"Gestor {label}", phone='11999990001', password_hash=hash_password('StrongPass123!'), is_active=True, is_platform_admin=False)
        db.add(gestor)
        db.flush()
    gestor.tenant_id = tenant.id
    _ensure_user_scope(db, gestor, tenant.id, 'SECURITY_ANALYST')
    _ensure_user_scope(db, gestor, tenant.id, 'CNPJ_MANAGER')

    employee_identifier = f"colaborador+{namespace}-{slug_suffix}@e2e-test.example.com"
    employee = db.query(Employee).filter(Employee.tenant_id == tenant.id, Employee.identifier == employee_identifier).first()
    if not employee:
        employee = Employee(
            tenant_id=tenant.id,
            cnpj_id=cnpj.id,
            org_unit_id=unit.id,
            identifier=employee_identifier,
            email=employee_identifier,
            cpf=_valid_cpf(seed + 2),
            full_name=f"Colaborador {label}",
            job_title='Assistente Administrativo',
            is_active=True,
            portal_access_enabled=True,
        )
        db.add(employee)
        db.flush()

    profile = get_or_create_billing_profile(db, tenant.id)
    profile.legal_name = profile.legal_name or tenant.name
    profile.trade_name = profile.trade_name or tenant.name
    profile.cnpj_number = profile.cnpj_number or cnpj_number
    profile.finance_email = profile.finance_email or admin_email
    profile.contact_email = profile.contact_email or admin_email
    profile.contact_name = profile.contact_name or admin.full_name
    profile.contact_phone = profile.contact_phone or admin.phone
    db.add(profile)
    ensure_onboarding_row(db, tenant.id)
    _upsert_subscription(db, tenant, plan_key)

    return {
        'tenant': tenant,
        'cnpj': cnpj,
        'unit': unit,
        'admin': admin,
        'gestor': gestor,
        'employee': employee,
    }


class BootstrapRequest(BaseModel):
    namespace: Optional[str] = None


class UserSecretsRequest(BaseModel):
    email: Optional[EmailStr] = None
    cpf: Optional[str] = None


class EmployeeOtpIssueRequest(BaseModel):
    tenant_id: UUID
    identifier: str


class EmployeeMagicIssueRequest(BaseModel):
    tenant_id: UUID
    identifier: str


class InvitationTokenLookup(BaseModel):
    tenant_id: UUID
    email: EmailStr


@router.post('/bootstrap')
def bootstrap_fixture(payload: BootstrapRequest, db: Session = Depends(get_db)):
    _ensure_enabled()
    namespace = re.sub(r'[^a-zA-Z0-9-]+', '-', (payload.namespace or secrets.token_hex(4)).lower()).strip('-') or 'e2e'
    seed_platform_defaults(db)
    platform_admin = _ensure_platform_admin(db, namespace)
    primary = _ensure_tenant_fixture(db, namespace, 'enterprise', 'ENTERPRISE', 'Empresa Enterprise E2E')
    secondary = _ensure_tenant_fixture(db, namespace, 'start', 'START', 'Empresa Start E2E')
    db.commit()
    return {
        'namespace': namespace,
        'platform_admin': {
            'email': platform_admin.email,
            'password': 'StrongPass123!',
        },
        'primary': {
            'tenant_id': str(primary['tenant'].id),
            'slug': primary['tenant'].slug,
            'plan_key': 'ENTERPRISE',
            'admin': {'email': primary['admin'].email, 'password': 'StrongPass123!', 'cpf': primary['admin'].cpf},
            'gestor': {'email': primary['gestor'].email, 'password': 'StrongPass123!', 'cpf': primary['gestor'].cpf},
            'employee': {'identifier': primary['employee'].identifier, 'email': primary['employee'].email, 'cpf': primary['employee'].cpf},
            'cnpj_id': str(primary['cnpj'].id),
            'cnpj_number': primary['cnpj'].cnpj_number,
            'unit_id': str(primary['unit'].id),
        },
        'secondary': {
            'tenant_id': str(secondary['tenant'].id),
            'slug': secondary['tenant'].slug,
            'plan_key': 'START',
            'admin': {'email': secondary['admin'].email, 'password': 'StrongPass123!', 'cpf': secondary['admin'].cpf},
            'employee': {'identifier': secondary['employee'].identifier, 'email': secondary['employee'].email, 'cpf': secondary['employee'].cpf},
            'cnpj_id': str(secondary['cnpj'].id),
            'cnpj_number': secondary['cnpj'].cnpj_number,
            'unit_id': str(secondary['unit'].id),
        },
    }


@router.post('/user-secrets')
def get_user_secrets(payload: UserSecretsRequest, db: Session = Depends(get_db)):
    _ensure_enabled()
    query = db.query(User)
    if payload.email:
        query = query.filter(User.email == payload.email.lower().strip())
    elif payload.cpf:
        query = query.filter(User.cpf == payload.cpf)
    else:
        raise Forbidden('Informe email ou cpf')
    user = query.first()
    if not user:
        raise NotFound('Usuário não encontrado')
    return {
        'email': user.email,
        'cpf': user.cpf,
        'password_reset_token': user.password_reset_token,
        'otp_code': user.otp_code,
        'magic_link_token': user.magic_link_token,
    }


@router.post('/employee/issue-otp')
def issue_employee_otp(payload: EmployeeOtpIssueRequest, db: Session = Depends(get_db)):
    _ensure_enabled()
    employee = db.query(Employee).filter(Employee.tenant_id == payload.tenant_id, Employee.identifier == payload.identifier).first()
    if not employee:
        raise NotFound('Colaborador não encontrado')
    db.query(EmployeeOtpToken).filter(EmployeeOtpToken.employee_id == employee.id, EmployeeOtpToken.consumed_at == None).update({'consumed_at': datetime.utcnow()})
    code = f"{secrets.randbelow(1000000):06d}"
    token = EmployeeOtpToken(tenant_id=employee.tenant_id, employee_id=employee.id, employee_identifier=employee.identifier, code_hash=_sha256(code), expires_at=datetime.utcnow() + timedelta(minutes=10), attempts=0)
    db.add(token)
    db.commit()
    return {'tenant_id': str(employee.tenant_id), 'identifier': employee.identifier, 'code': code}


@router.post('/employee/issue-magic-link')
def issue_employee_magic(payload: EmployeeMagicIssueRequest, db: Session = Depends(get_db)):
    _ensure_enabled()
    employee = db.query(Employee).filter(Employee.tenant_id == payload.tenant_id, Employee.identifier == payload.identifier).first()
    if not employee:
        raise NotFound('Colaborador não encontrado')
    db.query(EmployeeMagicLinkToken).filter(EmployeeMagicLinkToken.employee_id == employee.id, EmployeeMagicLinkToken.consumed_at == None).update({'consumed_at': datetime.utcnow()})
    raw = secrets.token_urlsafe(32)
    token = EmployeeMagicLinkToken(tenant_id=employee.tenant_id, employee_id=employee.id, token_hash=_sha256(raw), expires_at=datetime.utcnow() + timedelta(hours=24))
    db.add(token)
    db.commit()
    return {'token': raw, 'url': f"{settings.FRONTEND_URL}/employee/magic/{raw}"}


@router.post('/user-invitation-token')
def lookup_user_invitation(payload: InvitationTokenLookup, db: Session = Depends(get_db)):
    _ensure_enabled()
    inv = db.query(UserInvitation).filter(UserInvitation.tenant_id == payload.tenant_id, UserInvitation.email == payload.email.lower().strip(), UserInvitation.status == 'pending').order_by(UserInvitation.created_at.desc()).first()
    if not inv:
        raise NotFound('Convite não encontrado')
    return {'token': inv.token, 'url': f"{settings.FRONTEND_URL}/convite/{inv.token}"}
