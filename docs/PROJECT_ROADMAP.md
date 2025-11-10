# AI Photo Restoration - Project Roadmap

**Last Updated**: 2025-11-05
**Status**: Phase 1 Complete, Moving to Phase 2

---

## Executive Summary

The AI Photo Restoration Service is a **semi-automated photo restoration system** designed to process Facebook photo restoration requests using AI while maintaining complete human oversight. The project follows a spec-driven development approach with 13 major implementation phases.

### Current Status

✅ **Completed**:

- Task 1: Foundation & Infrastructure (TypeScript, Docker, MongoDB, Redis, CI/CD)
- Task 2: Core Data Models (Request, Consent, ActionLog, Config models with validation)

🚧 **Next Phase**:

- Task 3: Encrypted Storage System

---

## Recent Achievements

### PR #1: Mongoose Validation Implementation ✅

**Merged**: 2025-11-05
**Branch**: `feature/task-2.3-mongoose-validation`

**Key Deliverables**:

1. Complete Mongoose models with validation:
   - RequestRecord with compound indexes
   - ConsentRecord with privacy controls
   - ActionLog with immutable append-only structure
   - Config model for system settings

2. Build fixes:
   - CSFLE dynamic import typing (src/database/csfle.ts:1)
   - Named pino factory export (src/lib/logger.ts:1)
   - Hash-chain timestamp filter typing (src/models/ActionLog.ts:120)

3. Validation:
   - ✅ `npm run lint` - Passed
   - ✅ `npm run build` - Passed
   - ⏳ CI/CD pipeline running

**GitHub Actions Status**: Monitor with `./scripts/monitor-workflow.sh c23eff2`

---

## Phase 2: Encrypted Storage & Security

### Task 3: Encrypted Storage System 🎯 **NEXT UP**

**Priority**: HIGH
**Estimated Effort**: 3-5 days
**Dependencies**: None (Task 1 & 2 complete)

#### 3.1 Implement Envelope Encryption with per-asset DEK

**Objectives**:

- Create key management system using OS keychain integration
- Implement AES-256-GCM encryption with authenticated encryption
- Build cryptographic erasure functionality with DEK zeroization

**Technical Requirements**:

- Requirements: 8.1, 8.6

**Implementation Steps**:

1. Choose key management library:
   - **keytar** (Electron ecosystem, supports macOS Keychain)
   - **node-keytar** or **@electron/keytar**
   - Alternative: **keychain** (macOS-specific) or **credential-store** (cross-platform)

2. Create `src/crypto/envelope.ts`:
   - Master Key (KEK) stored in OS keychain
   - Per-asset Data Encryption Keys (DEK) encrypted with KEK
   - AES-256-GCM implementation using Node.js crypto

3. Build DEK lifecycle:
   - Generation, encryption, storage, decryption, zeroization
   - Secure memory handling (prevent DEK from being swapped to disk)

4. Add tests:
   - Encryption/decryption round-trip
   - Key zeroization verification
   - Error handling (corrupted ciphertext, missing keys)

**Dependencies to Add**:

```bash
npm install @electron/keytar
npm install --save-dev @types/keytar
```

**Files to Create**:

- `src/crypto/envelope.ts` - Envelope encryption implementation
- `src/crypto/keystore.ts` - OS keychain integration
- `src/crypto/index.ts` - Crypto module exports
- `tests/crypto/envelope.test.ts` - Unit tests

---

#### 3.2 Create Content-Addressed File Storage

**Objectives**:

- Implement SHA-256 based file organization with directory sharding
- Build secure file operations with encryption/decryption
- Add perceptual hashing using sharp-phash for image comparison

**Technical Requirements**:

- Requirements: 1.3, 2.6, 4.2

**Implementation Steps**:

