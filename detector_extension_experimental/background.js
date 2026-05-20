/**
 * background.js — Service Worker
 *
 * WHY THIS FILE EXISTS:
 * A Chrome extension's background service worker is the only persistent process
 * that lives across ALL tabs. It can:
 *   - Intercept network requests (via chrome.webRequest) before the page sees them
 *   - Communicate with any tab's content scripts (via chrome.tabs.sendMessage)
 *   - Persist data to chrome.storage.local via store.js
 *   - Attach the Chrome DevTools Protocol (CDP) to a tab for deep inspection
 *
 * Regular content scripts (content_bridge.js, injected_wrapper.js) are tab-local —
 * they only exist while that tab is open. The background worker is the hub that
 * connects them all.
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

/**
 * Per-tab runtime state held in memory.
 * Map: tabId (number) → { pageSignals, cdpAttached, sessionData }
 *
 * WHY an in-memory Map instead of chrome.storage?
 * This state is ephemeral — it's only valid for the current page load.
 * It would be wasteful (and slower) to read/write chrome.storage for
 * data that only lives until the tab navigates away.
 */
const tabState = new Map();

// ─── Network interception (Layer 1) ───────────────────────────────────────────

/**
 * WHY we intercept HTTP response headers here:
 * The very best time to know what kind of page is being loaded is BEFORE the
 * HTML starts rendering. HTTP response headers carry rich signals:
 *   - Content-Security-Policy: tells us what scripts are allowed to run
 *   - X-Powered-By / Server: hints at backend framework
 * The HTML <head> (og:type, JSON-LD script tags) carries more signals, but
 * those only appear after the HTML parser runs. By intercepting headers here
 * we get the earliest possible classification signal.
 *
 * This listener fires for every main_frame (top-level page) and sub_frame
 * (iframe) navigation. The signals are stored in tabState and also persisted
 * via store.setPageSignals so the content script can fetch them later.
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
  ['responseHeaders', 'extraHeaders'] // extraHeaders needed for Strict-Transport-Security etc.
);

// Clean up tab state on tab close or navigation to prevent memory leaks
chrome.tabs.onRemoved.addListener((tabId) => {
  tabState.delete(tabId);
  store.clearTab(tabId);
  detachCDP(tabId).catch(() => {});
});

chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId !== 0) return; // only care about the top-level frame
  tabState.delete(details.tabId);
  store.clearTab(details.tabId);
});

// ─── CDP management ────────────────────────────────────────────────────────────

/***
 * attachCDP(tabId)
 *
 * WHY: CDP (Chrome DevTools Protocol) is a lower-level API than content scripts.
 * Its Page.addScriptToEvaluateOnNewDocument command injects JavaScript into the
 * page BEFORE any other script runs — even before content scripts at document_start.
 * This is the strongest possible injection timing guarantee.
 *
 * We use this in "scanning mode" — an active research session where we want
 * the wrapper to be injected even on pages with strict CSP that would block
 * the <script src> injection used by content_bridge.js.
 *
 * CDP also gives us full response body inspection (Network.enable), which
 * lets us parse JSON-LD and og:type from the raw HTML body, not just headers.
 *
 * NOTE: Attaching the debugger shows a "DevTools connected" banner in the browser.
 * This is a Chrome requirement; there is no way to hide it. For this reason CDP
 * is opt-in (triggered by ATTACH_CDP message) rather than on by default.
 *
 * @param {number} tabId - The tab to attach CDP to
 */
async function attachCDP(tabId) {
  const state = tabState.get(tabId) || {};
  if (state.cdpAttached) return; // already attached — no-op

  try {
    await chrome.debugger.attach({ tabId }, '1.3'); // protocol version 1.3
    state.cdpAttached = true;
    tabState.set(tabId, state);

    // Inject wrapper before any page script via CDP.
    // This is the reinforcement injection path for scanning sessions.
    // The wrapper source is fetched from the extension's own files.
    const wrapperSource = await fetchWrapperSource();
    await chrome.debugger.sendCommand(
      { tabId },
      'Page.addScriptToEvaluateOnNewDocument',
      { source: wrapperSource }
    );

    // Enable network domain for response body inspection (Layer 1 enhancement)
    await chrome.debugger.sendCommand({ tabId }, 'Network.enable', {});
    await chrome.debugger.sendCommand({ tabId }, 'Page.enable', {});

    // Register a CDP event listener for this tab
    chrome.debugger.onEvent.addListener((source, method, params) => {
      if (source.tabId !== tabId) return;
      handleCDPEvent(tabId, method, params);
    });

  } catch (err) {
    console.warn('[PseudoDOM] CDP attach failed:', err.message);
  }
}

