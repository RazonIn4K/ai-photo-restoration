import request from 'supertest';
import { describe, it, beforeAll, expect } from 'vitest';

import { seedMockData } from '../../scripts/seed-mock-data.js';

let app: import('express').Express;

describe('Mock dashboard API', () => {
  beforeAll(async () => {
    process.env.USE_MOCK_DASHBOARD = 'true';
    await seedMockData();
    const appModule = await import('../../src/api/app.js');
    app = appModule.createApp();
  });

  it('returns seeded mock requests', async () => {
    const response = await request(app).get('/api/requests');
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.requests)).toBe(true);
    expect(response.body.requests[0]).toHaveProperty('requestId');
  });
});
