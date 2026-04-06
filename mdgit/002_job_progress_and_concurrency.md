# Job Progress And Concurrency Notes

## Current conclusion

- The job list API is working on both local and remote.
- The visible inconsistency was runtime concurrency, not missing job records.
- The local dev runtime defaulted too low when no env file was present.
- The droplet env also needed to be aligned with the higher worker setting.

## Current intended baseline (updated 2026-04-06)

- `WORKER_CONCURRENCY=4` (was 5; capped to cpuCount so API/UI stay responsive during scans)
- `INITIAL_QUEUE_FILL=8` (was 10)
- `QUEUE_REFILL_COUNT=4` (was 5)
- `maxRecommendedWorkerConcurrency` in config.js now caps to `cpuCount` (was `cpuCount+1`)

## User-facing effect

- The homepage auto-selects the best active job (running > queued > pending > latest) on load.
- Recent jobs poll automatically every 15 seconds while the page is open.
- API base URL is now resolved automatically from `window.location` — no config required for
  standard `api.` subdomain setups.
- The monitor dashboard now shows running/queued/in-flight breakdown per job, and includes
  pending/queued jobs in the "Active Jobs" panel (not just status=running).

## Sync note

Changes were originally made as uncommitted edits on the DigitalOcean server and locally.
Committed to `fix-homepage-job-loader` and `digitalocean-master` on 2026-04-06 (commit 383d800).
Server synced via `git stash && git pull && git stash drop` — working tree is now clean.