1. Design storage layout:

   ```
   data/
   ├── originals/
   │   └── ab/
   │       └── cd/
   │           └── abcd1234...sha256.enc
   ├── restored/
   │   └── ef/
   │       └── gh/
   │           └── efgh5678...sha256.enc
   └── keys/
       └── ab/
           └── cd/
               └── abcd1234...sha256.dek.enc
   ```

2. Create `src/storage/content-addressed.ts`:
   - SHA-256 computation for content addressing
   - Directory sharding (first 2 bytes → ab/cd/)
   - Encrypted file read/write operations

3. Implement perceptual hashing:
   - Install `sharp` and `sharp-phash`
   - Create `src/hash/perceptual.ts`
   - Compute pHash for duplicate detection
   - Store pHash in RequestRecord model

4. Add file metadata tracking:
   - Original file hash, size, mime type
   - Perceptual hash for similarity detection
   - Encryption metadata (IV, DEK reference)

**Dependencies to Add**:

```bash
npm install sharp sharp-phash
npm install --save-dev @types/sharp
```

**Files to Create**:

- `src/storage/content-addressed.ts` - Storage implementation
- `src/hash/perceptual.ts` - Perceptual hashing
- `src/storage/index.ts` - Storage module exports
- `tests/storage/content-addressed.test.ts` - Unit tests

---

#### 3.3 Implement EXIF and C2PA Metadata Handling

**Objectives**:

- Integrate exiftool-vendored for reliable EXIF metadata operations
- Build C2PA manifest creation and validation using c2pa-node
- Create metadata embedding and extraction utilities

**Technical Requirements**:

- Requirements: 2.5, 4.3, 7.6

**Implementation Steps**:

1. Install dependencies:

   ```bash
   npm install exiftool-vendored c2pa-node
   ```

2. Create `src/metadata/exif.ts`:
   - Wrap exiftool-vendored for type-safe EXIF operations
   - Embed custom tags (originalPostId, requestId, approvalTimestamp)
   - Extract and validate EXIF metadata

3. Create `src/metadata/c2pa.ts`:
   - Implement C2PA manifest creation
   - Add provenance data (AI model, operator actions, timestamps)
   - Build manifest validation and integrity checking

4. Create `src/metadata/embed.ts`:
   - Combine EXIF + C2PA into single embedding operation
   - Handle metadata preservation during file operations
   - Create extraction utilities for verification

**Dependencies to Add**:

```bash
npm install exiftool-vendored c2pa-node
npm install --save-dev @types/exiftool-vendored
```

**Files to Create**:

- `src/metadata/exif.ts` - EXIF operations
- `src/metadata/c2pa.ts` - C2PA manifest handling
- `src/metadata/embed.ts` - Combined embedding utilities
- `src/metadata/index.ts` - Metadata module exports
- `tests/metadata/exif.test.ts` - EXIF tests
- `tests/metadata/c2pa.test.ts` - C2PA tests

---

### Task 3 Acceptance Criteria

Before marking Task 3 as complete:

- [ ] Envelope encryption working with OS keychain
- [ ] AES-256-GCM encryption/decryption functional
- [ ] Content-addressed storage with SHA-256 sharding
- [ ] Perceptual hashing integrated (sharp-phash)
- [ ] EXIF metadata embedding and extraction working
- [ ] C2PA manifest creation and validation functional
- [ ] All unit tests passing
- [ ] Linting and formatting passed
- [ ] TypeScript build successful
- [ ] Documentation updated

---

## Phase 3: API Server & Authentication

### Task 4: Express API Server 🔜 **UPCOMING**

**Priority**: MEDIUM-HIGH
**Estimated Effort**: 4-6 days
**Dependencies**: Task 3 complete

#### Subtasks:

1. **4.1**: Express setup with security middleware (Helmet, CSP, rate limiting)
2. **4.2**: Zod schema validation for all endpoints
3. **4.3**: WebAuthn passkey authentication system
4. **4.4**: Core API endpoints (ingestion, review, metrics)

**Key Technologies**:

