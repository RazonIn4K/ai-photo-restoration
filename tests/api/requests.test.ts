import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import {
  ingestPhotoHandler,
  getRequestHandler,
  listRequestsHandler
} from '../../src/api/handlers/requests.js';
import * as mockData from '../../src/api/handlers/mock-data.js';
import * as photoIngestion from '../../src/services/photo-ingestion.js';
import { RequestRecordModel } from '../../src/models/index.js';

// Mock dependencies
vi.mock('../../src/config/env.js', () => ({
  env: {
    useMockDashboard: false
  }
}));

vi.mock('../../src/lib/logger.js', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn()
  }
}));

vi.mock('../../src/api/handlers/mock-data.js', () => ({
  loadMockRequests: vi.fn()
}));

vi.mock('../../src/services/photo-ingestion.js', () => ({
  ingestPhoto: vi.fn()
}));

vi.mock('../../src/models/index.js', () => ({
  RequestRecordModel: {
    findOne: vi.fn(),
    find: vi.fn(),
    countDocuments: vi.fn()
  }
}));

describe('Requests Handlers', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;

  beforeEach(() => {
    req = {
      params: {},
      body: {},
      query: {}
    };

    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };

    vi.clearAllMocks();
  });

  describe('ingestPhotoHandler', () => {
    it('should return 501 when in mock dashboard mode', async () => {
      const { env } = await import('../../src/config/env.js');
      env.useMockDashboard = true;

      await ingestPhotoHandler(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(501);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Photo ingestion is disabled while USE_MOCK_DASHBOARD=1'
      });
    });

    it('should ingest a photo successfully', async () => {
      const { env } = await import('../../src/config/env.js');
      env.useMockDashboard = false;

      const mockImageData = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD';
      req.body = {
        imageData: mockImageData,
        facebookPostId: 'post123',
        facebookGroupId: 'group456',
        posterName: 'Test User',
        postUrl: 'https://facebook.com/post123',
        userRequest: 'Please restore this photo',
        originalImageUrl: 'https://example.com/image.jpg'
      };

      const mockResult = {
        requestId: 'req-123',
        assetId: 'asset-456',
        originalStorageId: 'storage-789',
        perceptualHash: 'abc123def456'
      };

      vi.mocked(photoIngestion.ingestPhoto).mockResolvedValue(mockResult);

      await ingestPhotoHandler(req as Request, res as Response);

      expect(photoIngestion.ingestPhoto).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.objectContaining({
          facebookPostId: 'post123',
          facebookGroupId: 'group456',
          posterName: 'Test User',
          postUrl: 'https://facebook.com/post123',
          userRequest: 'Please restore this photo',
          originalImageUrl: 'https://example.com/image.jpg'
        })
      );

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        requestId: 'req-123',
        assetId: 'asset-456',
        storageId: 'storage-789',
        perceptualHash: 'abc123def456'
      });
    });

    it('should handle ingestion errors gracefully', async () => {
      const { env } = await import('../../src/config/env.js');
      env.useMockDashboard = false;

      req.body = {
        imageData: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD',
        facebookPostId: 'post123',
        facebookGroupId: 'group456',
        posterName: 'Test User',
        postUrl: 'https://facebook.com/post123',
        userRequest: 'Please restore this photo'
      };

      vi.mocked(photoIngestion.ingestPhoto).mockRejectedValue(
        new Error('Storage error')
      );

      await ingestPhotoHandler(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to ingest photo',
        message: 'Storage error'
      });
    });
  });

  describe('getRequestHandler', () => {
    it('should return request from mock data when in mock mode', async () => {
      const { env } = await import('../../src/config/env.js');
      env.useMockDashboard = true;

      req.params = { requestId: 'req-123' };

      const mockRequests = [
        { requestId: 'req-123', status: 'pending' },
        { requestId: 'req-456', status: 'approved' }
      ];

      vi.mocked(mockData.loadMockRequests).mockResolvedValue(mockRequests as any);

      await getRequestHandler(req as Request, res as Response);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        request: mockRequests[0]
      });
    });

    it('should return 404 when request not found in mock data', async () => {
      const { env } = await import('../../src/config/env.js');
      env.useMockDashboard = true;

      req.params = { requestId: 'nonexistent' };

      vi.mocked(mockData.loadMockRequests).mockResolvedValue([]);

      await getRequestHandler(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Request not found'
      });
    });

    it('should return request from database when not in mock mode', async () => {
      const { env } = await import('../../src/config/env.js');
      env.useMockDashboard = false;

      req.params = { requestId: 'req-789' };

      const mockRequest = { requestId: 'req-789', status: 'approved' };

      vi.mocked(RequestRecordModel.findOne).mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockRequest)
      } as any);

      await getRequestHandler(req as Request, res as Response);

      expect(RequestRecordModel.findOne).toHaveBeenCalledWith({ requestId: 'req-789' });
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        request: mockRequest
      });
    });

    it('should return 404 when request not found in database', async () => {
      const { env } = await import('../../src/config/env.js');
      env.useMockDashboard = false;

      req.params = { requestId: 'nonexistent' };

      vi.mocked(RequestRecordModel.findOne).mockReturnValue({
        lean: vi.fn().mockResolvedValue(null)
      } as any);

      await getRequestHandler(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Request not found',
        message: 'No request found with ID: nonexistent'
      });
    });

    it('should handle database errors gracefully', async () => {
      const { env } = await import('../../src/config/env.js');
      env.useMockDashboard = false;

      req.params = { requestId: 'req-123' };

      vi.mocked(RequestRecordModel.findOne).mockReturnValue({
        lean: vi.fn().mockRejectedValue(new Error('Database error'))
      } as any);

      await getRequestHandler(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to retrieve request',
        message: 'Database error'
      });
    });
  });

  describe('listRequestsHandler', () => {
    it('should return mock requests when in mock mode', async () => {
      const { env } = await import('../../src/config/env.js');
      env.useMockDashboard = true;

      const mockRequests = [
        { requestId: 'req-1', status: 'pending' },
        { requestId: 'req-2', status: 'approved' }
      ];

      vi.mocked(mockData.loadMockRequests).mockResolvedValue(mockRequests as any);

      await listRequestsHandler(req as Request, res as Response);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        requests: mockRequests
      });
    });

    it('should list requests from database with filters', async () => {
      const { env } = await import('../../src/config/env.js');
      env.useMockDashboard = false;

      req.query = {
        status: 'pending',
        facebookGroupId: 'group123',
        limit: 10,
        offset: 0,
        sortBy: 'createdAt',
        sortOrder: 'desc'
      } as any;

      const mockRequests = [
        { requestId: 'req-1', status: 'pending' },
        { requestId: 'req-2', status: 'pending' }
      ];

      const mockFind = {
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(mockRequests)
      };

      vi.mocked(RequestRecordModel.find).mockReturnValue(mockFind as any);
      vi.mocked(RequestRecordModel.countDocuments).mockResolvedValue(2);

      await listRequestsHandler(req as Request, res as Response);

      expect(RequestRecordModel.find).toHaveBeenCalledWith({
        status: 'pending',
        facebookGroupId: 'group123'
      });

      expect(mockFind.sort).toHaveBeenCalledWith({ createdAt: -1 });
      expect(mockFind.skip).toHaveBeenCalledWith(0);
      expect(mockFind.limit).toHaveBeenCalledWith(10);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockRequests,
        pagination: {
          total: 2,
          limit: 10,
          offset: 0,
          hasMore: false
        }
      });
    });

    it('should handle ascending sort order', async () => {
      const { env } = await import('../../src/config/env.js');
      env.useMockDashboard = false;

      req.query = {
        sortBy: 'createdAt',
        sortOrder: 'asc',
        limit: 10,
        offset: 0
      } as any;

      const mockFind = {
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([])
      };

      vi.mocked(RequestRecordModel.find).mockReturnValue(mockFind as any);
      vi.mocked(RequestRecordModel.countDocuments).mockResolvedValue(0);

      await listRequestsHandler(req as Request, res as Response);

      expect(mockFind.sort).toHaveBeenCalledWith({ createdAt: 1 });
    });

    it('should calculate pagination correctly with more results', async () => {
      const { env } = await import('../../src/config/env.js');
      env.useMockDashboard = false;

      req.query = {
        limit: 10,
        offset: 0,
        sortBy: 'createdAt',
        sortOrder: 'desc'
      } as any;

      const mockFind = {
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([])
      };

      vi.mocked(RequestRecordModel.find).mockReturnValue(mockFind as any);
      vi.mocked(RequestRecordModel.countDocuments).mockResolvedValue(25);

      await listRequestsHandler(req as Request, res as Response);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: [],
        pagination: {
          total: 25,
          limit: 10,
          offset: 0,
          hasMore: true
        }
      });
    });

    it('should handle database errors in list operation', async () => {
      const { env } = await import('../../src/config/env.js');
      env.useMockDashboard = false;

      req.query = {
        limit: 10,
        offset: 0,
        sortBy: 'createdAt',
        sortOrder: 'desc'
      } as any;

      vi.mocked(RequestRecordModel.find).mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        lean: vi.fn().mockRejectedValue(new Error('Database connection lost'))
      } as any);

      await listRequestsHandler(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to list requests',
        message: 'Database connection lost'
      });
    });
  });
});
