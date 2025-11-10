# Mock Data Development Workflow

**Last Updated**: 2025-11-10
**Status**: 📋 **Guide for Planned Implementation (Task 8.2)**
**Audience**: Frontend/dashboard developers
**Prerequisites**: Node.js 20, Docker running (MongoDB + Redis)

> **Note**: This guide documents the mock data workflow for dashboard development without requiring real Facebook integration. Planned for implementation in feature/8.2-mock-data-dev-workflow branch.

---

## Overview

The mock data system enables **dashboard development and testing** without:
- Real Facebook credentials or API access
- Actual photo restoration processing
- Production database dependencies
- Live ingestion service

It provides synthetic `RequestRecord` data that matches the production schema, allowing you to:
- Build and test the review dashboard UI
- Develop approval/rejection workflows
- Test image comparison components
- Validate metadata display logic

---

## ⚠️ Important Warnings

### Synthetic Data Only

- **No real user photos**: All images are synthetic test patterns or placeholders
- **Fake metadata**: Facebook post IDs, user names, and URLs are generated
- **Do not use in production**: Mock mode bypasses authentication and security
- **No Facebook ToS concerns**: Completely isolated from Facebook platform

### Development Only

```bash
# ❌ NEVER run mock mode in production
NODE_ENV=production USE_MOCK_DASHBOARD=1 npm start  # DON'T DO THIS

# ✅ Only use in development
NODE_ENV=development USE_MOCK_DASHBOARD=1 npm run dev:api
```

---

## Quick Start

### Step 1: Seed Mock Data

```bash
# Generate synthetic RequestRecord documents
npm run seed:mock
```

**What this creates**:

```
./data/mock/
├── requests.json           # 20-30 mock RequestRecord documents
├── images/
│   ├── original/
│   │   ├── img_001.jpg    # Synthetic test images (originals)
│   │   ├── img_002.jpg
│   │   └── ...
│   └── restored/
│       ├── img_001_restored.jpg  # Mock restored versions
│       ├── img_002_restored.jpg
│       └── ...
└── metadata.json          # Seeding metadata (timestamp, count, etc.)
```

**Generated data includes**:
- Mix of request statuses: `pending`, `processing`, `awaiting_review`, `approved`, `rejected`
- Various intent categories: `restoration`, `colorization`, `enhancement`, `denoising`
- Synthetic Facebook post IDs: `123456789_987654321` format
- Fake poster names: "Test User 1", "Mock Poster 2", etc.
- Valid image hashes (SHA-256 of actual test images)
- Realistic timestamps (last 7 days)

### Step 2: Start API in Mock Mode

```bash
# Start API server with mock data enabled
USE_MOCK_DASHBOARD=1 npm run dev:api

# Server starts on http://localhost:4000
# Uses in-memory mock data (not MongoDB)
```

**What mock mode does**:
- ✅ Loads `./data/mock/requests.json` into memory
- ✅ Serves mock images from `./data/mock/images/`
- ✅ Skips database connection
- ✅ Disables authentication (dev only!)
- ✅ Enables CORS for local development
- ❌ Does NOT persist changes (in-memory only)

**Available endpoints** (mock mode):

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /api/requests/pending` | GET | List pending requests awaiting review |
| `GET /api/requests/:id` | GET | Get single request details |
| `POST /api/requests/:id/approve` | POST | Approve a request (in-memory only) |
| `POST /api/requests/:id/reject` | POST | Reject a request (in-memory only) |
| `GET /api/images/:assetId/original` | GET | Serve original mock image |
| `GET /api/images/:assetId/restored` | GET | Serve restored mock image |
| `GET /api/health` | GET | Health check (always returns OK) |

### Step 3: Run Dashboard Client

**Option A: Client only** (API already running):
```bash
npm run dev:client

# Opens http://localhost:3000
# Dashboard connects to http://localhost:4000 (API)
```

**Option B: Both API + Client** (single command):
```bash
# Start both API and client concurrently
npm run dev:all

# API: http://localhost:4000
# Client: http://localhost:3000
```

**Expected behavior**:
- Dashboard loads with 5-10 pending requests
- Images display from `./data/mock/images/`
- Approve/reject buttons work (in-memory only)
- No authentication prompts (mock mode)

---

## Mock Data Schema

### RequestRecord Shape

Mock data matches the production `RequestRecord` schema:

```typescript
interface MockRequestRecord {
  requestId: string;              // ULID: "01ARZ3NDEKTSV4RRFFQ69G5FAV"
  facebookPostId: string;         // Fake: "123456789_987654321"
  facebookGroupId: string;        // Fake: "234567890"
  posterName: string;             // Fake: "Test User 1"
  posterFacebookId?: string;      // Fake: "100001234567890"
  postUrl: string;                // Fake: "https://facebook.com/groups/234567890/posts/123456789"
  userRequest: string;            // Fake: "Please restore this old family photo"

