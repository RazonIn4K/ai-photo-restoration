import { beforeAll } from 'vitest';

// Set up test environment variables before all tests
beforeAll(() => {
  // Set required environment variables for tests
  process.env.NODE_ENV = 'test';
  process.env.PORT = '4000';
  process.env.LOG_LEVEL = 'silent'; // Disable logs during tests
  process.env.MONGO_URI = 'mongodb://localhost:27017/test';
  process.env.MONGO_DISABLE_CSFLE = 'true'; // Disable encryption for tests
  process.env.REDIS_URL = 'redis://localhost:6379';
  process.env.METRICS_PORT = '9464';
});
