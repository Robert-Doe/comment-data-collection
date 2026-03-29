# Complete Process And Operational Record

## Status as of March 29, 2026

This note records the project state after the queue-recovery, deployment-hardening, and operational-consistency work completed on March 29, 2026.

The goal of this document is to preserve not just the code changes, but the reasoning that led to them, so later writing does not have to reconstruct the project history from Git diffs alone.

## Abstract

The project is a Playwright-based system for detecting user-generated comment regions on arbitrary web pages. It combines automated scanning, a human-in-the-loop review path, candidate-level export artifacts, and operational deployment on a single DigitalOcean droplet. Recent work focused on moving the system from "feature-complete but operationally fragile" toward "recoverable, inspectable, and deployable with consistent state across local development, GitHub, and production."

The main operational findings were:

- job rows could remain marked as `running` or `queued` in Postgres after worker interruption
- the live deployment had duplicate environment keys and configuration drift
- the droplet name understated the actual machine capacity, which made concurrency choices less clear
- SVG download endpoints worked server-side, but the browser-facing UX was unreliable across ports
- BullMQ lock timing was too small for some long Playwright scans, producing missing-lock and stalled-job behavior

The resulting engineering direction was to strengthen recovery, normalize runtime settings, expose deployment assumptions clearly, and document the system in beginner-friendly language.

## Project evolution

The original system centered on automated scanning of pages and ranking DOM candidates likely to contain comment or discussion content. Over time, the project expanded in three important ways.

First, the interface moved from a local detector toward a job-oriented application with uploads, persistent storage, background processing, and downloadable exports.

Second, the project added a manual-capture extension so a human can reveal content that automation alone cannot reach, such as collapsed threads, login-gated views, or anti-bot interstitials. This means the product is no longer limited to pure automation; it has become a hybrid collection and labeling tool.

Third, the outputs grew from a single yes-or-no decision into a richer artifact set:

- candidate screenshots
- row-level confidence and review metadata
- manual snapshot artifacts
- candidate review labels
- DOT and SVG graph exports
- spreadsheet and CSV summaries

These additions moved the system closer to a dataset-building and research-support platform rather than a single-purpose detector.

## Current architecture

The deployed architecture consists of:

- a static web frontend
- an API service
- a background worker
- Postgres
- Redis

The frontend uploads CSVs and polls job state.

The API parses input, stores job metadata, exposes result and export endpoints, handles manual snapshot uploads, and regenerates analysis from stored HTML captures.

The worker owns the expensive live-page scanning process. It uses Playwright to load pages, wait for dynamic content, expand likely discussion controls, compute candidate features, and persist results.

Postgres stores durable system state. Redis provides the fast queueing path through BullMQ.

This split is intentional. It allows long-running scans without forcing the API to hold open requests or risk becoming the bottleneck for the whole product.

## Detection and review method

The scanner proposes DOM candidates using repeated structural patterns and content-semantic cues. Each candidate is featurized and scored. The page-level result then aggregates those signals to decide whether user-generated content is present and whether the result is reliable enough to accept automatically.

When automation is insufficient, the system marks rows for manual review instead of collapsing them into a misleading negative. The browser extension can then upload a manual snapshot, which is stored, re-analyzed, and retained alongside the original automated attempt. This is important both operationally and scientifically:

- operationally, it recovers results that headless automation misses
- scientifically, it preserves richer supervision and harder negatives for future model work

## Operational problems discovered

### 1. Stuck database rows

The most visible runtime problem was that some rows remained `running` in the database even though the queue work had effectively stopped.

This happened because the durable state in Postgres and the ephemeral execution state in Redis could diverge. If the worker crashed, stalled, or failed to reach the normal completion path, Postgres could retain the old `running` value indefinitely.

### 2. Apparent serial processing

The worker supported concurrency in principle, but the effective live behavior looked nearly serial. Part of this was configuration: the live queue refill count was too low, and the droplet env file had duplicate keys, so the final effective values were not obvious by inspection.

### 3. Lock loss during long Playwright scans

Worker logs on the droplet showed BullMQ errors consistent with lock expiration during active work, including failures to renew locks and failures when moving jobs to finished or delayed states. That pointed to a mismatch between queue lock timing and the actual duration of scans.

### 4. Deployment inconsistency

The droplet repo had tracked dirty files and a branch different from the local working branch. Even when the code contents were functionally similar, the operational story was weak because the deployment process could not guarantee that the server was rebuilt from the same commit the developer had just tested locally.

### 5. SVG download gap

The API's SVG endpoint returned the correct file and attachment headers, but the web UI relied on a download-link pattern that is unreliable for cross-origin file downloads in browsers. The server was correct; the user experience was still poor.

## Engineering response

### Queue recovery and durable state repair

