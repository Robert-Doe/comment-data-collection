# Beginner Guide

## What this repo does

This project scans web pages and tries to find user-generated comment regions.

It has four main runtime pieces:

- `web/`: the browser UI where you upload CSVs, review results, and download exports
- `src/api/`: the HTTP API that accepts uploads, serves job results, stores manual captures, and generates exports
- `src/worker/`: the background worker that actually scans sites with Playwright
- `src/shared/`: the shared logic used by both the API and worker, including the scanner, queue helpers, CSV handling, and database access

The supporting services are:

- `Postgres` for durable job and item state
- `Redis` for the BullMQ queue
- Docker for running the API, worker, UI, Postgres, and Redis together on the droplet

## How the system flows

The normal path is:

1. you upload a CSV in the UI
2. the API parses it and stores a job plus job items in Postgres
3. the API seeds a small number of rows into Redis
4. the worker pulls rows from Redis and scans them with Playwright
5. the worker writes row results back to Postgres
6. the API serves those results back to the UI
7. if a site needs human help, the manual-capture extension can upload a frozen HTML snapshot, a raw DOM snapshot, and a viewport screenshot
8. the API re-renders that stored snapshot, saves its own rendered screenshot, re-analyzes the row, and updates the same item

## Why there is an API and a worker

The API should stay responsive to uploads, polling, and downloads.

The worker does the expensive part:

- launching Playwright
- loading pages
- waiting for dynamic content
- extracting candidates and features
- saving screenshots and HTML artifacts

If those ran in the same request process, uploads and downloads would feel slow and fragile. Splitting them lets the worker do long scans while the API stays available.

## Why Redis and Postgres are both used

They solve different problems:

- `Postgres` is the source of truth
- `Redis` is the fast queue

If Redis were the only state store, a restart could lose track of what the job was doing. If Postgres were the only queue, pulling work efficiently would be harder. The project uses both so jobs are fast but still recoverable.

## Why jobs were getting stuck before

There were two separate failure modes:

1. a row could stay `running` in Postgres if the worker crashed or BullMQ stalled before the normal completion path updated the database
2. long Playwright scans could outlive BullMQ's default lock timing, which caused errors like "missing lock" or "could not renew lock"

The current branch fixes both:

- the worker now reconciles incomplete jobs back into Redis on startup and on a periodic recovery timer
- rows go back to `queued` when BullMQ will retry them and to `failed` on the final attempt
- the worker listens for `stalled` events and syncs the database
- BullMQ lock timing is derived from the scan timeout and wait settings so slower scans are less likely to lose their lock
- if Redis still says a row is `active` but the BullMQ lock is gone and the row has been stale for too long, recovery now reclaims it instead of trusting that orphaned `active` entry forever

## Why it sometimes looked like one site at a time

The worker can process multiple sites at once. The main control is `WORKER_CONCURRENCY`.

What mattered in practice was:

- the worker container had conservative env values
- the queue refill value was smaller than the useful parallelism
- the host was named like a `512 MB` droplet even though it had been resized

On March 29, 2026, the droplet itself was verified as roughly `2 vCPU` and `1.9 GiB RAM`. That is enough to run more than one scan at a time, but Playwright is memory-heavy, so the safe starting profile is still:

- `WORKER_CONCURRENCY=2`
- `INITIAL_QUEUE_FILL=4`
- `QUEUE_REFILL_COUNT=2`
- `QUEUE_RECOVERY_INTERVAL_MS=30000`

This gives you real parallel work without being reckless with memory.

## How to think about branches

A branch is just a named line of work.

Examples:

- `digitalocean-master`: the older deployment branch already on the droplet
- `fix/worker-recovery-parallelism`: the branch for the stuck-job and parallelism fixes

The `/` in a branch name is only part of the name. It is not a folder on disk. People use it to group branches so they read clearly:

- `fix/...` for bug fixes
- `feature/...` for new features
- `chore/...` for maintenance

## Local repo, GitHub, and droplet repo

There are three separate places to keep in sync:

1. your local repo on your laptop
2. the GitHub repo under `origin`
3. the repo clone on the droplet at `/opt/comment-data-collection`

They are only guaranteed to match when all three point to the same commit.

The safest workflow is:

1. make and test changes locally
2. commit them on one branch
3. push that branch to GitHub
4. deploy that exact branch to the droplet
5. verify the commit hash matches in all places

Useful commands:

- `git status`
- `git branch --show-current`
- `git log --oneline -5`
- `git rev-parse HEAD`

## What "consistent" means in practice

