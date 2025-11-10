import { test, expect } from '@playwright/test';

import { Selectors } from '../../../src/canary/selectors.js';
import { getBaseUrl, skipIfMissingEnv } from '../utils/canary-env.js';

skipIfMissingEnv(['CANARY_BASE_URL'], 'Login smoke suite');

const BASE_URL = getBaseUrl();

test.describe('Canary: Login UI', () => {
  test('renders login form with critical elements', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });

    await expect(page.locator(Selectors.login.emailInput)).toBeVisible();
    await expect(page.locator(Selectors.login.passwordInput)).toBeVisible();
    await expect(page.locator(Selectors.login.submitButton)).toBeEnabled();
  });

  test('allows login with canary test account', async ({ page }) => {
    skipIfMissingEnv(['CANARY_USER_EMAIL', 'CANARY_USER_PASSWORD'], 'Authenticated login flow');

    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });

    await page.fill(Selectors.login.emailInput, process.env.CANARY_USER_EMAIL!);
    await page.fill(Selectors.login.passwordInput, process.env.CANARY_USER_PASSWORD!);
    await page.click(Selectors.login.submitButton);

    await page.waitForURL(/\/home/, { timeout: 10_000 });
    await expect(page.locator(Selectors.nav.home)).toBeVisible();
  });
});
