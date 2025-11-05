/**
 * EXIF Metadata Operations
 *
 * This module provides EXIF metadata reading and writing capabilities using exiftool.
 * EXIF metadata is embedded in images to track:
 * - Original source information (Facebook post ID)
 * - Processing metadata (request ID, approval timestamp)
 * - Chain of custody information
 * - Content verification data
 *
 * Why exiftool-vendored?
 * - Reliable, battle-tested EXIF manipulation
 * - Vendor-ed exiftool binary (no system dependency)
 * - Type-safe TypeScript API
 * - Supports all common image formats
 */

import { ExifTool, Tags } from 'exiftool-vendored';
import { randomBytes } from 'node:crypto';
import { writeFile, readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Extended Tags interface with our custom fields
 */
interface ExtendedTags extends Tags {
  OriginalPostId?: string;
  RequestId?: string;
  ApprovalTimestamp?: string;
  RestorationTimestamp?: string;
  AIModel?: string;
  ApprovedBy?: string;
  OriginalSHA256?: string;
  OriginalPerceptualHash?: string;
  c2paManifest?: string;
}

/**
 * Custom EXIF tags for photo restoration tracking
 */
export interface PhotoRestorationMetadata {
  /** Original Facebook post ID */
  originalPostId: string;
  /** Request ID from our system */
  requestId: string;
  /** When the photo was approved for restoration */
  approvalTimestamp?: Date;
  /** When the restoration was completed */
  restorationTimestamp?: Date;
  /** AI model used for restoration */
  aiModel?: string;
  /** Operator who approved the restoration */
  approvedBy?: string;
  /** SHA-256 hash of the original photo */
  originalSHA256?: string;
  /** Perceptual hash of the original photo */
  originalPerceptualHash?: string;
}

/**
 * EXIF metadata result
 */
export interface EXIFMetadata extends PhotoRestorationMetadata {
  /** Image width */
  width?: number;
  /** Image height */
  height?: number;
  /** Image format */
  format?: string;
  /** Original creation date */
  dateCreated?: Date;
  /** Camera make */
  make?: string;
  /** Camera model */
  model?: string;
  /** All raw EXIF tags */
  rawTags?: Tags;
}

/**
 * Singleton exiftool instance
 */
let exiftool: ExifTool | null = null;

/**
 * Get or create exiftool instance
 */
function getExifTool(): ExifTool {
  if (!exiftool) {
    exiftool = new ExifTool({ taskTimeoutMillis: 30000 });
  }
  return exiftool;
}

/**
 * Close exiftool instance (call on shutdown)
 */
export async function closeExifTool(): Promise<void> {
  if (exiftool) {
    await exiftool.end();
    exiftool = null;
  }
}

/**
 * Read EXIF metadata from an image buffer
 *
 * @param imageBuffer - Image data
 * @returns EXIF metadata
 */
export async function readEXIF(imageBuffer: Buffer): Promise<EXIFMetadata> {
  const tool = getExifTool();

  // exiftool requires a file path, so write buffer to temp file
  const tempFile = join(tmpdir(), `exif-read-${randomBytes(8).toString('hex')}.tmp`);

  try {
    await writeFile(tempFile, imageBuffer);

    const tags = await tool.read(tempFile);

    // Extract standard metadata
    const metadata: EXIFMetadata = {
      width: tags.ImageWidth,
      height: tags.ImageHeight,
      format: tags.FileType,
      dateCreated: tags.DateTimeOriginal instanceof Date ? tags.DateTimeOriginal : undefined,
      make: tags.Make,
      model: tags.Model,

      // Extract custom restoration metadata (if present)
      originalPostId: (tags as ExtendedTags).OriginalPostId || '',
      requestId: (tags as ExtendedTags).RequestId || '',
      approvalTimestamp: (tags as ExtendedTags).ApprovalTimestamp
        ? new Date((tags as ExtendedTags).ApprovalTimestamp!)
        : undefined,
      restorationTimestamp: (tags as ExtendedTags).RestorationTimestamp
        ? new Date((tags as ExtendedTags).RestorationTimestamp!)
        : undefined,
      aiModel: (tags as ExtendedTags).AIModel,
      approvedBy: (tags as ExtendedTags).ApprovedBy,
      originalSHA256: (tags as ExtendedTags).OriginalSHA256,
      originalPerceptualHash: (tags as ExtendedTags).OriginalPerceptualHash,

      rawTags: tags,
    };

    return metadata;
  } finally {
    // Clean up temp file
    try {
      await unlink(tempFile);
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Write EXIF metadata to an image buffer
 *
 * Creates a new image buffer with embedded EXIF metadata.
 * Original buffer is not modified.
 *
 * @param imageBuffer - Image data
 * @param metadata - Metadata to embed
 * @returns New image buffer with embedded metadata
 */
export async function writeEXIF(
  imageBuffer: Buffer,
  metadata: Partial<PhotoRestorationMetadata>
): Promise<Buffer> {
  const tool = getExifTool();

  const tempInputFile = join(tmpdir(), `exif-write-input-${randomBytes(8).toString('hex')}.tmp`);
  const tempOutputFile = join(tmpdir(), `exif-write-output-${randomBytes(8).toString('hex')}.tmp`);

  try {
    await writeFile(tempInputFile, imageBuffer);

    // Build EXIF tags to write
    const tags: Partial<ExtendedTags> = {};

    // Use UserComment and ImageDescription fields for custom data
    // These are standard EXIF fields that support arbitrary text
    if (metadata.originalPostId) {
      tags.OriginalPostId = metadata.originalPostId;
    }
    if (metadata.requestId) {
      tags.RequestId = metadata.requestId;
    }
    if (metadata.approvalTimestamp) {
      tags.ApprovalTimestamp = metadata.approvalTimestamp.toISOString();
    }
    if (metadata.restorationTimestamp) {
      tags.RestorationTimestamp = metadata.restorationTimestamp.toISOString();
    }
    if (metadata.aiModel) {
      tags.AIModel = metadata.aiModel;
    }
    if (metadata.approvedBy) {
      tags.ApprovedBy = metadata.approvedBy;
    }
    if (metadata.originalSHA256) {
      tags.OriginalSHA256 = metadata.originalSHA256;
    }
    if (metadata.originalPerceptualHash) {
      tags.OriginalPerceptualHash = metadata.originalPerceptualHash;
    }

    // Write tags to output file
    await tool.write(tempInputFile, tags, ['-o', tempOutputFile]);

    // Read the output file
    const outputBuffer = await readFile(tempOutputFile);

    return outputBuffer;
  } finally {
    // Clean up temp files
    try {
      await unlink(tempInputFile);
    } catch {
      /* ignore */
    }
    try {
      await unlink(tempOutputFile);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Verify EXIF metadata matches expected values
 *
 * Useful for detecting tampering or ensuring metadata integrity.
 *
 * @param imageBuffer - Image data
 * @param expected - Expected metadata values
 * @returns True if metadata matches, false otherwise
 */
export async function verifyEXIF(
  imageBuffer: Buffer,
  expected: Partial<PhotoRestorationMetadata>
): Promise<boolean> {
  const actual = await readEXIF(imageBuffer);

  // Check each expected field
  for (const [key, value] of Object.entries(expected)) {
    if (value !== undefined && actual[key as keyof EXIFMetadata] !== value) {
      return false;
    }
  }

  return true;
}

/**
 * Strip all EXIF metadata from an image
 *
 * Useful for privacy or to start with a clean slate.
 *
 * @param imageBuffer - Image data
 * @returns New image buffer without EXIF metadata
 */
export async function stripEXIF(imageBuffer: Buffer): Promise<Buffer> {
  const tool = getExifTool();

  const tempInputFile = join(tmpdir(), `exif-strip-input-${randomBytes(8).toString('hex')}.tmp`);
  const tempOutputFile = join(tmpdir(), `exif-strip-output-${randomBytes(8).toString('hex')}.tmp`);

  try {
    await writeFile(tempInputFile, imageBuffer);

    // Strip all metadata
    await tool.write(tempInputFile, {}, ['-all=', '-o', tempOutputFile]);

    const outputBuffer = await readFile(tempOutputFile);
    return outputBuffer;
  } finally {
    try {
      await unlink(tempInputFile);
    } catch {
      /* ignore */
    }
    try {
      await unlink(tempOutputFile);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Get image dimensions from EXIF
 *
 * Faster than loading the entire image if you only need dimensions.
 *
 * @param imageBuffer - Image data
 * @returns Image dimensions
 */
export async function getImageDimensions(
  imageBuffer: Buffer
): Promise<{ width: number; height: number; format?: string }> {
  const metadata = await readEXIF(imageBuffer);
  return {
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
    format: metadata.format,
  };
}
