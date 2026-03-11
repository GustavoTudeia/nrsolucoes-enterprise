"""Serviço de Geração de Dossiê PGR.

Este módulo implementa a geração do Dossiê PGR completo em PDF
conforme requisitos da NR-1 para documentação e fiscalização.

O dossiê inclui:
1. Capa com identificação da empresa
2. Sumário
3. Estrutura organizacional (CNPJs e Unidades)
4. Inventário de riscos (campanhas, dimensões, scores)
5. Classificações de risco
6. Planos de ação com status
7. Evidências de execução
8. Relatório de treinamentos
9. Certificados emitidos
10. Trilha de auditoria
"""

from __future__ import annotations
from datetime import datetime
from typing import Optional, Dict, Any, List
from uuid import UUID
from io import BytesIO
import hashlib

from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.tenant import Tenant, TenantSettings
from app.models.org import CNPJ, OrgUnit
from app.models.employee import Employee
from app.models.campaign import Campaign, SurveyResponse
from app.models.risk import RiskAssessment
from app.models.action_plan import ActionPlan, ActionItem, ActionEvidence
from app.models.training import ActionItemEnrollment, TrainingCertificate
from app.models.audit_event import AuditEvent


class PGRDossierService:
    """Serviço para geração do Dossiê PGR."""
    
    def __init__(self, db: Session):
        self.db = db
    
    def generate_dossier_data(
        self,
        tenant_id: UUID,
        cnpj_id: Optional[UUID] = None,
        campaign_id: Optional[UUID] = None,
        include_audit: bool = True,
        audit_limit: int = 100,
    ) -> Dict[str, Any]:
        """Gera dados completos do dossiê em formato estruturado."""
        
        # Dados do tenant
        tenant = self.db.query(Tenant).filter(Tenant.id == tenant_id).first()
        settings = self.db.query(TenantSettings).filter(TenantSettings.tenant_id == tenant_id).first()
        min_n = settings.min_anon_threshold if settings else 5
        
        # CNPJs
        cnpj_q = self.db.query(CNPJ).filter(CNPJ.tenant_id == tenant_id, CNPJ.is_active == True)
        if cnpj_id:
            cnpj_q = cnpj_q.filter(CNPJ.id == cnpj_id)
        cnpjs = cnpj_q.order_by(CNPJ.legal_name.asc()).all()
        
        # Unidades
        cnpj_ids = [c.id for c in cnpjs]
        units = (
            self.db.query(OrgUnit)
            .filter(OrgUnit.cnpj_id.in_(cnpj_ids), OrgUnit.is_active == True)
            .order_by(OrgUnit.name.asc())
            .all()
        )
        
        # Colaboradores (contagem por unidade)
        employee_counts = {}
        for cnpj in cnpjs:
            count = (
                self.db.query(func.count(Employee.id))
                .filter(Employee.tenant_id == tenant_id, Employee.cnpj_id == cnpj.id, Employee.is_active == True)
                .scalar() or 0
            )
            employee_counts[str(cnpj.id)] = count
        
        # Campanhas
        camp_q = self.db.query(Campaign).filter(Campaign.tenant_id == tenant_id)
        if cnpj_id:
            camp_q = camp_q.filter(Campaign.cnpj_id == cnpj_id)
        if campaign_id:
            camp_q = camp_q.filter(Campaign.id == campaign_id)
        campaigns = camp_q.order_by(Campaign.created_at.desc()).all()
        
        # Contagem de respostas
        response_counts = {}
        for camp in campaigns:
            count = (
                self.db.query(func.count(SurveyResponse.id))
                .filter(SurveyResponse.campaign_id == camp.id)
                .scalar() or 0
            )
            response_counts[str(camp.id)] = count
        
        # Avaliações de risco
        risk_q = self.db.query(RiskAssessment).filter(RiskAssessment.tenant_id == tenant_id)
        if cnpj_id:
            risk_q = risk_q.filter(RiskAssessment.cnpj_id == cnpj_id)
        if campaign_id:
            risk_q = risk_q.filter(RiskAssessment.campaign_id == campaign_id)
        risks = risk_q.order_by(RiskAssessment.assessed_at.desc()).all()
        
        # Planos de ação
        risk_ids = [r.id for r in risks]
        plans = []
        if risk_ids:
            plans = (
                self.db.query(ActionPlan)
                .filter(ActionPlan.tenant_id == tenant_id, ActionPlan.risk_assessment_id.in_(risk_ids))
                .all()
            )
        
        # Itens e estatísticas
        plan_ids = [p.id for p in plans]
        items = []
        if plan_ids:
            items = (
                self.db.query(ActionItem)
                .filter(ActionItem.action_plan_id.in_(plan_ids))
                .all()
            )
        
        # Evidências
        item_ids = [i.id for i in items]
        evidences = []
        if item_ids:
            evidences = (
                self.db.query(ActionEvidence)
                .filter(ActionEvidence.action_item_id.in_(item_ids))
                .all()
            )
        
        # Matrículas em treinamentos
        enrollments = []
        enrollment_stats = {"total": 0, "completed": 0, "pending": 0}
        if item_ids:
            enrollments = (
                self.db.query(ActionItemEnrollment)
                .filter(ActionItemEnrollment.action_item_id.in_(item_ids))
                .all()
            )
            enrollment_stats["total"] = len(enrollments)
            enrollment_stats["completed"] = sum(1 for e in enrollments if e.status == "completed")
            enrollment_stats["pending"] = sum(1 for e in enrollments if e.status in ("pending", "in_progress"))
        
        # Certificados
        certificates = (
            self.db.query(TrainingCertificate)
            .filter(TrainingCertificate.tenant_id == tenant_id)
            .order_by(TrainingCertificate.issued_at.desc())
            .limit(500)
            .all()
        )
        
        # Auditoria
        audit_events = []
        if include_audit:
            audit_events = (
                self.db.query(AuditEvent)
                .filter(AuditEvent.tenant_id == tenant_id)
                .order_by(AuditEvent.created_at.desc())
                .limit(audit_limit)
                .all()
            )
        
        # Montar resposta
        return {
            "meta": {
                "generated_at": datetime.utcnow().isoformat() + "Z",
                "tenant_id": str(tenant_id),
                "tenant_name": tenant.name if tenant else None,
                "lgpd_min_threshold": min_n,
                "version": "1.0",
            },
            "structure": {
                "cnpjs": [
                    {
                        "id": str(c.id),
                        "legal_name": c.legal_name,
                        "trade_name": c.trade_name,
                        "cnpj_number": c.cnpj_number,
                        "employee_count": employee_counts.get(str(c.id), 0),
                    }
                    for c in cnpjs
                ],
                "org_units": [
                    {
                        "id": str(u.id),
                        "cnpj_id": str(u.cnpj_id),
                        "name": u.name,
                        "unit_type": u.unit_type,
                        "parent_unit_id": str(u.parent_unit_id) if u.parent_unit_id else None,
                    }
                    for u in units
                ],
            },
            "diagnostics": {
                "campaigns": [
                    {
                        "id": str(c.id),
                        "name": c.name,
                        "status": c.status,
                        "cnpj_id": str(c.cnpj_id),
                        "response_count": response_counts.get(str(c.id), 0),
                        "aggregation_allowed": response_counts.get(str(c.id), 0) >= min_n,
                        "created_at": c.created_at.isoformat() + "Z",
                        "closed_at": c.closed_at.isoformat() + "Z" if c.closed_at else None,
                    }
                    for c in campaigns
                ],
            },
            "risk_assessments": [
                {
                    "id": str(r.id),
                    "campaign_id": str(r.campaign_id),
                    "cnpj_id": str(r.cnpj_id),
                    "org_unit_id": str(r.org_unit_id) if r.org_unit_id else None,
                    "score": r.score,
                    "level": r.level,
                    "dimension_scores": r.dimension_scores,
                    "assessed_at": r.assessed_at.isoformat() + "Z",
                }
                for r in risks
            ],
            "action_plans": [
                {
                    "id": str(p.id),
                    "risk_assessment_id": str(p.risk_assessment_id),
                    "status": p.status,
                    "title": p.title,
                    "created_at": p.created_at.isoformat() + "Z",
                    "items": [
                        {
                            "id": str(i.id),
                            "title": i.title,
                            "item_type": i.item_type,
                            "status": i.status,
                            "priority": i.priority,
                            "responsible": i.responsible,
                            "due_date": i.due_date.isoformat() + "Z" if i.due_date else None,
                            "completed_at": i.completed_at.isoformat() + "Z" if i.completed_at else None,
                            "evidences_count": sum(1 for e in evidences if e.action_item_id == i.id),
                        }
                        for i in items if i.action_plan_id == p.id
                    ],
                }
                for p in plans
            ],
            "training_summary": {
                "total_enrollments": enrollment_stats["total"],
                "completed": enrollment_stats["completed"],
                "pending": enrollment_stats["pending"],
                "completion_rate": (
                    round(enrollment_stats["completed"] / enrollment_stats["total"] * 100, 1)
                    if enrollment_stats["total"] > 0 else 0
                ),
                "certificates_issued": len(certificates),
            },
            "certificates": [
                {
                    "certificate_number": c.certificate_number,
                    "employee_name": c.employee_name,
                    "training_title": c.training_title,
                    "completed_at": c.training_completed_at.isoformat() + "Z",
                    "issued_at": c.issued_at.isoformat() + "Z",
                    "is_valid": c.is_valid,
                }
                for c in certificates[:100]  # Limitar para não sobrecarregar
            ],
            "audit_trail": [
                {
                    "id": str(e.id),
                    "action": e.action,
                    "entity_type": e.entity_type,
                    "created_at": e.created_at.isoformat() + "Z",
                }
                for e in audit_events
            ],
        }
    
    def generate_pdf(
        self,
        tenant_id: UUID,
        cnpj_id: Optional[UUID] = None,
        campaign_id: Optional[UUID] = None,
    ) -> bytes:
        """Gera PDF completo do dossiê PGR."""
        
        data = self.generate_dossier_data(tenant_id, cnpj_id, campaign_id)
        
        try:
            return self._generate_pdf_reportlab(data)
        except ImportError:
            return self._generate_pdf_simple(data)
    
    def _generate_pdf_reportlab(self, data: Dict[str, Any]) -> bytes:
        """Gera PDF usando reportlab."""
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import cm, mm
        from reportlab.platypus import (
            SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
            PageBreak, ListFlowable, ListItem
        )
        from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
        
        buffer = BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            leftMargin=2*cm,
            rightMargin=2*cm,
            topMargin=2*cm,
            bottomMargin=2*cm
        )
        
        styles = getSampleStyleSheet()
        
        # Estilos customizados
        title_style = ParagraphStyle(
            'DossierTitle',
            parent=styles['Heading1'],
            fontSize=24,
            alignment=TA_CENTER,
            spaceAfter=30,
            textColor=colors.HexColor('#1a365d')
        )
        
        h1_style = ParagraphStyle(
            'DossierH1',
            parent=styles['Heading1'],
            fontSize=16,
            spaceAfter=12,
            spaceBefore=20,
            textColor=colors.HexColor('#2d3748')
        )
        
        h2_style = ParagraphStyle(
            'DossierH2',
            parent=styles['Heading2'],
            fontSize=13,
            spaceAfter=8,
            spaceBefore=15,
            textColor=colors.HexColor('#4a5568')
        )
        
        body_style = ParagraphStyle(
            'DossierBody',
            parent=styles['Normal'],
            fontSize=10,
            spaceAfter=8,
            leading=14
        )
        
        small_style = ParagraphStyle(
            'DossierSmall',
            parent=styles['Normal'],
            fontSize=8,
            textColor=colors.HexColor('#718096')
        )
        
        elements = []
        
        # ===== CAPA =====
        elements.append(Spacer(1, 3*cm))
        elements.append(Paragraph("DOSSIÊ PGR", title_style))
        elements.append(Paragraph("Programa de Gerenciamento de Riscos", 
            ParagraphStyle('Subtitle', parent=styles['Heading2'], alignment=TA_CENTER, fontSize=14)))
        elements.append(Paragraph("Riscos Psicossociais - NR-1", 
            ParagraphStyle('Subtitle2', parent=styles['Normal'], alignment=TA_CENTER, fontSize=12)))
        elements.append(Spacer(1, 2*cm))
        
        if data["meta"].get("tenant_name"):
            elements.append(Paragraph(data["meta"]["tenant_name"], 
                ParagraphStyle('Company', parent=styles['Heading2'], alignment=TA_CENTER, fontSize=16)))
        
        elements.append(Spacer(1, 1*cm))
        elements.append(Paragraph(
            f"Gerado em: {datetime.fromisoformat(data['meta']['generated_at'].replace('Z', '')).strftime('%d/%m/%Y às %H:%M')}",
            ParagraphStyle('Date', parent=styles['Normal'], alignment=TA_CENTER, fontSize=10)
        ))
        
        elements.append(PageBreak())
        
        # ===== SUMÁRIO =====
        elements.append(Paragraph("SUMÁRIO", h1_style))
        elements.append(Paragraph("1. Estrutura Organizacional", body_style))
        elements.append(Paragraph("2. Diagnósticos Realizados", body_style))
        elements.append(Paragraph("3. Avaliações de Risco", body_style))
        elements.append(Paragraph("4. Planos de Ação", body_style))
        elements.append(Paragraph("5. Treinamentos e Capacitações", body_style))
        elements.append(Paragraph("6. Certificados Emitidos", body_style))
        elements.append(Paragraph("7. Trilha de Auditoria", body_style))
        
        elements.append(PageBreak())
        
        # ===== 1. ESTRUTURA ORGANIZACIONAL =====
        elements.append(Paragraph("1. ESTRUTURA ORGANIZACIONAL", h1_style))
        
        for cnpj in data["structure"]["cnpjs"]:
            elements.append(Paragraph(f"<b>{cnpj['legal_name']}</b>", h2_style))
            elements.append(Paragraph(f"CNPJ: {cnpj['cnpj_number']}", body_style))
            if cnpj.get('trade_name'):
                elements.append(Paragraph(f"Nome Fantasia: {cnpj['trade_name']}", body_style))
            elements.append(Paragraph(f"Colaboradores: {cnpj.get('employee_count', 0)}", body_style))
            
            # Unidades deste CNPJ
            units = [u for u in data["structure"]["org_units"] if u["cnpj_id"] == cnpj["id"]]
            if units:
                elements.append(Paragraph("Unidades:", body_style))
                for unit in units:
                    elements.append(Paragraph(f"  • {unit['name']} ({unit.get('unit_type', 'setor')})", body_style))
        
        elements.append(PageBreak())
        
        # ===== 2. DIAGNÓSTICOS =====
        elements.append(Paragraph("2. DIAGNÓSTICOS REALIZADOS", h1_style))
        
        campaigns = data["diagnostics"]["campaigns"]
        if campaigns:
            for camp in campaigns:
                elements.append(Paragraph(f"<b>{camp['name']}</b>", h2_style))
                elements.append(Paragraph(f"Status: {camp['status'].upper()}", body_style))
                elements.append(Paragraph(f"Respostas: {camp['response_count']}", body_style))
                if camp.get('closed_at'):
                    elements.append(Paragraph(f"Encerrada em: {camp['closed_at'][:10]}", body_style))
        else:
            elements.append(Paragraph("Nenhuma campanha de diagnóstico registrada.", body_style))
        
        elements.append(PageBreak())
        
        # ===== 3. AVALIAÇÕES DE RISCO =====
        elements.append(Paragraph("3. AVALIAÇÕES DE RISCO", h1_style))
        
        risks = data["risk_assessments"]
        if risks:
            for risk in risks:
                level_color = {
                    'low': '#38a169',
                    'medium': '#d69e2e', 
                    'high': '#e53e3e'
                }.get(risk['level'], '#718096')
                
                elements.append(Paragraph(
                    f"<b>Avaliação {risk['assessed_at'][:10]}</b> - Nível: <font color='{level_color}'>{risk['level'].upper()}</font> (Score: {risk['score']}%)",
                    h2_style
                ))
                
                if risk.get('dimension_scores'):
                    elements.append(Paragraph("Scores por dimensão:", body_style))
                    for dim, score in risk['dimension_scores'].items():
                        elements.append(Paragraph(f"  • {dim}: {score}%", body_style))
        else:
            elements.append(Paragraph("Nenhuma avaliação de risco registrada.", body_style))
        
        elements.append(PageBreak())
        
        # ===== 4. PLANOS DE AÇÃO =====
        elements.append(Paragraph("4. PLANOS DE AÇÃO", h1_style))
        
        plans = data["action_plans"]
        if plans:
            for plan in plans:
                elements.append(Paragraph(f"<b>{plan.get('title') or 'Plano de Ação'}</b>", h2_style))
                elements.append(Paragraph(f"Status: {plan['status'].upper()}", body_style))
                
                if plan.get('items'):
                    elements.append(Paragraph("Itens:", body_style))
                    for item in plan['items']:
                        status_icon = "✓" if item['status'] == 'done' else "○"
                        elements.append(Paragraph(
                            f"  {status_icon} {item['title']} [{item['item_type']}] - {item['status']}",
                            body_style
                        ))
        else:
            elements.append(Paragraph("Nenhum plano de ação registrado.", body_style))
        
        elements.append(PageBreak())
        
        # ===== 5. TREINAMENTOS =====
        elements.append(Paragraph("5. TREINAMENTOS E CAPACITAÇÕES", h1_style))
        
        training = data["training_summary"]
        elements.append(Paragraph(f"Total de matrículas: {training['total_enrollments']}", body_style))
        elements.append(Paragraph(f"Concluídos: {training['completed']}", body_style))
        elements.append(Paragraph(f"Pendentes: {training['pending']}", body_style))
        elements.append(Paragraph(f"Taxa de conclusão: {training['completion_rate']}%", body_style))
        elements.append(Paragraph(f"Certificados emitidos: {training['certificates_issued']}", body_style))
        
        elements.append(PageBreak())
        
        # ===== 6. CERTIFICADOS =====
        elements.append(Paragraph("6. CERTIFICADOS EMITIDOS", h1_style))
        
        certs = data["certificates"][:50]  # Limitar
        if certs:
            for cert in certs:
                elements.append(Paragraph(
                    f"• <b>{cert['certificate_number']}</b> - {cert['employee_name']}",
                    body_style
                ))
                elements.append(Paragraph(
                    f"  Treinamento: {cert['training_title']} | Emitido em: {cert['issued_at'][:10]}",
                    small_style
                ))
        else:
            elements.append(Paragraph("Nenhum certificado emitido.", body_style))
        
        elements.append(PageBreak())
        
        # ===== 7. AUDITORIA =====
        elements.append(Paragraph("7. TRILHA DE AUDITORIA", h1_style))
        elements.append(Paragraph(
            f"Últimos {len(data['audit_trail'])} eventos registrados:",
            body_style
        ))
        
        for event in data["audit_trail"][:30]:
            elements.append(Paragraph(
                f"• [{event['created_at'][:19]}] {event['action']} - {event['entity_type']}",
                small_style
            ))
        
        # Rodapé
        elements.append(Spacer(1, 2*cm))
        elements.append(Paragraph(
            "Este documento foi gerado automaticamente pelo Sistema NR Soluções e possui validade legal conforme NR-1.",
            ParagraphStyle('Footer', parent=styles['Normal'], alignment=TA_CENTER, fontSize=8, textColor=colors.grey)
        ))
        
        # Build PDF
        doc.build(elements)
        
        return buffer.getvalue()
    
    def _generate_pdf_simple(self, data: Dict[str, Any]) -> bytes:
        """Fallback: gera texto simples se reportlab não disponível."""
        lines = [
            "=" * 60,
            "DOSSIÊ PGR - PROGRAMA DE GERENCIAMENTO DE RISCOS",
            "Riscos Psicossociais - NR-1",
            "=" * 60,
            "",
            f"Empresa: {data['meta'].get('tenant_name', 'N/A')}",
            f"Gerado em: {data['meta']['generated_at']}",
            "",
            "-" * 60,
            "1. ESTRUTURA ORGANIZACIONAL",
            "-" * 60,
        ]
        
        for cnpj in data["structure"]["cnpjs"]:
            lines.append(f"\n{cnpj['legal_name']}")
            lines.append(f"CNPJ: {cnpj['cnpj_number']}")
            lines.append(f"Colaboradores: {cnpj.get('employee_count', 0)}")
        
        lines.extend([
            "",
            "-" * 60,
            "2. AVALIAÇÕES DE RISCO",
            "-" * 60,
        ])
        
        for risk in data["risk_assessments"]:
            lines.append(f"\nAvaliação {risk['assessed_at'][:10]}: {risk['level'].upper()} ({risk['score']}%)")
        
        lines.extend([
            "",
            "-" * 60,
            "3. TREINAMENTOS",
            "-" * 60,
            f"Total: {data['training_summary']['total_enrollments']}",
            f"Concluídos: {data['training_summary']['completed']}",
            f"Taxa: {data['training_summary']['completion_rate']}%",
            f"Certificados: {data['training_summary']['certificates_issued']}",
        ])
        
        return "\n".join(lines).encode("utf-8")
