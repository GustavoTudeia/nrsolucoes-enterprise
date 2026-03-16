import { test, expect, getUserInvitationUrl } from '../fixtures/auth';
import { authHeadersFor } from '../utils/backend-auth';
import { fillByLabel, relativeAppUrl } from '../utils/form';

const invitedEmail = `invitee-${Date.now()}@nr-e2e.local`;

test.describe('RBAC, convites e módulos finais', () => {
  test.use({ storageState: 'e2e/.auth/primary-admin.json' });
  test('cria convite de usuário, aceita convite e navega módulos enterprise', async ({ page, backend, fixtureData }) => {
    const headers = await authHeadersFor(fixtureData.primary.admin.email, backend);
    const createInv = await backend.post('/invitations', {
      headers,
      data: { email: invitedEmail, full_name: 'Usuário Convidado', role_key: 'TENANT_AUDITOR', expires_days: 7 },
    });
    expect(createInv.ok()).toBeTruthy();
    const invite = await getUserInvitationUrl(fixtureData.primary.tenant_id, invitedEmail);

    await page.context().clearCookies();
    await page.goto(relativeAppUrl(invite.url));
    await expect(page.getByText(/criar sua conta|usuário convidado/i)).toBeVisible();
    await fillByLabel(page, /nome completo/i, 'Usuário Convidado');
    await fillByLabel(page, /cpf/i, '111.444.777-35');
    await fillByLabel(page, /telefone/i, '(11) 99999-0000');
    await fillByLabel(page, /^senha/i, 'StrongPass123!');
    await fillByLabel(page, /confirmar senha/i, 'StrongPass123!');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: /aceitar convite|criar acesso/i }).click();
    await page.waitForURL(/dashboard|onboarding|billing/);

    await page.goto('/esocial');
    await expect(page.getByRole('heading', { name: /eSocial/i })).toBeVisible();
    await page.goto('/auditoria');
    await expect(page.getByRole('heading', { name: /trilha de auditoria|auditoria/i })).toBeVisible();
    await page.goto('/settings/perfil');
    await expect(page.getByRole('heading', { name: /perfil|meu perfil/i })).toBeVisible();
    await page.goto('/help');
    await expect(page.getByRole('heading', { name: /ajuda|central de ajuda/i })).toBeVisible();
  });

  test.use({ storageState: 'e2e/.auth/secondary-admin.json' });
  test('feature gate oculta módulos enterprise no plano START', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('link', { name: /inventário nr-1/i })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /eSocial SST/i })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /auditoria/i })).toHaveCount(0);
  });
});
