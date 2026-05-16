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

const hostTopics06 = [
  {
    site: 'North Shore Daily',
    title: 'Comments under the city hall investigation',
    lede: 'Readers are reacting to the latest report and the city response.',
  },
  {
    site: 'Pixel & Pipe',
    title: 'Review: a podcast episode about old routers',
    lede: 'The embed sits under a long-form review and a transcript excerpt.',
  },
  {
    site: 'Front Page Wire',
    title: 'Morning briefing: transit delays across the metro area',
    lede: 'The thread opens under a news story with a small social log-in row.',
  },
  {
    site: 'Channel Note',
    title: 'New camera demo video and the first wave of reactions',
    lede: 'The comments load in a third-party widget below the player.',
  },
  {
    site: 'Garden Bench',
    title: 'A blog post about repairing a cracked planter',
    lede: 'The page uses an embedded widget to keep the conversation in one place.',
  },
  {
    site: 'Signal Camp',
    title: 'Launch-day feedback on a local weather app',
    lede: 'The discussion wrapper is carrying a mix of praise and bug reports.',
  },
];

const embedCommentPhrases = [
  'The widget loaded faster than I expected on mobile.',
  'That explanation made the layout choice easier to follow.',
  'I had the same issue after the last update and this fixed it.',
  'The conversation looks noisy, but there are some useful details here.',
  'I would pin the answer with the verified badge near the top.',
  'The load more button is doing a lot of work on this page.',
  'This feels like the kind of thread people bookmark and return to later.',
  'I left a note for the editor because the theme toggle is helpful.',
  'There are a few spammy replies, but the main answers are still readable.',
  'The social login row is still more familiar than a full sign-up wall.',
];

const embedAuthors = [
  'Maya', 'Otis', 'Nora', 'Cal', 'Jules', 'Iris', 'Ben', 'Tara', 'Eli', 'Rae',
  'Parker', 'Mila', 'Glen', 'Zia', 'Noah', 'Faye', 'Ruth', 'Soren', 'Lena', 'Drew',
];

const socialLogins = ['Facebook', 'Twitter', 'Google', 'Email'];
const sortTabs = ['Best', 'Newest', 'Oldest'];

const embedPlatforms = [
  {
    key: 'disqus',
    label: 'Disqus',
    containerId: 'disqus_thread',
    rootClass: 'dsq-widget',
    listClass: 'dsq-comments',
    itemClass: 'dsq-comment',
    replyClass: 'dsq-reply',
    metaClass: 'dsq-comment-header',
    bodyClass: 'dsq-comment-body',
    actionsClass: 'dsq-actions',
    avatarClass: 'dsq-avatar',
    composeClass: 'dsq-compose',
    loginClass: 'dsq-login',
    sortClass: 'dsq-sort-tabs',
    voteClass: 'dsq-votes',
    timeClass: 'time-ago',
    badgeClass: 'badge',
    loader: 'var disqus_config = function() { this.page.url = window.location.href; };',
    noscript: 'Please enable JavaScript to view comments powered by Disqus.',
    voteMode: 'up',
    allowThemeToggle: true,
  },
  {
    key: 'livefyre',
    label: 'Livefyre',
    containerId: 'livefyre-comments',
    rootClass: 'fyre fyre-stream',
    listClass: 'fyre-comment-list',
    itemClass: 'fyre-comment fyre-comment-wrapper',
    replyClass: 'fyre-replies',
    metaClass: 'fyre-comment-meta',
    bodyClass: 'fyre-comment-article',
    actionsClass: 'fyre-actions',
    avatarClass: 'fyre-avatar',
    composeClass: 'fyre-editor',
    loginClass: 'fyre-login',
    sortClass: 'fyre-sort-tabs',
    voteClass: 'fyre-reaction-bar',
    timeClass: 'fyre-time',
    badgeClass: 'fyre-badge',
    loader: 'window.fyre = window.fyre || {}; window.fyre.stream = true;',
    noscript: 'Please enable JavaScript to view the Livefyre conversation.',
    voteMode: 'like',
    allowThemeToggle: false,
  },
  {
    key: 'intensedebate',
    label: 'IntenseDebate',
    containerId: 'idc-container',
    rootClass: 'idc-container',
    listClass: 'idc-thread',
    itemClass: 'idc-comment',
    replyClass: 'idc-thread-sub',
    metaClass: 'idc-meta',
    bodyClass: 'idc-body',
    actionsClass: 'idc-actions',
    avatarClass: 'idc-avatar',
    composeClass: 'idc-editor',
    loginClass: 'idc-login',
    sortClass: 'idc-sort-tabs',
    voteClass: 'idc-votes',
    timeClass: 'idc-time',
    badgeClass: 'idc-badge',
    loader: 'var idcomments_acct = "sample"; var idcomments_post_id = "123";',
    noscript: 'Please enable JavaScript to view the IntenseDebate comments.',
    voteMode: 'both',
    allowThemeToggle: false,
  },
  {
    key: 'facebook',
    label: 'Facebook',
    containerId: 'facebook_comments',
    rootClass: 'UFIList',
    listClass: 'UFIList',
    itemClass: 'UFIComment',
    replyClass: 'UFICommentReplies',
    metaClass: 'UFICommentMeta',
    bodyClass: 'UFICommentBody',
    actionsClass: 'UFICommentActions',
    avatarClass: 'UFICommentActorImage',
    composeClass: 'UFIComposer',
    loginClass: 'pluginConnectButton',
    sortClass: 'UFICommentSort',
    voteClass: 'UFIReactionBar',
    timeClass: 'UFICommentTimestamp',
    badgeClass: 'UFICommentActorNameBadge',
    loader: 'window.FB = window.FB || {}; window.FB.XFBML = window.FB.XFBML || {};',
    noscript: 'Please enable JavaScript to view Facebook comments.',
    voteMode: 'like',
    allowThemeToggle: false,
    iframe: true,
  },
  {
    key: 'googleplus',
    label: 'Google+',
    containerId: 'gplus_comments',
    rootClass: 'Nd',
    listClass: 'Nd Y8',
    itemClass: 'Y8 OE',
    replyClass: 'Y8-replies',
    metaClass: 'Y8-meta',
    bodyClass: 'OE',
    actionsClass: 'Y8-actions',
    avatarClass: 'Y8-avatar',
    composeClass: 'Y8-editor',
    loginClass: 'Y8-login',
    sortClass: 'Y8-sort',
    voteClass: 'Y8-votes',
    timeClass: 'Y8-time',
    badgeClass: 'Y8-badge',
    loader: 'window.___gcfg = window.___gcfg || {};',
    noscript: 'Please enable JavaScript to view Google+ comments.',
    voteMode: 'none',
    allowThemeToggle: false,
  },
  {
    key: 'openweb',
    label: 'OpenWeb',
    containerId: 'sp_commentsWidget',
    rootClass: 'sp_commentsWidget',
    listClass: 'sp-thread',
    itemClass: 'sp-comment',
    replyClass: 'sp-comment-replies',
    metaClass: 'sp-comment-meta',
    bodyClass: 'sp-comment-body',
    actionsClass: 'sp-comment-actions',
    avatarClass: 'sp-user-avatar',
    composeClass: 'sp-editor',
    loginClass: 'sp-login',
    sortClass: 'sp-sort-tabs',
    voteClass: 'sp-reactions',
    timeClass: 'sp-time',
    badgeClass: 'sp-badge',
    loader: 'window.sp_commentsWidgetConfig = window.sp_commentsWidgetConfig || {};',
    noscript: 'Please enable JavaScript to view the OpenWeb comments.',
    voteMode: 'both',
    allowThemeToggle: true,
  },
];

const semanticTopics07 = [
  {
    site: 'Semantic Notes',
    title: 'A field guide to HTML5 article nesting',
    lede: 'The page leans hard into article, section, header, and footer semantics.',
  },
  {
    site: 'Studio Archive',
    title: 'Why the author bio moved into an aside',
    lede: 'This one keeps the conversation adjacent to a long editorial post.',
  },
  {
    site: 'Code Journal',
    title: 'A tutorial with structured replies and citations',
    lede: 'The markup uses time, cite, and mark to keep the history readable.',
  },
  {
    site: 'Paper Trail',
    title: 'Environmental commentary with threaded annotations',
    lede: 'The discussion section is almost entirely semantic HTML.',
  },
  {
    site: 'WordPressish',
    title: 'A classic blog theme rebuilt with clean HTML5',
    lede: 'The comments are laid out the way a careful theme author would have done it.',
  },
];

const semanticNames07 = [
  'Harriet', 'Dylan', 'Asha', 'Leo', 'Mina', 'Quinn', 'Ivy', 'Rafael', 'Nadia', 'Omar',
  'Pia', 'Saul', 'Tina', 'Jasper', 'Cora', 'Aiden', 'Vera', 'Mira', 'Jonah', 'Elsa',
];

const semanticPhrases07 = [
  'The structure here is easier to scan than the older templates.',
  'I used the same pattern in a theme migration last year.',
  'The author response is highlighted well without breaking the flow.',
  'That time element makes the archive much easier to understand.',
  'I like that the replies stay nested but still readable in print.',
  'The aside widget helps explain the context without crowding the thread.',
  'The mark tag draws attention to the important sentence very cleanly.',
  'This feels like the kind of markup that ages well.',
];

