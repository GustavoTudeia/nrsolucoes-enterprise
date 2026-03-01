from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from uuid import UUID

from app.db.session import get_db
from app.models.tenant import Tenant, TenantSettings
from app.models.campaign import Campaign
from app.models.questionnaire import QuestionnaireVersion
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
        "min_anon_threshold": min_n,
        "allow_org_unit_selection": allow_org_unit_selection,
        "org_units": org_units,
        "questionnaire_version_id": str(qv.id),
        "questionnaire": qv.content,
    }
