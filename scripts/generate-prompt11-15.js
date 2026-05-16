'use strict';

const path = require('path');

const {
  buildAvatarSvg,
  buildForest,
  chance,
  createRng,
  escapeHtml,
  intBetween,
  pick,
  renderTree,
  syncIndexCounts,
  wrapHtml,
  writePage,
} = require('./synthetic-page-utils');

const repoRoot = path.resolve(__dirname, '..');
const pagesRoot = path.join(repoRoot, 'synthetic_data', 'pages');
const indexPath = path.join(repoRoot, 'synthetic_data', 'INDEX.md');

const genericNames = [
  'Ari', 'Mina', 'Noel', 'Rae', 'Jules', 'Pia', 'Theo', 'Ivy', 'Cora', 'Drew',
  'Lena', 'Milo', 'Nora', 'Owen', 'Zia', 'Eli', 'Tess', 'Finn', 'Maya', 'Cal',
];

const genericPhrases = [
  'The structure is clean enough to be hydrated later.',
  'The page keeps the conversation readable without any extra chrome.',
  'The nested branch is there, but it does not overwhelm the layout.',
  'The author note is concise and stays close to the text.',
  'This feels like the output of a component-first rendering pipeline.',
  'The comments are easy to scan because the spacing stays consistent.',
  'The last branch is intentionally a little deeper than the rest.',
  'The visual hierarchy does most of the work here.',
  'The content fits the static shell well.',
  'The page reads like a server-rendered snapshot.',
];

const topicPairs11 = [
  ['Productive Notes', 'A discussion widget for a SaaS product page'],
  ['Document Flow', 'A custom element wrapped around technical feedback'],
  ['Portside Blog', 'A web component used on a design journal'],
  ['Launch Kit', 'A widget shell for a startup announcement'],
  ['Help Desk', 'A componentized support thread with slots and templates'],
];

const tagNames11 = [
  'comment-section',
  'discussion-widget',
  'user-comments',
  'ugc-comments',
  'reply-thread',
  'comment-list',
  'discussion-board',
  'wc-comment-section',
];

const frameworkTopics12 = [
  ['Next Frontier', 'A Next.js blog with hydrated comments'],
  ['Vue Harbor', 'A Nuxt community page with scoped attributes'],
  ['Angular Desk', 'An enterprise CMS using Angular-like markup'],
  ['Svelte Notes', 'A compiled Svelte page with clean output'],
  ['Lit Studio', 'A Lit page with template markers'],
];

const flatTopics13 = [
  ['Guestbook', 'A classic guestbook with linear entries'],
  ['Letters', 'A minimal reader letters page'],
  ['Reactions', 'A flat set of reader reactions after an article'],
  ['Voices', 'A timeless entry list with no hierarchy'],
  ['Responses', 'A pure sequence of reader responses'],
];

const safeHeadings14 = [
  'Voices',
  'Thoughts',
  'What You Are Saying',
  'Open Mic',
  'The Gallery',
  '47 Voices',
  'Your Perspective',
  'The Room',
];

const safeNames14 = [
  'Kai', 'Mina', 'Rae', 'Noah', 'Iris', 'Luca', 'Nia', 'Omar', 'Tess', 'Zuri',
  'Jules', 'Pia', 'Eden', 'Milo', 'Ava', 'Nico', 'Mira', 'Sage', 'Levi', 'Lena',
];

const safePhrases14 = [
  'The structure is obvious even without extra labels.',
  'That row is doing the heavy lifting on mobile.',
  'The little number at the end helps keep the flow moving.',
  'The visual rhythm makes the list easy to read.',
  'The first entry feels more prominent than the rest.',
  'The tiny symbol is enough to imply the next step.',
  'This page keeps the units clearly separated.',
  'The ordering is the main signal here.',
];

const brokenNames15 = [
  'Alpha', 'Beta', 'Gamma', 'Delta', 'Echo', 'Foxtrot', 'Guest', 'Anon', 'User12', 'Mira',
  'Noel', 'Tara', 'Luca', 'Ruth', 'Owen', 'Pia', 'Milo', 'Iris', 'Zed', 'Mina',
];

const brokenPhrases15 = [
  'The patch history is obvious from the mixed markup.',
  'One row uses a different template and nobody cleaned it up.',
  'The closing tags drifted over time and now they are inconsistent.',
  'The browser will probably fix this, but the source is messy.',
  'This line looks like it was pasted from a different CMS.',
  'The inline styles are doing way too much here.',
  'The duplicate IDs are not helping anything.',
  'The author label appears in three different forms on the same page.',
];

function renderCommentTree(node, childrenHtml, options = {}) {
  const avatar = options.showAvatar
    ? `<img class="avatar" src="${escapeHtml(node.avatar)}" alt="${escapeHtml(node.author)}">`
    : '';
  const meta = [
    `<span class="author">${escapeHtml(node.author)}</span>`,
    options.showTime ? `<time datetime="${node.datetime}">${escapeHtml(node.timeLabel)}</time>` : '',
    node.badge ? `<span class="badge">${escapeHtml(node.badge)}</span>` : '',
  ].filter(Boolean).join(' ');
  return [
    `<article class="${options.itemClass}" data-id="${escapeHtml(node.id)}" data-depth="${node.depth}">`,
    avatar,
    `<div class="${options.bodyClass}">`,
    `<div class="${options.metaClass}">${meta}</div>`,
    `<div class="${options.textClass}">${escapeHtml(node.body)}</div>`,
    options.showActions ? `<div class="${options.actionsClass}">${options.actions}</div>` : '',
    childrenHtml ? `<div class="${options.childrenClass}">${childrenHtml}</div>` : '',
    '</div>',
    '</article>',
  ].filter(Boolean).join('\n');
}

