import { env } from './config/index.js';
import {
  connectDatabase,
  initializeModels,
  validateModels,
  checkDatabaseHealth
} from './database/index.js';
import { logger } from './lib/logger.js';

export async function bootstrap(): Promise<void> {
  logger.info({ env: env.NODE_ENV, port: env.PORT }, 'Bootstrapping Face Restore AI service');

  try {
    // Establish database connection
    await connectDatabase();
    logger.info('MongoDB connection established');

    // Verify database health
    const isHealthy = await checkDatabaseHealth();
    if (!isHealthy) {
      throw new Error('Database health check failed');
    }

    // Initialize models and create indexes
    await initializeModels();
    logger.info('Database models initialized');

    // Validate model schemas
    const isValid = await validateModels();
    if (!isValid) {
      throw new Error('Model validation failed');
    }

    logger.info('Face Restore AI service bootstrap completed successfully');
  } catch (error) {
    logger.error({ error }, 'Bootstrap failed');
    throw error;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  bootstrap().catch(error => {
    logger.error(error, 'Fatal error during bootstrap');
    process.exitCode = 1;
  });
}
