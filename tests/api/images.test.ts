import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response } from 'express';
import { getImageHandler } from '../../src/api/handlers/images.js';
import * as mockData from '../../src/api/handlers/mock-data.js';
import * as fs from 'node:fs/promises';
import { Readable } from 'node:stream';
import { createReadStream } from 'node:fs';

// Mock dependencies
vi.mock('../../src/config/env.js', () => ({
  env: {
    useMockDashboard: true
  }
}));

vi.mock('../../src/lib/logger.js', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn()
  }
}));

vi.mock('../../src/api/handlers/mock-data.js', () => ({
  resolveMockImagePath: vi.fn()
}));

vi.mock('node:fs/promises', () => ({
  access: vi.fn()
}));

vi.mock('node:fs', () => ({
  createReadStream: vi.fn()
}));

describe('Image Handler', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;

  beforeEach(() => {
    req = {
      params: {}
    };

    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      setHeader: vi.fn().mockReturnThis(),
      end: vi.fn()
    };

    vi.clearAllMocks();
  });

  describe('getImageHandler', () => {
    it('should return 501 when not in mock dashboard mode', async () => {
      const { env } = await import('../../src/config/env.js');
      env.useMockDashboard = false;

      req.params = { type: 'original', hash: 'test-hash' };

      await getImageHandler(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(501);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Image streaming is only supported in mock dashboard mode for now'
      });
    });

    it('should stream an image successfully in mock mode', async () => {
      const { env } = await import('../../src/config/env.js');
      env.useMockDashboard = true;

      req.params = { type: 'original', hash: 'test-image.jpg' };

      const mockPath = '/mock/path/test-image.jpg';
      vi.mocked(mockData.resolveMockImagePath).mockReturnValue(mockPath);
      vi.mocked(fs.access).mockResolvedValue(undefined);

      // Create a mock readable stream
      const mockStream = new Readable({
        read() {
          this.push('mock image data');
          this.push(null);
        }
      });
      mockStream.pipe = vi.fn().mockReturnValue(mockStream);
      mockStream.on = vi.fn().mockReturnValue(mockStream);

      vi.mocked(createReadStream).mockReturnValue(mockStream as any);

      await getImageHandler(req as Request, res as Response);

      expect(mockData.resolveMockImagePath).toHaveBeenCalledWith('test-image.jpg');
      expect(fs.access).toHaveBeenCalledWith(mockPath);
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'image/jpeg');
      expect(createReadStream).toHaveBeenCalledWith(mockPath);
      expect(mockStream.pipe).toHaveBeenCalledWith(res);
    });

    it('should return 404 when image file is not found', async () => {
      const { env } = await import('../../src/config/env.js');
      env.useMockDashboard = true;

      req.params = { type: 'restored', hash: 'nonexistent.jpg' };

      const mockPath = '/mock/path/nonexistent.jpg';
      vi.mocked(mockData.resolveMockImagePath).mockReturnValue(mockPath);
      vi.mocked(fs.access).mockRejectedValue(new Error('File not found'));

      await getImageHandler(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Image not found'
      });
    });

    it('should handle streaming errors gracefully', async () => {
      const { env } = await import('../../src/config/env.js');
      env.useMockDashboard = true;

      req.params = { type: 'original', hash: 'test-image.png' };

      const mockPath = '/mock/path/test-image.png';
      vi.mocked(mockData.resolveMockImagePath).mockReturnValue(mockPath);
      vi.mocked(fs.access).mockResolvedValue(undefined);

      // Create a mock stream that emits an error
      const mockStream = new Readable({
        read() {
          this.emit('error', new Error('Stream error'));
        }
      });

      let errorHandler: ((error: Error) => void) | undefined;
      mockStream.on = vi.fn().mockImplementation((event: string, handler: any) => {
        if (event === 'error') {
          errorHandler = handler;
          // Trigger the error immediately
          setTimeout(() => errorHandler?.(new Error('Stream error')), 0);
        }
        return mockStream;
      });
      mockStream.pipe = vi.fn().mockReturnValue(mockStream);

      vi.mocked(createReadStream).mockReturnValue(mockStream as any);

      await getImageHandler(req as Request, res as Response);

      // Wait for async error handler
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(createReadStream).toHaveBeenCalledWith(mockPath);
    });

    it('should use correct MIME type for different file extensions', async () => {
      const { env } = await import('../../src/config/env.js');
      env.useMockDashboard = true;

      const testCases = [
        { filename: 'test.jpg', expectedMime: 'image/jpeg' },
        { filename: 'test.png', expectedMime: 'image/png' },
        { filename: 'test.gif', expectedMime: 'image/gif' },
        { filename: 'test.webp', expectedMime: 'image/webp' }
      ];

      for (const { filename, expectedMime } of testCases) {
        req.params = { type: 'original', hash: filename };

        const mockPath = `/mock/path/${filename}`;
        vi.mocked(mockData.resolveMockImagePath).mockReturnValue(mockPath);
        vi.mocked(fs.access).mockResolvedValue(undefined);

        const mockStream = new Readable({
          read() {
            this.push(null);
          }
        });
        mockStream.pipe = vi.fn().mockReturnValue(mockStream);
        mockStream.on = vi.fn().mockReturnValue(mockStream);

        vi.mocked(createReadStream).mockReturnValue(mockStream as any);

        await getImageHandler(req as Request, res as Response);

        expect(res.setHeader).toHaveBeenCalledWith('Content-Type', expectedMime);

        vi.clearAllMocks();
      }
    });

    it('should fallback to application/octet-stream for unknown types', async () => {
      const { env } = await import('../../src/config/env.js');
      env.useMockDashboard = true;

      req.params = { type: 'original', hash: 'test.unknown' };

      const mockPath = '/mock/path/test.unknown';
      vi.mocked(mockData.resolveMockImagePath).mockReturnValue(mockPath);
      vi.mocked(fs.access).mockResolvedValue(undefined);

      const mockStream = new Readable({
        read() {
          this.push(null);
        }
      });
      mockStream.pipe = vi.fn().mockReturnValue(mockStream);
      mockStream.on = vi.fn().mockReturnValue(mockStream);

      vi.mocked(createReadStream).mockReturnValue(mockStream as any);

      await getImageHandler(req as Request, res as Response);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/octet-stream');
    });
  });
});
