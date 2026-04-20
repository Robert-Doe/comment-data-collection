'use strict';

const { Pool } = require('pg');
const crypto = require('crypto');
const { upsertCandidateReview: upsertCandidateReviewArray } = require('./candidateReviews');
const { buildSearchClause } = require('./adminSearch');
const { normalizeCandidateSelectionMode } = require('./jobSettings');
const { cloneValueWithArtifactCopies } = require('./jobArtifacts');
const { createQueryTracker } = require('./queryTracker');

let pool;
const databaseQueryTracker = createQueryTracker({
  historyLimit: 250,
});

function normalizeQueryText(query) {
  if (query && typeof query === 'object') {
    return String(query.text || query.query || query.sql || '');
  }
  return String(query || '');
}

function normalizeQueryValues(query, values) {
  if (Array.isArray(values)) {
    return values;
  }

  if (query && typeof query === 'object' && Array.isArray(query.values)) {
    return query.values;
  }

  return [];
}

function buildQueryMetadata(args, connectionType) {
  const query = args[0];
  const values = normalizeQueryValues(query, args[1]);

  return {
    sql: normalizeQueryText(query),
    values,
    connectionType,
  };
}

function wrapTrackedQuery(queryMethod, connectionType) {
  return function trackedQuery(...args) {
    const handle = databaseQueryTracker.begin(buildQueryMetadata(args, connectionType));
    const callbackIndex = args.length - 1;
    const hasCallback = typeof args[callbackIndex] === 'function';

    if (hasCallback) {
      const callback = args[callbackIndex];
      args[callbackIndex] = function trackedQueryCallback(err, result) {
        handle.finish(err, result);
        return callback.apply(this, arguments);
      };

      try {
        return queryMethod.apply(this, args);
      } catch (error) {
        handle.finish(error);
        throw error;
      }
    }

    try {
      const result = queryMethod.apply(this, args);
      if (result && typeof result.then === 'function') {
        return result.then((value) => {
          handle.finish(null, value);
          return value;
        }).catch((error) => {
          handle.finish(error);
          throw error;
        });
      }

      handle.finish(null, result);
      return result;
    } catch (error) {
      handle.finish(error);
      throw error;
    }
  };
}

function wrapTrackedClient(client) {
  if (!client || client.__queryTrackerWrapped) {
    return client;
  }

  client.__queryTrackerWrapped = true;
  client.query = wrapTrackedQuery(client.query.bind(client), 'client');
  return client;
}

function instrumentPool(targetPool) {
  if (!targetPool || targetPool.__queryTrackerWrapped) {
    return targetPool;
  }

  targetPool.__queryTrackerWrapped = true;

  const originalConnect = targetPool.connect.bind(targetPool);
  targetPool.connect = function trackedConnect(...args) {
    if (typeof args[0] === 'function') {
      const callback = args[0];
      return originalConnect(function trackedConnectCallback(err, client, release) {
        callback(err, err || !client ? client : wrapTrackedClient(client), release);
      });
    }

    return originalConnect(...args).then((client) => wrapTrackedClient(client));
  };

  return targetPool;
}

function getPool(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  if (!pool) {
    pool = new Pool({
      connectionString: databaseUrl,
    });
    instrumentPool(pool);
  }

  return pool;
}

function getDatabaseQuerySnapshot(options = {}) {
  return databaseQueryTracker.getSnapshot(options);
}

