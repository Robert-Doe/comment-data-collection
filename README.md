# Comment Data Collection

Playwright-based UGC/comment region detection with:

- a local batch CLI
- a Render-ready API service
- a Render-ready background worker
- a static frontend for CSV uploads and result downloads

## Local CLI

Install dependencies:

```powershell
npm.cmd install
npx.cmd playwright install chromium
```

Run the batch detector:

```powershell
node src/detect-ugc.js --input .\sites.csv --output .\output\ugc-results.json --url-column url
```

## Local App Test

If you want to test the full upload and polling flow locally without Postgres or Redis, use the local single-process harness:

```powershell
npm.cmd run start:local
```

Then open `http://localhost:3000`, upload a CSV, and watch the job run.

Notes:

- this local mode persists state to `output/local-dev-state.json`
- it uses the same scanner and pacing controls as the worker
- it is for local validation only; production still uses Render `Postgres` + `Key Value`

## Render Architecture

The recommended deployment is:

- `ugc-ui` as a Render `Static Site`
- `ugc-api` as a Render `Web Service`
- `ugc-worker` as a Render `Background Worker`
- `ugc-queue` as Render `Key Value`
- `ugc-db` as Render `Postgres`

The blueprint is in `render.yaml`.

Current pacing safeguards:

- URLs are inserted into the database in batches instead of one row at a time
- uploaded jobs start with a small initial queue fill instead of enqueueing the full CSV immediately
- the worker refills the queue gradually as items finish
- result APIs are paginated
- the worker waits after page load before feature extraction
- Render defaults are conservative for the free tier (`WORKER_CONCURRENCY=1`, `INITIAL_QUEUE_FILL=2`)

## Services

### API

Start locally:

```powershell
npm.cmd run start:api
```

Required environment variables:

- `DATABASE_URL`
- `REDIS_URL`
- `PORT` optional
- `FRONTEND_ORIGIN` optional

Endpoints:

- `GET /api/health`
- `GET /api/jobs`
- `POST /api/jobs`
- `GET /api/jobs/:jobId`
- `GET /api/jobs/:jobId/results`
- `GET /api/jobs/:jobId/download.csv`

### Worker

Start locally:

```powershell
npm.cmd run start:worker
```

Required environment variables:

- `DATABASE_URL`
- `REDIS_URL`
- `WORKER_CONCURRENCY` optional
- `SCAN_TIMEOUT_MS` optional
- `MAX_CANDIDATES` optional
- `MAX_RESULTS` optional

## Frontend

Build the static config file:

```powershell
npm.cmd run build:ui
```

Set `API_BASE_URL` during the Render static-site build so the UI knows where the API lives.

## Worker Runtime

The worker uses `Dockerfile.worker`, based on the official Playwright container image, so Chromium and its Linux dependencies are available in Render.

## Verification

Fixture pages are in `fixtures/`.

This repo was verified locally by:

- building the static frontend config
- running the CLI against the positive and negative fixtures
- loading the API module successfully

The API and worker were not fully run end-to-end locally because that requires a live Postgres and Redis instance.
