/**
 * store.js
 *
 * Persistence layer for the extension background service worker.
 *
 * WHY THIS FILE EXISTS:
 * The background service worker (background.js) needs to remember things across
 * page navigations and even across browser restarts. JavaScript variables are
 * wiped every time the service worker goes idle (which Chrome does aggressively
 * to save memory). To survive that, we use two different storage mechanisms:
 *
 *   1. In-memory Map (_pageSignals): for data that only needs to live as long as
 *      the current page — specifically the pre-parse HTTP header signals that the
 *      background captured from the network response. These are per-tab and
 *      discarded on navigation. No point persisting to disk.
 *
 *   2. chrome.storage.local: for data that must survive popup close, tab close,
 *      and browser restart — the ML model bundle, security event log, DOM snapshots,
 *      and the scoring mode setting.
 *
 * Stores:
 *   - Pre-parse page signals (per tab, in-memory)
 *   - PseudoDOM snapshots (chrome.storage.local, keyed by URL)
 *   - Candidate feature vectors (chrome.storage.local)
 *   - Security events / block log (chrome.storage.local)
 *
 * During the data collection phase, all data is retained.
 * In production mode, only security events are persisted.
 *
 * Reference: paper/003_system_architecture.md §8 (Data Collection Mode)
 *            brainstorm/007_feature_reference_and_output_schema.md
 */

// ─── In-memory tab state (non-persistent, cleared on navigation) ──────────────

// Map from tabId (number) → PageSignals object.
// PageSignals are captured from HTTP response headers in background.js and held
// here just long enough for the content script to fetch them via GET_PAGE_SIGNALS.
const _pageSignals = new Map();

// ─── Storage keys ─────────────────────────────────────────────────────────────
// Every chrome.storage.local entry needs a string key. We define them as
// constants here so a typo in one place doesn't silently create a second key.

const KEY_SNAPSHOTS       = 'pseudodom_snapshots';
const KEY_CANDIDATES      = 'pseudodom_candidates';
const KEY_SECURITY_EVENTS = 'pseudodom_security_events';
const KEY_RUNTIME_MODEL   = 'pseudodom_runtime_model';
const KEY_SCORING_MODE    = 'pseudodom_scoring_mode';

// Hard caps to prevent chrome.storage.local from filling up over time.
// chrome.storage.local has a default quota of ~5MB; large DOM snapshots can
// be several hundred KB each, so we keep a rolling window.
const MAX_EVENTS    = 500;
const MAX_SNAPSHOTS = 200;

// ─── Public API ───────────────────────────────────────────────────────────────

