import { test, expect } from '../fixtures/auth';
import { fillByLabel, selectNativeByLabel } from '../utils/form';

test.use({ storageState: 'e2e/.auth/primary-admin.json' });

test.describe('Onboarding, billing e estrutura organizacional', () => {
  test('completa perfil de faturamento e navega no onboarding', async ({ page }) => {
    await page.goto('/onboarding');
    await expect(page.getByRole('heading', { name: /onboarding/i })).toBeVisible();
    await page.getByRole('link', { name: /abrir|revisar/i }).first().click();
    await page.waitForURL(/billing|org\//);

    await page.goto('/billing');
    await expect(page.getByRole('heading', { name: /assinatura, faturamento e onboarding/i })).toBeVisible();
    await fillByLabel(page, /razão social/i, 'Empresa Enterprise E2E Atualizada');
    await fillByLabel(page, /^cnpj/i, '00.000.000/0001-91');
    await fillByLabel(page, /email financeiro/i, 'financeiro@nr-e2e.local');
    await fillByLabel(page, /logradouro/i, 'Avenida Central');
    await fillByLabel(page, /número/i, '100');
    await fillByLabel(page, /bairro/i, 'Centro');
    await fillByLabel(page, /cidade/i, 'São Paulo');
    await fillByLabel(page, /^uf/i, 'SP');
    await fillByLabel(page, /cep/i, '01000-000');
    await page.getByRole('button', { name: /salvar perfil/i }).click();
    await expect(page.getByText(/perfil de faturamento completo|perfil de faturamento salvo/i)).toBeVisible();
  });

  test('cadastra CNPJ, valida erro e cria unidade/setor', async ({ page }) => {
    await page.goto('/org/cnpjs');
    await expect(page.getByRole('heading', { name: /CNPJs/i })).toBeVisible();
    await page.getByRole('button', { name: /novo cnpj|cadastrar cnpj|adicionar/i }).click();
    await fillByLabel(page, /razão social/i, 'CNPJ inválido');
    await fillByLabel(page, /^cnpj$/i, '12');
    await expect(page.getByText(/CNPJ inválido/i)).toBeVisible();

    await fillByLabel(page, /razão social/i, 'Filial E2E');
    await fillByLabel(page, /^cnpj$/i, '11.444.777/0001-61');
    await page.getByRole('button', { name: /salvar|cadastrar/i }).click();
    await expect(page.getByText(/CNPJ cadastrado|CNPJ atualizado|Filial E2E/i)).toBeVisible();

    await page.goto('/org/unidades');
    await expect(page.getByRole('heading', { name: /setores \/ unidades|unidades/i })).toBeVisible();
    await page.getByRole('button', { name: /nova unidade|adicionar/i }).click();
    await fillByLabel(page, /^nome$/i, 'Matriz Teste');
    await selectNativeByLabel(page, /tipo/i, 'unit');
    await page.getByRole('button', { name: /criar|salvar|cadastrar/i }).click();
    await expect(page.getByText(/Matriz Teste/i)).toBeVisible();
  });
});
