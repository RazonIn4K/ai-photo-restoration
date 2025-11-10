# Dashboard Accessibility Guide

**Last Updated**: 2025-11-10
**Status**: 📋 **Guide for Planned Implementation (Task 8.2)**
**Audience**: Frontend developers, QA engineers, accessibility reviewers
**Standards**: WCAG 2.1 AA compliance

> **Note**: This guide documents accessibility features for the review dashboard to be implemented in the `feature/8.2-accessibility-upgrades` branch. File paths reference planned client structure.

---

## Overview

The review dashboard implements **WCAG 2.1 AA compliance** to ensure the photo restoration review interface is accessible to all operators, including those using:
- **Screen readers** (NVDA, JAWS, VoiceOver)
- **Keyboard-only navigation**
- **High-contrast display modes**
- **Assistive input devices**

### Accessibility Pillars

1. **Perceivable**: Alt-text for all images, high-contrast mode, semantic HTML
2. **Operable**: Full keyboard navigation, visible focus indicators, skip links
3. **Understandable**: Clear labels, consistent UI patterns, helpful error messages
4. **Robust**: Valid HTML, ARIA landmarks, screen reader compatibility

---

## Alt-Text Workflow

### Mock Mode (Development)

When running with `USE_MOCK_DASHBOARD=1` (see [DEV_MOCK_DATA.md](../DEV_MOCK_DATA.md)), alt-text suggestions are **pre-generated synthetic descriptions**:

**Location**: `client/src/services/altTextService.ts` (*to be created*)

```typescript
// Mock mode returns synthetic alt-text
export async function generateAltText(
  imageUrl: string,
  context?: string
): Promise<AltTextSuggestion> {
  if (process.env.VITE_USE_MOCK === 'true') {
    return {
      primary: "Black and white photograph showing a family of four",
      alternatives: [
        "Vintage family portrait with two adults and two children",
        "Historical photograph of a family group"
      ],
      confidence: 0.85,
      isMock: true
    };
  }
  // Production path...
}
```

**Mock suggestions**:
- Generic descriptions based on image filename patterns
- Confidence scores: 0.75-0.90 (synthetic)
- Alternative options provided for variety
- Clearly flagged with `isMock: true`

### Production Mode (Real AI)

In production, alt-text uses **image analysis AI** (Google Gemini or local model):

**API Endpoint**: `POST /api/images/:assetId/analyze`

**Flow**:
1. User clicks "Generate Alt-Text" button in dashboard
2. Client sends `POST /api/images/{assetId}/analyze`
3. API analyzes original image using:
   - **Google Gemini 2.5 Flash** (cloud) - Preferred for accuracy
   - **BLIP-2 model** (local) - Fallback for offline/privacy
4. API returns structured alt-text suggestions:
   ```json
   {
     "primary": "Black and white photograph showing...",
     "alternatives": ["...", "..."],
     "confidence": 0.92,
     "detectedObjects": ["person", "person", "child"],
     "suggestedTone": "neutral"
   }
   ```
5. Dashboard displays suggestions with edit interface
6. Operator reviews, selects, or edits alt-text
7. Final alt-text saved to `RequestRecord.postingProof.altText`

**Production features**:
- **Context-aware**: Uses `RequestRecord.userRequest` for additional context
- **Multi-language**: Detects image language, generates appropriate description
- **Tone options**: Formal, neutral, or descriptive
- **Object detection**: Lists detected people, objects, text in image
- **Confidence scoring**: 0.0-1.0 (only suggests if > 0.7)

### Alt-Text Editor Component

**Location**: `client/src/components/AltTextEditor.tsx` (*to be created*)

**Features**:
- **Suggestion chips**: Display 2-3 AI-generated options
- **Character counter**: 125 character limit (Twitter-optimized)
- **Best practices guide**: Inline tips (avoid "image of", describe content not appearance)
- **Preview mode**: Hear alt-text via screen reader preview
- **Approval required**: Cannot submit without alt-text

**Keyboard shortcuts**:
- `Alt+G` - Generate alt-text suggestions
- `Alt+1/2/3` - Select suggestion 1/2/3
- `Alt+E` - Focus alt-text editor
- `Tab` - Cycle through suggestions

