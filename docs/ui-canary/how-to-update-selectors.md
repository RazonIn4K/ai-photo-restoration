# How to Update Selectors

**Last Updated**: 2025-11-10
**Status**: 📋 **Guide for Planned Implementation (Task 7.2)**
**Audience**: Engineers maintaining the canary system
**Prerequisites**: Node.js 20, Playwright installed, Facebook test account access

> **Note**: This guide describes procedures for maintaining the UI canary system to be implemented in Task 7.2. File paths reference planned structure.

---

## Overview

This guide provides step-by-step instructions for updating `src/canary/selectors.ts` (to be created) when Facebook UI changes break the canary tests. You'll learn how to:

1. Inspect Facebook's current UI structure
2. Update selector contracts with new values
3. Refresh storage state for authenticated sessions
4. Regenerate visual baselines
5. Validate changes locally and in CI

---

## When to Update Selectors

### Triggers

Update selectors when you observe (once canary system is implemented):

- ✅ **Scheduled canary test failures** in GitHub Actions
- ✅ **Fallback depth > 1** consistently (check Grafana)
- ✅ **Timeout errors** in Playwright traces
- ✅ **Manual ingestion failing** with selector errors

### Pre-Check

Before starting, verify the failure is selector-related:

```bash
# Check recent canary workflow runs (once workflows are created)
gh run list --workflow=canary-scheduled.yml --limit 5

# Download latest failure artifacts
gh run download <run-id> --name canary-smoke-failures

# Inspect Playwright trace
npx playwright show-trace test-results/*/trace.zip
```

**Confirm**:
- Error message contains "Timeout waiting for selector"
- Element is visible in screenshot but not matched
- Console shows no JavaScript errors blocking render

---

## Step 1: Inspect Facebook UI Structure

### 1.1 Launch Playwright Inspector

```bash
# Start Playwright in debug mode with authenticated session
npx playwright codegen \
  --load-storage=.auth/facebook.json \
  https://www.facebook.com/groups/YOUR_TEST_GROUP_ID
```

**Replace `YOUR_TEST_GROUP_ID`** with the Facebook group ID from your test config.

### 1.2 Identify Target Elements

Use the **Playwright Inspector** to:

1. **Hover** over the element you need to select (e.g., post container)
2. **Click** the "Pick Locator" button (target icon)
3. **Record** the suggested selector
4. **Test** the selector in the browser console:
   ```javascript
   document.querySelector('[data-pagelet*="FeedUnit"]')
   ```

### 1.3 Document Multiple Candidates

Collect **3-5 selector candidates** per element:

| Element | Candidate 1 | Candidate 2 | Candidate 3 |
|---------|-------------|-------------|-------------|
| Post Container | `[data-pagelet*="FeedUnit"]` | `[role="article"]` | `.userContentWrapper` |
| Author Name | `a[aria-label*="profile"] > strong` | `span.actor > a` | `h4 a[data-hovercard]` |
| Post Content | `[data-ad-preview="message"]` | `.userContent` | `[dir="auto"]` |

**Prioritize**:
- **Semantic selectors** (`[role="article"]`) over class names
- **Data attributes** (`data-pagelet`) over generic divs
- **ARIA labels** for accessibility compliance

---

## Step 2: Update `src/canary/selectors.ts`

### 2.1 Open the Selector File

```bash
# Edit the selector contracts (file to be created in Task 7.2)
code src/canary/selectors.ts
```

### 2.2 Version Bump Strategy

Determine the appropriate version bump:

| Change Type | Version Bump | Example |
|-------------|--------------|---------|
| Primary selector updated | **PATCH** | 1.0.0 → 1.0.1 |
| Fallback added/removed | **MINOR** | 1.0.1 → 1.1.0 |
| Contract structure changed | **MAJOR** | 1.1.0 → 2.0.0 |

### 2.3 Update the Contract

**Example**: Updating `postContainer` selector after Facebook UI change

```typescript
export const DEFAULT_SELECTORS: VersionedSelectors = {
  version: "1.1.0", // MINOR bump (added fallback)
  effectiveDate: new Date("2025-11-10"),
  contracts: {
    postContainer: {
      name: "post-container",
      version: "1.1.0", // Match parent version
      primary: '[data-pagelet*="FeedUnit_0"]', // NEW: Updated with trailing _0
      fallbacks: [
        '[data-pagelet*="FeedUnit"]', // OLD: Previous primary becomes fallback
        '[role="article"]',
        '.userContentWrapper',
        'div[data-ad-preview="message"]'
      ],
      validUntil: new Date("2026-02-10"), // 90-day deprecation window
    },
    // ... other contracts unchanged
  }
};
```

