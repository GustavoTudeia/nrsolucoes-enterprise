
import { request, APIRequestContext } from '@playwright/test';
import { API_URL, TEST_SUPPORT_URL, PASSWORD } from './constants';

type BootstrapResponse = {
  namespace: string;
  platform_admin: { email: string; password: string };
  primary: {
    tenant_id: string;
    slug: string;
    plan_key: string;
    admin: { email: string; password: string; cpf: string };
    gestor: { email: string; password: string; cpf: string };
    employee: { identifier: string; email: string; cpf: string };
    cnpj_id: string;
    cnpj_number: string;
    unit_id: string;
  };
  secondary: {
    tenant_id: string;
    slug: string;
    plan_key: string;
    admin: { email: string; password: string; cpf: string };
    employee: { identifier: string; email: string; cpf: string };
    cnpj_id: string;
    cnpj_number: string;
    unit_id: string;
  };
};

export async function createApiContext(): Promise<APIRequestContext> {
  return request.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { 'Content-Type': 'application/json' },
    ignoreHTTPSErrors: true,
  });
}

export async function bootstrapFixture(namespace?: string): Promise<BootstrapResponse> {
  const ctx = await request.newContext({ ignoreHTTPSErrors: true });
  const res = await ctx.post(`${TEST_SUPPORT_URL}/bootstrap`, {
    data: { namespace: namespace || process.env.E2E_NAMESPACE || `pw-${Date.now()}` },
  });
  if (!res.ok()) throw new Error(`Bootstrap falhou: ${res.status()} ${await res.text()}`);
  const payload = (await res.json()) as BootstrapResponse;
  await ctx.dispose();
  return payload;
}

export async function loginConsole(email: string, password = PASSWORD) {
  const ctx = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { 'Content-Type': 'application/json' }, ignoreHTTPSErrors: true });
  const res = await ctx.post('/auth/login', { data: { email, password } });
  if (!res.ok()) throw new Error(`Login email falhou (${email}): ${res.status()} ${await res.text()}`);
  const json = await res.json();
  await ctx.dispose();
  return json as { access_token: string; refresh_token: string; user: any };
}

export async function loginConsoleCpf(cpf: string, password = PASSWORD) {
  const ctx = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { 'Content-Type': 'application/json' }, ignoreHTTPSErrors: true });
  const res = await ctx.post('/auth/login/cpf', { data: { cpf, password } });
  if (!res.ok()) throw new Error(`Login CPF falhou (${cpf}): ${res.status()} ${await res.text()}`);
  const json = await res.json();
  await ctx.dispose();
  return json as { access_token: string; refresh_token: string; user: any };
}

export async function createStorageState(email: string, password = PASSWORD) {
  const tokens = await loginConsole(email, password);
  const hostname = new URL(process.env.E2E_FRONTEND_URL || 'http://127.0.0.1:3000').hostname;
  return {
    cookies: [
      { name: 'console_token', value: tokens.access_token, domain: hostname, path: '/', httpOnly: true, secure: false, sameSite: 'Lax' as const },
      { name: 'console_refresh_token', value: tokens.refresh_token, domain: hostname, path: '/', httpOnly: true, secure: false, sameSite: 'Lax' as const },
    ],
    origins: [],
  };
}

export async function getUserSecrets(email: string) {
  const ctx = await request.newContext({ ignoreHTTPSErrors: true });
  const res = await ctx.post(`${TEST_SUPPORT_URL}/user-secrets`, { data: { email } });
  if (!res.ok()) throw new Error(`user-secrets falhou: ${res.status()} ${await res.text()}`);
  const payload = await res.json();
  await ctx.dispose();
  return payload as { email: string; cpf?: string; password_reset_token?: string | null; otp_code?: string | null; magic_link_token?: string | null };
}

export async function issueEmployeeOtp(tenantId: string, identifier: string) {
  const ctx = await request.newContext({ ignoreHTTPSErrors: true });
  const res = await ctx.post(`${TEST_SUPPORT_URL}/employee/issue-otp`, { data: { tenant_id: tenantId, identifier } });
  if (!res.ok()) throw new Error(`employee otp falhou: ${res.status()} ${await res.text()}`);
  const payload = await res.json();
  await ctx.dispose();
  return payload as { code: string };
}

export async function issueEmployeeMagicLink(tenantId: string, identifier: string) {
  const ctx = await request.newContext({ ignoreHTTPSErrors: true });
  const res = await ctx.post(`${TEST_SUPPORT_URL}/employee/issue-magic-link`, { data: { tenant_id: tenantId, identifier } });
  if (!res.ok()) throw new Error(`employee magic falhou: ${res.status()} ${await res.text()}`);
  const payload = await res.json();
  await ctx.dispose();
  return payload as { token: string; url: string };
}

export async function getUserInvitationUrl(tenantId: string, email: string) {
  const ctx = await request.newContext({ ignoreHTTPSErrors: true });
  const res = await ctx.post(`${TEST_SUPPORT_URL}/user-invitation-token`, { data: { tenant_id: tenantId, email } });
  if (!res.ok()) throw new Error(`user invitation lookup falhou: ${res.status()} ${await res.text()}`);
  const payload = await res.json();
  await ctx.dispose();
  return payload as { token: string; url: string };
}
