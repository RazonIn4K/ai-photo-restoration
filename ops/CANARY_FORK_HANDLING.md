# Canary Testing: Fork & Secret Handling

## Overview

This document explains how the Face-Restore-AI canary infrastructure handles forked PRs and secret availability to ensure **zero red builds from external contributors**.

## Key Principle

**Canaries skip gracefully when they can't run safely** - this prevents false negatives in CI and maintains a green build status for legitimate forked PRs.

---

## Eligibility Pattern

All canary jobs follow a consistent eligibility pattern:

1. **Fork Detection** - Check if PR is from a forked repository
2. **Secret Validation** - Verify required secrets are available
3. **Graceful Skip** - Skip with clear logging if conditions aren't met
4. **Continue Execution** - Only run tests when environment is safe and complete

### Implementation

The `check-eligibility` job (`.github/workflows/ui-canary.yml:37-85`) determines:

- `is-fork`: Boolean indicating if PR is from a forked repository
- `has-secrets`: Boolean indicating if required secrets are accessible
- `can-run`: Boolean indicating if canaries can safely execute
- `skip-reason`: Human-readable explanation for skipping

---

## Canary Job Types

### 1. PR Canary (Smoke Tests)

**Trigger:** Pull requests to `main` or `develop`

**Behavior:**
- ✅ Runs on trusted PRs (same repository)
- ⏭️ Skips on forked PRs with message: "Forked PR - secrets not available"
- 🚀 Fast smoke suite only (~30s)

**Why Skip Forks?**
- Forked PRs don't have access to repository secrets (GitHub security model)
- Running without proper credentials would cause false failures
- Skipping maintains green status and clear intent

**Workflow Location:** `.github/workflows/ui-canary.yml:88-159`

```yaml
steps:
  - name: Check if canary should run
    if: needs.check-eligibility.outputs.can-run != 'true'
    run: |
      echo "⏭️  Skipping PR canary: ${{ needs.check-eligibility.outputs.skip-reason }}"
      echo "This is expected for forked PRs and does not indicate a failure."
      exit 0
```

---

### 2. Post-Merge Canary (Smoke + Meta)

**Trigger:** Pushes to `main` branch

**Behavior:**
- ✅ Always runs (main branch has full secrets access)
- 🧪 Runs smoke + meta suites (~90s total)
- 🛡️ Full eligibility check still performed (defense in depth)

**Secret Access:** Full - runs in trusted context

**Workflow Location:** `.github/workflows/ui-canary.yml:162-217`

---

### 3. Scheduled Prod Canary (Full Suite)

**Trigger:**
- Every 15 minutes via cron schedule
- Manual via `workflow_dispatch`

**Behavior:**
- ✅ Runs all suites: smoke, meta, visual
- ⚠️ `continue-on-error: true` - doesn't fail workflow on test failures
- 📦 Uploads artifacts for debugging
- 🎯 Runs only on `main` branch

**Unique Features:**
- Matrix strategy runs suites in parallel
- `fail-fast: false` ensures all suites run even if one fails
- Artifact retention: 7 days

**Why Continue on Error?**
- Scheduled canaries are monitoring/alerting tools
- They shouldn't block other workflows or deployments
- Failures are captured in artifacts and metrics for investigation

**Workflow Location:** `.github/workflows/ui-canary.yml:220-338`

---

## Secret Requirements

### Current State

No secrets are strictly required for canary tests to run. The eligibility check is primarily for fork detection and future-proofing.

### Future Considerations

If secrets are added (e.g., API keys, service credentials):

1. **Update eligibility check** in `check-eligibility` job
2. **Document secret names** in this file
3. **Add validation logic** to verify secrets exist before use
4. **Update skip reasons** to be more specific about missing secrets

Example future check:
```yaml
- name: Validate secrets
  id: secrets
  run: |
    HAS_API_KEY="${{ secrets.API_KEY != '' }}"
    HAS_SERVICE_TOKEN="${{ secrets.SERVICE_TOKEN != '' }}"
    echo "has-api-key=$HAS_API_KEY" >> $GITHUB_OUTPUT
```

---

## Observability & Metrics

### Structured Logging

