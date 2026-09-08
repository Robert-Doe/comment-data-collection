'use strict';

/**
 * ============================================================================
 *  src/domkeeper/classifyService.js
 * ============================================================================
 *
 * The DOM Keeper browser extension builds an inert mirror of each page it
 * visits and a trained random forest scores candidate regions on that mirror
 * for "is this user-generated content". That verdict is a PRIOR — it reads
 * structure only, never text.
 *
 * This service is the second opinion. Given the extension's candidate export
 * (`window.__DOM_KEEPER_CANDIDATES_JSON__()` output), it asks the Claude API
 * a sharper question: *will this region actually accumulate content that end
 * users type in — comments, replies, reviews, forum posts, Q&A answers — as
 * opposed to merely containing text that looks user-written?* The answer
 * decides where DOM Keeper should spend its hardening budget.
 *
 * Pure functions, no Express, no DB. `src/domkeeper/routes.js` wraps this in
 * a router; the Anthropic key comes from the caller (config), never hard-coded.
 *
 * Ported from the standalone prototype that briefly lived in the DOM Keeper
 * repo (`domkeeper.v3/server/lib/*`); this is now the single home.
 */

// ── The 81 keys from src/modeling/common/featureCatalog.js ────────────────
// (context keys analysis_source / blocker_type excluded — not useful to an
// LLM). Kept as a literal list so this file has no dependency on the modeling
// code and stays a self-contained relay.
const CATALOG_KEYS = [
  'tag_name', 'role_attribute', 'classes_count', 'data_attributes_count', 'aria_attributes_count',
  'node_depth', 'child_tag_variety', 'direct_child_count', 'repeating_group_count',
  'child_sig_id_group_count', 'child_xpath_star_group_count', 'xpath_star_group_count',
  'min_k_threshold_pass_3', 'min_k_threshold_pass_5', 'min_k_threshold_pass_8', 'min_k_threshold_pass_15',
  'sig_id_count_weak', 'sig_id_count_medium', 'sig_id_count_strong', 'sibling_homogeneity_score',
  'sig_id_recursive_nesting', 'reply_nesting_depth', 'text_word_count', 'text_char_count',
  'text_sentence_count', 'has_text_content', 'text_contains_links', 'link_density',
  'no_text_content_in_units', 'comment_header_with_count', 'attributes_contain_keywords',
  'keyword_container_high', 'keyword_text_high', 'keyword_text_med', 'keyword_direct_text_high',
  'keyword_attr_name_high', 'keyword_attr_value_high', 'keyword_unit_high_coverage',
  'submit_button_keyword_high', 'schema_org_comment_itemtype', 'aria_role_comment',
  'aria_role_feed_with_articles', 'microdata_itemprop_author', 'microdata_itemprop_date_published',
  'microdata_itemprop_text', 'json_ld_has_comment_type', 'json_ld_has_comment_action',
  'includes_author', 'has_avatar', 'author_avatar_coverage', 'profile_link_coverage',
  'author_timestamp_colocated', 'time_datetime_per_unit', 'has_relative_time',
  'reply_button_unit_coverage', 'reaction_coverage', 'edit_delete_coverage', 'has_nearby_textarea',
  'aligned_with_textarea', 'aligned_with_content_editable', 'submit_button_present',
  'collapse_expand_control', 'pagination_load_more_adjacent', 'table_row_structure',
  'add_to_cart_present', 'nav_header_ancestor', 'high_external_link_density',
  'external_link_density_low', 'star_rating_no_text', 'price_currency_in_unit',
  'candidate_has_script_tag', 'candidate_script_tag_count', 'candidate_has_mxss_sink',
  'candidate_mxss_sink_count', 'candidate_has_inline_event_handler',
  'candidate_has_javascript_protocol', 'candidate_has_embed_sink', 'candidate_embed_sink_count',
  'frame_count',
];

const ACTION_RANK = { ignore: 0, monitor: 1, purify: 2 };

// ── compaction ───────────────────────────────────────────────────────────

