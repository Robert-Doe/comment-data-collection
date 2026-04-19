/**
 * popup.js — Extension Popup UI
 *
 * Drives the three-panel review interface:
 *   Overview  — mutation stats, page signals, export
 *   UGC Regions — candidate cards with scores
 *   Security Log — blocked/flagged mutation events
 *
 * Communicates with the background service worker via chrome.runtime.sendMessage
 * and queries the active tab's page state via chrome.scripting.executeScript.
 *
 * Reference: paper/003_system_architecture.md §8
 *            brainstorm/008_candidate_review_pagination_and_export.md
 */

'use strict';

// ─── Tab switching ─────────────────────────────────────────────────────────────

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('visible'));
    tab.classList.add('active');
    document.getElementById(`panel-${tab.dataset.tab}`).classList.add('visible');
  });
});

// ─── Initialize ────────────────────────────────────────────────────────────────

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  await Promise.all([
    loadOverview(tab),
    loadCandidates(tab),
    loadSecurityEvents(),
    refreshRuntimeModel(),
  ]);
}

// ─── Overview panel ────────────────────────────────────────────────────────────

async function loadOverview(tab) {
  // Pull live stats from the page via executeScript
  let pageStats = null;
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world:  'MAIN',
      func:   getPageStatsFromPage,
    });
    pageStats = results?.[0]?.result || null;
  } catch (_) {}

  if (pageStats) {
    setText('stat-mutations', pageStats.mutationCount ?? '—');
    setText('stat-ugc-regions', pageStats.ugcRegionCount ?? '—');
    setText('stat-blocked', pageStats.blockedCount ?? '—');
    setText('stat-candidates', pageStats.candidateCount ?? '—');
  }

  // Pull pre-parse signals from background store
  const signals = await bgMessage({ type: 'GET_PAGE_SIGNALS' });
  if (signals) {
    renderPageSignals(signals);
  }
}

/** Injected into the page MAIN world to read PseudoDOM debug info */
function getPageStatsFromPage() {
  const dbg = window.__PSEUDODOM_DEBUG;
  if (!dbg) return null;
  const snap = dbg.getPseudoDOM();
  const candidates = dbg.getCandidates();
  const ugcRegions = Object.values(snap.ugcRegionMap || {}).filter(s => s >= 0.35).length;
  return {
    mutationCount:  (snap.mutations || []).length,
    candidateCount: candidates.length,
    ugcRegionCount: ugcRegions,
    blockedCount:   (snap.mutations || []).filter(m => m.blocked).length,
  };
}

function renderPageSignals(signals) {
  const section = document.getElementById('page-signals-section');
  const badges = [];
  if (signals.framework_react)   badges.push(['React', 'accent']);
  if (signals.framework_vue)     badges.push(['Vue', 'accent']);
  if (signals.framework_angular) badges.push(['Angular', 'accent']);
  if (signals.framework_svelte)  badges.push(['Svelte', 'accent']);
  if (signals.og_type_is_article) badges.push(['Article', 'green']);
  if (signals.json_ld_has_comment_type) badges.push(['JSON-LD Comments', 'green']);
  if (signals.has_csp)           badges.push(['CSP', 'green']);
  if (signals.csp_allows_unsafe_inline) badges.push(['unsafe-inline', 'yellow']);
  if (!signals.has_csp)          badges.push(['No CSP', 'red']);

  if (badges.length === 0) return;

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px;margin-bottom:10px';
  for (const [label, color] of badges) {
    const span = document.createElement('span');
    span.className = 'pill';
    span.style.background = `rgba(var(--${color}-rgb, 79,142,247), 0.12)`;
    span.style.color = `var(--${color})`;
    span.textContent = label;
    row.appendChild(span);
  }
  section.innerHTML = '';
  section.appendChild(row);
}

// ─── Candidates panel ──────────────────────────────────────────────────────────