- Express.js with TypeScript
- Helmet for security headers
- express-rate-limit with Redis
- Zod for validation
- @simplewebauthn/server for WebAuthn

**Estimated Timeline**: 1 week after Task 3

---

### Task 5: BullMQ Queue System 🔜 **UPCOMING**

**Priority**: MEDIUM
**Estimated Effort**: 2-3 days
**Dependencies**: Task 4 complete

#### Subtasks:

1. **5.1**: Redis-backed job queues with persistence
2. **5.2**: Classification and restoration job processors
3. **5.3**: Bull Board dashboard for queue monitoring

**Key Technologies**:

- BullMQ (Redis-backed job queues)
- Bull Board (queue monitoring UI)
- Exponential backoff and retry strategies

**Estimated Timeline**: 1 week after Task 4

---

## Phase 4: AI Processing Pipeline

### Task 6: AI Processing 🔜 **FUTURE**

**Priority**: MEDIUM
**Estimated Effort**: 1-2 weeks
**Dependencies**: Task 5 complete

#### Subtasks:

1. **6.1**: Intent classification worker
2. **6.2**: Local AI pipeline (PyTorch MPS/DirectML)
3. **6.3**: Cloud AI pipeline (Gemini integration)
4. **6.4**: Content safety and NSFW detection

**Key Technologies**:

- PyTorch with MPS acceleration (Apple Silicon)
- DirectML for Windows GPU
- ComfyUI workflow orchestration
- Google Gen AI SDK (Gemini)
- TensorFlow.js for NSFW detection

**Estimated Timeline**: 2-3 weeks after Task 5

---

## Phase 5: Ingestion & Review Dashboard

### Task 7: Assisted Ingestion Service 🔜 **FUTURE**

**Priority**: MEDIUM
**Estimated Effort**: 1-2 weeks
**Dependencies**: Task 6 complete

#### Subtasks:

1. **7.1**: Playwright-based Facebook group monitoring
2. **7.2**: Automated canary testing for UI resilience
3. **7.3**: Optional third-party extraction integration (Zyte API)

---

### Task 8: Review Dashboard 🔜 **FUTURE**

**Priority**: HIGH
**Estimated Effort**: 2-3 weeks
**Dependencies**: Task 4, 6 complete

#### Subtasks:

1. **8.1**: React-based review interface
2. **8.2**: Accessibility features and alt-text generation
   - **WCAG 2.1 AA compliance** with keyboard navigation, screen reader support, and high-contrast mode
   - AI-powered alt-text suggestions (Google Gemini 2.5 Flash or local BLIP-2)
   - Automated accessibility testing with axe-core
   - See [Dashboard Accessibility Guide](./dashboard/accessibility.md) for details
3. **8.3**: NSFW content handling
4. **8.4**: Posting workflow with proof capture

---

## Phase 6: Safety, Monitoring, Privacy

### Task 9: Safety Validation System 🔜 **FUTURE**

**Priority**: HIGH
**Estimated Effort**: 1 week
**Dependencies**: Task 3, 6 complete

---

### Task 10: Monitoring & Observability 🔜 **FUTURE**

**Priority**: MEDIUM
**Estimated Effort**: 1 week
**Dependencies**: Task 4, 5 complete

---

### Task 11: Privacy Controls & Data Lifecycle 🔜 **FUTURE**

**Priority**: HIGH (Compliance)
**Estimated Effort**: 1 week
**Dependencies**: Task 2, 3 complete

---

### Task 12: Supply Chain Security 🔜 **FUTURE**

**Priority**: MEDIUM
**Estimated Effort**: 3-4 days
**Dependencies**: CI/CD pipeline active

---

### Task 13: Comprehensive Testing Suite ⭐ **OPTIONAL**

**Priority**: MEDIUM
**Estimated Effort**: Ongoing

---

## Immediate Next Actions (This Week)

### 1. Apply CI/CD Optimizations

**Priority**: HIGH (Quick Win)
**Effort**: 15-30 minutes

