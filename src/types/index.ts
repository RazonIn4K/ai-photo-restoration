// Core type definitions for the AI Photo Restoration Service

export type RequestStatus =
  | 'queued'
  | 'processing'
  | 'awaiting_manual_approval'
  | 'approved_pending_post'
  | 'rejected'
  | 'completed'
  | 'failed';

export type IntentCategory =
  | 'simple_enhance'
  | 'colorize_only'
  | 'restore_heavy_damage'
  | 'custom_request';

export type ConsentStatus = 'opted_in' | 'opted_out' | 'unknown';

export type ConsentMethod = 'implicit' | 'explicit';

export type ActionType =
  | 'ingested'
  | 'classified'
  | 'restored'
  | 'approved'
  | 'rejected'
  | 'posted'
  | 'requeued';

export interface PhotoAsset {
  assetId: string;
  originalImageUrl: string;
  originalImageHash: string;
  originalImagePath: string;
  // Content-Addressed Storage identifiers
  originalStorageId?: string; // SHA-256 hash for CAS
  originalSHA256?: string; // Explicit SHA-256 of original
  restoredImageUrl?: string;
  restoredImageHash?: string;
  restoredImagePath?: string;
  restoredStorageId?: string; // SHA-256 hash for CAS of restored
  restoredSHA256?: string; // SHA-256 of restored with metadata
  perceptualHash: string;
  restoredPerceptualHash?: string;
  c2paManifestRef?: string; // Reference to C2PA provenance manifest
  selected: boolean; // For selective restoration
}

export interface ProcessingMetadata {
  modelUsed: string;
  cost?: number;
  appliedEffects: string[];
  processingTimeMs?: number;
  confidenceScore?: number;
}

export interface PostingProofBundle {
  commentUrl: string;
  postedAt: Date;
  screenshotPath?: string;
  c2paManifestPath: string;
  waczPath?: string;
  verifierSignature: string;
  notes?: string;
}

export interface ContentClassification {
  isNSFW: boolean;
  confidence: number;
  categories: string[];
  requiresHumanReview: boolean;
}

export interface VersionedSelectors {
  version: string;
  selectors: Record<string, string>;
  lastUpdated: Date;
  isActive: boolean;
}

export interface GroupConfig {
  groupId: string;
  selectors: VersionedSelectors;
  keywords: string[];
  lastScanTimestamp: Date;
  extractionMethod: 'playwright' | 'zyte' | 'hybrid';
  canarySchedule: string; // cron expression
}

// Zyte API types
export interface ZyteExtractionRequest {
  url: string;
  extractionOptions?: {
    screenshot?: boolean;
    screenshotOptions?: {
      fullPage?: boolean;
    };
    html?: boolean;
    text?: boolean;
  };
  customHeaders?: Record<string, string>;
  httpResponseBody?: boolean;
}

export interface ZyteExtractionResponse {
  url: string;
  statusCode: number;
  html?: string;
  text?: string;
  screenshot?: string; // base64
  httpResponseBody?: string;
  metadata?: {
    requestId?: string;
    processingTimeMs?: number;
  };
}

export interface ZyteError {
  type: 'rate_limit' | 'timeout' | 'auth' | 'network' | 'extraction' | 'unknown';
  message: string;
  statusCode?: number;
  retryable: boolean;
  originalError?: unknown;
}

export interface ZyteClientConfig {
  apiKey?: string;
  apiUrl: string;
  rateLimitPerMinute: number;
  retryMaxAttempts: number;
  timeoutMs: number;
}
