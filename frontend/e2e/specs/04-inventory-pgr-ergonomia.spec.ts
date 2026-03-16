import { test, expect } from '../fixtures/auth';
import { chooseSelectOption, fillByLabel } from '../utils/form';

test.use({ storageState: 'e2e/.auth/primary-admin.json' });

test.describe('Inventário NR-1, PGR e ergonomia', () => {
  test('cria item de inventário, aprova e formaliza versão', async ({ page }) => {
    await page.goto('/inventario');
    await expect(page.getByRole('heading', { name: /inventário nr-1/i })).toBeVisible();
    await chooseSelectOption(page, /^cnpj$/i, /\d{14}|empresa/i);
    await chooseSelectOption(page, /grupo de perigo/i, /Ergonômicos/i);
    await fillByLabel(page, /processo/i, 'Administrativo');
    await fillByLabel(page, /atividade/i, 'Trabalho com computador');
    await fillByLabel(page, /função\/posto/i, 'Assistente Administrativo');
    await fillByLabel(page, /perigo\/risco/i, 'Postura inadequada e repetitividade');
    await fillByLabel(page, /fonte\/circunstância/i, 'Uso contínuo de notebook sem ajuste ergonômico');
    await fillByLabel(page, /dano possível/i, 'LER/DORT e fadiga muscular');
    await page.getByRole('button', { name: /salvar item/i }).click();
    await expect(page.getByText(/item criado|postura inadequada/i)).toBeVisible();
    await page.getByRole('button', { name: /aprovar/i }).first().click();
    await expect(page.getByText(/item aprovado|approved/i)).toBeVisible();

    const approvalCnpjField = page.locator('label').filter({ hasText: /^CNPJ$/i }).nth(1).locator('xpath=..');
    await approvalCnpjField.locator('button,[role="combobox"]').first().click();
    await page.getByRole('option', { name: /\d{14}|empresa/i }).first().click();
    await fillByLabel(page, /versão/i, `PGR-${Date.now()}`);
    await fillByLabel(page, /observações/i, 'Formalização de teste E2E');
    await page.getByRole('button', { name: /formalizar versão/i }).click();
    await expect(page.getByText(/versão formal criada|formalização/i)).toBeVisible();
  });

  test('registra AEP/AET e aprova avaliação', async ({ page }) => {
    await page.goto('/ergonomia');
    await expect(page.getByRole('heading', { name: /aep \/ aet/i })).toBeVisible();
    await chooseSelectOption(page, /^cnpj$/i, /\d{14}|empresa/i);
    await chooseSelectOption(page, /tipo/i, /AEP/i);
    await fillByLabel(page, /título/i, 'AEP Posto Administrativo');
    await fillByLabel(page, /processo/i, 'Administrativo');
    await fillByLabel(page, /atividade/i, 'Digitação e análise');
    await fillByLabel(page, /função\/posto/i, 'Assistente Administrativo');
    await fillByLabel(page, /posto\/estação/i, 'Mesa 1');
    await fillByLabel(page, /resumo da demanda/i, 'Queixas de desconforto em ombros e punhos');
    await fillByLabel(page, /condições observadas/i, 'Monitor baixo e cadeira sem ajuste');
    await page.getByRole('button', { name: /salvar avaliação/i }).click();
    await expect(page.getByText(/avaliação criada|AEP Posto Administrativo/i)).toBeVisible();
    await page.getByRole('button', { name: /aprovar/i }).first().click();
    await expect(page.getByText(/avaliação aprovada|approved/i)).toBeVisible();
  });
});
