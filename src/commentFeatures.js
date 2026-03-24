'use strict';

const descendantCache = new WeakMap();
const childCache = new WeakMap();
const textCache = new WeakMap();
const signatureCache = new WeakMap();
const sigIdCache = new WeakMap();
const xpathCache = new WeakMap();
const dominantGroupCache = new WeakMap();

function classString(el) {
  if (!el || !('className' in el)) return '';
  if (typeof el.className === 'string') return el.className;
  if (el.className && typeof el.className.baseVal === 'string') return el.className.baseVal;
  return '';
}

function attrText(el) {
  if (!el || el.nodeType !== 1) return '';
  return [
    classString(el),
    el.id || '',
    el.getAttribute('role') || '',
    el.getAttribute('aria-label') || '',
    el.getAttribute('itemtype') || '',
    el.getAttribute('data-testid') || '',
  ]
    .filter(Boolean)
    .join(' ')
    .trim();
}

function normalizeSpace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function directChildren(root) {
  if (!root || !root.children) return [];
  if (childCache.has(root)) return childCache.get(root);
  const children = Array.from(root.children || []);
  childCache.set(root, children);
  return children;
}

function allDescendants(root) {
  if (!root || !root.querySelectorAll) return [];
  if (descendantCache.has(root)) return descendantCache.get(root);
  let descendants = [];
  try {
    descendants = Array.from(root.querySelectorAll('*'));
  } catch (_) {
    descendants = [];
  }
  descendantCache.set(root, descendants);
  return descendants;
}

function textOf(el) {
  if (!el) return '';
  if (textCache.has(el)) return textCache.get(el);
  const value = normalizeSpace(el.textContent || '');
  textCache.set(el, value);
  return value;
}

function allTextNodes(root) {
  if (!root || !root.ownerDocument || !root.ownerDocument.createTreeWalker) {
    return [textOf(root)];
  }
  const walker = root.ownerDocument.createTreeWalker(root, 4, null, false);
  const texts = [];
  let node;
  while ((node = walker.nextNode())) {
    const value = normalizeSpace(node.nodeValue || '');
    if (value) texts.push(value);
  }
  return texts;
}

function structuralSignature(el) {
  if (!el || el.nodeType !== 1) return 'unknown[]';
  if (signatureCache.has(el)) return signatureCache.get(el);
  const tag = el.tagName ? el.tagName.toLowerCase() : 'unknown';
  const childTags = directChildren(el)
    .map((child) => (child.tagName ? child.tagName.toLowerCase() : 'unknown'))
    .filter(Boolean)
    .sort();
  const signature = `${tag}[${childTags.join(',')}]`;
  signatureCache.set(el, signature);
  return signature;
}

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(i);
    hash |= 0;
  }
  return String(hash >>> 0);
}

function sigId(el) {
  if (!el || el.nodeType !== 1) return '';
  if (sigIdCache.has(el)) return sigIdCache.get(el);
  const value = hashString(structuralSignature(el));
  sigIdCache.set(el, value);
  return value;
}

function getXPath(el) {
  if (!el || el.nodeType !== 1) return '';
  if (xpathCache.has(el)) return xpathCache.get(el);
  const parts = [];
  let node = el;
  while (node && node.nodeType === 1) {
    let index = 1;
    let sibling = node.previousElementSibling;
    while (sibling) {
      if (sibling.tagName === node.tagName) index += 1;
      sibling = sibling.previousElementSibling;
    }
    const tag = node.tagName.toLowerCase();
    parts.unshift(index > 1 ? `${tag}[${index}]` : tag);
    node = node.parentElement;
  }
  const value = `/${parts.join('/')}`;
  xpathCache.set(el, value);
  return value;
}

function getCssPath(el) {
  if (!el || el.nodeType !== 1) return '';
  const parts = [];
  let node = el;
  while (node && node.nodeType === 1 && node.tagName !== 'HTML') {
    let part = node.tagName.toLowerCase();
    if (node.id) {
      part += `#${node.id}`;
      parts.unshift(part);
      break;
    }

    const siblings = node.parentElement
      ? Array.from(node.parentElement.children).filter((sibling) => sibling.tagName === node.tagName)
      : [];
    if (siblings.length > 1) {
      part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
    }
    parts.unshift(part);
    node = node.parentElement;
  }
  return parts.join(' > ');
}

function nodeDepth(el, stopAt) {
  let depth = 0;
  let node = el;
  while (node && node.parentElement && node !== stopAt) {
    depth += 1;
    node = node.parentElement;
  }
  return depth;
}

function maxSubtreeDepth(root) {
  let maxDepth = 0;

  function visit(node, depth) {
    if (depth > maxDepth) maxDepth = depth;
    directChildren(node).forEach((child) => visit(child, depth + 1));
  }

  visit(root, 0);
  return maxDepth;
}

function distinctTagCount(root) {
  const tags = new Set();
  if (root && root.tagName) tags.add(root.tagName.toLowerCase());
  allDescendants(root).forEach((el) => {
    if (el.tagName) tags.add(el.tagName.toLowerCase());
  });
  return tags.size;
}

function treeDistance(a, b) {
  if (!a || !b) return Infinity;
  const distances = new Map();
  let node = a;
  let distance = 0;
  while (node && node.nodeType === 1) {
    distances.set(node, distance);
    node = node.parentElement;
    distance += 1;
  }

  node = b;
  distance = 0;
  while (node && node.nodeType === 1) {
    if (distances.has(node)) {
      return distance + distances.get(node);
    }
    node = node.parentElement;
    distance += 1;
  }

  return Infinity;
}

function groupBySigId(elements) {
  const groups = new Map();
  elements.forEach((el) => {
    const id = sigId(el);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(el);
  });
  return groups;
}

function dominantChildGroup(root) {
  if (!root || root.nodeType !== 1) return null;
  if (dominantGroupCache.has(root)) return dominantGroupCache.get(root);

  const children = directChildren(root);
  if (!children.length) {
    dominantGroupCache.set(root, null);
    return null;
  }

  const groups = groupBySigId(children);
  let best = null;
  groups.forEach((elements, groupSigId) => {
    if (!best || elements.length > best.elements.length) {
      best = { sigId: groupSigId, elements };
    }
  });

  dominantGroupCache.set(root, best);
  return best;
}

function getDominantUnits(root) {
  return dominantChildGroup(root)?.elements || [];
}

function ratio(numerator, denominator) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 1000) / 1000;
}

function feat_tag_name(root) {
  return { tag_name: root.tagName ? root.tagName.toLowerCase() : '' };
}

function feat_classes(root) {
  const classes = classString(root)
    .split(/\s+/)
    .map((value) => value.trim())
    .filter(Boolean);
  return {
    classes,
    classes_count: classes.length,
  };
}

function feat_attributes_data_aria_role(root) {
  const attrs = Array.from(root.attributes || []);
  const dataAttrs = attrs
    .filter((attr) => attr.name.startsWith('data-'))
    .map((attr) => `${attr.name}=${attr.value}`);
  const ariaAttrs = attrs
    .filter((attr) => attr.name.startsWith('aria-'))
    .map((attr) => `${attr.name}=${attr.value}`);
  const role = root.getAttribute('role') || '';

  return {
    data_attributes: dataAttrs,
    data_attributes_count: dataAttrs.length,
    aria_attributes: ariaAttrs,
    aria_attributes_count: ariaAttrs.length,
    role_attribute: role,
  };
}

function feat_text_statistics(root) {
  const text = textOf(root);
  const words = text.split(/\s+/).filter(Boolean);
  const sentences = text.split(/[.!?]+/).filter((sentence) => sentence.trim().length > 0);

  return {
    text_word_count: words.length,
    text_char_count: text.length,
    text_sentence_count: sentences.length,
    text_avg_word_length: words.length
      ? Math.round((words.reduce((sum, word) => sum + word.length, 0) / words.length) * 10) / 10
      : 0,
  };
}

