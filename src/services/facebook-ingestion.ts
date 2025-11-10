/**
 * Facebook Ingestion Orchestrator
 * Routes extraction requests to appropriate service (Zyte, Playwright, or hybrid)
 */

import type { ZyteClient } from './zyte-client.js';
import { logger } from '../lib/logger.js';
import type { GroupConfig, ZyteError, ZyteExtractionRequest } from '../types/index.js';

/**
 * Extracted content from Facebook group/post
 */
export interface ExtractedContent {
  html: string;
  text?: string;
  extractedAt: Date;
  extractionMethod: 'zyte' | 'playwright';
  url: string;
  metadata?: {
    processingTimeMs?: number;
    fallbackUsed?: boolean;
  };
}

/**
 * Playwright extractor interface (stub for now)
 * This would be implemented with actual Playwright logic
 */
export interface PlaywrightExtractor {
  extract(url: string, selectors?: Record<string, string>): Promise<ExtractedContent>;
  isAvailable(): boolean;
}

/**
 * Facebook ingestion service dependencies
 */
export interface FacebookIngestionDeps {
  zyteClient?: ZyteClient;
  playwrightExtractor?: PlaywrightExtractor;
}

/**
 * Facebook ingestion orchestrator
 */
export class FacebookIngestionService {
  private readonly zyteClient?: ZyteClient;
  private readonly playwrightExtractor?: PlaywrightExtractor;

  constructor(deps: FacebookIngestionDeps) {
    this.zyteClient = deps.zyteClient;
    this.playwrightExtractor = deps.playwrightExtractor;

    logger.info(
      {
        zyteEnabled: this.zyteClient?.isEnabled() ?? false,
        playwrightAvailable: this.playwrightExtractor?.isAvailable() ?? false
      },
      'Facebook ingestion service initialized'
    );
  }

  /**
   * Extract content from Facebook URL based on group configuration
   */
  async extractContent(url: string, groupConfig: GroupConfig): Promise<ExtractedContent> {
    const { extractionMethod, groupId, selectors } = groupConfig;

    logger.info(
      {
        url,
        groupId,
        extractionMethod
      },
      'Starting Facebook content extraction'
    );

    const startTime = Date.now();

    try {
      switch (extractionMethod) {
        case 'zyte':
          return await this.extractWithZyte(url, groupId);

        case 'playwright':
          return await this.extractWithPlaywright(url, groupId, selectors.selectors);

        case 'hybrid':
          return await this.extractHybrid(url, groupId, selectors.selectors);

        default:
          throw new Error(`Unknown extraction method: ${extractionMethod}`);
      }
    } finally {
      const duration = Date.now() - startTime;
      logger.info(
        {
          url,
          groupId,
          extractionMethod,
          durationMs: duration
        },
        'Facebook content extraction completed'
      );
    }
  }

  /**
   * Extract using Zyte only
   */
  private async extractWithZyte(url: string, groupId: string): Promise<ExtractedContent> {
    if (!this.zyteClient || !this.zyteClient.isEnabled()) {
      logger.error({ groupId }, 'Zyte extraction requested but client not available');
      throw new Error('Zyte client not configured');
    }

    logger.info({ url, groupId, method: 'zyte' }, 'Extracting with Zyte');

    const request: ZyteExtractionRequest = {
      url,
      extractionOptions: {
        html: true,
        text: true
      }
    };

    const response = await this.zyteClient.extract(request);

    return {
      html: response.html || '',
      text: response.text,
      extractedAt: new Date(),
      extractionMethod: 'zyte',
      url: response.url,
      metadata: {
        processingTimeMs: response.metadata?.processingTimeMs
      }
    };
  }

  /**
   * Extract using Playwright only
   */
  private async extractWithPlaywright(
    url: string,
    groupId: string,
    selectors?: Record<string, string>
  ): Promise<ExtractedContent> {
    if (!this.playwrightExtractor || !this.playwrightExtractor.isAvailable()) {
      logger.error({ groupId }, 'Playwright extraction requested but extractor not available');
      throw new Error('Playwright extractor not configured');
    }

    logger.info({ url, groupId, method: 'playwright' }, 'Extracting with Playwright');

    return await this.playwrightExtractor.extract(url, selectors);
  }

  /**
   * Hybrid extraction: try Zyte first, fall back to Playwright on failure
   */
  private async extractHybrid(
    url: string,
    groupId: string,
    selectors?: Record<string, string>
  ): Promise<ExtractedContent> {
    logger.info({ url, groupId, method: 'hybrid' }, 'Starting hybrid extraction (Zyte → Playwright)');

    // Try Zyte first if available
    if (this.zyteClient && this.zyteClient.isEnabled()) {
      try {
        const result = await this.extractWithZyte(url, groupId);
        logger.info({ url, groupId }, 'Hybrid extraction: Zyte succeeded');
        return result;
      } catch (error) {
        const zyteError = error as ZyteError;

        logger.warn(
          {
            url,
            groupId,
            errorType: zyteError.type,
            retryable: zyteError.retryable
          },
          'Hybrid extraction: Zyte failed, falling back to Playwright'
        );

        // Fall through to Playwright fallback
      }
    } else {
      logger.info({ url, groupId }, 'Hybrid extraction: Zyte not available, using Playwright');
    }

    // Fallback to Playwright
    if (this.playwrightExtractor && this.playwrightExtractor.isAvailable()) {
      const result = await this.extractWithPlaywright(url, groupId, selectors);
      result.metadata = {
        ...result.metadata,
        fallbackUsed: true
      };
      logger.info({ url, groupId }, 'Hybrid extraction: Playwright fallback succeeded');
      return result;
    }

    // Neither service available
    logger.error({ url, groupId }, 'Hybrid extraction: both Zyte and Playwright unavailable');
    throw new Error('No extraction service available for hybrid mode');
  }
}

/**
 * Create Facebook ingestion service
 */
export function createFacebookIngestionService(
  deps: FacebookIngestionDeps
): FacebookIngestionService {
  return new FacebookIngestionService(deps);
}
