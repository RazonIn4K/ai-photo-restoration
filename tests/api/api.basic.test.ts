import type { Express } from 'express';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

import { createApp } from '../../src/api/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/database/index.js';

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

describe('Basic API Tests', () => {
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

  describe('Health Endpoints', () => {
    it('GET /health should return basic health status', async () => {
      const response = await request(app).get('/health').expect(200);

      expect(response.body).toMatchObject({
        status: 'ok',
        timestamp: expect.any(String)
      });
    });

    it('GET /api should return API information', async () => {
      const response = await request(app).get('/api').expect(200);

      expect(response.body).toMatchObject({
        name: 'AI Photo Restoration API',
        version: '1.0.0',
        endpoints: expect.any(Object)
      });
    });
  });

  describe('Metrics Endpoint', () => {
    it('GET /api/metrics should return JSON metrics', async () => {
      const mockToken = `session_${Date.now()}_${Math.random().toString(36).substr(2, 16)}`;

      const response = await request(app)
        .get('/api/metrics')
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        metrics: expect.any(Object),
        meta: expect.any(Object)
      });
    });
  });
});
