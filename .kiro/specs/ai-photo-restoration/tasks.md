# Implementation Plan

- [x] 1. Set up project foundation and core infrastructure
  - Create TypeScript project structure with proper tooling configuration
  - Set up Docker Compose with MongoDB, Redis, Prometheus, and Grafana services
  - Configure environment management with validation and secrets handling
  - Implement basic logging infrastructure with Pino structured logging
  - _Requirements: 6.1, 6.2, 8.1_

- [ ] 2. Implement core data models and database layer
  - [x] 2.1 Create MongoDB connection and configuration management
    - Set up Mongoose with connection pooling and retry logic
    - Configure MongoDB Client-Side Field Level Encryption (CSFLE) for sensitive data
    - Implement database health checks and monitoring
    - _Requirements: 8.1, 8.4_

  - [x] 2.2 Define core TypeScript interfaces and schemas
    - Create RequestRecord, ConsentRecord, and ActionLog interfaces
    - Implement PostingProofBundle and ContentClassification types
    - Define GroupConfig and VersionedSelectors interfaces
    - _Requirements: 1.1, 4.1, 5.5_

  - [x] 2.3 Implement Mongoose models with validation
    - Create Request model with compound indexes and validation rules
    - Implement Consent model with privacy controls
    - Build ActionLog model with immutable append-only structure
    - Add Config model for system settings and group configurations
    - _Requirements: 4.1, 8.4, 8.5_

- [x] 3. Build encrypted storage system with cryptographic controls
  - [x] 3.1 Implement envelope encryption with per-asset DEK
    - Create key management system using OS keychain integration
    - Implement AES-256-GCM encryption with authenticated encryption
    - Build cryptographic erasure functionality with DEK zeroization
    - _Requirements: 8.1, 8.6_

  - [x] 3.2 Create content-addressed file storage
    - Implement SHA-256 based file organization with directory sharding
    - Build secure file operations with encryption/decryption
    - Add perceptual hashing using sharp-phash for image comparison
    - _Requirements: 1.3, 2.6, 4.2_

- [x] 3.3 Implement EXIF and C2PA metadata handling
  - Integrate exiftool-vendored for reliable EXIF metadata operations
  - Build C2PA manifest creation and validation using c2pa-node
  - Create metadata embedding and extraction utilities
  - _Requirements: 2.5, 4.3, 7.6_

- [ ] 4. Create Express API server with enhanced security
  - [ ] 4.1 Set up Express application with security middleware
    - Configure Helmet with COOP, COEP, CORP headers
    - Implement strict Content Security Policy with nonces
    - Add Sec-Fetch-\* header validation and SameSite/Origin checks
    - Set up express-rate-limit with Redis backing
    - _Requirements: 6.1, 6.2, 6.6_

  - [ ] 4.2 Implement Zod schema validation for all endpoints
    - Create comprehensive input validation schemas
    - Build error handling middleware with structured responses
    - Add request sanitization and XSS protection
    - _Requirements: 6.1_

  - [ ] 4.3 Build WebAuthn passkey authentication system
    - Implement WebAuthn registration and authentication endpoints
    - Create passkey credential management with secure storage
    - Add MFA fallback with TOTP/SMS support
    - Build JWT token management with short-lived sessions and refresh tokens
    - _Requirements: 3.7_

  - [ ] 4.4 Create core API endpoints for request management
    - Build ingestion endpoint with multi-photo support
    - Implement review endpoints (approve, reject, reprocess)
    - Create posting proof submission endpoint
    - Add metrics endpoint for Prometheus integration
    - _Requirements: 1.1, 3.4, 5.5_

