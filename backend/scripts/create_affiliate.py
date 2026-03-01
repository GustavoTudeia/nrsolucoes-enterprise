from __future__ import annotations

import os
import sys

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.db.session import SessionLocal, engine
from app.db.base import Base
from app.models.affiliate import Affiliate

def main():
    Base.metadata.create_all(bind=engine)
    code = input("Affiliate code (ex: JOAO123): ").strip()
    name = input("Nome: ").strip()
    email = input("Email (opcional): ").strip() or None
    discount = float(input("Desconto para indicado % (ex: 5): ").strip() or "5")
    commission = float(input("Comissão do afiliado % (ex: 10): ").strip() or "10")

    db = SessionLocal()
    try:
        exists = db.query(Affiliate).filter(Affiliate.code == code).first()
        if exists:
            print("Já existe afiliado com esse code.")
            return
        a = Affiliate(code=code, name=name, email=email, status="active", discount_percent=discount, commission_percent=commission)
        db.add(a)
        db.commit()
        print(f"OK. Afiliado criado: {a.code} ({a.name})")
    finally:
        db.close()

if __name__ == "__main__":
    main()
