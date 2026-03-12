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
from app.models.lms import ContentItem, ContentAssignment, LearningPath, LearningPathItem, ContentCompletion
from app.schemas.training import (
    PortalTrainingOut,
    PortalCertificateOut,
    EnrollmentProgress,
    LearningPathDetailOut,
    LearningPathItemOut,
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


# ==================== Helpers ====================


def _sync_learning_path_completion(
    enrollment: ActionItemEnrollment,
    lp_item_count: int,
    lp_completed_count: int,
    db: Session,
):
    """Auto-completa a matrícula se todos os itens da trilha estão concluídos.

    Retorna True se o enrollment foi completado nesta chamada.
    """
    if lp_item_count == 0 or lp_completed_count < lp_item_count:
        return False
    if enrollment.status == "completed":
        return False

    # Atualizar progresso para 100%
    enrollment.progress_percent = 100

    service = EnrollmentService(db)
    certificate = service.complete_training(enrollment, generate_certificate=True)
    if certificate:
        service.create_evidence_from_certificate(enrollment, certificate)

    db.commit()
    return True


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
        is_lp = getattr(action_item, "education_ref_type", None) == "learning_path"

        content = None
        learning_path = None
        lp_item_count = 0
        lp_completed_count = 0

        if action_item.education_ref_id:
            if is_lp:
                learning_path = (
                    db.query(LearningPath)
                    .filter(LearningPath.id == action_item.education_ref_id)
                    .first()
                )
                if learning_path:
                    path_items = (
                        db.query(LearningPathItem)
                        .filter(LearningPathItem.learning_path_id == learning_path.id)
                        .all()
                    )
                    lp_item_count = len(path_items)
                    # Count completed items
                    for pi in path_items:
                        assignment = (
                            db.query(ContentAssignment)
                            .filter(
                                ContentAssignment.content_item_id == pi.content_item_id,
                                ContentAssignment.learning_path_id == learning_path.id,
                                ContentAssignment.employee_id == enrollment.employee_id,
                                ContentAssignment.tenant_id == enrollment.tenant_id,
                            )
                            .first()
                        )
                        if assignment:
                            completion = (
                                db.query(ContentCompletion)
                                .filter(
                                    ContentCompletion.assignment_id == assignment.id,
                                    ContentCompletion.employee_id == enrollment.employee_id,
                                )
                                .first()
                            )
                            if completion:
                                lp_completed_count += 1
            else:
                content = (
                    db.query(ContentItem)
                    .filter(ContentItem.id == action_item.education_ref_id)
                    .first()
                )

        # Calculate total duration for learning paths
        total_duration = None
        if is_lp and learning_path:
            durations = (
                db.query(ContentItem.duration_minutes)
                .join(LearningPathItem, LearningPathItem.content_item_id == ContentItem.id)
                .filter(LearningPathItem.learning_path_id == learning_path.id)
                .all()
            )
            total_duration = sum(d[0] for d in durations if d[0])

        # Auto-sync: se todos os itens estão concluídos mas a matrícula não
        if is_lp and lp_item_count > 0 and lp_completed_count >= lp_item_count:
            _sync_learning_path_completion(enrollment, lp_item_count, lp_completed_count, db)

        result.append(
            PortalTrainingOut(
                enrollment_id=enrollment.id,
                training_title=action_item.title,
                training_description=action_item.description,
                training_type="learning_path" if is_lp else (content.content_type if content else "course"),
                duration_minutes=total_duration if is_lp else (content.duration_minutes if content else None),
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
                is_learning_path=is_lp,
                learning_path_id=learning_path.id if learning_path else None,
                learning_path_title=learning_path.title if learning_path else None,
                learning_path_item_count=lp_item_count,
                learning_path_completed_count=lp_completed_count,
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
    is_lp = getattr(action_item, "education_ref_type", None) == "learning_path"

    content = None
    learning_path = None
    lp_item_count = 0
    lp_completed_count = 0

    if action_item.education_ref_id:
        if is_lp:
            learning_path = (
                db.query(LearningPath)
                .filter(LearningPath.id == action_item.education_ref_id)
                .first()
            )
            if learning_path:
                path_items = (
                    db.query(LearningPathItem)
                    .filter(LearningPathItem.learning_path_id == learning_path.id)
                    .all()
                )
                lp_item_count = len(path_items)
                for pi in path_items:
                    assignment = (
                        db.query(ContentAssignment)
                        .filter(
                            ContentAssignment.content_item_id == pi.content_item_id,
                            ContentAssignment.learning_path_id == learning_path.id,
                            ContentAssignment.employee_id == enrollment.employee_id,
                            ContentAssignment.tenant_id == enrollment.tenant_id,
                        )
                        .first()
                    )
                    if assignment:
                        completion = (
                            db.query(ContentCompletion)
                            .filter(
                                ContentCompletion.assignment_id == assignment.id,
                                ContentCompletion.employee_id == enrollment.employee_id,
                            )
                            .first()
                        )
                        if completion:
                            lp_completed_count += 1
        else:
            content = (
                db.query(ContentItem)
                .filter(ContentItem.id == action_item.education_ref_id)
                .first()
            )

    total_duration = None
    if is_lp and learning_path:
        durations = (
            db.query(ContentItem.duration_minutes)
            .join(LearningPathItem, LearningPathItem.content_item_id == ContentItem.id)
            .filter(LearningPathItem.learning_path_id == learning_path.id)
            .all()
        )
        total_duration = sum(d[0] for d in durations if d[0])

    return PortalTrainingOut(
        enrollment_id=enrollment.id,
        training_title=action_item.title,
        training_description=action_item.description,
        training_type="learning_path" if is_lp else (content.content_type if content else "course"),
        duration_minutes=total_duration if is_lp else (content.duration_minutes if content else None),
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
        is_learning_path=is_lp,
        learning_path_id=learning_path.id if learning_path else None,
        learning_path_title=learning_path.title if learning_path else None,
        learning_path_item_count=lp_item_count,
        learning_path_completed_count=lp_completed_count,
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


# ==================== Learning Path Endpoints ====================


def _get_enrollment_or_404(enrollment_id: UUID, employee: Employee, db: Session):
    """Helper to fetch and validate enrollment ownership."""
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
    return enrollment


@router.get(
    "/me/trainings/{enrollment_id}/learning-path",
    response_model=LearningPathDetailOut,
)
def get_learning_path_items(
    enrollment_id: UUID,
    db: Session = Depends(get_db),
    employee: Employee = Depends(get_current_employee),
):
    """Retorna os itens da trilha de aprendizagem vinculada a um treinamento.

    Cria ContentAssignment por item automaticamente na primeira consulta.
    """
    enrollment = _get_enrollment_or_404(enrollment_id, employee, db)
    action_item = enrollment.action_item

    if getattr(action_item, "education_ref_type", None) != "learning_path":
        raise BadRequest("Este treinamento não é uma trilha de aprendizagem")

    if not action_item.education_ref_id:
        raise BadRequest("Trilha não vinculada")

    learning_path = (
        db.query(LearningPath)
        .filter(LearningPath.id == action_item.education_ref_id)
        .first()
    )
    if not learning_path:
        raise NotFound("Trilha de aprendizagem não encontrada")

    path_items = (
        db.query(LearningPathItem)
        .filter(LearningPathItem.learning_path_id == learning_path.id)
        .order_by(LearningPathItem.order_index)
        .all()
    )

    items_out = []
    needs_flush = False

    for pi in path_items:
        content = (
            db.query(ContentItem)
            .filter(ContentItem.id == pi.content_item_id)
            .first()
        )

        # Ensure per-item ContentAssignment exists (lazy creation)
        assignment = (
            db.query(ContentAssignment)
            .filter(
                ContentAssignment.content_item_id == pi.content_item_id,
                ContentAssignment.learning_path_id == learning_path.id,
                ContentAssignment.employee_id == employee.id,
                ContentAssignment.tenant_id == employee.tenant_id,
            )
            .first()
        )
        if not assignment:
            assignment = ContentAssignment(
                tenant_id=employee.tenant_id,
                content_item_id=pi.content_item_id,
                learning_path_id=learning_path.id,
                employee_id=employee.id,
                due_at=enrollment.due_date,
                status="assigned",
            )
            db.add(assignment)
            needs_flush = True

        if needs_flush:
            db.flush()
            needs_flush = False

        # Check completion
        completion = (
            db.query(ContentCompletion)
            .filter(
                ContentCompletion.assignment_id == assignment.id,
                ContentCompletion.employee_id == employee.id,
            )
            .first()
        )

        items_out.append(
            LearningPathItemOut(
                order_index=pi.order_index,
                content_item_id=pi.content_item_id,
                title=content.title if content else "Conteúdo",
                description=content.description if content else None,
                content_type=content.content_type if content else None,
                duration_minutes=content.duration_minutes if content else None,
                is_completed=completion is not None,
                completed_at=completion.completed_at if completion else None,
            )
        )

    db.commit()

    completed_count = sum(1 for i in items_out if i.is_completed)
    total_count = len(items_out)

    # Auto-sync: completar matrícula se todos os itens estão concluídos
    if total_count > 0 and completed_count >= total_count:
        _sync_learning_path_completion(enrollment, total_count, completed_count, db)

    return LearningPathDetailOut(
        learning_path_id=learning_path.id,
        title=learning_path.title,
        description=learning_path.description,
        total_items=total_count,
        completed_items=completed_count,
        items=items_out,
    )


@router.get("/me/trainings/{enrollment_id}/learning-path/{item_index}/content")
def get_learning_path_item_content(
    enrollment_id: UUID,
    item_index: int,
    db: Session = Depends(get_db),
    employee: Employee = Depends(get_current_employee),
):
    """Retorna URL de acesso ao conteúdo de um item específico da trilha."""
    enrollment = _get_enrollment_or_404(enrollment_id, employee, db)
    action_item = enrollment.action_item

    if getattr(action_item, "education_ref_type", None) != "learning_path":
        raise BadRequest("Este treinamento não é uma trilha de aprendizagem")

    path_item = (
        db.query(LearningPathItem)
        .filter(
            LearningPathItem.learning_path_id == action_item.education_ref_id,
            LearningPathItem.order_index == item_index,
        )
        .first()
    )
    if not path_item:
        raise NotFound("Item da trilha não encontrado")

    content = (
        db.query(ContentItem)
        .filter(ContentItem.id == path_item.content_item_id)
        .first()
    )
    if not content:
        raise NotFound("Conteúdo não encontrado")

    # Auto-start enrollment on first content access
    if enrollment.status == "pending":
        service = EnrollmentService(db)
        service.start_training(enrollment)
        db.commit()

    if content.storage_key:
        try:
            presigned = create_access_url(content.storage_key)
            return {
                "content_id": str(content.id),
                "content_type": content.content_type,
                "title": content.title,
                "access_url": presigned.url,
                "expires_in_seconds": presigned.expires_in,
                "order_index": item_index,
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
            "order_index": item_index,
        }

    raise BadRequest("Conteúdo não disponível")


@router.post("/me/trainings/{enrollment_id}/learning-path/{item_index}/complete")
def complete_learning_path_item(
    enrollment_id: UUID,
    item_index: int,
    db: Session = Depends(get_db),
    employee: Employee = Depends(get_current_employee),
):
    """Marca um item específico da trilha como concluído.

    Se todos os itens forem concluídos, marca o treinamento inteiro.
    """
    enrollment = _get_enrollment_or_404(enrollment_id, employee, db)
    action_item = enrollment.action_item

    if getattr(action_item, "education_ref_type", None) != "learning_path":
        raise BadRequest("Este treinamento não é uma trilha de aprendizagem")

    learning_path_id = action_item.education_ref_id
    path_item = (
        db.query(LearningPathItem)
        .filter(
            LearningPathItem.learning_path_id == learning_path_id,
            LearningPathItem.order_index == item_index,
        )
        .first()
    )
    if not path_item:
        raise NotFound("Item da trilha não encontrado")

    # Find or create per-item assignment
    assignment = (
        db.query(ContentAssignment)
        .filter(
            ContentAssignment.content_item_id == path_item.content_item_id,
            ContentAssignment.learning_path_id == learning_path_id,
            ContentAssignment.employee_id == employee.id,
            ContentAssignment.tenant_id == employee.tenant_id,
        )
        .first()
    )
    if not assignment:
        assignment = ContentAssignment(
            tenant_id=employee.tenant_id,
            content_item_id=path_item.content_item_id,
            learning_path_id=learning_path_id,
            employee_id=employee.id,
            due_at=enrollment.due_date,
            status="completed",
        )
        db.add(assignment)
        db.flush()
    else:
        assignment.status = "completed"

    # Check if already completed
    existing_completion = (
        db.query(ContentCompletion)
        .filter(
            ContentCompletion.assignment_id == assignment.id,
            ContentCompletion.employee_id == employee.id,
        )
        .first()
    )
    if not existing_completion:
        completion = ContentCompletion(
            tenant_id=employee.tenant_id,
            assignment_id=assignment.id,
            employee_id=employee.id,
            completed_at=datetime.utcnow(),
            completion_method="manual",
        )
        db.add(completion)

    # Check if ALL items in the path are now complete
    all_path_items = (
        db.query(LearningPathItem)
        .filter(LearningPathItem.learning_path_id == learning_path_id)
        .all()
    )
    total_items = len(all_path_items)
    completed_items = 0

    for pi in all_path_items:
        a = (
            db.query(ContentAssignment)
            .filter(
                ContentAssignment.content_item_id == pi.content_item_id,
                ContentAssignment.learning_path_id == learning_path_id,
                ContentAssignment.employee_id == employee.id,
                ContentAssignment.tenant_id == employee.tenant_id,
            )
            .first()
        )
        if a:
            c = (
                db.query(ContentCompletion)
                .filter(
                    ContentCompletion.assignment_id == a.id,
                    ContentCompletion.employee_id == employee.id,
                )
                .first()
            )
            if c:
                completed_items += 1

    # Update enrollment progress
    if total_items > 0:
        enrollment.progress_percent = int((completed_items / total_items) * 100)

    all_done = completed_items >= total_items

    # Auto-complete enrollment if all items done
    certificate = None
    if all_done and enrollment.status != "completed":
        service = EnrollmentService(db)
        certificate = service.complete_training(enrollment, generate_certificate=True)
        if certificate:
            service.create_evidence_from_certificate(enrollment, certificate)

    db.commit()

    return {
        "message": "Item concluído" if not all_done else "Trilha concluída!",
        "item_index": item_index,
        "completed_items": completed_items,
        "total_items": total_items,
        "all_completed": all_done,
        "certificate_id": str(certificate.id) if certificate else None,
        "certificate_number": certificate.certificate_number if certificate else None,
    }


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
    regenerate: bool = Query(False, description="Regenerar PDF com novo layout"),
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

    # Se já tem PDF no storage e não pediu regeneração
    if cert.pdf_storage_key and not regenerate:
        try:
            presigned = create_access_url(cert.pdf_storage_key)
            return {
                "download_url": presigned.url,
                "expires_in_seconds": presigned.expires_in,
            }
        except Exception:
            pass

    # Regenerar e salvar no storage, depois retornar URL
    service = CertificateService(db)

    if regenerate:
        try:
            service.save_pdf(cert)
            db.commit()
            db.refresh(cert)
            if cert.pdf_storage_key:
                presigned = create_access_url(cert.pdf_storage_key)
                return {
                    "download_url": presigned.url,
                    "expires_in_seconds": presigned.expires_in,
                }
        except Exception:
            pass

    # Fallback: gerar on-the-fly como stream
    pdf_content, _ = service.generate_pdf(cert)
    return StreamingResponse(
        BytesIO(pdf_content),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename={cert.certificate_number}.pdf"
        },
    )
