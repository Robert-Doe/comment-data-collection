'use strict';

const crypto = require('crypto');
const { getMonitorContext } = require('./monitorContext');

function normalizeString(value) {
  return String(value == null ? '' : value).trim();
}

function truncateString(value, maxLength = 240) {
  const text = normalizeString(value);
  if (!text) {
    return '';
  }

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

function toIso(value) {
  const timestamp = Number(value);
  if (Number.isFinite(timestamp) && timestamp > 0) {
    return new Date(timestamp).toISOString();
  }

  return new Date().toISOString();
}

function sanitizeValue(value, depth = 0) {
  if (value == null) {
    return value;
  }

  if (typeof value === 'string') {
    return truncateString(value, 180);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Buffer.isBuffer(value)) {
    return `<Buffer ${value.length} bytes>`;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 8).map((entry) => sanitizeValue(entry, depth + 1));
  }

  if (typeof value === 'object') {
    if (depth >= 1) {
      return '[Object]';
    }

    const result = {};
    Object.keys(value).slice(0, 8).forEach((key) => {
      result[key] = sanitizeValue(value[key], depth + 1);
    });
    return result;
  }

  return truncateString(String(value), 180);
}

function sanitizeValues(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values.slice(0, 8).map((value) => sanitizeValue(value));
}

function normalizeSql(sql) {
  return normalizeString(sql).replace(/\r\n/g, '\n');
}

function compactSql(sql) {
  return normalizeSql(sql).replace(/\s+/g, ' ').trim();
}

function extractStatementType(sql) {
  const text = compactSql(sql);
  if (!text) {
    return 'UNKNOWN';
  }

  const firstWord = text.split(/\s+/)[0].toUpperCase();
  if (firstWord === 'WITH') {
    return 'WITH';
  }

  return firstWord;
}

