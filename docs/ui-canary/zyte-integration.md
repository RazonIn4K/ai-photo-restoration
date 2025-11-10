# Zyte Integration for Facebook Ingestion

## Overview

This document describes the Zyte API integration for Facebook content extraction. The system supports three extraction methods:

1. **`playwright`** – Traditional browser automation (existing)
2. **`zyte`** – Zyte API cloud scraping service
3. **`hybrid`** – Try Zyte first, fall back to Playwright on failure

The extraction method is configurable per Facebook group via `GroupConfig.extractionMethod`.

---

## Configuration

### Environment Variables

Add the following to your `.env` file to enable Zyte:

```bash
# Required: Zyte API key (service disabled if not provided)
ZYTE_API_KEY=your-api-key-here

# Optional: Zyte API endpoint (defaults to production)
ZYTE_API_URL=https://api.zyte.com/v1/extract

# Optional: Rate limiting (default: 60 requests/minute)
ZYTE_RATE_LIMIT_PER_MINUTE=60

# Optional: Retry configuration (default: 3 attempts)
ZYTE_RETRY_MAX_ATTEMPTS=3

# Optional: Request timeout (default: 30000ms)
ZYTE_TIMEOUT_MS=30000
```

**Safe Defaults:**
- If `ZYTE_API_KEY` is not provided, the Zyte client is **disabled** and `hybrid` mode falls back to Playwright
- All other settings have production-ready defaults
- The Playwright flow remains **unchanged** when Zyte is not configured

### Validation

Environment variables are validated at startup via `src/config/env.ts` using Zod schemas:

- `ZYTE_API_KEY`: Optional string (no default)
- `ZYTE_API_URL`: Must be valid URL (default: `https://api.zyte.com/v1/extract`)
- `ZYTE_RATE_LIMIT_PER_MINUTE`: Integer 1-1000 (default: 60)
- `ZYTE_RETRY_MAX_ATTEMPTS`: Integer 1-10 (default: 3)
- `ZYTE_TIMEOUT_MS`: Integer 1000-120000 (default: 30000)

Validation errors will prevent application startup with clear error messages.

---

## Extraction Methods

### Per-Group Configuration

Set the extraction method in `GroupConfig`:

```typescript
{
  groupId: 'group-123',
  extractionMethod: 'playwright' | 'zyte' | 'hybrid',
  // ... other config
}
```

### Method Behavior

#### 1. `playwright` (Default)
- Uses browser automation with Playwright
- Leverages group-specific selectors from `GroupConfig.selectors`
- No changes to existing behavior

#### 2. `zyte`
- Routes all extraction to Zyte API
- **Requires** `ZYTE_API_KEY` to be configured
- Throws error if Zyte client is disabled
- Use when:
  - Avoiding browser automation overhead
  - Scaling to many groups
  - Facebook's anti-bot measures are problematic

#### 3. `hybrid` (Recommended)
- **Primary**: Attempt extraction via Zyte
- **Fallback**: Use Playwright if Zyte fails
- Decision logic:
  1. If Zyte enabled → try Zyte
  2. If Zyte fails (timeout, rate limit, extraction error) → fall back to Playwright
  3. If Zyte disabled → use Playwright directly
  4. If neither available → throw error

**Fallback Metadata:**
- `ExtractedContent.metadata.fallbackUsed: true` when Playwright fallback was used
- Allows observability into fallback frequency

---

## Architecture

### Service Boundaries

```
src/services/facebook-ingestion.ts  ← Orchestrator (routing logic)
├── src/services/zyte-client.ts     ← Zyte API client
└── (Playwright extractor)          ← Browser automation (separate)
```

- **`ZyteClient`** (`src/services/zyte-client.ts`)
  - HTTP client for Zyte API
  - Rate limiting (token bucket algorithm)
  - Retry logic with exponential backoff
  - Typed error handling

