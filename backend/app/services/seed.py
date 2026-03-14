from __future__ import annotations

import os
import uuid

from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.user import Role, User, UserRoleScope
from app.models.billing import Plan

DEFAULT_ROLES = [
    ("PLATFORM_SUPER_ADMIN", "Platform Super Admin"),
    ("TENANT_ADMIN", "Tenant Admin"),
    ("TENANT_AUDITOR", "Tenant Auditor (read-only)"),
    ("CNPJ_MANAGER", "Gestor do CNPJ"),
    ("UNIT_MANAGER", "Gestor de Unidade/Setor"),
    ("SECURITY_ANALYST", "Analista de Segurança (risks/read)"),
    ("EMPLOYEE", "Colaborador (LMS)"),
]

DEFAULT_PLANS = [
    # (key, name, features, limits, price_monthly_cents, price_annual_cents, is_custom_price)
    (
        "START",
        "Start (Micro/Pequenas)",
        {
            # Módulos
            "CAMPAIGNS": True,
            "QUESTIONNAIRES": True,
            "LMS": True,
            "RISK_MAP": False,
            "ACTION_PLANS": False,
            "REPORTS": False,
            # Conformidade
            "ANONYMIZATION": True,
            "NR17": False,
            "ESOCIAL_EXPORT": False,
            "AUDIT": False,
            "AUDIT_EXPORT": False,
            # Infraestrutura
            "MULTI_CNPJ": False,
            "WHITE_LABEL": False,
            "SSO_OIDC": False,
            "API_ACCESS": False,
            "MULTI_TENANT_MANAGER": False,
        },
        {"cnpj_max": 1, "employees_max": 50, "users_max": 5, "campaigns_max": 3, "history_months": 12, "storage_gb": 5},
        0, 0, False,  # Grátis (trial)
    ),
    (
        "PRO",
        "Pro (PME/Médias)",
        {
            # Módulos
            "CAMPAIGNS": True,
            "QUESTIONNAIRES": True,
            "LMS": True,
            "RISK_MAP": True,
            "ACTION_PLANS": True,
            "REPORTS": True,
            # Conformidade
            "ANONYMIZATION": True,
            "NR17": True,
            "ESOCIAL_EXPORT": False,
            "AUDIT": True,
            "AUDIT_EXPORT": False,
            # Infraestrutura
            "MULTI_CNPJ": True,
            "WHITE_LABEL": False,
            "SSO_OIDC": False,
            "API_ACCESS": False,
            "MULTI_TENANT_MANAGER": False,
        },
        {"cnpj_max": 3, "employees_max": 300, "users_max": 30, "campaigns_max": 20, "history_months": 24, "storage_gb": 50},
        29900, 299000, False,  # R$299/mês ou R$2.990/ano
    ),
    (
        "ENTERPRISE",
        "Enterprise (Grandes)",
        {
            # Módulos
            "CAMPAIGNS": True,
            "QUESTIONNAIRES": True,
            "LMS": True,
            "RISK_MAP": True,
            "ACTION_PLANS": True,
            "REPORTS": True,
            # Conformidade
            "ANONYMIZATION": True,
            "NR17": True,
            "ESOCIAL_EXPORT": True,
            "AUDIT": True,
            "AUDIT_EXPORT": True,
            # Infraestrutura
            "MULTI_CNPJ": True,
            "WHITE_LABEL": True,
            "SSO_OIDC": True,
            "API_ACCESS": True,
            "MULTI_TENANT_MANAGER": False,
        },
        {"cnpj_max": 9999, "employees_max": 999999, "users_max": 9999, "campaigns_max": 9999, "history_months": 120, "storage_gb": 2000},
        None, None, True,  # Sob consulta
    ),
    (
        "SST",
        "SST/Parceiro",
        {
            # Módulos
            "CAMPAIGNS": True,
            "QUESTIONNAIRES": True,
            "LMS": True,
            "RISK_MAP": True,
            "ACTION_PLANS": True,
            "REPORTS": True,
            # Conformidade
            "ANONYMIZATION": True,
            "NR17": True,
            "ESOCIAL_EXPORT": True,
            "AUDIT": True,
            "AUDIT_EXPORT": True,
            # Infraestrutura
            "MULTI_CNPJ": True,
            "WHITE_LABEL": True,
            "SSO_OIDC": True,
            "API_ACCESS": True,
            "MULTI_TENANT_MANAGER": True,
        },
        {"client_max": 9999},
        None, None, True,  # Sob consulta
    ),
]