const bootstrapTopics08 = [
  {
    site: 'Launch Blog',
    title: 'Bootstrap 3 comments under a product launch post',
    lede: 'A classic media-object layout with panel wrappers and clean buttons.',
  },
  {
    site: 'News Stack',
    title: 'A newsroom thread rendered with Bootstrap 2 classes',
    lede: 'The page mixes row-fluid columns with old alert and label components.',
  },
  {
    site: 'Startup Notes',
    title: 'Bootstrap 4 card-based discussion below a demo video',
    lede: 'The page feels like the middle of a migration from panels to cards.',
  },
  {
    site: 'Course Portal',
    title: 'A comments panel beside an e-learning lesson',
    lede: 'The layout uses Bootstrap grid columns and list groups.',
  },
  {
    site: 'SaaS Blog',
    title: 'A moderation-heavy thread with tabs and a compose modal',
    lede: 'The UI leans on Bootstrap affordances for almost everything.',
  },
];

const bootstrapNames08 = [
  'Margo', 'Theo', 'June', 'Ari', 'Bea', 'Simon', 'Helena', 'Finn', 'Tess', 'Rowan',
  'Milo', 'Nora', 'Clive', 'Jade', 'Owen', 'Rita', 'Zane', 'Lia', 'Evan', 'Pia',
];

const bootstrapPhrases08 = [
  'The grid columns make the layout feel more deliberate than the earlier versions.',
  'I still prefer the panel styling for dense discussion feeds.',
  'The media object is exactly the right fit for avatar + text combinations.',
  'That alert notice is doing useful work before the replies start.',
  'The thumbnail avatar is a very Bootstrap 3 kind of detail.',
  'The pagination at the bottom makes the archive feel older and more realistic.',
  'I would probably keep the compose box in a modal on a page like this.',
  'The list-group version is the cleanest of the bunch.',
];

const redditTopics09 = [
  {
    site: 'r/techsupport',
    title: 'Deep thread about a BIOS update that broke boot order',
    opener: 'The original post starts a long nested argument about firmware and recovery steps.',
  },
  {
    site: 'r/buildapc',
    title: 'Thread: GPU coil whine after driver rollback',
    opener: 'The replies branch into power supply theories, BIOS settings, and temperature reports.',
  },
  {
    site: 'Hacker News',
    title: 'Show HN: a tiny tool for collapsing huge comment trees',
    opener: 'The style is deliberately minimalist and score-first.',
  },
  {
    site: 'Lemmy',
    title: 'Federated thread about self-hosted community moderation',
    opener: 'The thread uses semantic wrappers but still feels like a classic nested forum.',
  },
  {
    site: 'Custom Forum',
    title: 'A nine-level thread on power supplies, recap jobs, and noise',
    opener: 'The page is intentionally dense so the indentation carries most of the meaning.',
  },
];

const redditNames09 = [
  'kernelpanic', 'retrofan', 'clockwork', 'mattc', 'signalpath', 'microcode', 'buildbot', 'solder', 'bytewave', 'l0gic',
  'raven', 'horizon', 'tessellate', 'wren', 'nullbyte', 'spectrum', 'oxide', 'murmur', 'vector', 'amber',
];

const redditBodies09 = [
  'I had the same symptom after the firmware flash.',
  'The fan curve can hide a lot of thermal issues.',
  'That is the exact point where I would stop and check the logs.',
  'The score is not high, but the technical detail is good.',
  'I would collapse that branch until someone confirms the fix.',
  'The OP flair makes it easier to track who posted the original data.',
  'This is one of those threads where the replies become a reference document.',
  'The continue link is useful once the tree gets too deep to scan.',
  'Someone gilded the wrong message, but the answer is still there.',
  'The discussion shifts after the third level and gets harder to follow.',
];

const mobileTopics10 = [
  {
    site: 'Pulse',
    title: 'A mobile-first feed under a breaking news card',
    intro: 'The layout is optimized for a small screen first and then expands to desktop.',
  },
  {
    site: 'Snack',
    title: 'Recipe comments with pinned tips and emoji reactions',
    intro: 'The screen looks like a native app comment list translated to web HTML.',
  },
  {
    site: 'Chirp',
    title: 'Social app replies with mentions and hashtags',
    intro: 'The feed is flat, touch-friendly, and built around fast vertical scrolling.',
  },
  {
    site: 'Forumly',
    title: 'Community comments rendered as stacked cards',
    intro: 'The sticky composer stays docked at the bottom on mobile.',
  },
  {
    site: 'Readout',
    title: 'Product review comments on a narrow viewport',
    intro: 'The responsive rules change the density rather than the basic structure.',
  },
];

const mobileNames10 = [
  'Avery', 'Mina', 'Noel', 'Sage', 'Luca', 'Ivy', 'Hugo', 'Tori', 'Mason', 'Rae',
  'Juno', 'Eli', 'Pia', 'Nate', 'Zoe', 'Iris', 'Cal', 'Lena', 'Finn', 'Maya',
];

const mobileBodies10 = [
  'I like the compact spacing on this layout.',
  'The avatars still read clearly even at 36px.',
  'This would work well in a news app because the rows are fast to scan.',
  'The mention styling stands out without taking over the card.',
  'The pinned item at the top helps set the tone for the rest of the feed.',
  'The dark mode state looks more natural on a mobile screen.',
  'That attachment thumbnail makes the comment feel complete.',
  'The action row is big enough for thumbs without feeling bloated.',
];

const mobileHashtags = ['#design', '#news', '#recipes', '#launch', '#feedback', '#local'];

function baseTimeLabel(rng) {
  return pick(rng, [
    'Just now',
    '3 minutes ago',
    '18 minutes ago',
    '1 hour ago',
    '3 hours ago',
    'Yesterday',
    '2 days ago',
  ]);
}

function renderHostArticle(topic, leadClass = 'lede') {
  return [
    '<header class="host-header">',
    `<p class="kicker">${escapeHtml(topic.site)}</p>`,
    `<h1>${escapeHtml(topic.title)}</h1>`,
    `<p class="${leadClass}">${escapeHtml(topic.lede || topic.opener || topic.intro)}</p>`,
    '</header>',
  ].join('\n');
}

function renderLoginButtons(platform, buttons) {
  return [
    `<div class="${platform.loginClass}">`,
    '<span class="login-label">Log in with</span>',
    buttons.map((button) => `<a href="#" class="login-btn">${escapeHtml(button)}</a>`).join(' '),
    '</div>',
  ].join('\n');
}

function renderSortTabs(platform, active = 'Best') {
  return [
    `<div class="${platform.sortClass}">`,
    sortTabs.map((tab) => `<a href="#" class="${tab === active ? 'active' : ''}">${escapeHtml(tab)}</a>`).join(' '),
    '</div>',
  ].join('\n');
}

function renderVoteBar(platform, voteMode, score, likes) {
  if (voteMode === 'none') {
    return '';
  }

  if (voteMode === 'like') {
    return `<div class="${platform.voteClass}"><button type="button">Like</button><span class="vote-count">${likes}</span></div>`;
  }

  if (voteMode === 'both') {
    return `<div class="${platform.voteClass}"><button type="button">▲</button><span class="vote-count">${score}</span><button type="button">▼</button></div>`;
  }

  return `<div class="${platform.voteClass}"><button type="button">▲</button><span class="vote-count">${score}</span></div>`;
}

function renderCommentActions(platform, index, options) {
  const pieces = [];
  if (options.share) {
    pieces.push('<a href="#">Share</a>');
  }
  if (options.flag) {
    pieces.push('<a href="#">Flag</a>');
  }
  if (options.reply) {
    pieces.push('<a href="#">Reply</a>');
  }
  if (options.save) {
    pieces.push('<a href="#">Save</a>');
  }
  if (!pieces.length) {
    return '';
  }
  return `<div class="${platform.actionsClass}">${pieces.join(' ')}</div>`;
}

function renderPlatformComment(platform, node, context) {
  const avatarUrl = platform.key === 'facebook'
    ? `https://graph.facebook.com/${encodeURIComponent(node.author)}/picture?type=square`
    : `https://example.invalid/${platform.key}/${encodeURIComponent(node.author)}.png`;
  const avatarImg = platform.iframe
    ? `<img class="${platform.avatarClass}" src="${avatarUrl}" alt="${escapeHtml(node.author)}">`
    : `<img class="${platform.avatarClass}" src="${avatarUrl}" alt="${escapeHtml(node.author)}">`;

  const verified = node.verified
    ? `<span class="${platform.badgeClass} verified">Verified</span>`
    : '';
  const sponsor = node.sponsored
    ? `<span class="${platform.badgeClass} sponsored">Sponsored</span>`
    : '';
  const deleted = node.deleted ? '<p class="deleted">[removed]</p>' : `<p>${escapeHtml(node.body)}</p>`;
  const body = [
    `<div class="${platform.bodyClass}">`,
    `<div class="${platform.metaClass}">`,
    avatarImg,
    `<div class="meta-stack">`,
    `<strong class="author">${escapeHtml(node.author)}</strong> ${verified} ${sponsor}`,
    `<a class="${platform.timeClass}" href="${escapeHtml(node.permalink)}">${escapeHtml(node.timeLabel)}</a>`,
    '</div>',
    '</div>',
    deleted,
    renderVoteBar(platform, context.voteMode, node.score, node.likes),
    renderCommentActions(platform, node.index, context.actionsByIndex[node.index] || {}),
    node.reactionBar ? `<div class="reaction-bar">${node.reactionBar}</div>` : '',
    node.childrenHtml ? `<div class="${platform.replyClass}">${node.childrenHtml}</div>` : '',
    '</div>',
  ].filter(Boolean).join('\n');

  return `<div class="${platform.itemClass}" data-depth="${node.depth}" data-author="${escapeHtml(node.author)}">${body}</div>`;
}

