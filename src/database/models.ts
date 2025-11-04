import { connectDatabase } from './connection.js';
import { logger } from '../lib/logger.js';
import {
  ActionLogModel,
  RequestRecordModel,
  ConsentRecordModel,
  ConfigModel,
  GroupConfigModel
} from '../models/index.js';

/**
 * Initialize all database models and create indexes
 */
export async function initializeModels(): Promise<void> {
  logger.info('Initializing database models and indexes...');

  try {
    // Ensure database connection is established
    await connectDatabase();

    // Create indexes for all models
    await Promise.all([
      ActionLogModel.createIndexes(),
      RequestRecordModel.createIndexes(),
      ConsentRecordModel.createIndexes(),
      ConfigModel.createIndexes(),
      GroupConfigModel.createIndexes()
    ]);

    logger.info('Database models and indexes initialized successfully');
  } catch (error) {
    logger.error({ error }, 'Failed to initialize database models');
    throw error;
  }
}

/**
 * Validate database schema and model integrity
 */
export async function validateModels(): Promise<boolean> {
  logger.info('Validating database models...');

  try {
    // Test basic operations on each model
    const validationTests = [
      // Test ActionLog model
      async () => {
        const testLog = new ActionLogModel({
          requestId: 'test-request-id',
          action: 'ingested',
          timestamp: new Date(),
          metadata: { test: true }
        });
        await testLog.validate();
        return 'ActionLog';
      },

      // Test RequestRecord model
      async () => {
        const testRequest = new RequestRecordModel({
          facebookPostId: 'test-post-id',
          facebookGroupId: 'test-group-id',
          posterName: 'Test User',
          postUrl: 'https://facebook.com/test',
          userRequest: 'Please restore this photo',
          assets: [
            {
              originalImageUrl: 'https://example.com/image.jpg',
              originalImageHash: 'abc123',
              originalImagePath: '/path/to/image.jpg',
              perceptualHash: 'def456'
            }
          ]
        });
        await testRequest.validate();
        return 'RequestRecord';
      },

      // Test ConsentRecord model
      async () => {
        const testConsent = new ConsentRecordModel({
          facebookUserId: 'test-user-id',
          consentStatus: 'opted_in',
          consentMethod: 'explicit'
        });
        await testConsent.validate();
        return 'ConsentRecord';
      },

      // Test Config model
      async () => {
        const testConfig = new ConfigModel({
          configKey: 'test-key',
          configValue: 'test-value'
        });
        await testConfig.validate();
        return 'Config';
      },

      // Test GroupConfig model
      async () => {
        const testGroupConfig = new GroupConfigModel({
          groupId: 'test-group-id',
          selectors: {
            version: '1.0.0',
            selectors: { postSelector: '.post' },
            lastUpdated: new Date(),
            isActive: true
          },
          keywords: ['restore', 'colorize'],
          lastScanTimestamp: new Date(),
          extractionMethod: 'playwright',
          canarySchedule: '0 */6 * * *'
        });
        await testGroupConfig.validate();
        return 'GroupConfig';
      }
    ];

    const results = await Promise.allSettled(validationTests.map(test => test()));

    const failed = results.filter(result => result.status === 'rejected');
    if (failed.length > 0) {
      logger.error(
        {
          failedModels: failed.map(
            (_, index) =>
              ['ActionLog', 'RequestRecord', 'ConsentRecord', 'Config', 'GroupConfig'][index]
          )
        },
        'Model validation failed'
      );
      return false;
    }

    logger.info('All database models validated successfully');
    return true;
  } catch (error) {
    logger.error({ error }, 'Model validation failed');
    return false;
  }
}

/**
 * Get database statistics and health information
 */
export async function getDatabaseStats(): Promise<{
  collections: Record<string, { count: number; indexes: number }>;
  totalSize: number;
}> {
  const conn = await connectDatabase();
  const db = conn.connection.db;

  if (!db) {
    throw new Error('Database connection not available');
  }

  const collections = ['actionlogs', 'requests', 'consents', 'configs', 'groupconfigs'];
  const stats: Record<string, { count: number; indexes: number }> = {};

  for (const collectionName of collections) {
    try {
      const collection = db.collection(collectionName);
      const count = await collection.countDocuments();
      const indexes = await collection.indexes();

      stats[collectionName] = {
        count,
        indexes: indexes.length
      };
    } catch (error) {
      logger.warn({ collection: collectionName, error }, 'Failed to get collection stats');
      stats[collectionName] = { count: 0, indexes: 0 };
    }
  }

  // Get database size
  const dbStats = await db.stats();

  return {
    collections: stats,
    totalSize: dbStats.dataSize || 0
  };
}

// Export models for convenience
export {
  ActionLogModel,
  RequestRecordModel,
  ConsentRecordModel,
  ConfigModel,
  GroupConfigModel
} from '../models/index.js';