- **`FacebookIngestionService`** (`src/services/facebook-ingestion.ts`)
  - Orchestrates extraction method selection
  - Routes based on `GroupConfig.extractionMethod`
  - Handles fallback logic for `hybrid` mode
  - Logs all decisions via `logger.ts`

### Type Contracts

See `src/types/index.ts`:

```typescript
// Request/response types
interface ZyteExtractionRequest { ... }
interface ZyteExtractionResponse { ... }

// Error types
interface ZyteError {
  type: 'rate_limit' | 'timeout' | 'auth' | 'network' | 'extraction' | 'unknown';
  message: string;
  statusCode?: number;
  retryable: boolean;
  originalError?: unknown;
}

// Client config
interface ZyteClientConfig { ... }
```

---

## Retry and Rate Limiting

### Retry Logic

The Zyte client retries on **retryable errors**:

| Error Type    | Retryable | Description                          |
|---------------|-----------|--------------------------------------|
| `rate_limit`  | ✅ Yes    | HTTP 429 (too many requests)         |
| `timeout`     | ✅ Yes    | Request exceeded `ZYTE_TIMEOUT_MS`   |
| `network`     | ✅ Yes    | Network failure (DNS, connection)    |
| `auth`        | ❌ No     | HTTP 401/403 (invalid API key)       |
| `extraction`  | ❌ No     | HTTP 4xx (bad request, not found)    |
| `unknown`     | ✅ Yes    | HTTP 5xx (server errors)             |

**Backoff Strategy:**
- Exponential backoff: `2^attempt * 1000ms` (2s, 4s, 8s...)
- Max attempts: `ZYTE_RETRY_MAX_ATTEMPTS`

### Rate Limiting

**Token bucket algorithm:**
- Bucket capacity: `ZYTE_RATE_LIMIT_PER_MINUTE` tokens
- Refill rate: `ZYTE_RATE_LIMIT_PER_MINUTE / 60000` tokens per millisecond
- Blocks request until token available

**Example:**
- Rate limit: 60 req/min → 1 req/second
- If burst of 10 requests → first 60 immediate, remainder queued

---

## Observability

### Structured Logging

All logs use `src/lib/logger.ts` (pino) with structured fields:

**Initialization:**
```json
{
  "level": "info",
  "msg": "Zyte client initialized",
  "apiUrl": "https://api.zyte.com/v1/extract",
  "rateLimitPerMinute": 60,
  "retryMaxAttempts": 3,
  "timeoutMs": 30000
}
```

**Extraction decision (orchestrator):**
```json
{
  "level": "info",
  "msg": "Starting Facebook content extraction",
  "url": "https://facebook.com/groups/...",
  "groupId": "group-123",
  "extractionMethod": "hybrid"
}
```

**Zyte success:**
```json
{
  "level": "info",
  "msg": "Zyte extraction successful",
  "url": "https://facebook.com/groups/...",
  "statusCode": 200,
  "attempt": 1,
  "durationMs": 1234
}
```

**Zyte failure + retry:**
```json
{
  "level": "warn",
  "msg": "Zyte extraction attempt failed",
  "url": "https://facebook.com/groups/...",
  "attempt": 2,
  "maxAttempts": 3,
  "errorType": "timeout",
  "retryable": true
}
```

**Fallback to Playwright:**
```json
{
  "level": "warn",
  "msg": "Hybrid extraction: Zyte failed, falling back to Playwright",
  "url": "https://facebook.com/groups/...",
  "groupId": "group-123",
  "errorType": "timeout",
  "retryable": true
}
```

### Metrics (Future)

Recommended Prometheus metrics (not yet implemented):

- `zyte_requests_total{method, status}` – Total requests (counter)
- `zyte_request_duration_seconds{method}` – Request latency (histogram)
- `zyte_errors_total{type}` – Errors by type (counter)
- `facebook_extraction_fallback_total{group_id}` – Hybrid fallback count (counter)

See `ops/prometheus/` for future instrumentation.

---

## Testing

### Unit Tests

