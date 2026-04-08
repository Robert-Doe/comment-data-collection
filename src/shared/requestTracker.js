'use strict';

const crypto = require('crypto');

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
    startedAt: entry.startedAt,
    updatedAt: entry.updatedAt,
    finishedAt: entry.finishedAt,
    durationMs,
  };
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
        && !/^\/api\/(?:health(?:\/detailed)?|events)(?:\/|$)/.test(path);
    };

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

    const snapshot = snapshotEntry(entry);
    active.delete(entry.id);
    recordHistory(snapshot);
    return snapshot;
  }

  function startRequest(req, res) {
    const startedAtMs = Date.now();
    const entry = {
      id: crypto.randomUUID(),
      method: String(req && req.method || '').toUpperCase(),
      path: String(req && req.originalUrl ? req.originalUrl : req && req.url ? req.url : '').split('?')[0] || '',
      label: null,
      scope: 'request',
      jobId: null,
      itemId: null,
      stage: null,
      status: 'running',
      statusCode: null,
      message: null,
      details: null,
      progress: null,
      startedAtMs,
      startedAt: new Date(startedAtMs).toISOString(),
      updatedAtMs: startedAtMs,
      updatedAt: new Date(startedAtMs).toISOString(),
      finishedAtMs: null,
      finishedAt: null,
    };

    active.set(entry.id, entry);

    const controller = {
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

    req.requestProgress = startRequest(req, res);
    next();
  }

  function getSnapshot() {
    return {
      activeRequestCount: active.size,
      recentRequestCount: history.length,
      activeRequests: Array.from(active.values())
        .sort((left, right) => left.startedAtMs - right.startedAtMs)
        .map((entry) => snapshotEntry(entry)),
      recentRequests: history.map((entry) => ({
        ...entry,
      })),
    };
  }

  return {
    middleware,
    getSnapshot,
  };
}

module.exports = {
  createRequestTracker,
};
