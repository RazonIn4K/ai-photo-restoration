import type { Request, Response } from 'express';

import { logger } from '../../lib/logger.js';
import { RequestRecordModel } from '../../models/index.js';
import { getQueueMetrics, type QueueMetricSnapshot, pingQueue } from '../../queues/manager.js';

/**
 * Metrics data structure for Prometheus
 */
interface MetricsData {
  // Request metrics
  requests_total: number;
  requests_by_status: Record<string, number>;
  requests_by_group: Record<string, number>;

  // Processing metrics
  processing_time_avg_ms: number;
  processing_time_p95_ms: number;

  // Storage metrics
  storage_usage_bytes: number;
  assets_total: number;

  // System metrics
  uptime_seconds: number;
  memory_usage_bytes: number;

  // Queue metrics
  queues: QueueMetricSnapshot;
}

/**
 * Handler for GET /api/metrics
 * Returns Prometheus-compatible metrics
 */
export async function metricsHandler(req: Request, res: Response): Promise<void> {
  try {
    const startTime = Date.now();

    // Gather metrics from database
    const emptyCounts = {
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
      paused: 0
    };

    let queueMetrics: QueueMetricSnapshot = {
      classification: { ...emptyCounts },
      restoration: { ...emptyCounts },
      deadLetter: { waiting: 0, active: 0, completed: 0, failed: 0 }
    };

    const [totalRequests, statusCounts, groupCounts, processingTimes, assetCounts] =
      await Promise.all([
        // Total requests
        RequestRecordModel.countDocuments(),

        // Requests by status
        RequestRecordModel.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),

        // Requests by Facebook group
        RequestRecordModel.aggregate([{ $group: { _id: '$facebookGroupId', count: { $sum: 1 } } }]),

        // Processing time statistics
        RequestRecordModel.aggregate([
          {
            $match: {
              processedAt: { $exists: true },
              queuedAt: { $exists: true }
            }
          },
          {
            $project: {
              processingTime: {
                $subtract: ['$processedAt', '$queuedAt']
              }
            }
          },
          {
            $group: {
              _id: null,
              avgTime: { $avg: '$processingTime' },
              times: { $push: '$processingTime' }
            }
          }
        ]),

        // Asset counts
        RequestRecordModel.aggregate([
          { $unwind: '$assets' },
          { $group: { _id: null, totalAssets: { $sum: 1 } } }
        ])
      ]);

    try {
      queueMetrics = await getQueueMetrics();
    } catch (queueError) {
      logger.warn({ queueError }, 'Failed to collect queue metrics');
    }

    // Process status counts
    const requestsByStatus: Record<string, number> = {};
    statusCounts.forEach(item => {
      requestsByStatus[item._id] = item.count;
    });

    // Process group counts
    const requestsByGroup: Record<string, number> = {};
    groupCounts.forEach(item => {
      requestsByGroup[item._id] = item.count;
    });

    // Calculate processing time metrics
    let avgProcessingTime = 0;
    let p95ProcessingTime = 0;

    if (processingTimes.length > 0) {
      avgProcessingTime = processingTimes[0].avgTime || 0;

      // Calculate P95 from times array
      const times = processingTimes[0].times || [];
      if (times.length > 0) {
        times.sort((a: number, b: number) => a - b);
        const p95Index = Math.floor(times.length * 0.95);
        p95ProcessingTime = times[p95Index] || 0;
      }
    }

    // System metrics
    const memoryUsage = process.memoryUsage();
    const uptime = process.uptime();

    // Build metrics data
    const metrics: MetricsData = {
      requests_total: totalRequests,
      requests_by_status: requestsByStatus,
      requests_by_group: requestsByGroup,
      processing_time_avg_ms: avgProcessingTime,
      processing_time_p95_ms: p95ProcessingTime,
      storage_usage_bytes: 0, // TODO: Implement storage size calculation
      assets_total: assetCounts.length > 0 ? assetCounts[0].totalAssets : 0,
      uptime_seconds: uptime,
      memory_usage_bytes: memoryUsage.heapUsed,
      queues: queueMetrics
    };

    const queryTime = Date.now() - startTime;

    // Return metrics in both JSON and Prometheus format
    const format = req.query.format as string;

    if (format === 'prometheus') {
      // Prometheus text format
      const prometheusMetrics = formatPrometheusMetrics(metrics, queryTime);
      res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
      res.send(prometheusMetrics);
    } else {
      // JSON format (default)
      res.json({
        success: true,
        metrics,
        meta: {
          query_time_ms: queryTime,
          timestamp: new Date().toISOString()
        }
      });
    }

    logger.info({ queryTime }, 'Metrics endpoint served successfully');
  } catch (error) {
    logger.error({ error }, 'Failed to generate metrics');
    res.status(500).json({
      success: false,
      error: 'Failed to generate metrics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Format metrics in Prometheus text format
 */
function formatPrometheusMetrics(metrics: MetricsData, queryTime: number): string {
  const lines: string[] = [];

  // Add help and type comments
  lines.push(
    '# HELP ai_photo_restoration_requests_total Total number of photo restoration requests'
  );
  lines.push('# TYPE ai_photo_restoration_requests_total counter');
  lines.push(`ai_photo_restoration_requests_total ${metrics.requests_total}`);
  lines.push('');

  lines.push('# HELP ai_photo_restoration_requests_by_status Number of requests by status');
  lines.push('# TYPE ai_photo_restoration_requests_by_status gauge');
  Object.entries(metrics.requests_by_status).forEach(([status, count]) => {
    lines.push(`ai_photo_restoration_requests_by_status{status="${status}"} ${count}`);
  });
  lines.push('');

  lines.push(
    '# HELP ai_photo_restoration_processing_time_avg_ms Average processing time in milliseconds'
  );
  lines.push('# TYPE ai_photo_restoration_processing_time_avg_ms gauge');
  lines.push(`ai_photo_restoration_processing_time_avg_ms ${metrics.processing_time_avg_ms}`);
  lines.push('');

  lines.push(
    '# HELP ai_photo_restoration_processing_time_p95_ms 95th percentile processing time in milliseconds'
  );
  lines.push('# TYPE ai_photo_restoration_processing_time_p95_ms gauge');
  lines.push(`ai_photo_restoration_processing_time_p95_ms ${metrics.processing_time_p95_ms}`);
  lines.push('');

  lines.push('# HELP ai_photo_restoration_assets_total Total number of photo assets');
  lines.push('# TYPE ai_photo_restoration_assets_total counter');
  lines.push(`ai_photo_restoration_assets_total ${metrics.assets_total}`);
  lines.push('');

  lines.push('# HELP ai_photo_restoration_uptime_seconds System uptime in seconds');
  lines.push('# TYPE ai_photo_restoration_uptime_seconds counter');
  lines.push(`ai_photo_restoration_uptime_seconds ${metrics.uptime_seconds}`);
  lines.push('');

  lines.push('# HELP ai_photo_restoration_memory_usage_bytes Memory usage in bytes');
  lines.push('# TYPE ai_photo_restoration_memory_usage_bytes gauge');
  lines.push(`ai_photo_restoration_memory_usage_bytes ${metrics.memory_usage_bytes}`);
  lines.push('');

  lines.push('# HELP ai_photo_restoration_queue_jobs Number of jobs by queue and state');
  lines.push('# TYPE ai_photo_restoration_queue_jobs gauge');
  Object.entries(metrics.queues.classification).forEach(([state, count]) => {
    lines.push(`ai_photo_restoration_queue_jobs{queue="classification",state="${state}"} ${count}`);
  });
  Object.entries(metrics.queues.restoration).forEach(([state, count]) => {
    lines.push(`ai_photo_restoration_queue_jobs{queue="restoration",state="${state}"} ${count}`);
  });
  Object.entries(metrics.queues.deadLetter).forEach(([state, count]) => {
    lines.push(`ai_photo_restoration_queue_jobs{queue="dead_letter",state="${state}"} ${count}`);
  });
  lines.push('');

  lines.push(
    '# HELP ai_photo_restoration_metrics_query_time_ms Time taken to generate metrics in milliseconds'
  );
  lines.push('# TYPE ai_photo_restoration_metrics_query_time_ms gauge');
  lines.push(`ai_photo_restoration_metrics_query_time_ms ${queryTime}`);

  return lines.join('\\n');
}

/**
 * Handler for GET /api/health
 * Enhanced health check with dependency status
 */
export async function healthHandler(req: Request, res: Response): Promise<void> {
  try {
    const startTime = Date.now();

    // Check database connectivity
    const dbHealthy = await checkDatabaseHealth();

    // Check Redis connectivity (if available)
    const redisHealthy = await checkRedisHealth();

    const responseTime = Date.now() - startTime;
    const status = dbHealthy && redisHealthy ? 'healthy' : 'degraded';

    const health = {
      status,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      response_time_ms: responseTime,
      dependencies: {
        database: dbHealthy ? 'healthy' : 'unhealthy',
        redis: redisHealthy ? 'healthy' : 'unhealthy'
      },
      system: {
        memory: process.memoryUsage(),
        cpu_usage: process.cpuUsage()
      }
    };

    const httpStatus = status === 'healthy' ? 200 : 503;
    res.status(httpStatus).json(health);
  } catch (error) {
    logger.error({ error }, 'Health check failed');
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Check database connectivity
 */
async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await RequestRecordModel.findOne().limit(1).lean();
    return true;
  } catch {
    return false;
  }
}

/**
 * Check Redis connectivity
 */
async function checkRedisHealth(): Promise<boolean> {
  try {
    return await pingQueue();
  } catch {
    return false;
  }
}
