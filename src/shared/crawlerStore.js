'use strict';

const { getPool } = require('./store');

async function createCrawlerSession({
  name,
  seedSource = 'manual',
  seedFilename = null,
  maxDepth = 3,
  linksPerPage = 20,
  crawlDelayMs = 1500,
  concurrency = 5,
  maxPages = 5000,
}, databaseUrl) {
  const db = getPool(databaseUrl);
  const result = await db.query(
    `INSERT INTO crawler_sessions
      (name, seed_source, seed_filename, status, max_depth, links_per_page, crawl_delay_ms, concurrency, max_pages)
     VALUES ($1, $2, $3, 'pending', $4, $5, $6, $7, $8)
     RETURNING *`,
    [name, seedSource, seedFilename, maxDepth, linksPerPage, crawlDelayMs, concurrency, maxPages],
  );
  return result.rows[0];
}

async function getCrawlerSession(sessionId, databaseUrl) {
  const db = getPool(databaseUrl);
  const result = await db.query('SELECT * FROM crawler_sessions WHERE id = $1', [sessionId]);
  return result.rows[0] || null;
}

async function listCrawlerSessions(databaseUrl) {
  const db = getPool(databaseUrl);
  const result = await db.query('SELECT * FROM crawler_sessions ORDER BY created_at DESC LIMIT 100');
  return result.rows;
}

async function updateCrawlerSession(sessionId, updates, databaseUrl) {
  const db = getPool(databaseUrl);
  const allowed = ['status', 'total_queued', 'total_crawled', 'total_relevant', 'total_failed', 'error_message', 'completed_at'];
  const fields = Object.keys(updates).filter((k) => allowed.includes(k));
  if (!fields.length) return;
  const setClause = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
  const values = fields.map((f) => updates[f]);
  await db.query(
    `UPDATE crawler_sessions SET ${setClause}, updated_at = NOW() WHERE id = $1`,
    [sessionId, ...values],
  );
}

async function deleteCrawlerSession(sessionId, databaseUrl) {
  const db = getPool(databaseUrl);
  await db.query('DELETE FROM crawler_sessions WHERE id = $1', [sessionId]);
}

