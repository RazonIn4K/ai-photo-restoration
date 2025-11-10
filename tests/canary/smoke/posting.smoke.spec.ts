import { test, expect } from '@playwright/test';

import { Selectors } from '../../../src/canary/selectors.js';
import { getBaseUrl, getStorageStatePath, skipIfMissingEnv } from '../utils/canary-env.js';

skipIfMissingEnv(['CANARY_BASE_URL'], 'Posting smoke suite');

const BASE_URL = getBaseUrl();
const storageStatePath = getStorageStatePath();

if (!storageStatePath) {
  test.skip(true, 'Posting canary requires a recorded storage state.');
}

test.use({ storageState: storageStatePath });

test.describe('Canary: Posting Flow', () => {
  test('user can submit a lightweight canary post', async ({ page }) => {
    await page.goto(`${BASE_URL}/home`, { waitUntil: 'networkidle' });

    const composer = page.locator(Selectors.composer.input);
    await expect(composer).toBeVisible();
    await composer.click();
    const payload = `[CANARY] automated UI canary post - ${new Date().toISOString()}`;
    await composer.fill(payload);

    const submit = page.locator(Selectors.composer.submit);
    await expect(submit).toBeEnabled();
    await submit.click();

    const firstPost = page.locator(Selectors.feed.postContainer).first();
    await expect(firstPost).toContainText('[CANARY] automated UI canary post');
  });
});
