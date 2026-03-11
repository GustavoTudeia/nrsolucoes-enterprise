"""API de Matrículas em Treinamentos e Certificados.

Este módulo implementa os endpoints para:
- Matricular colaboradores em itens educativos do Plano de Ação
- Acompanhar progresso de conclusão
- Gerar e validar certificados
- Integração com LMS

Endpoints:
- POST   /action-plans/items/{item_id}/enrollments      - Matricular colaboradores
- GET    /action-plans/items/{item_id}/enrollments      - Listar matrículas
- GET    /action-plans/items/{item_id}/enrollment-stats - Estatísticas
- PATCH  /enrollments/{enrollment_id}                   - Atualizar matrícula
- DELETE /enrollments/{enrollment_id}                   - Cancelar matrícula
- POST   /enrollments/{enrollment_id}/complete          - Marcar conclusão
- POST   /enrollments/{enrollment_id}/certificate       - Gerar certificado
- GET    /certificates                                  - Listar certificados
- GET    /certificates/{id}                             - Detalhes do certificado
- GET    /certificates/{id}/pdf                         - Download PDF
- GET    /certificates/validate/{code}                  - Validar certificado
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional, List
from uuid import UUID

from fastapi import APIRouter, Depends, Query, HTTPException, Response
from fastapi.responses import Response
from app.services.certificate_pdf import generate_certificate_pdf, calculate_pdf_hash
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from io import BytesIO

from app.api.deps import (
    get_current_user,
    require_any_role,
    tenant_id_from_user,
    get_request_meta,
    require_feature,
    require_active_subscription,
)
from app.core.audit import make_audit_event
from app.core.errors import Forbidden, NotFound, BadRequest
from app.core.rbac import (
    ROLE_OWNER,
    ROLE_TENANT_ADMIN,
    ROLE_CNPJ_MANAGER,
    ROLE_UNIT_MANAGER,
)
from app.db.session import get_db
from app.models.training import ActionItemEnrollment, TrainingCertificate
from app.models.action_plan import ActionItem, ActionPlan, ActionEvidence
from app.models.employee import Employee
from app.models.lms import ContentItem
from app.schemas.training import (
    EnrollmentCreate,
    BulkEnrollmentCreate,
    EnrollmentUpdate,
    EnrollmentOut,
    EnrollmentStats,
    TargetType,
    CertificateOut,
    CertificateValidation,
    ActionItemWithEnrollments,
)
from app.schemas.common import Page
from app.services.enrollment_service import EnrollmentService
from app.services.certificate_service import CertificateService
from app.services.storage import create_access_url

router = APIRouter(prefix="/trainings", tags=["trainings"])


# ==================== Enrollment Endpoints ====================


@router.post("/items/{item_id}/enrollments", response_model=dict)
def bulk_enroll_employees(
    item_id: UUID,
    payload: BulkEnrollmentCreate,
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    user=Depends(
        require_any_role(
            [ROLE_OWNER, ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER]
        )
    ),
    tenant_id: UUID = Depends(tenant_id_from_user),
    meta: dict = Depends(get_request_meta),
):
    """Matricula colaboradores em um item de ação educativo.

    Permite matricular:
    - Todos os colaboradores do tenant
    - Colaboradores de uma unidade específica (incluindo subunidades)
    - Lista específica de colaboradores
    """
    # Buscar item
    item = (
        db.query(ActionItem)
        .filter(ActionItem.id == item_id, ActionItem.tenant_id == tenant_id)
        .first()
    )
    if not item:
        raise NotFound("Item de ação não encontrado")

    if item.item_type != "educational":
        raise BadRequest("Este item não é do tipo educativo")

    # Executar matrícula
    service = EnrollmentService(db)

    try:
        enrolled, already_enrolled = service.bulk_enroll(
            action_item=item,
            target_type=payload.target_type,
            org_unit_id=payload.org_unit_id,
            employee_ids=payload.employee_ids,
            due_days=payload.due_days,
            include_inactive=payload.include_inactive,
            enrolled_by_user_id=user.id,
        )
    except ValueError as e:
        raise BadRequest(str(e))

    # Auditoria
    db.add(
        make_audit_event(
            tenant_id,
            user.id,
            "BULK_ENROLL",
            "ACTION_ITEM_ENROLLMENT",
            item_id,
            None,
            {
                "target_type": payload.target_type.value,
                "enrolled": enrolled,
                "already_enrolled": already_enrolled,
                "due_days": payload.due_days,
            },
            meta.get("ip"),
            meta.get("user_agent"),
            meta.get("request_id"),
        )
    )

    db.commit()

    return {
        "enrolled": enrolled,
        "already_enrolled": already_enrolled,
        "total_processed": enrolled + already_enrolled,
    }


@router.get("/items/{item_id}/enrollments", response_model=Page[EnrollmentOut])
def list_enrollments(
    item_id: UUID,
    status: Optional[str] = Query(None, description="Filtrar por status"),
    overdue_only: bool = Query(False, description="Apenas atrasados"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    user=Depends(
        require_any_role(
            [ROLE_OWNER, ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER]
        )
    ),
    tenant_id: UUID = Depends(tenant_id_from_user),
):
    """Lista matrículas de um item de ação."""

    # Verificar item existe
    item = (
        db.query(ActionItem)
        .filter(ActionItem.id == item_id, ActionItem.tenant_id == tenant_id)
        .first()
    )
    if not item:
        raise NotFound("Item de ação não encontrado")

    query = db.query(ActionItemEnrollment).filter(
        ActionItemEnrollment.tenant_id == tenant_id,
        ActionItemEnrollment.action_item_id == item_id,
    )

    if status:
        query = query.filter(ActionItemEnrollment.status == status)

    if overdue_only:
        query = query.filter(
            ActionItemEnrollment.status.in_(["pending", "in_progress"]),
            ActionItemEnrollment.due_date < datetime.utcnow(),
        )

    total = query.count()

    enrollments = (
        query.order_by(ActionItemEnrollment.due_date.asc().nullslast())
        .offset(offset)
        .limit(limit)
        .all()
    )

    # Buscar dados dos colaboradores
    employee_ids = [e.employee_id for e in enrollments]
    employees = {
        str(emp.id): emp
        for emp in db.query(Employee).filter(Employee.id.in_(employee_ids)).all()
    }

    items = []
    for enrollment in enrollments:
        emp = employees.get(str(enrollment.employee_id))
        items.append(
            EnrollmentOut(
                id=enrollment.id,
                action_item_id=enrollment.action_item_id,
                employee_id=enrollment.employee_id,
                employee_name=emp.full_name if emp else None,
                employee_identifier=emp.identifier if emp else None,
                employee_email=emp.email if emp else None,
                status=enrollment.status,
                progress_percent=enrollment.progress_percent,
                enrolled_at=enrollment.enrolled_at,
                due_date=enrollment.due_date,
                started_at=enrollment.started_at,
                completed_at=enrollment.completed_at,
                is_overdue=enrollment.is_overdue,
                days_until_due=enrollment.days_until_due,
                content_assignment_id=enrollment.content_assignment_id,
                certificate_id=enrollment.certificate_id,
                notes=enrollment.notes,
                created_at=enrollment.created_at,
            )
        )

    return Page(items=items, total=total, limit=limit, offset=offset)


@router.get("/items/{item_id}/enrollment-stats", response_model=EnrollmentStats)
def get_enrollment_stats(
    item_id: UUID,
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    user=Depends(
        require_any_role(
            [ROLE_OWNER, ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER]
        )
    ),
    tenant_id: UUID = Depends(tenant_id_from_user),
):
    """Retorna estatísticas de matrículas de um item."""

    # Verificar item existe
    item = (
        db.query(ActionItem)
        .filter(ActionItem.id == item_id, ActionItem.tenant_id == tenant_id)
        .first()
    )
    if not item:
        raise NotFound("Item de ação não encontrado")

    service = EnrollmentService(db)
    return service.get_enrollment_stats(item_id, tenant_id)


@router.patch("/enrollments/{enrollment_id}", response_model=EnrollmentOut)
def update_enrollment(
    enrollment_id: UUID,
    payload: EnrollmentUpdate,
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    user=Depends(
        require_any_role(
            [ROLE_OWNER, ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER]
        )
    ),
    tenant_id: UUID = Depends(tenant_id_from_user),
    meta: dict = Depends(get_request_meta),
):
    """Atualiza uma matrícula."""

    enrollment = (
        db.query(ActionItemEnrollment)
        .filter(
            ActionItemEnrollment.id == enrollment_id,
            ActionItemEnrollment.tenant_id == tenant_id,
        )
        .first()
    )
    if not enrollment:
        raise NotFound("Matrícula não encontrada")

    old_status = enrollment.status

    if payload.status:
        enrollment.status = payload.status.value
    if payload.due_date:
        enrollment.due_date = payload.due_date
    if payload.notes is not None:
        enrollment.notes = payload.notes
    if payload.progress_percent is not None:
        enrollment.progress_percent = payload.progress_percent

    db.add(enrollment)

    # Auditoria
    db.add(
        make_audit_event(
            tenant_id,
            user.id,
            "UPDATE",
            "ACTION_ITEM_ENROLLMENT",
            enrollment_id,
            {"status": old_status},
            {"status": enrollment.status},
            meta.get("ip"),
            meta.get("user_agent"),
            meta.get("request_id"),
        )
    )

    db.commit()
    db.refresh(enrollment)

    emp = db.query(Employee).filter(Employee.id == enrollment.employee_id).first()

    return EnrollmentOut(
        id=enrollment.id,
        action_item_id=enrollment.action_item_id,
        employee_id=enrollment.employee_id,
        employee_name=emp.full_name if emp else None,
        employee_identifier=emp.identifier if emp else None,
        employee_email=emp.email if emp else None,
        status=enrollment.status,
        progress_percent=enrollment.progress_percent,
        enrolled_at=enrollment.enrolled_at,
        due_date=enrollment.due_date,
        started_at=enrollment.started_at,
        completed_at=enrollment.completed_at,
        is_overdue=enrollment.is_overdue,
        days_until_due=enrollment.days_until_due,
        content_assignment_id=enrollment.content_assignment_id,
        certificate_id=enrollment.certificate_id,
        notes=enrollment.notes,
        created_at=enrollment.created_at,
    )


@router.delete("/enrollments/{enrollment_id}")
def cancel_enrollment(
    enrollment_id: UUID,
    reason: Optional[str] = Query(None, description="Motivo do cancelamento"),
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    user=Depends(
        require_any_role(
            [ROLE_OWNER, ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER]
        )
    ),
    tenant_id: UUID = Depends(tenant_id_from_user),
    meta: dict = Depends(get_request_meta),
):
    """Cancela uma matrícula."""

    enrollment = (
        db.query(ActionItemEnrollment)
        .filter(
            ActionItemEnrollment.id == enrollment_id,
            ActionItemEnrollment.tenant_id == tenant_id,
        )
        .first()
    )
    if not enrollment:
        raise NotFound("Matrícula não encontrada")

    if enrollment.status == "completed":
        raise BadRequest("Não é possível cancelar matrícula já concluída")

    enrollment.cancel(reason)
    db.add(enrollment)

    # Auditoria
    db.add(
        make_audit_event(
            tenant_id,
            user.id,
            "CANCEL",
            "ACTION_ITEM_ENROLLMENT",
            enrollment_id,
            None,
            {"reason": reason},
            meta.get("ip"),
            meta.get("user_agent"),
            meta.get("request_id"),
        )
    )

    db.commit()

    return {"message": "Matrícula cancelada", "id": str(enrollment_id)}


@router.post("/enrollments/{enrollment_id}/complete", response_model=dict)
def complete_enrollment(
    enrollment_id: UUID,
    generate_certificate: bool = Query(
        True, description="Gerar certificado automaticamente"
    ),
    valid_months: Optional[int] = Query(
        None, ge=1, le=120, description="Validade do certificado em meses"
    ),
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    user=Depends(
        require_any_role(
            [ROLE_OWNER, ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER]
        )
    ),
    tenant_id: UUID = Depends(tenant_id_from_user),
    meta: dict = Depends(get_request_meta),
):
    """Marca matrícula como concluída e gera certificado."""

    enrollment = (
        db.query(ActionItemEnrollment)
        .filter(
            ActionItemEnrollment.id == enrollment_id,
            ActionItemEnrollment.tenant_id == tenant_id,
        )
        .first()
    )
    if not enrollment:
        raise NotFound("Matrícula não encontrada")

    if enrollment.status == "cancelled":
        raise BadRequest("Matrícula está cancelada")

    service = EnrollmentService(db)

    certificate = service.complete_training(
        enrollment=enrollment,
        generate_certificate=generate_certificate,
        valid_months=valid_months,
    )

    # Criar evidência automática se houver certificado
    if certificate:
        service.create_evidence_from_certificate(enrollment, certificate)

    # Auditoria
    db.add(
        make_audit_event(
            tenant_id,
            user.id,
            "COMPLETE",
            "ACTION_ITEM_ENROLLMENT",
            enrollment_id,
            None,
            {
                "certificate_id": str(certificate.id) if certificate else None,
                "certificate_number": (
                    certificate.certificate_number if certificate else None
                ),
            },
            meta.get("ip"),
            meta.get("user_agent"),
            meta.get("request_id"),
        )
    )

    db.commit()

    return {
        "message": "Treinamento concluído com sucesso",
        "enrollment_id": str(enrollment_id),
        "certificate_id": str(certificate.id) if certificate else None,
        "certificate_number": certificate.certificate_number if certificate else None,
    }


# ==================== Certificate Endpoints ====================


@router.get("/certificates", response_model=Page[CertificateOut])
def list_certificates(
    employee_id: Optional[UUID] = Query(None),
    action_item_id: Optional[UUID] = Query(None),
    issued_after: Optional[datetime] = Query(None),
    issued_before: Optional[datetime] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    user=Depends(
        require_any_role(
            [ROLE_OWNER, ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER]
        )
    ),
    tenant_id: UUID = Depends(tenant_id_from_user),
):
    """Lista certificados emitidos."""

    query = db.query(TrainingCertificate).filter(
        TrainingCertificate.tenant_id == tenant_id
    )

    if employee_id:
        query = query.filter(TrainingCertificate.employee_id == employee_id)
    if action_item_id:
        query = query.filter(TrainingCertificate.action_item_id == action_item_id)
    if issued_after:
        query = query.filter(TrainingCertificate.issued_at >= issued_after)
    if issued_before:
        query = query.filter(TrainingCertificate.issued_at <= issued_before)

    total = query.count()

    certificates = (
        query.order_by(TrainingCertificate.issued_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    items = [
        CertificateOut(
            id=cert.id,
            certificate_number=cert.certificate_number,
            employee_id=cert.employee_id,
            employee_name=cert.employee_name,
            employee_cpf=cert.employee_cpf,
            employee_identifier=cert.employee_identifier,
            training_title=cert.training_title,
            training_description=cert.training_description,
            training_duration_minutes=cert.training_duration_minutes,
            action_plan_title=cert.action_plan_title,
            risk_dimension=cert.risk_dimension,
            training_completed_at=cert.training_completed_at,
            issued_at=cert.issued_at,
            valid_until=cert.valid_until,
            is_valid=cert.is_valid,
            validation_code=cert.validation_code,
            validation_url=cert.validation_url,
            pdf_available=cert.pdf_storage_key is not None,
            issuer_name=cert.issuer_name,
            issuer_cnpj=cert.issuer_cnpj,
            created_at=cert.created_at,
        )
        for cert in certificates
    ]

    return Page(items=items, total=total, limit=limit, offset=offset)


@router.get("/certificates/{certificate_id}", response_model=CertificateOut)
def get_certificate(
    certificate_id: UUID,
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    user=Depends(
        require_any_role(
            [ROLE_OWNER, ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER]
        )
    ),
    tenant_id: UUID = Depends(tenant_id_from_user),
):
    """Retorna detalhes de um certificado."""

    cert = (
        db.query(TrainingCertificate)
        .filter(
            TrainingCertificate.id == certificate_id,
            TrainingCertificate.tenant_id == tenant_id,
        )
        .first()
    )
    if not cert:
        raise NotFound("Certificado não encontrado")

    return CertificateOut(
        id=cert.id,
        certificate_number=cert.certificate_number,
        employee_id=cert.employee_id,
        employee_name=cert.employee_name,
        employee_cpf=cert.employee_cpf,
        employee_identifier=cert.employee_identifier,
        training_title=cert.training_title,
        training_description=cert.training_description,
        training_duration_minutes=cert.training_duration_minutes,
        action_plan_title=cert.action_plan_title,
        risk_dimension=cert.risk_dimension,
        training_completed_at=cert.training_completed_at,
        issued_at=cert.issued_at,
        valid_until=cert.valid_until,
        is_valid=cert.is_valid,
        validation_code=cert.validation_code,
        validation_url=cert.validation_url,
        pdf_available=cert.pdf_storage_key is not None,
        issuer_name=cert.issuer_name,
        issuer_cnpj=cert.issuer_cnpj,
        created_at=cert.created_at,
    )


@router.get("/certificates/{certificate_id}/pdf")
def download_certificate_pdf(
    certificate_id: UUID,
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    user=Depends(
        require_any_role(
            [ROLE_OWNER, ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER]
        )
    ),
    tenant_id: UUID = Depends(tenant_id_from_user),
):
    """Download do PDF do certificado."""

    cert = (
        db.query(TrainingCertificate)
        .filter(
            TrainingCertificate.id == certificate_id,
            TrainingCertificate.tenant_id == tenant_id,
        )
        .first()
    )
    if not cert:
        raise NotFound("Certificado não encontrado")

    # Se já tem PDF no storage, retornar URL assinada
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


@router.get("/certificates/validate/{code}", response_model=CertificateValidation)
def validate_certificate(
    code: str,
    db: Session = Depends(get_db),
):
    """Valida certificado pelo código de validação (endpoint público)."""

    service = CertificateService(db)
    cert = service.validate_certificate(code)

    if not cert:
        return CertificateValidation(
            valid=False,
            message="Certificado não encontrado com este código de validação",
        )

    if not cert.is_valid:
        return CertificateValidation(
            valid=False,
            certificate_number=cert.certificate_number,
            employee_name=cert.employee_name,
            training_title=cert.training_title,
            issued_at=cert.issued_at,
            message=f"Certificado expirado em {cert.valid_until.strftime('%d/%m/%Y')}",
        )

    return CertificateValidation(
        valid=True,
        certificate_number=cert.certificate_number,
        employee_name=cert.employee_name,
        training_title=cert.training_title,
        issued_at=cert.issued_at,
        issuer_name=cert.issuer_name,
        message="Certificado válido",
    )


# ==================== Training Report Endpoint ====================


@router.get("/items/{item_id}/report")
def get_training_report(
    item_id: UUID,
    format: str = Query("json", description="Formato: json ou summary"),
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    user=Depends(
        require_any_role(
            [ROLE_OWNER, ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER]
        )
    ),
    tenant_id: UUID = Depends(tenant_id_from_user),
):
    """Relatório completo de treinamento de um item.

    Inclui:
    - Estatísticas gerais
    - Lista de todos os colaboradores com status
    - Certificados emitidos
    - Histórico de progresso
    """

    # Buscar item
    item = (
        db.query(ActionItem)
        .filter(ActionItem.id == item_id, ActionItem.tenant_id == tenant_id)
        .first()
    )
    if not item:
        raise NotFound("Item de ação não encontrado")

    # Estatísticas
    service = EnrollmentService(db)
    stats = service.get_enrollment_stats(item_id, tenant_id)

    # Matrículas com detalhes
    enrollments = (
        db.query(ActionItemEnrollment)
        .filter(
            ActionItemEnrollment.tenant_id == tenant_id,
            ActionItemEnrollment.action_item_id == item_id,
        )
        .all()
    )

    # Buscar colaboradores
    employee_ids = [e.employee_id for e in enrollments]
    employees = {
        str(emp.id): emp
        for emp in db.query(Employee).filter(Employee.id.in_(employee_ids)).all()
    }

    # Buscar certificados
    certificate_ids = [e.certificate_id for e in enrollments if e.certificate_id]
    certificates = {
        str(cert.id): cert
        for cert in db.query(TrainingCertificate)
        .filter(TrainingCertificate.id.in_(certificate_ids))
        .all()
    }

    # Montar resposta
    enrollment_details = []
    for enrollment in enrollments:
        emp = employees.get(str(enrollment.employee_id))
        cert = (
            certificates.get(str(enrollment.certificate_id))
            if enrollment.certificate_id
            else None
        )

        enrollment_details.append(
            {
                "employee_name": emp.full_name if emp else None,
                "employee_identifier": emp.identifier if emp else None,
                "employee_email": emp.email if emp else None,
                "org_unit": emp.org_unit.name if emp and emp.org_unit else None,
                "status": enrollment.status,
                "progress_percent": enrollment.progress_percent,
                "enrolled_at": (
                    enrollment.enrolled_at.isoformat()
                    if enrollment.enrolled_at
                    else None
                ),
                "due_date": (
                    enrollment.due_date.isoformat() if enrollment.due_date else None
                ),
                "started_at": (
                    enrollment.started_at.isoformat() if enrollment.started_at else None
                ),
                "completed_at": (
                    enrollment.completed_at.isoformat()
                    if enrollment.completed_at
                    else None
                ),
                "is_overdue": enrollment.is_overdue,
                "certificate_number": cert.certificate_number if cert else None,
                "certificate_issued_at": cert.issued_at.isoformat() if cert else None,
            }
        )

    return {
        "item_id": str(item_id),
        "item_title": item.title,
        "item_type": item.item_type,
        "generated_at": datetime.utcnow().isoformat(),
        "statistics": {
            "total": stats.total,
            "pending": stats.pending,
            "in_progress": stats.in_progress,
            "completed": stats.completed,
            "expired": stats.expired,
            "cancelled": stats.cancelled,
            "completion_rate": stats.completion_rate,
            "overdue_count": stats.overdue_count,
            "avg_completion_days": stats.avg_completion_days,
            "certificates_issued": stats.certificates_issued,
        },
        "enrollments": enrollment_details,
    }


@router.post("/items/{item_id}/certificates/generate", response_model=dict)
def generate_certificates_for_item(
    item_id: UUID,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    tenant_id: UUID = Depends(tenant_id_from_user),
    meta: dict = Depends(get_request_meta),
):
    """Gera certificados para todas as matrículas concluídas sem certificado."""
    from app.services.certificate_service import CertificateService

    print(f"[CERT] Iniciando geração para item {item_id}, tenant {tenant_id}")

    # Verificar se o item existe e pertence ao tenant
    item = (
        db.query(ActionItem)
        .filter(ActionItem.id == item_id, ActionItem.tenant_id == tenant_id)
        .first()
    )
    if not item:
        print(f"[CERT] Item não encontrado")
        raise NotFound("Item não encontrado")

    print(f"[CERT] Item encontrado: {item.title}")

    # Buscar matrículas concluídas sem certificado
    enrollments = (
        db.query(ActionItemEnrollment)
        .filter(
            ActionItemEnrollment.action_item_id == item_id,
            ActionItemEnrollment.tenant_id == tenant_id,
            ActionItemEnrollment.status == "completed",
            ActionItemEnrollment.certificate_id.is_(None),
        )
        .all()
    )

    print(f"[CERT] Matrículas elegíveis encontradas: {len(enrollments)}")

    # Debug: listar todas as matrículas do item
    all_enrollments = (
        db.query(ActionItemEnrollment)
        .filter(ActionItemEnrollment.action_item_id == item_id)
        .all()
    )
    for e in all_enrollments:
        print(f"[CERT] Matrícula: status={e.status}, certificate_id={e.certificate_id}")

    if not enrollments:
        return {
            "generated": 0,
            "skipped": 0,
            "message": "Nenhuma matrícula elegível para certificado",
        }

    # ... resto do código continua igual

    cert_service = CertificateService(db)
    generated = 0
    skipped = 0
    errors = []

    for enrollment in enrollments:
        try:
            print(f"[CERT] Processando matrícula {enrollment.id}...")

            # Criar certificado
            certificate = cert_service.create_certificate(enrollment=enrollment)
            print(f"[CERT] Certificado criado: {certificate.certificate_number}")

            # Gerar e salvar PDF
            try:
                cert_service.save_pdf(certificate)
            except Exception as e:
                print(
                    f"[CERT] Erro ao gerar PDF para {certificate.certificate_number}: {e}"
                )

            db.commit()
            generated += 1

        except Exception as e:
            print(f"[CERT] ERRO ao processar matrícula: {e}")
            db.rollback()
            errors.append(str(e))
            skipped += 1

    return {
        "generated": generated,
        "skipped": skipped,
        "errors": errors if errors else None,
        "message": f"{generated} certificado(s) gerado(s)",
    }
