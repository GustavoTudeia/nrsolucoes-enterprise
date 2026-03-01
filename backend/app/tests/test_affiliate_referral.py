from datetime import datetime
import json

from app.models.affiliate import Affiliate, CommissionLedger
from app.models.tenant import Tenant, TenantSettings
from app.models.billing import TenantSubscription
from app.models.user import User, Role, UserRoleScope
from app.core.security import hash_password
from app.services.billing_stripe import handle_stripe_webhook

def test_public_signup_with_affiliate(client, db):
    # create affiliate
    a = Affiliate(code="JOAO123", name="Joao", status="active", discount_percent=5.0, commission_percent=10.0)
    db.add(a); db.commit(); db.refresh(a)

    # public signup
    r = client.post("/api/v1/public/signup", json={
        "company_name": "Empresa X",
        "slug": "empresa-x",
        "admin_email": "admin@x.com",
        "admin_name": "Admin",
        "admin_password": "StrongPass123!",
        "affiliate_code": "JOAO123"
    })
    assert r.status_code == 200
    tenant_id = r.json()["tenant_id"]
    # resolve tenant and check referral stored
    t = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    assert t is not None
    assert str(t.referred_by_affiliate_id) == str(a.id)

def test_invoice_paid_creates_commission_ledger(client, db, monkeypatch):
    # affiliate + tenant
    a = Affiliate(code="JOAO123", name="Joao", status="active", discount_percent=5.0, commission_percent=10.0)
    db.add(a); db.flush()

    t = Tenant(name="T", slug="t", is_active=True, referred_by_affiliate_id=a.id)
    db.add(t); db.flush()
    db.add(TenantSettings(tenant_id=t.id, min_anon_threshold=5))

    sub = TenantSubscription(tenant_id=t.id, status="active", provider_customer_id="cus_123", provider_subscription_id="sub_123", entitlements_snapshot={"features":{"LMS":True},"limits":{}})
    db.add(sub)
    db.commit()

    # fake stripe event JSON (dev mode: no signature, parsed as json)
    event = {
        "type": "invoice.paid",
        "data": {
            "object": {
                "id": "in_001",
                "subscription": "sub_123",
                "customer": "cus_123",
                "amount_paid": 10000,
                "currency": "brl",
                "metadata": {"tenant_id": str(t.id)},
                "total_discount_amounts": [{"amount": 500}],
            }
        }
    }
    payload = json.dumps(event).encode("utf-8")
    res = handle_stripe_webhook(db, payload, sig_header=None)
    assert res["status"] in ("ok","invalid")  # ok in dev/test secretless
    led = db.query(CommissionLedger).filter(CommissionLedger.provider_invoice_id == "in_001").first()
    assert led is not None
    assert led.net_amount == 100.0
    assert round(led.commission_amount, 4) == 10.0
