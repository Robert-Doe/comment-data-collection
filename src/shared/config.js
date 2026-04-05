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

function normalizeOrigin(value) {
  const origin = String(value || '').trim().replace(/\/+$/g, '');
  return origin;
}

function expandFrontendOrigins(value) {
  const raw = String(value || '*').trim();
  if (!raw) return ['*'];

  const origins = raw
    .split(',')
    .map((entry) => normalizeOrigin(entry))
    .filter(Boolean);

  if (!origins.length) return ['*'];
  if (origins.includes('*')) return ['*'];

  const expanded = new Set(origins);

  for (const origin of origins) {
    try {
      const parsed = new URL(origin);
      if (!/^https?:$/i.test(parsed.protocol)) {
        continue;
      }

      const alias = new URL(parsed.origin);
      if (parsed.hostname.startsWith('www.')) {
        const hostname = parsed.hostname.slice(4);
        if (!hostname) {
          continue;
        }
        alias.hostname = hostname;
      } else if (parsed.hostname.includes('.')) {
        alias.hostname = `www.${parsed.hostname}`;
      } else {
        continue;
      }

      expanded.add(alias.origin);
    } catch (_) {
      continue;
    }
  }

  return Array.from(expanded);
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
  const frontendOrigins = expandFrontendOrigins(process.env.FRONTEND_ORIGIN || '*');
  const requestedWorkerConcurrency = Math.max(1, integerFromEnv('WORKER_CONCURRENCY', 5));
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
  const scanTimeoutMs = numberFromEnv('SCAN_TIMEOUT_MS', 90000);
  const postLoadDelayMs = numberFromEnv('POST_LOAD_DELAY_MS', 750);
  const preScreenshotDelayMs = numberFromEnv('PRE_SCREENSHOT_DELAY_MS', 250);
  const workerLockDurationMs = clamp(
    integerFromEnv(
      'WORKER_LOCK_DURATION_MS',
      Math.max(180000, scanTimeoutMs + postLoadDelayMs + preScreenshotDelayMs + 45000),
    ),
    60000,
    600000,
  );
  const workerLockRenewTimeMs = clamp(
    integerFromEnv('WORKER_LOCK_RENEW_TIME_MS', Math.floor(workerLockDurationMs / 2)),
    15000,
    Math.max(15000, workerLockDurationMs - 5000),
  );
  const workerStalledIntervalMs = clamp(
    integerFromEnv('WORKER_STALLED_INTERVAL_MS', Math.max(30000, Math.floor(workerLockDurationMs / 2))),
    30000,
    workerLockDurationMs,
  );
  const workerMaxStalledCount = clamp(integerFromEnv('WORKER_MAX_STALLED_COUNT', 2), 1, 5);

  return {
    port: numberFromEnv('PORT', 3000),
    databaseUrl: process.env.DATABASE_URL || '',
    redisUrl: process.env.REDIS_URL || process.env.REDIS_INTERNAL_URL || '',
    frontendOrigin: frontendOrigins[0] || '*',
    frontendOrigins,
    scanTimeoutMs,
    postLoadDelayMs,
    preScreenshotDelayMs,
    navigationRetries: numberFromEnv('NAVIGATION_RETRIES', 2),
    loadSettlePasses: numberFromEnv('LOAD_SETTLE_PASSES', 1),
    negativeRetrySettlePasses: numberFromEnv('NEGATIVE_RETRY_SETTLE_PASSES', 1),
    actionSettleMs: numberFromEnv('ACTION_SETTLE_MS', 350),
    maxCandidates: numberFromEnv('MAX_CANDIDATES', 50),
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
    workerLockDurationMs,
    workerLockRenewTimeMs,
    workerStalledIntervalMs,
    workerMaxStalledCount,
    apiResultsPageSize: numberFromEnv('API_RESULTS_PAGE_SIZE', 100),
    captureScreenshots: booleanFromEnv('CAPTURE_SCREENSHOTS', true),
    captureHtmlSnapshots: booleanFromEnv('CAPTURE_HTML_SNAPSHOTS', true),
    artifactRoot: path.resolve(process.cwd(), process.env.ARTIFACT_ROOT || path.join('output', 'artifacts')),
    modelArtifactRoot: path.resolve(process.cwd(), process.env.MODEL_ARTIFACT_ROOT || path.join('output', 'models')),
    modelDocsRoot: path.resolve(process.cwd(), process.env.MODEL_DOCS_ROOT || path.join('docs', 'modeling')),
    artifactUrlBasePath: normalizeBasePath(process.env.ARTIFACT_URL_BASE_PATH, '/artifacts'),
    publicBaseUrl: String(process.env.PUBLIC_BASE_URL || '').replace(/\/$/, ''),
    emailNotificationsEnabled: booleanFromEnv('EMAIL_NOTIFICATIONS_ENABLED', false),
    jobNotificationTo: String(process.env.JOB_NOTIFICATION_TO || '').trim(),
    smtpFrom: String(process.env.SMTP_FROM || '').trim(),
    smtpHost: String(process.env.SMTP_HOST || '').trim(),
    smtpPort: integerFromEnv('SMTP_PORT', 587),
    smtpSecure: booleanFromEnv('SMTP_SECURE', false),
    smtpUser: String(process.env.SMTP_USER || '').trim(),
    smtpPass: String(process.env.SMTP_PASS || ''),
  };
}

module.exports = {
  getConfig,
};
