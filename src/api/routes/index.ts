import { Router } from 'express';

/* eslint-disable import/order */
import { env } from '../../config/index.js';
import { metricsHandler, healthHandler } from '../handlers/metrics.js';
import { requireAuth } from '../middleware/webauthn.js';
import { authRouter } from './auth.js';
import { requestsRouter } from './requests.js';

/**
 * Main API router
 */
export const routes = Router();

// Mount sub-routers
routes.use('/auth', authRouter);
routes.use('/requests', requestsRouter);

// Metrics endpoint for Prometheus (protected)
routes.get('/metrics', requireAuth, metricsHandler);

// Enhanced health check
routes.get('/health', healthHandler);

// API info endpoint
routes.get('/', (req, res) => {
  res.json({
    name: 'AI Photo Restoration API',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      auth: '/api/auth',
      requests: '/api/requests',
      metrics: '/api/metrics',
      queues: env.BULL_BOARD_BASE_PATH
    }
  });
});