function buildPrompt11Page(pageNum) {
  const rng = createRng(11000 + pageNum);
  const topic = topicPairs11[(pageNum - 1) % topicPairs11.length];
  const tagName = tagNames11[(pageNum - 1) % tagNames11.length];
  const shadowMode = pageNum % 5 === 0 ? 'closed' : 'open';
  const useSlots = chance(rng, 0.35);
  const useTemplate = chance(rng, 0.3);
  const useObserved = chance(rng, 0.35);
  const multiWidget = chance(rng, 0.25);
  const composeInside = chance(rng, 0.55);
  const totalCount = intBetween(rng, 3, 20);
  const topLevelCount = intBetween(rng, 2, Math.min(6, totalCount));
  const maxDepth = intBetween(rng, 0, 2);

  const roots = buildForest(rng, {
    totalCount,
    topLevelCount: maxDepth === 0 ? totalCount : topLevelCount,
    maxDepth,
    ensureDepth: maxDepth,
    makeNode: ({ depth, index, path: nodePath, rng: nodeRng }) => {
      const author = pick(nodeRng, genericNames);
      const date = new Date(Date.UTC(2022, intBetween(nodeRng, 0, 11), intBetween(nodeRng, 1, 28), intBetween(nodeRng, 0, 23), intBetween(nodeRng, 0, 59)));
      return {
        id: `${pageNum}-${nodePath.join('-')}`,
        author,
        body: `${pick(nodeRng, genericPhrases)} ${depth >= 1 ? 'The nested branch is kept small on purpose.' : ''}`.trim(),
        timeLabel: pick(nodeRng, ['2 hours ago', 'Yesterday', '3 days ago', '1 week ago']),
        datetime: date.toISOString(),
        avatar: buildAvatarSvg(author, pick(nodeRng, ['#4d7ea8', '#4f8a63', '#8a5d3f', '#7a4f8d'])),
        badge: depth === 0 && index === 1 && chance(nodeRng, 0.35) ? 'Author' : '',
        depth,
      };
    },
  });

  const commentsHtml = renderTree(roots, (node, childrenHtml) => renderCommentTree(node, childrenHtml, {
    itemClass: 'item',
    bodyClass: 'body',
    metaClass: 'meta',
    textClass: 'text',
    actionsClass: 'actions',
    childrenClass: 'replies',
    showAvatar: true,
    showTime: true,
    showActions: true,
    actions: '<button type="button">Reply</button> <button type="button">Like</button>',
  }));

  const slotBlock = useSlots
    ? '<div class="slot-strip"><slot name="avatar"></slot><slot name="body"></slot></div>'
    : '';

  const composeBlock = composeInside
    ? '<form class="compose"><textarea rows="4" placeholder="Join the discussion"></textarea><button type="button">Post</button></form>'
    : '';

  const shadowStyle = [
    ':host { display: block; color: #1d2430; }',
    '.shell { border: 1px solid #d9dfe8; border-radius: 12px; padding: 16px; background: #fff; }',
    '.header { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; margin-bottom: 12px; }',
    '.header h2 { margin: 0; font-size: 18px; }',
    '.count { font-size: 12px; color: #667; }',
    '.item { border-top: 1px solid #e2e7ef; padding: 14px 0; }',
    '.item:first-child { border-top: 0; padding-top: 0; }',
    '.meta { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; font-size: 12px; color: #667; margin-bottom: 8px; }',
    '.avatar { width: 34px; height: 34px; border-radius: 50%; float: left; margin-right: 10px; }',
    '.text { line-height: 1.5; }',
    '.actions { margin-top: 8px; font-size: 12px; }',
    '.replies { margin-top: 12px; margin-left: 24px; padding-left: 12px; border-left: 2px solid #e4e8ef; }',
    '.compose { margin-top: 14px; padding-top: 14px; border-top: 1px solid #e2e7ef; display: grid; gap: 10px; }',
    '.compose textarea { width: 100%; min-height: 90px; box-sizing: border-box; font: inherit; border: 1px solid #cfd7e3; border-radius: 8px; padding: 10px; }',
    '.slot-strip { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }',
    ':host([theme="dark"]) .shell { background: #14171d; color: #e8edf4; border-color: #2b3240; }',
    ':host([theme="dark"]) .item, :host([theme="dark"]) .compose { border-color: #2b3240; }',
  ].join('\n');

  const shadowHtml = [
    `<style>${shadowStyle}</style>`,
    '<section class="shell">',
    slotBlock,
    `<header class="header"><h2>${escapeHtml(topic[1])}</h2><span class="count">${totalCount} entries</span></header>`,
    `<div class="list">${commentsHtml}</div>`,
    composeBlock,
    '</section>',
  ].filter(Boolean).join('\n');

  const templateBlock = useTemplate
    ? `<template id="comment-template"><article class="item"><div class="meta"><span class="author">Template</span> <time>Now</time></div><div class="text">Template entry.</div></article></template>`
    : '';

  const observedBits = useObserved
    ? [
      'static get observedAttributes() { return ["theme", "count"]; }',
      'attributeChangedCallback() { if (this.isConnected) this.render(); }',
    ].join('\n')
    : '';

  const lightDom = useSlots
    ? [
      '<img slot="avatar" src="https://example.invalid/avatar.png" alt="Avatar">',
      '<p slot="body">Projected body text stays in the light DOM.</p>',
    ].join('\n')
    : '<p>Fallback content for browsers without custom element support.</p>';

  const extraWidget = multiWidget
    ? [
      '<discussion-summary theme="dark">',
      '<span slot="title">Related</span>',
      '<p slot="body">A second custom element can live beside the main thread.</p>',
      '</discussion-summary>',
    ].join('\n')
    : '';

  const secondaryDefinition = multiWidget
    ? [
      '<script>',
      'customElements.define("discussion-summary", class extends HTMLElement {',
      '  connectedCallback() {',
      '    const root = this.attachShadow({ mode: "open" });',
      '    root.innerHTML = "<style>:host{display:block;margin-top:16px;border:1px solid #d9dfe8;padding:12px;border-radius:12px;background:#fafbfc} .card{font:inherit}</style><div class=\\"card\\"><slot name=\\"title\\"></slot><slot name=\\"body\\"></slot></div>";',
      '  }',
      '});',
      '</script>',
    ].join('\n')
    : '';

  const componentScript = [
    '<script>',
    `customElements.define(${JSON.stringify(tagName)}, class extends HTMLElement {`,
    '  constructor() {',
    '    super();',
    `    this._mode = ${JSON.stringify(shadowMode)};`,
    '  }',
    '  render() {',
    '    const root = this._root || this.shadowRoot || (this._root = this.attachShadow({ mode: this._mode }));',
    `    root.innerHTML = ${JSON.stringify(shadowHtml)};`,
    '  }',
    '  connectedCallback() {',
    '    this.render();',
    '  }',
    '  ',
    observedBits,
    '});',
    '</script>',
  ].filter((line) => line !== '  ').join('\n');

  const inner = [
    `<${tagName} theme="light" post-id="${pageNum}" count="${totalCount}"${useSlots ? ' data-slotted="true"' : ''}>`,
    lightDom,
    `</${tagName}>`,
    extraWidget,
  ].join('\n');

  const content = [
    '<div class="page">',
    '<header class="hero"><p class="kicker">Web Component</p><h1>' + escapeHtml(topic[0]) + '</h1><p class="lede">' + escapeHtml(topic[1]) + '</p></header>',
    templateBlock,
    componentScript,
    secondaryDefinition,
    inner,
    '</div>',
  ].filter(Boolean).join('\n');

  const css = [
    'body { margin: 0; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f3f5f8; color: #1d2430; }',
    '.page { width: min(960px, calc(100% - 24px)); margin: 0 auto; padding: 20px 0 40px; }',
    '.hero { background: #fff; border: 1px solid #d9dfe8; border-radius: 12px; padding: 18px; margin-bottom: 16px; }',
    '.hero h1 { margin: 4px 0 8px; font-size: 28px; }',
    '.hero .lede { margin: 0; color: #56606f; }',
    ':not(:defined) { display: block; }',
  ].join('\n');

  return wrapHtml({
    title: `${topic[0]} - ${topic[1]}`,
    bodyContent: content,
    headExtras: `<style>${css}</style>`,
  });
}

