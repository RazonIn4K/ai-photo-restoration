import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    env: {
      NODE_ENV: 'test',
      PORT: '4000',
      LOG_LEVEL: 'silent',
      MONGO_URI: 'mongodb://localhost:27017/test',
      MONGO_DISABLE_CSFLE: 'true',
      REDIS_URL: 'redis://localhost:6379',
      METRICS_PORT: '9464',
      // Test master key (96 bytes base64-encoded)
      MONGO_LOCAL_MASTER_KEY_BASE64:
        'kZDK6w8jm4uUDt1Hm7tWKwH9KZrDP/NRZoTsFwzoxh+POm3TjFZmmbTUgDgraTvvglKu7y+VOehDP1v0gRZ9A2RiDCPlkCSyidN6RI9ux2w6yCeYCQk6cMgM2oRw1brv',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.config.ts',
        '**/*.d.ts',
        'tests/**',
      ],
    },
    // Include TypeScript files
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
  },
});