function renderDisqusLikePage(pageNum) {
  const rng = createRng(6000 + pageNum);
  const topic = hostTopics06[(pageNum - 1) % hostTopics06.length];
  const platform = embedPlatforms[(pageNum - 1) % embedPlatforms.length];
  const totalCount = intBetween(rng, 4, 25);
  const disabled = pageNum % 10 === 0;
  const loadMore = pageNum % 7 === 0;
  const showSort = chance(rng, 0.65);
  const showTheme = platform.allowThemeToggle && chance(rng, 0.5);
  const showComposeCollapsed = chance(rng, 0.25);
  const showSponsored = pageNum % 9 === 0;
  const threaded = chance(rng, 0.45);
  const topLevelCount = threaded ? intBetween(rng, 3, Math.min(8, totalCount)) : totalCount;
  const commentsRoot = buildForest(rng, {
    totalCount,
    topLevelCount,
    maxDepth: threaded ? 1 : 0,
    ensureDepth: threaded ? 1 : 0,
    makeNode: ({ depth, index, path: nodePath, rng: nodeRng }) => {
      const author = pick(nodeRng, embedAuthors);
      const baseBody = pick(nodeRng, embedCommentPhrases);
      return {
        index,
        author,
        body: `${baseBody} ${topic.title.toLowerCase().includes('launch') ? 'The launch discussion is still active.' : ''}`.trim(),
        timeLabel: baseTimeLabel(nodeRng),
        permalink: `#${platform.key}-${pageNum}-${nodePath.join('-')}`,
        score: intBetween(nodeRng, 3, 422),
        likes: intBetween(nodeRng, 1, 98),
        verified: chance(nodeRng, 0.2),
        sponsored: showSponsored && index === 2,
        deleted: chance(nodeRng, 0.06),
        reactionBar: chance(nodeRng, 0.3) ? '👍 12 · ❤️ 3 · 🎉 1' : '',
        depth,
      };
    },
  });

  const context = {
    voteMode: platform.voteMode,
    actionsByIndex: {},
  };

  for (let i = 1; i <= totalCount; i += 1) {
    context.actionsByIndex[i] = {
      share: chance(rng, 0.35),
      flag: chance(rng, 0.3),
      reply: !disabled && chance(rng, 0.6),
      save: chance(rng, 0.25),
    };
  }

  const comments = renderTree(commentsRoot, (node, childrenHtml) => {
    node.childrenHtml = childrenHtml;
    return renderPlatformComment(platform, node, context);
  });

  const loginButtons = socialLogins.filter(() => chance(rng, 0.7));
  const composeLines = [
    `<div class="${platform.composeClass}">`,
    showComposeCollapsed
      ? '<button type="button" class="compose-toggle">Start the discussion</button>'
      : '<textarea rows="4" placeholder="Join the discussion..."></textarea>',
    '<div class="compose-actions">',
    '<button type="button">Post</button>',
    '</div>',
    '</div>',
  ].join('\n');

  const widgetHeader = [
    `<div class="${platform.rootClass}" data-platform="${platform.key}">`,
    `<div class="widget-topline">${platform.label} embed</div>`,
    showSort ? renderSortTabs(platform) : '',
    showTheme ? '<button type="button" class="theme-toggle">Theme</button>' : '',
    loginButtons.length ? renderLoginButtons(platform, loginButtons) : '',
    disabled ? '<div class="embed-disabled">Comments are disabled for this article.</div>' : '',
    `<div class="${platform.listClass}">`,
    disabled ? '' : comments,
    '</div>',
    loadMore && !disabled ? '<div class="load-more-wrap"><button type="button">Load more comments</button></div>' : '',
    disabled ? '' : composeLines,
    '</div>',
  ].filter(Boolean).join('\n');

  const container = platform.iframe
    ? `<div id="${platform.containerId}" class="comments-widget comments-widget--iframe" data-platform="${platform.key}">${widgetHeader}</div>`
    : `<div id="${platform.containerId}" class="comments-widget" data-platform="${platform.key}">${widgetHeader}</div>`;

  const headExtras = [
    '<style>',
    [
      'body { margin: 0; font-family: Arial, Helvetica, sans-serif; background: #f4f5f7; color: #1d2430; line-height: 1.45; }',
      '.page { width: min(1080px, calc(100% - 32px)); margin: 0 auto; padding: 24px 0 40px; }',
      '.host-header, .host-footer, .comments-widget, .article-card { background: #fff; border: 1px solid #d9dfe8; }',
      '.host-header { padding: 20px; margin-bottom: 16px; }',
      '.host-header h1 { margin: 4px 0 8px; font-size: 28px; }',
      '.kicker { text-transform: uppercase; letter-spacing: 0; font-size: 11px; color: #57657c; margin: 0; }',
      '.lede { margin: 0; color: #536071; }',
      '.comments-widget { padding: 16px; }',
      '.widget-topline { font-size: 13px; font-weight: 700; margin-bottom: 12px; }',
      '.dsq-comments, .fyre-comment-list, .idc-thread, .UFIList, .Nd.Y8, .sp-thread { display: block; }',
      '.dsq-comment, .fyre-comment, .idc-comment, .UFIComment, .Y8.OE, .sp-comment { border-top: 1px solid #e2e6ef; padding: 14px 0; }',
      '.dsq-comment:first-child, .fyre-comment:first-child, .idc-comment:first-child, .UFIComment:first-child, .Y8.OE:first-child, .sp-comment:first-child { border-top: 0; }',
      '.dsq-comment-header, .fyre-comment-meta, .idc-meta, .UFICommentMeta, .Y8-meta, .sp-comment-meta { display: flex; gap: 10px; align-items: center; margin-bottom: 8px; }',
      '.dsq-avatar, .fyre-avatar, .idc-avatar, .UFICommentActorImage, .Y8-avatar, .sp-user-avatar { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; flex: 0 0 auto; background: #dde4f0; }',
      '.meta-stack { min-width: 0; }',
      '.author { display: inline-block; margin-right: 8px; }',
      '.time-ago, .fyre-time, .idc-time, .UFICommentTimestamp, .Y8-time, .sp-time { color: #6a778a; font-size: 12px; text-decoration: none; }',
      '.badge, .verified, .sponsored { display: inline-block; margin-left: 6px; padding: 1px 6px; font-size: 10px; border-radius: 999px; background: #eef3ff; color: #335; }',
      '.sponsored { background: #fff2c6; color: #6a5300; }',
      '.reaction-bar, .dsq-votes, .fyre-reaction-bar, .idc-votes, .UFIReactionBar, .Y8-votes, .sp-reactions { margin-top: 8px; font-size: 12px; color: #667; }',
      '.dsq-actions, .fyre-actions, .idc-actions, .UFICommentActions, .Y8-actions, .sp-comment-actions { margin-top: 6px; font-size: 12px; }',
      '.dsq-reply, .fyre-replies, .idc-thread-sub, .UFICommentReplies, .Y8-replies, .sp-comment-replies { margin-top: 10px; margin-left: 26px; padding-left: 12px; border-left: 2px solid #e4e8ef; }',
      '.dsq-compose, .fyre-editor, .idc-editor, .UFIComposer, .Y8-editor, .sp-editor { margin-top: 14px; padding-top: 14px; border-top: 1px solid #e2e6ef; }',
      '.dsq-compose textarea, .fyre-editor textarea, .idc-editor textarea, .UFIComposer textarea, .Y8-editor textarea, .sp-editor textarea { width: 100%; min-height: 86px; border: 1px solid #cfd7e3; border-radius: 6px; padding: 10px; font: inherit; box-sizing: border-box; }',
      '.login-btn, .compose-toggle, .theme-toggle, .compose-actions button, .load-more-wrap button { border: 1px solid #c8d2e1; background: #f8fafc; color: #233044; border-radius: 999px; padding: 6px 10px; font-size: 12px; text-decoration: none; display: inline-block; }',
      '.dsq-login, .fyre-login, .idc-login, .pluginConnectButton, .Y8-login, .sp-login { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; font-size: 12px; }',
      '.compose-actions { margin-top: 10px; }',
      '.embed-disabled { padding: 12px; background: #fff8e5; border: 1px solid #ead29b; border-radius: 6px; color: #745400; margin: 10px 0; }',
      '.host-footer { margin-top: 16px; padding: 16px 20px; font-size: 12px; color: #57657c; }',
      '.comments-widget--iframe .pluginConnectButton { border: 1px solid #c8d2e1; padding: 6px 10px; border-radius: 6px; background: #fff; }',
    ].join('\n'),
    '</style>',
    `<script>${platform.loader}</script>`,
    `<noscript>${escapeHtml(platform.noscript)}</noscript>`,
  ];

  const body = [
    '<div class="page">',
    `<article class="article-card">`,
    renderHostArticle(topic),
    `<p>Below the article body, the host page hands comments off to a third-party widget wrapper.</p>`,
    `<p>Different platforms expose their own class names, login buttons, and reply affordances, but the underlying pattern is the same.</p>`,
    '</article>',
    container,
    '<footer class="host-footer">Archived source page. Widget copied inline for synthetic data generation.</footer>',
    '</div>',
  ].join('\n');

  return wrapHtml({
    title: `${topic.site} - ${topic.title}`,
    bodyContent: body,
    headExtras,
  });
}

