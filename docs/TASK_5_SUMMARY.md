# Task 5 – BullMQ Queue System

## ✅ Deliverables

- **Queue infrastructure** powered by BullMQ with a shared Redis connection, queue schedulers, and queue events.
- **Classification and restoration workers** with exponential backoff, retry limits, deduplication (per-request job IDs), and automatic promotion to a dead-letter queue after successive failures.
- **Queue metrics** surfaced through Prometheus-compatible output and included in `/api/metrics` JSON, exposing waiting/active/completed/failed counts for each queue and the dead-letter backlog.
- **Bull Board dashboard** mounted at `BULL_BOARD_BASE_PATH` with HTTP Basic auth to visualise queues and inspect jobs.
- **Photo ingestion pipeline integration** that enqueues classification work immediately after a request is stored, chaining into restoration jobs.
- **Comprehensive tests** (3 queue-focused specs) validating deduplication, dead-letter routing, and restoration queue job IDs.

## 🧱 Architecture Overview

```
┌──────────────────────┐
│  Express API (Task 4)│
└──────────┬───────────┘
           │ enqueueClassificationJob()
┌──────────▼───────────┐
│  BullMQ Queues       │
│  - classification    │
│  - restoration       │
│  - dead-letter       │
└──────────┬───────────┘
           │ workers update RequestRecord
┌──────────▼───────────┐
│  RequestRecordModel  │
└──────────┬───────────┘
           │ metrics/monitoring
┌──────────▼───────────┐
│ Prometheus Metrics   │
└──────────┬───────────┘
           │ secure UI
┌──────────▼───────────┐
│ Bull Board Dashboard │
└──────────────────────┘
```

## 🔧 Configuration

Environment additions (`src/config/env.ts`):

| Variable                           | Default         | Purpose                                    |
| ---------------------------------- | --------------- | ------------------------------------------ |
| `QUEUE_PREFIX`                     | `frai`          | Namespace prefix for queue names           |
| `QUEUE_CLASSIFICATION_CONCURRENCY` | `5`             | Worker concurrency for classification jobs |
| `QUEUE_RESTORATION_CONCURRENCY`    | `3`             | Worker concurrency for restoration jobs    |
| `QUEUE_MAX_ATTEMPTS`               | `5`             | Retry count before routing to dead letter  |
| `QUEUE_BACKOFF_BASE_DELAY_MS`      | `30000`         | Base delay for exponential backoff         |
| `BULL_BOARD_USERNAME`              | `admin`         | Dashboard basic auth user                  |
| `BULL_BOARD_PASSWORD`              | `changeme`      | Dashboard basic auth password              |
| `BULL_BOARD_BASE_PATH`             | `/admin/queues` | Dashboard mount path                       |

## 📈 Metrics

- `/api/metrics` now includes queue counts for waiting/active/completed/failed/delayed/paused jobs.
- Prometheus output exposes `ai_photo_restoration_queue_jobs{queue="…",state="…"}` gauges.
- Redis health check is updated to ping the shared queue connection.

## 🧪 Testing

- Added `tests/queues/manager.test.ts` with mocked BullMQ classes to cover:
  1. Classification deduplication & retry settings
  2. Dead-letter routing after max attempts
  3. Restoration job ID composition

Total test suite: **108 specs** (previous 105 + 3 new).

## 🚀 Next Steps

- Build Task 5.2 processors out further by integrating real classification/restoration logic as models mature.
- Enhance dead-letter tooling with requeue endpoints.
- Wire queue metrics into dashboards/alerts once Prometheus is deployed.
