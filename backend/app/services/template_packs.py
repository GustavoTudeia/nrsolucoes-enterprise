from __future__ import annotations

from datetime import datetime
import uuid
from typing import Dict, Tuple

from sqlalchemy.orm import Session
from sqlalchemy import asc

from app.models.template_pack import TemplatePack, TemplatePackItem
from app.models.questionnaire import QuestionnaireTemplate, QuestionnaireVersion
from app.models.lms import ContentItem, LearningPath, LearningPathItem


def get_pack_by_key(db: Session, pack_key: str) -> TemplatePack | None:
    return db.query(TemplatePack).filter(TemplatePack.key == pack_key).first()


def apply_pack_to_tenant(db: Session, pack_key: str, tenant_id: uuid.UUID) -> Dict[str, int]:
    """Clona templates de um pack (plataforma) para um tenant (tenant-owned).

    Importante:
    - Não altera os templates oficiais.
    - Cria cópias com `tenant_id=<tenant>` e `is_platform_managed=False`.
    - Idempotência: tenta não duplicar por 'key/title' quando já existir no tenant.
    """
    pack = get_pack_by_key(db, pack_key)
    if not pack or not pack.is_active:
        return {"questionnaires": 0, "contents": 0, "learning_paths": 0}

    items = (
        db.query(TemplatePackItem)
        .filter(TemplatePackItem.pack_id == pack.id)
        .order_by(asc(TemplatePackItem.order_index), asc(TemplatePackItem.created_at))
        .all()
    )

    # 1) Conteúdos (para mapear IDs se houver learning paths)
    content_map: Dict[uuid.UUID, uuid.UUID] = {}
    contents_created = 0
    for it in [i for i in items if i.item_type == "content_item"]:
        src = db.query(ContentItem).filter(ContentItem.id == it.item_id).first()
        if not src:
            continue
        # Idempotência simples por título
        exists = (
            db.query(ContentItem)
            .filter(ContentItem.tenant_id == tenant_id, ContentItem.title == src.title)
            .first()
        )
        if exists:
            content_map[src.id] = exists.id
            continue

        clone = ContentItem(
            id=uuid.uuid4(),
            tenant_id=tenant_id,
            title=src.title,
            description=src.description,
            content_type=src.content_type,
            url=src.url,
            storage_key=src.storage_key,
            duration_minutes=src.duration_minutes,
            is_platform_managed=False,
            is_active=src.is_active,
        )
        db.add(clone)
        db.flush()
        content_map[src.id] = clone.id
        contents_created += 1

    # 2) Questionários
    questionnaire_map: Dict[uuid.UUID, uuid.UUID] = {}
    questionnaires_created = 0
    for it in [i for i in items if i.item_type == "questionnaire_template"]:
        src_t = db.query(QuestionnaireTemplate).filter(QuestionnaireTemplate.id == it.item_id).first()
        if not src_t:
            continue

        exists = (
            db.query(QuestionnaireTemplate)
            .filter(
                QuestionnaireTemplate.tenant_id == tenant_id,
                QuestionnaireTemplate.key == src_t.key,
            )
            .first()
        )
        if exists:
            questionnaire_map[src_t.id] = exists.id
            continue

        clone_t = QuestionnaireTemplate(
            id=uuid.uuid4(),
            tenant_id=tenant_id,
            key=src_t.key,
            name=src_t.name,
            description=src_t.description,
            is_platform_managed=False,
            is_active=src_t.is_active,
        )
        db.add(clone_t)
        db.flush()
        questionnaire_map[src_t.id] = clone_t.id

        # Clonar a última versão publicada (ou a última versão)
        versions = (
            db.query(QuestionnaireVersion)
            .filter(QuestionnaireVersion.template_id == src_t.id)
            .order_by(QuestionnaireVersion.version.desc(), QuestionnaireVersion.created_at.desc())
            .all()
        )
        chosen = None
        for v in versions:
            if (v.status or "").lower() == "published":
                chosen = v
                break
        if not chosen and versions:
            chosen = versions[0]

        if chosen:
            clone_v = QuestionnaireVersion(
                id=uuid.uuid4(),
                template_id=clone_t.id,
                version=1,
                status="published",
                content=chosen.content,
                published_at=datetime.utcnow(),
            )
            db.add(clone_v)
        questionnaires_created += 1

    # 3) Learning paths (opcional)
    learning_paths_created = 0
    for it in [i for i in items if i.item_type == "learning_path"]:
        src_lp = db.query(LearningPath).filter(LearningPath.id == it.item_id).first()
        if not src_lp:
            continue

        exists = (
            db.query(LearningPath)
            .filter(LearningPath.tenant_id == tenant_id, LearningPath.title == src_lp.title)
            .first()
        )
        if exists:
            continue

        clone_lp = LearningPath(
            id=uuid.uuid4(),
            tenant_id=tenant_id,
            title=src_lp.title,
            description=src_lp.description,
            is_platform_managed=False,
        )
        db.add(clone_lp)
        db.flush()

        # itens da trilha: remapear content_item_id se clonado; se não, mantém o original
        src_items = (
            db.query(LearningPathItem)
            .filter(LearningPathItem.learning_path_id == src_lp.id)
            .order_by(LearningPathItem.order_index.asc())
            .all()
        )
        for s in src_items:
            new_content_id = content_map.get(s.content_item_id) or s.content_item_id
            db.add(
                LearningPathItem(
                    id=uuid.uuid4(),
                    learning_path_id=clone_lp.id,
                    content_item_id=new_content_id,
                    order_index=s.order_index,
                )
            )
        learning_paths_created += 1

    return {
        "questionnaires": questionnaires_created,
        "contents": contents_created,
        "learning_paths": learning_paths_created,
    }
