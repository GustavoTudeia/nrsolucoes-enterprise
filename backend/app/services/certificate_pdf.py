"""Serviço de Geração de PDF de Certificado NR-1 — Enterprise

Gera certificados de capacitação em PDF com layout enterprise conforme
requisitos da NR-1 (Portaria MTE nº 1.419/2024).

Layout:
- Fundo navy premium com borda dourada
- Selo de autenticidade com código de validação
- Dados do colaborador e treinamento formatados
- Conformidade NR-1 com campos obrigatórios
- Hash de integridade e carimbo temporal
"""

from __future__ import annotations
from datetime import datetime
from typing import Optional
import hashlib
import io
import math

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm, mm
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY, TA_RIGHT
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.pdfgen.canvas import Canvas

from app.models.training import TrainingCertificate
from app.models.tenant import Tenant


# ---------------------------------------------------------------------------
# Paleta enterprise
# ---------------------------------------------------------------------------
_C = {
    "navy":        colors.HexColor("#0F2B46"),
    "navy_mid":    colors.HexColor("#163D5C"),
    "navy_light":  colors.HexColor("#1E4D72"),
    "blue":        colors.HexColor("#1B6EC2"),
    "blue_light":  colors.HexColor("#3B82F6"),
    "gold":        colors.HexColor("#D4A853"),
    "gold_light":  colors.HexColor("#E8C97A"),
    "white":       colors.white,
    "off_white":   colors.HexColor("#F8FAFC"),
    "gray_100":    colors.HexColor("#F1F5F9"),
    "gray_300":    colors.HexColor("#CBD5E1"),
    "gray_500":    colors.HexColor("#64748B"),
    "gray_700":    colors.HexColor("#334155"),
    "gray_900":    colors.HexColor("#0F172A"),
    "green":       colors.HexColor("#16A34A"),
    "teal":        colors.HexColor("#0D9488"),
}

PAGE_W, PAGE_H = landscape(A4)


# ---------------------------------------------------------------------------
# Canvas decorations
# ---------------------------------------------------------------------------

def _draw_background(canvas: Canvas):
    """Fundo premium com gradiente navy e elementos decorativos."""
    canvas.saveState()

    # Fundo navy principal
    canvas.setFillColor(_C["navy"])
    canvas.rect(0, 0, PAGE_W, PAGE_H, fill=True, stroke=False)

    # Linha dourada superior (separando área do header)
    canvas.setStrokeColor(_C["gold"])
    canvas.setLineWidth(2)
    canvas.line(2 * cm, PAGE_H - 3 * cm, PAGE_W - 2 * cm, PAGE_H - 3 * cm)

    # Linha dourada inferior
    canvas.line(2 * cm, 2.2 * cm, PAGE_W - 2 * cm, 2.2 * cm)

    # Moldura interna decorativa
    inset = 1.2 * cm
    canvas.setStrokeColor(_C["gold_light"])
    canvas.setLineWidth(0.5)
    canvas.setDash(3, 3)
    canvas.rect(inset, inset, PAGE_W - 2 * inset, PAGE_H - 2 * inset, fill=False, stroke=True)
    canvas.setDash()

    # Cantos decorativos (ornamentos nas 4 quinas)
    corner_size = 18
    canvas.setStrokeColor(_C["gold"])
    canvas.setLineWidth(1.5)
    for cx, cy, dx, dy in [
        (inset, PAGE_H - inset, 1, -1),
        (PAGE_W - inset, PAGE_H - inset, -1, -1),
        (inset, inset, 1, 1),
        (PAGE_W - inset, inset, -1, 1),
    ]:
        canvas.line(cx, cy, cx + dx * corner_size, cy)
        canvas.line(cx, cy, cx, cy + dy * corner_size)

    # Selo circular decorativo (canto inferior direito)
    seal_x = PAGE_W - 4.5 * cm
    seal_y = 3.8 * cm
    canvas.setStrokeColor(_C["gold"])
    canvas.setLineWidth(1.2)
    canvas.circle(seal_x, seal_y, 1.4 * cm, fill=False, stroke=True)
    canvas.circle(seal_x, seal_y, 1.15 * cm, fill=False, stroke=True)

    canvas.setFont("Helvetica-Bold", 6)
    canvas.setFillColor(_C["gold"])
    # Text around the seal
    canvas.drawCentredString(seal_x, seal_y + 5, "NR-1")
    canvas.setFont("Helvetica", 5)
    canvas.drawCentredString(seal_x, seal_y - 3, "CERTIFICADO")
    canvas.drawCentredString(seal_x, seal_y - 10, "DIGITAL")

    canvas.restoreState()


