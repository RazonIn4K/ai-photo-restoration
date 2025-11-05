import { Router } from 'express';

import { ingestPhotoHandler, getRequestHandler, listRequestsHandler } from '../handlers/requests.js';
import { validateRequest } from '../middleware/validate.js';
import { IngestPhotoSchema, GetRequestSchema, ListRequestsSchema } from '../schemas/requests.js';

/**
 * Requests router
 * Handles photo ingestion, request management, and status queries
 */
export const requestsRouter = Router();

/**
 * POST /api/requests/ingest
 * Ingest a new photo restoration request
 */
requestsRouter.post('/ingest', validateRequest(IngestPhotoSchema), ingestPhotoHandler);

/**
 * GET /api/requests/:requestId
 * Get a specific request by ID
 */
requestsRouter.get('/:requestId', validateRequest(GetRequestSchema), getRequestHandler);

/**
 * GET /api/requests
 * List requests with filtering and pagination
 */
requestsRouter.get('/', validateRequest(ListRequestsSchema), listRequestsHandler);
