import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { errorHandler } from '../../src/api/middleware/error-handler.js';

// Mock logger
vi.mock('../../src/lib/logger.js', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn()
  }
}));

describe('Error Handler Middleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let mockDate: Date;

  beforeEach(() => {
    mockDate = new Date('2025-11-11T12:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(mockDate);

    req = {
      method: 'POST',
      url: '/api/test',
      path: '/api/test'
    };

    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Zod validation errors', () => {
    it('should handle Zod validation errors with 400 status', () => {
      const zodError = new ZodError([
        {
          code: 'invalid_type',
          expected: 'string',
          received: 'number',
          path: ['email'],
          message: 'Expected string, received number'
        },
        {
          code: 'too_small',
          minimum: 8,
          type: 'string',
          inclusive: true,
          path: ['password'],
          message: 'String must contain at least 8 character(s)'
        }
      ]);

      errorHandler(zodError, req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Validation Error',
        message: 'Invalid request data',
        details: zodError.errors,
        timestamp: mockDate.toISOString(),
        path: '/api/test'
      });
    });

    it('should log Zod validation errors', async () => {
      const { logger } = await import('../../src/lib/logger.js');
      const zodError = new ZodError([
        {
          code: 'invalid_type',
          expected: 'string',
          received: 'number',
          path: ['email'],
          message: 'Invalid email'
        }
      ]);

      errorHandler(zodError, req as Request, res as Response);

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(String),
          method: 'POST',
          url: '/api/test'
        }),
        'Request error'
      );
    });
  });

  describe('Known application errors', () => {
    it('should handle errors with statusCode property', () => {
      const appError = new Error('Resource not found') as any;
      appError.statusCode = 404;
      appError.name = 'NotFoundError';

      errorHandler(appError, req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: 'NotFoundError',
        message: 'Resource not found',
        timestamp: mockDate.toISOString(),
        path: '/api/test'
      });
    });

    it('should handle unauthorized errors', () => {
      const authError = new Error('Invalid credentials') as any;
      authError.statusCode = 401;
      authError.name = 'UnauthorizedError';

      errorHandler(authError, req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'UnauthorizedError',
        message: 'Invalid credentials',
        timestamp: mockDate.toISOString(),
        path: '/api/test'
      });
    });

    it('should handle forbidden errors', () => {
      const forbiddenError = new Error('Access denied') as any;
      forbiddenError.statusCode = 403;
      forbiddenError.name = 'ForbiddenError';

      errorHandler(forbiddenError, req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'ForbiddenError',
        message: 'Access denied',
        timestamp: mockDate.toISOString(),
        path: '/api/test'
      });
    });

    it('should handle conflict errors', () => {
      const conflictError = new Error('Resource already exists') as any;
      conflictError.statusCode = 409;
      conflictError.name = 'ConflictError';

      errorHandler(conflictError, req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        error: 'ConflictError',
        message: 'Resource already exists',
        timestamp: mockDate.toISOString(),
        path: '/api/test'
      });
    });
  });

  describe('Unknown errors', () => {
    it('should handle unknown errors with 500 status in development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const unknownError = new Error('Something went wrong');

      errorHandler(unknownError, req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Internal Server Error',
        message: 'Something went wrong',
        timestamp: mockDate.toISOString(),
        path: '/api/test'
      });

      process.env.NODE_ENV = originalEnv;
    });

    it('should hide error details in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const unknownError = new Error('Internal database connection failed');

      errorHandler(unknownError, req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred',
        timestamp: mockDate.toISOString(),
        path: '/api/test'
      });

      process.env.NODE_ENV = originalEnv;
    });

    it('should log unknown errors with stack trace', async () => {
      const { logger } = await import('../../src/lib/logger.js');
      const unknownError = new Error('Unexpected error');

      errorHandler(unknownError, req as Request, res as Response);

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Unexpected error',
          stack: expect.any(String),
          method: 'POST',
          url: '/api/test'
        }),
        'Request error'
      );
    });
  });

  describe('Error logging', () => {
    it('should log all error types', async () => {
      const { logger } = await import('../../src/lib/logger.js');
      const error = new Error('Test error');

      errorHandler(error, req as Request, res as Response);

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Test error',
          stack: expect.stringContaining('Error: Test error'),
          method: 'POST',
          url: '/api/test'
        }),
        'Request error'
      );
    });

    it('should include request details in error logs', async () => {
      const { logger } = await import('../../src/lib/logger.js');
      req.method = 'GET';
      req.url = '/api/users/123';

      const error = new Error('User not found');

      errorHandler(error, req as Request, res as Response);

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          url: '/api/users/123'
        }),
        'Request error'
      );
    });
  });

  describe('Response format consistency', () => {
    it('should always include timestamp and path in response', () => {
      const error = new Error('Test error');

      errorHandler(error, req as Request, res as Response);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: mockDate.toISOString(),
          path: '/api/test'
        })
      );
    });

    it('should always include error and message fields', () => {
      const error = new Error('Test error');

      errorHandler(error, req as Request, res as Response);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(String),
          message: expect.any(String)
        })
      );
    });
  });
});
