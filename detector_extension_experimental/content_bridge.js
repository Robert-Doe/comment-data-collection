/**
 * content_bridge.js - content script bridge for the PseudoDOM wrapper.
 *
 * Responsibilities:
 * - inject injected_wrapper.js into the page world
 * - inject the feature extractor runtime module
 * - relay wrapper <-> background messages
 * - hydrate the wrapper with page signals and the runtime model
 */

(function () {
  'use strict';

  let wrapperReady = false;
  let featureExtractorReady = false;
  let pendingPageSignals = null;
  let pendingRuntimeModel = null;
  // Set to true when the background requests the runtime model to be cleared so
  // flushPendingPushes() sends a RUNTIME_MODEL with null payload to the wrapper.
  let pendingClearModel = false;

  function injectScript(src, options = {}) {
    const script = document.createElement('script');
    if (options.module) {
      script.type = 'module';
    }
    script.src = chrome.runtime.getURL(src);
    script.async = false;
    if (typeof options.onLoad === 'function') {
      script.onload = options.onLoad;
    }
    if (typeof options.onError === 'function') {
      script.onerror = options.onError;
    }
    (document.head || document.documentElement).prepend(script);
  }

  function postToPage(type, payload) {
    window.postMessage({
      __pseudodom: true,
      __push: true,
      type,
      payload,
    }, '*');
  }

  function flushPendingPushes() {
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
      postToPage('RUNTIME_MODEL', null);
      pendingClearModel = false;
    }
    if (featureExtractorReady) {
      postToPage('FEATURE_EXTRACTOR_READY', { ready: true });
      featureExtractorReady = false;
    }
  }

  // Relay wrapper messages to the background.
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (!event.data || event.data.__pseudodom !== true) return;

    const { type, payload } = event.data;

    if (type === 'WRAPPER_READY') {
      wrapperReady = true;
      flushPendingPushes();
      return;
    }

    if (type === 'PAGE_SIGNALS' || type === 'RUNTIME_MODEL' || type === 'FEATURE_EXTRACTOR_READY') {
      return;
    }

    chrome.runtime.sendMessage({ type, payload }, (response) => {
      window.postMessage({
        __pseudodom: true,
        __response: true,
        type: `${type}_RESPONSE`,
        payload: response,
      }, '*');
    });
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (!message || typeof message !== 'object') {
      return;
    }

    if (message.type === 'RUNTIME_MODEL') {
      pendingRuntimeModel = message.payload || null;
      flushPendingPushes();
      return;
    }

    if (message.type === 'CLEAR_RUNTIME_MODEL') {
      pendingRuntimeModel = null;
      pendingClearModel = true;
      flushPendingPushes();
    }
  });

  // Fetch background data. The wrapper receives it once it announces
  // WRAPPER_READY, so we do not lose the payload if the page loads fast.
  chrome.runtime.sendMessage({ type: 'GET_PAGE_SIGNALS' }, (signals) => {
    if (!signals) return;
    pendingPageSignals = signals;
    flushPendingPushes();
  });

  chrome.runtime.sendMessage({ type: 'GET_RUNTIME_MODEL' }, (bundle) => {
    if (!bundle) return;
    pendingRuntimeModel = bundle;
    flushPendingPushes();
  });

  injectScript('feature_extractor_runtime.js', {
    module: true,
    onLoad: () => {
      featureExtractorReady = true;
      flushPendingPushes();
    },
    onError: () => {
      featureExtractorReady = false;
    },
  });

  injectScript('injected_wrapper.js');
})();
