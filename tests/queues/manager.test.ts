/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('bullmq', () => {
  class MockQueue {
    static instances = new Map<string, MockQueue>();
    public jobs = new Map<string, any>();
    constructor(
      public name: string,
      public opts: any
    ) {
      MockQueue.instances.set(name, this);
    }
    async add(name: string, data: unknown, options: any = {}) {
      const jobId = options.jobId ?? `${Date.now()}`;
      if (!this.jobs.has(jobId)) {
        const job = {
          id: jobId,
          name,
          data,
          opts: { ...this.opts?.defaultJobOptions, ...options },
          attemptsMade: 0,
          updateProgress: async () => {}
        };
        this.jobs.set(jobId, job);
      }
      return this.jobs.get(jobId);
    }
    async getJob(jobId: string) {
      return this.jobs.get(jobId);
    }
    async getJobCounts(...states: string[]) {
      const counts: Record<string, number> = {};
      for (const state of states) {
        counts[state] = state === 'waiting' ? this.jobs.size : 0;
      }
      return counts;
    }
    async close() {
      return;
    }
  }

  class MockWorker {
    static instances = new Map<string, MockWorker>();
    private handlers = new Map<string, (job: any, error: Error) => Promise<void> | void>();
    constructor(
      public name: string,
      public processor: (job: any) => unknown
    ) {
      MockWorker.instances.set(name, this);
    }
    on(event: string, handler: (job: any, error: Error) => Promise<void> | void) {
      this.handlers.set(event, handler);
    }
    async close() {
      return;
    }
    async trigger(event: string, job: any, error: Error) {
      const handler = this.handlers.get(event);
      if (handler) {
        await handler(job, error);
      }
    }
  }

  class MockQueueScheduler {
    constructor() {}
    async waitUntilReady() {
      return;
    }
    async close() {
      return;
    }
  }

  class MockQueueEvents {
    static instances = new Map<string, MockQueueEvents>();
    private handlers = new Map<string, (payload: any) => Promise<void> | void>();
    constructor(public name: string) {
      MockQueueEvents.instances.set(name, this);
    }
    on(event: string, handler: (payload: any) => Promise<void> | void) {
      this.handlers.set(event, handler);
    }
    async close() {
      return;
    }
    async trigger(event: string, payload: any) {
      const handler = this.handlers.get(event);
      if (handler) {
        await handler(payload);
      }
    }
  }

  return {
    Queue: MockQueue,
    Worker: MockWorker,
    QueueScheduler: MockQueueScheduler,
    QueueEvents: MockQueueEvents
  };
});

vi.mock('ioredis', () => {
  class MockRedis {
    constructor() {}
    async ping() {
      return 'PONG';
    }
    async quit() {
      return;
    }
  }
  return {
    default: MockRedis
  };
});

import {
  enqueueClassificationJob,
  enqueueRestorationJob,
  getQueueMetrics,
  initializeQueues,
  shutdownQueues
} from '../../src/queues/manager.js';

describe('queue manager', () => {
  beforeEach(async () => {
    await shutdownQueues();
  });

  it('enqueues classification jobs with deduplication and retry options', async () => {
    await enqueueClassificationJob({ requestId: 'req-1' });
    await enqueueClassificationJob({ requestId: 'req-1' });

    const metrics = await getQueueMetrics();
    expect(metrics.classification.waiting).toBe(1);
  });

  it('moves failed jobs to dead letter queue after max attempts', async () => {
    await initializeQueues();
    await enqueueClassificationJob({ requestId: 'req-2' });

    const managerModule = await import('../../src/queues/manager.js');
    const { getQueueAdapters } = managerModule as { getQueueAdapters: () => any };
    const { classificationQueue, deadLetterQueue } = getQueueAdapters();

    const job = await classificationQueue.getJob('req-2');
    job.attemptsMade = job.opts.attempts;

    const { Worker } = await import('bullmq');
    const workerInstance = (Worker as any).instances.get(classificationQueue.name);
    await workerInstance.trigger('failed', job, new Error('test failure'));

    const deadLetterCounts = await deadLetterQueue.getJobCounts('waiting');
    expect(deadLetterCounts.waiting).toBe(1);
  });

  it('enqueues restoration jobs with composed job id', async () => {
    await enqueueRestorationJob({ requestId: 'req-3', assetId: 'asset-1', aiModel: 'model-x' });
    await enqueueRestorationJob({ requestId: 'req-3', assetId: 'asset-1', aiModel: 'model-x' });

    const metrics = await getQueueMetrics();
    expect(metrics.restoration.waiting).toBe(1);
  });
});
/* eslint-disable @typescript-eslint/no-explicit-any */