function renderFrameworkComment(node, framework, childrenHtml) {
  const attrs = [
    `data-id="${escapeHtml(node.id)}"`,
    `data-depth="${node.depth}"`,
  ];
  const meta = [
    `<span class="${framework.authorClass}">${escapeHtml(node.author)}</span>`,
    `<time class="${framework.timeClass}">${escapeHtml(node.timeLabel)}</time>`,
  ].join(' ');
  const body = [
    `<${framework.itemTag} class="${framework.itemClass}" ${attrs.join(' ')} ${framework.itemAttrs || ''}>`,
    `<div class="${framework.metaClass}">${meta}</div>`,
    `<div class="${framework.bodyClass}">${escapeHtml(node.body)}</div>`,
    childrenHtml ? `<div class="${framework.childrenClass}">${childrenHtml}</div>` : '',
    `</${framework.itemTag}>`,
  ].filter(Boolean).join('\n');
  return body;
}

function buildPrompt12Page(pageNum) {
  const rng = createRng(12000 + pageNum);
  const framework = [
    {
      key: 'react',
      label: 'React / Next.js',
      rootTag: 'div',
      itemTag: 'article',
      rootClass: 'CommentSection_comments__3xK9p',
      itemClass: 'CommentItem_author__xK3p',
      bodyClass: 'CommentItem_body__9mRe',
      metaClass: 'CommentItem_meta__7fQa',
      authorClass: 'CommentItem_author__xK3p',
      timeClass: 'CommentItem_time__9mRe',
      childrenClass: 'CommentItem_replies__2kHz',
      rootAttrs: 'data-reactroot=""',
      extraHead: '<!-- react-mount-point-unstable -->',
    },
    {
      key: 'vue',
      label: 'Vue 3',
      rootTag: 'section',
      itemTag: 'article',
      rootClass: 'comment-shell',
      itemClass: 'comment-item',
      bodyClass: 'comment-body',
      metaClass: 'comment-meta',
      authorClass: 'comment-author',
      timeClass: 'comment-date',
      childrenClass: 'comment-children',
      rootAttrs: 'data-v-4a3b2c1d',
      itemAttrs: 'data-v-4a3b2c1d',
      extraHead: '<!-- <CommentList> -->',
    },
    {
      key: 'angular',
      label: 'Angular',
      rootTag: 'app-comments',
      itemTag: 'article',
      rootClass: 'comment-shell',
      itemClass: 'comment-item',
      bodyClass: 'comment-body',
      metaClass: 'comment-meta',
      authorClass: 'comment-author',
      timeClass: 'comment-time',
      childrenClass: 'comment-children',
      rootAttrs: '_nghost-abc-c123',
      itemAttrs: '_ngcontent-abc-c123',
      extraHead: '',
    },
    {
      key: 'svelte',
      label: 'Svelte',
      rootTag: 'section',
      itemTag: 'article',
      rootClass: 'svelte-1a2b3c comments',
      itemClass: 'svelte-1a2b3c comment-item',
      bodyClass: 'comment-body',
      metaClass: 'comment-meta',
      authorClass: 'comment-author',
      timeClass: 'comment-time',
      childrenClass: 'comment-children',
      rootAttrs: '',
      itemAttrs: '',
      extraHead: '',
    },
    {
      key: 'lit',
      label: 'Lit / Polymer',
      rootTag: 'div',
      itemTag: 'article',
      rootClass: 'comment-app',
      itemClass: 'comment-item',
      bodyClass: 'comment-body',
      metaClass: 'comment-meta',
      authorClass: 'comment-author',
      timeClass: 'comment-time',
      childrenClass: 'comment-children',
      rootAttrs: 'data-lit-root="true" __litHtml',
      itemAttrs: 'data-lit-part=""',
      extraHead: '<!--lit-part-->',
    },
  ][(pageNum - 1) % 5];
  const topic = frameworkTopics12[(pageNum - 1) % frameworkTopics12.length];
  const totalCount = intBetween(rng, 3, 25);
  const topLevelCount = intBetween(rng, 2, Math.min(7, totalCount));
  const maxDepth = intBetween(rng, 0, 2);
  const showSkeleton = chance(rng, 0.25);
  const showError = chance(rng, 0.1);
  const showSpacer = chance(rng, 0.15);
  const showHydration = framework.key === 'react' && chance(rng, 0.5);

  const roots = buildForest(rng, {
    totalCount,
    topLevelCount: maxDepth === 0 ? totalCount : topLevelCount,
    maxDepth,
    ensureDepth: maxDepth,
    makeNode: ({ depth, index, path: nodePath, rng: nodeRng }) => ({
      id: `${pageNum}-${nodePath.join('-')}`,
      author: pick(nodeRng, genericNames),
      body: `${pick(nodeRng, genericPhrases)} ${chance(nodeRng, 0.25) ? 'The framework output keeps the markup very stable.' : ''}`.trim(),
      timeLabel: pick(nodeRng, ['1 hour ago', 'Yesterday', '2 days ago', '3 days ago']),
      depth,
    }),
  });

  const commentsHtml = renderTree(roots, (node, childrenHtml) => renderFrameworkComment(node, framework, childrenHtml));
  const visibleComments = showSpacer ? renderTree(roots.slice(0, Math.min(10, roots.length)), (node, childrenHtml) => renderFrameworkComment(node, framework, childrenHtml)) : commentsHtml;

  const skeleton = showSkeleton
    ? '<div class="skeleton-list"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>'
    : '';
  const errorBoundary = showError
    ? '<div data-reactroot class="error-boundary">Something went wrong loading comments</div>'
    : '';
  const spacer = showSpacer ? '<div class="virtual-scroll-spacer" style="height:4200px"></div>' : '';
  const hydration = showHydration ? '<!--$--><template id="B:0"></template><!--/$-->' : '';
  const nextData = framework.key === 'react'
    ? `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { comments: roots.length } } })}</script>`
    : '';

  const rootAttrs = framework.rootAttrs ? ` ${framework.rootAttrs}` : '';
  const rootStart = `<${framework.rootTag} class="${framework.rootClass}"${rootAttrs}>`;
  const rootEnd = `</${framework.rootTag}>`;

  const css = [
    'body { margin: 0; font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f5f7fa; color: #1d2430; }',
    '.page { width: min(960px, calc(100% - 24px)); margin: 0 auto; padding: 20px 0 44px; }',
    '.hero { background: #fff; border: 1px solid #d9dfe8; border-radius: 12px; padding: 18px; margin-bottom: 16px; }',
    '.hero h1 { margin: 4px 0 8px; font-size: 28px; }',
    '.hero .lede { margin: 0; color: #586575; }',
    '.comment-shell, .CommentSection_comments__3xK9p, .comment-app, .svelte-1a2b3c.comments { background: #fff; border: 1px solid #d9dfe8; border-radius: 12px; padding: 16px; }',
    '.comment-item { border-top: 1px solid #e2e7ef; padding: 14px 0; }',
    '.comment-item:first-child { border-top: 0; padding-top: 0; }',
    '.comment-meta { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 8px; font-size: 12px; color: #667; }',
    '.comment-body { line-height: 1.5; }',
    '.comment-children { margin-top: 12px; margin-left: 24px; padding-left: 12px; border-left: 2px solid #e4e8ef; }',
    '.skeleton-list { display: grid; gap: 10px; }',
    '.skeleton { height: 54px; border-radius: 12px; background: linear-gradient(90deg, #edf1f6, #f7f9fc, #edf1f6); }',
    '.error-boundary { margin-bottom: 14px; padding: 12px 14px; background: #fff8e5; border: 1px solid #ead29b; border-radius: 10px; color: #745400; }',
    '.virtual-scroll-spacer { background: transparent; }',
  ].join('\n');

  const commentsList = [
    hydration,
    errorBoundary,
    skeleton,
    `<div class="comments-root">${visibleComments}</div>`,
    spacer,
  ].filter(Boolean).join('\n');

  const body = [
    '<div class="page">',
    '<section class="hero">',
    `<p class="kicker">${escapeHtml(framework.label)}</p>`,
    `<h1>${escapeHtml(topic[0])}</h1>`,
    `<p class="lede">${escapeHtml(topic[1])}</p>`,
    '</section>',
    `${rootStart}`,
    commentsList,
    rootEnd,
    '</div>',
  ].join('\n');

  const headExtras = [
    `<style>${css}</style>`,
    nextData,
    framework.extraHead || '',
  ].filter(Boolean);

  return wrapHtml({
    title: `${topic[0]} - ${topic[1]}`,
    bodyContent: body,
    headExtras,
  });
}

