"""API do Portal do Colaborador - Treinamentos.

Este módulo adiciona endpoints ao portal do colaborador para:
- Visualizar treinamentos pendentes
- Iniciar e completar treinamentos
- Visualizar e baixar certificados
- Atualizar progresso de consumo de conteúdo
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional, List
from uuid import UUID

from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import and_
from io import BytesIO

from app.api.deps import (
    get_current_employee,
    tenant_id_from_employee,
    get_request_meta,
)
from app.core.errors import NotFound, BadRequest, Forbidden
from app.db.session import get_db
from app.models.training import ActionItemEnrollment, TrainingCertificate
from app.models.action_plan import ActionItem
from app.models.employee import Employee
from app.models.lms import ContentItem, ContentAssignment
from app.schemas.training import (
    PortalTrainingOut,
    PortalCertificateOut,
    EnrollmentProgress,
)
from app.services.enrollment_service import EnrollmentService
from app.services.certificate_service import CertificateService
from app.services.storage import create_access_url

# Este router será incluído no employee_portal.py existente
router = APIRouter()


def get_employee_from_token(token: str, db: Session) -> Employee:
    """Valida token do portal e retorna o colaborador."""
    from app.models.employee_auth import EmployeePortalToken

    portal_token = (
        db.query(EmployeePortalToken)
        .filter(
            EmployeePortalToken.token == token,
            EmployeePortalToken.expires_at > datetime.utcnow(),
            EmployeePortalToken.revoked == False,
        )
        .first()
    )

    if not portal_token:
        raise Forbidden("Token inválido ou expirado")

    employee = (
        db.query(Employee).filter(Employee.id == portal_token.employee_id).first()
    )
    if not employee:
        raise NotFound("Colaborador não encontrado")

    return employee


# ==================== Trainings Endpoints ====================


@router.get("/me/trainings", response_model=List[PortalTrainingOut])
def list_my_trainings(
    status: Optional[str] = Query(
        None, description="Filtrar por status: pending, in_progress, completed"
    ),
    db: Session = Depends(get_db),
    employee: Employee = Depends(get_current_employee),
):
    """Lista treinamentos do colaborador logado.

    Retorna todos os treinamentos atribuídos com status e progresso.
    """

    query = (
        db.query(ActionItemEnrollment)
        .join(ActionItem, ActionItemEnrollment.action_item_id == ActionItem.id)
        .filter(
            ActionItemEnrollment.tenant_id == employee.tenant_id,
            ActionItemEnrollment.employee_id == employee.id,
            ActionItemEnrollment.status != "cancelled",
        )
    )

    if status:
        query = query.filter(ActionItemEnrollment.status == status)

    enrollments = query.order_by(
        ActionItemEnrollment.status.asc(),  # pending primeiro
        ActionItemEnrollment.due_date.asc().nullslast(),
    ).all()

    result = []
    for enrollment in enrollments:
        action_item = enrollment.action_item

        # Buscar conteúdo se existir
        content = None
        if action_item.education_ref_id:
            content = (
                db.query(ContentItem)
                .filter(ContentItem.id == action_item.education_ref_id)
                .first()
            )

        result.append(
            PortalTrainingOut(
                enrollment_id=enrollment.id,
                training_title=action_item.title,
                training_description=action_item.description,
                training_type=content.content_type if content else "course",
                duration_minutes=content.duration_minutes if content else None,
                status=enrollment.status,
                progress_percent=enrollment.progress_percent,
                due_date=enrollment.due_date,
                is_overdue=enrollment.is_overdue,
                days_until_due=enrollment.days_until_due,
                started_at=enrollment.started_at,
                completed_at=enrollment.completed_at,
                content_id=content.id if content else None,
                can_access=True,
                has_certificate=enrollment.certificate_id is not None,
                certificate_id=enrollment.certificate_id,
            )
        )

    return result


@router.get("/me/trainings/{enrollment_id}", response_model=PortalTrainingOut)
def get_my_training(
    enrollment_id: UUID,
    db: Session = Depends(get_db),
    employee: Employee = Depends(get_current_employee),
):
    """Detalhes de um treinamento específico."""

    enrollment = (
        db.query(ActionItemEnrollment)
        .filter(
            ActionItemEnrollment.id == enrollment_id,
            ActionItemEnrollment.tenant_id == employee.tenant_id,
            ActionItemEnrollment.employee_id == employee.id,
        )
        .first()
    )

    if not enrollment:
        raise NotFound("Treinamento não encontrado")

    action_item = enrollment.action_item

    content = None
    if action_item.education_ref_id:
        content = (
            db.query(ContentItem)
            .filter(ContentItem.id == action_item.education_ref_id)
            .first()
        )

    return PortalTrainingOut(
        enrollment_id=enrollment.id,
        training_title=action_item.title,
        training_description=action_item.description,
        training_type=content.content_type if content else "course",
        duration_minutes=content.duration_minutes if content else None,
        status=enrollment.status,
        progress_percent=enrollment.progress_percent,
        due_date=enrollment.due_date,
        is_overdue=enrollment.is_overdue,
        days_until_due=enrollment.days_until_due,
        started_at=enrollment.started_at,
        completed_at=enrollment.completed_at,
        content_id=content.id if content else None,
        can_access=True,
        has_certificate=enrollment.certificate_id is not None,
        certificate_id=enrollment.certificate_id,
    )


@router.post("/me/trainings/{enrollment_id}/start")
def start_my_training(
    enrollment_id: UUID,
    db: Session = Depends(get_db),
    employee: Employee = Depends(get_current_employee),
    meta: dict = Depends(get_request_meta),
):
    """Inicia um treinamento."""

    enrollment = (
        db.query(ActionItemEnrollment)
        .filter(
            ActionItemEnrollment.id == enrollment_id,
            ActionItemEnrollment.tenant_id == employee.tenant_id,
            ActionItemEnrollment.employee_id == employee.id,
        )
        .first()
    )

    if not enrollment:
        raise NotFound("Treinamento não encontrado")

    if enrollment.status not in ("pending", "in_progress"):
        raise BadRequest(
            f"Não é possível iniciar treinamento com status {enrollment.status}"
        )

    service = EnrollmentService(db)
    service.start_training(enrollment)

    db.commit()

    return {
        "message": "Treinamento iniciado",
        "enrollment_id": str(enrollment_id),
        "status": enrollment.status,
    }


@router.post("/me/trainings/{enrollment_id}/progress")
def update_my_training_progress(
    enrollment_id: UUID,
    payload: EnrollmentProgress,
    db: Session = Depends(get_db),
    employee: Employee = Depends(get_current_employee),
):
    """Atualiza progresso do treinamento (para vídeos/conteúdo com tempo)."""

    enrollment = (
        db.query(ActionItemEnrollment)
        .filter(
            ActionItemEnrollment.id == enrollment_id,
            ActionItemEnrollment.tenant_id == employee.tenant_id,
            ActionItemEnrollment.employee_id == employee.id,
        )
        .first()
    )

    if not enrollment:
        raise NotFound("Treinamento não encontrado")

    if enrollment.status in ("completed", "cancelled"):
        raise BadRequest(
            f"Não é possível atualizar treinamento com status {enrollment.status}"
        )

    # Calcular progresso percentual
    progress_percent = 0
    if payload.duration_seconds and payload.duration_seconds > 0:
        progress_percent = min(
            100, int(payload.position_seconds / payload.duration_seconds * 100)
        )

    service = EnrollmentService(db)
    service.update_progress(enrollment, progress_percent)

    db.commit()

    return {
        "message": "Progresso atualizado",
        "enrollment_id": str(enrollment_id),
        "progress_percent": enrollment.progress_percent,
    }


@router.post("/me/trainings/{enrollment_id}/complete")
def complete_my_training(
    enrollment_id: UUID,
    db: Session = Depends(get_db),
    employee: Employee = Depends(get_current_employee),
    meta: dict = Depends(get_request_meta),
):
    """Marca treinamento como concluído e gera certificado."""

    enrollment = (
        db.query(ActionItemEnrollment)
        .filter(
            ActionItemEnrollment.id == enrollment_id,
            ActionItemEnrollment.tenant_id == employee.tenant_id,
            ActionItemEnrollment.employee_id == employee.id,
        )
        .first()
    )

    if not enrollment:
        raise NotFound("Treinamento não encontrado")

    if enrollment.status == "completed":
        return {
            "message": "Treinamento já foi concluído",
            "enrollment_id": str(enrollment_id),
            "certificate_id": (
                str(enrollment.certificate_id) if enrollment.certificate_id else None
            ),
        }

    if enrollment.status == "cancelled":
        raise BadRequest("Treinamento foi cancelado")

    service = EnrollmentService(db)
    certificate = service.complete_training(enrollment, generate_certificate=True)

    # Criar evidência automática
    if certificate:
        service.create_evidence_from_certificate(enrollment, certificate)

    db.commit()

    return {
        "message": "Treinamento concluído com sucesso!",
        "enrollment_id": str(enrollment_id),
        "certificate_id": str(certificate.id) if certificate else None,
        "certificate_number": certificate.certificate_number if certificate else None,
    }


@router.get("/me/trainings/{enrollment_id}/content")
def get_training_content_access(
    enrollment_id: UUID,
    db: Session = Depends(get_db),
    employee: Employee = Depends(get_current_employee),
):
    """Retorna URL de acesso ao conteúdo do treinamento."""

    enrollment = (
        db.query(ActionItemEnrollment)
        .filter(
            ActionItemEnrollment.id == enrollment_id,
            ActionItemEnrollment.tenant_id == employee.tenant_id,
            ActionItemEnrollment.employee_id == employee.id,
        )
        .first()
    )

    if not enrollment:
        raise NotFound("Treinamento não encontrado")

    if enrollment.status in ("cancelled", "expired"):
        raise BadRequest("Acesso ao conteúdo não disponível")

    action_item = enrollment.action_item

    if not action_item.education_ref_id:
        raise BadRequest("Este treinamento não possui conteúdo vinculado")

    content = (
        db.query(ContentItem)
        .filter(ContentItem.id == action_item.education_ref_id)
        .first()
    )
    if not content:
        raise NotFound("Conteúdo não encontrado")

    # Marcar como iniciado se ainda não foi
    if enrollment.status == "pending":
        service = EnrollmentService(db)
        service.start_training(enrollment)
        db.commit()

    # Retornar URL de acesso
    if content.storage_key:
        try:
            presigned = create_access_url(content.storage_key)
            return {
                "content_id": str(content.id),
                "content_type": content.content_type,
                "title": content.title,
                "access_url": presigned.url,
                "expires_in_seconds": presigned.expires_in,
            }
        except Exception:
            pass

    if content.url:
        return {
            "content_id": str(content.id),
            "content_type": content.content_type,
            "title": content.title,
            "access_url": content.url,
            "expires_in_seconds": 0,
        }

    raise BadRequest("Conteúdo não disponível")


# ==================== Certificates Endpoints ====================


@router.get("/me/certificates", response_model=List[PortalCertificateOut])
def list_my_certificates(
    db: Session = Depends(get_db),
    employee: Employee = Depends(get_current_employee),
):
    """Lista certificados do colaborador."""

    certificates = (
        db.query(TrainingCertificate)
        .filter(
            TrainingCertificate.tenant_id == employee.tenant_id,
            TrainingCertificate.employee_id == employee.id,
        )
        .order_by(TrainingCertificate.issued_at.desc())
        .all()
    )

    result = []
    for cert in certificates:
        pdf_url = None
        if cert.pdf_storage_key:
            try:
                presigned = create_access_url(cert.pdf_storage_key)
                pdf_url = presigned.url
            except Exception:
                pass

        result.append(
            PortalCertificateOut(
                id=cert.id,
                certificate_number=cert.certificate_number,
                training_title=cert.training_title,
                completed_at=cert.training_completed_at,
                issued_at=cert.issued_at,
                is_valid=cert.is_valid,
                pdf_download_url=pdf_url,
                validation_code=cert.validation_code,
            )
        )

    return result


@router.get("/me/certificates/{certificate_id}")
def get_my_certificate(
    certificate_id: UUID,
    db: Session = Depends(get_db),
    employee: Employee = Depends(get_current_employee),
):
    """Detalhes de um certificado específico."""

    cert = (
        db.query(TrainingCertificate)
        .filter(
            TrainingCertificate.id == certificate_id,
            TrainingCertificate.tenant_id == employee.tenant_id,
            TrainingCertificate.employee_id == employee.id,
        )
        .first()
    )

    if not cert:
        raise NotFound("Certificado não encontrado")

    pdf_url = None
    if cert.pdf_storage_key:
        try:
            presigned = create_access_url(cert.pdf_storage_key)
            pdf_url = presigned.url
        except Exception:
            pass

    return {
        "id": str(cert.id),
        "certificate_number": cert.certificate_number,
        "employee_name": cert.employee_name,
        "training_title": cert.training_title,
        "training_description": cert.training_description,
        "training_duration_minutes": cert.training_duration_minutes,
        "action_plan_title": cert.action_plan_title,
        "risk_dimension": cert.risk_dimension,
        "training_completed_at": cert.training_completed_at.isoformat(),
        "issued_at": cert.issued_at.isoformat(),
        "valid_until": cert.valid_until.isoformat() if cert.valid_until else None,
        "is_valid": cert.is_valid,
        "validation_code": cert.validation_code,
        "issuer_name": cert.issuer_name,
        "pdf_download_url": pdf_url,
    }


@router.get("/me/certificates/{certificate_id}/download")
def download_my_certificate(
    certificate_id: UUID,
    db: Session = Depends(get_db),
    employee: Employee = Depends(get_current_employee),
):
    """Download do PDF do certificado."""

    cert = (
        db.query(TrainingCertificate)
        .filter(
            TrainingCertificate.id == certificate_id,
            TrainingCertificate.tenant_id == employee.tenant_id,
            TrainingCertificate.employee_id == employee.id,
        )
        .first()
    )

    if not cert:
        raise NotFound("Certificado não encontrado")

    # Se já tem PDF no storage
    if cert.pdf_storage_key:
        try:
            presigned = create_access_url(cert.pdf_storage_key)
            return {
                "download_url": presigned.url,
                "expires_in_seconds": presigned.expires_in,
            }
        except Exception:
            pass

    # Gerar PDF on-the-fly
    service = CertificateService(db)
    pdf_content, _ = service.generate_pdf(cert)

    return StreamingResponse(
        BytesIO(pdf_content),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename={cert.certificate_number}.pdf"
        },
    )
