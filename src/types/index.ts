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

export type StorageStatus = 'active' | 'archived' | 'erased';

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
  restoredImageUrl?: string;
  restoredImageHash?: string;
  restoredImagePath?: string;
  perceptualHash: string;
  restoredPerceptualHash?: string;
  selected: boolean; // For selective restoration

  // Content-addressed storage integration
  originalStorageId?: string; // CAS blob ID for encrypted original
  restoredStorageId?: string; // CAS blob ID for encrypted restored image
  c2paManifestRef?: string; // Reference to C2PA manifest
  metadataStorageId?: string; // Reference to embedded metadata
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
