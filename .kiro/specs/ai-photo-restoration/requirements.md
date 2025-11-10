# Requirements Document

## Introduction

The AI Photo Restoration Service is a semi-automated system that processes photo restoration requests from Facebook groups using AI while maintaining complete human oversight. The system runs entirely on local infrastructure (optimized for Mac M2) and ensures 100% traceability between original requests and restored photos through a comprehensive review dashboard.

## Glossary

- **Photo_Restoration_System**: The complete local application including scraper, AI processor, and review dashboard
- **Request_Record**: A database entry linking a Facebook post to its restoration workflow with unique identifier
- **Review_Dashboard**: Web interface for human approval of AI-restored photos before posting
- **Restoration_Worker**: Background process that handles AI image processing via local or cloud models
- **Traceability_Chain**: Complete audit trail from original Facebook post to final restored image
- **Safety_Checks**: Validation processes ensuring correct photo-to-post matching before manual posting

## Requirements

### Requirement 1

**User Story:** As a photo restoration service operator, I want to automatically discover new restoration requests from Facebook groups, so that I can process them without manually monitoring multiple groups.

#### Acceptance Criteria

1. WHEN a new photo restoration request is posted in a monitored Facebook group, THE Photo_Restoration_System SHALL create a Request_Record with unique identifier
2. THE Photo_Restoration_System SHALL process posts with multiple photos by ingesting all assets and enabling selective restoration
3. THE Photo_Restoration_System SHALL download the original image and compute SHA-256 hash for verification
4. THE Photo_Restoration_System SHALL extract poster information and request details from the Facebook post
5. THE Photo_Restoration_System SHALL avoid duplicate processing by checking existing Request_Records against post URLs
6. THE Photo_Restoration_System SHALL queue the Request_Record for AI processing after successful ingestion
7. THE Photo_Restoration_System SHALL handle Facebook UI changes through configurable group settings and versioned selectors
8. WHERE third-party extraction services are used, THE Photo_Restoration_System SHALL require contractual approval and maintain fallback to local Playwright selectors
9. THE Photo_Restoration_System SHALL run automated canary tests of manual navigation flows when Facebook UI changes are detected

### Requirement 2

**User Story:** As a photo restoration service operator, I want AI to automatically restore photos using appropriate models, so that I can handle high volumes efficiently while maintaining quality.

#### Acceptance Criteria

1. WHEN a Request_Record is queued for processing, THE Restoration_Worker SHALL classify the restoration intent from user text
2. THE Restoration_Worker SHALL route simple enhancements to local models and complex restorations to cloud models
3. WHEN intent classification confidence is low, THE Restoration_Worker SHALL flag Request_Record for human triage
4. THE Restoration_Worker SHALL preserve original ethnic features and skin tones during restoration
5. THE Restoration_Worker SHALL embed request metadata in EXIF data of restored images
6. THE Restoration_Worker SHALL compute perceptual hash to detect over-aggressive modifications
7. THE Restoration_Worker SHALL perform NSFW and minor-sensitive content pre-checks before queuing for review
8. THE Restoration_Worker SHALL enforce model license policies and block unauthorized commercial use of restricted models

### Requirement 3

**User Story:** As a photo restoration service operator, I want to review every restored photo before posting, so that I can ensure quality and prevent posting errors.

#### Acceptance Criteria

1. WHEN a photo restoration is completed, THE Photo_Restoration_System SHALL update Request_Record status to awaiting manual approval
2. THE Review_Dashboard SHALL display side-by-side comparison of original and restored images
3. THE Review_Dashboard SHALL show Facebook post context including poster name and original request text
4. THE Review_Dashboard SHALL provide approve, reject, and reprocess actions for each restoration
5. THE Review_Dashboard SHALL require operator authentication and log all approval actions immutably
6. THE Review_Dashboard SHALL require explicit approval before enabling posting workflow
7. THE Review_Dashboard SHALL implement WebAuthn passkey authentication with short-lived sessions and CSRF protection
8. THE Review_Dashboard SHALL generate automatic alt-text suggestions for accessibility compliance