  assets: PhotoAsset[];           // 1-3 synthetic images per request

  intentCategory?: IntentCategory;          // "restoration", "colorization", etc.
  classificationConfidence?: number;        // 0.85 - 0.99
  routingDecision?: 'local' | 'cloud';      // "local" for most

  status: RequestStatus;          // "pending", "awaiting_review", etc.
  queuedAt?: Date;                // Last 7 days
  processedAt?: Date;             // If status != "pending"
  reviewedAt?: Date;              // If status = "approved"/"rejected"

  processingMetadata?: {
    modelVersion: string;         // "gfpgan-1.4"
    processingTimeMs: number;     // 2000-5000
    confidenceScore: number;      // 0.90-0.98
  };

  reviewedBy?: string;            // "dev@example.com" (if reviewed)
  approvalNotes?: string;         // "Looks good" or "Faces distorted"

  createdAt: Date;                // Last 7 days
  updatedAt: Date;                // Same or later
}
```

### PhotoAsset Structure

Each `RequestRecord` contains 1-3 `PhotoAsset` objects:

```typescript
interface MockPhotoAsset {
  assetId: string;                     // ULID
  originalImageUrl: string;            // "http://localhost:4000/api/images/{assetId}/original"
  originalImageHash: string;           // SHA-256 of ./data/mock/images/original/img_XXX.jpg
  originalImagePath: string;           // "./data/mock/images/original/img_XXX.jpg"
  originalStorageId: string;           // SHA-256 (content-addressed)
  originalSHA256: string;              // Same as originalImageHash

  restoredImageUrl?: string;           // "http://localhost:4000/api/images/{assetId}/restored"
  restoredImageHash?: string;          // SHA-256 of restored image (if status != "pending")
  restoredImagePath?: string;          // "./data/mock/images/restored/img_XXX_restored.jpg"
  restoredStorageId?: string;          // SHA-256 (if processed)

  perceptualHash?: string;             // pHash string (if processed)
  restoredPerceptualHash?: string;     // pHash of restored (if processed)

  metadata: {
    width: number;                     // 512, 1024, or 2048
    height: number;                    // Same (square images)
    format: string;                    // "jpeg" or "png"
    sizeBytes: number;                 // Realistic file size
  };
}
```

---

## Dashboard Component Mapping

### How Mock Data Maps to UI

| Dashboard Component | Mock Data Source | Example Value |
|---------------------|------------------|---------------|
| **Request List** | `GET /api/requests/pending` | Array of 5-10 RequestRecords |
| **Request Card** | `RequestRecord.requestId`, `.posterName`, `.userRequest` | "Test User 1: Please restore..." |
| **Image Comparison** | `PhotoAsset.originalImageUrl` + `.restoredImageUrl` | Side-by-side slider |
| **Metadata Display** | `RequestRecord.intentCategory`, `.classificationConfidence` | "Restoration (92% confidence)" |
| **Status Badge** | `RequestRecord.status` | "Awaiting Review" badge |
| **Approval Actions** | `POST /api/requests/:id/approve` | Button triggers in-memory update |
| **Rejection Flow** | `POST /api/requests/:id/reject` | Modal with notes input |
| **Facebook Link** | `RequestRecord.postUrl` | "View Original Post" button |
| **Processing Info** | `RequestRecord.processingMetadata` | "Processed in 3.2s with gfpgan-1.4" |
| **Timestamp Display** | `RequestRecord.queuedAt`, `.processedAt`, `.reviewedAt` | "Queued 2 days ago" |

### Example API Response

**Request**: `GET http://localhost:4000/api/requests/pending`

