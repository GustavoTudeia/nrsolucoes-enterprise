from __future__ import annotations

import os
import sys
from getpass import getpass
from uuid import UUID

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.db.session import SessionLocal, engine
from app.db.base import Base
from app.models.user import User, Role, UserRoleScope
from app.core.security import hash_password

def main():
    Base.metadata.create_all(bind=engine)
    tenant_id = UUID(input("Tenant ID: ").strip())
    email = input("Email do TENANT_ADMIN: ").strip()
    name = input("Nome: ").strip()
    pwd = getpass("Senha: ").strip()

    db = SessionLocal()
    try:
        exists = db.query(User).filter(User.email == email).first()
        if exists:
            print("Já existe um usuário com esse e-mail.")
            return
        u = User(
            tenant_id=tenant_id,
            email=email,
            full_name=name,
            password_hash=hash_password(pwd),
            is_active=True,
            is_platform_admin=False,
        )
        db.add(u)
        db.flush()

        role = db.query(Role).filter(Role.key == "TENANT_ADMIN").first()
        if not role:
            role = Role(key="TENANT_ADMIN", name="Tenant Admin")
            db.add(role)
            db.flush()

        db.add(UserRoleScope(user_id=u.id, role_id=role.id, tenant_id=tenant_id))
        db.commit()
        print(f"OK. TENANT_ADMIN criado: {u.email} (tenant {tenant_id})")
    finally:
        db.close()

if __name__ == "__main__":
    main()
