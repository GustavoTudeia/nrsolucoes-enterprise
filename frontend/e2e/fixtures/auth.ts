
import { test as base, expect, request, type APIRequestContext, type BrowserContext } from '@playwright/test';
import fs from 'fs/promises';
import path from 'path';
import { API_URL, PASSWORD } from '../utils/constants';
import { bootstrapFixture, getUserSecrets, getUserInvitationUrl, issueEmployeeMagicLink, issueEmployeeOtp, loginConsole, loginConsoleCpf } from '../utils/test-support';

export type E2EFixture = Awaited<ReturnType<typeof bootstrapFixture>>;

type Fixtures = {
  fixtureData: E2EFixture;
  backend: APIRequestContext;
  loginAsPrimaryAdmin: () => Promise<void>;
  loginAsSecondaryAdmin: () => Promise<void>;
  loginAsPlatformAdmin: () => Promise<void>;
  acceptAnalyticsIfPresent: () => Promise<void>;
};

const stateDir = path.resolve(__dirname, '..', '.auth');
const fixturePath = path.resolve(stateDir, 'fixture.json');

export const test = base.extend<Fixtures>({
  fixtureData: async ({}, use) => {
    const raw = await fs.readFile(fixturePath, 'utf-8');
    await use(JSON.parse(raw));
  },
  backend: async ({}, use) => {
    const ctx = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { 'Content-Type': 'application/json' }, ignoreHTTPSErrors: true });
    await use(ctx);
    await ctx.dispose();
  },
  loginAsPrimaryAdmin: async ({ page, fixtureData }, use) => {
    await use(async () => {
      await page.goto('/login');
      await page.getByRole('button', { name: /aceitar analytics/i }).click({ timeout: 3000 }).catch(() => {});
      await page.getByLabel(/email/i).fill(fixtureData.primary.admin.email);
      await page.getByLabel(/^senha/i).fill(PASSWORD);
      await page.getByRole('button', { name: /entrar/i }).click();
      await page.waitForURL(/dashboard|onboarding|billing/);
    });
  },
  loginAsSecondaryAdmin: async ({ page, fixtureData }, use) => {
    await use(async () => {
      await page.goto('/login');
      await page.getByRole('button', { name: /aceitar analytics/i }).click({ timeout: 3000 }).catch(() => {});
      await page.getByLabel(/email/i).fill(fixtureData.secondary.admin.email);
      await page.getByLabel(/^senha/i).fill(PASSWORD);
      await page.getByRole('button', { name: /entrar/i }).click();
      await page.waitForURL(/dashboard|onboarding|billing/);
    });
  },
  loginAsPlatformAdmin: async ({ page, fixtureData }, use) => {
    await use(async () => {
      await page.goto('/login');
      await page.getByRole('button', { name: /aceitar analytics/i }).click({ timeout: 3000 }).catch(() => {});
      await page.getByLabel(/email/i).fill(fixtureData.platform_admin.email);
      await page.getByLabel(/^senha/i).fill(PASSWORD);
      await page.getByRole('button', { name: /entrar/i }).click();
      await page.waitForURL(/dashboard|platform/);
    });
  },
  acceptAnalyticsIfPresent: async ({ page }, use) => {
    await use(async () => {
      await page.getByRole('button', { name: /aceitar analytics/i }).click({ timeout: 3000 }).catch(() => {});
    });
  },
});

export { expect, getUserSecrets, getUserInvitationUrl, issueEmployeeOtp, issueEmployeeMagicLink, loginConsole, loginConsoleCpf };