function renderFlatItem(node, mode, options = {}) {
  const meta = options.showTime ? `<time datetime="${node.datetime}">${escapeHtml(node.timeLabel)}</time>` : '';
  const avatar = options.showAvatar ? `<img class="avatar" src="${escapeHtml(node.avatar)}" alt="${escapeHtml(node.author)}">` : '';
  const bodyText = `<div class="body">${escapeHtml(node.body)}</div>`;
  const pin = node.pinned ? '<span class="pin">Pinned</span>' : '';
  const featured = node.featured ? '<span class="featured">Featured</span>' : '';

  if (mode === 'dl') {
    return [
      `<dt><span class="author">${escapeHtml(node.author)}</span> ${pin}${featured} ${meta}</dt>`,
      `<dd>${bodyText}</dd>`,
    ].join('\n');
  }

  if (mode === 'table') {
    return `<tr><th scope="row">${escapeHtml(node.author)}${pin}${featured}</th><td>${bodyText} ${meta}</td></tr>`;
  }

  if (mode === 'p') {
    return `<p><b>${escapeHtml(node.author)}:</b> ${escapeHtml(node.body)} ${meta}</p>`;
  }

  if (mode === 'article') {
    return [
      `<article class="item">`,
      avatar,
      `<div class="content"><header><strong>${escapeHtml(node.author)}</strong> ${pin}${featured} ${meta}</header>${bodyText}</div>`,
      '</article>',
    ].join('\n');
  }

  return [
    `<li class="item">`,
    avatar,
    `<div class="content"><span class="author">${escapeHtml(node.author)}</span> ${pin}${featured} ${meta}${bodyText}</div>`,
    '</li>',
  ].join('\n');
}

