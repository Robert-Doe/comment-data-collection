/**
 * background.js — Service Worker
 *
 * Responsibilities:
 *   Layer 1 — Network interception via declarativeNetRequest / webRequest
 *             for pre-parse signal extraction (og:type, CSP headers,
 *             framework fingerprints, JSON-LD hints).
 *
 *   CDP bridge — Attach chrome.debugger to tabs on demand for the
 *               strongest timing guarantee (Page.addScriptToEvaluateOnNewDocument).
 *               Used during active research/scanning sessions.
 *
 *   Message hub — Receives serialized PseudoDOM snapshots and candidate
 *                 feature vectors from content scripts for persistence.
 *
 * Note: The primary wrapper injection path is the content script
 * (content_bridge.js → injected_wrapper.js) which runs at document_start.
 * CDP injection is a reinforcement path for scanning sessions.
 */

import { PreParseAnalyzer } from './pre_parse_analyzer.js';
import { store } from './store.js';

// ─── State ────────────────────────────────────────────────────────────────────

/** tabId → { pageSignals, cdpAttached, sessionData } */
const tabState = new Map();

// ─── Network interception (Layer 1) ───────────────────────────────────────────

/**
 * Intercept completed navigation responses to extract pre-parse signals
 * from response headers before the HTML parser sees them.
 *
 * We use webRequest onHeadersReceived for header inspection.
 * Full body inspection requires CDP (used in scanning mode).
 */
chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (details.type !== 'main_frame' && details.type !== 'sub_frame') return;

    const signals = PreParseAnalyzer.fromHeaders(details.responseHeaders, details.url);

    const existing = tabState.get(details.tabId) || {};
    tabState.set(details.tabId, {
      ...existing,
      pageSignals: signals,
      url: details.url,
    });

    // Persist signals so the content script can read them on first message
    store.setPageSignals(details.tabId, signals);
  },
  { urls: ['<all_urls>'] },
  ['responseHeaders', 'extraHeaders']
);

// Clean up tab state on navigation / close
chrome.tabs.onRemoved.addListener((tabId) => {
  tabState.delete(tabId);
  store.clearTab(tabId);
  detachCDP(tabId).catch(() => {});
});

chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId !== 0) return;
  tabState.delete(details.tabId);
  store.clearTab(details.tabId);
});

// ─── CDP management ────────────────────────────────────────────────────────────

/**
 * Attach CDP to a tab and inject the wrapper script via
 * Page.addScriptToEvaluateOnNewDocument — the strongest timing guarantee.
 *
 * This path is used during active scanning sessions. Normal browsing
 * uses content_bridge.js → injected_wrapper.js (document_start).
 */
async function attachCDP(tabId) {
  const state = tabState.get(tabId) || {};
  if (state.cdpAttached) return;

  try {
    await chrome.debugger.attach({ tabId }, '1.3');
    state.cdpAttached = true;
    tabState.set(tabId, state);

    // Inject wrapper before any page script via CDP
    const wrapperSource = await fetchWrapperSource();
    await chrome.debugger.sendCommand(
      { tabId },
      'Page.addScriptToEvaluateOnNewDocument',
      { source: wrapperSource }
    );

    // Enable network domain for response body inspection
    await chrome.debugger.sendCommand({ tabId }, 'Network.enable', {});
    await chrome.debugger.sendCommand({ tabId }, 'Page.enable', {});

    chrome.debugger.onEvent.addListener((source, method, params) => {
      if (source.tabId !== tabId) return;
      handleCDPEvent(tabId, method, params);
    });

  } catch (err) {
    console.warn('[PseudoDOM] CDP attach failed:', err.message);
  }
}

async function detachCDP(tabId) {
  const state = tabState.get(tabId);
  if (!state?.cdpAttached) return;
  try {
    await chrome.debugger.detach({ tabId });
    state.cdpAttached = false;
  } catch (_) {}
}

async function broadcastRuntimeModel(bundle) {
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map(async (tab) => {
    if (!tab || typeof tab.id !== 'number') {
      return;
    }

    const message = {
      type: bundle ? 'RUNTIME_MODEL' : 'CLEAR_RUNTIME_MODEL',
      payload: bundle || null,
    };

    try {
      const frames = await chrome.webNavigation.getAllFrames({ tabId: tab.id });
      if (Array.isArray(frames) && frames.length) {
        await Promise.all(frames.map(async (frame) => {
          try {
            await chrome.tabs.sendMessage(tab.id, message, { frameId: frame.frameId });
          } catch (_) {}
        }));
        return;
      }
    } catch (_) {}

    try {
      await chrome.tabs.sendMessage(tab.id, message);
    } catch (_) {}
  }));
}

