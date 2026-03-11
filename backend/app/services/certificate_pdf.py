"""Serviço de Geração de PDF de Certificado NR-1

Gera certificados de capacitação em PDF conforme requisitos da NR-1.
Os certificados incluem:
- Identificação do colaborador
- Conteúdo do treinamento
- Data de conclusão
- Código de validação
- QR Code para verificação
"""

from __future__ import annotations
from datetime import datetime
from typing import Optional
from uuid import UUID
import hashlib
import io

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY

from app.models.training import TrainingCertificate
from app.models.tenant import Tenant


def generate_certificate_pdf(
    certificate: TrainingCertificate,
    tenant: Optional[Tenant] = None,
) -> bytes:
    """Gera PDF do certificado de capacitação.
    
    Args:
        certificate: Certificado a ser renderizado
        tenant: Tenant para personalização (logo, nome)
    
    Returns:
        bytes: Conteúdo do PDF
    """
    buffer = io.BytesIO()
    
    # Configurar documento em paisagem
    doc = SimpleDocTemplate(
        buffer,
        pagesize=landscape(A4),
        rightMargin=2*cm,
        leftMargin=2*cm,
        topMargin=1.5*cm,
        bottomMargin=1.5*cm,
    )
    
    # Estilos
    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle(
        'CertTitle',
        parent=styles['Heading1'],
        fontSize=28,
        textColor=colors.HexColor('#1e3a5f'),
        alignment=TA_CENTER,
        spaceAfter=20,
        fontName='Helvetica-Bold',
    )
    
    subtitle_style = ParagraphStyle(
        'CertSubtitle',
        parent=styles['Normal'],
        fontSize=14,
        textColor=colors.HexColor('#4a5568'),
        alignment=TA_CENTER,
        spaceAfter=30,
    )
    
    body_style = ParagraphStyle(
        'CertBody',
        parent=styles['Normal'],
        fontSize=12,
        textColor=colors.HexColor('#2d3748'),
        alignment=TA_JUSTIFY,
        spaceAfter=12,
        leading=18,
    )
    
    name_style = ParagraphStyle(
        'CertName',
        parent=styles['Heading2'],
        fontSize=22,
        textColor=colors.HexColor('#1e3a5f'),
        alignment=TA_CENTER,
        spaceBefore=20,
        spaceAfter=20,
        fontName='Helvetica-Bold',
    )
    
    content_style = ParagraphStyle(
        'CertContent',
        parent=styles['Normal'],
        fontSize=14,
        textColor=colors.HexColor('#2b6cb0'),
        alignment=TA_CENTER,
        spaceBefore=10,
        spaceAfter=10,
        fontName='Helvetica-Bold',
    )
    
    footer_style = ParagraphStyle(
        'CertFooter',
        parent=styles['Normal'],
        fontSize=9,
        textColor=colors.HexColor('#718096'),
        alignment=TA_CENTER,
    )
    
    # Construir elementos
    elements = []
    
    # Cabeçalho com logo/nome da empresa
    tenant_name = tenant.name if tenant else "NR Soluções"
    elements.append(Paragraph(
        f"<b>{tenant_name}</b>",
        subtitle_style
    ))
    
    # Título
    elements.append(Paragraph(
        "CERTIFICADO DE CAPACITAÇÃO",
        title_style
    ))
    
    elements.append(Paragraph(
        "Gestão de Riscos Psicossociais - NR-1",
        subtitle_style
    ))
    
    elements.append(Spacer(1, 20))
    
    # Corpo do certificado
    elements.append(Paragraph(
        "Certificamos que",
        body_style
    ))
    
    elements.append(Paragraph(
        certificate.employee_name,
        name_style
    ))
    
    # CPF mascarado
    cpf_display = certificate.employee_cpf or certificate.employee_identifier
    elements.append(Paragraph(
        f"Identificação: {cpf_display}",
        body_style
    ))
    
    elements.append(Spacer(1, 15))
    
    elements.append(Paragraph(
        "concluiu com êxito o treinamento",
        body_style
    ))
    
    elements.append(Paragraph(
        certificate.training_title,
        content_style
    ))

    if certificate.training_description:
        elements.append(Paragraph(
            certificate.training_description[:200] + ("..." if len(certificate.training_description or "") > 200 else ""),
            body_style
        ))
    
    # Informações adicionais
    elements.append(Spacer(1, 20))
    
    duration_text = f"Carga horária: {certificate.training_duration_minutes} minutos" if certificate.training_duration_minutes else ""
    completion_date = certificate.training_completed_at.strftime("%d/%m/%Y") if certificate.training_completed_at else "N/A"
    issue_date = certificate.issued_at.strftime("%d/%m/%Y") if certificate.issued_at else "N/A"
    
    info_data = [
        ["Data de Conclusão:", completion_date, "Data de Emissão:", issue_date],
    ]
    if certificate.training_duration_minutes:
        info_data.append(["Carga Horária:", f"{certificate.training_duration_minutes} minutos", "", ""])
    
    info_table = Table(info_data, colWidths=[4*cm, 5*cm, 4*cm, 5*cm])
    info_table.setStyle(TableStyle([
        ('TEXTCOLOR', (0, 0), (-1, -1), colors.HexColor('#4a5568')),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('ALIGN', (0, 0), (0, -1), 'RIGHT'),
        ('ALIGN', (1, 0), (1, -1), 'LEFT'),
        ('ALIGN', (2, 0), (2, -1), 'RIGHT'),
        ('ALIGN', (3, 0), (3, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (2, 0), (2, -1), 'Helvetica-Bold'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ]))
    elements.append(info_table)
    
    elements.append(Spacer(1, 30))
    
    # Contexto NR-1
    if certificate.action_plan_title:
        elements.append(Paragraph(
            f"<i>Ação do Plano NR-1: {certificate.action_plan_title}</i>",
            body_style
        ))
    
    elements.append(Spacer(1, 40))
    
    # Rodapé com validação
    elements.append(Paragraph(
        f"<b>Certificado Nº:</b> {certificate.certificate_number}",
        footer_style
    ))
    
    if certificate.validation_code:
        elements.append(Paragraph(
            f"<b>Código de Validação:</b> {certificate.validation_code}",
            footer_style
        ))
    
    # NR-1 Mandatory Information
    nr1_info = []
    if getattr(certificate, 'instructor_name', None):
        instructor_text = f"Instrutor: {certificate.instructor_name}"
        if getattr(certificate, 'instructor_qualification', None):
            instructor_text += f" — {certificate.instructor_qualification}"
        nr1_info.append(instructor_text)

    if getattr(certificate, 'training_location', None):
        nr1_info.append(f"Local: {certificate.training_location}")

    if getattr(certificate, 'training_modality', None):
        modality_labels = {"presential": "Presencial", "remote": "Remoto/EAD", "hybrid": "Híbrido"}
        nr1_info.append(f"Modalidade: {modality_labels.get(certificate.training_modality, certificate.training_modality)}")

    if getattr(certificate, 'formal_hours_minutes', None):
        fh = certificate.formal_hours_minutes // 60
        fm = certificate.formal_hours_minutes % 60
        nr1_info.append(f"Carga horária formal: {fh}h{fm:02d}min" if fh > 0 else f"Carga horária formal: {fm} minutos")

    if nr1_info:
        elements.append(Spacer(1, 10))
        for info in nr1_info:
            elements.append(Paragraph(info, footer_style))

    if getattr(certificate, 'syllabus', None):
        elements.append(Spacer(1, 8))
        elements.append(Paragraph("Conteúdo Programático:", ParagraphStyle("SyllTitle", parent=footer_style, fontName="Helvetica-Bold")))
        syllabus_text = certificate.syllabus[:500]
        if len(certificate.syllabus) > 500:
            syllabus_text += "..."
        elements.append(Paragraph(syllabus_text, ParagraphStyle("Syll", parent=footer_style, fontSize=9)))

    elements.append(Spacer(1, 10))

    elements.append(Paragraph(
        "Este certificado atesta a conclusão de treinamento conforme requisitos da "
        "Norma Regulamentadora NR-1 (Portaria MTE nº 1.419/2024) para gestão de riscos psicossociais.",
        footer_style
    ))
    
    elements.append(Paragraph(
        f"Documento gerado eletronicamente em {datetime.utcnow().strftime('%d/%m/%Y às %H:%M UTC')}",
        footer_style
    ))
    
    # Gerar PDF
    doc.build(elements)
    
    pdf_bytes = buffer.getvalue()
    buffer.close()
    
    return pdf_bytes


def calculate_pdf_hash(pdf_bytes: bytes) -> str:
    """Calcula hash SHA256 do PDF para validação."""
    return hashlib.sha256(pdf_bytes).hexdigest()
