"""API de Campaign Invitations - Gerenciamento de convites para colaboradores.

Endpoints:
- POST /campaigns/{id}/invitations/generate - Gerar convites para colaboradores
- GET /campaigns/{id}/invitations - Listar convites da campanha
- GET /campaigns/{id}/invitations/stats - Estatísticas de convites
- POST /campaigns/{id}/invitations/revoke - Revogar convites
- POST /campaigns/{id}/invitations/resend - Reenviar convites

Endpoints públicos (para colaboradores):
- GET /public/survey/{campaign_id}/validate - Validar token
- POST /public/survey/{campaign_id}/submit - Submeter resposta com token
"""

from __future__ import annotations

from typing import Optional, List
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.api.deps import (
    require_any_role,
    tenant_id_from_user,
    get_request_meta,
    require_active_subscription,
)
from app.core.audit import make_audit_event
from app.core.errors import BadRequest, NotFound
from app.core.rbac import ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER
from app.db.session import get_db
from app.models.campaign import Campaign
from app.models.campaign_invitation import CampaignInvitation
from app.models.employee import Employee
from app.models.questionnaire import QuestionnaireVersion
from app.schemas.campaign_invitation import (
    InvitationGenerateRequest,
    InvitationGenerateResult,
    InvitationOut,
    InvitationWithTokenOut,
    InvitationRevokeRequest,
    InvitationStatsOut,
    InvitationValidateRequest,
    InvitationValidateResult,
    SurveySubmitWithTokenRequest,
    SurveySubmitResult,
)
from app.schemas.common import Page
from app.services.email_service import email_service
from app.services.invitation_service import (
    generate_invitations,
    validate_token,
    submit_response_with_token,
    get_invitation_stats,
    revoke_invitations,
    check_campaign_requires_invitation,
)
from app.core.config import settings

router = APIRouter()


# =============================================================================
# ADMIN ENDPOINTS (requerem autenticação)
# =============================================================================


@router.post(
    "/campaigns/{campaign_id}/invitations/generate",
    response_model=InvitationGenerateResult,
)
def generate_campaign_invitations(
    campaign_id: UUID,
    payload: InvitationGenerateRequest,
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    user=Depends(
        require_any_role([ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER])
    ),
    tenant_id: UUID = Depends(tenant_id_from_user),
    meta: dict = Depends(get_request_meta),
):
    """Gera convites únicos para colaboradores responderem a campanha.

    Cada colaborador recebe um token único que só pode ser usado uma vez.
    Os tokens são retornados nesta resposta e NÃO ficam armazenados em plain text.

    Filtros:
    - cnpj_id: Todos colaboradores do CNPJ
    - org_unit_id: Todos colaboradores da unidade/setor
    - employee_ids: Lista específica de colaboradores

    Se nenhum filtro for informado, convida todos colaboradores do CNPJ da campanha.
    """

    batch, results = generate_invitations(
        db=db,
        campaign_id=campaign_id,
        tenant_id=tenant_id,
        created_by_user_id=user.id,
        org_unit_id=payload.org_unit_id,
        employee_ids=payload.employee_ids,
        expires_in_days=payload.expires_in_days,
        send_email=payload.send_email,
    )

    # Montar URLs de pesquisa
    base_url = getattr(settings, "FRONTEND_URL", "http://localhost:3000")

    # Buscar nomes dos colaboradores
    employee_ids = [inv.employee_id for inv, _ in results]
    employees = {
        e.id: e for e in db.query(Employee).filter(Employee.id.in_(employee_ids)).all()
    }

    invitations_out = []
    total_sent = 0
    for invitation, token_plain in results:
        emp = employees.get(invitation.employee_id)
        survey_url = f"{base_url}/pesquisa/{campaign_id}?token={token_plain}"
        invitations_out.append(
            InvitationWithTokenOut(
                id=invitation.id,
                employee_id=invitation.employee_id,
                employee_name=emp.full_name if emp else None,
                employee_email=emp.email if emp else None,
                token=token_plain,
                survey_url=survey_url,
                expires_at=invitation.expires_at,
            )
        )
        if payload.send_email and emp and emp.email:
            if email_service.queue_invitation(to_email=emp.email, invite_url=survey_url, tenant_name="Pesquisa NR-1", role_name="Respondente", invited_by=user.display_name):
                invitation.sent_at = datetime.utcnow()
                total_sent += 1
                db.add(invitation)

    # Auditoria
    db.add(
        make_audit_event(
            tenant_id=tenant_id,
            actor_user_id=user.id,
            action="GENERATE_INVITATIONS",
            entity_type="CAMPAIGN",
            entity_id=campaign_id,
            before=None,
            after={
                "batch_id": str(batch.id),
                "total_created": len(results),
                "expires_in_days": payload.expires_in_days,
            },
            ip=meta.get("ip"),
            user_agent=meta.get("user_agent"),
            request_id=meta.get("request_id"),
        )
    )
    db.commit()

    return InvitationGenerateResult(
        campaign_id=campaign_id,
        batch_id=batch.id,
        total_eligible=int(batch.total_invited),
        total_created=len(results),
        total_skipped=int(batch.total_failed),
        total_sent=total_sent,
        invitations=invitations_out,
    )