function feat_ui_hints(root) {
  const interactive = root.querySelectorAll('button, input, select, textarea, [role="button"], [tabindex]');
  const forms = root.querySelectorAll('form');
  const contentEditable = root.querySelectorAll('[contenteditable]');
  return {
    ui_interactive_element_count: interactive.length,
    ui_form_count: forms.length,
    ui_contenteditable_count: contentEditable.length,
  };
}

function feat_child_tag_histogram(root) {
  const histogram = {};
  directChildren(root).forEach((child) => {
    const tag = child.tagName ? child.tagName.toLowerCase() : 'unknown';
    histogram[tag] = (histogram[tag] || 0) + 1;
  });
  return {
    child_tag_histogram: histogram,
    child_tag_variety: Object.keys(histogram).length,
    direct_child_count: directChildren(root).length,
  };
}

function feat_depth(root) {
  return { node_depth: nodeDepth(root) };
}

function feat_xpath(root) {
  return { xpath: getXPath(root) };
}

function feat_css_path(root) {
  return { css_path: getCssPath(root) };
}

function feat_shadow_dom_metadata(root) {
  const hasShadow = !!root.shadowRoot;
  const shadowMode = hasShadow ? (root.shadowRoot.mode || 'unknown') : 'none';
  const descendantShadowHosts = allDescendants(root).filter((el) => !!el.shadowRoot).length;
  return {
    has_shadow_dom: hasShadow,
    shadow_dom_mode: shadowMode,
    descendant_shadow_host_count: descendantShadowHosts,
  };
}

function feat_parent_index(root) {
  if (!root.parentElement) {
    return { parent_index: 0, sibling_count: 0 };
  }
  const siblings = Array.from(root.parentElement.children);
  return {
    parent_index: siblings.indexOf(root),
    sibling_count: siblings.length,
  };
}

function feat_structural_signature(root) {
  return {
    structural_signature: structuralSignature(root),
    sig_id: sigId(root),
  };
}

function feat_sigpath(root) {
  const path = [];
  let node = root;
  while (node && node.nodeType === 1) {
    path.unshift(sigId(node));
    node = node.parentElement;
  }
  return { sigpath: path.join('->') };
}

function feat_node_id(root) {
  const base = `${getXPath(root)}|${structuralSignature(root)}`;
  return { node_id: hashString(base) };
}

function feat_repeating_group_count(root) {
  const group = dominantChildGroup(root);
  return {
    repeating_group_count: group ? group.elements.length : 0,
    repeating_group_sig_id: group ? group.sigId : '',
    child_sig_id_group_count: groupBySigId(directChildren(root)).size,
  };
}

function feat_min_k_threshold_pass(root) {
  const count = dominantChildGroup(root)?.elements.length || 0;
  return {
    min_k_threshold_pass_3: count >= 3,
    min_k_threshold_pass_5: count >= 5,
    min_k_threshold_pass_8: count >= 8,
    min_k_threshold_pass_15: count >= 15,
    min_k_count: count,
  };
}

function feat_wildcard_xpath_template(root) {
  const group = dominantChildGroup(root);
  if (!group || !group.elements.length) {
    return { wildcard_xpath_template: '', has_template: false };
  }

  const template = getXPath(group.elements[0]).replace(/\[\d+\]$/, '[*]');
  return {
    wildcard_xpath_template: template,
    has_template: true,
  };
}

function feat_internal_depth_filter(root) {
  const depth = maxSubtreeDepth(root);
  return {
    internal_depth: depth,
    internal_depth_filter_pass: depth >= 3,
  };
}

function feat_comment_header_with_count(root) {
  const scope = root.parentElement || root;
  const headings = Array.from(scope.querySelectorAll('h1,h2,h3,h4,h5,h6,[class*="header"],[class*="heading"]'));
  const pattern = /\b(\d+)\s*(comment|reply|response|review|discussion|answer)s?\b/i;
  const match = headings
    .map((heading) => textOf(heading))
    .find((value) => pattern.test(value)) || '';
  const countMatch = match.match(/\d+/);

  return {
    comment_header_with_count: !!match,
    comment_header_count_value: countMatch ? parseInt(countMatch[0], 10) : 0,
  };
}

function feat_attributes_contain_keywords(root) {
  const keywordPattern = /\b(comment|reply|repl(?:y|ies)|discussion|review|feedback|thread|answer|answers|forum)\b/i;
  return {
    attributes_contain_keywords: keywordPattern.test(attrText(root)),
  };
}

function feat_has_action_buttons(root) {
  const buttons = allDescendants(root).filter((el) => el.tagName === 'BUTTON' || el.getAttribute('role') === 'button');
  const units = getDominantUnits(root);
  const unitsWithButtons = units.filter((unit) => unit.querySelector('button, [role="button"]')).length;
  return {
    action_button_count: buttons.length,
    units_with_action_buttons: unitsWithButtons,
    has_action_buttons: buttons.length > 0,
  };
}

function feat_has_more_options_button(root) {
  const pattern = /\b(more|options|menu|actions|settings|ellipsis)\b/i;
  const buttons = allDescendants(root).filter((el) => {
    if (!(el.tagName === 'BUTTON' || el.getAttribute('role') === 'button')) return false;
    return pattern.test(el.getAttribute('aria-label') || '') || pattern.test(textOf(el));
  });
  return {
    has_more_options_button: buttons.length > 0,
    more_options_button_count: buttons.length,
  };
}

function feat_includes_author(root) {
  const authorPattern = /\b(author|username|user.?name|display.?name|commenter|poster|handle|screen.?name|member)\b/i;
  const matches = allDescendants(root).filter((el) => authorPattern.test(attrText(el)));
  return {
    includes_author: matches.length > 0,
    author_element_count: matches.length,
  };
}

function feat_has_avatar(root) {
  const avatarClassPattern = /\b(avatar|user.?photo|profile.?pic|userpic|gravatar|author.?img|user.?image|member.?photo)\b/i;
  const avatarUrlPattern = /\/(avatar|gravatar|profile|user.?image|photo|avatars|userpic)s?\/|\/\d{4,}\.(jpg|jpeg|png|webp|gif)/i;
  const avatars = Array.from(root.querySelectorAll('img')).filter((img) => {
    const imageAttrs = `${attrText(img)} ${img.getAttribute('alt') || ''}`;
    const src = img.getAttribute('src') || img.getAttribute('data-src') || '';
    return avatarClassPattern.test(imageAttrs) || avatarUrlPattern.test(src);
  });

  return {
    has_avatar: avatars.length > 0,
    avatar_img_count: avatars.length,
    avatar_img_src_samples: avatars.slice(0, 3).map((img) => img.getAttribute('src') || img.getAttribute('data-src') || ''),
  };
}

function feat_has_text_content(root) {
  const length = textOf(root).length;
  return {
    has_text_content: length > 20,
    total_text_length: length,
  };
}

function feat_text_contains_links(root) {
  const links = Array.from(root.querySelectorAll('a[href]'));
  return {
    text_contains_links: links.length > 0,
    link_count: links.length,
  };
}

function feat_link_density(root) {
  const totalText = textOf(root).length;
  const linkText = Array.from(root.querySelectorAll('a[href]'))
    .reduce((sum, link) => sum + textOf(link).length, 0);
  return {
    link_density: totalText ? Math.round((linkText / totalText) * 1000) / 1000 : 0,
    link_text_length: linkText,
  };
}

