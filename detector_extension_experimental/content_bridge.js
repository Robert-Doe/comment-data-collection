/**
 * content_bridge.js - content script bridge for the PseudoDOM wrapper.
 *
 * Responsibilities:
 * - inject injected_wrapper.js into the page world
 * - inject the feature extractor runtime module
 * - relay wrapper <-> background messages
 * - hydrate the wrapper with page signals and the runtime model
 *
 * WHY THIS FILE EXISTS AT ALL:
 * Chrome extensions have two separate JavaScript worlds:
 *   - The ISOLATED world: where content scripts (like this file) run.
 *     Content scripts can call chrome.* APIs but cannot touch page JS variables.
 *   - The MAIN world: where the actual webpage's JavaScript runs.
 *     The page cannot call chrome.* APIs, but it owns the DOM and all JS globals.
 *
 * The security wrapper (injected_wrapper.js) MUST live in the MAIN world so it
 * can intercept DOM APIs like innerHTML before the page's own scripts run.
 * But it needs data from the background (like the saved ML model and page signals)
 * that only a content script (this file) can fetch via chrome.runtime.
 *
 * This bridge solves that problem: it sits between the two worlds and uses
 * window.postMessage to ferry messages back and forth.
 */

(function () {
  'use strict';

  // These four variables hold data that arrives asynchronously from the background
  // service worker. They are "pending" because the page-side wrapper (injected_wrapper.js)
  // may not be ready to receive them yet when they first arrive.
  // flushPendingPushes() is called every time either side becomes ready.
  let wrapperReady = false;         // true once the wrapper signals WRAPPER_READY
  let featureExtractorReady = false; // true once the ML feature extractor <script> loaded
  let pendingPageSignals = null;     // pre-parse header signals (CSP, framework, og:type, etc.)
  let pendingRuntimeModel = null;    // the full ML model bundle the user loaded in the popup
  let pendingScoringMode = null;     // 'model' | 'heuristic' | 'none'
  // Set to true when the background requests the runtime model to be cleared so
  // flushPendingPushes() sends a RUNTIME_MODEL with null payload to the wrapper.
  let pendingClearModel = false;

  /***
   * injectScript(src, options)
   *
   * WHY: Content scripts run in the ISOLATED world and cannot directly call
   * functions inside the page's MAIN world. The only way to run code in the
   * MAIN world — the world that owns the real DOM — is to inject a <script>
   * tag into the actual page HTML. The browser will load and execute it just
   * like any other page script.
   *
   * This helper creates a <script> element, sets its src to a chrome-extension://
   * URL (which is safe, because the browser trusts extension URLs even under
   * strict Content Security Policies), and prepends it to the document head so
   * it runs as early as possible.
   *
   * The `module: true` option is required for feature_extractor_runtime.js
   * because that file uses ES module import/export syntax. Regular scripts
   * cannot use import/export; only <script type="module"> tags can.
   *
   * NOTE: injected_wrapper.js is NO LONGER injected here. It is now declared
   * directly in manifest.json as a world:"MAIN" content script, which gives
   * an even earlier injection guarantee (before even the first byte of HTML
   * is parsed). This comment is intentionally left to explain why you won't
   * see it being injected here.
   *
   * @param {string}   src             - Path relative to the extension root (e.g. 'foo.js')
   * @param {object}   options
   * @param {boolean}  options.module  - If true, injects as <script type="module">
   * @param {Function} options.onLoad  - Called when the script finishes loading
   * @param {Function} options.onError - Called if the script fails to load (e.g. CSP block)
   */
  function injectScript(src, options = {}) {
    const script = document.createElement('script');
    if (options.module) {
      script.type = 'module';
    }
    // chrome.runtime.getURL converts a relative extension path like 'foo.js'
    // into the full chrome-extension://[id]/foo.js URL that the browser can load.
    script.src = chrome.runtime.getURL(src);
    // async:false means the script blocks HTML parsing until it executes,
    // giving us execution order guarantees even if multiple scripts are injected.
    script.async = false;
    if (typeof options.onLoad === 'function') {
      script.onload = options.onLoad;
    }
    if (typeof options.onError === 'function') {
      script.onerror = options.onError;
    }
    // prepend (not append) so our script runs before any scripts already in <head>
    (document.head || document.documentElement).prepend(script);
  }

  /***
   * postToPage(type, payload)
   *
   * WHY: The wrapper (injected_wrapper.js) lives in the MAIN world and listens
   * for window.postMessage events tagged with __pseudodom:true and __push:true.
   * This is the only way a content script can pass data INTO the MAIN world
   * without using chrome.scripting.executeScript (which requires extra permissions).
   *
   * The __push flag distinguishes messages sent TO the wrapper (pushes) from
   * messages sent BY the wrapper back to this bridge (which use __pseudodom:true
   * but do NOT set __push).
   *
   * The '*' target origin means the message is delivered regardless of the page's
   * origin. This is intentional — we are communicating within the same tab, not
   * across origins, so the security concern of wildcard origins does not apply here.
   *
   * @param {string} type    - Message type (e.g. 'PAGE_SIGNALS', 'RUNTIME_MODEL')
   * @param {*}      payload - Arbitrary serializable data to pass to the wrapper
   */
  function postToPage(type, payload) {
    window.postMessage({
      __pseudodom: true,
      __push: true,
      type,
      payload,
    }, '*');
  }

  /***
   * flushPendingPushes()
   *
   * WHY: There is a race condition between two independent asynchronous processes:
   *   1. The wrapper (injected_wrapper.js) announces WRAPPER_READY when it finishes
   *      setting up its IIFE. This can take a few milliseconds.
   *   2. This bridge fetches page signals and the runtime model from the background
   *      service worker. These are also async (chrome.runtime.sendMessage calls).
   *
   * Either side might finish first. We cannot send page signals to the wrapper
   * before it has set up its window.addEventListener('message') listener, or the
   * messages will be silently dropped. This function is the solution: it holds all
   * pending data in variables and only sends it once BOTH sides are ready.
   *
   * It is called from three places:
   *   - When WRAPPER_READY is received (wrapper just became ready)
   *   - When background returns page signals (signals just became available)
   *   - When background returns the runtime model (model just became available)
   *
   * The order of the pushes matters: PAGE_SIGNALS first so the wrapper has
   * context clues (framework type, CSP headers) before it scores candidates.
   * RUNTIME_MODEL second so the model is loaded before the first classify() run.
   * SCORING_MODE third so the mode is set before scoring begins.
   * FEATURE_EXTRACTOR_READY last as a trigger to re-classify with the now-available
   * feature extraction functions.
   */
  function flushPendingPushes() {
    // Do nothing if the wrapper hasn't announced itself yet.
    // All pending items will be sent the moment WRAPPER_READY arrives.
    if (!wrapperReady) return;

    if (pendingPageSignals) {
      postToPage('PAGE_SIGNALS', pendingPageSignals);
      pendingPageSignals = null;
    }

    if (pendingRuntimeModel) {
      postToPage('RUNTIME_MODEL', pendingRuntimeModel);
      pendingRuntimeModel = null;
      pendingClearModel = false; // loading a model supersedes any pending clear
    } else if (pendingClearModel) {
      // Explicitly push null so the wrapper clears _runtimeModel and re-classifies.
      // Without this, the wrapper would keep using the old model even after the
      // user clicked "Clear" in the popup.
      postToPage('RUNTIME_MODEL', null);
      pendingClearModel = false;
    }

    if (pendingScoringMode !== null) {
      postToPage('SCORING_MODE', { mode: pendingScoringMode });
      pendingScoringMode = null;
    }

    if (featureExtractorReady) {
      // This acts as a signal to the wrapper to re-run classify() now that the
      // ML feature extraction functions are available in window.__PSEUDODOM_FEATURE_EXTRACTOR__.
      postToPage('FEATURE_EXTRACTOR_READY', { ready: true });
      featureExtractorReady = false;
    }
  }

  // ─── Relay: MAIN world → background ───────────────────────────────────────────
  // The wrapper posts messages to window. This listener picks them up and
  // forwards them to the background service worker via chrome.runtime.sendMessage.
  // The background's response is then posted back to the page as a *_RESPONSE message
  // so the wrapper can handle it if needed.
  window.addEventListener('message', (event) => {
    // Only process messages from THIS tab's window, not from iframes or other sources
    if (event.source !== window) return;
    if (!event.data || event.data.__pseudodom !== true) return;

    const { type, payload } = event.data;

    // WRAPPER_READY is a special handshake — it means the wrapper is now listening
    // for postMessage events. Flush anything that arrived before it was ready.
    if (type === 'WRAPPER_READY') {
      wrapperReady = true;
      flushPendingPushes();
      return;
    }

    // These types are pushes FROM this bridge TO the wrapper.
    // Ignore them here to avoid an infinite echo loop.
    if (type === 'PAGE_SIGNALS' || type === 'RUNTIME_MODEL' || type === 'FEATURE_EXTRACTOR_READY') {
      return;
    }

    // All other message types (PSEUDO_DOM_SNAPSHOT, CANDIDATE_FEATURES, SECURITY_EVENT, etc.)
    // originate in the wrapper and need to be forwarded to the background service worker,
    // which persists them in chrome.storage.local.
    chrome.runtime.sendMessage({ type, payload }, (response) => {
      // Post the background's response back to the page world so the wrapper can
      // use it if it sent the message with an expectation of a reply.
      window.postMessage({
        __pseudodom: true,
        __response: true,
        type: `${type}_RESPONSE`,
        payload: response,
      }, '*');
    });
  });

  // ─── Relay: background → MAIN world ───────────────────────────────────────────
  // The background service worker (background.js) sends messages to all tabs
  // when the runtime model changes or when scoring mode is updated.
  // This listener receives those messages and forwards them to the wrapper via postMessage.
  chrome.runtime.onMessage.addListener((message) => {
    if (!message || typeof message !== 'object') {
      return;
    }

    // The user just loaded a new model in the popup. Store it as pending so
    // flushPendingPushes() sends it to the wrapper when appropriate.
    if (message.type === 'RUNTIME_MODEL') {
      pendingRuntimeModel = message.payload || null;
      flushPendingPushes();
      return;
    }

    // The user cleared the model in the popup. Set the clear flag so
    // flushPendingPushes() sends RUNTIME_MODEL(null) to the wrapper,
    // which will clear _runtimeModel and fall back to heuristic scoring.
    if (message.type === 'CLEAR_RUNTIME_MODEL') {
      pendingRuntimeModel = null;
      pendingClearModel = true;
      flushPendingPushes();
      return;
    }

    // Forward highlight mode changes directly to the wrapper.
    // This controls whether the red border is drawn around the top candidate.
    if (message.type === 'SET_HIGHLIGHT_MODE') {
      postToPage('HIGHLIGHT_MODE', message.payload);
      return;
    }

    // Forward scoring mode changes (model / heuristic / none) to the wrapper
    // so it re-classifies with the new mode immediately.
    if (message.type === 'SET_SCORING_MODE') {
      postToPage('SCORING_MODE', message.payload);
      return;
    }

    // Forward highlight-specific-candidate requests to the wrapper.
    // Sent when the user clicks a candidate card in the popup.
    if (message.type === 'HIGHLIGHT_CANDIDATE') {
      postToPage('HIGHLIGHT_CANDIDATE', message.payload);
      return;
    }

    // Forward manually-provided CSS selectors for fallback candidate detection.
    if (message.type === 'LOAD_CANDIDATE_JSON') {
      postToPage('CANDIDATE_JSON', message.payload);
      return;
    }
  });

  // ─── Bootstrap: fetch initial state from background ────────────────────────────
  // On every page navigation the content script runs fresh. These three sendMessage
  // calls fetch the persistent state from the background so the wrapper starts
  // with the right context rather than defaults.

  // Page signals were captured by background.js from the HTTP response headers
  // BEFORE the HTML even started loading. We collect them here so the wrapper
  // can use them immediately during the first classify() run.
  chrome.runtime.sendMessage({ type: 'GET_PAGE_SIGNALS' }, (signals) => {
    if (!signals) return;
    pendingPageSignals = signals;
    flushPendingPushes();
  });

  // The runtime model bundle is the ML model the user exported from Model Lab
  // and loaded via the popup. It persists in chrome.storage.local across sessions.
  chrome.runtime.sendMessage({ type: 'GET_RUNTIME_MODEL' }, (bundle) => {
    if (!bundle) return;
    pendingRuntimeModel = bundle;
    flushPendingPushes();
  });

  // The scoring mode ('model' | 'heuristic' | 'none') persists across popup close.
  // We fetch it here so the wrapper uses the correct mode from the very first classify().
  chrome.runtime.sendMessage({ type: 'GET_SCORING_MODE' }, (mode) => {
    pendingScoringMode = mode || 'heuristic';
    flushPendingPushes();
  });

  // injected_wrapper.js is now declared as a world:"MAIN" content script in
  // manifest.json — the browser injects it at document_start before any page
  // script, bypassing page CSP.  Do NOT inject it again here.

  // feature_extractor_runtime.js is an ES-module and must still be injected
  // as a <script type="module">.  It may be blocked on strict-CSP sites
  // (e.g. Walmart) but that only disables ML scoring; heuristic fallback
  // keeps candidate detection working on those pages.
  injectScript('feature_extractor_runtime.js', {
    module: true,
    onLoad: () => {
      // The module has loaded and registered window.__PSEUDODOM_FEATURE_EXTRACTOR__.
      // Setting featureExtractorReady=true and calling flushPendingPushes() will
      // send FEATURE_EXTRACTOR_READY to the wrapper, which triggers a re-classify()
      // run now that ML feature extraction is available.
      featureExtractorReady = true;
      flushPendingPushes();
    },
    onError: () => {
      // Feature extractor failed to load (likely blocked by page CSP).
      // The wrapper will fall back to heuristic-only scoring.
      featureExtractorReady = false;
    },
  });
})();