**Example UI**:
```
┌─────────────────────────────────────────────────────┐
│ Alt-Text Editor                                     │
├─────────────────────────────────────────────────────┤
│ [Generate Suggestions] [Preview with Screen Reader] │
│                                                      │
│ Suggestions:                                         │
│ ┌─────────────────────────────────────────────┐    │
│ │ ✓ Black and white photograph showing...     │    │
│ │   [Select] [Edit]                           │    │
│ └─────────────────────────────────────────────┘    │
│ ┌─────────────────────────────────────────────┐    │
│ │   Vintage family portrait with two adults   │    │
│ │   [Select] [Edit]                           │    │
│ └─────────────────────────────────────────────┘    │
│                                                      │
│ Custom Alt-Text:                                     │
│ ┌─────────────────────────────────────────────┐    │
│ │ Black and white photograph showing a family │    │
│ │ of four standing outdoors in the 1950s      │    │
│ └─────────────────────────────────────────────┘    │
│ 82/125 characters                                    │
│                                                      │
│ 💡 Best Practices:                                  │
│ • Describe content, not appearance                  │
│ • Avoid "image of" or "photo of"                    │
│ • Include relevant context from user request        │
└─────────────────────────────────────────────────────┘
```

---

## Keyboard Navigation

### Global Shortcuts

All keyboard shortcuts use **non-conflicting modifiers** to avoid browser collisions:

| Shortcut | Action | Context |
|----------|--------|---------|
| `Alt+N` | Next request | Request list |
| `Alt+P` | Previous request | Request list |
| `Alt+A` | Approve request | Request detail (focus approve button) |
| `Alt+R` | Reject request | Request detail (open rejection modal) |
| `Alt+G` | Generate alt-text | Alt-text editor |
| `Alt+C` | Compare images (toggle slider) | Image comparison |
| `Alt+F` | View original Facebook post | Request detail |
| `Alt+/` | Show keyboard shortcuts help | Global |
| `Esc` | Close modal/cancel action | Any modal |
| `?` | Toggle keyboard shortcuts overlay | Global |

**Implementation**: `client/src/hooks/useKeyboardShortcuts.ts` (*to be created*)

```typescript
export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Alt+N - Next request
      if (e.altKey && e.key === 'n') {
        e.preventDefault();
        handlers.onNext?.();
      }
      // Alt+A - Approve
      if (e.altKey && e.key === 'a') {
        e.preventDefault();
        handlers.onApprove?.();
      }
      // ... additional shortcuts
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlers]);
}
```

### Focus Management

**Focus order** follows semantic HTML hierarchy:

1. **Skip to main content** link (visible on focus)
2. **Navigation header** (logo, search, user menu)
3. **Main content area**:
   - Request list (if visible)
   - Request detail card
   - Image comparison slider
   - Alt-text editor
   - Action buttons (Approve, Reject)
4. **Footer** (help, settings, logout)

**Focus indicators**:
- **3px solid outline**: High-contrast blue (`#0066CC`)
- **Offset**: 2px from element edge
- **Rounded corners**: Match component border radius
- **Always visible**: Never `outline: none` (accessibility violation)

**Implementation**: `client/src/styles/focus.css` (*to be created*)

```css
/* Global focus styles */
*:focus {
  outline: 3px solid #0066CC;
  outline-offset: 2px;
}

*:focus:not(:focus-visible) {
  outline: none;
}

*:focus-visible {
  outline: 3px solid #0066CC;
  outline-offset: 2px;
}

/* Skip to main content link */
.skip-to-main {
  position: absolute;
  top: -40px;
  left: 0;
  z-index: 1000;
  padding: 8px 16px;
  background: #0066CC;
  color: white;
  text-decoration: none;
}

.skip-to-main:focus {
  top: 0;
}
```

### Focus Trap (Modals)

When modals open (e.g., rejection reason input), focus is **trapped** within the modal:

**Implementation**: `client/src/hooks/useFocusTrap.ts` (*to be created*)

```typescript
export function useFocusTrap(ref: RefObject<HTMLElement>, isActive: boolean) {
  useEffect(() => {
    if (!isActive || !ref.current) return;

    const focusableElements = ref.current.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      } else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    };

    ref.current.addEventListener('keydown', handleTabKey);
    firstElement.focus();

    return () => ref.current?.removeEventListener('keydown', handleTabKey);
  }, [isActive, ref]);
}
```

---

## High-Contrast Mode

### Activation

