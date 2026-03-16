from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import text
from sqlalchemy.engine import Engine

from app.core.config import settings


@dataclass
class MigrationStatus:
    current_revision: str | None
    head_revision: str | None
    is_current: bool



def get_alembic_config() -> Config:
    base_dir = Path(__file__).resolve().parents[2]
    cfg = Config(str(base_dir / "alembic.ini"))
    cfg.set_main_option("script_location", str(base_dir / "alembic"))
    cfg.set_main_option("sqlalchemy.url", settings.DATABASE_URL)
    return cfg



def get_migration_status(engine: Engine) -> MigrationStatus:
    cfg = get_alembic_config()
    script = ScriptDirectory.from_config(cfg)
    head = script.get_current_head()
    current = None
    try:
        with engine.connect() as conn:
            current = conn.execute(text("SELECT version_num FROM alembic_version LIMIT 1")).scalar()
    except Exception:
        current = None
    return MigrationStatus(current_revision=current, head_revision=head, is_current=bool(current and head and current == head))
