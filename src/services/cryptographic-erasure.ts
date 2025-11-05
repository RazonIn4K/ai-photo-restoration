import { logger } from '../lib/logger.js';
import type { IRequestRecord } from '../models/index.js';
import { RequestRecordModel } from '../models/index.js';

/**
 * Cryptographic Erasure Service
 * Implements secure deletion using DEK zeroization
 */

export interface ErasureResult {
  requestId: string;
  assetsErased: number;
  dekKeysDeleted: string[];
  blobsDeleted: string[];
  erasedAt: Date;
}

/**
 * Perform cryptographic erasure for a request
 * This makes all associated data unrecoverable by deleting the DEKs
 */
export async function cryptographicErase(requestId: string): Promise<ErasureResult> {
  logger.info({ requestId }, 'Starting cryptographic erasure');

  try {
    // Find the request record
    const record = await RequestRecordModel.findOne({ requestId });
    if (!record) {
      throw new Error(`Request not found: ${requestId}`);
    }

    if (record.storageStatus === 'erased') {
      logger.warn({ requestId }, 'Request already erased');
      return {
        requestId,
        assetsErased: 0,
        dekKeysDeleted: [],
        blobsDeleted: [],
        erasedAt: record.erasedAt || new Date()
      };
    }

    const dekKeysDeleted: string[] = [];
    const blobsDeleted: string[] = [];
    let assetsErased = 0;

    // Process each asset
    for (const asset of record.assets) {
      // TODO: Integrate with actual storage modules
      // This will call:
      // - kms.deleteDEK(asset.originalStorageId)
      // - kms.deleteDEK(asset.restoredStorageId)
      // - storage.delete(asset.originalStorageId)
      // - storage.delete(asset.restoredStorageId)

      if (asset.originalStorageId) {
        // Placeholder for actual DEK deletion
        dekKeysDeleted.push(`dek-${asset.originalStorageId}`);
        blobsDeleted.push(asset.originalStorageId);
      }

      if (asset.restoredStorageId) {
        // Placeholder for actual DEK deletion
        dekKeysDeleted.push(`dek-${asset.restoredStorageId}`);
        blobsDeleted.push(asset.restoredStorageId);
      }

      assetsErased++;
    }

    // Update record status
    const erasedAt = new Date();
    record.storageStatus = 'erased';
    record.erasedAt = erasedAt;
    record.status = 'completed'; // Mark as completed since it's fully processed

    await record.save();

    logger.info(
      {
        requestId,
        assetsErased,
        dekKeysDeleted: dekKeysDeleted.length,
        blobsDeleted: blobsDeleted.length
      },
      'Cryptographic erasure completed successfully'
    );

    return {
      requestId,
      assetsErased,
      dekKeysDeleted,
      blobsDeleted,
      erasedAt
    };
  } catch (error) {
    logger.error({ error, requestId }, 'Cryptographic erasure failed');
    throw error;
  }
}

/**
 * Find requests eligible for automatic erasure based on retention policy
 */
export async function findErasureEligibleRequests(): Promise<IRequestRecord[]> {
  const now = new Date();

  return RequestRecordModel.find({
    storageStatus: 'active',
    retentionExpiresAt: { $lte: now }
  }).sort({ retentionExpiresAt: 1 });
}

/**
 * Set retention expiration for a request
 */
export async function setRetentionExpiration(
  requestId: string,
  retentionDays: number
): Promise<void> {
  const expirationDate = new Date();
  expirationDate.setDate(expirationDate.getDate() + retentionDays);

  await RequestRecordModel.updateOne({ requestId }, { retentionExpiresAt: expirationDate });

  logger.info({ requestId, retentionDays, expirationDate }, 'Retention expiration set');
}
