import { Queue, QueueEvents, Worker, type Job, type JobsOptions } from 'bullmq';
import IORedis from 'ioredis';
import type { Redis } from 'ioredis';

import { env } from '../config/index.js';
import { logger } from '../lib/logger.js';
import type { C2PAManifest } from '../metadata/index.js';
import { RequestRecordModel } from '../models/index.js';
import { processClassificationJob, type ClassificationResult } from '../workers/classification.js';

export interface ClassificationJobData {
  requestId: string;
  assetIds?: string[];
  priority?: 'high' | 'normal' | 'low';
}

export interface RestorationJobData {
  requestId: string;
  assetId: string;
  aiModel: string;
  priority?: 'high' | 'normal' | 'low';
}

export interface DeadLetterJobData {
  queue: string;
  failedReason: string;
  failedAt: string;
  data: unknown;
}

export interface QueueMetricSnapshot {
  classification: Record<string, number>;
  restoration: Record<string, number>;
  deadLetter: Record<string, number>;
}

const queueNames = {
  classification: `${env.QUEUE_PREFIX}:classification`,
  restoration: `${env.QUEUE_PREFIX}:restoration`,
  deadLetter: `${env.QUEUE_PREFIX}:dead-letter`
};

let redisConnection: Redis | null = null;
let classificationQueue: Queue<ClassificationJobData> | null = null;
let restorationQueue: Queue<RestorationJobData> | null = null;
let deadLetterQueue: Queue<DeadLetterJobData> | null = null;
let classificationWorker: Worker<ClassificationJobData> | null = null;
let restorationWorker: Worker<RestorationJobData> | null = null;
let classificationEvents: QueueEvents | null = null;
let restorationEvents: QueueEvents | null = null;
let initialized = false;

function createJobOptions(jobId: string, overrides: Partial<JobsOptions> = {}): JobsOptions {
  return {
    jobId,
    attempts: env.QUEUE_MAX_ATTEMPTS,
    backoff: {
      type: 'exponential',
      delay: env.QUEUE_BACKOFF_BASE_DELAY_MS
    },
    removeOnComplete: {
      age: 60 * 60, // 1 hour
      count: 1000
    },
    removeOnFail: false,
    ...overrides
  };
}

async function getRedisConnection(): Promise<Redis> {
  if (!redisConnection) {
    if (env.isTest) {
      const { default: IORedisMock } = await import('ioredis-mock');
      redisConnection = new (IORedisMock as unknown as new (
        url: string,
        options: Record<string, unknown>
      ) => Redis)(env.REDIS_URL, {
        maxRetriesPerRequest: null
      });
    } else {
      redisConnection = new (IORedis as unknown as new (
        url: string,
        options: Record<string, unknown>
      ) => Redis)(env.REDIS_URL, {
        maxRetriesPerRequest: null
      });
    }
  }

  return redisConnection;
}

async function ensureQueues(): Promise<void> {
  if (classificationQueue && restorationQueue && deadLetterQueue) {
    return;
  }

  const connection = await getRedisConnection();

  if (!classificationQueue) {
    classificationQueue = new Queue<ClassificationJobData>(queueNames.classification, {
      connection,
      defaultJobOptions: {
        attempts: env.QUEUE_MAX_ATTEMPTS,
        backoff: {
          type: 'exponential',
          delay: env.QUEUE_BACKOFF_BASE_DELAY_MS
        },
        removeOnComplete: {
          age: 60 * 60,
          count: 1000
        },
        removeOnFail: false
      }
    });
  }

  if (!restorationQueue) {
    restorationQueue = new Queue<RestorationJobData>(queueNames.restoration, {
      connection,
      defaultJobOptions: {
        attempts: env.QUEUE_MAX_ATTEMPTS,
        backoff: {
          type: 'exponential',
          delay: env.QUEUE_BACKOFF_BASE_DELAY_MS
        },
        removeOnComplete: {
          age: 60 * 60,
          count: 1000
        },
        removeOnFail: false
      }
    });
  }

  if (!deadLetterQueue) {
    deadLetterQueue = new Queue<DeadLetterJobData>(queueNames.deadLetter, {
      connection,
      defaultJobOptions: {
        removeOnFail: false,
        removeOnComplete: false
      }
    });
  }
}

