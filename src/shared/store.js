'use strict';

const { Pool } = require('pg');
const crypto = require('crypto');
const { upsertCandidateReview: upsertCandidateReviewArray } = require('./candidateReviews');

let pool;

function getPool(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  if (!pool) {
    pool = new Pool({
      connectionString: databaseUrl,
    });
  }

  return pool;
}

async function ensureSchema(databaseUrl) {
  const db = getPool(databaseUrl);
  await db.query(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      source_filename TEXT,
      source_column TEXT,
      scan_delay_ms INTEGER NOT NULL DEFAULT 6000,
      screenshot_delay_ms INTEGER NOT NULL DEFAULT 1500,
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

    CREATE INDEX IF NOT EXISTS idx_job_items_job_id ON job_items(job_id);
    CREATE INDEX IF NOT EXISTS idx_job_items_status ON job_items(status);
  `);

  await db.query(`
    ALTER TABLE jobs
    ADD COLUMN IF NOT EXISTS pending_count INTEGER NOT NULL DEFAULT 0;

    ALTER TABLE jobs
    ADD COLUMN IF NOT EXISTS scan_delay_ms INTEGER NOT NULL DEFAULT 6000;

    ALTER TABLE jobs
    ADD COLUMN IF NOT EXISTS screenshot_delay_ms INTEGER NOT NULL DEFAULT 1500;

    ALTER TABLE job_items
    ADD COLUMN IF NOT EXISTS scan_result JSONB;

    ALTER TABLE job_items
    ADD COLUMN IF NOT EXISTS screenshot_path TEXT;

    ALTER TABLE job_items
    ADD COLUMN IF NOT EXISTS screenshot_url TEXT;

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
}, databaseUrl) {
  const db = getPool(databaseUrl);
  const client = await db.connect();
  const jobId = crypto.randomUUID();

  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO jobs (
        id, source_filename, source_column, scan_delay_ms, screenshot_delay_ms, status, total_urls, pending_count, queued_count
      ) VALUES ($1, $2, $3, $4, $5, 'queued', $6, $6, 0)`,
      [jobId, sourceFilename || '', sourceColumn || '', scanDelayMs, screenshotDelayMs, records.length],
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
         analysis_source = $13,
         manual_capture_required = $14,
         manual_capture_reason = $15,
         manual_capture_mode = $16,
         manual_html_path = $17,
         manual_html_url = $18,
         manual_raw_html_path = $19,
         manual_raw_html_url = $20,
         manual_capture_url = $21,
         manual_capture_title = $22,
         manual_capture_notes = $23,
         manual_captured_at = CASE WHEN $13 = 'manual_snapshot' THEN NOW() ELSE manual_captured_at END,
         best_candidate = $24::jsonb,
         candidates = $25::jsonb,
         scan_result = $26::jsonb,
         error_message = $27,
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
         analysis_source = $5,
         manual_capture_required = $6,
         manual_capture_reason = $7,
         manual_capture_mode = $8,
         manual_html_path = $9,
         manual_html_url = $10,
         manual_raw_html_path = $11,
         manual_raw_html_url = $12,
         manual_capture_url = $13,
         manual_capture_title = $14,
         manual_capture_notes = $15,
         manual_captured_at = CASE WHEN $5 = 'manual_snapshot' THEN NOW() ELSE manual_captured_at END,
         scan_result = $16::jsonb,
         completed_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [
      itemId,
      String(errorMessage || ''),
      scanResult ? (scanResult.screenshot_path || null) : null,
      scanResult ? (scanResult.screenshot_url || null) : null,
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

async function upsertCandidateReview(jobId, itemId, review, databaseUrl) {
  const existingItem = await getJobItem(jobId, itemId, databaseUrl);
  if (!existingItem) {
    return null;
  }

  const nextReviews = upsertCandidateReviewArray(existingItem.candidate_reviews || [], review);
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

module.exports = {
  getPool,
  ensureSchema,
  createJob,
  listJobs,
  getJob,
  getJobItem,
  getJobItems,
  listManualReviewCandidates,
  setManualReviewTarget,
  getManualReviewTarget,
  claimPendingItems,
  releaseQueuedItems,
  markItemRunning,
  markItemCompleted,
  markItemFailed,
  upsertCandidateReview,
  recomputeJob,
};
