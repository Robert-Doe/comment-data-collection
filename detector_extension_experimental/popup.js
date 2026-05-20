/**
 * popup.js — Extension Popup UI
 *
 * WHY THIS FILE EXISTS:
 * When the user clicks the extension icon, Chrome opens popup.html in a small
 * floating window. This file drives everything you see in that popup:
 *   - The Overview tab: mutation counts, UGC region counts, page signals
 *   - The UGC Regions tab: list of detected comment containers with scores
 *   - The Security Log tab: list of mutations the SecurityGate blocked/flagged
 *   - The Runtime Model tab: load / inspect / clear the ML model bundle
 *
 * The popup cannot directly read the page's JavaScript — it lives in the
 * extension's own isolated context. To read data from the page, it uses:
 *   - chrome.scripting.executeScript(world:'MAIN') to call functions IN the page
 *   - chrome.runtime.sendMessage to ask the background service worker for stored data
 *
 * Communicates with the background service worker via chrome.runtime.sendMessage
 * and queries the active tab's page state via chrome.scripting.executeScript.
 *
 * Reference: paper/003_system_architecture.md §8
 *            brainstorm/008_candidate_review_pagination_and_export.md
 */

'use strict';

// ─── Tab switching ─────────────────────────────────────────────────────────────
// Wire up the tab bar at the top of the popup. Clicking a tab removes the
// 'active' class from all tabs, adds it to the clicked one, then shows/hides
// the corresponding panel div.

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('visible'));
    tab.classList.add('active');
    document.getElementById(`panel-${tab.dataset.tab}`).classList.add('visible');
  });
});

// ─── Initialize ────────────────────────────────────────────────────────────────

// Stored here so scoring toggle handlers can refresh the candidate list
// without querying the active tab again.
let _activeTab = null;

/***
 * init()
 *
 * WHY: Entry point for the popup. Called once when popup.html finishes loading.
 * Finds the currently active tab (the page the user is looking at), then kicks
 * off all four panels in parallel using Promise.all so the popup feels responsive
 * rather than loading one panel at a time.
 *
 * We store the active tab in _activeTab so that toggle handlers (model/heuristic)
 * can call loadCandidates(_activeTab) later without re-querying Chrome.
 */
async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  _activeTab = tab;

  await Promise.all([
    loadOverview(tab),
    loadCandidates(tab),
    loadSecurityEvents(),
    refreshRuntimeModel(),
  ]);
}

// ─── Overview panel ────────────────────────────────────────────────────────────

/***
 * loadOverview(tab)
 *
 * WHY: Populates the four stat cards on the Overview tab:
 *   - Mutations intercepted: how many DOM API calls the wrapper has seen
 *   - UGC regions detected: how many regions scored above the low threshold
 *   - Mutations blocked: how many were stopped by the SecurityGate
 *   - Candidates scored: how many structural candidates were evaluated
 *
 * The stats come from TWO sources:
 *   1. The page itself (via executeScript into MAIN world) — live PseudoDOM data
 *   2. The background service worker (via bgMessage) — pre-parse HTTP signals
 *
 * We query both in parallel and render whatever we get.
 *
 * @param {chrome.tabs.Tab} tab - The active tab to inspect
 */
async function loadOverview(tab) {
  // Pull live stats from the page via executeScript
  let pageStats = null;
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world:  'MAIN',    // run inside the page's JS context to access window.__PSEUDODOM_DEBUG
      func:   getPageStatsFromPage,
    });
    pageStats = results?.[0]?.result || null;
  } catch (_) {}

  if (pageStats) {
    setText('stat-mutations',   pageStats.mutationCount  ?? '—');
    setText('stat-ugc-regions', pageStats.ugcRegionCount ?? '—');
    setText('stat-blocked',     pageStats.blockedCount   ?? '—');
    setText('stat-candidates',  pageStats.candidateCount ?? '—');
  }

  // Pull pre-parse signals from background store
  const signals = await bgMessage({ type: 'GET_PAGE_SIGNALS' });
  if (signals) {
    renderPageSignals(signals);
  }
}

