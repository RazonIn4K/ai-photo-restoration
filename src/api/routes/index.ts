import { Router } from 'express';

import { imagesRouter } from './images.js';
import { requestsRouter } from './requests.js';

/**
 * Main API router
 */
export const routes = Router();

// Mount sub-routers
routes.use('/requests', requestsRouter);
routes.use('/images', imagesRouter);

// API info endpoint
routes.get('/', (req, res) => {
  res.json({
    name: 'AI Photo Restoration API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      requests: '/api/requests',
      metrics: '/api/metrics'
    }
  });
});
