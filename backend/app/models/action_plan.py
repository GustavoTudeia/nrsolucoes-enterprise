"""Modelos de Plano de Ação Enterprise 2.0

Inclui:
- ActionPlan: Plano de ação vinculado a avaliação de risco
- ActionItem: Itens do plano com responsável, prazo, prioridade
- ActionEvidence: Evidências com suporte a upload de arquivos
- ActionItemComment: Comentários e colaboração
- ActionItemHistory: Histórico de mudanças para auditoria
"""

from __future__ import annotations
from sqlalchemy import (
    Column,
    String,
    ForeignKey,
    DateTime,
    JSON,
    Text,
    Integer,
    Boolean,
)
from app.models.types import GUID
from sqlalchemy.orm import relationship
from datetime import datetime

from app.db.base import Base
from app.models.mixins import (
    UUIDPrimaryKeyMixin,
    TimestampMixin,
    TenantScopedMixin,
    VersionedMixin,
)


class ActionPlan(
    Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantScopedMixin, VersionedMixin
):
    """Plano de ação vinculado a uma avaliação de risco."""

    __tablename__ = "action_plan"

    risk_assessment_id = Column(
        GUID(), ForeignKey("risk_assessment.id"), nullable=False, index=True
    )
    status = Column(
        String(30), nullable=False, default="open"
    )  # open | closed | archived

    # Metadados do plano
    title = Column(String(300), nullable=True)
    description = Column(Text, nullable=True)

    # Datas de controle
    target_completion_date = Column(DateTime, nullable=True)
    closed_at = Column(DateTime, nullable=True)

    # Quem criou/fechou
    created_by_user_id = Column(GUID(), ForeignKey("user_account.id"), nullable=True)
    closed_by_user_id = Column(GUID(), ForeignKey("user_account.id"), nullable=True)

    items = relationship(
        "ActionItem", back_populates="plan", cascade="all, delete-orphan"
    )