From the CI workflow review (`docs/CI_WORKFLOW_REVIEW.md`):

```yaml
# Phase 1 - Critical fixes
- Add job dependencies (needs: [lint-and-format])
- Disable test job until real tests exist
- Add concurrency control
- Fix MongoDB health check (use mongosh)
```

**Action**:

```bash
# Edit .github/workflows/ci.yml with recommended changes
git add .github/workflows/ci.yml
git commit -m "ci: optimize workflow with job dependencies and concurrency control"
git push -u origin claude/monitor-pr-merge-workflow-011CUoyUoMwFLnRVDnGNjKgZ
```

---

### 2. Start Task 3.1: Envelope Encryption

**Priority**: HIGH
**Effort**: 1-2 days

**Steps**:

1. Create feature branch:

   ```bash
   git checkout -b feature/task-3.1-envelope-encryption
   ```

2. Install dependencies:

   ```bash
   npm install @electron/keytar
   npm install --save-dev @types/keytar
   ```

3. Implement envelope encryption:
   - Create `src/crypto/` directory
   - Implement `envelope.ts`, `keystore.ts`
   - Add unit tests

4. Validate:

   ```bash
   npm run lint
   npm run build
   npm test
   ```

5. Commit and open PR:
   ```bash
   git add .
   git commit -m "feat: implement envelope encryption with OS keychain"
   git push -u origin feature/task-3.1-envelope-encryption
   gh pr create --title "Task 3.1: Envelope Encryption" --body "..."
   ```

---

### 3. Set Up Testing Infrastructure

**Priority**: MEDIUM (Foundational)
**Effort**: 2-3 hours

**Action**:

1. Choose test framework: **Vitest** (recommended) or Jest
2. Install dependencies:

   ```bash
   npm install --save-dev vitest @vitest/ui
   ```

3. Create test configuration:

   ```typescript
   // vitest.config.ts
   import { defineConfig } from 'vitest/config';

   export default defineConfig({
     test: {
       environment: 'node',
       globals: true,
       coverage: {
         provider: 'v8',
         reporter: ['text', 'json', 'html']
       }
     }
   });
   ```

4. Update package.json:

   ```json
   {
     "scripts": {
       "test": "vitest run",
       "test:watch": "vitest",
       "test:coverage": "vitest run --coverage"
     }
   }
   ```

5. Write first test:

   ```typescript
   // tests/lib/logger.test.ts
   import { describe, it, expect } from 'vitest';
   import { logger } from '../../src/lib/logger';

   describe('Logger', () => {
     it('should create logger instance', () => {
       expect(logger).toBeDefined();
       expect(logger.info).toBeInstanceOf(Function);
     });
   });
   ```

---

## Timeline Estimate

### Q1 2025 (Current)

- ✅ Week 1-2: Foundation & Infrastructure (Task 1)
- ✅ Week 3-4: Data Models (Task 2)
- 🎯 **Week 5-6: Encrypted Storage (Task 3)** ← **YOU ARE HERE**

### Q1-Q2 2025

- Week 7-8: API Server & Authentication (Task 4)
- Week 9-10: Queue System (Task 5)
- Week 11-13: AI Processing Pipeline (Task 6)

### Q2 2025

- Week 14-16: Ingestion Service (Task 7)
- Week 17-20: Review Dashboard (Task 8)

### Q2-Q3 2025

- Week 21-22: Safety Validation (Task 9)
- Week 23-24: Monitoring & Privacy (Task 10, 11)
- Week 25-26: Supply Chain Security (Task 12)
- Ongoing: Testing Suite (Task 13)

### Q3 2025

- Final integration testing
- Security audit
- Documentation finalization
- Beta deployment

---

## Success Metrics

### Technical Metrics

- [ ] All 13 tasks completed
- [ ] > 80% test coverage
- [ ] Zero critical security vulnerabilities
- [ ] <2s p95 latency for API endpoints
- [ ] <30s p95 processing time for standard restorations