function buildPrompt13Page(pageNum) {
  const rng = createRng(13000 + pageNum);
  const topic = flatTopics13[(pageNum - 1) % flatTopics13.length];
  const modes = ['ul', 'ol', 'div', 'article', 'dl', 'table', 'p'];
  const mode = modes[(pageNum - 1) % modes.length];
  const count = chance(rng, 0.1) ? 1 : intBetween(rng, 2, 30);
  const showCompose = chance(rng, 0.9);
  const composePos = ['top', 'bottom', 'none'][(pageNum - 1) % 3];
  const eraseHeading = chance(rng, 0.08);
  const commentPolicy = chance(rng, 0.3);
  const approvalNotice = chance(rng, 0.1);
  const pinned = chance(rng, 0.2);

  const entries = Array.from({ length: count }, (_, index) => {
    const id = index + 1;
    const date = new Date(Date.UTC(2016, intBetween(rng, 0, 11), intBetween(rng, 1, 28), intBetween(rng, 0, 23), intBetween(rng, 0, 59)));
    const author = pick(rng, genericNames);
    return {
      id,
      author,
      body: `${pick(rng, genericPhrases)} ${topic[1].toLowerCase().includes('minimal') ? 'The linear order is the whole point.' : ''}`.trim(),
      datetime: date.toISOString(),
      timeLabel: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      avatar: buildAvatarSvg(author, pick(rng, ['#4d7ea8', '#4f8a63', '#8a5d3f', '#7a4f8d'])),
      pinned: pinned && id === 1,
      featured: pinned && id === 1 && chance(rng, 0.5),
    };
  });

  const items = entries.map((entry) => renderFlatItem(entry, mode, { showTime: chance(rng, 0.8), showAvatar: chance(rng, 0.7) })).join('\n');
  const headingText = eraseHeading ? '' : `${topic[0]} (${count})`;

  const compose = showCompose
    ? [
      '<form class="compose">',
      composePos === 'top' ? '<label>Name <input type="text" name="name"></label>' : '',
      composePos === 'top' ? '<label>Email <input type="email" name="email"></label>' : '',
      '<label>Message <textarea rows="4"></textarea></label>',
      '<button type="button">Send</button>',
      '</form>',
    ].join('\n')
    : '';

  const labelNote = commentPolicy ? '<p class="policy">Please keep it short and civil.</p>' : '';
  const approval = approvalNotice ? '<div class="approval">Your entry has been received and is awaiting approval.</div>' : '';
  const heading = eraseHeading ? '' : `<h2>${escapeHtml(headingText)}</h2>`;

  const css = [
    'body { margin: 0; font-family: Georgia, "Times New Roman", serif; background: #faf7f2; color: #2a241d; }',
    '.page { width: min(920px, calc(100% - 24px)); margin: 0 auto; padding: 20px 0 44px; }',
    '.story { background: #fff; border: 1px solid #ddd3c5; padding: 18px; margin-bottom: 16px; }',
    '.story h1 { margin: 4px 0 8px; font-size: 28px; }',
    '.story .lede { margin: 0; color: #6d5f52; }',
    '.guestbook, .comments, .feed { background: #fff; border: 1px solid #ddd3c5; padding: 18px; }',
    '.item { margin-bottom: 14px; }',
    '.avatar { width: 34px; height: 34px; border-radius: 50%; vertical-align: middle; margin-right: 8px; }',
    '.author { font-weight: 700; }',
    '.pin, .featured { display: inline-block; margin-left: 6px; padding: 1px 6px; border-radius: 999px; background: #fff2c6; font-size: 11px; }',
    '.compose { margin-bottom: 16px; display: grid; gap: 10px; max-width: 520px; }',
    '.compose input, .compose textarea { width: 100%; box-sizing: border-box; border: 1px solid #cfc4b4; padding: 8px 10px; font: inherit; }',
    '.policy, .approval { margin: 0 0 12px; padding: 10px 12px; background: #f7f2ea; border: 1px solid #e4d7c4; }',
    'table { width: 100%; border-collapse: collapse; }',
    'th, td { vertical-align: top; padding: 10px 8px; border-top: 1px solid #e6ddd1; text-align: left; }',
    'dl dt { margin-top: 12px; font-weight: 700; }',
    'dl dd { margin: 4px 0 0 0; padding-bottom: 12px; border-bottom: 1px solid #e6ddd1; }',
    '.item .content { display: block; }',
  ].join('\n');

  const content = [
    '<div class="page">',
    '<section class="story">',
    `<p class="kicker">${escapeHtml(topic[0])}</p>`,
    `<h1>${escapeHtml(topic[1])}</h1>`,
    '<p class="lede">The list is intentionally linear, with no replies or branches anywhere in the structure.</p>',
    '</section>',
    '<section class="guestbook">',
    composePos === 'top' ? compose : '',
    heading,
    labelNote,
    approval,
    mode === 'table' ? `<table><tbody>${items}</tbody></table>` : '',
    mode === 'dl' ? `<dl>${items}</dl>` : '',
    mode === 'p' ? `<div class="feed">${items}</div>` : '',
    mode === 'div' ? `<div class="feed">${items}</div>` : '',
    mode === 'article' ? `<div class="feed">${items}</div>` : '',
    mode === 'ul' ? `<ul>${items}</ul>` : '',
    mode === 'ol' ? `<ol>${items}</ol>` : '',
    composePos === 'bottom' ? compose : '',
    '</section>',
    '</div>',
  ].filter(Boolean).join('\n');

  return wrapHtml({
    title: `${topic[0]} - ${topic[1]}`,
    bodyContent: content,
    headExtras: `<style>${css}</style>`,
  });
}

