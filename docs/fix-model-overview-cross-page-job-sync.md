# Fix: Model Lab Overview Cross-Page Job Sync

## Problem

Opening a job on the Scanner page did not update the Model Lab Overview panel. The Overview panel showed either global stats (all jobs) or nothing, even after navigating to the Model Lab after selecting a job in the Scanner.

## Root cause

The Scanner page (`index.html` / `app.js`) and the Model Lab page (`modeling.html` / `modeling.js`) are separate pages with no shared state mechanism. The Scanner stored the selected job only in:
- A JavaScript variable (`currentJobId`) — not persistent
- The URL query parameter (`?jobId=`) — only on the Scanner page URL

The Model Lab had no way to know which job was last opened in the Scanner.

## Fix

Use `localStorage` as a lightweight cross-page message bus.

### Changes

**`web/app.js`**  
When a job is opened in the Scanner (inside `refreshJob()`), after updating the URL, save the job ID:
```javascript
try { localStorage.setItem('ugc_selected_job_id', jobId); } catch (_) {}
```

**`web/modeling.js`**  
1. On page load, read `localStorage` as a fallback after URL params when initialising `initialOverviewScope`:
```javascript
|| (function () { try { return localStorage.getItem('ugc_selected_job_id') || ''; } catch (_) { return ''; } }())
```
2. Add a `storage` event listener so that if both pages are open simultaneously (different tabs), the Model Lab updates in real time when the Scanner changes jobs:
```javascript
window.addEventListener('storage', (event) => {
  if (event.key !== 'ugc_selected_job_id' || !overviewJobIds) return;
  const incoming = event.newValue || '';
  if (incoming === overviewJobIds.value) return;
  overviewJobIds.value = incoming;
  refreshOverview().catch(() => {});
});
```

## Behaviour after fix

- Open a job on the Scanner page → Model Lab automatically shows that job's stats when you navigate to it
- Both pages open in separate tabs → switching jobs in the Scanner immediately updates the Model Lab
- The overview shows live job counts (status, total URLs, completed, failed, detected, pending/queued/running) plus modeling dataset stats (labeled candidates, positive/negative labels, reviewed items, etc.)
- Stats refresh every 5 seconds while a job scope is active

## Date

2026-04-19
