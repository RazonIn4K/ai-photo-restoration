export { env } from './env.js';
export type { AppEnvironment } from './env.js';

// Export commonly used config values
export const useMockDashboard = () => env.USE_MOCK_DASHBOARD;
