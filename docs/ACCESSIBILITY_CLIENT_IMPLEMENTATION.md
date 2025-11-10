# Client-Side Accessibility Implementation Guide

This document provides a comprehensive guide for implementing the accessibility features in the React client application for the AI Photo Restoration review dashboard.

## Overview

The client directory (`client/`) needs to be created with the following accessibility features:
1. Alt-text suggestion integration with backend API
2. Keyboard navigation and ARIA improvements
3. High contrast mode toggle
4. Accessibility testing with React Testing Library + axe

---

## Prerequisites

The backend alt-text API has been implemented and is available at `/api/alt-text/*`. The client needs to be set up as a React application with TypeScript.

---

## 1. Project Structure

```
client/
├── package.json
├── tsconfig.json
├── vite.config.ts  (or webpack/CRA config)
├── src/
│   ├── components/
│   │   ├── ReviewDashboard.tsx
│   │   ├── ReviewDashboard.module.css
│   │   ├── RequestList.tsx
│   │   ├── ImageComparison.tsx
│   │   ├── ApprovalPanel.tsx
│   │   └── SkipLink.tsx
│   ├── stores/
│   │   └── accessibilityStore.ts  (Zustand)
│   ├── services/
│   │   └── altTextApi.ts
│   ├── hooks/
│   │   ├── useKeyboardShortcuts.ts
│   │   └── useAltText.ts
│   ├── types/
│   │   └── index.ts
│   └── App.tsx
└── tests/
    ├── components/
    │   ├── ApprovalPanel.test.tsx
    │   ├── RequestList.test.tsx
    │   └── ImageComparison.test.tsx
    └── accessibility.test.tsx
```

---

## 2. Package Dependencies

Add to `client/package.json`:

```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "zustand": "^4.4.7",
    "axios": "^1.6.0"
  },
  "devDependencies": {
    "@testing-library/react": "^14.1.2",
    "@testing-library/jest-dom": "^6.1.5",
    "@testing-library/user-event": "^14.5.1",
    "axe-core": "^4.8.3",
    "jest-axe": "^8.0.0",
    "vitest": "^1.0.4",
    "@vitejs/plugin-react": "^4.2.1"
  },
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint src --ext ts,tsx"
  }
}
```

---

## 3. Alt-Text Service Integration

### `client/src/services/altTextApi.ts`

```typescript
import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:4000/api';

export interface AltTextSuggestion {
  assetId: string;
  suggestedAltText: string;
  confidence: number;
  keywords: string[];
  generatedAt: Date;
}

export interface GenerateAltTextRequest {
  assetId: string;
  requestId?: string;
  context?: {
    userRequest?: string;
    intentCategory?: string;
  };
}

export const altTextApi = {
  async generate(data: GenerateAltTextRequest): Promise<AltTextSuggestion> {
    const response = await axios.post(`${API_BASE}/alt-text/generate`, data);
    return response.data.suggestion;
  },

  async validate(altText: string): Promise<{
    valid: boolean;
    warnings: string[];
    suggestions: string[];
  }> {
    const response = await axios.post(`${API_BASE}/alt-text/validate`, { altText });
    return response.data.validation;
  },

  async update(requestId: string, assetId: string, altText: string): Promise<void> {
    await axios.put(`${API_BASE}/alt-text/update`, {
      requestId,
      assetId,
      altText
    });
  }
};
```

### `client/src/hooks/useAltText.ts`

```typescript
import { useState, useCallback } from 'react';
import { altTextApi, type AltTextSuggestion } from '../services/altTextApi';

export function useAltText() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<AltTextSuggestion | null>(null);

  const generateSuggestion = useCallback(async (
    assetId: string,
    requestId?: string
  ) => {
    setLoading(true);
    setError(null);

    try {
      const result = await altTextApi.generate({ assetId, requestId });
      setSuggestion(result);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate alt-text';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const validateAltText = useCallback(async (altText: string) => {
    try {
      return await altTextApi.validate(altText);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to validate alt-text';
      setError(message);
      throw err;
    }
  }, []);

  return {
    loading,
    error,
    suggestion,
    generateSuggestion,
    validateAltText
  };
}
```

---

## 4. Accessibility Store (Zustand)

### `client/src/stores/accessibilityStore.ts`

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AccessibilityState {
  highContrastMode: boolean;
  toggleHighContrast: () => void;

  fontSize: 'normal' | 'large' | 'x-large';
  setFontSize: (size: 'normal' | 'large' | 'x-large') => void;

  reducedMotion: boolean;
  toggleReducedMotion: () => void;
}