**Key Changes**:
1. Updated `primary` to new selector
2. Moved old primary to **first fallback** position
3. Bumped version to `1.1.0` (minor)
4. Set `validUntil` to 90 days from today

### 2.4 Validate Syntax

```bash
# Run TypeScript compiler check
npm run build

# Expected output: No errors
```

---

## Step 3: Refresh Storage State

Storage state (authenticated sessions) expire after **60 days**. Refresh proactively during selector updates.

### 3.1 Generate New Storage State

```bash
# Launch Playwright with manual auth (create .auth/ directory first)
mkdir -p .auth
npx playwright codegen \
  --save-storage=.auth/facebook.json \
  https://facebook.com
```

**Manual steps**:
1. **Login** with your test account credentials
2. **Navigate** to Settings → Privacy → Apps and Websites
3. **Verify** session is active (should see "Active Now")
4. **Close** the browser (storage state auto-saved)

### 3.2 Update GitHub Secret

```bash
# Copy storage state to clipboard (macOS)
cat .auth/facebook.json | pbcopy

# Or display for manual copy (Linux)
cat .auth/facebook.json
```

**GitHub UI**:
1. Go to repo → **Settings** → **Secrets and variables** → **Actions**
2. Edit secret: `FACEBOOK_STORAGE_STATE`
3. Paste new JSON content
4. **Save**

### 3.3 Verify Locally

```bash
# Test that storage state works
npx playwright test tests/canary/smoke.spec.ts --headed

# Watch for:
# ✅ No "login required" prompts
# ✅ Group page loads immediately
# ✅ Tests pass
```

---

## Step 4: Regenerate Visual Baselines

Visual regression tests compare screenshots against **baseline images**. Regenerate after UI changes.

### 4.1 Update Snapshots Locally

```bash
# Regenerate all visual baselines (once tests are created)
npx playwright test tests/canary/visual.spec.ts --update-snapshots

# This creates/updates files in:
# tests/canary/__screenshots__/ (directory to be created)
```

### 4.2 Review Changes

```bash
# View diff of updated baselines
git diff tests/canary/__screenshots__/

# Expected changes:
# - Post container dimensions
# - Font rendering (if Facebook changed typography)
# - Layout shifts
```

**Manual review**:
- Open baseline images in an image viewer
- Confirm changes match expected Facebook UI updates
- Reject any unintended differences (e.g., date/time stamps)

### 4.3 Commit Baselines

```bash
# Stage baseline changes
git add tests/canary/__screenshots__/

# Commit with descriptive message
git commit -m "test(canary): update visual baselines for Facebook UI v2025-11"
```

---

## Step 5: Validate Changes Locally

### 5.1 Run Full Canary Suite

```bash
# Run all canary tests (once test suite is implemented)
npm run test:canary

# Or with Playwright directly:
npx playwright test tests/canary/ --reporter=html

# Expected output:
# ✅ smoke.spec.ts: 5 passed
# ✅ full.spec.ts: 12 passed
# ✅ visual.spec.ts: 8 passed
```

### 5.2 Check Fallback Depth

```bash
# Run with debug logging to see which selectors resolved
DEBUG=canary:* npx playwright test tests/canary/smoke.spec.ts

# Look for log entries:
# canary:resolver Resolved 'post-container' using primary
# canary:resolver Resolved 'author-name' using fallback-0
```

**Acceptance Criteria**:
- ✅ All tests pass
- ✅ Fallback depth = 0 for critical selectors
- ✅ No timeout errors in logs
- ✅ Visual baselines match (or intentionally updated)

### 5.3 Test Against Live Facebook

```bash
# Run against actual Facebook group (not mocked)
TEST_GROUP_ID=YOUR_GROUP_ID npx playwright test tests/canary/smoke.spec.ts --headed

# Manually verify:
# 1. Group page loads
# 2. Posts are detected
# 3. Author names extracted correctly
# 4. Images found
```

---

## Step 6: Submit PR and Monitor CI

### 6.1 Create Feature Branch