You can say local, GitHub, and the droplet are consistent when:

- `git rev-parse HEAD` is the same commit locally and on the droplet
- the droplet is running containers rebuilt from that same branch
- the live `.env.digitalocean` values are the ones you intended
- the API health check passes
- the worker logs show the expected concurrency and lock timing

## Important env files

The main deployment env file is `.env.digitalocean`.

The example template in the repo is `.env.digitalocean.example`.

Important values:

- `WORKER_CONCURRENCY`: how many rows the worker processes at once
- `INITIAL_QUEUE_FILL`: how many rows to enqueue when the job starts
- `QUEUE_REFILL_COUNT`: how many new rows to add as work completes
- `QUEUE_RECOVERY_INTERVAL_MS`: how often the worker repairs incomplete jobs
- `SCAN_TIMEOUT_MS`, `POST_LOAD_DELAY_MS`, `PRE_SCREENSHOT_DELAY_MS`: scan pacing
- `WORKER_LOCK_*`: advanced BullMQ timing overrides; usually best left unset

## Where the modeling code now lives

The first supervised model system is split into a few clear places.

### Shared model code

- `src/modeling/common/`

This contains:

- the feature catalog
- dataset building
- vectorization
- logistic regression
- metrics
- artifact save/load helpers
- the shared service layer
- the HTTP routes used by the API and local runtime

### Model variants

- `src/modeling/variants/keywordAware/`
- `src/modeling/variants/keywordAblated/`

These directories are intentionally small.

They only define what makes each model variant different.

### Website pages

- `web/modeling.html`
- `web/feature-docs.html`

These are the user-facing modeling pages.

### Saved trained models

- `output/models/`

This is where trained model artifacts are written.

That directory contains runtime outputs, not source code.

## What the two model variants mean

The first model pair is:

- `keyword-aware`: uses the full curated feature catalog, including direct lexical keyword signals
- `keyword-ablated`: removes the lexical keyword family so structure, block repetition, author-time, interaction, and negative-control evidence have to carry more of the detection

This split exists so the repo can answer a real question:

- do keywords genuinely help
- or do they create shortcut-driven overfitting

## What the new website pages are for

### Scanner

This is still where you:

- upload CSVs
- run scan jobs
- inspect rows
- label candidates

### Model Lab

This is where you:

- train the two model variants
- list saved model artifacts
- score completed jobs
- upload site groups by hostname for comparison

### Feature Docs

This is the consulting page.

Use it when you want a plain-language explanation of:

- comment list vs comment block vs comment block element
- the two model variants
- what each curated feature really means

## Why the Dockerfiles changed

Both the API and the worker now use Playwright-capable images.

Why the worker needs it is obvious: it scans live pages.

Why the API needs it too:

- manual-capture reanalysis uses the same scanner code
- HTML graph generation for stored snapshots also uses the shared scanner runtime

Without the Playwright browser runtime in the API image, those features are fragile in production.

## Why the SVG download fix was needed

The API endpoint for `graph.svg` already worked, but browsers do not always honor a cross-origin `download` link the way people expect.

The UI now downloads SVG and DOT exports by:

1. fetching the file from the API
2. reading the exposed `Content-Disposition` header
3. creating a blob URL locally
4. triggering a normal browser download

That keeps the frontend and API on separate ports while still making downloads reliable.

## How manual snapshot screenshots now work

There are three different image types in the manual-review flow:

- `Uploaded Screenshot`: the visible browser viewport captured by the extension
- `Rendered Snapshot`: a server-generated screenshot after Playwright re-renders the stored HTML snapshot
- `Candidate Screenshots`: cropped list/container regions generated from the server-side analysis

Why this matters:

- if the extension screenshot missed the comments because they were off-screen, the uploaded screenshot will still miss them
- if the DOM snapshot contains the opened comment section, the server-rendered snapshot and candidate crops can still show it after refresh
- this gives you a better labeling trail because you can compare what the browser captured against what the server reconstructed

## Beginner-safe deployment checklist

1. run `npm.cmd run check`
2. run `git status`
3. commit intended changes on one branch
4. run `git push`
5. deploy that same branch with `scripts/deploy-digitalocean.ps1`
6. check `http://YOUR_DROPLET_IP:3000/api/health`
7. inspect `docker compose ps` and `docker logs`
8. confirm the worker starts with the expected concurrency and queue settings

## Where to read next

- [README.md](../README.md)
- [DIGITALOCEAN.md](../DIGITALOCEAN.md)
- [docs/paper/000_INDEX.md](paper/000_INDEX.md)
