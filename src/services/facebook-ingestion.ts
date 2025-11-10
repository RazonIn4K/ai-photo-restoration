import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { ulid } from 'ulid';

import { logger } from '../lib/logger.js';
import { GroupConfigModel, type IGroupConfig } from '../models/Config.js';
import { RequestRecordModel } from '../models/RequestRecord.js';

/**
 * Facebook Ingestion Service
 *
 * Implements Playwright-based Facebook group monitoring with:
 * - Persistent browser context with session management
 * - Configurable selectors with versioning system
 * - Multi-photo post detection and selective ingestion
 * - Duplicate detection using post URL fingerprinting
 *
 * Requirements: 1.1, 1.2, 1.5, 1.7
 */

export interface PostCandidate {
  postId: string;
  postUrl: string;
  groupId: string;
  posterName: string;
  posterFacebookId?: string;
  postText: string;
  imageUrls: string[];
  timestamp: Date;
}

export interface ValidationResult {
  isValid: boolean;
  reason?: string;
  candidate: PostCandidate;
}

export interface ValidatedPost extends PostCandidate {
  validatedAt: Date;
}

export interface CanaryResult {
  success: boolean;
  groupId: string;
  testedAt: Date;
  selectorsWorking: boolean;
  failedSelectors?: string[];
  errorMessage?: string;
}

export interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  createdAt: Date;
  lastUsed: Date;
}

export class FacebookIngestionService {
  private browserSession: BrowserSession | null = null;
  private readonly sessionTimeout = 30 * 60 * 1000; // 30 minutes

