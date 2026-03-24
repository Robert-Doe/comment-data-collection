'use strict';

const { Worker } = require('bullmq');

const { getConfig } = require('../shared/config');
const { ensureSchema, markItemRunning, markItemCompleted, markItemFailed, recomputeJob } = require('../shared/store');
const { SCAN_QUEUE_NAME, createRedisConnection, getSharedQueue } = require('../shared/queue');
const { fillQueueForJob } = require('../shared/jobQueue');
const { scanUrl, closeBrowser } = require('../shared/scanner');

async function main() {
  const config = getConfig();
  await ensureSchema(config.databaseUrl);

  const connection = createRedisConnection(config.redisUrl);
  const queue = getSharedQueue(config.redisUrl);
  const worker = new Worker(
    SCAN_QUEUE_NAME,
    async (job) => {
      const { jobId, itemId, rowNumber, normalizedUrl } = job.data;
      await markItemRunning(itemId, config.databaseUrl);
      await recomputeJob(jobId, config.databaseUrl);

      const scanResult = await scanUrl(normalizedUrl, {
        timeoutMs: config.scanTimeoutMs,
        postLoadDelayMs: config.postLoadDelayMs,
        maxCandidates: config.maxCandidates,
        maxResults: config.maxResults,
        captureScreenshots: config.captureScreenshots,
        artifactRoot: config.artifactRoot,
        artifactUrlBasePath: config.artifactUrlBasePath,
        publicBaseUrl: config.publicBaseUrl,
        jobId,
        itemId,
        rowNumber,
      });

      if (scanResult.error) {
        await markItemFailed(itemId, scanResult, config.databaseUrl);
      } else {
        await markItemCompleted(itemId, scanResult, config.databaseUrl);
      }

      await recomputeJob(jobId, config.databaseUrl);
      await fillQueueForJob(jobId, config.queueRefillCount, config.databaseUrl, queue);
    },
    {
      connection,
      concurrency: config.workerConcurrency,
    },
  );

  worker.on('completed', (job) => {
    console.log(`completed ${job.id}`);
  });

  worker.on('failed', (job, error) => {
    console.error(`failed ${job ? job.id : 'unknown'}: ${error && error.message ? error.message : error}`);
  });

  const shutdown = async () => {
    await worker.close().catch(() => {});
    await closeBrowser().catch(() => {});
    await connection.quit().catch(() => {});
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.log(`ugc-worker listening with concurrency=${config.workerConcurrency}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exitCode = 1;
  });
}
