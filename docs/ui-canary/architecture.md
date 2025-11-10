# UI Canary System Architecture

**Last Updated**: 2025-11-10
**Status**: 📋 **Documentation for Planned Implementation (Task 7.2)**

> **Note**: This document describes the design for the UI canary system to be implemented in Task 7.2. All file paths and references below represent planned code structure, not existing files.

---

## Overview

The UI Canary system provides **automated resilience testing** for Facebook UI selectors used in the assisted ingestion service. It validates that Playwright-based scraping can reliably detect restoration requests despite Facebook's frequent UI changes.

### Key Components (Planned - Task 7.2)

1. **Selector Contracts** (`src/canary/selectors.ts` - *to be created*) - Versioned, contract-based selectors
2. **Resilient Resolver** (`src/canary/resolver.ts` - *to be created*) - Fallback chain for selector failures
3. **Playwright Test Suites** (`tests/canary/*.spec.ts` - *to be created*) - Smoke tests and UI validation
4. **CI Integration** (`.github/workflows/canary-*.yml` - *to be created*) - PR, post-deploy, and scheduled checks
5. **Storage State Management** (`.auth/facebook.json` - *to be created*) - Authenticated session snapshots for testing

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     UI Canary System Flow                         │
└─────────────────────────────────────────────────────────────────┘

  ┌──────────────┐        ┌──────────────┐        ┌──────────────┐
  │  Selector    │───────▶│  Resilient   │───────▶│  Playwright  │
  │  Contracts   │        │  Resolver    │        │  Test Suite  │
  │  (versioned) │        │  (fallback)  │        │  (smoke)     │
  └──────────────┘        └──────────────┘        └──────────────┘
         │                       │                        │
         │                       │                        │
         ▼                       ▼                        ▼
  ┌──────────────────────────────────────────────────────────────┐
  │              CI Workflow Triggers                              │
  ├──────────────────────────────────────────────────────────────┤
  │  • PR Check: Quick smoke test (3 selectors)                   │
  │  • Post-Deploy: Full suite after main merge                   │
  │  • Scheduled: Nightly run with visual regression              │
  └──────────────────────────────────────────────────────────────┘
         │
         ▼
  ┌──────────────────────────────────────────────────────────────┐
  │              Eligibility Gating (Fork/Secrets)                 │
  ├──────────────────────────────────────────────────────────────┤
  │  if: github.event.pull_request.head.repo.fork == false &&     │
  │      vars.CANARY_ENABLED == 'true'                            │
  └──────────────────────────────────────────────────────────────┘
```

---

## 1. Selector Contracts

**File**: `src/canary/selectors.ts` (*to be created - Task 7.2*)

### Purpose
Provide **versioned, contract-based selectors** for Facebook UI elements with built-in fallback chains.

### Structure

```typescript
export interface SelectorContract {
  name: string;                    // Human-readable identifier
  version: string;                 // Semantic version (e.g., "2.1.0")
  primary: string;                 // Primary CSS/XPath selector
  fallbacks: string[];             // Ordered fallback selectors
  validUntil?: Date;               // Optional deprecation date
  context?: string;                // Usage context (e.g., "post-container")
}

export interface GroupConfig {
  groupId: string;
  selectors: VersionedSelectors;
  canarySchedule: string;          // Cron expression
}