function calculatePriority(priority: 'high' | 'normal' | 'low' | undefined): number {
  switch (priority) {
    case 'high':
      return 1;
    case 'low':
      return 10;
    default:
      return 5;
  }
}

async function classificationProcessor(
  job: Job<ClassificationJobData>
): Promise<{ status: string; classification: ClassificationResult; queuedRestoration: boolean }> {
  logger.info({ jobId: job.id, requestId: job.data.requestId }, 'Processing classification job');

  // Use the dedicated classification worker
  const classification = await processClassificationJob(job);

  // Fetch the updated request
  const request = await RequestRecordModel.findOne({ requestId: job.data.requestId });
  if (!request) {
    throw new Error(`Request ${job.data.requestId} not found`);
  }

  // Automatically enqueue restoration for classified requests
  // Skip if flagged for human triage
  let queuedRestoration = false;

  if (!classification.requiresHumanReview && request.assets.length > 0) {
    const assetId = request.assets[0]?.assetId;

    if (assetId) {
      // Determine AI model based on routing decision
      const aiModel =
        classification.routingDecision === 'cloud' ? 'gemini-2.5-flash-image' : 'local-pipeline';

      await enqueueRestorationJob({
        requestId: request.requestId,
        assetId,
        aiModel,
        priority: classification.confidence > 0.8 ? 'high' : 'normal'
      });

      queuedRestoration = true;

      logger.info(
        {
          requestId: request.requestId,
          assetId,
          aiModel,
          routingDecision: classification.routingDecision
        },
        'Restoration job enqueued'
      );
    }
  } else if (classification.requiresHumanReview) {
    // Update status to awaiting review
    request.status = 'pending_review';
    await request.save();

    logger.info(
      {
        requestId: request.requestId,
        reason: 'low_confidence_or_triage'
      },
      'Request flagged for human review'
    );
  }

  return { status: 'classified', classification, queuedRestoration };
}

async function restorationProcessor(
  job: Job<RestorationJobData>
): Promise<{ status: string; c2pa?: C2PAManifest | null }> {
  logger.info(
    { jobId: job.id, requestId: job.data.requestId, assetId: job.data.assetId },
    'Processing restoration job'
  );

  const request = await RequestRecordModel.findOne({ requestId: job.data.requestId });
  if (!request) {
    throw new Error(`Request ${job.data.requestId} not found`);
  }

  request.status = 'completed';
  request.processedAt = new Date();
  await request.save();

  await job.updateProgress(100);

  return { status: 'completed', c2pa: null };
}

async function handleFailedJob(
  queueLabel: 'classification' | 'restoration',
  job: Job | undefined,
  error: Error
): Promise<void> {
  if (!job || !deadLetterQueue) {
    return;
  }

  const attempts = job.opts.attempts ?? env.QUEUE_MAX_ATTEMPTS;
  if (job.attemptsMade < attempts) {
    return;
  }

  logger.warn(
    {
      queue: queueLabel,
      jobId: job.id,
      attemptsMade: job.attemptsMade,
      reason: error.message
    },
    'Job moved to dead letter queue'
  );

  await deadLetterQueue.add(
    `${queueLabel}:${job.id}`,
    {
      queue: queueLabel,
      failedReason: error.message,
      failedAt: new Date().toISOString(),
      data: job.data
    },
    {
      removeOnComplete: false,
      removeOnFail: false
    }
  );
}

