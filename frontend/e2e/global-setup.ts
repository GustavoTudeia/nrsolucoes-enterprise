
import fs from 'fs/promises';
import path from 'path';
import type { FullConfig } from '@playwright/test';
import { bootstrapFixture, createStorageState } from './utils/test-support';

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

export default async function globalSetup(_config: FullConfig) {
  const authDir = path.resolve(__dirname, '.auth');
  await ensureDir(authDir);

  const fixture = await bootstrapFixture(process.env.E2E_NAMESPACE);
  await fs.writeFile(path.join(authDir, 'fixture.json'), JSON.stringify(fixture, null, 2), 'utf-8');

  const primaryState = await createStorageState(fixture.primary.admin.email);
  const secondaryState = await createStorageState(fixture.secondary.admin.email);
  const platformState = await createStorageState(fixture.platform_admin.email);

  await fs.writeFile(path.join(authDir, 'primary-admin.json'), JSON.stringify(primaryState, null, 2), 'utf-8');
  await fs.writeFile(path.join(authDir, 'secondary-admin.json'), JSON.stringify(secondaryState, null, 2), 'utf-8');
  await fs.writeFile(path.join(authDir, 'platform-admin.json'), JSON.stringify(platformState, null, 2), 'utf-8');
}
