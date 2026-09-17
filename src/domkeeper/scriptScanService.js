'use strict';

/**
 * ============================================================================
 *  src/domkeeper/scriptScanService.js
 * ============================================================================
 *
 * A second DOM Keeper LLM relay, alongside classifyService.js — different
 * input, different question. classifyService asks "is this DISCOVERED
 * REGION user content?", reading the mirror's structural features (+ text,
 * in `full` mode). This one reads the page's OWN JAVASCRIPT SOURCE — the
 * client-side bundle a CSR/SPA app ships — and asks a static-analysis
 * question instead: *which id/className does this app's own code use for a
 * comment / review / rating / forum / Q&A container, whether or not that
 * container is rendering anything right now?*
 *
 * Point of it: a region discovered by reading rendered DOM structure
 * (classifyService) can only ever be RIGHT NOW correct — an empty comment
 * section, or one gated behind a "load more" / auth wall, has no structure
 * to discover yet. Reading the source that WILL render it doesn't have that
 * blind spot. The extension uses the answer to scope its (currently global)
 * protect-mode enforcement to just the named selectors, instead of every
 * flagged sink on the page — see docs/decisions/0022 in domkeeper-alternate.
 *
 * Extraction (which strings in a JS file are worth asking about at all)
 * happens CLIENT-SIDE, in the extension's background.js — this file never
 * sees a raw JS bundle, only the short, already-filtered snippet list. Same
 * division of labour as classifyService: the extension does discovery, the
 * server only relays a prompt. Keeps the payload small (a real bundle is
 * hundreds of KB to several MB; the snippet list is a few KB) and keeps
 * this file — like classifyService — a stateless relay with no access to
 * any labelled data.
 *
 * Provider calls reuse classifyService's callClaude/callOpenAI verbatim —
 * not duplicated here.
 */

const { callClaude, callOpenAI } = require('./classifyService');

// ── compaction (defence in depth — the client should already have capped
// this, but never trust it blindly) ────────────────────────────────────────

function truncate(str, n) {
  if (typeof str !== 'string') return '';
  const s = str.replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/**
 * @param {object} payload  { url, title, scripts: [{ src, snippets: [{ text, context }] }] }
 * @param {{ maxScripts?: number, maxSnippetsPerScript?: number, maxSnippetsTotal?: number }} [opts]
 */
function compact(payload, opts = {}) {
  const maxScripts = Number.isFinite(opts.maxScripts) ? opts.maxScripts : 25;
  const maxPerScript = Number.isFinite(opts.maxSnippetsPerScript) ? opts.maxSnippetsPerScript : 25;
  const maxTotal = Number.isFinite(opts.maxSnippetsTotal) ? opts.maxSnippetsTotal : 200;

  const srcScripts = Array.isArray(payload && payload.scripts) ? payload.scripts : [];
  let budget = maxTotal;
  let droppedScripts = 0;
  let droppedSnippets = 0;

  const scripts = [];
  for (const s of srcScripts.slice(0, maxScripts)) {
    if (budget <= 0) { droppedScripts += 1; continue; }
    const rawSnippets = Array.isArray(s && s.snippets) ? s.snippets : [];
    const kept = rawSnippets.slice(0, Math.min(maxPerScript, budget)).map((sn) => ({
      text: truncate((sn && sn.text) || '', 120),
      context: truncate((sn && sn.context) || '', 240),
    }));
    droppedSnippets += Math.max(0, rawSnippets.length - kept.length);
    if (!kept.length) continue;
    budget -= kept.length;
    scripts.push({ src: truncate((s && s.src) || '(inline)', 300), snippets: kept });
  }
  droppedScripts += Math.max(0, srcScripts.length - maxScripts);

  const page = {
    url: (payload && payload.url) || null,
    title: truncate((payload && payload.title) || '', 300),
    total_scripts_scanned: srcScripts.length,
  };

  return { page, scripts, dropped_scripts: droppedScripts, dropped_snippets: droppedSnippets };
}

// ── the prompt ───────────────────────────────────────────────────────────

const SCAN_TOOL = {
  name: 'report_script_ugc_candidates',
  description: 'Return one entry for every id/className/selector found in the scripts that plausibly names a UGC container, current or future.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['candidates'],
    properties: {
      candidates: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['selector_type', 'selector_value', 'ugc_kind', 'confidence', 'currently_rendered', 'reason'],
          properties: {
            selector_type: {
              type: 'string',
              enum: ['id', 'className', 'data-attribute', 'component_name', 'aria-role'],
              description: 'What kind of identifier selector_value is.',
            },
            selector_value: {
              type: 'string',
              description: 'The literal id / class name / data-attribute value / component name found in the source — exactly as it appears, so the extension can turn it into a CSS selector (#value, .value, [data-x="value"], …).',
            },
            source_script: {
              type: 'string',
              description: 'Which script src (or "(inline)") this was found in.',
            },
            ugc_kind: {
              type: 'string',
              enum: ['comments', 'replies', 'reviews', 'ratings', 'forum', 'qa', 'social_feed', 'guestbook', 'other_ugc'],
            },
            confidence: {
              type: 'number', minimum: 0, maximum: 1,
              description: 'Calibrated probability this selector names an element that end users can post content into.',
            },
            currently_rendered: {
              type: 'boolean',
              description: 'Best guess from the code: is this container in the normal render path (true), or gated behind a condition, lazy import, feature flag, auth wall, or "load more" (false) — a region that may only exist LATER.',
            },
            reason: {
              type: 'string',
              description: 'One sentence. Cite the concrete snippet/pattern that suggested this.',
            },
          },
        },
      },
      page_summary: {
        type: 'string',
        description: 'One sentence: what kind of app this looks like and where its UGC surfaces likely live.',
      },
    },
  },
};