function renderSemanticComment(node, options, childrenHtml) {
  const depthClass = options.classStyle === 'bem' ? ` comments__item--depth-${node.depth}` : '';
  const commentClass = options.classStyle === 'bem' ? 'comments__item' : 'comment';
  const bodyClass = options.classStyle === 'bem' ? 'comments__body' : 'comment__body';
  const metaClass = options.classStyle === 'bem' ? 'comments__meta' : 'comment__meta';
  const actionsClass = options.classStyle === 'bem' ? 'comments__actions' : 'comment__actions';
  const authorClass = options.classStyle === 'bem' ? 'comments__author' : 'comment__author';
  const footerClass = options.classStyle === 'bem' ? 'comments__footer' : 'comment__footer';
  const headerClass = options.classStyle === 'bem' ? 'comments__header' : 'comment__header';
  const replyClass = options.classStyle === 'bem' ? 'comments__replies' : 'comment__replies';
  const articleAttrs = [
    `id="comment-${node.id}"`,
    `class="${commentClass}${depthClass}"`,
    `data-depth="${node.depth}"`,
  ];

  if (options.microdata && node.depth === 0) {
    articleAttrs.push('itemscope', 'itemtype="https://schema.org/Comment"');
  }

  const header = options.showHeader
    ? [
      `<header class="${headerClass}">`,
      `<p class="${metaClass}">`,
      `<cite class="${authorClass}" itemprop="author">${escapeHtml(node.author)}</cite>`,
      `<time datetime="${node.datetime}" itemprop="datePublished">${escapeHtml(node.dateLabel)}</time>`,
      node.badge ? `<span class="badge">${escapeHtml(node.badge)}</span>` : '',
      '</p>',
      '</header>',
    ].filter(Boolean).join('\n')
    : '';

  const figure = options.useFigure && node.avatar
    ? `<figure class="comment__figure"><img src="${escapeHtml(node.avatar)}" alt="${escapeHtml(node.author)}"><figcaption>${escapeHtml(node.author)}</figcaption></figure>`
    : '';

  const aside = options.useAside && node.aside
    ? `<aside class="comment__aside">${escapeHtml(node.aside)}</aside>`
    : '';

  const footer = options.showFooter
    ? [
      `<footer class="${footerClass}">`,
      `<nav class="${actionsClass}">`,
      '<a href="#">Reply</a>',
      '<a href="#">Edit</a>',
      '<a href="#">Share</a>',
      '</nav>',
      '</footer>',
    ].join('\n')
    : '';

  const childrenWrap = childrenHtml
    ? options.useDetails && node.depth >= 1
      ? `<details class="${replyClass}" ${node.depth === 1 ? 'open' : ''}><summary>Replies</summary>${childrenHtml}</details>`
      : `<div class="${replyClass}">${childrenHtml}</div>`
    : '';

  return [
    `<article ${articleAttrs.join(' ')}>${figure}${header}`,
    `<div class="${bodyClass}" itemprop="text">${escapeHtml(node.text)}</div>`,
    aside,
    footer,
    childrenWrap,
    '</article>',
  ].filter(Boolean).join('\n');
}

function renderSemanticPage(pageNum) {
  const rng = createRng(7000 + pageNum);
  const topic = semanticTopics07[(pageNum - 1) % semanticTopics07.length];
  const layout = ['semantic', 'bem', 'wordpress', 'drupal', 'custom'][(pageNum - 1) % 5];
  const totalCount = intBetween(rng, 2, 20);
  const maxDepth = intBetween(rng, 0, 4);
  const topLevelCount = maxDepth === 0 ? totalCount : intBetween(rng, 2, Math.min(6, totalCount));
  const useFigure = chance(rng, 0.35);
  const useAside = chance(rng, 0.35);
  const useDetails = chance(rng, 0.45);
  const showFooter = chance(rng, 0.75);
  const showHeader = !chance(rng, 0.12);
  const microdata = chance(rng, 0.45);
  const showNav = chance(rng, 0.4);
  const showSubscription = chance(rng, 0.2);
  const darkMode = chance(rng, 0.3);
  const printHideCompose = chance(rng, 0.3);
  const replyBadge = chance(rng, 0.15);

  const nodes = buildForest(rng, {
    totalCount,
    topLevelCount,
    maxDepth,
    ensureDepth: Math.min(maxDepth, chance(rng, 0.5) ? 2 : 1),
    makeNode: ({ depth, index, path: nodePath, rng: nodeRng }) => {
      const author = pick(nodeRng, semanticNames07);
      const date = new Date(Date.UTC(2012, intBetween(nodeRng, 0, 11), intBetween(nodeRng, 1, 28), intBetween(nodeRng, 0, 23), intBetween(nodeRng, 0, 59)));
      return {
        id: `${pageNum}-${nodePath.join('-')}`,
        author,
        text: `${pick(nodeRng, semanticPhrases07)} ${depth >= 2 ? 'The nested reply stays semantically correct.' : ''}`.trim(),
        datetime: date.toISOString(),
        dateLabel: date.toLocaleString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        }),
        avatar: useFigure ? buildAvatarSvg(author, pick(nodeRng, ['#5470a8', '#4b8f72', '#8c5a3c', '#a05d8c'])) : '',
        badge: replyBadge && index === 1 ? 'Author reply' : '',
        aside: useAside ? 'Editorial note: the author metadata is placed in an aside.' : '',
        depth,
      };
    },
  });

  const commentsHtml = renderTree(nodes, (node, childrenHtml) => renderSemanticComment(node, {
    classStyle: layout === 'bem' ? 'bem' : 'semantic',
    microdata,
    useFigure,
    useAside,
    useDetails,
    showFooter,
    showHeader,
  }, childrenHtml));

  const sidebar = showSubscription
    ? '<aside class="subscription-box"><h2>Subscribe</h2><p>Get new posts by email.</p><input type="email" placeholder="Email address"><button type="button">Subscribe</button></aside>'
    : '';

  const nav = showNav
    ? '<nav class="comment-navigation"><a href="#">Previous</a> <a href="#">Next</a></nav>'
    : '';

  const compose = chance(rng, 0.85)
    ? [
      '<section class="comment-compose">',
      '<h2>Leave a note</h2>',
      '<form>',
      '<label>Name <input type="text" name="name"></label>',
      '<label>Email <input type="email" name="email"></label>',
      '<label>Website <input type="url" name="website"></label>',
      '<label>Message <textarea rows="5"></textarea></label>',
      '<button type="submit">Post</button>',
      '</form>',
      '</section>',
    ].join('\n')
    : '';

  const css = [
    'body { margin: 0; font-family: Georgia, "Times New Roman", serif; background: #f4f2ee; color: #222; line-height: 1.6; }',
    '.page { width: min(960px, calc(100% - 32px)); margin: 0 auto; padding: 24px 0 48px; }',
    '.story { background: #fff; border: 1px solid #d8d0c4; padding: 20px; margin-bottom: 18px; }',
    '.story h1 { margin: 0 0 10px; font-size: 30px; }',
    '.story .lede { color: #666; margin: 0; }',
    '#comments, .comments-section { background: #fff; border: 1px solid #d8d0c4; padding: 20px; }',
    '.comment, .comments__item, .comment-node { margin-top: 18px; padding-top: 18px; border-top: 1px solid #e3ddd4; }',
    '.comment:first-child, .comments__item:first-child, .comment-node:first-child { margin-top: 0; padding-top: 0; border-top: 0; }',
    '.comment__header, .comments__header { display: flex; gap: 12px; align-items: baseline; flex-wrap: wrap; }',
    '.comment__figure { float: left; margin: 0 12px 8px 0; text-align: center; }',
    '.comment__figure img { width: 40px; height: 40px; border-radius: 50%; display: block; }',
    '.comment__figure figcaption { font-size: 11px; color: #6f665c; }',
    '.comment__body, .comments__body { margin-top: 8px; }',
    '.comment__footer, .comments__footer { margin-top: 10px; font-size: 12px; color: #6f665c; }',
    '.comment__actions, .comments__actions { display: flex; gap: 10px; flex-wrap: wrap; }',
    '.comment__replies, .comments__replies { margin-top: 12px; margin-left: 28px; padding-left: 12px; border-left: 2px solid #d9d3c9; }',
    '.subscription-box { margin-top: 18px; padding: 14px; border: 1px solid #ddd2c2; background: #f9f6f1; }',
    '.comment-compose { margin-top: 18px; padding-top: 18px; border-top: 1px solid #e3ddd4; }',
    '.comment-compose form { display: grid; gap: 10px; max-width: 520px; }',
    '.comment-compose input, .comment-compose textarea { width: 100%; box-sizing: border-box; border: 1px solid #cfc6ba; padding: 8px 10px; font: inherit; }',
    '.comment-navigation { margin-top: 16px; display: flex; gap: 12px; font-size: 12px; }',
    '.badge { display: inline-block; padding: 1px 6px; border-radius: 999px; background: #eef3ff; font-size: 11px; }',
    darkMode ? '@media (prefers-color-scheme: dark) { body { background: #121315; color: #e9e7e2; } .story, #comments, .comments-section, .subscription-box, .comment-compose { background: #1a1d22; border-color: #353a43; } .lede, .comment__footer, .comments__footer, .comment__figure figcaption { color: #9aa3b2; } .comment__replies, .comments__replies { border-left-color: #373e49; } }' : '',
    printHideCompose ? '@media print { .comment-compose { display: none; } }' : '',
  ].filter(Boolean).join('\n');

  const wrapper = [
    '<div class="page">',
    '<article class="story">',
    renderHostArticle(topic),
    '<p>These semantic pages intentionally use proper article, section, header, footer, time, and aside elements.</p>',
    '</article>',
    nav,
    '<section id="comments" class="comments-section">',
    commentsHtml,
    sidebar,
    compose,
    '</section>',
    '</div>',
  ].filter(Boolean).join('\n');

  return wrapHtml({
    title: `${topic.site} - ${topic.title}`,
    bodyContent: wrapper,
    headExtras: `<style>${css}</style>`,
  });
}

