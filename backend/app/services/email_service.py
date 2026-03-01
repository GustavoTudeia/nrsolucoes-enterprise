"""Serviço de envio de emails via SMTP."""
from __future__ import annotations

import smtplib
import secrets
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional
from datetime import datetime, timedelta

from app.core.config import settings


class EmailService:
    """Serviço de email usando SMTP."""

    def __init__(self):
        self.host = settings.SMTP_HOST
        self.port = settings.SMTP_PORT
        self.username = settings.SMTP_USERNAME
        self.password = settings.SMTP_PASSWORD
        self.from_email = settings.SMTP_FROM_EMAIL
        self.from_name = settings.SMTP_FROM_NAME

    def _send(self, to_email: str, subject: str, html_body: str, text_body: Optional[str] = None) -> bool:
        """Envia email via SMTP."""
        if not all([self.host, self.port, self.username, self.password]):
            print(f"[EMAIL] SMTP não configurado. Email para {to_email}: {subject}")
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

            print(f"[EMAIL] Enviado para {to_email}: {subject}")
            return True

        except Exception as e:
            print(f"[EMAIL] Erro ao enviar para {to_email}: {e}")
            return False

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
