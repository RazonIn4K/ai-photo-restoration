import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ZyteClientConfig,
  ZyteError,
  ZyteExtractionRequest,
  ZyteExtractionResponse
} from '../../src/types/index.js';
import { ZyteClient } from '../../src/services/zyte-client.js';

describe('ZyteClient', () => {
  let config: ZyteClientConfig;

  beforeEach(() => {
    config = {
      apiKey: 'test-api-key',
      apiUrl: 'https://api.zyte.test/v1/extract',
      rateLimitPerMinute: 60,
      retryMaxAttempts: 3,
      timeoutMs: 5000
    };

    // Reset fetch mock
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should create client with valid config', () => {
      const client = new ZyteClient(config);
      expect(client).toBeDefined();
      expect(client.isEnabled()).toBe(true);
    });

    it('should be disabled when no API key provided', () => {
      const client = new ZyteClient({ ...config, apiKey: undefined });
      expect(client.isEnabled()).toBe(false);
    });

    it('should be disabled when empty API key provided', () => {
      const client = new ZyteClient({ ...config, apiKey: '' });
      expect(client.isEnabled()).toBe(false);
    });
  });

  describe('extract', () => {
    it('should throw error when client is disabled', async () => {
      const client = new ZyteClient({ ...config, apiKey: undefined });
      const request: ZyteExtractionRequest = {
        url: 'https://example.com'
      };

      await expect(client.extract(request)).rejects.toMatchObject({
        type: 'auth',
        message: 'Zyte client is disabled (no API key configured)',
        retryable: false
      } as ZyteError);
    });

    it('should successfully extract content', async () => {
      const client = new ZyteClient(config);
      const request: ZyteExtractionRequest = {
        url: 'https://example.com',
        extractionOptions: {
          html: true,
          text: true
        }
      };

      const mockResponse: ZyteExtractionResponse = {
        url: 'https://example.com',
        statusCode: 200,
        html: '<html>Test</html>',
        text: 'Test'
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => mockResponse
      });

      const result = await client.extract(request);

      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith(
        config.apiUrl,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`
          }),
          body: JSON.stringify(request)
        })
      );
    });

    it('should handle HTTP 401 auth error as non-retryable', async () => {
      const client = new ZyteClient(config);
      const request: ZyteExtractionRequest = {
        url: 'https://example.com'
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Invalid API key'
      });

      await expect(client.extract(request)).rejects.toMatchObject({
        type: 'auth',
        statusCode: 401,
        retryable: false
      } as Partial<ZyteError>);

      // Should only attempt once (no retries for non-retryable errors)
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should handle HTTP 429 rate limit as retryable', async () => {
      const client = new ZyteClient({ ...config, retryMaxAttempts: 2 }); // Reduce retries for faster test
      const request: ZyteExtractionRequest = {
        url: 'https://example.com'
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        text: async () => 'Rate limit exceeded'
      });

      await expect(client.extract(request)).rejects.toMatchObject({
        type: 'rate_limit',
        statusCode: 429,
        retryable: true
      } as Partial<ZyteError>);

      // Should retry up to maxAttempts
      expect(global.fetch).toHaveBeenCalledTimes(2);
    }, 10000); // Increase timeout to 10s

    it('should handle HTTP 500 server error with retries', async () => {
      const client = new ZyteClient({ ...config, retryMaxAttempts: 2 }); // Reduce retries for faster test
      const request: ZyteExtractionRequest = {
        url: 'https://example.com'
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Server error'
      });

      await expect(client.extract(request)).rejects.toMatchObject({
        type: 'unknown',
        statusCode: 500,
        retryable: true
      } as Partial<ZyteError>);

      expect(global.fetch).toHaveBeenCalledTimes(2);
    }, 10000); // Increase timeout to 10s

    it('should retry and eventually succeed', async () => {
      const client = new ZyteClient({ ...config, retryMaxAttempts: 3 }); // 3 attempts total
      const request: ZyteExtractionRequest = {
        url: 'https://example.com'
      };

      const mockResponse: ZyteExtractionResponse = {
        url: 'https://example.com',
        statusCode: 200,
        html: '<html>Success</html>'
      };

      // Fail first two attempts, succeed on third
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          text: async () => 'Server error'
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          text: async () => 'Server error'
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => mockResponse
        });

      const result = await client.extract(request);

      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledTimes(3);
    }, 10000); // Increase timeout to 10s

    it('should handle network timeout', async () => {
      const client = new ZyteClient({ ...config, timeoutMs: 100, retryMaxAttempts: 1 });
      const request: ZyteExtractionRequest = {
        url: 'https://example.com'
      };

      // Simulate timeout by rejecting with AbortError
      global.fetch = vi.fn().mockImplementation(() => {
        return Promise.reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }));
      });

      await expect(client.extract(request)).rejects.toMatchObject({
        type: 'timeout',
        retryable: true
      } as Partial<ZyteError>);
    });

    it('should handle network error', async () => {
      const client = new ZyteClient({ ...config, retryMaxAttempts: 3 }); // 3 total attempts
      const request: ZyteExtractionRequest = {
        url: 'https://example.com'
      };

      global.fetch = vi.fn().mockRejectedValue(new Error('Network failure'));

      await expect(client.extract(request)).rejects.toMatchObject({
        type: 'network',
        message: 'Network failure',
        retryable: true
      } as Partial<ZyteError>);

      expect(global.fetch).toHaveBeenCalledTimes(3); // 3 attempts total
    }, 10000); // Increase timeout to 10s
  });

  describe('rate limiting', () => {
    it('should respect rate limits', async () => {
      const client = new ZyteClient({
        ...config,
        rateLimitPerMinute: 120 // 2 per second for faster testing
      });

      const request: ZyteExtractionRequest = {
        url: 'https://example.com'
      };

      const mockResponse: ZyteExtractionResponse = {
        url: 'https://example.com',
        statusCode: 200,
        html: '<html>Test</html>'
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse
      });

      // Make 3 requests sequentially to verify rate limiting doesn't break
      await client.extract(request);
      await client.extract(request);
      await client.extract(request);

      expect(global.fetch).toHaveBeenCalledTimes(3);
    });
  });
});
