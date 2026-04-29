'use strict';

function normalizeHostname(value) {
  const text = String(value || '').trim();
  if (!text) return '';

  try {
    const parsed = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    return String(parsed.hostname || '').toLowerCase().replace(/^www\./, '');
  } catch (_) {
    return text
      .replace(/^https?:\/\//i, '')
      .replace(/\/.*$/, '')
      .toLowerCase()
      .replace(/^www\./, '');
  }
}

function hashString(value) {
  const text = String(value || '');
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function sigmoid(value) {
  if (value >= 0) {
    const z = Math.exp(-value);
    return 1 / (1 + z);
  }
  const z = Math.exp(value);
  return z / (1 + z);
}

function roundNumber(value, places = 6) {
  const factor = 10 ** places;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function parseJobIdList(value) {
  return String(value || '')
    .split(/[,\s]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseCsvLikeLines(value) {
  return String(value || '')
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

module.exports = {
  normalizeHostname,
  hashString,
  sigmoid,
  roundNumber,
  parseJobIdList,
  parseCsvLikeLines,
};
