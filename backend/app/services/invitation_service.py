"""Service para gerenciamento de Campaign Invitations.

Este serviço garante:
- Geração segura de tokens únicos
- Validação com proteção contra timing attacks
- Auditoria completa
- Separação entre token e resposta (anonimato LGPD)
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta
from typing import List, Optional, Tuple
from uuid import UUID

from sqlalchemy import func, and_, case
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import BadRequest, NotFound, Forbidden
from app.models.campaign import Campaign, SurveyResponse
from app.models.campaign_invitation import CampaignInvitation, CampaignInvitationBatch
from app.models.employee import Employee
from app.models.org import OrgUnit
from app.models.questionnaire import QuestionnaireVersion


def _generate_token() -> str:
    """Gera token seguro de 32 bytes (64 caracteres hex)."""
    return secrets.token_hex(32)


def _hash_token(token: str) -> str:
    """Hash do token para armazenamento seguro."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _constant_time_compare(a: str, b: str) -> bool:
    """Comparação em tempo constante para prevenir timing attacks."""
    return secrets.compare_digest(a, b)


def generate_invitations(
    db: Session,
    campaign_id: UUID,
    tenant_id: UUID,
    created_by_user_id: UUID,
    org_unit_id: Optional[UUID] = None,
    employee_ids: Optional[List[UUID]] = None,
    expires_in_days: int = 30,
    send_email: bool = False,
) -> Tuple[CampaignInvitationBatch, List[Tuple[CampaignInvitation, str]]]:
    """Gera convites para colaboradores elegíveis.

    Args:
        db: Sessão do banco
        campaign_id: ID da campanha
        tenant_id: ID do tenant
        created_by_user_id: ID do usuário que está gerando
        org_unit_id: Filtrar por unidade (opcional)
        employee_ids: Lista específica de colaboradores (opcional)
        expires_in_days: Dias até expiração
        send_email: Se deve enviar email automaticamente

    Returns:
        Tuple com (batch, lista de (invitation, token_plain))

    Note:
        O token em plain text só é retornado uma vez nesta função.
        Depois, só existe o hash no banco.
    """

    # Validar campanha
    campaign = (
        db.query(Campaign)
        .filter(
            Campaign.id == campaign_id,
            Campaign.tenant_id == tenant_id,
        )
        .first()
    )

    if not campaign:
        raise NotFound("Campanha não encontrada")

    if campaign.status == "closed":
        raise BadRequest("Campanha já está encerrada")

    # Buscar colaboradores elegíveis
    # Employee não tem cnpj_id direto, mas tem org_unit_id
    # Precisamos filtrar por tenant e opcionalmente por org_unit
    query = db.query(Employee).filter(
        Employee.tenant_id == tenant_id,
        Employee.is_active == True,
    )

    # Se a campanha tem org_unit específico, filtrar por ele
    if campaign.org_unit_id:
        query = query.filter(Employee.org_unit_id == campaign.org_unit_id)

    # Filtros adicionais do request
    if org_unit_id:
        query = query.filter(Employee.org_unit_id == org_unit_id)

    if employee_ids:
        query = query.filter(Employee.id.in_(employee_ids))

    employees = query.all()

    if not employees:
        raise BadRequest("Nenhum colaborador elegível encontrado")

    # Buscar TODOS os convites existentes para esta campanha (incluindo revogados/expirados)
    existing_invitations = (
        db.query(CampaignInvitation)
        .filter(
            CampaignInvitation.campaign_id == campaign_id,
        )
        .all()
    )

    # Mapear por employee_id
    existing_by_employee = {inv.employee_id: inv for inv in existing_invitations}

    # IDs de colaboradores que já têm convite válido (pending ou used) - não recriar
    skip_employee_ids = {
        inv.employee_id
        for inv in existing_invitations
        if inv.status in ["pending", "used"]
    }

    # Criar batch de auditoria
    batch = CampaignInvitationBatch(
        tenant_id=tenant_id,
        campaign_id=campaign_id,
        created_by_user_id=created_by_user_id,
        filter_cnpj_id=None,  # Employee não tem cnpj_id direto
        filter_org_unit_id=org_unit_id,
        total_invited=str(len(employees)),
        send_status="pending",
    )
    db.add(batch)
    db.flush()

    # Gerar convites
    expires_at = datetime.utcnow() + timedelta(days=expires_in_days)
    results: List[Tuple[CampaignInvitation, str]] = []
    skipped = 0

    for employee in employees:
        # Pular se já tem convite válido (pending ou used)
        if employee.id in skip_employee_ids:
            skipped += 1
            continue

        # Gerar novo token
        token_plain = _generate_token()
        token_hash = _hash_token(token_plain)

        # Verificar se já existe convite revogado/expirado para reutilizar
        existing_inv = existing_by_employee.get(employee.id)

        if existing_inv and existing_inv.status in ["revoked", "expired"]:
            # Reutilizar convite existente (atualizar em vez de criar)
            existing_inv.token_hash = token_hash
            existing_inv.status = "pending"
            existing_inv.expires_at = expires_at
            existing_inv.sent_to_email = employee.identifier
            existing_inv.sent_at = None
            existing_inv.opened_at = None
            existing_inv.used_at = None
            existing_inv.revoked_at = None
            existing_inv.ip_opened = None
            existing_inv.ip_used = None
            existing_inv.user_agent_used = None
            existing_inv.reminder_count = "0"
            existing_inv.notes = None
            results.append((existing_inv, token_plain))
        else:
            # Criar novo convite
            invitation = CampaignInvitation(
                tenant_id=tenant_id,
                campaign_id=campaign_id,
                employee_id=employee.id,
                token_hash=token_hash,
                status="pending",
                expires_at=expires_at,
                sent_to_email=employee.identifier,
            )
            db.add(invitation)
            results.append((invitation, token_plain))

    # Atualizar estatísticas do batch
    batch.total_invited = str(len(employees))
    batch.total_sent = str(len(results))
    batch.total_failed = str(skipped)

    db.commit()

    # Refresh para obter IDs
    for invitation, _ in results:
        db.refresh(invitation)

    return batch, results