def seed_platform_defaults(db: Session) -> None:
    # Roles
    for key, name in DEFAULT_ROLES:
        exists = db.query(Role).filter(Role.key == key).first()
        if not exists:
            db.add(Role(key=key, name=name))
    db.commit()

    # Plans
    for key, name, features, limits, price_m, price_a, custom in DEFAULT_PLANS:
        exists = db.query(Plan).filter(Plan.key == key).first()
        if not exists:
            db.add(Plan(
                key=key, name=name, features=features, limits=limits,
                price_monthly=price_m or None, price_annual=price_a or None,
                is_custom_price=custom, is_active=True, stripe_price_id=None,
            ))
    db.commit()


    # Templates & Packs (biblioteca oficial)
    from datetime import datetime as _dt
    import uuid as _uuid
    from app.models.questionnaire import QuestionnaireTemplate, QuestionnaireVersion
    from app.models.lms import ContentItem
    from app.models.template_pack import TemplatePack, TemplatePackItem

    # 1) Questionários oficiais (NR-1 e NR-17) - idempotente por (tenant_id is NULL, key)
    default_questionnaires = [
        {
            "key": "NR1_GRO_PGR_DIAGNOSTICO",
            "name": "NR-1 • Diagnóstico GRO/PGR (Maturidade)",
            "description": "Questionário base para avaliar maturidade de GRO/PGR e governança de SST.",
            "content": {
                "dimensions": [
                    {"key": "governance", "name": "Governança e responsabilidade"},
                    {"key": "hazards", "name": "Identificação de perigos"},
                    {"key": "controls", "name": "Medidas de controle"},
                    {"key": "training", "name": "Treinamento e comunicação"},
                ],
                "questions": [
                    {"id": "q1", "text": "Existem responsáveis definidos para SST/GRO (papéis e responsabilidades)?", "dimension": "governance", "weight": 1, "scale_min": 1, "scale_max": 5},
                    {"id": "q2", "text": "O inventário de riscos é atualizado quando há mudanças no processo/ambiente?", "dimension": "hazards", "weight": 1, "scale_min": 1, "scale_max": 5},
                    {"id": "q3", "text": "Há participação dos trabalhadores na identificação de perigos e melhorias?", "dimension": "hazards", "weight": 1, "scale_min": 1, "scale_max": 5},
                    {"id": "q4", "text": "As medidas de controle são registradas, avaliadas e acompanhadas (efetividade)?", "dimension": "controls", "weight": 1, "scale_min": 1, "scale_max": 5},
                    {"id": "q5", "text": "Existe plano de ação com prazos, responsáveis e evidências para tratar riscos?", "dimension": "controls", "weight": 1, "scale_min": 1, "scale_max": 5},
                    {"id": "q6", "text": "Treinamentos e comunicações de SST são planejados e registrados (evidências)?", "dimension": "training", "weight": 1, "scale_min": 1, "scale_max": 5},
                    {"id": "q7", "text": "Há rotina de auditoria interna / verificação do cumprimento do PGR?", "dimension": "governance", "weight": 1, "scale_min": 1, "scale_max": 5},
                    {"id": "q8", "text": "Indicadores e incidentes são analisados para melhoria contínua (PDCA)?", "dimension": "governance", "weight": 1, "scale_min": 1, "scale_max": 5},
                ],
            },
        },
        {
            "key": "NR17_ERGONOMIA_ESCRITORIO",
            "name": "NR-17 • Ergonomia (Trabalho com Tela)",
            "description": "Checklist/avaliação rápida de ergonomia para postos com computador.",
            "content": {
                "dimensions": [
                    {"key": "workstation", "name": "Posto de trabalho"},
                    {"key": "posture", "name": "Postura e esforço"},
                    {"key": "breaks", "name": "Pausas e organização"},
                ],
                "questions": [
                    {"id": "e1", "text": "A cadeira permite ajuste adequado (altura/encosto/braços) ao usuário?", "dimension": "workstation", "weight": 1, "scale_min": 1, "scale_max": 5},
                    {"id": "e2", "text": "O monitor está posicionado com altura e distância adequadas?", "dimension": "workstation", "weight": 1, "scale_min": 1, "scale_max": 5},
                    {"id": "e3", "text": "Teclado e mouse permitem postura neutra de punhos e ombros?", "dimension": "posture", "weight": 1, "scale_min": 1, "scale_max": 5},
                    {"id": "e4", "text": "Há repetitividade e/ou esforço estático prolongado durante a jornada?", "dimension": "posture", "weight": 1, "scale_min": 1, "scale_max": 5},
                    {"id": "e5", "text": "Existem pausas programadas e variação de tarefas?", "dimension": "breaks", "weight": 1, "scale_min": 1, "scale_max": 5},
                    {"id": "e6", "text": "O trabalhador recebeu orientação/treinamento sobre ergonomia e ajustes?", "dimension": "breaks", "weight": 1, "scale_min": 1, "scale_max": 5},
                ],
            },
        },
    ]

    created_q_ids = []
    for q in default_questionnaires:
        t = (
            db.query(QuestionnaireTemplate)
            .filter(QuestionnaireTemplate.tenant_id.is_(None), QuestionnaireTemplate.key == q["key"])
            .first()
        )
        if not t:
            t = QuestionnaireTemplate(
                id=_uuid.uuid4(),
                tenant_id=None,
                key=q["key"],
                name=q["name"],
                description=q.get("description"),
                is_platform_managed=True,
                is_active=True,
            )
            db.add(t)
            db.flush()

            v = QuestionnaireVersion(
                id=_uuid.uuid4(),
                template_id=t.id,
                version=1,
                status="published",
                content=q["content"],
                published_at=_dt.utcnow(),
            )
            db.add(v)
            db.flush()
        created_q_ids.append(t.id)
    db.commit()

    # 2) Conteúdos oficiais (LMS) - idempotente por (tenant_id is NULL, title)
    default_contents = [
        {
            "title": "NR-1 • Introdução ao GRO/PGR",
            "description": "Conteúdo base para onboarding de gestores e equipes sobre GRO/PGR.",
            "content_type": "link",
            "url": "https://www.gov.br/trabalho-e-emprego/pt-br",
        },
        {
            "title": "NR-17 • Ergonomia no trabalho (conceitos)",
            "description": "Conteúdo base sobre ergonomia e boas práticas para postos com tela.",
            "content_type": "link",
            "url": "https://www.gov.br/trabalho-e-emprego/pt-br",
        },
    ]
    created_c_ids = []
    for c in default_contents:
        ci = (
            db.query(ContentItem)
            .filter(ContentItem.tenant_id.is_(None), ContentItem.title == c["title"])
            .first()
        )
        if not ci:
            ci = ContentItem(
                id=_uuid.uuid4(),
                tenant_id=None,
                title=c["title"],
                description=c.get("description"),
                content_type=c.get("content_type") or "link",
                url=c.get("url"),
                storage_key=None,
                duration_minutes=None,
                is_platform_managed=True,
                is_active=True,
            )
            db.add(ci)
            db.flush()
        created_c_ids.append(ci.id)
    db.commit()

    # 3) Pack default (NR1_DEFAULT) - agrega templates oficiais e é aplicado automaticamente a novos tenants
    pack = db.query(TemplatePack).filter(TemplatePack.key == "NR1_DEFAULT").first()
    if not pack:
        pack = TemplatePack(
            id=_uuid.uuid4(),
            key="NR1_DEFAULT",
            name="Pack NR-1 (Padrão)",
            description="Templates oficiais (questionários e conteúdos) aplicados automaticamente no onboarding de novos tenants.",
            is_active=True,
        )
        db.add(pack)
        db.flush()

    # Itens do pack: idempotente por (pack_id, item_type, item_id)
    order = 0
    for tid in created_q_ids:
        exists = (
            db.query(TemplatePackItem)
            .filter(
                TemplatePackItem.pack_id == pack.id,
                TemplatePackItem.item_type == "questionnaire_template",
                TemplatePackItem.item_id == tid,
            )
            .first()
        )
        if not exists:
            db.add(
                TemplatePackItem(
                    id=_uuid.uuid4(),
                    pack_id=pack.id,
                    item_type="questionnaire_template",
                    item_id=tid,
                    order_index=order,
                )
            )
            order += 10

    for cid in created_c_ids:
        exists = (
            db.query(TemplatePackItem)
            .filter(
                TemplatePackItem.pack_id == pack.id,
                TemplatePackItem.item_type == "content_item",
                TemplatePackItem.item_id == cid,
            )
            .first()
        )
        if not exists:
            db.add(
                TemplatePackItem(
                    id=_uuid.uuid4(),
                    pack_id=pack.id,
                    item_type="content_item",
                    item_id=cid,
                    order_index=order,
                )
            )
            order += 10

    db.commit()
    # Optional bootstrap of a first Platform Admin user for brand-new environments.
    seed_platform_admin(db)