function assertSafeHtml(html) {
  const lower = html.toLowerCase();
  const forbidden = ['comment', 'reply', 'discuss', 'discussion', 'feedback', 'response', 'responses', 'thread', 'threads', 'threaded'];
  for (const word of forbidden) {
    if (lower.includes(word)) {
      throw new Error(`Forbidden token "${word}" leaked into prompt 14 HTML`);
    }
  }
}

function buildPrompt14Page(pageNum) {
  const rng = createRng(14000 + pageNum);
  const heading = safeHeadings14[(pageNum - 1) % safeHeadings14.length];
  const totalCount = intBetween(rng, 3, 20);
  const topLevelCount = intBetween(rng, 2, Math.min(6, totalCount));
  const maxDepth = intBetween(rng, 0, 2);
  const showTime = !chance(rng, 0.2);
  const showAvatar = !chance(rng, 0.15);
  const showCompose = chance(rng, 0.5);
  const replyAction = chance(rng, 0.45);
  const useCustom = chance(rng, 0.35);
  const useTable = chance(rng, 0.2);

  const roots = buildForest(rng, {
    totalCount,
    topLevelCount: maxDepth === 0 ? totalCount : topLevelCount,
    maxDepth,
    ensureDepth: maxDepth,
    makeNode: ({ depth, index, path: nodePath, rng: nodeRng }) => {
      const date = new Date(Date.UTC(2020, intBetween(nodeRng, 0, 11), intBetween(nodeRng, 1, 28), intBetween(nodeRng, 0, 23), intBetween(nodeRng, 0, 59)));
      const author = pick(nodeRng, safeNames14);
      return {
        id: `${pageNum}-${nodePath.join('-')}`,
        author,
        body: `${pick(nodeRng, safePhrases14)} ${depth >= 1 ? 'The indentation is still the key signal.' : ''}`.trim(),
        timeLabel: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        avatar: buildAvatarSvg(author, pick(nodeRng, ['#4d7ea8', '#4f8a63', '#8a5d3f', '#7a4f8d'])),
        depth,
      };
    },
  });

  const itemHtml = renderTree(roots, (node, childrenHtml) => {
    const reply = replyAction ? '<button type="button">↩</button>' : '';
    const time = showTime ? `<time>${escapeHtml(node.timeLabel)}</time>` : '';
    const avatar = showAvatar ? `<img class="avatar" src="${escapeHtml(node.avatar)}" alt="${escapeHtml(node.author)}">` : '';
    const body = [
      `<article class="voice-entry" data-voice-id="${escapeHtml(node.id)}" data-depth="${node.depth}">`,
      avatar,
      '<div class="voice-body">',
      `<div class="voice-meta"><span class="voice-name">${escapeHtml(node.author)}</span> ${time}</div>`,
      `<div class="voice-text">${escapeHtml(node.body)}</div>`,
      reply ? `<div class="voice-actions">${reply}</div>` : '',
      childrenHtml ? `<div class="voice-children">${childrenHtml}</div>` : '',
      '</div>',
      '</article>',
    ].filter(Boolean).join('\n');
    return body;
  });

  const form = showCompose
    ? [
      '<form class="voice-form">',
      '<label>Name <input type="text" name="name"></label>',
      '<label>Message <textarea rows="4" placeholder="What are you thinking?"></textarea></label>',
      '<button type="button">Send</button>',
      '</form>',
    ].join('\n')
    : '';

  const shellTag = useCustom ? 'community-board' : 'section';
  const shellStart = useCustom ? `<community-board class="voice-board">` : '<section class="voice-board">';
  const shellEnd = useCustom ? '</community-board>' : '</section>';
  const boardClass = useCustom ? 'voice-board voice-board--custom' : 'voice-board';
  const listClass = useTable ? 'voice-table' : 'voice-list';
  const content = useTable
    ? `<table class="${listClass}"><tbody>${itemHtml}</tbody></table>`
    : itemHtml;
  const headingText = chance(rng, 0.15) ? heading : `${heading} (${totalCount})`;

  const css = [
    'body { margin: 0; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f8f7f3; color: #25211d; }',
    '.page { width: min(900px, calc(100% - 24px)); margin: 0 auto; padding: 20px 0 40px; }',
    '.story { background: #fff; border: 1px solid #ddd5c8; padding: 18px; margin-bottom: 16px; }',
    '.story h1 { margin: 4px 0 8px; font-size: 28px; }',
    '.voice-board { background: #fff; border: 1px solid #ddd5c8; padding: 18px; }',
    '.voice-entry { margin-bottom: 14px; }',
    '.voice-meta { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; font-size: 12px; color: #6a6256; margin-bottom: 8px; }',
    '.voice-name { font-weight: 700; color: #29231d; }',
    '.voice-text { line-height: 1.5; }',
    '.voice-children { margin-top: 12px; margin-left: 24px; padding-left: 12px; border-left: 2px solid #e2dbd0; }',
    '.voice-form { margin-top: 14px; display: grid; gap: 10px; max-width: 520px; }',
    '.voice-form input, .voice-form textarea { width: 100%; box-sizing: border-box; border: 1px solid #cfc3b2; padding: 8px 10px; font: inherit; }',
    '.avatar { width: 30px; height: 30px; border-radius: 50%; vertical-align: middle; margin-right: 8px; }',
    '.voice-actions { margin-top: 8px; font-size: 12px; }',
    '.voice-table { width: 100%; border-collapse: collapse; }',
    '.voice-table td, .voice-table th { border-top: 1px solid #e6ddd1; text-align: left; padding: 10px 8px; }',
    '.voice-board--custom { display: block; }',
    '.voice-board--custom .voice-entry { margin-bottom: 12px; }',
  ].join('\n');

  const html = [
    '<div class="page">',
    '<section class="story">',
    `<p class="kicker">${escapeHtml(heading)}</p>`,
    `<h1>${escapeHtml(headingText)}</h1>`,
    '<p class="lede">The detector should still recognize the repeated units without relying on any forbidden vocabulary.</p>',
    '</section>',
    `${shellStart}`,
    content,
    form,
    shellEnd,
    '</div>',
  ].join('\n');

  const full = wrapHtml({
    title: `${heading} - ${headingText}`,
    bodyContent: html,
    headExtras: `<style>${css}</style>`,
  });

  assertSafeHtml(full);
  return full;
}

