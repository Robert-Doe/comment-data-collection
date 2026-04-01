/**
 * pre_parse_analyzer.js
 *
 * Layer 1 — Pre-parse signal extraction.
 *
 * Extracts UGC-relevant signals from HTTP response headers and,
 * when available via CDP, from the raw HTML body before parsing.
 *
 * Signal families extracted here feed into the UGC classifier
 * as page-level priors that bias candidate scoring.
 *
 * Reference: paper/003_system_architecture.md §2 (Layer 1)
 *            brainstorm/002_ml_feature_selection_and_candidate_ranking.md
 *            (Page-global HTML features section)
 */

export const PreParseAnalyzer = {

  /**
   * Extract signals from webRequest onHeadersReceived response headers.
   * This runs in the background service worker.
   *
   * @param {chrome.webRequest.HttpHeader[]} headers
   * @param {string} url
   * @returns {PageSignals}
   */
  fromHeaders(headers, url) {
    const signals = emptySignals();
    signals.url = url;

    for (const header of (headers || [])) {
      const name  = (header.name  || '').toLowerCase();
      const value = (header.value || '');

      switch (name) {
        case 'content-security-policy':
          signals.has_csp             = true;
          signals.csp_has_script_src  = /script-src/i.test(value);
          signals.csp_allows_unsafe_inline = /unsafe-inline/i.test(value);
          signals.csp_allows_unsafe_eval   = /unsafe-eval/i.test(value);
          signals.csp_has_trusted_types    = /trusted-types/i.test(value);
          signals.csp_raw               = value.slice(0, 500);
          break;

        case 'content-type':
          signals.content_type = value.split(';')[0].trim();
          signals.is_html      = /text\/html/i.test(value);
          break;

        case 'x-powered-by':
          signals.x_powered_by = value.slice(0, 100);
          break;

        case 'server':
          signals.server_header = value.slice(0, 100);
          break;

        case 'x-frame-options':
          signals.has_x_frame_options = true;
          break;

        case 'permissions-policy':
          signals.has_permissions_policy = true;
          break;
      }
    }

    return signals;
  },

  /**
   * Extract signals from a CDP Network.responseReceived event.
   * Richer than webRequest because it includes the full headers object.
   *
   * @param {object} cdpParams - CDP Network.responseReceived params
   * @returns {Partial<PageSignals>}
   */
  fromCDPResponse(cdpParams) {
    const { response } = cdpParams;
    if (!response) return {};

    const headers = response.headers || {};
    const normalizedHeaders = Object.entries(headers).map(
      ([name, value]) => ({ name: name.toLowerCase(), value })
    );

    return this.fromHeaders(normalizedHeaders, response.url);
  },

  /**
   * Extract signals from raw HTML body text (available in CDP scanning mode).
   * Called after we have the full HTML string before the browser parses it.
   *
   * @param {string} html - raw HTML response body
   * @param {string} url
   * @returns {Partial<PageSignals>}
   */
  fromHTMLBody(html, url) {
    const signals = {};

    if (!html || typeof html !== 'string') return signals;

    // ── Open Graph signals ──────────────────────────────────────────────────
    const ogTypeMatch = html.match(/<meta[^>]+property=["']og:type["'][^>]+content=["']([^"']+)["']/i)
                     || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:type["']/i);
    if (ogTypeMatch) {
      signals.og_type             = ogTypeMatch[1].toLowerCase();
      signals.og_type_is_article  = signals.og_type === 'article';
      signals.og_type_is_profile  = signals.og_type === 'profile';
    }

    // ── JSON-LD hints ───────────────────────────────────────────────────────
    const jsonLdBlocks = [...html.matchAll(
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    )];
    for (const block of jsonLdBlocks) {
      const text = block[1];
      if (/Comment|Review|DiscussionForumPosting/i.test(text)) {
        signals.json_ld_has_comment_type = true;
      }
      if (/commentCount|InteractionCounter/i.test(text)) {
        signals.json_ld_has_interaction_counter = true;
      }
    }

    // ── Framework fingerprints ──────────────────────────────────────────────
    signals.framework_react   = /react|__NEXT_DATA__|next\.js/i.test(html.slice(0, 4000));
    signals.framework_vue     = /vue\.js|__vue__|nuxt/i.test(html.slice(0, 4000));
    signals.framework_angular = /ng-version|angular\.js/i.test(html.slice(0, 4000));
    signals.framework_svelte  = /svelte/i.test(html.slice(0, 4000));

    // ── Comment-route hints in scripts ─────────────────────────────────────
    signals.html_contains_comment_route = /\/comments|\/replies|\/reviews|comment[-_]api/i.test(html);

    // ── Page language ───────────────────────────────────────────────────────
    const langMatch = html.match(/<html[^>]+lang=["']([^"']+)["']/i);
    if (langMatch) signals.html_lang = langMatch[1];

    // ── CSRF token presence ─────────────────────────────────────────────────
    signals.csrf_token_in_form = /_token|csrf|authenticity_token/i.test(html);

    // ── Avatar preload hints ────────────────────────────────────────────────
    const preloads = [...html.matchAll(/<link[^>]+rel=["']preload["'][^>]+>/gi)];
    signals.preload_avatar_count = preloads.filter(m =>
      /avatar|profile|user.?photo/i.test(m[0])
    ).length;
    signals.preload_avatar_image = signals.preload_avatar_count > 0;

    // ── Schema.org in head ──────────────────────────────────────────────────
    signals.schema_org_in_head_json_ld = /"@context"\s*:\s*"https?:\/\/schema\.org"/i.test(html);

    return signals;
  },
};

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} PageSignals
 * Pre-parse signals extracted from network response headers and HTML body.
 * These are page-level priors that bias UGC candidate scoring.
 */
function emptySignals() {
  return {
    url:                          null,
    content_type:                 null,
    is_html:                      false,

    // CSP
    has_csp:                      false,
    csp_has_script_src:           false,
    csp_allows_unsafe_inline:     false,
    csp_allows_unsafe_eval:       false,
    csp_has_trusted_types:        false,
    csp_raw:                      null,

    // Server headers
    x_powered_by:                 null,
    server_header:                null,
    has_x_frame_options:          false,
    has_permissions_policy:       false,

    // Open Graph
    og_type:                      null,
    og_type_is_article:           false,
    og_type_is_profile:           false,

    // JSON-LD
    json_ld_has_comment_type:     false,
    json_ld_has_interaction_counter: false,

    // Framework
    framework_react:              false,
    framework_vue:                false,
    framework_angular:            false,
    framework_svelte:             false,

    // Content hints
    html_contains_comment_route:  false,
    html_lang:                    null,
    csrf_token_in_form:           false,
    preload_avatar_image:         false,
    preload_avatar_count:         0,
    schema_org_in_head_json_ld:   false,
  };
}