- [ ] 5. Implement BullMQ queue system with reliability features
  - [ ] 5.1 Set up Redis-backed job queues with persistence
    - Configure BullMQ with exponential backoff and retry strategies
    - Implement job deduplication using requestId as jobId
    - Set up dead letter queue for failed jobs with manual recovery
    - _Requirements: 1.6_

  - [ ] 5.2 Create classification and restoration job processors
    - Build job interfaces for classification and restoration workflows
    - Implement job status tracking and progress reporting
    - Add queue metrics integration with Prometheus
    - _Requirements: 2.1, 2.2_

  - [ ]\* 5.3 Add Bull Board dashboard for queue monitoring
    - Set up Bull Board UI for queue visualization and management
    - Configure authentication and access controls for queue dashboard
    - _Requirements: 6.4_

- [ ] 6. Build AI processing pipeline with multi-platform support
  - [ ] 6.1 Implement intent classification worker
    - Create text analysis for restoration intent detection
    - Build confidence scoring and human triage flagging
    - Add model routing logic (local vs cloud) based on intent and complexity
    - _Requirements: 2.1, 2.3_

  - [ ] 6.2 Create local AI pipeline with compute backend selection
    - Implement PyTorch MPS acceleration for Apple Silicon
    - Add DirectML support for Windows GPU acceleration
    - Build ComfyUI workflow orchestration for model chaining
    - Create model license compliance validation system
    - _Requirements: 2.2, 2.8_

  - [ ] 6.3 Implement cloud AI pipeline with Gemini integration
    - Integrate Google Gen AI SDK with gemini-2.5-flash-image model
    - Add ethical prompting with bias mitigation safeguards
    - Implement usage metadata tracking for cost management
    - Build automatic retry with circuit breaker pattern
    - _Requirements: 2.4, 7.1_

  - [ ] 6.4 Add content safety and NSFW detection
    - Implement NSFW content classification using TensorFlow.js models
    - Build minor-sensitive content detection pipeline
    - Create content flagging and human review workflows
    - _Requirements: 2.7_

- [ ] 7. Create assisted ingestion service with dual-path architecture
  - [ ] 7.1 Build Playwright-based Facebook group monitoring
    - Implement persistent browser context with session management
    - Create configurable selectors with versioning system
    - Build multi-photo post detection and selective ingestion
    - Add duplicate detection using post URL fingerprinting
    - _Requirements: 1.1, 1.2, 1.5, 1.7_

  - [ ] 7.2 Implement automated canary testing for UI resilience
    - Create smoke tests for Facebook UI selector validation
    - Build automated UI change detection with alerting
    - Implement fallback mechanisms when selectors fail
    - _Requirements: 1.9_

  - [ ]\* 7.3 Add optional third-party extraction integration
    - Integrate Zyte API with contractual compliance safeguards
    - Implement fallback to local Playwright when external API fails
    - Add rate limiting and error handling for external services
    - _Requirements: 1.8_

- [ ] 8. Build review dashboard with accessibility and security features
  - [ ] 8.1 Create React-based review interface
    - Build side-by-side image comparison with interactive slider
    - Implement perceptual hash distance visualization with diff heatmaps
    - Create Facebook post context display with external link handling
    - Add batch approval capabilities with safety confirmations
    - _Requirements: 3.2, 3.3, 3.4_

  - [ ] 8.2 Implement accessibility features and alt-text generation
    - Add automatic alt-text suggestions using image analysis
    - Build keyboard navigation and screen reader support
    - Implement high contrast mode and responsive design
    - Create WCAG 2.1 AA compliance validation
    - _Requirements: 3.8_

  - [ ] 8.3 Add NSFW content handling and content warnings
    - Build content flagging banners and warning systems
    - Implement blur/reveal controls for sensitive content
    - Create operator safety controls and content filtering
    - _Requirements: 2.7_

  - [ ] 8.4 Create posting workflow with proof capture
    - Build preformatted reply text generation with clipboard integration
    - Implement secure download controls with C2PA manifest embedding
    - Add WACZ capture functionality for legal compliance
    - Create posting proof bundle submission and validation
    - Build one-click requeue functionality when proof validation fails
    - _Requirements: 5.1, 5.2, 5.3, 5.6, 5.7_

