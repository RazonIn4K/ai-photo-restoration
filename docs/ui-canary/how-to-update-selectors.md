# Updating Canary Selectors

Selectors are contractually owned attributes that live in `src/canary/selectors.ts`. Follow this procedure whenever UI components change:

1. **Add/modify selectors**
   - Use `data-testid`/`data-e2e` attributes whenever possible.
   - Update the relevant group (login/nav/composer/etc.).
   - If the selector is critical, also update `CriticalSelectorSet` and `SelectorPages` for stability checks.

2. **Update tests in the same PR**
   - Smoke tests must continue referencing the registry (never inline CSS selectors).
   - If structure changed, adjust `tests/canary/smoke/*.spec.ts`, `meta/selector-stability`, and any visual baselines.

3. **Refresh storage state / credentials**
   - Use `npx playwright codegen` or `npx playwright test --update-snapshots` to capture a new storage state for the canary user if login behavior changed.

4. **Rebuild baselines**
   - For visual specs, run `CANARY_BASE_URL=<env> npm run canary:visual -- --update-snapshots` to generate fresh artifacts in `tests/canary/visual/baseline/`.

5. **Document the change**
   - Mention selector updates in the PR description + changelog so downstream teams know the contract shifted.

6. **Ownership and reviews**
   - `CODEOWNERS` enforces review by `@ui-platform-team` (selectors) and `@qa-infra-team` (tests). Keep both teams in the loop when deprecating selectors.