/***
 * getPageStatsFromPage()
 *
 * WHY: This function is serialized and injected into the page's MAIN world
 * via chrome.scripting.executeScript. It runs as if it were a script on the
 * page itself, which is the only way to access window.__PSEUDODOM_DEBUG —
 * the debug object that the wrapper exposes.
 *
 * We call dbg.reclassify() first to ensure the ugcRegionMap is fresh before
 * we read it. Without this, the map might reflect the state from the last
 * classify() run (which could be hundreds of milliseconds stale in a live SPA).
 *
 * IMPORTANT: This function must be self-contained. It cannot reference any
 * variables from popup.js because it runs in a different JavaScript context.
 * Everything it needs must come from the page's window object.
 *
 * @returns {object|null} - { mutationCount, candidateCount, ugcRegionCount, blockedCount }
 */
function getPageStatsFromPage() {
  const dbg = window.__PSEUDODOM_DEBUG;
  if (!dbg) return null;
  // classify() has no real awaits — calling it updates ugcRegionMap synchronously
  // before we read the snapshot, fixing the race where the map was empty on popup open.
  dbg.reclassify();
  const snap       = dbg.getPseudoDOM();
  const candidates = dbg.getCandidates();
  const ugcRegions = Object.values(snap.ugcRegionMap || {}).filter(s => s >= 0.35).length;
  return {
    mutationCount:  (snap.mutations || []).length,
    candidateCount: candidates.length,
    ugcRegionCount: ugcRegions,
    blockedCount:   (snap.mutations || []).filter(m => m.blocked).length,
  };
}

/***
 * renderPageSignals(signals)
 *
 * WHY: Pre-parse HTTP signals are displayed as colored pill badges so the
 * researcher can instantly see the security posture of the current page
 * (does it have a CSP? does it allow unsafe-inline? does it use React?).
 * These signals directly affect how the model should interpret candidate scores.
 *
 * Each badge is a colored pill — green for security-positive signals (CSP present,
 * JSON-LD comments), yellow for warnings (unsafe-inline), red for bad (no CSP).
 *
 * @param {object} signals - PageSignals object from PreParseAnalyzer
 */
function renderPageSignals(signals) {
  const section = document.getElementById('page-signals-section');
  const badges = [];
  if (signals.framework_react)          badges.push(['React',            'accent']);
  if (signals.framework_vue)            badges.push(['Vue',              'accent']);
  if (signals.framework_angular)        badges.push(['Angular',          'accent']);
  if (signals.framework_svelte)         badges.push(['Svelte',           'accent']);
  if (signals.og_type_is_article)       badges.push(['Article',          'green']);
  if (signals.json_ld_has_comment_type) badges.push(['JSON-LD Comments', 'green']);
  if (signals.has_csp)                  badges.push(['CSP',              'green']);
  if (signals.csp_allows_unsafe_inline) badges.push(['unsafe-inline',    'yellow']);
  if (!signals.has_csp)                 badges.push(['No CSP',           'red']);

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

/***
 * loadCandidates(tab)
 *
 * WHY: Populates the UGC Regions tab with scored candidate cards.
 * Each card shows the element tag, dominant child count, homogeneity percentage,
 * the scoring source (model vs heuristic), and a percentage confidence score.
 *
 * Candidates are sorted by score descending and capped at 10 to avoid
 * overwhelming the limited popup height.
 *
 * If no candidates are detected, shows the manual JSON fallback section
 * where the user can provide their own CSS selectors.
 *
 * @param {chrome.tabs.Tab} tab - The active tab to read candidates from
 */
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
  setCandidateJsonSectionVisible(candidates.length === 0);
  setCandidatePanelMessage(
    candidates.length === 0
      ? 'No candidates detected yet. Load selectors JSON if you want a manual fallback.'
      : 'Candidates detected. Click a card to highlight it on the page.'
  );
  if (candidates.length === 0) return;

  list.innerHTML = '';
  const sorted = candidates.sort((a, b) => b.score - a.score).slice(0, 10);
  sorted.forEach((c, i) => {
    const card        = document.createElement('div');
    // Color-code the left border: green >= 0.65, yellow >= 0.35, grey below
    const scoreClass  = c.score >= 0.65 ? 'high' : c.score >= 0.35 ? 'med' : 'low';
    const ugcClass    = c.score >= 0.65 ? 'ugc-high' : c.score >= 0.35 ? 'ugc-med' : 'ugc-low';
    const topBadge    = i === 0 ? ' <span class="pill" style="font-size:10px;padding:1px 5px">top pick</span>' : '';
    card.className    = `candidate-card ${ugcClass}`;
    card.style.cursor = 'pointer';
    card.title        = 'Click to highlight this region on the page';
    const sourceLabel = c.modelLoaded ? 'model' : 'heuristic';
    card.innerHTML = `
      <div class="candidate-header">
        <span class="candidate-tag">&lt;${c.tag || 'div'}&gt;${topBadge}</span>
        <span class="candidate-meta">${c.dominantFamilySize} units · ${Math.round(c.homogeneity * 100)}% uniform · ${sourceLabel}</span>
        <span class="candidate-score ${scoreClass}">${Math.round(c.score * 100)}%</span>
      </div>
      <div class="candidate-meta">${c.dominantTemplate || '—'}</div>
    `;
    card.addEventListener('click', () => highlightCandidateOnPage(tab, c.id));
    list.appendChild(card);
  });
}