export const store = {

  // ── Page signals (in-memory, fast) ─────────────────────────────────────────
  // These are stored in the plain JS Map _pageSignals because:
  //   a) They are only needed for the duration of a single page load.
  //   b) chrome.storage.local is async (Promises); the background needs to
  //      respond to GET_PAGE_SIGNALS synchronously in the message handler.
  //      Reading from a Map is synchronous, reading from chrome.storage is not.

  /***
   * setPageSignals(tabId, signals)
   *
   * WHY: Called by background.js immediately after it parses the HTTP response
   * headers for a new navigation. Stores the signals in memory so they can be
   * returned instantly when the content script asks for them milliseconds later.
   *
   * Signals include things like: which JS framework the page uses (React/Vue/etc.),
   * whether a Content Security Policy is present, whether JSON-LD markup indicates
   * a comments/article page, and so on. These inform the ML model's scoring.
   *
   * @param {number} tabId   - The Chrome tab ID this page belongs to
   * @param {object} signals - PageSignals object from PreParseAnalyzer
   */
  setPageSignals(tabId, signals) {
    _pageSignals.set(tabId, signals);
  },

  /***
   * getPageSignals(tabId)
   *
   * WHY: Called synchronously by the GET_PAGE_SIGNALS message handler in
   * background.js. Returns null if no signals were captured for this tab
   * (e.g. if the extension was just installed and missed the navigation event).
   *
   * @param  {number} tabId - The Chrome tab ID to look up
   * @returns {object|null} - The PageSignals, or null if not yet captured
   */
  getPageSignals(tabId) {
    return _pageSignals.get(tabId) || null;
  },

  /***
   * clearTab(tabId)
   *
   * WHY: Called when a tab is closed or navigates to a new URL. Frees the
   * in-memory signals so old data from page A is never accidentally served
   * to page B in the same tab.
   *
   * @param {number} tabId - The tab whose data should be discarded
   */
  clearTab(tabId) {
    _pageSignals.delete(tabId);
  },

  // ── PseudoDOM snapshots ──────────────────────────────────────────────────────
  // Snapshots are the serialized PseudoDOM trees sent by the wrapper after
  // DOMContentLoaded. They are the raw training data for the ML model — each
  // snapshot records the DOM structure of a real page, annotated with which
  // regions the heuristic scored as UGC. A researcher later labels these as
  // positive (correct UGC) or negative (wrong detection) to build the dataset.

  /***
   * savePseudoDOM(tabId, snapshot)
   *
   * WHY: Persists a PseudoDOM snapshot to chrome.storage.local so it survives
   * popup close and browser restarts. Keyed by URL so we keep the most recent
   * snapshot per page and can look it up later for labeling.
   *
   * We trim to MAX_SNAPSHOTS entries by discarding the oldest (sorted by
   * capturedAt timestamp) to stay within the storage quota.
   *
   * @param {number} tabId    - Source tab (used for context, not as the key)
   * @param {object} snapshot - Serialized PseudoDOM from PseudoDOM.serialize()
   */
  async savePseudoDOM(tabId, snapshot) {
    if (!snapshot?.url) return;
    const key = normalizeKey(snapshot.url);

    const existing = await _getObject(KEY_SNAPSHOTS) || {};
    // Keep the most recent snapshot per URL; trim if over limit
    existing[key] = {
      url:           snapshot.url,
      capturedAt:    snapshot.capturedAt || Date.now(),
      nodeCount:     Object.keys(snapshot.nodes || {}).length,
      mutationCount: (snapshot.mutations || []).length,
      ugcRegions:    extractUGCRegions(snapshot),
      // Full snapshot stored only in data collection mode
      full:          snapshot,
    };

    // Trim oldest entries if we exceed the limit
    const entries = Object.entries(existing);
    if (entries.length > MAX_SNAPSHOTS) {
      // Sort ascending by capturedAt so the oldest entries come first
      entries.sort((a, b) => (a[1].capturedAt || 0) - (b[1].capturedAt || 0));
      // Drop the oldest entries, keep only the newest MAX_SNAPSHOTS
      const trimmed = Object.fromEntries(entries.slice(-MAX_SNAPSHOTS));
      await _setObject(KEY_SNAPSHOTS, trimmed);
    } else {
      await _setObject(KEY_SNAPSHOTS, existing);
    }
  },

  /***
   * getSnapshot(url)
   *
   * WHY: Used by the review UI to retrieve a previously-captured snapshot for
   * a given URL for labeling or inspection.
   *
   * @param  {string} url - The full page URL
   * @returns {object|null} - The stored snapshot entry, or null
   */
  async getSnapshot(url) {
    const key = normalizeKey(url);
    const all = await _getObject(KEY_SNAPSHOTS) || {};
    return all[key] || null;
  },

  /***
   * getAllSnapshots()
   *
   * WHY: Used by exportAll() to bundle all captured snapshots into the
   * downloadable training dataset JSON.
   *
   * @returns {object} - Map of normalizedUrl → snapshot entry
   */
  async getAllSnapshots() {
    return await _getObject(KEY_SNAPSHOTS) || {};
  },

  // ── Candidate feature vectors ────────────────────────────────────────────────
  // Candidate features are the raw ML input vectors — the numbers extracted
  // from a DOM element (child count, homogeneity ratio, keyword signals, etc.)
  // that the model uses to decide whether that element is a UGC region.
  // Saving them lets us build labeled training datasets from real browsing sessions.

  /***
   * saveCandidates(tabId, candidateFeatures)
   *
   * WHY: Every time the wrapper scores a candidate above UGC_HIGH_THRESHOLD it
   * sends a CANDIDATE_FEATURES message. We persist these vectors in
   * chrome.storage.local, grouped by URL, so a researcher can later export
   * them and add ground-truth labels (is this actually a comment section?)
   * to train the ML model.
   *
   * We keep only the last 5 scoring runs per URL to avoid unbounded growth.
   *
   * @param {number} tabId             - Source tab
   * @param {object} candidateFeatures - Feature vector object from the wrapper
   */
  async saveCandidates(tabId, candidateFeatures) {
    if (!candidateFeatures?.url) return;
    const key = normalizeKey(candidateFeatures.url);

    const existing = await _getObject(KEY_CANDIDATES) || {};
    if (!existing[key]) existing[key] = [];
    existing[key].push({
      ...candidateFeatures,
      savedAt: Date.now(),
    });
    // Keep only the last 5 runs per URL to prevent unbounded storage growth
    existing[key] = existing[key].slice(-5);
    await _setObject(KEY_CANDIDATES, existing);
  },

  /***
   * getCandidates(url)
   *
   * @param  {string} url
   * @returns {Array} - Array of candidate feature objects for this URL
   */
  async getCandidates(url) {
    const key = normalizeKey(url);
    const all = await _getObject(KEY_CANDIDATES) || {};
    return all[key] || [];
  },

  /***
   * getAllCandidates()
   *
   * @returns {object} - Map of normalizedUrl → array of candidate feature objects
   */
  async getAllCandidates() {
    return await _getObject(KEY_CANDIDATES) || {};
  },

  // ── Runtime model bundle ─────────────────────────────────────────────────────
  // The runtime model is the serialized ML model the user trained in Model Lab
  // and exported as runtime.json. It contains:
  //   - model:      weights/trees for the chosen algorithm
  //   - vectorizer: how to turn raw DOM features into the numeric vector the model expects
  //   - thresholds: the positive classification threshold (e.g. 0.41)
  //   - evaluation: test-set metrics for display in the popup
  //
  // It is stored in chrome.storage.local so it persists across browser restarts
  // without the user having to re-upload it every session.

  /***
   * saveRuntimeModel(bundle)
   *
   * WHY: Persists the uploaded model bundle so it automatically reloads on
   * every new page the user visits, without any manual action required each time.
   *
   * We add savedAt so the popup can display a human-readable "loaded at" timestamp.
   *
   * @param {object} bundle - The full runtime.json object exported from Model Lab
   */
  async saveRuntimeModel(bundle) {
    if (!bundle || typeof bundle !== 'object') return;
    await _setObject(KEY_RUNTIME_MODEL, {
      ...bundle,
      savedAt: Date.now(),
    });
  },

  /***
   * getRuntimeModel()
   *
   * WHY: Called on every new page load (via GET_RUNTIME_MODEL in content_bridge.js)
   * to push the saved model into the wrapper so it can score candidates with ML
   * rather than pure heuristics.
   *
   * @returns {object|null} - The saved bundle, or null if none has been loaded
   */
  async getRuntimeModel() {
    return await _getObject(KEY_RUNTIME_MODEL) || null;
  },

  /***
   * clearRuntimeModel()
   *
   * WHY: Called when the user clicks "Clear" in the popup Runtime Model tab.
   * Removes the model so the wrapper falls back to heuristic-only scoring.
   * Also triggers a broadcast (in background.js) so all open tabs switch modes.
   */
  async clearRuntimeModel() {
    await _setObject(KEY_RUNTIME_MODEL, null);
  },

  // ── Scoring mode ─────────────────────────────────────────────────────────────

  /***
   * saveScoringMode(mode)
   *
   * WHY: The scoring mode ('model' | 'heuristic' | 'none') is set by the user
   * via the toggles in the popup. It needs to persist across popup close so
   * the wrapper uses the same mode even after the popup is re-opened or the
   * page is refreshed.
   *
   * @param {string} mode - 'model' | 'heuristic' | 'none'
   */
  async saveScoringMode(mode) {
    await _setObject(KEY_SCORING_MODE, mode);
  },

  /***
   * getScoringMode()
   *
   * WHY: Called on new page loads so the content_bridge can push the saved
   * mode into the wrapper immediately, preventing a flash where the wrapper
   * uses the wrong mode for the first classify() run.
   *
   * @returns {string} - 'model' | 'heuristic' | 'none'; defaults to 'heuristic'
   */
  async getScoringMode() {
    return await _getObject(KEY_SCORING_MODE) || 'heuristic';
  },

  // ── Security events ──────────────────────────────────────────────────────────
  // Security events are records of mutations that the SecurityGate blocked or
  // flagged. They are displayed in the popup's "Security Log" tab so the
  // researcher can see exactly what XSS patterns were detected and where.

  /***
   * appendSecurityEvent(tabId, event)
   *
   * WHY: Each SECURITY_EVENT message from the wrapper represents a real
   * attempted XSS mutation that was intercepted — a script tag injection,
   * an event handler attribute, a javascript: href, etc. We append it to a
   * rolling log (capped at MAX_EVENTS=500 entries) so it can be reviewed in
   * the popup or exported as part of the training dataset.
   *
   * Rolling window: we slice to the last MAX_EVENTS entries so the log never
   * fills up chrome.storage.local over a long browsing session.
   *
   * @param {number} tabId  - Which tab generated this event
   * @param {object} event  - SecurityEvent object from the wrapper's SecurityGate
   */
  async appendSecurityEvent(tabId, event) {
    const all = await _getObject(KEY_SECURITY_EVENTS) || [];
    all.push({ ...event, tabId, recordedAt: Date.now() });
    // Rolling window: keep the last MAX_EVENTS
    const trimmed = all.slice(-MAX_EVENTS);
    await _setObject(KEY_SECURITY_EVENTS, trimmed);
  },

  /***
   * getSecurityEvents()
   *
   * @returns {Array} - All stored security events, oldest first
   */
  async getSecurityEvents() {
    return await _getObject(KEY_SECURITY_EVENTS) || [];
  },

  /***
   * clearSecurityEvents()
   *
   * WHY: Called when the user clicks "Clear Log" in the popup's Security Log tab.
   */
  async clearSecurityEvents() {
    await _setObject(KEY_SECURITY_EVENTS, []);
  },

  // ── Export helpers ─────────────────────────────────────────────────────────

  /***
   * exportAll()
   *
   * WHY: This is the core data collection output. After browsing several pages
   * with comments, the researcher clicks "Export Dataset" in the popup. This
   * function gathers every piece of stored data into a single JSON structure
   * that can be downloaded and used to train the ML model in Model Lab.
   *
   * The exported file contains:
   *   - snapshots: PseudoDOM trees of all visited pages
   *   - candidates: feature vectors of all scored UGC candidates
   *   - securityEvents: all blocked/flagged mutation events
   *   - runtimeModel: the currently loaded model (if any) for reference
   *
   * All four fetches run in parallel (Promise.all) to minimize wait time.
   *
   * @returns {object} - The full export blob, ready for JSON.stringify
   */
  async exportAll() {
    const [snapshots, candidates, securityEvents] = await Promise.all([
      this.getAllSnapshots(),
      this.getAllCandidates(),
      this.getSecurityEvents(),
    ]);
    return {
      version:      1,
      exportedAt:   new Date().toISOString(),
      snapshots,
      candidates,
      securityEvents,
      runtimeModel: await this.getRuntimeModel(),
    };
  },
};