**Response**:
```json
{
  "requests": [
    {
      "requestId": "01HZ9X7K6PQRS2TUVWXY1234AB",
      "facebookPostId": "123456789_987654321",
      "facebookGroupId": "234567890",
      "posterName": "Test User 1",
      "postUrl": "https://facebook.com/groups/234567890/posts/123456789",
      "userRequest": "Can you help restore this old family photo from the 1950s?",
      "assets": [
        {
          "assetId": "01HZ9X7K6PQRS2TUVWXY5678CD",
          "originalImageUrl": "http://localhost:4000/api/images/01HZ9X7K6PQRS2TUVWXY5678CD/original",
          "originalImageHash": "a1b2c3d4e5f6...",
          "originalImagePath": "./data/mock/images/original/img_001.jpg",
          "restoredImageUrl": "http://localhost:4000/api/images/01HZ9X7K6PQRS2TUVWXY5678CD/restored",
          "restoredImagePath": "./data/mock/images/restored/img_001_restored.jpg",
          "metadata": {
            "width": 1024,
            "height": 1024,
            "format": "jpeg",
            "sizeBytes": 245678
          }
        }
      ],
      "intentCategory": "restoration",
      "classificationConfidence": 0.94,
      "routingDecision": "local",
      "status": "awaiting_review",
      "queuedAt": "2025-11-08T14:32:10.000Z",
      "processedAt": "2025-11-08T14:32:15.342Z",
      "processingMetadata": {
        "modelVersion": "gfpgan-1.4",
        "processingTimeMs": 3421,
        "confidenceScore": 0.96
      },
      "createdAt": "2025-11-08T14:32:10.000Z",
      "updatedAt": "2025-11-08T14:32:15.342Z"
    }
  ],
  "total": 7,
  "page": 1,
  "pageSize": 10
}
```

---

## Reset and Cleanup

### Reseed Mock Data

To regenerate fresh mock data:

```bash
# Delete existing mock data
rm -rf ./data/mock

# Regenerate with new ULIDs, timestamps, and images
npm run seed:mock
```

**When to reseed**:
- Mock data becomes stale (old timestamps)
- Need different mix of request statuses
- Testing edge cases (want specific scenarios)
- Images corrupted or missing

### Clear In-Memory State

Since mock mode runs in-memory, restart the API to reset state:

```bash
# Ctrl+C to stop API
# Restart with fresh mock data
USE_MOCK_DASHBOARD=1 npm run dev:api
```

### Full Cleanup

Remove all mock artifacts:

```bash
# Remove mock data directory
rm -rf ./data/mock

# Remove any stale lock files (if using concurrently)
rm -f ./*.lock

# Remove node_modules (if needed)
rm -rf node_modules && npm install
```

---

## Advanced Usage

### Custom Mock Data

Edit `./data/mock/requests.json` directly to test specific scenarios:

```json
{
  "requestId": "01HZ9X7K6PQRS2TUVWXY1234AB",
  "posterName": "Edge Case User",
  "userRequest": "Extremely long request text to test UI wrapping and truncation behavior in the dashboard card component when dealing with verbose user input that exceeds normal character limits...",
  "status": "awaiting_review",
  "assets": [
    {
      "assetId": "01HZ9X7K6PQRS2TUVWXY5678CD",
      "originalImageUrl": "http://localhost:4000/api/images/01HZ9X7K6PQRS2TUVWXY5678CD/original",
      "metadata": {
        "width": 4096,
        "height": 4096,
        "format": "png",
        "sizeBytes": 8000000
      }
    }
  ]
}
```

**Restart API** to load changes:
```bash
# Ctrl+C, then:
USE_MOCK_DASHBOARD=1 npm run dev:api
```

### Environment Variables

Control mock mode behavior with environment variables:

```bash
# Enable mock mode
USE_MOCK_DASHBOARD=1

# Custom mock data path (default: ./data/mock)
MOCK_DATA_PATH=/path/to/custom/mock

# Mock image server port (default: 4000)
PORT=5000

# Combine multiple variables
MOCK_DATA_PATH=./custom-mocks PORT=5000 USE_MOCK_DASHBOARD=1 npm run dev:api
```

### Script Details

**`npm run seed:mock`** (to be implemented):
```json
{
  "scripts": {
    "seed:mock": "tsx scripts/seed-mock-data.ts"
  }
}
```

**`npm run dev:api`** (to be implemented):
```json
{
  "scripts": {
    "dev:api": "tsx watch src/api/server.ts"
  }
}
```

**`npm run dev:client`** (to be implemented):
```json
{
  "scripts": {
    "dev:client": "vite --config client/vite.config.ts"
  }
}
```

**`npm run dev:all`** (to be implemented):
```json
{
  "scripts": {
    "dev:all": "concurrently \"npm run dev:api\" \"npm run dev:client\""
  }
}
```

---

## Troubleshooting

### Issue: "Mock data not found"

**Symptoms**:
- API returns 404 for `/api/requests/pending`
- Console error: `Error: ENOENT: no such file or directory, open './data/mock/requests.json'`

**Solution**:
```bash
# Generate mock data first
npm run seed:mock

# Then start API
USE_MOCK_DASHBOARD=1 npm run dev:api
```

