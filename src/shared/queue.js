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

module.exports = {
  SCAN_QUEUE_NAME,
  createRedisConnection,
  getSharedRedis,
  getSharedQueue,
  enqueueScanItem,
  enqueueScanItems,
};