function renderBootstrapComment(node, version, childrenHtml, options) {
  const avatar = `<img class="${version.avatarClass}" src="${escapeHtml(node.avatar)}" alt="${escapeHtml(node.author)}">`;
  const metaLine = [
    `<span class="${version.authorClass}">${escapeHtml(node.author)}</span>`,
    `<span class="${version.timeClass}">${escapeHtml(node.timeLabel)}</span>`,
    node.badge ? `<span class="label label-primary">${escapeHtml(node.badge)}</span>` : '',
  ].filter(Boolean).join(' ');
  const actions = options.showActions
    ? `<div class="${version.actionsClass}"><button class="btn btn-xs btn-default" type="button">Reply</button> <button class="btn btn-xs btn-default" type="button">Like</button> <button class="btn btn-xs btn-default" type="button">Report</button></div>`
    : '';
  const body = [
    `<div class="${version.bodyClass}">`,
    `<div class="${version.metaClass}">${metaLine}</div>`,
    `<p>${escapeHtml(node.body)}</p>`,
    actions,
    childrenHtml ? `<div class="${version.replyClass}">${childrenHtml}</div>` : '',
    '</div>',
  ].filter(Boolean).join('\n');

  if (version.name === 'bootstrap4') {
    return [
      `<article class="card comment-item" data-depth="${node.depth}">`,
      `<div class="card-body d-flex gap-3">`,
      avatar,
      `<div class="flex-grow-1">${body}</div>`,
      '</div>',
      '</article>',
    ].join('\n');
  }

  if (version.name === 'bootstrap2') {
    return [
      '<div class="media comment-item">',
      `<a class="pull-left" href="#">${avatar}</a>`,
      `<div class="media-body">${body}</div>`,
      '</div>',
    ].join('\n');
  }

  return [
    '<div class="media comment-item">',
    `<div class="media-left">${avatar}</div>`,
    `<div class="media-body">${body}</div>`,
    '</div>',
  ].join('\n');
}

function renderBootstrapPage(pageNum) {
  const rng = createRng(8000 + pageNum);
  const topic = bootstrapTopics08[(pageNum - 1) % bootstrapTopics08.length];
  const version = [
    {
      name: 'bootstrap2',
      label: 'Bootstrap 2',
      rootClass: 'bootstrap-shell bootstrap-shell--v2',
      panelClass: 'alert alert-info',
      bodyClass: 'comment-body',
      metaClass: 'comment-meta',
      actionsClass: 'comment-actions',
      replyClass: 'comment-replies',
      avatarClass: 'thumbnail',
      authorClass: 'comment-author',
      timeClass: 'comment-time',
      containerClass: 'row-fluid',
      mainColumnClass: 'span8',
      sideColumnClass: 'span4',
    },
    {
      name: 'bootstrap3',
      label: 'Bootstrap 3',
      rootClass: 'bootstrap-shell bootstrap-shell--v3',
      panelClass: 'panel panel-default',
      bodyClass: 'panel-body',
      metaClass: 'comment-meta',
      actionsClass: 'comment-actions',
      replyClass: 'comment-replies',
      avatarClass: 'img-circle',
      authorClass: 'comment-author',
      timeClass: 'comment-time',
      containerClass: 'row',
      mainColumnClass: 'col-md-8',
      sideColumnClass: 'col-md-4',
    },
    {
      name: 'bootstrap4',
      label: 'Bootstrap 4',
      rootClass: 'bootstrap-shell bootstrap-shell--v4',
      panelClass: 'card',
      bodyClass: 'card-body',
      metaClass: 'comment-meta',
      actionsClass: 'comment-actions',
      replyClass: 'comment-replies',
      avatarClass: 'rounded-circle',
      authorClass: 'comment-author',
      timeClass: 'comment-time',
      containerClass: 'row',
      mainColumnClass: 'col-md-8',
      sideColumnClass: 'col-md-4',
    },
  ][(pageNum - 1) % 3];
  const totalCount = intBetween(rng, 3, 18);
  const maxDepth = intBetween(rng, 0, 2);
  const topLevelCount = maxDepth === 0 ? totalCount : intBetween(rng, 2, Math.min(6, totalCount));
  const showSidebar = chance(rng, 0.55);
  const showTabs = chance(rng, 0.35);
  const showPagination = chance(rng, 0.4);
  const showModal = version.name === 'bootstrap4' && chance(rng, 0.35);
  const showProgress = chance(rng, 0.15);
  const showAlert = chance(rng, 0.55);
  const showCollapse = chance(rng, 0.4);

  const roots = buildForest(rng, {
    totalCount,
    topLevelCount,
    maxDepth,
    ensureDepth: Math.min(maxDepth, 1),
    makeNode: ({ depth, index, path: nodePath, rng: nodeRng }) => {
      const author = pick(nodeRng, bootstrapNames08);
      return {
        id: `${pageNum}-${nodePath.join('-')}`,
        author,
        body: `${pick(nodeRng, bootstrapPhrases08)} ${topic.title.toLowerCase().includes('launch') ? 'The launch thread stays active.' : ''}`.trim(),
        timeLabel: baseTimeLabel(nodeRng),
        avatar: buildAvatarSvg(author, pick(nodeRng, ['#44688f', '#4c7b63', '#8d5b41', '#7d4c78'])),
        badge: depth === 0 && index === 1 && chance(nodeRng, 0.25) ? 'Author' : '',
        depth,
      };
    },
  });

  const versionCss = [
    'body { margin: 0; font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; background: #eef2f5; color: #223; line-height: 1.5; }',
    '.page { width: min(1100px, calc(100% - 24px)); margin: 0 auto; padding: 20px 0 44px; }',
    '.hero, .comments-panel, .sidebar-card { background: #fff; border: 1px solid #d8dee8; }',
    '.hero { padding: 20px; margin-bottom: 16px; }',
    '.hero h1 { margin: 4px 0 8px; font-size: 28px; }',
    '.lead { margin: 0; color: #556070; }',
    '.comment-item { margin-bottom: 14px; }',
    '.comment-meta { margin-bottom: 8px; font-size: 12px; color: #667; }',
    '.comment-body p { margin: 0 0 8px; }',
    '.comment-actions .btn { margin-right: 6px; }',
    '.comment-replies { margin-top: 10px; margin-left: 26px; padding-left: 12px; border-left: 2px solid #e4e8ef; }',
    '.sidebar-card { padding: 16px; }',
    '.sidebar-card + .sidebar-card { margin-top: 16px; }',
    '.progress { margin-bottom: 10px; }',
    '.modal { display: block; position: relative; }',
    '.compose-box { padding: 16px; border-top: 1px solid #e2e7ef; }',
    '.compose-box textarea { width: 100%; min-height: 90px; box-sizing: border-box; }',
    version.name === 'bootstrap4' ? '.card.comment-item { border: 1px solid #d8dee8; }' : '',
    showAlert ? '.alert { margin-bottom: 16px; }' : '',
  ].filter(Boolean).join('\n');

  const commentsHtml = renderTree(roots, (node, childrenHtml) => renderBootstrapComment(node, version, childrenHtml, {
    showActions: true,
  }));

  const sidebar = showSidebar
    ? [
      '<div class="sidebar-card">',
      '<h2>About this thread</h2>',
      '<p>A Bootstrap layout can still look like a forum when the media object and panel classes do the heavy lifting.</p>',
      showProgress ? '<div class="progress"><div class="progress-bar" style="width:72%">72%</div></div>' : '',
      '</div>',
    ].filter(Boolean).join('\n')
    : '';

  const tabs = showTabs
    ? '<ul class="nav nav-tabs"><li class="active"><a href="#">All Comments</a></li><li><a href="#">Top Comments</a></li><li><a href="#">My Comments</a></li></ul>'
    : '';

  const pagination = showPagination
    ? '<nav aria-label="pagination"><ul class="pagination"><li><a href="#">&laquo;</a></li><li class="active"><a href="#">1</a></li><li><a href="#">2</a></li><li><a href="#">3</a></li><li><a href="#">&raquo;</a></li></ul></nav>'
    : '';

  const form = [
    '<div class="compose-box">',
    showModal
      ? '<button type="button" class="btn btn-primary" data-toggle="modal" data-target="#composeModal">Add Comment</button>'
      : '',
    showModal
      ? [
        '<div id="composeModal" class="modal fade">',
        '<div class="modal-dialog"><div class="modal-content"><div class="modal-header"><h4 class="modal-title">Write a comment</h4></div><div class="modal-body"><textarea class="form-control" rows="4" placeholder="Share your thoughts"></textarea></div><div class="modal-footer"><button type="button" class="btn btn-primary">Post</button></div></div></div>',
        '</div>',
      ].join('\n')
      : [
        '<div class="form-group"><textarea class="form-control" rows="4" placeholder="Share your thoughts"></textarea></div>',
        '<button type="button" class="btn btn-primary">Post</button>',
      ].join('\n'),
    '</div>',
  ].join('\n');

  const mainColumn = [
    '<div class="comments-panel">',
    showAlert ? '<div class="alert alert-info">Comments are moderated before publication.</div>' : '',
    tabs,
    version.name === 'bootstrap2'
      ? '<div class="label label-default">12 responses</div>'
      : '<span class="badge">12 responses</span>',
    commentsHtml,
    pagination,
    form,
    '</div>',
  ].filter(Boolean).join('\n');

  const body = [
    '<div class="page">',
    '<section class="hero">',
    `<p class="kicker">${escapeHtml(topic.site)}</p>`,
    `<h1>${escapeHtml(topic.title)}</h1>`,
    `<p class="lead">${escapeHtml(topic.lede)}</p>`,
    '</section>',
    `<div class="${version.containerClass}">`,
    `<div class="${version.mainColumnClass}">${mainColumn}</div>`,
    showSidebar ? `<div class="${version.sideColumnClass}">${sidebar}</div>` : '',
    '</div>',
    '</div>',
  ].filter(Boolean).join('\n');

  const headExtras = [
    version.name === 'bootstrap4'
      ? '<link rel="stylesheet" href="https://stackpath.bootstrapcdn.com/bootstrap/4.1.3/css/bootstrap.min.css">'
      : '<link rel="stylesheet" href="https://maxcdn.bootstrapcdn.com/bootstrap/3.3.7/css/bootstrap.min.css">',
    version.name === 'bootstrap4'
      ? '<script src="https://code.jquery.com/jquery-3.3.1.slim.min.js"></script>'
      : '<script src="https://code.jquery.com/jquery-2.2.4.min.js"></script>',
    version.name === 'bootstrap4'
      ? '<script src="https://stackpath.bootstrapcdn.com/bootstrap/4.1.3/js/bootstrap.min.js"></script>'
      : '<script src="https://maxcdn.bootstrapcdn.com/bootstrap/3.3.7/js/bootstrap.min.js"></script>',
    version.name !== 'bootstrap4'
      ? '<link rel="stylesheet" href="https://maxcdn.bootstrapcdn.com/font-awesome/4.7.0/css/font-awesome.min.css">'
      : '',
    `<style>${versionCss}</style>`,
  ].filter(Boolean);

  return wrapHtml({
    title: `${topic.site} - ${topic.title}`,
    bodyContent: body,
    headExtras,
  });
}

