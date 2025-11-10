import type { Locator, Page } from '@playwright/test';

export interface FallbackConfig {
  allowFallback?: boolean;
  critical?: boolean;
  contextSelector?: string;
}

interface FallbackStrategy {
  name: string;
  match: (selector: string) => boolean;
  resolve: (page: Page) => Locator;
}

const fallbackStrategies: FallbackStrategy[] = [
  {
    name: 'login-submit-role',
    match: selector => selector.includes('login-submit'),
    resolve: page => page.getByRole('button', { name: /log in|sign in/i })
  },
  {
    name: 'composer-submit-role',
    match: selector => selector.includes('composer-submit'),
    resolve: page => page.getByRole('button', { name: /post|share/i })
  },
  {
    name: 'nav-home-link-role',
    match: selector => selector.includes('nav-home-link'),
    resolve: page => page.getByRole('link', { name: /home/i })
  },
  {
    name: 'notifications-icon-aria',
    match: selector => selector.includes('notifications'),
    resolve: page => page.getByRole('button', { name: /notifications/i })
  }
];

/**
 * Attempt to resolve a selector. Optionally falls back to semantic locators when the
 * primary selector fails, and emits structured JSON logs for observability.
 */
export async function resolveWithFallback(
  page: Page,
  primarySelector: string,
  config: FallbackConfig = {}
): Promise<Locator | null> {
  const { allowFallback = false, critical = false, contextSelector } = config;

  const context: Locator | Page = contextSelector ? page.locator(contextSelector) : page;
  const target = context.locator(primarySelector).first();

  if ((await target.count()) === 1 && (await target.isVisible())) {
    return target;
  }

  logCanary({
    level: 'warn',
    type: 'selector_primary_miss',
    selector: primarySelector,
    critical
  });

  if (!allowFallback) {
    return null;
  }

  for (const strategy of fallbackStrategies) {
    if (!strategy.match(primarySelector)) {
      continue;
    }

    const candidate = strategy.resolve(page).first();
    if ((await candidate.count()) === 1 && (await candidate.isVisible())) {
      logCanary({
        level: critical ? 'error' : 'info',
        type: 'selector_fallback_used',
        selector: primarySelector,
        fallback: strategy.name,
        critical
      });
      return candidate;
    }
  }

  logCanary({
    level: critical ? 'error' : 'warn',
    type: 'selector_resolution_failed',
    selector: primarySelector,
    critical
  });

  return null;
}

interface CanaryLogEvent {
  level: 'info' | 'warn' | 'error';
  type: string;
  selector: string;
  fallback?: string;
  critical?: boolean;
}

function logCanary(event: CanaryLogEvent) {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      component: 'ui-canary',
      ...event
    })
  );
}
