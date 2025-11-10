import type { Request, Response } from 'express';

import { logger } from '../../lib/logger.js';
import { RequestRecordModel } from '../../models/index.js';
import { ingestPhoto } from '../../services/photo-ingestion.js';
import type {
  IngestPhotoRequest,
  GetRequestParams,
  ListRequestsQuery
} from '../schemas/requests.js';

/**
 * Handler for POST /api/requests/ingest
 * Ingests a new photo restoration request
 */
export async function ingestPhotoHandler(req: Request, res: Response): Promise<void> {
  try {
    const data = req.body as IngestPhotoRequest;

    // Extract image data from base64 data URL
    const base64Data = data.imageData.split(',')[1];
    const imageBuffer = Buffer.from(base64Data, 'base64');

    // Ingest photo using storage integration service
    const result = await ingestPhoto(imageBuffer, {
      facebookPostId: data.facebookPostId,
      facebookGroupId: data.facebookGroupId,
      posterName: data.posterName,
      postUrl: data.postUrl,
      userRequest: data.userRequest,
      originalImageUrl: data.originalImageUrl
    });

    logger.info({ requestId: result.requestId }, 'Photo ingestion successful');

    res.status(201).json({
      success: true,
      requestId: result.requestId,
      assetId: result.assetId,
      storageId: result.originalStorageId,
      perceptualHash: result.perceptualHash
    });
  } catch (error) {
    logger.error({ error }, 'Photo ingestion failed');
    res.status(500).json({
      success: false,
      error: 'Failed to ingest photo',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Handler for GET /api/requests/:requestId
 * Retrieves a specific request by ID
 */
export async function getRequestHandler(req: Request, res: Response): Promise<void> {
  try {
    const { requestId } = req.params as GetRequestParams;

    const request = await RequestRecordModel.findOne({ requestId }).lean();

    if (!request) {
      res.status(404).json({
        success: false,
        error: 'Request not found',
        message: `No request found with ID: ${requestId}`
      });
      return;
    }

    res.json({
      success: true,
      request
    });
  } catch (error) {
    logger.error({ error }, 'Failed to retrieve request');
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve request',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Handler for GET /api/requests
 * Lists requests with filtering and pagination
 */
export async function listRequestsHandler(req: Request, res: Response): Promise<void> {
  try {
    const { status, facebookGroupId, limit, offset, sortBy, sortOrder } =
      req.query as unknown as ListRequestsQuery;

    // Build query
    const query: Record<string, unknown> = {};
    if (status) query.status = status;
    if (facebookGroupId) query.facebookGroupId = facebookGroupId;

    // Build sort
    const sort: Record<string, 1 | -1> = {
      [sortBy]: sortOrder === 'asc' ? 1 : -1
    };

    // Execute query
    const [requests, total] = await Promise.all([
      RequestRecordModel.find(query).sort(sort).skip(offset).limit(limit).lean(),
      RequestRecordModel.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: requests,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total
      }
    });
  } catch (error) {
    logger.error({ error }, 'Failed to list requests');
    res.status(500).json({
      success: false,
      error: 'Failed to list requests',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
