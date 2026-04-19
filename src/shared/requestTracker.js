'use strict';

const crypto = require('crypto');
const { runWithMonitorContext, updateMonitorContext } = require('./monitorContext');

function cloneValue(value) {
  if (Array.isArray(value)) {
    return value.map(cloneValue);
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.keys(value).reduce((accumulator, key) => {
    accumulator[key] = cloneValue(value[key]);
    return accumulator;
  }, {});
}

function normalizeString(value) {
  return String(value == null ? '' : value).trim();
}

function safeUrlPath(value) {
  const raw = normalizeString(value);
  if (!raw) {
    return '';
  }
  return raw.split('?')[0].split('#')[0] || '';
}

function safeUrlQuery(value) {
  const raw = normalizeString(value);
  if (!raw) {
    return '';
  }
  const queryIndex = raw.indexOf('?');
  if (queryIndex === -1) {
    return '';
  }
  return raw.slice(queryIndex + 1).split('#')[0] || '';
}

function inferRequestTarget(path) {
  const raw = normalizeString(path);
  if (!raw) {
    return {
      jobId: null,
      itemId: null,
    };
  }

  const match = raw.match(/^\/api\/jobs\/([^/]+)(?:\/items\/([^/]+))?/i);
  if (!match) {
    return {
      jobId: null,
      itemId: null,
    };
  }

  return {
    jobId: decodePathSegment(match[1]),
    itemId: decodePathSegment(match[2]),
  };
}

function decodePathSegment(value) {
  if (!value) {
    return null;
  }

  try {
    return decodeURIComponent(value);
  } catch (_) {
    return value;
  }
}

function toReadableUrl(value) {
  const raw = normalizeString(value);
  if (!raw) {
    return '';
  }

  try {
    const parsed = new URL(raw);
    return `${parsed.pathname}${parsed.search || ''}`;
  } catch (_) {
    return raw;
  }
}

function toMillis(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeProgress(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const currentValue = Number(value.current);
  const totalValue = Number(value.total);
  const hasTotal = Number.isFinite(totalValue) && totalValue > 0;
  const current = Number.isFinite(currentValue) && currentValue >= 0 ? currentValue : 0;
  const total = hasTotal ? totalValue : null;
  const percent = hasTotal
    ? Math.max(0, Math.min(100, Math.round((current / total) * 100)))
    : null;

  return {
    current,
    total,
    unit: normalizeString(value.unit) || null,
    message: normalizeString(value.message) || null,
    indeterminate: value.indeterminate === true || !hasTotal,
    percent,
  };
}

function snapshotEntry(entry) {
  const now = Date.now();
  const durationMs = entry.finishedAtMs != null
    ? Math.max(0, entry.finishedAtMs - entry.startedAtMs)
    : Math.max(0, now - entry.startedAtMs);

  return {
    id: entry.id,
    method: entry.method,
    path: entry.path,
    fullPath: entry.fullPath,
    query: entry.query,
    label: entry.label,
    scope: entry.scope,
    jobId: entry.jobId,
    itemId: entry.itemId,
    stage: entry.stage,
    status: entry.status,
    statusCode: entry.statusCode,
    message: entry.message,
    details: cloneValue(entry.details),
    progress: entry.progress ? cloneValue(entry.progress) : null,
    referer: entry.referer,
    origin: entry.origin,
    userAgent: entry.userAgent,
    remoteAddress: entry.remoteAddress,
    initiator: entry.initiator,
    targetJobId: entry.targetJobId,
    targetItemId: entry.targetItemId,
    startedAt: entry.startedAt,
    updatedAt: entry.updatedAt,
    finishedAt: entry.finishedAt,
    durationMs,
  };
}

function buildRequestHotspots(entries, options = {}) {
  const list = Array.isArray(entries) ? entries.filter(Boolean) : [];
  const limit = Math.max(1, Number(options.limit) || 12);
  const buckets = new Map();

  for (const entry of list) {
    const method = normalizeString(entry.method).toUpperCase() || 'GET';
    const path = normalizeString(entry.path) || normalizeString(entry.fullPath) || '';
    if (!path) {
      continue;
    }
    const key = `${method} ${path}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        method,
        path,
        count: 0,
        activeCount: 0,
        errorCount: 0,
        totalDurationMs: 0,
        maxDurationMs: 0,
        averageDurationMs: 0,
        lastSeenAt: null,
        lastStatus: null,
        lastStatusCode: null,
        lastMessage: null,
        lastStage: null,
        lastFullPath: normalizeString(entry.fullPath) || path,
        lastReferer: normalizeString(entry.referer) || '',
        lastOrigin: normalizeString(entry.origin) || '',
        lastUserAgent: normalizeString(entry.userAgent) || '',
        lastRemoteAddress: normalizeString(entry.remoteAddress) || '',
        sample: snapshotEntry(entry),
      };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    bucket.totalDurationMs += Number(entry.durationMs) || 0;
    bucket.maxDurationMs = Math.max(bucket.maxDurationMs, Number(entry.durationMs) || 0);
    if (entry.status === 'running') {
      bucket.activeCount += 1;
    }
    if (entry.status === 'failed' || entry.status === 'aborted' || Number(entry.statusCode) >= 400) {
      bucket.errorCount += 1;
    }

    const seenAt = toMillis(entry.updatedAt || entry.finishedAt || entry.startedAt || 0);
    if (!bucket.lastSeenAt || seenAt >= toMillis(bucket.lastSeenAt)) {
      bucket.lastSeenAt = entry.updatedAt || entry.finishedAt || entry.startedAt || null;
      bucket.lastStatus = entry.status || null;
      bucket.lastStatusCode = entry.statusCode || null;
      bucket.lastMessage = entry.message || null;
      bucket.lastStage = entry.stage || null;
      bucket.lastFullPath = normalizeString(entry.fullPath) || path;
      bucket.lastReferer = normalizeString(entry.referer) || '';
      bucket.lastOrigin = normalizeString(entry.origin) || '';
      bucket.lastUserAgent = normalizeString(entry.userAgent) || '';
      bucket.lastRemoteAddress = normalizeString(entry.remoteAddress) || '';
      bucket.sample = snapshotEntry(entry);
    }
  }

  return Array.from(buckets.values())
    .map((bucket) => ({
      ...bucket,
      averageDurationMs: bucket.count ? Math.round(bucket.totalDurationMs / bucket.count) : 0,
    }))
    .sort((left, right) => (
      (right.count - left.count)
      || (right.activeCount - left.activeCount)
      || (right.errorCount - left.errorCount)
      || (toMillis(right.lastSeenAt) - toMillis(left.lastSeenAt))
      || (right.averageDurationMs - left.averageDurationMs)
    ))
    .slice(0, limit);
}

function createRequestTracker(options = {}) {
  const active = new Map();
  const history = [];
  const historyLimit = Math.max(1, Number(options.historyLimit) || 25);
  const historyThresholdMs = Math.max(0, Number(options.historyThresholdMs) || 500);
  const shouldTrack = typeof options.shouldTrack === 'function'
    ? options.shouldTrack
    : (req) => {
      const url = String(req && req.originalUrl ? req.originalUrl : '');
      const path = url.split('?')[0];
      return req
        && req.method !== 'OPTIONS'
        && path.indexOf('/api/') === 0
        && !/^\/api\/(?:health(?:\/detailed)?|events|requests|queries)(?:\/|$)/.test(path);
    };

  function syncMonitorContext(entry) {
    if (!entry || !entry.monitorContext) {
      return;
    }

    Object.assign(entry.monitorContext, {
      requestId: entry.id,
      method: entry.method,
      path: entry.path,
      fullPath: entry.fullPath,
      query: entry.query,
      label: entry.label,
      scope: entry.scope,
      jobId: entry.jobId,
      itemId: entry.itemId,
      targetJobId: entry.targetJobId,
      targetItemId: entry.targetItemId,
      stage: entry.stage,
      status: entry.status,
      statusCode: entry.statusCode,
      message: entry.message,
      progress: entry.progress ? cloneValue(entry.progress) : null,
    });

    updateMonitorContext(entry.monitorContext);
  }

  function recordHistory(snapshot) {
    if (!snapshot) {
      return;
    }

    const eligible = snapshot.statusCode >= 400
      || snapshot.durationMs >= historyThresholdMs
      || (snapshot.progress && snapshot.progress.current > 0);
    if (!eligible) {
      return;
    }

    history.unshift(snapshot);
    if (history.length > historyLimit) {
      history.length = historyLimit;
    }
  }

  function updateEntry(entry, patch = {}) {
    if (!entry) {
      return null;
    }

    if (patch.label !== undefined) {
      entry.label = normalizeString(patch.label) || null;
    }
    if (patch.scope !== undefined) {
      entry.scope = normalizeString(patch.scope) || null;
    }
    if (patch.stage !== undefined || patch.phase !== undefined) {
      entry.stage = normalizeString(patch.stage !== undefined ? patch.stage : patch.phase) || null;
    }
    if (patch.message !== undefined) {
      entry.message = normalizeString(patch.message) || null;
    }
    if (patch.details !== undefined) {
      entry.details = cloneValue(patch.details);
    }
    if (patch.progress !== undefined || patch.current !== undefined || patch.total !== undefined) {
      const progressInput = patch.progress !== undefined ? patch.progress : patch;
      entry.progress = normalizeProgress(progressInput);
    }
    if (patch.jobId !== undefined) {
      entry.jobId = normalizeString(patch.jobId) || null;
    }
    if (patch.itemId !== undefined) {
      entry.itemId = normalizeString(patch.itemId) || null;
    }
    if (patch.statusCode !== undefined && Number.isFinite(Number(patch.statusCode))) {
      entry.statusCode = Number(patch.statusCode);
    }

    entry.updatedAtMs = Date.now();
    entry.updatedAt = new Date(entry.updatedAtMs).toISOString();
    syncMonitorContext(entry);
    return snapshotEntry(entry);
  }

  function finalizeEntry(entry, status, patch = {}) {
    if (!entry || !active.has(entry.id)) {
      return null;
    }

    updateEntry(entry, patch);
    entry.status = status;
    if (!entry.statusCode) {
      entry.statusCode = status === 'failed' || status === 'aborted' ? 500 : 200;
    }
    if (!entry.message) {
      entry.message = status === 'failed'
        ? 'Request failed'
        : status === 'aborted'
          ? 'Request aborted'
          : 'Request completed';
    }
    entry.finishedAtMs = Date.now();
    entry.finishedAt = new Date(entry.finishedAtMs).toISOString();
    if (entry.progress && entry.progress.total !== null && entry.progress.total !== undefined) {
      entry.progress.current = Math.max(entry.progress.current, entry.progress.total);
      entry.progress.percent = 100;
      entry.progress.indeterminate = false;
    }

    syncMonitorContext(entry);
    const snapshot = snapshotEntry(entry);
    active.delete(entry.id);
    recordHistory(snapshot);
    return snapshot;
  }

  function startRequest(req, res) {
    const startedAtMs = Date.now();
    const originalUrl = normalizeString(req && (req.originalUrl || req.url));
    const path = safeUrlPath(originalUrl);
    const query = safeUrlQuery(originalUrl);
    const target = inferRequestTarget(path);
    const headers = req && req.headers ? req.headers : {};
    const referer = normalizeString(headers.referer || headers.referrer || '');
    const origin = normalizeString(headers.origin || '');
    const userAgent = normalizeString(headers['user-agent'] || '');
    const remoteAddress = normalizeString(req && (req.ip || req.socket && req.socket.remoteAddress || req.connection && req.connection.remoteAddress || ''));
    const entry = {
      id: crypto.randomUUID(),
      method: String(req && req.method || '').toUpperCase(),
      path,
      fullPath: originalUrl ? `${path}${query ? `?${query}` : ''}` : path,
      query: query || '',
      label: null,
      scope: 'request',
      jobId: target.jobId,
      itemId: target.itemId,
      targetJobId: target.jobId,
      targetItemId: target.itemId,
      stage: null,
      status: 'running',
      statusCode: null,
      message: null,
      details: null,
      progress: null,
      referer,
      origin,
      userAgent,
      remoteAddress,
      initiator: toReadableUrl(referer),
      startedAtMs,
      startedAt: new Date(startedAtMs).toISOString(),
      updatedAtMs: startedAtMs,
      updatedAt: new Date(startedAtMs).toISOString(),
      finishedAtMs: null,
      finishedAt: null,
    };

    entry.monitorContext = {
      requestId: entry.id,
      method: entry.method,
      path: entry.path,
      fullPath: entry.fullPath,
      query: entry.query,
      label: entry.label,
      scope: entry.scope,
      jobId: entry.jobId,
      itemId: entry.itemId,
      targetJobId: entry.targetJobId,
      targetItemId: entry.targetItemId,
      stage: entry.stage,
      status: entry.status,
      statusCode: entry.statusCode,
      message: entry.message,
      progress: entry.progress ? cloneValue(entry.progress) : null,
    };

    active.set(entry.id, entry);
    syncMonitorContext(entry);

    const controller = {
      monitorContext: entry.monitorContext,
      update(patch) {
        return updateEntry(entry, patch || {});
      },
      complete(patch) {
        return finalizeEntry(entry, 'completed', patch || {});
      },
      fail(error, patch = {}) {
        const message = error && error.message ? error.message : String(error || 'Request failed');
        return finalizeEntry(entry, 'failed', {
          ...patch,
          message,
          statusCode: Number.isFinite(Number(patch.statusCode)) ? Number(patch.statusCode) : 500,
        });
      },
      abort(patch = {}) {
        return finalizeEntry(entry, 'aborted', {
          ...patch,
          message: patch.message || 'Request aborted',
          statusCode: Number.isFinite(Number(patch.statusCode)) ? Number(patch.statusCode) : 499,
        });
      },
      snapshot() {
        return snapshotEntry(entry);
      },
    };

    if (res && typeof res.on === 'function') {
      let finalized = false;
      const finalizeOnce = (status, patch) => {
        if (finalized) {
          return null;
        }
        finalized = true;
        return controller[status](patch);
      };

      res.on('finish', () => {
        const statusCode = Number(res.statusCode) || 0;
        if (statusCode >= 400) {
          finalizeOnce('fail', { statusCode, message: `HTTP ${statusCode}` });
          return;
        }
        finalizeOnce('complete', { statusCode });
      });
      res.on('close', () => {
        if (res.writableEnded || finalized) {
          return;
        }
        finalizeOnce('abort', {});
      });
    }

    return controller;
  }

  function middleware(req, res, next) {
    if (!shouldTrack(req)) {
      next();
      return;
    }

    const requestProgress = startRequest(req, res);
    runWithMonitorContext(requestProgress.monitorContext, () => {
      req.requestProgress = requestProgress;
      next();
    });
  }

  function getSnapshot() {
    const activeRequests = Array.from(active.values())
      .sort((left, right) => left.startedAtMs - right.startedAtMs)
      .map((entry) => snapshotEntry(entry));
    const recentRequests = history.map((entry) => ({ ...entry }));
    return {
      activeRequestCount: active.size,
      recentRequestCount: history.length,
      activeRequests,
      recentRequests,
      hotRequests: buildRequestHotspots([...activeRequests, ...recentRequests]),
    };
  }

  return {
    middleware,
    getSnapshot,
  };
}

module.exports = {
  createRequestTracker,
  buildRequestHotspots,
};