def _draw_header(canvas: Canvas, tenant_name: str):
    """Cabeçalho com nome da empresa na faixa superior."""
    canvas.saveState()

    # Ícone/badge "NR Soluções" na faixa
    canvas.setFont("Helvetica-Bold", 9)
    canvas.setFillColor(_C["gold_light"])
    canvas.drawString(2.5 * cm, PAGE_H - 1.5 * cm, "NR SOLUÇÕES ENTERPRISE")

    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#8AABCF"))
    canvas.drawString(2.5 * cm, PAGE_H - 2 * cm, "Plataforma de Gestão de Riscos Psicossociais")

    # Tenant name (right side)
    canvas.setFont("Helvetica-Bold", 10)
    canvas.setFillColor(_C["white"])
    canvas.drawRightString(PAGE_W - 2.5 * cm, PAGE_H - 1.5 * cm, tenant_name.upper())

    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(colors.HexColor("#8AABCF"))
    canvas.drawRightString(PAGE_W - 2.5 * cm, PAGE_H - 2 * cm, "Programa de Gerenciamento de Riscos — PGR")

    canvas.restoreState()


def _draw_footer(canvas: Canvas, certificate: TrainingCertificate):
    """Rodapé com informações de validação e hash."""
    canvas.saveState()

    y_base = 1 * cm

    canvas.setFont("Helvetica", 6.5)
    canvas.setFillColor(_C["gray_500"])

    # Left: certificate number
    canvas.drawString(2.5 * cm, y_base + 4 * mm,
                      f"Certificado Nº {certificate.certificate_number}")
    canvas.drawString(2.5 * cm, y_base,
                      f"Gerado em {datetime.utcnow().strftime('%d/%m/%Y às %H:%M UTC')}")

    # Center: NR-1 compliance text
    canvas.setFont("Helvetica-Oblique", 6)
    canvas.drawCentredString(PAGE_W / 2, y_base + 4 * mm,
                             "Conforme NR-1 (Portaria MTE nº 1.419/2024) — Gestão de Riscos Psicossociais")
    canvas.drawCentredString(PAGE_W / 2, y_base,
                             "Documento eletrônico com validade legal")

    # Right: validation code
    if certificate.validation_code:
        canvas.setFont("Courier-Bold", 7)
        canvas.setFillColor(_C["gold"])
        canvas.drawRightString(PAGE_W - 2.5 * cm, y_base + 4 * mm,
                               f"Código: {certificate.validation_code}")
    canvas.setFont("Helvetica", 6)
    canvas.setFillColor(_C["gray_500"])
    if certificate.issuer_name:
        canvas.drawRightString(PAGE_W - 2.5 * cm, y_base,
                               f"Emissor: {certificate.issuer_name}")

    canvas.restoreState()


# ---------------------------------------------------------------------------
# Main generator
# ---------------------------------------------------------------------------

