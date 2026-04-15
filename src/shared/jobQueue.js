'use strict';

const {
  claimPendingItems,
  recomputeJob,
  releaseQueuedItems,
  getJob,
  listIncompleteJobs,
  listJobItemsByStatuses,
  setItemStatus,
} = require('./store');
const { enqueueScanItems } = require('./queue');
const { extractJobScanSettings } = require('./jobSettings');

async function fillQueueForJob(jobId, count, databaseUrl, queue) {
  const limit = Math.max(0, Number(count) || 0);
  if (!limit) return [];

  const job = await getJob(jobId, databaseUrl);
  const jobSettings = extractJobScanSettings(job, {
    scanDelayMs: 6000,
    screenshotDelayMs: 1500,
    candidateMode: 'default',
  });
  const claimedItems = await claimPendingItems(jobId, limit, databaseUrl);
  if (!claimedItems.length) {
    await recomputeJob(jobId, databaseUrl);
    return [];
  }

  try {
    await enqueueScanItems(queue, claimedItems.map((item) => ({
      jobId,
      itemId: item.id,
      rowNumber: item.row_number,
      normalizedUrl: item.normalized_url,
      scanDelayMs: jobSettings.scanDelayMs,
      screenshotDelayMs: jobSettings.screenshotDelayMs,
      candidateMode: jobSettings.candidateMode,
    })));
    await recomputeJob(jobId, databaseUrl);
    return claimedItems;
  } catch (error) {
    await releaseQueuedItems(claimedItems.map((item) => item.id), databaseUrl);
    await recomputeJob(jobId, databaseUrl);
    throw error;
  }
}

function mapQueueStateToItemStatus(queueState) {
  switch (queueState) {
    case 'active':
      return 'running';
    case 'waiting':
    case 'waiting-children':
    case 'prioritized':
    case 'delayed':
    case 'paused':
      return 'queued';
    default:
      return 'pending';
  }
}

function timestampToMs(value) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

async function hasQueueJobLock(queue, jobId) {
  const client = await queue.client;
  const exists = await client.exists(`${queue.toKey(jobId)}:lock`);
  return exists > 0;
}

async function reclaimStaleActiveJob(queue, item, activeStaleAfterMs, nowMs) {
  const staleAfterMs = Math.max(0, Number(activeStaleAfterMs) || 0);
  if (!staleAfterMs) {
    return false;
  }

  const updatedAtMs = timestampToMs(item.updated_at);
  if (!updatedAtMs || nowMs - updatedAtMs < staleAfterMs) {
    return false;
  }

  const hasLock = await hasQueueJobLock(queue, item.id);
  if (hasLock) {
    return false;
  }

  try {
    await queue.remove(item.id);
    return true;
  } catch (error) {
    console.warn(`queue stale active cleanup failed for item ${item.id}: ${error && error.message ? error.message : error}`);
    return false;
  }
}

async function reconcileQueueState(databaseUrl, queue, options = {}) {
  const items = await listJobItemsByStatuses(
    ['queued', 'running'],
    { limit: Math.max(1, Number(options.limit) || 1000) },
    databaseUrl,
  );
  if (!items.length) {
    return {
      scannedCount: 0,
      updatedCount: 0,
      staleActiveRecoveredCount: 0,
      jobIds: [],
    };
  }

  const touchedJobIds = new Set();
  let updatedCount = 0;
  let staleActiveRecoveredCount = 0;
  const activeStaleAfterMs = Math.max(0, Number(options.activeStaleAfterMs) || 0);

  for (const item of items) {
    let nextStatus = 'pending';

    try {
      const queueJob = await queue.getJob(item.id);
      if (queueJob) {
        const queueState = await queueJob.getState();
        if (queueState === 'active') {
          const reclaimed = await reclaimStaleActiveJob(queue, item, activeStaleAfterMs, Date.now());
          if (reclaimed) {
            nextStatus = 'pending';
            staleActiveRecoveredCount += 1;
          } else {
            nextStatus = 'running';
          }
        } else {
          nextStatus = mapQueueStateToItemStatus(queueState);
        }
      }
    } catch (error) {
      console.error(`queue reconciliation failed for item ${item.id}: ${error && error.message ? error.message : error}`);
      continue;
    }

    if (nextStatus === item.status) {
      continue;
    }

    await setItemStatus(item.id, nextStatus, databaseUrl);
    touchedJobIds.add(item.job_id);
    updatedCount += 1;
  }

  for (const jobId of touchedJobIds) {
    await recomputeJob(jobId, databaseUrl);
  }

  return {
    scannedCount: items.length,
    updatedCount,
    staleActiveRecoveredCount,
    jobIds: Array.from(touchedJobIds),
  };
}

async function refillIncompleteJobs(databaseUrl, queue, targetInFlightPerJob) {
  const jobs = await listIncompleteJobs(100, databaseUrl);
  let claimedCount = 0;

  for (const job of jobs) {
    const pendingCount = Math.max(0, Number(job.pending_count) || 0);
    const inFlightCount = Math.max(0, Number(job.queued_count) || 0) + Math.max(0, Number(job.running_count) || 0);
    const desiredCount = Math.max(1, Number(targetInFlightPerJob) || 1);
    const refillCount = Math.min(pendingCount, Math.max(0, desiredCount - inFlightCount));

    if (!refillCount) {
      continue;
    }

    const claimedItems = await fillQueueForJob(job.id, refillCount, databaseUrl, queue);
    claimedCount += claimedItems.length;
  }

  return {
    jobCount: jobs.length,
    claimedCount,
  };
}

async function recoverIncompleteJobs(databaseUrl, queue, options = {}) {
  const reconciled = await reconcileQueueState(databaseUrl, queue, {
    limit: options.reconcileLimit,
    activeStaleAfterMs: options.activeStaleAfterMs,
  });
  const refilled = await refillIncompleteJobs(
    databaseUrl,
    queue,
    Math.max(1, Number(options.targetInFlightPerJob) || 1),
  );

  return {
    reconciled,
    refilled,
  };
}

module.exports = {
  fillQueueForJob,
  reconcileQueueState,
  refillIncompleteJobs,
  recoverIncompleteJobs,
};
