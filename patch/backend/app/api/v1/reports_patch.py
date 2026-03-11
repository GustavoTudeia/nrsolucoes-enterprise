# PATCH: Adicionar ao final de backend/app/api/v1/reports.py
# 
# Adiciona endpoint para gerar Dossiê PGR em PDF
# 
# INSTRUÇÕES:
# 1. Adicionar import no início do arquivo:
#    from fastapi.responses import Response
#    from app.services.pgr_dossier_pdf import generate_pgr_dossier_pdf
#
# 2. Adicionar este endpoint após o endpoint pgr_dossier existente:

@router.get("/pgr-dossier/pdf")
def pgr_dossier_pdf(
    cnpj_id: Optional[UUID] = Query(default=None),
    campaign_id: Optional[UUID] = Query(default=None),
    limit_audit: int = Query(default=100, ge=0, le=500),
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    _user=Depends(
        require_any_role(
            [
                ROLE_OWNER,
                ROLE_TENANT_ADMIN,
                ROLE_TENANT_AUDITOR,
                ROLE_CNPJ_MANAGER,
                ROLE_UNIT_MANAGER,
            ]
        )
    ),
    tenant_id: UUID = Depends(tenant_id_from_user),
):
    """Gera Dossiê PGR completo em PDF para fiscalização NR-1.
    
    Inclui:
    - Estrutura organizacional (CNPJs, unidades)
    - Campanhas de diagnóstico
    - Avaliações de risco
    - Planos de ação com itens e evidências
    - Trilha de auditoria
    
    O PDF é formatado para impressão e atende requisitos de documentação da NR-1.
    """
    # Reutiliza a lógica do endpoint JSON
    dossier_data = pgr_dossier(
        cnpj_id=cnpj_id,
        campaign_id=campaign_id,
        limit_audit=limit_audit,
        db=db,
        _sub_ok=_sub_ok,
        _user=_user,
        tenant_id=tenant_id,
    )
    
    # Gera PDF
    from app.services.pgr_dossier_pdf import generate_pgr_dossier_pdf
    pdf_bytes = generate_pgr_dossier_pdf(dossier_data)
    
    # Nome do arquivo
    filename = f"dossie_pgr_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.pdf"
    
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        }
    )


# =============================================================================
# RELATÓRIO DE TREINAMENTOS CONSOLIDADO
# =============================================================================

@router.get("/training-summary")
def training_summary(
    cnpj_id: Optional[UUID] = Query(default=None),
    org_unit_id: Optional[UUID] = Query(default=None),
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    _user=Depends(
        require_any_role(
            [
                ROLE_OWNER,
                ROLE_TENANT_ADMIN,
                ROLE_TENANT_AUDITOR,
                ROLE_CNPJ_MANAGER,
                ROLE_UNIT_MANAGER,
            ]
        )
    ),
    tenant_id: UUID = Depends(tenant_id_from_user),
):
    """Relatório consolidado de treinamentos NR-1.
    
    Retorna estatísticas de todos os itens educativos dos planos de ação,
    incluindo taxa de conclusão, colaboradores pendentes e certificados emitidos.
    """
    from app.models.training import ActionItemEnrollment, TrainingCertificate
    from app.models.action_plan import ActionItem
    
    # Busca itens educativos
    items_q = db.query(ActionItem).filter(
        ActionItem.tenant_id == tenant_id,
        ActionItem.item_type == "educational"
    )
    
    items = items_q.all()
    
    total_items = len(items)
    total_enrollments = 0
    total_completed = 0
    total_pending = 0
    total_certificates = 0
    
    for item in items:
        total_enrollments += item.enrollment_total or 0
        total_completed += item.enrollment_completed or 0
        total_pending += item.enrollment_pending or 0
    
    # Conta certificados
    total_certificates = db.query(func.count(TrainingCertificate.id)).filter(
        TrainingCertificate.tenant_id == tenant_id
    ).scalar() or 0
    
    completion_rate = (total_completed / total_enrollments * 100) if total_enrollments > 0 else 0
    
    return {
        "tenant_id": str(tenant_id),
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "summary": {
            "total_educational_items": total_items,
            "total_enrollments": total_enrollments,
            "completed": total_completed,
            "pending": total_pending,
            "in_progress": total_enrollments - total_completed - total_pending,
            "completion_rate": round(completion_rate, 1),
            "certificates_issued": total_certificates,
        },
        "items": [
            {
                "id": str(item.id),
                "title": item.title,
                "status": item.status,
                "enrollment_total": item.enrollment_total or 0,
                "enrollment_completed": item.enrollment_completed or 0,
                "enrollment_pending": item.enrollment_pending or 0,
                "completion_rate": round(
                    ((item.enrollment_completed or 0) / (item.enrollment_total or 1)) * 100, 1
                ),
            }
            for item in items
        ],
    }
