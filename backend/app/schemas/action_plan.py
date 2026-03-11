"""Schemas do Plano de Ação Enterprise 2.0

Inclui todos os DTOs para:
- CRUD de planos e itens
- Comentários e colaboração
- Upload de evidências
- Histórico de mudanças
- Estatísticas e progresso
"""

from __future__ import annotations

from pydantic import BaseModel, Field
from uuid import UUID
from typing import Optional, List
from datetime import datetime


# =============================================================================
# ACTION PLAN
# =============================================================================


class ActionPlanCreate(BaseModel):
    risk_assessment_id: UUID
    title: Optional[str] = None
    description: Optional[str] = None
    target_completion_date: Optional[datetime] = None


class ActionPlanUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None  # open | closed | archived
    target_completion_date: Optional[datetime] = None


class ActionPlanOut(BaseModel):
    id: UUID
    risk_assessment_id: UUID
    status: str
    version: int
    title: Optional[str] = None
    description: Optional[str] = None
    target_completion_date: Optional[datetime] = None
    closed_at: Optional[datetime] = None
    created_by_user_id: Optional[UUID] = None
    closed_by_user_id: Optional[UUID] = None
    created_at: datetime
    items: Optional[List["ActionItemOut"]] = None

    # Estatísticas (preenchidas opcionalmente)
    stats: Optional["ActionPlanStats"] = None


class ActionPlanStats(BaseModel):
    """Estatísticas de progresso do plano."""

    total_items: int = 0
    planned: int = 0
    in_progress: int = 0
    done: int = 0
    blocked: int = 0
    cancelled: int = 0
    overdue: int = 0
    completion_percentage: float = 0.0

    # Por tipo
    by_type: Optional[dict] = None  # {"educational": 3, "organizational": 2, ...}

    # Por prioridade
    by_priority: Optional[dict] = None  # {"critical": 1, "high": 2, ...}


# =============================================================================
# ACTION ITEM
# =============================================================================


class ActionItemCreate(BaseModel):
    item_type: str = Field(
        ..., description="educational | organizational | administrative | support"
    )
    title: str
    description: Optional[str] = None
    responsible: Optional[str] = None
    responsible_user_id: Optional[UUID] = None
    due_date: Optional[datetime] = None
    status: str = "planned"
    priority: str = "medium"
    related_dimension: Optional[str] = None
    education_ref_type: Optional[str] = None
    education_ref_id: Optional[UUID] = None
    notify_on_assignment: bool = True
    notify_before_due: bool = True
    notify_days_before: int = 3
    # NR-1 Compliance
    control_hierarchy: Optional[str] = Field(None, description="elimination | substitution | epc | administrative | epi")
    training_type: Optional[str] = Field(None, description="initial | periodic | eventual")
    effectiveness_criteria: Optional[str] = None
    monitoring_frequency: Optional[str] = Field(None, description="weekly | monthly | quarterly | semiannual | annual")
    affected_workers_count: Optional[int] = None
    # Enrollment targeting (for educational items)
    target_type: Optional[str] = Field(None, description="all_employees | org_unit | cnpj | selected")
    target_org_unit_id: Optional[UUID] = None
    target_cnpj_id: Optional[UUID] = None
    auto_enroll: bool = True
    enrollment_due_days: int = Field(30, ge=1, le=365)


class ActionItemUpdate(BaseModel):
    """Atualização parcial de um item de plano."""

    title: Optional[str] = None
    description: Optional[str] = None
    responsible: Optional[str] = None
    responsible_user_id: Optional[UUID] = None
    due_date: Optional[datetime] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    related_dimension: Optional[str] = None
    education_ref_type: Optional[str] = None
    education_ref_id: Optional[UUID] = None
    notify_on_assignment: Optional[bool] = None
    notify_before_due: Optional[bool] = None
    notify_days_before: Optional[int] = None
    # NR-1 Compliance
    control_hierarchy: Optional[str] = None
    training_type: Optional[str] = None
    effectiveness_criteria: Optional[str] = None
    monitoring_frequency: Optional[str] = None
    affected_workers_count: Optional[int] = None
    # Enrollment targeting
    target_type: Optional[str] = None
    target_org_unit_id: Optional[UUID] = None
    target_cnpj_id: Optional[UUID] = None
    auto_enroll: Optional[bool] = None
    enrollment_due_days: Optional[int] = Field(None, ge=1, le=365)


class ResponsibleUserInfo(BaseModel):
    """Informações do usuário responsável."""

    id: UUID
    email: str
    full_name: Optional[str] = None