The canary runner (`scripts/run-canary.ts`) emits structured JSON logs:

```json
{
  "level": "info|error|metric",
  "timestamp": "2025-11-10T04:15:00.000Z",
  "message": "...",
  "suite": "smoke|meta|visual",
  "duration_ms": 12345
}
```

### Metrics Emitted

- `canary_test_duration_ms` - Test execution time
- `canary_test_result` - Pass (1) or Fail (0)

Labels: `suite`, `status`

### Prometheus Integration

Current setup (`ops/prometheus/prometheus.yml`):
- Scrapes application metrics on port 9464
- Interval: 15s

**Future Enhancement:** Add GitHub Actions exporter to scrape canary metrics from workflow logs or artifacts.

### Grafana Dashboards

Current dashboard (`ops/grafana/provisioning/dashboards/json/base-dashboard.json`) is minimal.

**Recommended Panels:**
1. Canary pass rate by suite (last 24h)
2. Canary duration trends (p50, p95, p99)
3. Failed canary count and suite breakdown
4. Fork skip rate (operational health)

---

## CI Behavior Matrix

| Event Type      | Fork Status | Secrets | Canary Behavior                        |
|-----------------|-------------|---------|----------------------------------------|
| PR (trusted)    | Same repo   | ✅ Yes  | ✅ Runs smoke suite                    |
| PR (fork)       | Fork        | ❌ No   | ⏭️ Skips with clear log message       |
| Push (main)     | N/A         | ✅ Yes  | ✅ Runs smoke + meta suites            |
| Schedule (main) | N/A         | ✅ Yes  | ✅ Runs all suites, continues on error |
| Schedule (other)| N/A         | ✅ Yes  | ⏭️ Skips (not main branch)             |

---

## SRE Runbook

### Normal Operations

**Expected Logs for Forked PRs:**
```
⏭️ Skipping PR canary: Forked PR - secrets not available
This is expected for forked PRs and does not indicate a failure.
```

**Action Required:** None - this is expected behavior.

---

### Canary Failures

#### Scheduled Canary Fails

1. Check artifacts: `Actions > UI Canary Tests > [Run] > Artifacts`
2. Review `canary-results.json` for test details
3. Check `*-metadata.json` for environment context
4. Investigate logs for structured error messages

**Workflow does NOT fail** - failures are logged and uploaded for investigation.

---

#### Post-Merge Canary Fails

1. **Immediate Action:** Canary failure on main indicates production risk
2. Check recent commits: `git log --oneline -5`
3. Review canary logs in Actions tab
4. Consider reverting if critical path affected

**Workflow DOES fail** - blocks deployment pipelines if configured.

---

### Manual Canary Execution

Run specific suite manually:

```bash
npm run canary:smoke   # Fast integration tests
npm run canary:meta    # Metadata processing tests
npm run canary:visual  # Perceptual hash tests
```

Or via GitHub Actions:
1. Navigate to Actions > UI Canary Tests
2. Click "Run workflow"
3. Select suite: smoke, meta, visual, or all
4. Click "Run workflow" button

---

## Node Version Alignment

✅ **All workflows and package.json use Node 20**

- `.github/workflows/ci.yml` - Node 20 in all jobs
- `.github/workflows/ui-canary.yml` - Node 20 in all jobs
- `package.json` - `engines.node: ">=20.0.0"`

This ensures consistency across CI, canaries, and local development.

---

## Maintenance

### When to Update This Document

- Adding new canary suites
- Changing eligibility logic
- Adding secret dependencies
- Modifying skip conditions
- Updating observability infrastructure

### Testing Changes

Before merging workflow changes:

1. Test on feature branch with trusted PR
2. Create fork PR to verify skip behavior
3. Validate artifacts upload on scheduled run
4. Check structured logs in Actions output

---

## References

- Workflows: `.github/workflows/ui-canary.yml`
- Canary Runner: `scripts/run-canary.ts`
- Prometheus Config: `ops/prometheus/prometheus.yml`
- Grafana Dashboards: `ops/grafana/provisioning/dashboards/json/`

---

**Last Updated:** 2025-11-10
**Owner:** SRE Team
**Status:** Active
