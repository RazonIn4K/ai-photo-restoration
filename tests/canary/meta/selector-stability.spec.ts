import { test, expect } from '@playwright/test';

import { resolveWithFallback } from '../../../src/canary/resilient-selector.js';
import { CriticalSelectorSet, SelectorPages } from '../../../src/canary/selectors.js';
import { getBaseUrl, skipIfMissingEnv } from '../utils/canary-env.js';

skipIfMissingEnv(['CANARY_BASE_URL'], 'Selector stability suite');

const BASE_URL = getBaseUrl();

test.describe('Canary: Selector stability', () => {
  for (const pageDefinition of SelectorPages) {
    test(`selectors resolve on ${pageDefinition.urlPath}`, async ({ page }) => {
      await page.goto(`${BASE_URL}${pageDefinition.urlPath}`, { waitUntil: 'networkidle' });

      let failures = 0;
      const missingCritical: string[] = [];

      for (const selector of pageDefinition.selectors) {
        const isCritical = pageDefinition.critical || CriticalSelectorSet.has(selector);
        const locator = await resolveWithFallback(page, selector, {
          allowFallback: true,
          critical: isCritical
        });

        if (!locator) {
          failures += 1;
          if (isCritical) {
            missingCritical.push(selector);
          }
        }
      }

      const failureRate = failures / pageDefinition.selectors.length;
      const threshold = pageDefinition.critical ? 0.05 : 0.2;
      expect(failureRate).toBeLessThan(threshold);
      expect(missingCritical.length).toBe(0);
    });
  }
});
