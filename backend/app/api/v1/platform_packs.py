from __future__ import annotations

import uuid
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import asc

from app.api.deps import require_platform_admin, get_request_meta
from app.core.audit import make_audit_event
from app.core.errors import BadRequest, NotFound
from app.db.session import get_db
from app.models.template_pack import TemplatePack, TemplatePackItem
from app.schemas.template_pack import (
    TemplatePackCreate,
    TemplatePackOut,
    TemplatePackDetailOut,
    TemplatePackItemCreate,
    TemplatePackItemOut,
)
from app.services.template_packs import apply_pack_to_tenant


router = APIRouter(prefix="/platform/packs")


@router.get("", response_model=List[TemplatePackOut])
def list_packs(db: Session = Depends(get_db), admin=Depends(require_platform_admin)):
    packs = db.query(TemplatePack).order_by(TemplatePack.key.asc()).all()
    return [
        TemplatePackOut(
            id=p.id,
            key=p.key,
            name=p.name,
            description=p.description,
            is_active=p.is_active,
            created_at=p.created_at,
            updated_at=p.updated_at,
        )
        for p in packs
    ]


@router.post("", response_model=TemplatePackOut)
def create_pack(
    payload: TemplatePackCreate,
    db: Session = Depends(get_db),
    admin=Depends(require_platform_admin),
    meta: dict = Depends(get_request_meta),
):
    key = (payload.key or "").strip().upper()
    if not key:
        raise BadRequest("key inválida")

    exists = db.query(TemplatePack).filter(TemplatePack.key == key).first()
    if exists:
        raise BadRequest("Já existe um pack com essa key")

    p = TemplatePack(
        id=uuid.uuid4(),
        key=key,
        name=payload.name.strip(),
        description=payload.description,
        is_active=payload.is_active,
    )
    db.add(p)
    db.flush()

    db.add(
        make_audit_event(
            tenant_id=None,
            actor_user_id=admin.id,
            action="CREATE",
            entity_type="TEMPLATE_PACK",
            entity_id=p.id,
            before=None,
            after={"key": p.key, "name": p.name},
            ip=meta.get("ip"),
            user_agent=meta.get("user_agent"),
            request_id=meta.get("request_id"),
        )
    )
    db.commit()
    db.refresh(p)
    return TemplatePackOut(
        id=p.id,
        key=p.key,
        name=p.name,
        description=p.description,
        is_active=p.is_active,
        created_at=p.created_at,
        updated_at=p.updated_at,
    )


@router.get("/{pack_id}", response_model=TemplatePackDetailOut)
def get_pack(pack_id: UUID, db: Session = Depends(get_db), admin=Depends(require_platform_admin)):
    p = db.query(TemplatePack).filter(TemplatePack.id == pack_id).first()
    if not p:
        raise NotFound("Pack não encontrado")
    items = (
        db.query(TemplatePackItem)
        .filter(TemplatePackItem.pack_id == p.id)
        .order_by(asc(TemplatePackItem.order_index), asc(TemplatePackItem.created_at))
        .all()
    )
    return TemplatePackDetailOut(
        id=p.id,
        key=p.key,
        name=p.name,
        description=p.description,
        is_active=p.is_active,
        created_at=p.created_at,
        updated_at=p.updated_at,
        items=[
            TemplatePackItemOut(
                id=i.id,
                pack_id=i.pack_id,
                item_type=i.item_type,
                item_id=i.item_id,
                order_index=i.order_index,
                created_at=i.created_at,
            )
            for i in items
        ],
    )


@router.put("/{pack_id}", response_model=TemplatePackOut)
def update_pack(
    pack_id: UUID,
    payload: TemplatePackCreate,
    db: Session = Depends(get_db),
    admin=Depends(require_platform_admin),
    meta: dict = Depends(get_request_meta),
):
    p = db.query(TemplatePack).filter(TemplatePack.id == pack_id).first()
    if not p:
        raise NotFound("Pack não encontrado")

    before = {"name": p.name, "description": p.description, "is_active": p.is_active}
    p.name = payload.name.strip()
    p.description = payload.description
    p.is_active = payload.is_active

    db.add(
        make_audit_event(
            tenant_id=None,
            actor_user_id=admin.id,
            action="UPDATE",
            entity_type="TEMPLATE_PACK",
            entity_id=p.id,
            before=before,
            after={"name": p.name, "description": p.description, "is_active": p.is_active},
            ip=meta.get("ip"),
            user_agent=meta.get("user_agent"),
            request_id=meta.get("request_id"),
        )
    )
    db.commit()
    db.refresh(p)
    return TemplatePackOut(
        id=p.id,
        key=p.key,
        name=p.name,
        description=p.description,
        is_active=p.is_active,
        created_at=p.created_at,
        updated_at=p.updated_at,
    )