function handleCDPEvent(tabId, method, params) {
  switch (method) {
    case 'Network.responseReceived': {
      // Full response header inspection via CDP (richer than webRequest)
      const signals = PreParseAnalyzer.fromCDPResponse(params);
      const state = tabState.get(tabId) || {};
      state.pageSignals = { ...(state.pageSignals || {}), ...signals };
      tabState.set(tabId, state);
      store.setPageSignals(tabId, state.pageSignals);
      break;
    }
    case 'Page.frameNavigated': {
      // New frame — wrapper needs to be in place for this frame too.
      // Page.addScriptToEvaluateOnNewDocument covers all frames automatically.
      break;
    }
  }
}

async function fetchWrapperSource() {
  const url = chrome.runtime.getURL('injected_wrapper.js');
  const response = await fetch(url);
  return response.text();
}

// ─── Message hub ───────────────────────────────────────────────────────────────

/**
 * Messages from content scripts:
 *
 *   { type: 'PSEUDO_DOM_SNAPSHOT', payload: SerializedPseudoDOM }
 *     → persist snapshot for review UI and dataset export
 *
 *   { type: 'CANDIDATE_FEATURES', payload: CandidateFeatureSet }
 *     → persist candidate feature vectors
 *
 *   { type: 'SECURITY_EVENT', payload: SecurityEvent }
 *     → log XSS detection / block event
 *
 *   { type: 'GET_PAGE_SIGNALS' }
 *     → return pre-parse signals for this tab
 *
 *   { type: 'SET_RUNTIME_MODEL', payload: RuntimeModelBundle }
 *     → persist the imported runtime model bundle
 *
 *   { type: 'GET_RUNTIME_MODEL' }
 *     → return the currently loaded runtime model bundle
 *
 *   { type: 'CLEAR_RUNTIME_MODEL' }
 *     → remove the loaded runtime model bundle
 *
 *   { type: 'ATTACH_CDP' }
 *     → attach CDP to sender tab (scanning mode)
 *
 *   { type: 'DETACH_CDP' }
 *     → detach CDP from sender tab
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  switch (message.type) {

    case 'PSEUDO_DOM_SNAPSHOT': {
      if (!tabId) break;
      store.savePseudoDOM(tabId, message.payload)
        .then(() => sendResponse({ ok: true }))
        .catch((e) => sendResponse({ ok: false, error: e.message }));
      return true; // async
    }

    case 'CANDIDATE_FEATURES': {
      if (!tabId) break;
      store.saveCandidates(tabId, message.payload)
        .then(() => sendResponse({ ok: true }))
        .catch((e) => sendResponse({ ok: false, error: e.message }));
      return true;
    }

    case 'SECURITY_EVENT': {
      if (!tabId) break;
      store.appendSecurityEvent(tabId, message.payload)
        .then(() => sendResponse({ ok: true }))
        .catch((e) => sendResponse({ ok: false, error: e.message }));
      return true;
    }

    case 'GET_PAGE_SIGNALS': {
      if (!tabId) { sendResponse(null); break; }
      sendResponse(store.getPageSignals(tabId));
      break;
    }

    case 'SET_RUNTIME_MODEL': {
      store.saveRuntimeModel(message.payload)
        .then(async () => {
          await broadcastRuntimeModel(message.payload || null);
          sendResponse({ ok: true });
        })
        .catch((e) => sendResponse({ ok: false, error: e.message }));
      return true;
    }

    case 'GET_RUNTIME_MODEL': {
      store.getRuntimeModel()
        .then((bundle) => sendResponse(bundle))
        .catch(() => sendResponse(null));
      return true;
    }

    case 'CLEAR_RUNTIME_MODEL': {
      store.clearRuntimeModel()
        .then(async () => {
          await broadcastRuntimeModel(null);
          sendResponse({ ok: true });
        })
        .catch((e) => sendResponse({ ok: false, error: e.message }));
      return true;
    }

    case 'ATTACH_CDP': {
      if (!tabId) break;
      attachCDP(tabId)
        .then(() => sendResponse({ ok: true }))
        .catch((e) => sendResponse({ ok: false, error: e.message }));
      return true;
    }

    case 'DETACH_CDP': {
      if (!tabId) break;
      detachCDP(tabId)
        .then(() => sendResponse({ ok: true }))
        .catch((e) => sendResponse({ ok: false, error: e.message }));
      return true;
    }

    case 'GET_SECURITY_EVENTS': {
      store.getSecurityEvents()
        .then((events) => sendResponse(events))
        .catch(() => sendResponse([]));
      return true;
    }

    case 'CLEAR_SECURITY_EVENTS': {
      store.clearSecurityEvents()
        .then(() => sendResponse({ ok: true }))
        .catch((e) => sendResponse({ ok: false, error: e.message }));
      return true;
    }

    case 'EXPORT_ALL': {
      store.exportAll()
        .then((data) => sendResponse(data))
        .catch((e) => sendResponse({ error: e.message }));
      return true;
    }
  }
});
