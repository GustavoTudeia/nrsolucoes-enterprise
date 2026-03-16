
import { test, expect } from '../fixtures/auth';

test.describe('Public site', () => {
  test('renderiza home, planos, contato e páginas legais', async ({ page, acceptAnalyticsIfPresent }) => {
    await page.goto('/');
    await acceptAnalyticsIfPresent();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.getByRole('link', { name: /planos/i }).click();
    await expect(page).toHaveURL(/planos/);
    await expect(page.getByRole('heading', { name: /planos/i })).toBeVisible();
    await page.goto('/contato');
    await expect(page.getByRole('heading', { name: /contato|fale conosco/i })).toBeVisible();
    await page.goto('/termos');
    await expect(page.getByRole('heading', { name: /termos/i })).toBeVisible();
    await page.goto('/privacidade');
    await expect(page.getByRole('heading', { name: /privacidade/i })).toBeVisible();
  });
});
