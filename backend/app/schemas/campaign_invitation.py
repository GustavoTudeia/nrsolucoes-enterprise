"""Schemas para Campaign Invitation - Sistema de tokens únicos por colaborador."""

from __future__ import annotations

from datetime import datetime
from typing import Optional, List
from uuid import UUID

from pydantic import BaseModel, Field


# =============================================================================
# REQUEST SCHEMAS
# =============================================================================


class InvitationGenerateRequest(BaseModel):
    """Request para gerar convites para colaboradores."""

    # Filtros de seleção (pelo menos um deve ser informado)
    cnpj_id: Optional[UUID] = Field(default=None, description="Filtrar por CNPJ")
    org_unit_id: Optional[UUID] = Field(
        default=None, description="Filtrar por unidade/setor"
    )
    employee_ids: Optional[List[UUID]] = Field(
        default=None, description="Lista específica de colaboradores"
    )

    # Configurações
    expires_in_days: int = Field(
        default=30, ge=1, le=90, description="Dias até expiração"
    )
    send_email: bool = Field(
        default=False, description="Enviar convite por email automaticamente"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "cnpj_id": "ebe2ad4a-50c5-4fd5-be3c-884c55ecdfa5",
                "org_unit_id": None,
                "employee_ids": None,
                "expires_in_days": 30,
                "send_email": False,
            }
        }


class InvitationRevokeRequest(BaseModel):
    """Request para revogar convites."""

    invitation_ids: Optional[List[UUID]] = Field(
        default=None, description="IDs específicos para revogar"
    )
    employee_ids: Optional[List[UUID]] = Field(
        default=None, description="Revogar por colaborador"
    )
    reason: Optional[str] = Field(
        default=None, max_length=500, description="Motivo da revogação"
    )


class InvitationResendRequest(BaseModel):
    """Request para reenviar convites."""

    invitation_ids: Optional[List[UUID]] = Field(
        default=None, description="IDs específicos para reenviar"
    )
    only_pending: bool = Field(default=True, description="Apenas convites pendentes")


class InvitationValidateRequest(BaseModel):
    """Request para validar um token (usado no frontend da pesquisa)."""

    token: str = Field(
        ..., min_length=32, max_length=64, description="Token do convite"
    )


class SurveySubmitWithTokenRequest(BaseModel):
    """Request para submeter resposta com token."""

    token: str = Field(
        ..., min_length=32, max_length=64, description="Token do convite"
    )
    org_unit_id: Optional[UUID] = Field(
        default=None, description="Unidade/setor (para análise segmentada)"
    )
    answers: dict = Field(..., description="Respostas do questionário")

    class Config:
        json_schema_extra = {
            "example": {
                "token": "a1b2c3d4e5f6...",
                "org_unit_id": "28bbb358-628a-4027-aa37-7d05401f6691",
                "answers": {"q1": 4, "q2": 3, "q3": 5},
            }
        }


# =============================================================================
# RESPONSE SCHEMAS
# =============================================================================


class InvitationOut(BaseModel):
    """Dados de um convite (para admin)."""

    id: UUID
    campaign_id: UUID
    employee_id: UUID
    employee_name: Optional[str] = None
    employee_email: Optional[str] = None

    status: str
    expires_at: datetime
    sent_at: Optional[datetime] = None
    opened_at: Optional[datetime] = None
    used_at: Optional[datetime] = None
    revoked_at: Optional[datetime] = None

    sent_via: Optional[str] = None
    sent_to_email: Optional[str] = None
    reminder_count: str = "0"

    created_at: datetime


class InvitationWithTokenOut(BaseModel):
    """Convite com token visível (apenas no momento da geração)."""

    id: UUID
    employee_id: UUID
    employee_name: Optional[str] = None
    employee_email: Optional[str] = None
    token: str  # Token em plain text (só retornado uma vez!)
    survey_url: str  # URL completa para o colaborador
    expires_at: datetime


class InvitationGenerateResult(BaseModel):
    """Resultado da geração de convites."""

    campaign_id: UUID
    batch_id: UUID
    total_eligible: int  # Colaboradores elegíveis encontrados
    total_created: int  # Convites criados
    total_skipped: int  # Ignorados (já tinham convite válido)
    total_sent: int  # Emails enviados (se send_email=True)

    invitations: List[
        InvitationWithTokenOut
    ]  # Lista com tokens (só retornado uma vez!)

    class Config:
        json_schema_extra = {
            "example": {
                "campaign_id": "b14e9621-4629-4422-b29b-de87cc8d1451",
                "batch_id": "a1b2c3d4-...",
                "total_eligible": 50,
                "total_created": 48,
                "total_skipped": 2,
                "total_sent": 0,
                "invitations": [],
            }
        }


class InvitationValidateResult(BaseModel):
    """Resultado da validação de token."""

    valid: bool
    campaign_id: Optional[UUID] = None
    campaign_name: Optional[str] = None
    questionnaire_title: Optional[str] = None
    expires_at: Optional[datetime] = None

    # Se inválido, motivo
    error: Optional[str] = (
        None  # expired | used | revoked | not_found | campaign_closed
    )

    class Config:
        json_schema_extra = {
            "example": {
                "valid": True,
                "campaign_id": "b14e9621-4629-4422-b29b-de87cc8d1451",
                "campaign_name": "Diagnóstico Q1 2026",
                "questionnaire_title": "NR-1 Governança e Evidências",
                "expires_at": "2026-03-12T15:00:00Z",
                "error": None,
            }
        }


class InvitationStatsOut(BaseModel):
    """Estatísticas de convites de uma campanha."""

    campaign_id: UUID

    total_invitations: int
    total_pending: int
    total_used: int
    total_expired: int
    total_revoked: int

    response_rate: float  # Percentual de respostas (used / total)

    # Detalhamento por unidade (para análise)
    by_org_unit: Optional[List[dict]] = None

    class Config:
        json_schema_extra = {
            "example": {
                "campaign_id": "b14e9621-4629-4422-b29b-de87cc8d1451",
                "total_invitations": 50,
                "total_pending": 10,
                "total_used": 35,
                "total_expired": 3,
                "total_revoked": 2,
                "response_rate": 0.70,
                "by_org_unit": [
                    {
                        "org_unit_id": "...",
                        "org_unit_name": "TI",
                        "invited": 20,
                        "responded": 15,
                    },
                    {
                        "org_unit_id": "...",
                        "org_unit_name": "RH",
                        "invited": 30,
                        "responded": 20,
                    },
                ],
            }
        }


class SurveySubmitResult(BaseModel):
    """Resultado da submissão de resposta."""

    status: str = "ok"
    message: str = "Resposta registrada com sucesso. Obrigado pela participação!"