class ActionItem(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantScopedMixin):
    """Item de ação dentro de um plano."""

    __tablename__ = "action_item"

    action_plan_id = Column(
        GUID(), ForeignKey("action_plan.id"), nullable=False, index=True
    )
    item_type = Column(
        String(30), nullable=False
    )  # organizational | administrative | educational | support

    title = Column(String(300), nullable=False)
    description = Column(Text, nullable=True)

    # Responsável - pode ser user do console ou texto livre
    responsible = Column(String(200), nullable=True)  # fallback texto
    responsible_user_id = Column(
        GUID(), ForeignKey("user_account.id"), nullable=True, index=True
    )

    # Prazos e datas
    due_date = Column(DateTime, nullable=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    # Status e prioridade
    status = Column(
        String(30), nullable=False, default="planned"
    )  # planned | in_progress | done | blocked | cancelled
    priority = Column(
        String(20), nullable=False, default="medium"
    )  # low | medium | high | critical

    # Dimensão de risco relacionada (para análise)
    related_dimension = Column(
        String(50), nullable=True
    )  # governance | hazards | controls | training

    # Vínculo educacional (LMS)
    education_ref_type = Column(
        String(30), nullable=True
    )  # content_item | learning_path
    education_ref_id = Column(GUID(), nullable=True)
    # === PÚBLICO-ALVO (para itens educativos) ===
    target_type = Column(
        String(30), nullable=True
    )  # all_employees | org_unit | cnpj | selected
    target_org_unit_id = Column(
        GUID(), ForeignKey("org_unit.id"), nullable=True, index=True
    )
    target_cnpj_id = Column(GUID(), ForeignKey("cnpj.id"), nullable=True, index=True)
    auto_enroll = Column(Boolean, default=True)
    enrollment_due_days = Column(Integer, default=30)
    require_all_completions = Column(Boolean, default=True)
    auto_complete_on_all_done = Column(Boolean, default=True)

    # Estatísticas de enrollment (cache)
    enrollment_total = Column(Integer, default=0)
    enrollment_completed = Column(Integer, default=0)
    enrollment_in_progress = Column(Integer, default=0)
    enrollment_pending = Column(Integer, default=0)

    # Notificações
    notify_on_assignment = Column(Boolean, default=True)
    notify_before_due = Column(Boolean, default=True)
    notify_days_before = Column(Integer, default=3)

    # ===== NR-1 Compliance Fields =====
    # Hierarquia de controles (NR-1 1.5.5.2)
    control_hierarchy = Column(String(30), nullable=True, comment="elimination | substitution | epc | administrative | epi")
    # Tipo de treinamento obrigatório (NR-1 1.5.5.3)
    training_type = Column(String(30), nullable=True, comment="initial | periodic | eventual")
    # Método de aferição de resultado
    effectiveness_criteria = Column(Text, nullable=True)
    # Periodicidade de monitoramento
    monitoring_frequency = Column(String(50), nullable=True, comment="weekly | monthly | quarterly | semiannual | annual")
    # Número de trabalhadores atingidos (referência)
    affected_workers_count = Column(Integer, nullable=True)

    # Quem criou
    created_by_user_id = Column(GUID(), ForeignKey("user_account.id"), nullable=True)

    # Relacionamentos
    evidences = relationship(
        "ActionEvidence", back_populates="item", cascade="all, delete-orphan"
    )
    comments = relationship(
        "ActionItemComment",
        back_populates="item",
        cascade="all, delete-orphan",
        order_by="ActionItemComment.created_at",
    )
    history = relationship(
        "ActionItemHistory",
        back_populates="item",
        cascade="all, delete-orphan",
        order_by="ActionItemHistory.changed_at.desc()",
    )
    plan = relationship("ActionPlan", back_populates="items")
    responsible_user = relationship("User", foreign_keys=[responsible_user_id])
    target_org_unit = relationship("OrgUnit", foreign_keys=[target_org_unit_id])
    target_cnpj = relationship("CNPJ", foreign_keys=[target_cnpj_id])
    enrollments = relationship(
        "ActionItemEnrollment",
        back_populates="action_item",
        cascade="all, delete-orphan",
    )


class ActionEvidence(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantScopedMixin):
    """Evidência anexada a um item de ação."""

    __tablename__ = "action_evidence"

    action_item_id = Column(
        GUID(), ForeignKey("action_item.id"), nullable=False, index=True
    )
    evidence_type = Column(String(30), nullable=False)  # file | link | note

    # Referência (URL, caminho, ou texto)
    reference = Column(String(1000), nullable=False)
    note = Column(Text, nullable=True)

    # Para uploads de arquivo
    file_name = Column(String(255), nullable=True)
    file_size = Column(Integer, nullable=True)  # bytes
    file_type = Column(String(100), nullable=True)  # mime type
    storage_key = Column(String(500), nullable=True)  # S3/MinIO key

    # Quem adicionou
    created_by_user_id = Column(GUID(), ForeignKey("user_account.id"), nullable=True)

    item = relationship("ActionItem", back_populates="evidences")
    created_by_user = relationship("User", foreign_keys=[created_by_user_id])


class ActionItemComment(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantScopedMixin):
    """Comentário em um item de ação para colaboração."""

    __tablename__ = "action_item_comment"

    action_item_id = Column(
        GUID(), ForeignKey("action_item.id"), nullable=False, index=True
    )
    user_id = Column(GUID(), ForeignKey("user_account.id"), nullable=False, index=True)

    content = Column(Text, nullable=False)

    # Menções a outros usuários
    mentions = Column(JSON, default=list)  # ["user_id_1", "user_id_2"]

    # Editado
    edited_at = Column(DateTime, nullable=True)

    item = relationship("ActionItem", back_populates="comments")
    user = relationship("User", foreign_keys=[user_id])


class ActionItemHistory(Base, UUIDPrimaryKeyMixin, TenantScopedMixin):
    """Histórico de mudanças para auditoria completa."""

    __tablename__ = "action_item_history"

    action_item_id = Column(
        GUID(), ForeignKey("action_item.id"), nullable=False, index=True
    )
    user_id = Column(GUID(), ForeignKey("user_account.id"), nullable=True, index=True)

    # O que mudou
    field_changed = Column(
        String(50), nullable=False
    )  # status | responsible | due_date | title | priority | etc
    old_value = Column(String(1000), nullable=True)
    new_value = Column(String(1000), nullable=True)

    changed_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    item = relationship("ActionItem", back_populates="history")
    user = relationship("User", foreign_keys=[user_id])