// ─── Private helpers ──────────────────────────────────────────────────────────

/***
 * normalizeKey(url)
 *
 * WHY: We use URLs as storage keys, but raw URLs are unreliable:
 *   - The same page might be visited as "/page" and "/page/" (trailing slash)
 *   - Fragment identifiers (#comments) differ per visit but refer to the same page
 *   - Long URLs could exceed reasonable key lengths
 *
 * This function strips the fragment, normalizes the trailing slash, and caps
 * the length at 200 characters to produce a consistent, stable storage key.
 *
 * @param  {string} url - Any full URL string
 * @returns {string}    - A normalized, storage-safe key
 */
function normalizeKey(url) {
  try {
    const u = new URL(url);
    // Strip fragment (#section); normalize trailing slash; cap at 200 chars
    return (u.origin + u.pathname + u.search).replace(/\/$/, '').slice(0, 200);
  } catch (_) {
    // If URL parsing fails (e.g. data: URLs), just truncate the raw string
    return url.slice(0, 200);
  }
}

/***
 * extractUGCRegions(snapshot)
 *
 * WHY: The full PseudoDOM snapshot can be several hundred KB. For the summary
 * metadata we store alongside each snapshot (nodeCount, mutationCount, etc.),
 * we extract just the top UGC regions by score. This gives the labeling UI
 * a quick preview of what was detected without loading the full snapshot.
 *
 * Only regions scoring >= 0.35 (UGC_LOW_THRESHOLD) are included.
 * We sort by score descending and cap at 10 entries.
 *
 * @param  {object} snapshot - Serialized PseudoDOM from PseudoDOM.serialize()
 * @returns {Array}          - Array of { id, score } sorted by score descending
 */