/***
 * detachCDP(tabId)
 *
 * WHY: When we're done scanning a tab, or when the tab closes, we must detach
 * the debugger. Leaving it attached forever would prevent the user from opening
 * real DevTools on that tab (Chrome only allows one debugger session at a time).
 *
 * @param {number} tabId - The tab to detach CDP from
 */
async function detachCDP(tabId) {
  const state = tabState.get(tabId);
  if (!state?.cdpAttached) return;
  try {
    await chrome.debugger.detach({ tabId });
    state.cdpAttached = false;
  } catch (_) {}
}

/***
 * broadcastRuntimeModel(bundle)
 *
 * WHY: When the user loads a new ML model in the popup (or clears it), all
 * currently-open tabs need to know about it immediately — not just future
 * navigations. For example, the user might have YouTube open in Tab A and
 * Reddit open in Tab B. Loading a new model in the popup should update the
 * wrapper's scoring in BOTH tabs right away.
 *
 * We iterate all tabs and send the model (or null for "clear") to each tab's
 * content script via chrome.tabs.sendMessage. The content script then forwards
 * it to the page-world wrapper via window.postMessage.
 *
 * @param {object|null} bundle - The model bundle to push, or null to clear
 */
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
    await broadcastMessageToTab(tab.id, message);
  }));
}

/***
 * handleCDPEvent(tabId, method, params)
 *
 * WHY: CDP sends events back to us about things happening in the inspected tab.
 * We handle two:
 *   - Network.responseReceived: richer header data than webRequest gives us.
 *     CDP provides the full response headers including headers that webRequest
 *     sometimes omits on cached responses.
 *   - Page.frameNavigated: a new iframe appeared. Since we inject via
 *     addScriptToEvaluateOnNewDocument which auto-covers all frames, no extra
 *     action is needed here, but we note it for completeness.
 *
 * @param {number} tabId  - The tab that emitted the event
 * @param {string} method - CDP event name (e.g. 'Network.responseReceived')
 * @param {object} params - Event-specific payload from Chrome
 */
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

/***
 * fetchWrapperSource()
 *
 * WHY: Page.addScriptToEvaluateOnNewDocument requires the FULL JavaScript
 * source code as a string — not a URL. So we read the wrapper file from the
 * extension bundle using fetch() (which works on chrome-extension:// URLs)
 * and return the source text.
 *
 * @returns {Promise<string>} - The full source code of injected_wrapper.js
 */
async function fetchWrapperSource() {
  const url = chrome.runtime.getURL('injected_wrapper.js');
  const response = await fetch(url);
  return response.text();
}

/***
 * broadcastMessageToTab(tabId, message)
 *
 * WHY: Sending a message to a tab sounds simple, but in practice it can fail
 * for several reasons:
 *   - The tab has no content script loaded (e.g. it's a chrome:// page)
 *   - The tab has multiple frames (iframes), each with their own content script
 *   - A frame might have been destroyed between the tabs.query call and sendMessage
 *
 * This function tries the most reliable path first: send to every known frame
 * individually (using getAllFrames). If that fails entirely, fall back to a
 * simple sendMessage with no frameId, which Chrome routes to the main frame.
 *
 * Returns true if at least one frame received the message, false otherwise.
 * Callers use the return value to surface "content script not found" errors.
 *
 * @param  {number} tabId   - The tab to send to
 * @param  {object} message - The message object to send
 * @returns {Promise<boolean>} - true if delivered to at least one frame
 */
