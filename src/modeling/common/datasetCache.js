'use strict';

const DEFAULT_TTL_MS = 10 * 60 * 1000;

class DatasetCache {
  constructor(ttlMs = DEFAULT_TTL_MS) {
    this._cache = new Map();
    this._ttlMs = ttlMs;
    this._pending = new Map();
  }

  _key(jobIds, variantId) {
    const jobKey = Array.isArray(jobIds) && jobIds.length
      ? [...jobIds].sort().join(',')
      : '__all__';
    return variantId ? `${jobKey}:${variantId}` : jobKey;
  }

  get(jobIds, variantId) {
    const key = this._key(jobIds, variantId);
    const entry = this._cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > this._ttlMs) {
      this._cache.delete(key);
      return null;
    }
    return entry.dataset;
  }

  set(jobIds, variantId, dataset) {
    this._cache.set(this._key(jobIds, variantId), { dataset, ts: Date.now() });
  }

  getPending(jobIds, variantId) {
    return this._pending.get(this._key(jobIds, variantId)) || null;
  }

  setPending(jobIds, variantId, promise) {
    const key = this._key(jobIds, variantId);
    this._pending.set(key, promise);
    promise.finally(() => this._pending.delete(key));
  }

  invalidate(jobIds) {
    if (Array.isArray(jobIds) && jobIds.length) {
      const prefix = [...jobIds].sort().join(',');
      for (const key of this._cache.keys()) {
        if (key.startsWith(prefix)) this._cache.delete(key);
      }
      for (const key of this._pending.keys()) {
        if (key.startsWith(prefix)) this._pending.delete(key);
      }
    } else {
      this._cache.clear();
      this._pending.clear();
    }
  }

  stats() {
    const now = Date.now();
    const entries = [];
    for (const [key, entry] of this._cache) {
      const ageMs = now - entry.ts;
      if (ageMs > this._ttlMs) { this._cache.delete(key); continue; }
      entries.push({
        key,
        ageSeconds: Math.round(ageMs / 1000),
        rowCount: entry.dataset && entry.dataset.rows ? entry.dataset.rows.length : 0,
      });
    }
    return { entries, pendingCount: this._pending.size };
  }
}

module.exports = new DatasetCache();