  /**
   * Initialize or reuse browser session with persistent context
   */
  private async getBrowserSession(): Promise<BrowserSession> {
    // Check if existing session is still valid
    if (this.browserSession) {
      const age = Date.now() - this.browserSession.lastUsed.getTime();
      if (age < this.sessionTimeout) {
        this.browserSession.lastUsed = new Date();
        logger.info('Reusing existing browser session');
        return this.browserSession;
      }

      // Session expired, close it
      logger.info('Browser session expired, creating new session');
      await this.closeBrowserSession();
    }

    // Create new persistent browser context
    logger.info('Creating new browser session with persistent context');
    const browser = await chromium.launch({
      headless: true,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--no-sandbox'
      ]
    });

    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'en-US',
      timezoneId: 'America/New_York',
      storageState: undefined // Will be loaded from file if exists
    });

    this.browserSession = {
      browser,
      context,
      createdAt: new Date(),
      lastUsed: new Date()
    };

    return this.browserSession;
  }

  /**
   * Close browser session and cleanup
   */
  private async closeBrowserSession(): Promise<void> {
    if (this.browserSession) {
      try {
        await this.browserSession.context.close();
        await this.browserSession.browser.close();
        logger.info('Browser session closed');
      } catch (error) {
        logger.error({ error }, 'Error closing browser session');
      } finally {
        this.browserSession = null;
      }
    }
  }

  /**
   * Discover new posts from a Facebook group
   *
   * @param groupConfig - Group configuration with selectors and keywords
   * @returns Array of post candidates for validation
   */
  async discoverNewPosts(groupConfig: IGroupConfig): Promise<PostCandidate[]> {
    const session = await this.getBrowserSession();
    const page = await session.context.newPage();

    try {
      logger.info({ groupId: groupConfig.groupId }, 'Starting post discovery');

      // Navigate to Facebook group
      const groupUrl = `https://www.facebook.com/groups/${groupConfig.groupId}`;
      await page.goto(groupUrl, { waitUntil: 'networkidle', timeout: 30000 });

      // Check if login is required
      const isLoginPage = await page
        .locator('input[name="email"]')
        .isVisible()
        .catch(() => false);
      if (isLoginPage) {
        logger.warn(
          { groupId: groupConfig.groupId },
          'Login required - manual authentication needed'
        );
        throw new Error('Facebook login required. Please authenticate manually.');
      }

      // Wait for posts to load using versioned selectors
      const selectors = groupConfig.selectors.selectors;
      const postSelector = selectors.postContainer || '[role="article"]';

      await page.waitForSelector(postSelector, { timeout: 10000 });

      // Extract posts using configured selectors
      const posts = await this.extractPosts(page, groupConfig);

      logger.info({ groupId: groupConfig.groupId, postCount: posts.length }, 'Posts discovered');

      return posts;
    } catch (error) {
      logger.error({ error, groupId: groupConfig.groupId }, 'Error discovering posts');
      throw error;
    } finally {
      await page.close();
    }
  }

  /**
   * Extract posts from page using versioned selectors
   */
  private async extractPosts(page: Page, groupConfig: IGroupConfig): Promise<PostCandidate[]> {
    const selectors = groupConfig.selectors.selectors;
    const postSelector = selectors.postContainer || '[role="article"]';

    // Get all post elements
    const postElements = await page.locator(postSelector).all();
    const candidates: PostCandidate[] = [];

    for (const postElement of postElements) {
      try {
        // Extract post text
        const textSelector = selectors.postText || '[data-ad-preview="message"]';
        const postText = await postElement
          .locator(textSelector)
          .textContent()
          .catch(() => '');

        // Check if post matches keywords
        if (!this.matchesKeywords(postText || '', groupConfig.keywords)) {
          continue;
        }

        // Extract poster information
        const posterSelector = selectors.posterName || 'a[role="link"] strong';
        const posterName = await postElement
          .locator(posterSelector)
          .first()
          .textContent()
          .catch(() => 'Unknown');

        // Extract post URL
        const linkSelector = selectors.postLink || 'a[href*="/posts/"]';
        const postLink = await postElement
          .locator(linkSelector)
          .first()
          .getAttribute('href')
          .catch(() => null);

        if (!postLink) {
          logger.debug('Post link not found, skipping');
          continue;
        }

        const postUrl = postLink.startsWith('http')
          ? postLink
          : `https://www.facebook.com${postLink}`;
        const postId = this.extractPostId(postUrl);

        // Extract image URLs (multi-photo support)
        const imageSelector = selectors.postImage || 'img[src*="scontent"]';
        const imageElements = await postElement.locator(imageSelector).all();
        const imageUrls: string[] = [];

        for (const imgElement of imageElements) {
          const src = await imgElement.getAttribute('src');
          if (src && !src.includes('emoji') && !src.includes('icon')) {
            imageUrls.push(src);
          }
        }

        if (imageUrls.length === 0) {
          logger.debug({ postId }, 'No images found in post, skipping');
          continue;
        }

        candidates.push({
          postId,
          postUrl,
          groupId: groupConfig.groupId,
          posterName: posterName?.trim() || 'Unknown',
          postText: postText?.trim() || '',
          imageUrls,
          timestamp: new Date()
        });

        logger.debug({ postId, imageCount: imageUrls.length }, 'Post candidate extracted');
      } catch (error) {
        logger.error({ error }, 'Error extracting post data');
        continue;
      }
    }

    return candidates;
  }

  /**
   * Check if post text matches any configured keywords
   */
  private matchesKeywords(text: string, keywords: string[]): boolean {
    const lowerText = text.toLowerCase();
    return keywords.some(keyword => lowerText.includes(keyword.toLowerCase()));
  }

  /**
   * Extract post ID from Facebook URL
   */
  private extractPostId(url: string): string {
    // Try to extract from various Facebook URL formats
    const patterns = [
      /\/posts\/(\d+)/,
      /\/permalink\/(\d+)/,
      /story_fbid=(\d+)/,
      /pfbid=([A-Za-z0-9]+)/
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return match[1];
      }
    }

    // Fallback: use URL hash
    return Buffer.from(url).toString('base64').slice(0, 16);
  }

  /**
   * Validate post candidate before ingestion
   *
   * @param candidate - Post candidate to validate
   * @returns Validation result with reason if invalid
   */
  async validatePost(candidate: PostCandidate): Promise<ValidationResult> {
    try {
      // Check for duplicate by post URL
      const existing = await RequestRecordModel.findOne({ postUrl: candidate.postUrl });
      if (existing) {
        return {
          isValid: false,
          reason: 'Duplicate post - already processed',
          candidate
        };
      }

      // Validate required fields
      if (!candidate.postId || !candidate.postUrl) {
        return {
          isValid: false,
          reason: 'Missing required post identifiers',
          candidate
        };
      }

      if (candidate.imageUrls.length === 0) {
        return {
          isValid: false,
          reason: 'No images found in post',
          candidate
        };
      }

      // Validate post text contains restoration keywords
      const hasRestorationIntent = this.hasRestorationIntent(candidate.postText);
      if (!hasRestorationIntent) {
        return {
          isValid: false,
          reason: 'Post does not appear to be a restoration request',
          candidate
        };
      }

      return {
        isValid: true,
        candidate
      };
    } catch (error) {
      logger.error({ error, postId: candidate.postId }, 'Error validating post');
      return {
        isValid: false,
        reason: `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        candidate
      };
    }
  }

  /**
   * Check if post text indicates restoration intent
   */
  private hasRestorationIntent(text: string): boolean {
    const restorationKeywords = [
      'restore',
      'restoration',
      'repair',
      'fix',
      'enhance',
      'colorize',
      'color',
      'improve',
      'clean up',
      'damaged',
      'old photo',
      'vintage'
    ];

    const lowerText = text.toLowerCase();
    return restorationKeywords.some(keyword => lowerText.includes(keyword));
  }

  /**
   * Ingest validated post and create request record
   *
   * @param post - Validated post to ingest
   * @returns Created request record
   */
  async ingestPost(post: ValidatedPost) {
    try {
      logger.info({ postId: post.postId }, 'Ingesting validated post');

      // Create request record with multi-photo support
      const requestId = ulid();
      const assets = post.imageUrls.map((url, index) => ({
        assetId: `${requestId}-${index}`,
        originalImageUrl: url,
        originalImageHash: '', // Will be computed during download
        originalImagePath: '', // Will be set during download
        perceptualHash: '', // Will be computed during download
        selected: index === 0 // Select first image by default
      }));

      const requestRecord = await RequestRecordModel.create({
        requestId,
        facebookPostId: post.postId,
        facebookGroupId: post.groupId,
        posterName: post.posterName,
        posterFacebookId: post.posterFacebookId,
        postUrl: post.postUrl,
        userRequest: post.postText,
        assets,
        status: 'queued',
        queuedAt: new Date()
      });

      logger.info(
        { requestId, postId: post.postId, assetCount: assets.length },
        'Request record created'
      );

      return requestRecord;
    } catch (error) {
      logger.error({ error, postId: post.postId }, 'Error ingesting post');
      throw error;
    }
  }

  /**
   * Run canary test to validate selectors are still working
   *
   * @param groupId - Group ID to test
   * @returns Canary test result
   */
  async runCanaryTest(groupId: string): Promise<CanaryResult> {
    const session = await this.getBrowserSession();
    const page = await session.context.newPage();

    try {
      logger.info({ groupId }, 'Running canary test');

      // Get group configuration
      const groupConfig = await GroupConfigModel.findOne({ groupId, isActive: true });
      if (!groupConfig) {
        throw new Error(`Group configuration not found for ${groupId}`);
      }

      // Navigate to group
      const groupUrl = `https://www.facebook.com/groups/${groupId}`;
      await page.goto(groupUrl, { waitUntil: 'networkidle', timeout: 30000 });

      // Test each selector
      const selectors = groupConfig.selectors.selectors;
      const failedSelectors: string[] = [];

      for (const [name, selector] of Object.entries(selectors)) {
        try {
          const element = await page.locator(selector).first();
          const isVisible = await element.isVisible({ timeout: 5000 });
          if (!isVisible) {
            failedSelectors.push(name);
            logger.warn({ groupId, selector: name }, 'Selector not visible');
          }
        } catch (error) {
          failedSelectors.push(name);
          logger.warn({ groupId, selector: name, error }, 'Selector test failed');
        }
      }

      const selectorsWorking = failedSelectors.length === 0;

      logger.info(
        { groupId, selectorsWorking, failedCount: failedSelectors.length },
        'Canary test completed'
      );

      return {
        success: selectorsWorking,
        groupId,
        testedAt: new Date(),
        selectorsWorking,
        failedSelectors: failedSelectors.length > 0 ? failedSelectors : undefined
      };
    } catch (error) {
      logger.error({ error, groupId }, 'Canary test error');
      return {
        success: false,
        groupId,
        testedAt: new Date(),
        selectorsWorking: false,
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      };
    } finally {
      await page.close();
    }
  }

  /**
   * Cleanup and close browser session
   */
  async cleanup(): Promise<void> {
    await this.closeBrowserSession();
  }
}

// Export singleton instance
export const facebookIngestionService = new FacebookIngestionService();