@router.post("/{pack_id}/items", response_model=TemplatePackItemOut)
def add_item(
    pack_id: UUID,
    payload: TemplatePackItemCreate,
    db: Session = Depends(get_db),
    admin=Depends(require_platform_admin),
    meta: dict = Depends(get_request_meta),
):
    p = db.query(TemplatePack).filter(TemplatePack.id == pack_id).first()
    if not p:
        raise NotFound("Pack não encontrado")

    itype = (payload.item_type or "").strip().lower()
    if itype not in {"questionnaire_template", "content_item", "learning_path"}:
        raise BadRequest("item_type inválido")

    exists = (
        db.query(TemplatePackItem)
        .filter(
            TemplatePackItem.pack_id == pack_id,
            TemplatePackItem.item_type == itype,
            TemplatePackItem.item_id == payload.item_id,
        )
        .first()
    )
    if exists:
        return TemplatePackItemOut(
            id=exists.id,
            pack_id=exists.pack_id,
            item_type=exists.item_type,
            item_id=exists.item_id,
            order_index=exists.order_index,
            created_at=exists.created_at,
        )

    item = TemplatePackItem(
        id=uuid.uuid4(),
        pack_id=pack_id,
        item_type=itype,
        item_id=payload.item_id,
        order_index=payload.order_index or 0,
    )
    db.add(item)
    db.flush()

    db.add(
        make_audit_event(
            tenant_id=None,
            actor_user_id=admin.id,
            action="CREATE",
            entity_type="TEMPLATE_PACK_ITEM",
            entity_id=item.id,
            before=None,
            after={"pack_id": str(pack_id), "item_type": itype, "item_id": str(payload.item_id)},
            ip=meta.get("ip"),
            user_agent=meta.get("user_agent"),
            request_id=meta.get("request_id"),
        )
    )
    db.commit()
    db.refresh(item)
    return TemplatePackItemOut(
        id=item.id,
        pack_id=item.pack_id,
        item_type=item.item_type,
        item_id=item.item_id,
        order_index=item.order_index,
        created_at=item.created_at,
    )


@router.delete("/{pack_id}/items/{item_id}", response_model=dict)
def remove_item(
    pack_id: UUID,
    item_id: UUID,
    db: Session = Depends(get_db),
    admin=Depends(require_platform_admin),
    meta: dict = Depends(get_request_meta),
):
    item = db.query(TemplatePackItem).filter(TemplatePackItem.pack_id == pack_id, TemplatePackItem.id == item_id).first()
    if not item:
        raise NotFound("Item não encontrado")
    db.delete(item)

    db.add(
        make_audit_event(
            tenant_id=None,
            actor_user_id=admin.id,
            action="DELETE",
            entity_type="TEMPLATE_PACK_ITEM",
            entity_id=item_id,
            before={"item_type": item.item_type, "item_id": str(item.item_id)},
            after=None,
            ip=meta.get("ip"),
            user_agent=meta.get("user_agent"),
            request_id=meta.get("request_id"),
        )
    )
    db.commit()
    return {"ok": True}


@router.post("/{pack_id}/apply/{tenant_id}", response_model=dict)
def apply_pack(
    pack_id: UUID,
    tenant_id: UUID,
    db: Session = Depends(get_db),
    admin=Depends(require_platform_admin),
    meta: dict = Depends(get_request_meta),
):
    p = db.query(TemplatePack).filter(TemplatePack.id == pack_id).first()
    if not p:
        raise NotFound("Pack não encontrado")
    result = apply_pack_to_tenant(db, pack_key=p.key, tenant_id=tenant_id)
    db.add(
        make_audit_event(
            tenant_id=None,
            actor_user_id=admin.id,
            action="EXECUTE",
            entity_type="TEMPLATE_PACK",
            entity_id=p.id,
            before=None,
            after={"tenant_id": str(tenant_id), "result": result},
            ip=meta.get("ip"),
            user_agent=meta.get("user_agent"),
            request_id=meta.get("request_id"),
        )
    )
    db.commit()
    return {"ok": True, "applied": result}
