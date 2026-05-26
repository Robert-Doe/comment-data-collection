'use strict';

/**
 * Unifier Routes
 *
 * Creates a single "Unified Dataset" job that spans all existing jobs:
 *   - Collects EVERY job_item across all non-unified, non-deleted jobs
 *   - Groups items by normalized_url so each URL appears exactly once
 *   - Deduplicates candidate_reviews across jobs: same candidate_key → keep earliest label
 *   - Picks the "best" source item per URL (prefers items with full scan data / screenshots)
 *   - ugc_detected: derived from labeled reviews when present, else from the best item's scan result
 *   - Inserts a new job + new job_items into the database
 */

const crypto  = require('crypto');
const { Pool } = require('pg');
const express  = require('express');

// ── Pool singleton ─────────────────────────────────────────────────────────────
let _pool = null;
function getPool(databaseUrl) {
  if (!_pool) _pool = new Pool({ connectionString: databaseUrl });
  return _pool;
}

// ── Constants ──────────────────────────────────────────────────────────────────
// Labels that carry no binary signal for training — excluded from merged reviews
const SKIP_LABELS = new Set(['', 'uncertain']);

// source_column values that mark derived / synthetic jobs — excluded from source pull
// to avoid circular references and double-counting rolled-up data.
const EXCLUDE_SOURCE_COLUMNS = new Set(['unified']);

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Stable deduplication key for a candidate_review entry */
function dedupKey(review) {
  return review.candidate_key || review.xpath || String(review.candidate_rank ?? '');
}

/**
 * Given an array of labeled reviews for the same URL collected across multiple jobs,
 * return one review per unique dedupKey — keeping the one with the EARLIEST created_at.
 */
function deduplicateReviews(reviews) {
  const seen = new Map(); // dedupKey → best (earliest) review
  for (const r of reviews) {
    const key = dedupKey(r);
    if (!key) continue;
    if (!seen.has(key)) {
      seen.set(key, r);
    } else {
      const existing   = seen.get(key);
      const existingTs = new Date(existing.created_at || 0).getTime();
      const incomingTs = new Date(r.created_at      || 0).getTime();
      if (incomingTs < existingTs) seen.set(key, r); // earlier wins
    }
  }
  return Array.from(seen.values());
}

/**
 * Among multiple job_items for the same URL, pick the one with the most complete
 * scan data so the unified item has the best screenshots / candidate metadata.
 */
function pickBestItem(items) {
  return items.reduce((best, item) => {
    const score = (b) =>
      (b.candidates         ? 4 : 0) +
      (b.screenshot_path    ? 2 : 0) +
      (b.best_candidate     ? 1 : 0);
    return score(item) > score(best) ? item : best;
  }, items[0]);
}

/** Parse a JSONB value that pg may return as either a JS object or a raw string */
function parseJsonb(val) {
  if (val == null)            return null;
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch (_) { return null; }
  }
  return val;
}

