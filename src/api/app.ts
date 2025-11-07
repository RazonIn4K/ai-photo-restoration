import cors from 'cors';
import express, { json, type Express, urlencoded } from 'express';
import helmet from 'helmet';

import { errorHandler } from './middleware/error-handler.js';
import { apiRateLimiter } from './middleware/rate-limit.js';
import { requestLogger } from './middleware/request-logger.js';
import { securityHeaders } from './middleware/security-headers.js';
import { routes } from './routes/index.js';

/**
 * Create and configure Express application
 */
export function createApp(): Express {
  const app = express();

  // Trust proxy (for rate limiting behind reverse proxy)
  app.set('trust proxy', 1);

  // Request parsing middleware
  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ extended: true, limit: '10mb' }));

  // CORS configuration
  app.use(
    cors({
      origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization']
    })
  );

  // Security middleware
  app.use(helmet());
  app.use(securityHeaders);

  // Rate limiting
  app.use(apiRateLimiter);

  // Request logging
  app.use(requestLogger);

  // API routes
  app.use('/api', routes);

  // Basic health check endpoint (legacy)
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Error handling (must be last)
  app.use(errorHandler);

  return app;
}
