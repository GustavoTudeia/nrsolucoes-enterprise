"""Service para gerenciamento de Campaign Invitations."""
from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta
from typing import List, Optional, Tuple
from uuid import UUID

from sqlalchemy import func, case
from sqlalchemy.orm import Session

from app.core.errors import BadRequest, NotFound, Forbidden
from app.models.campaign import Campaign, SurveyResponse
from app.models.campaign_invitation import CampaignInvitation, CampaignInvitationBatch
from app.models.employee import Employee
from app.models.org import OrgUnit


def _generate_token() -> str:
    return secrets.token_hex(32)


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


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
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id, Campaign.tenant_id == tenant_id).first()
    if not campaign:
        raise NotFound("Campanha não encontrada")
    if campaign.status == "closed":
        raise BadRequest("Campanha já está encerrada")

    # gerar convites implica campanha controlada por token
    campaign.require_invitation = True
    campaign.invitation_expires_days = int(expires_in_days or campaign.invitation_expires_days or 30)

    query = db.query(Employee).filter(Employee.tenant_id == tenant_id, Employee.is_active == True)
    if campaign.org_unit_id:
        query = query.filter(Employee.org_unit_id == campaign.org_unit_id)
    if org_unit_id:
        query = query.filter(Employee.org_unit_id == org_unit_id)
    if employee_ids:
        query = query.filter(Employee.id.in_(employee_ids))
    employees = query.all()
    if not employees:
        raise BadRequest("Nenhum colaborador elegível encontrado")

    existing_invitations = db.query(CampaignInvitation).filter(CampaignInvitation.campaign_id == campaign_id).all()
    existing_by_employee = {inv.employee_id: inv for inv in existing_invitations}
    skip_employee_ids = {inv.employee_id for inv in existing_invitations if inv.status in ["pending", "used"]}

    batch = CampaignInvitationBatch(
        tenant_id=tenant_id,
        campaign_id=campaign_id,
        created_by_user_id=created_by_user_id,
        filter_cnpj_id=None,
        filter_org_unit_id=org_unit_id,
        total_invited=len(employees),
        send_status="pending",
    )
    db.add(batch)
    db.flush()

    expires_at = datetime.utcnow() + timedelta(days=expires_in_days)
    results: List[Tuple[CampaignInvitation, str]] = []
    skipped = 0

    for employee in employees:
        if employee.id in skip_employee_ids:
            skipped += 1
            continue
        token_plain = _generate_token()
        token_hash = _hash_token(token_plain)
        dest_email = employee.email or (employee.identifier if "@" in (employee.identifier or "") else None)
        existing_inv = existing_by_employee.get(employee.id)
        if existing_inv and existing_inv.status in ["revoked", "expired"]:
            existing_inv.token_hash = token_hash
            existing_inv.status = "pending"
            existing_inv.expires_at = expires_at
            existing_inv.sent_to_email = dest_email
            existing_inv.sent_at = None
            existing_inv.opened_at = None
            existing_inv.used_at = None
            existing_inv.revoked_at = None
            existing_inv.ip_opened = None
            existing_inv.ip_used = None
            existing_inv.user_agent_used = None
            existing_inv.reminder_count = 0
            existing_inv.notes = None
            results.append((existing_inv, token_plain))
        else:
            invitation = CampaignInvitation(
                tenant_id=tenant_id,
                campaign_id=campaign_id,
                employee_id=employee.id,
                token_hash=token_hash,
                status="pending",
                expires_at=expires_at,
                sent_to_email=dest_email,
            )
            db.add(invitation)
            results.append((invitation, token_plain))

    batch.total_sent = len(results)
    batch.total_failed = skipped
    db.commit()
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
    token_hash = _hash_token(token)
    invitation = db.query(CampaignInvitation).filter(CampaignInvitation.campaign_id == campaign_id, CampaignInvitation.token_hash == token_hash).first()
    if not invitation:
        return False, None, "not_found"

    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if campaign and campaign.status == "closed":
        return False, invitation, "campaign_closed"

    if invitation.status == "used":
        return False, invitation, "used"
    if invitation.status == "revoked":
        return False, invitation, "revoked"
    if invitation.status == "expired" or (invitation.expires_at and invitation.expires_at < datetime.utcnow()):
        if invitation.status != "expired":
            invitation.status = "expired"
            db.commit()
        return False, invitation, "expired"

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
    is_valid, invitation, error = validate_token(db, token, campaign_id, mark_opened=False)
    if not is_valid:
        error_messages = {
            "not_found": "Token inválido ou não encontrado",
            "used": "Este convite já foi utilizado",
            "revoked": "Este convite foi revogado",
            "expired": "Este convite expirou",
            "campaign_closed": "Esta campanha já foi encerrada",
        }
        raise BadRequest(error_messages.get(error, "Token inválido"))

    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise NotFound("Campanha não encontrada")
    if campaign.status != "open":
        raise Forbidden("Campanha não está aberta para respostas")

    final_org_unit_id = campaign.org_unit_id or org_unit_id
    if final_org_unit_id:
        unit = db.query(OrgUnit).filter(OrgUnit.id == final_org_unit_id, OrgUnit.tenant_id == campaign.tenant_id, OrgUnit.cnpj_id == campaign.cnpj_id).first()
        if not unit:
            raise BadRequest("Unidade/setor inválido")

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
    invitation.mark_as_used(ip=ip, user_agent=user_agent)
    db.commit()
    db.refresh(response)
    return response


def get_invitation_stats(db: Session, campaign_id: UUID, tenant_id: UUID) -> dict:
    stats = (
        db.query(CampaignInvitation.status, func.count(CampaignInvitation.id).label("count"))
        .filter(CampaignInvitation.campaign_id == campaign_id, CampaignInvitation.tenant_id == tenant_id)
        .group_by(CampaignInvitation.status)
        .all()
    )
    status_counts = {s.status: int(s.count) for s in stats}
    total = sum(status_counts.values())
    used = status_counts.get("used", 0)
    by_unit = (
        db.query(
            Employee.org_unit_id,
            OrgUnit.name.label("org_unit_name"),
            func.count(CampaignInvitation.id).label("invited"),
            func.sum(case((CampaignInvitation.status == "used", 1), else_=0)).label("responded"),
        )
        .join(Employee, CampaignInvitation.employee_id == Employee.id)
        .outerjoin(OrgUnit, Employee.org_unit_id == OrgUnit.id)
        .filter(CampaignInvitation.campaign_id == campaign_id, CampaignInvitation.tenant_id == tenant_id)
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
                "invited": int(u.invited or 0),
                "responded": int(u.responded or 0),
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


def check_campaign_requires_invitation(db: Session, campaign_id: UUID) -> bool:
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        return True
    value = getattr(campaign, "require_invitation", True)
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "sim", "s"}
