import { test, expect } from '@playwright/test';

import { Selectors } from '../../../src/canary/selectors.js';
import { getBaseUrl, getStorageStatePath, skipIfMissingEnv } from '../utils/canary-env.js';

skipIfMissingEnv(['CANARY_BASE_URL'], 'Navigation smoke suite');

const BASE_URL = getBaseUrl();
const storageStatePath = getStorageStatePath();

if (!storageStatePath) {
  test.skip(true, 'Navigation canary requires a recorded storage state.');
}

test.use({ storageState: storageStatePath });

test.describe('Canary: Primary navigation', () => {
  test('top navigation renders core links', async ({ page }) => {
    await page.goto(`${BASE_URL}/home`, { waitUntil: 'networkidle' });

    await expect(page.locator(Selectors.nav.home)).toBeVisible();
    await expect(page.locator(Selectors.nav.notifications)).toBeVisible();
    await expect(page.locator(Selectors.nav.profileMenu)).toBeVisible();
  });

  test('search input accepts text', async ({ page }) => {
    await page.goto(`${BASE_URL}/home`, { waitUntil: 'networkidle' });

    const searchInput = page.locator(Selectors.nav.searchInput);
    await expect(searchInput).toBeVisible();
    await searchInput.fill('test search');
    await expect(searchInput).toHaveValue('test search');
  });
});
