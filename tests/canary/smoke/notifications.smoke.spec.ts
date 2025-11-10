import { test, expect } from '@playwright/test';

import { Selectors } from '../../../src/canary/selectors.js';
import { getBaseUrl, getStorageStatePath, skipIfMissingEnv } from '../utils/canary-env.js';

skipIfMissingEnv(['CANARY_BASE_URL'], 'Notifications smoke suite');

const BASE_URL = getBaseUrl();
const storageStatePath = getStorageStatePath();

if (!storageStatePath) {
  test.skip(true, 'Notifications canary requires a recorded storage state.');
}

test.use({ storageState: storageStatePath });

test.describe('Canary: Notifications', () => {
  test('notifications dropdown opens and renders list', async ({ page }) => {
    await page.goto(`${BASE_URL}/home`, { waitUntil: 'networkidle' });

    const icon = page.locator(Selectors.notifications.icon);
    await expect(icon).toBeVisible();
    await icon.click();

    const dropdown = page.locator(Selectors.notifications.dropdown);
    await expect(dropdown).toBeVisible();
    await expect(page.locator(Selectors.notifications.listItem).first()).toBeVisible();
  });
});
