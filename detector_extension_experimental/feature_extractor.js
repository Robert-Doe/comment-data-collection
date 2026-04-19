/**
 * feature_extractor.js
 *
 * Computes the full feature vector for a candidate DOM subgraph.
 *
 * This runs in the MAIN world (page JS context) against the live DOM,
 * supplemented by PseudoDOM structural data.
 *
 * Feature families implemented here match exactly the taxonomy in:
 *   brainstorm/002_ml_feature_selection_and_candidate_ranking.md
 *   brainstorm/007_feature_reference_and_output_schema.md
 *   brainstorm/004_ml_refinements_from_reference_detectors.md
 *
 * The output feature vector feeds:
 *   1. The heuristic UGC classifier (current)
 *   2. The ML logistic regression model (pending training)
 *   3. The training dataset export for labeling
 */

// ─── Keyword dictionaries ─────────────────────────────────────────────────────
// From brainstorm/004_ml_refinements_from_reference_detectors.md §1

const KW = {
  HIGH: new Set([
    'comment','comments','commenter','commentlist','comment-list',
    'commentthread','comment-thread','reply','replies','discussion',
    'thread','forum','review','reviews','answer','answers','feedback',
  ]),
  MED: new Set([
    'post','message','messages','response','conversation',
    'community','topic','reaction','remark','note',
  ]),
  LOW: new Set(['item','entry','block','card','unit','feed','list']),
};

// ─── Time patterns ─────────────────────────────────────────────────────────────
// From brainstorm/004_ml_refinements_from_reference_detectors.md §2

const RE_RELATIVE_TIME = /\b(just now|today|yesterday|\d+\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|week|weeks|mo|month|months|y|yr|year|years)\s*ago|(\d+)(s|m|h|d|w|mo|y)\b)/i;

