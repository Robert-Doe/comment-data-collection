# Fix: Live URL Probe Hangs at Step 1 in Priority Mode

## Problem

The Live URL Probe in the Model Lab would always get stuck at "1/5 scan steps — Navigation completed" when **Priority Scan** was enabled. The probe never progressed to step 2 (page settle / candidate collection).

Non-priority probes with an explicit timeout (e.g. 300 000 ms) eventually timed out, but priority probes (no timeout) hung indefinitely.

## Root cause

### The Playwright `timeout: 0` trap

Playwright's page API treats `{ timeout: 0 }` as **"wait forever with no timeout"**, not "skip this wait and return immediately". This is the opposite of what most Node.js APIs do with 0-values.

### How priority probe triggered the hang

1. The user enables **Priority Scan** (`priorityProbe = true`).
2. The route handler sets `timeoutMs = 0` (no deadline).
3. Inside `scanUrl()`, `settlePageForDetection()` is called.
4. Because `priorityProbe = true`, both `loadWaitMs` and `networkIdleWaitMs` are set to `0` — intended to mean "don't wait at all".
5. The settle function calls `safeWait(page, 'networkidle', 0)`.
6. `safeWait` passes `{ timeout: 0 }` directly to `page.waitForLoadState('networkidle', ...)`.
7. Playwright waits **forever** for networkidle.
8. Sites like Birdeye, Reddit, and most modern SPAs continuously fire background requests, so `networkidle` never fires.
9. The probe hangs permanently at step 1.

The same bug affected `safeWaitForFunction` (used by `waitForDocumentComplete`), which also got `timeoutMs = 0` in the same code path.

## Fix

Add an early-return guard at the top of both helper functions:

```javascript
// src/shared/scanner.js

async function safeWait(page, state, timeoutMs) {
  if (!timeoutMs || timeoutMs <= 0) return;   // ← added
  try {
    await page.waitForLoadState(state, { timeout: timeoutMs });
  } catch (_) { return; }
}

async function safeWaitForFunction(page, expression, timeoutMs) {
  if (!timeoutMs || timeoutMs <= 0) return;   // ← added
  try {
    await page.waitForFunction(expression, { timeout: timeoutMs });
  } catch (_) { return; }
}
```

When `priorityProbe = true` and the caller passes `0`, both functions now return immediately instead of blocking forever on Playwright. The settle function still runs all the scrolling, UGC expansion, and consent-dismissal steps — only the network-idle waits are skipped, which is the intended priority-probe behaviour.

## Stages of the 5-step live probe

| Step | Progress | What happens |
|------|----------|--------------|
| 0 → 1 | 0 % | **Navigate** — loads the URL, follows redirects |
| 1 → 2 | 20 % | **Settle** — scrolls, dismisses consent banners, waits for stable DOM **(this is where it was hanging)** |
| 2 → 3 | 40 % | **Collect candidates** — runs the candidate-detection heuristics; retries once if nothing found |
| 3 → 4 | 60 % | **Screenshot & HTML snapshot** — captures visual evidence |
| 4 → 5 | 80 % | **Score** — runs the trained model against each candidate; builds the verdict |

## Why priority mode exists

Priority mode removes the hard wall-clock deadline so the browser can spend as long as needed on slow or JavaScript-heavy pages. It is not supposed to skip the settle phase — just skip the network-idle *waiting*, which is different. The fix preserves that distinction correctly.

## Affected files

- `src/shared/scanner.js` — `safeWait` and `safeWaitForFunction`

## Date

2026-04-19