async function broadcastMessageToTab(tabId, message) {
  let delivered = false;
  try {
    const frames = await chrome.webNavigation.getAllFrames({ tabId });
    if (Array.isArray(frames) && frames.length) {
      await Promise.all(frames.map(async (frame) => {
        try {
          await chrome.tabs.sendMessage(tabId, message, { frameId: frame.frameId });
          delivered = true;
        } catch (_) {} // individual frame may not have a content script — ignore
      }));
      if (delivered) return true;
    }
  } catch (_) {}

  // Fallback: send to the main frame without specifying a frameId
  try {
    await chrome.tabs.sendMessage(tabId, message);
    delivered = true;
  } catch (_) {}

  return delivered;
}

/***
 * forwardMessageToActiveTab(message)
 *
 * WHY: Some messages originate from the popup (not from a content script in
 * a tab). The popup doesn't know which tab to target — it just wants to send
 * to "the currently active tab." This function handles that lookup.
 *
 * Used for SET_HIGHLIGHT_MODE and LOAD_CANDIDATE_JSON, which come from the
 * popup UI and need to reach the active tab's wrapper.
 *
 * @param  {object} message - The message to forward
 * @throws {Error}           - If no active tab exists or content script not found
 */
async function forwardMessageToActiveTab(message) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || typeof tab.id !== 'number') {
    throw new Error('No active tab');
  }
  const delivered = await broadcastMessageToTab(tab.id, message);
  if (!delivered) {
    throw new Error('No content script found in active tab');
  }
}

// ─── Message hub ───────────────────────────────────────────────────────────────

/**
 * WHY THIS LISTENER IS THE CORE OF THE BACKGROUND:
 * All communication between the page world (wrapper), content scripts, and popup
 * goes through chrome.runtime.sendMessage → this listener. It routes each
 * message type to the appropriate handler and sends back a response.
 *
 * The `return true` at the end of async cases is CRITICAL: it tells Chrome
 * that the response will arrive asynchronously (after an await). Without it,
 * Chrome closes the message channel before the async work finishes and the
 * sendResponse call is silently dropped, causing the caller to hang forever.
 *
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
      return true; // async response — keep channel open
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
      // Synchronous read from in-memory Map — no async needed, no `return true`
      if (!tabId) { sendResponse(null); break; }
      sendResponse(store.getPageSignals(tabId));
      break;
    }

    case 'SET_RUNTIME_MODEL': {
      // Save the model, then broadcast to all tabs so their wrappers update immediately
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

    case 'SET_SCORING_MODE': {
      // Save the mode, then push it to every open tab so all wrappers switch immediately
      const mode = message.payload?.mode;
      store.saveScoringMode(mode)
        .then(async () => {
          const tabs = await chrome.tabs.query({});
          await Promise.all(tabs.map(async (tab) => {
            if (!tab || typeof tab.id !== 'number') return;
            await broadcastMessageToTab(tab.id, { type: 'SET_SCORING_MODE', payload: { mode } });
          }));
          sendResponse({ ok: true });
        })
        .catch((e) => sendResponse({ ok: false, error: e.message }));
      return true;
    }

    case 'GET_SCORING_MODE': {
      store.getScoringMode()
        .then((mode) => sendResponse(mode))
        .catch(() => sendResponse('heuristic'));
      return true;
    }

    case 'CLEAR_RUNTIME_MODEL': {
      // Clear from storage, then tell all tabs to drop the model
      store.clearRuntimeModel()
        .then(async () => {
          await broadcastRuntimeModel(null);
          sendResponse({ ok: true });
        })
        .catch((e) => sendResponse({ ok: false, error: e.message }));
      return true;
    }

    case 'SET_HIGHLIGHT_MODE':
    case 'LOAD_CANDIDATE_JSON': {
      // These messages come from the popup (no sender.tab) or from a content script.
      // If from a content script, forward to that tab's wrapper.
      // If from the popup, forward to whichever tab is currently active.
      const forward = sender.tab?.id
        ? broadcastMessageToTab(sender.tab.id, {
            type: message.type,
            payload: message.payload || null,
          })
        : forwardMessageToActiveTab({
            type: message.type,
            payload: message.payload || null,
          });
      forward
        .then((delivered) => {
          if (delivered === false) {
            throw new Error('No content script found in target tab');
          }
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
