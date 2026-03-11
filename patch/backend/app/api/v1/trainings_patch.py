# PATCH: Adicionar ao backend/app/api/v1/trainings.py
# 
# Adiciona endpoint para download de PDF de certificado
# 
# INSTRUÇÕES:
# 1. Adicionar imports no início do arquivo:
#    from fastapi.responses import Response
#    from app.services.certificate_pdf import generate_certificate_pdf, calculate_pdf_hash
#    from app.services.storage import upload_bytes, create_access_url
#
# 2. Adicionar estes endpoints após o endpoint list_certificates:

@router.get("/certificates/{certificate_id}/pdf")
def download_certificate_pdf(
    certificate_id: UUID,
    regenerate: bool = Query(default=False, description="Se True, regenera o PDF mesmo se já existir"),
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    user=Depends(require_any_role([ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER])),
    tenant_id: UUID = Depends(tenant_id_from_user),
):
    """Download do PDF de um certificado.
    
    Se o PDF não existir ou regenerate=True, gera um novo PDF.
    Caso contrário, retorna o PDF armazenado.
    """
    cert = db.query(TrainingCertificate).filter(
        TrainingCertificate.id == certificate_id,
        TrainingCertificate.tenant_id == tenant_id
    ).first()
    
    if not cert:
        raise NotFound("Certificado não encontrado")
    
    # Se já tem PDF e não é para regenerar, retorna URL presigned
    if cert.pdf_storage_key and not regenerate:
        try:
            from app.services.storage import create_access_url
            presigned = create_access_url(cert.pdf_storage_key)
            return {"download_url": presigned.url, "expires_in": 3600}
        except Exception:
            pass  # Se falhar, regenera
    
    # Gera PDF
    from app.services.certificate_pdf import generate_certificate_pdf, calculate_pdf_hash
    from app.models.tenant import Tenant
    
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    pdf_bytes = generate_certificate_pdf(cert, tenant)
    pdf_hash = calculate_pdf_hash(pdf_bytes)
    
    # Tenta salvar no storage
    storage_key = None
    try:
        from app.services.storage import upload_bytes
        storage_key = f"certificates/{tenant_id}/{cert.id}.pdf"
        upload_bytes(storage_key, pdf_bytes, content_type="application/pdf")
        
        cert.pdf_storage_key = storage_key
        cert.pdf_hash = pdf_hash
        cert.pdf_file_size = len(pdf_bytes)
        db.add(cert)
        db.commit()
    except Exception:
        pass  # Se falhar storage, retorna PDF diretamente
    
    # Retorna PDF diretamente
    filename = f"certificado_{cert.certificate_number}.pdf"
    
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        }
    )


@router.post("/items/{item_id}/certificates/generate-pdfs")
def generate_certificate_pdfs(
    item_id: UUID,
    regenerate: bool = Query(default=False),
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    _feat_ok: None = Depends(require_feature("ACTION_PLANS")),
    user=Depends(require_any_role([ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER])),
    tenant_id: UUID = Depends(tenant_id_from_user),
    meta: dict = Depends(get_request_meta),
):
    """Gera PDFs para todos os certificados de um item.
    
    Útil para gerar em lote após emissão de certificados.
    """
    from app.services.certificate_pdf import generate_certificate_pdf, calculate_pdf_hash
    from app.models.tenant import Tenant
    
    # Busca certificados do item
    certs = db.query(TrainingCertificate).filter(
        TrainingCertificate.action_item_id == item_id,
        TrainingCertificate.tenant_id == tenant_id
    ).all()
    
    if not certs:
        return {"generated": 0, "skipped": 0, "failed": 0, "message": "Nenhum certificado encontrado"}
    
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    
    generated = 0
    skipped = 0
    failed = 0
    
    for cert in certs:
        # Pula se já tem PDF e não é para regenerar
        if cert.pdf_storage_key and not regenerate:
            skipped += 1
            continue
        
        try:
            pdf_bytes = generate_certificate_pdf(cert, tenant)
            pdf_hash = calculate_pdf_hash(pdf_bytes)
            
            # Salva no storage
            try:
                from app.services.storage import upload_bytes
                storage_key = f"certificates/{tenant_id}/{cert.id}.pdf"
                upload_bytes(storage_key, pdf_bytes, content_type="application/pdf")
                
                cert.pdf_storage_key = storage_key
                cert.pdf_hash = pdf_hash
                cert.pdf_file_size = len(pdf_bytes)
                db.add(cert)
            except Exception:
                # Mesmo sem storage, marca como gerado (pode ser baixado on-demand)
                cert.pdf_hash = pdf_hash
                db.add(cert)
            
            generated += 1
        except Exception as e:
            failed += 1
    
    db.commit()
    
    return {
        "generated": generated,
        "skipped": skipped,
        "failed": failed,
        "total": len(certs),
    }


# =============================================================================
# VALIDAÇÃO DE CERTIFICADO (Público)
# =============================================================================

@router.get("/certificates/validate/{validation_code}")
def validate_certificate(
    validation_code: str,
    db: Session = Depends(get_db),
):
    """Valida autenticidade de um certificado pelo código.
    
    Este endpoint é público para permitir verificação externa.
    """
    cert = db.query(TrainingCertificate).filter(
        TrainingCertificate.validation_code == validation_code
    ).first()
    
    if not cert:
        return {
            "valid": False,
            "message": "Certificado não encontrado"
        }
    
    return {
        "valid": True,
        "certificate_number": cert.certificate_number,
        "employee_name": cert.employee_name,
        "training_title": cert.training_title,
        "training_completed_at": cert.training_completed_at.isoformat() if cert.training_completed_at else None,
        "issued_at": cert.issued_at.isoformat() if cert.issued_at else None,
    }
