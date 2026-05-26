'use strict';

/**
 * Unifier Routes
 *
 * Creates a single "Unified Dataset" job that spans all existing jobs:
 *   - Collects every job_item that has at least one labeled candidate_review
 *   - Groups items by normalized_url so each URL appears exactly once
 *   - Deduplicates candidate_reviews across jobs: same candidate_key → keep earliest label
 *   - Picks the "best" source item per URL (prefers items with full scan data / screenshots)
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
// Labels that carry no binary signal for training — excluded from the unified set
const SKIP_LABELS = new Set(['', 'uncertain']);

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
  // Returns statistics about what a unification run would produce — does not
  // write anything to the database.
  router.get('/preview', async (_req, res, next) => {
    try {
      const db = getPool(databaseUrl);

      // All non-deleted jobs
      const jobsRes = await db.query(`
        SELECT id, source_filename, total_urls, completed_count, detected_count, created_at
        FROM   jobs
        WHERE  deleted_at IS NULL
        ORDER  BY created_at ASC
      `);

      // Aggregate stats across all labeled candidate_reviews
      const statsRes = await db.query(`
        SELECT
          COUNT(DISTINCT ji.normalized_url)                                         AS unique_urls,
          COUNT(*)                                                                  AS total_labeled,
          COUNT(CASE WHEN r->>'source' = 'web_review' THEN 1 END)                  AS human_labeled,
          COUNT(CASE WHEN r->>'source' = 'inferred'   THEN 1 END)                  AS inferred_labeled,
          COUNT(DISTINCT ji.job_id)                                                 AS source_job_count,
          COUNT(DISTINCT ji.id)                                                     AS source_item_count
        FROM   jobs j
        JOIN   job_items ji ON ji.job_id = j.id,
        LATERAL jsonb_array_elements(ji.candidate_reviews) r
        WHERE  j.deleted_at IS NULL
          AND  r->>'label' IS NOT NULL
          AND  r->>'label' NOT IN ('', 'uncertain')
      `);

      // URLs that appear in more than one job (true cross-job duplicates)
      const dupRes = await db.query(`
        SELECT COUNT(*) AS duplicate_urls
        FROM (
          SELECT   ji.normalized_url
          FROM     jobs j
          JOIN     job_items ji ON ji.job_id = j.id
          WHERE    j.deleted_at IS NULL
            AND    EXISTS (
              SELECT 1 FROM jsonb_array_elements(ji.candidate_reviews) r
              WHERE  r->>'label' IS NOT NULL AND r->>'label' NOT IN ('', 'uncertain')
            )
          GROUP BY ji.normalized_url
          HAVING   COUNT(DISTINCT ji.job_id) > 1
        ) dups
      `);

      const s = statsRes.rows[0];
      res.json({
        ok:                 true,
        source_jobs:        jobsRes.rows,
        unique_urls:        Number(s.unique_urls)        || 0,
        total_labeled:      Number(s.total_labeled)      || 0,
        human_labeled:      Number(s.human_labeled)      || 0,
        inferred_labeled:   Number(s.inferred_labeled)   || 0,
        source_job_count:   Number(s.source_job_count)   || 0,
        source_item_count:  Number(s.source_item_count)  || 0,
        duplicate_urls:     Number(dupRes.rows[0].duplicate_urls) || 0,
      });
    } catch (err) { next(err); }
  });

  // ── POST /create ──────────────────────────────────────────────────────────────
  // Actually creates the unified job.
  //
  // Body (all optional):
  //   { name: string, includeInferred: boolean }
  router.post('/create', async (req, res, next) => {
    try {
      const db             = getPool(databaseUrl);
      const jobName        = String((req.body && req.body.name) || 'Unified Dataset').trim().slice(0, 200) || 'Unified Dataset';
      const inclInferred   = req.body && req.body.includeInferred !== false; // default: true

      // ── 1. Load all job_items that have at least one qualifying labeled review ──
      const sourceFilter = inclInferred
        ? "r->>'label' NOT IN ('', 'uncertain')"
        : "r->>'label' NOT IN ('', 'uncertain') AND r->>'source' = 'web_review'";

      const itemsRes = await db.query(`
        SELECT ji.*
        FROM   jobs j
        JOIN   job_items ji ON ji.job_id = j.id
        WHERE  j.deleted_at IS NULL
          AND  EXISTS (
            SELECT 1 FROM jsonb_array_elements(ji.candidate_reviews) r
            WHERE  ${sourceFilter}
          )
        ORDER  BY ji.created_at ASC
      `);

      if (!itemsRes.rows.length) {
        return res.status(400).json({ error: 'No labeled candidates found across any job.' });
      }

      // ── 2. Group by normalized_url, collect all qualifying reviews per URL ────
      const urlMap = new Map(); // normalized_url → { items: [], allReviews: [] }

      for (const item of itemsRes.rows) {
        const url     = item.normalized_url;
        const reviews = parseJsonb(item.candidate_reviews);
        if (!Array.isArray(reviews)) continue;

        if (!urlMap.has(url)) urlMap.set(url, { items: [], allReviews: [] });
        const entry = urlMap.get(url);
        entry.items.push(item);

        for (const r of reviews) {
          if (!r || !r.label || SKIP_LABELS.has(r.label)) continue;
          if (!inclInferred && r.source !== 'web_review') continue;
          entry.allReviews.push(r);
        }
      }

      // ── 3. Build the list of new job_items ────────────────────────────────────
      const newJobId  = crypto.randomUUID();
      const newItems  = [];
      let   rowNumber = 1;

      for (const [, { items, allReviews }] of urlMap) {
        if (!allReviews.length) continue;
        const best    = pickBestItem(items);
        const deduped = deduplicateReviews(allReviews);

        // Compute ugc_detected from the deduped reviews
        const hasPositive  = deduped.some((r) => r.label === 'comment_region');

        newItems.push({
          id:               crypto.randomUUID(),
          job_id:           newJobId,
          row_number:       rowNumber,
          input_url:        best.input_url,
          normalized_url:   best.normalized_url,
          status:           'completed',
          title:            best.title             || null,
          final_url:        best.final_url         || null,
          ugc_detected:     hasPositive,
          best_score:       best.best_score        || null,
          best_confidence:  best.best_confidence   || null,
          best_xpath:       best.best_xpath        || null,
          best_css_path:    best.best_css_path     || null,
          best_sample_text: best.best_sample_text  || null,
          screenshot_path:  best.screenshot_path   || null,
          screenshot_url:   best.screenshot_url    || null,
          candidates:       parseJsonb(best.candidates),
          candidate_reviews: deduped,
          best_candidate:   parseJsonb(best.best_candidate),
          source_job_id:    best.job_id,
          source_item_id:   best.id,
          source_row_number: best.row_number,
        });
        rowNumber++;
      }

      if (!newItems.length) {
        return res.status(400).json({ error: 'After deduplication, no valid labeled candidates remain.' });
      }

      // ── 4. Compute the source_job_ids list ────────────────────────────────────
      const sourceJobIds = [...new Set(itemsRes.rows.map((r) => r.job_id))];

      // ── 5. Write everything in a transaction ──────────────────────────────────
      const client = await db.connect();
      try {
        await client.query('BEGIN');

        const now          = new Date().toISOString();
        const detectedCount = newItems.filter((i) => i.ugc_detected).length;

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
          ok:            true,
          jobId:         newJobId,
          jobName,
          totalUrls:     newItems.length,
          detectedCount,
          sourceJobCount: sourceJobIds.length,
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
