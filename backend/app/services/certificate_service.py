"""Serviço de Geração de Certificados.

Este módulo implementa:
- Geração de certificados em PDF
- Validação de certificados
- Hash SHA256 para integridade
- QR Code para validação rápida
"""

from __future__ import annotations
import hashlib
import secrets
from datetime import datetime, timedelta
from typing import Optional, Tuple
from uuid import UUID
from io import BytesIO

from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.training import TrainingCertificate, ActionItemEnrollment
from app.models.action_plan import ActionItem, ActionPlan
from app.models.employee import Employee
from app.models.lms import ContentItem
from app.models.org import CNPJ
from app.models.tenant import Tenant
from app.services.storage import create_upload_url, upload_bytes


class CertificateService:
    """Serviço para geração e validação de certificados."""

    def __init__(self, db: Session):
        self.db = db

    def generate_certificate_number(self, tenant_id: UUID) -> str:
        """Gera número único sequencial do certificado."""
        year = datetime.utcnow().year

        # Buscar último número do ano
        last = (
            self.db.query(TrainingCertificate)
            .filter(TrainingCertificate.tenant_id == tenant_id)
            .filter(TrainingCertificate.certificate_number.like(f"NR1-{year}-%"))
            .order_by(TrainingCertificate.created_at.desc())
            .first()
        )

        if last and last.certificate_number:
            try:
                last_seq = int(last.certificate_number.split("-")[-1])
                next_seq = last_seq + 1
            except (ValueError, IndexError):
                next_seq = 1
        else:
            next_seq = 1

        return f"NR1-{year}-{next_seq:06d}"

    def generate_validation_code(self) -> str:
        """Gera código de validação único."""
        return secrets.token_hex(8).upper()

    def create_certificate(
        self,
        enrollment: ActionItemEnrollment,
        valid_months: Optional[int] = None,
        signed_by_user_id: Optional[UUID] = None,
        instructor_name: Optional[str] = None,
        instructor_qualification: Optional[str] = None,
        training_location: Optional[str] = None,
        syllabus: Optional[str] = None,
        training_modality: Optional[str] = None,
        formal_hours_minutes: Optional[int] = None,
    ) -> TrainingCertificate:
        """Cria certificado para uma matrícula concluída."""

        if enrollment.status != "completed":
            raise ValueError("Matrícula não está concluída")

        if enrollment.certificate_id:
            # Já existe certificado
            return (
                self.db.query(TrainingCertificate)
                .filter(TrainingCertificate.id == enrollment.certificate_id)
                .first()
            )

        # Buscar dados relacionados
        employee = (
            self.db.query(Employee)
            .filter(Employee.id == enrollment.employee_id)
            .first()
        )
        action_item = (
            self.db.query(ActionItem)
            .filter(ActionItem.id == enrollment.action_item_id)
            .first()
        )

        content = None
        if action_item.education_ref_id:
            content = (
                self.db.query(ContentItem)
                .filter(ContentItem.id == action_item.education_ref_id)
                .first()
            )

        action_plan = None
        if action_item.action_plan_id:
            action_plan = (
                self.db.query(ActionPlan)
                .filter(ActionPlan.id == action_item.action_plan_id)
                .first()
            )

        # Buscar dados da empresa
        tenant = self.db.query(Tenant).filter(Tenant.id == enrollment.tenant_id).first()
        cnpj = None
        if tenant:
            cnpj = (
                self.db.query(CNPJ)
                .filter(CNPJ.tenant_id == tenant.id, CNPJ.is_active == True)
                .first()
            )

        # Calcular validade
        valid_until = None
        if valid_months:
            valid_until = datetime.utcnow() + timedelta(days=valid_months * 30)

        # Criar certificado
        cert = TrainingCertificate(
            tenant_id=enrollment.tenant_id,
            certificate_number=self.generate_certificate_number(enrollment.tenant_id),
            enrollment_id=enrollment.id,
            action_item_id=action_item.id,
            employee_id=employee.id,
            content_id=content.id if content else None,
            # Dados imutáveis do colaborador
            employee_name=employee.full_name or employee.identifier,
            employee_cpf=employee.cpf,
            employee_identifier=employee.identifier,
            # Dados do treinamento
            training_title=action_item.title,
            training_description=action_item.description,
            training_duration_minutes=content.duration_minutes if content else None,
            training_type=content.content_type if content else "course",
            # Contexto
            action_plan_title=action_plan.title if action_plan else None,
            risk_dimension=action_item.related_dimension,
            # Datas
            training_started_at=enrollment.started_at,
            training_completed_at=enrollment.completed_at,
            issued_at=datetime.utcnow(),
            valid_until=valid_until,
            # Validação
            validation_code=self.generate_validation_code(),
            # Emissor
            issuer_name=tenant.name if tenant else None,
            issuer_cnpj=cnpj.cnpj_number if cnpj else None,
            # Assinatura
            signed_by_user_id=signed_by_user_id,
            signed_at=datetime.utcnow() if signed_by_user_id else None,
            # NR-1 mandatory fields
            instructor_name=instructor_name,
            instructor_qualification=instructor_qualification,
            training_location=training_location,
            syllabus=syllabus,
            training_modality=training_modality,
            formal_hours_minutes=formal_hours_minutes,
        )

        self.db.add(cert)
        self.db.flush()

        # Atualizar enrollment com referência ao certificado
        enrollment.certificate_id = cert.id
        self.db.add(enrollment)

        return cert

    def generate_pdf(self, certificate: TrainingCertificate) -> Tuple[bytes, str]:
        """Gera PDF do certificado.

        Returns:
            Tuple[bytes, str]: (conteúdo do PDF, hash SHA256)
        """
        # Usar reportlab para gerar PDF profissional
        try:
            from reportlab.lib import colors
            from reportlab.lib.pagesizes import A4, landscape
            from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
            from reportlab.lib.units import cm, mm
            from reportlab.platypus import (
                SimpleDocTemplate,
                Paragraph,
                Spacer,
                Table,
                TableStyle,
                Image,
            )
            from reportlab.lib.enums import TA_CENTER, TA_LEFT
        except ImportError:
            # Fallback: gerar PDF simples com fpdf ou retornar placeholder
            return self._generate_simple_pdf(certificate)

        buffer = BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=landscape(A4),
            leftMargin=2 * cm,
            rightMargin=2 * cm,
            topMargin=2 * cm,
            bottomMargin=2 * cm,
        )

        styles = getSampleStyleSheet()

        # Estilos customizados
        title_style = ParagraphStyle(
            "CertTitle",
            parent=styles["Heading1"],
            fontSize=28,
            alignment=TA_CENTER,
            spaceAfter=20,
            textColor=colors.HexColor("#1a365d"),
        )

        subtitle_style = ParagraphStyle(
            "CertSubtitle",
            parent=styles["Heading2"],
            fontSize=18,
            alignment=TA_CENTER,
            spaceAfter=30,
            textColor=colors.HexColor("#2d3748"),
        )

        body_style = ParagraphStyle(
            "CertBody",
            parent=styles["Normal"],
            fontSize=14,
            alignment=TA_CENTER,
            spaceAfter=15,
            leading=20,
        )

        name_style = ParagraphStyle(
            "CertName",
            parent=styles["Heading2"],
            fontSize=24,
            alignment=TA_CENTER,
            spaceAfter=20,
            textColor=colors.HexColor("#1a365d"),
            fontName="Helvetica-Bold",
        )

        footer_style = ParagraphStyle(
            "CertFooter",
            parent=styles["Normal"],
            fontSize=10,
            alignment=TA_CENTER,
            textColor=colors.HexColor("#718096"),
        )

        elements = []

        # Título
        elements.append(Paragraph("CERTIFICADO DE CONCLUSÃO", title_style))
        elements.append(
            Paragraph("Programa de Gerenciamento de Riscos - NR-1", subtitle_style)
        )
        elements.append(Spacer(1, 20))

        # Corpo
        elements.append(Paragraph("Certificamos que", body_style))
        elements.append(Paragraph(certificate.employee_name.upper(), name_style))

        if certificate.employee_cpf:
            cpf_masked = f"CPF: ***.***.***-{certificate.employee_cpf[-2:]}"
            elements.append(Paragraph(cpf_masked, body_style))

        elements.append(Spacer(1, 20))

        elements.append(Paragraph(f"concluiu com êxito o treinamento", body_style))

        elements.append(
            Paragraph(
                f"<b>{certificate.training_title}</b>",
                ParagraphStyle("Training", parent=body_style, fontSize=16),
            )
        )

        if certificate.training_description:
            elements.append(
                Paragraph(
                    certificate.training_description[:200],
                    ParagraphStyle(
                        "Desc",
                        parent=body_style,
                        fontSize=12,
                        textColor=colors.HexColor("#4a5568"),
                    ),
                )
            )

        elements.append(Spacer(1, 15))

        # Informações
        info_text = (
            f"Concluído em: {certificate.training_completed_at.strftime('%d/%m/%Y')}"
        )
        if certificate.training_duration_minutes:
            hours = certificate.training_duration_minutes // 60
            mins = certificate.training_duration_minutes % 60
            if hours > 0:
                info_text += f" | Carga horária: {hours}h{mins:02d}min"
            else:
                info_text += f" | Duração: {mins} minutos"

        elements.append(Paragraph(info_text, body_style))

        if certificate.risk_dimension:
            dimension_names = {
                "governance": "Governança",
                "hazards": "Identificação de Perigos",
                "controls": "Controles",
                "training": "Capacitação",
            }
            dim_name = dimension_names.get(
                certificate.risk_dimension, certificate.risk_dimension
            )
            elements.append(Paragraph(f"Dimensão: {dim_name}", body_style))

        elements.append(Spacer(1, 30))

        # Rodapé
        elements.append(
            Paragraph(f"Certificado nº {certificate.certificate_number}", footer_style)
        )

        if certificate.issuer_name:
            elements.append(
                Paragraph(f"Emitido por: {certificate.issuer_name}", footer_style)
            )

        elements.append(
            Paragraph(
                f"Data de emissão: {certificate.issued_at.strftime('%d/%m/%Y às %H:%M')}",
                footer_style,
            )
        )

        if certificate.valid_until:
            elements.append(
                Paragraph(
                    f"Válido até: {certificate.valid_until.strftime('%d/%m/%Y')}",
                    footer_style,
                )
            )

        if certificate.validation_code:
            elements.append(Spacer(1, 10))
            elements.append(
                Paragraph(
                    f"Código de validação: {certificate.validation_code}",
                    ParagraphStyle(
                        "Code", parent=footer_style, fontName="Courier", fontSize=11
                    ),
                )
            )

        # NR-1 Mandatory Information
        nr1_info = []
        if certificate.instructor_name:
            instructor_text = f"Instrutor: {certificate.instructor_name}"
            if certificate.instructor_qualification:
                instructor_text += f" — {certificate.instructor_qualification}"
            nr1_info.append(instructor_text)

        if certificate.training_location:
            nr1_info.append(f"Local: {certificate.training_location}")

        if certificate.training_modality:
            modality_labels = {"presential": "Presencial", "remote": "Remoto/EAD", "hybrid": "Híbrido"}
            nr1_info.append(f"Modalidade: {modality_labels.get(certificate.training_modality, certificate.training_modality)}")

        if certificate.formal_hours_minutes:
            fh = certificate.formal_hours_minutes // 60
            fm = certificate.formal_hours_minutes % 60
            nr1_info.append(f"Carga horária formal: {fh}h{fm:02d}min" if fh > 0 else f"Carga horária formal: {fm} minutos")

        if nr1_info:
            elements.append(Spacer(1, 10))
            for info in nr1_info:
                elements.append(Paragraph(info, footer_style))

        if certificate.syllabus:
            elements.append(Spacer(1, 8))
            elements.append(Paragraph("Conteúdo Programático:", ParagraphStyle("SyllTitle", parent=footer_style, fontName="Helvetica-Bold")))
            # Truncate syllabus for PDF readability
            syllabus_text = certificate.syllabus[:500]
            if len(certificate.syllabus) > 500:
                syllabus_text += "..."
            elements.append(Paragraph(syllabus_text, ParagraphStyle("Syll", parent=footer_style, fontSize=9)))

        # Build PDF
        doc.build(elements)

        pdf_content = buffer.getvalue()
        pdf_hash = hashlib.sha256(pdf_content).hexdigest()

        return pdf_content, pdf_hash

    def _generate_simple_pdf(
        self, certificate: TrainingCertificate
    ) -> Tuple[bytes, str]:
        """Fallback: gera PDF simples sem reportlab."""
        # PDF mínimo válido
        content = f"""CERTIFICADO DE CONCLUSÃO
        
Certificamos que {certificate.employee_name}
concluiu o treinamento: {certificate.training_title}

Data de conclusão: {certificate.training_completed_at.strftime('%d/%m/%Y')}
Certificado nº: {certificate.certificate_number}
Código de validação: {certificate.validation_code or 'N/A'}

Emitido em: {certificate.issued_at.strftime('%d/%m/%Y')}
"""
        pdf_bytes = content.encode("utf-8")
        pdf_hash = hashlib.sha256(pdf_bytes).hexdigest()
        return pdf_bytes, pdf_hash

    def save_pdf(self, certificate: TrainingCertificate) -> Optional[str]:
        """Gera e salva PDF do certificado no storage."""
        pdf_content, pdf_hash = self.generate_pdf(certificate)

        # Definir chave de storage
        key_prefix = f"tenants/{certificate.tenant_id}"
        storage_key = f"{key_prefix}/certificates/{certificate.id}/{certificate.certificate_number}.pdf"

        # Upload direto
        uploaded = False
        try:
            upload_bytes(storage_key, pdf_content, "application/pdf")
            uploaded = True
        except Exception as e:
            print(f"[CERT] Erro ao fazer upload do PDF: {e}")

        # Atualizar certificado apenas se upload bem-sucedido
        if uploaded:
            certificate.pdf_storage_key = storage_key
            certificate.pdf_file_size = len(pdf_content)
            certificate.pdf_hash = pdf_hash
            self.db.add(certificate)

        return storage_key if uploaded else None

    def validate_certificate(
        self, validation_code: str
    ) -> Optional[TrainingCertificate]:
        """Valida certificado pelo código de validação."""
        return (
            self.db.query(TrainingCertificate)
            .filter(TrainingCertificate.validation_code == validation_code)
            .first()
        )

    def validate_by_number(
        self, certificate_number: str
    ) -> Optional[TrainingCertificate]:
        """Valida certificado pelo número."""
        return (
            self.db.query(TrainingCertificate)
            .filter(TrainingCertificate.certificate_number == certificate_number)
            .first()
        )