const SYSTEM_PROMPT = [
  'You are a static-analysis assistant working inside DOM Keeper, a browser extension that defends against DOM-based XSS in user-generated content (UGC).',
  '',
  'You are given short snippets extracted from a page\'s OWN client-side JavaScript (a React/Vue/Svelte/webpack-bundled CSR app, typically) — NOT the rendered DOM. Each snippet is a string literal (an id, a className, a data-attribute value, or a component name) plus a little surrounding source context, already pre-filtered by a cheap keyword scan for comment/review/rating/thread/forum-shaped names — most noise is already gone, but false positives (a "review" that means a code review UI, a "rating" that\'s a star icon with no user input) still happen and you should say so via low confidence rather than omitting the row.',
  '',
  'Your task: for every candidate, decide whether the id/className/selector names an element where END USERS submit and accumulate content — comments, replies, reviews, ratings with free text, forum/board posts, Q&A answers, guestbook entries, social post replies.',
  '',
  'Critically, this is about the CODE, not the current page: a comment section that is empty right now, lazy-loaded, behind a login wall, or only rendered after a "Load N comments" click is EXACTLY the case this exists for — set currently_rendered:false but still report it with your real confidence. The whole point is catching a UGC sink before it ever renders, not just the ones already visible.',
  '',
  'Do NOT report: navigation/menu class names, generic layout classes (container, wrapper, flex, grid), analytics/tracking identifiers, ad-slot ids, build/chunk hashes with no semantic content, or a "review"/"rating" that context makes clearly non-UGC (code review tooling, a rating-limiter, a movie rating badge with no input).',
  '',
  'Security posture: a missed UGC sink is worse than an over-cautious one. When evidence is mixed, report it with a mid-range confidence rather than omitting it.',
  '',
  'Return every genuine candidate via the report_script_ugc_candidates tool. No prose outside the tool call.',
].join('\n');

function buildRequest(compacted) {
  const userPayload = {
    page: compacted.page,
    note: (compacted.dropped_scripts > 0 || compacted.dropped_snippets > 0)
      ? `${compacted.dropped_scripts} script(s) and ${compacted.dropped_snippets} snippet(s) were omitted to fit the budget.`
      : undefined,
    scripts: compacted.scripts,
  };
  return {
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content:
        'Here are the extracted id/className/selector candidates from this page\'s own scripts. Return one entry per genuine UGC-shaped candidate via the tool.\n\n' +
        '```json\n' + JSON.stringify(userPayload, null, 1) + '\n```',
    }],
    tools: [SCAN_TOOL],
    tool_choice: { type: 'tool', name: SCAN_TOOL.name },
  };
}

// ── orchestration (provider selection + race — same shape as
// classifyService's, kept separate on purpose: this file changes on a
// different schedule and duplicating ~40 lines of glue is cheaper than
// coupling the two relays' internals together) ─────────────────────────────

function summarizeProviderError(provider, err) {
  return { provider: provider.name, model: provider.model, status: err.statusCode || 500, message: err.message || 'Provider request failed.' };
}
function aggregateProviderError(errors) {
  const err = new Error('All configured DOM Keeper LLM providers failed: ' + errors.map((e) => `${e.provider}(${e.status}): ${e.message}`).join('; '));
  err.statusCode = errors[0] && errors[0].status ? errors[0].status : 502;
  err.providerErrors = errors;
  return err;
}