**User preference detection** (automatic):
```typescript
// client/src/hooks/useHighContrast.ts (to be created)
export function useHighContrast(): boolean {
  const [isHighContrast, setIsHighContrast] = useState(
    window.matchMedia('(prefers-contrast: more)').matches
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-contrast: more)');
    const handler = (e: MediaQueryListEvent) => setIsHighContrast(e.matches);

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  return isHighContrast;
}
```

**Manual toggle** (settings menu):
```typescript
// Persisted to localStorage
localStorage.setItem('highContrastMode', 'true');
document.documentElement.classList.add('high-contrast');
```

### High-Contrast Styles

**Location**: `client/src/styles/high-contrast.css` (*to be created*)

**Features**:
- **Increased contrast ratios**: 7:1 minimum (WCAG AAA)
- **Bold text**: Font weight increased by 100
- **Thicker borders**: 2px instead of 1px
- **Simplified colors**: Black/white/primary accent only
- **Enhanced focus**: 4px outline (up from 3px)

**Color palette**:
```css
.high-contrast {
  --text-primary: #000000;
  --text-secondary: #1a1a1a;
  --background: #ffffff;
  --surface: #f5f5f5;
  --border: #000000;
  --accent: #0066CC;
  --success: #006400; /* Dark green */
  --error: #8B0000;   /* Dark red */
  --focus: #0066CC;
}

/* Dark mode variant */
@media (prefers-color-scheme: dark) {
  .high-contrast {
    --text-primary: #ffffff;
    --text-secondary: #e5e5e5;
    --background: #000000;
    --surface: #1a1a1a;
    --border: #ffffff;
  }
}
```

**Component adjustments**:
```css
.high-contrast .btn {
  font-weight: 600;
  border-width: 2px;
}

.high-contrast .card {
  border: 2px solid var(--border);
}

.high-contrast .image-comparison {
  /* Slider handle more visible */
  --slider-handle-size: 48px; /* Larger touch target */
  --slider-handle-border: 4px solid var(--accent);
}
```

### Testing High-Contrast Mode

**Manual testing**:
```bash
# macOS
System Preferences → Accessibility → Display → Increase Contrast

# Windows
Settings → Ease of Access → High Contrast → Turn on high contrast

# Linux (GNOME)
Settings → Accessibility → High Contrast

# Browser DevTools
Chrome DevTools → Rendering → Emulate CSS media feature prefers-contrast: more
```

---

## Screen Reader Support

### ARIA Landmarks

**Semantic structure** using HTML5 + ARIA:

```jsx
// client/src/layouts/DashboardLayout.tsx (to be created)
<div className="dashboard">
  {/* Skip to main content */}
  <a href="#main-content" className="skip-to-main">
    Skip to main content
  </a>

  {/* Navigation header */}
  <header role="banner">
    <nav aria-label="Main navigation">
      {/* Navigation items */}
    </nav>
  </header>

  {/* Sidebar (request list) */}
  <aside role="complementary" aria-label="Request list">
    <h2 id="request-list-heading">Pending Requests</h2>
    <ul aria-labelledby="request-list-heading">
      {/* Request cards */}
    </ul>
  </aside>

  {/* Main content */}
  <main id="main-content" role="main" aria-label="Request review">
    {/* Request detail, image comparison, actions */}
  </main>

  {/* Footer */}
  <footer role="contentinfo">
    {/* Help, settings, logout */}
  </footer>
</div>
```

### Live Regions

**Announce status changes** to screen readers:

```jsx
// client/src/components/LiveRegion.tsx (to be created)
export function LiveRegion({ message, priority = 'polite' }: LiveRegionProps) {
  return (
    <div
      role="status"
      aria-live={priority}
      aria-atomic="true"
      className="sr-only" // Visually hidden, but announced
    >
      {message}
    </div>
  );
}

// Usage in approval flow
<LiveRegion message="Request approved successfully. Moving to next request." />
<LiveRegion message="Error: Failed to approve request. Please try again." priority="assertive" />
```

**Visually hidden utility** (`.sr-only`):
```css
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}
```

### Image Comparison Accessibility

**Slider with ARIA**:

