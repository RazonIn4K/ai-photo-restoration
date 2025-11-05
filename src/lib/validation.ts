import { createHash } from 'node:crypto';
import { z } from 'zod';

/**
 * Validation schemas for common data types
 */

export const FacebookPostUrlSchema = z
  .string()
  .url()
  .refine(url => url.includes('facebook.com') || url.includes('fb.com'), {
    message: 'Must be a valid Facebook URL'
  });

export const FacebookUserIdSchema = z.string().min(1).max(50);

export const ImageHashSchema = z.string().length(64, 'SHA-256 hash must be 64 characters');

export const PerceptualHashSchema = z.string().min(16).max(64);

export const UlidSchema = z.string().length(26, 'ULID must be 26 characters');

export const RequestIdSchema = UlidSchema;

/**
 * Validation for photo assets
 */
export const PhotoAssetSchema = z.object({
  assetId: UlidSchema,
  originalImageUrl: z.string().url(),
  originalImageHash: ImageHashSchema,
  originalImagePath: z.string().min(1),
  restoredImageUrl: z.string().url().optional(),
  restoredImageHash: ImageHashSchema.optional(),
  restoredImagePath: z.string().optional(),
  perceptualHash: PerceptualHashSchema,
  restoredPerceptualHash: PerceptualHashSchema.optional(),
  selected: z.boolean().default(true)
});

/**
 * Validation for processing metadata
 */
export const ProcessingMetadataSchema = z.object({
  modelUsed: z.string().min(1),
  cost: z.number().min(0).optional(),
  appliedEffects: z.array(z.string()).default([]),
  processingTimeMs: z.number().min(0).optional(),
  confidenceScore: z.number().min(0).max(1).optional()
});

/**
 * Validation for posting proof bundle
 */
export const PostingProofBundleSchema = z.object({
  commentUrl: FacebookPostUrlSchema,
  postedAt: z.date(),
  screenshotPath: z.string().optional(),
  c2paManifestPath: z.string().min(1),
  waczPath: z.string().optional(),
  verifierSignature: z.string().min(1),
  notes: z.string().optional()
});

/**
 * Utility functions for validation
 */

export function validateImageHash(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

export function isValidImageHash(hash: string, buffer: Buffer): boolean {
  const computedHash = validateImageHash(buffer);
  return hash === computedHash;
}

export function validateRequestId(requestId: string): boolean {
  return UlidSchema.safeParse(requestId).success;
}

export function validateFacebookUrl(url: string): boolean {
  return FacebookPostUrlSchema.safeParse(url).success;
}

/**
 * Sanitization functions
 */

export function sanitizeUserInput(input: string): string {
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .substring(0, 10000); // Limit length
}

export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9.-]/g, '_') // Replace special chars with underscore
    .replace(/_{2,}/g, '_') // Replace multiple underscores with single
    .substring(0, 255); // Limit filename length
}

/**
 * Content validation
 */

export function validateImageMimeType(mimeType: string): boolean {
  const allowedTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/tiff',
    'image/bmp'
  ];
  return allowedTypes.includes(mimeType.toLowerCase());
}

export function validateImageSize(sizeBytes: number): boolean {
  const maxSize = 50 * 1024 * 1024; // 50MB
  const minSize = 1024; // 1KB
  return sizeBytes >= minSize && sizeBytes <= maxSize;
}

/**
 * Security validation
 */

export function validateOperatorId(operatorId: string): boolean {
  // Basic validation for operator ID format
  return /^[a-zA-Z0-9_-]{3,50}$/.test(operatorId);
}

export function validateApiKey(apiKey: string): boolean {
  // Basic validation for API key format
  return /^[a-zA-Z0-9_-]{32,}$/.test(apiKey);
}

/**
 * Business logic validation
 */

export function validateRetentionDays(days: number): boolean {
  return days >= 1 && days <= 2555; // 1 day to ~7 years
}

export function validateConfidenceScore(score: number): boolean {
  return score >= 0 && score <= 1;
}

export function validateProcessingCost(cost: number): boolean {
  return cost >= 0 && cost <= 1000; // Max $1000 per job
}
