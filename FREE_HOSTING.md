# Free Hosting Options

This branch adds a true free-mode deployment path for demos and low-volume testing.

## Best Free Option In This Repo

Use [render.free.yaml](C:/Users/bobcumulus/IdeaProjects/comment-data-collection/render.free.yaml).

It deploys the whole app as one Docker web service:

- UI
- API
- in-process queue
- Playwright scans
- manual review uploads

It reuses [src/local/dev-server.js](C:/Users/bobcumulus/IdeaProjects/comment-data-collection/src/local/dev-server.js), which already serves the frontend and runs scans in the same process.

## Why This Exists

The main [render.yaml](C:/Users/bobcumulus/IdeaProjects/comment-data-collection/render.yaml) is a proper multi-service architecture:

- static site
- API
- background worker
- Key Value
- Postgres

That is the right production shape, but it is not free because background workers are not available on Render's free plan.

## Free-Mode Limitations

This mode is for testing, demos, and small review sessions only.

- data is stored on local container disk
- screenshots and HTML snapshots are stored on local container disk
- Render free web services can restart or spin down
- state can be lost on redeploy/restart
- scans run in a single process with low concurrency
- this is not durable production storage

## Deploying Free Mode On Render

1. Push this branch to GitHub.
2. In Render, click `New` > `Blueprint`.
3. Point Render at this repo and this branch.
4. Use `render.free.yaml` as the blueprint file.
5. Deploy.

The result is a single free web service.

## Other Free Hosting That Can Work

These can work better than Render free if you want a single container with Playwright:

- Oracle Cloud Always Free VM
  - best free option if you want durability and full control
  - you can run Docker Compose or the whole app directly on the VM
- Google Cloud Run free tier
  - can run a single Docker service
  - better for stateless/demo use than durable storage
- Koyeb free web service
  - can run one Docker web service
  - good fit for the same single-service mode used in this branch

## Recommendation

- If you want the easiest zero-cost demo: use [render.free.yaml](C:/Users/bobcumulus/IdeaProjects/comment-data-collection/render.free.yaml)
- If you want the best actual free host for the whole app: use Oracle Cloud Always Free VM
- If you want the real durable architecture: use the main [render.yaml](C:/Users/bobcumulus/IdeaProjects/comment-data-collection/render.yaml) and pay for the worker stack
