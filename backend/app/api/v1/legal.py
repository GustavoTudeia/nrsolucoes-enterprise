from __future__ import annotations

from datetime import datetime
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_request_meta
from app.core.config import settings
from app.db.session import get_db
from app.models.legal import LegalAcceptance
from app.schemas.legal import LegalRequiredOut, LegalStatusOut, LegalAcceptRequest, LegalAcceptOut

router = APIRouter(prefix="/legal")


def _required() -> LegalRequiredOut:
    return LegalRequiredOut(
        terms_version=settings.LEGAL_TERMS_VERSION,
        privacy_version=settings.LEGAL_PRIVACY_VERSION,
        terms_url=settings.LEGAL_TERMS_URL,
        privacy_url=settings.LEGAL_PRIVACY_URL,
    )


@router.get("/required", response_model=LegalRequiredOut)
def get_required():
    return _required()


@router.get("/me", response_model=LegalStatusOut)
def my_legal_status(
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    req = _required()
    rec = (
        db.query(LegalAcceptance)
        .filter(
            LegalAcceptance.user_id == user.id,
            LegalAcceptance.terms_version == req.terms_version,
            LegalAcceptance.privacy_version == req.privacy_version,
        )
        .order_by(LegalAcceptance.accepted_at.desc())
        .first()
    )
    return LegalStatusOut(
        required=req,
        accepted_terms_version=rec.terms_version if rec else None,
        accepted_privacy_version=rec.privacy_version if rec else None,
        accepted_at=rec.accepted_at if rec else None,
        is_missing=(rec is None),
    )


@router.post("/accept", response_model=LegalAcceptOut)
def accept_terms(
    payload: LegalAcceptRequest,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    meta: dict = Depends(get_request_meta),
):
    req = _required()
    existing = (
        db.query(LegalAcceptance)
        .filter(
            LegalAcceptance.user_id == user.id,
            LegalAcceptance.terms_version == req.terms_version,
            LegalAcceptance.privacy_version == req.privacy_version,
        )
        .first()
    )
    if existing:
        return LegalAcceptOut(status="ok")

    rec = LegalAcceptance(
        tenant_id=user.tenant_id,
        user_id=user.id,
        terms_version=req.terms_version,
        privacy_version=req.privacy_version,
        accepted_at=datetime.utcnow(),
        ip=meta.get("ip"),
        user_agent=meta.get("user_agent"),
    )
    db.add(rec)
    db.commit()
    return LegalAcceptOut(status="ok")