export async function initializeQueues(): Promise<void> {
  if (initialized) {
    return;
  }

  await ensureQueues();

  classificationEvents = new QueueEvents(queueNames.classification, {
    connection: await getRedisConnection()
  });
  restorationEvents = new QueueEvents(queueNames.restoration, {
    connection: await getRedisConnection()
  });

  classificationEvents.on('failed', async ({ jobId, failedReason }) => {
    const job = await classificationQueue?.getJob(jobId ?? '');
    if (job && failedReason) {
      await handleFailedJob('classification', job, new Error(failedReason));
    }
  });

  restorationEvents.on('failed', async ({ jobId, failedReason }) => {
    const job = await restorationQueue?.getJob(jobId ?? '');
    if (job && failedReason) {
      await handleFailedJob('restoration', job, new Error(failedReason));
    }
  });

  classificationWorker = new Worker(queueNames.classification, classificationProcessor, {
    connection: await getRedisConnection(),
    concurrency: env.QUEUE_CLASSIFICATION_CONCURRENCY
  });

  restorationWorker = new Worker(queueNames.restoration, restorationProcessor, {
    connection: await getRedisConnection(),
    concurrency: env.QUEUE_RESTORATION_CONCURRENCY
  });

  classificationWorker.on('failed', async (job, err) => {
    await handleFailedJob('classification', job, err);
  });

  restorationWorker.on('failed', async (job, err) => {
    await handleFailedJob('restoration', job, err);
  });

  initialized = true;
  logger.info('BullMQ queues initialized');
}

export async function shutdownQueues(): Promise<void> {
  const tasks: Array<Promise<unknown>> = [];

  if (classificationWorker) {
    tasks.push(classificationWorker.close());
    classificationWorker = null;
  }

  if (restorationWorker) {
    tasks.push(restorationWorker.close());
    restorationWorker = null;
  }

  if (classificationEvents) {
    tasks.push(classificationEvents.close());
    classificationEvents = null;
  }

  if (restorationEvents) {
    tasks.push(restorationEvents.close());
    restorationEvents = null;
  }

  if (classificationQueue) {
    tasks.push(classificationQueue.close());
    classificationQueue = null;
  }

  if (restorationQueue) {
    tasks.push(restorationQueue.close());
    restorationQueue = null;
  }

  if (deadLetterQueue) {
    tasks.push(deadLetterQueue.close());
    deadLetterQueue = null;
  }

  await Promise.all(tasks);

  if (redisConnection) {
    await redisConnection.quit();
    redisConnection = null;
  }

  initialized = false;
  logger.info('BullMQ queues shut down');
}

export async function enqueueClassificationJob(data: ClassificationJobData): Promise<void> {
  await initializeQueues();

  if (!classificationQueue) {
    throw new Error('Classification queue not initialized');
  }

  const priority = calculatePriority(data.priority);
  await classificationQueue.add('classify', data, createJobOptions(data.requestId, { priority }));
}

export async function enqueueRestorationJob(data: RestorationJobData): Promise<void> {
  await initializeQueues();

  if (!restorationQueue) {
    throw new Error('Restoration queue not initialized');
  }

  const jobId = `${data.requestId}:${data.assetId}`;
  const priority = calculatePriority(data.priority);

  await restorationQueue.add('restore', data, createJobOptions(jobId, { priority }));
}

export async function getQueueMetrics(): Promise<QueueMetricSnapshot> {
  await initializeQueues();

  const [classificationCounts, restorationCounts, deadLetterCounts] = await Promise.all([
    classificationQueue!.getJobCounts(
      'waiting',
      'active',
      'completed',
      'failed',
      'delayed',
      'paused'
    ),
    restorationQueue!.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed', 'paused'),
    deadLetterQueue!.getJobCounts('waiting', 'active', 'completed', 'failed')
  ]);

  return {
    classification: classificationCounts,
    restoration: restorationCounts,
    deadLetter: deadLetterCounts
  };
}

export function getQueueAdapters() {
  if (!classificationQueue || !restorationQueue || !deadLetterQueue) {
    throw new Error('Queues not initialized');
  }

  return {
    classificationQueue,
    restorationQueue,
    deadLetterQueue
  };
}

export async function pingQueue(): Promise<boolean> {
  try {
    const connection = await getRedisConnection();
    await connection.ping();
    return true;
  } catch (error) {
    logger.warn({ error }, 'Queue ping failed');
    return false;
  }
}