function renderBrokenFragment(node, category, nextFragment) {
  const name = escapeHtml(node.author);
  const text = escapeHtml(node.body);
  if (category === 'mixed') {
    return [
      '<div class="comment-row">',
      `<table><tr><td><b>${name}</b></td><td>${text}</td></tr>`,
      `<div class="legacy-note">${text}</div>`,
    ].join('\n');
  }
  if (category === 'malformed') {
    return [
      `<div id="comment" class=comment style="background:#fff;padding:10px">`,
      `<span id="author">${name}</span>`,
      `<p>${text}`,
      `<a href="#">Read more</a>`,
    ].join('\n');
  }
  if (category === 'inline') {
    return [
      `<div style="background:#fff;padding:10px;margin:8px 0">`,
      `<div style="background-color:#f9f9f9;padding:12px 16px;margin:8px 0">${name}</div>`,
      `<div style="background:lightyellow;border:1px solid #ccc">${text}</div>`,
    ].join('\n');
  }
  if (category === 'duplicate') {
    return [
      `<div id="comment">`,
      `<span id="author">${name}</span>`,
      `<div>${text}</div>`,
      nextFragment ? nextFragment : '',
    ].join('\n');
  }
  if (category === 'inconsistent') {
    const options = [
      `<article><header><strong>${name}</strong></header><p>${text}</p></article>`,
      `<div>${name}: ${text}</div>`,
      `<blockquote>${text}</blockquote>`,
      `<li>${name} - ${text}</li>`,
    ];
    return options[0];
  }
  if (category === 'accessibility') {
    return [
      `<div tabindex="5" class="comment-item">`,
      `<span tabindex="2">Label text</span>`,
      `<span>${name}</span>`,
      `<img src="like-icon.png">12`,
      `<a href="#" onclick="void(0)">Re:</a>`,
      `<textarea>${text}`,
    ].join('\n');
  }
  return [
    `<div class="featured-comment">${name}</div>`,
    `<div class="comment-new">${text}</div>`,
  ].join('\n');
}

