## DigitalOcean Deployment Notes

This branch is the local `master` line prepared for a DigitalOcean deployment.

### Recommended shape

Use a DigitalOcean Droplet with Docker Compose.

Why:

- this app already has a real split architecture
- the scanner is long-running and works better as a dedicated worker
- Postgres and Redis fit naturally beside the API and worker
- you can raise concurrency without fighting free-hosting limits

### Services to run

- `ugc-api`
- `ugc-worker`
- `postgres`
- `redis`
- one static frontend build for `web/`

### Values I need from you

- the public frontend URL
- the public API URL
- whether you want one domain or separate UI/API subdomains
- whether Postgres will be self-hosted on the droplet or use DigitalOcean Managed Postgres
- whether Redis will be self-hosted on the droplet or use DigitalOcean Managed Redis
- the disk path you want to use for artifacts, for example `/data/comment-data/artifacts`
- the worker concurrency you want to start with

### Core environment variables

- `DATABASE_URL`
- `REDIS_URL`
- `FRONTEND_ORIGIN`
- `PUBLIC_BASE_URL`
- `ARTIFACT_ROOT`
- `ARTIFACT_URL_BASE_PATH`
- `WORKER_CONCURRENCY`
- `SCAN_TIMEOUT_MS`
- `POST_LOAD_DELAY_MS`
- `PRE_SCREENSHOT_DELAY_MS`
- `NAVIGATION_RETRIES`
- `LOAD_SETTLE_PASSES`
- `NEGATIVE_RETRY_SETTLE_PASSES`
- `ACTION_SETTLE_MS`
- `INITIAL_QUEUE_FILL`
- `QUEUE_REFILL_COUNT`
- `INGEST_BATCH_SIZE`
- `API_RESULTS_PAGE_SIZE`
- `CAPTURE_SCREENSHOTS`
- `CAPTURE_HTML_SNAPSHOTS`

### Frontend build variable

- `API_BASE_URL`

That value is used by [scripts/build-static-config.js](C:/Users/bobcumulus/IdeaProjects/comment-data-collection/scripts/build-static-config.js) when building [web/config.js](C:/Users/bobcumulus/IdeaProjects/comment-data-collection/web/config.js).

### Extension setting

The extension should point to the deployed API URL:

- `API Base URL` = your public API URL

### Practical starting values

- `WORKER_CONCURRENCY=2`
- `SCAN_TIMEOUT_MS=90000`
- `POST_LOAD_DELAY_MS=6000`
- `PRE_SCREENSHOT_DELAY_MS=1500`
- `NAVIGATION_RETRIES=2`
- `LOAD_SETTLE_PASSES=2`
- `NEGATIVE_RETRY_SETTLE_PASSES=2`
- `ACTION_SETTLE_MS=1250`
- `INITIAL_QUEUE_FILL=4`
- `QUEUE_REFILL_COUNT=2`

### Next step

Once you give me the URLs and whether DB/Redis are managed or self-hosted, I can wire the exact DigitalOcean deployment files for this branch.
