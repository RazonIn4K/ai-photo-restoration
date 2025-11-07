import { rateLimit } from 'express-rate-limit';

import { logger } from '../../lib/logger.js';

/**
 * Rate limiter for API endpoints
 * Uses memory store for simplicity (Redis can be added later)
 */
export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  // Use default memory store for now
  skip: req => {
    // Skip rate limiting for health checks
    return req.path === '/health';
  },
  handler: (req, res) => {
    logger.warn(
      {
        ip: req.ip,
        path: req.path
      },
      'Rate limit exceeded'
    );
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please try again later.',
      retryAfter: res.getHeader('RateLimit-Reset')
    });
  }
});

/**
 * Strict rate limiter for sensitive endpoints (auth, ingestion)
 */
export const strictRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  // Use default memory store for now
  handler: (req, res) => {
    logger.warn(
      {
        ip: req.ip,
        path: req.path
      },
      'Strict rate limit exceeded'
    );
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded for this endpoint. Please try again later.',
      retryAfter: res.getHeader('RateLimit-Reset')
    });
  }
});

/**
 * Export Redis client for cleanup (null for now)
 */
export const rateLimitRedisClient = null;
