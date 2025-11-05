/**
 * Storage Integration Service
 *
 * This service integrates:
 * - Content-Addressed Storage (CAS) with encryption
 * - EXIF/C2PA metadata embedding
 * - Perceptual hashing for similarity detection
 * - RequestRecord persistence
 *
 * It provides the complete photo lifecycle from ingestion through
 * cryptographic erasure.
 */

import { createHash } from 'node:crypto';

import { computePerceptualHash } from '../hash/perceptual.js';
import {
  embedCompleteMetadata,
  extractCompleteMetadata,
  type C2PAManifest
} from '../metadata/index.js';
import { ContentAddressedStorage, type StorageCategory } from '../storage/content-addressed.js';

/**
 * Valid photo storage categories (excluding 'keys' which is internal)
 */
type PhotoStorageCategory = Exclude<StorageCategory, 'keys'>;

/**
 * Photo ingestion result
 */
export interface PhotoIngestionResult {
  /** Content-addressed storage ID (SHA-256 hash) */
  storageId: string;
  /** SHA-256 hash of original photo */
  sha256: string;
  /** Perceptual hash for similarity detection */
  perceptualHash: string;
  /** Size in bytes */
  size: number;
  /** Image dimensions */
  dimensions: {
    width: number;
    height: number;
  };
}

/**
 * Photo restoration result
 */
export interface PhotoRestorationResult {
  /** Storage ID of restored photo */
  storageId: string;
  /** SHA-256 hash of restored photo */
  sha256: string;
  /** Perceptual hash of restored photo */
  perceptualHash: string;
  /** Size in bytes */
  size: number;
}

/**
 * Photo retrieval result with metadata
 */
export interface PhotoRetrievalResult {
  /** Image data */
  data: Buffer;
  /** Extracted EXIF metadata */
  exif: {
    originalPostId: string;
    requestId: string;
    aiModel?: string;
    approvedBy?: string;
    approvalTimestamp?: Date;
    restorationTimestamp?: Date;
    originalSHA256?: string;
    originalPerceptualHash?: string;
  };
  /** Extracted C2PA manifest (if present) */
  c2pa: C2PAManifest | null;
}

/**
 * Storage Integration Service
 *
 * Manages the full lifecycle of photo restoration with encryption,
 * metadata, and persistence.
 */
export class StorageIntegrationService {
  constructor(
    private storage: ContentAddressedStorage,
    private category: PhotoStorageCategory = 'originals'
  ) {}

  /**
   * Ingest an original photo
   *
   * 1. Computes SHA-256 hash (content addressing)
   * 2. Computes perceptual hash (similarity detection)
   * 3. Stores encrypted photo in CAS
   * 4. Returns identifiers for RequestRecord persistence
   *
   * @param photoBuffer - Original photo data
   * @param metadata - Request metadata
   * @returns Ingestion result with storage IDs
   */
  async ingestOriginalPhoto(
    photoBuffer: Buffer,
    metadata: {
      originalPostId: string;
      requestId: string;
      approvedBy?: string;
      approvalTimestamp?: Date;
    }
  ): Promise<PhotoIngestionResult> {
    // Compute perceptual hash for similarity detection
    const phashResult = await computePerceptualHash(photoBuffer);

    // Store encrypted photo in CAS with basic metadata
    // SHA-256 is computed automatically by CAS
    const storeResult = await this.storage.store(this.category, photoBuffer, {
      size: photoBuffer.length,
      mimeType: 'image/jpeg', // TODO: Detect from buffer
      perceptualHash: phashResult.hash,
      customMetadata: {
        originalPostId: metadata.originalPostId,
        requestId: metadata.requestId,
        width: phashResult.width,
        height: phashResult.height,
        type: 'original'
      }
    });

    return {
      storageId: storeResult.sha256,
      sha256: storeResult.sha256,
      perceptualHash: phashResult.hash,
      size: photoBuffer.length,
      dimensions: {
        width: phashResult.width,
        height: phashResult.height
      }
    };
  }

