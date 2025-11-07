import type { Express } from 'express';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

import { createApp } from '../../src/api/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/database/index.js';
import { RequestRecordModel } from '../../src/models/index.js';
import { createTestImage } from '../helpers/test-images.js';

// Mock Redis for testing
vi.mock('redis', () => ({
  createClient: vi.fn(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    sendCommand: vi.fn()
  }))
}));

// Mock rate-limit-redis to use memory store for testing
vi.mock('rate-limit-redis', () => ({
  default: vi.fn(() => ({
    incr: vi.fn().mockResolvedValue({ totalHits: 1, resetTime: Date.now() + 900000 }),
    decrement: vi.fn().mockResolvedValue(undefined),
    resetKey: vi.fn().mockResolvedValue(undefined)
  }))
}));

describe('API Integration Tests', () => {
  let app: Express;

  beforeAll(async () => {
    // Set up test environment
    process.env.MONGO_DISABLE_CSFLE = 'true';
    process.env.NODE_ENV = 'test';
    process.env.CORS_ORIGIN = 'http://localhost:3000';

    // Connect to database
    await connectDatabase();

    // Create Express app
    app = createApp();
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  beforeEach(async () => {
    // Clean up test data
    await RequestRecordModel.deleteMany({ facebookPostId: /^test-api-/ });
  });

  describe('Health and Info Endpoints', () => {
    it('GET /health should return basic health status', async () => {
      const response = await request(app).get('/health').expect(200);

      expect(response.body).toMatchObject({
        status: 'ok',
        timestamp: expect.any(String)
      });
    });

    it('GET /api/health should return detailed health status', async () => {
      const response = await request(app).get('/api/health').expect(200);

      expect(response.body).toMatchObject({
        status: expect.stringMatching(/healthy|degraded/),
        timestamp: expect.any(String),
        uptime: expect.any(Number),
        response_time_ms: expect.any(Number),
        dependencies: {
          database: expect.stringMatching(/healthy|unhealthy/),
          redis: expect.stringMatching(/healthy|unhealthy/)
        },
        system: {
          memory: expect.any(Object),
          cpu_usage: expect.any(Object)
        }
      });
    });

    it('GET /api should return API information', async () => {
      const response = await request(app).get('/api').expect(200);

      expect(response.body).toMatchObject({
        name: 'AI Photo Restoration API',
        version: '1.0.0',
        endpoints: {
          health: '/api/health',
          requests: '/api/requests',
          metrics: '/api/metrics'
        }
      });
    });
  });

  describe('WebAuthn Authentication', () => {
    describe('Registration Flow', () => {
      it('POST /api/auth/register/begin should generate registration options', async () => {
        const response = await request(app)
          .post('/api/auth/register/begin')
          .send({
            username: 'testuser',
            displayName: 'Test User'
          })
          .expect(200);

        expect(response.body).toMatchObject({
          success: true,
          options: {
            challenge: expect.any(String),
            rp: {
              name: 'AI Photo Restoration',
              id: expect.any(String)
            },
            user: {
              id: expect.any(String),
              name: 'testuser',
              displayName: 'Test User'
            },
            pubKeyCredParams: expect.any(Array),
            timeout: expect.any(Number),
            attestation: 'none',
            excludeCredentials: expect.any(Array),
            authenticatorSelection: expect.any(Object)
          },
          userId: expect.any(String)
        });
      });

      it('POST /api/auth/register/begin should validate required fields', async () => {
        const response = await request(app)
          .post('/api/auth/register/begin')
          .send({
            username: 'testuser'
            // Missing displayName
          })
          .expect(400);

        expect(response.body).toMatchObject({
          success: false,
          error: 'Validation failed'
        });
      });

      it('POST /api/auth/register/complete/:userId should handle invalid user', async () => {
        // Try to complete registration with non-existent userId
        const response = await request(app)
          .post('/api/auth/register/complete/invalid-user-id')
          .send({
            credential: {
              id: 'test-credential-id',
              rawId: 'test-raw-id',
              response: {
                clientDataJSON: 'test-client-data',
                attestationObject: 'test-attestation'
              },
              type: 'public-key'
            }
          })
          .expect(400);

        expect(response.body).toMatchObject({
          success: false,
          verified: false,
          error: 'Invalid user or missing challenge'
        });
      });
    });

    describe('Authentication Flow', () => {
      it('POST /api/auth/authenticate/begin should handle user without devices', async () => {
        // Try to authenticate with a user that doesn't exist or has no devices
        const response = await request(app)
          .post('/api/auth/authenticate/begin')
          .send({
            username: 'testuser'
          })
          .expect(404);

        expect(response.body).toMatchObject({
          success: false,
          error: 'User not found or no registered devices'
        });
      });

      it('POST /api/auth/authenticate/begin should handle non-existent user', async () => {
        const response = await request(app)
          .post('/api/auth/authenticate/begin')
          .send({
            username: 'nonexistentuser'
          })
          .expect(404);

        expect(response.body).toMatchObject({
          success: false,
          error: 'User not found or no registered devices'
        });
      });

      it('POST /api/auth/authenticate/complete/:challengeId should handle invalid credentials', async () => {
        const response = await request(app)
          .post('/api/auth/authenticate/complete/invalid-challenge-id')
          .send({
            credential: {
              id: 'invalid-credential-id',
              rawId: 'invalid-raw-id',
              response: {
                clientDataJSON: 'invalid-client-data',
                authenticatorData: 'invalid-authenticator-data',
                signature: 'invalid-signature'
              },
              type: 'public-key'
            }
          })
          .expect(400);

        expect(response.body).toMatchObject({
          success: false,
          verified: false,
          error: expect.any(String)
        });
      });
    });

    describe('Protected Endpoints', () => {
      it('GET /api/auth/me should require authentication', async () => {
        const response = await request(app).get('/api/auth/me').expect(401);

        expect(response.body).toMatchObject({
          success: false,
          error: 'Missing or invalid authorization header'
        });
      });

      it('GET /api/auth/me should accept valid session token', async () => {
        // Create a mock session token for testing
        const mockToken = `session_${Date.now()}_${Math.random().toString(36).substr(2, 16)}`;

        const response = await request(app)
          .get('/api/auth/me')
          .set('Authorization', `Bearer ${mockToken}`)
          .expect(200);

        expect(response.body).toMatchObject({
          success: true,
          user: {
            id: expect.any(String),
            username: expect.any(String),
            displayName: expect.any(String),
            deviceCount: expect.any(Number)
          },
          session: {
            token: mockToken,
            authenticated: true
          }
        });
      });

      it('POST /api/auth/logout should logout user', async () => {
        const mockToken = `session_${Date.now()}_${Math.random().toString(36).substr(2, 16)}`;

        const response = await request(app)
          .post('/api/auth/logout')
          .set('Authorization', `Bearer ${mockToken}`)
          .expect(200);

        expect(response.body).toMatchObject({
          success: true,
          message: 'Logged out successfully'
        });
      });
    });
  });

  describe('Metrics Endpoint', () => {
    it('GET /api/metrics should require authentication', async () => {
      const response = await request(app).get('/api/metrics').expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Missing or invalid authorization header'
      });
    });

    it('GET /api/metrics should return JSON metrics with valid auth', async () => {
      const mockToken = `session_${Date.now()}_${Math.random().toString(36).substr(2, 16)}`;

      const response = await request(app)
        .get('/api/metrics')
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        metrics: {
          requests_total: expect.any(Number),
          requests_by_status: expect.any(Object),
          requests_by_group: expect.any(Object),
          processing_time_avg_ms: expect.any(Number),
          processing_time_p95_ms: expect.any(Number),
          storage_usage_bytes: expect.any(Number),
          assets_total: expect.any(Number),
          uptime_seconds: expect.any(Number),
          memory_usage_bytes: expect.any(Number)
        },
        meta: {
          query_time_ms: expect.any(Number),
          timestamp: expect.any(String)
        }
      });
    });

    it('GET /api/metrics?format=prometheus should return Prometheus format with auth', async () => {
      const mockToken = `session_${Date.now()}_${Math.random().toString(36).substr(2, 16)}`;

      const response = await request(app)
        .get('/api/metrics?format=prometheus')
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(200);

      expect(response.headers['content-type']).toMatch(/text\/plain/);
      expect(response.text).toContain('# HELP ai_photo_restoration_requests_total');
      expect(response.text).toContain('# TYPE ai_photo_restoration_requests_total counter');
      expect(response.text).toContain('ai_photo_restoration_requests_total');
    });
  });

  describe('Photo Ingestion API', () => {
    const mockToken = `session_${Date.now()}_${Math.random().toString(36).substr(2, 16)}`;

    it('POST /api/requests/ingest should require authentication', async () => {
      const testImage = await createTestImage({ width: 400, height: 300, format: 'jpeg' });
      const base64Image = `data:image/jpeg;base64,${testImage.toString('base64')}`;

      const requestData = {
        imageData: base64Image,
        facebookPostId: 'test-api-post-unauth',
        facebookGroupId: 'test-api-group-456',
        posterName: 'Test API User',
        postUrl: 'https://facebook.com/groups/test-api/posts/unauth',
        userRequest: 'Please restore this test photo',
        originalImageUrl: 'https://facebook.com/photo/test-api-unauth.jpg'
      };

      const response = await request(app)
        .post('/api/requests/ingest')
        .send(requestData)
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Missing or invalid authorization header'
      });
    });

    it('POST /api/requests/ingest should successfully ingest a photo with auth', async () => {
      // Generate test image
      const testImage = await createTestImage({ width: 400, height: 300, format: 'jpeg' });
      const base64Image = `data:image/jpeg;base64,${testImage.toString('base64')}`;

      const requestData = {
        imageData: base64Image,
        facebookPostId: 'test-api-post-123',
        facebookGroupId: 'test-api-group-456',
        posterName: 'Test API User',
        postUrl: 'https://facebook.com/groups/test-api/posts/123',
        userRequest: 'Please restore this test photo',
        originalImageUrl: 'https://facebook.com/photo/test-api-123.jpg'
      };

      const response = await request(app)
        .post('/api/requests/ingest')
        .set('Authorization', `Bearer ${mockToken}`)
        .send(requestData)
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        requestId: expect.any(String),
        assetId: expect.any(String),
        storageId: expect.stringMatching(/^[a-f0-9]{64}$/), // SHA-256 hash
        perceptualHash: expect.any(String)
      });

      // Verify database record was created
      const record = await RequestRecordModel.findOne({
        requestId: response.body.requestId
      });
      expect(record).toBeTruthy();
      expect(record?.facebookPostId).toBe('test-api-post-123');
      expect(record?.status).toBe('queued');
    });

    it('POST /api/requests/ingest should validate required fields', async () => {
      const invalidData = {
        imageData: 'data:image/jpeg;base64,invalid'
        // Missing required fields
      };

      const response = await request(app)
        .post('/api/requests/ingest')
        .set('Authorization', `Bearer ${mockToken}`)
        .send(invalidData)
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Validation failed'
      });
    });

    it('POST /api/requests/ingest should handle invalid image data', async () => {
      const requestData = {
        imageData: 'data:image/jpeg;base64,invalid-base64-data',
        facebookPostId: 'test-api-post-invalid',
        facebookGroupId: 'test-api-group-456',
        posterName: 'Test API User',
        postUrl: 'https://facebook.com/groups/test-api/posts/invalid',
        userRequest: 'Please restore this invalid photo',
        originalImageUrl: 'https://facebook.com/photo/test-api-invalid.jpg'
      };

      const response = await request(app)
        .post('/api/requests/ingest')
        .set('Authorization', `Bearer ${mockToken}`)
        .send(requestData)
        .expect(500);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Failed to ingest photo'
      });
    });
  });

  describe('Request Management API', () => {
    let testRequestId: string;
    const mockToken = `session_${Date.now()}_${Math.random().toString(36).substr(2, 16)}`;

    beforeEach(async () => {
      // Create a test request
      const testImage = await createTestImage({ width: 200, height: 200, format: 'jpeg' });
      const base64Image = `data:image/jpeg;base64,${testImage.toString('base64')}`;

      const response = await request(app)
        .post('/api/requests/ingest')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({
          imageData: base64Image,
          facebookPostId: 'test-api-get-123',
          facebookGroupId: 'test-api-group-456',
          posterName: 'Test Get User',
          postUrl: 'https://facebook.com/groups/test-api/posts/get-123',
          userRequest: 'Test request for GET endpoint',
          originalImageUrl: 'https://facebook.com/photo/test-api-get-123.jpg'
        });

      testRequestId = response.body.requestId;
    });

    it('GET /api/requests/:requestId should require authentication', async () => {
      const response = await request(app).get(`/api/requests/${testRequestId}`).expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Missing or invalid authorization header'
      });
    });

    it('GET /api/requests/:requestId should return specific request with auth', async () => {
      const response = await request(app)
        .get(`/api/requests/${testRequestId}`)
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        request: {
          requestId: testRequestId,
          facebookPostId: 'test-api-get-123',
          status: 'queued',
          assets: expect.any(Array)
        }
      });
    });

    it('GET /api/requests/:requestId should return 404 for non-existent request', async () => {
      const response = await request(app)
        .get('/api/requests/non-existent-id')
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Request not found'
      });
    });

    it('GET /api/requests should require authentication', async () => {
      const response = await request(app).get('/api/requests?limit=10&offset=0').expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Missing or invalid authorization header'
      });
    });

    it('GET /api/requests should list requests with pagination and auth', async () => {
      const response = await request(app)
        .get('/api/requests?limit=10&offset=0')
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.any(Array),
        pagination: {
          total: expect.any(Number),
          limit: 10,
          offset: 0,
          hasMore: expect.any(Boolean)
        }
      });

      // Should include our test request
      const requestIds = response.body.data.map((r: { requestId: string }) => r.requestId);
      expect(requestIds).toContain(testRequestId);
    });

    it('GET /api/requests should filter by status', async () => {
      const response = await request(app)
        .get('/api/requests?status=queued&limit=10')
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);

      // All returned requests should have 'queued' status
      response.body.data.forEach((request: { status: string }) => {
        expect(request.status).toBe('queued');
      });
    });

    it('GET /api/requests should filter by Facebook group', async () => {
      const response = await request(app)
        .get('/api/requests?facebookGroupId=test-api-group-456&limit=10')
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);

      // All returned requests should have the specified group ID
      response.body.data.forEach((request: { facebookGroupId: string }) => {
        expect(request.facebookGroupId).toBe('test-api-group-456');
      });
    });

    it('GET /api/requests should support sorting', async () => {
      const response = await request(app)
        .get('/api/requests?sortBy=createdAt&sortOrder=desc&limit=10')
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify sorting (newest first)
      const dates = response.body.data.map((r: { createdAt: string }) => new Date(r.createdAt));
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i - 1].getTime()).toBeGreaterThanOrEqual(dates[i].getTime());
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 for unknown endpoints', async () => {
      const response = await request(app).get('/api/unknown-endpoint').expect(404);

      // Express default 404 handling
      expect(response.status).toBe(404);
    });

    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/requests/ingest')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }')
        .expect(400);

      // Express should handle malformed JSON
      expect(response.status).toBe(400);
    });

    it('should handle request size limits', async () => {
      // Create a very large payload (larger than 10MB limit)
      const largeData = 'x'.repeat(11 * 1024 * 1024); // 11MB

      const response = await request(app)
        .post('/api/requests/ingest')
        .send({ largeField: largeData })
        .expect(413);

      expect(response.status).toBe(413); // Payload Too Large
    });
  });

  describe('Security Headers', () => {
    it('should include security headers', async () => {
      const response = await request(app).get('/api').expect(200);

      // Check for Helmet security headers
      expect(response.headers).toHaveProperty('x-content-type-options');
      expect(response.headers).toHaveProperty('x-frame-options');
      expect(response.headers).toHaveProperty('x-xss-protection');
    });

    it('should handle CORS properly', async () => {
      const response = await request(app)
        .options('/api/requests')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'POST')
        .expect(204);

      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(response.headers['access-control-allow-methods']).toContain('POST');
    });
  });

  describe('Rate Limiting', () => {
    it('should apply rate limiting to API endpoints', async () => {
      // Make multiple rapid requests to test rate limiting
      const requests = Array(10)
        .fill(null)
        .map(() => request(app).get('/api').expect(200));

      const responses = await Promise.all(requests);

      // All should succeed initially (within rate limit)
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // Check for rate limit headers
      const lastResponse = responses[responses.length - 1];
      expect(lastResponse.headers).toHaveProperty('x-ratelimit-limit');
      expect(lastResponse.headers).toHaveProperty('x-ratelimit-remaining');
    });
  });
});
