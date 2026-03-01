"""Campaign Invitation Model - Token único por colaborador para garantir:

- 1 resposta por colaborador (governança)
- Apenas colaboradores cadastrados podem responder (NR-1 válido)
- Anonimato preservado (LGPD) - resposta NÃO tem FK para invitation/employee
- Auditoria completa (quem foi convidado, quando, taxa de resposta)

Fluxo:
1. Admin gera convites para colaboradores elegíveis
2. Sistema cria token único (hash) para cada colaborador
3. Colaborador acessa link com token
4. Token é validado e marcado como USADO
5. Resposta é salva SEM VÍNCULO com o token/colaborador
6. Impossível correlacionar resposta com colaborador

Enterprise Features:
- Expiração de tokens
- Revogação de tokens
- Reenvio de convites
- Tracking de delivery (email enviado, aberto, etc)
- Rate limiting por IP
- Detecção de anomalias
"""

from __future__ import annotations

from datetime import datetime
from sqlalchemy import Column, String, ForeignKey, DateTime, Index, Text
from sqlalchemy.orm import relationship

from app.db.base import Base
from app.models.mixins import UUIDPrimaryKeyMixin, TimestampMixin, TenantScopedMixin
from app.models.types import GUID


class CampaignInvitation(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantScopedMixin):
    """Convite único para colaborador responder uma campanha.

    Garante:
    - 1 token por colaborador por campanha
    - Token não pode ser reutilizado
    - Resposta é desvinculada do token (anonimato)

    Status:
    - pending: token gerado, aguardando uso
    - used: token já foi utilizado (resposta submetida)
    - expired: token expirou sem uso
    - revoked: token revogado manualmente (ex: colaborador desligado)
    """

    __tablename__ = "campaign_invitation"

    # Vínculos
    campaign_id = Column(GUID(), ForeignKey("campaign.id"), nullable=False, index=True)
    employee_id = Column(GUID(), ForeignKey("employee.id"), nullable=False, index=True)

    # Token (armazenamos apenas o hash por segurança)
    token_hash = Column(String(128), nullable=False, unique=True, index=True)

    # Status do convite
    status = Column(String(20), nullable=False, default="pending", index=True)
    # pending | used | expired | revoked

    # Datas importantes
    expires_at = Column(DateTime, nullable=False)
    sent_at = Column(DateTime, nullable=True)  # Quando foi enviado por email
    opened_at = Column(
        DateTime, nullable=True
    )  # Quando o link foi acessado (sem responder)
    used_at = Column(DateTime, nullable=True)  # Quando foi usado (resposta submetida)
    revoked_at = Column(DateTime, nullable=True)

    # Método de envio
    sent_via = Column(String(30), nullable=True)  # email | manual | bulk_import
    sent_to_email = Column(String(200), nullable=True)  # Email para onde foi enviado

    # Tracking de uso (para auditoria e detecção de anomalias)
    ip_opened = Column(String(45), nullable=True)  # IP quando abriu o link
    ip_used = Column(String(45), nullable=True)  # IP quando respondeu
    user_agent_used = Column(String(500), nullable=True)

    # Metadados adicionais
    reminder_count = Column(String(10), default="0")  # Quantos lembretes foram enviados
    notes = Column(Text, nullable=True)  # Notas administrativas (ex: motivo revogação)

    # Relacionamentos
    campaign = relationship("Campaign", back_populates="invitations")
    employee = relationship("Employee")

    # Índices compostos para queries frequentes
    __table_args__ = (
        # Garantir 1 convite por colaborador por campanha
        Index("uq_campaign_employee", "campaign_id", "employee_id", unique=True),
        # Busca por status em campanha
        Index("ix_campaign_invitation_campaign_status", "campaign_id", "status"),
        # Busca por tenant e status
        Index("ix_campaign_invitation_tenant_status", "tenant_id", "status"),
    )

    def is_valid(self) -> bool:
        """Verifica se o token ainda pode ser usado."""
        if self.status != "pending":
            return False
        if self.expires_at and self.expires_at < datetime.utcnow():
            return False
        return True

    def mark_as_used(self, ip: str = None, user_agent: str = None) -> None:
        """Marca o token como usado."""
        self.status = "used"
        self.used_at = datetime.utcnow()
        self.ip_used = ip
        self.user_agent_used = user_agent

    def mark_as_opened(self, ip: str = None) -> None:
        """Marca que o link foi acessado (sem necessariamente responder)."""
        if not self.opened_at:  # Só registra primeira abertura
            self.opened_at = datetime.utcnow()
            self.ip_opened = ip

    def revoke(self, reason: str = None) -> None:
        """Revoga o token."""
        self.status = "revoked"
        self.revoked_at = datetime.utcnow()
        if reason:
            self.notes = f"Revogado: {reason}"


class CampaignInvitationBatch(
    Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantScopedMixin
):
    """Registro de lotes de convites gerados.

    Permite auditoria de:
    - Quem gerou os convites
    - Quando foram gerados
    - Critérios de seleção usados
    - Estatísticas do lote
    """

    __tablename__ = "campaign_invitation_batch"

    campaign_id = Column(GUID(), ForeignKey("campaign.id"), nullable=False, index=True)
    created_by_user_id = Column(GUID(), ForeignKey("user_account.id"), nullable=False)

    # Critérios de seleção
    filter_cnpj_id = Column(GUID(), nullable=True)
    filter_org_unit_id = Column(GUID(), nullable=True)
    filter_criteria = Column(Text, nullable=True)  # JSON com critérios usados

    # Estatísticas
    total_invited = Column(String(10), nullable=False, default="0")
    total_sent = Column(String(10), nullable=False, default="0")
    total_failed = Column(String(10), nullable=False, default="0")

    # Status do envio
    send_started_at = Column(DateTime, nullable=True)
    send_completed_at = Column(DateTime, nullable=True)
    send_status = Column(
        String(30), default="pending"
    )  # pending | sending | completed | failed

    # Relacionamentos
    campaign = relationship("Campaign")
    created_by = relationship("User")