// ── Router factory ─────────────────────────────────────────────────────────────
function createUnifierRouter({ databaseUrl }) {
  const router = express.Router();

  // ── GET /preview ─────────────────────────────────────────────────────────────
  // Returns statistics about what a unification run would produce — no DB writes.
  router.get('/preview', async (_req, res, next) => {
    try {
      const db = getPool(databaseUrl);

      // All non-unified, non-deleted jobs
      const jobsRes = await db.query(`
        SELECT id, source_filename, source_column, total_urls, completed_count, detected_count, created_at
        FROM   jobs
        WHERE  deleted_at IS NULL
          AND  source_column NOT IN ('unified')
        ORDER  BY created_at ASC
      `);

      // All-URLs stats (no label requirement)
      const allStatsRes = await db.query(`
        SELECT
          COUNT(DISTINCT ji.normalized_url)  AS total_unique_urls,
          COUNT(DISTINCT ji.id)              AS total_items,
          COUNT(DISTINCT ji.job_id)          AS source_job_count
        FROM   jobs j
        JOIN   job_items ji ON ji.job_id = j.id
        WHERE  j.deleted_at IS NULL
          AND  j.source_column NOT IN ('unified')
      `);

      // Labeled-candidate stats (for training signal info)
      const labelStatsRes = await db.query(`
        SELECT
          COUNT(DISTINCT ji.normalized_url)                        AS labeled_urls,
          COUNT(*)                                                 AS total_labeled,
          COUNT(CASE WHEN r->>'source' = 'web_review' THEN 1 END) AS human_labeled,
          COUNT(CASE WHEN r->>'source' = 'inferred'   THEN 1 END) AS inferred_labeled
        FROM   jobs j
        JOIN   job_items ji ON ji.job_id = j.id,
        LATERAL jsonb_array_elements(ji.candidate_reviews) r
        WHERE  j.deleted_at IS NULL
          AND  j.source_column NOT IN ('unified')
          AND  r->>'label' IS NOT NULL
          AND  r->>'label' NOT IN ('', 'uncertain')
      `);

      // URLs that appear in more than one source job
      const dupRes = await db.query(`
        SELECT COUNT(*) AS duplicate_urls
        FROM (
          SELECT   ji.normalized_url
          FROM     jobs j
          JOIN     job_items ji ON ji.job_id = j.id
          WHERE    j.deleted_at IS NULL
            AND    j.source_column NOT IN ('unified')
          GROUP BY ji.normalized_url
          HAVING   COUNT(DISTINCT ji.job_id) > 1
        ) dups
      `);

      const a = allStatsRes.rows[0];
      const l = labelStatsRes.rows[0];
      res.json({
        ok:                 true,
        source_jobs:        jobsRes.rows,
        total_unique_urls:  Number(a.total_unique_urls)  || 0,
        total_items:        Number(a.total_items)        || 0,
        source_job_count:   Number(a.source_job_count)   || 0,
        labeled_urls:       Number(l.labeled_urls)       || 0,
        total_labeled:      Number(l.total_labeled)      || 0,
        human_labeled:      Number(l.human_labeled)      || 0,
        inferred_labeled:   Number(l.inferred_labeled)   || 0,
        duplicate_urls:     Number(dupRes.rows[0].duplicate_urls) || 0,
        // legacy aliases kept for older clients
        unique_urls:        Number(a.total_unique_urls)  || 0,
        source_item_count:  Number(a.total_items)        || 0,
      });
    } catch (err) { next(err); }
  });

  // ── GET /export-urls.csv ──────────────────────────────────────────────────────
  // Streams every unique normalized_url with basic metadata as a CSV — no job created.
  router.get('/export-urls.csv', async (_req, res, next) => {
    try {
      const db = getPool(databaseUrl);

      const result = await db.query(`
        SELECT
          ji.normalized_url,
          ji.input_url,
          ji.title,
          ji.final_url,
          ji.status,
          bool_or(ji.ugc_detected)                                    AS ugc_detected,
          COUNT(DISTINCT ji.job_id)                                   AS job_count,
          MIN(ji.created_at)                                          AS first_seen,
          MAX(ji.created_at)                                          AS last_seen,
          bool_or(EXISTS (
            SELECT 1 FROM jsonb_array_elements(ji.candidate_reviews) r
            WHERE  r->>'label' NOT IN ('', 'uncertain')
          ))                                                          AS has_label,
          string_agg(DISTINCT j.source_filename, ' | '
                     ORDER BY j.source_filename)                     AS source_jobs
        FROM   jobs j
        JOIN   job_items ji ON ji.job_id = j.id
        WHERE  j.deleted_at IS NULL
          AND  j.source_column NOT IN ('unified')
        GROUP BY
          ji.normalized_url, ji.input_url, ji.title, ji.final_url, ji.status
        ORDER BY ji.normalized_url
      `);

      const escape = (v) => {
        if (v == null) return '';
        const s = String(v);
        return s.includes(',') || s.includes('"') || s.includes('\n')
          ? '"' + s.replace(/"/g, '""') + '"'
          : s;
      };

      const header = 'normalized_url,input_url,title,final_url,status,ugc_detected,job_count,first_seen,last_seen,has_label,source_jobs\n';
      const rows   = result.rows.map((r) => [
        r.normalized_url, r.input_url, r.title, r.final_url,
        r.status, r.ugc_detected, r.job_count,
        r.first_seen, r.last_seen, r.has_label, r.source_jobs,
      ].map(escape).join(',')).join('\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="all-urls.csv"');
      res.send(header + rows + '\n');
    } catch (err) { next(err); }
  });

  // ── POST /create ──────────────────────────────────────────────────────────────
  // Actually creates the unified job.
  //
  // Body (all optional):
  //   { name: string, includeInferred: boolean }
  router.post('/create', async (req, res, next) => {
    try {
      const db           = getPool(databaseUrl);
      const jobName      = String((req.body && req.body.name) || 'Unified Dataset').trim().slice(0, 200) || 'Unified Dataset';
      const inclInferred = req.body && req.body.includeInferred !== false; // default: true

      // ── 1. Load ALL job_items from every non-unified, non-deleted job ─────────
      // No label requirement — every URL ever submitted is included.
      const itemsRes = await db.query(`
        SELECT ji.*
        FROM   jobs j
        JOIN   job_items ji ON ji.job_id = j.id
        WHERE  j.deleted_at IS NULL
          AND  j.source_column NOT IN ('unified')
        ORDER  BY ji.created_at ASC
      `);

      if (!itemsRes.rows.length) {
        return res.status(400).json({ error: 'No job items found across any job.' });
      }

      // ── 2. Group by normalized_url ────────────────────────────────────────────
      // For each URL: collect ALL items (for pickBestItem) and ALL qualifying
      // labeled reviews (for training signal / ugc_detected override).
      const urlMap = new Map(); // normalized_url → { items: [], allReviews: [] }

      for (const item of itemsRes.rows) {
        const url = item.normalized_url;
        if (!url) continue;

        const reviews = parseJsonb(item.candidate_reviews);

        if (!urlMap.has(url)) urlMap.set(url, { items: [], allReviews: [] });
        const entry = urlMap.get(url);
        entry.items.push(item);

        // Collect labeled reviews for this item (training signal only)
        if (Array.isArray(reviews)) {
          for (const r of reviews) {
            if (!r || !r.label || SKIP_LABELS.has(r.label)) continue;
            if (!inclInferred && r.source !== 'web_review') continue;
            entry.allReviews.push(r);
          }
        }
      }

      // ── 3. Build the list of new job_items ────────────────────────────────────
      const newJobId  = crypto.randomUUID();
      const newItems  = [];
      let   rowNumber = 1;

      for (const [, { items, allReviews }] of urlMap) {
        const best    = pickBestItem(items);
        const deduped = deduplicateReviews(allReviews);

        // ugc_detected:
        //   - If we have labeled reviews → derive from positive label presence
        //   - Otherwise → carry forward the best item's original scan result
        const ugcDetected = deduped.length > 0
          ? deduped.some((r) => r.label === 'comment_region')
          : !!best.ugc_detected;

        newItems.push({
          id:                crypto.randomUUID(),
          job_id:            newJobId,
          row_number:        rowNumber,
          input_url:         best.input_url,
          normalized_url:    best.normalized_url,
          status:            best.status || 'completed',
          title:             best.title             || null,
          final_url:         best.final_url         || null,
          ugc_detected:      ugcDetected,
          best_score:        best.best_score        || null,
          best_confidence:   best.best_confidence   || null,
          best_xpath:        best.best_xpath        || null,
          best_css_path:     best.best_css_path     || null,
          best_sample_text:  best.best_sample_text  || null,
          screenshot_path:   best.screenshot_path   || null,
          screenshot_url:    best.screenshot_url    || null,
          candidates:        parseJsonb(best.candidates),
          candidate_reviews: deduped,
          best_candidate:    parseJsonb(best.best_candidate),
          source_job_id:     best.job_id,
          source_item_id:    best.id,
          source_row_number: best.row_number,
        });
        rowNumber++;
      }

      if (!newItems.length) {
        return res.status(400).json({ error: 'No unique URLs found after deduplication.' });
      }

      // ── 4. Compute the source_job_ids list ────────────────────────────────────
      const sourceJobIds = [...new Set(itemsRes.rows.map((r) => r.job_id))];

      // ── 5. Write everything in a transaction ──────────────────────────────────
      const client = await db.connect();
      try {
        await client.query('BEGIN');

        const now          = new Date().toISOString();
        const detectedCount = newItems.filter((i) => i.ugc_detected).length;
        const labeledCount  = newItems.filter((i) => i.candidate_reviews.length > 0).length;

        // Create the unified job
        await client.query(`
          INSERT INTO jobs (
            id, source_filename, source_column, source_job_ids,
            scan_delay_ms, screenshot_delay_ms, candidate_mode,
            status, total_urls, pending_count, queued_count, running_count,
            completed_count, failed_count, detected_count,
            created_at, updated_at, finished_at
          ) VALUES (
            $1, $2, 'unified', $3::jsonb,
            6000, 1500, 'default',
            'completed', $4, 0, 0, 0,
            $4, 0, $5,
            $6, $6, $6
          )
        `, [newJobId, jobName, JSON.stringify(sourceJobIds), newItems.length, detectedCount, now]);

        // Insert items in batches of 100
        const BATCH = 100;
        for (let i = 0; i < newItems.length; i += BATCH) {
          for (const item of newItems.slice(i, i + BATCH)) {
            await client.query(`
              INSERT INTO job_items (
                id, job_id, row_number, input_url, normalized_url,
                status, title, final_url, ugc_detected,
                best_score, best_confidence, best_xpath, best_css_path, best_sample_text,
                screenshot_path, screenshot_url,
                candidates, candidate_reviews, best_candidate,
                source_job_id, source_item_id, source_row_number,
                created_at, updated_at
              ) VALUES (
                $1, $2, $3, $4, $5,
                $6, $7, $8, $9,
                $10, $11, $12, $13, $14,
                $15, $16,
                $17::jsonb, $18::jsonb, $19::jsonb,
                $20, $21, $22,
                $23, $23
              )
            `, [
              item.id, item.job_id, item.row_number, item.input_url, item.normalized_url,
              item.status, item.title, item.final_url, item.ugc_detected,
              item.best_score, item.best_confidence, item.best_xpath, item.best_css_path, item.best_sample_text,
              item.screenshot_path, item.screenshot_url,
              JSON.stringify(item.candidates      ?? null),
              JSON.stringify(item.candidate_reviews),
              JSON.stringify(item.best_candidate  ?? null),
              item.source_job_id, item.source_item_id, item.source_row_number,
              now,
            ]);
          }
        }

        await client.query('COMMIT');

        res.json({
          ok:               true,
          jobId:            newJobId,
          jobName,
          totalUrls:        newItems.length,
          labeledUrls:      labeledCount,
          detectedCount,
          sourceJobCount:   sourceJobIds.length,
          duplicatesRemoved: itemsRes.rows.length - newItems.length,
        });
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    } catch (err) { next(err); }
  });

  return router;
}

module.exports = { createUnifierRouter };
