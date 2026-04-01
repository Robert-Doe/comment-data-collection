'use strict';

const IORedis = require('ioredis');
const { Queue } = require('bullmq');

const SCAN_QUEUE_NAME = 'ugc-scan-url';

let sharedConnection;
let sharedQueue;

function createRedisConnection(redisUrl) {
  if (!redisUrl) {
    throw new Error('REDIS_URL is required');
  }

  return new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}

function getSharedRedis(redisUrl) {
  if (!sharedConnection) {
    sharedConnection = createRedisConnection(redisUrl);
  }
  return sharedConnection;
}

function getSharedQueue(redisUrl) {
  if (!sharedQueue) {
    sharedQueue = new Queue(SCAN_QUEUE_NAME, {
      connection: getSharedRedis(redisUrl),
    });
  }
  return sharedQueue;
}

async function enqueueScanItem(queue, payload) {
  return queue.add('scan-url', payload, {
    jobId: payload.itemId,
    attempts: 2,
    removeOnComplete: 1000,
    removeOnFail: 1000,
    backoff: {
      type: 'exponential',
      delay: 3000,
    },
  });
}

async function enqueueScanItems(queue, payloads) {
  if (!payloads.length) return [];
  return queue.addBulk(payloads.map((payload) => ({
    name: 'scan-url',
    data: payload,
    opts: {
      jobId: payload.itemId,
      attempts: 2,
      removeOnComplete: 1000,
      removeOnFail: 1000,
      backoff: {
        type: 'exponential',
        delay: 3000,
      },
    },
  })));
}

async function removeQueueItems(queue, itemIds) {
  const normalizedIds = Array.isArray(itemIds)
    ? itemIds.map((itemId) => String(itemId || '').trim()).filter(Boolean)
    : [];
  if (!normalizedIds.length) {
    return {
      removedCount: 0,
      skippedCount: 0,
    };
  }

  let removedCount = 0;
  let skippedCount = 0;
  for (const itemId of normalizedIds) {
    try {
      await queue.remove(itemId);
      removedCount += 1;
    } catch (_) {
      skippedCount += 1;
    }
  }

  return {
    removedCount,
    skippedCount,
  };
}

module.exports = {
  SCAN_QUEUE_NAME,
  createRedisConnection,
  getSharedRedis,
  getSharedQueue,
  enqueueScanItem,
  enqueueScanItems,
  removeQueueItems,
};
