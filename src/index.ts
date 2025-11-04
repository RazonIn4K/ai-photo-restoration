import { env } from './config/index.js';
import { connectDatabase } from './database/index.js';
import { logger } from './lib/logger.js';

export async function bootstrap(): Promise<void> {
  logger.info({ env: env.NODE_ENV, port: env.PORT }, 'Bootstrapping Face Restore AI service');

  await connectDatabase();
  logger.info('MongoDB connection established (bootstrap placeholder).');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  bootstrap().catch(error => {
    logger.error(error, 'Fatal error during bootstrap');
    process.exitCode = 1;
  });
}