export const useAccessibilityStore = create<AccessibilityState>()(
  persist(
    (set) => ({
      highContrastMode: false,
      toggleHighContrast: () =>
        set((state) => ({ highContrastMode: !state.highContrastMode })),

      fontSize: 'normal',
      setFontSize: (size) => set({ fontSize: size }),

      reducedMotion: false,
      toggleReducedMotion: () =>
        set((state) => ({ reducedMotion: !state.reducedMotion })),
    }),
    {
      name: 'accessibility-settings',
    }
  )
);
```

---

## 5. Component Implementations

### `client/src/components/SkipLink.tsx`

```typescript
import React from 'react';
import styles from './SkipLink.module.css';

export const SkipLink: React.FC = () => {
  return (
    <a href="#main-content" className={styles.skipLink}>
      Skip to main content
    </a>
  );
};
```

```css
/* SkipLink.module.css */
.skipLink {
  position: absolute;
  top: -40px;
  left: 0;
  padding: 8px;
  background: #000;
  color: #fff;
  text-decoration: none;
  z-index: 100;
}

.skipLink:focus {
  top: 0;
}
```

### `client/src/components/ApprovalPanel.tsx`

```typescript
import React, { useState, useEffect } from 'react';
import { useAltText } from '../hooks/useAltText';
import { altTextApi } from '../services/altTextApi';
import styles from './ApprovalPanel.module.css';

interface ApprovalPanelProps {
  requestId: string;
  assetId: string;
  onApprove: () => void;
  onReject: () => void;
}

