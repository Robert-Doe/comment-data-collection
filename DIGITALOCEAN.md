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

The ready-to-use command-line deployment files on this branch are:

- [docker-compose.digitalocean.yml](C:/Users/bobcumulus/IdeaProjects/comment-data-collection/docker-compose.digitalocean.yml)
- [Dockerfile.api](C:/Users/bobcumulus/IdeaProjects/comment-data-collection/Dockerfile.api)
- [Dockerfile.ui](C:/Users/bobcumulus/IdeaProjects/comment-data-collection/Dockerfile.ui)
- [scripts/bootstrap-digitalocean.sh](C:/Users/bobcumulus/IdeaProjects/comment-data-collection/scripts/bootstrap-digitalocean.sh)
- [scripts/deploy-digitalocean.ps1](C:/Users/bobcumulus/IdeaProjects/comment-data-collection/scripts/deploy-digitalocean.ps1)

### Values I need from you

- the public frontend URL
- the public API URL
- whether you want one domain or separate UI/API subdomains
- whether Postgres will be self-hosted on the droplet or use DigitalOcean Managed Postgres
- whether Redis will be self-hosted on the droplet or use DigitalOcean Managed Redis
- the disk path you want to use for artifacts, for example `/data/comment-data/artifacts`
- the worker concurrency you want to start with

### Where each value comes from

- `public frontend URL`
  - if you use a domain, this is the domain or subdomain you point at the UI service
  - if you are starting with raw droplet ports, use `http://YOUR_DROPLET_IP:8080`
- `public API URL`
  - if you use a domain, this is the API domain or subdomain
  - if you are starting with raw droplet ports, use `http://YOUR_DROPLET_IP:3000`
- `one domain or separate UI/API subdomains`
  - this is your choice, not a value DigitalOcean generates for you
- `Postgres self-hosted or managed`
  - your choice
  - if managed, get the connection string from the database cluster's connection details page in DigitalOcean
- `Redis self-hosted or managed`
  - your choice
  - if managed, get the connection string from the managed Redis or Valkey cluster connection details page in DigitalOcean
- `artifact disk path`
  - if you stay with this Docker Compose setup, keep `ARTIFACT_ROOT=/data/comment-data/artifacts`
  - the Docker volume handles persistence for the container path
- `worker concurrency`
  - your choice
  - start with `2` unless your droplet is very small

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
- `QUEUE_RECOVERY_INTERVAL_MS`
- `WORKER_LOCK_DURATION_MS` optional
- `WORKER_LOCK_RENEW_TIME_MS` optional
- `WORKER_STALLED_INTERVAL_MS` optional
- `WORKER_MAX_STALLED_COUNT` optional
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
- `QUEUE_RECOVERY_INTERVAL_MS=30000`

The worker now derives sane lock timings from those scan values. In most cases you should leave the advanced lock variables unset unless you are deliberately tuning BullMQ behavior.

For a `2 vCPU / 2 GB RAM` droplet, start with:

- `WORKER_CONCURRENCY=2`
- `INITIAL_QUEUE_FILL=4`
- `QUEUE_REFILL_COUNT=2`

Only raise those after watching `docker stats` during a real batch.

### Fastest way to start on a droplet

1. Create an Ubuntu droplet.
2. SSH into it.
3. Run [scripts/bootstrap-digitalocean.sh](C:/Users/bobcumulus/IdeaProjects/comment-data-collection/scripts/bootstrap-digitalocean.sh) once.
4. Clone this repo into `/opt/comment-data-collection`.
5. Copy [.env.digitalocean.example](C:/Users/bobcumulus/IdeaProjects/comment-data-collection/.env.digitalocean.example) to `.env.digitalocean` and edit the values.
6. Run:

```bash
docker compose --env-file .env.digitalocean -f docker-compose.digitalocean.yml up -d --build
```

That will give you:

- UI on port `8080`
- API on port `3000`
- worker running in the background

### Windows command-line deploy

From this machine you can deploy to the droplet with:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\deploy-digitalocean.ps1 `
  -Host YOUR_DROPLET_IP `
  -User root `
  -AppDir /opt/comment-data-collection `
  -Branch fix/worker-recovery-parallelism `
  -Repository https://github.com/YOUR-USER/comment-data-collection.git
```

This script SSHes into the droplet, updates the repo, and runs Docker Compose there.

Recommended flow for consistency:

1. commit the intended local changes on one branch
2. push that same branch to GitHub
3. deploy that exact branch to the droplet
4. verify the droplet repo `git rev-parse HEAD` matches your local `git rev-parse HEAD`

It now refuses to deploy if:

- the remote git worktree is dirty
- `.env.digitalocean` has duplicate keys
- queue sizing values are obviously inconsistent

### Next step

Once you give me the URLs and whether DB/Redis are managed or self-hosted, I can wire the exact DigitalOcean deployment files for this branch.