### Quality Metrics

- [ ] CI/CD pipeline green
- [ ] All linting/formatting rules passing
- [ ] TypeScript strict mode enabled
- [ ] WCAG 2.1 AA compliance
- [ ] C2PA provenance on all restored images

### Security Metrics

- [ ] WebAuthn passkey authentication
- [ ] AES-256-GCM encryption at rest
- [ ] Tamper-evident audit logs
- [ ] Container signing with Cosign
- [ ] SBOM generation and vulnerability scanning

---

## Key Decision Points

### Immediate Decisions Needed

1. **Test Framework Choice**:
   - ✅ Recommended: **Vitest** (faster, ESM-native, better DX)
   - Alternative: Jest (industry standard, larger ecosystem)

2. **Key Management Strategy**:
   - Option A: OS Keychain (@electron/keytar) ← **Recommended for local-first**
   - Option B: External KMS (AWS KMS, Google KMS)
   - Option C: Encrypted .env file (less secure)

3. **C2PA Library**:
   - Option A: c2pa-node (official, maintained by Adobe)
   - Option B: Build custom implementation
   - ✅ Recommended: **c2pa-node**

### Future Decisions

4. **React Framework for Dashboard** (Task 8):
   - Next.js, Vite + React, or Remix?

5. **AI Model Selection** (Task 6):
   - Local: GFPGAN, CodeFormer, or custom model?
   - Cloud: Gemini 2.5 Flash or other?

6. **Deployment Strategy**:
   - Docker Compose (current)
   - Kubernetes
   - Single binary with embedded DB

---

## Resources & Documentation

### Project Documentation

- [Requirements](.kiro/specs/ai-photo-restoration/requirements.md)
- [Design](.kiro/specs/ai-photo-restoration/design.md)
- [Implementation Tasks](.kiro/specs/ai-photo-restoration/tasks.md)

### Technical Reviews

- [CI Workflow Review](./CI_WORKFLOW_REVIEW.md)
- [Workflow Monitoring Script](../scripts/monitor-workflow.sh)

### External Resources

- [MongoDB CSFLE Docs](https://www.mongodb.com/docs/manual/core/csfle/)
- [C2PA Specification](https://c2pa.org/specifications/specifications/1.0/specs/C2PA_Specification.html)
- [WebAuthn Guide](https://webauthn.guide/)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)

---

## Contact & Support

For questions or clarifications:

- Review task specifications in `.kiro/specs/ai-photo-restoration/`
- Check GitHub issues for known problems
- Consult design docs for architectural decisions

---

## Appendix: Technology Stack

### Backend

- **Runtime**: Node.js 18.18.0+
- **Language**: TypeScript 5.4+
- **Framework**: Express.js
- **Database**: MongoDB 7.0 with Mongoose
- **Cache/Queue**: Redis 7.2 + BullMQ
- **Logging**: Pino
- **Validation**: Zod

### Security

- **Encryption**: AES-256-GCM (Node.js crypto)
- **Key Management**: OS Keychain (@electron/keytar)
- **Authentication**: WebAuthn (@simplewebauthn/server)
- **Metadata**: exiftool-vendored, c2pa-node

### AI & Processing

- **Image Processing**: Sharp
- **Perceptual Hashing**: sharp-phash
- **Local AI**: PyTorch (MPS/DirectML)
- **Cloud AI**: Google Gen AI SDK (Gemini)
- **NSFW Detection**: TensorFlow.js

### Frontend (Future)

- **Framework**: React (TBD: Next.js vs Vite)
- **Automation**: Playwright
- **Testing**: Vitest (recommended)

### DevOps

- **Containerization**: Docker + Docker Compose
- **CI/CD**: GitHub Actions
- **Monitoring**: Prometheus + Grafana
- **Security**: Cosign, Trivy
- **Linting**: ESLint + Prettier

---

**Last Updated**: 2025-11-05
**Next Review**: After Task 3 completion
