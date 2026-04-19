'use strict';

const zlib = require('zlib');

function normalizeTimestamp(value, fallback = new Date().toISOString()) {
  const text = String(value || '').trim();
  return text || String(fallback);
}

function normalizeInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }

  const text = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(text)) {
    return true;
  }
  if (['false', '0', 'no', 'n', 'off'].includes(text)) {
    return false;
  }
  return fallback;
}

function normalizeJobIds(value) {
  return Array.isArray(value)
    ? value.map((entry) => String(entry || '').trim()).filter(Boolean)
    : [];
}

function normalizeProjectBackupJob(job) {
  const normalized = job && typeof job === 'object' ? { ...job } : {};
  const createdAt = normalizeTimestamp(normalized.created_at);

  normalized.source_job_ids = normalizeJobIds(normalized.source_job_ids);
  normalized.scan_delay_ms = normalizeInteger(normalized.scan_delay_ms, 0);
  normalized.screenshot_delay_ms = normalizeInteger(normalized.screenshot_delay_ms, 0);
  normalized.candidate_mode = String(normalized.candidate_mode || normalized.candidateMode || 'default');
  normalized.status = String(normalized.status || 'queued');
  normalized.total_urls = normalizeInteger(normalized.total_urls, 0);
  normalized.pending_count = normalizeInteger(normalized.pending_count, 0);
  normalized.queued_count = normalizeInteger(normalized.queued_count, 0);
  normalized.running_count = normalizeInteger(normalized.running_count, 0);
  normalized.completed_count = normalizeInteger(normalized.completed_count, 0);
  normalized.failed_count = normalizeInteger(normalized.failed_count, 0);
  normalized.detected_count = normalizeInteger(normalized.detected_count, 0);
  normalized.created_at = createdAt;
  normalized.updated_at = normalizeTimestamp(normalized.updated_at, createdAt);
  normalized.finished_at = normalized.finished_at || null;

  return normalized;
}

function normalizeProjectBackupJobItem(item) {
  const normalized = item && typeof item === 'object' ? { ...item } : {};
  const createdAt = normalizeTimestamp(normalized.created_at);

  normalized.row_number = normalizeInteger(normalized.row_number, 0);
  normalized.attempts = normalizeInteger(normalized.attempts, 0);
  normalized.status = String(normalized.status || 'queued');
  normalized.input_url = String(normalized.input_url || '');
  normalized.normalized_url = String(normalized.normalized_url || '');
  normalized.analysis_source = String(normalized.analysis_source || 'automated');
  normalized.manual_capture_required = normalizeBoolean(normalized.manual_capture_required, false);
  normalized.manual_captured_at = normalized.manual_captured_at || null;
  normalized.candidate_reviews = Array.isArray(normalized.candidate_reviews) ? normalized.candidate_reviews : [];
  normalized.created_at = createdAt;
  normalized.updated_at = normalizeTimestamp(normalized.updated_at, createdAt);
  normalized.started_at = normalized.started_at || null;
  normalized.completed_at = normalized.completed_at || null;

  return normalized;
}

function normalizeProjectBackupJobEvent(event) {
  const normalized = event && typeof event === 'object' ? { ...event } : {};
  const createdAt = normalizeTimestamp(normalized.created_at);

  normalized.level = String(normalized.level || 'info');
  normalized.scope = String(normalized.scope || 'job');
  normalized.event_type = String(normalized.event_type || '');
  normalized.message = String(normalized.message || '');
  normalized.created_at = createdAt;

  return normalized;
}

function normalizeProjectBackupManualReviewTarget(target) {
  const normalized = target && typeof target === 'object' ? { ...target } : {};
  const createdAt = normalizeTimestamp(normalized.created_at);

  normalized.created_at = createdAt;
  normalized.updated_at = normalizeTimestamp(normalized.updated_at, createdAt);

  return normalized;
}

function normalizeProjectBackup(payload) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const jobs = Array.isArray(source.jobs) ? source.jobs.map((job) => {
    const normalizedJob = normalizeProjectBackupJob(job);
    return normalizedJob;
  }) : [];
  const jobItems = Array.isArray(source.jobItems)
    ? source.jobItems.map((item) => normalizeProjectBackupJobItem(item))
    : [];
  const jobEvents = Array.isArray(source.jobEvents)
    ? source.jobEvents.map((event) => normalizeProjectBackupJobEvent(event))
    : [];
  const manualReviewTargets = Array.isArray(source.manualReviewTargets)
    ? source.manualReviewTargets.map((target) => normalizeProjectBackupManualReviewTarget(target))
    : [];

  return {
    schemaVersion: Math.max(1, Number(source.schemaVersion) || 1),
    exportedAt: String(source.exportedAt || new Date().toISOString()),
    jobs,
    jobItems,
    jobEvents,
    manualReviewTargets,
    metadata: source.metadata && typeof source.metadata === 'object'
      ? { ...source.metadata }
      : {},
  };
}

function isGzipBuffer(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
}

function encodeProjectBackup(payload, format = 'json') {
  const normalized = normalizeProjectBackup(payload);
  const json = `${JSON.stringify(normalized, null, 2)}\n`;
  const requestedFormat = String(format || 'json').trim().toLowerCase();

  if (requestedFormat === 'db') {
    return {
      buffer: zlib.gzipSync(Buffer.from(json, 'utf8')),
      contentType: 'application/octet-stream',
      extension: '.db',
    };
  }

  return {
    buffer: Buffer.from(json, 'utf8'),
    contentType: 'application/json; charset=utf-8',
    extension: '.json',
  };
}

function decodeProjectBackup(buffer, filename = '') {
  let raw = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || '');
  const lowerFilename = String(filename || '').toLowerCase();

  if (isGzipBuffer(raw) || lowerFilename.endsWith('.db') || lowerFilename.endsWith('.gz')) {
    try {
      raw = zlib.gunzipSync(raw);
    } catch (_) {
      // Fall through to JSON parsing if the file was named .db but is not gzipped.
    }
  }

  const text = raw.toString('utf8').trim();
  if (!text) {
    throw new Error('Backup file is empty');
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (_) {
    throw new Error('Backup file is not valid JSON');
  }

  return normalizeProjectBackup(parsed);
}

module.exports = {
  decodeProjectBackup,
  encodeProjectBackup,
  isGzipBuffer,
  normalizeProjectBackup,
};
