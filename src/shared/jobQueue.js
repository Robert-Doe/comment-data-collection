'use strict';

const { claimPendingItems, recomputeJob, releaseQueuedItems } = require('./store');
const { enqueueScanItems } = require('./queue');

async function fillQueueForJob(jobId, count, databaseUrl, queue) {
  const limit = Math.max(0, Number(count) || 0);
  if (!limit) return [];

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
    })));
    await recomputeJob(jobId, databaseUrl);
    return claimedItems;
  } catch (error) {
    await releaseQueuedItems(claimedItems.map((item) => item.id), databaseUrl);
    await recomputeJob(jobId, databaseUrl);
    throw error;
  }
}

module.exports = {
  fillQueueForJob,
};