async function addCrawlerPages(pages, databaseUrl) {
  if (!pages.length) return [];
  const db = getPool(databaseUrl);
  const values = [];
  const placeholders = pages.map((p, i) => {
    const base = i * 6;
    values.push(p.sessionId, p.url, p.normalizedUrl, p.parentPageId || null, p.depth, p.isSeed || false);
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`;
  });
  const result = await db.query(
    `INSERT INTO crawler_pages (session_id, url, normalized_url, parent_page_id, depth, is_seed)
     VALUES ${placeholders.join(', ')}
     ON CONFLICT (session_id, normalized_url) DO NOTHING
     RETURNING id`,
    values,
  );
  return result.rows.map((r) => r.id);
}

async function claimPendingCrawlerPages(sessionId, count, databaseUrl) {
  const db = getPool(databaseUrl);
  const result = await db.query(
    `UPDATE crawler_pages
     SET status = 'crawling'
     WHERE id IN (
       SELECT id FROM crawler_pages
       WHERE session_id = $1 AND status = 'pending'
       ORDER BY depth ASC, id ASC
       LIMIT $2
       FOR UPDATE SKIP LOCKED
     )
     RETURNING *`,
    [sessionId, count],
  );
  return result.rows;
}

async function updateCrawlerPage(pageId, updates, databaseUrl) {
  const db = getPool(databaseUrl);
  const allowed = [
    'status', 'is_relevant', 'relevance_score', 'matched_categories',
    'title', 'outbound_links_found', 'links_followed', 'http_status',
    'error_message', 'crawled_at', 'user_state',
  ];
  const fields = Object.keys(updates).filter((k) => allowed.includes(k));
  if (!fields.length) return;
  const setClause = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
  const values = fields.map((f) => updates[f]);
  await db.query(
    `UPDATE crawler_pages SET ${setClause} WHERE id = $1`,
    [pageId, ...values],
  );
}

async function countKnownUrls(sessionId, normalizedUrls, databaseUrl) {
  if (!normalizedUrls.length) return new Set();
  const db = getPool(databaseUrl);
  const result = await db.query(
    `SELECT normalized_url FROM crawler_pages WHERE session_id = $1 AND normalized_url = ANY($2)`,
    [sessionId, normalizedUrls],
  );
  return new Set(result.rows.map((r) => r.normalized_url));
}

async function listCrawlerPages(sessionId, { limit = 50, offset = 0, status, isRelevant, minScore, userState } = {}, databaseUrl) {
  const db = getPool(databaseUrl);
  const conditions = ['session_id = $1'];
  const values = [sessionId];
  let idx = 2;

  if (status) {
    conditions.push(`status = $${idx++}`);
    values.push(status);
  }
  if (isRelevant != null) {
    conditions.push(`is_relevant = $${idx++}`);
    values.push(isRelevant === 'true' || isRelevant === true);
  }
  if (minScore != null) {
    conditions.push(`relevance_score >= $${idx++}`);
    values.push(Number(minScore));
  }
  if (userState) {
    if (userState === 'none') {
      conditions.push('user_state IS NULL');
    } else {
      conditions.push(`user_state = $${idx++}`);
      values.push(userState);
    }
  }

  const where = conditions.join(' AND ');
  const countResult = await db.query(`SELECT COUNT(*) FROM crawler_pages WHERE ${where}`, values);
  const total = parseInt(countResult.rows[0].count, 10);

  values.push(limit, offset);
  const dataResult = await db.query(
    `SELECT * FROM crawler_pages WHERE ${where}
     ORDER BY relevance_score DESC, id ASC
     LIMIT $${idx} OFFSET $${idx + 1}`,
    values,
  );
  return { rows: dataResult.rows, total };
}

async function getCrawlerPageCounts(sessionId, databaseUrl) {
  const db = getPool(databaseUrl);
  const result = await db.query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'pending') AS pending,
       COUNT(*) FILTER (WHERE status = 'crawling') AS crawling,
       COUNT(*) FILTER (WHERE status = 'done') AS done,
       COUNT(*) FILTER (WHERE status = 'failed') AS failed,
       COUNT(*) FILTER (WHERE status = 'skipped') AS skipped,
       COUNT(*) FILTER (WHERE is_relevant = TRUE) AS relevant,
       COUNT(*) AS total
     FROM crawler_pages WHERE session_id = $1`,
    [sessionId],
  );
  return result.rows[0];
}

async function resetStaleCrawlingPages(sessionId, databaseUrl) {
  const db = getPool(databaseUrl);
  await db.query(
    `UPDATE crawler_pages SET status = 'pending' WHERE session_id = $1 AND status = 'crawling'`,
    [sessionId],
  );
}

// Returns the chain from seed down to pageId, ordered shallowest first.
async function getPageAncestry(pageId, databaseUrl) {
  const db = getPool(databaseUrl);
  const result = await db.query(
    `WITH RECURSIVE ancestry AS (
       SELECT * FROM crawler_pages WHERE id = $1
       UNION ALL
       SELECT p.* FROM crawler_pages p
       JOIN ancestry a ON p.id = a.parent_page_id
     )
     SELECT * FROM ancestry ORDER BY depth ASC`,
    [pageId],
  );
  return result.rows;
}

// Returns direct children of a page, sorted by relevance then id.
async function getPageChildren(pageId, sessionId, databaseUrl) {
  const db = getPool(databaseUrl);
  const result = await db.query(
    `SELECT id, url, depth, status, is_relevant, relevance_score, matched_categories, title,
            links_followed, outbound_links_found, http_status, include_in_training, user_state
     FROM crawler_pages
     WHERE parent_page_id = $1 AND session_id = $2
     ORDER BY relevance_score DESC, id ASC
     LIMIT 200`,
    [pageId, sessionId],
  );
  return result.rows;
}

// Returns root pages (seeds) for the session tree view.
async function getSessionSeeds(sessionId, databaseUrl) {
  const db = getPool(databaseUrl);
  const result = await db.query(
    `SELECT id, url, depth, status, is_relevant, relevance_score, matched_categories, title,
            links_followed, outbound_links_found, http_status, include_in_training, user_state
     FROM crawler_pages
     WHERE session_id = $1 AND is_seed = TRUE
     ORDER BY id ASC`,
    [sessionId],
  );
  return result.rows;
}

// Bulk update pages by id array.
async function bulkUpdateCrawlerPages(pageIds, updates, databaseUrl) {
  if (!pageIds.length) return;
  const db = getPool(databaseUrl);
  const allowed = ['user_state', 'is_relevant', 'include_in_training'];
  const fields = Object.keys(updates).filter((k) => allowed.includes(k));
  if (!fields.length) return;
  const setClause = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
  const values = fields.map((f) => updates[f]);
  await db.query(
    `UPDATE crawler_pages SET ${setClause} WHERE id = ANY($1::int[])`,
    [pageIds, ...values],
  );
}

// Get all relevant (or training-tagged) pages for a session, for job promotion.
async function getSessionRelevantPages(sessionId, { pageIds, onlyTraining } = {}, databaseUrl) {
  const db = getPool(databaseUrl);
  const conditions = ['session_id = $1'];
  const values = [sessionId];
  let idx = 2;
  if (pageIds && pageIds.length) {
    conditions.push(`id = ANY($${idx++}::int[])`);
    values.push(pageIds);
  } else if (onlyTraining) {
    conditions.push(`include_in_training = TRUE`);
  } else {
    conditions.push(`is_relevant = TRUE`);
  }
  const result = await db.query(
    `SELECT id, url, title, depth, relevance_score, matched_categories, include_in_training
     FROM crawler_pages WHERE ${conditions.join(' AND ')}
     ORDER BY relevance_score DESC, id ASC
     LIMIT 10000`,
    values,
  );
  return result.rows;
}

module.exports = {
  createCrawlerSession,
  getCrawlerSession,
  listCrawlerSessions,
  updateCrawlerSession,
  deleteCrawlerSession,
  addCrawlerPages,
  claimPendingCrawlerPages,
  updateCrawlerPage,
  countKnownUrls,
  listCrawlerPages,
  getCrawlerPageCounts,
  resetStaleCrawlingPages,
  getPageAncestry,
  getPageChildren,
  getSessionSeeds,
  bulkUpdateCrawlerPages,
  getSessionRelevantPages,
};
