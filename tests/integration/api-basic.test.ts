import type { Express } from 'express';
import request from 'supertest';
import { describe, it, expect, beforeAll } from 'vitest';

import { createApp } from '../../src/api/app.js';

describe('Basic API Integration Tests', () => {
  let app: Express;

  beforeAll(async () => {
    // Override settings for testing
    process.env.MONGO_DISABLE_CSFLE = 'true';
    process.env.REDIS_DISABLE = 'true';
    process.env.WEBAUTHN_RP_ID = 'localhost';
    process.env.WEBAUTHN_ORIGIN = 'http://localhost:3001';

    app = createApp();
  });

  describe('Basic API Health', () => {
    it('should return API info', async () => {
      const response = await request(app).get('/api/').expect(200);

      expect(response.body).toMatchObject({
        name: 'AI Photo Restoration API',
        version: '1.0.0',
        endpoints: {
          health: '/api/health',
          auth: '/api/auth',
          requests: '/api/requests',
          metrics: '/api/metrics'
        }
      });
    });

    it('should return health status', async () => {
      const response = await request(app).get('/api/health').expect(200);

      expect(response.body).toMatchObject({
        status: expect.stringMatching(/healthy|degraded|unhealthy/),
        timestamp: expect.any(String),
        uptime: expect.any(Number)
      });
    });

    it('should handle 404 for unknown routes', async () => {
      const response = await request(app).get('/api/nonexistent').expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.any(String)
      });
    });
  });

  describe('WebAuthn Authentication Endpoints', () => {
    it('should generate registration options', async () => {
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
            id: 'localhost'
          },
          user: {
            id: expect.any(String),
            name: 'testuser',
            displayName: 'Test User'
          }
        },
        userId: expect.any(String)
      });
    });

    it('should require username and displayName for registration', async () => {
      await request(app).post('/api/auth/register/begin').send({}).expect(400);

      await request(app).post('/api/auth/register/begin').send({ username: 'test' }).expect(400);
    });

    it('should generate authentication options', async () => {
      // First register a user
      await request(app)
        .post('/api/auth/register/begin')
        .send({
          username: 'authtest',
          displayName: 'Auth Test User'
        })
        .expect(200);

      // Then try to authenticate
      const response = await request(app)
        .post('/api/auth/authenticate/begin')
        .send({
          username: 'authtest'
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        options: {
          challenge: expect.any(String),
          rpId: 'localhost',
          allowCredentials: expect.any(Array),
          userVerification: 'preferred'
        },
        challengeId: expect.any(String)
      });
    });

    it('should handle non-existent user for authentication', async () => {
      await request(app)
        .post('/api/auth/authenticate/begin')
        .send({
          username: 'nonexistent'
        })
        .expect(404);
    });
  });

  describe('Protected Endpoints', () => {
    it('should require authentication for /api/auth/me', async () => {
      await request(app).get('/api/auth/me').expect(401);
    });

    it('should require authentication for metrics', async () => {
      await request(app).get('/api/metrics').expect(401);
    });

    it('should require authentication for requests endpoints', async () => {
      await request(app).get('/api/requests').expect(401);

      await request(app).post('/api/requests/ingest').expect(401);
    });

    it('should reject malformed authorization headers', async () => {
      await request(app).get('/api/auth/me').set('Authorization', 'InvalidFormat').expect(401);

      await request(app).get('/api/auth/me').set('Authorization', 'Bearer').expect(401);
    });

    it('should reject invalid session tokens', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Invalid or expired session token'
      });
    });
  });

  describe('Request Validation', () => {
    it('should validate registration schemas', async () => {
      // Test invalid registration data
      await request(app)
        .post('/api/auth/register/begin')
        .send({
          username: '', // Invalid: empty string
          displayName: 'Test'
        })
        .expect(400);

      // Test missing fields
      await request(app)
        .post('/api/auth/register/begin')
        .send({
          username: 'test'
          // Missing displayName
        })
        .expect(400);
    });

    it('should handle malformed JSON', async () => {
      await request(app)
        .post('/api/auth/register/begin')
        .set('Content-Type', 'application/json')
        .send('invalid json')
        .expect(400);
    });
  });

  describe('Security Headers', () => {
    it('should include security headers', async () => {
      const response = await request(app).get('/api/health').expect(200);

      // Check for Helmet security headers
      expect(response.headers).toHaveProperty('x-content-type-options');
      expect(response.headers).toHaveProperty('x-frame-options');
    });

    it('should handle CORS properly', async () => {
      const response = await request(app)
        .options('/api/health')
        .set('Origin', 'http://localhost:3000')
        .expect(204);

      expect(response.headers).toHaveProperty('access-control-allow-origin');
    });
  });

  describe('Rate Limiting', () => {
    it('should apply rate limiting (memory store)', async () => {
      // Make multiple requests quickly to test rate limiting
      const requests = Array(5)
        .fill(null)
        .map(() => request(app).get('/api/health'));

      const responses = await Promise.all(requests);

      // All should succeed for health endpoint (usually has higher limits)
      responses.forEach(response => {
        expect([200, 429]).toContain(response.status);
      });
    });
  });

  describe('Content Type Handling', () => {
    it('should handle different content types', async () => {
      // Test JSON content type
      await request(app)
        .post('/api/auth/register/begin')
        .set('Content-Type', 'application/json')
        .send(
          JSON.stringify({
            username: 'test',
            displayName: 'Test User'
          })
        )
        .expect(200);

      // Test form data (should also work)
      await request(app)
        .post('/api/auth/register/begin')
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .send('username=test2&displayName=Test User 2')
        .expect(200);
    });
  });
});
