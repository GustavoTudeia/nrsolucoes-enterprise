import { test, expect, getUserSecrets } from '../fixtures/auth';

const NEW_PASSWORD = 'NovaSenha123!';

test.describe('Autenticação pública e console', () => {
  test('signup público cria conta e direciona ao onboarding/billing', async ({ page, acceptAnalyticsIfPresent }) => {
    const seed = Date.now();
    await page.goto('/cadastre-se?plan=PRO');
    await acceptAnalyticsIfPresent();
    await page.getByPlaceholder(/metalúrgica exemplo/i).fill(`Empresa Signup ${seed}`);
    await page.getByPlaceholder(/minha-empresa/i).fill(`empresa-signup-${seed}`);
    await page.getByPlaceholder(/seu nome completo/i).fill('Admin Signup');
    await page.getByPlaceholder(/voce@empresa.com.br/i).fill(`signup+${seed}@nr-e2e.local`);
    await page.getByPlaceholder(/mínimo 8 caracteres/i).fill('StrongPass123!');
    await page.getByPlaceholder(/repita a senha/i).fill('StrongPass123!');
    await page.getByRole('button', { name: /criar conta/i }).click();
    await page.waitForURL(/onboarding|billing/);
    await expect(page).toHaveURL(/onboarding|billing/);
  });

  test('login por email e CPF, forgot/reset, OTP e magic link', async ({ page, fixtureData, acceptAnalyticsIfPresent }) => {
    const email = fixtureData.primary.admin.email;
    const cpf = fixtureData.primary.admin.cpf;

    await page.goto('/login');
    await acceptAnalyticsIfPresent();
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/^senha/i).fill('StrongPass123!');
    await page.getByRole('button', { name: /entrar/i }).click();
    await page.waitForURL(/dashboard|onboarding|billing/);

    await page.context().clearCookies();
    await page.goto('/login');
    await page.getByRole('button', { name: /^cpf$/i }).click();
    await page.getByLabel(/cpf/i).fill(cpf);
    await page.getByLabel(/^senha/i).fill('StrongPass123!');
    await page.getByRole('button', { name: /entrar/i }).click();
    await page.waitForURL(/dashboard|onboarding|billing/);

    await page.context().clearCookies();
    await page.goto('/esqueci-senha');
    await page.getByLabel(/email/i).fill(email);
    await page.getByRole('button', { name: /enviar instruções/i }).click();
    const secrets = await getUserSecrets(email);
    await page.goto(`/resetar-senha?token=${secrets.password_reset_token}`);
    await page.getByLabel(/nova senha/i).fill(NEW_PASSWORD);
    await page.getByLabel(/confirmar nova senha/i).fill(NEW_PASSWORD);
    await page.getByRole('button', { name: /redefinir senha/i }).click();
    await expect(page.getByText(/senha redefinida|sucesso/i)).toBeVisible();

    await page.goto('/login');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/^senha/i).fill(NEW_PASSWORD);
    await page.getByRole('button', { name: /entrar/i }).click();
    await page.waitForURL(/dashboard|onboarding|billing/);

    await page.context().clearCookies();
    await page.goto('/login');
    await page.getByRole('button', { name: /código/i }).click();
    await page.getByLabel(/email/i).fill(email);
    await page.getByRole('button', { name: /enviar código/i }).click();
    const otpSecrets = await getUserSecrets(email);
    await page.getByLabel(/código/i).fill(otpSecrets.otp_code || '');
    await page.getByRole('button', { name: /validar|entrar/i }).click();
    await page.waitForURL(/dashboard|onboarding|billing/);

    await page.context().clearCookies();
    await page.goto('/magic-login');
    await page.getByLabel(/cpf ou email/i).fill(email);
    await page.getByRole('button', { name: /enviar link de acesso/i }).click();
    const magicSecrets = await getUserSecrets(email);
    await page.goto(`/magic-login?token=${magicSecrets.magic_link_token}`);
    await page.waitForURL(/dashboard|onboarding|billing/);
  });
});