async function ensureSchema(databaseUrl) {
  const db = getPool(databaseUrl);
  await db.query(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      source_filename TEXT,
      source_column TEXT,
      source_job_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      scan_delay_ms INTEGER NOT NULL DEFAULT 6000,
      screenshot_delay_ms INTEGER NOT NULL DEFAULT 1500,
      candidate_mode TEXT NOT NULL DEFAULT 'default',
      status TEXT NOT NULL DEFAULT 'queued',
      total_urls INTEGER NOT NULL DEFAULT 0,
      pending_count INTEGER NOT NULL DEFAULT 0,
      queued_count INTEGER NOT NULL DEFAULT 0,
      running_count INTEGER NOT NULL DEFAULT 0,
      completed_count INTEGER NOT NULL DEFAULT 0,
      failed_count INTEGER NOT NULL DEFAULT 0,
      detected_count INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      finished_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS job_items (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      source_job_id TEXT,
      source_item_id TEXT,
      source_row_number INTEGER,
      row_number INTEGER NOT NULL,
      input_url TEXT NOT NULL,
      normalized_url TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      attempts INTEGER NOT NULL DEFAULT 0,
      title TEXT,
      final_url TEXT,
      ugc_detected BOOLEAN,
      best_score INTEGER,
      best_confidence TEXT,
      best_ugc_type TEXT,
      best_xpath TEXT,
      best_css_path TEXT,
      best_sample_text TEXT,
      screenshot_path TEXT,
      screenshot_url TEXT,
      manual_uploaded_screenshot_path TEXT,
      manual_uploaded_screenshot_url TEXT,
      analysis_source TEXT NOT NULL DEFAULT 'automated',
      manual_capture_required BOOLEAN NOT NULL DEFAULT FALSE,
      manual_capture_reason TEXT,
      manual_capture_mode TEXT,
      manual_html_path TEXT,
      manual_html_url TEXT,
      manual_raw_html_path TEXT,
      manual_raw_html_url TEXT,
      manual_capture_url TEXT,
      manual_capture_title TEXT,
      manual_capture_notes TEXT,
      manual_captured_at TIMESTAMPTZ,
      candidate_reviews JSONB NOT NULL DEFAULT '[]'::jsonb,
      best_candidate JSONB,
      candidates JSONB,
      scan_result JSONB,
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS manual_review_targets (
      selection_key TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      item_id TEXT NOT NULL REFERENCES job_items(id) ON DELETE CASCADE,
      capture_url TEXT,
      title TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS job_events (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      item_id TEXT REFERENCES job_items(id) ON DELETE CASCADE,
      row_number INTEGER,
      level TEXT NOT NULL DEFAULT 'info',
      scope TEXT NOT NULL DEFAULT 'job',
      event_type TEXT NOT NULL DEFAULT '',
      event_key TEXT,
      message TEXT NOT NULL,
      details JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_job_items_job_id ON job_items(job_id);
    CREATE INDEX IF NOT EXISTS idx_job_items_status ON job_items(status);
    CREATE INDEX IF NOT EXISTS idx_job_events_job_id_created_at ON job_events(job_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_job_events_item_id_created_at ON job_events(item_id, created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_job_events_job_id_event_key ON job_events(job_id, event_key) WHERE event_key IS NOT NULL;
  `);

  await db.query(`
    ALTER TABLE jobs
    ADD COLUMN IF NOT EXISTS pending_count INTEGER NOT NULL DEFAULT 0;

    ALTER TABLE jobs
    ADD COLUMN IF NOT EXISTS scan_delay_ms INTEGER NOT NULL DEFAULT 6000;

    ALTER TABLE jobs
    ADD COLUMN IF NOT EXISTS screenshot_delay_ms INTEGER NOT NULL DEFAULT 1500;

    ALTER TABLE jobs
    ADD COLUMN IF NOT EXISTS candidate_mode TEXT NOT NULL DEFAULT 'default';

    ALTER TABLE jobs
    ADD COLUMN IF NOT EXISTS source_job_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

    ALTER TABLE job_items
    ADD COLUMN IF NOT EXISTS scan_result JSONB;

    ALTER TABLE job_items
    ADD COLUMN IF NOT EXISTS source_job_id TEXT;

    ALTER TABLE job_items
    ADD COLUMN IF NOT EXISTS source_item_id TEXT;

    ALTER TABLE job_items
    ADD COLUMN IF NOT EXISTS source_row_number INTEGER;

    ALTER TABLE job_items
    ADD COLUMN IF NOT EXISTS screenshot_path TEXT;

    ALTER TABLE job_items
    ADD COLUMN IF NOT EXISTS screenshot_url TEXT;

    ALTER TABLE job_items
    ADD COLUMN IF NOT EXISTS manual_uploaded_screenshot_path TEXT;

    ALTER TABLE job_items
    ADD COLUMN IF NOT EXISTS manual_uploaded_screenshot_url TEXT;

    ALTER TABLE job_items
    ADD COLUMN IF NOT EXISTS analysis_source TEXT NOT NULL DEFAULT 'automated';

    ALTER TABLE job_items
    ADD COLUMN IF NOT EXISTS manual_capture_required BOOLEAN NOT NULL DEFAULT FALSE;

    ALTER TABLE job_items
    ADD COLUMN IF NOT EXISTS manual_capture_reason TEXT;

    ALTER TABLE job_items
    ADD COLUMN IF NOT EXISTS manual_capture_mode TEXT;

    ALTER TABLE job_items
    ADD COLUMN IF NOT EXISTS manual_html_path TEXT;

    ALTER TABLE job_items
    ADD COLUMN IF NOT EXISTS manual_html_url TEXT;

    ALTER TABLE job_items
    ADD COLUMN IF NOT EXISTS manual_raw_html_path TEXT;

    ALTER TABLE job_items
    ADD COLUMN IF NOT EXISTS manual_raw_html_url TEXT;

    ALTER TABLE job_items
    ADD COLUMN IF NOT EXISTS manual_capture_url TEXT;

    ALTER TABLE job_items
    ADD COLUMN IF NOT EXISTS manual_capture_title TEXT;

    ALTER TABLE job_items
    ADD COLUMN IF NOT EXISTS manual_capture_notes TEXT;

    ALTER TABLE job_items
    ADD COLUMN IF NOT EXISTS manual_captured_at TIMESTAMPTZ;

    ALTER TABLE job_items
    ADD COLUMN IF NOT EXISTS candidate_reviews JSONB NOT NULL DEFAULT '[]'::jsonb;

    ALTER TABLE job_events
    ADD COLUMN IF NOT EXISTS row_number INTEGER;

    ALTER TABLE job_events
    ADD COLUMN IF NOT EXISTS level TEXT NOT NULL DEFAULT 'info';

    ALTER TABLE job_events
    ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'job';

    ALTER TABLE job_events
    ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT '';

    ALTER TABLE job_events
    ADD COLUMN IF NOT EXISTS event_key TEXT;

    ALTER TABLE job_events
    ADD COLUMN IF NOT EXISTS details JSONB;
  `);
}

function buildInsertBatch(jobId, records) {
  const values = [];
  const placeholders = records.map((record, index) => {
    const base = index * 5;
    values.push(
      crypto.randomUUID(),
      jobId,
      record.__row_number,
      record.__input_url,
      record.__normalized_url,
    );
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, 'pending')`;
  });
  return { values, placeholders };
}

async function createJob({
  sourceFilename,
  sourceColumn,
  records,
  batchSize = 250,
  scanDelayMs = 6000,
  screenshotDelayMs = 1500,
  candidateMode = 'default',
  sourceJobIds = [],
}, databaseUrl) {
  const db = getPool(databaseUrl);
  const client = await db.connect();
  const jobId = crypto.randomUUID();
  const normalizedCandidateMode = normalizeCandidateSelectionMode(candidateMode);
  const normalizedSourceJobIds = Array.isArray(sourceJobIds)
    ? sourceJobIds.map((entry) => String(entry || '').trim()).filter(Boolean)
    : [];

  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO jobs (
        id, source_filename, source_column, source_job_ids, scan_delay_ms, screenshot_delay_ms, candidate_mode, status, total_urls, pending_count, queued_count
      ) VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, 'queued', $8, $8, 0)`,
      [jobId, sourceFilename || '', sourceColumn || '', JSON.stringify(normalizedSourceJobIds), scanDelayMs, screenshotDelayMs, normalizedCandidateMode, records.length],
    );

    for (let offset = 0; offset < records.length; offset += batchSize) {
      const chunk = records.slice(offset, offset + batchSize);
      const { values, placeholders } = buildInsertBatch(jobId, chunk);
      await client.query(
        `INSERT INTO job_items (
          id, job_id, row_number, input_url, normalized_url, status
        ) VALUES ${placeholders.join(', ')}`,
        values,
      );
    }

    await client.query('COMMIT');
    return {
      id: jobId,
      totalUrls: records.length,
      scanDelayMs,
      screenshotDelayMs,
      candidateMode: normalizedCandidateMode,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function listJobs(limit = 25, databaseUrl) {
  const db = getPool(databaseUrl);
  const result = await db.query(
    `SELECT *
     FROM jobs
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit],
  );
  return result.rows;
}

async function listIncompleteJobs(limit = 100, databaseUrl) {
  const db = getPool(databaseUrl);
  const result = await db.query(
    `SELECT *
     FROM jobs
     WHERE status NOT IN ('completed', 'completed_with_errors', 'failed')
     ORDER BY created_at ASC
     LIMIT $1`,
    [Math.max(1, Number(limit) || 100)],
  );
  return result.rows;
}

async function getJob(jobId, databaseUrl) {
  const db = getPool(databaseUrl);
  const result = await db.query(
    'SELECT * FROM jobs WHERE id = $1',
    [jobId],
  );
  return result.rows[0] || null;
}

async function getJobItem(jobId, itemId, databaseUrl) {
  const db = getPool(databaseUrl);
  const result = await db.query(
    `SELECT *
     FROM job_items
     WHERE job_id = $1
       AND id = $2`,
    [jobId, itemId],
  );
  return result.rows[0] || null;
}

async function getJobItems(jobId, optionsOrDatabaseUrl, maybeDatabaseUrl) {
  const options = typeof optionsOrDatabaseUrl === 'object' && optionsOrDatabaseUrl !== null
    ? optionsOrDatabaseUrl
    : {};
  const databaseUrl = typeof optionsOrDatabaseUrl === 'string'
    ? optionsOrDatabaseUrl
    : maybeDatabaseUrl;
  const db = getPool(databaseUrl);
  const result = await db.query(
    `SELECT *
     FROM job_items
     WHERE job_id = $1
     ORDER BY row_number ASC
     LIMIT $2 OFFSET $3`,
    [
      jobId,
      Math.max(1, Number(options.limit) || 100),
      Math.max(0, Number(options.offset) || 0),
    ],
  );
  return result.rows;
}

async function replaceJobRecords(jobId, options = {}, databaseUrl) {
  const normalizedJobId = String(jobId || '').trim();
  if (!normalizedJobId) {
    throw new Error('jobId is required');
  }

  const records = Array.isArray(options.records)
    ? options.records.filter((record) => record && record.__normalized_url)
    : [];
  if (!records.length) {
    throw new Error('At least one normalized record is required');
  }

  const db = getPool(databaseUrl);
  const client = await db.connect();
  const batchSize = Math.max(1, Number(options.batchSize) || 250);

  try {
    await client.query('BEGIN');

    const existingJobResult = await client.query(
      'SELECT * FROM jobs WHERE id = $1 FOR UPDATE',
      [normalizedJobId],
    );
    const existingJob = existingJobResult.rows[0] || null;
    if (!existingJob) {
      throw new Error('Job not found');
    }

    const nextSourceFilename = options.sourceFilename !== undefined
      ? String(options.sourceFilename || '')
      : String(existingJob.source_filename || '');
    const nextSourceColumn = options.sourceColumn !== undefined
      ? String(options.sourceColumn || '')
      : String(existingJob.source_column || '');
    const nextScanDelayMs = Number.isFinite(Number(options.scanDelayMs))
      ? Number(options.scanDelayMs)
      : Number(existingJob.scan_delay_ms || 6000);
    const nextScreenshotDelayMs = Number.isFinite(Number(options.screenshotDelayMs))
      ? Number(options.screenshotDelayMs)
      : Number(existingJob.screenshot_delay_ms || 1500);
    const nextCandidateMode = options.candidateMode !== undefined
      ? normalizeCandidateSelectionMode(options.candidateMode)
      : normalizeCandidateSelectionMode(existingJob.candidate_mode || existingJob.candidateMode || 'default');

    await client.query(
      'DELETE FROM manual_review_targets WHERE job_id = $1',
      [normalizedJobId],
    );
    await client.query(
      'DELETE FROM job_events WHERE job_id = $1',
      [normalizedJobId],
    );
    await client.query(
      'DELETE FROM job_items WHERE job_id = $1',
      [normalizedJobId],
    );

    for (let offset = 0; offset < records.length; offset += batchSize) {
      const chunk = records.slice(offset, offset + batchSize);
      const { values, placeholders } = buildInsertBatch(normalizedJobId, chunk);
      await client.query(
        `INSERT INTO job_items (
          id, job_id, row_number, input_url, normalized_url, status
        ) VALUES ${placeholders.join(', ')}`,
        values,
      );
    }

    const updatedResult = await client.query(
      `UPDATE jobs
       SET source_filename = $2,
           source_column = $3,
           scan_delay_ms = $4,
           screenshot_delay_ms = $5,
           candidate_mode = $6,
           status = 'pending',
           total_urls = $7,
           pending_count = $7,
           queued_count = 0,
           running_count = 0,
           completed_count = 0,
           failed_count = 0,
           detected_count = 0,
           error_message = NULL,
           updated_at = NOW(),
           finished_at = NULL
       WHERE id = $1
       RETURNING *`,
      [
        normalizedJobId,
        nextSourceFilename,
        nextSourceColumn,
        nextScanDelayMs,
        nextScreenshotDelayMs,
        nextCandidateMode,
        records.length,
      ],
    );

    await client.query('COMMIT');
    return updatedResult.rows[0] || null;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function restartJob(jobId, options = {}, databaseUrl) {
  const existingJob = await getJob(jobId, databaseUrl);
  if (!existingJob) {
    return null;
  }

  const items = await getJobItems(jobId, {
    limit: Math.max(1, Number(existingJob.total_urls) || 1),
    offset: 0,
  }, databaseUrl);
  const records = items.map((item) => ({
    __row_number: item.row_number,
    __input_url: item.input_url,
    __normalized_url: item.normalized_url,
  }));

  return replaceJobRecords(jobId, {
    sourceFilename: existingJob.source_filename || '',
    sourceColumn: existingJob.source_column || '',
    records,
    batchSize: options.batchSize,
    scanDelayMs: existingJob.scan_delay_ms,
    screenshotDelayMs: existingJob.screenshot_delay_ms,
    candidateMode: existingJob.candidate_mode || existingJob.candidateMode || 'default',
  }, databaseUrl);
}

async function resumeJob(jobId, options = {}, databaseUrl) {
  const normalizedJobId = String(jobId || '').trim();
  if (!normalizedJobId) {
    throw new Error('jobId is required');
  }

  const db = getPool(databaseUrl);
  const client = await db.connect();
  const batchSize = Math.max(1, Number(options.batchSize) || 250);

  try {
    await client.query('BEGIN');

    const existingJobResult = await client.query(
      'SELECT * FROM jobs WHERE id = $1 FOR UPDATE',
      [normalizedJobId],
    );
    const existingJob = existingJobResult.rows[0] || null;
    if (!existingJob) {
      throw new Error('Job not found');
    }

    const unfinishedResult = await client.query(
      `SELECT id, row_number, input_url, normalized_url
       FROM job_items
       WHERE job_id = $1
         AND status = ANY($2::text[])
       ORDER BY row_number ASC`,
      [normalizedJobId, ['pending', 'queued', 'running']],
    );
    const unfinishedItems = unfinishedResult.rows;
    const replacedCount = unfinishedItems.length;
    if (!replacedCount) {
      await client.query('COMMIT');
      return {
        job: existingJob,
        replacedCount: 0,
      };
    }

    const staleItemIds = unfinishedItems.map((item) => item.id);
    const records = unfinishedItems.map((item) => ({
      __row_number: item.row_number,
      __input_url: item.input_url,
      __normalized_url: item.normalized_url,
    }));

    await client.query(
      `DELETE FROM manual_review_targets
       WHERE job_id = $1
         AND item_id = ANY($2::text[])`,
      [normalizedJobId, staleItemIds],
    );
    await client.query(
      'DELETE FROM job_items WHERE id = ANY($1::text[])',
      [staleItemIds],
    );

    for (let offset = 0; offset < records.length; offset += batchSize) {
      const chunk = records.slice(offset, offset + batchSize);
      const { values, placeholders } = buildInsertBatch(normalizedJobId, chunk);
      await client.query(
        `INSERT INTO job_items (
          id, job_id, row_number, input_url, normalized_url, status
        ) VALUES ${placeholders.join(', ')}`,
        values,
      );
    }

    const updatedResult = await client.query(
      `UPDATE jobs
       SET error_message = NULL,
           updated_at = NOW(),
           finished_at = NULL
       WHERE id = $1
       RETURNING *`,
      [normalizedJobId],
    );

    await client.query('COMMIT');
    await recomputeJob(normalizedJobId, databaseUrl);

    return {
      job: await getJob(normalizedJobId, databaseUrl),
      replacedCount,
      staleItemIds,
      previousJob: updatedResult.rows[0] || existingJob,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function resumeFailedItems(jobId, options = {}, databaseUrl) {
  const normalizedJobId = String(jobId || '').trim();
  if (!normalizedJobId) {
    throw new Error('jobId is required');
  }

  const db = getPool(databaseUrl);
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    const existingJobResult = await client.query(
      'SELECT * FROM jobs WHERE id = $1 FOR UPDATE',
      [normalizedJobId],
    );
    const existingJob = existingJobResult.rows[0] || null;
    if (!existingJob) {
      throw new Error('Job not found');
    }

    const failedResult = await client.query(
      `SELECT id FROM job_items WHERE job_id = $1 AND status = 'failed' ORDER BY row_number ASC`,
      [normalizedJobId],
    );
    const failedIds = failedResult.rows.map((r) => r.id);
    const resumedCount = failedIds.length;

    if (!resumedCount) {
      await client.query('COMMIT');
      return { job: existingJob, resumedCount: 0 };
    }

    await client.query(
      `UPDATE job_items
       SET status = 'pending',
           error_message = NULL,
           attempts = 0,
           started_at = NULL,
           completed_at = NULL,
           ugc_detected = NULL,
           best_score = NULL,
           best_confidence = NULL,
           best_ugc_type = NULL,
           best_xpath = NULL,
           best_css_path = NULL,
           candidates = NULL,
           title = NULL,
           final_url = NULL
       WHERE id = ANY($1::text[])`,
      [failedIds],
    );

    await client.query(
      `UPDATE jobs
       SET status = CASE
             WHEN status IN ('completed', 'completed_with_errors', 'failed') THEN 'queued'
             ELSE status
           END,
           error_message = NULL,
           finished_at = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [normalizedJobId],
    );

    await client.query('COMMIT');
    await recomputeJob(normalizedJobId, databaseUrl);

    return {
      job: await getJob(normalizedJobId, databaseUrl),
      resumedCount,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function deleteJob(jobId, databaseUrl) {
  const normalizedJobId = String(jobId || '').trim();
  if (!normalizedJobId) {
    throw new Error('jobId is required');
  }

  const db = getPool(databaseUrl);
  const result = await db.query(
    'DELETE FROM jobs WHERE id = $1 RETURNING id',
    [normalizedJobId],
  );
  return result.rowCount > 0;
}

async function clearAllJobs(databaseUrl) {
  const db = getPool(databaseUrl);
  const result = await db.query('DELETE FROM jobs');
  return result.rowCount || 0;
}

async function appendJobEvent(event, databaseUrl) {
  const jobId = String(event && event.jobId || '').trim();
  if (!jobId) {
    throw new Error('jobId is required');
  }

  const db = getPool(databaseUrl);
  const message = String(event && event.message || '').trim();
  if (!message) {
    throw new Error('Job event message is required');
  }

  const details = event && event.details && typeof event.details === 'object'
    ? event.details
    : null;
  const result = await db.query(
    `INSERT INTO job_events (
       id, job_id, item_id, row_number, level, scope, event_type, event_key, message, details
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb
     )
     ON CONFLICT (job_id, event_key) WHERE event_key IS NOT NULL DO NOTHING
     RETURNING *`,
    [
      crypto.randomUUID(),
      jobId,
      event && event.itemId ? String(event.itemId) : null,
      Number.isFinite(Number(event && event.rowNumber)) ? Number(event.rowNumber) : null,
      String(event && event.level || 'info'),
      String(event && event.scope || 'job'),
      String(event && event.eventType || ''),
      event && event.eventKey ? String(event.eventKey) : null,
      message,
      details ? JSON.stringify(details) : null,
    ],
  );
  return result.rows[0] || null;
}

async function listJobEvents(jobId, optionsOrDatabaseUrl, maybeDatabaseUrl) {
  const options = typeof optionsOrDatabaseUrl === 'object' && optionsOrDatabaseUrl !== null
    ? optionsOrDatabaseUrl
    : {};
  const databaseUrl = typeof optionsOrDatabaseUrl === 'string'
    ? optionsOrDatabaseUrl
    : maybeDatabaseUrl;
  const db = getPool(databaseUrl);
  const params = [jobId];
  const clauses = ['job_id = $1'];

  if (options.itemId) {
    params.push(String(options.itemId));
    clauses.push(`item_id = $${params.length}`);
  }

  params.push(Math.max(1, Number(options.limit) || 100));
  const result = await db.query(
    `SELECT *
     FROM job_events
     WHERE ${clauses.join(' AND ')}
     ORDER BY created_at DESC
     LIMIT $${params.length}`,
    params,
  );
  return result.rows;
}

async function listItemsForModeling(optionsOrDatabaseUrl, maybeDatabaseUrl) {
  const options = typeof optionsOrDatabaseUrl === 'object' && optionsOrDatabaseUrl !== null
    ? optionsOrDatabaseUrl
    : {};
  const databaseUrl = typeof optionsOrDatabaseUrl === 'string'
    ? optionsOrDatabaseUrl
    : maybeDatabaseUrl;
  const db = getPool(databaseUrl);
  const clauses = [];
  const params = [];

  const jobIds = Array.isArray(options.jobIds)
    ? options.jobIds.map((entry) => String(entry || '').trim()).filter(Boolean)
    : [];
  if (jobIds.length) {
    params.push(jobIds);
    clauses.push(`job_id = ANY($${params.length}::text[])`);
  }

  if (options.requireCandidates !== false) {
    clauses.push('candidates IS NOT NULL');
  }

  const limit = Math.max(1, Number(options.limit) || 20000);
  const offset = Math.max(0, Number(options.offset) || 0);
  params.push(limit);
  params.push(offset);

  const whereClause = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const result = await db.query(
    `SELECT *
     FROM job_items
     ${whereClause}
     ORDER BY created_at DESC, row_number ASC
     LIMIT $${params.length - 1}
     OFFSET $${params.length}`,
    params,
  );
  return result.rows;
}

async function listJobItemsByStatuses(statuses, optionsOrDatabaseUrl, maybeDatabaseUrl) {
  const options = typeof optionsOrDatabaseUrl === 'object' && optionsOrDatabaseUrl !== null
    ? optionsOrDatabaseUrl
    : {};
  const databaseUrl = typeof optionsOrDatabaseUrl === 'string'
    ? optionsOrDatabaseUrl
    : maybeDatabaseUrl;
  const normalizedStatuses = Array.isArray(statuses)
    ? statuses.map((status) => String(status || '').trim()).filter(Boolean)
    : [];
  if (!normalizedStatuses.length) {
    return [];
  }

  const db = getPool(databaseUrl);
  const result = await db.query(
    `SELECT *
     FROM job_items
     WHERE status = ANY($1::text[])
     ORDER BY updated_at ASC, row_number ASC
     LIMIT $2`,
    [
      normalizedStatuses,
      Math.max(1, Number(options.limit) || 1000),
    ],
  );
  return result.rows;
}

async function listManualReviewCandidates(limit = 500, databaseUrl) {
  const db = getPool(databaseUrl);
  const result = await db.query(
    `SELECT *
     FROM job_items
     WHERE manual_capture_required IS TRUE
        OR analysis_source = 'manual_snapshot'
     ORDER BY
       CASE WHEN manual_capture_required IS TRUE THEN 0 ELSE 1 END,
       COALESCE(manual_captured_at, completed_at, updated_at, created_at) DESC,
       row_number ASC
     LIMIT $1`,
    [Math.max(1, Number(limit) || 500)],
  );
  return result.rows;
}

async function setManualReviewTarget(target, databaseUrl) {
  const db = getPool(databaseUrl);
  const result = await db.query(
    `INSERT INTO manual_review_targets (
       selection_key,
       job_id,
       item_id,
       capture_url,
       title,
       created_at,
       updated_at
     ) VALUES ('latest', $1, $2, $3, $4, NOW(), NOW())
     ON CONFLICT (selection_key)
     DO UPDATE SET
       job_id = EXCLUDED.job_id,
       item_id = EXCLUDED.item_id,
       capture_url = EXCLUDED.capture_url,
       title = EXCLUDED.title,
       updated_at = NOW()
     RETURNING *`,
    [
      String(target && target.job_id || ''),
      String(target && target.item_id || ''),
      String(target && target.capture_url || ''),
      String(target && target.title || ''),
    ],
  );
  return result.rows[0] || null;
}

async function getManualReviewTarget(databaseUrl) {
  const db = getPool(databaseUrl);
  const result = await db.query(
    `SELECT *
     FROM manual_review_targets
     WHERE selection_key = 'latest'`,
  );
  return result.rows[0] || null;
}

async function claimPendingItems(jobId, limit, databaseUrl) {
  const db = getPool(databaseUrl);
  const client = await db.connect();

  try {
    await client.query('BEGIN');
    const result = await client.query(
      `WITH picked AS (
         SELECT id
         FROM job_items
         WHERE job_id = $1
           AND status = 'pending'
         ORDER BY row_number ASC
         LIMIT $2
         FOR UPDATE SKIP LOCKED
       )
       UPDATE job_items
       SET status = 'queued',
           updated_at = NOW()
       FROM picked
       WHERE job_items.id = picked.id
       RETURNING job_items.id, job_items.job_id, job_items.normalized_url, job_items.row_number`,
      [jobId, limit],
    );
    await client.query('COMMIT');
    return result.rows;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function releaseQueuedItems(itemIds, databaseUrl) {
  if (!itemIds.length) return;
  const db = getPool(databaseUrl);
  await db.query(
    `UPDATE job_items
     SET status = 'pending',
         updated_at = NOW()
     WHERE id = ANY($1::text[])`,
    [itemIds],
  );
}

async function setItemStatus(itemId, status, databaseUrl) {
  const nextStatus = String(status || '').trim();
  if (!nextStatus) {
    throw new Error('Item status is required');
  }

  const db = getPool(databaseUrl);
  await db.query(
    `UPDATE job_items
     SET status = $2,
         completed_at = CASE
           WHEN $2 IN ('pending', 'queued', 'running') THEN NULL
           ELSE completed_at
         END,
         updated_at = NOW()
     WHERE id = $1`,
    [itemId, nextStatus],
  );
}

async function markItemRunning(itemId, databaseUrl) {
  const db = getPool(databaseUrl);
  await db.query(
    `UPDATE job_items
     SET status = 'running',
         attempts = attempts + 1,
         started_at = COALESCE(started_at, NOW()),
         updated_at = NOW()
     WHERE id = $1`,
    [itemId],
  );
}

async function markItemCompleted(itemId, scanResult, databaseUrl) {
  const db = getPool(databaseUrl);
  const best = scanResult.best_candidate || {};
  const completionMessage = scanResult.ugc_detected ? '' : String(scanResult.access_reason || '');
  const analysisSource = scanResult.analysis_source || 'automated';
  const manualCaptureRequired = !!scanResult.manual_capture_required;
  const manualCaptureReason = scanResult.manual_capture_reason || '';
  const hasManualCapture = analysisSource === 'manual_snapshot';
  const hasStoredHtml = !!(scanResult.manual_html_path || scanResult.manual_raw_html_path);
  const manualCaptureMode = hasManualCapture
    ? (scanResult.manual_capture_mode || 'dom_html')
    : (hasStoredHtml ? 'automated_page_html' : null);
  await db.query(
    `UPDATE job_items
     SET status = 'completed',
         title = $2,
         final_url = $3,
         ugc_detected = $4,
         best_score = $5,
         best_confidence = $6,
         best_ugc_type = $7,
         best_xpath = $8,
         best_css_path = $9,
         best_sample_text = $10,
         screenshot_path = $11,
         screenshot_url = $12,
         manual_uploaded_screenshot_path = $13,
         manual_uploaded_screenshot_url = $14,
         analysis_source = $15,
         manual_capture_required = $16,
         manual_capture_reason = $17,
         manual_capture_mode = $18,
         manual_html_path = $19,
         manual_html_url = $20,
         manual_raw_html_path = $21,
         manual_raw_html_url = $22,
         manual_capture_url = $23,
         manual_capture_title = $24,
         manual_capture_notes = $25,
         manual_captured_at = CASE WHEN $15 = 'manual_snapshot' THEN NOW() ELSE manual_captured_at END,
         best_candidate = $26::jsonb,
         candidates = $27::jsonb,
         scan_result = $28::jsonb,
         error_message = $29,
         completed_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [
      itemId,
      scanResult.title || '',
      scanResult.final_url || '',
      !!scanResult.ugc_detected,
      best.score ?? null,
      best.confidence || null,
      best.ugc_type || null,
      best.xpath || null,
      best.css_path || null,
      best.sample_text || null,
      scanResult.screenshot_path || null,
      scanResult.screenshot_url || null,
      scanResult.manual_uploaded_screenshot_path || null,
      scanResult.manual_uploaded_screenshot_url || null,
      analysisSource,
      manualCaptureRequired,
      manualCaptureReason,
      manualCaptureMode,
      hasStoredHtml ? (scanResult.manual_html_path || null) : null,
      hasStoredHtml ? (scanResult.manual_html_url || null) : null,
      hasStoredHtml ? (scanResult.manual_raw_html_path || null) : null,
      hasStoredHtml ? (scanResult.manual_raw_html_url || null) : null,
      hasManualCapture ? (scanResult.manual_capture_url || null) : null,
      hasManualCapture ? (scanResult.manual_capture_title || null) : null,
      hasManualCapture ? (scanResult.manual_capture_notes || null) : null,
      JSON.stringify(best),
      JSON.stringify(scanResult.candidates || []),
      JSON.stringify(scanResult),
      completionMessage,
    ],
  );
}

async function markItemFailed(itemId, errorOrResult, databaseUrl) {
  const db = getPool(databaseUrl);
  const scanResult = errorOrResult && typeof errorOrResult === 'object'
    ? errorOrResult
    : null;
  const errorMessage = scanResult
    ? scanResult.error || scanResult.access_reason || 'Scan failed'
    : String(errorOrResult || '');
  const analysisSource = scanResult && scanResult.analysis_source ? scanResult.analysis_source : 'automated';
  const hasStoredHtml = !!(scanResult && (scanResult.manual_html_path || scanResult.manual_raw_html_path));
  await db.query(
    `UPDATE job_items
     SET status = 'failed',
         error_message = $2,
         screenshot_path = $3,
         screenshot_url = $4,
         manual_uploaded_screenshot_path = $5,
         manual_uploaded_screenshot_url = $6,
         analysis_source = $7,
         manual_capture_required = $8,
         manual_capture_reason = $9,
         manual_capture_mode = $10,
         manual_html_path = $11,
         manual_html_url = $12,
         manual_raw_html_path = $13,
         manual_raw_html_url = $14,
         manual_capture_url = $15,
         manual_capture_title = $16,
         manual_capture_notes = $17,
         manual_captured_at = CASE WHEN $7 = 'manual_snapshot' THEN NOW() ELSE manual_captured_at END,
         scan_result = $18::jsonb,
         completed_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [
      itemId,
      String(errorMessage || ''),
      scanResult ? (scanResult.screenshot_path || null) : null,
      scanResult ? (scanResult.screenshot_url || null) : null,
      scanResult ? (scanResult.manual_uploaded_screenshot_path || null) : null,
      scanResult ? (scanResult.manual_uploaded_screenshot_url || null) : null,
      analysisSource,
      scanResult ? !!scanResult.manual_capture_required : true,
      scanResult ? (scanResult.manual_capture_reason || errorMessage) : errorMessage,
      scanResult ? (scanResult.manual_capture_mode || (hasStoredHtml ? 'automated_page_html' : 'dom_html')) : null,
      hasStoredHtml ? (scanResult.manual_html_path || null) : null,
      hasStoredHtml ? (scanResult.manual_html_url || null) : null,
      hasStoredHtml ? (scanResult.manual_raw_html_path || null) : null,
      hasStoredHtml ? (scanResult.manual_raw_html_url || null) : null,
      scanResult ? (scanResult.manual_capture_url || null) : null,
      scanResult ? (scanResult.manual_capture_title || null) : null,
      scanResult ? (scanResult.manual_capture_notes || null) : null,
      scanResult ? JSON.stringify(scanResult) : null,
    ],
  );
}

async function upsertCandidateReview(jobId, itemId, review, databaseUrl, existingItem = null) {
  const currentItem = existingItem || await getJobItem(jobId, itemId, databaseUrl);
  if (!currentItem) {
    return null;
  }

  const nextReviews = upsertCandidateReviewArray(currentItem.candidate_reviews || [], review);
  const db = getPool(databaseUrl);
  await db.query(
    `UPDATE job_items
     SET candidate_reviews = $2::jsonb,
         updated_at = NOW()
     WHERE job_id = $1
       AND id = $3`,
    [
      jobId,
      JSON.stringify(nextReviews),
      itemId,
    ],
  );

  return nextReviews;
}

async function recomputeJob(jobId, databaseUrl) {
  const db = getPool(databaseUrl);
  await db.query(
    `WITH counts AS (
       SELECT
         job_id,
         COUNT(*) FILTER (WHERE status = 'pending') AS pending_count,
         COUNT(*) FILTER (WHERE status = 'queued') AS queued_count,
         COUNT(*) FILTER (WHERE status = 'running') AS running_count,
         COUNT(*) FILTER (WHERE status = 'completed') AS completed_count,
         COUNT(*) FILTER (WHERE status = 'failed') AS failed_count,
         COUNT(*) FILTER (WHERE ugc_detected IS TRUE) AS detected_count
       FROM job_items
       WHERE job_id = $1
       GROUP BY job_id
     )
     UPDATE jobs
     SET pending_count = counts.pending_count,
         queued_count = counts.queued_count,
         running_count = counts.running_count,
         completed_count = counts.completed_count,
         failed_count = counts.failed_count,
         detected_count = counts.detected_count,
         status = CASE
           WHEN (counts.completed_count + counts.failed_count) = jobs.total_urls AND counts.failed_count = jobs.total_urls THEN 'failed'
           WHEN (counts.completed_count + counts.failed_count) = jobs.total_urls AND counts.failed_count > 0 THEN 'completed_with_errors'
           WHEN (counts.completed_count + counts.failed_count) = jobs.total_urls THEN 'completed'
           WHEN counts.running_count > 0 OR counts.completed_count > 0 OR counts.failed_count > 0 THEN 'running'
           WHEN counts.queued_count > 0 THEN 'queued'
           WHEN counts.pending_count > 0 THEN 'pending'
           ELSE 'queued'
         END,
         finished_at = CASE
           WHEN (counts.completed_count + counts.failed_count) = jobs.total_urls THEN NOW()
           ELSE NULL
         END,
         updated_at = NOW()
     FROM counts
     WHERE jobs.id = counts.job_id
       AND jobs.id = $1`,
    [jobId],
  );
}


async function listAllEvents(options, databaseUrl) {
  const opts = (options && typeof options === 'object') ? options : {};
  const db = getPool(databaseUrl);
  const params = [];
  const clauses = [];

  if (opts.since) {
    params.push(String(opts.since));
    clauses.push(`je.created_at > \$${params.length}`);
  }

  params.push(Math.max(1, Math.min(500, Number(opts.limit) || 100)));
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const result = await db.query(
    `SELECT je.id, je.job_id, je.item_id, je.row_number, je.level, je.scope,
            je.event_type, je.event_key, je.message, je.details, je.created_at,
            j.source_filename
     FROM job_events je
     LEFT JOIN jobs j ON j.id = je.job_id
     ${where}
     ORDER BY je.created_at DESC
     LIMIT \$${params.length}`,
    params,
  );
  return result.rows;
}

async function listRecentJobItems(limit = 25, databaseUrl) {
  const db = getPool(databaseUrl);
  const result = await db.query(
    `SELECT id, job_id, row_number, input_url, normalized_url, status, attempts, title,
            final_url, ugc_detected, best_score, best_confidence, best_ugc_type,
            best_xpath, best_css_path, best_sample_text, analysis_source,
            manual_capture_required, manual_capture_reason, manual_capture_mode,
            manual_capture_url, manual_capture_title, manual_capture_notes,
            error_message, created_at, updated_at, started_at, completed_at
     FROM job_items
     ORDER BY updated_at DESC, created_at DESC
     LIMIT $1`,
    [Math.max(1, Number(limit) || 25)],
  );
  return result.rows;
}

async function getDatabaseSummary(databaseUrl) {
  const db = getPool(databaseUrl);
  const [
    jobCountResult,
    itemCountResult,
    eventCountResult,
    targetCountResult,
    jobStatusResult,
    itemStatusResult,
    reviewCountResult,
    candidateCountResult,
    manualCaptureCountResult,
  ] = await Promise.all([
    db.query('SELECT COUNT(*)::int AS count FROM jobs'),
    db.query('SELECT COUNT(*)::int AS count FROM job_items'),
    db.query('SELECT COUNT(*)::int AS count FROM job_events'),
    db.query('SELECT COUNT(*)::int AS count FROM manual_review_targets'),
    db.query(`SELECT status, COUNT(*)::int AS count FROM jobs GROUP BY status ORDER BY status`),
    db.query(`SELECT status, COUNT(*)::int AS count FROM job_items GROUP BY status ORDER BY status`),
    db.query(`SELECT COUNT(*)::int AS count FROM job_items WHERE candidate_reviews IS NOT NULL AND candidate_reviews <> '[]'::jsonb`),
    db.query(`SELECT COUNT(*)::int AS count FROM job_items WHERE candidates IS NOT NULL AND jsonb_array_length(candidates) > 0`),
    db.query(`SELECT COUNT(*)::int AS count FROM job_items WHERE manual_capture_required IS TRUE`),
  ]);

  return {
    jobCount: Number(jobCountResult.rows[0] && jobCountResult.rows[0].count) || 0,
    itemCount: Number(itemCountResult.rows[0] && itemCountResult.rows[0].count) || 0,
    eventCount: Number(eventCountResult.rows[0] && eventCountResult.rows[0].count) || 0,
    manualReviewTargetCount: Number(targetCountResult.rows[0] && targetCountResult.rows[0].count) || 0,
    reviewedItemCount: Number(reviewCountResult.rows[0] && reviewCountResult.rows[0].count) || 0,
    candidateItemCount: Number(candidateCountResult.rows[0] && candidateCountResult.rows[0].count) || 0,
    manualCaptureRequiredCount: Number(manualCaptureCountResult.rows[0] && manualCaptureCountResult.rows[0].count) || 0,
    jobStatusCounts: jobStatusResult.rows,
    itemStatusCounts: itemStatusResult.rows,
  };
}

async function searchJobs(options, databaseUrl) {
  const opts = (options && typeof options === 'object') ? options : {};
  const db = getPool(databaseUrl);
  const params = [];
  const clauses = [];
  const jobId = String(opts.jobId || '').trim();
  if (jobId) {
    params.push(jobId);
    clauses.push(`id = $${params.length}`);
  }

  const searchClause = buildSearchClause([
    'id',
    'source_filename',
    'source_column',
    'status',
    'error_message',
  ], opts.query, params);
  if (searchClause) {
    clauses.push(searchClause);
  }

  const limit = Math.max(1, Number(opts.limit) || 25);
  params.push(limit);
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const result = await db.query(
    `SELECT id, source_filename, source_column, status, total_urls, pending_count,
            queued_count, running_count, completed_count, failed_count, detected_count,
            error_message, created_at, updated_at, finished_at
     FROM jobs
     ${where}
     ORDER BY updated_at DESC, created_at DESC
     LIMIT $${params.length}`,
    params,
  );
  return result.rows;
}

async function searchJobItems(options, databaseUrl) {
  const opts = (options && typeof options === 'object') ? options : {};
  const db = getPool(databaseUrl);
  const params = [];
  const clauses = [];
  const jobId = String(opts.jobId || '').trim();
  if (jobId) {
    params.push(jobId);
    clauses.push(`job_id = $${params.length}`);
  }

  const searchClause = buildSearchClause([
    'id',
    'job_id',
    'input_url',
    'normalized_url',
    'status',
    'title',
    'final_url',
    'best_ugc_type',
    'best_xpath',
    'best_css_path',
    'best_sample_text',
    'analysis_source',
    'manual_capture_required',
    'manual_capture_reason',
    'manual_capture_mode',
    'manual_capture_url',
    'manual_capture_title',
    'manual_capture_notes',
    'error_message',
    'scan_result',
    'candidates',
    'candidate_reviews',
    'best_candidate',
  ], opts.query, params);
  if (searchClause) {
    clauses.push(searchClause);
  }

  const limit = Math.max(1, Number(opts.limit) || 25);
  params.push(limit);
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const result = await db.query(
    `SELECT id, job_id, row_number, input_url, normalized_url, status, attempts,
            title, final_url, ugc_detected, best_score, best_confidence, best_ugc_type,
            best_xpath, best_css_path, best_sample_text, analysis_source,
            manual_capture_required, manual_capture_reason, manual_capture_mode,
            manual_capture_url, manual_capture_title, manual_capture_notes,
            error_message, created_at, updated_at, started_at, completed_at
     FROM job_items
     ${where}
     ORDER BY updated_at DESC, created_at DESC, row_number ASC
     LIMIT $${params.length}`,
    params,
  );
  return result.rows;
}

async function searchJobEvents(options, databaseUrl) {
  const opts = (options && typeof options === 'object') ? options : {};
  const db = getPool(databaseUrl);
  const params = [];
  const clauses = [];
  const jobId = String(opts.jobId || '').trim();
  if (jobId) {
    params.push(jobId);
    clauses.push(`je.job_id = $${params.length}`);
  }

  const itemId = String(opts.itemId || '').trim();
  if (itemId) {
    params.push(itemId);
    clauses.push(`je.item_id = $${params.length}`);
  }

  const searchClause = buildSearchClause([
    'je.job_id',
    'je.item_id',
    'je.scope',
    'je.level',
    'je.event_type',
    'je.event_key',
    'je.message',
    'je.details',
    'j.source_filename',
  ], opts.query, params);
  if (searchClause) {
    clauses.push(searchClause);
  }

  const limit = Math.max(1, Number(opts.limit) || 25);
  params.push(limit);
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const result = await db.query(
    `SELECT je.id, je.job_id, je.item_id, je.row_number, je.level, je.scope,
            je.event_type, je.event_key, je.message, je.details, je.created_at,
            j.source_filename
     FROM job_events je
     LEFT JOIN jobs j ON j.id = je.job_id
     ${where}
     ORDER BY je.created_at DESC
     LIMIT $${params.length}`,
    params,
  );
  return result.rows;
}

async function clearJobArtifactPaths(jobId, databaseUrl) {
  const normalizedJobId = String(jobId || '').trim();
  if (!normalizedJobId) throw new Error('jobId is required');
  const db = getPool(databaseUrl);
  // Clear file path/url columns on all items for this job
  await db.query(
    `UPDATE job_items SET
       screenshot_path = NULL,
       screenshot_url = NULL,
       manual_uploaded_screenshot_path = NULL,
       manual_uploaded_screenshot_url = NULL,
       manual_html_path = NULL,
       manual_html_url = NULL,
       manual_raw_html_path = NULL,
       manual_raw_html_url = NULL
     WHERE job_id = $1`,
    [normalizedJobId],
  );
  // Clear candidate_screenshot_path/url inside the candidates JSONB array
  await db.query(
    `UPDATE job_items
     SET candidates = (
       SELECT jsonb_agg(
         elem
           || jsonb_build_object('candidate_screenshot_path', '')
           || jsonb_build_object('candidate_screenshot_url', '')
       )
       FROM jsonb_array_elements(candidates) AS elem
     )
     WHERE job_id = $1 AND jsonb_array_length(candidates) > 0`,
    [normalizedJobId],
  );
}

function normalizeIdList(values) {
  return Array.isArray(values)
    ? Array.from(new Set(values.map((entry) => String(entry || '').trim()).filter(Boolean)))
    : [];
}

function computeJobCountsFromItems(items) {
  const counts = {
    pending_count: 0,
    queued_count: 0,
    running_count: 0,
    completed_count: 0,
    failed_count: 0,
    detected_count: 0,
  };

  for (const item of Array.isArray(items) ? items : []) {
    const status = String(item && item.status || '').trim();
    if (status === 'pending') counts.pending_count += 1;
    if (status === 'queued') counts.queued_count += 1;
    if (status === 'running') counts.running_count += 1;
    if (status === 'completed') counts.completed_count += 1;
    if (status === 'failed') counts.failed_count += 1;
    if (item && item.ugc_detected === true) counts.detected_count += 1;
  }

  return counts;
}

function computeJobStatusFromCounts(counts, totalUrls) {
  const total = Math.max(0, Number(totalUrls) || 0);
  const pending = Math.max(0, Number(counts && counts.pending_count) || 0);
  const queued = Math.max(0, Number(counts && counts.queued_count) || 0);
  const running = Math.max(0, Number(counts && counts.running_count) || 0);
  const completed = Math.max(0, Number(counts && counts.completed_count) || 0);
  const failed = Math.max(0, Number(counts && counts.failed_count) || 0);

  if ((completed + failed) === total && failed === total && total > 0) {
    return 'failed';
  }

  if ((completed + failed) === total && failed > 0) {
    return 'completed_with_errors';
  }

  if ((completed + failed) === total && total > 0) {
    return 'completed';
  }

  if (running > 0 || completed > 0 || failed > 0) {
    return 'running';
  }

  if (queued > 0) {
    return 'queued';
  }

  if (pending > 0) {
    return 'pending';
  }

  return total > 0 ? 'queued' : 'pending';
}

async function upsertJsonbRows(client, spec, rows) {
  const normalizedRows = Array.isArray(rows) ? rows : [];
  if (!normalizedRows.length) {
    return;
  }

  const columns = Array.isArray(spec && spec.columns) ? spec.columns : [];
  if (!columns.length) {
    return;
  }

  const tableName = String(spec && spec.tableName || '').trim();
  const conflictTarget = String(spec && spec.conflictTarget || '').trim();
  const updateColumns = Array.isArray(spec && spec.updateColumns) ? spec.updateColumns : [];
  if (!tableName || !conflictTarget || !updateColumns.length) {
    throw new Error('Invalid upsert specification');
  }

  const columnList = columns.map((column) => column.name).join(', ');
  const columnDefinitions = columns.map((column) => `${column.name} ${column.type}`).join(', ');
  const assignments = updateColumns.map((column) => `${column} = EXCLUDED.${column}`).join(', ');
  const query = `
    INSERT INTO ${tableName} (${columnList})
    SELECT ${columnList}
    FROM jsonb_to_recordset($1::jsonb) AS input(${columnDefinitions})
    ON CONFLICT (${conflictTarget}) DO UPDATE SET ${assignments}
  `;
  await client.query(query, [JSON.stringify(normalizedRows)]);
}

async function insertJsonbRows(client, spec, rows) {
  const normalizedRows = Array.isArray(rows) ? rows : [];
  if (!normalizedRows.length) {
    return 0;
  }

  const columns = Array.isArray(spec && spec.columns) ? spec.columns : [];
  if (!columns.length) {
    return 0;
  }

  const tableName = String(spec && spec.tableName || '').trim();
  const conflictTarget = String(spec && spec.conflictTarget || '').trim();
  if (!tableName || !conflictTarget) {
    throw new Error('Invalid insert specification');
  }

  const columnList = columns.map((column) => column.name).join(', ');
  const columnDefinitions = columns.map((column) => `${column.name} ${column.type}`).join(', ');
  const query = `
    INSERT INTO ${tableName} (${columnList})
    SELECT ${columnList}
    FROM jsonb_to_recordset($1::jsonb) AS input(${columnDefinitions})
    ON CONFLICT (${conflictTarget}) DO NOTHING
    RETURNING 1
  `;
  const result = await client.query(query, [JSON.stringify(normalizedRows)]);
  return result.rowCount || 0;
}

const JOB_BACKUP_COLUMNS = [
  { name: 'id', type: 'text' },
  { name: 'source_filename', type: 'text' },
  { name: 'source_column', type: 'text' },
  { name: 'source_job_ids', type: 'jsonb' },
  { name: 'scan_delay_ms', type: 'integer' },
  { name: 'screenshot_delay_ms', type: 'integer' },
  { name: 'candidate_mode', type: 'text' },
  { name: 'status', type: 'text' },
  { name: 'total_urls', type: 'integer' },
  { name: 'pending_count', type: 'integer' },
  { name: 'queued_count', type: 'integer' },
  { name: 'running_count', type: 'integer' },
  { name: 'completed_count', type: 'integer' },
  { name: 'failed_count', type: 'integer' },
  { name: 'detected_count', type: 'integer' },
  { name: 'error_message', type: 'text' },
  { name: 'created_at', type: 'timestamptz' },
  { name: 'updated_at', type: 'timestamptz' },
  { name: 'finished_at', type: 'timestamptz' },
];

const JOB_BACKUP_UPDATES = JOB_BACKUP_COLUMNS.map((column) => column.name);

const JOB_ITEM_BACKUP_COLUMNS = [
  { name: 'id', type: 'text' },
  { name: 'job_id', type: 'text' },
  { name: 'source_job_id', type: 'text' },
  { name: 'source_item_id', type: 'text' },
  { name: 'source_row_number', type: 'integer' },
  { name: 'row_number', type: 'integer' },
  { name: 'input_url', type: 'text' },
  { name: 'normalized_url', type: 'text' },
  { name: 'status', type: 'text' },
  { name: 'attempts', type: 'integer' },
  { name: 'title', type: 'text' },
  { name: 'final_url', type: 'text' },
  { name: 'ugc_detected', type: 'boolean' },
  { name: 'best_score', type: 'integer' },
  { name: 'best_confidence', type: 'text' },
  { name: 'best_ugc_type', type: 'text' },
  { name: 'best_xpath', type: 'text' },
  { name: 'best_css_path', type: 'text' },
  { name: 'best_sample_text', type: 'text' },
  { name: 'screenshot_path', type: 'text' },
  { name: 'screenshot_url', type: 'text' },
  { name: 'manual_uploaded_screenshot_path', type: 'text' },
  { name: 'manual_uploaded_screenshot_url', type: 'text' },
  { name: 'analysis_source', type: 'text' },
  { name: 'manual_capture_required', type: 'boolean' },
  { name: 'manual_capture_reason', type: 'text' },
  { name: 'manual_capture_mode', type: 'text' },
  { name: 'manual_html_path', type: 'text' },
  { name: 'manual_html_url', type: 'text' },
  { name: 'manual_raw_html_path', type: 'text' },
  { name: 'manual_raw_html_url', type: 'text' },
  { name: 'manual_capture_url', type: 'text' },
  { name: 'manual_capture_title', type: 'text' },
  { name: 'manual_capture_notes', type: 'text' },
  { name: 'manual_captured_at', type: 'timestamptz' },
  { name: 'candidate_reviews', type: 'jsonb' },
  { name: 'best_candidate', type: 'jsonb' },
  { name: 'candidates', type: 'jsonb' },
  { name: 'scan_result', type: 'jsonb' },
  { name: 'error_message', type: 'text' },
  { name: 'created_at', type: 'timestamptz' },
  { name: 'updated_at', type: 'timestamptz' },
  { name: 'started_at', type: 'timestamptz' },
  { name: 'completed_at', type: 'timestamptz' },
];

const JOB_ITEM_BACKUP_UPDATES = JOB_ITEM_BACKUP_COLUMNS.map((column) => column.name);

const JOB_EVENT_BACKUP_COLUMNS = [
  { name: 'id', type: 'text' },
  { name: 'job_id', type: 'text' },
  { name: 'item_id', type: 'text' },
  { name: 'row_number', type: 'integer' },
  { name: 'level', type: 'text' },
  { name: 'scope', type: 'text' },
  { name: 'event_type', type: 'text' },
  { name: 'event_key', type: 'text' },
  { name: 'message', type: 'text' },
  { name: 'details', type: 'jsonb' },
  { name: 'created_at', type: 'timestamptz' },
];

const JOB_EVENT_BACKUP_UPDATES = JOB_EVENT_BACKUP_COLUMNS.map((column) => column.name);

const MANUAL_REVIEW_TARGET_BACKUP_COLUMNS = [
  { name: 'selection_key', type: 'text' },
  { name: 'job_id', type: 'text' },
  { name: 'item_id', type: 'text' },
  { name: 'capture_url', type: 'text' },
  { name: 'title', type: 'text' },
  { name: 'created_at', type: 'timestamptz' },
  { name: 'updated_at', type: 'timestamptz' },
];

const MANUAL_REVIEW_TARGET_BACKUP_UPDATES = MANUAL_REVIEW_TARGET_BACKUP_COLUMNS.map((column) => column.name);

async function listAllJobs(databaseUrl) {
  const db = getPool(databaseUrl);
  const result = await db.query('SELECT * FROM jobs ORDER BY created_at ASC, id ASC');
  return result.rows;
}

async function listAllJobItems(databaseUrl) {
  const db = getPool(databaseUrl);
  const result = await db.query('SELECT * FROM job_items ORDER BY created_at ASC, row_number ASC, id ASC');
  return result.rows;
}

async function listAllJobEvents(databaseUrl) {
  const db = getPool(databaseUrl);
  const result = await db.query('SELECT * FROM job_events ORDER BY created_at ASC, id ASC');
  return result.rows;
}

async function listAllManualReviewTargets(databaseUrl) {
  const db = getPool(databaseUrl);
  const result = await db.query('SELECT * FROM manual_review_targets ORDER BY created_at ASC, selection_key ASC');
  return result.rows;
}

async function buildProjectBackup(databaseUrl) {
  const [jobs, jobItems, jobEvents, manualReviewTargets, summary] = await Promise.all([
    listAllJobs(databaseUrl),
    listAllJobItems(databaseUrl),
    listAllJobEvents(databaseUrl),
    listAllManualReviewTargets(databaseUrl),
    getDatabaseSummary(databaseUrl),
  ]);

  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    jobs,
    jobItems,
    jobEvents,
    manualReviewTargets,
    metadata: summary,
  };
}

async function restoreProjectBackup(backup, databaseUrl) {
  const normalizedBackup = backup && typeof backup === 'object' ? backup : {};
  const db = getPool(databaseUrl);
  const client = await db.connect();
  const touchedJobIds = new Set();
  let insertedJobCount = 0;
  let insertedItemCount = 0;
  let insertedEventCount = 0;
  let insertedManualReviewTargetCount = 0;

  try {
    await client.query('BEGIN');

    const jobs = Array.isArray(normalizedBackup.jobs) ? normalizedBackup.jobs : [];
    const jobItems = Array.isArray(normalizedBackup.jobItems) ? normalizedBackup.jobItems : [];
    const jobEvents = Array.isArray(normalizedBackup.jobEvents) ? normalizedBackup.jobEvents : [];
    const manualReviewTargets = Array.isArray(normalizedBackup.manualReviewTargets) ? normalizedBackup.manualReviewTargets : [];

    jobs.forEach((job) => {
      if (job && job.id) {
        touchedJobIds.add(String(job.id));
      }
    });
    jobItems.forEach((item) => {
      if (item && item.job_id) {
        touchedJobIds.add(String(item.job_id));
      }
    });
    manualReviewTargets.forEach((target) => {
      if (target && target.job_id) {
        touchedJobIds.add(String(target.job_id));
      }
    });
    jobEvents.forEach((event) => {
      if (event && event.job_id) {
        touchedJobIds.add(String(event.job_id));
      }
    });

    insertedJobCount = await insertJsonbRows(client, {
      tableName: 'jobs',
      columns: JOB_BACKUP_COLUMNS,
      conflictTarget: 'id',
    }, jobs);

    insertedItemCount = await insertJsonbRows(client, {
      tableName: 'job_items',
      columns: JOB_ITEM_BACKUP_COLUMNS,
      conflictTarget: 'id',
    }, jobItems);

    insertedManualReviewTargetCount = await insertJsonbRows(client, {
      tableName: 'manual_review_targets',
      columns: MANUAL_REVIEW_TARGET_BACKUP_COLUMNS,
      conflictTarget: 'selection_key',
    }, manualReviewTargets);

    insertedEventCount = await insertJsonbRows(client, {
      tableName: 'job_events',
      columns: JOB_EVENT_BACKUP_COLUMNS,
      conflictTarget: 'id',
    }, jobEvents);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return {
    jobIds: Array.from(touchedJobIds),
    jobCount: insertedJobCount,
    itemCount: insertedItemCount,
    eventCount: insertedEventCount,
    manualReviewTargetCount: insertedManualReviewTargetCount,
  };
}

function buildMergedSourceFilename(sourceJobs, fallbackLabel) {
  const labels = Array.isArray(sourceJobs)
    ? sourceJobs.map((job) => String(job && (job.source_filename || job.id) || '').trim()).filter(Boolean)
    : [];
  if (labels.length) {
    return `Combined: ${labels.join(' + ')}`;
  }
  return String(fallbackLabel || 'combined-jobs');
}

async function combineJobs(jobIds, options = {}, databaseUrl) {
  const normalizedJobIds = normalizeIdList(jobIds);
  if (normalizedJobIds.length < 2) {
    throw new Error('At least two job IDs are required');
  }

  const db = getPool(databaseUrl);
  const client = await db.connect();
  const newJobId = crypto.randomUUID();
  const artifactOptions = {
    artifactRoot: options.artifactRoot || '',
    artifactUrlBasePath: options.artifactUrlBasePath || '/artifacts',
    publicBaseUrl: options.publicBaseUrl || '',
    jobId: newJobId,
  };
  const hasScanDelayOverride = options.scanDelayMs !== undefined && options.scanDelayMs !== null && String(options.scanDelayMs).trim() !== '';
  const hasScreenshotDelayOverride = options.screenshotDelayMs !== undefined && options.screenshotDelayMs !== null && String(options.screenshotDelayMs).trim() !== '';
  const hasSourceFilenameOverride = options.sourceFilename !== undefined && options.sourceFilename !== null && String(options.sourceFilename).trim() !== '';
  const hasSourceColumnOverride = options.sourceColumn !== undefined && options.sourceColumn !== null && String(options.sourceColumn).trim() !== '';
  const defaultScanDelayMs = Number.isFinite(Number(options.defaultScanDelayMs))
    ? Number(options.defaultScanDelayMs)
    : 0;
  const defaultScreenshotDelayMs = Number.isFinite(Number(options.defaultScreenshotDelayMs))
    ? Number(options.defaultScreenshotDelayMs)
    : 0;

  try {
    const sourceJobsResult = await client.query(
      'SELECT * FROM jobs WHERE id = ANY($1::text[])',
      [normalizedJobIds],
    );
    if (sourceJobsResult.rows.length !== normalizedJobIds.length) {
      throw new Error('One or more jobs were not found');
    }

    const sourceJobMap = new Map(sourceJobsResult.rows.map((job) => [String(job.id), job]));
    const orderedSourceJobs = normalizedJobIds.map((jobId) => sourceJobMap.get(jobId)).filter(Boolean);
    const mergedItems = [];
    let rowNumber = 1;

    for (const sourceJob of orderedSourceJobs) {
      const itemsResult = await client.query(
        'SELECT * FROM job_items WHERE job_id = $1 ORDER BY row_number ASC, created_at ASC, id ASC',
        [sourceJob.id],
      );

      for (const sourceItem of itemsResult.rows) {
        const cloned = await cloneValueWithArtifactCopies(sourceItem, artifactOptions);
        cloned.id = crypto.randomUUID();
        cloned.job_id = newJobId;
        cloned.source_job_id = String(sourceJob.id);
        cloned.source_item_id = String(sourceItem.id);
        cloned.source_row_number = Number.isFinite(Number(sourceItem.row_number))
          ? Number(sourceItem.row_number)
          : null;
        cloned.row_number = rowNumber;
        mergedItems.push(cloned);
        rowNumber += 1;
      }
    }

    const counts = computeJobCountsFromItems(mergedItems);
    const totalUrls = mergedItems.length;
    const jobStatus = computeJobStatusFromCounts(counts, totalUrls);
    const sourceJobIds = orderedSourceJobs.map((job) => String(job.id));
    const sourceFilename = hasSourceFilenameOverride
      ? String(options.sourceFilename || '')
      : buildMergedSourceFilename(orderedSourceJobs, 'combined-jobs');
    const sourceColumn = hasSourceColumnOverride
      ? String(options.sourceColumn || '')
      : 'combined';
    const now = new Date().toISOString();
    const mergedJob = {
      id: newJobId,
      source_filename: sourceFilename,
      source_column: sourceColumn,
      source_job_ids: sourceJobIds,
      scan_delay_ms: hasScanDelayOverride && Number.isFinite(Number(options.scanDelayMs))
        ? Number(options.scanDelayMs)
        : (
          Number.isFinite(Number(orderedSourceJobs[0] && orderedSourceJobs[0].scan_delay_ms))
            ? Number(orderedSourceJobs[0].scan_delay_ms)
            : defaultScanDelayMs
        ),
      screenshot_delay_ms: hasScreenshotDelayOverride && Number.isFinite(Number(options.screenshotDelayMs))
        ? Number(options.screenshotDelayMs)
        : (
          Number.isFinite(Number(orderedSourceJobs[0] && orderedSourceJobs[0].screenshot_delay_ms))
            ? Number(orderedSourceJobs[0].screenshot_delay_ms)
            : defaultScreenshotDelayMs
        ),
      candidate_mode: normalizeCandidateSelectionMode(
        options.candidateMode !== undefined
          ? options.candidateMode
          : (orderedSourceJobs[0] && orderedSourceJobs[0].candidate_mode),
      ),
      status: jobStatus,
      total_urls: totalUrls,
      pending_count: counts.pending_count,
      queued_count: counts.queued_count,
      running_count: counts.running_count,
      completed_count: counts.completed_count,
      failed_count: counts.failed_count,
      detected_count: counts.detected_count,
      error_message: '',
      created_at: now,
      updated_at: now,
      finished_at: jobStatus === 'completed' || jobStatus === 'completed_with_errors' || jobStatus === 'failed'
        ? now
        : null,
    };

    await client.query('BEGIN');
    await upsertJsonbRows(client, {
      tableName: 'jobs',
      columns: JOB_BACKUP_COLUMNS,
      conflictTarget: 'id',
      updateColumns: JOB_BACKUP_UPDATES,
    }, [mergedJob]);

    await upsertJsonbRows(client, {
      tableName: 'job_items',
      columns: JOB_ITEM_BACKUP_COLUMNS,
      conflictTarget: 'id',
      updateColumns: JOB_ITEM_BACKUP_UPDATES,
    }, mergedItems);

    await client.query('COMMIT');

    return {
      job: mergedJob,
      jobId: newJobId,
      sourceJobIds,
      totalUrls,
      counts,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  getPool,
  getDatabaseQuerySnapshot,
  ensureSchema,
  clearJobArtifactPaths,
  createJob,
  buildProjectBackup,
  restoreProjectBackup,
  combineJobs,
  replaceJobRecords,
  restartJob,
  resumeJob,
  resumeFailedItems,
  deleteJob,
  clearAllJobs,
  listJobs,
  appendJobEvent,
  listAllEvents,
  listRecentJobItems,
  listJobEvents,
  listIncompleteJobs,
  getJob,
  getJobItem,
  getJobItems,
  getDatabaseSummary,
  listItemsForModeling,
  listJobItemsByStatuses,
  listManualReviewCandidates,
  searchJobs,
  searchJobItems,
  searchJobEvents,
  setManualReviewTarget,
  getManualReviewTarget,
  claimPendingItems,
  releaseQueuedItems,
  setItemStatus,
  markItemRunning,
  markItemCompleted,
  markItemFailed,
  upsertCandidateReview,
  recomputeJob,
};
