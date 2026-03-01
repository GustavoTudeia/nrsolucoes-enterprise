from __future__ import annotations

from datetime import datetime
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from uuid import UUID

from app.db.session import get_db
from app.api.deps import require_platform_admin
from app.core.errors import BadRequest, NotFound
from app.models.affiliate import Affiliate, CommissionLedger, Payout
from app.schemas.affiliate import AffiliateCreate, AffiliateOut
from app.schemas.affiliate_finance import LedgerOut, PayoutCreate, PayoutOut

router = APIRouter(prefix="/affiliates")

@router.post("", response_model=AffiliateOut)
def create_affiliate(payload: AffiliateCreate, db: Session = Depends(get_db), _admin=Depends(require_platform_admin)):
    if db.query(Affiliate).filter(Affiliate.code == payload.code).first():
        raise BadRequest("Code já existe")
    a = Affiliate(
        code=payload.code.strip(),
        name=payload.name,
        email=str(payload.email) if payload.email else None,
        document=payload.document,
        status="active",
        discount_percent=payload.discount_percent,
        commission_percent=payload.commission_percent,
    )
    db.add(a)
    db.commit()
    db.refresh(a)
    return AffiliateOut(
        id=a.id, code=a.code, name=a.name, email=a.email, status=a.status,
        discount_percent=a.discount_percent, commission_percent=a.commission_percent
    )

@router.get("", response_model=list[AffiliateOut])
def list_affiliates(db: Session = Depends(get_db), _admin=Depends(require_platform_admin)):
    rows = db.query(Affiliate).all()
    return [
        AffiliateOut(
            id=a.id, code=a.code, name=a.name, email=a.email, status=a.status,
            discount_percent=a.discount_percent, commission_percent=a.commission_percent
        ) for a in rows
    ]

@router.get("/ledger", response_model=list[LedgerOut])
def list_ledger(status: str | None = None, db: Session = Depends(get_db), _admin=Depends(require_platform_admin)):
    q = db.query(CommissionLedger)
    if status:
        q = q.filter(CommissionLedger.status == status)
    rows = q.order_by(CommissionLedger.created_at.desc()).all()
    return [LedgerOut(
        id=r.id,
        affiliate_id=r.affiliate_id,
        tenant_id=r.tenant_id,
        provider_invoice_id=r.provider_invoice_id,
        net_amount=r.net_amount,
        commission_amount=r.commission_amount,
        status=r.status,
    ) for r in rows]

@router.post("/{affiliate_id}/payouts", response_model=PayoutOut)
def create_payout(affiliate_id: UUID, payload: PayoutCreate, db: Session = Depends(get_db), _admin=Depends(require_platform_admin)):
    a = db.query(Affiliate).filter(Affiliate.id == affiliate_id).first()
    if not a:
        raise NotFound("Afiliado não encontrado")
    p = Payout(
        affiliate_id=a.id,
        amount=payload.amount,
        currency="brl",
        status="initiated",
        method=payload.method,
        reference=payload.reference,
        paid_at=None,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return PayoutOut(id=p.id, affiliate_id=p.affiliate_id, amount=p.amount, currency=p.currency, status=p.status, method=p.method, reference=p.reference)

@router.post("/payouts/{payout_id}/mark-paid", response_model=PayoutOut)
def mark_payout_paid(payout_id: UUID, db: Session = Depends(get_db), _admin=Depends(require_platform_admin)):
    p = db.query(Payout).filter(Payout.id == payout_id).first()
    if not p:
        raise NotFound("Payout não encontrado")
    p.status = "paid"
    p.paid_at = datetime.utcnow()
    db.add(p)
    db.commit()
    db.refresh(p)
    return PayoutOut(id=p.id, affiliate_id=p.affiliate_id, amount=p.amount, currency=p.currency, status=p.status, method=p.method, reference=p.reference)