- [ ] 9. Implement safety validation system with comprehensive checks
  - [ ] 9.1 Build core safety validation functions
    - Implement image hash validation with SHA-256 verification
    - Create EXIF metadata validation against expected Facebook post IDs
    - Build staleness checking with configurable age limits
    - Add approval status verification with immutable audit trails
    - _Requirements: 4.2, 4.3, 4.4_

  - [ ] 9.2 Add C2PA manifest validation and proof verification
    - Implement C2PA manifest integrity checking
    - Build posting proof bundle validation with signature verification
    - Create tamper detection for provenance data
    - _Requirements: 5.6, 7.6_

  - [ ] 9.3 Create comprehensive safety test suite
    - Build golden image tests for hash and EXIF validation
    - Create proof bundle validation test scenarios
    - Add safety check performance benchmarks
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [ ] 10. Add monitoring, observability, and audit systems
  - [ ] 10.1 Implement Prometheus metrics collection
    - Create custom metrics for job processing, queue status, and error rates
    - Add Gemini API usage tracking with cost estimation
    - Build container signature validation metrics
    - Implement vulnerability scan result tracking
    - _Requirements: 6.4, 6.5_

  - [ ] 10.2 Create immutable audit logging with tamper evidence
    - Build hash-chained audit log system with daily root anchoring
    - Implement Rekor transparency log integration for external verification
    - Add OpenTimestamps proof generation for audit entries
    - Create audit log integrity verification utilities
    - _Requirements: 6.8, 8.4_

  - [ ] 10.3 Set up Grafana dashboards and alerting
    - Create system overview dashboard with request throughput and queue metrics
    - Build processing performance dashboard with timing and cost analysis
    - Implement security monitoring dashboard with authentication and rate limit metrics
    - Add data retention dashboard with storage usage and cleanup tracking
    - _Requirements: 6.4_

- [ ] 11. Implement privacy controls and data lifecycle management
  - [ ] 11.1 Build consent management system
    - Create user consent tracking with opt-in/opt-out mechanisms
    - Implement immediate data deletion for opt-out requests
    - Build consent audit trails with immutable logging
    - _Requirements: 7.4, 8.5_

  - [ ] 11.2 Create automated data retention and cleanup
    - Implement configurable retention policies for images and metadata
    - Build automated PII scrubbing after retention periods
    - Create audit evidence generation for data destruction compliance
    - Add cryptographic erasure with DEK zeroization
    - _Requirements: 8.2, 8.3, 8.6, 8.7_

- [ ] 12. Add supply chain security and container hardening
  - [ ] 12.1 Implement container signing and verification
    - Set up Cosign for container image signing in CI/CD pipeline
    - Build signature verification in deployment process
    - Create alerts for signature mismatches or unsigned images
    - _Requirements: 6.7_

  - [ ] 12.2 Add vulnerability scanning and SBOM generation
    - Integrate Trivy for automated vulnerability detection
    - Build Software Bill of Materials (SBOM) generation
    - Create vulnerability alerts with severity classification
    - Implement dependency update automation with security patches
    - _Requirements: 6.7_

- [ ]\* 13. Create comprehensive testing suite
  - [ ]\* 13.1 Build unit tests for core functionality
    - Create tests for encryption/decryption operations
    - Build hash computation and verification tests
    - Add EXIF and C2PA metadata handling tests
    - Create safety validation algorithm tests
    - _Requirements: All core functionality_

  - [ ]\* 13.2 Implement integration tests for API and workflows
    - Build API endpoint tests using Supertest
    - Create database operation tests with MongoDB Memory Server
    - Add queue processing tests with BullMQ test utilities
    - Build file operation tests with temporary directories
    - _Requirements: All API and workflow functionality_

  - [ ]\* 13.3 Add end-to-end workflow testing
    - Create complete request lifecycle tests
    - Build dashboard UI tests using Playwright
    - Add performance testing with Artillery load testing
    - Create security testing with input fuzzing and authentication tests
    - _Requirements: Complete system workflows_