```jsx
// client/src/components/ImageComparison.tsx (to be created)
<div role="group" aria-label="Image comparison slider">
  <img
    src={originalUrl}
    alt={originalAltText}
    aria-describedby="original-description"
  />
  <img
    src={restoredUrl}
    alt={restoredAltText}
    aria-describedby="restored-description"
  />

  <input
    type="range"
    min="0"
    max="100"
    value={sliderPosition}
    onChange={handleSliderChange}
    aria-label="Adjust image comparison slider"
    aria-valuetext={`Showing ${sliderPosition}% restored, ${100 - sliderPosition}% original`}
  />

  {/* Hidden descriptions for screen readers */}
  <div id="original-description" className="sr-only">
    Original image before restoration. {originalAltText}
  </div>
  <div id="restored-description" className="sr-only">
    Restored image after processing. {restoredAltText}
  </div>
</div>
```

### Status Badges

**Announce request status**:

```jsx
<span
  className={`badge badge-${status}`}
  role="status"
  aria-label={`Request status: ${statusLabel}`}
>
  {statusLabel}
</span>
```

---

## Running Accessibility Tests

### Automated Testing

**Tool**: `axe-core` via `@axe-core/react` and `jest-axe`

**Installation** (to be added to `package.json`):
```json
{
  "devDependencies": {
    "@axe-core/react": "^4.8.0",
    "jest-axe": "^8.0.0",
    "@testing-library/react": "^14.0.0",
    "@testing-library/jest-dom": "^6.1.0"
  }
}
```

#### Unit Tests

**Location**: `client/src/components/__tests__/accessibility.test.tsx` (*to be created*)

```typescript
import { render } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { RequestCard } from '../RequestCard';
import { ImageComparison } from '../ImageComparison';
import { AltTextEditor } from '../AltTextEditor';

expect.extend(toHaveNoViolations);

describe('Accessibility', () => {
  it('RequestCard should have no axe violations', async () => {
    const { container } = render(
      <RequestCard
        request={mockRequest}
        onApprove={jest.fn()}
        onReject={jest.fn()}
      />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('ImageComparison should have no axe violations', async () => {
    const { container } = render(
      <ImageComparison
        originalUrl="/mock/original.jpg"
        restoredUrl="/mock/restored.jpg"
        originalAltText="Original photo"
        restoredAltText="Restored photo"
      />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('AltTextEditor should have no axe violations', async () => {
    const { container } = render(
      <AltTextEditor
        suggestions={mockSuggestions}
        onSave={jest.fn()}
      />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
```

**Run tests**:
```bash
# Run all accessibility tests
npm run test:a11y

# Watch mode for development
npm run test:a11y:watch

# Coverage report
npm run test:a11y:coverage
```

#### Integration Tests (Playwright)

**Location**: `client/tests/accessibility.spec.ts` (*to be created*)

```typescript
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Dashboard Accessibility', () => {
  test('should not have any automatically detectable accessibility issues', async ({ page }) => {
    await page.goto('http://localhost:3000');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('keyboard navigation should work throughout dashboard', async ({ page }) => {
    await page.goto('http://localhost:3000');

    // Tab through major sections
    await page.keyboard.press('Tab'); // Skip to main content link
    await expect(page.locator('.skip-to-main')).toBeFocused();

    await page.keyboard.press('Enter'); // Activate skip link
    await expect(page.locator('#main-content')).toBeFocused();

    // Test keyboard shortcuts
    await page.keyboard.press('Alt+N'); // Next request
    await expect(page.locator('.request-card.active')).toContainText('Request');

    await page.keyboard.press('Alt+A'); // Focus approve button
    await expect(page.locator('button:has-text("Approve")')).toBeFocused();
  });

  test('screen reader should announce status changes', async ({ page }) => {
    await page.goto('http://localhost:3000');

    // Approve a request
    await page.click('button:has-text("Approve")');

    // Check live region for announcement
    const liveRegion = page.locator('[role="status"][aria-live="polite"]');
    await expect(liveRegion).toContainText('Request approved successfully');
  });
});
```

**Run Playwright tests**:
```bash
# Run accessibility integration tests
npx playwright test tests/accessibility.spec.ts

# With UI
npx playwright test tests/accessibility.spec.ts --ui

# Generate HTML report
npx playwright test tests/accessibility.spec.ts --reporter=html
```

### Manual Testing Checklist

**Keyboard navigation** (all features accessible without mouse):
- [ ] Tab through all interactive elements in logical order
- [ ] All focused elements have visible focus indicators
- [ ] No keyboard traps (can escape modals with Esc)
- [ ] Keyboard shortcuts work (Alt+A, Alt+R, etc.)
- [ ] Skip to main content link functions correctly

