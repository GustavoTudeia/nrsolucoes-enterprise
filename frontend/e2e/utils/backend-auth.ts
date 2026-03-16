
import type { APIRequestContext } from '@playwright/test';
import { PASSWORD } from './constants';

export async function authHeadersFor(email: string, backend: APIRequestContext, password = PASSWORD) {
  const login = await backend.post('/auth/login', { data: { email, password } });
  if (!login.ok()) throw new Error(`Falha login backend: ${login.status()} ${await login.text()}`);
  const payload = await login.json();
  return { Authorization: `Bearer ${payload.access_token}` };
}
