'use strict';

const fs = require('fs');
const path = require('path');

const outputDir = path.resolve(__dirname, '..', 'synthetic_data', 'pages', 'prompt_05');
const indexPath = path.resolve(__dirname, '..', 'synthetic_data', 'INDEX.md');

const scenarios = [
  {
    site: 'ByteLine',
    title: 'AJAX comments make the launch post feel alive',
    lede: 'The thread sits beneath a product update and keeps the conversation moving with small jQuery hooks.',
    topic: 'launch post',
    issue: 'comment latency',
    detail: 'reply toggles',
  },
  {
    site: 'CrumbNotes',
    title: 'Sourdough timing turns into a long comment debate',
    lede: 'Readers compare starter schedules, oven heat, and whether the recipe needs a clearer workflow.',
    topic: 'recipe post',
    issue: 'starter timing',
    detail: 'validation spans',
  },
  {
    site: 'FrameLight',
    title: 'A dusk portrait pulls in exposure notes',
    lede: 'The jQuery-era comment box stays compact under the image while readers add crop advice and color feedback.',
    topic: 'photo post',
    issue: 'exposure notes',
    detail: 'preview block',
  },
  {
    site: 'RailMap',
    title: 'Lisbon tram photos gather route tips',
    lede: 'The page uses a simple inline composer, but the replies still branch a few levels deep.',
    topic: 'travel journal',
    issue: 'route advice',
    detail: 'load more button',
  },
  {
    site: 'LaunchStack',
    title: 'Beta launch feedback lands in the comment thread',
    lede: 'A startup marketing page shows how teams used data hooks and AJAX handlers before heavier frontend stacks.',
    topic: 'marketing page',
    issue: 'product feedback',
    detail: 'edit links',
  },
  {
    site: 'CityWire',
    title: 'Transit vote thread fills with replies',
    lede: 'The news layout leans on a familiar commentlist structure, with votes and nested replies stacked beneath the story.',
    topic: 'news article',
    issue: 'thread order',
    detail: 'vote controls',
  },
  {
    site: 'BuildBench',
    title: 'Router reset advice becomes a troubleshooting chain',
    lede: 'A DIY thread shows the old forum habit of adding small hooks to a page that still works without JavaScript.',
    topic: 'DIY advice',
    issue: 'networking issue',
    detail: 'spinner placeholder',
  },
  {
    site: 'NightRoutines',
    title: 'Bedtime routine post collects long replies',
    lede: 'Parents compare forms, names, and reply chains while the page keeps the base HTML visible and scannable.',
    topic: 'parenting post',
    issue: 'sleep schedule',
    detail: 'comment count',
  },
  {
    site: 'PatchNotes',
    title: 'Indie update thread has bug reports and fixes',
    lede: 'The comment block mixes plain markup with hook classes, then hands the interaction work to jQuery.',
    topic: 'dev blog',
    issue: 'bug reports',
    detail: 'template block',
  },
  {
    site: 'ParkBench',
    title: 'Park redesign comments settle into a long chain',
    lede: 'A local community page uses a late-2000s comment UI with enough structure for replies, votes, and a hidden preview.',
    topic: 'community post',
    issue: 'design feedback',
    detail: 'closed thread state',
  },
];

const palettes = [
  { bg: '#f3f6fb', panel: '#ffffff', line: '#cdd8e7', text: '#222c37', accent: '#44688f', soft: '#e8eef7', highlight: '#ffffd0' },
  { bg: '#f8f4eb', panel: '#fffdf8', line: '#d7c8b0', text: '#2d2419', accent: '#8a5f2c', soft: '#f4ede0', highlight: '#ffffd0' },
  { bg: '#eef4f1', panel: '#ffffff', line: '#c9d8cf', text: '#223028', accent: '#4f7b63', soft: '#e7f0ea', highlight: '#ffffd0' },
  { bg: '#f7f0f2', panel: '#ffffff', line: '#dcc7cc', text: '#342228', accent: '#8b4b5c', soft: '#f5e8eb', highlight: '#ffffd0' },
  { bg: '#f1f4f7', panel: '#ffffff', line: '#ccd5de', text: '#202833', accent: '#5a728e', soft: '#e7edf3', highlight: '#ffffd0' },
  { bg: '#f5f7f2', panel: '#ffffff', line: '#d2dbc8', text: '#24291f', accent: '#6f8c44', soft: '#edf2e5', highlight: '#ffffd0' },
  { bg: '#f9f9f6', panel: '#ffffff', line: '#dbd7c9', text: '#2a281f', accent: '#7c6d55', soft: '#f1ede4', highlight: '#ffffd0' },
  { bg: '#eef1f8', panel: '#ffffff', line: '#cad1e3', text: '#212a39', accent: '#4f6690', soft: '#e4eaf6', highlight: '#ffffd0' },
  { bg: '#f4f8f6', panel: '#ffffff', line: '#ced8d2', text: '#24302a', accent: '#5a7e6a', soft: '#e8f1ec', highlight: '#ffffd0' },
  { bg: '#f6f3ef', panel: '#ffffff', line: '#d8d0c4', text: '#2c251d', accent: '#85735d', soft: '#f1ebe4', highlight: '#ffffd0' },
];

