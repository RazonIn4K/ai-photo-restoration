import type { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { createClient } from 'redis';

import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';

type Handler = (req: Request, res: Response, next: NextFunction) => void;

let redisClient: ReturnType<typeof createClient> | null = null;
let apiRateLimiterMiddleware: Handler;
let strictRateLimiterMiddleware: Handler;

if (env.isTest || env.useMockDashboard) {
  const noop: Handler = (_req, _res, next) => next();
  apiRateLimiterMiddleware = noop;
  strictRateLimiterMiddleware = noop;
} else {
  redisClient = createClient({
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

  redisClient.connect().catch(err => {
    logger.error({ err }, 'Failed to connect Redis for rate limiting');
  });

  /**
   * Rate limiter for API endpoints
   * Uses Redis to track requests across multiple instances
   */
  const baseLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    store: new RedisStore({
      // @ts-expect-error - rate-limit-redis types don't match redis v4
      client: redisClient,
      prefix: 'rl:'
    }),
    skip: req => req.path === '/health',
    handler: (req, res) => {
      logger.warn({ ip: req.ip, path: req.path }, 'Rate limit exceeded');
      res.status(429).json({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter: res.getHeader('RateLimit-Reset')
      });
    }
  });

  const strictLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    store: new RedisStore({
      // @ts-expect-error - rate-limit-redis types don't match redis v4
      client: redisClient,
      prefix: 'rl:strict:'
    }),
    handler: (req, res) => {
      logger.warn({ ip: req.ip, path: req.path }, 'Strict rate limit exceeded');
      res.status(429).json({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded for this endpoint. Please try again later.',
        retryAfter: res.getHeader('RateLimit-Reset')
      });
    }
  });

  apiRateLimiterMiddleware = baseLimiter;
  strictRateLimiterMiddleware = strictLimiter;
}

export const apiRateLimiter = apiRateLimiterMiddleware;
export const strictRateLimiter = strictRateLimiterMiddleware;
export { redisClient as rateLimitRedisClient };
