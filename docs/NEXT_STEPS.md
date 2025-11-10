# Next Steps - AI Photo Restoration Project

**Status**: All PRs rebased, lint/tests passing, ready for merge sequence  
**Date**: November 10, 2025

## Current State ✅

### Ready to Merge (In Order)

1. **PR #17** - Formatting + security baseline (prettier, lint fixes, security improvements)
2. **PR #11** - UI canary feature (Playwright-based selector testing)
3. **PR #12** - Standards/Zyte integration (third-party extraction)
4. **PR #13** - CI hardening (workflow improvements)
5. **PR #14** - Documentation updates
6. **PR #16** - Mock data workflow (development tooling)
7. **Accessibility backend PR** - Alt-text API and backend support

### Completed Work

- ✅ Task 8.1: React review dashboard with full backend integration
- ✅ Mock data mode with seed scripts
- ✅ Development workflow (concurrent server/client)
- ✅ All branches rebased on formatting baseline
- ✅ Lint and tests passing on all branches

## Merge Sequence (Critical Path)

### Phase 1: Foundation (Immediate)

**Goal**: Establish clean baseline and unblock all feature work

```bash
# 1. Merge PR #17 (formatting + security baseline)
# This unblocks everything else
git checkout main
git merge pr-17-formatting-security-baseline
git push origin main

# 2. Verify CI passes on main
# All downstream PRs are already rebased on this
```

**Impact**:

- Establishes consistent code formatting
- Fixes all lint warnings
- Improves security posture
- Unblocks all other PRs

### Phase 2: Core Features (Same Day)

**Goal**: Land all rebased feature work

```bash
# 3. Merge PR #11 (UI canaries)
git merge pr-11-ui-canaries
git push origin main

# 4. Merge PR #12 (Zyte integration)
git merge pr-12-zyte-integration
git push origin main

# 5. Merge PR #13 (CI hardening)
git merge pr-13-ci-hardening
git push origin main

# 6. Merge PR #14 (docs)
git merge pr-14-docs
git push origin main
```

**Impact**:

- Completes Task 7.2 (UI canary testing)
- Completes Task 7.3 (Zyte integration)
- Improves CI reliability
- Updates documentation

### Phase 3: Development Tooling (Same Day)

**Goal**: Enable efficient dashboard development

```bash
# 7. Merge PR #16 (mock data workflow)
git merge pr-16-mock-data-workflow
git push origin main

# 8. Merge accessibility backend PR
git merge pr-accessibility-backend
git push origin main
```

**Impact**:

- Enables mock data mode for dashboard testing
- Adds concurrent dev server scripts
- Provides alt-text API backend
- Unblocks Task 8.2 frontend work

## Phase 4: Frontend Accessibility (Next Sprint)

### Task 8.2: Implement Accessibility Features

**Branch**: `feature/task-8.2-accessibility-frontend`  
**Dependencies**: PR #16 (mock data), Accessibility backend PR

#### Subtasks

##### 8.2.1: Automatic Alt-Text Suggestions

- Integrate with new `/api/requests/:requestId/suggest-alt-text` endpoint
- Add "Generate Suggestion" button in ApprovalPanel
- Display suggestions with confidence scores
- Allow editing before approval
- Cache suggestions to avoid redundant API calls

**Files to modify**:

- `client/src/components/ApprovalPanel.tsx`
- `client/src/api/client.ts`

##### 8.2.2: Keyboard Navigation

- Implement keyboard shortcuts:
  - `Tab` / `Shift+Tab` - Navigate between elements
  - `Enter` - Approve/submit
  - `Escape` - Cancel/close
  - `Arrow Left/Right` - Move slider
  - `Space` - Toggle blur/reveal
  - `N` / `P` - Next/Previous request
- Add focus indicators (visible outline)
- Implement focus trap in modals
- Add skip links for screen readers

**Files to modify**:

- `client/src/pages/ReviewDashboard.tsx`
- `client/src/components/ImageComparison.tsx`
- `client/src/components/RequestList.tsx`
- `client/src/components/ApprovalPanel.tsx`

##### 8.2.3: ARIA Labels and Screen Reader Support

- Add `aria-label` to all interactive elements
- Implement `aria-live` regions for status updates
- Add `role` attributes where semantic HTML isn't sufficient
- Provide descriptive labels for form inputs
- Add `aria-describedby` for help text
- Implement proper heading hierarchy

**Files to modify**:

- All component files in `client/src/components/`
- `client/src/pages/ReviewDashboard.tsx`

##### 8.2.4: High Contrast Mode

- Add theme toggle (light/dark/high-contrast)
- Store preference in localStorage
- Ensure 7:1 contrast ratio for text (WCAG AAA)
- Use CSS custom properties for theming
- Test with Windows High Contrast Mode

**Files to create/modify**:

- `client/src/styles/themes.css`
- `client/src/stores/themeStore.ts`
- `client/src/index.css`

##### 8.2.5: Responsive Design Improvements

- Test on mobile devices (320px - 768px)
- Implement touch-friendly controls (44px minimum)
- Add responsive breakpoints
- Optimize image comparison for mobile
- Test with screen rotation

**Files to modify**:

- `client/src/pages/ReviewDashboard.module.css`
- `client/src/components/ImageComparison.module.css`

##### 8.2.6: WCAG 2.1 AA Compliance Validation

- Integrate `@axe-core/react` for automated testing
- Add `eslint-plugin-jsx-a11y` for linting
- Create accessibility test suite
- Document compliance in README
- Add CI job for accessibility checks

