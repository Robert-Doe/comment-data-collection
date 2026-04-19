# Claude Handoff

## Goal

Fix the Model Lab overview so it shows the selected job's live statistics correctly, and make sure no existing labeled data, reviewed items, or job history is destroyed while doing it.

## What the overview should do

- When I select a job, the Overview panel on the model page should show that job's stats immediately.
- It should show live job counts such as total URLs, completed, failed, detected, pending, queued, and running.
- It should not fall back to the empty "No modeling overview available" state just because the modeling dataset has no labeled rows yet.
- The overview should keep refreshing while a job scope is selected so the numbers stay current.
- It should also show the old-style modeling statistics for the selected job, including positive candidates, negative labeled, labeled items, unlabeled or remaining items, and how many are left to go.
- If it is practical, add graphs or charts to make the overview more useful, as long as they do not hide or replace the plain statistics.
- The overview should remain useful even when the job is partially complete or has mixed reviewed and unreviewed content.

## Data safety rules

- Do not overwrite existing labeled content.
- Do not delete or replace completed items unless I explicitly ask for that.
- Do not destroy source jobs when combining jobs.
- Keep backups additive and non-destructive.
- Importing a backup must merge missing rows only, not replace existing rows.

## Job merge behavior

- Combining two jobs should create a new aggregate job.
- The original jobs must remain intact.
- Their completed and reviewed items must stay available.
- The merged job should carry copied rows and lineage, not mutate the source jobs.

## Backup behavior

- Export should support JSON and `.db`.
- Import should accept JSON or `.db`.
- Backup import should be safe to run on a live project without wiping data.

## Acceptance criteria

- Selecting a job on the model page shows its live statistics.
- The overview includes positive candidate counts, negative labeled counts, total labeled items, and remaining items left to process.
- The page remains useful even if the selected job has no labeled candidate rows yet.
- If charts are added, they should complement the summary instead of replacing it.
- Existing labeled data still exists after refreshes, job merges, and backup imports.
- No source job is overwritten during merge.

## Notes

- If there is a difference between the global modeling overview and the per-job overview, the selected job view should still show the job summary directly.
- Prefer fixing the UI to read the job summary endpoint directly instead of depending only on the modeling dataset.
