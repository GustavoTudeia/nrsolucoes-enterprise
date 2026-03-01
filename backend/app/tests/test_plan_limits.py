import pytest
from app.models.tenant import Tenant, TenantSettings
from app.models.billing import TenantSubscription
from app.services.plan_limits import enforce_limit
from app.core.errors import Forbidden

def test_enforce_limit_blocks(db):
    t = Tenant(name="T", slug="t-limit", is_active=True)
    db.add(t); db.flush()
    db.add(TenantSettings(tenant_id=t.id, min_anon_threshold=2))
    db.add(TenantSubscription(tenant_id=t.id, status="active", entitlements_snapshot={"features":{}, "limits":{"cnpjs":1}}))
    db.commit()

    with pytest.raises(Forbidden):
        enforce_limit(db, t.id, "cnpjs", current_count=1, increment=1)