def validate_token(
    db: Session,
    token: str,
    campaign_id: UUID,
    mark_opened: bool = True,
    ip: Optional[str] = None,
) -> Tuple[bool, Optional[CampaignInvitation], Optional[str]]:
    """Valida um token de convite.

    Args:
        db: Sessão do banco
        token: Token em plain text
        campaign_id: ID da campanha
        mark_opened: Se deve marcar como aberto
        ip: IP do usuário (para auditoria)

    Returns:
        Tuple com (is_valid, invitation, error_code)
        error_code: expired | used | revoked | not_found | campaign_closed
    """

    token_hash = _hash_token(token)

    # Buscar convite
    invitation = (
        db.query(CampaignInvitation)
        .filter(
            CampaignInvitation.campaign_id == campaign_id,
            CampaignInvitation.token_hash == token_hash,
        )
        .first()
    )

    if not invitation:
        return False, None, "not_found"

    # Verificar campanha
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if campaign and campaign.status == "closed":
        return False, invitation, "campaign_closed"

    # Verificar status do convite
    if invitation.status == "used":
        return False, invitation, "used"

    if invitation.status == "revoked":
        return False, invitation, "revoked"

    if invitation.status == "expired" or (
        invitation.expires_at and invitation.expires_at < datetime.utcnow()
    ):
        # Atualizar status se expirou
        if invitation.status != "expired":
            invitation.status = "expired"
            db.commit()
        return False, invitation, "expired"

    # Token válido - marcar como aberto se solicitado
    if mark_opened:
        invitation.mark_as_opened(ip=ip)
        db.commit()

    return True, invitation, None


