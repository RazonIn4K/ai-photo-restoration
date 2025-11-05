import sharp from 'sharp';
import { afterAll, describe, expect, it } from 'vitest';

import {
  embedCompleteMetadata,
  extractCompleteMetadata,
  getMetadataSummary,
  verifyMetadataIntegrity
} from '../../src/metadata/embed.js';
import { closeExifTool } from '../../src/metadata/exif.js';

/**
 * Create a sample image buffer for testing
 */
async function createSampleImage(): Promise<Buffer> {
  return sharp({
    create: {
      width: 100,
      height: 100,
      channels: 3,
      background: { r: 100, g: 150, b: 200 }
    }
  })
    .jpeg()
    .toBuffer();
}

describe('Metadata embedding helpers', () => {
  describe('embedCompleteMetadata', () => {
    it('embeds complete restoration metadata', async () => {
      const imageBuffer = await createSampleImage();
      const result = await embedCompleteMetadata(imageBuffer, {
        originalPostId: 'fb_complete_test',
        requestId: 'req_complete_001',
        aiModel: 'CodeFormer-v1.0',
        approvedBy: 'operator@test.com',
        approvalTimestamp: new Date('2025-11-05T10:00:00Z'),
        restorationTimestamp: new Date('2025-11-05T11:00:00Z'),
        originalSHA256: 'abc123'.repeat(10),
        restoredSHA256: 'def456'.repeat(10),
        originalPerceptualHash: '1234567890abcdef'
      });

      expect(Buffer.isBuffer(result.imageBuffer)).toBe(true);
      expect(result.imageBuffer.length).toBeGreaterThan(imageBuffer.length);
      expect(result.exifMetadata.originalPostId).toBe('fb_complete_test');
      expect(result.c2paManifest.type).toBe('ImageObject');
      expect(typeof result.c2paManifestJSON).toBe('string');
    });

    it('embeds minimal metadata', async () => {
      const imageBuffer = await createSampleImage();
      const result = await embedCompleteMetadata(imageBuffer, {
        originalPostId: 'fb_minimal',
        requestId: 'req_minimal',
        aiModel: 'MinimalModel',
        restorationTimestamp: new Date(),
        originalSHA256: 'minimal'.repeat(8)
      });

      expect(Buffer.isBuffer(result.imageBuffer)).toBe(true);
      expect(result.exifMetadata.originalPostId).toBe('fb_minimal');
      expect(result.exifMetadata.approvedBy).toBeUndefined();
    });

    it('includes C2PA manifest in EXIF tags', async () => {
      const imageBuffer = await createSampleImage();
      const result = await embedCompleteMetadata(imageBuffer, {
        originalPostId: 'fb_c2pa_test',
        requestId: 'req_c2pa',
        aiModel: 'C2PAModel',
        restorationTimestamp: new Date(),
        originalSHA256: 'c2pa'.repeat(12)
      });

      // C2PA manifest should be serialized and included
      expect(result.c2paManifestJSON).toBeTruthy();
      expect(result.c2paManifestJSON.length).toBeGreaterThan(100);
      expect(result.exifMetadata.c2paManifest).toBe(result.c2paManifestJSON);
    });
  });

  describe('extractCompleteMetadata', () => {
    it('extracts embedded metadata', async () => {
      const imageBuffer = await createSampleImage();
      const embedded = await embedCompleteMetadata(imageBuffer, {
        originalPostId: 'fb_extract_test',
        requestId: 'req_extract_001',
        aiModel: 'ExtractModel',
        approvedBy: 'extractor@test.com',
        approvalTimestamp: new Date('2025-11-05T09:00:00Z'),
        restorationTimestamp: new Date('2025-11-05T10:00:00Z'),
        originalSHA256: 'extract'.repeat(8),
        originalPerceptualHash: 'phash123'
      });

      const extracted = await extractCompleteMetadata(embedded.imageBuffer);

      expect(extracted.exif.originalPostId).toBe('fb_extract_test');
      expect(extracted.exif.requestId).toBe('req_extract_001');
      expect(extracted.exif.aiModel).toBe('ExtractModel');
      expect(extracted.exif.approvedBy).toBe('extractor@test.com');
      expect(extracted.exif.originalSHA256).toBe('extract'.repeat(8));
      expect(extracted.exif.originalPerceptualHash).toBe('phash123');
    });

    it('extracts C2PA manifest from EXIF', async () => {
      const imageBuffer = await createSampleImage();
      const embedded = await embedCompleteMetadata(imageBuffer, {
        originalPostId: 'fb_c2pa_extract',
        requestId: 'req_c2pa_extract',
        aiModel: 'C2PAExtractModel',
        restorationTimestamp: new Date(),
        originalSHA256: 'c2paext'.repeat(7)
      });

      const extracted = await extractCompleteMetadata(embedded.imageBuffer);

      expect(extracted.c2pa).toBeDefined();
      expect(extracted.c2pa?.claimGenerator).toContain('ai-photo-restoration-service');
      expect(extracted.c2pa?.type).toBe('ImageObject');
    });

    it('handles images without C2PA manifest', async () => {
      const imageBuffer = await createSampleImage();
      const extracted = await extractCompleteMetadata(imageBuffer);

      expect(extracted.exif).toBeDefined();
      expect(extracted.c2pa).toBeNull();
    });

    it('round-trips metadata correctly', async () => {
      const imageBuffer = await createSampleImage();
      const originalMetadata = {
        originalPostId: 'fb_roundtrip',
        requestId: 'req_roundtrip',
        aiModel: 'RoundtripModel',
        approvedBy: 'roundtrip@test.com',
        approvalTimestamp: new Date('2025-11-05T08:00:00Z'),
        restorationTimestamp: new Date('2025-11-05T09:00:00Z'),
        originalSHA256: 'roundtrip'.repeat(6),
        originalPerceptualHash: 'roundtriphash'
      };

      const embedded = await embedCompleteMetadata(imageBuffer, originalMetadata);
      const extracted = await extractCompleteMetadata(embedded.imageBuffer);

      expect(extracted.exif.originalPostId).toBe(originalMetadata.originalPostId);
      expect(extracted.exif.requestId).toBe(originalMetadata.requestId);
      expect(extracted.exif.aiModel).toBe(originalMetadata.aiModel);
      expect(extracted.exif.approvedBy).toBe(originalMetadata.approvedBy);
      expect(extracted.exif.approvalTimestamp?.toISOString()).toBe(
        originalMetadata.approvalTimestamp.toISOString()
      );
      expect(extracted.exif.restorationTimestamp?.toISOString()).toBe(
        originalMetadata.restorationTimestamp.toISOString()
      );
    });
  });

  describe('verifyMetadataIntegrity', () => {
    it('verifies intact metadata', async () => {
      const imageBuffer = await createSampleImage();
      const embedded = await embedCompleteMetadata(imageBuffer, {
        originalPostId: 'fb_verify',
        requestId: 'req_verify',
        aiModel: 'VerifyModel',
        restorationTimestamp: new Date(),
        originalSHA256: 'verify'.repeat(10)
      });

      const verification = await verifyMetadataIntegrity(embedded.imageBuffer, {
        originalPostId: 'fb_verify',
        requestId: 'req_verify'
      });

      expect(verification.isValid).toBe(true);
      expect(verification.errors).toHaveLength(0);
    });

    it('detects tampered metadata', async () => {
      const imageBuffer = await createSampleImage();
      const embedded = await embedCompleteMetadata(imageBuffer, {
        originalPostId: 'fb_tamper_original',
        requestId: 'req_tamper',
        aiModel: 'TamperModel',
        restorationTimestamp: new Date(),
        originalSHA256: 'tamper'.repeat(10)
      });

      const verification = await verifyMetadataIntegrity(embedded.imageBuffer, {
        originalPostId: 'fb_tamper_different', // Wrong value
        requestId: 'req_tamper'
      });

      expect(verification.isValid).toBe(false);
      expect(verification.errors.length).toBeGreaterThan(0);
      expect(verification.errors[0]).toContain('originalPostId');
    });

    it('verifies partial metadata', async () => {
      const imageBuffer = await createSampleImage();
      const embedded = await embedCompleteMetadata(imageBuffer, {
        originalPostId: 'fb_partial_verify',
        requestId: 'req_partial_verify',
        aiModel: 'PartialModel',
        approvedBy: 'partial@test.com',
        restorationTimestamp: new Date(),
        originalSHA256: 'partial'.repeat(8)
      });

      // Verify only some fields
      const verification = await verifyMetadataIntegrity(embedded.imageBuffer, {
        originalPostId: 'fb_partial_verify'
        // Not checking other fields
      });

      expect(verification.isValid).toBe(true);
    });
  });

  describe('getMetadataSummary', () => {
    it('generates human-readable summary', async () => {
      const imageBuffer = await createSampleImage();
      const embedded = await embedCompleteMetadata(imageBuffer, {
        originalPostId: 'fb_summary_test',
        requestId: 'req_summary_test',
        aiModel: 'SummaryModel-v2.0',
        approvedBy: 'summary@test.com',
        approvalTimestamp: new Date('2025-11-05T14:00:00Z'),
        restorationTimestamp: new Date('2025-11-05T15:00:00Z'),
        originalSHA256: 'summary'.repeat(8),
        originalPerceptualHash: 'summaryhash'
      });

      const summary = await getMetadataSummary(embedded.imageBuffer);

      expect(summary).toContain('fb_summary_test');
      expect(summary).toContain('req_summary_test');
      expect(summary).toContain('SummaryModel-v2.0');
      expect(summary).toContain('summary@test.com');
      expect(summary).toContain('ai.inference');
    });

    it('handles images without metadata', async () => {
      const imageBuffer = await createSampleImage();
      const summary = await getMetadataSummary(imageBuffer);

      expect(summary).toContain('No metadata found');
    });

    it('includes C2PA action summary', async () => {
      const imageBuffer = await createSampleImage();
      const embedded = await embedCompleteMetadata(imageBuffer, {
        originalPostId: 'fb_action_summary',
        requestId: 'req_action_summary',
        aiModel: 'ActionSummaryModel',
        approvedBy: 'actions@test.com',
        approvalTimestamp: new Date(),
        restorationTimestamp: new Date(),
        originalSHA256: 'actions'.repeat(9)
      });

      const summary = await getMetadataSummary(embedded.imageBuffer);

      expect(summary).toContain('C2PA Actions');
      expect(summary).toContain('ai.inference');
    });
  });

  afterAll(async () => {
    // Clean shutdown of ExifTool worker process
    await closeExifTool();
  });
});