function renderRedditComment(node, style, childrenHtml, options) {
  const scoreText = style.scoreMode === 'net' ? `${node.score} points` : `${node.upvotes} / ${node.downvotes}`;
  const flair = node.flair ? `<span class="flair">${escapeHtml(node.flair)}</span>` : '';
  const awards = node.awards
    ? `<span class="awards">${node.awards.map((award) => `<span class="award">${escapeHtml(award)}</span>`).join(' ')}</span>`
    : '';
  const body = [
    `<div class="${style.bodyClass}">`,
    `<p>${escapeHtml(node.body)}</p>`,
    options.showActions ? `<div class="${style.actionsClass}"><a href="#">reply</a> <a href="#">share</a> <a href="#">save</a></div>` : '',
    childrenHtml ? `<div class="${style.childrenClass}">${childrenHtml}</div>` : '',
    '</div>',
  ].filter(Boolean).join('\n');

  if (style.name === 'hn') {
    const indWidth = 20 + (node.depth * 20);
    return [
      '<tr class="comtr">',
      `<td class="ind"><img src="s.gif" width="${indWidth}" height="1" alt=""></td>`,
      `<td class="comhead"><span class="score">${escapeHtml(scoreText)}</span> <span class="hnuser">${escapeHtml(node.author)}</span> ${flair} <span class="age">${escapeHtml(node.timeLabel)}</span> ${awards}</td>`,
      '</tr>',
      '<tr>',
      `<td></td>`,
      `<td class="commtext">${body}</td>`,
      '</tr>',
    ].join('\n');
  }

  return [
    `<div class="${style.itemClass}" data-depth="${node.depth}" data-comment-id="${escapeHtml(node.id)}" data-score="${node.score}" data-author="${escapeHtml(node.author)}">`,
    `<div class="${style.metaClass}"><span class="${style.authorClass}">${escapeHtml(node.author)}</span> ${flair} <span class="${style.timeClass}">${escapeHtml(node.timeLabel)}</span> ${awards} <span class="${style.scoreClass}">${escapeHtml(scoreText)}</span></div>`,
    `<div class="${style.bodyClass}">${escapeHtml(node.body)}</div>`,
    options.showActions ? `<div class="${style.actionsClass}"><a href="#">reply</a> <a href="#">share</a> <a href="#">hide</a></div>` : '',
    childrenHtml ? `<div class="${style.childrenClass}">${childrenHtml}</div>` : '',
    '</div>',
  ].filter(Boolean).join('\n');
}

