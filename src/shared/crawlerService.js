'use strict';

const http = require('http');
const https = require('https');
const {
  createCrawlerSession,
  getCrawlerSession,
  updateCrawlerSession,
  addCrawlerPages,
  claimPendingCrawlerPages,
  updateCrawlerPage,
  countKnownUrls,
  getCrawlerPageCounts,
  resetStaleCrawlingPages,
} = require('./crawlerStore');

// ─── Keyword detection ────────────────────────────────────────────────────────

const UGC_CATEGORIES = [
  {
    key: 'comments',
    label: 'Comments',
    patterns: [
      /\bcomments?\b/i,
      /leave\s+a\s+comment/i,
      /post\s+a?\s*comment/i,
      /add\s+a?\s*comment/i,
      /write\s+a?\s*comment/i,
      /comment\s+section/i,
      /disqus/i,
      /livefyre/i,
      /intensedebate/i,
      /id=["']comments?["']/i,
      /class=["'][^"']*\bcomments?\b/i,
    ],
  },
  {
    key: 'forum',
    label: 'Forum/Thread',
    patterns: [
      /\bforum\b/i,
      /\bthread\b/i,
      /\breply\b/i,
      /new\s+post\b/i,
      /start\s+a?\s*thread/i,
      /post\s+reply/i,
      /\btopic\b/i,
      /phpbb/i,
      /vbulletin/i,
      /\bboard\b/i,
      /id=["'][^"']*forum/i,
      /class=["'][^"']*forum/i,
    ],
  },
  {
    key: 'reviews',
    label: 'Reviews',
    patterns: [
      /write\s+a?\s*review/i,
      /customer\s+reviews?/i,
      /product\s+reviews?/i,
      /\brate\s+this\b/i,
      /star\s+rating/i,
      /submit\s+review/i,
      /\b\d+\s+reviews?\b/i,
      /trustpilot/i,
      /id=["'][^"']*review/i,
      /class=["'][^"']*review/i,
    ],
  },
  {
    key: 'discussion',
    label: 'Discussion',
    patterns: [
      /join\s+the\s+discussion/i,
      /start\s+a?\s*discussion/i,
      /\bdiscussion\b/i,
      /ask\s+a\s+question/i,
      /\bQ&A\b/,
      /\bcommunity\b/i,
      /id=["'][^"']*discuss/i,
      /class=["'][^"']*discuss/i,
    ],
  },
  {
    key: 'ugc',
    label: 'User Content',
    patterns: [
      /submitted\s+by\b/i,
      /posted\s+by\b/i,
      /written\s+by\b/i,
      /\bcontribute\b/i,
      /<textarea[\s>]/i,
      /name=["'](?:comment|message|reply|review|body|content)["']/i,
    ],
  },
  {
    key: 'guestbook',
    label: 'Guestbook/Feed',
    patterns: [
      /\bguestbook\b/i,
      /\bshoutbox\b/i,
      /\bwall\s+post/i,
      /\bnewsfeed\b/i,
      /\bactivity\s+feed\b/i,
      /\buser\s+feed\b/i,
    ],
  },
];

function detectUgcCategories(html) {
  const matched = [];
  for (const cat of UGC_CATEGORIES) {
    for (const re of cat.patterns) {
      if (re.test(html)) {
        matched.push(cat.key);
        break;
      }
    }
  }
  return matched;
}

function scoreRelevance(matchedCategories) {
  if (!matchedCategories.length) return 0;
  // More categories = higher score, capped at 1.0
  return Math.min(1.0, matchedCategories.length * 0.25);
}

// ─── HTTP fetch ───────────────────────────────────────────────────────────────

const FETCH_TIMEOUT_MS = 15000;
const MAX_BODY_BYTES = 512 * 1024; // 512 KB
const USER_AGENT = 'Mozilla/5.0 (compatible; UGCDiscovery/1.0; +https://xsscommentdetection.me)';

function fetchPage(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch (e) {
      return reject(new Error(`Invalid URL: ${url}`));
    }

    const lib = parsedUrl.protocol === 'https:' ? https : http;
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: (parsedUrl.pathname || '/') + (parsedUrl.search || ''),
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'identity',
        'Connection': 'close',
      },
      timeout: FETCH_TIMEOUT_MS,
    };

    const req = lib.request(options, (res) => {
      const { statusCode } = res;

      if (statusCode >= 300 && statusCode < 400 && res.headers.location && maxRedirects > 0) {
        res.resume();
        const redirectUrl = new URL(res.headers.location, url).href;
        fetchPage(redirectUrl, maxRedirects - 1).then(resolve).catch(reject);
        return;
      }

      const contentType = res.headers['content-type'] || '';
      if (!contentType.includes('text/html') && !contentType.includes('text/plain') && !contentType.includes('xhtml')) {
        res.resume();
        resolve({ status: statusCode, body: '', finalUrl: url });
        return;
      }

      const chunks = [];
      let bytesRead = 0;
      res.on('data', (chunk) => {
        bytesRead += chunk.length;
        if (bytesRead <= MAX_BODY_BYTES) {
          chunks.push(chunk);
        } else {
          res.destroy();
        }
      });
      res.on('end', () => {
        resolve({ status: statusCode, body: Buffer.concat(chunks).toString('utf8'), finalUrl: url });
      });
      res.on('error', reject);
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });

    req.end();
  });
}

// ─── Link extraction ──────────────────────────────────────────────────────────

function extractLinks(html, baseUrl) {
  const links = new Set();
  const hrefRe = /href\s*=\s*["']([^"'#\s][^"'\s]*?)["']/gi;
  let match;
  while ((match = hrefRe.exec(html)) !== null) {
    try {
      const abs = new URL(match[1], baseUrl);
      if (abs.protocol === 'http:' || abs.protocol === 'https:') {
        abs.hash = '';
        links.add(abs.href);
      }
    } catch (_) {}
  }
  return [...links];
}

function extractTitle(html) {
  const m = /<title[^>]*>([^<]{0,200})<\/title>/i.exec(html);
  return m ? m[1].trim() : null;
}

function normalizeCrawlerUrl(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    // Keep query params — product/discussion pages often differ by query
    return u.href.toLowerCase().replace(/\/+$/, '') || u.href.toLowerCase();
  } catch (_) {
    return url.toLowerCase();
  }
}

// ─── Active session registry ──────────────────────────────────────────────────

// Map of sessionId -> { stop: boolean }
const activeSessions = new Map();

function isSessionActive(sessionId) {
  return activeSessions.has(sessionId);
}

// ─── Core crawler loop ────────────────────────────────────────────────────────

async function runCrawlerLoop(sessionId, databaseUrl) {
  const control = activeSessions.get(sessionId);
  if (!control) return;

  try {
    await resetStaleCrawlingPages(sessionId, databaseUrl);
    await updateCrawlerSession(sessionId, { status: 'running' }, databaseUrl);

    while (true) {
      if (control.stop) break;

      const session = await getCrawlerSession(sessionId, databaseUrl);
      if (!session || session.status === 'paused' || session.status === 'stopped') break;

      const counts = await getCrawlerPageCounts(sessionId, databaseUrl);
      const totalProcessed = parseInt(counts.done, 10) + parseInt(counts.failed, 10) + parseInt(counts.skipped, 10);
      const totalQueued = parseInt(counts.total, 10);

      if (totalQueued >= session.max_pages) {
        // Hit page cap — wait for remaining crawling/pending to drain
        if (parseInt(counts.pending, 10) === 0 && parseInt(counts.crawling, 10) === 0) break;
      }

      if (parseInt(counts.pending, 10) === 0 && parseInt(counts.crawling, 10) === 0) break;

      const batch = await claimPendingCrawlerPages(sessionId, session.concurrency, databaseUrl);
      if (!batch.length) {
        // Nothing claimable right now; wait a moment
        await sleep(500);
        continue;
      }

      await Promise.all(batch.map((page) => crawlOnePage(page, session, databaseUrl, control)));

      // Update aggregate counts on session
      const updatedCounts = await getCrawlerPageCounts(sessionId, databaseUrl);
      await updateCrawlerSession(sessionId, {
        total_crawled: parseInt(updatedCounts.done, 10),
        total_relevant: parseInt(updatedCounts.relevant, 10),
        total_failed: parseInt(updatedCounts.failed, 10),
        total_queued: parseInt(updatedCounts.total, 10),
      }, databaseUrl);

      if (session.crawl_delay_ms > 0) {
        await sleep(session.crawl_delay_ms);
      }
    }

    if (!control.stop) {
      const finalSession = await getCrawlerSession(sessionId, databaseUrl);
      if (finalSession && finalSession.status === 'running') {
        await updateCrawlerSession(sessionId, { status: 'completed', completed_at: new Date().toISOString() }, databaseUrl);
      }
    }
  } catch (err) {
    console.error(`[crawler] session ${sessionId} error:`, err);
    await updateCrawlerSession(sessionId, { status: 'failed', error_message: err.message }, databaseUrl).catch(() => {});
  } finally {
    activeSessions.delete(sessionId);
  }
}

async function crawlOnePage(page, session, databaseUrl, control) {
  if (control.stop) {
    await updateCrawlerPage(page.id, { status: 'pending' }, databaseUrl).catch(() => {});
    return;
  }

  let fetchResult;
  try {
    fetchResult = await fetchPage(page.url);
  } catch (err) {
    await updateCrawlerPage(page.id, {
      status: 'failed',
      error_message: err.message.slice(0, 500),
      crawled_at: new Date().toISOString(),
    }, databaseUrl).catch(() => {});
    return;
  }

  const { status, body, finalUrl } = fetchResult;
  const title = extractTitle(body);
  const matchedCategories = detectUgcCategories(body);
  const relevanceScore = scoreRelevance(matchedCategories);
  const isRelevant = matchedCategories.length > 0;

  let linksFollowed = 0;

  // Only queue children if we haven't hit depth limit and page cap
  if (page.depth < session.max_depth) {
    const allLinks = extractLinks(body, finalUrl || page.url);
    const normalizedLinks = allLinks.map((l) => ({ url: l, norm: normalizeCrawlerUrl(l) }));

    // Check which ones are already known
    const normUrls = normalizedLinks.map((l) => l.norm);
    const known = await countKnownUrls(session.id, normUrls, databaseUrl).catch(() => new Set());

    const candidates = normalizedLinks
      .filter((l) => !known.has(l.norm))
      .slice(0, session.links_per_page);

    if (candidates.length > 0) {
      const pagesToAdd = candidates.map((c) => ({
        sessionId: session.id,
        url: c.url,
        normalizedUrl: c.norm,
        parentPageId: page.id,
        depth: page.depth + 1,
        isSeed: false,
      }));
      await addCrawlerPages(pagesToAdd, databaseUrl).catch(() => {});
      linksFollowed = candidates.length;
    }

    await updateCrawlerPage(page.id, {
      status: 'done',
      is_relevant: isRelevant,
      relevance_score: relevanceScore,
      matched_categories: matchedCategories,
      title: title ? title.slice(0, 500) : null,
      outbound_links_found: allLinks.length,
      links_followed: linksFollowed,
      http_status: status,
      crawled_at: new Date().toISOString(),
    }, databaseUrl).catch(() => {});
  } else {
    await updateCrawlerPage(page.id, {
      status: 'done',
      is_relevant: isRelevant,
      relevance_score: relevanceScore,
      matched_categories: matchedCategories,
      title: title ? title.slice(0, 500) : null,
      outbound_links_found: 0,
      links_followed: 0,
      http_status: status,
      crawled_at: new Date().toISOString(),
    }, databaseUrl).catch(() => {});
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Public API ───────────────────────────────────────────────────────────────

async function startCrawlSession({
  name,
  seedUrls,
  seedSource = 'manual',
  seedFilename = null,
  maxDepth = 3,
  linksPerPage = 20,
  crawlDelayMs = 1500,
  concurrency = 5,
  maxPages = 5000,
}, databaseUrl) {
  const session = await createCrawlerSession({
    name,
    seedSource,
    seedFilename,
    maxDepth,
    linksPerPage,
    crawlDelayMs,
    concurrency,
    maxPages,
  }, databaseUrl);

  // Insert seed pages
  const seedPages = seedUrls.map((url) => ({
    sessionId: session.id,
    url,
    normalizedUrl: normalizeCrawlerUrl(url),
    parentPageId: null,
    depth: 0,
    isSeed: true,
  }));
  await addCrawlerPages(seedPages, databaseUrl);
  await updateCrawlerSession(session.id, { total_queued: seedPages.length }, databaseUrl);

  const control = { stop: false };
  activeSessions.set(session.id, control);

  // Start loop detached
  setImmediate(() => runCrawlerLoop(session.id, databaseUrl));

  return session;
}

async function pauseCrawlSession(sessionId, databaseUrl) {
  const control = activeSessions.get(sessionId);
  if (control) control.stop = true;
  activeSessions.delete(sessionId);
  await updateCrawlerSession(sessionId, { status: 'paused' }, databaseUrl);
  await resetStaleCrawlingPages(sessionId, databaseUrl);
}

async function resumeCrawlSession(sessionId, databaseUrl) {
  if (activeSessions.has(sessionId)) return; // already running
  const session = await getCrawlerSession(sessionId, databaseUrl);
  if (!session) throw new Error('Session not found');

  const control = { stop: false };
  activeSessions.set(sessionId, control);
  setImmediate(() => runCrawlerLoop(sessionId, databaseUrl));
}

async function stopCrawlSession(sessionId, databaseUrl) {
  const control = activeSessions.get(sessionId);
  if (control) control.stop = true;
  activeSessions.delete(sessionId);
  await updateCrawlerSession(sessionId, { status: 'stopped' }, databaseUrl);
  await resetStaleCrawlingPages(sessionId, databaseUrl);
}

// Resume any sessions that were 'running' when the server last restarted
async function recoverRunningSessions(databaseUrl) {
  const { listCrawlerSessions } = require('./crawlerStore');
  const sessions = await listCrawlerSessions(databaseUrl);
  for (const session of sessions) {
    if (session.status === 'running') {
      console.log(`[crawler] recovering session ${session.id} "${session.name}"`);
      await resumeCrawlSession(session.id, databaseUrl).catch((e) => {
        console.error(`[crawler] failed to recover session ${session.id}:`, e);
      });
    }
  }
}

module.exports = {
  startCrawlSession,
  pauseCrawlSession,
  resumeCrawlSession,
  stopCrawlSession,
  recoverRunningSessions,
  isSessionActive,
  normalizeCrawlerUrl,
  UGC_CATEGORIES,
};
