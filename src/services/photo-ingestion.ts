/**
 * Photo Ingestion Service
 * High-level API for photo ingestion with database integration
 */

import { ulid } from 'ulid';

import { createStorageIntegrationService } from './storage-integration.js';
import { logger } from '../lib/logger.js';
import type { PhotoAsset } from '../models/index.js';
import { RequestRecordModel } from '../models/index.js';

/**
 * Options for photo ingestion
 */
export interface IngestPhotoOptions {
  facebookPostId: string;
  facebookGroupId: string;
  posterName: string;
  postUrl: string;
  userRequest: string;
  originalImageUrl: string;
}

/**
 * Result of photo ingestion
 */
export interface IngestPhotoResult {
  requestId: string;
  assetId: string;
  originalStorageId: string;
  originalHash: string;
  perceptualHash: string;
}

// Initialize storage integration service
const storageService = createStorageIntegrationService(
  process.env.STORAGE_PATH || 'data',
  'originals'
);

/**
 * Ingest a photo into the system
 * Creates RequestRecord and stores photo in CAS
 */
export async function ingestPhoto(
  photoBuffer: Buffer,
  options: IngestPhotoOptions
): Promise<IngestPhotoResult> {
  logger.info({ postUrl: options.postUrl }, 'Starting photo ingestion');

  try {
    const requestId = ulid();
    const assetId = ulid();

    // Ingest photo using storage integration service
    const ingestionResult = await storageService.ingestOriginalPhoto(photoBuffer, {
      originalPostId: options.facebookPostId,
      requestId
    });

    logger.info(
      {
        requestId,
        assetId,
        storageId: ingestionResult.storageId
      },
      'Photo stored in CAS'
    );

    // Create asset record
    const asset: PhotoAsset = {
      assetId,
      originalImageUrl: options.originalImageUrl,
      originalImageHash: ingestionResult.sha256,
      originalImagePath: '', // Not used with CAS
      originalStorageId: ingestionResult.storageId,
      perceptualHash: ingestionResult.perceptualHash,
      selected: true
    };

    // Create request record
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

    logger.info({ requestId, assetId }, 'Request record created');

    return {
      requestId,
      assetId,
      originalStorageId: ingestionResult.storageId,
      originalHash: ingestionResult.sha256,
      perceptualHash: ingestionResult.perceptualHash
    };
  } catch (error) {
    logger.error({ error, postUrl: options.postUrl }, 'Photo ingestion failed');
    throw error;
  }
}