### Requirement 4

**User Story:** As a photo restoration service operator, I want foolproof traceability between requests and restorations, so that I never post the wrong photo to the wrong person.

#### Acceptance Criteria

1. THE Photo_Restoration_System SHALL generate unique request identifiers for each Facebook post
2. THE Photo_Restoration_System SHALL embed request metadata in restored image EXIF data
3. THE Photo_Restoration_System SHALL verify SHA-256 hash matches before allowing manual posting
4. THE Photo_Restoration_System SHALL validate EXIF metadata matches target Facebook post before posting
5. THE Photo_Restoration_System SHALL reject stale requests older than 7 days

### Requirement 5

**User Story:** As a photo restoration service operator, I want secure manual posting workflow, so that I comply with Facebook policies while maintaining safety.

#### Acceptance Criteria

1. WHEN a restoration is approved, THE Review_Dashboard SHALL provide original Facebook post URL for manual navigation
2. THE Review_Dashboard SHALL generate pre-formatted reply text for copying to clipboard
3. THE Review_Dashboard SHALL enable download of restored image for manual attachment
4. THE Photo_Restoration_System SHALL run Safety_Checks before enabling posting workflow
5. THE Review_Dashboard SHALL capture comprehensive posting proof bundle including C2PA manifest and signed verification
6. THE Review_Dashboard SHALL create WACZ archive of comment thread for legal compliance
7. THE Review_Dashboard SHALL enable one-click requeue when proof validation fails

### Requirement 6

**User Story:** As a photo restoration service operator, I want comprehensive monitoring and security, so that I can operate safely and track system performance.

#### Acceptance Criteria

1. THE Photo_Restoration_System SHALL validate all API inputs using schema validation
2. THE Photo_Restoration_System SHALL apply rate limiting and security headers to all endpoints
3. THE Photo_Restoration_System SHALL scan uploaded images for malware before processing
4. THE Photo_Restoration_System SHALL expose Prometheus metrics for monitoring queue status and processing times
5. THE Photo_Restoration_System SHALL log all restoration costs and token usage for budget tracking
6. THE Photo_Restoration_System SHALL implement modern browser security with COOP, COEP, CORP headers and strict CSP
7. THE Photo_Restoration_System SHALL use container signing and vulnerability scanning with Cosign and Trivy
8. THE Photo_Restoration_System SHALL anchor daily audit log roots to external transparency logs for tamper evidence

### Requirement 7

**User Story:** As a photo restoration service operator, I want ethical AI processing with transparency, so that I maintain trust and comply with regulations.

#### Acceptance Criteria

1. THE Restoration_Worker SHALL include ethical prompting to preserve original features and avoid stereotypes
2. THE Photo_Restoration_System SHALL watermark restored images with request identifier
3. THE Photo_Restoration_System SHALL include AI disclosure in default reply templates
4. THE Photo_Restoration_System SHALL provide opt-out mechanism for users who don't want AI processing
5. WHERE EU AI Act applies, THE Photo_Restoration_System SHALL label AI-generated content appropriately
6. THE Photo_Restoration_System SHALL embed C2PA manifests in restored images for provenance tracking

### Requirement 8

**User Story:** As a photo restoration service operator, I want comprehensive data handling and privacy controls, so that I comply with privacy regulations and maintain user trust.

#### Acceptance Criteria

1. THE Photo_Restoration_System SHALL encrypt all images at rest using AES-256 encryption
2. THE Photo_Restoration_System SHALL provide configurable retention policies for original and restored images
3. THE Photo_Restoration_System SHALL automatically scrub personally identifiable information after configured retention period
4. THE Photo_Restoration_System SHALL maintain audit logs of all data access and processing activities
5. THE Photo_Restoration_System SHALL provide user opt-out mechanism with immediate data deletion capability
6. THE Photo_Restoration_System SHALL implement cryptographic erasure using per-asset DEK with key zeroization
7. THE Photo_Restoration_System SHALL provide audit evidence of retention-time compliance and data destruction