class ActionItemOut(BaseModel):
    id: UUID
    action_plan_id: UUID
    item_type: str
    title: str
    description: Optional[str] = None
    responsible: Optional[str] = None
    responsible_user_id: Optional[UUID] = None
    responsible_user: Optional[ResponsibleUserInfo] = None
    due_date: Optional[datetime] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    status: str
    priority: str = "medium"
    related_dimension: Optional[str] = None
    education_ref_type: Optional[str] = None
    education_ref_id: Optional[UUID] = None
    created_by_user_id: Optional[UUID] = None
    created_at: datetime

    # Flags calculadas
    is_overdue: bool = False
    days_until_due: Optional[int] = None

    # Relacionamentos opcionais
    evidences: Optional[List["ActionEvidenceOut"]] = None
    comments: Optional[List["ActionItemCommentOut"]] = None
    history: Optional[List["ActionItemHistoryOut"]] = None

    # Contagens
    evidence_count: int = 0
    comment_count: int = 0
    # NR-1 Compliance
    control_hierarchy: Optional[str] = None
    training_type: Optional[str] = None
    effectiveness_criteria: Optional[str] = None
    monitoring_frequency: Optional[str] = None
    affected_workers_count: Optional[int] = None
    # Enrollment targeting & stats
    target_type: Optional[str] = None
    target_org_unit_id: Optional[UUID] = None
    target_cnpj_id: Optional[UUID] = None
    auto_enroll: bool = True
    enrollment_due_days: int = 30
    enrollment_total: int = 0
    enrollment_completed: int = 0
    enrollment_in_progress: int = 0
    enrollment_pending: int = 0


# =============================================================================
# ACTION EVIDENCE
# =============================================================================


class ActionEvidenceCreate(BaseModel):
    evidence_type: str = Field(..., description="file | link | note")
    reference: str
    note: Optional[str] = None
    # Para uploads
    file_name: Optional[str] = None
    file_size: Optional[int] = None
    file_type: Optional[str] = None
    storage_key: Optional[str] = None


class ActionEvidenceOut(BaseModel):
    id: UUID
    action_item_id: UUID
    evidence_type: str
    reference: str
    note: Optional[str] = None
    file_name: Optional[str] = None
    file_size: Optional[int] = None
    file_type: Optional[str] = None
    storage_key: Optional[str] = None
    created_by_user_id: Optional[UUID] = None
    created_by_user: Optional[ResponsibleUserInfo] = None
    created_at: datetime


# =============================================================================
# ACTION ITEM COMMENT
# =============================================================================


class ActionItemCommentCreate(BaseModel):
    content: str
    mentions: Optional[List[UUID]] = None


class ActionItemCommentUpdate(BaseModel):
    content: str


class ActionItemCommentOut(BaseModel):
    id: UUID
    action_item_id: UUID
    user_id: UUID
    user: Optional[ResponsibleUserInfo] = None
    content: str
    mentions: Optional[List[UUID]] = None
    edited_at: Optional[datetime] = None
    created_at: datetime


# =============================================================================
# ACTION ITEM HISTORY
# =============================================================================


class ActionItemHistoryOut(BaseModel):
    id: UUID
    action_item_id: UUID
    user_id: Optional[UUID] = None
    user: Optional[ResponsibleUserInfo] = None
    field_changed: str
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    changed_at: datetime


# =============================================================================
# BULK OPERATIONS
# =============================================================================


class BulkStatusUpdate(BaseModel):
    """Atualização em lote de status."""

    item_ids: List[UUID]
    status: str


class BulkAssignResponsible(BaseModel):
    """Atribuição em lote de responsável."""

    item_ids: List[UUID]
    responsible_user_id: UUID


# =============================================================================
# DASHBOARD / ANALYTICS
# =============================================================================


class ActionPlanDashboard(BaseModel):
    """Dashboard consolidado de planos de ação."""

    total_plans: int = 0
    open_plans: int = 0
    closed_plans: int = 0

    total_items: int = 0
    items_planned: int = 0
    items_in_progress: int = 0
    items_done: int = 0
    items_overdue: int = 0

    overall_completion: float = 0.0

    # Itens que precisam de atenção
    critical_items: List[ActionItemOut] = []
    overdue_items: List[ActionItemOut] = []
    due_this_week: List[ActionItemOut] = []

    # Por responsável
    by_responsible: Optional[List[dict]] = None


# Forward references
ActionPlanOut.model_rebuild()
ActionItemOut.model_rebuild()
