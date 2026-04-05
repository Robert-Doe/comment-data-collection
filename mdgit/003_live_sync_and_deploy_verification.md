# Live Sync And Deploy Verification

## Current state

- `master` and `digitalocean-master` now point to the same commit: `56e3826`.
- The local branch ref for `digitalocean-master` was updated to match `origin/digitalocean-master`.
- Local dev and the droplet are both serving the versioned UI bundle paths.

## Verified runtime signals

- Local health: `{"ok":true,"mode":"local"}`
- Local jobs API shows active work with `running_count=5` and `queued_count=5` on the selected job.
- Remote health: `{"ok":true}`
- Remote jobs API shows active work with `running_count=7` and `queued_count=82` on the selected job.

## Decision

- Keep `master` as the local development branch.
- Keep `digitalocean-master` as the deploy branch for the droplet.
- Keep the branch refs fast-forwarded together unless a change is explicitly environment-specific.
- Keep the `mdgit` folder updated whenever the deploy contract or runtime baseline changes.
