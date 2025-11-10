/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Browser, BrowserContext, Page } from 'playwright';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { GroupConfigModel } from '../../src/models/Config.js';
import { RequestRecordModel } from '../../src/models/RequestRecord.js';
import { FacebookIngestionService } from '../../src/services/facebook-ingestion.js';

// Mock Playwright
vi.mock('playwright', () => ({
  chromium: {
    launch: vi.fn()
  }
}));

// Mock models
vi.mock('../../src/models/Config.js', () => ({
  GroupConfigModel: {
    findOne: vi.fn()
  }
}));

vi.mock('../../src/models/RequestRecord.js', () => ({
  RequestRecordModel: {
    findOne: vi.fn(),
    create: vi.fn()
  }
}));

describe('FacebookIngestionService', () => {
  let service: FacebookIngestionService;
  let mockBrowser: Browser;
  let mockContext: BrowserContext;
  let mockPage: Page;

  beforeEach(async () => {
    service = new FacebookIngestionService();

    // Setup mock page
    mockPage = {
      goto: vi.fn().mockResolvedValue(undefined),
      locator: vi.fn(),
      waitForSelector: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined)
    } as any;

    // Setup mock context
    mockContext = {
      newPage: vi.fn().mockResolvedValue(mockPage),
      close: vi.fn().mockResolvedValue(undefined)
    } as any;

    // Setup mock browser
    mockBrowser = {
      newContext: vi.fn().mockResolvedValue(mockContext),
      close: vi.fn().mockResolvedValue(undefined)
    } as any;

    // Mock chromium.launch
    const { chromium } = await import('playwright');
    vi.mocked(chromium.launch).mockResolvedValue(mockBrowser);
  });

  afterEach(async () => {
    await service.cleanup();
    vi.clearAllMocks();
  });

  describe('discoverNewPosts', () => {
    it('should discover posts from Facebook group', async () => {
      const groupConfig = {
        groupId: 'test-group-123',
        selectors: {
          version: '1.0.0',
          selectors: {
            postContainer: '[role="article"]',
            postText: '[data-ad-preview="message"]',
            posterName: 'a[role="link"] strong',
            postLink: 'a[href*="/posts/"]',
            postImage: 'img[src*="scontent"]'
          },
          lastUpdated: new Date(),
          isActive: true
        },
        keywords: ['restore', 'fix'],
        lastScanTimestamp: new Date(),
        extractionMethod: 'playwright' as const,
        canarySchedule: '0 */6 * * *'
      };

      // Mock login check
      const mockLoginLocator = {
        isVisible: vi.fn().mockResolvedValue(false)
      };

      // Mock image elements
      const mockImageElement = {
        getAttribute: vi.fn().mockResolvedValue('https://scontent.com/image1.jpg')
      };

      // Mock post element with nested locators
      const mockImageLocator = {
        all: vi.fn().mockResolvedValue([mockImageElement])
      };

      const mockLinkLocator = {
        first: vi.fn().mockReturnThis(),
        getAttribute: vi.fn().mockResolvedValue('https://facebook.com/groups/test/posts/123')
      };

      const mockPosterLocator = {
        first: vi.fn().mockReturnThis(),
        textContent: vi.fn().mockResolvedValue('John Doe')
      };

      const mockTextLocator = {
        textContent: vi.fn().mockResolvedValue('Please restore this old photo')
      };

      const mockPostElement = {
        locator: vi.fn((selector: string) => {
          if (selector.includes('message')) return mockTextLocator;
          if (selector.includes('strong')) return mockPosterLocator;
          if (selector.includes('posts')) return mockLinkLocator;
          if (selector.includes('img')) return mockImageLocator;
          return mockTextLocator;
        })
      };

      const mockPostContainerLocator = {
        all: vi.fn().mockResolvedValue([mockPostElement])
      };

      // Setup page.locator to return appropriate mocks
      vi.mocked(mockPage.locator).mockImplementation((selector: string) => {
        if (selector.includes('email')) return mockLoginLocator as any;
        if (selector.includes('article')) return mockPostContainerLocator as any;
        return mockLoginLocator as any;
      });

      const posts = await service.discoverNewPosts(groupConfig as any);

      expect(posts).toHaveLength(1);
      expect(posts[0]).toMatchObject({
        groupId: 'test-group-123',
        posterName: 'John Doe',
        postText: expect.stringContaining('restore'),
        imageUrls: expect.arrayContaining([expect.stringContaining('scontent')])
      });
    });

    it('should throw error when login is required', async () => {
      const groupConfig = {
        groupId: 'test-group-123',
        selectors: {
          version: '1.0.0',
          selectors: {},
          lastUpdated: new Date(),
          isActive: true
        },
        keywords: ['restore'],
        lastScanTimestamp: new Date(),
        extractionMethod: 'playwright' as const,
        canarySchedule: '0 */6 * * *'
      };

      // Mock login page detection
      const mockLoginLocator = {
        isVisible: vi.fn().mockResolvedValue(true)
      };
      vi.mocked(mockPage.locator).mockReturnValue(mockLoginLocator as any);

      await expect(service.discoverNewPosts(groupConfig as any)).rejects.toThrow(
        'Facebook login required'
      );
    });

    it('should filter posts that do not match keywords', async () => {
      const groupConfig = {
        groupId: 'test-group-123',
        selectors: {
          version: '1.0.0',
          selectors: {
            postContainer: '[role="article"]',
            postText: '[data-ad-preview="message"]'
          },
          lastUpdated: new Date(),
          isActive: true
        },
        keywords: ['restore', 'repair'],
        lastScanTimestamp: new Date(),
        extractionMethod: 'playwright' as const,
        canarySchedule: '0 */6 * * *'
      };

      // Mock login check
      const mockLoginLocator = {
        isVisible: vi.fn().mockResolvedValue(false)
      };

      // Mock post with non-matching text
      const mockPostElement = {
        locator: vi.fn().mockReturnThis(),
        textContent: vi.fn().mockResolvedValue('Just a regular post about cats')
      };

      const mockPostLocator = {
        all: vi.fn().mockResolvedValue([mockPostElement])
      };

      vi.mocked(mockPage.locator)
        .mockReturnValueOnce(mockLoginLocator as any)
        .mockReturnValueOnce(mockPostLocator as any);

      const posts = await service.discoverNewPosts(groupConfig as any);

      expect(posts).toHaveLength(0);
    });
  });

  describe('validatePost', () => {
    it('should validate a valid post candidate', async () => {
      const candidate = {
        postId: '123',
        postUrl: 'https://facebook.com/groups/test/posts/123',
        groupId: 'test-group',
        posterName: 'John Doe',
        postText: 'Please restore this old photo',
        imageUrls: ['https://scontent.com/image1.jpg'],
        timestamp: new Date()
      };

      vi.mocked(RequestRecordModel.findOne).mockResolvedValue(null);

      const result = await service.validatePost(candidate);

      expect(result.isValid).toBe(true);
      expect(result.candidate).toEqual(candidate);
    });

    it('should reject duplicate posts', async () => {
      const candidate = {
        postId: '123',
        postUrl: 'https://facebook.com/groups/test/posts/123',
        groupId: 'test-group',
        posterName: 'John Doe',
        postText: 'Please restore this old photo',
        imageUrls: ['https://scontent.com/image1.jpg'],
        timestamp: new Date()
      };

      vi.mocked(RequestRecordModel.findOne).mockResolvedValue({ requestId: 'existing' } as any);

      const result = await service.validatePost(candidate);

      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('Duplicate');
    });

    it('should reject posts without images', async () => {
      const candidate = {
        postId: '123',
        postUrl: 'https://facebook.com/groups/test/posts/123',
        groupId: 'test-group',
        posterName: 'John Doe',
        postText: 'Please restore this old photo',
        imageUrls: [],
        timestamp: new Date()
      };

      vi.mocked(RequestRecordModel.findOne).mockResolvedValue(null);

      const result = await service.validatePost(candidate);

      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('No images');
    });

    it('should reject posts without restoration intent', async () => {
      const candidate = {
        postId: '123',
        postUrl: 'https://facebook.com/groups/test/posts/123',
        groupId: 'test-group',
        posterName: 'John Doe',
        postText: 'Just sharing a random photo',
        imageUrls: ['https://scontent.com/image1.jpg'],
        timestamp: new Date()
      };

      vi.mocked(RequestRecordModel.findOne).mockResolvedValue(null);

      const result = await service.validatePost(candidate);

      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('restoration request');
    });
  });

  describe('ingestPost', () => {
    it('should create request record for validated post', async () => {
      const validatedPost = {
        postId: '123',
        postUrl: 'https://facebook.com/groups/test/posts/123',
        groupId: 'test-group',
        posterName: 'John Doe',
        postText: 'Please restore this old photo',
        imageUrls: ['https://scontent.com/image1.jpg', 'https://scontent.com/image2.jpg'],
        timestamp: new Date(),
        validatedAt: new Date()
      };

      const mockRequestRecord = {
        requestId: 'test-request-123',
        ...validatedPost,
        assets: [
          {
            assetId: 'test-request-123-0',
            originalImageUrl: 'https://scontent.com/image1.jpg',
            selected: true
          },
          {
            assetId: 'test-request-123-1',
            originalImageUrl: 'https://scontent.com/image2.jpg',
            selected: false
          }
        ]
      };

      vi.mocked(RequestRecordModel.create).mockResolvedValue(mockRequestRecord as any);

      const result = await service.ingestPost(validatedPost);

      expect(result).toBeDefined();
      expect(RequestRecordModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          facebookPostId: '123',
          postUrl: 'https://facebook.com/groups/test/posts/123',
          assets: expect.arrayContaining([
            expect.objectContaining({
              originalImageUrl: 'https://scontent.com/image1.jpg',
              selected: true
            }),
            expect.objectContaining({
              originalImageUrl: 'https://scontent.com/image2.jpg',
              selected: false
            })
          ])
        })
      );
    });

    it('should handle multi-photo posts correctly', async () => {
      const validatedPost = {
        postId: '123',
        postUrl: 'https://facebook.com/groups/test/posts/123',
        groupId: 'test-group',
        posterName: 'John Doe',
        postText: 'Please restore these photos',
        imageUrls: [
          'https://scontent.com/image1.jpg',
          'https://scontent.com/image2.jpg',
          'https://scontent.com/image3.jpg'
        ],
        timestamp: new Date(),
        validatedAt: new Date()
      };

      vi.mocked(RequestRecordModel.create).mockResolvedValue({} as any);

      await service.ingestPost(validatedPost);

      expect(RequestRecordModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          assets: expect.arrayContaining([
            expect.objectContaining({ selected: true }), // First image selected
            expect.objectContaining({ selected: false }), // Others not selected
            expect.objectContaining({ selected: false })
          ])
        })
      );
    });
  });

  describe('runCanaryTest', () => {
    it('should test selectors and return success when all work', async () => {
      const groupConfig = {
        groupId: 'test-group-123',
        selectors: {
          version: '1.0.0',
          selectors: {
            postContainer: '[role="article"]',
            postText: '[data-ad-preview="message"]'
          },
          lastUpdated: new Date(),
          isActive: true
        },
        isActive: true
      };

      vi.mocked(GroupConfigModel.findOne).mockResolvedValue(groupConfig as any);

      // Mock selector tests
      const mockElement = {
        isVisible: vi.fn().mockResolvedValue(true)
      };

      const mockLocator = {
        first: vi.fn().mockReturnValue(mockElement)
      };

      vi.mocked(mockPage.locator).mockReturnValue(mockLocator as any);

      const result = await service.runCanaryTest('test-group-123');

      expect(result.success).toBe(true);
      expect(result.selectorsWorking).toBe(true);
      expect(result.failedSelectors).toBeUndefined();
    });

    it('should detect failed selectors', async () => {
      const groupConfig = {
        groupId: 'test-group-123',
        selectors: {
          version: '1.0.0',
          selectors: {
            postContainer: '[role="article"]',
            postText: '[data-ad-preview="message"]'
          },
          lastUpdated: new Date(),
          isActive: true
        },
        isActive: true
      };

      vi.mocked(GroupConfigModel.findOne).mockResolvedValue(groupConfig as any);

      // Mock one selector failing
      const mockElement = {
        isVisible: vi
          .fn()
          .mockResolvedValueOnce(true) // First selector works
          .mockResolvedValueOnce(false) // Second selector fails
      };

      const mockLocator = {
        first: vi.fn().mockReturnValue(mockElement)
      };

      vi.mocked(mockPage.locator).mockReturnValue(mockLocator as any);

      const result = await service.runCanaryTest('test-group-123');

      expect(result.success).toBe(false);
      expect(result.selectorsWorking).toBe(false);
      expect(result.failedSelectors).toContain('postText');
    });

    it('should handle group not found error', async () => {
      vi.mocked(GroupConfigModel.findOne).mockResolvedValue(null);

      const result = await service.runCanaryTest('non-existent-group');

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('not found');
    });
  });

  describe('Browser session management', () => {
    it('should reuse browser session within timeout', async () => {
      const groupConfig = {
        groupId: 'test-group-123',
        selectors: {
          version: '1.0.0',
          selectors: {},
          lastUpdated: new Date(),
          isActive: true
        },
        keywords: ['restore'],
        lastScanTimestamp: new Date(),
        extractionMethod: 'playwright' as const,
        canarySchedule: '0 */6 * * *'
      };

      // Mock login check and empty posts
      const mockLoginLocator = {
        isVisible: vi.fn().mockResolvedValue(false)
      };

      const mockPostLocator = {
        all: vi.fn().mockResolvedValue([])
      };

      vi.mocked(mockPage.locator)
        .mockReturnValue(mockLoginLocator as any)
        .mockReturnValueOnce(mockLoginLocator as any)
        .mockReturnValueOnce(mockPostLocator as any)
        .mockReturnValueOnce(mockLoginLocator as any)
        .mockReturnValueOnce(mockPostLocator as any);

      // First call creates session
      await service.discoverNewPosts(groupConfig as any);

      const { chromium } = await import('playwright');
      const launchCallCount = vi.mocked(chromium.launch).mock.calls.length;

      // Second call should reuse session
      await service.discoverNewPosts(groupConfig as unknown);

      expect(vi.mocked(chromium.launch).mock.calls.length).toBe(launchCallCount);
    });
  });
});
