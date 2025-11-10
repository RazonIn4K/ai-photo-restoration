/**
 * Alt-Text Routes
 * API routes for alt-text generation and management
 */

import { Router } from 'express';

import {
  generateAltTextHandler,
  generateBatchAltTextHandler,
  validateAltTextHandler,
  updateAltTextHandler
} from '../handlers/alt-text.js';

export const altTextRouter = Router();

/**
 * POST /api/alt-text/generate
 * Generate alt-text suggestion for a single asset
 */
altTextRouter.post('/generate', generateAltTextHandler);

/**
 * POST /api/alt-text/generate-batch
 * Generate alt-text suggestions for multiple assets
 */
altTextRouter.post('/generate-batch', generateBatchAltTextHandler);

/**
 * POST /api/alt-text/validate
 * Validate alt-text meets accessibility guidelines
 */
altTextRouter.post('/validate', validateAltTextHandler);

/**
 * PUT /api/alt-text/update
 * Update alt-text for an asset
 */
altTextRouter.put('/update', updateAltTextHandler);