const RE_ABSOLUTE_DATE = /\b(\d{4}[-\/]\d{2}[-\/]\d{2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s*\d{4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4})\b/i;

const TIMESTAMP_ATTRS = ['datetime','title','aria-label','data-time','data-date',
                         'data-timestamp','data-created','data-epoch','timeago'];

// ─── Action keyword patterns ───────────────────────────────────────────────────

const RE_REPLY     = /\b(reply|replies|respond|quote)\b/i;
const RE_REACT     = /\b(like|love|upvote|helpful|👍|react)\b/i;
const RE_SHARE     = /\b(share|permalink|link)\b/i;
const RE_REPORT    = /\b(report|flag|spam|abuse)\b/i;
const RE_EDIT_DEL  = /\b(edit|delete|remove|modify)\b/i;
const RE_AUTHOR    = /\b(author|commenter|user|poster|username|handle)\b/i;
const RE_AVATAR    = /avatar|profile.?(?:photo|image|pic)|headshot|userpic/i;
const RE_VERIFIED  = /verified|checkmark|badge|trusted/i;
const RE_PINNED    = /pinned|sticky|featured/i;
const RE_DELETED   = /deleted|removed|\\[deleted\\]|\\[removed\\]/i;
const RE_EDITED    = /edited|updated|modified/i;
const RE_MENTION   = /@\w+/;
const RE_HASHTAG   = /#\w+/;

// ─── Negative control patterns ─────────────────────────────────────────────────

const RE_PRICE        = /\$[\d,.]+|€[\d,.]+|£[\d,.]+|\b\d+\.\d{2}\b/;
const RE_ADD_TO_CART  = /add.to.cart|buy.now|add.to.bag|purchase/i;
const RE_NAV          = /\b(nav|navigation|breadcrumb|sitemap)\b/i;

/**
 * Extract the full feature vector for a single candidate element.
 *
 * @param {Element}  el           - the candidate root element in the live DOM
 * @param {object}   pseudoNode   - the corresponding PseudoNode from PseudoDOM
 * @param {object}   candidateMeta - { dominantFamilySize, homogeneity, dominantTemplate, ... }
 * @param {object}   pageSignals  - pre-parse signals from Layer 1
 * @returns {FeatureVector}
 */
export function extractFeatures(el, pseudoNode, candidateMeta, pageSignals) {
  const fv = {};

  // ── A. Structural identity and tree position ──────────────────────────────

  fv.tag_name         = (el.tagName || '').toLowerCase();
  fv.classes_count    = el.classList?.length || 0;
  fv.data_attributes_count = countAttributesByPrefix(el, 'data-');
  fv.aria_attributes_count = countAttributesByPrefix(el, 'aria-');
  fv.role_attribute   = el.getAttribute('role') || null;
  fv.node_depth       = pseudoNode?.depth ?? computeLiveDepth(el);
  fv.parent_index     = computeParentIndex(el);
  fv.sibling_count    = el.parentElement?.children.length || 0;
  fv.child_tag_variety = computeChildTagVariety(el);
  fv.direct_child_count = el.children.length;

  // ── B. Repetition, wildcard XPath, and sibling similarity ────────────────

  fv.repeating_group_count      = candidateMeta?.dominantFamilySize || 0;
  fv.sibling_homogeneity_score  = candidateMeta?.homogeneity || 0;
  fv.min_k_threshold_pass_3     = (candidateMeta?.dominantFamilySize || 0) >= 3;
  fv.min_k_threshold_pass_5     = (candidateMeta?.dominantFamilySize || 0) >= 5;
  fv.min_k_threshold_pass_8     = (candidateMeta?.dominantFamilySize || 0) >= 8;
  fv.min_k_threshold_pass_15    = (candidateMeta?.dominantFamilySize || 0) >= 15;
  fv.min_k_count                = candidateMeta?.dominantFamilySize || 0;
  fv.wildcard_xpath_template    = candidateMeta?.dominantTemplate || null;
  fv.dominant_sig_proportion    = candidateMeta?.homogeneity || 0;

  const nestingData             = computeNestingDepth(el);
  fv.reply_nesting_depth        = nestingData.replyDepth;
  fv.has_reply_nesting          = nestingData.replyDepth > 1;
  fv.recursive_nesting_depth    = nestingData.recursiveDepth;
  fv.sig_id_recursive_nesting   = nestingData.recursiveDepth > 1;
  fv.internal_depth             = nestingData.internalDepth;
  fv.internal_max_depth         = nestingData.maxDepth;
  fv.internal_tag_variety       = nestingData.tagVariety;
  fv.avg_unit_depth             = nestingData.avgUnitDepth;
  fv.internal_depth_filter_pass = nestingData.internalDepth >= 2;
  fv.depth_and_variety_pass     = fv.internal_depth_filter_pass && fv.internal_tag_variety >= 2;

  const indentData              = detectIndentPattern(el);
  fv.indent_margin_pattern      = indentData.present;
  fv.indented_unit_count        = indentData.count;
  fv.thread_depth_indicator     = indentData.hasDepthIndicator;
  fv.depth_indicator_unit_count = indentData.depthCount;

  // Additional repetition metrics required by the runtime model vectorizer.
  // xpath_star_group_count mirrors dominantFamilySize (the strongest repeated family).
  fv.xpath_star_group_count       = candidateMeta?.dominantFamilySize || 0;
  // child_sig_id_group_count: how many distinct direct-child tag families have >= 2 members.
  fv.child_sig_id_group_count     = computeChildSigGroupCount(el);
  // child_xpath_star_group_count: how many class+tag signature groups among direct children have >= 2 members.
  fv.child_xpath_star_group_count = computeChildXPathStarGroupCount(el);
  // Signature repetition tier flags (mirrors min_k thresholds from the backend feature extractor).
  fv.sig_id_count_weak            = (candidateMeta?.dominantFamilySize || 0) >= 3;
  fv.sig_id_count_medium          = (candidateMeta?.dominantFamilySize || 0) >= 5;
  fv.sig_id_count_strong          = (candidateMeta?.dominantFamilySize || 0) >= 8;

  // ── C. Keyword and semantic signals ───────────────────────────────────────

  const attrBlob                = buildAttributeBlob(el);
  fv.keyword_container_high     = hasKeyword(attrBlob, KW.HIGH);
  fv.keyword_container_med      = hasKeyword(attrBlob, KW.MED);
  fv.keyword_container_low      = hasKeyword(attrBlob, KW.LOW);
  fv.attributes_contain_keywords = fv.keyword_container_high || fv.keyword_container_med;

  // Granular keyword breakdown: attribute names vs. values (separate signals for the model).
  fv.keyword_attr_name_high  = hasKeywordInAttrNames(el, KW.HIGH);
  fv.keyword_attr_value_high = hasKeywordInAttrValues(el, KW.HIGH);

  const units                   = getRepeatedUnits(el);
  fv.unit_count                 = units.length;

  fv.keyword_unit_high          = units.some(u => hasKeyword(buildAttributeBlob(u), KW.HIGH));
  fv.keyword_unit_high_coverage = safeDivide(
    units.filter(u => hasKeyword(buildAttributeBlob(u), KW.HIGH)).length,
    units.length
  );

  const headerData              = detectCommentHeader(el);
  fv.comment_header_with_count  = headerData.present;
  fv.comment_header_count_value = headerData.value;

  fv.schema_org_comment_itemtype      = /(Comment|Review)/i.test(el.getAttribute('itemtype') || '');
  fv.schema_org_comment_count         = el.querySelectorAll('[itemtype*="Comment"],[itemtype*="Review"]').length;
  fv.aria_role_feed                   = el.getAttribute('role') === 'feed';
  fv.aria_role_feed_with_articles     = fv.aria_role_feed && el.querySelector('[role="article"]') !== null;
  fv.aria_role_feed_count             = el.querySelectorAll('[role="feed"]').length;
  fv.aria_role_comment                = el.getAttribute('role') === 'comment';
  fv.aria_role_comment_count          = el.querySelectorAll('[role="comment"]').length;
  fv.microdata_itemprop_author        = el.querySelector('[itemprop="author"]') !== null;
  fv.microdata_itemprop_author_count  = el.querySelectorAll('[itemprop="author"]').length;
  fv.microdata_itemprop_date_published = el.querySelector('[itemprop="datePublished"]') !== null;
  fv.microdata_itemprop_date_published_count = el.querySelectorAll('[itemprop="datePublished"]').length;
  fv.microdata_itemprop_text          = el.querySelector('[itemprop="text"]') !== null;
  fv.microdata_itemprop_text_count    = el.querySelectorAll('[itemprop="text"]').length;

  // ── D. Text and content statistics ────────────────────────────────────────

  const subtreeText             = el.textContent || '';
  const words                   = subtreeText.trim().split(/\s+/).filter(Boolean);
  fv.text_word_count            = words.length;
  fv.text_char_count            = subtreeText.length;
  fv.text_sentence_count        = (subtreeText.match(/[.!?]+/g) || []).length;
  fv.text_avg_word_length       = words.length > 0
    ? words.reduce((s, w) => s + w.length, 0) / words.length : 0;
  fv.has_text_content           = subtreeText.trim().length > 30;
  fv.total_text_length          = subtreeText.length;

  // Text-based keyword signals (subtree visible text, not attributes).
  const subtreeTextLower        = subtreeText.toLowerCase();
  fv.keyword_text_high          = hasKeyword(subtreeTextLower, KW.HIGH);
  fv.keyword_text_med           = hasKeyword(subtreeTextLower, KW.MED);
  // Direct-text: keywords in short text directly attached to the candidate root.
  fv.keyword_direct_text_high   = hasKeyword(getDirectText(el), KW.HIGH);

  fv.text_contains_mentions     = RE_MENTION.test(subtreeText);
  fv.mention_count              = (subtreeText.match(/@\w+/g) || []).length;
  fv.text_contains_hashtags     = RE_HASHTAG.test(subtreeText);
  fv.hashtag_count              = (subtreeText.match(/#\w+/g) || []).length;
  fv.text_contains_emoji        = /[\u{1F300}-\u{1FFFF}]/u.test(subtreeText);
  fv.emoji_count                = (subtreeText.match(/[\u{1F300}-\u{1FFFF}]/gu) || []).length;
  fv.text_question_mark_count   = (subtreeText.match(/\?/g) || []).length;
  fv.text_exclamation_count     = (subtreeText.match(/!/g) || []).length;

  const links                   = el.querySelectorAll('a[href]');
  fv.link_count                 = links.length;
  fv.link_density               = safeDivide(fv.link_count, Math.max(1, fv.text_word_count / 100));
  fv.text_contains_links        = fv.link_count > 0;
  const externalLinks           = [...links].filter(a => isExternalLink(a.href));
  fv.external_link_count        = externalLinks.length;
  fv.external_link_proportion   = safeDivide(fv.external_link_count, fv.link_count || 1);
  fv.high_external_link_density = fv.external_link_proportion > 0.5 && fv.link_count > 5;
  fv.external_link_density_low  = fv.external_link_proportion < 0.2;
  fv.total_link_count           = fv.link_count;

  const noTextUnits = units.filter(u => (u.textContent || '').trim().length < 10);
  fv.no_text_content_in_units   = noTextUnits.length > units.length * 0.7;
  fv.text_empty_unit_proportion = safeDivide(noTextUnits.length, units.length || 1);

  fv.quote_block_per_unit       = safeDivide(el.querySelectorAll('blockquote').length, units.length || 1);
  fv.units_with_blockquote      = units.filter(u => u.querySelector('blockquote')).length;
  fv.quote_coverage             = safeDivide(fv.units_with_blockquote, units.length || 1);

  fv.read_more_truncation       = el.querySelector('[class*="read-more"],[class*="expand"],[class*="see-more"]') !== null;
  fv.units_with_read_more       = units.filter(u =>
    u.querySelector('[class*="read-more"],[class*="expand"],[class*="see-more"]')
  ).length;

  // ── E. Time and chronology signals ────────────────────────────────────────

  const timeData                = computeTimeSignals(el, units);
  fv.has_relative_time          = timeData.hasRelative;
  fv.units_with_relative_time   = timeData.relativeCount;
  fv.relative_time_text_count   = timeData.relativeTextCount;
  fv.has_relative_time_text     = timeData.relativeTextCount > 0;
  fv.has_absolute_date_text     = timeData.hasAbsolute;
  fv.has_timestamp_attribute    = timeData.hasAttribute;
  fv.has_time_datetime_element  = timeData.hasTimeTag;
  fv.time_datetime_element_count = timeData.timeTagCount;
  fv.time_signal_coverage       = safeDivide(timeData.coveredUnits, units.length || 1);
  fv.time_datetime_per_unit     = safeDivide(timeData.timeTagCount, units.length || 1);

  fv.has_edit_history_indicator = RE_EDITED.test(subtreeText);
  fv.edited_unit_count          = units.filter(u => RE_EDITED.test(u.textContent || '')).length;
  fv.pinned_post_indicator      = RE_PINNED.test(subtreeText) ||
                                   el.querySelector('[class*="pin"],[class*="sticky"]') !== null;
  fv.deleted_placeholder_present = RE_DELETED.test(subtreeText);
  fv.deleted_placeholder_unit_count = units.filter(u => RE_DELETED.test(u.textContent || '')).length;

  // ── F. Author, avatar, and identity signals ────────────────────────────────

  const authorData              = computeAuthorSignals(el, units);
  fv.includes_author            = authorData.present;
  fv.author_element_count       = authorData.count;
  fv.has_avatar                 = el.querySelector('img') !== null &&
                                   RE_AVATAR.test(buildAttributeBlob(el.querySelector('img')));
  fv.avatar_img_count           = [...el.querySelectorAll('img')].filter(
    img => RE_AVATAR.test(buildAttributeBlob(img))
  ).length;
  fv.author_avatar_colocation   = authorData.colocationPresent;
  fv.author_avatar_colocation_unit_count = authorData.colocationCount;
  fv.author_avatar_coverage     = safeDivide(authorData.colocationCount, units.length || 1);
  fv.author_timestamp_colocated = authorData.authorTimestampColocation;
  fv.author_timestamp_unit_count = authorData.authorTimestampCount;
  fv.user_profile_link_per_unit = safeDivide(authorData.profileLinkCount, units.length || 1);
  fv.units_with_profile_link    = authorData.profileLinkCount;
  fv.profile_link_coverage      = safeDivide(authorData.profileLinkCount, units.length || 1);
  fv.verification_badge_present = RE_VERIFIED.test(subtreeText) ||
    el.querySelector('[class*="verif"],[class*="badge"],[aria-label*="verified"]') !== null;
  fv.verification_badge_count   = el.querySelectorAll('[class*="verif"],[class*="badge"]').length;

  // ── G. Per-unit action signals ─────────────────────────────────────────────

  const actionData              = computeActionSignals(el, units);
  fv.has_action_buttons         = actionData.hasAny;
  fv.action_button_count        = actionData.totalCount;
  fv.units_with_action_buttons  = actionData.unitsWithAny;
  fv.has_more_options_button    = el.querySelector('[aria-label*="more"],[aria-label*="options"],[class*="overflow"]') !== null;
  fv.more_options_button_count  = el.querySelectorAll('[aria-label*="more"],[aria-label*="options"],[class*="overflow"]').length;

  fv.reply_button_per_unit      = safeDivide(actionData.replyCount, units.length || 1);
  fv.reply_button_unit_coverage = safeDivide(actionData.unitsWithReply, units.length || 1);
  fv.report_flag_button_per_unit = safeDivide(actionData.reportCount, units.length || 1);
  fv.report_flag_unit_coverage  = safeDivide(actionData.unitsWithReport, units.length || 1);

  fv.reaction_count_per_unit    = safeDivide(actionData.reactionCount, units.length || 1);
  fv.units_with_reaction_count  = actionData.unitsWithReaction;
  fv.reaction_coverage          = safeDivide(actionData.unitsWithReaction, units.length || 1);

  fv.edit_delete_per_unit       = safeDivide(actionData.editDeleteCount, units.length || 1);
  fv.units_with_edit_delete     = actionData.unitsWithEditDelete;
  fv.edit_delete_coverage       = safeDivide(actionData.unitsWithEditDelete, units.length || 1);

  fv.share_button_per_unit      = safeDivide(actionData.shareCount, units.length || 1);
  fv.units_with_share           = actionData.unitsWithShare;
  fv.share_coverage             = safeDivide(actionData.unitsWithShare, units.length || 1);

  fv.upvote_downvote_pair       = actionData.hasVotePair;
  fv.units_with_vote_pair       = actionData.unitsWithVotePair;

  fv.permalink_per_unit         = safeDivide(actionData.permalinkCount, units.length || 1);
  fv.units_with_permalink       = actionData.unitsWithPermalink;

  fv.like_count_pattern         = actionData.hasLikeCount;
  fv.units_with_like_count      = actionData.unitsWithLikeCount;

  fv.spoiler_tag_present        = el.querySelector('[class*="spoiler"],[data-spoiler]') !== null;

  // ── H. Composer proximity signals ─────────────────────────────────────────

  const composerData            = computeComposerProximity(el);
  fv.ui_interactive_element_count = el.querySelectorAll('button,input,select,textarea,[role="button"]').length;
  fv.ui_form_count              = el.querySelectorAll('form').length;
  fv.ui_contenteditable_count   = el.querySelectorAll('[contenteditable="true"]').length;
  fv.has_nearby_textarea        = composerData.hasNearbyTextarea;
  fv.textarea_very_close        = composerData.distance <= 1;
  fv.textarea_close             = composerData.distance <= 3;
  fv.textarea_tree_proximity    = composerData.distance;
  fv.nearest_textarea_distance  = composerData.distance;
  fv.contenteditable_tree_proximity = composerData.ceDistance;
  fv.nearest_input_distance     = composerData.inputDistance;
  fv.aligned_with_textarea      = composerData.aligned;
  fv.aligned_with_content_editable = composerData.ceAligned;
  fv.submit_button_present      = composerData.hasSubmit;
  fv.char_counter_near_textarea = composerData.hasCharCounter;
  fv.collapse_expand_control    = el.querySelector('[class*="collapse"],[class*="expand"],[aria-expanded]') !== null;
  fv.pagination_load_more_adjacent = composerData.hasLoadMore;
  // Nearby submit/post/reply buttons that carry HIGH-confidence discussion keywords.
  fv.submit_button_keyword_high = detectSubmitButtonKeywords(el);

  // ── I. Negative control features ──────────────────────────────────────────

  fv.price_currency_in_unit     = RE_PRICE.test(subtreeText);
  fv.price_currency_unit_count  = units.filter(u => RE_PRICE.test(u.textContent || '')).length;
  fv.price_coverage             = safeDivide(fv.price_currency_unit_count, units.length || 1);
  fv.add_to_cart_present        = RE_ADD_TO_CART.test(subtreeText) ||
    el.querySelector('[class*="add-to-cart"],[class*="buy-now"]') !== null;
  fv.star_rating_present        = el.querySelector('[class*="star"],[class*="rating"],[aria-label*="star"]') !== null;
  fv.star_rating_no_text        = fv.star_rating_present && !fv.has_text_content;
  fv.table_row_structure        = el.querySelector('tr,td') !== null;
  fv.is_table_or_tbody          = ['table','tbody'].includes(fv.tag_name);
  fv.has_tr_children            = el.querySelector(':scope > tr') !== null;

  const navAncestor             = findNavAncestor(el);
  fv.nav_header_ancestor        = navAncestor !== null;
  fv.nav_header_ancestor_depth  = navAncestor ? navAncestor.depth : 0;

  // ── J. Page-global HTML signals (from pre-parse analyzer) ─────────────────

  const ps = pageSignals || {};
  fv.og_type                    = ps.og_type || null;
  fv.og_type_is_article         = ps.og_type_is_article || false;
  fv.og_type_is_profile         = ps.og_type_is_profile || false;
  fv.og_type_article_or_profile = fv.og_type_is_article || fv.og_type_is_profile;
  fv.schema_org_in_head_json_ld = ps.schema_org_in_head_json_ld || false;
  fv.json_ld_has_comment_type   = ps.json_ld_has_comment_type || false;
  fv.json_ld_has_interaction_counter = ps.json_ld_has_interaction_counter || false;
  fv.framework_react            = ps.framework_react || false;
  fv.framework_vue              = ps.framework_vue || false;
  fv.framework_angular          = ps.framework_angular || false;
  fv.framework_svelte           = ps.framework_svelte || false;
  fv.html_lang                  = ps.html_lang || null;
  fv.preload_avatar_image       = ps.preload_avatar_image || false;
  fv.preload_avatar_count       = ps.preload_avatar_count || 0;
  fv.csrf_token_in_form         = ps.csrf_token_in_form || false;
  fv.html_contains_comment_route = ps.html_contains_comment_route || false;
  fv.response_has_csp_header    = ps.has_csp || false;
  fv.response_csp_has_script_src = ps.csp_has_script_src || false;
  fv.response_csp_allows_unsafe_inline = ps.csp_allows_unsafe_inline || false;
  fv.response_csp_allows_unsafe_eval   = ps.csp_allows_unsafe_eval || false;

  // JSON-LD interaction/comment action signal (distinct from json_ld_has_comment_type).
  fv.json_ld_has_comment_action = ps.json_ld_has_comment_action || false;

  // ── K. Page-level context features ───────────────────────────────────────────

  // frame_count: number of frames visible on the page (iframes + main frame).
  // Training mean ≈ 1.75 (std 0.97), so most pages have 1–3 frames.
  fv.frame_count = document.querySelectorAll('iframe,frame').length + 1;

  // analysis_source: 'automated' matches the training distribution (backend Playwright scans).
  // Using this value keeps the model calibrated; the extension is also automated.
  fv.analysis_source = 'automated';

  // blocker_type: null normalises to '__missing__' in the vectorizer, which is the
  // dominant training value (most scanned pages had no blocker).
  fv.blocker_type = null;

  return fv;
}

// ─── Feature computation helpers ──────────────────────────────────────────────

function buildAttributeBlob(el) {
  if (!el || !el.attributes) return '';
  const parts = [(el.tagName || '').toLowerCase()];
  for (const attr of el.attributes) {
    parts.push(attr.name, attr.value);
  }
  // Short direct text (first text node only)
  for (const child of el.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      const t = (child.textContent || '').trim().slice(0, 80);
      if (t) parts.push(t);
      break;
    }
  }
  return parts.join(' ').toLowerCase();
}

function hasKeyword(blob, kwSet) {
  for (const kw of kwSet) {
    if (blob.includes(kw)) return true;
  }
  return false;
}

function safeDivide(a, b) {
  return b === 0 ? 0 : a / b;
}

function countAttributesByPrefix(el, prefix) {
  if (!el.attributes) return 0;
  let count = 0;
  for (const attr of el.attributes) {
    if (attr.name.startsWith(prefix)) count++;
  }
  return count;
}

function computeLiveDepth(el) {
  let depth = 0;
  let node = el;
  while (node.parentElement) { depth++; node = node.parentElement; }
  return depth;
}

function computeParentIndex(el) {
  if (!el.parentElement) return 0;
  return Array.from(el.parentElement.children).indexOf(el);
}

function computeChildTagVariety(el) {
  const tags = new Set();
  for (const child of el.children) tags.add(child.tagName);
  return tags.size;
}

function getRepeatedUnits(el) {
  if (!el.children || el.children.length < 3) return [];
  const tagGroups = new Map();
  for (const child of el.children) {
    const tag = child.tagName;
    if (!tagGroups.has(tag)) tagGroups.set(tag, []);
    tagGroups.get(tag).push(child);
  }
  const dominant = [...tagGroups.values()].sort((a, b) => b.length - a.length)[0];
  return dominant && dominant.length >= 3 ? dominant : [];
}

function computeNestingDepth(el) {
  let maxDepth = 0;
  let totalDepth = 0;
  let nodeCount = 0;
  const tagCounts = new Map();

  function walk(node, depth) {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    maxDepth = Math.max(maxDepth, depth);
    totalDepth += depth;
    nodeCount++;
    const tag = node.tagName;
    tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    for (const child of node.children) walk(child, depth + 1);
  }
  walk(el, 0);

  // Detect reply nesting: same-element repeated at increasing depth
  const units = getRepeatedUnits(el);
  let replyDepth = 0;
  for (const unit of units) {
    const nestedUnits = unit.querySelectorAll(units[0]?.tagName || 'div');
    if (nestedUnits.length > 0) replyDepth = Math.max(replyDepth, 2);
  }

  return {
    internalDepth:  maxDepth,
    maxDepth,
    tagVariety:     tagCounts.size,
    avgUnitDepth:   nodeCount > 0 ? totalDepth / nodeCount : 0,
    recursiveDepth: replyDepth,
    replyDepth,
  };
}

function detectIndentPattern(el) {
  const units = getRepeatedUnits(el);
  let count = 0;
  let hasDepthIndicator = false;
  let depthCount = 0;

  for (const unit of units) {
    const style = window.getComputedStyle(unit);
    const ml = parseFloat(style.marginLeft || '0');
    const pl = parseFloat(style.paddingLeft || '0');
    if (ml > 10 || pl > 10) count++;

    const depthEl = unit.querySelector('[class*="depth"],[class*="level"],[data-depth],[data-level]');
    if (depthEl) { hasDepthIndicator = true; depthCount++; }
  }

  return {
    present: count > 0,
    count,
    hasDepthIndicator,
    depthCount,
  };
}

function detectCommentHeader(el) {
  // Look for a sibling or nearby element with text like "34 Comments"
  const parent = el.parentElement;
  if (!parent) return { present: false, value: 0 };
  const siblings = [...parent.children];
  const idx = siblings.indexOf(el);
  const nearby = [...siblings.slice(Math.max(0, idx - 3), idx), ...siblings.slice(idx + 1, idx + 3)];
  for (const s of nearby) {
    const text = s.textContent || '';
    const m = text.match(/(\d[\d,]*)\s*(comment|reply|review|answer|discussion)/i);
    if (m) return { present: true, value: parseInt(m[1].replace(/,/g, ''), 10) };
  }
  return { present: false, value: 0 };
}

function computeTimeSignals(el, units) {
  const subtreeText = el.textContent || '';
  const timeEls = el.querySelectorAll('time[datetime]');
  let coveredUnits = 0;
  let relativeTextCount = 0;

  for (const unit of units) {
    const text = unit.textContent || '';
    const hasRel = RE_RELATIVE_TIME.test(text);
    const hasAbs = RE_ABSOLUTE_DATE.test(text);
    const hasTT  = unit.querySelector('time[datetime]') !== null;
    const hasAttr = TIMESTAMP_ATTRS.some(attr => unit.querySelector(`[${attr}]`) !== null);

    if (hasRel || hasAbs || hasTT || hasAttr) coveredUnits++;
    if (hasRel) relativeTextCount++;
  }

  return {
    hasRelative:       RE_RELATIVE_TIME.test(subtreeText),
    relativeCount:     units.filter(u => RE_RELATIVE_TIME.test(u.textContent || '')).length,
    relativeTextCount,
    hasAbsolute:       RE_ABSOLUTE_DATE.test(subtreeText),
    hasTimeTag:        timeEls.length > 0,
    timeTagCount:      timeEls.length,
    hasAttribute:      TIMESTAMP_ATTRS.some(attr => el.querySelector(`[${attr}]`) !== null),
    coveredUnits,
  };
}

function computeAuthorSignals(el, units) {
  const authorEls = el.querySelectorAll('[itemprop="author"],[rel="author"],[class*="author"],[class*="user-name"],[class*="username"]');
  let colocationCount = 0;
  let authorTimestampCount = 0;
  let profileLinkCount = 0;

  for (const unit of units) {
    const hasAuthor = unit.querySelector('[itemprop="author"],[rel="author"],[class*="author"]') !== null ||
                      RE_AUTHOR.test(buildAttributeBlob(unit));
    const hasAvatar = [...unit.querySelectorAll('img')].some(img => RE_AVATAR.test(buildAttributeBlob(img)));
    const hasTime   = unit.querySelector('time[datetime]') !== null || RE_RELATIVE_TIME.test(unit.textContent || '');
    const hasProfileLink = unit.querySelector('a[href*="/user/"],a[href*="/profile/"],a[href*="/@"]') !== null;

    if (hasAuthor && hasAvatar) colocationCount++;
    if (hasAuthor && hasTime)   authorTimestampCount++;
    if (hasProfileLink)         profileLinkCount++;
  }

  return {
    present:               authorEls.length > 0,
    count:                 authorEls.length,
    colocationPresent:     colocationCount > 0,
    colocationCount,
    authorTimestampColocation: authorTimestampCount > 0,
    authorTimestampCount,
    profileLinkCount,
  };
}

function computeActionSignals(el, units) {
  const buttons = (el, re) => {
    const btns = el.querySelectorAll('button,[role="button"],a');
    return [...btns].filter(b =>
      re.test(b.textContent || b.getAttribute('aria-label') || b.title || '')
    );
  };

  const allReply       = buttons(el, RE_REPLY);
  const allReport      = buttons(el, RE_REPORT);
  const allReact       = buttons(el, RE_REACT);
  const allShare       = buttons(el, RE_SHARE);
  const allEditDel     = buttons(el, RE_EDIT_DEL);
  const allPermalink   = el.querySelectorAll('a[href*="#comment"],a[href*="/comment/"],a[aria-label*="permalink"]');

  const unitsWithReply    = units.filter(u => buttons(u, RE_REPLY).length > 0).length;
  const unitsWithReport   = units.filter(u => buttons(u, RE_REPORT).length > 0).length;
  const unitsWithReaction = units.filter(u => buttons(u, RE_REACT).length > 0).length;
  const unitsWithShare    = units.filter(u => buttons(u, RE_SHARE).length > 0).length;
  const unitsWithEditDel  = units.filter(u => buttons(u, RE_EDIT_DEL).length > 0).length;

  const votePairUnits = units.filter(u => {
    const hasUp   = buttons(u, /upvote|\+1|▲/i).length > 0;
    const hasDown = buttons(u, /downvote|-1|▼/i).length > 0;
    return hasUp && hasDown;
  });

  const likeCountUnits = units.filter(u => {
    return /\d+\s*(like|loves?|👍)/i.test(u.textContent || '');
  });

  const permalinkUnits = units.filter(u =>
    u.querySelector('a[href*="#comment"],a[href*="/comment/"]') !== null
  );

  return {
    hasAny:            allReply.length + allReport.length + allReact.length > 0,
    totalCount:        allReply.length + allReport.length + allReact.length + allShare.length + allEditDel.length,
    unitsWithAny:      units.filter(u => buttons(u, /reply|report|like|share/i).length > 0).length,
    replyCount:        allReply.length,
    unitsWithReply,
    reportCount:       allReport.length,
    unitsWithReport,
    reactionCount:     allReact.length,
    unitsWithReaction,
    shareCount:        allShare.length,
    unitsWithShare,
    editDeleteCount:   allEditDel.length,
    unitsWithEditDel,
    hasVotePair:       votePairUnits.length > 0,
    unitsWithVotePair: votePairUnits.length,
    hasLikeCount:      likeCountUnits.length > 0,
    unitsWithLikeCount: likeCountUnits.length,
    permalinkCount:    allPermalink.length,
    unitsWithPermalink: permalinkUnits.length,
  };
}

function computeComposerProximity(el) {
  const parent = el.parentElement;
  if (!parent) return { hasNearbyTextarea: false, distance: 99, ceDistance: 99, inputDistance: 99 };

  const siblings = [...parent.children];
  const idx = siblings.indexOf(el);
  const nearby = siblings.slice(Math.max(0, idx - 4), idx + 5);

  let minTextareaDistance = 99;
  let minCEDistance = 99;
  let minInputDistance = 99;
  let hasSubmit = false;
  let hasCharCounter = false;
  let hasLoadMore = false;

  for (let i = 0; i < nearby.length; i++) {
    const s = nearby[i];
    const dist = Math.abs(i - (idx - Math.max(0, idx - 4)));

    if (s.querySelector('textarea') || s.tagName === 'TEXTAREA') {
      minTextareaDistance = Math.min(minTextareaDistance, dist);
    }
    if (s.querySelector('[contenteditable="true"]') || s.getAttribute('contenteditable') === 'true') {
      minCEDistance = Math.min(minCEDistance, dist);
    }
    if (s.querySelector('input[type="text"],input[type="search"]')) {
      minInputDistance = Math.min(minInputDistance, dist);
    }
    if (s.querySelector('button[type="submit"],[class*="submit"],[class*="post-btn"],[class*="send-btn"]')) {
      hasSubmit = true;
    }
    if (s.querySelector('[class*="char-count"],[class*="character-count"],[class*="char-counter"]')) {
      hasCharCounter = true;
    }
    if (s.querySelector('[class*="load-more"],[class*="show-more"],[class*="pagination"]')) {
      hasLoadMore = true;
    }
  }

  return {
    hasNearbyTextarea: minTextareaDistance < 4,
    distance:          minTextareaDistance,
    ceDistance:        minCEDistance,
    inputDistance:     minInputDistance,
    aligned:           minTextareaDistance <= 1,
    ceAligned:         minCEDistance <= 1,
    hasSubmit,
    hasCharCounter,
    hasLoadMore,
  };
}

function isExternalLink(href) {
  try {
    const url = new URL(href);
    return url.hostname !== window.location.hostname;
  } catch (_) {
    return false;
  }
}

function findNavAncestor(el) {
  const navTags = new Set(['NAV','HEADER','FOOTER']);
  let node = el.parentElement;
  let depth = 0;
  while (node && depth < 10) {
    if (navTags.has(node.tagName)) return { el: node, depth };
    if (RE_NAV.test((node.getAttribute('class') || '') + ' ' + (node.getAttribute('role') || ''))) {
      return { el: node, depth };
    }
    node = node.parentElement;
    depth++;
  }
  return null;
}

// ─── Helpers added for runtime-model feature parity ──────────────────────────

/**
 * Returns lowercased short text taken directly from the candidate root's own
 * text nodes (not from descendants). Used for keyword_direct_text_high.
 */
function getDirectText(el) {
  const parts = [];
  for (const child of el.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      const t = (child.textContent || '').trim();
      if (t) parts.push(t);
    }
  }
  return parts.join(' ').slice(0, 200).toLowerCase();
}

/**
 * Returns true if any attribute NAME on el contains a keyword from kwSet.
 * Used for keyword_attr_name_high.
 */
function hasKeywordInAttrNames(el, kwSet) {
  if (!el || !el.attributes) return false;
  for (const attr of el.attributes) {
    const n = attr.name.toLowerCase();
    for (const kw of kwSet) {
      if (n.includes(kw)) return true;
    }
  }
  return false;
}

/**
 * Returns true if any attribute VALUE on el contains a keyword from kwSet.
 * Used for keyword_attr_value_high.
 */
function hasKeywordInAttrValues(el, kwSet) {
  if (!el || !el.attributes) return false;
  for (const attr of el.attributes) {
    const v = attr.value.toLowerCase();
    for (const kw of kwSet) {
      if (v.includes(kw)) return true;
    }
  }
  return false;
}

/**
 * Returns how many distinct direct-child tag families contain >= 2 members.
 * Approximates the backend's child_sig_id_group_count.
 */
function computeChildSigGroupCount(el) {
  if (!el || !el.children) return 0;
  const tagGroups = new Map();
  for (const child of el.children) {
    const tag = child.tagName;
    tagGroups.set(tag, (tagGroups.get(tag) || 0) + 1);
  }
  let count = 0;
  for (const n of tagGroups.values()) {
    if (n >= 2) count++;
  }
  return count;
}

/**
 * Returns how many distinct class+tag signature groups among direct children
 * contain >= 2 members.  Approximates child_xpath_star_group_count.
 */
function computeChildXPathStarGroupCount(el) {
  if (!el || !el.children) return 0;
  const sigGroups = new Map();
  for (const child of el.children) {
    const classes = [...(child.classList || [])].sort().join('.');
    const sig = (child.tagName || '') + ':' + classes;
    sigGroups.set(sig, (sigGroups.get(sig) || 0) + 1);
  }
  let count = 0;
  for (const n of sigGroups.values()) {
    if (n >= 2) count++;
  }
  return count;
}

/**
 * Returns true when nearby submit/post/send/reply buttons carry at least one
 * HIGH-confidence discussion keyword.  Used for submit_button_keyword_high.
 */
function detectSubmitButtonKeywords(el) {
  const selectors = [
    'button[type="submit"]',
    'input[type="submit"]',
    '[class*="submit"]',
    '[class*="post-btn"]',
    '[class*="send-btn"]',
    '[class*="reply-btn"]',
  ];
  const candidates = [
    ...el.querySelectorAll(selectors.join(',')),
  ];
  // Also check siblings/parent for a composer submit button
  const parent = el.parentElement;
  if (parent) {
    candidates.push(
      ...parent.querySelectorAll('button[type="submit"],input[type="submit"]')
    );
  }
  for (const btn of candidates) {
    const text = (
      (btn.textContent  || '') + ' ' +
      (btn.value        || '') + ' ' +
      (btn.getAttribute('aria-label') || '') + ' ' +
      (btn.getAttribute('title')      || '')
    ).toLowerCase();
    for (const kw of KW.HIGH) {
      if (text.includes(kw)) return true;
    }
  }
  return false;
}