@router.get("/campaigns/{campaign_id}/invitations", response_model=Page[InvitationOut])
def list_campaign_invitations(
    campaign_id: UUID,
    status: Optional[str] = Query(
        default=None, description="Filtrar por status: pending|used|expired|revoked"
    ),
    org_unit_id: Optional[UUID] = Query(
        default=None, description="Filtrar por unidade"
    ),
    q: Optional[str] = Query(
        default=None, description="Buscar por nome/email do colaborador"
    ),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    user=Depends(
        require_any_role([ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER])
    ),
    tenant_id: UUID = Depends(tenant_id_from_user),
):
    """Lista convites de uma campanha com filtros."""

    query = (
        db.query(CampaignInvitation)
        .join(Employee, CampaignInvitation.employee_id == Employee.id)
        .filter(
            CampaignInvitation.campaign_id == campaign_id,
            CampaignInvitation.tenant_id == tenant_id,
        )
    )

    if status:
        query = query.filter(CampaignInvitation.status == status)

    if org_unit_id:
        query = query.filter(Employee.org_unit_id == org_unit_id)

    if q:
        like = f"%{q.strip()}%"
        query = query.filter(
            (Employee.full_name.ilike(like)) | (Employee.email.ilike(like))
        )

    total = query.count()
    rows = (
        query.order_by(CampaignInvitation.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    # Buscar dados dos colaboradores
    employee_ids = [r.employee_id for r in rows]
    employees = {
        e.id: e for e in db.query(Employee).filter(Employee.id.in_(employee_ids)).all()
    }

    items = []
    for r in rows:
        emp = employees.get(r.employee_id)
        items.append(
            InvitationOut(
                id=r.id,
                campaign_id=r.campaign_id,
                employee_id=r.employee_id,
                employee_name=emp.full_name if emp else None,
                employee_email=emp.email if emp and emp.email else (emp.identifier if emp else None),
                status=r.status,
                expires_at=r.expires_at,
                sent_at=r.sent_at,
                opened_at=r.opened_at,
                used_at=r.used_at,
                revoked_at=r.revoked_at,
                sent_via=r.sent_via,
                sent_to_email=r.sent_to_email,
                reminder_count=int(r.reminder_count or 0),
                created_at=r.created_at,
            )
        )

    return Page(items=items, total=total, limit=limit, offset=offset)


@router.get(
    "/campaigns/{campaign_id}/invitations/stats", response_model=InvitationStatsOut
)
def get_campaign_invitation_stats(
    campaign_id: UUID,
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    user=Depends(
        require_any_role([ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER])
    ),
    tenant_id: UUID = Depends(tenant_id_from_user),
):
    """Retorna estatísticas de convites da campanha."""

    stats = get_invitation_stats(db, campaign_id, tenant_id)
    return InvitationStatsOut(**stats)


@router.post("/campaigns/{campaign_id}/invitations/revoke")
def revoke_campaign_invitations(
    campaign_id: UUID,
    payload: InvitationRevokeRequest,
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    user=Depends(require_any_role([ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER])),
    tenant_id: UUID = Depends(tenant_id_from_user),
    meta: dict = Depends(get_request_meta),
):
    """Revoga convites pendentes."""

    count = revoke_invitations(
        db=db,
        campaign_id=campaign_id,
        tenant_id=tenant_id,
        invitation_ids=payload.invitation_ids,
        employee_ids=payload.employee_ids,
        reason=payload.reason,
    )

    # Auditoria
    db.add(
        make_audit_event(
            tenant_id=tenant_id,
            actor_user_id=user.id,
            action="REVOKE_INVITATIONS",
            entity_type="CAMPAIGN",
            entity_id=campaign_id,
            before=None,
            after={"revoked_count": count, "reason": payload.reason},
            ip=meta.get("ip"),
            user_agent=meta.get("user_agent"),
            request_id=meta.get("request_id"),
        )
    )
    db.commit()

    return {"status": "ok", "revoked_count": count}


# =============================================================================
# PUBLIC ENDPOINTS (para colaboradores, sem autenticação)
# =============================================================================


@router.get(
    "/public/survey/{campaign_id}/validate", response_model=InvitationValidateResult
)
def validate_survey_token(
    campaign_id: UUID,
    token: str = Query(
        ..., min_length=32, max_length=64, description="Token do convite"
    ),
    request: Request = None,
    db: Session = Depends(get_db),
):
    """Valida token de convite (endpoint público).

    Usado pelo frontend para verificar se o token é válido antes de exibir o questionário.
    """

    # Obter IP
    ip = None
    if request:
        ip = request.client.host if request.client else None

    is_valid, invitation, error = validate_token(
        db, token, campaign_id, mark_opened=True, ip=ip
    )

    if not is_valid:
        error_messages = {
            "not_found": "Token inválido ou não encontrado",
            "used": "Este convite já foi utilizado. Cada colaborador pode responder apenas uma vez.",
            "revoked": "Este convite foi cancelado. Entre em contato com o RH.",
            "expired": "Este convite expirou. Solicite um novo convite ao RH.",
            "campaign_closed": "Esta pesquisa já foi encerrada.",
        }
        return InvitationValidateResult(
            valid=False,
            error=error_messages.get(error, "Token inválido"),
        )

    # Buscar dados da campanha
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    questionnaire = None
    if campaign:
        qv = (
            db.query(QuestionnaireVersion)
            .filter(QuestionnaireVersion.id == campaign.questionnaire_version_id)
            .first()
        )
        if qv and qv.content:
            questionnaire = qv.content.get("title")

    return InvitationValidateResult(
        valid=True,
        campaign_id=campaign_id,
        campaign_name=campaign.name if campaign else None,
        questionnaire_title=questionnaire,
        expires_at=invitation.expires_at if invitation else None,
        error=None,
    )


@router.post("/public/survey/{campaign_id}/submit", response_model=SurveySubmitResult)
def submit_survey_with_token(
    campaign_id: UUID,
    payload: SurveySubmitWithTokenRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Submete resposta usando token (endpoint público).

    IMPORTANTE: A resposta é completamente anônima.
    O token é validado e marcado como usado, mas NÃO há vínculo entre
    o token/colaborador e a resposta.

    Isso garante conformidade LGPD - é impossível identificar quem respondeu o quê.
    """

    # Obter IP e User-Agent
    ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")

    # Submeter resposta
    submit_response_with_token(
        db=db,
        campaign_id=campaign_id,
        token=payload.token,
        answers=payload.answers,
        org_unit_id=payload.org_unit_id,
        ip=ip,
        user_agent=user_agent,
    )

    return SurveySubmitResult(
        status="ok",
        message="Resposta registrada com sucesso. Obrigado pela participação!",
    )


# =============================================================================
# ENDPOINT LEGADO (manter compatibilidade)
# =============================================================================


@router.post("/campaigns/{campaign_id}/responses")
def submit_response_legacy(
    campaign_id: UUID,
    request: Request,
    db: Session = Depends(get_db),
):
    """Endpoint legado de submissão (sem token).

    Este endpoint verifica se a campanha exige token.
    Se exigir, retorna erro orientando uso do novo endpoint.
    Se não exigir, permite submissão livre (modo legado).
    """

    requires_invitation = check_campaign_requires_invitation(db, campaign_id)

    if requires_invitation:
        raise BadRequest(
            "Esta campanha requer convite para participação. "
            "Use o link personalizado enviado por email ou solicite um convite ao RH."
        )

    raise BadRequest("Campanha sem convite deve usar POST /api/v1/campaigns/{campaign_id}/responses")
