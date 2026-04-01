# Server Monitoring, Incident Resolution, and Operational Hardening

## Status as of April 1, 2026

This document records the production incident that occurred on March 31 – April 1, 2026, its root causes, the fixes applied, and the new monitoring infrastructure added to prevent future blind spots.

---

## The Incident

A scan job (`badffc6c-8464-4675-af85-1f4e3a762a31`, 332 URLs) became stuck at 86/332 completed for over 12 hours. Simultaneously the API was crashing repeatedly under memory pressure, and the developer had no real-time visibility into what the server was doing.

---

## Root Cause Analysis

Three separate problems compounded each other.

### 1. BullMQ lock expiry on long-hanging scans

The BullMQ worker was processing a URL (arstechnica.com) that caused Playwright to hang indefinitely — not just time out, but fully block the Node.js event loop. Because the event loop was blocked, BullMQ's internal lock renewal timer could not fire. The lock expired and BullMQ logged the error continuously:

```
Error: could not renew lock for job 0110ab5e-6e76-440a-b18f-2f171ed0199f
```

The worker was alive (the container was running) but could not make forward progress. Items already in the Redis active queue were stuck, and no new items were dequeued.

The `lockDuration` in the worker configuration was already set to 180 000 ms (3 minutes) as of the `fix/worker-recovery-parallelism` branch, which is larger than `SCAN_TIMEOUT_MS=90000`. The remaining risk is that some URLs cause Playwright to block at a native level before any timeout fires. When this happens the only recovery is a worker restart.

**Fix applied:** Restarted the worker container. Docker's `restart: unless-stopped` policy brought it back immediately. BullMQ's stalled-job detection (`stalledInterval=90000ms`) reconciled the orphaned items, putting them back in the queue. The job resumed processing within seconds.

### 2. API OOM kills (no swap space)

The droplet (512 MB RAM, no swap) was having its API process killed by the Linux OOM killer. The API logs showed repeated `Killed` messages followed by automatic restarts. With no swap, any memory spike — for example, loading a large job result set or building an Excel export — could trigger the OOM killer.

**Fix applied:** Created a 512 MB swapfile at `/swapfile`:

```bash
fallocate -l 512M /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

This gives the kernel room to page out cold memory before killing processes. The entry in `/etc/fstab` ensures the swapfile is remounted after any droplet reboot.

### 3. Disk space near capacity

The root filesystem was at 86% before the swap was created. The swap file brought it to 97%. Docker build cache (~1 GB) was reclaimed using `docker builder prune --all -f`, bringing usage back to ~91%. The artifact volume holds 466 MB of screenshots and HTML snapshots.

Disk headroom should be monitored. The new health endpoint reports `diskUsedPct` and `diskFree` and the monitoring dashboard shows these with colour-coded alerts (>80% yellow, >90% red).

---

## Changes Made

### `src/shared/store.js` — `listAllEvents`

Added a new exported function `listAllEvents(options, databaseUrl)` that queries the `job_events` table across all jobs, ordered by `created_at DESC`. Accepts `limit` (max 500) and `since` (ISO timestamp) parameters for pagination. This is used by the global events API endpoint.

### `src/api/server.js` — monitoring and admin endpoints

Three new routes:

| Route | Purpose |
|---|---|
| `GET /api/events` | Returns recent events from all jobs. Accepts `limit` and `since` query params. Used by the monitoring dashboard for live polling. |
| `GET /api/health/detailed` | Returns Redis connectivity, disk free/total/used-percent, active job count, and a summary of each running job's progress. |
| `POST /api/admin/restart-worker` | Publishes the string `restart` to the Redis `ugc:control` pub/sub channel. The worker subscribes to this channel and calls `shutdown()` on receipt, allowing Docker to restart it cleanly. |
| `GET /monitor` | Serves the self-contained monitoring dashboard HTML from `src/api/monitor.html`. |

### `src/worker/worker.js` — Redis control channel subscription

After startup queue recovery, the worker now subscribes to the `ugc:control` Redis channel:

```js
const controlSub = createRedisConnection(config.redisUrl);
controlSub.subscribe('ugc:control').catch(() => {});
controlSub.on('message', (_channel, msg) => {
  if (msg === 'restart') {
    console.log('Received restart signal via control channel, shutting down...');
    shutdown().catch(() => process.exit(1));
  }
});
```

This allows the admin dashboard (or any operator with Redis access) to trigger a graceful worker restart without SSH access.

### `src/api/monitor.html` — Server monitoring dashboard

A self-contained dark-theme HTML/CSS/JS dashboard served at `/monitor` on the API domain. It polls the three new endpoints every 5 seconds and displays:

- **Live activity log** — all `job_events` rows from all jobs, filterable by level (info / warn / error), with timestamps rendered in the browser's local timezone.
- **System health** — Redis status, disk used %, disk free, active job count.
- **Active job cards** — progress bars and stat rows (completed / detected / failed / running / pending) for every job currently in `running` status.
- **Restart Worker button** — calls `POST /api/admin/restart-worker`. A confirmation dialog prevents accidental clicks.
- **ML model training explainer** — shows `items_with_candidates` and `labeled_count` from the modeling overview. Explains that the model needs human-labeled candidates before training is possible.

Access URL: `https://api.xsscommentdetection.me/monitor`

