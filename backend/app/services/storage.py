from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from app.core.config import settings


@dataclass
class PresignResult:
    url: str
    expires_in: int


def _s3_client(endpoint_url: Optional[str] = None):
    import boto3
    from botocore.client import Config

    # Observação: presigned URL inclui o host no cálculo da assinatura.
    # Por isso, para suportar cenários Docker/local (MinIO interno vs. URL pública),
    # permitimos um endpoint específico para assinatura (S3_PUBLIC_ENDPOINT_URL).
    ep = endpoint_url or settings.S3_ENDPOINT_URL
    return boto3.client(
        "s3",
        aws_access_key_id=settings.S3_ACCESS_KEY_ID,
        aws_secret_access_key=settings.S3_SECRET_ACCESS_KEY,
        region_name=settings.S3_REGION,
        endpoint_url=ep,
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    )


def create_upload_url(key: str, content_type: str) -> PresignResult:
    if settings.STORAGE_BACKEND == "s3":
        expires = int(settings.S3_PRESIGN_EXPIRES_SECONDS or 3600)
        presign_endpoint = settings.S3_PUBLIC_ENDPOINT_URL or settings.S3_ENDPOINT_URL
        client = _s3_client(presign_endpoint)
        url = client.generate_presigned_url(
            ClientMethod="put_object",
            Params={"Bucket": settings.S3_BUCKET, "Key": key, "ContentType": content_type},
            ExpiresIn=expires,
        )
        return PresignResult(url=url, expires_in=expires)

    # fallback: sem storage externo
    raise RuntimeError("STORAGE_BACKEND não suportado")


def create_access_url(key: str) -> PresignResult:
    if settings.STORAGE_BACKEND == "s3":
        expires = int(settings.S3_PRESIGN_EXPIRES_SECONDS or 3600)
        presign_endpoint = settings.S3_PUBLIC_ENDPOINT_URL or settings.S3_ENDPOINT_URL
        client = _s3_client(presign_endpoint)
        url = client.generate_presigned_url(
            ClientMethod="get_object",
            Params={"Bucket": settings.S3_BUCKET, "Key": key},
            ExpiresIn=expires,
        )
        return PresignResult(url=url, expires_in=expires)

    raise RuntimeError("STORAGE_BACKEND não suportado")
