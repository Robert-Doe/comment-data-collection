'use strict';

const os = require('os');
const path = require('path');

function numberFromEnv(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function integerFromEnv(name, fallback) {
  return Math.trunc(numberFromEnv(name, fallback));
}

function booleanFromEnv(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  return !/^(0|false|no|off)$/i.test(String(value).trim());
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeBasePath(value, fallback) {
  const base = String(value || fallback || '/').trim();
  if (!base || base === '/') return '/';
  return `/${base.replace(/^\/+|\/+$/g, '')}`;
}

function getRuntimeProfile() {
  const cpuCount = Math.max(1, Number(os.cpus().length) || 1);
  const totalMemoryMb = Math.max(256, Math.round(os.totalmem() / (1024 * 1024)));
  const reservedMemoryMb = 640;
  const estimatedWorkerMemoryMb = 320;
  const memoryBound = totalMemoryMb > reservedMemoryMb
    ? Math.max(1, Math.floor((totalMemoryMb - reservedMemoryMb) / estimatedWorkerMemoryMb))
    : 1;

  return {
    cpuCount,
    totalMemoryMb,
    maxRecommendedWorkerConcurrency: Math.max(1, Math.min(cpuCount + 1, memoryBound)),
  };
}

function getConfig() {
  const runtimeProfile = getRuntimeProfile();
  const requestedWorkerConcurrency = Math.max(1, integerFromEnv('WORKER_CONCURRENCY', 2));
  const workerConcurrency = clamp(
    requestedWorkerConcurrency,
    1,
    runtimeProfile.maxRecommendedWorkerConcurrency,
  );
  const requestedInitialQueueFill = Math.max(1, integerFromEnv('INITIAL_QUEUE_FILL', workerConcurrency * 2));
  const initialQueueFill = Math.max(workerConcurrency * 2, requestedInitialQueueFill);
  const requestedQueueRefillCount = Math.max(1, integerFromEnv('QUEUE_REFILL_COUNT', workerConcurrency));
  const queueRefillCount = clamp(requestedQueueRefillCount, workerConcurrency, initialQueueFill);
  const queueRecoveryIntervalMs = clamp(integerFromEnv('QUEUE_RECOVERY_INTERVAL_MS', 30000), 10000, 300000);

  return {
    port: numberFromEnv('PORT', 3000),
    databaseUrl: process.env.DATABASE_URL || '',
    redisUrl: process.env.REDIS_URL || process.env.REDIS_INTERNAL_URL || '',
    frontendOrigin: process.env.FRONTEND_ORIGIN || '*',
    scanTimeoutMs: numberFromEnv('SCAN_TIMEOUT_MS', 90000),
    postLoadDelayMs: numberFromEnv('POST_LOAD_DELAY_MS', 6000),
    preScreenshotDelayMs: numberFromEnv('PRE_SCREENSHOT_DELAY_MS', 1500),
    navigationRetries: numberFromEnv('NAVIGATION_RETRIES', 2),
    loadSettlePasses: numberFromEnv('LOAD_SETTLE_PASSES', 2),
    negativeRetrySettlePasses: numberFromEnv('NEGATIVE_RETRY_SETTLE_PASSES', 2),
    actionSettleMs: numberFromEnv('ACTION_SETTLE_MS', 1250),
    maxCandidates: numberFromEnv('MAX_CANDIDATES', 25),
    maxResults: numberFromEnv('MAX_RESULTS', 5),
    workerConcurrency,
    requestedWorkerConcurrency,
    runtimeProfile,
    ingestBatchSize: integerFromEnv('INGEST_BATCH_SIZE', 250),
    initialQueueFill,
    requestedInitialQueueFill,
    queueRefillCount,
    requestedQueueRefillCount,
    queueRecoveryIntervalMs,
    apiResultsPageSize: numberFromEnv('API_RESULTS_PAGE_SIZE', 100),
    captureScreenshots: booleanFromEnv('CAPTURE_SCREENSHOTS', true),
    captureHtmlSnapshots: booleanFromEnv('CAPTURE_HTML_SNAPSHOTS', true),
    artifactRoot: path.resolve(process.cwd(), process.env.ARTIFACT_ROOT || path.join('output', 'artifacts')),
    artifactUrlBasePath: normalizeBasePath(process.env.ARTIFACT_URL_BASE_PATH, '/artifacts'),
    publicBaseUrl: String(process.env.PUBLIC_BASE_URL || '').replace(/\/$/, ''),
  };
}

module.exports = {
  getConfig,
};
