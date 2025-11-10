/**
 * Zyte API Client Service
 * Provides web extraction via Zyte API with rate limiting and retry logic
 */

import { logger } from '../lib/logger.js';
import type {
  ZyteClientConfig,
  ZyteError,
  ZyteExtractionRequest,
  ZyteExtractionResponse
} from '../types/index.js';

/**
 * Token bucket rate limiter
 */
class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per millisecond

  constructor(maxTokensPerMinute: number) {
    this.maxTokens = maxTokensPerMinute;
    this.tokens = maxTokensPerMinute;
    this.lastRefill = Date.now();
    this.refillRate = maxTokensPerMinute / 60000; // tokens per ms
  }

  async acquire(): Promise<void> {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }

    // Wait until we have a token
    const waitTime = Math.ceil((1 - this.tokens) / this.refillRate);
    logger.debug({ waitTime }, 'Rate limit reached, waiting');

    await new Promise(resolve => setTimeout(resolve, waitTime));

    this.refill();
    this.tokens -= 1;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = elapsed * this.refillRate;

    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }
}

/**
 * Zyte API Client
 */
export class ZyteClient {
  private readonly config: ZyteClientConfig;
  private readonly rateLimiter: RateLimiter;
  private readonly enabled: boolean;

  constructor(config: ZyteClientConfig) {
    this.config = config;
    this.rateLimiter = new RateLimiter(config.rateLimitPerMinute);
    this.enabled = Boolean(config.apiKey);

    if (!this.enabled) {
      logger.info('Zyte client initialized but disabled (no API key provided)');
    } else {
      logger.info(
        {
          apiUrl: config.apiUrl,
          rateLimitPerMinute: config.rateLimitPerMinute,
          retryMaxAttempts: config.retryMaxAttempts,
          timeoutMs: config.timeoutMs
        },
        'Zyte client initialized'
      );
    }
  }

  /**
   * Check if Zyte is enabled and available
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Extract content from URL using Zyte API
   */
  async extract(request: ZyteExtractionRequest): Promise<ZyteExtractionResponse> {
    if (!this.enabled) {
      const error: ZyteError = {
        type: 'auth',
        message: 'Zyte client is disabled (no API key configured)',
        retryable: false
      };
      throw error;
    }

    const startTime = Date.now();
    logger.info({ url: request.url }, 'Starting Zyte extraction');

    let lastError: ZyteError | null = null;

    for (let attempt = 1; attempt <= this.config.retryMaxAttempts; attempt++) {
      try {
        await this.rateLimiter.acquire();

        const response = await this.makeRequest(request);

        const duration = Date.now() - startTime;
        logger.info(
          {
            url: request.url,
            statusCode: response.statusCode,
            attempt,
            durationMs: duration
          },
          'Zyte extraction successful'
        );

        return response;
      } catch (error) {
        lastError = this.normalizeError(error);

        logger.warn(
          {
            url: request.url,
            attempt,
            maxAttempts: this.config.retryMaxAttempts,
            errorType: lastError.type,
            retryable: lastError.retryable
          },
          'Zyte extraction attempt failed'
        );

        if (!lastError.retryable || attempt === this.config.retryMaxAttempts) {
          break;
        }

        // Exponential backoff: 2^attempt * 1000ms (2s, 4s, 8s...)
        const backoffMs = Math.pow(2, attempt) * 1000;
        logger.debug({ backoffMs }, 'Backing off before retry');
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
    }

    const duration = Date.now() - startTime;
    logger.error(
      {
        url: request.url,
        errorType: lastError?.type,
        durationMs: duration
      },
      'Zyte extraction failed after all retries'
    );

    throw lastError;
  }

  /**
   * Make HTTP request to Zyte API
   */
  private async makeRequest(request: ZyteExtractionRequest): Promise<ZyteExtractionResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(this.config.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify(request),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'Unable to read error body');

        const error: ZyteError = {
          type: this.classifyHttpError(response.status),
          message: `Zyte API error: ${response.status} ${response.statusText}`,
          statusCode: response.status,
          retryable: this.isRetryableStatus(response.status),
          originalError: errorBody
        };

        throw error;
      }

      const data = (await response.json()) as ZyteExtractionResponse;

      return data;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error && typeof error === 'object' && 'type' in error) {
        // Already a ZyteError
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        const timeoutError: ZyteError = {
          type: 'timeout',
          message: `Request timeout after ${this.config.timeoutMs}ms`,
          retryable: true,
          originalError: error
        };
        throw timeoutError;
      }

      const networkError: ZyteError = {
        type: 'network',
        message: error instanceof Error ? error.message : 'Unknown network error',
        retryable: true,
        originalError: error
      };
      throw networkError;
    }
  }

  /**
   * Classify HTTP error by status code
   */
  private classifyHttpError(
    statusCode: number
  ): 'rate_limit' | 'auth' | 'extraction' | 'unknown' {
    if (statusCode === 429) return 'rate_limit';
    if (statusCode === 401 || statusCode === 403) return 'auth';
    if (statusCode >= 400 && statusCode < 500) return 'extraction';
    return 'unknown';
  }

  /**
   * Determine if HTTP status is retryable
   */
  private isRetryableStatus(statusCode: number): boolean {
    // Retry on server errors (5xx) and rate limits (429)
    // Don't retry on client errors (4xx) except rate limits
    return statusCode >= 500 || statusCode === 429;
  }

  /**
   * Normalize various error types to ZyteError
   */
  private normalizeError(error: unknown): ZyteError {
    if (error && typeof error === 'object' && 'type' in error) {
      return error as ZyteError;
    }

    return {
      type: 'unknown',
      message: error instanceof Error ? error.message : 'Unknown error',
      retryable: false,
      originalError: error
    };
  }
}

/**
 * Create Zyte client from environment config
 */
export function createZyteClient(config: ZyteClientConfig): ZyteClient {
  return new ZyteClient(config);
}
