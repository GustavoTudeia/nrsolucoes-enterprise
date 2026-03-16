import { test, expect, issueEmployeeOtp, issueEmployeeMagicLink } from '../fixtures/auth';
import { authHeadersFor } from '../utils/backend-auth';
import { relativeAppUrl } from '../utils/form';

async function ensureTraining(backend: any, headers: any, unitId: string) {
  const contentRes = await backend.post('/lms/contents', {
    headers,
    data: {
      title: `Treinamento E2E ${Date.now()}`,
      description: 'Treinamento de validação automatizada',
      content_type: 'link',
      url: 'https://example.com/treinamento',
      duration_minutes: 5,
      is_platform_managed: false,
    },
  });
  const content = await contentRes.json();
  await backend.post('/lms/assignments', { headers, data: { content_item_id: content.id, org_unit_id: unitId } });
}

test.use({ storageState: 'e2e/.auth/primary-admin.json' });

test.describe('LMS e portal do colaborador', () => {
  test('atribui treinamento e acessa portal por OTP e magic link', async ({ page, backend, fixtureData }) => {
    const headers = await authHeadersFor(fixtureData.primary.admin.email, backend);
    await ensureTraining(backend, headers, fixtureData.primary.unit_id);

    await page.goto('/lms');
    await expect(page.getByRole('heading', { name: /lms/i })).toBeVisible();

    const otp = await issueEmployeeOtp(fixtureData.primary.tenant_id, fixtureData.primary.employee.identifier);
    await page.context().clearCookies();
    await page.goto(`/employee/${fixtureData.primary.slug}`);
    await page.getByPlaceholder(/email \/ cpf \/ id interno/i).fill(fixtureData.primary.employee.identifier);
    await page.getByRole('button', { name: /enviar código/i }).click();
    await page.getByPlaceholder(/123456/i).fill(otp.code);
    await page.getByRole('button', { name: /entrar/i }).click();
    await page.waitForURL(/employee\/dashboard/);
    await expect(page.getByRole('heading', { name: /portal do colaborador/i })).toBeVisible();
    await page.goto('/employee/treinamentos');
    await expect(page.getByRole('heading', { name: /treinamentos/i })).toBeVisible();

    const magic = await issueEmployeeMagicLink(fixtureData.primary.tenant_id, fixtureData.primary.employee.identifier);
    await page.context().clearCookies();
    await page.goto(relativeAppUrl(magic.url));
    await page.waitForURL(/employee\/dashboard/);
    await expect(page.getByText(/meu perfil|portal do colaborador/i)).toBeVisible();
  });
});
