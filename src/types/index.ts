// Core type definitions for the AI Photo Restoration Service

export type RequestStatus =
  | 'queued'
  | 'processing'
  | 'pending_review' // Flagged for human triage
  | 'awaiting_manual_approval'
  | 'approved_pending_post'
  | 'rejected'
  | 'completed'
  | 'failed';

export type IntentCategory =
  | 'color_restoration' // Colorize black & white photos
  | 'damage_repair' // Fix tears, scratches, stains
  | 'quality_enhancement' // Upscale, denoise, sharpen
  | 'face_restoration' // Restore facial details
  | 'general_restoration' // Multiple restoration needs
  | 'unknown'; // Unable to determine intent

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
  modelUsed?: string;
  cost?: number;
  appliedEffects?: string[];
  processingTimeMs?: number;
  confidenceScore?: number;
  classification?: {
    keywords: string[];
    requiresHumanReview: boolean;
    complexityScore: number;
    classifiedAt: Date;
  };
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
