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

## Manual Review And Snapshot Capture

Some sites will not expose UGC until a human clicks, expands a thread, signs in, or clears a verification step. For those rows, the scanner now marks the item for manual review instead of leaving it as a silent false negative.

What is stored:

- automated scan result
- manual review recommendation and reason
- manual HTML snapshot URL
- manual raw DOM snapshot URL when the extension uploads a frozen styled capture
- manual screenshot URL
- top candidate regions with stable candidate keys
- candidate-local screenshot artifacts for review
- candidate-level human labels for training
- latest analysis source (`automated` or `manual_snapshot`)

Local workflow:

1. Run `npm.cmd run start:local`
2. Open `http://localhost:3000`
3. Upload a CSV and wait for rows that show `needs review`
4. Open the target row URL in a new browser tab
5. Reveal the comments manually, then open the extension popup on that tab
6. The extension auto-matches the current page URL to the scanner row and uploads the snapshot
7. The server re-analyzes that snapshot and persists the updated result
8. In the web app, open the row and review the candidate panel to mark the true UGC region, hard negatives, or uncertain cases

Downloaded CSV/JSON now include the manual-review fields and artifact URLs.

Job exports now include:

- `Download Summary CSV` for a compact spreadsheet-style breakdown of totals, statuses, UGC types, confidence, blockers, and manual-review counts
- `Download CSV` for the row-by-row export with URLs, scores, artifact links, blocker metadata, and timestamps
- `Download Feature CSV` for a row-per-site breakdown of the best candidate, matched signals, penalty signals, and stored feature flags
- `Download Candidates CSV` for a row-per-candidate audit export with all extracted features and any human labels
- `Download Excel Report` for a multi-sheet workbook with `Overview`, `Rows`, `SiteBreakdown`, and `Candidates`
- `View JSON` for the full structured result payload

The extension defaults to `Frozen Styles Snapshot` mode:

- `snapshot.html` is a styled artifact for human review
- `snapshot.raw.html` keeps the original DOM for analysis

### Browser Extension

The unpacked extension lives at [extension/manual-capture](C:/Users/bobcumulus/IdeaProjects/comment-data-collection/extension/manual-capture).

Install it in Chrome/Edge:

1. Open `chrome://extensions` or `edge://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select [extension/manual-capture](C:/Users/bobcumulus/IdeaProjects/comment-data-collection/extension/manual-capture)

Then follow the instructions in [extension/manual-capture/README.md](C:/Users/bobcumulus/IdeaProjects/comment-data-collection/extension/manual-capture/README.md).

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

## Deployment Status

What is ready now:

- `render.yaml` already defines the API, worker, UI, Redis, and Postgres services
- the web UI can upload CSVs, track jobs, review candidates, and download both detailed and summary CSV exports
- the web UI can also download the unpacked extension as a ZIP and the sample labeled CSV used for demo uploads
- the extension/manual-review flow can upload human-captured snapshots back into the same job rows

What still needs to be addressed before a supervisor-facing production deployment:

- artifact storage is currently local filesystem storage under `output/artifacts`
- the worker writes screenshots and HTML snapshots there
- the API serves those files from the same path
- in Render, `ugc-api` and `ugc-worker` are separate services, so they do not share that local disk

That means the current Render blueprint is close, but screenshots, candidate images, and stored HTML snapshots need shared storage before production use. The practical fix is to move artifacts to shared object storage and keep the URLs in Postgres.

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
- `ARTIFACT_ROOT` optional for local or mounted artifact storage
- `ARTIFACT_URL_BASE_PATH` optional, defaults to `/artifacts`
- `PUBLIC_BASE_URL` optional, used when generating absolute artifact URLs

Endpoints:

- `GET /api/health`
- `GET /api/jobs`
- `POST /api/jobs`
- `GET /api/jobs/:jobId`
- `GET /api/jobs/:jobId/results`
- `GET /api/jobs/:jobId/items/:itemId`
- `GET /api/manual-review/lookup?url=...`
- `POST /api/jobs/:jobId/items/:itemId/manual-capture`
- `POST /api/jobs/:jobId/items/:itemId/candidates/:candidateKey/review`
- `GET /api/jobs/:jobId/report.xlsx`
- `GET /api/jobs/:jobId/summary.csv`
- `GET /api/jobs/:jobId/features.csv`
- `GET /api/jobs/:jobId/candidates.csv`
- `GET /api/jobs/:jobId/download.csv`
- `GET /api/downloads/sample-sites-labeled.csv`
- `GET /api/downloads/extension.zip`

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
- running the local app upload flow
- uploading a manual HTML snapshot and screenshot to a `needs review` row
- verifying that the row changed from automated `no` to stored `manual_snapshot` `ugc_detected: true`
- verifying that candidate regions were returned with screenshot artifacts and could be labeled in the UI

The API and worker were not fully run end-to-end locally because that requires a live Postgres and Redis instance.
