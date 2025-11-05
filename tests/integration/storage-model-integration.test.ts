import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { connectDatabase } from '../../src/database/index.js';
import { RequestRecordModel } from '../../src/models/index.js';
import {
  cryptographicErase,
  setRetentionExpiration
} from '../../src/services/cryptographic-erasure.js';
import { ingestPhoto } from '../../src/services/storage-integration.js';
import { generateTestImage } from '../helpers/test-images.js';

describe('Storage-Model Integration', () => {
  beforeEach(async () => {
    // Set up test database connection
    process.env.MONGO_DISABLE_CSFLE = 'true';
    process.env.NODE_ENV = 'test';
    await connectDatabase();

    // Clean up any existing test data
    await RequestRecordModel.deleteMany({ facebookPostId: /^test-/ });
  });

  afterEach(async () => {
    // Clean up test data
    await RequestRecordModel.deleteMany({ facebookPostId: /^test-/ });
  });

  describe('Photo Ingestion Workflow', () => {
    it('should ingest photo with full storage integration', async () => {
      // Create test photo buffer using the image generator
      const testPhoto = await generateTestImage(400, 300, 'jpeg');

      const options = {
        facebookPostId: 'test-post-123',
        facebookGroupId: 'test-group-456',
        posterName: 'Test User',
        postUrl: 'https://facebook.com/groups/test/posts/123',
        userRequest: 'Please restore this old family photo',
        originalImageUrl: 'https://facebook.com/photo/123.jpg'
      };

      // Ingest the photo
      const result = await ingestPhoto(testPhoto, options);

      // Verify the result structure
      expect(result).toMatchObject({
        requestId: expect.any(String),
        assetId: expect.any(String),
        originalStorageId: expect.stringMatching(/^[a-f0-9]{64}$/), // SHA-256 hash
        originalHash: expect.any(String),
        perceptualHash: expect.any(String)
      });

      // Verify database record was created
      const record = await RequestRecordModel.findOne({ requestId: result.requestId });
      expect(record).toBeTruthy();
      expect(record?.facebookPostId).toBe('test-post-123');
      expect(record?.assets).toHaveLength(1);
      expect(record?.assets[0].originalStorageId).toBe(result.originalStorageId);
      expect(record?.storageStatus).toBe('active');
    });

    it('should handle multiple assets in a single request', async () => {
      // This test would be expanded when multi-photo support is fully implemented
      const testPhoto = await generateTestImage(400, 300, 'jpeg');

      const options = {
        facebookPostId: 'test-post-multi-123',
        facebookGroupId: 'test-group-456',
        posterName: 'Test User',
        postUrl: 'https://facebook.com/groups/test/posts/multi-123',
        userRequest: 'Please restore these family photos',
        originalImageUrl: 'https://facebook.com/photo/multi-123.jpg'
      };

      const result = await ingestPhoto(testPhoto, options);

      const record = await RequestRecordModel.findOne({ requestId: result.requestId });
      expect(record?.assets).toHaveLength(1); // Currently single asset, will expand
    });
  });

  describe('Cryptographic Erasure Workflow', () => {
    it('should perform complete cryptographic erasure', async () => {
      // First, ingest a photo
      const testPhoto = await generateTestImage(400, 300, 'jpeg');
      const options = {
        facebookPostId: 'test-post-erasure-123',
        facebookGroupId: 'test-group-456',
        posterName: 'Test User',
        postUrl: 'https://facebook.com/groups/test/posts/erasure-123',
        userRequest: 'Please restore this photo',
        originalImageUrl: 'https://facebook.com/photo/erasure-123.jpg'
      };

      const ingestResult = await ingestPhoto(testPhoto, options);

      // Perform cryptographic erasure
      const erasureResult = await cryptographicErase(ingestResult.requestId);

      // Verify erasure result
      expect(erasureResult).toMatchObject({
        requestId: ingestResult.requestId,
        assetsErased: 1,
        dekKeysDeleted: expect.any(Array),
        blobsDeleted: expect.any(Array),
        erasedAt: expect.any(Date)
      });

      // Verify database record is updated
      const record = await RequestRecordModel.findOne({ requestId: ingestResult.requestId });
      expect(record?.storageStatus).toBe('erased');
      expect(record?.erasedAt).toBeTruthy();
      expect(record?.status).toBe('completed');
    });

    it('should handle already erased requests gracefully', async () => {
      // First, ingest and erase a photo
      const testPhoto = await generateTestImage(400, 300, 'jpeg');
      const options = {
        facebookPostId: 'test-post-double-erasure-123',
        facebookGroupId: 'test-group-456',
        posterName: 'Test User',
        postUrl: 'https://facebook.com/groups/test/posts/double-erasure-123',
        userRequest: 'Please restore this photo',
        originalImageUrl: 'https://facebook.com/photo/double-erasure-123.jpg'
      };

      const ingestResult = await ingestPhoto(testPhoto, options);
      await cryptographicErase(ingestResult.requestId);

      // Try to erase again
      const secondErasureResult = await cryptographicErase(ingestResult.requestId);

      expect(secondErasureResult.assetsErased).toBe(0);
      expect(secondErasureResult.dekKeysDeleted).toHaveLength(0);
    });
  });

  describe('Retention Policy Management', () => {
    it('should set and track retention expiration', async () => {
      // Ingest a photo
      const testPhoto = await generateTestImage(400, 300, 'jpeg');
      const options = {
        facebookPostId: 'test-post-retention-123',
        facebookGroupId: 'test-group-456',
        posterName: 'Test User',
        postUrl: 'https://facebook.com/groups/test/posts/retention-123',
        userRequest: 'Please restore this photo',
        originalImageUrl: 'https://facebook.com/photo/retention-123.jpg'
      };

      const result = await ingestPhoto(testPhoto, options);

      // Set retention policy
      await setRetentionExpiration(result.requestId, 30); // 30 days

      // Verify retention is set
      const record = await RequestRecordModel.findOne({ requestId: result.requestId });
      expect(record?.retentionExpiresAt).toBeTruthy();

      const expectedDate = new Date();
      expectedDate.setDate(expectedDate.getDate() + 30);

      const actualDate = record?.retentionExpiresAt;
      expect(actualDate?.getDate()).toBe(expectedDate.getDate());
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid request IDs gracefully', async () => {
      await expect(cryptographicErase('invalid-request-id')).rejects.toThrow('Request not found');
    });

    it('should validate required fields during ingestion', async () => {
      const testPhoto = await generateTestImage(400, 300, 'jpeg');
      const invalidOptions = {
        facebookPostId: '', // Empty required field
        facebookGroupId: 'test-group-456',
        posterName: 'Test User',
        postUrl: 'https://facebook.com/groups/test/posts/invalid',
        userRequest: 'Please restore this photo',
        originalImageUrl: 'https://facebook.com/photo/invalid.jpg'
      };

      // This should fail validation due to empty facebookPostId
      await expect(ingestPhoto(testPhoto, invalidOptions)).rejects.toThrow(/validation failed/);
    });
  });
});