async function loadCandidates(tab) {
  let candidates = [];
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world:  'MAIN',
      func:   getCandidatesFromPage,
    });
    candidates = results?.[0]?.result || [];
  } catch (_) {}

  const list = document.getElementById('candidate-list');
  if (candidates.length === 0) return; // leave default empty state

  list.innerHTML = '';
  candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .forEach((c, i) => {
      const card = document.createElement('div');
      const scoreClass = c.score >= 0.65 ? 'high' : c.score >= 0.35 ? 'med' : 'low';
      const ugcClass   = c.score >= 0.65 ? 'ugc-high' : c.score >= 0.35 ? 'ugc-med' : 'ugc-low';
      card.className   = `candidate-card ${ugcClass}`;
      card.innerHTML   = `
        <div class="candidate-header">
          <span class="candidate-tag">&lt;${c.tag || 'div'}&gt;</span>
          <span class="candidate-meta">${c.dominantFamilySize} units · ${Math.round(c.homogeneity * 100)}% uniform</span>
          <span class="candidate-score ${scoreClass}">${Math.round(c.score * 100)}%</span>
        </div>
        <div class="candidate-meta">${c.dominantTemplate || '—'}</div>
      `;
      list.appendChild(card);
    });
}

function getCandidatesFromPage() {
  const dbg = window.__PSEUDODOM_DEBUG;
  if (!dbg) return [];
  return (dbg.getCandidates() || []).map(c => ({
    id:                c.id,
    tag:               c.node?.tag,
    score:             c.score || 0,
    dominantFamilySize: c.dominantFamilySize,
    homogeneity:       c.homogeneity,
    dominantTemplate:  c.dominantTemplate,
  }));
}

function isValidRuntimeBundle(bundle) {
  return (
    bundle &&
    typeof bundle === 'object' &&
    bundle.model?.weights?.length > 0 &&
    bundle.vectorizer?.descriptors?.length > 0
  );
}

function derivePositiveThreshold(bundle) {
  // Prefer the training threshold recorded in the evaluation section,
  // then fall back to the legacy thresholds object, then default to 0.50.
  const evalThreshold = bundle?.evaluation?.train?.candidate_metrics?.threshold;
  if (Number.isFinite(evalThreshold)) return evalThreshold;
  const legacyThreshold = bundle?.thresholds?.positive;
  if (Number.isFinite(Number(legacyThreshold))) return Number(legacyThreshold);
  return 0.50;
}

function renderRuntimeModel(bundle) {
  const artifactEl = document.getElementById('runtime-model-artifact');
  const algorithmEl = document.getElementById('runtime-model-algorithm');
  const featuresEl = document.getElementById('runtime-model-features');
  const thresholdEl = document.getElementById('runtime-model-threshold');
  const messageEl = document.getElementById('runtime-model-message');
  if (!artifactEl || !algorithmEl || !featuresEl || !thresholdEl || !messageEl) return;

  if (!isValidRuntimeBundle(bundle)) {
    artifactEl.textContent = '—';
    algorithmEl.textContent = '—';
    featuresEl.textContent = '—';
    thresholdEl.textContent = '—';
    messageEl.textContent = 'Load the runtime bundle downloaded from Model Lab. It is stored locally in chrome.storage.local for future candidate scoring.';
    return;
  }

  // bundle.id is the canonical identifier produced by the server; bundle.artifact_id is a
  // legacy alias that may be present in older exports.
  const artifactId = bundle.id || bundle.artifact_id || '—';
  // Shorten a long ISO-timestamp id for display (e.g. "keyword-aware-2026-04-01T07-19-38-597Z")
  artifactEl.textContent = artifactId.length > 20
    ? artifactId.replace(/T\d{2}-\d{2}-\d{2}-\d{3}Z$/, '').slice(-20) + '…'
    : artifactId;
  algorithmEl.textContent = bundle.algorithm || '—';
  featuresEl.textContent = String(bundle.feature_count || (bundle.feature_catalog || []).length || 0);
  thresholdEl.textContent = derivePositiveThreshold(bundle).toFixed(2);
  const savedAt = bundle.savedAt ? new Date(bundle.savedAt).toLocaleString() : '';
  messageEl.textContent = savedAt
    ? `Runtime model loaded and saved locally at ${savedAt}.`
    : 'Runtime model loaded. The bundle is stored locally in chrome.storage.local for future candidate scoring.';
}

