import { test } from '@playwright/test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export function skipIfMissingEnv(vars: string[], scope: string) {
  const missing = vars.filter(name => !process.env[name]);
  if (missing.length > 0) {
    test.skip(true, `${scope} canary requires env vars: ${missing.join(', ')}`);
  }
}

export function getBaseUrl(): string {
  return process.env.CANARY_BASE_URL ?? 'https://www.facebook.com';
}

export function getStorageStatePath(): string | undefined {
  const explicitPath = process.env.CANARY_STORAGE_STATE;
  const fallback = resolve('tests/canary/storageState/canary-user.json');
  const candidate = explicitPath ? resolve(explicitPath) : fallback;
  return existsSync(candidate) ? candidate : undefined;
}