  /**
   * Store a restored photo with full metadata embedding
   *
   * 1. Embeds EXIF + C2PA metadata into image
   * 2. Computes hashes (SHA-256, perceptual)
   * 3. Stores encrypted photo with embedded metadata
   * 4. Returns identifiers for RequestRecord update
   *
   * @param restoredBuffer - Restored photo data
   * @param metadata - Restoration metadata
   * @returns Restoration result with storage IDs
   */
  async storeRestoredPhoto(
    restoredBuffer: Buffer,
    metadata: {
      originalPostId: string;
      requestId: string;
      aiModel: string;
      approvedBy?: string;
      approvalTimestamp?: Date;
      restorationTimestamp: Date;
      originalSHA256: string;
      originalPerceptualHash?: string;
    }
  ): Promise<PhotoRestorationResult> {
    // Embed complete metadata (EXIF + C2PA) into the image
    const withMetadata = await embedCompleteMetadata(restoredBuffer, {
      originalPostId: metadata.originalPostId,
      requestId: metadata.requestId,
      aiModel: metadata.aiModel,
      approvedBy: metadata.approvedBy,
      approvalTimestamp: metadata.approvalTimestamp,
      restorationTimestamp: metadata.restorationTimestamp,
      originalSHA256: metadata.originalSHA256,
      originalPerceptualHash: metadata.originalPerceptualHash
    });

    // Compute perceptual hash of restored image
    const phashResult = await computePerceptualHash(withMetadata.imageBuffer);

    // Store encrypted photo with embedded metadata
    // SHA-256 is computed automatically by CAS
    const storeResult = await this.storage.store(this.category, withMetadata.imageBuffer, {
      size: withMetadata.imageBuffer.length,
      mimeType: 'image/jpeg',
      perceptualHash: phashResult.hash,
      customMetadata: {
        originalPostId: metadata.originalPostId,
        requestId: metadata.requestId,
        aiModel: metadata.aiModel,
        width: phashResult.width,
        height: phashResult.height,
        type: 'restored',
        hasMetadata: true
      }
    });

    return {
      storageId: storeResult.sha256,
      sha256: storeResult.sha256,
      perceptualHash: phashResult.hash,
      size: withMetadata.imageBuffer.length
    };
  }

  /**
   * Retrieve a photo by its storage ID
   *
   * 1. Retrieves encrypted photo from CAS
   * 2. Decrypts photo
   * 3. Extracts embedded metadata (if present)
   * 4. Returns photo data + metadata
   *
   * @param storageId - SHA-256 storage ID
   * @returns Photo data with extracted metadata
   */
  async retrievePhoto(storageId: string): Promise<PhotoRetrievalResult> {
    // Retrieve from CAS (automatically decrypts)
    const result = await this.storage.retrieve(this.category, storageId);

    // Extract embedded metadata
    const { exif, c2pa } = await extractCompleteMetadata(result.data);

    return {
      data: result.data,
      exif: {
        originalPostId: exif.originalPostId,
        requestId: exif.requestId,
        aiModel: exif.aiModel,
        approvedBy: exif.approvedBy,
        approvalTimestamp: exif.approvalTimestamp,
        restorationTimestamp: exif.restorationTimestamp,
        originalSHA256: exif.originalSHA256,
        originalPerceptualHash: exif.originalPerceptualHash
      },
      c2pa
    };
  }

  /**
   * Cryptographically erase a photo
   *
   * 1. Deletes DEK from KMS (makes data permanently unrecoverable)
   * 2. Deletes encrypted blob from storage
   *
   * This provides true cryptographic erasure - even if the encrypted
   * data is recovered, it cannot be decrypted without the DEK.
   *
   * @param storageId - SHA-256 storage ID
   */
  async cryptographicallyErase(storageId: string): Promise<void> {
    // Delete will remove both DEK and encrypted blob
    await this.storage.delete(this.category, storageId);
  }

  /**
   * Verify photo integrity
   *
   * Checks that:
   * 1. Photo exists in storage
   * 2. SHA-256 hash matches
   * 3. Photo can be decrypted
   * 4. Metadata is intact (if expected)
   *
   * @param storageId - SHA-256 storage ID
   * @param expectedHash - Expected SHA-256 hash
   * @returns True if valid, throws on integrity failure
   */
  async verifyPhotoIntegrity(storageId: string, expectedHash: string): Promise<boolean> {
    if (storageId !== expectedHash) {
      throw new Error(`Storage ID mismatch: expected ${expectedHash}, got ${storageId}`);
    }

    // Attempt retrieval (will throw if missing or decrypt fails)
    const result = await this.storage.retrieve(this.category, storageId);

    // Verify hash of decrypted data
    const actualHash = createHash('sha256').update(result.data).digest('hex');

    if (actualHash !== expectedHash) {
      throw new Error(`Data integrity failure: expected hash ${expectedHash}, got ${actualHash}`);
    }

    return true;
  }

  /**
   * Check if a photo exists by hash (deduplication check)
   *
   * @param sha256 - SHA-256 hash to check
   * @returns True if photo already exists in storage
   */
  async photoExists(sha256: string): Promise<boolean> {
    try {
      await this.storage.retrieve(this.category, sha256);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get storage statistics
   *
   * @returns Storage stats (namespace, blob count, etc.)
   */
  async getStats(): Promise<{
    namespace: string;
    blobCount: number;
  }> {
    // Note: ContentAddressedStorage doesn't expose stats yet
    // This is a placeholder for future implementation
    return {
      namespace: this.category,
      blobCount: 0 // TODO: Implement blob counting
    };
  }
}

/**
 * Create a storage integration service instance
 *
 * @param basePath - Base path for CAS storage
 * @param category - Storage category (default: 'originals')
 * @returns Configured service instance
 */
export function createStorageIntegrationService(
  basePath: string,
  category: PhotoStorageCategory = 'originals'
): StorageIntegrationService {
  const storage = new ContentAddressedStorage({ basePath });
  return new StorageIntegrationService(storage, category);
}