function renderRedditPage(pageNum) {
  const rng = createRng(9000 + pageNum);
  const topic = redditTopics09[(pageNum - 1) % redditTopics09.length];
  const style = [
    {
      name: 'old',
      label: 'Old Reddit',
      rootClass: 'oldreddit',
      itemClass: 'comment',
      metaClass: 'tagline',
      bodyClass: 'usertext-body',
      actionsClass: 'buttons',
      childrenClass: 'child',
      authorClass: 'author',
      timeClass: 'age',
      scoreClass: 'score unvoted',
      scoreMode: 'net',
      layout: 'div',
    },
    {
      name: 'new',
      label: 'New Reddit',
      rootClass: 'shreddit',
      itemClass: 'Comment',
      metaClass: 'CommentHeader',
      bodyClass: 'CommentContent',
      actionsClass: 'CommentFooter',
      childrenClass: 'RepliesSection',
      authorClass: 'CommentAuthor',
      timeClass: 'CommentTimestamp',
      scoreClass: 'CommentScore',
      scoreMode: 'net',
      layout: 'details',
    },
    {
      name: 'hn',
      label: 'Hacker News',
      rootClass: 'hn',
      itemClass: 'comtr',
      metaClass: 'comhead',
      bodyClass: 'commtext',
      actionsClass: 'buttons',
      childrenClass: 'child',
      authorClass: 'hnuser',
      timeClass: 'age',
      scoreClass: 'score',
      scoreMode: 'net',
      layout: 'table',
    },
    {
      name: 'lemmy',
      label: 'Lemmy',
      rootClass: 'lemmy',
      itemClass: 'comment-node',
      metaClass: 'comment-meta',
      bodyClass: 'comment-content',
      actionsClass: 'comment-actions',
      childrenClass: 'comment-branch',
      authorClass: 'comment-author',
      timeClass: 'comment-time',
      scoreClass: 'vote-buttons',
      scoreMode: 'net',
      layout: 'article',
    },
    {
      name: 'custom',
      label: 'Custom Thread',
      rootClass: 'thread',
      itemClass: 'thread-comment',
      metaClass: 'thread-comment__meta',
      bodyClass: 'thread-comment__body',
      actionsClass: 'thread-comment__actions',
      childrenClass: 'thread-comment__replies',
      authorClass: 'thread-comment__author',
      timeClass: 'thread-comment__time',
      scoreClass: 'thread-comment__score',
      scoreMode: 'net',
      layout: 'div',
    },
  ][(pageNum - 1) % 5];

  const totalCount = intBetween(rng, 8, 50);
  const topLevelCount = intBetween(rng, 2, Math.min(10, totalCount));
  const maxDepth = intBetween(rng, 2, 9);
  const continueThisThread = chance(rng, 0.15);
  const loadMore = chance(rng, 0.1);
  const collapsedChance = 0.2 + (pageNum % 3) * 0.1;

  const roots = buildForest(rng, {
    totalCount,
    topLevelCount,
    maxDepth,
    ensureDepth: intBetween(rng, 2, Math.min(maxDepth, 4)),
    makeNode: ({ depth, index, path: nodePath, rng: nodeRng }) => ({
      id: `c-${pageNum}-${nodePath.join('-')}`,
      author: pick(nodeRng, redditNames09),
      body: `${pick(nodeRng, redditBodies09)} ${depth >= 3 ? 'The nesting is getting hard to read.' : ''}`.trim(),
      score: intBetween(nodeRng, 1, 782),
      upvotes: intBetween(nodeRng, 1, 812),
      downvotes: intBetween(nodeRng, 0, 34),
      timeLabel: pick(nodeRng, ['2 hours ago', '5 hours ago', 'Yesterday', '3 days ago', '1 week ago']),
      flair: chance(nodeRng, 0.25) ? pick(nodeRng, ['Moderator', 'CS PhD', 'OP', 'Contributor', 'Veteran']) : '',
      awards: chance(nodeRng, 0.2) ? [pick(nodeRng, ['Gold', 'Silver', 'Wholesome', 'Helpful'])] : [],
      depth,
      collapsed: depth > 1 && chance(nodeRng, collapsedChance),
      threadLink: depth >= maxDepth - 1 && continueThisThread ? 'Continue this thread →' : '',
      deleted: chance(nodeRng, 0.08),
      comments: '',
    }),
  });

  const renderNode = (node, childrenHtml) => {
    const body = node.deleted ? '[deleted]' : node.body;
    const childMarkup = node.threadLink
      ? `<div class="continue-thread"><a href="#">${escapeHtml(node.threadLink)}</a></div>`
      : childrenHtml;
    const collapsedBlock = node.collapsed && childrenHtml
      ? `<div class="collapsed" aria-hidden="true">${childrenHtml}</div>`
      : childMarkup;
    const config = {
      ...style,
      scoreMode: 'net',
    };

    if (style.name === 'hn') {
      const indWidth = 20 + (node.depth * 20);
      return [
        '<tr class="comtr">',
        `<td class="ind"><img src="s.gif" width="${indWidth}" height="1" alt=""></td>`,
        `<td class="comhead"><a class="togg" href="#">[${node.collapsed ? '+' : '-'}]</a> <span class="score">${node.score} points</span> <span class="hnuser">${escapeHtml(node.author)}</span> ${node.flair ? `<span class="flair">${escapeHtml(node.flair)}</span>` : ''} <span class="age">${escapeHtml(node.timeLabel)}</span> ${node.awards.map((award) => `<span class="award">${escapeHtml(award)}</span>`).join(' ')}</td>`,
        '</tr>',
        '<tr>',
        '<td></td>',
        `<td class="commtext">${body ? `<p>${escapeHtml(body)}</p>` : ''}${node.threadLink ? `<div class="continue-thread"><a href="#">${escapeHtml(node.threadLink)}</a></div>` : ''}${collapsedBlock && !node.threadLink ? `<div class="children">${collapsedBlock}</div>` : ''}</td>`,
        '</tr>',
      ].join('\n');
    }

    if (style.name === 'old') {
      return [
        `<div class="comment" data-fullname="t1_${node.id}" data-comment-id="${escapeHtml(node.id)}" data-depth="${node.depth}">`,
        '<div class="entry">',
        `<p class="tagline"><a class="author" href="#">${escapeHtml(node.author)}</a> ${node.flair ? `<span class="flair">${escapeHtml(node.flair)}</span>` : ''} <span class="score">${node.score} points</span> <time class="age">${escapeHtml(node.timeLabel)}</time></p>`,
        `<div class="usertext-body"><p>${escapeHtml(body)}</p></div>`,
        node.threadLink ? `<p class="buttons"><a href="#">${escapeHtml(node.threadLink)}</a></p>` : `<p class="buttons"><a href="#">reply</a> <a href="#">share</a> <a href="#">save</a></p>`,
        collapsedBlock && !node.threadLink ? `<div class="child">${collapsedBlock}</div>` : '',
        '</div>',
        '</div>',
      ].filter(Boolean).join('\n');
    }

    if (style.name === 'new') {
      return [
        `<div class="Comment" data-comment-id="${escapeHtml(node.id)}" data-depth="${node.depth}">`,
        `<div class="CommentHeader"><span class="CommentAuthor">${escapeHtml(node.author)}</span> ${node.flair ? `<span class="flair">${escapeHtml(node.flair)}</span>` : ''} <span class="CommentScore">${node.score} points</span> <span class="CommentTimestamp">${escapeHtml(node.timeLabel)}</span></div>`,
        `<div class="CommentContent">${escapeHtml(body)}</div>`,
        node.threadLink ? `<div class="CommentFooter"><a href="#">${escapeHtml(node.threadLink)}</a></div>` : '<div class="CommentFooter"><button type="button" aria-expanded="false">Collapse</button></div>',
        collapsedBlock && !node.threadLink ? `<div class="RepliesSection">${collapsedBlock}</div>` : '',
        '</div>',
      ].filter(Boolean).join('\n');
    }

    if (style.name === 'lemmy') {
      return [
        `<article class="comment-node" data-comment-id="${escapeHtml(node.id)}" data-depth="${node.depth}">`,
        `<header class="comment-meta"><span class="comment-author">${escapeHtml(node.author)}</span> ${node.flair ? `<span class="flair">${escapeHtml(node.flair)}</span>` : ''} <span class="vote-buttons">${node.score} points</span> <time class="comment-time">${escapeHtml(node.timeLabel)}</time></header>`,
        `<div class="comment-content">${escapeHtml(body)}</div>`,
        node.threadLink ? `<div class="comment-actions"><a href="#">${escapeHtml(node.threadLink)}</a></div>` : '<div class="comment-actions"><a href="#">Reply</a> <a href="#">Share</a></div>',
        collapsedBlock && !node.threadLink ? `<div class="comment-branch">${collapsedBlock}</div>` : '',
        '</article>',
      ].filter(Boolean).join('\n');
    }

    return [
      `<div class="thread-comment thread-comment__depth-${node.depth}" data-comment-id="${escapeHtml(node.id)}" data-depth="${node.depth}">`,
      `<div class="thread-comment__meta"><span class="thread-comment__author">${escapeHtml(node.author)}</span> ${node.flair ? `<span class="flair">${escapeHtml(node.flair)}</span>` : ''} <span class="thread-comment__score">${node.score} points</span> <span class="thread-comment__time">${escapeHtml(node.timeLabel)}</span></div>`,
      `<div class="thread-comment__body">${escapeHtml(body)}</div>`,
      node.threadLink ? `<div class="thread-comment__actions"><a href="#">${escapeHtml(node.threadLink)}</a></div>` : '<div class="thread-comment__actions"><a href="#">Reply</a> <a href="#">Save</a></div>',
      collapsedBlock && !node.threadLink ? `<div class="thread-comment__replies">${collapsedBlock}</div>` : '',
      '</div>',
    ].filter(Boolean).join('\n');
  };

  const threadMarkup = style.name === 'hn'
    ? [
      '<table class="hn-comments">',
      renderTree(roots, renderNode),
      '</table>',
    ].join('\n')
    : `<div class="${style.rootClass}">${renderTree(roots, renderNode)}</div>`;

  const topHeader = [
    '<section class="story">',
    `<p class="kicker">${escapeHtml(topic.site)}</p>`,
    `<h1>${escapeHtml(topic.title)}</h1>`,
    `<p class="lede">${escapeHtml(topic.opener)}</p>`,
    '</section>',
  ].join('\n');

  const loadMoreMarkup = loadMore ? '<div class="load-more"><button type="button">Load more comments (248)</button></div>' : '';

  const css = [
    'body { margin: 0; font-family: Arial, Helvetica, sans-serif; background: #f6f6ef; color: #222; line-height: 1.45; }',
    '.page { width: min(1000px, calc(100% - 24px)); margin: 0 auto; padding: 18px 0 40px; }',
    '.story { background: #fff; border: 1px solid #e2e2d5; padding: 16px 18px; margin-bottom: 16px; }',
    '.story h1 { margin: 4px 0 8px; font-size: 28px; }',
    '.lede { margin: 0; color: #666; }',
    '.oldreddit, .shreddit, .lemmy, .thread { background: #fff; border: 1px solid #e2e2d5; padding: 16px 18px; }',
    '.comment, .Comment, .comment-node, .thread-comment { margin-bottom: 14px; }',
    '.tagline, .CommentHeader, .comment-meta, .thread-comment__meta { font-size: 12px; color: #666; margin-bottom: 6px; }',
    '.usertext-body, .CommentContent, .comment-content, .thread-comment__body, .commtext { padding-left: 0; }',
    '.buttons, .CommentFooter, .comment-actions, .thread-comment__actions { font-size: 12px; margin-top: 6px; }',
    '.child, .RepliesSection, .comment-branch, .thread-comment__replies { margin-top: 12px; margin-left: 28px; padding-left: 12px; border-left: 2px solid #d9d9c9; }',
    '.score { font-weight: 700; margin-right: 8px; }',
    '.flair, .award { display: inline-block; margin-left: 6px; font-size: 11px; padding: 1px 6px; border-radius: 999px; background: #eef3ff; }',
    '.collapsed { opacity: 0.6; }',
    '.continue-thread { margin-top: 8px; font-size: 12px; }',
    '.hn-comments { width: 100%; border-collapse: collapse; }',
    '.hn-comments td { vertical-align: top; padding: 0; }',
    '.ind { width: auto; }',
    '.comtr .comhead { font-size: 12px; color: #666; padding-bottom: 4px; }',
    '.comtr .commtext { padding: 0 0 12px 0; }',
    '.load-more { margin-top: 18px; }',
  ].join('\n');

  const compose = chance(rng, 0.45)
    ? '<section class="compose"><textarea rows="4" placeholder="Add a reply"></textarea><button type="button">Submit</button></section>'
    : '<div class="load-more-hint">Some branches are collapsed for readability.</div>';

  const body = [
    '<div class="page">',
    topHeader,
    threadMarkup,
    loadMoreMarkup,
    compose,
    '</div>',
  ].join('\n');

  return wrapHtml({
    title: `${topic.site} - ${topic.title}`,
    bodyContent: body,
    headExtras: `<style>${css}</style>`,
  });
}