async function refreshRuntimeModel() {
  const bundle = await bgMessage({ type: 'GET_RUNTIME_MODEL' });
  renderRuntimeModel(bundle);
}

async function loadRuntimeModelFromFile() {
  const input = document.getElementById('runtime-model-file');
  const messageEl = document.getElementById('runtime-model-message');
  if (!input || !input.files || !input.files[0]) {
    if (messageEl) messageEl.textContent = 'Choose a runtime JSON file first.';
    return;
  }

  try {
    const text = await input.files[0].text();
    const bundle = JSON.parse(text);
    if (!isValidRuntimeBundle(bundle)) {
      throw new Error('This file does not look like a runtime model bundle from Model Lab (missing model.weights or vectorizer.descriptors).');
    }
    const response = await bgMessage({ type: 'SET_RUNTIME_MODEL', payload: bundle });
    if (!response || response.ok !== true) {
      throw new Error(response && response.error ? response.error : 'Could not save the runtime model');
    }
    renderRuntimeModel(bundle);
  } catch (error) {
    if (messageEl) messageEl.textContent = error.message || String(error);
  }
}

async function clearRuntimeModel() {
  const response = await bgMessage({ type: 'CLEAR_RUNTIME_MODEL' });
  if (response && response.ok === false) {
    throw new Error(response.error || 'Could not clear the runtime model');
  }
  renderRuntimeModel(null);
}

// ─── Security events panel ─────────────────────────────────────────────────────

async function loadSecurityEvents() {
  const events = await bgMessage({ type: 'GET_SECURITY_EVENTS' }) || [];

  const list = document.getElementById('event-list');
  if (events.length === 0) return;

  list.innerHTML = '';
  [...events].reverse().slice(0, 50).forEach(ev => {
    const card = document.createElement('div');
    card.className = `event-card ${ev.severity || 'flag'}`;
    const ts = ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString() : '';
    card.innerHTML = `
      <div class="event-header">
        <span class="event-type">${ev.type || 'unknown'}</span>
        <span class="event-type" style="margin-left:4px">${ts}</span>
        <span class="event-reason ${ev.severity || 'flag'}">${ev.reason || ''}</span>
      </div>
      <div class="event-url">${ev.url || ''}</div>
      ${ev.sample ? `<div class="event-sample">${escapeHtml(ev.sample)}</div>` : ''}
    `;
    list.appendChild(card);
  });
}

// ─── Button handlers ───────────────────────────────────────────────────────────

document.getElementById('btn-export').addEventListener('click', async () => {
  const data = await bgMessage({ type: 'EXPORT_ALL' });
  if (!data) return;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `pseudodom_export_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('btn-snapshot').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world:  'MAIN',
      func: () => {
        const dbg = window.__PSEUDODOM_DEBUG;
        if (!dbg) return;
        window.postMessage({
          __pseudodom: true,
          type: 'PSEUDO_DOM_SNAPSHOT',
          payload: dbg.getPseudoDOM(),
        }, '*');
      },
    });
  } catch (_) {}
});

document.getElementById('btn-clear-events').addEventListener('click', async () => {
  await bgMessage({ type: 'CLEAR_SECURITY_EVENTS' });
  document.getElementById('event-list').innerHTML =
    '<div class="empty-state">No security events recorded.<br>All mutations passing clean.</div>';
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function bgMessage(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (response) => {
      resolve(response);
    });
  });
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function escapeHtml(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

init().catch(console.error);

// Also handle export from background
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'GET_SECURITY_EVENTS') {
    // Handled by background; popup just loads on open
  }
});

document.getElementById('btn-load-runtime-model').addEventListener('click', async () => {
  await loadRuntimeModelFromFile();
});

document.getElementById('btn-refresh-runtime-model').addEventListener('click', async () => {
  await refreshRuntimeModel();
});

document.getElementById('btn-clear-runtime-model').addEventListener('click', async () => {
  const messageEl = document.getElementById('runtime-model-message');
  try {
    await clearRuntimeModel();
    if (messageEl) messageEl.textContent = 'Runtime model cleared from chrome.storage.local.';
  } catch (error) {
    if (messageEl) messageEl.textContent = error.message || String(error);
  }
});
