# UI Canary Architecture

This document captures the reference implementation for Task 7.2 (Automated canary testing for UI resilience). It mirrors the production-ready blueprint we aligned on and explains how the new Playwright-based system fits into the existing Face-Restore-AI stack.

## Objectives

- Detect UI breaking changes (selectors, layout, flows) in near real-time across PR, staging, and production environments.
- Provide a low-noise, high-signal gate for deploys while continuously monitoring prod health.
- Ensure selectors remain stable across CSS/layout changes, experiments, and localization by using contract-driven `data-testid` attributes.

## Components

| Component                  | Location                           | Notes                                                                                |
| -------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------ |
| Selector registry          | `src/canary/selectors.ts`          | Single source of truth for test IDs, selector groups, and critical selector sets.    |
| Resilient selector utility | `src/canary/resilient-selector.ts` | Applies semantic fallbacks + structured logging when primary selectors fail.         |
| Playwright config          | `playwright.config.ts`             | Configures browser, reporters, retry policy, and artifact paths.                     |
| Canary suites              | `tests/canary/**`                  | `smoke`, `meta` (selector stability), and `visual` suites seeded in this change set. |
| Runner                     | `scripts/run-canary.ts`            | CLI wrapper that produces machine-readable JSON summaries for CI/observability.      |
| Docs + SOP                 | `docs/ui-canary/*.md`              | Architecture overview (this file), selector maintenance, and on-call playbook.       |

## Execution model

1. **PR validation** – run `npm run canary:smoke` against staging/preview env. Hard fail on deterministic selector or flow breakages.
2. **Staging/post-deploy** – run `npm run canary` (full suite). Results flow into CI JSON summary + logs for release gating.
3. **Production monitoring** – schedule `npm run canary:smoke` every 10–15 minutes via GitHub Actions/Circle/Argo, pointed at production read-only canary accounts. Alerts should be triggered when:
   - A critical selector is unresolved twice in a row.
   - Failure rate >5% over the last 3 runs.
   - Visual diff exceeds configured thresholds.

## Observability

- Runner prints `{"type":"canary_summary", ...}` payloads that can be scraped into Prometheus or forwarded to log pipelines.
- `resolveWithFallback` logs JSON events for primary misses, fallback usage, and hard failures.
- Add Grafana panels for:
  - `canary_summary.failedTests`
  - Selector fallback counts grouped by selector
  - Visual diff failure ratio

## Future work

- Wire CI/GitHub Actions workflow using `scripts/run-canary.ts`.
- Persist Playwright traces + screenshots to object storage (S3/GCS) for fast triage links in alerts.
- Extend `SelectorPages` to cover notifications, messaging, and search surfacing once stable selectors are available.
- Integrate Slack / PagerDuty alerting using the JSON output stream.