function truncate(str, n) {
  if (typeof str !== 'string') return '';
  const s = str.replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function pickFeatures(features) {
  const out = {};
  if (!features || typeof features !== 'object') return out;
  for (const k of CATALOG_KEYS) {
    if (!(k in features)) continue;
    const v = features[k];
    if (typeof v === 'number') out[k] = Number.isInteger(v) ? v : Math.round(v * 1000) / 1000;
    else if (typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'string' && v.length <= 40) out[k] = v;
  }
  return out;
}

/**
 * Shrink a raw candidate export to just what the model needs: identity, the
 * text sample, our own heuristic + verdict, and the 81 catalog features.
 *
 * @param {object} payload  raw __DOM_KEEPER_CANDIDATES_JSON__() output
 * @param {{ max?: number, sampleChars?: number }} [opts]
 * @returns {{ page: object, candidates: object[], dropped: number }}
 */
function compact(payload, opts = {}) {
  const max = Number.isFinite(opts.max) ? opts.max : 40;
  const sampleChars = Number.isFinite(opts.sampleChars) ? opts.sampleChars : 600;
  const src = Array.isArray(payload && payload.candidates) ? payload.candidates : [];

  // Rank by the strongest local signal so, if we have to drop some, we drop
  // the least interesting ones.
  const ranked = src
    .map((c) => {
      const p = c && c.verdict && typeof c.verdict.probability === 'number' ? c.verdict.probability : 0;
      const h = c && c.heuristic && typeof c.heuristic.score === 'number' ? c.heuristic.score : 0;
      return { c, rank: Math.max(p, Math.min(h / 20, 1)) };
    })
    .sort((a, b) => b.rank - a.rank);

  const kept = ranked.slice(0, max).map(({ c }) => {
    const h = c.heuristic || {};
    const v = c.verdict || {};
    return {
      seq: c.seq,
      tag: c.tag || (c.features && c.features.tag_name) || 'div',
      css: truncate(c.css || '', 200),
      unit_count: c.unit_count != null ? c.unit_count : null,
      sample_text: truncate(c.sample_text || '', sampleChars),
      local_heuristic: {
        score: h.score != null ? h.score : null,
        detected: Boolean(h.detected),
        ugc_type: h.ugc_type || null,
        matched_signals: Array.isArray(h.matched_signals) ? h.matched_signals.slice(0, 12) : [],
      },
      local_model: {
        probability: typeof v.probability === 'number' ? Math.round(v.probability * 1000) / 1000 : null,
        band: v.band || v.error || null,
      },
      features: pickFeatures(c.features),
    };
  });

  const page = {
    url: (payload && payload.url) || null,
    title: (payload && payload.title) || null,
    captured_at: (payload && payload.captured_at) || null,
    mirror_body_nodes: payload && payload.mirror_body_nodes != null ? payload.mirror_body_nodes : null,
    total_candidates: src.length,
    local_model_id: (payload && payload.model && payload.model.artifact_id) || null,
  };

  return { page, candidates: kept, dropped: Math.max(0, src.length - kept.length) };
}

// ── the prompt ───────────────────────────────────────────────────────────

const ASSESSMENT_TOOL = {
  name: 'report_candidate_assessments',
  description: 'Return one assessment object for every candidate region provided, keyed by its seq.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['assessments'],
    properties: {
      assessments: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['seq', 'will_host_user_comments', 'likelihood', 'recommended_action', 'reason'],
          properties: {
            seq: { type: 'integer', description: 'The candidate seq being assessed.' },
            will_host_user_comments: {
              type: 'boolean',
              description:
                'True if this region is a surface where end users submit and accumulate content (comments, replies, reviews, forum/board posts, Q&A answers, guestbook). False for author bios, tag lists, nav, captions, editorial body copy, product data, recommendation carousels, and other non-UGC text.',
            },
            likelihood: {
              type: 'number', minimum: 0, maximum: 1,
              description:
                'Calibrated probability that will_host_user_comments is true. Use the full range; 0.5 means genuinely uncertain.',
            },
            ugc_kind: {
              type: 'string',
              enum: ['comments', 'replies', 'reviews', 'forum', 'qa', 'ratings', 'social_feed', 'guestbook', 'none', 'unclear'],
              description: 'Best guess at the kind of UGC, or none/unclear.',
            },
            recommended_action: {
              type: 'string',
              enum: ['purify', 'monitor', 'ignore'],
              description:
                'purify = treat as an active injection sink and harden it now; monitor = plausible, keep watching; ignore = not a UGC sink.',
            },
            reason: {
              type: 'string',
              description: 'One or two sentences. Cite the concrete evidence (features or sample text).',
            },
          },
        },
      },
      page_summary: {
        type: 'string',
        description: 'One sentence: what this page is and where its real comment surface (if any) lives.',
      },
    },
  },
};

