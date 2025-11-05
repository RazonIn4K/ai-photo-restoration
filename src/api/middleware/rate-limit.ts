import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { createClient } from 'redis';

import { logger } from '../../lib/logger.js';

// Create Redis client for rate limiting
const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  socket: {
    reconnectStrategy: (retries: number) => {
      if (retries > 10) {
        logger.error('Redis reconnection failed after 10 attempts');
        return new Error('Redis reconnection failed');
      }
      return Math.min(retries * 100, 3000);
    }
  }
});

redisClient.on('error', err => logger.error({ err }, 'Redis client error'));
redisClient.on('connect', () => logger.info('Redis client connected for rate limiting'));

// Connect Redis client
redisClient.connect().catch(err => {
  logger.error({ err }, 'Failed to connect Redis for rate limiting');
});

/**
 * Rate limiter for API endpoints
 * Uses Redis to track requests across multiple instances
 */
export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  store: new RedisStore({
    // @ts-expect-error - rate-limit-redis types don't match redis v4
    client: redisClient,
    prefix: 'rl:' // Key prefix in Redis
  }),
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
  store: new RedisStore({
    // @ts-expect-error - rate-limit-redis types don't match redis v4
    client: redisClient,
    prefix: 'rl:strict:'
  }),
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
 * Export Redis client for cleanup
 */
export { redisClient as rateLimitRedisClient };
