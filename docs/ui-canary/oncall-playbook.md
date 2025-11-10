# Oncall Playbook: Canary Failures

**Last Updated**: 2025-11-10
**Status**: 📋 **Playbook for Planned Implementation (Task 7.2)**
**Audience**: On-call engineers responding to canary test failures
**Severity Levels**: P0 (Critical), P1 (High), P2 (Medium), P3 (Low)

> **Note**: This playbook describes incident response procedures for the UI canary system to be implemented in Task 7.2. File paths and workflow references represent planned structure.

---

## Overview

This playbook provides **step-by-step incident response** procedures for UI canary test failures (once implemented). Use it to:

1. **Triage** failures quickly (5-10 minutes)
2. **Diagnose** root cause (10-30 minutes)
3. **Mitigate** impact (immediate fallback strategies)
4. **Resolve** underlying issue (hours to days)
5. **Prevent** recurrence (post-incident review)

---

## Alert Types and Severity

| Alert Source | Severity | Response SLA | Example |
|--------------|----------|--------------|---------|
| **PR Check Failure** | P2 (Medium) | 2 hours | `canary-pr.yml` (planned) fails on non-fork PR |
| **Post-Deploy Failure** | P1 (High) | 30 minutes | `canary-deploy.yml` (planned) fails after merge to `main` |
| **Scheduled Failure** | P1 (High) | 1 hour | `canary-scheduled.yml` (planned) nightly run fails |
| **Repeated Fallback Use** | P3 (Low) | 1 business day | Grafana alert: fallback depth > 1 for 7 days |

---

## Quick Triage Checklist

**Complete this in < 10 minutes** (once canary system is operational):

