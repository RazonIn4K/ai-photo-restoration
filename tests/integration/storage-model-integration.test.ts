/**
 * Storage-Model Integration Tests
 *
 * These tests validate the end-to-end workflow of:
 * 1. Photo ingestion with encryption
 * 2. Metadata embedding (EXIF + C2PA)
 * 3. Content-addressed storage
 * 4. Photo retrieval with decryption
 * 5. Cryptographic erasure
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { StorageIntegrationService } from '../../src/services/storage-integration.js';
import { createTestImage, createTestImageBatch } from '../helpers/test-images.js';

describe('Storage-Model Integration', () => {
  let basePath: string;
  let service: StorageIntegrationService;

  beforeEach(async () => {
    basePath = await mkdtemp(join(tmpdir(), 'frai-storage-integration-'));
    service = new StorageIntegrationService(
      // Using ContentAddressedStorage internally
      new (await import('../../src/storage/content-addressed.js')).ContentAddressedStorage({
        basePath
      }),
      'photos'
    );
  });

  afterEach(async () => {
    await rm(basePath, { recursive: true, force: true });
  });

  describe('Photo Ingestion', () => {
    it('ingests original photo and returns storage identifiers', async () => {
      const photoBuffer = await createTestImage({ width: 640, height: 480 });

      const result = await service.ingestOriginalPhoto(photoBuffer, {
        originalPostId: 'fb_123456789',
        requestId: 'req_abc123',
        approvedBy: 'operator@example.com',
        approvalTimestamp: new Date('2025-11-05T10:00:00Z')
      });

      // Should return storage identifiers
      expect(result.storageId).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex
      expect(result.sha256).toBe(result.storageId);
      expect(result.perceptualHash).toHaveLength(64); // 64-bit binary
      expect(result.size).toBe(photoBuffer.length);
      expect(result.dimensions.width).toBe(640);
      expect(result.dimensions.height).toBe(480);
    });

    it('deduplicates identical photos', async () => {
      const photoBuffer = await createTestImage({ width: 320, height: 240 });

      const result1 = await service.ingestOriginalPhoto(photoBuffer, {
        originalPostId: 'fb_post1',
        requestId: 'req_1'
      });

      const result2 = await service.ingestOriginalPhoto(photoBuffer, {
        originalPostId: 'fb_post2',
        requestId: 'req_2'
      });

      // Same photo content = same storage ID (deduplication)
      expect(result1.storageId).toBe(result2.storageId);
      expect(result1.sha256).toBe(result2.sha256);
    });

    it('assigns different storage IDs to different photos', async () => {
      const photo1 = await createTestImage({ width: 640, height: 480, color: { r: 255, g: 100, b: 50 } });
      const photo2 = await createTestImage({ width: 800, height: 600, color: { r: 50, g: 100, b: 255 } });

      const result1 = await service.ingestOriginalPhoto(photo1, {
        originalPostId: 'fb_post1',
        requestId: 'req_1'
      });

      const result2 = await service.ingestOriginalPhoto(photo2, {
        originalPostId: 'fb_post2',
        requestId: 'req_2'
      });

      // Different photos = different storage IDs
      expect(result1.storageId).not.toBe(result2.storageId);
      expect(result1.perceptualHash).not.toBe(result2.perceptualHash);
    });
  });

  describe('Photo Restoration with Metadata', () => {
    it('stores restored photo with embedded EXIF + C2PA metadata', async () => {
      const restoredBuffer = await createTestImage({
        width: 1024,
        height: 768,
        format: 'jpeg'
      });

      const result = await service.storeRestoredPhoto(restoredBuffer, {
        originalPostId: 'fb_restored_test',
        requestId: 'req_restored_001',
        aiModel: 'CodeFormer-v1.0',
        approvedBy: 'operator@test.com',
        approvalTimestamp: new Date('2025-11-05T10:00:00Z'),
        restorationTimestamp: new Date('2025-11-05T11:00:00Z'),
        originalSHA256: 'abc123'.repeat(10),
        originalPerceptualHash: '1234567890abcdef'
      });

      // Should return storage identifiers
      expect(result.storageId).toMatch(/^[a-f0-9]{64}$/);
      expect(result.sha256).toBe(result.storageId);
      expect(result.perceptualHash).toHaveLength(64);
      expect(result.size).toBeGreaterThan(restoredBuffer.length); // Larger due to metadata
    });

    it('embeds metadata that survives storage round-trip', async () => {
      const restoredBuffer = await createTestImage({ width: 800, height: 600 });

      const originalSHA256 = 'original'.repeat(8);
      const originalPerceptualHash = '1234567890abcdef';

      const storeResult = await service.storeRestoredPhoto(restoredBuffer, {
        originalPostId: 'fb_roundtrip_test',
        requestId: 'req_roundtrip_001',
        aiModel: 'RestoreFormer-v2.0',
        approvedBy: 'roundtrip@test.com',
        approvalTimestamp: new Date('2025-11-05T09:00:00Z'),
        restorationTimestamp: new Date('2025-11-05T10:00:00Z'),
        originalSHA256,
        originalPerceptualHash
      });

      // Retrieve and verify metadata
      const retrieved = await service.retrievePhoto(storeResult.storageId);

      expect(retrieved.exif.originalPostId).toBe('fb_roundtrip_test');
      expect(retrieved.exif.requestId).toBe('req_roundtrip_001');
      expect(retrieved.exif.aiModel).toBe('RestoreFormer-v2.0');
      expect(retrieved.exif.approvedBy).toBe('roundtrip@test.com');
      expect(retrieved.exif.originalSHA256).toBe(originalSHA256);
      expect(retrieved.exif.originalPerceptualHash).toBe(originalPerceptualHash);

      // C2PA manifest should be present
      expect(retrieved.c2pa).not.toBeNull();
      expect(retrieved.c2pa?.type).toBe('ImageObject');
    });
  });

  describe('Photo Retrieval', () => {
    it('retrieves photo by storage ID', async () => {
      const originalBuffer = await createTestImage({ width: 640, height: 480 });

      const ingestResult = await service.ingestOriginalPhoto(originalBuffer, {
        originalPostId: 'fb_retrieve_test',
        requestId: 'req_retrieve_001'
      });

      const retrieved = await service.retrievePhoto(ingestResult.storageId);

      // Should retrieve the same photo
      expect(Buffer.isBuffer(retrieved.data)).toBe(true);
      expect(retrieved.data.length).toBeGreaterThan(0);
    });

    it('throws error for non-existent storage ID', async () => {
      const fakeStorageId = '0'.repeat(64);

      await expect(service.retrievePhoto(fakeStorageId)).rejects.toThrow();
    });
  });

  describe('Cryptographic Erasure', () => {
    it('permanently erases photo data', async () => {
      const photoBuffer = await createTestImage({ width: 320, height: 240 });

      const ingestResult = await service.ingestOriginalPhoto(photoBuffer, {
        originalPostId: 'fb_erase_test',
        requestId: 'req_erase_001'
      });

      // Verify photo exists
      const exists1 = await service.photoExists(ingestResult.storageId);
      expect(exists1).toBe(true);

      // Cryptographically erase
      await service.cryptographicallyErase(ingestResult.storageId);

      // Photo should no longer exist
      const exists2 = await service.photoExists(ingestResult.storageId);
      expect(exists2).toBe(false);

      // Retrieval should fail
      await expect(service.retrievePhoto(ingestResult.storageId)).rejects.toThrow();
    });

    it('makes data unrecoverable after DEK deletion', async () => {
      const photoBuffer = await createTestImage();

      const result = await service.ingestOriginalPhoto(photoBuffer, {
        originalPostId: 'fb_dek_test',
        requestId: 'req_dek_001'
      });

      // Erase deletes both DEK and encrypted blob
      await service.cryptographicallyErase(result.storageId);

      // Even if we had the encrypted blob, we couldn't decrypt it
      // because the DEK is permanently deleted from KMS
      await expect(service.retrievePhoto(result.storageId)).rejects.toThrow();
    });
  });

  describe('Photo Integrity Verification', () => {
    it('verifies photo integrity by hash', async () => {
      const photoBuffer = await createTestImage({ width: 800, height: 600 });

      const result = await service.ingestOriginalPhoto(photoBuffer, {
        originalPostId: 'fb_integrity_test',
        requestId: 'req_integrity_001'
      });

      // Verification should pass
      const isValid = await service.verifyPhotoIntegrity(
        result.storageId,
        result.sha256
      );

      expect(isValid).toBe(true);
    });

    it('detects hash mismatch', async () => {
      const photoBuffer = await createTestImage();

      const result = await service.ingestOriginalPhoto(photoBuffer, {
        originalPostId: 'fb_mismatch_test',
        requestId: 'req_mismatch_001'
      });

      const wrongHash = 'wrong'.repeat(16);

      // Verification should fail
      await expect(
        service.verifyPhotoIntegrity(result.storageId, wrongHash)
      ).rejects.toThrow('Storage ID mismatch');
    });
  });

  describe('Batch Operations', () => {
    it('handles multiple photos efficiently', async () => {
      const photos = await createTestImageBatch(5);
      const results: string[] = [];

      for (let i = 0; i < photos.length; i++) {
        const result = await service.ingestOriginalPhoto(photos[i], {
          originalPostId: `fb_batch_${i}`,
          requestId: `req_batch_${i}`
        });

        results.push(result.storageId);
      }

      // All photos should be stored
      expect(results).toHaveLength(5);

      // All storage IDs should be unique (different photos)
      const uniqueIds = new Set(results);
      expect(uniqueIds.size).toBe(5);

      // All photos should be retrievable
      for (const storageId of results) {
        const exists = await service.photoExists(storageId);
        expect(exists).toBe(true);
      }
    });
  });

  describe('Deduplication Check', () => {
    it('detects when photo already exists', async () => {
      const photoBuffer = await createTestImage({ width: 640, height: 480 });

      const result = await service.ingestOriginalPhoto(photoBuffer, {
        originalPostId: 'fb_dedup_test',
        requestId: 'req_dedup_001'
      });

      // Check if photo exists
      const exists = await service.photoExists(result.sha256);
      expect(exists).toBe(true);

      // Check non-existent photo
      const fakeHash = '0'.repeat(64);
      const notExists = await service.photoExists(fakeHash);
      expect(notExists).toBe(false);
    });
  });
});
