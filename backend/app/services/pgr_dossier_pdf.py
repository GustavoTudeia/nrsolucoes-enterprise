"""Dossiê PGR — Geração de PDF Enterprise

Gera documento formal do Programa de Gerenciamento de Riscos Psicossociais
conforme NR-1 (Portaria MTE n. 1.419/2024), com layout profissional para
apresentação a órgãos fiscalizadores e alta gestão.

Seções:
  0. Capa institucional
  1. Resumo executivo (indicadores-chave)
  2. Estrutura organizacional
  3. Diagnósticos realizados
  4. Inventário e classificação de riscos
  5. Planos de ação e evidências
  6. Treinamentos e certificações
  7. Trilha de auditoria
  8. Termo de encerramento e hash de integridade
"""

from __future__ import annotations

import hashlib
import io
import json
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm, mm
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    KeepTogether,
)
from reportlab.graphics.shapes import Drawing, String, Rect
from reportlab.graphics.charts.piecharts import Pie
from reportlab.graphics.charts.barcharts import HorizontalBarChart
from reportlab.graphics.charts.legends import Legend
from reportlab.graphics import renderPDF

# ---------------------------------------------------------------------------
# Paleta de cores enterprise
# ---------------------------------------------------------------------------
_C = {
    "navy":        colors.HexColor("#0F2B46"),
    "navy_light":  colors.HexColor("#163D5C"),
    "blue":        colors.HexColor("#1B6EC2"),
    "blue_light":  colors.HexColor("#E8F0FE"),
    "teal":        colors.HexColor("#0D9488"),
    "green":       colors.HexColor("#16A34A"),
    "green_bg":    colors.HexColor("#F0FDF4"),
    "yellow":      colors.HexColor("#CA8A04"),
    "yellow_bg":   colors.HexColor("#FEFCE8"),
    "red":         colors.HexColor("#DC2626"),
    "red_bg":      colors.HexColor("#FEF2F2"),
    "gray_900":    colors.HexColor("#111827"),
    "gray_700":    colors.HexColor("#374151"),
    "gray_500":    colors.HexColor("#6B7280"),
    "gray_400":    colors.HexColor("#9CA3AF"),
    "gray_200":    colors.HexColor("#E5E7EB"),
    "gray_100":    colors.HexColor("#F3F4F6"),
    "gray_50":     colors.HexColor("#F9FAFB"),
    "white":       colors.white,
}

LEVEL_COLORS = {
    "high":   (_C["red"],    _C["red_bg"]),
    "medium": (_C["yellow"], _C["yellow_bg"]),
    "low":    (_C["green"],  _C["green_bg"]),
}

LEVEL_LABELS = {"high": "ALTO", "medium": "MEDIO", "low": "BAIXO"}

STATUS_LABELS = {
    "planned":     "Planejado",
    "in_progress": "Em Andamento",
    "done":        "Concluido",
    "cancelled":   "Cancelado",
    "open":        "Aberta",
    "closed":      "Encerrada",
    "draft":       "Rascunho",
}

TYPE_LABELS = {
    "educational":     "Educativo",
    "organizational":  "Organizacional",
    "administrative":  "Administrativo",
    "support":         "Apoio/Suporte",
}

PAGE_W, PAGE_H = A4
MARGIN = 2 * cm
CONTENT_W = PAGE_W - 2 * MARGIN

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _s(val: Any, default: str = "-") -> str:
    """Safe string: converte None/''/... em default legível."""
    if val is None:
        return default
    s = str(val).strip()
    return s if s else default


def _date(iso: Optional[str], fmt: str = "%d/%m/%Y") -> str:
    if not iso:
        return "-"
    try:
        return datetime.fromisoformat(iso.replace("Z", "+00:00")).strftime(fmt)
    except Exception:
        return iso[:10] if len(iso) >= 10 else iso


def _datetime(iso: Optional[str]) -> str:
    return _date(iso, "%d/%m/%Y %H:%M")


def _pct(val: Any) -> str:
    try:
        v = float(val)
        if v <= 1.0:
            v *= 100
        return f"{v:.0f}%"
    except Exception:
        return "-"


def _doc_hash(data: Dict) -> str:
    raw = json.dumps(data, sort_keys=True, default=str).encode()
    return hashlib.sha256(raw).hexdigest()[:16].upper()


# ---------------------------------------------------------------------------
# Estilos
# ---------------------------------------------------------------------------