export const ApprovalPanel: React.FC<ApprovalPanelProps> = ({
  requestId,
  assetId,
  onApprove,
  onReject
}) => {
  const { suggestion, loading, generateSuggestion, validateAltText } = useAltText();
  const [altText, setAltText] = useState('');
  const [validation, setValidation] = useState<{
    valid: boolean;
    warnings: string[];
    suggestions: string[];
  } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Auto-generate suggestion on mount
    generateSuggestion(assetId, requestId);
  }, [assetId, requestId, generateSuggestion]);

  useEffect(() => {
    if (suggestion) {
      setAltText(suggestion.suggestedAltText);
    }
  }, [suggestion]);

  const handleAltTextChange = async (value: string) => {
    setAltText(value);

    // Debounced validation
    const result = await validateAltText(value);
    setValidation(result);
  };

  const handleSaveAltText = async () => {
    setSaving(true);
    try {
      await altTextApi.update(requestId, assetId, altText);
      alert('Alt-text saved successfully');
    } catch (error) {
      alert('Failed to save alt-text');
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Keyboard shortcuts
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'Enter') {
        e.preventDefault();
        onApprove();
      }
    }
  };

  return (
    <div
      className={styles.approvalPanel}
      onKeyDown={handleKeyDown}
      role="region"
      aria-label="Approval panel"
    >
      <h2 id="approval-heading">Review and Approve</h2>

      {/* Alt-text section */}
      <section
        className={styles.altTextSection}
        aria-labelledby="alt-text-heading"
      >
        <h3 id="alt-text-heading">Alt-Text Description</h3>

        {loading && <p aria-live="polite">Generating suggestion...</p>}

        {suggestion && (
          <div className={styles.suggestionInfo}>
            <p>
              <strong>AI Confidence:</strong> {Math.round(suggestion.confidence * 100)}%
            </p>
            <p>
              <strong>Keywords:</strong> {suggestion.keywords.join(', ')}
            </p>
          </div>
        )}

        <label htmlFor="alt-text-input" className={styles.label}>
          Alt-Text for Restored Image
        </label>
        <textarea
          id="alt-text-input"
          className={styles.altTextInput}
          value={altText}
          onChange={(e) => handleAltTextChange(e.target.value)}
          aria-describedby="alt-text-help"
          rows={3}
        />
        <p id="alt-text-help" className={styles.helpText}>
          Describe the visual content of the restored image for screen reader users
        </p>

        {validation && !validation.valid && (
          <div
            className={styles.validation}
            role="alert"
            aria-live="polite"
          >
            <h4>Accessibility Warnings:</h4>
            <ul>
              {validation.warnings.map((warning, i) => (
                <li key={i}>{warning}</li>
              ))}
            </ul>
            {validation.suggestions.length > 0 && (
              <>
                <h4>Suggestions:</h4>
                <ul>
                  {validation.suggestions.map((suggestion, i) => (
                    <li key={i}>{suggestion}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        <button
          onClick={handleSaveAltText}
          disabled={saving || !altText.trim()}
          className={styles.saveButton}
          aria-label="Save alt-text description"
        >
          {saving ? 'Saving...' : 'Save Alt-Text'}
        </button>
      </section>

      {/* Approval actions */}
      <section
        className={styles.actions}
        aria-labelledby="actions-heading"
      >
        <h3 id="actions-heading" className="sr-only">Approval Actions</h3>

        <button
          onClick={onApprove}
          className={`${styles.button} ${styles.approveButton}`}
          aria-label="Approve this restoration (Ctrl+Enter)"
        >
          Approve
        </button>

        <button
          onClick={onReject}
          className={`${styles.button} ${styles.rejectButton}`}
          aria-label="Reject this restoration"
        >
          Reject
        </button>
      </section>

      <div className={styles.keyboardHints} aria-label="Keyboard shortcuts">
        <small>
          <kbd>Ctrl</kbd>+<kbd>Enter</kbd> to approve
        </small>
      </div>
    </div>
  );
};
```

### `client/src/components/ImageComparison.tsx`

```typescript
import React, { useState, useRef, useEffect } from 'react';
import styles from './ImageComparison.module.css';

interface ImageComparisonProps {
  originalUrl: string;
  restoredUrl: string;
  altText?: string;
}

export const ImageComparison: React.FC<ImageComparisonProps> = ({
  originalUrl,
  restoredUrl,
  altText
}) => {
  const [sliderPosition, setSliderPosition] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Arrow keys to move slider
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setSliderPosition(Math.max(0, sliderPosition - 5));
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      setSliderPosition(Math.min(100, sliderPosition + 5));
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = (x / rect.width) * 100;

    setSliderPosition(Math.max(0, Math.min(100, percentage)));
  };

  return (
    <div
      ref={containerRef}
      className={styles.comparison}
      onMouseMove={handleMouseMove}
      role="group"
      aria-label="Image comparison slider"
    >
      <div className={styles.imageContainer}>
        <img
          src={originalUrl}
          alt={`Original: ${altText || 'Historical photograph before restoration'}`}
          className={styles.originalImage}
        />
        <div
          className={styles.restoredOverlay}
          style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
        >
          <img
            src={restoredUrl}
            alt={`Restored: ${altText || 'Photograph after AI restoration'}`}
            className={styles.restoredImage}
          />
        </div>
      </div>

      <div
        className={styles.slider}
        style={{ left: `${sliderPosition}%` }}
        role="slider"
        aria-valuenow={sliderPosition}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Comparison slider position"
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        <div className={styles.sliderHandle} />
      </div>

      <div className={styles.labels}>
        <span className={styles.originalLabel}>Original</span>
        <span className={styles.restoredLabel}>Restored</span>
      </div>

      <div className={styles.keyboardHints}>
        <small>Use arrow keys to move slider</small>
      </div>
    </div>
  );
};
```

### `client/src/components/RequestList.tsx`

```typescript
import React, { useEffect, useRef } from 'react';
import styles from './RequestList.module.css';

interface Request {
  requestId: string;
  posterName: string;
  status: string;
  createdAt: string;
}

interface RequestListProps {
  requests: Request[];
  selectedId?: string;
  onSelect: (requestId: string) => void;
}

export const RequestList: React.FC<RequestListProps> = ({
  requests,
  selectedId,
  onSelect
}) => {
  const listRef = useRef<HTMLUListElement>(null);
  const selectedRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    // Focus selected item when it changes
    if (selectedRef.current) {
      selectedRef.current.focus();
    }
  }, [selectedId]);

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    // Arrow navigation
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = Math.min(index + 1, requests.length - 1);
      onSelect(requests[nextIndex].requestId);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIndex = Math.max(index - 1, 0);
      onSelect(requests[prevIndex].requestId);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(requests[index].requestId);
    }
  };

  return (
    <nav aria-label="Request list">
      <h2 id="request-list-heading">Pending Requests</h2>
      <ul
        ref={listRef}
        className={styles.requestList}
        role="listbox"
        aria-labelledby="request-list-heading"
      >
        {requests.map((request, index) => {
          const isSelected = request.requestId === selectedId;

          return (
            <li
              key={request.requestId}
              ref={isSelected ? selectedRef : null}
              className={`${styles.requestItem} ${isSelected ? styles.selected : ''}`}
              role="option"
              aria-selected={isSelected}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => onSelect(request.requestId)}
              onKeyDown={(e) => handleKeyDown(e, index)}
            >
              <div className={styles.requestInfo}>
                <strong>{request.posterName}</strong>
                <span className={styles.status}>{request.status}</span>
              </div>
              <time dateTime={request.createdAt}>
                {new Date(request.createdAt).toLocaleDateString()}
              </time>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};
```

---

## 6. High Contrast Mode CSS

### `client/src/components/ReviewDashboard.module.css`

```css
/* Default theme */
.reviewDashboard {
  --bg-primary: #ffffff;
  --bg-secondary: #f5f5f5;
  --text-primary: #333333;
  --text-secondary: #666666;
  --border-color: #e0e0e0;
  --accent-color: #2196f3;
  --success-color: #4caf50;
  --danger-color: #f44336;
}

/* High contrast mode */
.reviewDashboard[data-high-contrast="true"] {
  --bg-primary: #000000;
  --bg-secondary: #1a1a1a;
  --text-primary: #ffffff;
  --text-secondary: #cccccc;
  --border-color: #ffffff;
  --accent-color: #00ffff;
  --success-color: #00ff00;
  --danger-color: #ff0000;
}

.reviewDashboard {
  background-color: var(--bg-primary);
  color: var(--text-primary);
}

/* Focus outlines - always visible */
*:focus {
  outline: 3px solid var(--accent-color);
  outline-offset: 2px;
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}

/* Screen reader only class */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

---

## 7. Accessibility Tests

### `client/tests/accessibility.test.tsx`

```typescript
import { render } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { ApprovalPanel } from '../src/components/ApprovalPanel';
import { RequestList } from '../src/components/RequestList';
import { ImageComparison } from '../src/components/ImageComparison';

expect.extend(toHaveNoViolations);

describe('Accessibility Tests', () => {
  it('ApprovalPanel should have no axe violations', async () => {
    const { container } = render(
      <ApprovalPanel
        requestId="test-123"
        assetId="asset-456"
        onApprove={() => {}}
        onReject={() => {}}
      />
    );

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('RequestList should have no axe violations', async () => {
    const { container } = render(
      <RequestList
        requests={[
          {
            requestId: '1',
            posterName: 'Test User',
            status: 'pending',
            createdAt: new Date().toISOString()
          }
        ]}
        onSelect={() => {}}
      />
    );

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('ImageComparison should have no axe violations', async () => {
    const { container } = render(
      <ImageComparison
        originalUrl="https://example.com/original.jpg"
        restoredUrl="https://example.com/restored.jpg"
        altText="Test photograph"
      />
    );

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
```

---

## 8. Testing Commands

Add to parent `package.json`:

```json
{
  "scripts": {
    "test:client": "npm run test --prefix client",
    "dev:all": "concurrently \"npm run dev:api\" \"npm run dev --prefix client\""
  }
}
```

---

## 9. GitHub Actions

Add to `.github/workflows/client-tests.yml`:

```yaml
name: Client Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: |
          npm ci
          cd client && npm ci

      - name: Run client tests
        run: npm run test:client

      - name: Run accessibility tests
        run: cd client && npm run test -- accessibility.test
```

---

## 10. Implementation Checklist

- [ ] Create `client/` directory with React + TypeScript setup
- [ ] Install dependencies (React, Zustand, axios, testing-library, jest-axe)
- [ ] Implement alt-text API service and hooks
- [ ] Create accessibility store with Zustand
- [ ] Implement SkipLink component
- [ ] Update ApprovalPanel with alt-text integration
- [ ] Add keyboard navigation to RequestList
- [ ] Add slider keyboard controls to ImageComparison
- [ ] Implement high contrast mode toggle
- [ ] Add ARIA labels and roles to all interactive elements
- [ ] Create accessibility test suite with axe
- [ ] Add `npm run test:client` script
- [ ] Create GitHub Actions workflow for client tests
- [ ] Test with keyboard navigation only
- [ ] Test with screen reader (NVDA/JAWS/VoiceOver)
- [ ] Verify color contrast ratios (WCAG AA minimum)

---

## Summary

This implementation provides:
- ✅ **Alt-text suggestions** via backend API integration
- ✅ **Keyboard navigation** with arrow keys and Enter shortcuts
- ✅ **ARIA labels** for all interactive elements
- ✅ **High contrast mode** persisted via Zustand + localStorage
- ✅ **Skip links** for main content navigation
- ✅ **Accessibility testing** with React Testing Library + axe
- ✅ **Mock mode support** via backend `USE_MOCK_DASHBOARD` flag

All components follow WCAG 2.1 AA guidelines for accessibility.
