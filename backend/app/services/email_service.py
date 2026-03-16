"""Serviço de envio de emails via SMTP."""
from __future__ import annotations

import smtplib
import secrets
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional
from datetime import datetime, timedelta
import logging

from app.core.config import settings
from app.workers.queue import queue as rq_queue
from app.core.metrics import metrics_registry

logger = logging.getLogger(__name__)


class EmailService:
    """Serviço de email usando SMTP, com fila opcional via RQ."""

    def __init__(self, force_sync: bool = False):
        self.force_sync = force_sync
        self.host = settings.SMTP_HOST
        self.port = settings.SMTP_PORT
        self.username = settings.SMTP_USERNAME
        self.password = settings.SMTP_PASSWORD
        self.from_email = settings.SMTP_FROM_EMAIL
        self.from_name = settings.SMTP_FROM_NAME
        self.delivery_mode = (settings.EMAIL_DELIVERY_MODE or "sync").lower()

    def _send(self, to_email: str, subject: str, html_body: str, text_body: Optional[str] = None) -> bool:
        """Envia email via SMTP."""
        if not all([self.host, self.port, self.username, self.password]):
            logger.warning("SMTP não configurado. Email não enviado para %s: %s", to_email, subject)
            return False

        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = f"{self.from_name} <{self.from_email}>"
            msg["To"] = to_email

            if text_body:
                msg.attach(MIMEText(text_body, "plain"))
            msg.attach(MIMEText(html_body, "html"))

            with smtplib.SMTP(self.host, self.port) as server:
                server.starttls()
                server.login(self.username, self.password)
                server.sendmail(self.from_email, to_email, msg.as_string())

            logger.info("Email enviado para %s: %s", to_email, subject)
            metrics_registry.inc_counter("email_sent_total", {"channel": "smtp"})
            return True

        except Exception as e:
            logger.exception("Erro ao enviar email para %s: %s", to_email, e)
            metrics_registry.inc_counter("email_failed_total", {"channel": "smtp"})
            return False

    def _enqueue(self, kind: str, payload: dict) -> bool:
        if self.force_sync or self.delivery_mode != "worker":
            return False
        try:
            rq_queue.enqueue("app.workers.jobs.send_email_job", kind, payload)
            metrics_registry.inc_counter("email_enqueued_total", {"kind": kind})
            return True
        except Exception as exc:
            logger.warning("Falha ao enfileirar email %s: %s", kind, exc)
            metrics_registry.inc_counter("email_enqueue_failed_total", {"kind": kind})
            return False

    def queue_password_reset(self, **payload) -> bool:
        return self._enqueue("password_reset", payload) or self.send_password_reset(**payload)

    def queue_otp_code(self, **payload) -> bool:
        return self._enqueue("otp_code", payload) or self.send_otp_code(**payload)

    def queue_magic_link(self, **payload) -> bool:
        return self._enqueue("magic_link", payload) or self.send_magic_link(**payload)

    def queue_billing_invoice(self, **payload) -> bool:
        return self._enqueue("billing_invoice", payload) or self.send_billing_invoice(**payload)

    def queue_operational_nudge(self, **payload) -> bool:
        return self._enqueue("operational_nudge", payload) or self.send_operational_nudge(**payload)

    def queue_invitation(self, **payload) -> bool:
        return self._enqueue("invitation", payload) or self.send_invitation(**payload)

    def send_password_reset(self, to_email: str, reset_url: str, user_name: Optional[str] = None) -> bool:
        """Envia email de recuperação de senha."""
        name = user_name or "Usuário"
        subject = "Recuperação de Senha - NR Soluções"
        
        html_body = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background: #2563eb; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }}
                .content {{ background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }}
                .button {{ display: inline-block; background: #2563eb; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; margin: 20px 0; }}
                .footer {{ text-align: center; margin-top: 20px; color: #666; font-size: 12px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🔐 Recuperação de Senha</h1>
                </div>
                <div class="content">
                    <p>Olá, <strong>{name}</strong>!</p>
                    <p>Recebemos uma solicitação para redefinir sua senha. Clique no botão abaixo para criar uma nova senha:</p>
                    <p style="text-align: center;">
                        <a href="{reset_url}" class="button">Redefinir Minha Senha</a>
                    </p>
                    <p><small>Este link expira em <strong>1 hora</strong>.</small></p>
                    <p><small>Se você não solicitou esta alteração, ignore este email.</small></p>
                </div>
                <div class="footer">
                    <p>NR Soluções - Plataforma de Gestão SST</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        text_body = f"""
        Olá, {name}!

        Recebemos uma solicitação para redefinir sua senha.
        
        Acesse o link abaixo para criar uma nova senha:
        {reset_url}

        Este link expira em 1 hora.

        Se você não solicitou esta alteração, ignore este email.

        NR Soluções - Plataforma de Gestão SST
        """
        
        return self._send(to_email, subject, html_body, text_body)

    def send_otp_code(self, to_email: str, code: str, user_name: Optional[str] = None) -> bool:
        """Envia código OTP por email."""
        name = user_name or "Usuário"
        subject = f"Seu código de acesso: {code}"
        
        html_body = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background: #2563eb; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }}
                .content {{ background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }}
                .code {{ font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #2563eb; text-align: center; padding: 20px; background: white; border-radius: 8px; margin: 20px 0; }}
                .footer {{ text-align: center; margin-top: 20px; color: #666; font-size: 12px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🔑 Código de Acesso</h1>
                </div>
                <div class="content">
                    <p>Olá, <strong>{name}</strong>!</p>
                    <p>Use o código abaixo para acessar sua conta:</p>
                    <div class="code">{code}</div>
                    <p><small>Este código expira em <strong>10 minutos</strong>.</small></p>
                    <p><small>Se você não solicitou este código, ignore este email.</small></p>
                </div>
                <div class="footer">
                    <p>NR Soluções - Plataforma de Gestão SST</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        text_body = f"""
        Olá, {name}!

        Seu código de acesso é: {code}

        Este código expira em 10 minutos.

        Se você não solicitou este código, ignore este email.

        NR Soluções - Plataforma de Gestão SST
        """
        
        return self._send(to_email, subject, html_body, text_body)

    def send_magic_link(self, to_email: str, magic_url: str, user_name: Optional[str] = None) -> bool:
        """Envia link mágico para login sem senha."""
        name = user_name or "Colaborador"
        subject = "Seu link de acesso - NR Soluções"
        
        html_body = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background: #059669; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }}
                .content {{ background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }}
                .button {{ display: inline-block; background: #059669; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; margin: 20px 0; }}
                .footer {{ text-align: center; margin-top: 20px; color: #666; font-size: 12px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>✨ Acesso Rápido</h1>
                </div>
                <div class="content">
                    <p>Olá, <strong>{name}</strong>!</p>
                    <p>Clique no botão abaixo para acessar o portal:</p>
                    <p style="text-align: center;">
                        <a href="{magic_url}" class="button">Acessar Portal</a>
                    </p>
                    <p><small>Este link expira em <strong>15 minutos</strong> e só pode ser usado uma vez.</small></p>
                </div>
                <div class="footer">
                    <p>NR Soluções - Plataforma de Gestão SST</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        text_body = f"""
        Olá, {name}!

        Clique no link abaixo para acessar o portal:
        {magic_url}

        Este link expira em 15 minutos e só pode ser usado uma vez.

        NR Soluções - Plataforma de Gestão SST
        """
        
        return self._send(to_email, subject, html_body, text_body)


    def send_billing_invoice(
        self,
        to_email: str,
        customer_name: str,
        invoice_number: str,
        amount_cents: int,
        currency: str,
        invoice_url: str | None,
        payment_status: str,
        fiscal_status: str,
    ) -> bool:
        """Envia e-mail de cobrança / documento fiscal."""
        cur = (currency or "BRL").upper()
        amount = amount_cents / 100.0
        subject = f"Sua cobrança / nota fiscal - {invoice_number}"
        cta = (
            f'<p style="text-align: center;"><a href="{invoice_url}" class="button">Abrir documento</a></p>'
            if invoice_url else ""
        )
        html_body = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background: #0f766e; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }}
                .content {{ background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }}
                .button {{ display: inline-block; background: #0f766e; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; margin: 20px 0; }}
                .box {{ background: white; padding: 16px; border-radius: 8px; margin: 16px 0; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header"><h1>Financeiro NR Soluções</h1></div>
                <div class="content">
                    <p>Olá, <strong>{customer_name}</strong>!</p>
                    <p>Seu documento financeiro foi atualizado.</p>
                    <div class="box">
                        <p><strong>Número:</strong> {invoice_number}</p>
                        <p><strong>Valor:</strong> {cur} {amount:,.2f}</p>
                        <p><strong>Status do pagamento:</strong> {payment_status}</p>
                        <p><strong>Status fiscal:</strong> {fiscal_status}</p>
                    </div>
                    {cta}
                    <p><small>Este e-mail foi gerado automaticamente pelo módulo financeiro da plataforma.</small></p>
                </div>
            </div>
        </body>
        </html>
        """
        text_body = f"""
        Olá, {customer_name}!

        Seu documento financeiro foi atualizado.
        Número: {invoice_number}
        Valor: {cur} {amount:,.2f}
        Status do pagamento: {payment_status}
        Status fiscal: {fiscal_status}
        Documento: {invoice_url or '-'}
        """
        return self._send(to_email, subject, html_body, text_body)

    def send_operational_nudge(self, to_email: str, title: str, message: str, cta_label: str | None = None, cta_url: str | None = None, tenant_name: str | None = None) -> bool:
        subject = f"Ação recomendada - {title}"
        cta = f'<p style="text-align:center;"><a href="{cta_url}" class="button">{cta_label or "Abrir plataforma"}</a></p>' if cta_url else ""
        html_body = f"""
        <!DOCTYPE html>
        <html><head><meta charset="utf-8"><style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background: #1d4ed8; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }}
        .content {{ background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }}
        .button {{ display: inline-block; background: #1d4ed8; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; margin: 20px 0; }}
        .box {{ background: white; padding: 16px; border-radius: 8px; margin: 16px 0; }}
        </style></head><body><div class="container"><div class="header"><h1>{title}</h1></div><div class="content">
        <p>{tenant_name or 'Sua organização'} precisa de atenção em um fluxo importante da plataforma.</p>
        <div class="box">{message}</div>
        {cta}
        <p><small>Este aviso foi gerado automaticamente para apoiar ativação, retenção e governança contínua.</small></p>
        </div></div></body></html>
        """
        text_body = f"{title}\n\n{message}\n\n{cta_url or ''}"
        return self._send(to_email, subject, html_body, text_body)

    def send_invitation(self, to_email: str, invite_url: str, tenant_name: str, role_name: str, invited_by: str) -> bool:
        """Envia convite para novo usuário."""
        subject = f"Convite para {tenant_name} - NR Soluções"
        
        html_body = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background: #7c3aed; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }}
                .content {{ background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }}
                .button {{ display: inline-block; background: #7c3aed; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; margin: 20px 0; }}
                .info {{ background: white; padding: 15px; border-radius: 6px; margin: 15px 0; }}
                .footer {{ text-align: center; margin-top: 20px; color: #666; font-size: 12px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🎉 Você foi convidado!</h1>
                </div>
                <div class="content">
                    <p>Olá!</p>
                    <p>Você foi convidado por <strong>{invited_by}</strong> para fazer parte de:</p>
                    <div class="info">
                        <p><strong>Empresa:</strong> {tenant_name}</p>
                        <p><strong>Papel:</strong> {role_name}</p>
                    </div>
                    <p style="text-align: center;">
                        <a href="{invite_url}" class="button">Aceitar Convite</a>
                    </p>
                    <p><small>Este convite expira em <strong>7 dias</strong>.</small></p>
                </div>
                <div class="footer">
                    <p>NR Soluções - Plataforma de Gestão SST</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        text_body = f"""
        Olá!

        Você foi convidado por {invited_by} para fazer parte de {tenant_name} como {role_name}.

        Acesse o link abaixo para aceitar o convite:
        {invite_url}

        Este convite expira em 7 dias.

        NR Soluções - Plataforma de Gestão SST
        """
        
        return self._send(to_email, subject, html_body, text_body)


# Instância global
email_service = EmailService()
