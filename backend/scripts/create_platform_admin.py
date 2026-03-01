from __future__ import annotations

import os
import sys
from getpass import getpass

# Ensure backend/app is in path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.db.session import SessionLocal, engine
from app.db.base import Base
from app.models.user import User
from app.core.security import hash_password

def main():
    Base.metadata.create_all(bind=engine)
    email = input("Email do admin da plataforma: ").strip()
    name = input("Nome: ").strip()
    pwd = getpass("Senha: ").strip()

    db = SessionLocal()
    try:
        exists = db.query(User).filter(User.email == email).first()
        if exists:
            print("Já existe um usuário com esse e-mail.")
            return
        u = User(
            tenant_id=None,
            email=email,
            full_name=name,
            password_hash=hash_password(pwd),
            is_active=True,
            is_platform_admin=True,
        )
        db.add(u)
        db.commit()
        print(f"OK. Platform admin criado: {u.email}")
    finally:
        db.close()

if __name__ == "__main__":
    main()
