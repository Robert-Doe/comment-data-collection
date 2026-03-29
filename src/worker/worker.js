'use strict';

const { Worker } = require('bullmq');

const { getConfig } = require('../shared/config');
const {
  ensureSchema,
  markItemRunning,
  markItemCompleted,
  markItemFailed,
  recomputeJob,
  setItemStatus,
} = require('../shared/store');
const { SCAN_QUEUE_NAME, createRedisConnection, getSharedQueue } = require('../shared/queue');
const { fillQueueForJob, recoverIncompleteJobs } = require('../shared/jobQueue');
const { scanUrl, deriveManualCaptureState, closeBrowser } = require('../shared/scanner');

async function main() {
  const config = getConfig();
  await ensureSchema(config.databaseUrl);

  const connection = createRedisConnection(config.redisUrl);
  const queue = getSharedQueue(config.redisUrl);

  async function refillJob(jobId) {
    await fillQueueForJob(jobId, config.queueRefillCount, config.databaseUrl, queue);
  }

  async function runQueueRecovery(reason) {
    const summary = await recoverIncompleteJobs(config.databaseUrl, queue, {
      reconcileLimit: Math.max(1000, config.initialQueueFill * 250),
      targetInFlightPerJob: config.initialQueueFill,
      activeStaleAfterMs: Math.max(
        60000,
        config.workerLockRenewTimeMs,
      ),
    });
    const reconciledCount = Number(summary && summary.reconciled ? summary.reconciled.updatedCount : 0);
    const staleRecoveredCount = Number(
      summary && summary.reconciled ? summary.reconciled.staleActiveRecoveredCount : 0,
    );
    const refilledCount = Number(summary && summary.refilled ? summary.refilled.claimedCount : 0);

    if (reason !== 'interval' || reconciledCount > 0 || refilledCount > 0 || staleRecoveredCount > 0) {
      console.log(
        `queue recovery (${reason}) reconciled=${reconciledCount}` +
        ` staleRecovered=${staleRecoveredCount}` +
        ` refilled=${refilledCount}`,
      );
    }
  }

  const worker = new Worker(
    SCAN_QUEUE_NAME,
    async (job) => {
      const {
        jobId,
        itemId,
        rowNumber,
        normalizedUrl,
        scanDelayMs,
        screenshotDelayMs,
      } = job.data;

      try {
        await markItemRunning(itemId, config.databaseUrl);
        await recomputeJob(jobId, config.databaseUrl);

        const scanResult = await scanUrl(normalizedUrl, {
          timeoutMs: config.scanTimeoutMs,
          postLoadDelayMs: scanDelayMs ?? config.postLoadDelayMs,
          preScreenshotDelayMs: screenshotDelayMs ?? config.preScreenshotDelayMs,
          navigationRetries: config.navigationRetries,
          loadSettlePasses: config.loadSettlePasses,
          negativeRetrySettlePasses: config.negativeRetrySettlePasses,
          actionSettleMs: config.actionSettleMs,
          maxCandidates: config.maxCandidates,
          maxResults: config.maxResults,
          captureScreenshots: config.captureScreenshots,
          captureHtmlSnapshots: config.captureHtmlSnapshots,
          artifactRoot: config.artifactRoot,
          artifactUrlBasePath: config.artifactUrlBasePath,
          publicBaseUrl: config.publicBaseUrl,
          jobId,
          itemId,
          rowNumber,
        });
        const manualState = deriveManualCaptureState(scanResult, 'automated');
        scanResult.analysis_source = 'automated';
        scanResult.manual_capture_required = manualState.required;
        scanResult.manual_capture_reason = manualState.reason;

        if (scanResult.error) {
          await markItemFailed(itemId, scanResult, config.databaseUrl);
        } else {
          await markItemCompleted(itemId, scanResult, config.databaseUrl);
        }
      } catch (error) {
        const maxAttempts = Math.max(1, Number(job.opts && job.opts.attempts) || 1);
        const nextAttemptNumber = Math.max(1, Number(job.attemptsMade || 0) + 1);
        const hasMoreRetries = nextAttemptNumber < maxAttempts;

        if (hasMoreRetries) {
          await setItemStatus(itemId, 'queued', config.databaseUrl).catch((statusError) => {
            console.error(`failed to reset item ${itemId} for retry: ${statusError && statusError.message ? statusError.message : statusError}`);
          });
        } else {
          await markItemFailed(itemId, error, config.databaseUrl).catch((markError) => {
            console.error(`failed to persist terminal error for item ${itemId}: ${markError && markError.message ? markError.message : markError}`);
          });
        }

        throw error;
      } finally {
        await recomputeJob(jobId, config.databaseUrl).catch((recomputeError) => {
          console.error(`failed to recompute job ${jobId}: ${recomputeError && recomputeError.message ? recomputeError.message : recomputeError}`);
        });
        await refillJob(jobId).catch((refillError) => {
          console.error(`failed to refill job ${jobId}: ${refillError && refillError.message ? refillError.message : refillError}`);
        });
      }
    },
    {
      connection,
      concurrency: config.workerConcurrency,
      lockDuration: config.workerLockDurationMs,
      lockRenewTime: config.workerLockRenewTimeMs,
      stalledInterval: config.workerStalledIntervalMs,
      maxStalledCount: config.workerMaxStalledCount,
    },
  );

  worker.on('completed', (job) => {
    console.log(`completed ${job.id}`);
  });

  worker.on('failed', async (job, error) => {
    console.error(`failed ${job ? job.id : 'unknown'}: ${error && error.message ? error.message : error}`);

    if (!job || !job.data) {
      return;
    }

    const maxAttempts = Math.max(1, Number(job.opts && job.opts.attempts) || 1);
    const attemptsMade = Math.max(0, Number(job.attemptsMade) || 0);
    if (attemptsMade < maxAttempts) {
      return;
    }

    await markItemFailed(job.data.itemId, error, config.databaseUrl).catch((markError) => {
      console.error(`failed to persist fallback final error for item ${job.data.itemId}: ${markError && markError.message ? markError.message : markError}`);
    });
    await recomputeJob(job.data.jobId, config.databaseUrl).catch((recomputeError) => {
      console.error(`failed to recompute fallback final job state for ${job.data.jobId}: ${recomputeError && recomputeError.message ? recomputeError.message : recomputeError}`);
    });
  });

  worker.on('stalled', async (itemId) => {
    console.error(`stalled ${itemId}`);
    await setItemStatus(itemId, 'queued', config.databaseUrl).catch((statusError) => {
      console.error(`failed to sync stalled item ${itemId}: ${statusError && statusError.message ? statusError.message : statusError}`);
    });

    const stalledJob = await queue.getJob(itemId).catch(() => null);
    if (!stalledJob || !stalledJob.data || !stalledJob.data.jobId) {
      return;
    }

    await recomputeJob(stalledJob.data.jobId, config.databaseUrl).catch((recomputeError) => {
      console.error(`failed to recompute stalled job ${stalledJob.data.jobId}: ${recomputeError && recomputeError.message ? recomputeError.message : recomputeError}`);
    });
  });

  await runQueueRecovery('startup');

  const recoveryTimer = config.queueRecoveryIntervalMs > 0
    ? setInterval(() => {
      runQueueRecovery('interval').catch((error) => {
        console.error(`queue recovery (interval) failed: ${error && error.message ? error.message : error}`);
      });
    }, config.queueRecoveryIntervalMs)
    : null;
  if (recoveryTimer && typeof recoveryTimer.unref === 'function') {
    recoveryTimer.unref();
  }

  const shutdown = async () => {
    if (recoveryTimer) {
      clearInterval(recoveryTimer);
    }
    await worker.close().catch(() => {});
    await queue.close().catch(() => {});
    await closeBrowser().catch(() => {});
    await connection.quit().catch(() => {});
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  if (config.requestedWorkerConcurrency !== config.workerConcurrency) {
    console.warn(
      `requested WORKER_CONCURRENCY=${config.requestedWorkerConcurrency} was reduced to ${config.workerConcurrency}` +
      ` for a host with ${config.runtimeProfile.cpuCount} CPU(s) and ${config.runtimeProfile.totalMemoryMb} MiB RAM`,
    );
  }
  if (config.requestedInitialQueueFill !== config.initialQueueFill) {
    console.warn(`INITIAL_QUEUE_FILL was raised to ${config.initialQueueFill} to keep the worker queue warm`);
  }
  if (config.requestedQueueRefillCount !== config.queueRefillCount) {
    console.warn(`QUEUE_REFILL_COUNT was adjusted to ${config.queueRefillCount} to match worker parallelism`);
  }
  console.log(
    `ugc-worker listening with concurrency=${config.workerConcurrency}` +
    ` lockDuration=${config.workerLockDurationMs}ms` +
    ` renew=${config.workerLockRenewTimeMs}ms` +
    ` stalledInterval=${config.workerStalledIntervalMs}ms`,
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exitCode = 1;
  });
}
