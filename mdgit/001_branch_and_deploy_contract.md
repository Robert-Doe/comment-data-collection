# Branch And Deploy Contract

## Current contract

- `master` is the local working branch.
- `digitalocean-master` is the droplet deployment branch.
- Both branches should be fast-forwarded together when the change is intended for local and production.

## Deployment path

1. Commit the code on `master`.
2. Push `master` and `digitalocean-master` to origin.
3. Pull `digitalocean-master` on the droplet.
4. Rebuild the compose stack there.

## What to avoid

- Do not rely on uncommitted local edits for the droplet.
- Do not let local-only scratch files leak into the deploy branch.
- Do not keep the two branches intentionally divergent unless the change is explicitly environment-specific.
