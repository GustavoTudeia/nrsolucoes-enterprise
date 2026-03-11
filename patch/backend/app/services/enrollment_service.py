"""Serviço de Matrícula em Treinamentos.

Este módulo implementa:
- Matrícula automática de colaboradores em itens educativos
- Cálculo de estatísticas de progresso
- Integração com LMS (ContentAssignment)
- Notificações e lembretes
"""

from __future__ import annotations
from datetime import datetime, timedelta
from typing import List, Optional, Tuple, Dict, Any
from uuid import UUID

from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_

from app.models.training import ActionItemEnrollment, TrainingCertificate
from app.models.action_plan import ActionItem, ActionPlan
from app.models.employee import Employee
from app.models.org import OrgUnit
from app.models.lms import ContentItem, ContentAssignment, ContentCompletion
from app.schemas.training import EnrollmentStats, TargetType
from app.services.certificate_service import CertificateService


class EnrollmentService:
    """Serviço para gerenciamento de matrículas."""
    
    def __init__(self, db: Session):
        self.db = db
        self.certificate_service = CertificateService(db)
    
    def get_target_employees(
        self,
        tenant_id: UUID,
        target_type: TargetType,
        org_unit_id: Optional[UUID] = None,
        employee_ids: Optional[List[UUID]] = None,
        include_inactive: bool = False,
    ) -> List[Employee]:
        """Retorna lista de colaboradores do público-alvo."""
        
        query = self.db.query(Employee).filter(Employee.tenant_id == tenant_id)
        
        if not include_inactive:
            query = query.filter(Employee.is_active == True)
        
        if target_type == TargetType.ALL_EMPLOYEES:
            pass  # Retorna todos
        
        elif target_type == TargetType.ORG_UNIT:
            if not org_unit_id:
                raise ValueError("org_unit_id é obrigatório para target_type=org_unit")
            
            # Buscar unidade e subunidades
            unit_ids = self._get_unit_and_children(org_unit_id)
            query = query.filter(Employee.org_unit_id.in_(unit_ids))
        
        elif target_type == TargetType.SELECTED:
            if not employee_ids:
                raise ValueError("employee_ids é obrigatório para target_type=selected")
            query = query.filter(Employee.id.in_(employee_ids))
        
        return query.all()
    
    def _get_unit_and_children(self, unit_id: UUID) -> List[UUID]:
        """Retorna IDs da unidade e todas as subunidades."""
        result = [unit_id]
        
        # Buscar subunidades recursivamente
        children = (
            self.db.query(OrgUnit.id)
            .filter(OrgUnit.parent_unit_id == unit_id, OrgUnit.is_active == True)
            .all()
        )
        
        for child in children:
            result.extend(self._get_unit_and_children(child.id))
        
        return result
    
    def enroll_employees(
        self,
        action_item: ActionItem,
        employees: List[Employee],
        due_days: int = 30,
        enrolled_by_user_id: Optional[UUID] = None,
    ) -> Tuple[int, int]:
        """Matricula lista de colaboradores no item.
        
        Returns:
            Tuple[int, int]: (total_enrolled, already_enrolled)
        """
        due_date = datetime.utcnow() + timedelta(days=due_days)
        
        enrolled = 0
        already_enrolled = 0
        
        for employee in employees:
            # Verificar se já existe matrícula
            existing = (
                self.db.query(ActionItemEnrollment)
                .filter(
                    ActionItemEnrollment.tenant_id == action_item.tenant_id,
                    ActionItemEnrollment.action_item_id == action_item.id,
                    ActionItemEnrollment.employee_id == employee.id,
                )
                .first()
            )
            
            if existing:
                already_enrolled += 1
                continue
            
            # Criar ContentAssignment no LMS se houver conteúdo vinculado
            content_assignment_id = None
            if action_item.education_ref_id:
                content_assignment = ContentAssignment(
                    tenant_id=action_item.tenant_id,
                    content_item_id=action_item.education_ref_id if action_item.education_ref_type == "content_item" else None,
                    learning_path_id=action_item.education_ref_id if action_item.education_ref_type == "learning_path" else None,
                    employee_id=employee.id,
                    due_at=due_date,
                    status="assigned",
                )
                self.db.add(content_assignment)
                self.db.flush()
                content_assignment_id = content_assignment.id
            
            # Criar matrícula
            enrollment = ActionItemEnrollment(
                tenant_id=action_item.tenant_id,
                action_item_id=action_item.id,
                employee_id=employee.id,
                status="pending",
                due_date=due_date,
                content_assignment_id=content_assignment_id,
                enrolled_by_user_id=enrolled_by_user_id,
            )
            self.db.add(enrollment)
            enrolled += 1
        
        return enrolled, already_enrolled
    
    def bulk_enroll(
        self,
        action_item: ActionItem,
        target_type: TargetType,
        org_unit_id: Optional[UUID] = None,
        employee_ids: Optional[List[UUID]] = None,
        due_days: int = 30,
        include_inactive: bool = False,
        enrolled_by_user_id: Optional[UUID] = None,
    ) -> Tuple[int, int]:
        """Matrícula em lote baseada no tipo de público-alvo."""
        
        employees = self.get_target_employees(
            tenant_id=action_item.tenant_id,
            target_type=target_type,
            org_unit_id=org_unit_id,
            employee_ids=employee_ids,
            include_inactive=include_inactive,
        )
        
        return self.enroll_employees(
            action_item=action_item,
            employees=employees,
            due_days=due_days,
            enrolled_by_user_id=enrolled_by_user_id,
        )
    
    def get_enrollment_stats(self, action_item_id: UUID, tenant_id: UUID) -> EnrollmentStats:
        """Calcula estatísticas de matrículas de um item."""
        
        enrollments = (
            self.db.query(ActionItemEnrollment)
            .filter(
                ActionItemEnrollment.tenant_id == tenant_id,
                ActionItemEnrollment.action_item_id == action_item_id,
            )
            .all()
        )
        
        total = len(enrollments)
        pending = sum(1 for e in enrollments if e.status == "pending")
        in_progress = sum(1 for e in enrollments if e.status == "in_progress")
        completed = sum(1 for e in enrollments if e.status == "completed")
        expired = sum(1 for e in enrollments if e.status == "expired")
        cancelled = sum(1 for e in enrollments if e.status == "cancelled")
        
        overdue_count = sum(1 for e in enrollments if e.is_overdue)
        
        # Taxa de conclusão (exclui cancelados)
        active_total = total - cancelled
        completion_rate = (completed / active_total * 100) if active_total > 0 else 0
        
        # Média de dias para conclusão
        completed_enrollments = [e for e in enrollments if e.status == "completed" and e.completed_at and e.enrolled_at]
        if completed_enrollments:
            avg_days = sum(
                (e.completed_at - e.enrolled_at).days for e in completed_enrollments
            ) / len(completed_enrollments)
        else:
            avg_days = None
        
        # Certificados emitidos
        certificates = sum(1 for e in enrollments if e.certificate_id is not None)
        
        return EnrollmentStats(
            total=total,
            pending=pending,
            in_progress=in_progress,
            completed=completed,
            expired=expired,
            cancelled=cancelled,
            completion_rate=round(completion_rate, 1),
            overdue_count=overdue_count,
            avg_completion_days=round(avg_days, 1) if avg_days else None,
            certificates_issued=certificates,
        )
    
    def start_training(self, enrollment: ActionItemEnrollment) -> None:
        """Marca início do treinamento."""
        if enrollment.status not in ("pending", "in_progress"):
            raise ValueError(f"Não é possível iniciar matrícula com status {enrollment.status}")
        
        enrollment.start()
        
        # Atualizar ContentAssignment se existir
        if enrollment.content_assignment_id:
            content_assignment = (
                self.db.query(ContentAssignment)
                .filter(ContentAssignment.id == enrollment.content_assignment_id)
                .first()
            )
            if content_assignment:
                content_assignment.status = "in_progress"
                self.db.add(content_assignment)
        
        self.db.add(enrollment)
    
    def complete_training(
        self,
        enrollment: ActionItemEnrollment,
        generate_certificate: bool = True,
        valid_months: Optional[int] = None,
    ) -> Optional[TrainingCertificate]:
        """Marca conclusão do treinamento e gera certificado."""
        
        if enrollment.status == "completed":
            # Já concluído, retornar certificado existente
            if enrollment.certificate_id:
                return self.db.query(TrainingCertificate).filter(
                    TrainingCertificate.id == enrollment.certificate_id
                ).first()
            return None
        
        enrollment.complete()
        
        # Atualizar ContentAssignment se existir
        if enrollment.content_assignment_id:
            content_assignment = (
                self.db.query(ContentAssignment)
                .filter(ContentAssignment.id == enrollment.content_assignment_id)
                .first()
            )
            if content_assignment:
                content_assignment.status = "completed"
                self.db.add(content_assignment)
                
                # Criar ContentCompletion se não existir
                existing_completion = (
                    self.db.query(ContentCompletion)
                    .filter(
                        ContentCompletion.assignment_id == content_assignment.id,
                        ContentCompletion.employee_id == enrollment.employee_id,
                    )
                    .first()
                )
                if not existing_completion:
                    completion = ContentCompletion(
                        tenant_id=enrollment.tenant_id,
                        assignment_id=content_assignment.id,
                        employee_id=enrollment.employee_id,
                        completed_at=datetime.utcnow(),
                        completion_method="training_system",
                    )
                    self.db.add(completion)
        
        self.db.add(enrollment)
        self.db.flush()
        
        # Gerar certificado
        certificate = None
        if generate_certificate:
            certificate = self.certificate_service.create_certificate(
                enrollment=enrollment,
                valid_months=valid_months,
            )
            self.db.flush()
            
            # Gerar PDF
            try:
                self.certificate_service.save_pdf(certificate)
            except Exception:
                pass  # PDF é opcional
        
        return certificate
    
    def update_progress(
        self,
        enrollment: ActionItemEnrollment,
        progress_percent: int,
    ) -> None:
        """Atualiza progresso da matrícula."""
        
        if enrollment.status == "pending":
            enrollment.start()
        
        enrollment.progress_percent = min(100, max(0, progress_percent))
        self.db.add(enrollment)
    
    def expire_overdue(self, tenant_id: UUID) -> int:
        """Marca como expiradas as matrículas vencidas."""
        now = datetime.utcnow()
        
        result = (
            self.db.query(ActionItemEnrollment)
            .filter(
                ActionItemEnrollment.tenant_id == tenant_id,
                ActionItemEnrollment.status.in_(["pending", "in_progress"]),
                ActionItemEnrollment.due_date < now,
            )
            .update({"status": "expired"}, synchronize_session=False)
        )
        
        return result
    
    def get_employee_trainings(
        self,
        employee_id: UUID,
        tenant_id: UUID,
        status: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Retorna treinamentos de um colaborador com detalhes."""
        
        query = (
            self.db.query(ActionItemEnrollment)
            .join(ActionItem, ActionItemEnrollment.action_item_id == ActionItem.id)
            .filter(
                ActionItemEnrollment.tenant_id == tenant_id,
                ActionItemEnrollment.employee_id == employee_id,
            )
        )
        
        if status:
            query = query.filter(ActionItemEnrollment.status == status)
        
        enrollments = query.order_by(ActionItemEnrollment.due_date.asc()).all()
        
        result = []
        for enrollment in enrollments:
            action_item = enrollment.action_item
            
            # Buscar conteúdo se existir
            content = None
            if action_item.education_ref_id:
                content = self.db.query(ContentItem).filter(
                    ContentItem.id == action_item.education_ref_id
                ).first()
            
            result.append({
                "enrollment_id": str(enrollment.id),
                "training_title": action_item.title,
                "training_description": action_item.description,
                "training_type": content.content_type if content else "course",
                "duration_minutes": content.duration_minutes if content else None,
                "status": enrollment.status,
                "progress_percent": enrollment.progress_percent,
                "due_date": enrollment.due_date,
                "is_overdue": enrollment.is_overdue,
                "days_until_due": enrollment.days_until_due,
                "started_at": enrollment.started_at,
                "completed_at": enrollment.completed_at,
                "content_id": str(content.id) if content else None,
                "has_certificate": enrollment.certificate_id is not None,
                "certificate_id": str(enrollment.certificate_id) if enrollment.certificate_id else None,
            })
        
        return result
    
    def create_evidence_from_certificate(
        self,
        enrollment: ActionItemEnrollment,
        certificate: TrainingCertificate,
    ) -> None:
        """Cria evidência automática no item de ação a partir do certificado."""
        from app.models.action_plan import ActionEvidence
        
        # Verificar se já existe evidência para este certificado
        existing = (
            self.db.query(ActionEvidence)
            .filter(
                ActionEvidence.action_item_id == enrollment.action_item_id,
                ActionEvidence.reference.contains(certificate.certificate_number),
            )
            .first()
        )
        
        if existing:
            return
        
        employee = self.db.query(Employee).filter(Employee.id == enrollment.employee_id).first()
        
        evidence = ActionEvidence(
            tenant_id=enrollment.tenant_id,
            action_item_id=enrollment.action_item_id,
            evidence_type="note",
            reference=f"Certificado {certificate.certificate_number}",
            note=f"Certificado de conclusão emitido para {employee.full_name or employee.identifier} em {certificate.issued_at.strftime('%d/%m/%Y')}. Código de validação: {certificate.validation_code}",
            created_by_user_id=None,  # Sistema
        )
        
        self.db.add(evidence)