function buildPrompt15Page(pageNum) {
  const rng = createRng(15000 + pageNum);
  const title = chance(rng, 0.2) ? '' : pick(rng, ['Mixed Legacy Thread', 'Broken Archive', 'Long-Patched Conversation', 'Old CMS Notes']);
  const totalCount = intBetween(rng, 3, 15);
  const brokenCompose = chance(rng, 0.3);
  const emptyHeading = chance(rng, 0.2);
  const duplicateEntry = chance(rng, 0.15);
  const categoryPool = ['mixed', 'malformed', 'inline', 'duplicate', 'inconsistent', 'accessibility', 'dead'];
  const categories = Array.from(new Set([
    pick(rng, categoryPool),
    pick(rng, categoryPool),
    pick(rng, categoryPool),
  ]));

  const entries = Array.from({ length: totalCount }, (_, index) => {
    const id = index + 1;
    const date = new Date(Date.UTC(2011, intBetween(rng, 0, 11), intBetween(rng, 1, 28), intBetween(rng, 0, 23), intBetween(rng, 0, 59)));
    return {
      id,
      author: pick(rng, brokenNames15),
      body: `${pick(rng, brokenPhrases15)} ${chance(rng, 0.35) ? 'The layout keeps breaking in different ways.' : ''}`.trim(),
      timeLabel: date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      depth: 0,
    };
  });

  const commentFragments = entries.map((entry, index) => {
    const category = categories[index % categories.length];
    const next = duplicateEntry && index === 1 ? '<div id="comment">cut off mid-tag' : '';
    return renderBrokenFragment(entry, category, next);
  }).join('\n');

  const composeBlock = brokenCompose
    ? '<div class="comment-form"><textarea rows="4"></textarea><button type="button">Post</button></div>'
    : '<div class="login-prompt"><a href="/login">Log in</a> to join the discussion</div>';

  const headingMarkup = emptyHeading ? '<h2 class="comments-title"></h2>' : `<h2 class="comments-title">${escapeHtml(title || 'Comments')}</h2>`;
  const noticeMarkup = chance(rng, 0.25) ? '<div class="comments-closed">Comments are closed.</div>' : '';

  const css = [
    'body { margin: 0; font-family: Arial, Helvetica, sans-serif; background: #f3efe8; color: #25211d; }',
    '.page { width: min(920px, calc(100% - 24px)); margin: 0 auto; padding: 20px 0 40px; }',
    '.story { background: #fff; border: 1px solid #ddd3c5; padding: 18px; margin-bottom: 16px; }',
    '.story h1 { margin: 4px 0 8px; font-size: 28px; }',
    '.legacy-shell { background: #fff; border: 1px solid #ddd3c5; padding: 18px; }',
    '.comment-row, .comment-item, .featured-comment, .comment-new { margin-bottom: 12px; }',
    '.comment-form textarea { width: 100%; box-sizing: border-box; min-height: 88px; }',
    '.comments-closed { margin-bottom: 12px; padding: 10px 12px; background: #fff2c6; border: 1px solid #ead29b; }',
    '.legacy-note { font-size: 12px; color: #6a6256; }',
    '.comment-item { display: inline-block; }',
  ].join('\n');

  const html = [
    '<div class="page">',
    '<section class="story">',
    `<p class="kicker">Legacy Archive</p>`,
    `<h1>${escapeHtml(title || 'Broken legacy archive')}</h1>`,
    '<p class="lede">This page intentionally mixes eras, malformed tags, duplicated ids, and conflicting styles.</p>',
    '</section>',
    '<section class="legacy-shell">',
    noticeMarkup,
    headingMarkup,
    '<div class="intro" style="background:#fff;padding:10px">The archive was patched several times.</div>',
    commentFragments,
    composeBlock,
    '</section>',
    '</div>',
  ].join('\n');

  const full = [
    '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN">',
    '<html>',
    '<head>',
    '<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1">',
    `<title>${escapeHtml(title || 'Broken legacy archive')}</title>`,
    `<style>${css}</style>`,
    '</head>',
    '<body>',
    html,
    '</body>',
    '</html>',
  ].join('\n');

  return full;
}

function generatePages(outputDir, builder) {
  for (let pageNum = 1; pageNum <= 100; pageNum += 1) {
    writePage(outputDir, pageNum, builder(pageNum));
  }
}

function main() {
  generatePages(path.join(pagesRoot, 'prompt_11'), buildPrompt11Page);
  generatePages(path.join(pagesRoot, 'prompt_12'), buildFramework12Page);
  generatePages(path.join(pagesRoot, 'prompt_13'), buildPrompt13Page);
  generatePages(path.join(pagesRoot, 'prompt_14'), buildPrompt14Page);
  generatePages(path.join(pagesRoot, 'prompt_15'), buildPrompt15Page);
  syncIndexCounts(indexPath, pagesRoot, 40);
  console.log(`Updated ${indexPath}`);
}

function buildFramework12Page(pageNum) {
  return buildPrompt12Page(pageNum);
}

main();
