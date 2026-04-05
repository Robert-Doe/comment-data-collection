# Job Progress And Concurrency Notes

## Current conclusion

- The job list API is working on both local and remote.
- The visible inconsistency was runtime concurrency, not missing job records.
- The local dev runtime defaulted too low when no env file was present.
- The droplet env also needed to be aligned with the higher worker setting.

## Current intended baseline

- `WORKER_CONCURRENCY=5`
- `INITIAL_QUEUE_FILL=10`
- `QUEUE_REFILL_COUNT=5`

## User-facing effect

- The homepage should show more active jobs at once.
- The queue should stay warm instead of draining to a small active set.
- Local and droplet should behave the same after restart/redeploy.