```bash
# Create branch following naming convention
git checkout -b canary/update-selectors-2025-11-10

# Stage selector changes
git add src/canary/selectors.ts tests/canary/__screenshots__/

# Commit with semantic versioning reference
git commit -m "feat(canary): update selectors to v1.1.0 for Facebook UI changes

- Update postContainer primary selector to [data-pagelet*=\"FeedUnit_0\"]
- Move previous primary to fallback position
- Regenerate visual baselines
- Refresh storage state (expires 2026-02-10)

Closes #123"
```

### 6.2 Push and Open PR

```bash
# Push to remote
git push -u origin canary/update-selectors-2025-11-10

# Open PR via GitHub CLI
gh pr create \
  --title "Update Canary Selectors to v1.1.0" \
  --body "$(cat <<EOF
## Summary
Updates Facebook UI selectors after detecting breaking changes in scheduled canary tests.

## Changes
- \`src/canary/selectors.ts\`: Bump to v1.1.0
- \`tests/canary/__screenshots__/\`: Regenerated visual baselines
- Storage state refreshed (valid until 2026-02-10)

## Testing
- ✅ Local full suite passed (25/25 tests)
- ✅ Fallback depth = 0 for all critical selectors
- ✅ Live Facebook group test successful

## CI Expectations
- Canary PR check will run smoke tests
- Post-deploy will validate full suite

## Checklist
- [x] Version bumped correctly (MINOR)
- [x] Fallbacks updated
- [x] Visual baselines regenerated
- [x] Storage state refreshed
- [x] Tested locally against live Facebook
EOF
)"
```

### 6.3 Monitor CI Pipeline

#### PR Check (1-2 minutes)

Watch for `.github/workflows/canary-pr.yml` to run:

```bash
# Monitor PR checks
gh pr checks --watch
```

**Expected**:
- ✅ Smoke tests pass
- ✅ No selector timeout errors
- ✅ Artifacts uploaded (traces, screenshots)

**If CI fails**:
1. Download artifacts: `gh run download --name canary-smoke-failures`
2. Review trace: `npx playwright show-trace test-results/*/trace.zip`
3. Identify failing selector and repeat from Step 1

#### Post-Deploy (after merge)

After PR merges to `main`, `.github/workflows/canary-deploy.yml` runs:

```bash
# Check post-deploy status
gh run list --workflow=canary-deploy.yml --limit 1

# View logs
gh run view --log
```

**Expected**:
- ✅ Full suite passes (25/25 tests)
- ✅ Visual baselines updated in repo
- ✅ No fallback warnings

---

## Step 7: Keep Tests in Sync

### 7.1 Update Test Expectations

If selector changes affect test assertions, update `tests/canary/*.spec.ts` (files to be created in Task 7.2):

**Example**: Post container structure changed

```typescript
// Before
test('extract post metadata', async ({ page }) => {
  const postContainer = await page.locator('[data-pagelet*="FeedUnit"]').first();
  const author = await postContainer.locator('a[aria-label*="profile"]').textContent();
  expect(author).toBe('John Doe');
});

// After (updated selector)
test('extract post metadata', async ({ page }) => {
  const resolver = new SelectorResolver();
  const postContainer = await resolver.resolve(
    page,
    DEFAULT_SELECTORS.contracts.postContainer
  );
  const author = await postContainer!.locator(
    DEFAULT_SELECTORS.contracts.authorName.primary
  ).textContent();
  expect(author).toBe('John Doe');
});
```

**Key changes**:
- Use `SelectorResolver` instead of hardcoded selectors
- Reference contracts from `DEFAULT_SELECTORS`
- Handle `null` return from resolver (element not found)

### 7.2 Update Fixtures

If storage state format changes (rare), update `tests/canary/fixtures.ts` (file to be created in Task 7.2):

```typescript
import { test as base } from '@playwright/test';

export const test = base.extend({
  authenticatedPage: async ({ browser }, use) => {
    const context = await browser.newContext({
      storageState: '.auth/facebook.json', // Ensure path is correct
    });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
});
```

### 7.3 Sync Documentation

Update this guide if you discover:
- New Facebook login flow changes
- Different storage state structure
- Updated Playwright API conventions

**Submit a follow-up PR**:
```bash
git checkout -b docs/update-selector-guide
# Edit this file
git add docs/ui-canary/how-to-update-selectors.md
git commit -m "docs(canary): clarify storage state refresh steps"
git push -u origin docs/update-selector-guide
gh pr create --title "Update Canary Selector Guide"
```

---

## Troubleshooting

### Issue: "Timeout waiting for selector"

**Diagnosis**:
```bash
# Check if element exists in trace
npx playwright show-trace test-results/*/trace.zip
# Look for element in DOM snapshot
```