### `docker-compose.digitalocean.yml` — source volume mount

Added a bind mount for the API service:

```yaml
api:
  volumes:
    - artifact-data:/data/comment-data/artifacts
    - ./src:/app/src          # NEW
```

This means changes to `src/` on the host take effect after an API container restart without requiring a Docker image rebuild. This is safe because `node_modules` live at `/app/node_modules` (inside the image layer) and are not affected by mounting `/app/src`.

---

## Why Model Training Shows Zero

The ML classifier (Logistic Regression, two variants: `keywordAware` and `keywordAblated`) trains on **human-labeled candidate regions**. As of April 1, 2026 only 9 of 490 items had any candidate labels attached. The model overview endpoint (`GET /api/modeling/overview`) returns a `labeled_count` of 9, which is below the practical minimum (~20) for meaningful training.

To accumulate labels:
1. Open any completed job in the main app (`xsscommentdetection.me`).
2. Click a row to select it, then open the **Labeler** tab.
3. For each candidate region shown, click **True UGC** or **False UGC**.
4. Repeat across multiple rows until `labeled_count` reaches at least 20.
5. Open the **Scoring** tab and click **Train** to produce a model artifact.

The monitoring dashboard shows the current `labeled_count` and `items_with_candidates` values in the ML Model Training card so progress can be tracked without switching to the main app.

---

## Operational Checklist for Future Incidents

**Job stuck / not progressing:**
1. Visit `https://api.xsscommentdetection.me/monitor`
2. Check the Live Activity Log for `item_stalled` or repeated `item_failed` events on the same row
3. If the worker appears to be looping on one URL, click **Restart Worker**
4. The job will automatically resume from where it left off (BullMQ stalled-job recovery)

**API returning 502 or timing out:**
1. Check the monitor's health card — if Redis is DOWN, restart the redis container
2. If disk is >95%, the API may refuse to write artifacts — clear Docker build cache (`docker builder prune --all -f`) or delete old job artifacts

**Disk full:**
1. `docker builder prune --all -f` — typically frees 1 GB
2. Delete artifact directories for old completed jobs under the `artifact-data` Docker volume if the data is no longer needed

**Worker container keeps restarting:**
1. `docker logs comment-data-collection-worker-1 --tail 50` — look for startup errors
2. Common cause: Redis or Postgres not yet ready — wait 30 seconds and the `depends_on` healthcheck should handle it
3. If the container is OOM-killed: the 512 MB swapfile should prevent this, but if swap is exhausted consider reducing `WORKER_CONCURRENCY` to 1 in `.env.digitalocean`
