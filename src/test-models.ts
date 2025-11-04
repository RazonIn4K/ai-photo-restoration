#!/usr/bin/env tsx

/**
 * Simple test script to validate our database models
 * Run with: npx tsx src/test-models.ts
 */

import { connectDatabase, validateModels, initializeModels } from './database/index.js';
import { logger } from './lib/logger.js';

async function testModels() {
  logger.info('Starting model validation test...');

  try {
    // Override CSFLE for testing
    process.env.MONGO_DISABLE_CSFLE = 'true';

    // Connect to database
    logger.info('Connecting to database...');
    await connectDatabase();
    logger.info('✅ Database connection successful');

    // Initialize models
    logger.info('Initializing models...');
    await initializeModels();
    logger.info('✅ Models initialized successfully');

    // Validate models
    logger.info('Validating model schemas...');
    const isValid = await validateModels();

    if (isValid) {
      logger.info('✅ All models validated successfully');
      logger.info('🎉 Task 2.3 implementation is working correctly!');
      process.exitCode = 0;
      return;
    }

    logger.error('❌ Model validation failed');
    process.exitCode = 1;
  } catch (error) {
    logger.error({ error }, '❌ Test failed');
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void testModels();
}
