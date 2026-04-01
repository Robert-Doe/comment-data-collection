/**
 * store.js
 *
 * Persistence layer for the extension background service worker.
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

const _pageSignals = new Map(); // tabId → PageSignals

// ─── Storage keys ─────────────────────────────────────────────────────────────

const KEY_SNAPSHOTS       = 'pseudodom_snapshots';
const KEY_CANDIDATES      = 'pseudodom_candidates';
const KEY_SECURITY_EVENTS = 'pseudodom_security_events';
const MAX_EVENTS          = 500;
const MAX_SNAPSHOTS       = 200;

// ─── Public API ───────────────────────────────────────────────────────────────

export const store = {

  // ── Page signals (in-memory, fast) ──────────────────────────────────────

  setPageSignals(tabId, signals) {
    _pageSignals.set(tabId, signals);
  },

  getPageSignals(tabId) {
    return _pageSignals.get(tabId) || null;
  },

  clearTab(tabId) {
    _pageSignals.delete(tabId);
  },

  // ── PseudoDOM snapshots ──────────────────────────────────────────────────

  async savePseudoDOM(tabId, snapshot) {
    if (!snapshot?.url) return;
    const key = normalizeKey(snapshot.url);

    const existing = await _getObject(KEY_SNAPSHOTS) || {};
    // Keep the most recent snapshot per URL; trim if over limit
    existing[key] = {
      url:         snapshot.url,
      capturedAt:  snapshot.capturedAt || Date.now(),
      nodeCount:   Object.keys(snapshot.nodes || {}).length,
      mutationCount: (snapshot.mutations || []).length,
      ugcRegions:  extractUGCRegions(snapshot),
      // Full snapshot stored only in data collection mode
      full:        snapshot,
    };

    // Trim oldest entries if we exceed the limit
    const entries = Object.entries(existing);
    if (entries.length > MAX_SNAPSHOTS) {
      entries.sort((a, b) => (a[1].capturedAt || 0) - (b[1].capturedAt || 0));
      const trimmed = Object.fromEntries(entries.slice(-MAX_SNAPSHOTS));
      await _setObject(KEY_SNAPSHOTS, trimmed);
    } else {
      await _setObject(KEY_SNAPSHOTS, existing);
    }
  },

  async getSnapshot(url) {
    const key = normalizeKey(url);
    const all = await _getObject(KEY_SNAPSHOTS) || {};
    return all[key] || null;
  },

  async getAllSnapshots() {
    return await _getObject(KEY_SNAPSHOTS) || {};
  },

  // ── Candidate feature vectors ────────────────────────────────────────────

  async saveCandidates(tabId, candidateFeatures) {
    if (!candidateFeatures?.url) return;
    const key = normalizeKey(candidateFeatures.url);

    const existing = await _getObject(KEY_CANDIDATES) || {};
    if (!existing[key]) existing[key] = [];
    existing[key].push({
      ...candidateFeatures,
      savedAt: Date.now(),
    });
    // Keep only the last 5 runs per URL
    existing[key] = existing[key].slice(-5);
    await _setObject(KEY_CANDIDATES, existing);
  },

  async getCandidates(url) {
    const key = normalizeKey(url);
    const all = await _getObject(KEY_CANDIDATES) || {};
    return all[key] || [];
  },

  async getAllCandidates() {
    return await _getObject(KEY_CANDIDATES) || {};
  },

  // ── Security events ──────────────────────────────────────────────────────

  async appendSecurityEvent(tabId, event) {
    const all = await _getObject(KEY_SECURITY_EVENTS) || [];
    all.push({ ...event, tabId, recordedAt: Date.now() });
    // Rolling window: keep the last MAX_EVENTS
    const trimmed = all.slice(-MAX_EVENTS);
    await _setObject(KEY_SECURITY_EVENTS, trimmed);
  },

  async getSecurityEvents() {
    return await _getObject(KEY_SECURITY_EVENTS) || [];
  },

  async clearSecurityEvents() {
    await _setObject(KEY_SECURITY_EVENTS, []);
  },

  // ── Export helpers ───────────────────────────────────────────────────────

  /**
   * Export all stored data as a JSON blob for dataset collection.
   * Used by the popup UI to download data for ML training.
   */
  async exportAll() {
    const [snapshots, candidates, securityEvents] = await Promise.all([
      this.getAllSnapshots(),
      this.getAllCandidates(),
      this.getSecurityEvents(),
    ]);
    return {
      version:    1,
      exportedAt: new Date().toISOString(),
      snapshots,
      candidates,
      securityEvents,
    };
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeKey(url) {
  try {
    const u = new URL(url);
    // Strip fragment; normalize trailing slash
    return (u.origin + u.pathname + u.search).replace(/\/$/, '').slice(0, 200);
  } catch (_) {
    return url.slice(0, 200);
  }
}

function extractUGCRegions(snapshot) {
  const ugcMap = snapshot.ugcRegionMap || {};
  return Object.entries(ugcMap)
    .filter(([, score]) => score >= 0.35)
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}

async function _getObject(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (result) => {
      resolve(result[key] ?? null);
    });
  });
}

async function _setObject(key, value) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [key]: value }, () => {
      if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
      else resolve();
    });
  });
}