def _build_styles() -> Dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "cover_title": ParagraphStyle(
            "cover_title", parent=base["Title"],
            fontName="Helvetica-Bold", fontSize=28, leading=34,
            textColor=_C["white"], alignment=TA_CENTER, spaceAfter=6,
        ),
        "cover_subtitle": ParagraphStyle(
            "cover_subtitle", parent=base["Normal"],
            fontName="Helvetica", fontSize=14, leading=18,
            textColor=colors.HexColor("#B0C4DE"), alignment=TA_CENTER, spaceAfter=4,
        ),
        "cover_info": ParagraphStyle(
            "cover_info", parent=base["Normal"],
            fontName="Helvetica", fontSize=10, leading=14,
            textColor=colors.HexColor("#8AABCF"), alignment=TA_CENTER, spaceAfter=2,
        ),
        "section_number": ParagraphStyle(
            "section_number", parent=base["Normal"],
            fontName="Helvetica-Bold", fontSize=11, leading=14,
            textColor=_C["blue"], spaceAfter=0, spaceBefore=0,
        ),
        "h1": ParagraphStyle(
            "h1", parent=base["Heading1"],
            fontName="Helvetica-Bold", fontSize=16, leading=20,
            textColor=_C["navy"], spaceBefore=24, spaceAfter=10,
            borderPadding=(0, 0, 4, 0),
        ),
        "h2": ParagraphStyle(
            "h2", parent=base["Heading2"],
            fontName="Helvetica-Bold", fontSize=12, leading=16,
            textColor=_C["navy_light"], spaceBefore=16, spaceAfter=6,
        ),
        "h3": ParagraphStyle(
            "h3", parent=base["Heading3"],
            fontName="Helvetica-Bold", fontSize=10, leading=13,
            textColor=_C["gray_700"], spaceBefore=10, spaceAfter=4,
        ),
        "body": ParagraphStyle(
            "body", parent=base["Normal"],
            fontName="Helvetica", fontSize=9.5, leading=13.5,
            textColor=_C["gray_700"], alignment=TA_JUSTIFY, spaceAfter=6,
        ),
        "body_bold": ParagraphStyle(
            "body_bold", parent=base["Normal"],
            fontName="Helvetica-Bold", fontSize=9.5, leading=13.5,
            textColor=_C["gray_700"], spaceAfter=6,
        ),
        "caption": ParagraphStyle(
            "caption", parent=base["Normal"],
            fontName="Helvetica-Oblique", fontSize=8, leading=10,
            textColor=_C["gray_500"], spaceAfter=4,
        ),
        "footer": ParagraphStyle(
            "footer", parent=base["Normal"],
            fontName="Helvetica", fontSize=7, leading=9,
            textColor=_C["gray_400"], alignment=TA_CENTER,
        ),
        "kpi_value": ParagraphStyle(
            "kpi_value", parent=base["Normal"],
            fontName="Helvetica-Bold", fontSize=22, leading=26,
            textColor=_C["navy"], alignment=TA_CENTER,
        ),
        "kpi_label": ParagraphStyle(
            "kpi_label", parent=base["Normal"],
            fontName="Helvetica", fontSize=8, leading=10,
            textColor=_C["gray_500"], alignment=TA_CENTER,
        ),
        "toc_item": ParagraphStyle(
            "toc_item", parent=base["Normal"],
            fontName="Helvetica", fontSize=11, leading=22,
            textColor=_C["gray_700"], leftIndent=12,
        ),
        "legal": ParagraphStyle(
            "legal", parent=base["Normal"],
            fontName="Helvetica", fontSize=8, leading=11,
            textColor=_C["gray_500"], alignment=TA_JUSTIFY, spaceAfter=4,
        ),
    }


# ---------------------------------------------------------------------------
# Componentes reutilizáveis
# ---------------------------------------------------------------------------

def _section_header(num: int, title: str, styles: Dict) -> List:
    """Retorna elementos para cabeçalho de seção com barra lateral azul."""
    bar_data = [[
        Paragraph(f"<b>{num:02d}</b>", styles["section_number"]),
        Paragraph(title.upper(), styles["h1"]),
    ]]
    bar = Table(bar_data, colWidths=[1.2 * cm, CONTENT_W - 1.2 * cm])
    bar.setStyle(TableStyle([
        ("LINEAFTER", (0, 0), (0, -1), 2.5, _C["blue"]),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (1, 0), (1, 0), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    return [Spacer(1, 6), bar, Spacer(1, 8)]


def _enterprise_table(
    headers: List[str],
    rows: List[List],
    col_widths: Optional[List[float]] = None,
    highlight_col: Optional[int] = None,
) -> Table:
    """Tabela enterprise com header navy, zebra suave e bordas discretas."""
    data = [headers] + rows
    if not col_widths:
        n = len(headers)
        col_widths = [CONTENT_W / n] * n

    tbl = Table(data, colWidths=col_widths, repeatRows=1)

    style_cmds = [
        # Header
        ("BACKGROUND", (0, 0), (-1, 0), _C["navy"]),
        ("TEXTCOLOR", (0, 0), (-1, 0), _C["white"]),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 8),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 8),
        ("TOPPADDING", (0, 0), (-1, 0), 8),
        # Body
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 1), (-1, -1), 8),
        ("TEXTCOLOR", (0, 1), (-1, -1), _C["gray_700"]),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 6),
        ("TOPPADDING", (0, 1), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        # Zebra
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [_C["white"], _C["gray_50"]]),
        # Borders
        ("LINEBELOW", (0, 0), (-1, 0), 1.2, _C["navy_light"]),
        ("LINEBELOW", (0, 1), (-1, -2), 0.4, _C["gray_200"]),
        ("LINEBELOW", (0, -1), (-1, -1), 0.8, _C["gray_200"]),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]

    if highlight_col is not None:
        style_cmds.append(("FONTNAME", (highlight_col, 1), (highlight_col, -1), "Helvetica-Bold"))

    tbl.setStyle(TableStyle(style_cmds))
    return tbl


def _kpi_card(value: str, label: str, styles: Dict, accent: colors.Color = _C["navy"]) -> Table:
    """Cartão KPI individual com borda superior colorida."""
    content = [
        [Paragraph(value, styles["kpi_value"])],
        [Paragraph(label, styles["kpi_label"])],
    ]
    card = Table(content, colWidths=[3.8 * cm])
    card.setStyle(TableStyle([
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("BACKGROUND", (0, 0), (-1, -1), _C["gray_50"]),
        ("LINEABOVE", (0, 0), (-1, 0), 3, accent),
        ("BOX", (0, 0), (-1, -1), 0.5, _C["gray_200"]),
        ("ROUNDEDCORNERS", [4, 4, 4, 4]),
    ]))
    return card


def _kpi_row(cards: List[Table]) -> Table:
    """Linha horizontal de KPI cards."""
    row = Table([cards], colWidths=[4 * cm] * len(cards))
    row.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 2),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2),
    ]))
    return row


def _risk_badge(level: str) -> str:
    """Retorna texto com cor para nível de risco."""
    fg, _ = LEVEL_COLORS.get(level, (_C["gray_500"], _C["gray_100"]))
    label = LEVEL_LABELS.get(level, level.upper())
    hex_color = fg.hexval() if hasattr(fg, "hexval") else "#6B7280"
    return f'<font color="{hex_color}"><b>{label}</b></font>'


def _info_block(label: str, value: str, styles: Dict) -> Paragraph:
    return Paragraph(f'<font color="#6B7280">{label}:</font>  <b>{_s(value)}</b>', styles["body"])


def _empty_notice(text: str, styles: Dict) -> Paragraph:
    return Paragraph(f'<i><font color="#9CA3AF">{text}</font></i>', styles["body"])