const profiles = {
  jqUiDefault: {
    key: 'jqUiDefault',
    storyTag: 'div',
    shellTag: 'section',
    commentsTag: 'section',
    listTag: 'ol',
    itemTag: 'li',
    classes: {
      shell: 'jq-comments ui-widget ui-widget-content ui-corner-all',
      story: 'story',
      header: 'comments-header ui-widget-header ui-corner-all',
      list: 'comment-list jq-comment-list',
      item: 'comment-item jq-comment-item',
      replies: 'comment-replies',
      meta: 'comment-meta',
      author: 'comment-author',
      time: 'comment-time',
      body: 'comment-body',
      actions: 'comment-actions',
      form: 'comment-form jq-reply-form ui-widget ui-widget-content ui-corner-all',
      inputRow: 'form-row',
      input: 'ui-state-default comment-input',
      textarea: 'ui-state-default comment-textarea',
      submit: 'js-submit ui-state-default submit-btn',
      loadMore: 'js-load-more load-more',
      spinner: 'loading-spinner',
      template: 'comment-template',
      preview: 'comment-preview',
      closed: 'comments-closed',
      count: 'comment-count',
      badge: 'comment-badge',
      vote: 'jq-vote',
      voteCount: 'vote-count',
      replyToggle: 'js-toggle-replies reply-toggle',
      replyButton: 'js-reply-btn reply-link',
      edit: 'js-edit-comment edit-link',
      report: 'js-report report-link',
      avatar: 'avatar profile-pic',
      children: 'comment-children',
    },
    cssExtra: (p) => [
      `.jq-comments { width: 860px; margin: 0 auto 24px; background: ${p.panel}; }`,
      `.ui-widget-header { background: ${p.soft}; color: ${p.accent}; border-bottom: 1px solid ${p.line}; padding: 10px 12px; }`,
      `.comment-list { margin: 0; padding: 0 12px 12px; list-style: none; }`,
      `.jq-comment-item { border-top: 1px solid ${p.line}; padding: 12px 0; overflow: hidden; }`,
      `.jq-comment-item:first-child { border-top: 0; }`,
      `.avatar { float: left; width: 38px; height: 38px; margin-right: 10px; line-height: 38px; text-align: center; background: ${p.soft}; color: ${p.accent}; font-weight: bold; border-radius: 3px; }`,
      `.comment-main { overflow: hidden; }`,
      `.comment-meta { font-size: 12px; margin-bottom: 6px; }`,
      `.comment-author { font-weight: bold; }`,
      `.comment-time { font-size: 11px; color: ${p.accent}; }`,
      `.comment-body p { margin: 0 0 8px; }`,
      `.comment-actions { font-size: 11px; margin-top: 6px; }`,
      `.comment-children { margin-top: 8px; margin-left: 34px; padding-left: 10px; border-left: 2px solid ${p.line}; }`,
      `.comment-form { margin: 12px 12px 0; padding: 12px; }`,
      `.form-row { margin-top: 8px; }`,
      `.comment-input, .comment-textarea { width: 100%; max-width: 560px; border: 1px solid ${p.line}; padding: 5px 6px; font-family: inherit; font-size: 12px; }`,
      `.comment-textarea { min-height: 84px; }`,
      `.submit-btn, .load-more { margin-top: 8px; font-size: 12px; }`,
    ].join('\n'),
  },
  floatClassic: {
    key: 'floatClassic',
    storyTag: 'div',
    shellTag: 'div',
    commentsTag: 'div',
    listTag: 'ul',
    itemTag: 'li',
    classes: {
      shell: 'comment-shell',
      story: 'story',
      header: 'comments-header',
      list: 'commentlist',
      item: 'comment byuser',
      replies: 'children',
      meta: 'comment-meta',
      author: 'fn',
      time: 'comment-time',
      body: 'comment-body',
      actions: 'comment-actions',
      form: 'comment-form',
      inputRow: 'form-row',
      input: 'comment-input',
      textarea: 'comment-textarea',
      submit: 'js-submit submit-btn',
      loadMore: 'js-load-more load-more',
      spinner: 'loading-spinner',
      template: 'comment-template',
      preview: 'comment-preview',
      closed: 'comments-closed',
      count: 'comment-count',
      badge: 'comment-badge',
      vote: 'comment-votes',
      voteCount: 'vote-count',
      replyToggle: 'js-toggle-replies comment-reply-link',
      replyButton: 'js-reply-btn reply-link',
      edit: 'js-edit-comment edit-link',
      report: 'js-report report-link',
      avatar: 'avatar',
      children: 'children',
    },
    cssExtra: (p) => [
      `.comment-shell { width: 860px; margin: 0 auto 24px; }`,
      `.commentlist { list-style: none; margin: 0; padding: 0 12px 12px; background: ${p.panel}; border: 1px solid ${p.line}; border-top: 0; }`,
      `.comment { border-top: 1px solid ${p.line}; padding: 12px 0; overflow: hidden; }`,
      `.comment:first-child { border-top: 0; }`,
      `.avatar { float: left; width: 38px; height: 38px; margin-right: 10px; line-height: 38px; text-align: center; background: ${p.soft}; color: ${p.accent}; font-weight: bold; border-radius: 3px; }`,
      `.comment-main { overflow: hidden; }`,
      `.comment-meta { font-size: 12px; margin-bottom: 6px; }`,
      `.comment-body p { margin: 0 0 8px; }`,
      `.comment-actions { font-size: 11px; margin-top: 6px; }`,
      `.children { margin-top: 8px; margin-left: 32px; padding-left: 10px; border-left: 2px solid ${p.line}; }`,
      `.comment-form { margin-top: 12px; background: ${p.panel}; border: 1px solid ${p.line}; padding: 12px; }`,
      `.comment-input, .comment-textarea { width: 100%; max-width: 540px; border: 1px solid ${p.line}; padding: 5px 6px; font-family: inherit; font-size: 12px; }`,
      `.comment-textarea { min-height: 84px; }`,
    ].join('\n'),
  },
  tableCells: {
    key: 'tableCells',
    storyTag: 'section',
    shellTag: 'div',
    commentsTag: 'div',
    listTag: 'div',
    itemTag: 'div',
    classes: {
      shell: 'table-comments',
      story: 'story',
      header: 'comments-header',
      list: 'comment-table',
      item: 'comment-row',
      replies: 'comment-children',
      meta: 'comment-meta',
      author: 'comment-author',
      time: 'comment-time',
      body: 'comment-body',
      actions: 'comment-actions',
      form: 'comment-form table-form',
      inputRow: 'form-row',
      input: 'comment-input',
      textarea: 'comment-textarea',
      submit: 'js-submit submit-btn',
      loadMore: 'js-load-more load-more',
      spinner: 'loading-spinner',
      template: 'comment-template',
      preview: 'comment-preview',
      closed: 'comments-closed',
      count: 'comment-count',
      badge: 'comment-badge',
      vote: 'jq-vote',
      voteCount: 'vote-count',
      replyToggle: 'js-toggle-replies reply-toggle',
      replyButton: 'js-reply-btn reply-link',
      edit: 'js-edit-comment edit-link',
      report: 'js-report report-link',
      avatar: 'avatar',
      cell: 'comment-cell',
      children: 'comment-children',
    },
    cssExtra: (p) => [
      `.table-comments { width: 860px; margin: 0 auto 24px; }`,
      `.comment-table { display: table; width: 100%; background: ${p.panel}; border: 1px solid ${p.line}; border-top: 0; }`,
      `.comment-row { display: table; width: 100%; border-top: 1px solid ${p.line}; }`,
      `.comment-row:first-child { border-top: 0; }`,
      `.comment-cell { display: table-cell; vertical-align: top; padding: 12px; }`,
      `.avatar { display: inline-block; width: 38px; height: 38px; line-height: 38px; text-align: center; background: ${p.soft}; color: ${p.accent}; font-weight: bold; border-radius: 3px; }`,
      `.comment-meta { font-size: 12px; margin-bottom: 6px; }`,
      `.comment-body p { margin: 0 0 8px; }`,
      `.comment-actions { font-size: 11px; margin-top: 6px; }`,
      `.comment-children { margin-top: 8px; padding-left: 0; border-left: 0; }`,
      `.comment-children .comment-row { border-top-style: dashed; }`,
      `.table-form { margin-top: 12px; background: ${p.panel}; border: 1px solid ${p.line}; padding: 12px; }`,
      `.comment-input, .comment-textarea { width: 100%; max-width: 540px; border: 1px solid ${p.line}; padding: 5px 6px; font-family: inherit; font-size: 12px; }`,
      `.comment-textarea { min-height: 84px; }`,
      `.comment-table .comment-row.new-comment { background: ${p.highlight}; }`,
    ].join('\n'),
  },
  wordpressClassic: {
    key: 'wordpressClassic',
    storyTag: 'article',
    shellTag: 'section',
    commentsTag: 'section',
    listTag: 'ol',
    itemTag: 'li',
    classes: {
      shell: 'comments-area',
      story: 'story',
      header: 'comments-title',
      list: 'commentlist',
      item: 'comment',
      replies: 'children',
      meta: 'comment-meta',
      author: 'fn',
      time: 'comment-time',
      body: 'comment-content',
      actions: 'reply',
      form: 'comment-form',
      inputRow: 'form-row',
      input: 'comment-input',
      textarea: 'comment-textarea',
      submit: 'js-submit submit-btn',
      loadMore: 'js-load-more load-more',
      spinner: 'loading-spinner',
      template: 'comment-template',
      preview: 'comment-preview',
      closed: 'comments-closed',
      count: 'comment-count',
      badge: 'comment-badge',
      vote: 'jq-vote',
      voteCount: 'vote-count',
      replyToggle: 'js-toggle-replies reply-toggle',
      replyButton: 'js-reply-btn comment-reply-link',
      edit: 'js-edit-comment edit-link',
      report: 'js-report report-link',
      avatar: 'avatar',
      children: 'children',
    },
    cssExtra: (p) => [
      `.comments-area { width: 860px; margin: 0 auto 24px; }`,
      `.commentlist { list-style: none; margin: 0; padding: 0 12px 12px; background: ${p.panel}; border: 1px solid ${p.line}; border-top: 0; }`,
      `.comment { border-top: 1px solid ${p.line}; padding: 12px 0; overflow: hidden; }`,
      `.comment:first-child { border-top: 0; }`,
      `.comment.bypostauthor { border-left: 3px solid ${p.accent}; padding-left: 10px; }`,
      `.avatar { float: left; width: 38px; height: 38px; margin-right: 10px; line-height: 38px; text-align: center; background: ${p.soft}; color: ${p.accent}; font-weight: bold; border-radius: 3px; }`,
      `.comment-meta { font-size: 12px; margin-bottom: 6px; }`,
      `.comment-content p { margin: 0 0 8px; }`,
      `.reply { font-size: 11px; margin-top: 6px; }`,
      `.children { margin-top: 8px; margin-left: 32px; padding-left: 10px; border-left: 2px solid ${p.line}; }`,
      `.comment-form { margin-top: 12px; background: ${p.panel}; border: 1px solid ${p.line}; padding: 12px; }`,
      `.comment-input, .comment-textarea { width: 100%; max-width: 540px; border: 1px solid ${p.line}; padding: 5px 6px; font-family: inherit; font-size: 12px; }`,
      `.comment-textarea { min-height: 84px; }`,
    ].join('\n'),
  },
  pluginHooks: {
    key: 'pluginHooks',
    storyTag: 'section',
    shellTag: 'section',
    commentsTag: 'section',
    listTag: 'div',
    itemTag: 'article',
    classes: {
      shell: 'jq-comments comment-wrapper',
      story: 'story',
      header: 'comments-header',
      list: 'comment-wrapper',
      item: 'comment-item jq-comment-item',
      replies: 'comment-replies',
      meta: 'comment-meta',
      author: 'comment-author',
      time: 'comment-time',
      body: 'comment-body',
      actions: 'comment-actions',
      form: 'comment-form jq-reply-form',
      inputRow: 'form-row',
      input: 'comment-input',
      textarea: 'comment-textarea',
      submit: 'js-submit',
      loadMore: 'js-load-more load-more',
      spinner: 'loading-spinner',
      template: 'comment-template',
      preview: 'comment-preview',
      closed: 'comments-closed',
      count: 'comment-count',
      badge: 'comment-badge',
      vote: 'jq-vote',
      voteCount: 'vote-count',
      replyToggle: 'js-toggle-replies reply-toggle',
      replyButton: 'js-reply-btn reply-link',
      edit: 'js-edit-comment edit-link',
      report: 'js-report report-link',
      avatar: 'avatar',
      children: 'comment-children',
    },
    cssExtra: (p) => [
      `.jq-comments { width: 860px; margin: 0 auto 24px; }`,
      `.comment-wrapper { background: ${p.panel}; border: 1px solid ${p.line}; border-top: 0; }`,
      `.comment-item { border-top: 1px solid ${p.line}; padding: 12px; overflow: hidden; }`,
      `.comment-item:first-child { border-top: 0; }`,
      `.avatar { float: left; width: 38px; height: 38px; margin-right: 10px; line-height: 38px; text-align: center; background: ${p.soft}; color: ${p.accent}; font-weight: bold; border-radius: 3px; }`,
      `.comment-meta { font-size: 12px; margin-bottom: 6px; }`,
      `.comment-body p { margin: 0 0 8px; }`,
      `.comment-actions { font-size: 11px; margin-top: 6px; }`,
      `.comment-children { margin-top: 8px; margin-left: 32px; padding-left: 10px; border-left: 2px solid ${p.line}; }`,
      `.comment-form { margin-top: 12px; background: ${p.panel}; border: 1px solid ${p.line}; padding: 12px; }`,
      `.comment-input, .comment-textarea { width: 100%; max-width: 540px; border: 1px solid ${p.line}; padding: 5px 6px; font-family: inherit; font-size: 12px; }`,
      `.comment-textarea { min-height: 84px; }`,
      `.icon-reply, .icon-edit, .icon-vote { font-style: normal; }`,
    ].join('\n'),
  },
};

