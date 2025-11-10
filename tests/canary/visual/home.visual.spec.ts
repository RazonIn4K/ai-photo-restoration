import { test, expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { getBaseUrl, getStorageStatePath, skipIfMissingEnv } from '../utils/canary-env.js';

skipIfMissingEnv(['CANARY_BASE_URL'], 'Visual baseline suite');

const BASE_URL = getBaseUrl();
const storageStatePath = getStorageStatePath();

if (!storageStatePath) {
  test.skip(true, 'Visual canary requires a recorded storage state.');
}

const baselinePath = resolve('tests/canary/visual/baseline/home-baseline.png');
if (!existsSync(baselinePath)) {
  test.skip(
    true,
    'Create tests/canary/visual/baseline/home-baseline.png before running visual canaries.'
  );
}

test.use({ storageState: storageStatePath });

test.describe('Canary: Home visual baseline', () => {
  test('home experience matches baseline', async ({ page }) => {
    await page.goto(`${BASE_URL}/home`, { waitUntil: 'networkidle' });
    await page.setViewportSize({ width: 1280, height: 720 });

    await expect(page).toHaveScreenshot('home-baseline.png', {
      threshold: 0.2,
      maxDiffPixelRatio: 0.01,
      maxDiffPixels: 5_000
    });
  });
});