def _horizontal_rule() -> Table:
    t = Table([[""]], colWidths=[CONTENT_W])
    t.setStyle(TableStyle([
        ("LINEBELOW", (0, 0), (-1, -1), 0.5, _C["gray_200"]),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    return t


# ---------------------------------------------------------------------------
# Gráficos enterprise
# ---------------------------------------------------------------------------

def _pie_chart(
    data: List[float],
    labels: List[str],
    chart_colors: List[colors.Color],
    title: str = "",
    width: float = 220,
    height: float = 160,
) -> Drawing:
    """Gráfico de pizza enterprise com legenda lateral."""
    d = Drawing(width, height)

    if not data or all(v == 0 for v in data):
        d.add(String(width / 2, height / 2, "Sem dados",
                     fontSize=10, fillColor=_C["gray_400"], textAnchor="middle"))
        return d

    # Título
    if title:
        d.add(String(width / 2, height - 8, title,
                     fontSize=9, fillColor=_C["navy"], textAnchor="middle",
                     fontName="Helvetica-Bold"))

    pie = Pie()
    pie.x = 15
    pie.y = 10
    pie.width = 95
    pie.height = 95
    pie.data = data
    pie.labels = None
    pie.startAngle = 90
    pie.direction = "clockwise"
    pie.strokeWidth = 0.8
    pie.strokeColor = _C["white"]

    for i, c in enumerate(chart_colors):
        if i < len(pie.slices):
            pie.slices[i].fillColor = c
            pie.slices[i].strokeColor = _C["white"]
            pie.slices[i].strokeWidth = 1.5

    d.add(pie)

    # Legenda
    legend = Legend()
    legend.x = 130
    legend.y = height - 30
    legend.dx = 10
    legend.dy = 10
    legend.deltax = 0
    legend.deltay = 18
    legend.fontName = "Helvetica"
    legend.fontSize = 8
    legend.alignment = "right"
    legend.columnMaximum = 10
    legend.colorNamePairs = []

    total = sum(data)
    for i, (val, label) in enumerate(zip(data, labels)):
        pct = (val / total * 100) if total > 0 else 0
        color = chart_colors[i] if i < len(chart_colors) else _C["gray_400"]
        legend.colorNamePairs.append((color, f"{label}: {val} ({pct:.0f}%)"))

    d.add(legend)
    return d


def _horizontal_bar_chart(
    data: List[float],
    labels: List[str],
    chart_colors: Optional[List[colors.Color]] = None,
    title: str = "",
    width: float = 420,
    height: float = 0,
    value_suffix: str = "%",
) -> Drawing:
    """Gráfico de barras horizontais com valores."""
    n = len(data)
    if height == 0:
        height = max(80, n * 24 + 50)

    d = Drawing(width, height)

    if not data:
        d.add(String(width / 2, height / 2, "Sem dados",
                     fontSize=10, fillColor=_C["gray_400"], textAnchor="middle"))
        return d

    if title:
        d.add(String(width / 2, height - 8, title,
                     fontSize=9, fillColor=_C["navy"], textAnchor="middle",
                     fontName="Helvetica-Bold"))

    bc = HorizontalBarChart()
    bc.x = 120
    bc.y = 10
    bc.width = width - 170
    bc.height = height - 40
    bc.data = [data]
    bc.categoryAxis.categoryNames = labels
    bc.categoryAxis.labels.fontName = "Helvetica"
    bc.categoryAxis.labels.fontSize = 7
    bc.categoryAxis.labels.dx = -5
    bc.categoryAxis.labels.textAnchor = "end"
    bc.categoryAxis.visibleGrid = False
    bc.categoryAxis.visibleAxis = False
    bc.categoryAxis.strokeColor = _C["gray_200"]

    bc.valueAxis.valueMin = 0
    bc.valueAxis.valueMax = max(max(data) * 1.15, 1)
    bc.valueAxis.labels.fontName = "Helvetica"
    bc.valueAxis.labels.fontSize = 7
    bc.valueAxis.visibleGrid = True
    bc.valueAxis.gridStrokeColor = _C["gray_100"]
    bc.valueAxis.gridStrokeWidth = 0.5
    bc.valueAxis.strokeColor = _C["gray_200"]

    bc.barWidth = max(6, min(14, 160 / max(n, 1)))
    bc.groupSpacing = 4

    if chart_colors:
        for i, c in enumerate(chart_colors):
            if i < len(bc.bars):
                bc.bars[i].fillColor = c
            else:
                bc.bars[0].fillColor = c
        # Colorir barras individuais
        for i in range(n):
            color = chart_colors[i] if i < len(chart_colors) else _C["blue"]
            bc.bars[(0, i)].fillColor = color
    else:
        bc.bars[0].fillColor = _C["blue"]

    bc.bars.strokeWidth = 0
    d.add(bc)

    # Valores nas barras
    bar_height = bc.height / max(n, 1)
    for i, val in enumerate(data):
        x_pos = bc.x + (val / max(max(data) * 1.15, 1)) * bc.width + 4
        y_pos = bc.y + (n - 1 - i) * bar_height + bar_height / 2 - 3
        d.add(String(x_pos, y_pos, f"{val:.0f}{value_suffix}",
                     fontSize=7, fillColor=_C["gray_700"], fontName="Helvetica-Bold"))

    return d


def _progress_gauge(
    value: float,
    label: str = "",
    width: float = 200,
    height: float = 60,
) -> Drawing:
    """Barra de progresso horizontal com percentual."""
    d = Drawing(width, height)

    # Label
    if label:
        d.add(String(width / 2, height - 8, label,
                     fontSize=9, fillColor=_C["navy"], textAnchor="middle",
                     fontName="Helvetica-Bold"))

    bar_y = 15
    bar_h = 18
    bar_w = width - 20
    x0 = 10

    # Background
    d.add(Rect(x0, bar_y, bar_w, bar_h, fillColor=_C["gray_200"],
               strokeColor=None, rx=4, ry=4))

    # Fill
    fill_w = max(bar_w * min(value / 100, 1), 0)
    if fill_w > 0:
        fill_color = _C["green"] if value >= 70 else (_C["yellow"] if value >= 40 else _C["red"])
        d.add(Rect(x0, bar_y, fill_w, bar_h, fillColor=fill_color,
                   strokeColor=None, rx=4, ry=4))

    # Percentual
    d.add(String(width / 2, bar_y + 4, f"{value:.0f}%",
                 fontSize=10, fillColor=_C["white"] if fill_w > bar_w * 0.3 else _C["gray_700"],
                 textAnchor="middle", fontName="Helvetica-Bold"))

    return d


# ---------------------------------------------------------------------------
# Header / Footer de página
# ---------------------------------------------------------------------------

class _PGRDocTemplate(BaseDocTemplate):
    """Template com header/footer enterprise em todas as páginas."""

    def __init__(self, buffer, dossier_data: Dict, doc_hash: str, **kw):
        self.dossier_data = dossier_data
        self.doc_hash = doc_hash
        self._generated = datetime.utcnow().strftime("%d/%m/%Y %H:%M UTC")

        super().__init__(buffer, **kw)

        frame = Frame(
            MARGIN, MARGIN + 0.8 * cm,
            CONTENT_W, PAGE_H - 2 * MARGIN - 1.6 * cm,
            id="main",
        )
        # Capa sem header/footer
        self.addPageTemplates([
            PageTemplate(id="cover", frames=[frame], onPage=self._on_cover_page),
            PageTemplate(id="content", frames=[frame], onPage=self._on_content_page),
        ])

    def _on_cover_page(self, canvas, doc):
        """Capa: fundo navy inteiro."""
        canvas.saveState()
        canvas.setFillColor(_C["navy"])
        canvas.rect(0, 0, PAGE_W, PAGE_H, fill=True, stroke=False)

        # Faixa decorativa no topo
        canvas.setFillColor(_C["blue"])
        canvas.rect(0, PAGE_H - 8 * mm, PAGE_W, 8 * mm, fill=True, stroke=False)

        # Linha fina dourada
        canvas.setStrokeColor(colors.HexColor("#D4A853"))
        canvas.setLineWidth(1.5)
        canvas.line(MARGIN, PAGE_H - 10 * mm, PAGE_W - MARGIN, PAGE_H - 10 * mm)

        # Barra inferior
        canvas.setFillColor(_C["navy_light"])
        canvas.rect(0, 0, PAGE_W, 2.5 * cm, fill=True, stroke=False)

        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(colors.HexColor("#8AABCF"))
        canvas.drawCentredString(
            PAGE_W / 2, 1 * cm,
            f"HASH: {self.doc_hash}  |  Documento gerado por NR Solucoes Enterprise",
        )
        canvas.restoreState()

    def _on_content_page(self, canvas, doc):
        """Páginas de conteúdo: header fino + footer com paginação."""
        canvas.saveState()

        # Header: linha fina azul no topo
        y_header = PAGE_H - MARGIN + 6 * mm
        canvas.setStrokeColor(_C["blue"])
        canvas.setLineWidth(1.2)
        canvas.line(MARGIN, y_header, PAGE_W - MARGIN, y_header)

        canvas.setFont("Helvetica-Bold", 7)
        canvas.setFillColor(_C["navy"])
        canvas.drawString(MARGIN, y_header + 2 * mm, "DOSSIE PGR  |  NR-1 RISCOS PSICOSSOCIAIS")

        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(_C["gray_400"])
        canvas.drawRightString(PAGE_W - MARGIN, y_header + 2 * mm, self._generated)

        # Footer
        y_footer = MARGIN - 4 * mm
        canvas.setStrokeColor(_C["gray_200"])
        canvas.setLineWidth(0.5)
        canvas.line(MARGIN, y_footer + 4 * mm, PAGE_W - MARGIN, y_footer + 4 * mm)

        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(_C["gray_400"])
        canvas.drawString(MARGIN, y_footer, f"HASH {self.doc_hash}")
        canvas.drawCentredString(PAGE_W / 2, y_footer, "NR Solucoes Enterprise  |  Confidencial")
        canvas.drawRightString(PAGE_W - MARGIN, y_footer, f"Pagina {doc.page}")

        canvas.restoreState()


# ---------------------------------------------------------------------------
# Geração principal
# ---------------------------------------------------------------------------

def generate_pgr_dossier_pdf(dossier_data: Dict[str, Any]) -> bytes:
    """Gera PDF enterprise do Dossiê PGR.

    Args:
        dossier_data: retorno de GET /reports/pgr-dossier

    Returns:
        bytes do PDF
    """
    doc_hash = _doc_hash(dossier_data)
    st = _build_styles()
    buf = io.BytesIO()

    doc = _PGRDocTemplate(
        buf,
        dossier_data,
        doc_hash,
        pagesize=A4,
        rightMargin=MARGIN,
        leftMargin=MARGIN,
        topMargin=MARGIN + 1 * cm,
        bottomMargin=MARGIN + 0.8 * cm,
    )

    elems: List = []

    # ==================================================================
    # 0. CAPA
    # ==================================================================
    elems.append(Spacer(1, 5 * cm))
    elems.append(Paragraph("DOSSIE PGR", st["cover_title"]))
    elems.append(Spacer(1, 4 * mm))
    elems.append(Paragraph("Programa de Gerenciamento de Riscos", st["cover_subtitle"]))
    elems.append(Paragraph("Riscos Psicossociais — NR-1", st["cover_subtitle"]))
    elems.append(Spacer(1, 2 * cm))

    # CNPJs na capa
    cnpjs = dossier_data.get("structure", {}).get("cnpjs", [])
    if cnpjs:
        for c in cnpjs[:3]:
            elems.append(Paragraph(
                _s(c.get("legal_name"), "Empresa"),
                st["cover_info"],
            ))
            elems.append(Paragraph(
                f"CNPJ {_s(c.get('cnpj_number'))}",
                st["cover_info"],
            ))
            elems.append(Spacer(1, 3 * mm))

    elems.append(Spacer(1, 3 * cm))

    lgpd_k = dossier_data.get("lgpd", {}).get("min_anon_threshold", 5)
    elems.append(Paragraph(
        f"Gerado em {datetime.utcnow().strftime('%d/%m/%Y as %H:%M UTC')}  "
        f"|  k-anonimato: {lgpd_k} respostas",
        st["cover_info"],
    ))

    from reportlab.platypus import NextPageTemplate
    elems.append(NextPageTemplate("content"))
    elems.append(PageBreak())

    # ==================================================================
    # SUMÁRIO
    # ==================================================================
    elems.append(Paragraph("SUMARIO", st["h1"]))
    elems.append(Spacer(1, 4 * mm))
    toc_items = [
        ("01", "Resumo Executivo"),
        ("02", "Estrutura Organizacional"),
        ("03", "Diagnosticos Realizados"),
        ("04", "Inventario e Classificacao de Riscos"),
        ("05", "Planos de Acao e Evidencias"),
        ("06", "Treinamentos e Certificacoes"),
        ("07", "Trilha de Auditoria"),
    ]
    toc_data = [[
        Paragraph(f'<font color="#1B6EC2"><b>{num}</b></font>', st["body"]),
        Paragraph(title, st["toc_item"]),
    ] for num, title in toc_items]
    toc_table = Table(toc_data, colWidths=[1.2 * cm, CONTENT_W - 1.2 * cm])
    toc_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LINEBELOW", (0, 0), (-1, -1), 0.3, _C["gray_200"]),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    elems.append(toc_table)
    elems.append(PageBreak())

    # ==================================================================
    # 1. RESUMO EXECUTIVO
    # ==================================================================
    elems += _section_header(1, "Resumo Executivo", st)

    elems.append(Paragraph(
        "Visao consolidada dos indicadores-chave de conformidade NR-1 desta organizacao.",
        st["body"],
    ))
    elems.append(Spacer(1, 4 * mm))

    # Calcular KPIs
    structure = dossier_data.get("structure", {})
    campaigns = dossier_data.get("campaigns", [])
    risks = dossier_data.get("risks", [])
    action_plans = dossier_data.get("action_plans", [])
    audit = dossier_data.get("audit", [])

    n_cnpjs = len(structure.get("cnpjs", []))
    n_units = len(structure.get("org_units", []))
    n_campaigns = len(campaigns)
    n_responses = sum(c.get("responses", 0) for c in campaigns)
    n_risks = len(risks)
    n_risks_high = sum(1 for r in risks if r.get("level") == "high")
    n_plans = len(action_plans)
    n_items = sum(len(p.get("items", [])) for p in action_plans)
    n_items_done = sum(
        1 for p in action_plans for i in p.get("items", []) if i.get("status") == "done"
    )
    n_evidences = sum(
        len(i.get("evidences", []))
        for p in action_plans for i in p.get("items", [])
    )

    row1 = _kpi_row([
        _kpi_card(str(n_cnpjs), "CNPJs", st, _C["blue"]),
        _kpi_card(str(n_units), "Unidades", st, _C["blue"]),
        _kpi_card(str(n_campaigns), "Campanhas", st, _C["teal"]),
        _kpi_card(str(n_responses), "Respostas", st, _C["teal"]),
    ])
    elems.append(row1)
    elems.append(Spacer(1, 3 * mm))

    row2 = _kpi_row([
        _kpi_card(str(n_risks), "Avaliacoes", st, _C["navy"]),
        _kpi_card(str(n_risks_high), "Risco Alto", st, _C["red"]),
        _kpi_card(f"{n_items_done}/{n_items}", "Acoes Concl.", st, _C["green"]),
        _kpi_card(str(n_evidences), "Evidencias", st, _C["teal"]),
    ])
    elems.append(row2)
    elems.append(Spacer(1, 6 * mm))

    # Gráficos lado a lado: Pizza de Riscos + Pizza de Ações
    chart_cells = []

    # Pizza: Distribuição de risco
    if risks:
        dist = {"high": 0, "medium": 0, "low": 0}
        for r in risks:
            lv = r.get("level", "").lower()
            if lv in dist:
                dist[lv] += 1
        pie_data = [dist["high"], dist["medium"], dist["low"]]
        pie_labels = ["Alto", "Medio", "Baixo"]
        pie_colors = [_C["red"], _C["yellow"], _C["green"]]
        # Filtrar zeros
        filtered = [(d, l, c) for d, l, c in zip(pie_data, pie_labels, pie_colors) if d > 0]
        if filtered:
            fd, fl, fc = zip(*filtered)
            risk_pie = _pie_chart(list(fd), list(fl), list(fc), "Distribuicao de Riscos")
            chart_cells.append(risk_pie)

    # Pizza: Status dos itens de ação
    if n_items > 0:
        status_counts = {"planned": 0, "in_progress": 0, "done": 0}
        for p in action_plans:
            for i in p.get("items", []):
                s = i.get("status", "planned")
                if s in status_counts:
                    status_counts[s] += 1
        act_data = [status_counts["done"], status_counts["in_progress"], status_counts["planned"]]
        act_labels = ["Concluido", "Em Andamento", "Planejado"]
        act_colors = [_C["green"], _C["blue"], _C["gray_400"]]
        filtered_a = [(d, l, c) for d, l, c in zip(act_data, act_labels, act_colors) if d > 0]
        if filtered_a:
            fd, fl, fc = zip(*filtered_a)
            action_pie = _pie_chart(list(fd), list(fl), list(fc), "Status das Acoes")
            chart_cells.append(action_pie)

    if chart_cells:
        elems.append(Spacer(1, 4 * mm))
        if len(chart_cells) == 2:
            charts_row = Table([chart_cells], colWidths=[CONTENT_W / 2, CONTENT_W / 2])
        else:
            charts_row = Table([chart_cells], colWidths=[CONTENT_W])
        charts_row.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ]))
        elems.append(charts_row)

    elems.append(PageBreak())

    # ==================================================================
    # 2. ESTRUTURA ORGANIZACIONAL
    # ==================================================================
    elems += _section_header(2, "Estrutura Organizacional", st)

    cnpjs = structure.get("cnpjs", [])
    org_units = structure.get("org_units", [])

    if cnpjs:
        elems.append(Paragraph("<b>2.1 Entidades Juridicas (CNPJs)</b>", st["h2"]))
        rows = []
        for c in cnpjs:
            rows.append([
                _s(c.get("cnpj_number")),
                _s(c.get("legal_name"))[:45],
                _s(c.get("trade_name"))[:30],
                "Ativo" if c.get("is_active", True) else "Inativo",
            ])
        elems.append(_enterprise_table(
            ["CNPJ", "Razao Social", "Nome Fantasia", "Status"],
            rows,
            [4 * cm, 6 * cm, 4.5 * cm, 2 * cm],
        ))
        elems.append(Spacer(1, 6 * mm))

    if org_units:
        elems.append(Paragraph("<b>2.2 Unidades Organizacionais</b>", st["h2"]))

        # Agrupar por CNPJ
        units_by_cnpj: Dict[str, list] = {}
        for u in org_units:
            cid = u.get("cnpj_id", "")
            units_by_cnpj.setdefault(cid, []).append(u)

        cnpj_names = {c.get("id", ""): c.get("legal_name", "") for c in cnpjs}
        for cid, units in units_by_cnpj.items():
            cname = cnpj_names.get(cid, cid[:12])
            elems.append(Paragraph(f'<font color="#6B7280">{cname}</font>', st["h3"]))
            rows = [[
                _s(u.get("name"))[:40],
                _s(u.get("unit_type"))[:20],
                "Ativo" if u.get("is_active", True) else "Inativo",
            ] for u in units]
            elems.append(_enterprise_table(
                ["Unidade", "Tipo", "Status"],
                rows,
                [8 * cm, 5 * cm, 3.5 * cm],
            ))
            elems.append(Spacer(1, 3 * mm))
    else:
        elems.append(_empty_notice("Nenhuma unidade organizacional cadastrada.", st))

    elems.append(PageBreak())

    # ==================================================================
    # 3. DIAGNÓSTICOS
    # ==================================================================
    elems += _section_header(3, "Diagnosticos Realizados", st)

    if campaigns:
        for idx, camp in enumerate(campaigns, 1):
            name = _s(camp.get("name"), f"Campanha {idx}")
            status = STATUS_LABELS.get(camp.get("status", ""), camp.get("status", ""))
            elems.append(Paragraph(f"<b>3.{idx} {name}</b>", st["h2"]))

            info_data = [
                ["Status", "CNPJ", "Unidade", "Respostas", "Agregacao LGPD"],
                [
                    status,
                    _s(camp.get("cnpj_legal_name"))[:30],
                    _s(camp.get("org_unit_name"), "Todas"),
                    str(camp.get("responses", 0)),
                    "Liberada" if camp.get("aggregation_allowed") else "Bloqueada",
                ],
            ]
            info_tbl = Table(info_data, colWidths=[2.8 * cm, 4.5 * cm, 3.5 * cm, 2.5 * cm, 3.2 * cm])
            info_tbl.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), _C["gray_100"]),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("TEXTCOLOR", (0, 0), (-1, -1), _C["gray_700"]),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("BOX", (0, 0), (-1, -1), 0.5, _C["gray_200"]),
                ("LINEBELOW", (0, 0), (-1, 0), 0.5, _C["gray_200"]),
            ]))
            elems.append(info_tbl)

            dates = []
            if camp.get("created_at"):
                dates.append(f"Criada: {_date(camp['created_at'])}")
            if camp.get("opened_at"):
                dates.append(f"Aberta: {_date(camp['opened_at'])}")
            if camp.get("closed_at"):
                dates.append(f"Encerrada: {_date(camp['closed_at'])}")
            if dates:
                elems.append(Paragraph("  |  ".join(dates), st["caption"]))
            elems.append(Spacer(1, 4 * mm))
    else:
        elems.append(_empty_notice("Nenhuma campanha de diagnostico registrada.", st))

    elems.append(PageBreak())

    # ==================================================================
    # 4. INVENTÁRIO E CLASSIFICAÇÃO DE RISCOS
    # ==================================================================
    elems += _section_header(4, "Inventario e Classificacao de Riscos", st)

    elems.append(Paragraph(
        "Classificacao dos riscos psicossociais conforme criterios da NR-1, considerando "
        "severidade e probabilidade de ocorrencia em cada dimensao avaliada.",
        st["body"],
    ))
    elems.append(Spacer(1, 4 * mm))

    if risks:
        # Tabela de riscos
        risk_rows = []
        for r in risks:
            level = r.get("level", "").lower()
            dims = r.get("dimension_scores") or {}
            if isinstance(dims, dict):
                top_dims = sorted(dims.items(), key=lambda x: float(x[1] if x[1] else 0), reverse=True)[:3]
                dims_text = ", ".join(f"{k}: {_pct(v)}" for k, v in top_dims)
            else:
                dims_text = "-"

            risk_rows.append([
                _date(r.get("assessed_at")),
                _risk_badge(level),
                _pct(r.get("score", 0)),
                Paragraph(dims_text, st["caption"]),
            ])

        # Convert risk badge to Paragraph
        final_rows = []
        for row in risk_rows:
            final_rows.append([
                row[0],
                Paragraph(row[1], st["body"]),
                row[2],
                row[3],
            ])

        elems.append(_enterprise_table(
            ["Data", "Nivel", "Score", "Principais Dimensoes"],
            final_rows,
            [3 * cm, 2.5 * cm, 2 * cm, 9 * cm],
            highlight_col=1,
        ))

        # Detalhamento por avaliação com gráfico de barras
        elems.append(Spacer(1, 6 * mm))
        for idx, r in enumerate(risks[:10], 1):
            dims = r.get("dimension_scores") or {}
            if not isinstance(dims, dict) or not dims:
                continue
            elems.append(Paragraph(
                f"<b>Avaliacao {idx}</b> — {_date(r.get('assessed_at'))}  |  "
                f"Nivel: {_risk_badge(r.get('level', ''))}  |  Score global: {_pct(r.get('score', 0))}",
                st["body"],
            ))

            sorted_dims = sorted(dims.items(), key=lambda x: float(x[1] if x[1] else 0), reverse=True)
            dim_names = []
            dim_values = []
            dim_colors = []
            for dim_name, dim_score in sorted_dims:
                try:
                    v = float(dim_score)
                    if v <= 1.0:
                        v *= 100
                except Exception:
                    v = 0
                dim_names.append(dim_name[:25])
                dim_values.append(v)
                if v >= 70:
                    dim_colors.append(_C["red"])
                elif v >= 40:
                    dim_colors.append(_C["yellow"])
                else:
                    dim_colors.append(_C["green"])

            if dim_values:
                bar_chart = _horizontal_bar_chart(
                    dim_values,
                    dim_names,
                    dim_colors,
                    title=f"Scores por Dimensao — Avaliacao {idx}",
                    width=CONTENT_W,
                )
                elems.append(bar_chart)
            elems.append(Spacer(1, 6 * mm))
    else:
        elems.append(_empty_notice("Nenhuma avaliacao de risco registrada.", st))

    elems.append(PageBreak())

    # ==================================================================
    # 5. PLANOS DE AÇÃO
    # ==================================================================
    elems += _section_header(5, "Planos de Acao e Evidencias", st)

    if action_plans:
        # Resumo visual: pizza de tipos + gauge de conclusão
        all_items = [i for p in action_plans for i in p.get("items", [])]
        if all_items:
            type_counts: Dict[str, int] = {}
            status_counts_ap: Dict[str, int] = {"done": 0, "in_progress": 0, "planned": 0}
            for i in all_items:
                t = TYPE_LABELS.get(i.get("item_type", ""), i.get("item_type", "outro"))
                type_counts[t] = type_counts.get(t, 0) + 1
                s = i.get("status", "planned")
                if s in status_counts_ap:
                    status_counts_ap[s] += 1

            chart_cells_ap = []

            # Pizza de tipos
            t_labels = list(type_counts.keys())
            t_data = list(type_counts.values())
            t_palette = [_C["blue"], _C["teal"], _C["yellow"], _C["navy"], _C["green"]]
            t_colors = [t_palette[i % len(t_palette)] for i in range(len(t_labels))]
            filtered_t = [(d, l, c) for d, l, c in zip(t_data, t_labels, t_colors) if d > 0]
            if filtered_t:
                fd, fl, fc = zip(*filtered_t)
                chart_cells_ap.append(_pie_chart(list(fd), list(fl), list(fc), "Itens por Tipo"))

            # Gauge de conclusão
            total_ap = len(all_items)
            done_ap = status_counts_ap["done"]
            pct_ap = (done_ap / total_ap * 100) if total_ap > 0 else 0
            chart_cells_ap.append(_progress_gauge(pct_ap, f"Conclusao: {done_ap}/{total_ap} itens"))

            if chart_cells_ap:
                if len(chart_cells_ap) == 2:
                    ap_charts = Table([chart_cells_ap], colWidths=[CONTENT_W / 2, CONTENT_W / 2])
                else:
                    ap_charts = Table([chart_cells_ap], colWidths=[CONTENT_W])
                ap_charts.setStyle(TableStyle([
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ]))
                elems.append(ap_charts)
                elems.append(Spacer(1, 6 * mm))

        for idx, plan in enumerate(action_plans, 1):
            plan_status = STATUS_LABELS.get(plan.get("status", ""), plan.get("status", ""))
            elems.append(Paragraph(
                f"<b>5.{idx} Plano de Acao — {plan_status}</b>",
                st["h2"],
            ))

            items = plan.get("items", [])
            if items:
                item_rows = []
                for item in items:
                    itype = TYPE_LABELS.get(item.get("item_type", ""), item.get("item_type", ""))
                    istatus = STATUS_LABELS.get(item.get("status", ""), item.get("status", ""))
                    due = _date(item.get("due_date"))
                    ev_count = len(item.get("evidences", []))

                    item_rows.append([
                        Paragraph(f"<b>{itype}</b>", st["caption"]),
                        Paragraph(_s(item.get("title"))[:45], st["body"]),
                        istatus,
                        _s(item.get("responsible"))[:18],
                        due,
                        str(ev_count),
                    ])

                elems.append(_enterprise_table(
                    ["Tipo", "Titulo", "Status", "Responsavel", "Prazo", "Evid."],
                    item_rows,
                    [2.5 * cm, 5 * cm, 2.5 * cm, 3 * cm, 2.2 * cm, 1.3 * cm],
                ))

                # Evidências
                has_evidences = False
                for item in items:
                    evs = item.get("evidences", [])
                    if evs:
                        if not has_evidences:
                            elems.append(Spacer(1, 4 * mm))
                            elems.append(Paragraph("<b>Evidencias registradas:</b>", st["h3"]))
                            has_evidences = True
                        elems.append(Paragraph(
                            f'<font color="#1B6EC2">{_s(item.get("title"))[:35]}</font>',
                            st["body_bold"],
                        ))
                        for ev in evs[:8]:
                            etype = _s(ev.get("evidence_type"), "doc")
                            eref = _s(ev.get("reference"))[:60]
                            enote = _s(ev.get("note"), "")
                            line = f'<font color="#6B7280">[{etype}]</font> {eref}'
                            if enote and enote != "-":
                                line += f' — <i>{enote[:40]}</i>'
                            elems.append(Paragraph(f"    {line}", st["caption"]))
                        elems.append(Spacer(1, 2 * mm))

            else:
                elems.append(_empty_notice("Nenhum item registrado neste plano.", st))

            elems.append(Spacer(1, 8 * mm))
            elems.append(_horizontal_rule())
    else:
        elems.append(_empty_notice("Nenhum plano de acao registrado.", st))

    elems.append(PageBreak())

    # ==================================================================
    # 6. TREINAMENTOS E CERTIFICAÇÕES
    # ==================================================================
    elems += _section_header(6, "Treinamentos e Certificacoes", st)

    # Itens educativos
    educational_items = [
        i for p in action_plans for i in p.get("items", [])
        if i.get("item_type") == "educational"
    ]

    if educational_items:
        elems.append(Paragraph(
            f"Foram identificados <b>{len(educational_items)}</b> item(ns) educativo(s) nos planos de acao.",
            st["body"],
        ))
        elems.append(Spacer(1, 3 * mm))

        ed_rows = []
        for item in educational_items:
            istatus = STATUS_LABELS.get(item.get("status", ""), item.get("status", ""))
            ed_rows.append([
                Paragraph(_s(item.get("title"))[:40], st["body"]),
                istatus,
                _s(item.get("responsible"))[:18],
                _date(item.get("due_date")),
            ])
        elems.append(_enterprise_table(
            ["Treinamento", "Status", "Responsavel", "Prazo"],
            ed_rows,
            [7 * cm, 3 * cm, 3.5 * cm, 3 * cm],
        ))
    else:
        elems.append(_empty_notice(
            "Nenhum item educativo registrado nos planos de acao. "
            "Treinamentos podem ser vinculados a itens do tipo 'Educativo'.",
            st,
        ))

    elems.append(Spacer(1, 6 * mm))
    elems.append(Paragraph(
        "<i>Nota: certificados individuais sao gerados e validaveis pelo sistema. "
        "Para detalhes de matriculas e certificados, consulte o modulo de Treinamentos na plataforma.</i>",
        st["caption"],
    ))

    elems.append(PageBreak())

    # ==================================================================
    # 7. TRILHA DE AUDITORIA
    # ==================================================================
    elems += _section_header(7, "Trilha de Auditoria", st)

    elems.append(Paragraph(
        "Registro cronologico de eventos do sistema para fins de conformidade e fiscalizacao. "
        "Os dados sao mantidos por periodo minimo de <b>20 anos</b> conforme NR-1.",
        st["body"],
    ))
    elems.append(Spacer(1, 4 * mm))

    if audit:
        audit_rows = []
        for ev in audit[:80]:
            dt = _datetime(ev.get("created_at"))
            audit_rows.append([
                dt,
                _s(ev.get("action"))[:20],
                _s(ev.get("entity_type"))[:20],
                _s(ev.get("entity_id"), "")[:10],
                (_s(ev.get("ip"), ""))[:15],
            ])

        elems.append(_enterprise_table(
            ["Data/Hora", "Acao", "Entidade", "ID", "IP"],
            audit_rows,
            [3.5 * cm, 3 * cm, 3.5 * cm, 3 * cm, 3.5 * cm],
        ))

        if len(audit) > 80:
            elems.append(Paragraph(
                f"Exibindo 80 de {len(audit)} eventos. Consulte a plataforma para o historico completo.",
                st["caption"],
            ))
    else:
        elems.append(_empty_notice("Nenhum evento de auditoria registrado.", st))

    # ==================================================================
    # 8. TERMO DE ENCERRAMENTO
    # ==================================================================
    elems.append(PageBreak())
    elems += _section_header(8, "Termo de Encerramento", st)

    elems.append(Spacer(1, 6 * mm))
    elems.append(Paragraph(
        "Este documento constitui o Dossie do Programa de Gerenciamento de Riscos (PGR) "
        "para riscos psicossociais, elaborado em conformidade com a Norma Regulamentadora "
        "n. 1 (NR-1), conforme Portaria MTE n. 1.419/2024.",
        st["body"],
    ))
    elems.append(Spacer(1, 3 * mm))
    elems.append(Paragraph(
        "O conteudo aqui apresentado foi gerado automaticamente pelo sistema "
        "<b>NR Solucoes Enterprise</b> a partir dos dados cadastrados pela organizacao, "
        "incluindo diagnosticos, avaliacoes de risco, planos de acao, evidencias "
        "de execucao e trilha de auditoria.",
        st["body"],
    ))
    elems.append(Spacer(1, 3 * mm))
    elems.append(Paragraph(
        "Os dados devem ser mantidos disponiveis para fiscalizacao pelo periodo minimo de "
        "<b>20 (vinte) anos</b>, conforme legislacao vigente.",
        st["body"],
    ))

    elems.append(Spacer(1, 1.5 * cm))

    # Caixa de integridade
    hash_data = [
        [Paragraph("<b>VERIFICACAO DE INTEGRIDADE</b>", st["body"])],
        [Paragraph(
            f'Hash SHA-256 (parcial): <font face="Courier"><b>{doc_hash}</b></font>',
            st["body"],
        )],
        [Paragraph(
            f'Gerado em: {datetime.utcnow().strftime("%d/%m/%Y as %H:%M:%S UTC")}',
            st["caption"],
        )],
        [Paragraph(
            "Este hash permite verificar que o conteudo do documento nao foi alterado "
            "apos a geracao. Em caso de duvida, gere um novo dossie e compare os dados.",
            st["caption"],
        )],
    ]
    hash_box = Table(hash_data, colWidths=[CONTENT_W - 2 * cm])
    hash_box.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), _C["gray_50"]),
        ("BOX", (0, 0), (-1, -1), 1, _C["navy"]),
        ("LINEABOVE", (0, 0), (-1, 0), 3, _C["blue"]),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
    ]))
    elems.append(hash_box)

    elems.append(Spacer(1, 2 * cm))

    # Assinaturas
    sig_line = Table(
        [["_" * 45, "", "_" * 45]],
        colWidths=[7 * cm, 2.5 * cm, 7 * cm],
    )
    sig_line.setStyle(TableStyle([
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("TEXTCOLOR", (0, 0), (-1, -1), _C["gray_400"]),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
    ]))
    elems.append(sig_line)

    sig_labels = Table(
        [["Responsavel Tecnico", "", "Representante Legal"]],
        colWidths=[7 * cm, 2.5 * cm, 7 * cm],
    )
    sig_labels.setStyle(TableStyle([
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("TEXTCOLOR", (0, 0), (-1, -1), _C["gray_500"]),
    ]))
    elems.append(sig_labels)

    elems.append(Spacer(1, 2 * cm))
    elems.append(Paragraph(
        "NR Solucoes Enterprise — Plataforma de Conformidade NR-1",
        st["footer"],
    ))

    # ==================================================================
    # BUILD
    # ==================================================================
    doc.build(elems)
    result = buf.getvalue()
    buf.close()
    return result