**Solutions**:
1. **Element loads slowly**: Increase timeout in `resolver.resolve(page, contract, 10000)`
2. **Element behind login wall**: Refresh storage state (Step 3)
3. **Selector is wrong**: Re-inspect with Playwright Inspector (Step 1)

---

### Issue: "Storage state expired"

**Symptoms**:
- Tests redirect to login page
- Screenshots show "Log In" button

**Solution**:
```bash
# Regenerate storage state (Step 3)
npx playwright codegen --save-storage=.auth/facebook.json https://facebook.com
# Update GitHub secret FACEBOOK_STORAGE_STATE
```

**Prevention**:
- Set calendar reminder to refresh every 30 days
- Monitor scheduled test logs for "session expired" warnings

---

### Issue: "Visual baseline mismatch"

**Symptoms**:
- Visual tests fail with "Screenshot comparison failed"
- Diff shows minor pixel differences

**Solutions**:

1. **Intentional UI change**: Regenerate baselines (Step 4)
   ```bash
   npx playwright test tests/canary/visual.spec.ts --update-snapshots
   ```

2. **Font rendering variance**: Adjust threshold in `playwright.config.ts`
   ```typescript
   expect: {
     toMatchSnapshot: {
       threshold: 0.2, // Increase tolerance (default 0.1)
     },
   },
   ```

3. **Date/time differences**: Mask dynamic content
   ```typescript
   await page.locator('.timestamp').evaluate(el => el.textContent = 'MASKED');
   await expect(page).toHaveScreenshot();
   ```

---

### Issue: "CI passes locally but fails in GitHub Actions"

**Diagnosis**:
- Network conditions differ (CI may be slower)
- Storage state secret outdated

**Solutions**:

1. **Increase timeouts** for CI environment:
   ```typescript
   const timeout = process.env.CI ? 10000 : 5000;
   await resolver.resolve(page, contract, timeout);
   ```

2. **Verify GitHub secret**:
   ```bash
   # Test with downloaded secret
   gh secret list
   # Ensure FACEBOOK_STORAGE_STATE is present and recent
   ```

3. **Enable debug logs** in workflow:
   ```yaml
   - name: Run smoke tests
     run: npx playwright test tests/canary/smoke.spec.ts
     env:
       DEBUG: playwright:*
   ```

---

## Best Practices

### ✅ Do

- **Version selectors semantically** (MAJOR.MINOR.PATCH)
- **Prioritize semantic HTML** selectors (`[role="article"]`)
- **Test against live Facebook** before merging
- **Document why** selectors changed (Facebook UI version, date)
- **Refresh storage state** every 30 days proactively

### ❌ Don't

- **Hardcode selectors** in tests (use contracts)
- **Skip visual baseline review** (may hide bugs)
- **Commit sensitive data** (`.auth/` is in `.gitignore`)
- **Use brittle selectors** (e.g., `:nth-child(3)`)
- **Ignore fallback depth warnings** (indicates fragility)

---

## Related Documentation

- [Architecture Overview](./architecture.md) - System design and components
- [Oncall Playbook](./oncall-playbook.md) - Incident response for failures
- [Playwright Documentation](https://playwright.dev/docs/selectors) - Selector best practices
- [Project Roadmap](../PROJECT_ROADMAP.md#task-72) - Task 7.2 context

---

## Quick Reference Commands

```bash
# Inspect Facebook UI
npx playwright codegen --load-storage=.auth/facebook.json https://facebook.com/groups/GROUP_ID

# Refresh storage state
npx playwright codegen --save-storage=.auth/facebook.json https://facebook.com

# Update visual baselines
npx playwright test tests/canary/visual.spec.ts --update-snapshots

# Run full canary suite locally
npx playwright test tests/canary/ --reporter=html

# Debug with trace
npx playwright show-trace test-results/*/trace.zip

# Monitor CI
gh run list --workflow=canary-pr.yml --limit 5
gh run watch

# Update GitHub secret
cat .auth/facebook.json | pbcopy
# Then: Settings → Secrets → FACEBOOK_STORAGE_STATE → Update
```

---

**Maintenance Schedule**:
- **Weekly**: Check scheduled test results
- **Monthly**: Refresh storage state proactively
- **Quarterly**: Review and prune deprecated selectors
- **After Facebook UI changes**: Follow this guide

**Questions?** See [oncall-playbook.md](./oncall-playbook.md) or open a GitHub issue.