**Zyte Client** (`tests/services/zyte-client.test.ts`):
- Initialization (enabled/disabled)
- Successful extraction
- HTTP error handling (401, 429, 500)
- Retry logic (retryable vs non-retryable)
- Timeout handling
- Network errors
- Rate limiting

**Facebook Ingestion** (`tests/services/facebook-ingestion.test.ts`):
- Method selection (`playwright`, `zyte`, `hybrid`)
- Fallback logic (Zyte → Playwright)
- Error handling (no extractors available)
- Metadata (fallbackUsed flag)

### Running Tests

```bash
# Run all tests
npm test

# Run specific suite
npm test tests/services/zyte-client.test.ts

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage
```

---

## Migration Guide

### Enabling Zyte for Existing Groups

1. **Add API key to environment:**
   ```bash
   echo "ZYTE_API_KEY=your-key" >> .env
   ```

2. **Update group config:**
   ```javascript
   await GroupConfigModel.findOneAndUpdate(
     { groupId: 'your-group-id' },
     { extractionMethod: 'hybrid' } // or 'zyte'
   );
   ```

3. **Monitor logs for fallback frequency:**
   ```bash
   # Check for Playwright fallbacks
   grep "falling back to Playwright" logs/app.log
   ```

4. **Adjust based on fallback rate:**
   - High fallback rate → Zyte may not support group URL patterns
   - Low fallback rate → Consider switching to pure `zyte` mode

### Rolling Back

To disable Zyte and return to Playwright:

1. **Update group configs:**
   ```javascript
   await GroupConfigModel.updateMany(
     { extractionMethod: { $in: ['zyte', 'hybrid'] } },
     { extractionMethod: 'playwright' }
   );
   ```

2. **Remove API key (optional):**
   ```bash
   # Comment out or remove from .env
   # ZYTE_API_KEY=...
   ```

Playwright flow remains **unchanged** when Zyte is disabled.

---

## Troubleshooting

### Zyte client disabled despite API key

**Symptom:**
```
Zyte client initialized but disabled (no API key provided)
```

**Fix:**
- Ensure `ZYTE_API_KEY` is set in `.env`
- Check for leading/trailing whitespace
- Verify environment is loaded (restart app)

### High retry rate

**Symptom:**
```
Zyte extraction attempt failed (attempt 3/3, errorType: timeout)
```

**Fixes:**
- Increase `ZYTE_TIMEOUT_MS` (default: 30000)
- Reduce `ZYTE_RATE_LIMIT_PER_MINUTE` (may be hitting Zyte's server-side limits)
- Check network latency to Zyte API

### Frequent fallbacks in hybrid mode

**Symptom:**
```
Hybrid extraction: Zyte failed, falling back to Playwright
```

**Analysis:**
1. Check error types in logs (`errorType` field)
2. If mostly `extraction` errors → Zyte may not support Facebook group URLs
3. If mostly `rate_limit` → Increase rate limit or upgrade Zyte plan
4. If mostly `timeout` → Increase timeout or check network

**Mitigation:**
- Switch problematic groups to pure `playwright` mode
- Adjust Zyte config knobs
- Contact Zyte support for extraction issues

---

## Security Considerations

- **API Key Storage**: Never commit `ZYTE_API_KEY` to version control
- **Logging**: API keys are redacted via `src/lib/logger.ts` redact paths
- **Network**: Use HTTPS for all Zyte API calls (enforced by default)
- **Rate Limiting**: Prevents excessive API usage and cost overruns

---

## References

- Zyte API docs: https://docs.zyte.com/zyte-api/get-started.html
- Config schema: `src/config/env.ts:95-139`
- Type definitions: `src/types/index.ts:91-133`
- Zyte client: `src/services/zyte-client.ts`
- Orchestrator: `src/services/facebook-ingestion.ts`
- Group config model: `src/models/Config.ts:14-25,107-112`

---

## Changelog

- **2025-11-10**: Initial Zyte integration
  - Added Zyte client with retry and rate limiting
  - Implemented hybrid extraction mode
  - Added comprehensive tests and documentation