def submit_response_with_token(
    db: Session,
    campaign_id: UUID,
    token: str,
    answers: dict,
    org_unit_id: Optional[UUID] = None,
    ip: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> SurveyResponse:
    """Submete resposta usando token.

    IMPORTANTE: Esta função NÃO vincula a resposta ao convite/colaborador.
    O token é apenas validado e marcado como usado.
    A resposta é salva de forma completamente anônima.

    Args:
        db: Sessão do banco
        campaign_id: ID da campanha
        token: Token em plain text
        answers: Respostas do questionário
        org_unit_id: Unidade/setor para análise segmentada
        ip: IP do usuário
        user_agent: User agent do navegador

    Returns:
        SurveyResponse criada (sem vínculo com colaborador)

    Raises:
        BadRequest: Se token inválido
        Forbidden: Se campanha não está aberta
    """

    # Validar token
    is_valid, invitation, error = validate_token(
        db, token, campaign_id, mark_opened=False
    )

    if not is_valid:
        error_messages = {
            "not_found": "Token inválido ou não encontrado",
            "used": "Este convite já foi utilizado",
            "revoked": "Este convite foi revogado",
            "expired": "Este convite expirou",
            "campaign_closed": "Esta campanha já foi encerrada",
        }
        raise BadRequest(error_messages.get(error, "Token inválido"))

    # Buscar campanha
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()

    if not campaign:
        raise NotFound("Campanha não encontrada")

    if campaign.status != "open":
        raise Forbidden("Campanha não está aberta para respostas")

    # Validar org_unit se fornecido
    final_org_unit_id = campaign.org_unit_id or org_unit_id
    if final_org_unit_id:
        unit = (
            db.query(OrgUnit)
            .filter(
                OrgUnit.id == final_org_unit_id,
                OrgUnit.tenant_id == campaign.tenant_id,
                OrgUnit.cnpj_id == campaign.cnpj_id,
            )
            .first()
        )
        if not unit:
            raise BadRequest("Unidade/setor inválido")

    # PONTO CRÍTICO DE ANONIMATO:
    # A resposta é criada SEM NENHUM vínculo com o invitation ou employee
    # Isso é intencional para garantir LGPD
    response = SurveyResponse(
        tenant_id=campaign.tenant_id,
        campaign_id=campaign.id,
        questionnaire_version_id=campaign.questionnaire_version_id,
        cnpj_id=campaign.cnpj_id,
        org_unit_id=final_org_unit_id,
        answers=answers,
        submitted_at=datetime.utcnow(),
    )
    db.add(response)

    # Marcar token como usado (separadamente, sem vincular à resposta)
    invitation.mark_as_used(ip=ip, user_agent=user_agent)

    db.commit()
    db.refresh(response)

    return response


def get_invitation_stats(
    db: Session,
    campaign_id: UUID,
    tenant_id: UUID,
) -> dict:
    """Retorna estatísticas de convites de uma campanha."""

    # Contagem por status
    stats = (
        db.query(
            CampaignInvitation.status, func.count(CampaignInvitation.id).label("count")
        )
        .filter(
            CampaignInvitation.campaign_id == campaign_id,
            CampaignInvitation.tenant_id == tenant_id,
        )
        .group_by(CampaignInvitation.status)
        .all()
    )

    status_counts = {s.status: s.count for s in stats}
    total = sum(status_counts.values())
    used = status_counts.get("used", 0)

    # Estatísticas por unidade
    by_unit = (
        db.query(
            Employee.org_unit_id,
            OrgUnit.name.label("org_unit_name"),
            func.count(CampaignInvitation.id).label("invited"),
            func.sum(case((CampaignInvitation.status == "used", 1), else_=0)).label(
                "responded"
            ),
        )
        .join(Employee, CampaignInvitation.employee_id == Employee.id)
        .outerjoin(OrgUnit, Employee.org_unit_id == OrgUnit.id)
        .filter(
            CampaignInvitation.campaign_id == campaign_id,
            CampaignInvitation.tenant_id == tenant_id,
        )
        .group_by(Employee.org_unit_id, OrgUnit.name)
        .all()
    )

    return {
        "campaign_id": str(campaign_id),
        "total_invitations": total,
        "total_pending": status_counts.get("pending", 0),
        "total_used": used,
        "total_expired": status_counts.get("expired", 0),
        "total_revoked": status_counts.get("revoked", 0),
        "response_rate": round(used / total, 4) if total > 0 else 0,
        "by_org_unit": [
            {
                "org_unit_id": str(u.org_unit_id) if u.org_unit_id else None,
                "org_unit_name": u.org_unit_name or "(Sem unidade)",
                "invited": u.invited,
                "responded": u.responded or 0,
            }
            for u in by_unit
        ],
    }


def revoke_invitations(
    db: Session,
    campaign_id: UUID,
    tenant_id: UUID,
    invitation_ids: Optional[List[UUID]] = None,
    employee_ids: Optional[List[UUID]] = None,
    reason: Optional[str] = None,
) -> int:
    """Revoga convites.

    Returns:
        Número de convites revogados
    """

    query = db.query(CampaignInvitation).filter(
        CampaignInvitation.campaign_id == campaign_id,
        CampaignInvitation.tenant_id == tenant_id,
        CampaignInvitation.status == "pending",
    )

    if invitation_ids:
        query = query.filter(CampaignInvitation.id.in_(invitation_ids))

    if employee_ids:
        query = query.filter(CampaignInvitation.employee_id.in_(employee_ids))

    invitations = query.all()

    for inv in invitations:
        inv.revoke(reason=reason)

    db.commit()

    return len(invitations)


def check_campaign_requires_invitation(
    db: Session,
    campaign_id: UUID,
) -> bool:
    """Verifica se a campanha exige convite para responder."""

    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()

    if not campaign:
        return True  # Default: exigir

    # Verificar se tem o campo require_invitation
    require = getattr(campaign, "require_invitation", "true")
    return require == "true"
