
import { test, expect, getUserInvitationUrl } from '../fixtures/auth';
import { authHeadersFor } from '../utils/backend-auth';

async function createInvoice(backend: any, headers: any) {
  const subRes = await backend.get('/billing/subscription', { headers });
  const sub = await subRes.json();
  return backend.post('/billing/invoices/dev-create', { headers, data: { amount_due: 29900, amount_paid: 29900, payment_status: 'paid', fiscal_status: 'ready_to_issue', subscription_id: sub.id } }).catch(() => null);
}

test.describe('Billing e plataforma', () => {
  test.use({ storageState: 'e2e/.auth/primary-admin.json' });
  test('billing carrega checkout, faturas e ações locais', async ({ page }) => {
    await page.goto('/billing');
    await expect(page.getByRole('heading', { name: /assinatura, faturamento e onboarding/i })).toBeVisible();
    await expect(page.getByText(/plano e pagamento/i)).toBeVisible();
    await expect(page.getByText(/faturas e documentos/i)).toBeVisible();
  });

  test.use({ storageState: 'e2e/.auth/platform-admin.json' });
  test('platform admin navega tenants, planos, assinaturas, financeiro e analytics', async ({ page }) => {
    await page.goto('/platform/tenants');
    await expect(page.getByRole('heading', { name: /tenants/i })).toBeVisible();
    await page.goto('/platform/planos');
    await expect(page.getByRole('heading', { name: /planos/i })).toBeVisible();
    await page.goto('/platform/assinaturas');
    await expect(page.getByRole('heading', { name: /assinaturas/i })).toBeVisible();
    await page.goto('/platform/finance');
    await expect(page.getByRole('heading', { name: /financeiro/i })).toBeVisible();
    await page.goto('/platform/analytics');
    await expect(page.getByRole('heading', { name: /analytics/i })).toBeVisible();
  });
});
