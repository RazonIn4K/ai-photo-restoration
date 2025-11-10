import sharp from 'sharp';
import { afterAll, describe, expect, it } from 'vitest';

import {
  closeExifTool,
  getImageDimensions,
  readEXIF,
  stripEXIF,
  verifyEXIF,
  writeEXIF
} from '../../src/metadata/exif.js';
import type { PhotoRestorationMetadata } from '../../src/metadata/exif.js';

/**
 * Create a sample image buffer for testing
 */
async function createSampleImage(width: number = 64, height: number = 64): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 120, g: 180, b: 220 }
    }
  })
    .png()
    .toBuffer();
}

describe('EXIF metadata helpers', () => {
  describe('readEXIF', () => {
    it('reads basic image metadata', async () => {
      const buffer = await createSampleImage(100, 200);
      const metadata = await readEXIF(buffer);

      expect(metadata.width).toBe(100);
      expect(metadata.height).toBe(200);
      expect(metadata.format).toBe('PNG');
    });

    it('handles images without custom metadata', async () => {
      const buffer = await createSampleImage();
      const metadata = await readEXIF(buffer);

      expect(metadata.originalPostId).toBe('');
      expect(metadata.requestId).toBe('');
      expect(metadata.approvalTimestamp).toBeUndefined();
    });
  });

  describe('writeEXIF', () => {
    it('writes and reads custom restoration metadata', async () => {
      const buffer = await createSampleImage();
      const restorationData: PhotoRestorationMetadata = {
        originalPostId: 'fb_123456789',
        requestId: 'req_abc123',
        approvalTimestamp: new Date('2025-11-05T10:00:00Z'),
        restorationTimestamp: new Date('2025-11-05T11:00:00Z'),
        aiModel: 'CodeFormer-v1.0',
        approvedBy: 'operator@example.com',
        originalSHA256: '1234567890abcdef'.repeat(4),
        originalPerceptualHash: 'abcdef1234567890'
      };

      const bufferWithMetadata = await writeEXIF(buffer, restorationData);
      const readBack = await readEXIF(bufferWithMetadata);

      expect(readBack.originalPostId).toBe(restorationData.originalPostId);
      expect(readBack.requestId).toBe(restorationData.requestId);
      expect(readBack.approvalTimestamp?.toISOString()).toBe(
        restorationData.approvalTimestamp?.toISOString()
      );
      expect(readBack.restorationTimestamp?.toISOString()).toBe(
        restorationData.restorationTimestamp?.toISOString()
      );
      expect(readBack.aiModel).toBe(restorationData.aiModel);
      expect(readBack.approvedBy).toBe(restorationData.approvedBy);
      expect(readBack.originalSHA256).toBe(restorationData.originalSHA256);
      expect(readBack.originalPerceptualHash).toBe(restorationData.originalPerceptualHash);
    });

    it('writes partial metadata', async () => {
      const buffer = await createSampleImage();
      const partialData: Partial<PhotoRestorationMetadata> = {
        originalPostId: 'fb_987654321',
        requestId: 'req_xyz789'
      };

      const bufferWithMetadata = await writeEXIF(buffer, partialData);
      const readBack = await readEXIF(bufferWithMetadata);

      expect(readBack.originalPostId).toBe(partialData.originalPostId);
      expect(readBack.requestId).toBe(partialData.requestId);
      expect(readBack.aiModel).toBeUndefined();
    });

    it('preserves image data while adding metadata', async () => {
      const buffer = await createSampleImage(150, 100);
      const metadata: Partial<PhotoRestorationMetadata> = {
        originalPostId: 'test_post'
      };

      const bufferWithMetadata = await writeEXIF(buffer, metadata);
      const readBack = await readEXIF(bufferWithMetadata);

      // Image dimensions should be preserved
      expect(readBack.width).toBe(150);
      expect(readBack.height).toBe(100);
      expect(readBack.format).toBe('PNG');

      // Custom metadata should be present
      expect(readBack.originalPostId).toBe('test_post');
    });
  });

  describe('verifyEXIF', () => {
    it('returns true when metadata matches', async () => {
      const buffer = await createSampleImage();
      const metadata: Partial<PhotoRestorationMetadata> = {
        originalPostId: 'fb_test123',
        requestId: 'req_test456'
      };

      const bufferWithMetadata = await writeEXIF(buffer, metadata);
      const isValid = await verifyEXIF(bufferWithMetadata, metadata);

      expect(isValid).toBe(true);
    });

    it('returns false when metadata does not match', async () => {
      const buffer = await createSampleImage();
      const originalMetadata: Partial<PhotoRestorationMetadata> = {
        originalPostId: 'fb_original'
      };

      const bufferWithMetadata = await writeEXIF(buffer, originalMetadata);

      const differentMetadata: Partial<PhotoRestorationMetadata> = {
        originalPostId: 'fb_different'
      };

      const isValid = await verifyEXIF(bufferWithMetadata, differentMetadata);

      expect(isValid).toBe(false);
    });

    it('verifies partial metadata', async () => {
      const buffer = await createSampleImage();
      const fullMetadata: PhotoRestorationMetadata = {
        originalPostId: 'fb_123',
        requestId: 'req_456',
        aiModel: 'TestModel'
      };

      const bufferWithMetadata = await writeEXIF(buffer, fullMetadata);

      // Verify only partial fields
      const isValid = await verifyEXIF(bufferWithMetadata, {
        originalPostId: 'fb_123'
      });

      expect(isValid).toBe(true);
    });
  });

  describe('stripEXIF', () => {
    it('removes all EXIF metadata', async () => {
      const buffer = await createSampleImage();
      const metadata: Partial<PhotoRestorationMetadata> = {
        originalPostId: 'fb_remove_me',
        requestId: 'req_strip_test',
        aiModel: 'TestModel'
      };

      const bufferWithMetadata = await writeEXIF(buffer, metadata);
      const strippedBuffer = await stripEXIF(bufferWithMetadata);
      const readBack = await readEXIF(strippedBuffer);

      // Custom metadata should be gone
      expect(readBack.originalPostId).toBe('');
      expect(readBack.requestId).toBe('');
      expect(readBack.aiModel).toBeUndefined();
    });

    it('preserves image data after stripping', async () => {
      const buffer = await createSampleImage(100, 50);
      const metadata: Partial<PhotoRestorationMetadata> = {
        originalPostId: 'test'
      };

      const bufferWithMetadata = await writeEXIF(buffer, metadata);
      const strippedBuffer = await stripEXIF(bufferWithMetadata);

      // Verify image can still be read
      const image = sharp(strippedBuffer);
      const imgMetadata = await image.metadata();

      expect(imgMetadata.width).toBe(100);
      expect(imgMetadata.height).toBe(50);
    });
  });

  describe('getImageDimensions', () => {
    it('extracts dimensions efficiently', async () => {
      const buffer = await createSampleImage(200, 150);
      const dimensions = await getImageDimensions(buffer);

      expect(dimensions.width).toBe(200);
      expect(dimensions.height).toBe(150);
      expect(dimensions.format).toBe('PNG');
    });

    it('works on images with metadata', async () => {
      const buffer = await createSampleImage(300, 200);
      const metadata: Partial<PhotoRestorationMetadata> = {
        originalPostId: 'dimension_test'
      };

      const bufferWithMetadata = await writeEXIF(buffer, metadata);
      const dimensions = await getImageDimensions(bufferWithMetadata);

      expect(dimensions.width).toBe(300);
      expect(dimensions.height).toBe(200);
    });
  });

  afterAll(async () => {
    // Clean shutdown of ExifTool worker process
    await closeExifTool();
  });
});