/***
 * highlightCandidateOnPage(tab, candidateId)
 *
 * WHY: When the user clicks a candidate card in the popup, they want to see
 * WHICH element on the actual page was detected. This function injects a
 * postMessage into the page's MAIN world that tells the wrapper to draw a red
 * border around the element identified by candidateId and scroll it into view.
 *
 * We use executeScript rather than sendMessage to the content script because
 * we need the message to arrive in the MAIN world (wrapper), not just the
 * ISOLATED world (content script). The wrapper's window.addEventListener('message')
 * handles the HIGHLIGHT_CANDIDATE event.
 *
 * @param {chrome.tabs.Tab} tab         - The tab containing the element
 * @param {string}          candidateId - The PseudoNode ID (e.g. "pn_42")
 */
async function highlightCandidateOnPage(tab, candidateId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world:  'MAIN',
      func:   (id) => window.postMessage(
        { __pseudodom: true, __push: true, type: 'HIGHLIGHT_CANDIDATE', payload: { id } },
        '*'
      ),
      args: [candidateId],
    });
  } catch (_) {}
}

/***
 * setHighlightMode(enabled)
 *
 * WHY: The popup has a toggle to turn the automatic red-border highlight on or off.
 * When off, the wrapper still detects candidates and updates scores, but doesn't
 * draw any visible overlay — useful when the researcher wants to browse without
 * the extension affecting the page's visual appearance.
 *
 * Sends SET_HIGHLIGHT_MODE to the background, which forwards it to the active
 * tab's content script, which posts it to the wrapper.
 *
 * @param {boolean} enabled - true = show highlight, false = hide it
 */
async function setHighlightMode(enabled) {
  const response = await bgMessage({ type: 'SET_HIGHLIGHT_MODE', payload: { enabled } });
  if (!response || response.ok !== true) {
    throw new Error(response?.error || 'Could not update highlight mode');
  }
  setCandidatePanelMessage(enabled ? 'Highlight mode is on.' : 'Highlight mode is off.');
}

/***
 * setScoringMode(mode)
 *
 * WHY: The popup exposes three scoring modes via toggle switches:
 *   - 'model':     use only the loaded ML model; ignore heuristics
 *   - 'heuristic': use only the rule-based scorer; ignore ML model
 *   - 'none':      detect nothing (both toggles off)
 *
 * This function sends SET_SCORING_MODE to the background, which persists the
 * choice to chrome.storage.local AND broadcasts it to all open tabs immediately.
 *
 * @param {string} mode - 'model' | 'heuristic' | 'none'
 */
