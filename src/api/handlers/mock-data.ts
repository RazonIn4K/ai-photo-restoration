/**
 * Mock Data Handlers
 * Provides mock data loading for development and testing
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { logger } from '../../lib/logger.js';
import type { RequestStatus } from '../../types/index.js';

const MOCK_DIR = path.join(process.cwd(), 'data', 'mock');
const IMAGES_DIR = path.join(MOCK_DIR, 'images');
const MOCK_REQUESTS_FILE = path.join(MOCK_DIR, 'mock-requests.json');

interface MockRequest {
  requestId: string;
  facebookPostId: string;
  facebookGroupId: string;
  posterName: string;
  posterFacebookId?: string;
  postUrl: string;
  userRequest: string;
  assets: Array<{
    assetId: string;
    originalImageUrl: string;
    originalImageHash: string;
    originalImagePath: string;
    originalStorageId?: string;
    originalSHA256?: string;
    restoredImageUrl?: string;
    restoredImageHash?: string;
    restoredImagePath?: string;
    restoredStorageId?: string;
    restoredSHA256?: string;
    perceptualHash: string;
    restoredPerceptualHash?: string;
    c2paManifestRef?: string;
    selected: boolean;
  }>;
  intentCategory?: string;
  classificationConfidence?: number;
  routingDecision?: string;
  status: RequestStatus;
  queuedAt?: string;
  processedAt?: string;
  reviewedAt?: string;
  postedAt?: string;
  processingMetadata?: {
    modelUsed: string;
    cost?: number;
    appliedEffects: string[];
    processingTimeMs?: number;
    confidenceScore?: number;
  };
  reviewedBy?: string;
  approvalNotes?: string;
  createdAt: string;
  updatedAt: string;
}

// In-memory cache for mock data
let mockDataCache: MockRequest[] | null = null;

/**
 * Load mock requests from JSON file
 */
export async function loadMockRequests(): Promise<MockRequest[]> {
  // Return cached data if available
  if (mockDataCache) {
    return mockDataCache;
  }

  try {
    logger.info({ file: MOCK_REQUESTS_FILE }, 'Loading mock requests from file');

    const fileContent = await fs.readFile(MOCK_REQUESTS_FILE, 'utf-8');
    mockDataCache = JSON.parse(fileContent) as MockRequest[];

    logger.info({ count: mockDataCache.length }, 'Mock requests loaded successfully');

    return mockDataCache;
  } catch (error) {
    logger.error({ error, file: MOCK_REQUESTS_FILE }, 'Failed to load mock requests');

    // Check if file exists
    try {
      await fs.access(MOCK_REQUESTS_FILE);
    } catch {
      logger.warn(
        'Mock data file not found. Run "npm run seed:mock" to generate mock data.'
      );
    }

    throw new Error('Mock data not available. Please run "npm run seed:mock" first.');
  }
}

/**
 * Get mock request by ID
 */
export async function getMockRequestById(requestId: string): Promise<MockRequest | null> {
  const requests = await loadMockRequests();
  return requests.find(r => r.requestId === requestId) || null;
}

/**
 * Filter mock requests by criteria
 */
export async function filterMockRequests(filters: {
  status?: RequestStatus;
  facebookGroupId?: string;
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}): Promise<{ requests: MockRequest[]; total: number }> {
  let requests = await loadMockRequests();

  // Apply filters
  if (filters.status) {
    requests = requests.filter(r => r.status === filters.status);
  }

  if (filters.facebookGroupId) {
    requests = requests.filter(r => r.facebookGroupId === filters.facebookGroupId);
  }

  const total = requests.length;

  // Apply sorting
  const sortBy = filters.sortBy || 'createdAt';
  const sortOrder = filters.sortOrder || 'desc';

  requests.sort((a, b) => {
    const aValue = (a as Record<string, unknown>)[sortBy];
    const bValue = (b as Record<string, unknown>)[sortBy];

    if (typeof aValue === 'string' && typeof bValue === 'string') {
      return sortOrder === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
    }

    if (typeof aValue === 'number' && typeof bValue === 'number') {
      return sortOrder === 'asc' ? aValue - bValue : bValue - aValue;
    }

    return 0;
  });

  // Apply pagination
  const offset = filters.offset || 0;
  const limit = filters.limit || 50;
  requests = requests.slice(offset, offset + limit);

  return { requests, total };
}

/**
 * Get mock image by hash
 */
export async function getMockImage(hash: string): Promise<Buffer> {
  try {
    const imagePath = path.join(IMAGES_DIR, `${hash}.png`);

    logger.debug({ hash, path: imagePath }, 'Loading mock image');

    const imageBuffer = await fs.readFile(imagePath);

    return imageBuffer;
  } catch (error) {
    logger.error({ error, hash }, 'Failed to load mock image');
    throw new Error(`Mock image not found: ${hash}`);
  }
}

/**
 * Update mock request status (in-memory only)
 */
export async function updateMockRequestStatus(
  requestId: string,
  status: RequestStatus,
  updates?: {
    reviewedBy?: string;
    approvalNotes?: string;
  }
): Promise<MockRequest> {
  const requests = await loadMockRequests();
  const request = requests.find(r => r.requestId === requestId);

  if (!request) {
    throw new Error(`Mock request not found: ${requestId}`);
  }

  // Update status
  request.status = status;
  request.updatedAt = new Date().toISOString();

  // Update timestamps based on status
  const now = new Date().toISOString();

  if (status === 'approved_pending_post' || status === 'rejected') {
    request.reviewedAt = now;
    if (updates?.reviewedBy) {
      request.reviewedBy = updates.reviewedBy;
    }
    if (updates?.approvalNotes) {
      request.approvalNotes = updates.approvalNotes;
    }
  }

  if (status === 'completed') {
    request.postedAt = now;
  }

  logger.info({ requestId, status }, 'Mock request status updated (in-memory only)');

  return request;
}

/**
 * Clear mock data cache (useful for testing)
 */
export function clearMockCache(): void {
  mockDataCache = null;
  logger.debug('Mock data cache cleared');
}
