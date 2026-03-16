
import { test, expect } from '../fixtures/auth';

test.describe('Smokes operacionais via Playwright API', () => {
  test('health, ready e metrics respondem', async ({ backend }) => {
    const health = await backend.get('/health');
    expect(health.ok()).toBeTruthy();
    const ready = await backend.get('/ready');
    expect(ready.ok()).toBeTruthy();
    const metrics = await backend.get('/metrics');
    expect(metrics.ok()).toBeTruthy();
    const body = await metrics.text();
    expect(body).toContain('http_requests_total');
  });
});
