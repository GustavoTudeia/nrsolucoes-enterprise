"""Schemas para Matrículas em Treinamentos e Certificados.

Este módulo define os schemas Pydantic para:
- Matrícula de colaboradores em itens educativos
- Geração e validação de certificados
- Estatísticas de progresso
"""

from __future__ import annotations
from pydantic import BaseModel, Field
from uuid import UUID
from typing import Optional, List
from datetime import datetime
from enum import Enum


class EnrollmentStatus(str, Enum):
    """Status possíveis de uma matrícula."""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    EXPIRED = "expired"
    CANCELLED = "cancelled"


class TargetType(str, Enum):
    """Tipos de público-alvo para item educativo."""
    ALL_EMPLOYEES = "all_employees"
    ORG_UNIT = "org_unit"
    CNPJ = "cnpj"
    SELECTED = "selected"


# ==================== Enrollment Schemas ====================

class EnrollmentCreate(BaseModel):
    """Criar matrícula individual."""
    employee_id: UUID
    due_date: Optional[datetime] = None
    notes: Optional[str] = None


class BulkEnrollmentCreate(BaseModel):
    """Criar matrículas em lote."""
    target_type: TargetType = Field(..., description="Tipo de público-alvo")
    org_unit_id: Optional[UUID] = Field(None, description="ID da unidade (se target_type=org_unit)")
    employee_ids: Optional[List[UUID]] = Field(None, description="Lista de IDs (se target_type=selected)")
    due_days: int = Field(30, ge=1, le=365, description="Prazo em dias para conclusão")
    include_inactive: bool = Field(False, description="Incluir colaboradores inativos")


class EnrollmentUpdate(BaseModel):
    """Atualizar matrícula."""
    status: Optional[EnrollmentStatus] = None
    due_date: Optional[datetime] = None
    notes: Optional[str] = None
    progress_percent: Optional[int] = Field(None, ge=0, le=100)


class EnrollmentOut(BaseModel):
    """Saída de matrícula."""
    id: UUID
    action_item_id: UUID
    employee_id: UUID
    employee_name: Optional[str] = None
    employee_identifier: Optional[str] = None
    employee_email: Optional[str] = None
    
    status: str
    progress_percent: int
    
    enrolled_at: datetime
    due_date: Optional[datetime] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    
    is_overdue: bool = False
    days_until_due: Optional[int] = None
    
    content_assignment_id: Optional[UUID] = None
    certificate_id: Optional[UUID] = None
    
    notes: Optional[str] = None
    created_at: datetime


class EnrollmentStats(BaseModel):
    """Estatísticas de matrículas de um item."""
    total: int = 0
    pending: int = 0
    in_progress: int = 0
    completed: int = 0
    expired: int = 0
    cancelled: int = 0
    
    completion_rate: float = 0.0  # 0-100
    overdue_count: int = 0
    
    avg_completion_days: Optional[float] = None
    certificates_issued: int = 0


class EnrollmentProgress(BaseModel):
    """Progresso de uma matrícula (para atualização via portal)."""
    position_seconds: int = Field(..., ge=0)
    duration_seconds: Optional[int] = Field(None, ge=0)


# ==================== Certificate Schemas ====================

class CertificateCreate(BaseModel):
    """Criar certificado (interno)."""
    enrollment_id: UUID
    training_title: str
    training_description: Optional[str] = None
    training_duration_minutes: Optional[int] = None
    valid_months: Optional[int] = Field(None, ge=1, le=120, description="Validade em meses")
    # NR-1 fields
    instructor_name: Optional[str] = None
    instructor_qualification: Optional[str] = None
    training_location: Optional[str] = None
    syllabus: Optional[str] = None
    training_modality: Optional[str] = Field(None, description="presential | remote | hybrid")
    formal_hours_minutes: Optional[int] = None


class CertificateOut(BaseModel):
    """Saída de certificado."""
    id: UUID
    certificate_number: str
    
    employee_id: UUID
    employee_name: str
    employee_cpf: Optional[str] = None
    employee_identifier: str
    
    training_title: str
    training_description: Optional[str] = None
    training_duration_minutes: Optional[int] = None
    
    action_plan_title: Optional[str] = None
    risk_dimension: Optional[str] = None
    
    training_completed_at: datetime
    issued_at: datetime
    valid_until: Optional[datetime] = None
    is_valid: bool = True
    
    validation_code: Optional[str] = None
    validation_url: Optional[str] = None
    
    pdf_available: bool = False
    
    issuer_name: Optional[str] = None
    issuer_cnpj: Optional[str] = None
    # NR-1 mandatory certificate fields
    instructor_name: Optional[str] = None
    instructor_qualification: Optional[str] = None
    training_location: Optional[str] = None
    syllabus: Optional[str] = None
    training_modality: Optional[str] = None
    formal_hours_minutes: Optional[int] = None

    created_at: datetime


class CertificateValidation(BaseModel):
    """Resposta de validação de certificado."""
    valid: bool
    certificate_number: Optional[str] = None
    employee_name: Optional[str] = None
    training_title: Optional[str] = None
    issued_at: Optional[datetime] = None
    issuer_name: Optional[str] = None
    message: str = ""


# ==================== Action Item Extension Schemas ====================

class ActionItemTargetUpdate(BaseModel):
    """Atualizar público-alvo de um item educativo."""
    target_type: Optional[TargetType] = None
    target_org_unit_id: Optional[UUID] = None
    auto_enroll: Optional[bool] = None
    enrollment_due_days: Optional[int] = Field(None, ge=1, le=365)


class ActionItemWithEnrollments(BaseModel):
    """Item de ação com informações de matrículas."""
    id: UUID
    title: str
    item_type: str
    status: str
    
    # Configuração de público-alvo
    target_type: Optional[str] = None
    target_org_unit_id: Optional[UUID] = None
    target_org_unit_name: Optional[str] = None
    auto_enroll: bool = True
    enrollment_due_days: int = 30
    
    # Vínculo LMS
    education_ref_type: Optional[str] = None
    education_ref_id: Optional[UUID] = None
    content_title: Optional[str] = None
    
    # Estatísticas
    enrollment_stats: Optional[EnrollmentStats] = None


# ==================== Portal Schemas ====================

class PortalTrainingOut(BaseModel):
    """Treinamento para o portal do colaborador."""
    enrollment_id: UUID
    
    # Dados do treinamento
    training_title: str
    training_description: Optional[str] = None
    training_type: str  # video | pdf | link
    duration_minutes: Optional[int] = None
    
    # Status
    status: str
    progress_percent: int
    
    # Datas
    due_date: Optional[datetime] = None
    is_overdue: bool = False
    days_until_due: Optional[int] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    
    # Conteúdo
    content_id: Optional[UUID] = None
    can_access: bool = True
    
    # Certificado
    has_certificate: bool = False
    certificate_id: Optional[UUID] = None


class PortalTrainingStart(BaseModel):
    """Iniciar treinamento no portal."""
    enrollment_id: UUID


class PortalTrainingComplete(BaseModel):
    """Completar treinamento no portal."""
    enrollment_id: UUID
    completion_method: str = Field("manual", description="manual | watch_threshold | quiz")


class PortalCertificateOut(BaseModel):
    """Certificado para o portal do colaborador."""
    id: UUID
    certificate_number: str
    training_title: str
    completed_at: datetime
    issued_at: datetime
    is_valid: bool
    pdf_download_url: Optional[str] = None
    validation_code: Optional[str] = None
