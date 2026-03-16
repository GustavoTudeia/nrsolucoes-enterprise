from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from uuid import UUID

from app.db.session import get_db
from app.models.tenant import Tenant, TenantSettings
from app.models.campaign import Campaign
from app.models.questionnaire import QuestionnaireVersion
from app.models.training import TrainingCertificate
from app.models.org import OrgUnit
from app.core.errors import NotFound, Forbidden

router = APIRouter(prefix="/public")


@router.get("/tenants/resolve")
def resolve_tenant(slug: str, db: Session = Depends(get_db)):
    t = db.query(Tenant).filter(Tenant.slug == slug, Tenant.is_active == True).first()
    if not t:
        raise NotFound("Tenant não encontrado")
    return {"tenant_id": str(t.id), "name": t.name, "slug": t.slug}


@router.get("/campaigns/{campaign_id}")
def get_public_campaign(campaign_id: UUID, db: Session = Depends(get_db)):
    """Endpoint público para a página de pesquisa (anônima).

    - Somente campanhas abertas.
    - Retorna o JSON do questionário (versão publicada) e, se aplicável, lista de setores/unidades do CNPJ para seleção.
    """
    camp = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not camp:
        raise NotFound("Campanha não encontrada")
    if camp.status != "open":
        # para não vazar se existe/nao existe
        raise NotFound("Campanha não encontrada")

    qv = db.query(QuestionnaireVersion).filter(QuestionnaireVersion.id == camp.questionnaire_version_id).first()
    if not qv or qv.status != "published":
        raise Forbidden("Questionário não disponível")

    settings = db.query(TenantSettings).filter(TenantSettings.tenant_id == camp.tenant_id).first()
    min_n = settings.min_anon_threshold if settings else 5

    org_units = []
    allow_org_unit_selection = camp.org_unit_id is None
    if allow_org_unit_selection:
        units = db.query(OrgUnit).filter(OrgUnit.tenant_id == camp.tenant_id, OrgUnit.cnpj_id == camp.cnpj_id).order_by(OrgUnit.name.asc()).all()
        org_units = [{"id": str(u.id), "name": u.name, "unit_type": u.unit_type} for u in units]

    return {
        "campaign": {"id": str(camp.id), "name": camp.name},
        "require_invitation": bool(getattr(camp, "require_invitation", False)),
        "invitation_expires_days": int(getattr(camp, "invitation_expires_days", 30) or 30),
        "min_anon_threshold": min_n,
        "allow_org_unit_selection": allow_org_unit_selection,
        "org_units": org_units,
        "questionnaire_version_id": str(qv.id),
        "questionnaire": qv.content,
    }


@router.get("/certificates/validate/{code}")
def validate_certificate_public(code: str, db: Session = Depends(get_db)):
    """Valida certificado pelo código de validação (endpoint público).

    Qualquer pessoa com o código pode verificar a autenticidade do certificado.
    """
    cert = (
        db.query(TrainingCertificate)
        .filter(TrainingCertificate.validation_code == code)
        .first()
    )

    if not cert:
        return {
            "valid": False,
            "message": "Certificado não encontrado com este código de validação.",
        }

    is_valid = cert.is_valid if hasattr(cert, "is_valid") else True
    if cert.valid_until and cert.valid_until < __import__("datetime").datetime.utcnow():
        is_valid = False

    result = {
        "valid": is_valid,
        "certificate_number": cert.certificate_number,
        "employee_name": cert.employee_name,
        "training_title": cert.training_title,
        "training_description": cert.training_description,
        "issued_at": cert.issued_at.isoformat() if cert.issued_at else None,
        "valid_until": cert.valid_until.isoformat() if cert.valid_until else None,
        "issuer_name": cert.issuer_name,
        "issuer_cnpj": cert.issuer_cnpj,
        "training_completed_at": cert.training_completed_at.isoformat() if cert.training_completed_at else None,
        "training_duration_minutes": cert.training_duration_minutes,
        "risk_dimension": cert.risk_dimension,
    }

    if is_valid:
        result["message"] = "Certificado válido."
    else:
        result["message"] = f"Certificado expirado em {cert.valid_until.strftime('%d/%m/%Y')}." if cert.valid_until else "Certificado inválido."

    return result