async function setScoringMode(mode) {
  const response = await bgMessage({ type: 'SET_SCORING_MODE', payload: { mode } });
  if (!response || response.ok !== true) {
    throw new Error(response?.error || 'Could not update scoring mode');
  }
  const labels = {
    model:     'Model only — heuristics off.',
    heuristic: 'Heuristic only — model off.',
    none:      'Both off — nothing will be identified.',
  };
  setCandidatePanelMessage(labels[mode] || '');
}

/***
 * setCandidateJsonSectionVisible(visible)
 *
 * WHY: The manual JSON selectors fallback is only shown when automatic
 * candidate detection found nothing. Hiding it when candidates exist keeps
 * the UI clean and uncluttered.
 *
 * @param {boolean} visible - Whether to show the fallback section
 */
function setCandidateJsonSectionVisible(visible) {
  const section = document.getElementById('candidate-json-section');
  if (section) {
    section.style.display = visible ? 'block' : 'none';
  }
}

/***
 * setCandidatePanelMessage(message)
 *
 * WHY: A single status line below the toggles gives the user contextual
 * feedback about what mode is active, whether candidates were found, or
 * what error occurred. Centralizing it here avoids duplicating the
 * getElementById call across many places.
 *
 * @param {string} message - Human-readable status text
 */
function setCandidatePanelMessage(message) {
  const el = document.getElementById('candidate-panel-message');
  if (el) {
    el.textContent = message;
  }
}

/***
 * normalizeCandidateJsonSelectors(parsed)
 *
 * WHY: The manual selector JSON file can be in one of two formats:
 *   1. A plain array:   ["#comments", ".comment-list"]
 *   2. An object:       { "selectors": ["#comments", ".comment-list"] }
 *
 * This function normalizes both into a plain array, or returns null if
 * the format is not recognized. This lets researchers use whichever
 * format feels natural for their selector exports.
 *
 * @param  {*}          parsed - The JSON.parse() result of the uploaded file
 * @returns {string[]|null}    - Array of CSS selector strings, or null
 */
function normalizeCandidateJsonSelectors(parsed) {
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (parsed && Array.isArray(parsed.selectors)) {
    return parsed.selectors;
  }
  return null;
}

/***
 * loadCandidateJsonFromFile()
 *
 * WHY: When the automatic detection finds no candidates (e.g. on a site with
 * heavily obfuscated CSS class names that prevent the heuristic from firing),
 * the researcher can manually provide CSS selectors in a JSON file. This
 * function reads that file, validates it, and sends the selectors to the
 * wrapper via the background so they can be scored and highlighted.
 *
 * Validation: every element in the array must be a non-empty string (valid CSS
 * selector format is not verified here — querySelector in the wrapper will
 * silently ignore invalid selectors).
 */
async function loadCandidateJsonFromFile() {
  const input = document.getElementById('candidate-json-file');
  if (!input || !input.files || !input.files[0]) {
    setCandidatePanelMessage('Choose a JSON file first.');
    return;
  }

  try {
    const text     = await input.files[0].text();
    const parsed   = JSON.parse(text);
    const selectors = normalizeCandidateJsonSelectors(parsed);
    if (!selectors || !selectors.every((selector) => typeof selector === 'string' && selector.trim())) {
      throw new Error('Expected a JSON array of non-empty CSS selectors or an object with a selectors array.');
    }

    const response = await bgMessage({
      type:    'LOAD_CANDIDATE_JSON',
      payload: { selectors },
    });
    if (!response || response.ok !== true) {
      throw new Error(response?.error || 'Could not load candidate selectors');
    }

    setCandidatePanelMessage(`Loaded ${selectors.length} selectors from ${input.files[0].name}.`);
  } catch (error) {
    setCandidatePanelMessage(error.message || String(error));
  }
}

