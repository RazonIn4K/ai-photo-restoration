# Mock Data & Dashboard Dev Workflow

This guide explains how to run the review dashboard against local mock data without touching real user content.

## 1. Seed mock requests and images

```bash
npm run seed:mock
```

This creates:

- `data/mock/mock-requests.json`
- `data/mock/images/*`

Feel free to edit `mock-requests.json` to add more cases (NSFW, missing restored image, etc.). Do **not** place real photos in this directory.

## 2. Run the API in mock mode

```bash
USE_MOCK_DASHBOARD=1 npm run dev:api
```

The Express API now serves dashboard routes from the mock files:

- `GET /api/requests`
- `GET /api/requests/:id`
- `GET /api/images/:type/:hash`

Behavioral notes:

- Mock mode is opt-in; production/CI remain unchanged.
- In mock mode, ingestion and other mutating endpoints return `501` (not supported).
- Responses match the client expectations (`{ requests: [...] }`).

## 3. Start the dashboard client

```bash
npm run dev:client         # runs Vite dev server under client/
# or run both API + client concurrently
npm run dev:all
```

`dev:all` uses `concurrently` to run both commands in one terminal. You can also run them in separate shells if preferred.

## 4. Resetting mock data

Mock files are just JSON/images under `data/mock`. To reset:

```bash
rm -rf data/mock
npm run seed:mock
```

## 5. Relation to backend types

The mock request objects mirror the shape used by `client/src/types/index.ts` (a subset of `RequestRecord`). When we expand the real API surface, the mock data should be updated in lock-step.

## 6. Safety

- All mock content is synthetic.
- `USE_MOCK_DASHBOARD` must **never** be enabled in production.
- Secrets/real assets are not required for this workflow.