function feat_text_contains_mentions_or_hashtags(root) {
  const text = textOf(root);
  const mentions = text.match(/@[\w.]+/g) || [];
  const hashtags = text.match(/#[\w]+/g) || [];
  return {
    text_contains_mentions: mentions.length > 0,
    mention_count: mentions.length,
    text_contains_hashtags: hashtags.length > 0,
    hashtag_count: hashtags.length,
  };
}

function feat_text_contains_emoji(root) {
  const text = textOf(root);
  const matches = text.match(/[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu) || [];
  return {
    text_contains_emoji: matches.length > 0,
    emoji_count: matches.length,
  };
}

function feat_text_question_mark_count(root) {
  const text = textOf(root);
  return {
    text_question_mark_count: (text.match(/\?/g) || []).length,
    text_exclamation_count: (text.match(/!/g) || []).length,
  };
}

function feat_has_relative_time(root) {
  const relativePattern = /\b(\d+\s*(second|minute|hour|day|week|month|year)s?\s*ago|just\s*now|yesterday|\d+[smhdwy]\b)\b/i;
  const timeElements = Array.from(root.querySelectorAll('time[datetime]'));
  const textMatches = allTextNodes(root).filter((text) => relativePattern.test(text));
  const units = getDominantUnits(root);
  const unitsWithTime = units.filter((unit) => unit.querySelector('time[datetime]') || relativePattern.test(textOf(unit))).length;

  return {
    has_time_datetime_element: timeElements.length > 0,
    time_datetime_element_count: timeElements.length,
    has_relative_time_text: textMatches.length > 0,
    relative_time_text_count: textMatches.length,
    relative_time_text_pattern: textMatches.length > 0,
    units_with_relative_time: unitsWithTime,
    has_relative_time: timeElements.length > 0 || textMatches.length > 0,
    time_datetime_per_unit: ratio(unitsWithTime, units.length),
  };
}

function feat_response_csp(_rawHTML = '', responseHeaders = {}) {
  const csp = responseHeaders['content-security-policy']
    || responseHeaders['Content-Security-Policy']
    || '';
  return {
    response_has_csp_header: !!csp,
    response_csp_has_script_src: /script-src/i.test(csp),
    response_csp_allows_unsafe_inline: /unsafe-inline/i.test(csp),
    response_csp_allows_unsafe_eval: /unsafe-eval/i.test(csp),
  };
}

function feat_meta_charset(rawHTML = '') {
  const match = rawHTML.match(/<meta[^>]+charset=["']?([^"'\s>]+)/i);
  return { meta_charset: match ? match[1].toLowerCase() : '' };
}

function feat_og_type(rawHTML = '') {
  const match = rawHTML.match(/<meta[^>]+property=["']og:type["'][^>]+content=["']([^"']+)["']/i)
    || rawHTML.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:type["']/i);
  const ogType = match ? match[1].toLowerCase() : '';
  return {
    og_type: ogType,
    og_type_is_article: ogType === 'article',
    og_type_is_profile: ogType === 'profile',
    og_type_article_or_profile: ogType === 'article' || ogType === 'profile',
  };
}

function feat_json_ld_comment(rawHTML = '') {
  const scriptPattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  let hasComment = false;
  let hasCommentAction = false;
  let hasInteractionCounter = false;

  while ((match = scriptPattern.exec(rawHTML)) !== null) {
    const value = match[1];
    if (/"@type"\s*:\s*"Comment"/i.test(value)) hasComment = true;
    if (/"@type"\s*:\s*"CommentAction"/i.test(value)) hasCommentAction = true;
    if (/"interactionType"\s*:\s*"[^"]*CommentAction"/i.test(value)) hasInteractionCounter = true;
  }

  return {
    schema_org_in_head_json_ld: /application\/ld\+json/i.test(rawHTML),
    json_ld_has_comment_type: hasComment,
    json_ld_has_comment_action: hasCommentAction,
    json_ld_has_interaction_counter: hasInteractionCounter,
    json_ld_comment_type: hasComment,
    json_ld_comment_action: hasCommentAction,
  };
}

function feat_framework_fingerprint(rawHTML = '') {
  return {
    framework_react: /data-reactroot|__REACT_DEVTOOLS|_reactFiber|_reactRootContainer/i.test(rawHTML),
    framework_vue: /__vue__|data-v-[a-f0-9]+/i.test(rawHTML),
    framework_angular: /ng-version|ng-app|ng-controller/i.test(rawHTML),
    framework_svelte: /data-svelte|svelte-/i.test(rawHTML),
    framework_next: /__NEXT_DATA__|_next\//i.test(rawHTML),
    framework_nuxt: /__NUXT__|nuxt\.js/i.test(rawHTML),
  };
}

function feat_html_lang(rawHTML = '') {
  const match = rawHTML.match(/<html[^>]+lang=["']([^"']+)["']/i);
  return { html_lang: match ? match[1].toLowerCase() : '' };
}

function feat_preload_avatar(rawHTML = '') {
  const matches = rawHTML.match(/<link[^>]+rel=["']preload["'][^>]+as=["']image["'][^>]*>/gi) || [];
  const avatarMatches = matches.filter((entry) => /avatar|profile|user/i.test(entry));
  return {
    preload_avatar_image: avatarMatches.length > 0,
    preload_avatar_count: avatarMatches.length,
  };
}

function feat_csrf_token_in_form(rawHTML = '') {
  return {
    csrf_token_in_form: /<input[^>]+type=["']hidden["'][^>]+name=["'](?:_token|csrf|authenticity_token|__RequestVerificationToken)[^"']*["']/i.test(rawHTML),
  };
}

function feat_comment_route_in_scripts(rawHTML = '') {
  return {
    html_contains_comment_route: /src=["'][^"']*\/(comments?|reviews?|feed|discussion|replies|ugc)[^"']*\.js/i.test(rawHTML),
  };
}

function feat_schema_org_comment(root) {
  const itemtypes = Array.from(root.querySelectorAll('[itemtype]')).filter((el) => /schema\.org\/(Comment|UserComments)/i.test(el.getAttribute('itemtype') || ''));
  const roleComment = Array.from(root.querySelectorAll('[role="comment"]'));
  return {
    schema_org_comment_itemtype: itemtypes.length > 0,
    schema_org_comment_count: itemtypes.length,
    aria_role_comment: roleComment.length > 0,
    aria_role_comment_count: roleComment.length,
  };
}

function feat_aria_role_feed(root) {
  const feeds = Array.from(root.querySelectorAll('[role="feed"]'));
  const feedWithArticles = feeds.filter((feed) => feed.querySelector('[role="article"]'));
  return {
    aria_role_feed: feeds.length > 0 || root.getAttribute('role') === 'feed',
    aria_role_feed_with_articles: feedWithArticles.length > 0,
    aria_role_feed_count: feeds.length,
  };
}

function feat_microdata_comment_props(root) {
  const author = root.querySelectorAll('[itemprop="author"]').length;
  const datePublished = root.querySelectorAll('[itemprop="datePublished"], [itemprop="dateCreated"]').length;
  const text = root.querySelectorAll('[itemprop="text"], [itemprop="description"]').length;
  return {
    microdata_itemprop_author: author > 0,
    microdata_itemprop_author_count: author,
    microdata_itemprop_date_published: datePublished > 0,
    microdata_itemprop_date_published_count: datePublished,
    microdata_itemprop_text: text > 0,
    microdata_itemprop_text_count: text,
  };
}

function feat_reply_button_per_unit(root) {
  const replyPattern = /\b(reply|respond|quote|answer|write\s+a\s+reply)\b/i;
  const reportPattern = /\b(report|flag|spam|abuse|inappropriate|block\s+user|hide)\b/i;
  const units = getDominantUnits(root);

  const replyCount = units.filter((unit) => Array.from(unit.querySelectorAll('button, [role="button"], a'))
    .some((button) => replyPattern.test(button.getAttribute('aria-label') || '') || replyPattern.test(textOf(button)))).length;
  const reportCount = units.filter((unit) => Array.from(unit.querySelectorAll('button, [role="button"], a'))
    .some((button) => reportPattern.test(button.getAttribute('aria-label') || '') || reportPattern.test(textOf(button)))).length;

  return {
    reply_button_per_unit: units.length > 0 && ratio(replyCount, units.length) >= 0.5,
    reply_button_unit_coverage: ratio(replyCount, units.length),
    report_flag_button_per_unit: units.length > 0 && reportCount > 0,
    report_flag_unit_coverage: ratio(reportCount, units.length),
    units_with_reply_button: replyCount,
    units_with_report_button: reportCount,
  };
}

function feat_author_avatar_colocation(root) {
  const avatarPattern = /\b(avatar|user.?photo|profile.?pic|userpic|gravatar|author.?img)\b/i;
  const avatarUrlPattern = /\/(avatar|gravatar|profile|photo)s?\/|\/\d{4,}\.(jpg|jpeg|png|webp|gif)/i;
  const usernamePattern = /\b(author|username|user.?name|display.?name|handle|screen.?name|member)\b/i;
  const units = getDominantUnits(root);

  const unitsWithBoth = units.filter((unit) => {
    const hasAvatar = Array.from(unit.querySelectorAll('img')).some((img) => {
      const src = img.getAttribute('src') || img.getAttribute('data-src') || '';
      return avatarPattern.test(attrText(img)) || avatarUrlPattern.test(src);
    });
    const hasUsername = Array.from(unit.querySelectorAll('*')).some((el) => usernamePattern.test(attrText(el)));
    return hasAvatar && hasUsername;
  }).length;

  return {
    author_avatar_colocation: unitsWithBoth > 0,
    author_avatar_colocation_unit_count: unitsWithBoth,
    author_avatar_coverage: ratio(unitsWithBoth, units.length),
  };
}

function feat_sig_id_recursive_nesting(root) {
  const group = dominantChildGroup(root);
  if (!group) return { sig_id_recursive_nesting: false, recursive_nesting_depth: 0 };
  const parentSig = group.sigId;
  let recursiveDepth = 0;

  group.elements.forEach((unit) => {
    const matches = allDescendants(unit).filter((descendant) => sigId(descendant) === parentSig).length;
    if (matches > 0) recursiveDepth = Math.max(recursiveDepth, 1);
  });

  return {
    sig_id_recursive_nesting: recursiveDepth > 0,
    recursive_nesting_depth: recursiveDepth,
  };
}

function feat_textarea_tree_proximity(root) {
  const textareas = Array.from(document.querySelectorAll('textarea'));
  const contentEditables = Array.from(document.querySelectorAll('[contenteditable="true"], [contenteditable=""], [contenteditable]'));
  let nearestTextarea = Infinity;
  let nearestEditable = Infinity;

  textareas.forEach((textarea) => {
    nearestTextarea = Math.min(nearestTextarea, treeDistance(root, textarea));
  });
  contentEditables.forEach((editable) => {
    nearestEditable = Math.min(nearestEditable, treeDistance(root, editable));
  });

  const nearest = Math.min(nearestTextarea, nearestEditable);
  return {
    textarea_tree_proximity: nearestTextarea,
    contenteditable_tree_proximity: nearestEditable,
    nearest_input_distance: nearest,
    nearest_textarea_distance: nearestTextarea,
    has_nearby_textarea: nearestTextarea < 30,
    textarea_very_close: nearestTextarea < 10,
    textarea_close: nearestTextarea < 20,
    aligned_with_textarea: nearestTextarea < 15,
    aligned_with_content_editable: nearestEditable < 15,
  };
}

function feat_reaction_count_per_unit(root) {
  const reactionPattern = /\b(like|upvote|heart|clap|helpful|thumb|vote|react)\b/i;
  const units = getDominantUnits(root);

  const matches = units.filter((unit) => Array.from(unit.querySelectorAll('button, [role="button"], [class*="like"], [class*="vote"], [class*="react"]'))
    .some((button) => {
      const label = `${button.getAttribute('aria-label') || ''} ${textOf(button)}`;
      if (!reactionPattern.test(label) && !reactionPattern.test(classString(button))) return false;
      const siblingText = normalizeSpace(button.nextSibling && button.nextSibling.textContent ? button.nextSibling.textContent : '');
      return /\b\d+[km]?\b/i.test(label) || /\b\d+[km]?\b/i.test(siblingText);
    })).length;

  return {
    reaction_count_per_unit: matches > 0,
    units_with_reaction_count: matches,
    reaction_coverage: ratio(matches, units.length),
  };
}

function feat_edit_delete_per_unit(root) {
  const pattern = /\b(edit|delete|remove|trash|discard)\b/i;
  const units = getDominantUnits(root);

  const matches = units.filter((unit) => Array.from(unit.querySelectorAll('button, [role="button"], a'))
    .some((button) => pattern.test(textOf(button)) || pattern.test(button.getAttribute('aria-label') || ''))).length;

  return {
    edit_delete_per_unit: matches > 0,
    units_with_edit_delete: matches,
    edit_delete_coverage: ratio(matches, units.length),
  };
}

function feat_user_profile_link_per_unit(root) {
  const pattern = /\/(?:user|profile|u|member|people|users?)\/|\/@[\w.-]+|^@[\w.-]+$/i;
  const units = getDominantUnits(root);

  const matches = units.filter((unit) => Array.from(unit.querySelectorAll('a[href]'))
    .some((anchor) => pattern.test(anchor.getAttribute('href') || ''))).length;

  return {
    user_profile_link_per_unit: matches > 0,
    units_with_profile_link: matches,
    profile_link_coverage: ratio(matches, units.length),
  };
}

function feat_reply_nesting_depth(root) {
  const units = getDominantUnits(root);
  let maxDepth = 0;
  units.forEach((unit) => {
    const innerGroup = dominantChildGroup(unit);
    if (innerGroup && innerGroup.elements.length >= 2) maxDepth = Math.max(maxDepth, 1);
  });
  return {
    reply_nesting_depth: maxDepth,
    has_reply_nesting: maxDepth > 0,
  };
}

function feat_keyword_in_attributes(root) {
  const highKeywords = /\b(comment|reply|replies|thread|discussion|feedback|testimonial|review|answer|answers|forum)\b/i;
  const mediumKeywords = /\b(post|message|response|conversation|community)\b/i;
  const lowKeywords = /\b(item|card|entry|block|unit|feed|list)\b/i;
  const units = getDominantUnits(root);
  const containerText = attrText(root);
  const highUnitCount = units.filter((unit) => highKeywords.test(attrText(unit))).length;

  return {
    keyword_container_high: highKeywords.test(containerText),
    keyword_container_med: mediumKeywords.test(containerText),
    keyword_container_low: lowKeywords.test(containerText),
    keyword_unit_high: highUnitCount > 0,
    keyword_unit_high_coverage: ratio(highUnitCount, units.length),
    keyword_container_raw: containerText.toLowerCase().slice(0, 160),
  };
}

function feat_sig_id_count_graduated(root) {
  const count = dominantChildGroup(root)?.elements.length || 0;
  return {
    sig_id_count: count,
    sig_id_count_weak: count >= 3,
    sig_id_count_medium: count >= 8,
    sig_id_count_strong: count >= 15,
  };
}

function feat_internal_depth_and_tag_variety(root) {
  const depth = maxSubtreeDepth(root);
  const variety = distinctTagCount(root);
  const units = getDominantUnits(root);
  const averageUnitDepth = units.length
    ? units.reduce((sum, unit) => sum + maxSubtreeDepth(unit), 0) / units.length
    : 0;

  return {
    internal_max_depth: depth,
    internal_tag_variety: variety,
    avg_unit_depth: Math.round(averageUnitDepth * 10) / 10,
    depth_and_variety_pass: depth >= 3 && variety >= 5,
  };
}

function feat_pagination_load_more(root) {
  const pattern = /\b(load\s+more|show\s+more|view\s+more|next\s+page|show\s+\d+\s+more|more\s+comments|more\s+replies|more\s+answers)\b/i;
  const siblings = root.parentElement
    ? Array.from(root.parentElement.children).filter((child) => child !== root)
    : [];
  const nextSibling = root.nextElementSibling;
  const text = siblings.map((sibling) => textOf(sibling)).find((value) => pattern.test(value))
    || (nextSibling && pattern.test(textOf(nextSibling)) ? textOf(nextSibling) : '');

  return {
    pagination_load_more_adjacent: !!text,
    pagination_load_more_text: text,
  };
}

function feat_char_counter_near_textarea(root) {
  const pattern = /\b\d+\s*\/\s*\d+\b|\bcharacters?\s*(remaining|left|used)\b|\b\d+\s*chars?\b/i;
  const text = textOf(root.parentElement || root);
  const match = text.match(pattern);
  return {
    char_counter_near_textarea: !!match,
    char_counter_text: match ? match[0] : '',
  };
}

function feat_submit_button_label(root) {
  const pattern = /\b(post|submit|comment|reply|respond|send|publish|add\s+comment|add\s+review)\b/i;
  const buttons = Array.from((root.parentElement || root).querySelectorAll('button, input[type="submit"], [role="button"]'))
    .filter((button) => pattern.test(textOf(button)) || pattern.test(button.getAttribute('value') || '') || pattern.test(button.getAttribute('aria-label') || ''));
  return {
    submit_button_present: buttons.length > 0,
    submit_button_labels: buttons.slice(0, 3).map((button) => textOf(button).slice(0, 40) || (button.getAttribute('value') || '').slice(0, 40)),
  };
}

function feat_sibling_homogeneity_score(root) {
  const children = directChildren(root);
  if (children.length < 2) {
    return {
      sibling_homogeneity_score: 0,
      dominant_sig_proportion: 0,
    };
  }
  const counts = {};
  children.forEach((child) => {
    const key = sigId(child);
    counts[key] = (counts[key] || 0) + 1;
  });
  const maxCount = Math.max(...Object.values(counts));
  const score = ratio(maxCount, children.length);
  return {
    sibling_homogeneity_score: score,
    dominant_sig_proportion: score,
  };
}

function feat_collapse_expand_control(root) {
  const pattern = /\b(show\s+\d+\s+repl|hide\s+repl|expand|collapse|view\s+\d+\s+repl|show\s+\d+\s+answers?)\b/i;
  return {
    collapse_expand_control: allDescendants(root).some((el) => pattern.test(textOf(el))),
  };
}

function feat_price_currency_in_unit(root) {
  const pattern = /[\$€£¥₹]\s*\d|\d\s*[\$€£¥₹]|\b\d+\.\d{2}\b|\bprice\b|\bUSD|EUR|GBP\b/i;
  const units = getDominantUnits(root);
  const matches = units.filter((unit) => pattern.test(textOf(unit))).length;
  return {
    price_currency_in_unit: matches > 0,
    price_currency_unit_count: matches,
    price_coverage: ratio(matches, units.length),
  };
}

function feat_nav_header_ancestor(root) {
  let node = root.parentElement;
  let distance = 0;
  let found = false;
  while (node && distance < 5) {
    const tag = node.tagName ? node.tagName.toLowerCase() : '';
    const role = node.getAttribute('role') || '';
    if (tag === 'nav' || tag === 'header' || role === 'navigation' || role === 'banner') {
      found = true;
      break;
    }
    node = node.parentElement;
    distance += 1;
  }
  return {
    nav_header_ancestor: found,
    nav_header_ancestor_depth: found ? distance : -1,
  };
}

function feat_no_text_content_in_units(root) {
  const units = getDominantUnits(root);
  if (!units.length) {
    return {
      no_text_content_in_units: false,
      text_empty_unit_proportion: 0,
    };
  }
  const empty = units.filter((unit) => textOf(unit).length < 10).length;
  return {
    no_text_content_in_units: ratio(empty, units.length) > 0.8,
    text_empty_unit_proportion: ratio(empty, units.length),
  };
}

function feat_add_to_cart_present(root) {
  return {
    add_to_cart_present: /\b(add\s+to\s+cart|buy\s+now|add\s+to\s+bag|purchase|checkout)\b/i.test(textOf(root.parentElement || root)),
  };
}

function feat_high_external_link_density(root) {
  const links = Array.from(root.querySelectorAll('a[href]'));
  if (!links.length) {
    return {
      high_external_link_density: false,
      external_link_proportion: 0,
      external_link_count: 0,
      total_link_count: 0,
    };
  }

  const currentHost = typeof window !== 'undefined' ? window.location.hostname : '';
  const externalCount = links.filter((anchor) => {
    const href = anchor.getAttribute('href') || '';
    try {
      const url = new URL(href, typeof window !== 'undefined' ? window.location.href : 'https://example.com');
      return !!url.hostname && url.hostname !== currentHost;
    } catch (_) {
      return false;
    }
  }).length;

  const proportion = ratio(externalCount, links.length);
  return {
    high_external_link_density: proportion > 0.6,
    external_link_proportion: proportion,
    external_link_count: externalCount,
    total_link_count: links.length,
  };
}

function feat_star_rating_no_text(root) {
  const pattern = /\b(star|rating|stars|rated|review-score)\b/i;
  const ratings = allDescendants(root).filter((el) => pattern.test(attrText(el)));
  const substantialText = textOf(root).split(/\s+/).filter(Boolean).length > 15;
  return {
    star_rating_present: ratings.length > 0,
    star_rating_no_text: ratings.length > 0 && !substantialText,
  };
}

function feat_table_row_structure(root) {
  const tag = root.tagName ? root.tagName.toLowerCase() : '';
  const childTags = directChildren(root).map((child) => child.tagName ? child.tagName.toLowerCase() : '');
  return {
    table_row_structure: tag === 'table' || tag === 'tbody' || childTags.includes('tr'),
    is_table_or_tbody: tag === 'table' || tag === 'tbody',
    has_tr_children: childTags.includes('tr'),
  };
}

function feat_author_timestamp_colocated(root) {
  const avatarPattern = /\b(avatar|user.?photo|profile.?pic|gravatar|userpic)\b/i;
  const usernamePattern = /\b(author|username|user.?name|handle|display.?name|member)\b/i;
  const timePattern = /\b(\d+\s*(minute|hour|day|week|month)s?\s*ago|just\s*now|\d+[smhdwy]\b)\b/i;
  const units = getDominantUnits(root);

  const matches = units.filter((unit) => {
    const hasAvatar = Array.from(unit.querySelectorAll('img')).some((img) => avatarPattern.test(attrText(img)));
    const hasUsername = Array.from(unit.querySelectorAll('*')).some((el) => usernamePattern.test(attrText(el)));
    const hasTime = !!unit.querySelector('time[datetime]') || timePattern.test(textOf(unit));
    return hasAvatar && hasUsername && hasTime;
  }).length;

  return {
    author_timestamp_colocated: matches > 0,
    author_timestamp_unit_count: matches,
  };
}

function feat_indent_margin_pattern(root) {
  const pattern = /\b(indent|level|depth|nested|child-comment|sub-comment)\b/i;
  const units = getDominantUnits(root);
  const matches = units.filter((unit) => {
    const style = unit.getAttribute('style') || '';
    return /margin-?left:\s*\d+|padding-?left:\s*\d+/i.test(style) || pattern.test(attrText(unit));
  }).length;
  return {
    indent_margin_pattern: matches > 0,
    indented_unit_count: matches,
  };
}

function feat_share_button_per_unit(root) {
  const pattern = /\b(share|retweet|repost|forward|copy\s+link)\b/i;
  const units = getDominantUnits(root);
  const matches = units.filter((unit) => Array.from(unit.querySelectorAll('button, [role="button"], a'))
    .some((button) => pattern.test(textOf(button)) || pattern.test(button.getAttribute('aria-label') || ''))).length;
  return {
    share_button_per_unit: matches > 0,
    units_with_share: matches,
    share_coverage: ratio(matches, units.length),
  };
}

function feat_upvote_downvote_pair(root) {
  const upPattern = /\b(upvote|up-vote|thumbs.?up|like|agree)\b/i;
  const downPattern = /\b(downvote|down-vote|thumbs.?down|dislike|disagree)\b/i;
  const units = getDominantUnits(root);
  const matches = units.filter((unit) => {
    const labels = Array.from(unit.querySelectorAll('button, [role="button"]'))
      .map((button) => `${button.getAttribute('aria-label') || ''} ${textOf(button)}`);
    return labels.some((label) => upPattern.test(label)) && labels.some((label) => downPattern.test(label));
  }).length;
  return {
    upvote_downvote_pair: matches > 0,
    units_with_vote_pair: matches,
  };
}

function feat_permalink_per_unit(root) {
  const pattern = /\b(permalink|link\s+to|#comment-|#reply-|#post-)\b/i;
  const units = getDominantUnits(root);
  const matches = units.filter((unit) => Array.from(unit.querySelectorAll('a[href]'))
    .some((anchor) => {
      const href = anchor.getAttribute('href') || '';
      const label = `${anchor.getAttribute('aria-label') || ''} ${textOf(anchor)}`;
      return pattern.test(href) || pattern.test(label);
    })).length;
  return {
    permalink_per_unit: matches > 0,
    units_with_permalink: matches,
  };
}

function feat_deleted_placeholder(root) {
  const pattern = /\[(deleted|removed|hidden)\]/i;
  const units = getDominantUnits(root);
  const matches = units.filter((unit) => pattern.test(textOf(unit))).length;
  return {
    deleted_placeholder_present: pattern.test(textOf(root)),
    deleted_placeholder_unit_count: matches,
  };
}

function feat_quote_block_per_unit(root) {
  const units = getDominantUnits(root);
  const matches = units.filter((unit) => !!unit.querySelector('blockquote')).length;
  return {
    quote_block_per_unit: matches > 0,
    units_with_blockquote: matches,
    quote_coverage: ratio(matches, units.length),
  };
}

function feat_read_more_truncation(root) {
  const pattern = /\b(read\s+more|show\s+more|see\s+more|expand)\b/i;
  const units = getDominantUnits(root);
  const matches = units.filter((unit) => pattern.test(textOf(unit))).length;
  return {
    read_more_truncation: matches > 0,
    units_with_read_more: matches,
  };
}

function feat_has_edit_history(root) {
  const pattern = /\(\s*edited\s*\)|\b(last\s+modified|updated|edited)\b/i;
  const units = getDominantUnits(root);
  const matches = units.filter((unit) => pattern.test(textOf(unit))).length;
  return {
    has_edit_history_indicator: matches > 0,
    edited_unit_count: matches,
  };
}

function feat_pinned_post_indicator(root) {
  const firstUnit = getDominantUnits(root)[0];
  return {
    pinned_post_indicator: firstUnit ? /\b(pinned|featured|sticky|stickied)\b/i.test(textOf(firstUnit)) : false,
  };
}

function feat_verification_badge(root) {
  const pattern = /\b(verified|checkmark|badge|tick|official)\b/i;
  const matches = allDescendants(root).filter((el) => pattern.test(attrText(el)) || pattern.test(el.getAttribute('title') || '')).length;
  return {
    verification_badge_present: matches > 0,
    verification_badge_count: matches,
  };
}

function feat_spoiler_tag(root) {
  const pattern = /\b(spoiler|content.?warning|cw:|sensitive)\b/i;
  return {
    spoiler_tag_present: allDescendants(root).some((el) => pattern.test(attrText(el)) || pattern.test(textOf(el))),
  };
}

function feat_thread_depth_indicator(root) {
  const pattern = /\b(level|depth|tier|indent|nested|child)\b/i;
  const units = getDominantUnits(root);
  const matches = units.filter((unit) => pattern.test(attrText(unit)) || pattern.test(unit.getAttribute('data-depth') || '') || pattern.test(unit.getAttribute('data-level') || '')).length;
  return {
    thread_depth_indicator: matches > 0,
    depth_indicator_unit_count: matches,
  };
}

function feat_external_link_density_low(root) {
  const density = feat_high_external_link_density(root);
  return {
    external_link_density_low: density.external_link_proportion < 0.2,
    external_link_proportion_low: density.external_link_proportion,
  };
}

function feat_interaction_counter_schema(rawHTML = '') {
  return {
    interaction_counter_schema: /"interactionType"\s*:\s*"[^"]*CommentAction"/i.test(rawHTML),
  };
}

function feat_like_count_pattern(root) {
  const pattern = /\b(like|upvote|heart|helpful|agree)\b/i;
  const units = getDominantUnits(root);
  const matches = units.filter((unit) => Array.from(unit.querySelectorAll('[class*="like"], [class*="vote"], [class*="count"], [class*="react"], button, [role="button"]'))
    .some((el) => {
      const value = textOf(el);
      const label = `${attrText(el)} ${el.parentElement ? attrText(el.parentElement) : ''}`;
      return /^\d+[km]?$/i.test(value) && pattern.test(label);
    })).length;
  return {
    like_count_pattern: matches > 0,
    units_with_like_count: matches,
  };
}

function extractAllFeatures(rootElement, rawHTML = '', responseHeaders = {}) {
  if (!rootElement) return { error: 'no_root_element' };

  const features = Object.assign(
    {},
    feat_tag_name(rootElement),
    feat_classes(rootElement),
    feat_attributes_data_aria_role(rootElement),
    feat_text_statistics(rootElement),
    feat_ui_hints(rootElement),
    feat_child_tag_histogram(rootElement),
    feat_depth(rootElement),
    feat_xpath(rootElement),
    feat_css_path(rootElement),
    feat_shadow_dom_metadata(rootElement),
    feat_parent_index(rootElement),
    feat_structural_signature(rootElement),
    feat_sigpath(rootElement),
    feat_node_id(rootElement),
    feat_repeating_group_count(rootElement),
    feat_min_k_threshold_pass(rootElement),
    feat_wildcard_xpath_template(rootElement),
    feat_internal_depth_filter(rootElement),
    feat_comment_header_with_count(rootElement),
    feat_attributes_contain_keywords(rootElement),
    feat_has_action_buttons(rootElement),
    feat_has_more_options_button(rootElement),
    feat_includes_author(rootElement),
    feat_has_avatar(rootElement),
    feat_has_text_content(rootElement),
    feat_text_contains_links(rootElement),
    feat_link_density(rootElement),
    feat_text_contains_mentions_or_hashtags(rootElement),
    feat_text_contains_emoji(rootElement),
    feat_text_question_mark_count(rootElement),
    feat_has_relative_time(rootElement),
    feat_response_csp(rawHTML, responseHeaders),
    feat_meta_charset(rawHTML),
    feat_og_type(rawHTML),
    feat_json_ld_comment(rawHTML),
    feat_framework_fingerprint(rawHTML),
    feat_html_lang(rawHTML),
    feat_preload_avatar(rawHTML),
    feat_csrf_token_in_form(rawHTML),
    feat_comment_route_in_scripts(rawHTML),
    feat_schema_org_comment(rootElement),
    feat_aria_role_feed(rootElement),
    feat_microdata_comment_props(rootElement),
    feat_reply_button_per_unit(rootElement),
    feat_author_avatar_colocation(rootElement),
    feat_sig_id_recursive_nesting(rootElement),
    feat_textarea_tree_proximity(rootElement),
    feat_reaction_count_per_unit(rootElement),
    feat_edit_delete_per_unit(rootElement),
    feat_user_profile_link_per_unit(rootElement),
    feat_reply_nesting_depth(rootElement),
    feat_keyword_in_attributes(rootElement),
    feat_sig_id_count_graduated(rootElement),
    feat_internal_depth_and_tag_variety(rootElement),
    feat_pagination_load_more(rootElement),
    feat_char_counter_near_textarea(rootElement),
    feat_submit_button_label(rootElement),
    feat_sibling_homogeneity_score(rootElement),
    feat_collapse_expand_control(rootElement),
    feat_price_currency_in_unit(rootElement),
    feat_nav_header_ancestor(rootElement),
    feat_no_text_content_in_units(rootElement),
    feat_add_to_cart_present(rootElement),
    feat_high_external_link_density(rootElement),
    feat_star_rating_no_text(rootElement),
    feat_table_row_structure(rootElement),
    feat_author_timestamp_colocated(rootElement),
    feat_indent_margin_pattern(rootElement),
    feat_share_button_per_unit(rootElement),
    feat_upvote_downvote_pair(rootElement),
    feat_permalink_per_unit(rootElement),
    feat_deleted_placeholder(rootElement),
    feat_quote_block_per_unit(rootElement),
    feat_read_more_truncation(rootElement),
    feat_has_edit_history(rootElement),
    feat_pinned_post_indicator(rootElement),
    feat_verification_badge(rootElement),
    feat_spoiler_tag(rootElement),
    feat_thread_depth_indicator(rootElement),
    feat_external_link_density_low(rootElement),
    feat_like_count_pattern(rootElement),
    feat_interaction_counter_schema(rawHTML),
  );

  features._extracted_at = typeof window !== 'undefined' ? window.location.href : '';
  features._root_tag = rootElement.tagName ? rootElement.tagName.toLowerCase() : '';

  return features;
}

function collectSampleText(root) {
  const units = getDominantUnits(root);
  const samples = (units.length ? units : [root])
    .map((unit) => textOf(unit))
    .filter(Boolean)
    .slice(0, 3)
    .map((value) => value.slice(0, 220));
  return {
    unit_count: units.length,
    sample_texts: samples,
    sample_text: samples.join(' | ').slice(0, 500),
  };
}

function inferUgcType(features) {
  if (features.star_rating_present && features.has_text_content && !features.add_to_cart_present) {
    return 'product_review';
  }
  if (
    features.aria_role_feed
    || features.share_button_per_unit
    || features.text_contains_mentions
    || features.text_contains_hashtags
  ) {
    return 'social_feed';
  }
  if (
    /answer/.test(features.keyword_container_raw || '')
  ) {
    return 'qa_answers';
  }
  if (
    (features.reply_button_per_unit || features.has_nearby_textarea || features.comment_header_with_count)
    && !features.upvote_downvote_pair
    && !features.thread_depth_indicator
  ) {
    return 'comment_thread';
  }
  if (
    features.upvote_downvote_pair
    || features.reply_nesting_depth > 0
    || features.sig_id_recursive_nesting
    || features.thread_depth_indicator
    || /forum|thread/.test(features.keyword_container_raw || '')
  ) {
    return 'forum_thread';
  }
  if (features.schema_org_comment_itemtype) {
    return 'comment_thread';
  }
  return 'ugc_region';
}

function scoreFeatures(features) {
  let score = 0;
  const matchedSignals = [];
  const penaltySignals = [];

  function add(condition, weight, label) {
    if (!condition) return;
    score += weight;
    matchedSignals.push(label);
  }

  function subtract(condition, weight, label) {
    if (!condition) return;
    score -= weight;
    penaltySignals.push(label);
  }

  add(features.schema_org_comment_itemtype, 10, 'schema_org_comment_itemtype');
  add(features.aria_role_comment, 10, 'aria_role_comment');
  add(features.aria_role_feed_with_articles, 8, 'aria_role_feed_with_articles');
  add(features.microdata_itemprop_author, 3, 'microdata_itemprop_author');
  add(features.microdata_itemprop_date_published, 3, 'microdata_itemprop_date_published');
  add(features.microdata_itemprop_text, 4, 'microdata_itemprop_text');
  add(features.json_ld_has_comment_type, 3, 'json_ld_comment_type');
  add(features.json_ld_has_comment_action, 2, 'json_ld_comment_action');
  add(features.comment_header_with_count, 5, 'comment_header_with_count');
  add(features.attributes_contain_keywords, 3, 'attributes_contain_keywords');
  add(features.keyword_container_high, 3, 'keyword_container_high');
  add(features.keyword_unit_high_coverage >= 0.4, 2, 'keyword_unit_high_coverage');
  add(features.sig_id_count_weak, 2, 'sig_id_count_weak');
  add(features.sig_id_count_medium, 3, 'sig_id_count_medium');
  add(features.sig_id_count_strong, 4, 'sig_id_count_strong');
  add(features.sibling_homogeneity_score >= 0.65, 3, 'sibling_homogeneity_score');
  add(features.depth_and_variety_pass, 2, 'depth_and_variety_pass');
  add(features.time_datetime_per_unit >= 0.5, 4, 'time_datetime_per_unit');
  add(features.author_avatar_coverage >= 0.4, 4, 'author_avatar_coverage');
  add(features.author_timestamp_colocated, 5, 'author_timestamp_colocated');
  add(features.reply_button_unit_coverage >= 0.4, 5, 'reply_button_per_unit');
  add(features.report_flag_unit_coverage >= 0.15, 2, 'report_flag_button_per_unit');
  add(features.profile_link_coverage >= 0.4, 4, 'user_profile_link_per_unit');
  add(features.reaction_coverage >= 0.25, 2, 'reaction_count_per_unit');
  add(features.edit_delete_coverage >= 0.15, 2, 'edit_delete_per_unit');
  add(features.sig_id_recursive_nesting, 3, 'sig_id_recursive_nesting');
  add(features.reply_nesting_depth > 0, 3, 'reply_nesting_depth');
  add(features.permalink_per_unit, 2, 'permalink_per_unit');
  add(features.deleted_placeholder_present, 4, 'deleted_placeholder_present');
  add(features.quote_block_per_unit, 1, 'quote_block_per_unit');
  add(features.upvote_downvote_pair, 3, 'upvote_downvote_pair');
  add(features.pinned_post_indicator, 1, 'pinned_post_indicator');
  add(features.collapse_expand_control, 2, 'collapse_expand_control');
  add(features.pagination_load_more_adjacent, 2, 'pagination_load_more_adjacent');
  add(features.has_nearby_textarea, 2, 'has_nearby_textarea');
  add(features.aligned_with_textarea, 2, 'aligned_with_textarea');
  add(features.aligned_with_content_editable, 2, 'aligned_with_content_editable');
  add(features.submit_button_present, 1, 'submit_button_present');
  add(features.char_counter_near_textarea, 1, 'char_counter_near_textarea');
  add(features.has_avatar, 1, 'has_avatar');
  add(features.includes_author, 2, 'includes_author');
  add(features.has_relative_time, 2, 'has_relative_time');
  add(features.external_link_density_low, 1, 'external_link_density_low');
  add(features.has_text_content && features.text_word_count >= 40, 2, 'substantial_text_content');

  subtract(features.table_row_structure, 6, 'table_row_structure');
  subtract(features.no_text_content_in_units, 6, 'no_text_content_in_units');
  subtract(features.add_to_cart_present, 8, 'add_to_cart_present');
  subtract(features.nav_header_ancestor, 4, 'nav_header_ancestor');
  subtract(features.high_external_link_density, 3, 'high_external_link_density');
  subtract(features.star_rating_no_text, 4, 'star_rating_no_text');
  subtract(features.price_currency_in_unit && inferUgcType(features) !== 'product_review', 4, 'price_currency_in_unit');
  subtract(features.link_density > 0.75, 2, 'link_density_too_high');

  const confidence = score >= 24 ? 'high' : score >= 16 ? 'medium' : score >= 10 ? 'low' : 'unlikely';
  const detected = score >= 12 || ((features.schema_org_comment_itemtype || features.aria_role_comment) && score >= 8);

  return {
    score,
    detected,
    confidence,
    ugc_type: inferUgcType(features),
    matched_signals: matchedSignals,
    penalty_signals: penaltySignals,
  };
}

function looksLikeContainer(el) {
  if (!el || el.nodeType !== 1) return false;
  const tag = el.tagName ? el.tagName.toLowerCase() : '';
  const semantic = /\b(comment|reply|discussion|review|feedback|thread|forum|answer|feed)\b/i.test(attrText(el));
  if (!semantic && !['section', 'article', 'div', 'ul', 'ol', 'main', 'aside'].includes(tag)) {
    return false;
  }

  const childCount = directChildren(el).length;
  const textLength = textOf(el).length;
  const repeated = dominantChildGroup(el)?.elements.length || 0;
  const homogeneity = childCount > 1 ? ratio(repeated, childCount) : 0;
  const hasRoleOrMicrodata = el.matches('[role="feed"], [role="comment"], [itemtype*="Comment"], [itemtype*="Review"]');

  if (hasRoleOrMicrodata) return true;
  if (semantic && textLength >= 40) return true;
  if (repeated >= 3 && homogeneity >= 0.5 && textLength >= 120) return true;
  if (childCount >= 4 && homogeneity >= 0.75 && textLength >= 160) return true;
  return false;
}

function quickCandidateScore(el) {
  let score = 0;
  const repeated = dominantChildGroup(el)?.elements.length || 0;
  const childCount = directChildren(el).length;
  const homogeneity = childCount > 1 ? repeated / childCount : 0;
  const textLength = textOf(el).length;
  const attrs = attrText(el);

  if (el.matches('[role="feed"], [role="comment"]')) score += 5;
  if (el.matches('[itemtype*="Comment"], [itemtype*="Review"]')) score += 5;
  if (/\b(comment|reply|discussion|review|thread|forum|answer|feed)\b/i.test(attrs)) score += 3;
  if (repeated >= 3) score += 3;
  if (repeated >= 8) score += 2;
  if (homogeneity >= 0.6) score += 2;
  if (el.querySelector('time[datetime]')) score += 1;
  if (el.querySelector('textarea, [contenteditable]')) score += 1;
  if (textLength >= 200) score += 1;

  return score;
}

function pathIsAncestor(ancestorPath, descendantPath) {
  if (!ancestorPath || !descendantPath || ancestorPath === descendantPath) return false;
  return descendantPath.startsWith(`${ancestorPath}/`);
}

function discoverCandidateRoots(options = {}) {
  const maxCandidates = Math.max(1, options.maxCandidates || 25);
  const scope = document.body || document.documentElement;
  const nodes = Array.from(scope.querySelectorAll('main, section, article, div, ul, ol, aside, [role], [itemtype]'));
  const candidates = [];

  nodes.forEach((node) => {
    if (!looksLikeContainer(node)) return;
    const score = quickCandidateScore(node);
    if (score < 3) return;
    candidates.push({
      element: node,
      score,
      repeated: dominantChildGroup(node)?.elements.length || 0,
      textLength: textOf(node).length,
      xpath: getXPath(node),
    });
  });

  candidates.sort((left, right) => (
    right.score - left.score
      || right.repeated - left.repeated
      || right.textLength - left.textLength
  ));

  const selected = [];
  candidates.forEach((candidate) => {
    if (selected.length >= maxCandidates) return;
    const overlaps = selected.some((existing) => pathIsAncestor(existing.xpath, candidate.xpath) || pathIsAncestor(candidate.xpath, existing.xpath));
    if (!overlaps) selected.push(candidate);
  });

  return selected.map((candidate) => candidate.element);
}

function extractCandidateRegions(rawHTML = '', responseHeaders = {}, options = {}) {
  const maxResults = Math.max(1, options.maxResults || 5);
  const roots = discoverCandidateRoots(options);
  const results = roots.map((root) => {
    const features = extractAllFeatures(root, rawHTML, responseHeaders);
    const summary = collectSampleText(root);
    const scoring = scoreFeatures(features);
    return Object.assign({}, features, summary, scoring);
  });

  results.sort((left, right) => (
    right.score - left.score
      || right.unit_count - left.unit_count
      || right.total_text_length - left.total_text_length
  ));

  const deduped = [];
  results.forEach((candidate) => {
    if (deduped.length >= maxResults) return;
    const overlaps = deduped.some((existing) => pathIsAncestor(existing.xpath, candidate.xpath) || pathIsAncestor(candidate.xpath, existing.xpath));
    if (!overlaps) deduped.push(candidate);
  });

  return (deduped.length ? deduped : results.slice(0, maxResults)).slice(0, maxResults);
}

if (typeof globalThis !== 'undefined') {
  globalThis.extractAllFeatures = extractAllFeatures;
  globalThis.extractCandidateRegions = extractCandidateRegions;
  globalThis.scoreFeatures = scoreFeatures;
  globalThis.inferUgcType = inferUgcType;
  globalThis.discoverCandidateRoots = discoverCandidateRoots;
}

if (typeof module !== 'undefined') {
  module.exports = {
    extractAllFeatures,
    extractCandidateRegions,
    scoreFeatures,
    inferUgcType,
    discoverCandidateRoots,
    collectSampleText,
    feat_tag_name,
    feat_classes,
    feat_attributes_data_aria_role,
    feat_text_statistics,
    feat_ui_hints,
    feat_child_tag_histogram,
    feat_depth,
    feat_xpath,
    feat_css_path,
    feat_shadow_dom_metadata,
    feat_parent_index,
    feat_structural_signature,
    feat_sigpath,
    feat_node_id,
    feat_repeating_group_count,
    feat_min_k_threshold_pass,
    feat_wildcard_xpath_template,
    feat_internal_depth_filter,
    feat_comment_header_with_count,
    feat_attributes_contain_keywords,
    feat_has_action_buttons,
    feat_has_more_options_button,
    feat_includes_author,
    feat_has_avatar,
    feat_has_text_content,
    feat_text_contains_links,
    feat_link_density,
    feat_text_contains_mentions_or_hashtags,
    feat_text_contains_emoji,
    feat_text_question_mark_count,
    feat_has_relative_time,
    feat_response_csp,
    feat_meta_charset,
    feat_og_type,
    feat_json_ld_comment,
    feat_framework_fingerprint,
    feat_html_lang,
    feat_preload_avatar,
    feat_csrf_token_in_form,
    feat_comment_route_in_scripts,
    feat_schema_org_comment,
    feat_aria_role_feed,
    feat_microdata_comment_props,
    feat_reply_button_per_unit,
    feat_author_avatar_colocation,
    feat_sig_id_recursive_nesting,
    feat_textarea_tree_proximity,
    feat_reaction_count_per_unit,
    feat_edit_delete_per_unit,
    feat_user_profile_link_per_unit,
    feat_reply_nesting_depth,
    feat_keyword_in_attributes,
    feat_sig_id_count_graduated,
    feat_internal_depth_and_tag_variety,
    feat_pagination_load_more,
    feat_char_counter_near_textarea,
    feat_submit_button_label,
    feat_sibling_homogeneity_score,
    feat_collapse_expand_control,
    feat_price_currency_in_unit,
    feat_nav_header_ancestor,
    feat_no_text_content_in_units,
    feat_add_to_cart_present,
    feat_high_external_link_density,
    feat_star_rating_no_text,
    feat_table_row_structure,
    feat_author_timestamp_colocated,
    feat_indent_margin_pattern,
    feat_share_button_per_unit,
    feat_upvote_downvote_pair,
    feat_permalink_per_unit,
    feat_deleted_placeholder,
    feat_quote_block_per_unit,
    feat_read_more_truncation,
    feat_has_edit_history,
    feat_pinned_post_indicator,
    feat_verification_badge,
    feat_spoiler_tag,
    feat_thread_depth_indicator,
    feat_external_link_density_low,
    feat_like_count_pattern,
    feat_interaction_counter_schema,
  };
}