/***
 * getCandidatesFromPage()
 *
 * WHY: Like getPageStatsFromPage(), this function is injected into the MAIN
 * world via executeScript so it can access window.__PSEUDODOM_DEBUG. It reads
 * all current candidates and their scores from the PseudoDOM snapshot.
 *
 * We also read the current scoringMode and runtimeModel from the debug object
 * to determine whether the displayed score came from the ML model or the
 * heuristic — this drives the "model"/"heuristic" label shown on each card.
 *
 * modelLoaded is true only when BOTH conditions are met:
 *   - The scoring mode is 'model' (user explicitly selected model-only)
 *   - A valid model with a vectorizer is loaded in memory
 * This prevents "model" showing on the card when the user selected heuristic
 * mode even if a model file happens to be loaded.
 *
 * @returns {Array} - Array of candidate objects for the popup cards
 */
function getCandidatesFromPage() {
  const dbg = window.__PSEUDODOM_DEBUG;
  if (!dbg) return [];
  // reclassify() is synchronous so ugcRegionMap is fresh when we read it below
  dbg.reclassify();
  const snap        = dbg.getPseudoDOM();
  const scoringMode = dbg.scoringMode?.() || 'heuristic';
  const rm          = dbg.runtimeModel?.();
  const modelLoaded = scoringMode === 'model' && Boolean(
    rm?.model && rm?.vectorizer?.descriptors?.length
  );
  return (dbg.getCandidates() || []).map(c => ({
    id:                 c.id,
    tag:                c.node?.tag,
    score:              snap.ugcRegionMap?.[c.id] ?? 0,
    dominantFamilySize: c.dominantFamilySize,
    homogeneity:        c.homogeneity,
    dominantTemplate:   c.dominantTemplate,
    modelLoaded,
  }));
}

/***
 * isValidRuntimeBundle(bundle)
 *
 * WHY: The runtime.json file downloaded from Model Lab must contain specific
 * fields for the wrapper's predictRuntimeProbability() to work. This validator
 * checks the minimum required structure before we allow saving the bundle to
 * chrome.storage.local — preventing silent failures where the model is "loaded"
 * but actually produces no predictions because it's missing weights.
 *
 * Different algorithms need different model fields:
 *   - logistic_regression: needs model.weights (the learned coefficients)
 *   - random_forest / gradient_boosting: needs model.trees (the ensemble)
 *   - decision_tree: needs model.tree (the single tree structure)
 *
 * All algorithms need vectorizer.descriptors — the blueprint for converting
 * raw DOM features into the numeric vector the model expects.
 *
 * @param  {*}       bundle - The parsed JSON object to validate
 * @returns {boolean}       - true if the bundle looks usable
 */
function isValidRuntimeBundle(bundle) {
  if (!bundle || typeof bundle !== 'object') return false;
  // vectorizer.descriptors is required regardless of algorithm
  if (!(bundle.vectorizer?.descriptors?.length > 0)) return false;
  const m    = bundle.model;
  if (!m) return false;
  const algo = m.algorithm || bundle.algorithm;
  if (algo === 'logistic_regression')  return Array.isArray(m.weights) && m.weights.length > 0;
  if (algo === 'random_forest')        return Array.isArray(m.trees)   && m.trees.length > 0;
  if (algo === 'gradient_boosting')    return Array.isArray(m.trees)   && m.trees.length > 0;
  if (algo === 'decision_tree')        return m.tree != null;
  // Unknown algorithm: accept if any recognised model payload is present
  return (
    (Array.isArray(m.weights) && m.weights.length > 0) ||
    (Array.isArray(m.trees)   && m.trees.length > 0)   ||
    m.tree != null
  );
}

/***
 * derivePositiveThreshold(bundle)
 *
 * WHY: The positive threshold is the probability cutoff above which a candidate
 * is classified as a UGC region. It is tuned per-model by the researcher in
 * Model Lab (e.g. by maximizing F1 on the test set) and saved as
 * bundle.thresholds.positive when the user clicks "Set" in Model Lab.
 *
 * The threshold can live in three places in the bundle (in priority order):
 *   1. bundle.thresholds.positive — the explicitly saved custom threshold
 *   2. bundle.evaluation.test.candidate_metrics.threshold — from auto-tune
 *   3. 0.50 — safe default if neither is present
 *
 * We check in this order so a manually-saved threshold always wins over
 * the auto-tuned one.
 *
 * @param  {object} bundle - The runtime model bundle
 * @returns {number}       - Threshold value in [0, 1], default 0.50
 */
