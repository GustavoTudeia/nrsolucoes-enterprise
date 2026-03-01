import { apiFetch } from "@/lib/api/client";
import type { AuthLoginResponse, MeResponse } from "@/lib/api/types";

export async function consoleMe() {
  return apiFetch<MeResponse>("console", "/auth/me");
}

export async function consoleLogin(email: string, password: string) {
  // goes through Next route handler to set cookie
  const res = await fetch("/api/auth/console/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    credentials: "include",
  });
  const data = (await res.json()) as any;
  if (!res.ok) throw new Error(data?.detail || "Falha no login");
  return data as AuthLoginResponse;
}

export async function consoleLoginCPF(cpf: string, password: string) {
  // Login por CPF - goes through Next route handler
  const res = await fetch("/api/auth/console/login-cpf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cpf, password }),
    credentials: "include",
  });
  const data = (await res.json()) as any;
  if (!res.ok) throw new Error(data?.detail || "Falha no login");
  return data as AuthLoginResponse;
}

export async function consoleLogout() {
  await fetch("/api/auth/console/logout", { method: "POST", credentials: "include" });
}

export async function employeeLogout() {
  await fetch("/api/auth/employee/logout", { method: "POST", credentials: "include" });
}


export async function consolePasswordResetStart(email: string) {
  const res = await fetch("/api/auth/console/password-reset/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) throw new Error(data?.detail || "Falha ao iniciar recuperação");
  return data as { status: "ok"; dev_token?: string | null };
}

export async function consolePasswordResetConfirm(token: string, newPassword: string) {
  const res = await fetch("/api/auth/console/password-reset/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, new_password: newPassword }),
  });
  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) throw new Error(data?.detail || "Falha ao redefinir senha");
  return data as { status: "ok" };
}

export async function consolePasswordChange(currentPassword: string, newPassword: string) {
  const res = await fetch("/api/auth/console/password/change", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    credentials: "include",
  });
  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) throw new Error(data?.detail || "Falha ao alterar senha");
  return data as { message: string };
}

export async function consoleSsoStart(email: string, redirectUri: string) {
  const res = await fetch("/api/auth/console/sso/oidc/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, redirect_uri: redirectUri }),
  });
  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) throw new Error(data?.detail || "Falha ao iniciar SSO");
  return data as { authorization_url: string; state: string };
}

export async function getMe() {
  return apiFetch<MeResponse>("console", "/auth/me");
}

export async function updateMe(data: { full_name?: string; phone?: string }) {
  return apiFetch<MeResponse>("console", "/users/me", {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

// OTP (One-Time Password) functions
export async function requestOTP(cpf: string, method: "sms" | "whatsapp" = "sms") {
  const res = await fetch("/api/auth/console/otp/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cpf, method }),
  });
  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) throw new Error(data?.detail || "Falha ao enviar código");
  return data as { message: string; masked_phone: string; expires_in: number };
}

export async function verifyOTP(cpf: string, code: string) {
  const res = await fetch("/api/auth/console/otp/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cpf, code }),
    credentials: "include",
  });
  const data = (await res.json()) as any;
  if (!res.ok) throw new Error(data?.detail || "Código inválido ou expirado");
  return data as AuthLoginResponse;
}
