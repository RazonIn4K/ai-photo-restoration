import { Buffer } from 'node:buffer';
import { ulid } from 'ulid';

import { computePerceptualHash } from '../hash/perceptual.js';
import { logger } from '../lib/logger.js';
import type { PhotoAsset } from '../models/index.js';
import { RequestRecordModel } from '../models/index.js';
import { ContentAddressedStorage } from '../storage/content-addressed.js';

/**
 * Storage Integration Service
 * Handles the integration between RequestRecord model and content-addressed storage
 */

export interface IngestPhotoOptions {
  facebookPostId: string;
  facebookGroupId: string;
  posterName: string;
  postUrl: string;
  userRequest: string;
  originalImageUrl: string;
}

export interface StorageIntegrationResult {
  requestId: string;
  assetId: string;
  originalStorageId: string;
  originalHash: string;
  perceptualHash: string;
}

// Initialize storage instance
const storage = new ContentAddressedStorage({
  basePath: process.env.STORAGE_PATH || 'data',
  autoCreateDirs: true
});

/**
 * Ingest a photo into the system with full storage integration
 */
export async function ingestPhoto(
  photoBuffer: Buffer,
  options: IngestPhotoOptions
): Promise<StorageIntegrationResult> {
  logger.info({ postUrl: options.postUrl }, 'Starting photo ingestion with storage integration');

  try {
    const requestId = ulid();
    const assetId = ulid();

    // Compute hashes
    const originalHash = storage.computeHash(photoBuffer);
    const perceptualHashResult = await computePerceptualHash(photoBuffer);
    const perceptualHash = perceptualHashResult.hash;

    logger.info({ requestId, assetId, originalHash, perceptualHash }, 'Computed hashes for photo');

    // Prepare metadata for embedding
    const embeddedMetadata = {
      requestId,
      assetId,
      facebookPostId: options.facebookPostId,
      facebookGroupId: options.facebookGroupId,
      posterName: options.posterName,
      userRequest: options.userRequest,
      ingestedAt: new Date().toISOString(),
      originalHash,
      perceptualHash
    };

    // Store in content-addressed storage with metadata
    const storeResult = await storage.store('originals', photoBuffer, {
      size: photoBuffer.length,
      mimeType: 'image/jpeg',
      perceptualHash,
      customMetadata: embeddedMetadata
    });

    logger.info({ requestId, assetId }, 'Stored image with metadata in content-addressed storage');

    logger.info(
      {
        requestId,
        assetId,
        storageId: storeResult.sha256,
        isNew: storeResult.isNew
      },
      'Stored image in content-addressed storage'
    );

    // Create the asset record
    const asset: PhotoAsset = {
      assetId,
      originalImageUrl: options.originalImageUrl,
      originalImageHash: originalHash,
      originalImagePath: storeResult.encryptedPath,
      originalStorageId: storeResult.sha256,
      perceptualHash,
      selected: true
    };

    // Create the request record
    const requestRecord = new RequestRecordModel({
      requestId,
      facebookPostId: options.facebookPostId,
      facebookGroupId: options.facebookGroupId,
      posterName: options.posterName,
      postUrl: options.postUrl,
      userRequest: options.userRequest,
      assets: [asset],
      status: 'queued',
      queuedAt: new Date(),
      storageStatus: 'active'
    });

    await requestRecord.save();

    logger.info(
      { requestId, assetId, storageId: storeResult.sha256 },
      'Photo ingestion completed successfully'
    );

    return {
      requestId,
      assetId,
      originalStorageId: storeResult.sha256,
      originalHash,
      perceptualHash
    };
  } catch (error) {
    logger.error({ error, postUrl: options.postUrl }, 'Photo ingestion failed');
    throw error;
  }
}

/**
 * Store a restored photo and update the request record
 */
export async function storeRestoredPhoto(
  requestId: string,
  assetId: string,
  restoredBuffer: Buffer,
  processingMetadata: {
    modelUsed: string;
    appliedEffects: string[];
    processingTimeMs: number;
    cost?: number;
  }
): Promise<{ restoredStorageId: string; restoredHash: string; restoredPerceptualHash: string }> {
  logger.info({ requestId, assetId }, 'Starting restored photo storage');

  try {
    // Compute hashes for restored image
    const restoredHash = storage.computeHash(restoredBuffer);
    const restoredPerceptualHashResult = await computePerceptualHash(restoredBuffer);
    const restoredPerceptualHash = restoredPerceptualHashResult.hash;

    // Get original request for metadata
    const request = await RequestRecordModel.findOne({ requestId });
    if (!request) {
      throw new Error(`Request not found: ${requestId}`);
    }

    // Prepare metadata for embedding
    const embeddedMetadata = {
      requestId,
      assetId,
      facebookPostId: request.facebookPostId,
      posterName: request.posterName,
      userRequest: request.userRequest,
      restoredAt: new Date().toISOString(),
      restoredHash,
      restoredPerceptualHash,
      processingMetadata
    };

    // Store in content-addressed storage with metadata
    const storeResult = await storage.store('restored', restoredBuffer, {
      size: restoredBuffer.length,
      mimeType: 'image/jpeg',
      perceptualHash: restoredPerceptualHash,
      customMetadata: embeddedMetadata
    });

    // Update the request record
    const asset = request.assets.find(a => a.assetId === assetId);
    if (!asset) {
      throw new Error(`Asset not found: ${assetId}`);
    }

    asset.restoredImageHash = restoredHash;
    asset.restoredImagePath = storeResult.encryptedPath;
    asset.restoredStorageId = storeResult.sha256;
    asset.restoredPerceptualHash = restoredPerceptualHash;

    await request.save();

    logger.info(
      {
        requestId,
        assetId,
        restoredStorageId: storeResult.sha256
      },
      'Restored photo storage completed'
    );

    return {
      restoredStorageId: storeResult.sha256,
      restoredHash,
      restoredPerceptualHash
    };
  } catch (error) {
    logger.error({ requestId, assetId, error }, 'Restored photo storage failed');
    throw error;
  }
}

/**
 * Retrieve a photo from storage with metadata validation
 */
export async function retrievePhoto(
  storageId: string,
  category: 'originals' | 'restored' = 'originals',
  expectedHash?: string
): Promise<{ buffer: Buffer; metadata: Record<string, unknown> }> {
  logger.info({ storageId, category }, 'Retrieving photo from storage');

  try {
    // Retrieve from storage
    const result = await storage.retrieve(category, storageId);

    // Validate hash if provided
    if (expectedHash && result.metadata.sha256 !== expectedHash) {
      throw new Error(`Hash mismatch: expected ${expectedHash}, got ${result.metadata.sha256}`);
    }

    logger.info(
      { storageId, hasMetadata: !!result.metadata.customMetadata },
      'Photo retrieval completed'
    );

    return {
      buffer: result.data,
      metadata: result.metadata.customMetadata || result.metadata
    };
  } catch (error) {
    logger.error({ storageId, error }, 'Photo retrieval failed');
    throw error;
  }
}