- [ ] **Identify** which workflow failed (`canary-pr`, `canary-deploy`, `canary-scheduled` - workflows to be created)
- [ ] **Check** if failure affects production ingestion (review metrics dashboard)
- [ ] **Determine** if failure is isolated (single run) or persistent (3+ consecutive runs)
- [ ] **Verify** eligibility gating status (fork/secret access issues?)
- [ ] **Review** recent Facebook UI changes (check https://developers.facebook.com/updates)
- [ ] **Escalate** to P0 if production ingestion is down

**Proceed to Incident Response based on failure type.**

---

## Incident Response Procedures

### Scenario 1: PR Check Failure

**Alert**: GitHub Actions check `canary-pr` (workflow to be created) fails on a pull request

#### Step 1: Verify PR Context

```bash
# Get PR details
gh pr view <pr-number>

# Check if PR modifies canary code
gh pr diff <pr-number> | grep -E "src/canary|tests/canary"
```

**Questions**:
- Is this PR specifically updating canary selectors?
- Is this a fork PR (expected to skip canary tests)?
- Are there recent commits that might have broken tests?

#### Step 2: Download Artifacts

```bash
# Find the failed run
gh run list --workflow=canary-pr.yml --limit 5

# Download failure artifacts
gh run download <run-id> --name canary-smoke-failures

# Artifacts include:
# - test-results/      (JSON test results)
# - playwright-report/ (HTML report)
# - *.zip              (Playwright traces)
```

#### Step 3: Analyze Failure

```bash
# Open Playwright HTML report
open playwright-report/index.html

# View trace for failed test
npx playwright show-trace test-results/*/trace.zip
```

**Look for**:
- **Timeout errors**: Selector didn't match (Facebook UI change)
- **Assertion failures**: Expected vs. actual content mismatch
- **Network errors**: Facebook API downtime or rate limiting
- **Authentication errors**: Storage state expired

#### Step 4: Determine Root Cause

| Symptom | Root Cause | Action |
|---------|------------|--------|
| "Timeout waiting for selector" | Facebook UI change | Update selectors (see [how-to-update-selectors.md](./how-to-update-selectors.md)) |
| "Login required" in screenshot | Storage state expired | Refresh storage state (Step 3 below) |
| "Network request failed" | Facebook downtime | Wait 30 min, re-run workflow |
| "Element not visible" | Facebook A/B test or geo-gating | Update selectors with fallbacks |

#### Step 5: Mitigate

**Option A: Quick Fix (PR author can resolve)**
```bash
# Comment on PR with guidance
gh pr comment <pr-number> --body "Canary tests failed due to selector mismatch. Please update \`src/canary/selectors.ts\` per [selector update guide](./docs/ui-canary/how-to-update-selectors.md)."
```

**Option B: Override (Oncall resolves)**
```bash
# If failure is unrelated to PR changes, manually merge
gh pr merge <pr-number> --squash --body "Merging despite canary failure (unrelated). Oncall tracking in ISSUE-123."
```

---

### Scenario 2: Post-Deploy Failure

**Alert**: Slack notification "🚨 Canary post-deploy test failed" after merge to `main` (alerts to be configured)

**Severity**: **P1 (High)** - Production deployment may have broken selectors

#### Step 1: Assess Production Impact

```bash
# Check if ingestion service is running
curl https://api.yourapp.com/health/ingestion

# Review Grafana dashboard for ingestion metrics
open https://grafana.yourapp.com/d/canary
```

**Key Metrics**:
- `ingestion_requests_total` - Should be > 0 in last 5 minutes
- `canary_selector_success_rate` - Should be > 95%
- `canary_fallback_usage{depth="0"}` - Should be > 90%

**Decision Tree**:
```
Production ingestion working?
  ├─ YES: Continue to Step 2 (P2 severity)
  └─ NO: ESCALATE to P0, engage team lead
```

#### Step 2: Download Artifacts

```bash
# Find the failed post-deploy run
gh run list --workflow=canary-deploy.yml --limit 3

# Download full suite artifacts
gh run download <run-id> --name canary-full-failures
```

#### Step 3: Identify Breaking Commit

```bash
# View commits since last successful deploy
git log --oneline origin/main~5..origin/main

# Check for canary-related changes
git log --oneline --all -- src/canary/ tests/canary/
```

**Look for**:
- Recent selector updates
- Storage state changes
- Playwright config modifications

#### Step 4: Mitigate Immediately

**Option A: Hotfix (if selector issue is obvious)**

```bash
# Create hotfix branch from main
git checkout main
git pull
git checkout -b hotfix/canary-selectors-$(date +%Y%m%d)

# Edit src/canary/selectors.ts with emergency fix (file to be created in Task 7.2)
# (Use Playwright Inspector to find correct selector)

# Test locally
npx playwright test tests/canary/smoke.spec.ts

# Push and fast-track PR
git add src/canary/selectors.ts
git commit -m "hotfix(canary): emergency selector update for postContainer"
git push -u origin hotfix/canary-selectors-$(date +%Y%m%d)

gh pr create --title "HOTFIX: Canary Selector Emergency Update" --label "priority:high"
# Request immediate review from team lead
```

**Option B: Revert (if breaking change unclear)**

```bash
# Revert the last commit on main
git revert HEAD --no-edit
git push origin main

# Notify team
gh issue create \
  --title "Post-deploy canary failure - reverted commit" \
  --body "Reverted <commit-hash> due to canary test failures. Investigation ongoing."
```

#### Step 5: Verify Mitigation

```bash
# Trigger manual workflow run
gh workflow run canary-deploy.yml

# Monitor until completion
gh run watch
```

**Expected**:
- ✅ Full suite passes
- ✅ Production ingestion metrics recover
- ✅ No alerts for 30 minutes

---

### Scenario 3: Scheduled Failure (Nightly)

**Alert**: Slack notification "🚨 Canary scheduled test failed" at 2:05 AM UTC (alerts to be configured)

**Severity**: **P1 (High)** - Indicates Facebook UI change detected overnight

#### Step 1: Acknowledge Alert

```bash
# Acknowledge in Slack
# Reply: "👀 Oncall <your-name> triaging. ETA 30 min."
```

#### Step 2: Quick Impact Check

```bash
# Check if production is affected
curl https://api.yourapp.com/metrics/canary | jq '.selector_success_rate'

# Expected: > 0.90 (90% success rate)
# If < 0.80: ESCALATE to P0
```

#### Step 3: Download and Analyze

```bash
# Get scheduled run artifacts
gh run list --workflow=canary-scheduled.yml --limit 1
gh run download <run-id> --name canary-scheduled-failures

# View Playwright report
open playwright-report/index.html
```

#### Step 4: Determine Scope

**Count failures**:
```bash
# Parse test results
cat test-results/results.json | jq '.suites[].specs[] | select(.tests[].results[].status == "failed") | .title'
```

**Categorize**:
| Failures | Scope | Action |
|----------|-------|--------|
| 1-2 selectors | **Isolated** | Update specific selectors (P2) |
| 3-5 selectors | **Moderate** | Facebook UI redesign (P1) |
| 6+ selectors | **Widespread** | Major Facebook platform change (P0) |

#### Step 5: Create Tracking Issue

```bash
gh issue create \
  --title "Canary scheduled failure: <N> selectors broken" \
  --label "canary,bug" \
  --body "$(cat <<EOF
## Summary
Nightly canary test detected <N> selector failures.

## Failed Selectors
- postContainer
- authorName
- postTimestamp

## Evidence
- Run: https://github.com/YOUR_REPO/actions/runs/<run-id>
- Artifacts: Downloaded to \`canary-scheduled-failures/\`

## Next Steps
- [ ] Update selectors in \`src/canary/selectors.ts\`
- [ ] Regenerate visual baselines
- [ ] Test against live Facebook
- [ ] Submit PR

## Timeline
- Detected: $(date)
- Target Resolution: 8 business hours
EOF
)"
```

#### Step 6: Schedule Resolution

**Business Hours Response** (if detected overnight):
1. **Document findings** in the GitHub issue
2. **Assign** to team member for morning resolution
3. **Set reminder** to check production metrics in 4 hours

**Immediate Response** (if production affected):
- Proceed with hotfix (see Scenario 2, Step 4)

---

### Scenario 4: Eligibility Skip (Fork/Secrets)

**Alert**: GitHub Actions shows "Canary tests skipped" on a legitimate PR

**Severity**: **P3 (Low)** - Expected behavior for forks, but investigate if on internal PR

#### Step 1: Verify PR Source

```bash
gh pr view <pr-number> --json headRepositoryOwner,headRepository
```

**Expected for forks**:
```json
{
  "headRepositoryOwner": "external-contributor",
  "headRepository": "external-fork-name"
}
```

**Unexpected for internal PRs**:
```json
{
  "headRepositoryOwner": "YOUR_ORG",
  "headRepository": "YOUR_REPO"
}
```

#### Step 2: Check Eligibility Condition

**View workflow file**:
```bash
cat .github/workflows/canary-pr.yml | grep -A 3 "if:"
```

**Expected gating**:
```yaml
if: |
  github.event.pull_request.head.repo.fork == false &&
  vars.CANARY_ENABLED == 'true'
```

#### Step 3: Diagnose Skip Reason

| Condition | Value | Action |
|-----------|-------|--------|
| `head.repo.fork == true` | Fork PR | ✅ Expected (secrets unavailable) |
| `vars.CANARY_ENABLED != 'true'` | Repository variable not set | Set `CANARY_ENABLED=true` in Settings → Variables |
| Secrets missing | `FACEBOOK_STORAGE_STATE` undefined | Add secret (see [how-to-update-selectors.md](./how-to-update-selectors.md#step-3-refresh-storage-state)) |

#### Step 4: Enable Canary for Internal PRs

```bash
# Verify repository variable
gh variable list

# Expected output:
# CANARY_ENABLED  true  <date>

# If missing, create:
gh variable set CANARY_ENABLED --body "true"
```

#### Step 5: Re-Run Workflow

```bash
# Trigger re-run of PR checks
gh pr checks <pr-number> --watch
```

**Expected**: Canary tests now execute (not skipped)

---

## Where Logs and Artifacts Live

### GitHub Actions Artifacts

**Location**: GitHub Actions run page → "Artifacts" section

**Artifact Types**:

| Artifact Name | Contents | Retention |
|---------------|----------|-----------|
| `canary-smoke-failures` | Smoke test failures (traces, screenshots, report) | 90 days |
| `canary-full-failures` | Full suite failures | 90 days |
| `canary-scheduled-failures` | Nightly test failures | 90 days |

**Download via CLI**:
```bash
gh run download <run-id> --name <artifact-name>
```

**Download via UI**:
1. Navigate to Actions tab → Workflow run
2. Scroll to "Artifacts" section
3. Click artifact name to download ZIP

### Playwright Traces

**Location**: `test-results/<test-name>/trace.zip`

**View trace**:
```bash
npx playwright show-trace test-results/canary-smoke-post-container/trace.zip
```

**What traces include**:
- Full DOM snapshots at each step
- Network requests/responses
- Console logs
- Screenshots before/after each action
- Source code of test

**Key views**:
- **Actions**: Step-by-step test execution
- **Snapshots**: DOM state at each step
- **Network**: XHR/Fetch requests
- **Console**: Browser console logs

### Playwright HTML Report

**Location**: `playwright-report/index.html`

**Open locally**:
```bash
open playwright-report/index.html
# Or serve via HTTP:
npx playwright show-report
```

**What reports include**:
- Test suite summary (pass/fail counts)
- Execution timeline
- Error messages and stack traces
- Screenshots of failures
- Links to traces

### Application Logs (Pino)

**Location**: Check your log aggregation service (e.g., CloudWatch, Datadog) - to be configured

**Query for canary events** (once logging is implemented):
```json
{
  "logger": "canary",
  "level": "warn",
  "msg": "Selector fallback used"
}
```

**Key log fields**:
- `selector`: Contract name (e.g., "post-container")
- `fallback_depth`: Which fallback was used (0 = primary, 1+ = fallback)
- `primary`: Original selector that failed
- `used`: Selector that succeeded

**Example query** (CloudWatch Insights):
```sql
fields @timestamp, selector, fallback_depth, used
| filter logger = "canary" and level = "warn"
| sort @timestamp desc
| limit 100
```

### Metrics (Prometheus/Grafana)

**Grafana Dashboard**: To be created - Task 7.2 (example: https://grafana.yourapp.com/d/canary)

**Key Panels** (planned):

1. **Selector Success Rate** (last 24h)
   - Metric: `canary_selector_success_rate{name}`
   - Alert threshold: < 90%

2. **Fallback Depth Distribution**
   - Metric: `canary_fallback_usage{name, depth}`
   - Healthy: depth=0 > 95%

3. **Test Duration**
   - Metric: `canary_test_duration_seconds{suite}`
   - Alert threshold: > 300s (5 min)

4. **Failure Count**
   - Metric: `canary_selector_failure_total{name}`
   - Alert threshold: > 5 in 1 hour

**PromQL Queries**:
```promql
# Selector success rate
sum(rate(canary_selector_resolution_total{type="success"}[5m])) by (name)
/
sum(rate(canary_selector_resolution_total[5m])) by (name)

# Average fallback depth
avg(canary_fallback_usage) by (name)

# Failure spike detection
increase(canary_selector_failure_total[1h]) > 5
```

---

## How Eligibility Skips Appear in GitHub Actions

### Expected Skip Message (Fork PR)

**PR Checks Tab**:
```
✓ Canary PR Check - Skipped

This check was skipped because it's not required for this PR.
```

**Workflow Run Logs**:
```yaml
Run: Canary PR Check
Status: Skipped
Reason: Conditional check failed
  Condition: github.event.pull_request.head.repo.fork == false
  Evaluated: github.event.pull_request.head.repo.fork == true
```

### Unexpected Skip (Internal PR)

**PR Checks Tab**:
```
⚠ Canary PR Check - Skipped

This check was skipped. Click for details.
```

**Workflow Run Logs**:
```yaml
Run: Canary PR Check
Status: Skipped
Reason: Repository variable CANARY_ENABLED not set to 'true'
```

**Action**:
```bash
# Enable canary for repository
gh variable set CANARY_ENABLED --body "true"

# Re-run PR checks
gh pr checks <pr-number> --watch
```

### Debugging Eligibility Logic

**Add debug step** to workflow:
```yaml
- name: Debug Eligibility
  run: |
    echo "Is fork: ${{ github.event.pull_request.head.repo.fork }}"
    echo "CANARY_ENABLED: ${{ vars.CANARY_ENABLED }}"
    echo "Has FACEBOOK_STORAGE_STATE: ${{ secrets.FACEBOOK_STORAGE_STATE != '' }}"
```

**Expected output** (eligible PR):
```
Is fork: false
CANARY_ENABLED: true
Has FACEBOOK_STORAGE_STATE: true
```

---

## Recovery Procedures

### Emergency: Production Ingestion Down

**Symptoms**:
- No new requests processed in 30+ minutes
- `ingestion_requests_total` metric flatlined
- Multiple selector failures in logs

**Immediate Actions**:

1. **Enable Manual Ingestion Mode**:
   ```bash
   # Disable automated ingestion service
   kubectl scale deployment ingestion-service --replicas=0

   # Or set config flag
   curl -X POST https://api.yourapp.com/config/ingestion \
     -H "Authorization: Bearer $ADMIN_TOKEN" \
     -d '{"mode": "manual"}'
   ```

2. **Notify Stakeholders**:
   ```bash
   gh issue create \
     --title "🚨 P0: Production ingestion down due to canary failures" \
     --label "incident,P0" \
     --assignee @oncall-lead
   ```

3. **Implement Hotfix** (see Scenario 2, Step 4)

4. **Re-enable Service**:
   ```bash
   # After hotfix deployed
   kubectl scale deployment ingestion-service --replicas=3
   ```

---

### Degraded: Fallback Selectors in Use

**Symptoms**:
- Grafana alert: "Fallback depth > 1 for 7 days"
- Logs show consistent fallback usage

**Actions**:

1. **Assess Performance Impact**:
   ```promql
   # Check if fallback usage correlates with slower ingestion
   rate(ingestion_duration_seconds_sum[5m])
   /
   rate(ingestion_duration_seconds_count[5m])
   ```

2. **Schedule Selector Update**:
   ```bash
   gh issue create \
     --title "P3: Optimize selectors to reduce fallback usage" \
     --label "canary,optimization" \
     --milestone "Next Sprint"
   ```

3. **Promote Fallback to Primary** (if stable):
   ```typescript
   // src/canary/selectors.ts
   postContainer: {
     name: "post-container",
     version: "1.2.0",
     primary: '[role="article"]', // Promoted from fallback-1
     fallbacks: [
       '[data-pagelet*="FeedUnit"]', // Demoted to fallback
       '.userContentWrapper',
     ]
   }
   ```

---

### Recovery: Storage State Expired

**Symptoms**:
- All tests fail with "Login required"
- Screenshots show Facebook login page

**Actions**:

1. **Generate New Storage State**:
   ```bash
   npx playwright codegen --save-storage=.auth/facebook.json https://facebook.com
   # Login manually, wait 5 seconds, close browser
   ```

2. **Update GitHub Secret**:
   ```bash
   cat .auth/facebook.json | pbcopy
   # Settings → Secrets → FACEBOOK_STORAGE_STATE → Update
   ```

3. **Verify**:
   ```bash
   npx playwright test tests/canary/smoke.spec.ts
   ```

4. **Set Renewal Reminder**:
   ```bash
   # Add calendar event 30 days from now
   echo "Refresh Facebook storage state" | cal -A 30
   ```

---

## Post-Incident Review

After resolving a P0 or P1 incident, complete a **post-mortem**:

### Template

```markdown
# Canary Incident Post-Mortem

## Incident Summary
- **Date**: YYYY-MM-DD
- **Duration**: X hours
- **Severity**: P0 / P1 / P2
- **Oncall**: @engineer-name

## Timeline
- 02:05 UTC: Alert fired (scheduled canary failure)
- 02:15 UTC: Oncall acknowledged
- 02:30 UTC: Root cause identified (Facebook UI change)
- 03:00 UTC: Hotfix deployed
- 03:15 UTC: Verified resolution

## Root Cause
Facebook changed the `data-pagelet` attribute from `FeedUnit` to `FeedUnit_0`, breaking the `postContainer` selector.

## Impact
- Production ingestion degraded for 1 hour (50% success rate)
- 37 requests failed to ingest (manual recovery required)

## Resolution
Updated `src/canary/selectors.ts` to use `[data-pagelet*="FeedUnit"]` wildcard selector (PR #456).

## Action Items
- [ ] Add wildcard selectors for all `data-pagelet` attributes (#457)
- [ ] Increase scheduled test frequency to 4x/day (#458)
- [ ] Set up Facebook developer newsletter subscription (#459)
```

---

## Escalation Path

| Severity | First Contact | Escalate After | Escalate To |
|----------|---------------|----------------|-------------|
| P0 | Oncall engineer | 15 minutes | Team lead |
| P1 | Oncall engineer | 1 hour | Engineering manager |
| P2 | Oncall engineer | 4 hours | Team lead |
| P3 | Oncall engineer | 1 business day | Create issue, discuss in standup |

**Contact Methods**:
- Slack: `#oncall` channel
- PagerDuty: Trigger "Canary P0" incident
- Email: oncall@yourcompany.com

---

## Prevention Strategies

### Proactive Monitoring

1. **Weekly Health Check**:
   ```bash
   # Review Grafana dashboard every Monday
   open https://grafana.yourapp.com/d/canary
   # Check for:
   # - Fallback depth trending upward
   # - Success rate < 98%
   # - Test duration increasing
   ```

2. **Monthly Selector Audit**:
   ```bash
   # Review selector contracts
   git log --since="1 month ago" -- src/canary/selectors.ts
   # Identify frequently updated selectors (candidates for refactoring)
   ```

3. **Quarterly Storage State Refresh**:
   ```bash
   # Set calendar reminder every 90 days
   npx playwright codegen --save-storage=.auth/facebook.json https://facebook.com
   # Update FACEBOOK_STORAGE_STATE secret
   ```

### Defensive Selector Patterns

**Use wildcards** for frequently-changing attributes:
```typescript
// ❌ Brittle
primary: '[data-pagelet="FeedUnit"]'

// ✅ Resilient
primary: '[data-pagelet*="FeedUnit"]'
```

**Prefer semantic selectors** over fragile CSS classes:
```typescript
// ❌ Fragile
primary: '.userContentWrapper'

// ✅ Robust
primary: '[role="article"]'
```

**Maintain deep fallback chains**:
```typescript
fallbacks: [
  '[role="article"]',        // Semantic
  '[data-pagelet*="Feed"]',  // Data attribute
  '.userContentWrapper',     // Class name
  'div[data-ad-preview]'     // Last resort
]
```

---

## Quick Reference Commands

```bash
# Triage
gh run list --workflow=canary-pr.yml --limit 5
gh run download <run-id> --name canary-smoke-failures
npx playwright show-trace test-results/*/trace.zip

# Diagnose
open playwright-report/index.html
git log --oneline origin/main~5..origin/main -- src/canary/

# Mitigate
git checkout -b hotfix/canary-selectors-$(date +%Y%m%d)
npx playwright test tests/canary/smoke.spec.ts
gh pr create --title "HOTFIX: Canary Selector Update" --label "priority:high"

# Verify
gh run watch
curl https://api.yourapp.com/metrics/canary | jq '.selector_success_rate'

# Document
gh issue create --title "Canary failure post-mortem" --label "incident"
```

---

## Related Documentation

- [Architecture Overview](./architecture.md) - System design and CI workflows
- [How to Update Selectors](./how-to-update-selectors.md) - Detailed selector update process
- [CI Workflow Review](../CI_WORKFLOW_REVIEW.md) - General CI debugging
- [Project Roadmap](../PROJECT_ROADMAP.md#task-72) - Canary system context

---

**Oncall Resources**:
- Slack: `#oncall`
- Runbook: This document
- Grafana: https://grafana.yourapp.com/d/canary
- GitHub: https://github.com/YOUR_REPO/actions

**Questions?** Ping `@oncall-lead` in Slack or escalate via PagerDuty.