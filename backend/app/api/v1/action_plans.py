"""API de Plano de Ação Enterprise 2.0

Endpoints para:
- CRUD de planos e itens
- Comentários e colaboração
- Upload de evidências
- Histórico de mudanças
- Estatísticas e dashboard
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional, List
from uuid import UUID

from fastapi import APIRouter, Depends, Query, UploadFile, File
from sqlalchemy import func, case
from sqlalchemy.orm import Session, joinedload

from app.api.deps import (
    require_any_role,
    tenant_id_from_user,
    get_request_meta,
    require_active_subscription,
)
from app.core.audit import make_audit_event
from app.core.errors import NotFound, BadRequest
from app.core.rbac import ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER
from app.db.session import get_db
from app.models.action_plan import (
    ActionPlan,
    ActionItem,
    ActionEvidence,
    ActionItemComment,
    ActionItemHistory,
)
from app.models.risk import RiskAssessment
from app.models.user import User
from app.schemas.action_plan import (
    ActionPlanCreate,
    ActionPlanUpdate,
    ActionPlanOut,
    ActionPlanStats,
    ActionItemCreate,
    ActionItemUpdate,
    ActionItemOut,
    ActionEvidenceCreate,
    ActionEvidenceOut,
    ActionItemCommentCreate,
    ActionItemCommentUpdate,
    ActionItemCommentOut,
    ActionItemHistoryOut,
    ResponsibleUserInfo,
    BulkStatusUpdate,
    BulkAssignResponsible,
    ActionPlanDashboard,
)
from app.schemas.common import Page

router = APIRouter(prefix="/action-plans")


# =============================================================================
# HELPERS
# =============================================================================


def _user_info(user: Optional[User]) -> Optional[ResponsibleUserInfo]:
    """Converte User para ResponsibleUserInfo."""
    if not user:
        return None
    return ResponsibleUserInfo(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
    )


def _calculate_item_flags(item: ActionItem) -> tuple[bool, Optional[int]]:
    """Calcula is_overdue e days_until_due."""
    is_overdue = False
    days_until_due = None

    if item.due_date and item.status not in ("done", "cancelled"):
        now = datetime.utcnow()
        delta = (item.due_date - now).days
        days_until_due = delta
        is_overdue = delta < 0

    return is_overdue, days_until_due


def _evidence_out(e: ActionEvidence) -> ActionEvidenceOut:
    """Converte ActionEvidence para ActionEvidenceOut."""
    return ActionEvidenceOut(
        id=e.id,
        action_item_id=e.action_item_id,
        evidence_type=e.evidence_type,
        reference=e.reference,
        note=e.note,
        file_name=e.file_name,
        file_size=e.file_size,
        file_type=e.file_type,
        storage_key=e.storage_key,
        created_by_user_id=e.created_by_user_id,
        created_by_user=(
            _user_info(e.created_by_user)
            if hasattr(e, "created_by_user") and e.created_by_user
            else None
        ),
        created_at=e.created_at,
    )


def _comment_out(c: ActionItemComment) -> ActionItemCommentOut:
    """Converte ActionItemComment para ActionItemCommentOut."""
    return ActionItemCommentOut(
        id=c.id,
        action_item_id=c.action_item_id,
        user_id=c.user_id,
        user=_user_info(c.user) if hasattr(c, "user") and c.user else None,
        content=c.content,
        mentions=c.mentions,
        edited_at=c.edited_at,
        created_at=c.created_at,
    )


def _history_out(h: ActionItemHistory) -> ActionItemHistoryOut:
    """Converte ActionItemHistory para ActionItemHistoryOut."""
    return ActionItemHistoryOut(
        id=h.id,
        action_item_id=h.action_item_id,
        user_id=h.user_id,
        user=_user_info(h.user) if hasattr(h, "user") and h.user else None,
        field_changed=h.field_changed,
        old_value=h.old_value,
        new_value=h.new_value,
        changed_at=h.changed_at,
    )


def _item_out(
    item: ActionItem,
    include_evidences: bool = False,
    include_comments: bool = False,
    include_history: bool = False,
) -> ActionItemOut:
    """Converte ActionItem para ActionItemOut."""
    is_overdue, days_until_due = _calculate_item_flags(item)

    evs = None
    if include_evidences and item.evidences:
        evs = [_evidence_out(e) for e in item.evidences]

    comments = None
    if include_comments and item.comments:
        comments = [_comment_out(c) for c in item.comments]

    history = None
    if include_history and item.history:
        history = [_history_out(h) for h in item.history]

    return ActionItemOut(
        id=item.id,
        action_plan_id=item.action_plan_id,
        item_type=item.item_type,
        title=item.title,
        description=item.description,
        responsible=item.responsible,
        responsible_user_id=item.responsible_user_id,
        responsible_user=(
            _user_info(item.responsible_user)
            if hasattr(item, "responsible_user") and item.responsible_user
            else None
        ),
        due_date=item.due_date,
        started_at=item.started_at,
        completed_at=item.completed_at,
        status=item.status,
        priority=item.priority or "medium",
        related_dimension=item.related_dimension,
        education_ref_type=item.education_ref_type,
        education_ref_id=item.education_ref_id,
        created_by_user_id=item.created_by_user_id,
        created_at=item.created_at,
        is_overdue=is_overdue,
        days_until_due=days_until_due,
        evidences=evs,
        comments=comments,
        history=history,
        evidence_count=len(item.evidences) if item.evidences else 0,
        comment_count=len(item.comments) if item.comments else 0,
    )


def _calculate_plan_stats(items: List[ActionItem]) -> ActionPlanStats:
    """Calcula estatísticas do plano."""
    stats = ActionPlanStats()
    stats.total_items = len(items)

    by_type = {}
    by_priority = {}

    for item in items:
        # Por status
        if item.status == "planned":
            stats.planned += 1
        elif item.status == "in_progress":
            stats.in_progress += 1
        elif item.status == "done":
            stats.done += 1
        elif item.status == "blocked":
            stats.blocked += 1
        elif item.status == "cancelled":
            stats.cancelled += 1

        # Atrasados
        is_overdue, _ = _calculate_item_flags(item)
        if is_overdue:
            stats.overdue += 1

        # Por tipo
        by_type[item.item_type] = by_type.get(item.item_type, 0) + 1

        # Por prioridade
        prio = item.priority or "medium"
        by_priority[prio] = by_priority.get(prio, 0) + 1

    stats.by_type = by_type
    stats.by_priority = by_priority

    # Percentual de conclusão (exclui cancelados)
    active_items = stats.total_items - stats.cancelled
    if active_items > 0:
        stats.completion_percentage = round((stats.done / active_items) * 100, 1)

    return stats


def _plan_out(
    plan: ActionPlan,
    include_items: bool = False,
    include_evidences: bool = False,
    include_stats: bool = False,
) -> ActionPlanOut:
    """Converte ActionPlan para ActionPlanOut."""
    items = None
    stats = None

    if include_items and plan.items:
        items = [_item_out(i, include_evidences=include_evidences) for i in plan.items]

    if include_stats and plan.items:
        stats = _calculate_plan_stats(plan.items)

    return ActionPlanOut(
        id=plan.id,
        risk_assessment_id=plan.risk_assessment_id,
        status=plan.status,
        version=plan.version,
        title=plan.title,
        description=plan.description,
        target_completion_date=plan.target_completion_date,
        closed_at=plan.closed_at,
        created_by_user_id=plan.created_by_user_id,
        created_at=plan.created_at,
        items=items,
        stats=stats,
    )


def _record_history(
    db: Session,
    item: ActionItem,
    user_id: UUID,
    tenant_id: UUID,
    field: str,
    old_value: Optional[str],
    new_value: Optional[str],
):
    """Registra mudança no histórico."""
    if old_value == new_value:
        return

    h = ActionItemHistory(
        tenant_id=tenant_id,
        action_item_id=item.id,
        user_id=user_id,
        field_changed=field,
        old_value=str(old_value) if old_value is not None else None,
        new_value=str(new_value) if new_value is not None else None,
        changed_at=datetime.utcnow(),
    )
    db.add(h)


# =============================================================================
# PLAN ENDPOINTS
# =============================================================================


@router.get("", response_model=Page[ActionPlanOut])
def list_plans(
    risk_assessment_id: Optional[UUID] = Query(default=None),
    campaign_id: Optional[UUID] = Query(default=None),
    cnpj_id: Optional[UUID] = Query(default=None),
    org_unit_id: Optional[UUID] = Query(default=None),
    status: Optional[str] = Query(default=None, description="open|closed|archived"),
    include_items: bool = Query(default=False),
    include_evidences: bool = Query(default=False),
    include_stats: bool = Query(default=False),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    user=Depends(
        require_any_role([ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER])
    ),
    tenant_id: UUID = Depends(tenant_id_from_user),
):
    """Lista planos de ação com filtros e estatísticas opcionais."""
    base = db.query(ActionPlan).filter(ActionPlan.tenant_id == tenant_id)

    if risk_assessment_id:
        base = base.filter(ActionPlan.risk_assessment_id == risk_assessment_id)

    if status:
        base = base.filter(ActionPlan.status == status)

    # Filtros via RiskAssessment join
    if campaign_id or cnpj_id or org_unit_id:
        base = base.join(
            RiskAssessment, RiskAssessment.id == ActionPlan.risk_assessment_id
        )
        if campaign_id:
            base = base.filter(RiskAssessment.campaign_id == campaign_id)
        if cnpj_id:
            base = base.filter(RiskAssessment.cnpj_id == cnpj_id)
        if org_unit_id:
            base = base.filter(RiskAssessment.org_unit_id == org_unit_id)

    total = base.count()

    if include_items or include_stats:
        base = base.options(
            joinedload(ActionPlan.items).joinedload(ActionItem.evidences)
        )

    rows = base.order_by(ActionPlan.created_at.desc()).offset(offset).limit(limit).all()
    items = [
        _plan_out(
            p,
            include_items=include_items,
            include_evidences=include_evidences,
            include_stats=include_stats,
        )
        for p in rows
    ]
    return Page(items=items, total=total, limit=limit, offset=offset)


@router.get("/dashboard", response_model=ActionPlanDashboard)
def get_dashboard(
    cnpj_id: Optional[UUID] = Query(default=None),
    org_unit_id: Optional[UUID] = Query(default=None),
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    user=Depends(
        require_any_role([ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER])
    ),
    tenant_id: UUID = Depends(tenant_id_from_user),
):
    """Dashboard consolidado de planos de ação."""
    # Base query para planos
    plan_query = db.query(ActionPlan).filter(ActionPlan.tenant_id == tenant_id)

    if cnpj_id or org_unit_id:
        plan_query = plan_query.join(
            RiskAssessment, RiskAssessment.id == ActionPlan.risk_assessment_id
        )
        if cnpj_id:
            plan_query = plan_query.filter(RiskAssessment.cnpj_id == cnpj_id)
        if org_unit_id:
            plan_query = plan_query.filter(RiskAssessment.org_unit_id == org_unit_id)

    plans = plan_query.options(joinedload(ActionPlan.items)).all()

    dashboard = ActionPlanDashboard()
    dashboard.total_plans = len(plans)
    dashboard.open_plans = sum(1 for p in plans if p.status == "open")
    dashboard.closed_plans = sum(1 for p in plans if p.status == "closed")

    all_items = []
    for plan in plans:
        all_items.extend(plan.items or [])

    dashboard.total_items = len(all_items)

    now = datetime.utcnow()
    week_from_now = now + timedelta(days=7)

    by_responsible = {}

    for item in all_items:
        # Contagem por status
        if item.status == "planned":
            dashboard.items_planned += 1
        elif item.status == "in_progress":
            dashboard.items_in_progress += 1
        elif item.status == "done":
            dashboard.items_done += 1

        # Atrasados
        is_overdue, _ = _calculate_item_flags(item)
        if is_overdue:
            dashboard.items_overdue += 1
            if len(dashboard.overdue_items) < 10:
                dashboard.overdue_items.append(_item_out(item))

        # Críticos
        if item.priority == "critical" and item.status not in ("done", "cancelled"):
            if len(dashboard.critical_items) < 10:
                dashboard.critical_items.append(_item_out(item))

        # Vence esta semana
        if item.due_date and item.status not in ("done", "cancelled"):
            if now <= item.due_date <= week_from_now:
                if len(dashboard.due_this_week) < 10:
                    dashboard.due_this_week.append(_item_out(item))

        # Por responsável
        resp_name = item.responsible or "Não atribuído"
        if resp_name not in by_responsible:
            by_responsible[resp_name] = {"total": 0, "done": 0}
        by_responsible[resp_name]["total"] += 1
        if item.status == "done":
            by_responsible[resp_name]["done"] += 1

    # Percentual geral
    active_items = dashboard.total_items - sum(
        1 for i in all_items if i.status == "cancelled"
    )
    if active_items > 0:
        dashboard.overall_completion = round(
            (dashboard.items_done / active_items) * 100, 1
        )

    # Formatar por responsável
    dashboard.by_responsible = [
        {"name": name, "total": data["total"], "done": data["done"]}
        for name, data in sorted(
            by_responsible.items(), key=lambda x: x[1]["total"], reverse=True
        )
    ]

    return dashboard


# =============================================================================
# USERS FOR ASSIGNMENT (deve vir ANTES de /{plan_id} para não conflitar)
# =============================================================================


@router.get("/users", response_model=List[ResponsibleUserInfo])
def list_assignable_users(
    q: Optional[str] = Query(default=None, description="Busca por nome ou email"),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    user=Depends(
        require_any_role([ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER])
    ),
    tenant_id: UUID = Depends(tenant_id_from_user),
):
    """Lista usuários que podem ser atribuídos como responsáveis."""
    base = db.query(User).filter(User.tenant_id == tenant_id, User.is_active == True)

    if q:
        like = f"%{q.strip()}%"
        base = base.filter((User.full_name.ilike(like)) | (User.email.ilike(like)))

    rows = base.order_by(User.full_name).limit(limit).all()
    return [
        ResponsibleUserInfo(id=u.id, email=u.email, full_name=u.full_name) for u in rows
    ]


@router.get("/{plan_id}", response_model=ActionPlanOut)
def get_plan(
    plan_id: UUID,
    include_items: bool = Query(default=True),
    include_evidences: bool = Query(default=True),
    include_stats: bool = Query(default=True),
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    user=Depends(
        require_any_role([ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER])
    ),
    tenant_id: UUID = Depends(tenant_id_from_user),
):
    """Retorna um plano com itens, evidências e estatísticas."""
    q = db.query(ActionPlan).filter(
        ActionPlan.id == plan_id, ActionPlan.tenant_id == tenant_id
    )
    if include_items:
        q = q.options(
            joinedload(ActionPlan.items).joinedload(ActionItem.evidences),
            joinedload(ActionPlan.items).joinedload(ActionItem.responsible_user),
        )
    plan = q.first()
    if not plan:
        raise NotFound("Plano não encontrado")
    return _plan_out(
        plan,
        include_items=include_items,
        include_evidences=include_evidences,
        include_stats=include_stats,
    )


@router.post("", response_model=dict)
def create_plan(
    payload: ActionPlanCreate,
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    user=Depends(
        require_any_role([ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER])
    ),
    tenant_id: UUID = Depends(tenant_id_from_user),
    meta: dict = Depends(get_request_meta),
):
    """Cria um novo plano de ação vinculado a uma avaliação de risco."""
    ra = (
        db.query(RiskAssessment)
        .filter(
            RiskAssessment.id == payload.risk_assessment_id,
            RiskAssessment.tenant_id == tenant_id,
        )
        .first()
    )
    if not ra:
        raise NotFound("Avaliação de risco não encontrada")

    plan = ActionPlan(
        tenant_id=tenant_id,
        risk_assessment_id=ra.id,
        title=payload.title,
        description=payload.description,
        target_completion_date=payload.target_completion_date,
        status="open",
        version=1,
        created_by_user_id=user.id,
    )
    db.add(plan)
    db.flush()

    db.add(
        make_audit_event(
            tenant_id,
            user.id,
            "CREATE",
            "ACTION_PLAN",
            plan.id,
            None,
            {"risk_assessment_id": str(ra.id), "title": plan.title},
            meta.get("ip"),
            meta.get("user_agent"),
            meta.get("request_id"),
        )
    )
    db.commit()
    return {"id": str(plan.id), "status": plan.status}


@router.patch("/{plan_id}", response_model=dict)
def update_plan(
    plan_id: UUID,
    payload: ActionPlanUpdate,
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    user=Depends(
        require_any_role([ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER])
    ),
    tenant_id: UUID = Depends(tenant_id_from_user),
    meta: dict = Depends(get_request_meta),
):
    """Atualiza um plano de ação."""
    plan = (
        db.query(ActionPlan)
        .filter(ActionPlan.id == plan_id, ActionPlan.tenant_id == tenant_id)
        .first()
    )
    if not plan:
        raise NotFound("Plano não encontrado")

    before = {"status": plan.status, "title": plan.title}

    data = payload.model_dump(exclude_unset=True)

    # Se fechando o plano, registrar data
    if data.get("status") == "closed" and plan.status != "closed":
        plan.closed_at = datetime.utcnow()
        plan.closed_by_user_id = user.id

    for k, v in data.items():
        setattr(plan, k, v)

    db.add(
        make_audit_event(
            tenant_id,
            user.id,
            "UPDATE",
            "ACTION_PLAN",
            plan.id,
            before,
            data,
            meta.get("ip"),
            meta.get("user_agent"),
            meta.get("request_id"),
        )
    )
    db.commit()
    return {"id": str(plan.id), "status": plan.status}


# =============================================================================
# ITEM ENDPOINTS
# =============================================================================


@router.get("/{plan_id}/items", response_model=Page[ActionItemOut])
def list_items(
    plan_id: UUID,
    status: Optional[str] = Query(default=None),
    priority: Optional[str] = Query(default=None),
    responsible_user_id: Optional[UUID] = Query(default=None),
    include_evidences: bool = Query(default=False),
    include_comments: bool = Query(default=False),
    limit: int = Query(default=100, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    user=Depends(
        require_any_role([ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER])
    ),
    tenant_id: UUID = Depends(tenant_id_from_user),
):
    """Lista itens de um plano com filtros."""
    plan = (
        db.query(ActionPlan)
        .filter(ActionPlan.id == plan_id, ActionPlan.tenant_id == tenant_id)
        .first()
    )
    if not plan:
        raise NotFound("Plano não encontrado")

    base = db.query(ActionItem).filter(
        ActionItem.action_plan_id == plan.id, ActionItem.tenant_id == tenant_id
    )

    if status:
        base = base.filter(ActionItem.status == status)
    if priority:
        base = base.filter(ActionItem.priority == priority)
    if responsible_user_id:
        base = base.filter(ActionItem.responsible_user_id == responsible_user_id)

    total = base.count()

    if include_evidences:
        base = base.options(joinedload(ActionItem.evidences))
    if include_comments:
        base = base.options(
            joinedload(ActionItem.comments).joinedload(ActionItemComment.user)
        )

    base = base.options(joinedload(ActionItem.responsible_user))

    rows = base.order_by(ActionItem.created_at.desc()).offset(offset).limit(limit).all()
    items = [
        _item_out(
            r, include_evidences=include_evidences, include_comments=include_comments
        )
        for r in rows
    ]
    return Page(items=items, total=total, limit=limit, offset=offset)


@router.post("/{plan_id}/items", response_model=dict)
def add_item(
    plan_id: UUID,
    payload: ActionItemCreate,
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    user=Depends(
        require_any_role([ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER])
    ),
    tenant_id: UUID = Depends(tenant_id_from_user),
    meta: dict = Depends(get_request_meta),
):
    """Adiciona um item ao plano."""
    plan = (
        db.query(ActionPlan)
        .filter(ActionPlan.id == plan_id, ActionPlan.tenant_id == tenant_id)
        .first()
    )
    if not plan:
        raise NotFound("Plano não encontrado")

    # Validar responsável se fornecido
    if payload.responsible_user_id:
        resp_user = (
            db.query(User).filter(User.id == payload.responsible_user_id).first()
        )
        if not resp_user:
            raise BadRequest("Usuário responsável não encontrado")

    item = ActionItem(
        tenant_id=tenant_id,
        action_plan_id=plan.id,
        item_type=payload.item_type,
        title=payload.title,
        description=payload.description,
        responsible=payload.responsible,
        responsible_user_id=payload.responsible_user_id,
        due_date=payload.due_date,
        status=payload.status,
        priority=payload.priority,
        related_dimension=payload.related_dimension,
        education_ref_type=payload.education_ref_type,
        education_ref_id=payload.education_ref_id,
        notify_on_assignment=payload.notify_on_assignment,
        notify_before_due=payload.notify_before_due,
        notify_days_before=payload.notify_days_before,
        created_by_user_id=user.id,
    )
    db.add(item)
    db.flush()

    # Registrar criação no histórico
    _record_history(db, item, user.id, tenant_id, "created", None, "Item criado")

    db.add(
        make_audit_event(
            tenant_id,
            user.id,
            "CREATE",
            "ACTION_ITEM",
            item.id,
            None,
            {
                "title": item.title,
                "responsible_user_id": (
                    str(item.responsible_user_id) if item.responsible_user_id else None
                ),
            },
            meta.get("ip"),
            meta.get("user_agent"),
            meta.get("request_id"),
        )
    )
    db.commit()

    # TODO: Enviar notificação se notify_on_assignment e responsible_user_id

    return {"id": str(item.id)}


@router.get("/items/{item_id}", response_model=ActionItemOut)
def get_item(
    item_id: UUID,
    include_evidences: bool = Query(default=True),
    include_comments: bool = Query(default=True),
    include_history: bool = Query(default=False),
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    user=Depends(
        require_any_role([ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER])
    ),
    tenant_id: UUID = Depends(tenant_id_from_user),
):
    """Retorna um item com evidências, comentários e histórico."""
    q = db.query(ActionItem).filter(
        ActionItem.id == item_id, ActionItem.tenant_id == tenant_id
    )

    if include_evidences:
        q = q.options(
            joinedload(ActionItem.evidences).joinedload(ActionEvidence.created_by_user)
        )
    if include_comments:
        q = q.options(
            joinedload(ActionItem.comments).joinedload(ActionItemComment.user)
        )
    if include_history:
        q = q.options(joinedload(ActionItem.history).joinedload(ActionItemHistory.user))

    q = q.options(joinedload(ActionItem.responsible_user))

    item = q.first()
    if not item:
        raise NotFound("Item não encontrado")
    return _item_out(
        item,
        include_evidences=include_evidences,
        include_comments=include_comments,
        include_history=include_history,
    )


@router.patch("/items/{item_id}", response_model=dict)
def update_item(
    item_id: UUID,
    payload: ActionItemUpdate,
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    user=Depends(
        require_any_role([ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER])
    ),
    tenant_id: UUID = Depends(tenant_id_from_user),
    meta: dict = Depends(get_request_meta),
):
    """Atualiza um item do plano com histórico de mudanças."""
    item = (
        db.query(ActionItem)
        .filter(ActionItem.id == item_id, ActionItem.tenant_id == tenant_id)
        .first()
    )
    if not item:
        raise NotFound("Item não encontrado")

    before = {
        "title": item.title,
        "description": item.description,
        "responsible": item.responsible,
        "responsible_user_id": (
            str(item.responsible_user_id) if item.responsible_user_id else None
        ),
        "due_date": item.due_date.isoformat() if item.due_date else None,
        "status": item.status,
        "priority": item.priority,
    }

    data = payload.model_dump(exclude_unset=True)

    # Registrar mudanças no histórico
    for field, new_value in data.items():
        old_value = getattr(item, field, None)
        if old_value != new_value:
            old_str = str(old_value) if old_value is not None else None
            new_str = str(new_value) if new_value is not None else None
            _record_history(db, item, user.id, tenant_id, field, old_str, new_str)

    # Controle de datas automático
    if data.get("status") == "in_progress" and item.status == "planned":
        item.started_at = datetime.utcnow()
    elif data.get("status") == "done" and item.status != "done":
        item.completed_at = datetime.utcnow()

    for k, v in data.items():
        setattr(item, k, v)

    # Converter UUIDs e datas para strings para serialização JSON
    after_json = {}
    for k, v in data.items():
        if isinstance(v, UUID):
            after_json[k] = str(v)
        elif hasattr(v, "isoformat"):
            after_json[k] = v.isoformat()
        else:
            after_json[k] = v

    db.add(
        make_audit_event(
            tenant_id,
            user.id,
            "UPDATE",
            "ACTION_ITEM",
            item.id,
            before,
            after_json,
            meta.get("ip"),
            meta.get("user_agent"),
            meta.get("request_id"),
        )
    )
    db.commit()
    return {"id": str(item.id)}


@router.delete("/items/{item_id}", response_model=dict)
def delete_item(
    item_id: UUID,
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    user=Depends(require_any_role([ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER])),
    tenant_id: UUID = Depends(tenant_id_from_user),
    meta: dict = Depends(get_request_meta),
):
    """Remove um item do plano."""
    item = (
        db.query(ActionItem)
        .filter(ActionItem.id == item_id, ActionItem.tenant_id == tenant_id)
        .first()
    )
    if not item:
        raise NotFound("Item não encontrado")

    db.add(
        make_audit_event(
            tenant_id,
            user.id,
            "DELETE",
            "ACTION_ITEM",
            item.id,
            {"title": item.title},
            None,
            meta.get("ip"),
            meta.get("user_agent"),
            meta.get("request_id"),
        )
    )

    db.delete(item)
    db.commit()
    return {"deleted": True}


# =============================================================================
# BULK OPERATIONS
# =============================================================================


@router.post("/items/bulk-status", response_model=dict)
def bulk_update_status(
    payload: BulkStatusUpdate,
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    user=Depends(
        require_any_role([ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER])
    ),
    tenant_id: UUID = Depends(tenant_id_from_user),
    meta: dict = Depends(get_request_meta),
):
    """Atualiza status de múltiplos itens."""
    items = (
        db.query(ActionItem)
        .filter(ActionItem.id.in_(payload.item_ids), ActionItem.tenant_id == tenant_id)
        .all()
    )

    updated = 0
    for item in items:
        old_status = item.status
        if old_status != payload.status:
            _record_history(
                db, item, user.id, tenant_id, "status", old_status, payload.status
            )
            item.status = payload.status

            if payload.status == "in_progress" and old_status == "planned":
                item.started_at = datetime.utcnow()
            elif payload.status == "done" and old_status != "done":
                item.completed_at = datetime.utcnow()

            updated += 1

    db.commit()
    return {"updated": updated}


@router.post("/items/bulk-assign", response_model=dict)
def bulk_assign_responsible(
    payload: BulkAssignResponsible,
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    user=Depends(
        require_any_role([ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER])
    ),
    tenant_id: UUID = Depends(tenant_id_from_user),
    meta: dict = Depends(get_request_meta),
):
    """Atribui responsável a múltiplos itens."""
    # Validar usuário
    resp_user = db.query(User).filter(User.id == payload.responsible_user_id).first()
    if not resp_user:
        raise BadRequest("Usuário responsável não encontrado")

    items = (
        db.query(ActionItem)
        .filter(ActionItem.id.in_(payload.item_ids), ActionItem.tenant_id == tenant_id)
        .all()
    )

    updated = 0
    for item in items:
        old_id = str(item.responsible_user_id) if item.responsible_user_id else None
        new_id = str(payload.responsible_user_id)
        if old_id != new_id:
            _record_history(
                db, item, user.id, tenant_id, "responsible_user_id", old_id, new_id
            )
            item.responsible_user_id = payload.responsible_user_id
            item.responsible = resp_user.full_name or resp_user.email
            updated += 1

    db.commit()
    return {"updated": updated}


# =============================================================================
# EVIDENCE ENDPOINTS
# =============================================================================


@router.get("/items/{item_id}/evidences", response_model=Page[ActionEvidenceOut])
def list_evidences(
    item_id: UUID,
    limit: int = Query(default=100, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    user=Depends(
        require_any_role([ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER])
    ),
    tenant_id: UUID = Depends(tenant_id_from_user),
):
    """Lista evidências de um item."""
    item = (
        db.query(ActionItem)
        .filter(ActionItem.id == item_id, ActionItem.tenant_id == tenant_id)
        .first()
    )
    if not item:
        raise NotFound("Item não encontrado")

    base = (
        db.query(ActionEvidence)
        .filter(
            ActionEvidence.action_item_id == item.id,
            ActionEvidence.tenant_id == tenant_id,
        )
        .options(joinedload(ActionEvidence.created_by_user))
    )

    total = base.count()
    rows = (
        base.order_by(ActionEvidence.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    items = [_evidence_out(r) for r in rows]
    return Page(items=items, total=total, limit=limit, offset=offset)


@router.post("/items/{item_id}/evidences", response_model=dict)
def add_evidence(
    item_id: UUID,
    payload: ActionEvidenceCreate,
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    user=Depends(
        require_any_role([ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER])
    ),
    tenant_id: UUID = Depends(tenant_id_from_user),
    meta: dict = Depends(get_request_meta),
):
    """Adiciona evidência a um item."""
    item = (
        db.query(ActionItem)
        .filter(ActionItem.id == item_id, ActionItem.tenant_id == tenant_id)
        .first()
    )
    if not item:
        raise NotFound("Item não encontrado")

    ev = ActionEvidence(
        tenant_id=tenant_id,
        action_item_id=item.id,
        evidence_type=payload.evidence_type,
        reference=payload.reference,
        note=payload.note,
        file_name=payload.file_name,
        file_size=payload.file_size,
        file_type=payload.file_type,
        storage_key=payload.storage_key,
        created_by_user_id=user.id,
    )
    db.add(ev)
    db.flush()

    # Registrar no histórico
    _record_history(
        db, item, user.id, tenant_id, "evidence_added", None, payload.evidence_type
    )

    db.add(
        make_audit_event(
            tenant_id,
            user.id,
            "CREATE",
            "ACTION_EVIDENCE",
            ev.id,
            None,
            {"type": ev.evidence_type, "item_id": str(item.id)},
            meta.get("ip"),
            meta.get("user_agent"),
            meta.get("request_id"),
        )
    )
    db.commit()
    return {"id": str(ev.id)}


@router.delete("/items/{item_id}/evidences/{evidence_id}", response_model=dict)
def delete_evidence(
    item_id: UUID,
    evidence_id: UUID,
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    user=Depends(
        require_any_role([ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER])
    ),
    tenant_id: UUID = Depends(tenant_id_from_user),
    meta: dict = Depends(get_request_meta),
):
    """Remove uma evidência."""
    ev = (
        db.query(ActionEvidence)
        .filter(
            ActionEvidence.id == evidence_id,
            ActionEvidence.action_item_id == item_id,
            ActionEvidence.tenant_id == tenant_id,
        )
        .first()
    )
    if not ev:
        raise NotFound("Evidência não encontrada")

    db.add(
        make_audit_event(
            tenant_id,
            user.id,
            "DELETE",
            "ACTION_EVIDENCE",
            ev.id,
            {"type": ev.evidence_type},
            None,
            meta.get("ip"),
            meta.get("user_agent"),
            meta.get("request_id"),
        )
    )

    db.delete(ev)
    db.commit()
    return {"deleted": True}


@router.post("/items/{item_id}/evidences/upload-url", response_model=dict)
def get_evidence_upload_url(
    item_id: UUID,
    file_name: str = Query(..., description="Nome do arquivo"),
    content_type: str = Query(..., description="MIME type do arquivo"),
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    user=Depends(
        require_any_role([ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER])
    ),
    tenant_id: UUID = Depends(tenant_id_from_user),
):
    """Gera URL presigned para upload de arquivo de evidência."""
    from app.services.storage import create_upload_url
    import uuid

    item = (
        db.query(ActionItem)
        .filter(ActionItem.id == item_id, ActionItem.tenant_id == tenant_id)
        .first()
    )
    if not item:
        raise NotFound("Item não encontrado")

    # Gerar key única
    ext = file_name.split(".")[-1] if "." in file_name else ""
    storage_key = (
        f"evidences/{tenant_id}/{item_id}/{uuid.uuid4()}.{ext}"
        if ext
        else f"evidences/{tenant_id}/{item_id}/{uuid.uuid4()}"
    )

    result = create_upload_url(storage_key, content_type)

    return {
        "upload_url": result.url,
        "storage_key": storage_key,
        "expires_in": result.expires_in,
    }


@router.get(
    "/items/{item_id}/evidences/{evidence_id}/download-url", response_model=dict
)
def get_evidence_download_url(
    item_id: UUID,
    evidence_id: UUID,
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    user=Depends(
        require_any_role([ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER])
    ),
    tenant_id: UUID = Depends(tenant_id_from_user),
):
    """Gera URL presigned para download de arquivo de evidência."""
    from app.services.storage import create_access_url

    ev = (
        db.query(ActionEvidence)
        .filter(
            ActionEvidence.id == evidence_id,
            ActionEvidence.action_item_id == item_id,
            ActionEvidence.tenant_id == tenant_id,
        )
        .first()
    )
    if not ev:
        raise NotFound("Evidência não encontrada")

    if not ev.storage_key:
        raise BadRequest("Esta evidência não possui arquivo anexado")

    result = create_access_url(ev.storage_key)

    return {
        "download_url": result.url,
        "file_name": ev.file_name,
        "expires_in": result.expires_in,
    }


# =============================================================================
# COMMENT ENDPOINTS
# =============================================================================


@router.get("/items/{item_id}/comments", response_model=Page[ActionItemCommentOut])
def list_comments(
    item_id: UUID,
    limit: int = Query(default=100, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    user=Depends(
        require_any_role([ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER])
    ),
    tenant_id: UUID = Depends(tenant_id_from_user),
):
    """Lista comentários de um item."""
    item = (
        db.query(ActionItem)
        .filter(ActionItem.id == item_id, ActionItem.tenant_id == tenant_id)
        .first()
    )
    if not item:
        raise NotFound("Item não encontrado")

    base = (
        db.query(ActionItemComment)
        .filter(
            ActionItemComment.action_item_id == item.id,
            ActionItemComment.tenant_id == tenant_id,
        )
        .options(joinedload(ActionItemComment.user))
    )

    total = base.count()
    rows = (
        base.order_by(ActionItemComment.created_at.asc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    items = [_comment_out(c) for c in rows]
    return Page(items=items, total=total, limit=limit, offset=offset)


@router.post("/items/{item_id}/comments", response_model=dict)
def add_comment(
    item_id: UUID,
    payload: ActionItemCommentCreate,
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    user=Depends(
        require_any_role([ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER])
    ),
    tenant_id: UUID = Depends(tenant_id_from_user),
    meta: dict = Depends(get_request_meta),
):
    """Adiciona comentário a um item."""
    item = (
        db.query(ActionItem)
        .filter(ActionItem.id == item_id, ActionItem.tenant_id == tenant_id)
        .first()
    )
    if not item:
        raise NotFound("Item não encontrado")

    comment = ActionItemComment(
        tenant_id=tenant_id,
        action_item_id=item.id,
        user_id=user.id,
        content=payload.content,
        mentions=[str(m) for m in payload.mentions] if payload.mentions else [],
    )
    db.add(comment)
    db.flush()

    db.add(
        make_audit_event(
            tenant_id,
            user.id,
            "CREATE",
            "ACTION_COMMENT",
            comment.id,
            None,
            {"item_id": str(item.id)},
            meta.get("ip"),
            meta.get("user_agent"),
            meta.get("request_id"),
        )
    )
    db.commit()

    # TODO: Enviar notificação para mencionados

    return {"id": str(comment.id)}


@router.patch("/items/{item_id}/comments/{comment_id}", response_model=dict)
def update_comment(
    item_id: UUID,
    comment_id: UUID,
    payload: ActionItemCommentUpdate,
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    user=Depends(
        require_any_role([ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER])
    ),
    tenant_id: UUID = Depends(tenant_id_from_user),
):
    """Edita um comentário (apenas o autor)."""
    comment = (
        db.query(ActionItemComment)
        .filter(
            ActionItemComment.id == comment_id,
            ActionItemComment.action_item_id == item_id,
            ActionItemComment.tenant_id == tenant_id,
        )
        .first()
    )
    if not comment:
        raise NotFound("Comentário não encontrado")

    # Apenas o autor pode editar
    if comment.user_id != user.id:
        raise BadRequest("Apenas o autor pode editar o comentário")

    comment.content = payload.content
    comment.edited_at = datetime.utcnow()
    db.commit()
    return {"id": str(comment.id)}


@router.delete("/items/{item_id}/comments/{comment_id}", response_model=dict)
def delete_comment(
    item_id: UUID,
    comment_id: UUID,
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    user=Depends(
        require_any_role([ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER])
    ),
    tenant_id: UUID = Depends(tenant_id_from_user),
):
    """Remove um comentário (autor ou admin)."""
    comment = (
        db.query(ActionItemComment)
        .filter(
            ActionItemComment.id == comment_id,
            ActionItemComment.action_item_id == item_id,
            ActionItemComment.tenant_id == tenant_id,
        )
        .first()
    )
    if not comment:
        raise NotFound("Comentário não encontrado")

    # Autor ou admin podem deletar
    # (verificação de admin já feita pelo require_any_role)

    db.delete(comment)
    db.commit()
    return {"deleted": True}


# =============================================================================
# HISTORY ENDPOINT
# =============================================================================


@router.get("/items/{item_id}/history", response_model=Page[ActionItemHistoryOut])
def list_history(
    item_id: UUID,
    limit: int = Query(default=100, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    user=Depends(
        require_any_role([ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER])
    ),
    tenant_id: UUID = Depends(tenant_id_from_user),
):
    """Lista histórico de mudanças de um item."""
    item = (
        db.query(ActionItem)
        .filter(ActionItem.id == item_id, ActionItem.tenant_id == tenant_id)
        .first()
    )
    if not item:
        raise NotFound("Item não encontrado")

    base = (
        db.query(ActionItemHistory)
        .filter(
            ActionItemHistory.action_item_id == item.id,
            ActionItemHistory.tenant_id == tenant_id,
        )
        .options(joinedload(ActionItemHistory.user))
    )

    total = base.count()
    rows = (
        base.order_by(ActionItemHistory.changed_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    items = [_history_out(h) for h in rows]
    return Page(items=items, total=total, limit=limit, offset=offset)