function derivePositiveThreshold(bundle) {
  const saved = bundle?.thresholds?.positive;
  if (Number.isFinite(Number(saved))) return Number(saved);
  const evalThreshold = bundle?.evaluation?.test?.candidate_metrics?.threshold;
  if (Number.isFinite(evalThreshold)) return evalThreshold;
  return 0.50;
}

/***
 * renderRuntimeModel(bundle)
 *
 * WHY: Updates the four stat cards in the Runtime Model tab to display
 * the currently loaded model's metadata: artifact ID, algorithm, feature
 * count, and positive threshold. If no bundle is loaded (null), shows
 * dashes and the instructional message.
 *
 * Also shortens long artifact IDs (which can be ISO timestamp strings like
 * "keyword-aware-2026-04-01T07-19-38-597Z") for display in the narrow card.
 *
 * @param {object|null} bundle - The model bundle, or null if nothing is loaded
 */
function renderRuntimeModel(bundle) {
  const artifactEl  = document.getElementById('runtime-model-artifact');
  const algorithmEl = document.getElementById('runtime-model-algorithm');
  const featuresEl  = document.getElementById('runtime-model-features');
  const thresholdEl = document.getElementById('runtime-model-threshold');
  const messageEl   = document.getElementById('runtime-model-message');
  if (!artifactEl || !algorithmEl || !featuresEl || !thresholdEl || !messageEl) return;

  if (!isValidRuntimeBundle(bundle)) {
    // No model loaded — reset all cards to placeholder dashes
    artifactEl.textContent  = '—';
    algorithmEl.textContent = '—';
    featuresEl.textContent  = '—';
    thresholdEl.textContent = '—';
    messageEl.textContent   = 'Load the runtime bundle downloaded from Model Lab. It is stored locally in chrome.storage.local for future candidate scoring.';
    return;
  }

  // bundle.id is the canonical identifier; bundle.artifact_id is a legacy alias
  const artifactId = bundle.id || bundle.artifact_id || '—';
  // Shorten timestamp suffix for display in the small card
  artifactEl.textContent = artifactId.length > 20
    ? artifactId.replace(/T\d{2}-\d{2}-\d{2}-\d{3}Z$/, '').slice(-20) + '…'
    : artifactId;
  algorithmEl.textContent = bundle.algorithm || '—';
  featuresEl.textContent  = String(bundle.feature_count || (bundle.feature_catalog || []).length || 0);
  thresholdEl.textContent = derivePositiveThreshold(bundle).toFixed(2);

  // Show a human-readable "saved at" timestamp if available
  const savedAt = bundle.savedAt ? new Date(bundle.savedAt).toLocaleString() : '';
  messageEl.textContent = savedAt
    ? `Runtime model loaded and saved locally at ${savedAt}.`
    : 'Runtime model loaded. The bundle is stored locally in chrome.storage.local for future candidate scoring.';
}

/***
 * refreshRuntimeModel()
 *
 * WHY: Called on popup open and when the user clicks the "Refresh" button.
 * Fetches the currently-stored model bundle from the background and re-renders
 * the Runtime Model tab cards. Useful after loading a new model from another
 * browser window.
 */
async function refreshRuntimeModel() {
  const bundle = await bgMessage({ type: 'GET_RUNTIME_MODEL' });
  renderRuntimeModel(bundle);
}

/***
 * loadRuntimeModelFromFile()
 *
 * WHY: The main way to install a new ML model. The user downloads runtime.json
 * from Model Lab, clicks the file input in the popup, and this function:
 *   1. Reads the file from disk
 *   2. Validates it with isValidRuntimeBundle()
 *   3. Sends it to the background via SET_RUNTIME_MODEL, which persists it AND
 *      broadcasts it to all open tabs immediately
 *   4. Updates the UI cards to reflect the newly loaded model
 *
 * Errors (invalid format, storage failure) are shown in the message field
 * rather than thrown as alert dialogs.
 */
