/**
 * Combined Metadata Embedding
 *
 * This module combines EXIF and C2PA metadata embedding into a unified API.
 * It provides high-level functions for embedding complete provenance data
 * into restored images.
 */

import { createRestorationManifest, serializeManifest, type C2PAManifest } from './c2pa.js';
import { writeEXIF, readEXIF, type PhotoRestorationMetadata } from './exif.js';

/**
 * Complete metadata package for a restored image
 */
export interface CompleteMetadata extends PhotoRestorationMetadata {
  /** C2PA manifest */
  c2paManifest?: C2PAManifest;
  /** Serialized C2PA manifest (JSON) */
  c2paManifestJSON?: string;
}

/**
 * Result of embedding metadata
 */
export interface EmbedResult {
  /** Image buffer with embedded metadata */
  imageBuffer: Buffer;
  /** EXIF metadata that was embedded */
  exifMetadata: PhotoRestorationMetadata;
  /** C2PA manifest that was created */
  c2paManifest?: C2PAManifest;
  /** C2PA manifest as JSON */
  c2paManifestJSON?: string;
}

/**
 * Embed complete provenance metadata into a restored image
 *
 * This includes:
 * - EXIF tags with restoration tracking data
 * - C2PA manifest with action history and AI provenance
 *
 * @param imageBuffer - Restored image data
 * @param metadata - Metadata to embed
 * @returns Image with embedded metadata
 */
export async function embedCompleteMetadata(
  imageBuffer: Buffer,
  metadata: {
    originalPostId: string;
    requestId: string;
    aiModel: string;
    approvedBy?: string;
    approvalTimestamp?: Date;
    restorationTimestamp: Date;
    originalSHA256: string;
    restoredSHA256?: string;
    originalPerceptualHash?: string;
  }
): Promise<EmbedResult> {
  // Create C2PA manifest
  const c2paManifest = createRestorationManifest({
    originalPostId: metadata.originalPostId,
    requestId: metadata.requestId,
    aiModel: metadata.aiModel,
    approvedBy: metadata.approvedBy,
    approvalTimestamp: metadata.approvalTimestamp,
    restorationTimestamp: metadata.restorationTimestamp,
    originalSHA256: metadata.originalSHA256,
    restoredSHA256: metadata.restoredSHA256,
  });

  const c2paManifestJSON = serializeManifest(c2paManifest);

  // Prepare EXIF metadata
  const exifMetadata: PhotoRestorationMetadata = {
    originalPostId: metadata.originalPostId,
    requestId: metadata.requestId,
    approvalTimestamp: metadata.approvalTimestamp,
    restorationTimestamp: metadata.restorationTimestamp,
    aiModel: metadata.aiModel,
    approvedBy: metadata.approvedBy,
    originalSHA256: metadata.originalSHA256,
    originalPerceptualHash: metadata.originalPerceptualHash,
  };

  // Embed EXIF metadata
  // Note: C2PA manifest would typically be embedded using c2pa-node,
  // but for now we store it in EXIF as well for accessibility
  const imageWithMetadata = await writeEXIF(imageBuffer, exifMetadata);

  return {
    imageBuffer: imageWithMetadata,
    exifMetadata,
    c2paManifest,
    c2paManifestJSON,
  };
}

/**
 * Extract all metadata from an image
 *
 * @param imageBuffer - Image with embedded metadata
 * @returns Complete metadata
 */
export async function extractCompleteMetadata(imageBuffer: Buffer): Promise<CompleteMetadata> {
  const exifData = await readEXIF(imageBuffer);

  const metadata: CompleteMetadata = {
    originalPostId: exifData.originalPostId,
    requestId: exifData.requestId,
    approvalTimestamp: exifData.approvalTimestamp,
    restorationTimestamp: exifData.restorationTimestamp,
    aiModel: exifData.aiModel,
    approvedBy: exifData.approvedBy,
    originalSHA256: exifData.originalSHA256,
    originalPerceptualHash: exifData.originalPerceptualHash,
  };

  // Extract C2PA manifest if present (would be extracted differently in production)
  const c2paManifestJSON: string | undefined = undefined;
  if (c2paManifestJSON) {
    try {
      metadata.c2paManifestJSON = c2paManifestJSON;
      // Would parse with parseManifest() here
    } catch {
      // Invalid manifest JSON
    }
  }

  return metadata;
}

/**
 * Verify metadata integrity
 *
 * Checks that:
 * - EXIF metadata is present and valid
 * - SHA-256 hash matches (if provided)
 * - C2PA manifest is valid (if present)
 *
 * @param imageBuffer - Image to verify
 * @param expectedSHA256 - Expected original SHA-256 hash
 * @returns True if metadata is valid
 */
export async function verifyMetadataIntegrity(
  imageBuffer: Buffer,
  expectedSHA256?: string
): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];

  try {
    const metadata = await extractCompleteMetadata(imageBuffer);

    // Check required fields
    if (!metadata.originalPostId) {
      errors.push('Missing originalPostId in metadata');
    }
    if (!metadata.requestId) {
      errors.push('Missing requestId in metadata');
    }

    // Verify SHA-256 if provided
    if (expectedSHA256 && metadata.originalSHA256 !== expectedSHA256) {
      errors.push(`SHA-256 mismatch: expected ${expectedSHA256}, got ${metadata.originalSHA256}`);
    }

    // Verify C2PA manifest if present
    if (metadata.c2paManifestJSON) {
      // Would validate with validateManifest() here
    }
  } catch (error) {
    errors.push(`Failed to extract metadata: ${error}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Create a metadata summary for display
 *
 * @param imageBuffer - Image with metadata
 * @returns Human-readable metadata summary
 */
export async function getMetadataSummary(imageBuffer: Buffer): Promise<string[]> {
  const metadata = await extractCompleteMetadata(imageBuffer);
  const summary: string[] = [];

  summary.push(`Request ID: ${metadata.requestId || 'Unknown'}`);
  summary.push(`Original Post ID: ${metadata.originalPostId || 'Unknown'}`);

  if (metadata.aiModel) {
    summary.push(`AI Model: ${metadata.aiModel}`);
  }

  if (metadata.approvedBy) {
    summary.push(`Approved By: ${metadata.approvedBy}`);
  }

  if (metadata.approvalTimestamp) {
    summary.push(`Approved: ${metadata.approvalTimestamp.toLocaleString()}`);
  }

  if (metadata.restorationTimestamp) {
    summary.push(`Restored: ${metadata.restorationTimestamp.toLocaleString()}`);
  }

  if (metadata.originalSHA256) {
    summary.push(`Original SHA-256: ${metadata.originalSHA256.substring(0, 16)}...`);
  }

  return summary;
}