export interface VersionedSelectors {
  version: string;
  effectiveDate: Date;
  contracts: {
    postContainer: SelectorContract;
    authorName: SelectorContract;
    postContent: SelectorContract;
    postImages: SelectorContract;
    postTimestamp: SelectorContract;
  };
}
```

### Example Contract

```typescript
export const DEFAULT_SELECTORS: VersionedSelectors = {
  version: "1.0.0",
  effectiveDate: new Date("2025-11-01"),
  contracts: {
    postContainer: {
      name: "post-container",
      version: "1.0.0",
      primary: '[data-pagelet*="FeedUnit"]',
      fallbacks: [
        '[role="article"]',
        '.userContentWrapper',
        'div[data-ad-preview="message"]'
      ]
    },
    authorName: {
      name: "author-name",
      version: "1.0.0",
      primary: 'a[aria-label*="profile"] > strong',
      fallbacks: [
        'span.actor > a',
        'h4 a[data-hovercard-prefer-more-content-show]'
      ]
    },
    // ... additional contracts
  }
};
```

### Versioning Strategy

- **MAJOR**: Breaking changes requiring code updates
- **MINOR**: New selectors added, old ones deprecated
- **PATCH**: Fallback adjustments, metadata updates

---

## 2. Resilient Resolver

**File**: `src/canary/resolver.ts` (*to be created - Task 7.2*)

### Purpose
Implement **automatic fallback** when primary selectors fail, with telemetry for tracking degradation.

### Core Function

```typescript
export class SelectorResolver {
  async resolve(
    page: Page,
    contract: SelectorContract,
    timeout: number = 5000
  ): Promise<ElementHandle | null> {

    // Try primary selector
    try {
      const element = await page.waitForSelector(contract.primary, { timeout });
      if (element) {
        this.logSuccess(contract.name, 'primary');
        return element;
      }
    } catch (err) {
      this.logFailure(contract.name, 'primary', err);
    }

    // Try fallbacks in order
    for (let i = 0; i < contract.fallbacks.length; i++) {
      try {
        const element = await page.waitForSelector(contract.fallbacks[i], { timeout });
        if (element) {
          this.logSuccess(contract.name, `fallback-${i}`);
          return element;
        }
      } catch (err) {
        this.logFailure(contract.name, `fallback-${i}`, err);
      }
    }

    // All selectors failed
    this.logCriticalFailure(contract.name);
    return null;
  }
}
```

### Telemetry

The resolver emits metrics to Prometheus:
- `canary_selector_resolution_total{name, type}` - Counter for success/failure
- `canary_selector_fallback_depth{name}` - Histogram of fallback depth used
- `canary_selector_failure_total{name}` - Counter for complete failures

---

## 3. Playwright Test Suites

**Files**: `tests/canary/*.spec.ts` (*to be created - Task 7.2*)

### Test Types

#### A. Smoke Tests (`tests/canary/smoke.spec.ts`)
**Purpose**: Fast validation that critical selectors resolve
**Runtime**: ~30 seconds
**Scope**: 3-5 critical selectors (post container, author, content)

```typescript
import { test, expect } from '@playwright/test';
import { DEFAULT_SELECTORS } from '@/canary/selectors';
import { SelectorResolver } from '@/canary/resolver';

test.describe('Facebook UI Smoke Tests', () => {
  test.use({ storageState: '.auth/facebook.json' });

  test('post-container selector resolves', async ({ page }) => {
    await page.goto('https://www.facebook.com/groups/TEST_GROUP_ID');

    const resolver = new SelectorResolver();
    const element = await resolver.resolve(
      page,
      DEFAULT_SELECTORS.contracts.postContainer
    );

    expect(element).not.toBeNull();
    expect(resolver.getUsedFallbackDepth()).toBe(0); // Primary worked
  });
});
```

#### B. Full Suite (`tests/canary/full.spec.ts`)
**Purpose**: Comprehensive selector validation + visual regression
**Runtime**: ~5 minutes
**Scope**: All selectors + screenshot comparison

#### C. Visual Regression (`tests/canary/visual.spec.ts`)
**Purpose**: Detect UI layout changes affecting scraping
**Runtime**: ~3 minutes
**Scope**: Screenshot baselines for key UI states

---

## 4. CI Integration

### Job Types

#### A. PR Checks (`.github/workflows/canary-pr.yml` - *to be created*)

**Trigger**: Pull requests to `main` or `develop`
**Runtime**: ~1 minute
**Scope**: Smoke tests only

```yaml
name: Canary PR Check

on:
  pull_request:
    branches: [main, develop]
    paths:
      - 'src/canary/**'
      - 'tests/canary/**'
      - '.github/workflows/canary-*.yml'

jobs:
  canary-smoke:
    runs-on: ubuntu-latest
    # Only run on non-fork PRs with secrets access
    if: |
      github.event.pull_request.head.repo.fork == false &&
      vars.CANARY_ENABLED == 'true'

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright
        run: npx playwright install --with-deps chromium

      - name: Restore storage state
        run: |
          mkdir -p .auth
          echo "${{ secrets.FACEBOOK_STORAGE_STATE }}" > .auth/facebook.json

      - name: Run smoke tests
        run: npx playwright test tests/canary/smoke.spec.ts
        env:
          TEST_GROUP_ID: ${{ secrets.FACEBOOK_TEST_GROUP_ID }}

      - name: Upload artifacts on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: canary-smoke-failures
          path: |
            test-results/
            playwright-report/
```

**Eligibility Gating**:
- `github.event.pull_request.head.repo.fork == false` - No forks (secrets unavailable)
- `vars.CANARY_ENABLED == 'true'` - Repository variable flag

#### B. Post-Deploy (`.github/workflows/canary-deploy.yml` - *to be created*)

**Trigger**: After merge to `main`
**Runtime**: ~5 minutes
**Scope**: Full test suite

```yaml
name: Canary Post-Deploy

on:
  push:
    branches: [main]

jobs:
  canary-full:
    runs-on: ubuntu-latest
    if: vars.CANARY_ENABLED == 'true'

    steps:
      # ... similar to PR check ...

      - name: Run full canary suite
        run: npx playwright test tests/canary/

      - name: Update visual baselines
        if: success()
        run: |
          npx playwright test --update-snapshots tests/canary/visual.spec.ts
          # Commit updated baselines back to repo
```

#### C. Scheduled (`.github/workflows/canary-scheduled.yml` - *to be created*)

**Trigger**: Nightly at 2 AM UTC (cron: `0 2 * * *`)
**Runtime**: ~10 minutes
**Scope**: Full suite + extended visual regression

```yaml
name: Canary Scheduled

on:
  schedule:
    - cron: '0 2 * * *'
  workflow_dispatch:  # Manual trigger option

jobs:
  canary-scheduled:
    runs-on: ubuntu-latest
    if: vars.CANARY_ENABLED == 'true'

    steps:
      # ... full test suite ...

      - name: Alert on failure
        if: failure()
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {
              "text": "🚨 Canary scheduled test failed",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "Nightly canary tests detected UI selector failures.\n*Action Required*: Review logs at ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}"
                  }
                }
              ]
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_ONCALL }}
```

---

## 5. Storage State Management

### Purpose
Maintain **authenticated Facebook sessions** without exposing credentials in code.

### Workflow

1. **Initial Auth** (Manual, local):
   ```bash
   npx playwright codegen --save-storage=.auth/facebook.json https://facebook.com
   # Login manually, then save session
   ```

2. **Store in GitHub Secrets**:
   - Navigate to repo Settings → Secrets → Actions
   - Add secret: `FACEBOOK_STORAGE_STATE` = contents of `.auth/facebook.json`

3. **Restore in CI**:
   ```yaml
   - name: Restore storage state
     run: |
       mkdir -p .auth
       echo "${{ secrets.FACEBOOK_STORAGE_STATE }}" > .auth/facebook.json
   ```

4. **Periodic Refresh** (every 30 days):
   - Manual login renewal to prevent session expiry
   - Update secret with new `facebook.json`

### Security Considerations

- Storage state contains **session cookies** - treat as sensitive
- Use repository secrets, never commit to git
- Rotate sessions quarterly or on suspected compromise
- Limit CI runs to non-fork PRs to prevent secret exposure

---

## Node 20 Requirement

All canary workflows use **Node.js 20** for consistency:

```yaml
- name: Setup Node.js
  uses: actions/setup-node@v4
  with:
    node-version: '20'
    cache: 'npm'
```

**Rationale**:
- Native fetch API improvements
- Better ESM support for Playwright
- Alignment with project's engine specification

---

## Contract Implications

### API Boundaries

The canary system exposes the following internal contracts:

1. **Selector Contract Schema** (`src/canary/selectors.ts`):
   - Must remain backwards-compatible for 90 days after version bump
   - Deprecation warnings logged when `validUntil` date approaches

2. **Resolver Interface** (`src/canary/resolver.ts`):
   - `resolve()` method signature is stable
   - Telemetry events follow OpenTelemetry conventions

3. **Test Fixtures** (`tests/canary/fixtures.ts`):
   - Storage state format follows Playwright spec
   - Custom fixtures (e.g., `authenticatedPage`) are versioned

### Canary Update Protocol

When Facebook UI changes:

1. **Detection**: Scheduled test fails with selector timeout
2. **Investigation**: Review Playwright trace artifacts
3. **Update**: Modify selectors in `src/canary/selectors.ts`
4. **Validation**: Run full suite locally
5. **Deployment**: PR with selector version bump
6. **Rollout**: Post-deploy test validates changes

See [how-to-update-selectors.md](./how-to-update-selectors.md) for detailed steps.

---

## Observability

### Metrics (Prometheus)

- `canary_test_duration_seconds{suite}` - Test runtime per suite
- `canary_selector_success_rate{name}` - % of successful resolutions
- `canary_fallback_usage{name, depth}` - Fallback depth distribution

### Logs (Pino)

```json
{
  "level": "warn",
  "msg": "Selector fallback used",
  "selector": "post-container",
  "version": "1.0.0",
  "fallback_depth": 2,
  "primary": "[data-pagelet*=\"FeedUnit\"]",
  "used": ".userContentWrapper"
}
```

### Alerts

| Condition | Severity | Channel |
|-----------|----------|---------|
| Smoke test fails on PR | High | GitHub Check failure |
| Post-deploy full suite fails | Critical | Slack #oncall |
| Scheduled test fails | Medium | Slack #canary-alerts |
| Fallback depth > 1 | Low | Grafana dashboard |

---

## Related Documentation

- [How to Update Selectors](./how-to-update-selectors.md) - Step-by-step maintenance guide
- [Oncall Playbook](./oncall-playbook.md) - Incident response procedures
- [Project Roadmap](../PROJECT_ROADMAP.md#task-7-assisted-ingestion-service) - Task 7.2 details
- [CI Workflow Review](../CI_WORKFLOW_REVIEW.md) - General CI patterns

---

**Implementation Checklist (Task 7.2)**:
- [ ] Create `src/canary/` directory
- [ ] Implement selector contracts in `src/canary/selectors.ts`
- [ ] Build resilient resolver in `src/canary/resolver.ts`
- [ ] Create `tests/canary/` directory
- [ ] Create Playwright smoke tests in `tests/canary/smoke.spec.ts`
- [ ] Create Playwright full suite in `tests/canary/full.spec.ts`
- [ ] Create visual regression tests in `tests/canary/visual.spec.ts`
- [ ] Set up `.github/workflows/canary-pr.yml` with fork/secret gating
- [ ] Set up `.github/workflows/canary-deploy.yml`
- [ ] Set up `.github/workflows/canary-scheduled.yml`
- [ ] Configure Prometheus metrics and Grafana dashboards
- [ ] Create `.auth/` directory (add to `.gitignore`)
- [ ] Document storage state refresh process