function extractUGCRegions(snapshot) {
  const ugcMap = snapshot.ugcRegionMap || {};
  return Object.entries(ugcMap)
    .filter(([, score]) => score >= 0.35)
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}

/***
 * _getObject(key)
 *
 * WHY: chrome.storage.local uses a callback-based API, but the rest of our
 * code is async/await. This thin wrapper converts the callback into a Promise
 * so callers can use `await _getObject(key)` cleanly.
 *
 * The `?? null` coercion converts `undefined` (key not found in storage)
 * to `null` so callers can safely write `|| {}` or `|| []` without checking
 * for both undefined and null.
 *
 * @param  {string} key - The chrome.storage.local key to read
 * @returns {Promise<*>} - The stored value, or null if not found
 */
async function _getObject(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (result) => {
      resolve(result[key] ?? null);
    });
  });
}

/***
 * _setObject(key, value)
 *
 * WHY: Same rationale as _getObject — converts the callback-based
 * chrome.storage.local.set into a Promise. Also propagates errors:
 * if chrome.runtime.lastError is set after the write, the Promise rejects
 * so callers can catch storage quota exceeded errors and handle them.
 *
 * @param  {string} key   - The chrome.storage.local key to write
 * @param  {*}      value - Any JSON-serializable value (null clears the entry)
 * @returns {Promise<void>}
 */
async function _setObject(key, value) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [key]: value }, () => {
      if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
      else resolve();
    });
  });
}