function renderMobileComment(node, childrenHtml, options) {
  const attachment = node.attachment
    ? `<img class="comment-attachment" src="${escapeHtml(node.attachment)}" alt="${escapeHtml(node.attachmentAlt)}">`
    : '';
  const badges = [
    node.badge ? `<span class="badge">${escapeHtml(node.badge)}</span>` : '',
    node.authorBadge ? `<span class="author-badge">${escapeHtml(node.authorBadge)}</span>` : '',
  ].filter(Boolean).join(' ');

  return [
    `<article class="feed-item${node.pinned ? ' feed-item--pinned' : ''}" data-depth="${node.depth}">`,
    '<div class="feed-item__row">',
    `<img class="feed-item__avatar" src="${escapeHtml(node.avatar)}" alt="${escapeHtml(node.author)}">`,
    '<div class="feed-item__body">',
    `<div class="feed-item__meta"><span class="feed-item__name">${escapeHtml(node.author)}</span> ${badges} <time>${escapeHtml(node.timeLabel)}</time></div>`,
    `<div class="feed-item__text">${escapeHtml(node.body)}</div>`,
    attachment,
    `<div class="feed-item__actions">${options.actionButtons}</div>`,
    childrenHtml ? `<div class="feed-item__replies">${childrenHtml}</div>` : '',
    '</div>',
    '</div>',
    '</article>',
  ].filter(Boolean).join('\n');
}

function renderMobilePage(pageNum) {
  const rng = createRng(10000 + pageNum);
  const topic = mobileTopics10[(pageNum - 1) % mobileTopics10.length];
  const totalCount = intBetween(rng, 4, 25);
  const maxDepth = chance(rng, 0.35) ? 1 : 0;
  const topLevelCount = maxDepth === 0 ? totalCount : intBetween(rng, 4, Math.min(10, totalCount));
  const stickyComposer = chance(rng, 0.55);
  const pinnedTop = chance(rng, 0.15);
  const showDark = chance(rng, 0.3);
  const showPtr = chance(rng, 0.2);
  const showLoadMore = chance(rng, 0.15);
  const showSidebar = chance(rng, 0.25);
  const comments = buildForest(rng, {
    totalCount,
    topLevelCount,
    maxDepth,
    ensureDepth: maxDepth,
    makeNode: ({ depth, index, path: nodePath, rng: nodeRng }) => {
      const author = pick(nodeRng, mobileNames10);
      const avatarColor = pick(nodeRng, ['#5b79a8', '#4d8b6d', '#a05c55', '#8d6b3b', '#7058a8']);
      const body = `${pick(nodeRng, mobileBodies10)} ${chance(nodeRng, 0.3) ? ` ${pick(nodeRng, mobileHashtags)}` : ''}`.trim();
      const pinned = pinnedTop && index === 1;
      return {
        id: `${pageNum}-${nodePath.join('-')}`,
        author,
        body,
        timeLabel: baseTimeLabel(nodeRng),
        avatar: buildAvatarSvg(author, avatarColor),
        badge: chance(nodeRng, 0.1) ? 'Top fan' : '',
        authorBadge: chance(nodeRng, 0.12) ? 'Author' : '',
        pinned,
        attachment: chance(nodeRng, 0.18) ? `https://example.invalid/mobile/${pageNum}-${index}.jpg` : '',
        attachmentAlt: 'Attachment preview',
        depth,
      };
    },
  });

  const actionButtons = '<button type="button">Like</button><button type="button">Reply</button><button type="button">Share</button>';
  const commentsHtml = renderTree(comments, (node, childrenHtml) => renderMobileComment(node, childrenHtml, { actionButtons }));

  const css = [
    'body { margin: 0; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f3f5f8; color: #1f2733; }',
    '.page { width: min(720px, calc(100% - 20px)); margin: 0 auto; padding: 16px 0 84px; }',
    '.hero { background: #fff; border-radius: 12px; padding: 16px; margin-bottom: 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }',
    '.hero h1 { margin: 4px 0 8px; font-size: 24px; }',
    '.hero .lede { margin: 0; color: #5d6877; }',
    '.feed-item { background: #fff; border-radius: 12px; padding: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); margin-bottom: 12px; }',
    '.feed-item--pinned { border: 1px solid #d6c27f; box-shadow: 0 0 0 1px rgba(214,194,127,0.2), 0 1px 3px rgba(0,0,0,0.08); }',
    '.feed-item__row { display: flex; align-items: flex-start; gap: 12px; }',
    '.feed-item__avatar { width: 40px; height: 40px; border-radius: 50%; flex: 0 0 auto; }',
    '.feed-item__body { min-width: 0; flex: 1 1 auto; }',
    '.feed-item__meta { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; font-size: 12px; color: #66707e; margin-bottom: 8px; }',
    '.feed-item__name { font-weight: 700; color: #1f2733; }',
    '.feed-item__text { font-size: 14px; line-height: 1.5; word-break: break-word; overflow-wrap: anywhere; }',
    '.feed-item__actions { display: flex; gap: 8px; margin-top: 10px; min-height: 44px; align-items: center; }',
    '.feed-item__actions button { min-height: 44px; border: 1px solid #d4dbe6; background: #f9fbfd; border-radius: 999px; padding: 0 12px; font: inherit; }',
    '.feed-item__replies { margin-top: 12px; margin-left: 24px; padding-left: 12px; border-left: 2px solid #e1e6ee; }',
    '.comment-attachment { display: block; width: 100%; max-width: 220px; border-radius: 10px; margin-top: 10px; }',
    '.badge, .author-badge { display: inline-block; padding: 2px 8px; border-radius: 999px; background: #eef3ff; font-size: 11px; }',
    '.composer { position: sticky; bottom: 0; margin-top: 16px; padding: 12px; background: rgba(243,245,248,0.96); backdrop-filter: blur(8px); border-top: 1px solid #dde3ec; }',
    '.composer form { display: flex; gap: 10px; align-items: center; }',
    '.composer textarea { flex: 1 1 auto; min-height: 52px; border-radius: 16px; border: 1px solid #ccd5e1; padding: 12px; font: inherit; resize: none; }',
    '.composer button { min-height: 44px; border: 1px solid #ccd5e1; background: #fff; border-radius: 999px; padding: 0 14px; font: inherit; }',
    '.ptr-indicator, .load-more-trigger { text-align: center; color: #66707e; padding: 8px 0; font-size: 12px; }',
    showDark ? '@media (prefers-color-scheme: dark) { body { background: #0f1217; color: #e8edf4; } .hero, .feed-item, .composer { background: #171b22; border-color: #2a323e; } .feed-item__name { color: #f2f6fb; } .feed-item__meta, .hero .lede, .ptr-indicator, .load-more-trigger { color: #9aa6b7; } .composer { background: rgba(15,18,23,0.96); border-top-color: #2a323e; } .composer textarea, .composer button, .feed-item__actions button { background: #11151b; color: #e8edf4; border-color: #2a323e; } }' : '',
    '@media (min-width: 768px) { .feed-item__avatar { width: 44px; height: 44px; } .feed-item__text { font-size: 15px; } }',
    '@media (min-width: 1024px) { .page { width: min(720px, calc(100% - 48px)); } .feed-item__avatar { width: 48px; height: 48px; } .feed-item__text { font-size: 16px; } }',
  ].filter(Boolean).join('\n');

  const hero = [
    '<section class="hero">',
    `<p class="kicker">${escapeHtml(topic.site)}</p>`,
    `<h1>${escapeHtml(topic.title)}</h1>`,
    `<p class="lede">${escapeHtml(topic.intro)}</p>`,
    '</section>',
  ].join('\n');

  const composer = [
    '<div class="composer">',
    '<form>',
    '<textarea placeholder="Write a comment"></textarea>',
    '<button type="button">Send</button>',
    '</form>',
    '</div>',
  ].join('\n');

  const body = [
    '<div class="page">',
    hero,
    showPtr ? '<div class="ptr-indicator">↓ Pull to refresh</div>' : '',
    commentsHtml,
    showLoadMore ? '<div class="load-more-trigger">Loading...</div>' : '',
    showSidebar ? '<aside class="hero"><h2>Feed details</h2><p>The mobile cards keep the layout easy to scan with one hand.</p></aside>' : '',
    stickyComposer ? composer : '',
    stickyComposer ? '' : composer,
    '</div>',
  ].filter(Boolean).join('\n');

  return wrapHtml({
    title: `${topic.site} - ${topic.title}`,
    bodyContent: body,
    headExtras: `<style>${css}</style>`,
  });
}

function buildPrompt06Page(pageNum) {
  return renderDisqusLikePage(pageNum);
}

function buildPrompt07Page(pageNum) {
  return renderSemanticPage(pageNum);
}

function buildPrompt08Page(pageNum) {
  return renderBootstrapPage(pageNum);
}

function buildPrompt09Page(pageNum) {
  return renderRedditPage(pageNum);
}

function buildPrompt10Page(pageNum) {
  return renderMobilePage(pageNum);
}

function generatePages(promptId, outputDir, builder) {
  for (let pageNum = 1; pageNum <= 100; pageNum += 1) {
    writePage(outputDir, pageNum, builder(pageNum));
  }
  console.log(`Wrote 100 pages to ${outputDir}`);
}

function main() {
  generatePages(6, path.join(pagesRoot, 'prompt_06'), buildPrompt06Page);
  generatePages(7, path.join(pagesRoot, 'prompt_07'), buildPrompt07Page);
  generatePages(8, path.join(pagesRoot, 'prompt_08'), buildPrompt08Page);
  generatePages(9, path.join(pagesRoot, 'prompt_09'), buildPrompt09Page);
  generatePages(10, path.join(pagesRoot, 'prompt_10'), buildPrompt10Page);
  syncIndexCounts(indexPath, pagesRoot, 40);
  console.log(`Updated ${indexPath}`);
}

main();
