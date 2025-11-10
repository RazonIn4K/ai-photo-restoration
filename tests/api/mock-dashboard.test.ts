import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import type { Express } from 'express';

import { createApp } from '../../src/api/app.js';
import { seedMockData } from '../../scripts/seed-mock-data.js';
import { clearMockCache } from '../../src/api/handlers/mock-data.js';

describe('Mock Dashboard API', () => {
  let app: Express;

  beforeAll(async () => {
    // Set mock mode
    process.env.USE_MOCK_DASHBOARD = '1';

    // Generate mock data
    await seedMockData();

    // Clear cache to ensure fresh load
    clearMockCache();

    // Create app (without starting server)
    app = createApp();
  });

  afterAll(() => {
    // Clean up
    delete process.env.USE_MOCK_DASHBOARD;
    clearMockCache();
  });

  describe('GET /api/requests', () => {
    it('should return mock requests when mock mode enabled', async () => {
      // Make request using fetch to the Express app
      // Note: We need to manually create a test server or use supertest
      // For simplicity, we'll test the mock-data module directly

      const { filterMockRequests } = await import('../../src/api/handlers/mock-data.js');

      const result = await filterMockRequests({
        limit: 50,
        offset: 0,
        sortBy: 'createdAt',
        sortOrder: 'desc'
      });

      expect(result.requests).toBeDefined();
      expect(Array.isArray(result.requests)).toBe(true);
      expect(result.requests.length).toBeGreaterThan(0);
      expect(result.total).toBeGreaterThan(0);

      // Verify request structure
      const firstRequest = result.requests[0];
      expect(firstRequest).toHaveProperty('requestId');
      expect(firstRequest).toHaveProperty('facebookPostId');
      expect(firstRequest).toHaveProperty('facebookGroupId');
      expect(firstRequest).toHaveProperty('posterName');
      expect(firstRequest).toHaveProperty('postUrl');
      expect(firstRequest).toHaveProperty('userRequest');
      expect(firstRequest).toHaveProperty('assets');
      expect(firstRequest).toHaveProperty('status');
      expect(firstRequest).toHaveProperty('createdAt');
      expect(firstRequest).toHaveProperty('updatedAt');
    });

    it('should filter requests by status', async () => {
      const { filterMockRequests } = await import('../../src/api/handlers/mock-data.js');

      const result = await filterMockRequests({
        status: 'awaiting_manual_approval',
        limit: 50,
        offset: 0
      });

      expect(result.requests).toBeDefined();
      expect(result.requests.every(r => r.status === 'awaiting_manual_approval')).toBe(true);
    });

    it('should handle pagination', async () => {
      const { filterMockRequests } = await import('../../src/api/handlers/mock-data.js');

      const page1 = await filterMockRequests({
        limit: 3,
        offset: 0
      });

      const page2 = await filterMockRequests({
        limit: 3,
        offset: 3
      });

      expect(page1.requests.length).toBeLessThanOrEqual(3);
      expect(page2.requests.length).toBeLessThanOrEqual(3);

      // Ensure different results (if enough data)
      if (page1.total > 3) {
        expect(page1.requests[0].requestId).not.toBe(page2.requests[0]?.requestId);
      }
    });
  });

  describe('GET /api/requests/:requestId', () => {
    it('should return a specific mock request by ID', async () => {
      const { filterMockRequests, getMockRequestById } = await import('../../src/api/handlers/mock-data.js');

      // Get first request
      const { requests } = await filterMockRequests({ limit: 1, offset: 0 });
      const requestId = requests[0].requestId;

      // Get by ID
      const request = await getMockRequestById(requestId);

      expect(request).toBeDefined();
      expect(request?.requestId).toBe(requestId);
    });

    it('should return null for non-existent request ID', async () => {
      const { getMockRequestById } = await import('../../src/api/handlers/mock-data.js');

      const request = await getMockRequestById('non-existent-id');

      expect(request).toBeNull();
    });
  });

  describe('Mock Images', () => {
    it('should load mock images by hash', async () => {
      const { filterMockRequests, getMockImage } = await import('../../src/api/handlers/mock-data.js');

      // Get a request with assets
      const { requests } = await filterMockRequests({ limit: 1, offset: 0 });
      const asset = requests[0].assets[0];

      // Load image
      const imageBuffer = await getMockImage(asset.originalImageHash);

      expect(imageBuffer).toBeDefined();
      expect(Buffer.isBuffer(imageBuffer)).toBe(true);
      expect(imageBuffer.length).toBeGreaterThan(0);
    });

    it('should throw error for non-existent image hash', async () => {
      const { getMockImage } = await import('../../src/api/handlers/mock-data.js');

      await expect(getMockImage('non-existent-hash')).rejects.toThrow();
    });
  });

  describe('Mock Data Structure', () => {
    it('should have requests with correct status values', async () => {
      const { filterMockRequests } = await import('../../src/api/handlers/mock-data.js');

      const result = await filterMockRequests({ limit: 100, offset: 0 });

      const validStatuses = [
        'queued',
        'processing',
        'awaiting_manual_approval',
        'approved_pending_post',
        'rejected',
        'completed',
        'failed'
      ];

      result.requests.forEach(request => {
        expect(validStatuses).toContain(request.status);
      });
    });

    it('should have requests with assets', async () => {
      const { filterMockRequests } = await import('../../src/api/handlers/mock-data.js');

      const result = await filterMockRequests({ limit: 100, offset: 0 });

      result.requests.forEach(request => {
        expect(request.assets).toBeDefined();
        expect(Array.isArray(request.assets)).toBe(true);
        expect(request.assets.length).toBeGreaterThan(0);

        // Check asset structure
        request.assets.forEach(asset => {
          expect(asset).toHaveProperty('assetId');
          expect(asset).toHaveProperty('originalImageHash');
          expect(asset).toHaveProperty('perceptualHash');
        });
      });
    });

    it('should have completed requests with restored images', async () => {
      const { filterMockRequests } = await import('../../src/api/handlers/mock-data.js');

      const result = await filterMockRequests({
        status: 'completed',
        limit: 100,
        offset: 0
      });

      if (result.requests.length > 0) {
        result.requests.forEach(request => {
          const firstAsset = request.assets[0];
          expect(firstAsset.restoredImageHash).toBeDefined();
          expect(firstAsset.restoredStorageId).toBeDefined();
        });
      }
    });
  });

  describe('Configuration', () => {
    it('should have USE_MOCK_DASHBOARD enabled in test env', () => {
      expect(process.env.USE_MOCK_DASHBOARD).toBe('1');
    });
  });
});
