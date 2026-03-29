'use strict';

const path = require('path');

function numberFromEnv(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function booleanFromEnv(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  return !/^(0|false|no|off)$/i.test(String(value).trim());
}

function normalizeBasePath(value, fallback) {
  const base = String(value || fallback || '/').trim();
  if (!base || base === '/') return '/';
  return `/${base.replace(/^\/+|\/+$/g, '')}`;
}

function getConfig() {
  const workerConcurrency = numberFromEnv('WORKER_CONCURRENCY', 2);
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
    ingestBatchSize: numberFromEnv('INGEST_BATCH_SIZE', 250),
    initialQueueFill: numberFromEnv('INITIAL_QUEUE_FILL', Math.max(2, workerConcurrency * 2)),
    queueRefillCount: numberFromEnv('QUEUE_REFILL_COUNT', Math.max(1, workerConcurrency)),
    queueRecoveryIntervalMs: numberFromEnv('QUEUE_RECOVERY_INTERVAL_MS', 30000),
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
