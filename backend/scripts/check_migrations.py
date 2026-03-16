from __future__ import annotations

from app.core.migrations import get_migration_status
from app.db.session import engine


if __name__ == "__main__":
    status = get_migration_status(engine)
    print({
        "current_revision": status.current_revision,
        "head_revision": status.head_revision,
        "is_current": status.is_current,
    })
    raise SystemExit(0 if status.is_current else 1)
