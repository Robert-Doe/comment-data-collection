/**
 * content_bridge.js — Content Script (Isolated World)
 *
 * run_at: document_start — fires before any page script executes.
 *
 * This script runs in Chrome's isolated extension world so it cannot
 * directly patch page prototype methods. Its job is to:
 *
 *   1. Inject injected_wrapper.js into the MAIN world (page JS context)
 *      using chrome.scripting.executeScript with world: 'MAIN'.
 *      This gives the wrapper script access to the real prototype chain.
 *
 *   2. Relay messages between the MAIN world wrapper (which cannot use
 *      chrome.runtime directly) and the background service worker.
 *
 *   3. Receive the serialized PseudoDOM and candidate features from the
 *      wrapper via window.postMessage and forward them to the background.
 *
 * Timing note:
 *   chrome.scripting.executeScript with world: 'MAIN' and
 *   injectImmediately: true is equivalent to run_at: document_start
 *   in the MAIN world — it fires before any <script> in the page body.
 *
 *   For belt-and-suspenders coverage, the background also injects via
 *   Page.addScriptToEvaluateOnNewDocument when in CDP/scanning mode.
 */

(function () {
  'use strict';

  // ── Step 1: inject the wrapper into MAIN world immediately ─────────────────

  chrome.scripting.executeScript({
    target: { tabId: chrome.runtime.id },   // placeholder; actual injection below
    world: 'MAIN',
    injectImmediately: true,
    files: ['injected_wrapper.js'],
  }).catch(() => {
    // Fallback: inject as a script tag if executeScript is unavailable
    // (e.g., in older MV3 implementations)
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('injected_wrapper.js');
    // Prepend to <head> or <html> to execute as early as possible
    (document.head || document.documentElement).prepend(script);
  });

  // ── Step 2: message relay between MAIN world and background ────────────────

  /**
   * The injected_wrapper.js in the MAIN world communicates with this
   * bridge via window.postMessage with a sentinel namespace.
   *
   * We listen for those messages and forward them to the background
   * via chrome.runtime.sendMessage.
   */
  window.addEventListener('message', (event) => {
    // Only accept messages from the same window (our injected wrapper)
    if (event.source !== window) return;
    if (!event.data || event.data.__pseudodom !== true) return;

    const { type, payload } = event.data;

    // Forward to background; receive response and echo back to MAIN world
    chrome.runtime.sendMessage({ type, payload }, (response) => {
      window.postMessage({
        __pseudodom: true,
        __response: true,
        type: `${type}_RESPONSE`,
        payload: response,
      }, '*');
    });
  });

  // ── Step 3: push pre-parse signals into MAIN world on request ─────────────

  /**
   * The wrapper may ask for page signals (pre-parse metadata collected
   * from response headers before any JS ran). We retrieve them from
   * the background and push them into the MAIN world via postMessage.
   */
  chrome.runtime.sendMessage({ type: 'GET_PAGE_SIGNALS' }, (signals) => {
    if (!signals) return;
    window.postMessage({
      __pseudodom: true,
      __push: true,
      type: 'PAGE_SIGNALS',
      payload: signals,
    }, '*');
  });

})();