---

### Issue: "Images not loading"

**Symptoms**:
- Dashboard shows broken image icons
- Network tab shows 404 for `http://localhost:4000/api/images/...`

**Solution**:
```bash
# Verify image files exist
ls -la ./data/mock/images/original/
ls -la ./data/mock/images/restored/

# If missing, reseed
rm -rf ./data/mock && npm run seed:mock
```

---

### Issue: "API not in mock mode"

**Symptoms**:
- API connects to MongoDB instead of using in-memory data
- Authentication required
- 500 errors about missing database

**Solution**:
```bash
# Ensure USE_MOCK_DASHBOARD=1 is set
echo $USE_MOCK_DASHBOARD  # Should print "1"

# Restart with environment variable
USE_MOCK_DASHBOARD=1 npm run dev:api

# Or add to .env.local (create if doesn't exist)
echo "USE_MOCK_DASHBOARD=1" >> .env.local
```

---

### Issue: "Changes not reflected"

**Symptoms**:
- Edited `./data/mock/requests.json` but API still returns old data
- Approved request still shows as pending

**Solution**:
Mock mode runs **in-memory** - changes to files require restart:
```bash
# Stop API (Ctrl+C)
# Restart to reload from disk
USE_MOCK_DASHBOARD=1 npm run dev:api
```

**Note**: In-memory updates (approve/reject via API) are **not persisted** to disk. They reset on restart.

---

## Production Transition

When transitioning from mock to real data:

### Step 1: Disable Mock Mode

```bash
# Remove environment variable
unset USE_MOCK_DASHBOARD

# Or remove from .env.local
# USE_MOCK_DASHBOARD=1  # <-- comment out or delete
```

### Step 2: Start Real Services

```bash
# Ensure MongoDB and Redis are running
docker compose up -d

# Start API without mock mode
npm run dev:api

# API now connects to MongoDB, requires authentication
```

### Step 3: Update Frontend Config

Ensure client connects to authenticated API:

```typescript
// client/src/config.ts
export const API_URL = process.env.VITE_API_URL || 'http://localhost:4000';
export const USE_MOCK = false;  // Disable mock mode in client
```

### Step 4: Test Authentication

```bash
# Client should now prompt for WebAuthn authentication
npm run dev:client
# Navigate to http://localhost:3000
# Expect: Login screen (not mock data)
```

---

## Best Practices

### ✅ Do

- **Use mock mode for UI development** without backend dependencies
- **Test edge cases** by editing `./data/mock/requests.json`
- **Reseed regularly** to get fresh timestamps and IDs
- **Check mock data into git** (no sensitive info, just synthetic data)
- **Document custom scenarios** in `./data/mock/README.md` (if created)

### ❌ Don't

- **Never deploy with `USE_MOCK_DASHBOARD=1`** in production
- **Don't rely on in-memory state persistence** (use real DB for integration tests)
- **Don't commit `.env.local`** (add to `.gitignore`)
- **Don't use real Facebook URLs** in mock data (ToS violation)
- **Don't include real user photos** (privacy violation)

---

## Related Documentation

- [RequestRecord Schema](../src/models/RequestRecord.ts) - Production data model
- [API Endpoints](../src/api/routes/) - Real API route implementations
- [Dashboard Components](../client/src/components/) - React components (planned)
- [Development Setup](../README.md#development) - General development guide

---

## Implementation Checklist (Task 8.2)

- [ ] Create `scripts/seed-mock-data.ts` to generate synthetic RequestRecords
- [ ] Generate test images in `./data/mock/images/original/` and `.../restored/`
- [ ] Implement mock mode detection in `src/api/server.ts`
- [ ] Add in-memory request store for mock mode
- [ ] Create image serving endpoints (`/api/images/:assetId/:type`)
- [ ] Add mock data endpoints (`/api/requests/pending`, etc.)
- [ ] Implement approve/reject handlers (in-memory only)
- [ ] Skip authentication when `USE_MOCK_DASHBOARD=1`
- [ ] Add CORS middleware for local development
- [ ] Create package.json scripts:
  - [ ] `seed:mock`
  - [ ] `dev:api`
  - [ ] `dev:client`
  - [ ] `dev:all`
- [ ] Add `.env.local.example` with mock mode template
- [ ] Update `.gitignore` to include `./data/mock/*` but track structure
- [ ] Test full workflow: seed → API → client
- [ ] Document in README.md

---

**For questions or issues**, refer to the implementation PR or open a GitHub issue with label `dashboard` + `mock-data`.
