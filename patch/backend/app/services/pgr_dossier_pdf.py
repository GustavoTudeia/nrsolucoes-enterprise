"""Serviço de Geração de Dossiê PGR em PDF

Gera dossiê completo do Programa de Gerenciamento de Riscos conforme NR-1.
Inclui:
- Estrutura organizacional
- Inventário de riscos psicossociais
- Classificações de risco
- Planos de ação
- Evidências de execução
- Relatório de treinamentos
- Trilha de auditoria
"""

from __future__ import annotations
from datetime import datetime
from typing import List, Dict, Any, Optional
import io

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, 
    PageBreak, ListFlowable, ListItem
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT, TA_JUSTIFY


def generate_pgr_dossier_pdf(dossier_data: Dict[str, Any]) -> bytes:
    """Gera PDF do Dossiê PGR completo.
    
    Args:
        dossier_data: Dados do dossiê (retorno de /reports/pgr-dossier)
    
    Returns:
        bytes: Conteúdo do PDF
    """
    buffer = io.BytesIO()
    
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=2*cm,
        leftMargin=2*cm,
        topMargin=2*cm,
        bottomMargin=2*cm,
    )
    
    # Estilos
    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle(
        'PGRTitle',
        parent=styles['Heading1'],
        fontSize=20,
        textColor=colors.HexColor('#1e3a5f'),
        alignment=TA_CENTER,
        spaceAfter=30,
        fontName='Helvetica-Bold',
    )
    
    h1_style = ParagraphStyle(
        'PGRH1',
        parent=styles['Heading1'],
        fontSize=16,
        textColor=colors.HexColor('#1e3a5f'),
        spaceBefore=20,
        spaceAfter=12,
        fontName='Helvetica-Bold',
    )
    
    h2_style = ParagraphStyle(
        'PGRH2',
        parent=styles['Heading2'],
        fontSize=13,
        textColor=colors.HexColor('#2b6cb0'),
        spaceBefore=15,
        spaceAfter=8,
        fontName='Helvetica-Bold',
    )
    
    body_style = ParagraphStyle(
        'PGRBody',
        parent=styles['Normal'],
        fontSize=10,
        textColor=colors.HexColor('#2d3748'),
        alignment=TA_JUSTIFY,
        spaceAfter=8,
        leading=14,
    )
    
    small_style = ParagraphStyle(
        'PGRSmall',
        parent=styles['Normal'],
        fontSize=8,
        textColor=colors.HexColor('#718096'),
        spaceAfter=4,
    )
    
    elements = []
    
    # =========================================================================
    # CAPA
    # =========================================================================
    elements.append(Spacer(1, 3*cm))
    elements.append(Paragraph("DOSSIÊ", title_style))
    elements.append(Paragraph("PROGRAMA DE GERENCIAMENTO DE RISCOS", title_style))
    elements.append(Paragraph("PGR - NR-1", title_style))
    elements.append(Spacer(1, 2*cm))
    
    elements.append(Paragraph(
        f"<b>Gerado em:</b> {datetime.utcnow().strftime('%d/%m/%Y às %H:%M UTC')}",
        body_style
    ))
    
    elements.append(Spacer(1, 1*cm))
    
    # Informações LGPD
    lgpd = dossier_data.get("lgpd", {})
    elements.append(Paragraph(
        f"<i>Limiar de anonimização (k-anonimato): {lgpd.get('min_anon_threshold', 5)} respostas</i>",
        small_style
    ))
    
    elements.append(PageBreak())
    
    # =========================================================================
    # SUMÁRIO
    # =========================================================================
    elements.append(Paragraph("SUMÁRIO", h1_style))
    
    summary_items = [
        "1. Estrutura Organizacional",
        "2. Campanhas de Diagnóstico",
        "3. Avaliações de Risco",
        "4. Planos de Ação",
        "5. Trilha de Auditoria",
    ]
    for item in summary_items:
        elements.append(Paragraph(item, body_style))
    
    elements.append(PageBreak())
    
    # =========================================================================
    # 1. ESTRUTURA ORGANIZACIONAL
    # =========================================================================
    elements.append(Paragraph("1. ESTRUTURA ORGANIZACIONAL", h1_style))
    
    structure = dossier_data.get("structure", {})
    cnpjs = structure.get("cnpjs", [])
    org_units = structure.get("org_units", [])
    
    elements.append(Paragraph("1.1 CNPJs Cadastrados", h2_style))
    
    if cnpjs:
        cnpj_data = [["CNPJ", "Razão Social", "Nome Fantasia", "Ativo"]]
        for c in cnpjs:
            cnpj_data.append([
                c.get("cnpj_number", ""),
                c.get("legal_name", "")[:40],
                c.get("trade_name", "")[:30] if c.get("trade_name") else "-",
                "Sim" if c.get("is_active") else "Não"
            ])
        
        cnpj_table = Table(cnpj_data, colWidths=[4*cm, 6*cm, 4*cm, 2*cm])
        cnpj_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e3a5f')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 8),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f7fafc')]),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
        ]))
        elements.append(cnpj_table)
    else:
        elements.append(Paragraph("<i>Nenhum CNPJ cadastrado.</i>", body_style))
    
    elements.append(Paragraph("1.2 Unidades Organizacionais", h2_style))
    
    if org_units:
        unit_data = [["Unidade", "Tipo", "Ativa"]]
        for u in org_units:
            unit_data.append([
                u.get("name", "")[:40],
                u.get("unit_type", "")[:20],
                "Sim" if u.get("is_active") else "Não"
            ])
        
        unit_table = Table(unit_data, colWidths=[8*cm, 5*cm, 2*cm])
        unit_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e3a5f')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 8),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f7fafc')]),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
        ]))
        elements.append(unit_table)
    else:
        elements.append(Paragraph("<i>Nenhuma unidade cadastrada.</i>", body_style))
    
    elements.append(PageBreak())
    
    # =========================================================================
    # 2. CAMPANHAS DE DIAGNÓSTICO
    # =========================================================================
    elements.append(Paragraph("2. CAMPANHAS DE DIAGNÓSTICO", h1_style))
    
    campaigns = dossier_data.get("campaigns", [])
    
    if campaigns:
        for idx, camp in enumerate(campaigns, 1):
            elements.append(Paragraph(f"2.{idx} {camp.get('name', 'Campanha')}", h2_style))
            
            camp_info = [
                f"<b>Status:</b> {camp.get('status', '')}",
                f"<b>CNPJ:</b> {camp.get('cnpj_legal_name', '-')}",
                f"<b>Unidade:</b> {camp.get('org_unit_name', 'Todas')}",
                f"<b>Respostas:</b> {camp.get('responses', 0)}",
                f"<b>Agregação permitida:</b> {'Sim' if camp.get('aggregation_allowed') else 'Não (mínimo não atingido)'}",
            ]
            for info in camp_info:
                elements.append(Paragraph(info, body_style))
            
            elements.append(Spacer(1, 10))
    else:
        elements.append(Paragraph("<i>Nenhuma campanha encontrada.</i>", body_style))
    
    elements.append(PageBreak())
    
    # =========================================================================
    # 3. AVALIAÇÕES DE RISCO
    # =========================================================================
    elements.append(Paragraph("3. AVALIAÇÕES DE RISCO", h1_style))
    
    elements.append(Paragraph(
        "Classificação de riscos psicossociais conforme metodologia da NR-1, "
        "considerando severidade e probabilidade de ocorrência.",
        body_style
    ))
    
    risks = dossier_data.get("risks", [])
    
    if risks:
        risk_data = [["Data", "Unidade", "Nível", "Score", "Dimensões"]]
        for r in risks:
            date = r.get("assessed_at", "")[:10] if r.get("assessed_at") else "-"
            level = r.get("level", "").upper()
            score = f"{float(r.get('score', 0)) * 100:.0f}%"
            
            dims = r.get("dimension_scores", {})
            dims_text = ", ".join([f"{k}: {float(v)*100:.0f}%" for k, v in dims.items()][:3])
            
            risk_data.append([date, r.get("org_unit_id", "-")[:8], level, score, dims_text[:40]])
        
        risk_table = Table(risk_data, colWidths=[2.5*cm, 3*cm, 2*cm, 2*cm, 6*cm])
        risk_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e3a5f')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 8),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f7fafc')]),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
        ]))
        elements.append(risk_table)
    else:
        elements.append(Paragraph("<i>Nenhuma avaliação de risco encontrada.</i>", body_style))
    
    elements.append(PageBreak())
    
    # =========================================================================
    # 4. PLANOS DE AÇÃO
    # =========================================================================
    elements.append(Paragraph("4. PLANOS DE AÇÃO", h1_style))
    
    action_plans = dossier_data.get("action_plans", [])
    
    if action_plans:
        for idx, plan in enumerate(action_plans, 1):
            elements.append(Paragraph(f"4.{idx} Plano #{plan.get('id', '')[:8]}", h2_style))
            elements.append(Paragraph(f"<b>Status:</b> {plan.get('status', '')}", body_style))
            elements.append(Paragraph(f"<b>Versão:</b> {plan.get('version', 1)}", body_style))
            
            items = plan.get("items", [])
            if items:
                elements.append(Paragraph("Itens do Plano:", body_style))
                
                item_data = [["Tipo", "Título", "Status", "Responsável", "Prazo"]]
                for item in items:
                    due = item.get("due_date", "")[:10] if item.get("due_date") else "-"
                    item_data.append([
                        item.get("item_type", "")[:10],
                        item.get("title", "")[:30],
                        item.get("status", ""),
                        item.get("responsible", "-")[:15],
                        due
                    ])
                
                item_table = Table(item_data, colWidths=[2.5*cm, 5*cm, 2.5*cm, 3*cm, 2.5*cm])
                item_table.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2b6cb0')),
                    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                    ('FONTSIZE', (0, 0), (-1, -1), 7),
                    ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                    ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f7fafc')]),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
                    ('TOPPADDING', (0, 0), (-1, -1), 4),
                ]))
                elements.append(item_table)
                
                # Evidências
                for item in items:
                    evidences = item.get("evidences", [])
                    if evidences:
                        elements.append(Spacer(1, 8))
                        elements.append(Paragraph(
                            f"<b>Evidências de '{item.get('title', '')[:25]}...':</b>",
                            small_style
                        ))
                        for ev in evidences[:5]:  # Limitar a 5
                            elements.append(Paragraph(
                                f"• [{ev.get('evidence_type', '')}] {ev.get('reference', '')[:50]}",
                                small_style
                            ))
            
            elements.append(Spacer(1, 15))
    else:
        elements.append(Paragraph("<i>Nenhum plano de ação encontrado.</i>", body_style))
    
    elements.append(PageBreak())
    
    # =========================================================================
    # 5. TRILHA DE AUDITORIA
    # =========================================================================
    elements.append(Paragraph("5. TRILHA DE AUDITORIA", h1_style))
    
    elements.append(Paragraph(
        "Registro de eventos para conformidade e fiscalização. "
        "Os dados são mantidos por mínimo de 20 anos conforme NR-1.",
        body_style
    ))
    
    audit = dossier_data.get("audit", [])
    
    if audit:
        audit_data = [["Data/Hora", "Ação", "Entidade", "IP"]]
        for ev in audit[:50]:  # Limitar a 50 eventos
            dt = ev.get("created_at", "")[:19].replace("T", " ") if ev.get("created_at") else "-"
            audit_data.append([
                dt,
                ev.get("action", ""),
                ev.get("entity_type", ""),
                ev.get("ip", "-")[:15],
            ])
        
        audit_table = Table(audit_data, colWidths=[4*cm, 3*cm, 4*cm, 3.5*cm])
        audit_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e3a5f')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 7),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f7fafc')]),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
        ]))
        elements.append(audit_table)
        
        if len(audit) > 50:
            elements.append(Paragraph(
                f"<i>Exibindo 50 de {len(audit)} eventos. Consulte o sistema para histórico completo.</i>",
                small_style
            ))
    else:
        elements.append(Paragraph("<i>Nenhum evento de auditoria encontrado.</i>", body_style))
    
    # =========================================================================
    # RODAPÉ FINAL
    # =========================================================================
    elements.append(Spacer(1, 2*cm))
    elements.append(Paragraph(
        "---",
        body_style
    ))
    elements.append(Paragraph(
        "Este documento foi gerado automaticamente pelo sistema NR Soluções "
        "e atende aos requisitos de documentação da NR-1 (Portaria MTE nº 1.419/2024).",
        small_style
    ))
    elements.append(Paragraph(
        "Os dados apresentados devem ser mantidos disponíveis para fiscalização "
        "pelo período mínimo de 20 anos, conforme legislação vigente.",
        small_style
    ))
    
    # Gerar PDF
    doc.build(elements)
    
    pdf_bytes = buffer.getvalue()
    buffer.close()
    
    return pdf_bytes