function normalizeTableName(value) {
  return normalizeString(value)
    .replace(/^[("'`]+/, '')
    .replace(/[)"'`;,\]]+$/, '')
    .trim();
}

function extractTableHints(sql) {
  const text = compactSql(sql);
  if (!text) {
    return [];
  }

  const patterns = [
    /\bfrom\s+([a-zA-Z0-9_."`[\]-]+)/gi,
    /\bjoin\s+([a-zA-Z0-9_."`[\]-]+)/gi,
    /\binto\s+([a-zA-Z0-9_."`[\]-]+)/gi,
    /\bupdate\s+([a-zA-Z0-9_."`[\]-]+)/gi,
    /\bdelete\s+from\s+([a-zA-Z0-9_."`[\]-]+)/gi,
    /\btruncate\s+table\s+([a-zA-Z0-9_."`[\]-]+)/gi,
    /\bcreate\s+table(?:\s+if\s+not\s+exists)?\s+([a-zA-Z0-9_."`[\]-]+)/gi,
    /\balter\s+table\s+([a-zA-Z0-9_."`[\]-]+)/gi,
  ];

  const tables = new Set();
  patterns.forEach((pattern) => {
    let match;
    while ((match = pattern.exec(text))) {
      const tableName = normalizeTableName(match[1]);
      if (tableName) {
        tables.add(tableName);
      }
    }
  });

  return Array.from(tables);
}

function isWriteStatement(sql) {
  return /^(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|VACUUM|REINDEX|GRANT|REVOKE|COMMENT|MERGE|DO|CALL)\b/i
    .test(compactSql(sql));
}

function summarizeQuery(sql, values) {
  const text = normalizeSql(sql);
  const compact = compactSql(text);
  const statementType = extractStatementType(text);

  return {
    statementType,
    signature: truncateString(compact || statementType, 280),
    tables: extractTableHints(text),
    parameterCount: Array.isArray(values) ? values.length : 0,
    parameterPreview: sanitizeValues(values),
    tokenCount: compact ? compact.split(/\s+/).length : 0,
    isWrite: isWriteStatement(text),
  };
}

function buildRequestContextSnapshot(context) {
  if (!context || typeof context !== 'object') {
    return {
      id: null,
      method: null,
      path: null,
      fullPath: null,
      label: null,
      scope: null,
      jobId: null,
      itemId: null,
    };
  }

  return {
    id: context.requestId || context.id || null,
    method: context.method || context.requestMethod || null,
    path: context.path || context.requestPath || null,
    fullPath: context.fullPath || context.requestFullPath || null,
    label: context.label || context.requestLabel || null,
    scope: context.scope || context.requestScope || null,
    jobId: context.jobId || null,
    itemId: context.itemId || null,
  };
}

function buildSnapshot(entry) {
  const finishedAtMs = entry.finishedAtMs != null ? entry.finishedAtMs : null;
  const durationMs = finishedAtMs != null
    ? Math.max(0, finishedAtMs - entry.startedAtMs)
    : Math.max(0, Date.now() - entry.startedAtMs);

  return {
    id: entry.id,
    sql: entry.sql,
    sqlPreview: entry.sqlPreview,
    connectionType: entry.connectionType,
    request: buildRequestContextSnapshot(entry.request),
    analysis: { ...entry.analysis },
    status: entry.status,
    result: {
      command: entry.command,
      rowCount: entry.rowCount,
      rowsReturned: entry.rowsReturned,
    },
    error: entry.error,
    startedAtMs: entry.startedAtMs,
    updatedAtMs: entry.updatedAtMs,
    finishedAtMs: entry.finishedAtMs,
    startedAt: entry.startedAt,
    updatedAt: entry.updatedAt,
    finishedAt: entry.finishedAt,
    durationMs,
  };
}

function buildQueryHotspots(entries, options = {}) {
  const list = Array.isArray(entries) ? entries.filter(Boolean) : [];
  const limit = Math.max(1, Number(options.limit) || 12);
  const buckets = new Map();

  for (const entry of list) {
    const snapshot = buildSnapshot(entry);
    const key = `${snapshot.analysis.statementType || 'UNKNOWN'}|${snapshot.analysis.signature || snapshot.sqlPreview || snapshot.sql || ''}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        statementType: snapshot.analysis.statementType || 'UNKNOWN',
        signature: snapshot.analysis.signature || snapshot.sqlPreview || snapshot.sql || '',
        tables: snapshot.analysis.tables || [],
        count: 0,
        activeCount: 0,
        errorCount: 0,
        totalDurationMs: 0,
        maxDurationMs: 0,
        averageDurationMs: 0,
        lastSeenAt: null,
        lastStatus: null,
        lastError: null,
        sample: snapshot,
      };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    bucket.totalDurationMs += Number(snapshot.durationMs) || 0;
    bucket.maxDurationMs = Math.max(bucket.maxDurationMs, Number(snapshot.durationMs) || 0);
    if (snapshot.status === 'running') {
      bucket.activeCount += 1;
    }
    if (snapshot.status === 'error') {
      bucket.errorCount += 1;
    }

    const seenAt = Date.parse(snapshot.updatedAt || snapshot.finishedAt || snapshot.startedAt || 0);
    if (!bucket.lastSeenAt || Number.isFinite(seenAt) && seenAt >= Date.parse(bucket.lastSeenAt || 0)) {
      bucket.lastSeenAt = snapshot.updatedAt || snapshot.finishedAt || snapshot.startedAt || null;
      bucket.lastStatus = snapshot.status || null;
      bucket.lastError = snapshot.error || null;
      bucket.sample = snapshot;
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
      || (Date.parse(right.lastSeenAt || 0) - Date.parse(left.lastSeenAt || 0))
      || (right.averageDurationMs - left.averageDurationMs)
    ))
    .slice(0, limit);
}

function createQueryTracker(options = {}) {
  const active = new Map();
  const history = [];
  const historyLimit = Math.max(1, Number(options.historyLimit) || 200);

  function recordHistory(snapshot) {
    if (!snapshot) {
      return;
    }

    history.unshift(snapshot);
    if (history.length > historyLimit) {
      history.length = historyLimit;
    }
  }

  function begin(metadata = {}) {
    const context = buildRequestContextSnapshot(metadata.request || getMonitorContext());
    const now = Date.now();
    const sql = normalizeSql(metadata.sql);
    const analysis = summarizeQuery(sql, metadata.values);
    const entry = {
      id: crypto.randomUUID(),
      sql,
      sqlPreview: truncateString(sql.replace(/\s+/g, ' ').trim(), 320),
      connectionType: normalizeString(metadata.connectionType) || 'pool',
      request: context,
      analysis,
      status: 'running',
      command: null,
      rowCount: null,
      rowsReturned: null,
      error: null,
      startedAtMs: now,
      startedAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
      finishedAtMs: null,
      finishedAt: null,
    };

    active.set(entry.id, entry);

    const handle = {
      id: entry.id,
      finish(err, result) {
        if (entry.finishedAtMs != null) {
          return buildSnapshot(entry);
        }

        const finishedAtMs = Date.now();
        entry.finishedAtMs = finishedAtMs;
        entry.finishedAt = toIso(finishedAtMs);
        entry.updatedAt = entry.finishedAt;

        if (err) {
          entry.status = 'error';
          entry.error = truncateString(err && err.message ? err.message : String(err), 500);
        } else {
          entry.status = 'success';
          entry.command = normalizeString(result && result.command) || null;
          entry.rowCount = Number.isFinite(Number(result && result.rowCount))
            ? Number(result.rowCount)
            : null;
          entry.rowsReturned = Array.isArray(result && result.rows) ? result.rows.length : null;
        }

        active.delete(entry.id);
        const snapshot = buildSnapshot(entry);
        recordHistory(snapshot);
        return snapshot;
      },
      snapshot() {
        return buildSnapshot(entry);
      },
    };

    return handle;
  }

  function getSnapshot(options = {}) {
    const recentLimit = Math.max(1, Number(options.limit) || 50);
    const hotLimit = Math.max(1, Number(options.hotLimit) || 12);
    const activeQueries = Array.from(active.values())
      .sort((left, right) => left.startedAtMs - right.startedAtMs)
      .map((entry) => buildSnapshot(entry));
    const recentQueries = history.slice(0, recentLimit).map((entry) => ({ ...entry }));
    const hotQueries = buildQueryHotspots([...active.values(), ...history], { limit: hotLimit });

    return {
      activeQueryCount: activeQueries.length,
      recentQueryCount: history.length,
      activeQueries,
      recentQueries,
      hotQueries,
    };
  }

  return {
    begin,
    getSnapshot,
  };
}

module.exports = {
  buildQueryHotspots,
  createQueryTracker,
};