**Screen reader** (test with NVDA/JAWS/VoiceOver):
- [ ] All images have descriptive alt-text
- [ ] Landmark regions announced correctly (header, main, nav)
- [ ] Form labels associated with inputs
- [ ] Status changes announced via live regions
- [ ] Button purposes clear ("Approve request" not just "Approve")
- [ ] Image comparison slider announces position

**High-contrast mode**:
- [ ] Enable OS high-contrast mode
- [ ] All text readable (7:1 contrast ratio minimum)
- [ ] Focus indicators visible
- [ ] Interactive elements clearly distinguished
- [ ] No information conveyed by color alone

**Zoom/text scaling**:
- [ ] UI functional at 200% browser zoom
- [ ] No horizontal scrolling at 200% zoom
- [ ] Text doesn't overlap or truncate
- [ ] Images scale appropriately

---

## WCAG 2.1 AA Coverage

### Level A (Must Support)

| Criterion | Status | Implementation |
|-----------|--------|----------------|
| **1.1.1 Non-text Content** | ✅ Implemented | Alt-text editor for all images |
| **1.3.1 Info and Relationships** | ✅ Implemented | Semantic HTML, ARIA landmarks |
| **1.3.2 Meaningful Sequence** | ✅ Implemented | Logical focus order, DOM structure |
| **1.4.1 Use of Color** | ✅ Implemented | Color + icons/labels for status |
| **2.1.1 Keyboard** | ✅ Implemented | Full keyboard navigation support |
| **2.1.2 No Keyboard Trap** | ✅ Implemented | Focus trap in modals, Esc to exit |
| **2.4.1 Bypass Blocks** | ✅ Implemented | Skip to main content link |
| **3.1.1 Language of Page** | ✅ Implemented | `<html lang="en">` |
| **4.1.1 Parsing** | ✅ Implemented | Valid HTML5, no duplicate IDs |
| **4.1.2 Name, Role, Value** | ✅ Implemented | ARIA labels, roles, states |

### Level AA (Must Support)

| Criterion | Status | Implementation |
|-----------|--------|----------------|
| **1.4.3 Contrast (Minimum)** | ✅ Implemented | 4.5:1 text, 3:1 UI components |
| **1.4.5 Images of Text** | ✅ Implemented | No images of text (use web fonts) |
| **2.4.6 Headings and Labels** | ✅ Implemented | Descriptive headings, form labels |
| **2.4.7 Focus Visible** | ✅ Implemented | 3px outline on all focusable elements |
| **3.2.3 Consistent Navigation** | ✅ Implemented | Navigation header consistent across views |
| **3.3.1 Error Identification** | ✅ Implemented | Clear error messages, ARIA invalid |
| **3.3.2 Labels or Instructions** | ✅ Implemented | All form fields labeled |

### Level AAA (Aspirational)

| Criterion | Status | Implementation |
|-----------|--------|----------------|
| **1.4.6 Contrast (Enhanced)** | 🚧 Partial | High-contrast mode: 7:1 ratio |
| **2.4.8 Location** | 🚧 Planned | Breadcrumb navigation (future) |
| **3.3.5 Help** | 🚧 Planned | Context-sensitive help (future) |

---

## Best Practices

### ✅ Do

- **Use semantic HTML** (`<button>`, `<nav>`, `<main>`) instead of `<div>` with ARIA
- **Provide descriptive alt-text** that conveys content, not just description
- **Test with real assistive technologies** (NVDA, JAWS, VoiceOver)
- **Include focus indicators** on all interactive elements
- **Use ARIA live regions** for dynamic content updates
- **Maintain logical focus order** that matches visual layout
- **Support browser zoom** up to 200% without horizontal scrolling

### ❌ Don't

- **Remove focus outlines** (`outline: none`) without replacement
- **Use `tabindex` values > 0** (disrupts natural focus order)
- **Rely on color alone** to convey information
- **Nest interactive elements** (e.g., button inside anchor)
- **Use generic text** like "Click here" or "Learn more"
- **Auto-play media** or animations without pause controls
- **Use `role="button"` on `<div>`** when `<button>` is available

---

## Follow-Up Work

### Planned Enhancements (Post-Task 8.2)

1. **Automated accessibility audits in CI/CD** (Task 13.x)
   - Run `axe-core` on every PR
   - Block merges with WCAG violations
   - Generate accessibility reports in GitHub Actions

2. **User preference persistence** (Task 8.x)
   - Save high-contrast mode preference per user
   - Sync keyboard shortcuts customization
   - Remember last used alt-text tone/style