def generate_certificate_pdf(
    certificate: TrainingCertificate,
    tenant: Optional[Tenant] = None,
) -> bytes:
    """Gera PDF enterprise do certificado de capacitação NR-1."""

    buffer = io.BytesIO()
    tenant_name = tenant.name if tenant else (certificate.issuer_name or "NR Soluções")

    frame = Frame(
        3.5 * cm,                          # x
        3 * cm,                            # y
        PAGE_W - 7 * cm,                   # width
        PAGE_H - 6.5 * cm,                # height
        id="cert_frame",
    )

    def on_page(canvas, doc):
        _draw_background(canvas)
        _draw_header(canvas, tenant_name)
        _draw_footer(canvas, certificate)

    doc = BaseDocTemplate(
        buffer,
        pagesize=landscape(A4),
        title=f"Certificado {certificate.certificate_number}",
        author="NR Soluções Enterprise",
    )
    doc.addPageTemplates([
        PageTemplate(id="cert", frames=[frame], onPage=on_page),
    ])

    # Styles
    base = getSampleStyleSheet()

    st_title = ParagraphStyle(
        "cert_title", parent=base["Title"],
        fontName="Helvetica-Bold", fontSize=26, leading=32,
        textColor=_C["gold"], alignment=TA_CENTER, spaceAfter=4,
    )
    st_subtitle = ParagraphStyle(
        "cert_subtitle", parent=base["Normal"],
        fontName="Helvetica", fontSize=11, leading=14,
        textColor=colors.HexColor("#8AABCF"), alignment=TA_CENTER, spaceAfter=16,
    )
    st_body = ParagraphStyle(
        "cert_body", parent=base["Normal"],
        fontName="Helvetica", fontSize=11, leading=15,
        textColor=_C["gray_300"], alignment=TA_CENTER, spaceAfter=6,
    )
    st_name = ParagraphStyle(
        "cert_name", parent=base["Title"],
        fontName="Helvetica-Bold", fontSize=24, leading=30,
        textColor=_C["white"], alignment=TA_CENTER,
        spaceBefore=8, spaceAfter=4,
    )
    st_id = ParagraphStyle(
        "cert_id", parent=base["Normal"],
        fontName="Helvetica", fontSize=9, leading=12,
        textColor=_C["gray_500"], alignment=TA_CENTER, spaceAfter=14,
    )
    st_training = ParagraphStyle(
        "cert_training", parent=base["Normal"],
        fontName="Helvetica-Bold", fontSize=14, leading=18,
        textColor=_C["blue_light"], alignment=TA_CENTER,
        spaceBefore=4, spaceAfter=6,
    )
    st_training_desc = ParagraphStyle(
        "cert_training_desc", parent=base["Normal"],
        fontName="Helvetica", fontSize=10, leading=13,
        textColor=_C["gray_300"], alignment=TA_CENTER, spaceAfter=12,
    )
    st_label = ParagraphStyle(
        "cert_label", parent=base["Normal"],
        fontName="Helvetica-Bold", fontSize=8.5, leading=11,
        textColor=_C["gray_500"], alignment=TA_LEFT,
    )
    st_value = ParagraphStyle(
        "cert_value", parent=base["Normal"],
        fontName="Helvetica", fontSize=9.5, leading=13,
        textColor=_C["white"], alignment=TA_LEFT,
    )
    st_nr1 = ParagraphStyle(
        "cert_nr1", parent=base["Normal"],
        fontName="Helvetica", fontSize=8, leading=11,
        textColor=_C["gray_500"], alignment=TA_CENTER, spaceAfter=3,
    )
    st_nr1_bold = ParagraphStyle(
        "cert_nr1_bold", parent=st_nr1,
        fontName="Helvetica-Bold", textColor=_C["gray_300"],
    )

    # Build elements
    elements = []

    # Title
    elements.append(Paragraph("CERTIFICADO DE CAPACITAÇÃO", st_title))
    elements.append(Paragraph("Programa de Gerenciamento de Riscos Psicossociais — NR-1", st_subtitle))

    # Divider line (gold)
    divider_data = [["" ]]
    divider = Table(divider_data, colWidths=[12 * cm])
    divider.setStyle(TableStyle([
        ("LINEBELOW", (0, 0), (-1, -1), 0.8, _C["gold"]),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    elements.append(divider)

    # "Certificamos que"
    elements.append(Paragraph("Certificamos que", st_body))

    # Employee name
    elements.append(Paragraph(certificate.employee_name.upper(), st_name))

    # CPF / Identifier
    cpf_display = certificate.employee_cpf or certificate.employee_identifier or ""
    if cpf_display:
        elements.append(Paragraph(f"Identificação: {cpf_display}", st_id))

    # "concluiu com êxito o treinamento"
    elements.append(Paragraph("concluiu com êxito o treinamento", st_body))

    # Training title
    elements.append(Paragraph(certificate.training_title, st_training))

    # Training description
    if certificate.training_description:
        desc = certificate.training_description[:250]
        if len(certificate.training_description) > 250:
            desc += "..."
        elements.append(Paragraph(desc, st_training_desc))

    elements.append(Spacer(1, 8))

    # Info grid — only include fields that have values
    info_cells = []

    if certificate.training_completed_at:
        info_cells.append(("DATA DE CONCLUSÃO", certificate.training_completed_at.strftime("%d/%m/%Y")))
    if certificate.issued_at:
        info_cells.append(("DATA DE EMISSÃO", certificate.issued_at.strftime("%d/%m/%Y")))
    if certificate.training_duration_minutes:
        h = certificate.training_duration_minutes // 60
        m = certificate.training_duration_minutes % 60
        if h > 0:
            dur = f"{h}h{m:02d}min" if m else f"{h} hora{'s' if h > 1 else ''}"
        else:
            dur = f"{m} minutos"
        info_cells.append(("CARGA HORÁRIA", dur))
    if getattr(certificate, "valid_until", None):
        info_cells.append(("VALIDADE", certificate.valid_until.strftime("%d/%m/%Y")))

    if info_cells:
        # Arrange in rows of 2 pairs (label+value per cell, 2 cells per row)
        num_cols = min(len(info_cells), 2) * 2  # 2 or 4 columns
        col_w = (PAGE_W - 7 * cm) / num_cols
        info_rows = []
        for i in range(0, len(info_cells), 2):
            row = []
            row.append(Paragraph(info_cells[i][0], st_label))
            row.append(Paragraph(info_cells[i][1], st_value))
            if i + 1 < len(info_cells):
                row.append(Paragraph(info_cells[i + 1][0], st_label))
                row.append(Paragraph(info_cells[i + 1][1], st_value))
            info_rows.append(row)

        # Determine actual number of columns from first row
        actual_cols = len(info_rows[0])
        col_w = (PAGE_W - 7 * cm) / actual_cols

        info_table = Table(info_rows, colWidths=[col_w] * actual_cols, rowHeights=[1.1 * cm] * len(info_rows))
        divider_col = 1 if actual_cols == 4 else -1
        style_cmds = [
            ("LINEABOVE", (0, 0), (-1, 0), 0.8, _C["gold"]),
            ("BACKGROUND", (0, 0), (-1, -1), _C["navy_mid"]),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING", (0, 0), (-1, -1), 10),
            ("RIGHTPADDING", (0, 0), (-1, -1), 10),
            ("BOX", (0, 0), (-1, -1), 0.5, _C["navy_light"]),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]
        if actual_cols == 4:
            style_cmds.append(("LINEAFTER", (1, 0), (1, -1), 0.3, _C["navy_light"]))
        info_table.setStyle(TableStyle(style_cmds))
        elements.append(info_table)

    elements.append(Spacer(1, 10))

    # NR-1 compliance section
    nr1_parts = []
    if certificate.action_plan_title:
        nr1_parts.append(f"Ação do PGR: {certificate.action_plan_title}")
    if certificate.risk_dimension:
        nr1_parts.append(f"Dimensão: {certificate.risk_dimension}")

    # NR-1 mandatory fields
    if getattr(certificate, "instructor_name", None):
        inst = f"Instrutor(a): {certificate.instructor_name}"
        if getattr(certificate, "instructor_qualification", None):
            inst += f" — {certificate.instructor_qualification}"
        nr1_parts.append(inst)

    if getattr(certificate, "training_location", None):
        nr1_parts.append(f"Local: {certificate.training_location}")

    if getattr(certificate, "training_modality", None):
        modality_map = {
            "presential": "Presencial",
            "remote": "Remoto/EAD",
            "hybrid": "Híbrido",
        }
        nr1_parts.append(
            f"Modalidade: {modality_map.get(certificate.training_modality, certificate.training_modality)}"
        )

    if getattr(certificate, "formal_hours_minutes", None):
        fh = certificate.formal_hours_minutes // 60
        fm = certificate.formal_hours_minutes % 60
        fh_text = f"{fh}h{fm:02d}min" if fh > 0 else f"{fm} minutos"
        nr1_parts.append(f"Carga horária formal: {fh_text}")

    if nr1_parts:
        elements.append(Paragraph(
            " &nbsp;|&nbsp; ".join(nr1_parts),
            st_nr1
        ))

    # Syllabus
    if getattr(certificate, "syllabus", None):
        elements.append(Spacer(1, 4))
        elements.append(Paragraph("Conteúdo Programático:", st_nr1_bold))
        syllabus_text = certificate.syllabus[:400]
        if len(certificate.syllabus) > 400:
            syllabus_text += "..."
        elements.append(Paragraph(syllabus_text, st_nr1))

    # Legal text
    elements.append(Spacer(1, 8))
    elements.append(Paragraph(
        "Este certificado atesta a conclusão de treinamento obrigatório conforme requisitos da "
        "Norma Regulamentadora NR-1 (Portaria MTE nº 1.419/2024) para gestão de riscos psicossociais "
        "no ambiente de trabalho.",
        ParagraphStyle("legal", parent=st_nr1, fontSize=7.5, textColor=_C["gray_500"]),
    ))

    doc.build(elements)
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes


def calculate_pdf_hash(pdf_bytes: bytes) -> str:
    """Calcula hash SHA256 do PDF para validação."""
    return hashlib.sha256(pdf_bytes).hexdigest()
