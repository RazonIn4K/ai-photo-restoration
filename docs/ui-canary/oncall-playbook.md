# UI Canary On-Call Playbook

## When an alert fires

1. **Read the summary**
   - Alerts include `type`, `suite`, `failedTests`, `selectors`, and artifact links.
   - Check Grafana dashboard for recent canary summary trends and fallback spikes.

2. **Classify severity**
   - **P1:** Login/composer/nav selectors failing with 2 consecutive runs → page PagerDuty.
   - **P2:** Visual diff or non-critical selector failures persisting for >30 min.
   - **P3:** Single-run failures or flaky timeouts → log in incident doc + open Jira if recurring.

3. **Investigate**
   - Download Playwright trace/screenshot from artifact bucket (to be wired in future iteration). For now, rerun locally with `npm run canary:smoke`.
   - Review recent deployments touching UI via `git log` or release dashboard.
   - Compare selector registry vs. DOM to confirm attribute drift.

4. **Mitigate**
   - If UI contract broke unintentionally, coordinate rollback or hotfix.
   - If change is expected, update `src/canary/selectors.ts`, refresh tests, and merge once CI passes.
   - For flaky infra (timeouts, auth), capture evidence and assign to owning team.

5. **Communicate**
   - Update the incident Slack thread and PagerDuty incident timeline with root cause + ETA.
   - Close alert only after two consecutive green runs to avoid silent regressions.

6. **Post-incident**
   - File a retro issue capturing:
     - Root cause
     - Blast radius
     - Follow-up tasks (e.g., strengthen selector stability coverage, tighten alerts).

## Useful commands

```bash
# Smoke suite against staging
CANARY_BASE_URL=https://staging.example.com npm run canary:smoke

# Full suite with verbose Playwright logs
DEBUG=pw:api npm run canary
```

## Required artifacts

- Canary storage state file: `tests/canary/storageState/canary-user.json`.
- Canary credentials: `CANARY_USER_EMAIL`, `CANARY_USER_PASSWORD` secrets (managed via CI secret store).