function configuredProviders(cfg, req) {
  const maxTokens = cfg.maxOutputTokens || 4096;
  const timeoutMs = cfg.upstreamTimeoutMs || 90000;
  const providerMode = String(cfg.providerMode || 'race').toLowerCase();
  const providers = [];

  if (cfg.anthropicApiKey && (providerMode === 'race' || providerMode === 'anthropic')) {
    const model = cfg.anthropicModel || 'claude-sonnet-5';
    providers.push({
      name: 'anthropic', model,
      call: (signal) => callClaude({
        apiKey: cfg.anthropicApiKey, baseUrl: cfg.anthropicBaseUrl || 'https://api.anthropic.com',
        version: cfg.anthropicVersion || '2023-06-01', model, maxTokens, timeoutMs,
        system: req.system, messages: req.messages, tools: req.tools, toolChoice: req.tool_choice, signal,
      }),
    });
  }
  if (cfg.openaiApiKey && (providerMode === 'race' || providerMode === 'openai')) {
    const model = cfg.openaiModel || 'gpt-4o-mini';
    providers.push({
      name: 'openai', model,
      call: (signal) => callOpenAI({
        apiKey: cfg.openaiApiKey, baseUrl: cfg.openaiBaseUrl || 'https://api.openai.com',
        organization: cfg.openaiOrganization, project: cfg.openaiProject, model, maxTokens, timeoutMs,
        system: req.system, messages: req.messages, signal,
      }),
    });
  }
  return { providerMode, providers };
}

function raceProviders(providers, providerMode) {
  if (!providers.length) {
    const err = new Error(
      providerMode === 'race'
        ? 'No DOM Keeper LLM provider is configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.'
        : `The requested DOM Keeper provider is not configured or is unavailable: ${providerMode}.`,
    );
    err.statusCode = 503;
    throw err;
  }
  const controllers = providers.map(() => new AbortController());
  const providerErrors = [];
  let pending = providers.length;
  let settled = false;

  return new Promise((resolve, reject) => {
    providers.forEach((provider, index) => {
      provider.call(controllers[index].signal)
        .then((result) => {
          if (settled) return;
          settled = true;
          controllers.forEach((c, i) => { if (i !== index) c.abort(); });
          resolve({ ...result, provider: result.provider || provider.name, model: result.model || provider.model, providerMode });
        })
        .catch((err) => {
          if (settled) return;
          providerErrors.push(summarizeProviderError(provider, err));
          pending -= 1;
          if (pending === 0) reject(aggregateProviderError(providerErrors));
        });
    });
  });
}

function buildScanResponse(compacted, result) {
  const toolInput = result.toolInput || {};
  const candidates = Array.isArray(toolInput.candidates) ? toolInput.candidates.map((c) => ({
    selector_type: c.selector_type,
    selector_value: c.selector_value,
    source_script: c.source_script || null,
    ugc_kind: c.ugc_kind || null,
    confidence: typeof c.confidence === 'number' ? Math.min(1, Math.max(0, c.confidence)) : null,
    currently_rendered: Boolean(c.currently_rendered),
    reason: c.reason || null,
  })) : [];
  candidates.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

  return {
    provider: result.provider,
    provider_mode: result.providerMode || 'race',
    model: result.model,
    generated_at: new Date().toISOString(),
    page: compacted.page,
    candidates,
    page_summary: toolInput.page_summary || null,
    dropped_scripts: compacted.dropped_scripts,
    dropped_snippets: compacted.dropped_snippets,
    stop_reason: result.stopReason,
    usage: result.usage,
  };
}

/**
 * @param {object} payload  { url, title, scripts: [{ src, snippets: [{text, context}] }] }
 * @param {object} cfg      same shape as classifyCandidates' cfg
 */
async function scanScripts(payload, cfg) {
  if (!payload || typeof payload !== 'object') {
    const e = new Error('Body must be a JSON object.'); e.statusCode = 400; throw e;
  }
  if (!Array.isArray(payload.scripts)) {
    const e = new Error('Body is missing a "scripts" array (client-side extracted snippets, not raw JS).');
    e.statusCode = 400; throw e;
  }
  if (payload.scripts.length === 0) {
    return {
      provider: null, provider_mode: cfg.providerMode || 'race', model: cfg.anthropicModel || cfg.openaiModel || 'claude-sonnet-5',
      generated_at: new Date().toISOString(),
      page: { url: payload.url || null, title: payload.title || null },
      candidates: [], page_summary: 'No candidate strings were extracted from this page\'s scripts.',
      dropped_scripts: 0, dropped_snippets: 0, usage: null,
    };
  }

  const compacted = compact(payload, { maxScripts: cfg.maxScripts, maxSnippetsPerScript: cfg.maxSnippetsPerScript, maxSnippetsTotal: cfg.maxSnippetsTotal });
  const req = buildRequest(compacted);
  const providerConfig = configuredProviders(cfg, req);
  const result = await raceProviders(providerConfig.providers, providerConfig.providerMode);
  return buildScanResponse(compacted, result);
}

module.exports = {
  scanScripts,
  // exported for tests / reuse
  compact,
  buildRequest,
  SYSTEM_PROMPT,
  SCAN_TOOL,
};