const templates = [
  {
    key: 'uiFlatTop',
    profileKey: 'jqUiDefault',
    paletteShift: 0,
    rootCount: 4,
    depthLimit: 0,
    formVariant: 'textareaOnly',
    composerPosition: 'top',
    showVotes: true,
    showLoadMore: false,
    showPreview: true,
    showSpinner: true,
    showTemplate: true,
    showSort: true,
    showEditLinks: false,
    showReplyCounts: false,
    useIconFont: false,
    longBodies: true,
    closed: false,
  },
  {
    key: 'uiThreadedBottom',
    profileKey: 'jqUiDefault',
    paletteShift: 1,
    rootCount: 4,
    depthLimit: 1,
    formVariant: 'nameEmail',
    composerPosition: 'bottom',
    showVotes: true,
    showLoadMore: true,
    showPreview: false,
    showSpinner: true,
    showTemplate: false,
    showSort: false,
    showEditLinks: true,
    showReplyCounts: true,
    useIconFont: false,
    longBodies: false,
    closed: false,
  },
  {
    key: 'floatNestedBottom',
    profileKey: 'floatClassic',
    paletteShift: 2,
    rootCount: 3,
    depthLimit: 2,
    formVariant: 'full',
    composerPosition: 'bottom',
    showVotes: true,
    showLoadMore: false,
    showPreview: true,
    showSpinner: false,
    showTemplate: false,
    showSort: false,
    showEditLinks: true,
    showReplyCounts: true,
    useIconFont: false,
    longBodies: true,
    closed: false,
  },
  {
    key: 'tableDepth3Top',
    profileKey: 'tableCells',
    paletteShift: 3,
    rootCount: 3,
    depthLimit: 3,
    formVariant: 'textareaOnly',
    composerPosition: 'top',
    showVotes: true,
    showLoadMore: true,
    showPreview: false,
    showSpinner: true,
    showTemplate: false,
    showSort: true,
    showEditLinks: false,
    showReplyCounts: true,
    useIconFont: true,
    longBodies: false,
    closed: false,
  },
  {
    key: 'wpClassicBottom',
    profileKey: 'wordpressClassic',
    paletteShift: 4,
    rootCount: 5,
    depthLimit: 2,
    formVariant: 'nameEmail',
    composerPosition: 'bottom',
    showVotes: true,
    showLoadMore: false,
    showPreview: true,
    showSpinner: false,
    showTemplate: true,
    showSort: false,
    showEditLinks: true,
    showReplyCounts: true,
    useIconFont: false,
    longBodies: true,
    closed: false,
  },
  {
    key: 'pluginClosed',
    profileKey: 'pluginHooks',
    paletteShift: 5,
    rootCount: 4,
    depthLimit: 1,
    formVariant: 'closed',
    composerPosition: 'bottom',
    showVotes: false,
    showLoadMore: false,
    showPreview: false,
    showSpinner: true,
    showTemplate: true,
    showSort: true,
    showEditLinks: true,
    showReplyCounts: true,
    useIconFont: true,
    longBodies: false,
    closed: true,
  },
  {
    key: 'floatFlatFull',
    profileKey: 'floatClassic',
    paletteShift: 6,
    rootCount: 5,
    depthLimit: 1,
    formVariant: 'full',
    composerPosition: 'top',
    showVotes: true,
    showLoadMore: true,
    showPreview: true,
    showSpinner: true,
    showTemplate: false,
    showSort: false,
    showEditLinks: false,
    showReplyCounts: true,
    useIconFont: false,
    longBodies: false,
    closed: false,
  },
  {
    key: 'uiRichTop',
    profileKey: 'jqUiDefault',
    paletteShift: 7,
    rootCount: 4,
    depthLimit: 2,
    formVariant: 'full',
    composerPosition: 'top',
    showVotes: true,
    showLoadMore: true,
    showPreview: true,
    showSpinner: true,
    showTemplate: true,
    showSort: true,
    showEditLinks: true,
    showReplyCounts: true,
    useIconFont: false,
    longBodies: true,
    closed: false,
  },
  {
    key: 'tableCompactBottom',
    profileKey: 'tableCells',
    paletteShift: 8,
    rootCount: 5,
    depthLimit: 1,
    formVariant: 'full',
    composerPosition: 'bottom',
    showVotes: false,
    showLoadMore: true,
    showPreview: false,
    showSpinner: false,
    showTemplate: false,
    showSort: false,
    showEditLinks: true,
    showReplyCounts: false,
    useIconFont: false,
    longBodies: false,
    closed: false,
  },
  {
    key: 'pluginDeepTop',
    profileKey: 'pluginHooks',
    paletteShift: 9,
    rootCount: 4,
    depthLimit: 3,
    formVariant: 'textareaOnly',
    composerPosition: 'top',
    showVotes: true,
    showLoadMore: true,
    showPreview: true,
    showSpinner: true,
    showTemplate: true,
    showSort: true,
    showEditLinks: true,
    showReplyCounts: true,
    useIconFont: true,
    longBodies: true,
    closed: false,
  },
];

