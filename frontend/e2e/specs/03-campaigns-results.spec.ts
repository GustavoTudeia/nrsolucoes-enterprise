import { test, expect } from '../fixtures/auth';
import { authHeadersFor } from '../utils/backend-auth';
import { relativeAppUrl } from '../utils/form';

async function getPublishedQuestionnaireVersionId(backend: any, headers: any) {
  const templatesRes = await backend.get('/questionnaires/templates?limit=200&offset=0', { headers });
  const templates = await templatesRes.json();
  const target = templates.items.find((t: any) => t.key === 'NR1_GRO_PGR_DIAGNOSTICO') || templates.items[0];
  const versionsRes = await backend.get(`/questionnaires/templates/${target.id}/versions?limit=200&offset=0`, { headers });
  const versions = await versionsRes.json();
  return versions.items.find((v: any) => v.status === 'published')?.id || versions.items[0]?.id;
}

test.use({ storageState: 'e2e/.auth/primary-admin.json' });

test.describe('Campanhas, convites e resultados', () => {
  test('cria campanha, gera convites tokenizados, responde pesquisa e consulta resultados', async ({ page, backend, fixtureData }) => {
    const headers = await authHeadersFor(fixtureData.primary.admin.email, backend);
    const questionnaireVersionId = await getPublishedQuestionnaireVersionId(backend, headers);

    const createRes = await backend.post('/campaigns', {
      headers,
      data: {
        name: `Campanha E2E ${Date.now()}`,
        cnpj_id: fixtureData.primary.cnpj_id,
        org_unit_id: fixtureData.primary.unit_id,
        questionnaire_version_id: questionnaireVersionId,
        require_invitation: true,
      },
    });
    expect(createRes.ok()).toBeTruthy();
    const campaign = await createRes.json();

    const openRes = await backend.post(`/campaigns/${campaign.id}/open`, { headers });
    expect(openRes.ok()).toBeTruthy();

    const generateRes = await backend.post(`/campaigns/${campaign.id}/invitations/generate`, {
      headers,
      data: { employee_ids: [], org_unit_id: fixtureData.primary.unit_id, expires_in_days: 7, send_email: false },
    });
    expect(generateRes.ok()).toBeTruthy();
    const invitationData = await generateRes.json();
    const surveyUrl = invitationData.invitations[0].survey_url;

    await page.goto('/campanhas');
    await expect(page.getByRole('heading', { name: /campanhas/i })).toBeVisible();
    await expect(page.getByText(campaign.name)).toBeVisible();

    await page.goto(relativeAppUrl(surveyUrl));
    await expect(page.getByRole('heading', { name: /pesquisa|questionário/i })).toBeVisible();
    const radios = page.locator('input[type="radio"]');
    const count = await radios.count();
    for (let i = 0; i < count; i += 5) {
      await radios.nth(i).check();
    }
    await page.getByRole('button', { name: /enviar/i }).click();
    await expect(page.getByText(/resposta registrada|obrigado|sucesso/i)).toBeVisible();

    await page.goto('/resultados');
    await expect(page.getByRole('heading', { name: /resultados/i })).toBeVisible();
    await page.goto('/relatorios');
    await expect(page.getByRole('heading', { name: /relatórios/i })).toBeVisible();
  });
});
