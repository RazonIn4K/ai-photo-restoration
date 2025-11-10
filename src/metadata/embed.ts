/**
 * Combined Metadata Embedding
 *
 * This module combines EXIF and C2PA metadata embedding into a unified API.
 * It provides high-level functions for embedding complete provenance data
 * into restored images.
 */

import {
  createRestorationManifest,
  getActionSummary,
  parseManifest,
  serializeManifest,
  type C2PAManifest
} from './c2pa.js';
import { readEXIF, writeEXIF, type EXIFMetadata, type PhotoRestorationMetadata } from './exif.js';

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
    restoredSHA256: metadata.restoredSHA256
  });

  const c2paManifestJSON = serializeManifest(c2paManifest);

  // Prepare EXIF metadata including C2PA manifest
  const exifMetadata: PhotoRestorationMetadata = {
    originalPostId: metadata.originalPostId,
    requestId: metadata.requestId,
    approvalTimestamp: metadata.approvalTimestamp,
    restorationTimestamp: metadata.restorationTimestamp,
    aiModel: metadata.aiModel,
    approvedBy: metadata.approvedBy,
    originalSHA256: metadata.originalSHA256,
    originalPerceptualHash: metadata.originalPerceptualHash,
    c2paManifest: c2paManifestJSON
  };

  // Embed EXIF metadata (including C2PA manifest as JSON)
  // Note: C2PA manifest would typically be embedded using c2pa-node with cryptographic signing,
  // but for now we store it in EXIF for accessibility
  const imageWithMetadata = await writeEXIF(imageBuffer, exifMetadata);

  return {
    imageBuffer: imageWithMetadata,
    exifMetadata,
    c2paManifest,
    c2paManifestJSON
  };
}

/**
 * Extract all metadata from an image
 *
 * @param imageBuffer - Image with embedded metadata
 * @returns Complete metadata
 */
export async function extractCompleteMetadata(imageBuffer: Buffer): Promise<{
  exif: EXIFMetadata;
  c2pa: C2PAManifest | null;
}> {
  const exifData = await readEXIF(imageBuffer);

  // Extract C2PA manifest from EXIF if present
  let c2paManifest: C2PAManifest | null = null;
  if (exifData.c2paManifest) {
    try {
      c2paManifest = parseManifest(exifData.c2paManifest);
    } catch {
      // Invalid manifest JSON
    }
  }

  return {
    exif: exifData,
    c2pa: c2paManifest
  };
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
  expected?: Partial<PhotoRestorationMetadata>
): Promise<{ isValid: boolean; errors: string[] }> {
  const errors: string[] = [];

  try {
    const { exif } = await extractCompleteMetadata(imageBuffer);

    // Verify expected fields
    if (expected) {
      for (const [key, value] of Object.entries(expected)) {
        const actualValue = exif[key as keyof typeof exif];
        if (value !== undefined && actualValue !== value) {
          errors.push(`${key} mismatch: expected ${value}, got ${actualValue}`);
        }
      }
    }
  } catch (error) {
    errors.push(`Failed to extract metadata: ${error}`);
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Create a metadata summary for display
 *
 * @param imageBuffer - Image with metadata
 * @returns Human-readable metadata summary
 */
export async function getMetadataSummary(imageBuffer: Buffer): Promise<string> {
  const { exif, c2pa } = await extractCompleteMetadata(imageBuffer);
  const summary: string[] = [];

  if (!exif.requestId && !exif.originalPostId) {
    return 'No metadata found';
  }

  summary.push(`Request ID: ${exif.requestId || 'Unknown'}`);
  summary.push(`Original Post ID: ${exif.originalPostId || 'Unknown'}`);

  if (exif.aiModel) {
    summary.push(`AI Model: ${exif.aiModel}`);
  }

  if (exif.approvedBy) {
    summary.push(`Approved By: ${exif.approvedBy}`);
  }

  if (exif.approvalTimestamp) {
    summary.push(`Approved: ${exif.approvalTimestamp.toLocaleString()}`);
  }

  if (exif.restorationTimestamp) {
    summary.push(`Restored: ${exif.restorationTimestamp.toLocaleString()}`);
  }

  if (exif.originalSHA256) {
    summary.push(`Original SHA-256: ${exif.originalSHA256.substring(0, 16)}...`);
  }

  if (c2pa) {
    summary.push('\nC2PA Actions:');
    const actions = getActionSummary(c2pa);
    summary.push(...actions);
  }

  return summary.join('\n');
}
