import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { GroupConfig, VersionedSelectors, ZyteError } from '../../src/types/index.js';
import {
  FacebookIngestionService,
  type ExtractedContent,
  type PlaywrightExtractor
} from '../../src/services/facebook-ingestion.js';
import type { ZyteClient } from '../../src/services/zyte-client.js';

describe('FacebookIngestionService', () => {
  let mockZyteClient: ZyteClient;
  let mockPlaywrightExtractor: PlaywrightExtractor;
  let groupConfig: GroupConfig;

  beforeEach(() => {
    // Mock Zyte client
    mockZyteClient = {
      isEnabled: vi.fn().mockReturnValue(true),
      extract: vi.fn()
    } as unknown as ZyteClient;

    // Mock Playwright extractor
    mockPlaywrightExtractor = {
      isAvailable: vi.fn().mockReturnValue(true),
      extract: vi.fn()
    };

    // Sample group config
    const selectors: VersionedSelectors = {
      version: '1.0.0',
      selectors: {
        post: '.post-content',
        author: '.author-name'
      },
      lastUpdated: new Date(),
      isActive: true
    };

    groupConfig = {
      groupId: 'test-group-123',
      groupName: 'Test Group',
      selectors,
      keywords: ['test', 'photo'],
      lastScanTimestamp: new Date(),
      extractionMethod: 'playwright',
      canarySchedule: '0 */6 * * *',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    } as GroupConfig;
  });

  describe('initialization', () => {
    it('should create service with Zyte client only', () => {
      const service = new FacebookIngestionService({ zyteClient: mockZyteClient });
      expect(service).toBeDefined();
    });

    it('should create service with Playwright extractor only', () => {
      const service = new FacebookIngestionService({
        playwrightExtractor: mockPlaywrightExtractor
      });
      expect(service).toBeDefined();
    });

    it('should create service with both extractors', () => {
      const service = new FacebookIngestionService({
        zyteClient: mockZyteClient,
        playwrightExtractor: mockPlaywrightExtractor
      });
      expect(service).toBeDefined();
    });

    it('should create service with no extractors', () => {
      const service = new FacebookIngestionService({});
      expect(service).toBeDefined();
    });
  });

  describe('extractContent - Zyte mode', () => {
    it('should extract using Zyte when method is "zyte"', async () => {
      const service = new FacebookIngestionService({ zyteClient: mockZyteClient });

      const mockZyteResponse = {
        url: 'https://facebook.com/groups/test/posts/123',
        statusCode: 200,
        html: '<html>Test content</html>',
        text: 'Test content'
      };

      vi.mocked(mockZyteClient.extract).mockResolvedValue(mockZyteResponse);

      const config = { ...groupConfig, extractionMethod: 'zyte' as const };
      const result = await service.extractContent(
        'https://facebook.com/groups/test/posts/123',
        config
      );

      expect(result.extractionMethod).toBe('zyte');
      expect(result.html).toBe('<html>Test content</html>');
      expect(result.text).toBe('Test content');
      expect(mockZyteClient.extract).toHaveBeenCalledTimes(1);
    });

    it('should throw error when Zyte client not available', async () => {
      const service = new FacebookIngestionService({});

      const config = { ...groupConfig, extractionMethod: 'zyte' as const };

      await expect(
        service.extractContent('https://facebook.com/groups/test/posts/123', config)
      ).rejects.toThrow('Zyte client not configured');
    });

    it('should throw error when Zyte client disabled', async () => {
      vi.mocked(mockZyteClient.isEnabled).mockReturnValue(false);
      const service = new FacebookIngestionService({ zyteClient: mockZyteClient });

      const config = { ...groupConfig, extractionMethod: 'zyte' as const };

      await expect(
        service.extractContent('https://facebook.com/groups/test/posts/123', config)
      ).rejects.toThrow('Zyte client not configured');
    });
  });

  describe('extractContent - Playwright mode', () => {
    it('should extract using Playwright when method is "playwright"', async () => {
      const service = new FacebookIngestionService({
        playwrightExtractor: mockPlaywrightExtractor
      });

      const mockPlaywrightResponse: ExtractedContent = {
        html: '<html>Playwright content</html>',
        text: 'Playwright content',
        extractedAt: new Date(),
        extractionMethod: 'playwright',
        url: 'https://facebook.com/groups/test/posts/123'
      };

      vi.mocked(mockPlaywrightExtractor.extract).mockResolvedValue(mockPlaywrightResponse);

      const config = { ...groupConfig, extractionMethod: 'playwright' as const };
      const result = await service.extractContent(
        'https://facebook.com/groups/test/posts/123',
        config
      );

      expect(result.extractionMethod).toBe('playwright');
      expect(result.html).toBe('<html>Playwright content</html>');
      expect(mockPlaywrightExtractor.extract).toHaveBeenCalledWith(
        'https://facebook.com/groups/test/posts/123',
        groupConfig.selectors.selectors
      );
    });

    it('should throw error when Playwright extractor not available', async () => {
      const service = new FacebookIngestionService({});

      const config = { ...groupConfig, extractionMethod: 'playwright' as const };

      await expect(
        service.extractContent('https://facebook.com/groups/test/posts/123', config)
      ).rejects.toThrow('Playwright extractor not configured');
    });
  });

  describe('extractContent - Hybrid mode', () => {
    it('should try Zyte first and succeed', async () => {
      const service = new FacebookIngestionService({
        zyteClient: mockZyteClient,
        playwrightExtractor: mockPlaywrightExtractor
      });

      const mockZyteResponse = {
        url: 'https://facebook.com/groups/test/posts/123',
        statusCode: 200,
        html: '<html>Zyte content</html>',
        text: 'Zyte content'
      };

      vi.mocked(mockZyteClient.extract).mockResolvedValue(mockZyteResponse);

      const config = { ...groupConfig, extractionMethod: 'hybrid' as const };
      const result = await service.extractContent(
        'https://facebook.com/groups/test/posts/123',
        config
      );

      expect(result.extractionMethod).toBe('zyte');
      expect(result.html).toBe('<html>Zyte content</html>');
      expect(mockZyteClient.extract).toHaveBeenCalledTimes(1);
      expect(mockPlaywrightExtractor.extract).not.toHaveBeenCalled();
    });

    it('should fall back to Playwright when Zyte fails', async () => {
      const service = new FacebookIngestionService({
        zyteClient: mockZyteClient,
        playwrightExtractor: mockPlaywrightExtractor
      });

      const zyteError: ZyteError = {
        type: 'timeout',
        message: 'Request timeout',
        retryable: true
      };

      vi.mocked(mockZyteClient.extract).mockRejectedValue(zyteError);

      const mockPlaywrightResponse: ExtractedContent = {
        html: '<html>Playwright fallback content</html>',
        text: 'Playwright fallback content',
        extractedAt: new Date(),
        extractionMethod: 'playwright',
        url: 'https://facebook.com/groups/test/posts/123'
      };

      vi.mocked(mockPlaywrightExtractor.extract).mockResolvedValue(mockPlaywrightResponse);

      const config = { ...groupConfig, extractionMethod: 'hybrid' as const };
      const result = await service.extractContent(
        'https://facebook.com/groups/test/posts/123',
        config
      );

      expect(result.extractionMethod).toBe('playwright');
      expect(result.html).toBe('<html>Playwright fallback content</html>');
      expect(result.metadata?.fallbackUsed).toBe(true);
      expect(mockZyteClient.extract).toHaveBeenCalledTimes(1);
      expect(mockPlaywrightExtractor.extract).toHaveBeenCalledTimes(1);
    });

    it('should use Playwright when Zyte not enabled', async () => {
      vi.mocked(mockZyteClient.isEnabled).mockReturnValue(false);

      const service = new FacebookIngestionService({
        zyteClient: mockZyteClient,
        playwrightExtractor: mockPlaywrightExtractor
      });

      const mockPlaywrightResponse: ExtractedContent = {
        html: '<html>Playwright content</html>',
        text: 'Playwright content',
        extractedAt: new Date(),
        extractionMethod: 'playwright',
        url: 'https://facebook.com/groups/test/posts/123'
      };

      vi.mocked(mockPlaywrightExtractor.extract).mockResolvedValue(mockPlaywrightResponse);

      const config = { ...groupConfig, extractionMethod: 'hybrid' as const };
      const result = await service.extractContent(
        'https://facebook.com/groups/test/posts/123',
        config
      );

      expect(result.extractionMethod).toBe('playwright');
      expect(mockZyteClient.extract).not.toHaveBeenCalled();
      expect(mockPlaywrightExtractor.extract).toHaveBeenCalledTimes(1);
    });

    it('should throw error when both extractors unavailable', async () => {
      const service = new FacebookIngestionService({});

      const config = { ...groupConfig, extractionMethod: 'hybrid' as const };

      await expect(
        service.extractContent('https://facebook.com/groups/test/posts/123', config)
      ).rejects.toThrow('No extraction service available for hybrid mode');
    });

    it('should throw error when Zyte fails and Playwright unavailable', async () => {
      const service = new FacebookIngestionService({
        zyteClient: mockZyteClient
      });

      const zyteError: ZyteError = {
        type: 'timeout',
        message: 'Request timeout',
        retryable: true
      };

      vi.mocked(mockZyteClient.extract).mockRejectedValue(zyteError);

      const config = { ...groupConfig, extractionMethod: 'hybrid' as const };

      await expect(
        service.extractContent('https://facebook.com/groups/test/posts/123', config)
      ).rejects.toThrow('No extraction service available for hybrid mode');
    });
  });

  describe('extractContent - Unknown method', () => {
    it('should throw error for unknown extraction method', async () => {
      const service = new FacebookIngestionService({
        zyteClient: mockZyteClient,
        playwrightExtractor: mockPlaywrightExtractor
      });

      const config = {
        ...groupConfig,
        extractionMethod: 'unknown' as 'playwright'
      };

      await expect(
        service.extractContent('https://facebook.com/groups/test/posts/123', config)
      ).rejects.toThrow('Unknown extraction method: unknown');
    });
  });
});
