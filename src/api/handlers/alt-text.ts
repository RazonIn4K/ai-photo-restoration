/**
 * Alt-Text API Handlers
 * Handles requests for AI-generated alt-text suggestions
 */

import type { Request, Response } from 'express';

import { logger } from '../../lib/logger.js';
import { RequestRecordModel } from '../../models/index.js';
import {
  generateAltText,
  generateBatchAltText,
  validateAltText,
  type GenerateAltTextOptions
} from '../../services/alt-text.js';

export interface GenerateAltTextRequest {
  assetId: string;
  requestId?: string;
  context?: {
    userRequest?: string;
    intentCategory?: string;
  };
}

export interface BatchGenerateAltTextRequest {
  assets: Array<{
    assetId: string;
    requestId?: string;
  }>;
}

export interface UpdateAltTextRequest {
  requestId: string;
  assetId: string;
  altText: string;
}

/**
 * POST /api/alt-text/generate
 * Generate alt-text suggestion for a single asset
 */
export async function generateAltTextHandler(req: Request, res: Response): Promise<void> {
  try {
    const data = req.body as GenerateAltTextRequest;

    logger.info({ assetId: data.assetId }, 'Generating alt-text suggestion');

    const options: GenerateAltTextOptions = {
      assetId: data.assetId,
      context: data.context
    };

    // If requestId provided, fetch additional context from database
    if (data.requestId) {
      const request = await RequestRecordModel.findOne({ requestId: data.requestId }).lean();
      if (request) {
        options.context = {
          userRequest: request.userRequest,
          intentCategory: request.intentCategory,
          ...options.context
        };
      }
    }

    const suggestion = await generateAltText(options);

    res.json({
      success: true,
      suggestion
    });
  } catch (error) {
    logger.error({ error }, 'Failed to generate alt-text');
    res.status(500).json({
      success: false,
      error: 'Failed to generate alt-text',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * POST /api/alt-text/generate-batch
 * Generate alt-text suggestions for multiple assets
 */
export async function generateBatchAltTextHandler(req: Request, res: Response): Promise<void> {
  try {
    const data = req.body as BatchGenerateAltTextRequest;

    logger.info({ count: data.assets.length }, 'Batch generating alt-text suggestions');

    const options: GenerateAltTextOptions[] = data.assets.map(asset => ({
      assetId: asset.assetId
    }));

    const suggestions = await generateBatchAltText(options);

    res.json({
      success: true,
      suggestions
    });
  } catch (error) {
    logger.error({ error }, 'Failed to batch generate alt-text');
    res.status(500).json({
      success: false,
      error: 'Failed to batch generate alt-text',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * POST /api/alt-text/validate
 * Validate alt-text meets accessibility guidelines
 */
export async function validateAltTextHandler(req: Request, res: Response): Promise<void> {
  try {
    const { altText } = req.body as { altText: string };

    logger.debug({ length: altText.length }, 'Validating alt-text');

    const validation = validateAltText(altText);

    res.json({
      success: true,
      validation
    });
  } catch (error) {
    logger.error({ error }, 'Failed to validate alt-text');
    res.status(500).json({
      success: false,
      error: 'Failed to validate alt-text',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * PUT /api/alt-text/update
 * Update alt-text for an asset in a request
 */
export async function updateAltTextHandler(req: Request, res: Response): Promise<void> {
  try {
    const data = req.body as UpdateAltTextRequest;

    logger.info({ requestId: data.requestId, assetId: data.assetId }, 'Updating alt-text');

    // Find the request
    const request = await RequestRecordModel.findOne({ requestId: data.requestId });

    if (!request) {
      res.status(404).json({
        success: false,
        error: 'Request not found',
        message: `No request found with ID: ${data.requestId}`
      });
      return;
    }

    // Find the asset within the request
    const asset = request.assets.find(a => a.assetId === data.assetId);

    if (!asset) {
      res.status(404).json({
        success: false,
        error: 'Asset not found',
        message: `No asset found with ID: ${data.assetId} in request ${data.requestId}`
      });
      return;
    }

    // Update the alt-text (store in c2paManifestRef as JSON for now)
    // In production, this would be stored in a dedicated field or metadata
    const metadata = asset.c2paManifestRef ? JSON.parse(asset.c2paManifestRef) : {};
    metadata.altText = data.altText;
    metadata.altTextUpdatedAt = new Date().toISOString();

    asset.c2paManifestRef = JSON.stringify(metadata);

    await request.save();

    logger.info({ requestId: data.requestId, assetId: data.assetId }, 'Alt-text updated successfully');

    res.json({
      success: true,
      message: 'Alt-text updated successfully'
    });
  } catch (error) {
    logger.error({ error }, 'Failed to update alt-text');
    res.status(500).json({
      success: false,
      error: 'Failed to update alt-text',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