const authors = [
  'Maya Lin',
  'Chris Stone',
  'Jordan Lee',
  'Priya Patel',
  'Sam Carter',
  'Nina Flores',
  'Alex Romero',
  'Tara Nguyen',
  'Ben Howard',
  'Leah Morris',
  'Owen Price',
  'Mina Shah',
  'Iris Cole',
  'Drew Kim',
  'Noah Patel',
  'Zoe Wallace',
];

const pinnedPages = new Set([4, 11, 18, 25, 32, 39, 46, 53, 60, 67]);
const authorResponsePages = new Set([74, 81, 88, 95, 100]);

function pad3(value) {
  return String(value).padStart(3, '0');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function pick(list, index) {
  return list[((index % list.length) + list.length) % list.length];
}

function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function displayTime(timestamp) {
  const d = new Date(timestamp * 1000);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[d.getUTCMonth()];
  const day = String(d.getUTCDate()).padStart(2, '0');
  const year = d.getUTCFullYear();
  let hour = d.getUTCHours();
  const minute = String(d.getUTCMinutes()).padStart(2, '0');
  const suffix = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12 || 12;
  return `${month} ${day}, ${year} ${hour}:${minute} ${suffix}`;
}

function buildCommentText(spec, node) {
  const scenario = spec.scenario;
  const role = node.level === 0 ? 'root comment' : `reply level ${node.level}`;
  const paragraphCount = node.level === 0
    ? (spec.template.longBodies ? 3 : 2)
    : node.level === 1
      ? 2
      : 1;

  const bank = [
    `The ${scenario.topic} page still reads cleanly even before the jQuery hooks attach.`,
    `That ${scenario.detail} is the part I would wire first, because the base HTML already carries the right hooks.`,
    `The AJAX submit path is tiny here, which fits the old habit of keeping the form usable without JavaScript.`,
    `The comment count and reply toggle do most of the visible work, even when the actual network call is hidden away.`,
    `A ${role} like this is exactly why the page keeps both class hooks and plain markup.`,
    `The hidden preview and template block make the composer feel more finished than the old static forms did.`,
    `I would keep the reply chain shallow enough that the slideUp and slideDown motion stays readable.`,
    `The data-id and data-timestamp attributes are doing the structural work for the client code.`,
    `The vote controls are small, but they make the thread feel active in a way plain text cannot.`,
    `The edit link is useful as a progressive enhancement because the page still works when it is never clicked.`,
  ];

  const sentences = [];
  for (let i = 0; i < paragraphCount; i += 1) {
    sentences.push(bank[(spec.num + node.id + node.level + i) % bank.length]);
  }
  return sentences.map((sentence) => `<p>${escapeHtml(sentence)}</p>`).join('');
}

function makeCommentNode(spec, level, siblingIndex, nextId) {
  const author = pick(authors, spec.num + nextId + level + siblingIndex);
  const badgePool = ['Editor', 'Verified', 'Top Commenter'];
  const badges = [];
  if (level === 0 && siblingIndex === 1 && spec.template.showReplyCounts) {
    badges.push(pick(badgePool, spec.num + nextId));
  }
  if (level >= 1 && nextId % 4 === 0) {
    badges.push(pick(badgePool, spec.num + level + nextId));
  }
  const pageBadge = level === 0 && siblingIndex === 0
    ? (pinnedPages.has(spec.num) ? 'Pinned' : authorResponsePages.has(spec.num) ? 'Author Response' : null)
    : null;

  return {
    id: nextId,
    author,
    timestamp: spec.baseTimestamp + (nextId * 4200) + (level * 600),
    badges,
    pageBadge,
    children: [],
    isNew: spec.num % 4 === 0 && level === 0 && siblingIndex === 0,
    votes: spec.template.showVotes ? 3 + ((spec.num + nextId + level) % 19) : null,
  };
}

function buildTree(spec) {
  let nextId = 1;
  const roots = [];
  const make = (level, siblingIndex) => {
    const node = makeCommentNode(spec, level, siblingIndex, nextId);
    nextId += 1;
    return node;
  };

  for (let i = 0; i < spec.template.rootCount; i += 1) {
    roots.push(make(0, i));
  }

  if (spec.template.depthLimit > 0 && roots[0]) {
    let cursor = roots[0];
    for (let level = 1; level <= spec.template.depthLimit; level += 1) {
      const child = make(level, 0);
      cursor.children.push(child);
      cursor = child;
    }
  }

  if (spec.template.depthLimit >= 1 && roots[1]) {
    const first = make(1, 0);
    roots[1].children.push(first);
    if (spec.template.depthLimit >= 2) {
      const second = make(2, 0);
      first.children.push(second);
      if (spec.template.depthLimit >= 3) {
        second.children.push(make(3, 0));
      }
    }
  }

  if (spec.template.depthLimit >= 1 && roots[2]) {
    roots[2].children.push(make(1, 1));
  }

  if (spec.template.depthLimit >= 2 && roots[3]) {
    const branch = make(1, 2);
    roots[3].children.push(branch);
    branch.children.push(make(2, 1));
  }

  if (spec.template.depthLimit >= 3 && roots[4]) {
    const branch = make(1, 3);
    roots[4].children.push(branch);
    const deeper = make(2, 2);
    branch.children.push(deeper);
    deeper.children.push(make(3, 1));
  }

  return roots;
}

function countComments(nodes) {
  let total = 0;
  for (const node of nodes) {
    total += 1 + countComments(node.children);
  }
  return total;
}

function renderBadges(node, spec) {
  const pieces = [];
  if (node.pageBadge) {
    const badgeClass = node.pageBadge === 'Pinned' ? 'pinned-badge' : 'author-response-badge';
    pieces.push(`<span class="badge ${badgeClass}">${escapeHtml(node.pageBadge)}</span>`);
  }
  for (const badge of node.badges) {
    pieces.push(`<span class="badge user-badge">${escapeHtml(badge)}</span>`);
  }
  return pieces.join(' ');
}

function renderVotes(node, spec) {
  if (!spec.template.showVotes) {
    return '';
  }

  return [
    `<div class="${spec.profile.classes.vote}">`,
    `<a href="#" class="js-vote-up" aria-label="Vote up">▲</a>`,
    `<span class="${spec.profile.classes.voteCount}">${node.votes}</span>`,
    `<a href="#" class="js-vote-down" aria-label="Vote down">▼</a>`,
    `</div>`,
  ].join('');
}

function renderReplyToggle(node, spec) {
  if (!node.children.length) {
    return '';
  }
  const targetId = `replies-${spec.num}-${node.id}`;
  return `<a href="#" class="${spec.profile.classes.replyToggle}" data-target="${targetId}">Hide replies</a>`;
}

function renderCommentBody(spec, node) {
  return `<div class="${spec.profile.classes.body}">${buildCommentText(spec, node)}</div>`;
}

function renderActions(spec, node) {
  const pieces = [];
  if (node.children.length) {
    pieces.push(renderReplyToggle(node, spec));
  }
  pieces.push(`<a href="#" class="${spec.profile.classes.replyButton}">Reply</a>`);
  if (spec.template.showEditLinks) {
    pieces.push(`<a href="#" class="${spec.profile.classes.edit}">Edit</a>`);
  }
  pieces.push(`<a href="#" class="${spec.profile.classes.report}">Report</a>`);
  if (spec.template.showVotes) {
    pieces.push(renderVotes(node, spec));
  }
  return `<div class="${spec.profile.classes.actions}">${pieces.join(' | ')}</div>`;
}

function renderAvatar(node) {
  const name = node.author;
  return `<span class="avatar" aria-hidden="true">${escapeHtml(initials(name))}</span>`;
}

function renderNode(spec, node, depth, index) {
  const profile = spec.profile;
  const itemClasses = [
    profile.classes.item,
    `depth-${depth}`,
    index % 2 === 0 ? 'even' : 'odd',
    node.isNew ? 'new-comment' : '',
    node.pageBadge === 'Pinned' ? 'pinned' : '',
    node.pageBadge === 'Author Response' ? 'author-response' : '',
  ].filter(Boolean).join(' ');

  const id = `comment-${spec.num}-${node.id}`;
  const targetId = `replies-${spec.num}-${node.id}`;
  const badgeMarkup = renderBadges(node, spec);
  const avatar = renderAvatar(node);
  const time = displayTime(node.timestamp);
  const meta = [
    `<span class="${profile.classes.author}">${escapeHtml(node.author)}</span>`,
    badgeMarkup ? ` ${badgeMarkup}` : '',
    ` <span class="${profile.classes.time}">${escapeHtml(time)}</span>`,
  ].join('');

  if (profile.key === 'tableCells') {
    const childMarkup = node.children.length
      ? `<div class="${profile.classes.children}" id="${targetId}">${renderList(spec, node.children, depth + 1)}</div>`
      : '';

    return [
      `<div id="${id}" class="${itemClasses}" data-id="${node.id}" data-author="${escapeAttr(node.author)}" data-timestamp="${node.timestamp}" data-depth="${depth}">`,
      `<div class="${profile.classes.cell} avatar-cell">${avatar}</div>`,
      `<div class="${profile.classes.cell} body-cell">`,
      `<div class="${profile.classes.meta}">${meta}</div>`,
      renderCommentBody(spec, node),
      renderActions(spec, node),
      childMarkup,
      `</div>`,
      `</div>`,
    ].join('\n');
  }

  if (profile.key === 'wordpressClassic') {
    const byPostAuthor = node.pageBadge === 'Author Response' ? ' bypostauthor' : '';
    const memberClass = node.badges.length ? ' byuser' : '';
    const childMarkup = node.children.length
      ? `<ol class="${profile.classes.children}" id="${targetId}">${renderList(spec, node.children, depth + 1)}</ol>`
      : '';
    const bodyTag = 'article';

    return [
      `<li id="${id}" class="${itemClasses}${byPostAuthor}${memberClass}" data-id="${node.id}" data-author="${escapeAttr(node.author)}" data-timestamp="${node.timestamp}" data-depth="${depth}">`,
      `<${bodyTag} class="comment-body">`,
      `<footer class="${profile.classes.meta}">`,
      `<div class="vcard">${avatar}<cite class="${profile.classes.author}">${escapeHtml(node.author)}</cite></div>`,
      `<time class="${profile.classes.time}" datetime="${escapeHtml(new Date(node.timestamp * 1000).toISOString())}">${escapeHtml(time)}</time>`,
      badgeMarkup ? `<div>${badgeMarkup}</div>` : '',
      `</footer>`,
      `<div class="${profile.classes.body}">${buildCommentText(spec, node)}</div>`,
      renderActions(spec, node),
      childMarkup,
      `</${bodyTag}>`,
      `</li>`,
    ].join('\n');
  }

  const childMarkup = node.children.length
    ? `<${profile.listTag} class="${profile.classes.children}" id="${targetId}">${renderList(spec, node.children, depth + 1)}</${profile.listTag}>`
    : '';

  return [
    `<${profile.itemTag} id="${id}" class="${itemClasses}" data-id="${node.id}" data-author="${escapeAttr(node.author)}" data-timestamp="${node.timestamp}" data-depth="${depth}">`,
    avatar,
    `<div class="comment-main">`,
    `<div class="${profile.classes.meta}">${meta}</div>`,
    renderCommentBody(spec, node),
    renderActions(spec, node),
    childMarkup,
    `</div>`,
    `</${profile.itemTag}>`,
  ].join('\n');
}

function renderList(spec, nodes, depth) {
  const profile = spec.profile;
  return nodes.map((node, index) => renderNode(spec, node, depth, index)).join('\n');
}

function renderHeader(spec, total) {
  const pieces = [];
  if (spec.template.showSort) {
    pieces.push('<div class="sort-controls">Sort: <a href="#">Top</a> | <a href="#">Newest</a> | <a href="#">Oldest</a></div>');
  }

  return [
    `<div class="${spec.profile.classes.header}">`,
    `<strong>Comments</strong> <span id="${spec.profile.classes.count}">${total}</span> Comments`,
    pieces.length ? ` ${pieces.join(' ')}` : '',
    `</div>`,
  ].join('');
}

function renderComposer(spec) {
  if (spec.template.closed) {
    return `<div class="${spec.profile.classes.closed}">Comments are closed. Existing comments remain below.</div>`;
  }

  const classes = spec.profile.classes;
  const commonRows = [];
  if (spec.formVariant === 'textareaOnly') {
    commonRows.push(
      `<div class="${classes.inputRow}">`,
      `<label for="comment-text">Comment</label>`,
      `<textarea id="comment-text" name="comment" class="${classes.textarea} js-preview-source"></textarea>`,
      `<span class="error-msg" style="display:none">Please enter a comment.</span>`,
      `</div>`,
    );
  } else if (spec.formVariant === 'nameEmail') {
    commonRows.push(
      `<div class="${classes.inputRow}">`,
      `<label for="comment-name">Name</label>`,
      `<input type="text" id="comment-name" name="name" class="${classes.input} ui-state-default">`,
      `<span class="error-msg" style="display:none">Name is required.</span>`,
      `</div>`,
      `<div class="${classes.inputRow}">`,
      `<label for="comment-email">Email</label>`,
      `<input type="email" id="comment-email" name="email" class="${classes.input} ui-state-default">`,
      `<span class="error-msg" style="display:none">Email is required.</span>`,
      `</div>`,
      `<div class="${classes.inputRow}">`,
      `<label for="comment-text">Comment</label>`,
      `<textarea id="comment-text" name="comment" class="${classes.textarea} js-preview-source"></textarea>`,
      `</div>`,
    );
  } else {
    commonRows.push(
      `<div class="${classes.inputRow}">`,
      `<label for="comment-name">Name</label>`,
      `<input type="text" id="comment-name" name="name" class="${classes.input} ui-state-default">`,
      `</div>`,
      `<div class="${classes.inputRow}">`,
      `<label for="comment-email">Email</label>`,
      `<input type="email" id="comment-email" name="email" class="${classes.input} ui-state-default">`,
      `</div>`,
      `<div class="${classes.inputRow}">`,
      `<label for="comment-website">Website</label>`,
      `<input type="url" id="comment-website" name="website" class="${classes.input} ui-state-default">`,
      `</div>`,
      `<div class="${classes.inputRow}">`,
      `<label for="comment-text">Comment</label>`,
      `<textarea id="comment-text" name="comment" class="${classes.textarea} js-preview-source"></textarea>`,
      `</div>`,
    );
  }

  const controls = [
    `<button id="submit-btn" type="submit" class="${classes.submit}">Post Comment</button>`,
  ];

  if (spec.template.showPreview) {
    controls.push(`<button type="button" class="js-preview ui-state-default">Preview</button>`);
  }

  const rows = [
    `<form id="comment-form" class="${classes.form}" action="#" method="post">`,
    ...commonRows,
    `<div class="${classes.inputRow}">${controls.join(' ')}</div>`,
    `</form>`,
  ];

  if (spec.template.showSpinner) {
    rows.push(`<div class="${classes.spinner}" style="display:none"><img src="spinner.gif" alt="" /></div>`);
  }

  if (spec.template.showPreview) {
    rows.push(`<div id="comment-preview" class="${classes.preview}" style="display:none">Preview will appear here.</div>`);
  }

  if (spec.template.showTemplate) {
    rows.push([
      `<div class="${classes.template}" style="display:none">`,
      `<div class="comment-item template-sample">`,
      `<div class="comment-meta"><span class="comment-author">Template User</span> <span class="comment-time">Oct 01, 2011 2:15 PM</span></div>`,
      `<div class="comment-body"><p>This hidden template block is there for jQuery cloning.</p></div>`,
      `</div>`,
      `</div>`,
    ].join('\n'));
  }

  return rows.join('\n');
}

function renderLoadMore(spec) {
  if (!spec.template.showLoadMore) {
    return '';
  }

  return `<div class="load-more-wrap"><button type="button" class="${spec.profile.classes.loadMore}">Load 10 more</button></div>`;
}

function renderStory(spec) {
  const scenario = spec.scenario;
  const profile = spec.profile;
  const tag = profile.storyTag;
  return [
    `<${tag} class="${profile.classes.story}">`,
    `<header>`,
    `<p class="kicker">${escapeHtml(scenario.site)}</p>`,
    `<h1>${escapeHtml(scenario.title)}</h1>`,
    `<p class="lede">${escapeHtml(scenario.lede)}</p>`,
    `</header>`,
    `<p>The page is built to show how jQuery-era teams wrapped behavior around meaningful static HTML.</p>`,
    `<p>It keeps the comment block parseable without JavaScript while still exposing ids, data attributes, and hook classes for enhancement.</p>`,
    `</${tag}>`,
  ].join('\n');
}

function buildCss(spec) {
  const p = spec.palette;
  return [
    'body {',
    `  background: ${p.bg};`,
    `  color: ${p.text};`,
    '  margin: 0;',
    '  font-family: Arial, Helvetica, sans-serif;',
    '  font-size: 13px;',
    '  line-height: 1.45;',
    '}',
    'a:link, a:visited { color: ' + p.accent + '; text-decoration: none; }',
    'a:hover { text-decoration: underline; }',
    'h1, h2, p, ul, ol { margin: 0; padding: 0; }',
    'ul, ol { list-style: none; }',
    '.page { width: 860px; margin: 0 auto; padding: 18px 0 32px; }',
    '.story { background: ' + p.panel + '; border: 1px solid ' + p.line + '; padding: 16px 18px; margin-bottom: 16px; }',
    '.story header { margin-bottom: 10px; }',
    '.story .kicker { font-size: 11px; letter-spacing: 0; color: ' + p.accent + '; margin-bottom: 4px; text-transform: uppercase; }',
    '.story h1 { font-size: 26px; margin-bottom: 6px; }',
    '.story .lede { font-size: 12px; color: ' + p.accent + '; }',
    '.comments-header { font-size: 13px; }',
    '.sort-controls { margin-top: 6px; font-size: 11px; }',
    '.comment-badge, .badge { display: inline-block; padding: 1px 6px; margin-left: 4px; border-radius: 10px; font-size: 10px; line-height: 1.4; background: ' + p.soft + '; color: ' + p.accent + '; }',
    '.pinned-badge { background: #fff2a8; color: #5b4a00; }',
    '.author-response-badge { background: #dff0d8; color: #285b2f; }',
    '.user-badge { background: ' + p.soft + '; }',
    '.new-comment { background: ' + p.highlight + '; }',
    '.loading-spinner { margin-top: 10px; }',
    '.loading-spinner img { vertical-align: middle; }',
    '.comment-template, #comment-preview { display: none; }',
    '.error-msg { display: none; color: #a33; font-size: 11px; margin-left: 6px; }',
    '.vote-count { display: inline-block; min-width: 22px; text-align: center; }',
    '.reply-toggle { font-size: 11px; }',
    '.reply-link, .edit-link, .report-link { font-size: 11px; }',
    '.comment-actions { white-space: nowrap; }',
    '.comment-actions a { margin-right: 6px; }',
    '.comment-main { overflow: hidden; }',
    '.comment-body p { margin-bottom: 8px; }',
    '.comment-form label { display: block; font-size: 12px; margin-bottom: 3px; }',
    '.comment-form .form-row { margin-bottom: 8px; }',
    '.comment-form .ui-state-default { background: #fff; }',
    '.comments-closed { background: ' + p.soft + '; border: 1px solid ' + p.line + '; padding: 10px 12px; margin-top: 12px; }',
    '.comment.new-comment { box-shadow: inset 0 0 0 1px rgba(255, 238, 102, 0.55); }',
    '.comment-item, .comment-row, .comment { transition: all 0.3s ease; }',
    spec.profile.cssExtra(p),
    '.comment-table .comment-row .comment-body p, .commentlist .comment-body p, .jq-comment-item .comment-body p, .comment-item .comment-body p { max-width: 680px; }',
  ].join('\n');
}

function renderInlineScript() {
  return [
    '<script>',
    '$(document).ready(function() {',
    '  var $form = $("#comment-form");',
    '  var $count = $("#comment-count");',
    '  function updateCount(delta) {',
    '    var current = parseInt($count.text(), 10) || 0;',
    '    $count.text(current + delta);',
    '  }',
    '  $(".js-toggle-replies").on("click", function(e) {',
    '    e.preventDefault();',
    '    var target = $(this).data("target");',
    '    var $target = $("#" + target);',
    '    if ($target.is(":visible")) {',
    '      $target.slideUp(180);',
    '      $(this).text("Show replies");',
    '    } else {',
    '      $target.slideDown(180);',
    '      $(this).text("Hide replies");',
    '    }',
    '  });',
    '  $(".js-vote-up, .js-vote-down").on("click", function(e) {',
    '    e.preventDefault();',
    '    var $countNode = $(this).siblings(".vote-count");',
    '    var value = parseInt($countNode.text(), 10) || 0;',
    '    if ($(this).hasClass("js-vote-up")) {',
    '      $countNode.text(value + 1);',
    '    } else {',
    '      $countNode.text(Math.max(0, value - 1));',
    '    }',
    '  });',
    '  $(".js-preview").on("click", function(e) {',
    '    e.preventDefault();',
    '    var value = $("#comment-text").val() || "Preview will appear here.";',
    '    $("#comment-preview").html("<p>" + value + "</p>").show();',
    '  });',
    '  $(".js-load-more").on("click", function(e) {',
    '    e.preventDefault();',
    '    $(this).text("Loading more comments...");',
    '  });',
    '  $(".js-edit-comment").on("click", function(e) {',
    '    e.preventDefault();',
    '    $(this).closest(".comment-item, .comment, .comment-row, article").find(".comment-body").first().toggleClass("editing");',
    '  });',
    '  $(".js-reply-btn").on("click", function(e) {',
    '    e.preventDefault();',
    '  });',
    '  if ($form.length) {',
    '    $form.on("submit", function(e) {',
    '      e.preventDefault();',
    '      $(".loading-spinner").show();',
    '      var payload = {',
    '        name: $("#comment-name").val(),',
    '        email: $("#comment-email").val(),',
    '        website: $("#comment-website").val(),',
    '        comment: $("#comment-text").val()',
    '      };',
    '      $.ajax({',
    '        type: "POST",',
    '        url: "/comments/ajax",',
    '        data: payload,',
    '        success: function() {',
    '          updateCount(1);',
    '          $(".loading-spinner").hide();',
    '        },',
    '        error: function() {',
    '          $(".loading-spinner").hide();',
    '        }',
    '      });',
    '    });',
    '  }',
    '});',
    '</script>',
  ].join('\n');
}

function renderPage(spec, tree) {
  const total = countComments(tree);
  const css = buildCss(spec);
  const story = renderStory(spec);
  const header = renderHeader(spec, total);
  const topComposer = spec.template.composerPosition === 'top' ? renderComposer(spec) : '';
  const bottomComposer = spec.template.composerPosition === 'bottom' ? renderComposer(spec) : '';
  const listMarkup = renderList(spec, tree, 0);
  const loadMore = renderLoadMore(spec);
  const commentsTag = spec.profile.commentsTag;

  const commentsBlock = [
    `<${commentsTag} id="comments" class="${spec.profile.classes.shell}">`,
    topComposer,
    header,
    `<${spec.profile.listTag} id="comment-list" class="${spec.profile.classes.list}">`,
    listMarkup,
    `</${spec.profile.listTag}>`,
    loadMore,
    bottomComposer,
    `</${commentsTag}>`,
  ]
    .filter((part) => part !== '')
    .join('\n');

  const pageBody = [
    `<div class="page">`,
    story,
    commentsBlock,
    `</div>`,
  ].join('\n');

  const headPieces = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(spec.scenario.site)} - ${escapeHtml(spec.scenario.title)}</title>`,
  ];

  if (spec.template.useIconFont) {
    headPieces.push('<link rel="stylesheet" href="icons.css">');
  }

  headPieces.push('<style type="text/css">', css, '</style>');
  headPieces.push('<script src="https://ajax.googleapis.com/ajax/libs/jquery/1.x.x/jquery.min.js"></script>');
  headPieces.push(renderInlineScript());

  return [
    '<!DOCTYPE html>',
    '<html>',
    '<head>',
    ...headPieces,
    '</head>',
    '<body>',
    pageBody,
    '</body>',
    '</html>',
  ].join('\n');
}

function pageSpec(num) {
  const template = templates[(num - 1) % templates.length];
  const scenario = scenarios[Math.floor((num - 1) / templates.length)];
  const profile = profiles[template.profileKey];
  const palette = palettes[(template.paletteShift + Math.floor((num - 1) / templates.length)) % palettes.length];
  return {
    num,
    template,
    scenario,
    profile,
    palette,
    baseTimestamp: 1293840000 + (num * 86400),
  };
}

function updateIndexFile() {
  const index = fs.readFileSync(indexPath, 'utf8');
  const updated = index
    .replace(/\| 05 \| [^|]+ \| `\/synthetic\/prompt_05\/` \|/, '| 05 | 100 / 100 | `/synthetic/prompt_05/` |')
    .replace(/\*\*Total:\*\* [^\n]+/, '**Total:** 500 / 2,000');
  fs.writeFileSync(indexPath, updated, 'utf8');
}

function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  for (let num = 1; num <= 100; num += 1) {
    const spec = pageSpec(num);
    const tree = buildTree(spec);
    const html = renderPage(spec, tree);
    const filename = path.join(outputDir, `page_${pad3(num)}.html`);
    fs.writeFileSync(filename, html, 'utf8');
  }
  updateIndexFile();
  console.log(`Wrote 100 pages to ${outputDir}`);
  console.log(`Updated ${indexPath}`);
}

main();
