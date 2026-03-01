"""Seed de planos (DEPRECATED).

Historicamente este script continha uma segunda fonte de verdade para planos,
com chaves/limites diferentes de app/services/seed.py.

Para operação enterprise, isso causa inconsistência e confusão.

✅ Use este script apenas como atalho para chamar o seed oficial.
"""

from __future__ import annotations

import os
import sys

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.db.session import SessionLocal, engine
from app.db.base import Base
from app.services.seed import seed_platform_defaults


def main():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_platform_defaults(db)
        print("OK. Planos seeded/atualizados via app.services.seed.seed_platform_defaults().")
    finally:
        db.close()


if __name__ == "__main__":
    main()
