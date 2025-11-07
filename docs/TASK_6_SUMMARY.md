# Task 6 – AI Processing Pipeline

## ✅ Highlights

- Intent classification worker that analyzes request text, assigns confidence/keywords, updates routing, and queues follow-up jobs.
- Local AI pipeline scaffolding with backend detection (MPS/DirectML/CUDA/CPU), model license registry, workflow builder, and restoration executor stub.
- Cloud AI pipeline worker that simulates Gemini calls with circuit breaker, rate limiting, and backoff logic.
- Content-safety worker for NSFW detection with confidence thresholds and triage escalation.
- Comprehensive Vitest coverage (108 worker-focused specs) validating classification heuristics, pipeline config, circuit breaker states, and safety thresholds.

## 🧱 Architecture

```
RequestRecord -> BullMQ (classification job) -> classification worker
  └─> updates RequestRecord + enqueues restoration jobs (local vs cloud)
Local pipeline -> backend detection + workflow builder
Cloud pipeline -> Gemini stub + circuit breaker
Content safety -> NSFW heuristic + triage
```

## 📦 Key Modules

- `src/workers/classification.ts`: keyword heuristics, routing, human-review detection.
- `src/workers/local-ai-pipeline.ts`: compute backend detection, license validation, ComfyUI workflow builder, execution stub.
- `src/workers/cloud-ai-pipeline.ts`: request batching, token budget tracking, retries/circuit breaker.
- `src/workers/content-safety.ts`: NSFW classifier wrapper + policy actions.

## 🧪 Testing

- `tests/workers/*.test.ts`: 108 specs covering:
  - classification routing & keyword extraction
  - local pipeline backend selection & workflow output
  - cloud pipeline circuit breaker transitions
  - content-safety thresholds & escalation

## 🔄 Integrations

- `src/queues/manager.ts`: classification worker exports integrated with queue processors.
- `src/services/photo-ingestion.ts`: existing pipeline can enqueue classification jobs that now leverage the new worker.
- `src/types/index.ts`: RequestStatus/Processing metadata extended for classification info.

## 🚧 Follow-ups

- Wire local/cloud/content-safety workers into real restoration queues once AI models are available.
- Replace stubs with actual PyTorch / Gemini calls.
- Add telemetry hooks for worker success/failure counts.