**Files to create**:

- `client/src/tests/accessibility.test.tsx`
- `client/.eslintrc.accessibility.json`
- `.github/workflows/accessibility-check.yml`

## Implementation Plan for Task 8.2

### Week 1: Backend Integration & Keyboard Nav

**Days 1-2**: Alt-text suggestions integration

- Connect to backend API
- Add UI for suggestions
- Handle loading/error states

**Days 3-5**: Keyboard navigation

- Implement keyboard shortcuts
- Add focus management
- Test with keyboard-only navigation

### Week 2: ARIA & Visual Improvements

**Days 1-3**: ARIA labels and screen reader support

- Add semantic HTML where possible
- Implement ARIA attributes
- Test with NVDA/JAWS/VoiceOver

**Days 4-5**: High contrast mode

- Create theme system
- Implement theme toggle
- Test contrast ratios

### Week 3: Responsive & Validation

**Days 1-2**: Responsive design

- Mobile optimization
- Touch-friendly controls
- Cross-device testing

**Days 3-5**: WCAG validation

- Integrate axe-core
- Fix identified issues
- Document compliance

## Testing Strategy

### Manual Testing

- [ ] Test with keyboard only (no mouse)
- [ ] Test with screen reader (NVDA on Windows, VoiceOver on Mac)
- [ ] Test in high contrast mode
- [ ] Test on mobile devices (iOS Safari, Android Chrome)
- [ ] Test with browser zoom (200%, 400%)
- [ ] Test with reduced motion preference

### Automated Testing

- [ ] Add axe-core accessibility tests
- [ ] Add keyboard navigation tests (Playwright)
- [ ] Add visual regression tests for themes
- [ ] Add mobile viewport tests

### Compliance Checklist

- [ ] WCAG 2.1 Level A (all criteria)
- [ ] WCAG 2.1 Level AA (all criteria)
- [ ] Keyboard accessible
- [ ] Screen reader compatible
- [ ] Color contrast compliant
- [ ] Focus indicators visible
- [ ] No keyboard traps
- [ ] Semantic HTML structure

## Success Criteria

### Task 8.2 Complete When:

1. ✅ All keyboard shortcuts implemented and documented
2. ✅ All interactive elements have ARIA labels
3. ✅ High contrast mode available and functional
4. ✅ Responsive design works on mobile (320px+)
5. ✅ axe-core reports 0 violations
6. ✅ Manual screen reader testing passes
7. ✅ WCAG 2.1 AA compliance documented
8. ✅ Accessibility tests added to CI

## Risk Mitigation

### Potential Blockers

1. **Alt-text API performance** - Cache suggestions, show loading state
2. **Screen reader compatibility** - Test early and often with real users
3. **Mobile touch interactions** - Use touch-friendly sizes (44px min)
4. **Theme switching complexity** - Use CSS custom properties for simplicity

### Contingency Plans

- If alt-text API is slow: Implement client-side caching
- If screen reader issues: Consult ARIA authoring practices guide
- If mobile issues: Prioritize desktop, iterate on mobile
- If theme issues: Start with dark mode only, add high contrast later

## Post-Task 8.2 Roadmap

### Task 8.3: Enhanced NSFW Handling

- Content flagging banners with severity levels
- Operator action logging
- Configurable blur intensity
- Content warning acknowledgment

### Task 8.4: Posting Workflow

- Preformatted reply text generation
- C2PA manifest embedding
- WACZ capture functionality
- Posting proof validation

### Task 9: Safety Validation System

- Image hash validation
- EXIF metadata validation
- C2PA manifest validation
- Comprehensive test suite

## Resources

### Documentation

- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/)
- [axe-core Documentation](https://github.com/dequelabs/axe-core)
- [WebAIM Screen Reader Testing](https://webaim.org/articles/screenreader_testing/)

### Tools

- [axe DevTools Browser Extension](https://www.deque.com/axe/devtools/)
- [WAVE Browser Extension](https://wave.webaim.org/extension/)
- [Lighthouse Accessibility Audit](https://developers.google.com/web/tools/lighthouse)
- [Color Contrast Analyzer](https://www.tpgi.com/color-contrast-checker/)

### Internal Docs

- `docs/TASK_8.1_SUMMARY.md` - Dashboard architecture
- `docs/DEV_MOCK_DATA.md` - Mock data usage
- `docs/PROJECT_STATUS.md` - Overall project status
- `.kiro/specs/ai-photo-restoration/requirements.md` - Requirement 3.8

## Communication Plan

### Daily Standups

- Report progress on current subtask
- Flag any blockers immediately
- Share accessibility findings

### Weekly Reviews

- Demo accessibility features
- Review WCAG compliance progress
- Adjust timeline if needed

### Stakeholder Updates

- After Phase 3 merges: "Development tooling complete, starting accessibility"
- After Week 1: "Backend integration and keyboard nav complete"
- After Week 2: "ARIA and visual improvements complete"
- After Week 3: "Task 8.2 complete, WCAG 2.1 AA compliant"

## Questions to Resolve

1. **Alt-text API**: Should we support multiple AI models for suggestions?
2. **Theme preference**: Should we respect OS theme preference by default?
3. **Mobile priority**: Should we optimize for mobile-first or desktop-first?
4. **Screen reader testing**: Do we have access to real screen reader users for testing?
5. **Compliance documentation**: Where should we publish WCAG compliance statement?

---

**Next Action**: Merge PR #17 to unblock everything else, then proceed with merge sequence.
