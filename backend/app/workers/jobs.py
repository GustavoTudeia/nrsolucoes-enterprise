from __future__ import annotations

from app.services.email_service import EmailService


def send_email_job(kind: str, payload: dict) -> bool:
    svc = EmailService(force_sync=True)
    if kind == "password_reset":
        return svc.send_password_reset(**payload)
    if kind == "otp_code":
        return svc.send_otp_code(**payload)
    if kind == "magic_link":
        return svc.send_magic_link(**payload)
    if kind == "billing_invoice":
        return svc.send_billing_invoice(**payload)
    if kind == "operational_nudge":
        return svc.send_operational_nudge(**payload)
    if kind == "invitation":
        return svc.send_invitation(**payload)
    raise ValueError(f"Email job kind desconhecido: {kind}")