const SYSTEM_PROMPT = [
  'You are a web-structure analyst working inside DOM Keeper, a browser extension that defends against DOM-based XSS in user-generated content (UGC).',
  '',
  'DOM Keeper builds an inert mirror of each page and a trained model flags candidate regions that might be UGC containers. Your task: for each candidate, decide whether it is a place where END USERS submit content that accumulates over time — comments, replies, reviews, forum/board posts, Q&A answers, ratings with text, guestbook entries.',
  '',
  'Judge the CONTAINER, not the current text. The question is "can a stranger get markup rendered here by posting", not "does this contain prose".',
  '',
  'Count as UGC sinks:',
  '  - comment threads and reply trees under articles, videos, posts',
  '  - review / rating sections with free-text',
  '  - forum, message-board, and discussion threads',
  '  - Q&A answer lists, guestbooks, social-post reply lists',
  '',
  'Do NOT count:',
  '  - author bios, "about" blocks, staff cards',
  '  - tag lists, hashtag clouds, category chips',
  '  - editorial article body copy, pull quotes, captions',
  '  - navigation, headers, footers, cookie/consent UI',
  '  - product specs, price blocks, "add to cart"',
  '  - recommendation / "related" / "trending" carousels of links',
  '  - like/share counters with no text body',
  '',
  'Security posture: a MISSED comment sink (false negative) is worse than an over-cautious flag (false positive). When a region is a plausible comment surface and the evidence is mixed, lean toward "monitor", not "ignore". Reserve "purify" for regions you are confident are live UGC sinks.',
  '',
  'You are given: the same structural features the trained model uses, the raw visible text sample (the model cannot read text), the extension\'s heuristic signals, and the local model\'s own probability. Use the local model as a prior and correct it where the text or feature evidence disagrees.',
  '',
  'Return exactly one assessment per candidate via the report_candidate_assessments tool. No prose outside the tool call.',
].join('\n');

function buildRequest(compacted) {
  const userPayload = {
    page: compacted.page,
    note: compacted.dropped > 0
      ? `${compacted.dropped} lower-signal candidate(s) were omitted to fit the budget.`
      : undefined,
    candidates: compacted.candidates,
  };
  return {
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content:
        'Assess every candidate region below. Return one entry per candidate via the tool.\n\n' +
        '```json\n' + JSON.stringify(userPayload, null, 1) + '\n```',
    }],
    tools: [ASSESSMENT_TOOL],
    tool_choice: { type: 'tool', name: ASSESSMENT_TOOL.name },
  };
}

// ── the Claude call ──────────────────────────────────────────────────────

/**
 * @param {object} args  { apiKey, baseUrl, version, model, maxTokens,
 *                          timeoutMs, system, messages, tools, toolChoice }
 * @returns {Promise<{ toolInput: object|null, usage: object, stopReason: string, raw: object }>}
 */
async function callClaude(args) {
  const {
    apiKey, baseUrl, version, model, maxTokens, timeoutMs,
    system, messages, tools, toolChoice,
  } = args;

  if (!apiKey) {
    const err = new Error('Server is not configured with an ANTHROPIC_API_KEY.');
    err.statusCode = 503;
    throw err;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': version,
      },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages, tools, tool_choice: toolChoice }),
    });
  } catch (e) {
    clearTimeout(timer);
    const err = new Error(
      e.name === 'AbortError'
        ? `Claude API timed out after ${timeoutMs}ms`
        : `Could not reach the Claude API: ${e.message}`,
    );
    err.statusCode = 504;
    throw err;
  }
  clearTimeout(timer);

  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch (_) { body = { raw: text }; }

  if (!res.ok) {
    const err = new Error((body && body.error && body.error.message) || `Claude API returned ${res.status}`);
    err.statusCode = (res.status === 401 || res.status === 403) ? 502 : res.status;
    err.upstream = (body && body.error) || body;
    throw err;
  }

  const content = Array.isArray(body.content) ? body.content : [];
  const toolUse = content.find((b) => b.type === 'tool_use');
  return {
    raw: body,
    toolInput: toolUse ? toolUse.input : null,
    usage: body.usage || {},
    stopReason: body.stop_reason || null,
  };
}

