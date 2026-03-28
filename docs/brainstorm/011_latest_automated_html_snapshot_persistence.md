# Automated HTML Snapshot Persistence

## Problem

The graph controls were disabled for most review rows because the app only had stored HTML for manual uploads.

That meant:

- manual snapshot rows could export DOT/SVG
- ordinary automated scan rows could not

This was too restrictive for the intended review workflow.

## Change

Automated scans now persist their HTML snapshot artifacts as part of the normal scan pipeline.

That means newly completed automated rows can now provide:

- stored HTML snapshot files
- DOT graph export
- SVG graph rendering

## Practical Effect

For new scan results after this change:

- the graph buttons should enable on automated rows
- the row can be reviewed without first doing a manual upload

## Limitation

Rows completed before this change still do not have stored HTML in the state/database.

Those older rows cannot be backfilled from the existing saved result alone, because the DOM snapshot was never persisted.

So for older rows:

- graph buttons remain disabled
- a rescan or fresh run is required if graph export is needed

## Local Runner Note

The local runtime was also updated to resume incomplete jobs after restart by converting `queued` and `running` items back to `pending` and refilling the queue.

That was necessary so the snapshot-persistence change could be applied without permanently stranding the current local run.