def seed_platform_admin(db: Session) -> None:
    """Create or harden a Platform Admin user if BOOTSTRAP_PLATFORM_ADMIN_* env vars are set.

    This is intentionally opt-in: if the env vars are not set, this function is a no-op.

    Env vars:
      - BOOTSTRAP_PLATFORM_ADMIN_EMAIL
      - BOOTSTRAP_PLATFORM_ADMIN_PASSWORD
      - BOOTSTRAP_PLATFORM_ADMIN_NAME (optional)
      - BOOTSTRAP_PLATFORM_ADMIN_TENANT_ID (optional; gives the platform admin a default tenant context)
    """

    email = (os.getenv("BOOTSTRAP_PLATFORM_ADMIN_EMAIL") or "").strip().lower()
    password = os.getenv("BOOTSTRAP_PLATFORM_ADMIN_PASSWORD") or ""
    full_name = (os.getenv("BOOTSTRAP_PLATFORM_ADMIN_NAME") or "Platform Admin").strip()
    tenant_id_raw = (os.getenv("BOOTSTRAP_PLATFORM_ADMIN_TENANT_ID") or "").strip()

    if not email or not password:
        return

    tenant_id = None
    if tenant_id_raw:
        try:
            tenant_id = uuid.UUID(tenant_id_raw)
        except Exception:
            # Invalid tenant id -> ignore; the platform admin can still operate
            # platform-level endpoints.
            tenant_id = None

    user = db.query(User).filter(User.email == email).first()
    if not user:
        # Observação: o modelo User usa o campo `password_hash`.
        # A rotação de senha é intencionalmente manual (não alteramos senha de contas existentes).
        user = User(
            id=uuid.uuid4(),
            tenant_id=tenant_id,
            email=email,
            full_name=full_name,
            password_hash=hash_password(password),
            is_platform_admin=True,
            is_active=True,
        )
        db.add(user)
        db.flush()
    else:
        # Ensure the account is usable and privileged as requested.
        changed = False
        if not user.is_platform_admin:
            user.is_platform_admin = True
            changed = True
        if not user.is_active:
            user.is_active = True
            changed = True
        if tenant_id and user.tenant_id != tenant_id:
            user.tenant_id = tenant_id
            changed = True

        # Não rotacionamos senha automaticamente para evitar efeitos colaterais em upgrades.
        if changed:
            db.add(user)

    role = db.query(Role).filter(Role.key == "PLATFORM_SUPER_ADMIN").first()
    if role:
        scope = (
            db.query(UserRoleScope)
            .filter(
                UserRoleScope.user_id == user.id,
                UserRoleScope.role_id == role.id,
                UserRoleScope.tenant_id.is_(None),
                UserRoleScope.cnpj_id.is_(None),
                UserRoleScope.org_unit_id.is_(None),
            )
            .first()
        )
        if not scope:
            db.add(
                UserRoleScope(
                    id=uuid.uuid4(),
                    user_id=user.id,
                    role_id=role.id,
                    tenant_id=None,
                    cnpj_id=None,
                    org_unit_id=None,
                )
            )

    db.commit()
