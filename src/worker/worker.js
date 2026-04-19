'use strict';

const { Worker } = require('bullmq');

const { getConfig } = require('../shared/config');
const {
  ensureSchema,
  getJob,
  markItemRunning,
  markItemCompleted,
  markItemFailed,
  recomputeJob,
  setItemStatus,
  appendJobEvent,
} = require('../shared/store');
const { SCAN_QUEUE_NAME, createRedisConnection, getSharedQueue } = require('../shared/queue');
const { fillQueueForJob, recoverIncompleteJobs } = require('../shared/jobQueue');
const { scanUrl, deriveManualCaptureState, closeBrowser } = require('../shared/scanner');
const { sendTerminalNotification } = require('../shared/notifications');

async function main() {
  const config = getConfig();
  await ensureSchema(config.databaseUrl);

  const connection = createRedisConnection(config.redisUrl);
  const queue = getSharedQueue(config.redisUrl);

  async function refillJob(jobId) {
    await fillQueueForJob(jobId, config.queueRefillCount, config.databaseUrl, queue);
  }

  async function noteEvent(event) {
    return appendJobEvent(event, config.databaseUrl).catch((error) => {
      console.error(`failed to append job event for ${event && event.jobId ? event.jobId : 'unknown'}: ${error && error.message ? error.message : error}`);
      return null;
    });
  }

  async function noteTerminalJobState(jobId) {
    const job = await getJob(jobId, config.databaseUrl).catch((error) => {
      console.error(`failed to load job ${jobId} for terminal event: ${error && error.message ? error.message : error}`);
      return null;
    });
    if (!job || !['completed', 'completed_with_errors', 'failed'].includes(job.status)) {
      return;
    }

    const event = await noteEvent({
      jobId,
      scope: 'job',
      level: job.status === 'completed' ? 'info' : 'warn',
      eventType: 'job_terminal',
      eventKey: `job_terminal:${job.status}`,
      message: `Job ${job.status}. Completed ${job.completed_count}/${job.total_urls}; failed ${job.failed_count}.`,
      details: {
        status: job.status,
        total_urls: job.total_urls,
        completed_count: job.completed_count,
        failed_count: job.failed_count,
        detected_count: job.detected_count,
        finished_at: job.finished_at || '',
      },
    });
    if (!event) {
      return;
    }

    sendTerminalNotification(config, job).catch(async (notificationError) => {
      const message = notificationError && notificationError.message ? notificationError.message : String(notificationError);
      console.error(`job terminal notification failed for ${jobId}: ${message}`);
      await noteEvent({
        jobId,
        scope: 'notification',
        level: 'warn',
        eventType: 'notification_error',
        message: `Failed to send job-finished email: ${message}`,
      });
    });
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
    const reconciledCount = Number(summary && summary.reconciled ? (summary.reconciled.updatedCount ?? 0) : 0);
    const staleRecoveredCount = Number(
      summary && summary.reconciled ? (summary.reconciled.staleActiveRecoveredCount ?? 0) : 0,
    );
    const refilledCount = Number(summary && summary.refilled ? (summary.refilled.claimedCount ?? 0) : 0);

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
        candidateMode,
      } = job.data;

      try {
        await markItemRunning(itemId, config.databaseUrl);
        await recomputeJob(jobId, config.databaseUrl);

        const scanResult = await scanUrl(normalizedUrl, {
          timeoutMs: config.scanTimeoutMs,
          postLoadDelayMs: scanDelayMs ?? config.postLoadDelayMs,
          preScreenshotDelayMs: screenshotDelayMs ?? config.preScreenshotDelayMs,
          candidateMode: candidateMode || 'default',
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
          await noteEvent({
            jobId,
            itemId,
            rowNumber,
            scope: 'item',
            level: 'warn',
            eventType: 'item_failed',
            eventKey: `item_terminal:${itemId}`,
            message: `Row ${rowNumber} failed: ${scanResult.error || scanResult.access_reason || 'Scan failed'}`,
            details: {
              normalized_url: normalizedUrl,
              manual_capture_required: !!scanResult.manual_capture_required,
              manual_capture_reason: scanResult.manual_capture_reason || '',
            },
          });
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
          await noteEvent({
            jobId,
            itemId,
            rowNumber,
            scope: 'item',
            level: 'warn',
            eventType: 'item_retry_scheduled',
            eventKey: `item_retry:${itemId}:${nextAttemptNumber}`,
            message: `Row ${rowNumber} failed on attempt ${nextAttemptNumber}/${maxAttempts}; retrying.`,
            details: {
              normalized_url: normalizedUrl,
              error_message: error && error.message ? error.message : String(error),
              next_attempt: nextAttemptNumber + 1,
              max_attempts: maxAttempts,
            },
          });
        } else {
          await markItemFailed(itemId, error, config.databaseUrl).catch((markError) => {
            console.error(`failed to persist terminal error for item ${itemId}: ${markError && markError.message ? markError.message : markError}`);
          });
          await noteEvent({
            jobId,
            itemId,
            rowNumber,
            scope: 'item',
            level: 'error',
            eventType: 'item_failed',
            eventKey: `item_terminal:${itemId}`,
            message: `Row ${rowNumber} failed: ${error && error.message ? error.message : error}`,
            details: {
              normalized_url: normalizedUrl,
              max_attempts: maxAttempts,
            },
          });
        }

        throw error;
      } finally {
        await recomputeJob(jobId, config.databaseUrl).catch((recomputeError) => {
          console.error(`failed to recompute job ${jobId}: ${recomputeError && recomputeError.message ? recomputeError.message : recomputeError}`);
        });
        await noteTerminalJobState(jobId).catch((eventError) => {
          console.error(`failed to note terminal job state for ${jobId}: ${eventError && eventError.message ? eventError.message : eventError}`);
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
    await noteEvent({
      jobId: job.data.jobId,
      itemId: job.data.itemId,
      rowNumber: job.data.rowNumber,
      scope: 'item',
      level: 'error',
      eventType: 'item_failed',
      eventKey: `item_terminal:${job.data.itemId}`,
      message: `Row ${job.data.rowNumber} failed: ${error && error.message ? error.message : error}`,
      details: {
        normalized_url: job.data.normalizedUrl || '',
        max_attempts: maxAttempts,
      },
    });
    await recomputeJob(job.data.jobId, config.databaseUrl).catch((recomputeError) => {
      console.error(`failed to recompute fallback final job state for ${job.data.jobId}: ${recomputeError && recomputeError.message ? recomputeError.message : recomputeError}`);
    });
    await noteTerminalJobState(job.data.jobId).catch((eventError) => {
      console.error(`failed to note fallback terminal job state for ${job.data.jobId}: ${eventError && eventError.message ? eventError.message : eventError}`);
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

    await noteEvent({
      jobId: stalledJob.data.jobId,
      itemId,
      rowNumber: stalledJob.data.rowNumber,
      scope: 'queue',
      level: 'warn',
      eventType: 'item_stalled',
      message: `Row ${stalledJob.data.rowNumber} stalled and was returned to the queue.`,
      details: {
        normalized_url: stalledJob.data.normalizedUrl || '',
      },
    });

    await recomputeJob(stalledJob.data.jobId, config.databaseUrl).catch((recomputeError) => {
      console.error(`failed to recompute stalled job ${stalledJob.data.jobId}: ${recomputeError && recomputeError.message ? recomputeError.message : recomputeError}`);
    });
  });

  await runQueueRecovery('startup');

  // Control channel: allows admin panel to trigger graceful restart
  const controlSub = createRedisConnection(config.redisUrl);
  controlSub.subscribe('ugc:control').catch(() => {});
  controlSub.on('message', (_channel, msg) => {
    if (msg === 'restart') {
      console.log('Received restart signal via control channel, shutting down...');
      shutdown().catch(() => process.exit(1));
    }
  });

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