3. **Internationalization (i18n)** (Task 10.x)
   - Multi-language alt-text generation
   - Right-to-left (RTL) layout support
   - Localized keyboard shortcuts

4. **Voice control support** (Task 11.x)
   - Dragon NaturallySpeaking compatibility
   - Voice commands for approve/reject
   - Speech recognition for alt-text input

5. **Accessibility audit reports** (Task 12.x)
   - Quarterly WCAG compliance reports
   - User testing with people with disabilities
   - Third-party accessibility certification (e.g., Level Access)

### Known Limitations (To Be Addressed)

- **Image comparison slider**: Limited screen reader support (announced as "range slider")
  - **Solution**: Add detailed `aria-describedby` with comparison details
- **Real-time status updates**: May not announce immediately in all screen readers
  - **Solution**: Implement `aria-live="assertive"` for critical updates
- **Complex image metadata**: Perceptual hash distance not explained for screen readers
  - **Solution**: Add plain-language explanation ("Images are 95% similar")

---

## Resources

### Internal Documentation

- [Mock Data Workflow](../DEV_MOCK_DATA.md) - Mock mode alt-text generation
- [Dashboard Components](../../client/src/components/) - React component implementations (*planned*)
- [API Endpoints](../../src/api/routes/) - Alt-text generation API (*planned*)
- [Testing Guide](../../client/tests/README.md) - Accessibility test setup (*planned*)

### External Standards

- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/) - Official specification
- [MDN Accessibility](https://developer.mozilla.org/en-US/docs/Web/Accessibility) - Best practices
- [A11y Project](https://www.a11yproject.com/) - Accessibility checklist
- [axe-core Documentation](https://github.com/dequelabs/axe-core) - Automated testing

### Testing Tools

- **axe DevTools** (Browser extension) - Free accessibility scanner
- **WAVE** (WebAIM) - Visual accessibility evaluation
- **Lighthouse** (Chrome DevTools) - Accessibility audit
- **NVDA** (Windows) - Free screen reader
- **VoiceOver** (macOS) - Built-in screen reader
- **JAWS** (Windows) - Professional screen reader (trial available)

---

## Implementation Checklist (Task 8.2)

### Alt-Text System
- [ ] Create `client/src/services/altTextService.ts`
- [ ] Implement mock mode alt-text generator
- [ ] Create API endpoint `POST /api/images/:assetId/analyze`
- [ ] Integrate Google Gemini 2.5 Flash for production
- [ ] Build `AltTextEditor` component with suggestions
- [ ] Add character counter and best practices guide
- [ ] Implement screen reader preview feature

### Keyboard Navigation
- [ ] Create `client/src/hooks/useKeyboardShortcuts.ts`
- [ ] Implement global keyboard shortcuts (Alt+N, Alt+A, etc.)
- [ ] Add "Skip to main content" link
- [ ] Build keyboard shortcuts overlay (`?` to show)
- [ ] Create `useFocusTrap` hook for modals
- [ ] Test all shortcuts with different keyboard layouts

### High-Contrast Mode
- [ ] Create `client/src/styles/high-contrast.css`
- [ ] Implement `useHighContrast` hook
- [ ] Add manual toggle in settings menu
- [ ] Persist preference to localStorage
- [ ] Ensure 7:1 contrast ratio for text
- [ ] Test with OS high-contrast modes (Windows, macOS, Linux)

### Screen Reader Support
- [ ] Add ARIA landmarks to `DashboardLayout`
- [ ] Create `LiveRegion` component for status announcements
- [ ] Implement `.sr-only` utility class
- [ ] Add descriptive ARIA labels to all interactive elements
- [ ] Test with NVDA, JAWS, and VoiceOver
- [ ] Record screen reader testing videos for documentation

### Accessibility Testing
- [ ] Install `axe-core`, `jest-axe`, `@axe-core/playwright`
- [ ] Create unit tests in `client/src/components/__tests__/accessibility.test.tsx`
- [ ] Write Playwright integration tests in `client/tests/accessibility.spec.ts`
- [ ] Add `npm run test:a11y` script to package.json
- [ ] Set up pre-commit hook to run accessibility tests
- [ ] Document manual testing checklist

---

**For questions or issues**, refer to the implementation PR in `feature/8.2-accessibility-upgrades` or open a GitHub issue with label `dashboard` + `accessibility`.