The worker now performs startup and interval-based recovery to reconcile incomplete Postgres rows with Redis. If work is missing from the queue, the system refills it. If BullMQ indicates a stalled job, the database is updated accordingly. If a row is retrying, it is moved back to `queued`; on a final failure it is moved to `failed`.

This changes the failure mode from "row can remain indefinitely misleading" to "row is periodically repaired or conclusively failed."

### Runtime normalization

The configuration layer now computes a runtime profile from CPU and memory and uses it to cap unsafe worker concurrency. Queue settings are normalized so the refill count does not accidentally underfeed the worker. Recovery interval defaults are explicit rather than accidental.

This is a pragmatic compromise. The system does not attempt perfect auto-scaling, but it does prevent obviously self-defeating local or droplet settings.

### BullMQ lock timing

The worker now derives lock duration, renewal interval, stalled interval, and maximum stalled count from the configured scan timing. This is directly targeted at the lock-loss problem seen in production logs.

The important design choice was not to expose advanced queue tuning as mandatory. Instead, the defaults are derived from the scan profile, and override env vars exist only for exceptional cases.

### Deployment hardening

The deployment script now validates the environment file for duplicate keys and broken queue relationships, and it enforces a cleaner branch-based deployment flow. The operational objective is simple: the droplet should run code from a known branch and known commit, not from an ambiguous mixture of tracked edits and local history.

### Browser-facing SVG downloads

The API now exposes `Content-Disposition` and `Content-Type` through CORS, and the frontend downloads SVG and DOT exports by fetching them, reading the exposed filename header, and saving a blob locally. This makes the cross-port UI/API split much more reliable from the user's point of view.

## Container and image decisions

Both the worker and API images now use Playwright-capable runtimes. This is not just a worker requirement. The API also uses scanner-driven logic for manual-capture reanalysis and stored HTML graph generation, so production API images must have a compatible browser runtime available.

This decision costs image size, but it removes a class of runtime mismatch that would otherwise show up only after deployment.

## Verified deployment capacity

The droplet hostname still implied `1 vCPU / 512 MB`, but direct inspection on March 29, 2026 showed the actual machine was approximately:

- `2 vCPU`
- `1.9 GiB RAM`

That made a conservative but real degree of parallelism appropriate. The recommended starting deployment profile remains:

- `WORKER_CONCURRENCY=2`
- `INITIAL_QUEUE_FILL=4`
- `QUEUE_REFILL_COUNT=2`
- `QUEUE_RECOVERY_INTERVAL_MS=30000`

This choice favors stability over maximum throughput. A higher concurrency may be possible later, but Playwright memory and CPU usage are bursty enough that the safer first target is two concurrent rows rather than three or more.

## Local, GitHub, and droplet consistency model

An important operational clarification is that there are three distinct repositories involved in practice:

1. the developer's local clone
2. the GitHub remote
3. the droplet's server-side clone

Consistency means more than "the files look similar." It means:

- the same branch is intended for deployment
- the same commit exists in local and remote history
- the droplet checks out that branch
- Docker rebuilds from that exact checkout
- the live env file matches the intended runtime settings

This distinction matters for later supervision, auditing, and paper writing because otherwise it becomes impossible to say with confidence which code produced which observed behavior.

## Why these fixes matter for the research story

The research value of the system depends on repeatability and credible artifact generation. A detector that sometimes leaves rows stuck, sometimes runs on a dirty untracked server state, and sometimes fails to let users retrieve its graph artifacts weakens both practical use and scientific reporting.

The recent work therefore contributes indirectly to methodology:

- it improves dataset integrity by reducing silent or ambiguous failure states
- it strengthens reproducibility by tying deployments to explicit branches and commits
- it improves auditability by preserving richer operational documentation
- it makes human-in-the-loop review more usable by fixing graph export handling

## Remaining limitations

Several important limitations still remain.

Shared artifact storage is still local to the droplet rather than object storage. That is acceptable for the current single-host DigitalOcean setup but not yet ideal for multi-host or more durable production use.

The verification flow still depends heavily on operational checks and live scanning rather than a broad automated test suite.

Concurrency remains conservative. The system is safer now, but not yet aggressively optimized.

The deployment branch structure is improved, but a later merge or release policy is still needed so fixes do not remain permanently isolated on ad hoc deployment branches.

## Recommended next research-writing uses of this note

This document can later support:

- a systems subsection describing the deployed architecture
- a limitations subsection on operational robustness
- a methodology subsection on hybrid automation and manual capture
- a reproducibility appendix covering environment control and deployment consistency

## Short conclusion

As of March 29, 2026, the project had crossed an important threshold. It was no longer only about detecting comment regions accurately; it also had to behave like a reliable data system. The queue-recovery, lock-timing, deployment-consistency, and download-path fixes were therefore not peripheral maintenance. They were required for the application to be trustworthy enough to support later product use, data collection, and research writing.