// ── orchestration ────────────────────────────────────────────────────────

/**
 * @param {object} payload  the __DOM_KEEPER_CANDIDATES_JSON__() object
 * @param {object} cfg      { anthropicApiKey, anthropicBaseUrl, anthropicVersion,
 *                            model, maxOutputTokens, upstreamTimeoutMs,
 *                            maxCandidates, sampleTextChars }
 */
async function classifyCandidates(payload, cfg) {
  if (!payload || typeof payload !== 'object') {
    const e = new Error('Body must be a JSON object.'); e.statusCode = 400; throw e;
  }
  if (!Array.isArray(payload.candidates)) {
    const e = new Error('Body is missing a "candidates" array (send the output of __DOM_KEEPER_CANDIDATES_JSON__()).');
    e.statusCode = 400; throw e;
  }
  if (payload.candidates.length === 0) {
    return {
      model: cfg.model,
      page: { url: payload.url || null, title: payload.title || null },
      generated_at: new Date().toISOString(),
      assessments: [], purify_targets: [], monitor_targets: [],
      page_summary: 'No candidate regions were supplied.',
      dropped: 0, unanswered_seqs: [], usage: null,
    };
  }

  const compacted = compact(payload, { max: cfg.maxCandidates, sampleChars: cfg.sampleTextChars });
  const req = buildRequest(compacted);

  const result = await callClaude({
    apiKey: cfg.anthropicApiKey,
    baseUrl: cfg.anthropicBaseUrl,
    version: cfg.anthropicVersion || '2023-06-01',
    model: cfg.model,
    maxTokens: cfg.maxOutputTokens || 4096,
    timeoutMs: cfg.upstreamTimeoutMs || 90000,
    system: req.system,
    messages: req.messages,
    tools: req.tools,
    toolChoice: req.tool_choice,
  });

  const toolInput = result.toolInput || {};
  const rawAssessments = Array.isArray(toolInput.assessments) ? toolInput.assessments : [];

  const bySeq = new Map();
  for (const a of rawAssessments) {
    if (a && Number.isInteger(a.seq)) bySeq.set(a.seq, a);
  }
  const sentSeqs = new Set(compacted.candidates.map((c) => c.seq));

  const assessments = compacted.candidates.map((c) => {
    const a = bySeq.get(c.seq) || null;
    const likelihood = a && typeof a.likelihood === 'number'
      ? Math.min(1, Math.max(0, a.likelihood)) : null;
    return {
      seq: c.seq,
      tag: c.tag,
      css: c.css,
      local_model: c.local_model,
      local_heuristic_score: c.local_heuristic.score,
      answered: Boolean(a),
      will_host_user_comments: a ? Boolean(a.will_host_user_comments) : null,
      likelihood,
      ugc_kind: (a && a.ugc_kind) || null,
      recommended_action: (a && a.recommended_action) || null,
      reason: (a && a.reason) || null,
      combined_score: likelihood != null
        ? likelihood
        : (c.local_model && typeof c.local_model.probability === 'number' ? c.local_model.probability : null),
    };
  });

  const purifyTargets = assessments
    .filter((a) => a.recommended_action === 'purify')
    .map((a) => ({ seq: a.seq, css: a.css, likelihood: a.likelihood, reason: a.reason }));

  const monitorTargets = assessments
    .filter((a) => a.recommended_action === 'monitor')
    .map((a) => a.seq);

  return {
    model: cfg.model,
    page: compacted.page,
    generated_at: new Date().toISOString(),
    assessments: assessments.sort((x, y) =>
      (ACTION_RANK[y.recommended_action] || 0) - (ACTION_RANK[x.recommended_action] || 0) ||
      (y.combined_score || 0) - (x.combined_score || 0)),
    purify_targets: purifyTargets,
    monitor_targets: monitorTargets,
    page_summary: toolInput.page_summary || null,
    dropped: compacted.dropped,
    unanswered_seqs: [...sentSeqs].filter((s) => !bySeq.has(s)),
    stop_reason: result.stopReason,
    usage: result.usage,
  };
}

module.exports = {
  classifyCandidates,
  // exported for tests / reuse
  compact,
  buildRequest,
  callClaude,
  CATALOG_KEYS,
  SYSTEM_PROMPT,
  ASSESSMENT_TOOL,
};