async function loadRuntimeModelFromFile() {
  const input     = document.getElementById('runtime-model-file');
  const messageEl = document.getElementById('runtime-model-message');
  if (!input || !input.files || !input.files[0]) {
    if (messageEl) messageEl.textContent = 'Choose a runtime JSON file first.';
    return;
  }

  try {
    const text   = await input.files[0].text();
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

/***
 * clearRuntimeModel()
 *
 * WHY: Sends CLEAR_RUNTIME_MODEL to the background. The background deletes the
 * stored bundle from chrome.storage.local and broadcasts null to all tabs,
 * which causes each tab's wrapper to drop _runtimeModel and fall back to
 * heuristic scoring. The UI cards are then reset to their empty state.
 */
async function clearRuntimeModel() {
  const response = await bgMessage({ type: 'CLEAR_RUNTIME_MODEL' });
  if (response && response.ok === false) {
    throw new Error(response.error || 'Could not clear the runtime model');
  }
  renderRuntimeModel(null);
}

// ─── Security events panel ─────────────────────────────────────────────────────

/***
 * loadSecurityEvents()
 *
 * WHY: Populates the Security Log tab with a list of every mutation that the
 * SecurityGate intercepted. Events are shown newest-first (we .reverse() the
 * array) so the most recent attack attempt is always at the top.
 *
 * We cap at 50 entries in the popup (though store.js retains up to 500) to
 * keep the popup responsive. The user can export the full log via Export Dataset.
 *
 * Event cards are color-coded: red left border for 'block' (mutation was stopped),
 * yellow left border for 'flag' (mutation was suspicious but allowed to proceed).
 */
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

// Export Dataset: ask the background for all stored data, JSON-stringify it,
// create a Blob URL, and trigger a download via a hidden <a> element.
document.getElementById('btn-export').addEventListener('click', async () => {
  const data = await bgMessage({ type: 'EXPORT_ALL' });
  if (!data) return;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `pseudodom_export_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url); // release the blob URL immediately after download starts
});

// Snapshot DOM: inject a postMessage into the page that triggers the wrapper
// to serialize the current PseudoDOM and send it to the background for storage.
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
          type:        'PSEUDO_DOM_SNAPSHOT',
          payload:     dbg.getPseudoDOM(),
        }, '*');
      },
    });
  } catch (_) {}
});

// Clear Log: ask background to wipe all security events, then reset the UI.
document.getElementById('btn-clear-events').addEventListener('click', async () => {
  await bgMessage({ type: 'CLEAR_SECURITY_EVENTS' });
  document.getElementById('event-list').innerHTML =
    '<div class="empty-state">No security events recorded.<br>All mutations passing clean.</div>';
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/***
 * bgMessage(msg)
 *
 * WHY: chrome.runtime.sendMessage uses the old callback style. This thin
 * Promise wrapper lets every caller use `await bgMessage(...)` instead of
 * nesting callbacks. Errors from the extension API are swallowed; callers
 * should check the response for `ok: false` instead.
 *
 * @param  {object} msg - The message to send to background.js
 * @returns {Promise<*>} - The background's response
 */
function bgMessage(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (response) => {
      resolve(response);
    });
  });
}

/***
 * setText(id, value)
 *
 * WHY: Simple helper that sets the textContent of a DOM element by ID.
 * Used throughout loadOverview() to update the four stat cards without
 * repeating getElementById/textContent assignments.
 *
 * @param {string} id    - The element's HTML id attribute
 * @param {*}      value - The value to display (converted to string implicitly)
 */
function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

/***
 * escapeHtml(str)
 *
 * WHY: Security events may contain the actual malicious HTML payload that was
 * intercepted (e.g. a <script> tag or an onerror attribute). If we insert that
 * raw string into the popup's innerHTML, we would be running the very attack we
 * just blocked. escapeHtml() converts < > & " into their HTML entity equivalents
 * so the string is displayed as text, never executed.
 *
 * @param  {string} str - Potentially unsafe string from a security event sample
 * @returns {string}    - HTML-safe version of the string
 */
function escapeHtml(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

init().catch(console.error);

// Background may push security events while popup is open; currently no
// real-time update is needed — the log only refreshes on popup open.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'GET_SECURITY_EVENTS') {
    // Handled by background; popup just loads on open
  }
});

// ─── Runtime model tab button wiring ─────────────────────────────────────────

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

// ─── Highlight toggle ─────────────────────────────────────────────────────────

// Auto-highlight is on by default — reflect that in the checkbox state on open.
document.getElementById('highlight-toggle').checked = true;

document.getElementById('highlight-toggle').addEventListener('change', async (event) => {
  const enabled = event.target.checked;
  try {
    await setHighlightMode(enabled);
  } catch (_) {
    // If the content script isn't reachable (e.g. tab opened before extension was loaded),
    // keep the toggle in the requested state and show a friendly hint instead of an error.
    setCandidatePanelMessage(
      'Could not reach this page — reload the tab to activate the extension, then try again.'
    );
  }
});

// ─── Scoring mode toggles ─────────────────────────────────────────────────────

const modelToggle     = document.getElementById('model-toggle');
const heuristicToggle = document.getElementById('heuristic-toggle');

/***
 * applyToggles(mode)
 *
 * WHY: The model and heuristic toggles are mutually exclusive — only one can
 * be checked at a time. When both are off, mode is 'none'. This function sets
 * the checkbox states to match a given mode string so the UI always accurately
 * reflects the persisted setting.
 *
 * Called on popup open (to restore the saved mode) and after onScoringToggle.
 *
 * @param {string} mode - 'model' | 'heuristic' | 'none'
 */
function applyToggles(mode) {
  modelToggle.checked     = mode === 'model';
  heuristicToggle.checked = mode === 'heuristic';
}

/***
 * onScoringToggle(chosen)
 *
 * WHY: Called when either toggle changes. The logic derives the new mode:
 *   - User just turned on 'model'    and it's checked → mode = 'model'
 *   - User just turned on 'heuristic' and it's checked → mode = 'heuristic'
 *   - User turned off the currently active toggle → mode = 'none' (both off)
 *
 * After sending the mode to the background (which persists it and broadcasts
 * it to all tabs), we wait 150 ms for the SCORING_MODE postMessage to reach
 * the wrapper and trigger a re-classify() before re-reading the candidates.
 * Without this delay, loadCandidates() would call getCandidatesFromPage() which
 * still shows scores from the old mode.
 *
 * @param {string} chosen - Which toggle was just changed ('model' or 'heuristic')
 */
async function onScoringToggle(chosen) {
  const current = modelToggle.checked     && chosen === 'model'     ? 'model'
    : heuristicToggle.checked && chosen === 'heuristic' ? 'heuristic'
    : 'none';
  applyToggles(current);
  try {
    await setScoringMode(current);
    // Give the message time to reach injected_wrapper before re-reading candidates.
    await new Promise(r => setTimeout(r, 150));
    if (_activeTab) await loadCandidates(_activeTab);
  } catch (_) {
    setCandidatePanelMessage('Could not reach this page — reload the tab to activate the extension, then try again.');
  }
}

// Mutually exclusive: turning one on automatically turns the other off.
modelToggle.addEventListener('change', () => {
  if (modelToggle.checked) heuristicToggle.checked = false;
  onScoringToggle('model');
});

heuristicToggle.addEventListener('change', () => {
  if (heuristicToggle.checked) modelToggle.checked = false;
  onScoringToggle('heuristic');
});

// Restore saved scoring mode on popup open — without this, toggles always
// reset to unchecked every time the popup opens.
bgMessage({ type: 'GET_SCORING_MODE' }).then((mode) => {
  applyToggles(mode || 'heuristic');
});

// ─── Candidate JSON fallback wiring ───────────────────────────────────────────

document.getElementById('btn-load-candidate-json').addEventListener('click', async () => {
  await loadCandidateJsonFromFile();
});

// Also trigger on file selection change (user picked a file without clicking Load)
document.getElementById('candidate-json-file').addEventListener('change', async () => {
  await loadCandidateJsonFromFile();
});
