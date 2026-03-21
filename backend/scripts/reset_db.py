"""Zera o banco de dados e recria via ORM + Alembic + seed.

Uso (sempre via Docker — evita bugs de encoding do psycopg2 no Windows):

    # Reset completo (drop + create_all + alembic stamp + seed)
    docker compose exec backend python scripts/reset_db.py -y

    # Só estrutura, sem seed
    docker compose exec backend python scripts/reset_db.py -y --no-seed
"""
from __future__ import annotations

import argparse
import os
import sys

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import text
from alembic.config import Config
from alembic import command

from app.db.base import Base
from app.models import *  # noqa — registra todos os models no Base.metadata
from app.db.session import engine, SessionLocal


def main() -> None:
    parser = argparse.ArgumentParser(description="Reset completo do banco de dados")
    parser.add_argument("--no-seed", action="store_true", help="Pular seed de dados iniciais")
    parser.add_argument("--yes", "-y", action="store_true", help="Pular confirmação interativa")
    args = parser.parse_args()

    db_url = engine.url.render_as_string(hide_password=True)

    if not args.yes:
        resp = input(f"ATENÇÃO: Vai APAGAR TUDO em {db_url}. Continuar? [y/N] ")
        if resp.strip().lower() not in ("y", "yes", "s", "sim"):
            print("Cancelado.")
            return

    print(f"=== RESET DATABASE === ({db_url})")

    # 1. Drop schema public cascade
    with engine.connect() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))
        conn.execute(text("GRANT ALL ON SCHEMA public TO public"))
        conn.commit()
    print("[1/4] Schema public dropped and recreated.")

    # 2. Create all tables via ORM (Base.metadata.create_all)
    Base.metadata.create_all(bind=engine)
    print("[2/4] Tables created via ORM (create_all).")

    # 3. Create alembic_version with wider column (revision IDs > 32 chars)
    with engine.connect() as conn:
        conn.execute(text(
            "CREATE TABLE IF NOT EXISTS alembic_version "
            "(version_num varchar(128) NOT NULL, "
            "CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num))"
        ))
        conn.commit()

    # 4. Stamp Alembic at head (migrations are complementary to create_all)
    alembic_ini = os.path.join(os.path.dirname(__file__), "..", "alembic.ini")
    alembic_cfg = Config(alembic_ini)
    alembic_cfg.set_main_option(
        "script_location",
        os.path.join(os.path.dirname(__file__), "..", "alembic"),
    )
    command.stamp(alembic_cfg, "head")
    print("[3/4] Alembic stamped at head.")

    # 4. Seed
    if not args.no_seed:
        from app.services.seed import seed_platform_defaults

        db = SessionLocal()
        try:
            seed_platform_defaults(db)
            print("[4/4] Seed aplicado (planos, roles, defaults).")
        finally:
            db.close()
    else:
        print("[4/4] Seed pulado (--no-seed).")

    print("=== DONE ===")


if __name__ == "__main__":
    main()
