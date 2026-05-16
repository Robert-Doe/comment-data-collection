'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const outputDir = path.resolve(__dirname, '..', 'synthetic_data', 'pages', 'prompt_04');
const indexPath = path.resolve(__dirname, '..', 'synthetic_data', 'INDEX.md');

const scenarios = [
  {
    site: 'MetroFeed',
    title: 'New comment likes spread across news stories',
    lede: 'A breaking-news post picks up the early social comment patterns.',
    topic: 'tech rollout',
    issue: 'profile identity',
    detail: 'like count',
    angle: 'news feed',
    fact: 'people started treating comments like a mini feed',
  },
  {
    site: 'PopFlash',
    title: 'Red carpet photo draws emoji-heavy replies',
    lede: 'The photo page pulls the comment box directly under the image.',
    topic: 'celebrity photo',
    issue: 'reaction style',
    detail: 'profile photo',
    angle: 'photo page',
    fact: 'short replies worked better than long paragraphs',
  },
  {
    site: 'PitchSide',
    title: 'Late goal screenshot sparks a debate',
    lede: 'Fans react in the same box beneath the post, not on a separate page.',
    topic: 'sports moment',
    issue: 'thread order',
    detail: 'timestamp',
    angle: 'match reaction',
    fact: 'reply counts became a social cue',
  },
  {
    site: 'CityLoop',
    title: 'Council vote on bike lanes splits the comments',
    lede: 'The inline box sits right below the article body.',
    topic: 'politics',
    issue: 'tone control',
    detail: 'reply link',
    angle: 'news article',
    fact: 'names and faces made the replies feel more personal',
  },
  {
    site: 'BurgerLog',
    title: 'Burger review gets a wave of likes',
    lede: 'Readers keep the conversation short and fast-moving.',
    topic: 'food review',
    issue: 'food detail',
    detail: 'thumbs count',
    angle: 'review page',
    fact: 'one-line reactions were common on food posts',
  },
  {
    site: 'TravelGrid',
    title: 'Sunset harbor photo from Lisbon',
    lede: 'Comments appear directly under the image and stay compact.',
    topic: 'travel photo',
    issue: 'location note',
    detail: 'avatar',
    angle: 'photo share',
    fact: 'comment box often looked like a status update field',
  },
  {
    site: 'LaunchBoard',
    title: 'New phone teaser lands on the front page',
    lede: 'Reactions stack below the announcement in a familiar social block.',
    topic: 'product announcement',
    issue: 'launch timing',
    detail: 'like button',
    angle: 'product post',
    fact: 'small inline inputs replaced bigger forms',
  },
  {
    site: 'NightShift',
    title: 'Coffee and code at 1:12 a.m.',
    lede: 'A plain status box now behaves a lot like a tiny feed.',
    topic: 'status update',
    issue: 'status tone',
    detail: 'reply chain',
    angle: 'status update',
    fact: 'replies were designed to feel immediate',
  },
  {
    site: 'LinkStack',
    title: 'Battery life article gets passed around',
    lede: 'The shared-link layout keeps the comments very close to the article.',
    topic: 'link share',
    issue: 'link preview',
    detail: 'comment count',
    angle: 'shared article',
    fact: 'social identity was the point of the design',
  },
  {
    site: 'OldThreads',
    title: 'Why comment boxes became mini-feeds',
    lede: 'The page is really a history of how the social comment block evolved.',
    topic: 'comment history',
    issue: 'layout pattern',
    detail: 'composer',
    angle: 'design meta',
    fact: 'early pattern pushed short, frequent replies',
  },
];

const palettes = [
  { bg: '#f7f7f7', panel: '#ffffff', line: '#d7dce2', text: '#1f252d', accent: '#3b5998', soft: '#eef2f8' },
  { bg: '#f2f4f7', panel: '#ffffff', line: '#ccd5df', text: '#233041', accent: '#5a6f8f', soft: '#e8edf3' },
  { bg: '#f7f6f2', panel: '#ffffff', line: '#d9d2c7', text: '#2b241d', accent: '#8b5d2b', soft: '#f1ebe2' },
  { bg: '#eef4f0', panel: '#ffffff', line: '#cad8cf', text: '#223027', accent: '#4d7a61', soft: '#e6f0ea' },
  { bg: '#f6eef0', panel: '#ffffff', line: '#d9c2c7', text: '#35242a', accent: '#8a4758', soft: '#f4e4e7' },
  { bg: '#eef2fb', panel: '#ffffff', line: '#cad4e7', text: '#222c3b', accent: '#476aa0', soft: '#e4ebf9' },
  { bg: '#f4f8f6', panel: '#ffffff', line: '#d1ddd6', text: '#24302a', accent: '#5b8a6b', soft: '#e8f1eb' },
  { bg: '#faf7f0', panel: '#ffffff', line: '#ddd3c3', text: '#2d2419', accent: '#7c6550', soft: '#f4eee5' },
  { bg: '#f0f5fb', panel: '#ffffff', line: '#cfd9e7', text: '#1f2a37', accent: '#5a7699', soft: '#e7eff8' },
  { bg: '#f3f1f6', panel: '#ffffff', line: '#d8d2e3', text: '#272333', accent: '#6b5a91', soft: '#ece7f4' },
];

const profiles = [
  {
    key: 'facebookIframe',
    shellTag: 'div',
    outerTag: 'div',
    commentsTag: 'section',
    listTag: 'div',
    itemTag: 'div',
    classless: false,
    useIframe: true,
    useSection: true,
    composerPosition: 'top',
    composerType: 'input',
    commentMode: 'flat',
    reactionMode: 'text',
    showSort: false,
    showLoadMore: false,
    showReplyCounts: false,
    avatarClass: 'profile-pic',
    classes: {
      shell: 'iframe-shell',
      shellBar: 'iframe-bar',
      shellBody: 'iframe-body',
      story: 'story',
      likeBar: 'people-like',
      header: 'comments-header',
      sort: 'sort-toggle',
      list: 'comment-list',
      item: 'comment-item',
      itemReply: 'reply',
      meta: 'comment-meta',
      author: 'comment-author',
      time: 'comment-time',
      replyLink: 'reply-link',
      body: 'comment-body',
      actions: 'comment-actions',
      replies: 'replies',
      replyCount: 'reply-count',
      form: 'comment-form',
      inputRow: 'composer-row',
      input: 'composer-input',
      loadMore: 'load-more',
      profilePic: 'profile-pic',
      vcard: 'vcard',
      fn: 'fn',
      url: 'url',
      like: 'like-btn',
      likeCount: 'like-count',
      share: 'share-link',
      report: 'report-link',
      counter: 'comment-counter',
    },
  },
  {
    key: 'classlessPlain',
    shellTag: 'div',
    outerTag: 'div',
    commentsTag: 'div',
    listTag: 'ul',
    itemTag: 'li',
    classless: true,
    useIframe: false,
    useSection: false,
    composerPosition: 'bottom',
    composerType: 'textarea',
    commentMode: 'flat',
    reactionMode: 'thumb',
    showSort: false,
    showLoadMore: false,
    showReplyCounts: false,
    avatarClass: null,
    classes: {
      shell: 'comment-shell',
      page: 'page',
      story: 'story',
      header: 'comments-header',
      likeBar: 'people-like',
      sort: 'sort-toggle',
      list: null,
      item: null,
      meta: null,
      author: null,
      time: null,
      replyLink: null,
      body: null,
      actions: null,
      replies: null,
      replyCount: null,
      form: null,
      inputRow: null,
      input: null,
      loadMore: null,
      profilePic: null,
      like: null,
      likeCount: null,
      share: null,
      report: null,
      counter: null,
    },
  },
  {
    key: 'ufiReplies',
    shellTag: 'div',
    outerTag: 'div',
    commentsTag: 'section',
    listTag: 'ul',
    itemTag: 'li',
    classless: false,
    useIframe: false,
    useSection: true,
    composerPosition: 'bottom',
    composerType: 'input',
    commentMode: 'threaded',
    reactionMode: 'heart',
    showSort: true,
    showLoadMore: false,
    showReplyCounts: true,
    avatarClass: 'profile-pic',
    classes: {
      shell: 'ufi-shell',
      shellBar: 'ufi-bar',
      shellBody: 'ufi-body',
      story: 'story',
      likeBar: 'people-like',
      header: 'ufi-header',
      sort: 'ufi-sort',
      list: 'ufi-list',
      item: 'UFIComment',
      itemReply: 'reply',
      meta: 'UFICommentMeta',
      author: 'UFICommentActor',
      time: 'UFICommentTimestamp',
      replyLink: 'UFIReplyLink',
      body: 'UFICommentBody',
      actions: 'UFICommentActions',
      replies: 'UFIReplyList',
      replyCount: 'UFIReplyToggle',
      form: 'UFICommentForm',
      inputRow: 'UFIInputRow',
      input: 'UFIComposerInput',
      loadMore: 'UFILoadMore',
      profilePic: 'profile-pic',
      vcard: 'vcard',
      fn: 'fn',
      url: 'url',
      like: 'UFILikeLink',
      likeCount: 'UFILikeCount',
      share: 'UFIShare',
      report: 'UFIReport',
      counter: 'comment-counter',
    },
  },
  {
    key: 'microformatBoth',
    shellTag: 'div',
    outerTag: 'div',
    commentsTag: 'section',
    listTag: 'div',
    itemTag: 'div',
    classless: false,
    useIframe: false,
    useSection: true,
    composerPosition: 'both',
    composerType: 'textarea',
    commentMode: 'flat',
    reactionMode: 'text',
    showSort: false,
    showLoadMore: false,
    showReplyCounts: false,
    avatarClass: 'avatar',
    classes: {
      shell: 'micro-shell',
      shellBar: 'micro-bar',
      shellBody: 'micro-body',
      story: 'story',
      likeBar: 'people-like',
      header: 'micro-header',
      sort: 'micro-sort',
      list: 'micro-list',
      item: 'entry-comment',
      itemReply: 'reply',
      meta: 'comment-meta',
      author: 'vcard',
      time: 'comment-time',
      replyLink: 'reply-link',
      body: 'comment-text',
      actions: 'comment-tools',
      replies: 'replies',
      replyCount: 'reply-count',
      form: 'comment-form',
      inputRow: 'form-row',
      input: 'composer-input',
      loadMore: 'load-more',
      avatar: 'avatar',
      profilePic: 'avatar',
      vcard: 'vcard',
      fn: 'fn',
      url: 'url',
      like: 'like-link',
      likeCount: 'like-count',
      share: 'share-link',
      report: 'report-link',
      counter: 'comment-counter',
    },
  },
  {
    key: 'socialLoadMore',
    shellTag: 'div',
    outerTag: 'div',
    commentsTag: 'section',
    listTag: 'div',
    itemTag: 'div',
    classless: false,
    useIframe: false,
    useSection: true,
    composerPosition: 'bottom',
    composerType: 'textarea',
    commentMode: 'flat',
    reactionMode: 'heart',
    showSort: false,
    showLoadMore: true,
    showReplyCounts: false,
    avatarClass: 'profile-pic',
    classes: {
      shell: 'social-shell',
      shellBar: 'social-bar',
      shellBody: 'social-body',
      story: 'story',
      likeBar: 'people-like',
      header: 'social-header',
      sort: 'social-sort',
      list: 'social-list',
      item: 'social-comment',
      itemReply: 'reply',
      meta: 'social-meta',
      author: 'social-author',
      time: 'social-time',
      replyLink: 'reply-link',
      body: 'social-body-text',
      actions: 'social-tools',
      replies: 'social-replies',
      replyCount: 'reply-count',
      form: 'social-form',
      inputRow: 'form-row',
      input: 'composer-input',
      loadMore: 'social-load-more',
      profilePic: 'profile-pic',
      vcard: 'vcard',
      fn: 'fn',
      url: 'url',
      like: 'like-btn',
      likeCount: 'like-count',
      share: 'share-link',
      report: 'report-link',
      counter: 'comment-counter',
    },
  },
  {
    key: 'streamFlat',
    shellTag: 'div',
    outerTag: 'div',
    commentsTag: 'section',
    listTag: 'div',
    itemTag: 'div',
    classless: false,
    useIframe: false,
    useSection: true,
    composerPosition: 'top',
    composerType: 'input',
    commentMode: 'flat',
    reactionMode: 'thumb',
    showSort: false,
    showLoadMore: false,
    showReplyCounts: false,
    avatarClass: 'profile-pic',
    classes: {
      shell: 'stream-shell',
      shellBar: 'stream-bar',
      shellBody: 'stream-body',
      story: 'story',
      likeBar: 'people-like',
      header: 'stream-header',
      sort: 'stream-sort',
      list: 'stream-list',
      item: 'stream-item',
      itemReply: 'reply',
      meta: 'stream-meta',
      author: 'stream-author',
      time: 'stream-time',
      replyLink: 'reply-link',
      body: 'stream-body-text',
      actions: 'stream-tools',
      replies: 'stream-replies',
      replyCount: 'reply-count',
      form: 'stream-form',
      inputRow: 'form-row',
      input: 'composer-input',
      loadMore: 'stream-load-more',
      profilePic: 'profile-pic',
      vcard: 'vcard',
      fn: 'fn',
      url: 'url',
      like: 'like-btn',
      likeCount: 'like-count',
      share: 'share-link',
      report: 'report-link',
      counter: 'comment-counter',
    },
  },
  {
    key: 'activityThreaded',
    shellTag: 'div',
    outerTag: 'div',
    commentsTag: 'section',
    listTag: 'ul',
    itemTag: 'li',
    classless: false,
    useIframe: false,
    useSection: true,
    composerPosition: 'bottom',
    composerType: 'textarea',
    commentMode: 'collapsed',
    reactionMode: 'text',
    showSort: false,
    showLoadMore: false,
    showReplyCounts: true,
    avatarClass: 'profile-pic',
    classes: {
      shell: 'activity-shell',
      shellBar: 'activity-bar',
      shellBody: 'activity-body',
      story: 'story',
      likeBar: 'people-like',
      header: 'activity-header',
      sort: 'activity-sort',
      list: 'activity-list',
      item: 'activity-item',
      itemReply: 'reply',
      meta: 'activity-meta',
      author: 'activity-author',
      time: 'activity-time',
      replyLink: 'reply-link',
      body: 'activity-body-text',
      actions: 'activity-tools',
      replies: 'activity-replies',
      replyCount: 'activity-reply-count',
      form: 'activity-form',
      inputRow: 'form-row',
      input: 'composer-input',
      loadMore: 'activity-load-more',
      profilePic: 'profile-pic',
      vcard: 'vcard',
      fn: 'fn',
      url: 'url',
      like: 'like-btn',
      likeCount: 'like-count',
      share: 'share-link',
      report: 'report-link',
      counter: 'comment-counter',
    },
  },
  {
    key: 'rowSort',
    shellTag: 'div',
    outerTag: 'div',
    commentsTag: 'section',
    listTag: 'ul',
    itemTag: 'li',
    classless: false,
    useIframe: false,
    useSection: true,
    composerPosition: 'bottom',
    composerType: 'input',
    commentMode: 'threaded',
    reactionMode: 'thumb',
    showSort: true,
    showLoadMore: false,
    showReplyCounts: true,
    avatarClass: 'profile-pic',
    classes: {
      shell: 'row-shell',
      shellBar: 'row-bar',
      shellBody: 'row-body',
      story: 'story',
      likeBar: 'people-like',
      header: 'row-header',
      sort: 'row-sort',
      list: 'row-list',
      item: 'comment-row',
      itemReply: 'reply',
      meta: 'comment-user',
      author: 'comment-user-name',
      time: 'comment-time',
      replyLink: 'reply-link',
      body: 'comment-text',
      actions: 'comment-foot',
      replies: 'row-replies',
      replyCount: 'reply-count',
      form: 'comment-form',
      inputRow: 'form-row',
      input: 'composer-input',
      loadMore: 'load-more',
      profilePic: 'profile-pic',
      vcard: 'vcard',
      fn: 'fn',
      url: 'url',
      like: 'like-btn',
      likeCount: 'like-count',
      share: 'share-link',
      report: 'report-link',
      counter: 'comment-counter',
    },
  },
  {
    key: 'inlineMixed',
    shellTag: 'div',
    outerTag: 'div',
    commentsTag: 'section',
    listTag: 'div',
    itemTag: 'div',
    classless: false,
    useIframe: false,
    useSection: true,
    composerPosition: 'both',
    composerType: 'textarea',
    commentMode: 'flat',
    reactionMode: 'heart',
    showSort: false,
    showLoadMore: false,
    showReplyCounts: false,
    avatarClass: 'profile-pic',
    classes: {
      shell: 'inline-shell',
      shellBar: 'inline-bar',
      shellBody: 'inline-body',
      story: 'story',
      likeBar: 'people-like',
      header: 'inline-header',
      sort: 'inline-sort',
      list: 'inline-list',
      item: 'inline-comment',
      itemReply: 'reply',
      meta: 'inline-meta',
      author: 'inline-author',
      time: 'inline-time',
      replyLink: 'reply-link',
      body: 'inline-body-text',
      actions: 'inline-actions',
      replies: 'inline-replies',
      replyCount: 'reply-count',
      form: 'inline-form',
      inputRow: 'form-row',
      input: 'composer-input',
      loadMore: 'inline-load-more',
      profilePic: 'profile-pic',
      vcard: 'vcard',
      fn: 'fn',
      url: 'url',
      like: 'like-btn',
      likeCount: 'like-count',
      share: 'share-link',
      report: 'report-link',
      counter: 'comment-counter',
    },
  },
  {
    key: 'opaqueCompact',
    shellTag: 'div',
    outerTag: 'div',
    commentsTag: 'section',
    listTag: 'ul',
    itemTag: 'li',
    classless: false,
    useIframe: false,
    useSection: true,
    composerPosition: 'bottom',
    composerType: 'textarea',
    commentMode: 'collapsed',
    reactionMode: 'text',
    showSort: false,
    showLoadMore: true,
    showReplyCounts: true,
    avatarClass: 'avatar',
    classes: {
      shell: 'cbox',
      shellBar: 'cbox-bar',
      shellBody: 'cbox-body',
      story: 'story',
      likeBar: 'people-like',
      header: 'cmt-head',
      sort: 'cmt-sort',
      list: 'cmt-list',
      item: 'cmt',
      itemReply: 'reply',
      meta: 'cmt-hd',
      author: 'cmt-user',
      time: 'cmt-time',
      replyLink: 'reply-link',
      body: 'cmt-bd',
      actions: 'cmt-ft',
      replies: 'cmt-replies',
      replyCount: 'cmt-reply-count',
      form: 'cmt-form',
      inputRow: 'form-row',
      input: 'composer-input',
      loadMore: 'cmt-more',
      profilePic: 'avatar',
      vcard: 'vcard',
      fn: 'fn',
      url: 'url',
      like: 'like-btn',
      likeCount: 'like-count',
      share: 'share-link',
      report: 'report-link',
      counter: 'comment-counter',
    },
  },
];

function pad2(value) {
  return String(value).padStart(2, '0');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function md5Hex(value) {
  return crypto.createHash('md5').update(String(value)).digest('hex');
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function pick(list, index) {
  return list[index % list.length];
}

function pageSpec(num) {
  const group = Math.floor((num - 1) / 10);
  const profile = profiles[group];
  const scenario = scenarios[(num - 1) % scenarios.length];
  const palette = palettes[group % palettes.length];
  const visibleCount = 3 + ((num * 7 + group) % 18);
  const headingVariants = ['47 Comments', 'Add a comment...', 'View all comments', 'Join the discussion'];
  const composerPlacement =
    profile.composerPosition === 'both' ? 'both'
      : profile.composerPosition === 'top' ? 'top'
        : profile.composerPosition === 'bottom' ? 'bottom'
          : 'bottom';
  const composerType =
    profile.composerType === 'input' ? 'input'
      : profile.composerType === 'textarea' ? 'textarea'
        : 'textarea';
  const likeBar = num <= 15 || (group === 4 && num % 2 === 0);
  const headerText = pick(headingVariants, num + group);
  const reactionMode = profile.reactionMode;
  const sortToggle = profile.showSort;
  const loadMore = profile.showLoadMore || (num % 9 === 0 && group !== 1);
  const replyMode = profile.commentMode;
  const showReplyCounts = profile.showReplyCounts;
  const useSection = profile.useSection;
  const useIframe = profile.useIframe;
  const useUl = profile.listTag === 'ul';
  const avatarSize = group === 0 || group === 3 || group === 7 ? 48 : 32;
  const timestampStyle = group === 3 || group === 7 ? 'full' : (num % 3 === 0 ? 'yesterday' : 'relative');

  return {
    num,
    group,
    profile,
    scenario,
    palette,
    visibleCount,
    headerText,
    composerPlacement,
    composerType,
    likeBar,
    reactionMode,
    sortToggle,
    loadMore,
    replyMode,
    showReplyCounts,
    useSection,
    useIframe,
    useUl,
    avatarSize,
    timestampStyle,
  };
}

function buildTimestamp(spec, seq, level) {
  const baseYear = 2007 + ((spec.num + seq + level) % 4);
  const month = (spec.num + seq + level) % 12;
  const day = ((spec.num * 3 + seq + level) % 27) + 1;
  const hour24 = (spec.num * 5 + seq * 3 + level) % 24;
  const minute = (spec.num * 11 + seq * 7 + level * 3) % 60;
  const hour12 = hour24 % 12 || 12;
  const ampm = hour24 < 12 ? 'AM' : 'PM';
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  if (spec.timestampStyle === 'full') {
    return `${monthNames[month]} ${day}, ${baseYear} at ${hour12}:${pad2(minute)}${ampm.toLowerCase()}`;
  }
  if (spec.timestampStyle === 'yesterday') {
    return `Yesterday at ${hour12}:${pad2(minute)} ${ampm}`;
  }
  const relative = ['2 hours ago', '4 hours ago', '6 hours ago', '1 hour ago', 'Just now', '3 hours ago'];
  return pick(relative, spec.num + seq + level);
}

function buildAuthor(spec, seq, level) {
  const names = [
    'Ava Miller', 'Noah Carter', 'Mia Patel', 'Liam Brooks', 'Zoe Kim', 'Ethan Reed',
    'Sofia Grant', 'Lucas Chen', 'Nina Lopez', 'Owen Hayes', 'Chloe Turner', 'Ari Bell',
    'Ivy Ross', 'Theo Ward', 'Leah Stone', 'Milo Price', 'June Foster', 'Riley Fox',
  ];
  const guests = ['Guest', 'Anonymous', 'Reader', 'Visitor'];
  if ((spec.num + seq + level) % 7 === 0) {
    return pick(guests, spec.num + seq + level);
  }
  return pick(names, spec.num * 3 + seq * 5 + level);
}

function buildProfileUrl(name) {
  return `/profile/${slugify(name)}`;
}

function buildAvatarUrl(spec, seq, level) {
  return `https://www.gravatar.com/avatar/${md5Hex(`${spec.scenario.site}:${spec.num}:${seq}:${level}`)}?s=${spec.avatarSize}`;
}

function buildLikeCount(spec, seq, level) {
  return 1 + ((spec.num * 9 + seq * 3 + level) % 27);
}

function buildCommentText(spec, node) {
  const scenario = spec.scenario;
  const rootTemplates = [
    `This feels like the old ${scenario.topic} pattern again. The ${scenario.detail} is the first thing I noticed.`,
    `The ${scenario.angle} part works, but the ${scenario.issue} still feels a little shaky.`,
    `I like the tone here. The ${scenario.fact} detail makes the whole comment block feel more immediate.`,
    `Not sure about the ${scenario.issue}, but the social style fits this page really well.`,
    `Short version: the ${scenario.detail} and the profile photo do most of the work.`,
  ];
  const replyTemplates = [
    `Agree on the ${scenario.detail}. That is exactly what stood out to me too.`,
    `I read it the same way. The ${scenario.issue} is what keeps this interesting.`,
    `Good point. The ${scenario.fact} detail is easy to miss on a quick skim.`,
    `That is fair. I still think the ${scenario.angle} angle is the strongest part.`,
    `Yep, and the small inline reply box makes it feel very current.`,
  ];
  const emojiTemplates = [
    `Love this &#128077;`,
    `So true &#9829;`,
    `Yep, that is the vibe here &#128077;`,
    `Big agree &#9829;`,
  ];
  const spamTemplates = [
    `Great post! Visit my site for deals and updates.`,
    `Amazing thread. Check my page for more offers.`,
  ];

  const pool =
    node.level > 0 ? replyTemplates
      : spec.num % 11 === 0 ? spamTemplates
        : spec.num % 5 === 0 ? emojiTemplates
          : rootTemplates;
  const raw = pick(pool, spec.num + node.seq + node.level);
  return escapeHtml(raw).replace(/&amp;(#\d+;)/g, '&$1');
}

function buildTree(spec) {
  const total = spec.visibleCount;
  const roots = [];
  let seq = 0;

  function makeNode(level) {
    seq += 1;
    const author = buildAuthor(spec, seq, level);
    return {
      seq,
      level,
      author,
      url: buildProfileUrl(author),
      time: buildTimestamp(spec, seq, level),
      avatar: buildAvatarUrl(spec, seq, level),
      likes: buildLikeCount(spec, seq, level),
      text: '',
      replies: [],
      collapsedReplies: 0,
    };
  }

  if (spec.replyMode === 'flat') {
    for (let i = 0; i < total; i += 1) {
      const node = makeNode(0);
      node.text = buildCommentText(spec, node);
      roots.push(node);
    }
    return roots;
  }

  if (spec.replyMode === 'threaded') {
    const rootCount = Math.max(3, Math.min(total - 1, 4 + (spec.num % 4)));
    for (let i = 0; i < rootCount; i += 1) {
      const node = makeNode(0);
      node.text = buildCommentText(spec, node);
      roots.push(node);
    }

    let remaining = total - rootCount;
    let cursor = 0;
    while (remaining > 0) {
      const parent = roots[cursor % roots.length];
      const child = makeNode(1);
      child.text = buildCommentText(spec, child);
      parent.replies.push(child);
      remaining -= 1;
      cursor += 1;
    }
    return roots;
  }

  for (let i = 0; i < total; i += 1) {
    const node = makeNode(0);
    node.text = buildCommentText(spec, node);
    node.collapsedReplies = i % 2 === 0 ? 2 + ((spec.num + i) % 5) : 0;
    roots.push(node);
  }
  return roots;
}

function likeMarkup(spec, node) {
  const count = node.likes;
  if (spec.profile.classless) {
    switch (spec.reactionMode) {
      case 'thumb':
        return `<a href="#">&#128077;</a> <span>${count}</span>`;
      case 'heart':
        return `<a href="#">&#9829;</a> <span>${count}</span>`;
      default:
        return `<a href="#">Like</a> &middot; <span>${count}</span>`;
    }
  }
  switch (spec.reactionMode) {
    case 'thumb':
      return `<a href="#" class="${spec.profile.classes.like}">&#128077;</a> <span class="${spec.profile.classes.likeCount}">${count}</span>`;
    case 'heart':
      return `<a href="#" class="${spec.profile.classes.like}">&#9829;</a> <span class="${spec.profile.classes.likeCount}">${count}</span>`;
    default:
      return `<a href="#" class="${spec.profile.classes.like}">Like</a> &middot; <span class="${spec.profile.classes.likeCount}">${count}</span>`;
  }
}

function renderAvatar(spec, node) {
  const classes = spec.profile.classes;
  if (spec.profile.classless) {
    return `<img src="${node.avatar}" width="${spec.avatarSize}" height="${spec.avatarSize}" alt="">`;
  }
  return `<img src="${node.avatar}" width="${spec.avatarSize}" height="${spec.avatarSize}" alt="" class="${classes.profilePic}">`;
}

function renderReplyLink(spec) {
  const classes = spec.profile.classes;
  if (spec.profile.classless) {
    return `<a href="#">Reply</a>`;
  }
  return `<a href="#" class="${classes.replyLink}">Reply</a>`;
}

function renderShareReport(spec) {
  const classes = spec.profile.classes;
  const parts = [];
  if (spec.group === 4 || spec.group === 7 || spec.group === 8 || spec.group === 9) {
    parts.push(spec.profile.classless ? `<a href="#">Share</a>` : `<a href="#" class="${classes.share}">Share</a>`);
  }
  if (spec.group === 4 || spec.group === 7 || spec.group === 9) {
    parts.push(spec.profile.classless ? `<a href="#">Report</a>` : `<a href="#" class="${classes.report}">Report</a>`);
  }
  return parts.join(' &middot; ');
}

function renderCommentMeta(spec, node) {
  const classes = spec.profile.classes;
  const replyLink = renderReplyLink(spec);

  if (spec.profile.key === 'microformatBoth') {
    return [
      `<span class="${classes.vcard}"><a href="${node.url}" class="${classes.fn} ${classes.url}">${escapeHtml(node.author)}</a></span>`,
      `<span class="${classes.time}">${escapeHtml(node.time)}</span>`,
      replyLink,
    ].join(' &middot; ');
  }

  if (spec.profile.classless) {
    return [
      `<a href="${node.url}">${escapeHtml(node.author)}</a>`,
      `<span>${escapeHtml(node.time)}</span>`,
      replyLink,
    ].join(' &middot; ');
  }

  return [
    `<a href="${node.url}" class="${classes.author}">${escapeHtml(node.author)}</a>`,
    `<span class="${classes.time}">${escapeHtml(node.time)}</span>`,
    replyLink,
  ].join(' &middot; ');
}

function renderCommentBody(spec, node) {
  const classes = spec.profile.classes;
  if (spec.profile.classless) {
    return `<p>${node.text}</p>`;
  }
  return `<div class="${classes.body}"><p>${node.text}</p></div>`;
}

function renderReplies(spec, node) {
  const classes = spec.profile.classes;
  if (!node.replies.length && !node.collapsedReplies) {
    return '';
  }

  if (node.collapsedReplies) {
    const label = `View ${node.collapsedReplies} replies &#9662;`;
    if (spec.profile.classless) {
      return `<div>${label}</div>`;
    }
    return `<div class="${classes.replyCount}">${label}</div>`;
  }

  const inner = node.replies.map((child) => renderComment(spec, child, true)).join('\n');
  const nestedTag = spec.profile.listTag === 'ul' ? 'ul' : 'div';
  if (spec.profile.classless) {
    return `<div>\n${inner}\n</div>`;
  }
  return `<${nestedTag} class="${classes.replies}">\n${inner}\n</${nestedTag}>`;
}

function renderCommentActions(spec, node) {
  const classes = spec.profile.classes;
  const like = likeMarkup(spec, node);
  const shareReport = renderShareReport(spec);
  const parts = [like];
  if (shareReport) {
    parts.push(shareReport);
  }
  if (spec.profile.classless) {
    return `<div>${parts.join(' &middot; ')}</div>`;
  }
  return `<div class="${classes.actions}">${parts.join(' &middot; ')}</div>`;
}

function renderComment(spec, node, isReply) {
  const classes = spec.profile.classes;
  const itemClass = isReply && classes.itemReply ? ` ${classes.itemReply}` : '';
  const idAttr = ` id="c-${spec.num}-${node.seq}"`;

  if (spec.profile.classless) {
    const replyBlock = renderReplies(spec, node);
    return [
      `<li>`,
      `<img src="${node.avatar}" width="${spec.avatarSize}" height="${spec.avatarSize}" alt="">`,
      `<div>${renderCommentMeta(spec, node)}</div>`,
      `<div>${renderCommentBody(spec, node)}</div>`,
      `<div>${renderCommentActions(spec, node)}</div>`,
      replyBlock,
      `</li>`,
    ].filter(Boolean).join('\n');
  }

  const avatar = renderAvatar(spec, node);
  const meta = renderCommentMeta(spec, node);
  const body = renderCommentBody(spec, node);
  const actions = renderCommentActions(spec, node);
  const replies = renderReplies(spec, node);
  const tag = spec.profile.itemTag || 'div';
  return [
    `<${tag} class="${classes.item}${itemClass}"${idAttr}>`,
    avatar ? `<div class="avatar-wrap">${avatar}</div>` : '',
    `<div class="comment-main">`,
    `<div class="${classes.meta}">${meta}</div>`,
    body,
    actions,
    replies,
    `</div>`,
    `</${tag}>`,
  ].filter(Boolean).join('\n');
}

function renderCommentList(spec, tree) {
  const classes = spec.profile.classes;
  if (spec.profile.classless) {
    return [`<ul>`, tree.map((node) => renderComment(spec, node, false)).join('\n'), `</ul>`].join('\n');
  }
  const listTag = spec.profile.listTag || 'div';
  const listClass = classes.list ? ` class="${classes.list}"` : '';
  return [
    `<${listTag}${listClass}>`,
    tree.map((node) => renderComment(spec, node, false)).join('\n'),
    `</${listTag}>`,
  ].join('\n');
}

function renderHeading(spec) {
  const classes = spec.profile.classes;
  const headingParts = [];
  headingParts.push(`<h2>${escapeHtml(spec.headerText)}</h2>`);
  if (spec.likeBar) {
    headingParts.push(`<div class="${classes.likeBar}">${3 + ((spec.num * 4) % 41)} people like this</div>`);
  }
  if (spec.sortToggle) {
    headingParts.push(`<div class="${classes.sort}"><a href="#">Top Comments</a> &middot; <a href="#">Most Recent</a></div>`);
  }
  return headingParts.join('\n');
}

function renderComposer(spec, placement) {
  const classes = spec.profile.classes;
  const labelOptions = ['Write a comment...', 'Add a comment...', 'Join the discussion'];
  const label = pick(labelOptions, spec.num + (placement === 'top' ? 1 : 2));
  const type = spec.composerType;
  const topText = spec.group === 0 ? 'Comment' : 'Add a comment';
  const inputMarkup = spec.profile.classless
    ? (type === 'input'
      ? `<input type="text" value="" placeholder="${escapeHtml(label)}">`
      : `<textarea rows="2"></textarea>`)
    : (type === 'input'
      ? `<input type="text" class="${classes.input}" value="" placeholder="${escapeHtml(label)}">`
      : `<textarea rows="2" class="${classes.input}"></textarea>`);

  const formMarkup = spec.profile.classless
    ? [
      `<div id="comment-form">`,
      `<label>${escapeHtml(topText)} ${inputMarkup}</label>`,
      `</div>`,
    ].join('\n')
    : [
      `<div class="${classes.form}">`,
      `<label>${escapeHtml(topText)} ${inputMarkup}</label>`,
      `</div>`,
    ].join('\n');

  return formMarkup;
}

function renderLoadMore(spec) {
  const classes = spec.profile.classes;
  if (!spec.loadMore) {
    return '';
  }
  if (spec.profile.classless) {
    return `<div><a href="#">Load more comments</a></div>`;
  }
  return `<div class="${classes.loadMore}"><a href="#">Load more comments</a></div>`;
}

function renderStory(spec) {
  return [
    `<div class="story">`,
    `<h1>${escapeHtml(spec.scenario.site)}</h1>`,
    `<h2>${escapeHtml(spec.scenario.title)}</h2>`,
    `<p class="lede">${escapeHtml(spec.scenario.lede)}</p>`,
    `</div>`,
  ].join('\n');
}

function buildCss(spec) {
  const p = spec.palette;
  const c = spec.profile.classes;
  const common = [
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
    'h1, h2, h3, p, ul { margin: 0; padding: 0; }',
    'ul { list-style: none; }',
    '.story { width: 760px; margin: 0 auto; padding: 18px 0 14px; }',
    '.story h1 { font-size: 26px; margin-bottom: 4px; }',
    '.story h2 { font-size: 18px; margin-bottom: 6px; }',
    '.lede { font-size: 12px; color: ' + p.accent + '; }',
    '.profile-pic, .avatar, img { border-radius: 3px; }',
    `.avatar-wrap { float: left; width: ${spec.avatarSize}px; margin-right: 10px; }`,
    '.comment-main { overflow: hidden; }',
  ];

  if (spec.profile.key === 'facebookIframe') {
    return [
      ...common,
      `.${c.shell} { width: 760px; margin: 0 auto 18px; border: 1px solid ${p.line}; background: ${p.panel}; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }`,
      `.${c.shellBar} { background: ${p.soft}; border-bottom: 1px solid ${p.line}; padding: 6px 10px; font-size: 11px; color: ${p.accent}; }`,
      `.${c.shellBody} { padding: 12px; }`,
      `.${c.header} { margin-bottom: 10px; }`,
      `.${c.likeBar} { margin-top: 4px; font-size: 12px; color: ${p.accent}; }`,
      `.${c.sort} { margin-top: 6px; font-size: 11px; }`,
      `.${c.list} { margin-top: 12px; }`,
      `.${c.item} { border-top: 1px solid ${p.line}; padding: 10px 0; overflow: hidden; }`,
      `.${c.item}:first-child { border-top: 0; }`,
      `.avatar-wrap { float: left; width: ${spec.avatarSize}px; margin-right: 10px; }`,
      `.${c.profilePic} { display: block; width: ${spec.avatarSize}px; height: ${spec.avatarSize}px; }`,
      `.comment-main { overflow: hidden; }`,
      `.${c.meta} { font-size: 12px; margin-bottom: 6px; }`,
      `.${c.author} { font-weight: bold; }`,
      `.${c.time} { color: ${p.accent}; font-size: 11px; }`,
      `.${c.replyLink} { font-size: 11px; }`,
      `.${c.body} p { margin: 0 0 8px 0; }`,
      `.${c.actions} { font-size: 11px; margin-top: 6px; }`,
      `.${c.replies} { margin-top: 8px; margin-left: 36px; padding-left: 10px; border-left: 2px solid ${p.line}; }`,
      `.${c.replyCount} { margin-top: 4px; font-size: 11px; color: ${p.accent}; }`,
      `.${c.form} { margin: 10px 0 0; border-top: 1px solid ${p.line}; padding-top: 10px; }`,
      `.${c.inputRow} { margin-top: 6px; }`,
      `.${c.input} { width: 100%; max-width: 560px; border: 1px solid ${p.line}; padding: 4px 6px; font-family: inherit; font-size: 12px; }`,
      `.${c.loadMore} { margin-top: 8px; font-size: 11px; }`,
    ].join('\n');
  }

  if (spec.profile.key === 'classlessPlain') {
    return [
      ...common,
      `#page { width: 760px; margin: 0 auto; padding: 18px 0 32px; }`,
      `#comments { background: ${p.panel}; border: 1px solid ${p.line}; padding: 12px 14px; box-shadow: 0 1px 2px rgba(0,0,0,0.04); }`,
      `#comments h2 { font-size: 18px; margin-bottom: 6px; }`,
      `#comments > ul { margin-top: 12px; }`,
      `#comments > ul > li { border-top: 1px solid ${p.line}; padding: 10px 0; overflow: hidden; }`,
      `#comments > ul > li:first-child { border-top: 0; }`,
      `#comments > ul > li > img { float: left; width: ${spec.avatarSize}px; height: ${spec.avatarSize}px; margin-right: 8px; }`,
      `#comments > ul > li > div:nth-child(2) { font-size: 12px; margin-bottom: 6px; overflow: hidden; }`,
      `#comments > ul > li > div:nth-child(3) { overflow: hidden; }`,
      `#comments > ul > li > div:nth-child(4) { font-size: 11px; margin-top: 6px; }`,
      `#comment-form { margin-top: 12px; border-top: 1px solid ${p.line}; padding-top: 10px; }`,
      `#comment-form input, #comment-form textarea { width: 100%; max-width: 540px; border: 1px solid ${p.line}; padding: 4px 6px; font-family: inherit; font-size: 12px; }`,
      `#comment-form label { display: block; font-size: 12px; }`,
      `#comments img { border-radius: 3px; }`,
      `#comments a { color: ${p.accent}; }`,
      `#comments a:hover { text-decoration: underline; }`,
    ].join('\n');
  }

  if (spec.profile.key === 'ufiReplies') {
    return [
      ...common,
      `.${c.shell} { width: 760px; margin: 0 auto; padding: 18px 0 32px; }`,
      `.${c.header} { background: ${p.panel}; border: 1px solid ${p.line}; padding: 12px 14px; }`,
      `.${c.sort} { margin-top: 6px; font-size: 11px; }`,
      `.${c.list} { background: ${p.panel}; border: 1px solid ${p.line}; border-top: 0; padding: 10px 14px; }`,
      `.${c.item} { border-top: 1px solid ${p.line}; padding: 10px 0; overflow: hidden; }`,
      `.${c.item}:first-child { border-top: 0; }`,
      `.${c.profilePic} { float: left; width: ${spec.avatarSize}px; height: ${spec.avatarSize}px; margin-right: 10px; display: block; }`,
      `.${c.meta} { font-size: 12px; margin-bottom: 6px; }`,
      `.${c.author} { font-weight: bold; }`,
      `.${c.time} { font-size: 11px; color: ${p.accent}; }`,
      `.${c.body} p { margin: 0 0 8px 0; }`,
      `.${c.actions} { font-size: 11px; margin-top: 6px; }`,
      `.${c.replies} { margin-top: 8px; margin-left: 32px; padding-left: 10px; border-left: 2px solid ${p.line}; }`,
      `.${c.replyCount} { margin-top: 4px; font-size: 11px; color: ${p.accent}; }`,
      `.${c.form} { background: ${p.panel}; border: 1px solid ${p.line}; border-top: 0; padding: 12px 14px; }`,
      `.${c.input} { width: 100%; max-width: 540px; border: 1px solid ${p.line}; padding: 4px 6px; font-family: inherit; font-size: 12px; }`,
      `.${c.loadMore} { margin-top: 8px; font-size: 11px; }`,
    ].join('\n');
  }

  if (spec.profile.key === 'microformatBoth') {
    return [
      ...common,
      `.${c.shell} { width: 760px; margin: 0 auto; padding: 18px 0 32px; }`,
      `.${c.header} { background: ${p.panel}; border: 1px solid ${p.line}; padding: 12px 14px; }`,
      `.${c.list} { background: ${p.panel}; border: 1px solid ${p.line}; border-top: 0; padding: 12px 14px; }`,
      `.${c.item} { border-top: 1px solid ${p.line}; padding: 10px 0; overflow: hidden; }`,
      `.${c.item}:first-child { border-top: 0; }`,
      `.${c.avatar} { float: left; width: ${spec.avatarSize}px; height: ${spec.avatarSize}px; margin-right: 10px; display: block; }`,
      `.${c.vcard} { font-size: 12px; font-weight: bold; }`,
      `.${c.fn} { color: ${p.accent}; }`,
      `.${c.time} { color: ${p.accent}; font-size: 11px; }`,
      `.${c.body} p { margin: 0 0 8px 0; }`,
      `.${c.actions} { font-size: 11px; margin-top: 6px; }`,
      `.${c.form} { background: ${p.panel}; border: 1px solid ${p.line}; padding: 12px 14px; margin-top: 10px; }`,
      `.${c.input} { width: 100%; max-width: 540px; border: 1px solid ${p.line}; padding: 4px 6px; font-family: inherit; font-size: 12px; }`,
    ].join('\n');
  }

  if (spec.profile.key === 'socialLoadMore') {
    return [
      ...common,
      `.${c.shell} { width: 760px; margin: 0 auto; padding: 18px 0 32px; }`,
      `.${c.header} { background: ${p.panel}; border: 1px solid ${p.line}; padding: 12px 14px; }`,
      `.${c.likeBar} { margin-top: 5px; font-size: 12px; color: ${p.accent}; }`,
      `.${c.list} { background: ${p.panel}; border: 1px solid ${p.line}; border-top: 0; padding: 10px 14px; }`,
      `.${c.item} { border-top: 1px solid ${p.line}; padding: 10px 0; overflow: hidden; }`,
      `.${c.item}:first-child { border-top: 0; }`,
      `.${c.profilePic} { float: left; width: ${spec.avatarSize}px; height: ${spec.avatarSize}px; margin-right: 10px; display: block; }`,
      `.${c.meta} { font-size: 12px; margin-bottom: 6px; }`,
      `.${c.author} { font-weight: bold; }`,
      `.${c.time} { color: ${p.accent}; font-size: 11px; }`,
      `.${c.body} p { margin: 0 0 8px 0; }`,
      `.${c.actions} { font-size: 11px; margin-top: 6px; }`,
      `.${c.form} { background: ${p.panel}; border: 1px solid ${p.line}; padding: 12px 14px; margin-top: 10px; }`,
      `.${c.input} { width: 100%; max-width: 540px; border: 1px solid ${p.line}; padding: 4px 6px; font-family: inherit; font-size: 12px; }`,
      `.${c.loadMore} { margin-top: 8px; font-size: 11px; }`,
    ].join('\n');
  }

  if (spec.profile.key === 'streamFlat') {
    return [
      ...common,
      `.${c.shell} { width: 760px; margin: 0 auto; padding: 18px 0 32px; }`,
      `.${c.header} { background: ${p.panel}; border: 1px solid ${p.line}; padding: 12px 14px; }`,
      `.${c.list} { background: ${p.panel}; border: 1px solid ${p.line}; border-top: 0; padding: 10px 14px; }`,
      `.${c.item} { border-top: 1px solid ${p.line}; padding: 10px 0; overflow: hidden; }`,
      `.${c.item}:first-child { border-top: 0; }`,
      `.${c.profilePic} { float: left; width: ${spec.avatarSize}px; height: ${spec.avatarSize}px; margin-right: 10px; display: block; }`,
      `.${c.meta} { font-size: 12px; margin-bottom: 6px; }`,
      `.${c.author} { font-weight: bold; }`,
      `.${c.time} { color: ${p.accent}; font-size: 11px; }`,
      `.${c.body} p { margin: 0 0 8px 0; }`,
      `.${c.actions} { font-size: 11px; margin-top: 6px; }`,
      `.${c.form} { background: ${p.panel}; border: 1px solid ${p.line}; padding: 12px 14px; margin-bottom: 10px; }`,
      `.${c.input} { width: 100%; max-width: 540px; border: 1px solid ${p.line}; padding: 4px 6px; font-family: inherit; font-size: 12px; }`,
    ].join('\n');
  }

  if (spec.profile.key === 'activityThreaded') {
    return [
      ...common,
      `.${c.shell} { width: 760px; margin: 0 auto; padding: 18px 0 32px; }`,
      `.${c.header} { background: ${p.panel}; border: 1px solid ${p.line}; padding: 12px 14px; }`,
      `.${c.list} { background: ${p.panel}; border: 1px solid ${p.line}; border-top: 0; padding: 10px 14px; }`,
      `.${c.item} { border-top: 1px solid ${p.line}; padding: 10px 0; overflow: hidden; }`,
      `.${c.item}:first-child { border-top: 0; }`,
      `.${c.profilePic} { float: left; width: ${spec.avatarSize}px; height: ${spec.avatarSize}px; margin-right: 10px; display: block; }`,
      `.${c.meta} { font-size: 12px; margin-bottom: 6px; }`,
      `.${c.author} { font-weight: bold; }`,
      `.${c.time} { color: ${p.accent}; font-size: 11px; }`,
      `.${c.body} p { margin: 0 0 8px 0; }`,
      `.${c.actions} { font-size: 11px; margin-top: 6px; }`,
      `.${c.replies} { margin-top: 8px; margin-left: 32px; padding-left: 10px; border-left: 2px solid ${p.line}; }`,
      `.${c.replyCount} { margin-top: 4px; font-size: 11px; color: ${p.accent}; }`,
      `.${c.form} { background: ${p.panel}; border: 1px solid ${p.line}; padding: 12px 14px; margin-top: 10px; }`,
      `.${c.input} { width: 100%; max-width: 540px; border: 1px solid ${p.line}; padding: 4px 6px; font-family: inherit; font-size: 12px; }`,
    ].join('\n');
  }

  if (spec.profile.key === 'rowSort') {
    return [
      ...common,
      `.${c.shell} { width: 760px; margin: 0 auto; padding: 18px 0 32px; }`,
      `.${c.header} { background: ${p.panel}; border: 1px solid ${p.line}; padding: 12px 14px; }`,
      `.${c.sort} { margin-top: 6px; font-size: 11px; }`,
      `.${c.list} { background: ${p.panel}; border: 1px solid ${p.line}; border-top: 0; padding: 10px 14px; }`,
      `.${c.item} { border-top: 1px solid ${p.line}; padding: 10px 0; overflow: hidden; }`,
      `.${c.item}:first-child { border-top: 0; }`,
      `.${c.profilePic} { float: left; width: ${spec.avatarSize}px; height: ${spec.avatarSize}px; margin-right: 10px; display: block; }`,
      `.${c.meta} { font-size: 12px; margin-bottom: 6px; }`,
      `.${c.author} { font-weight: bold; }`,
      `.${c.time} { color: ${p.accent}; font-size: 11px; }`,
      `.${c.body} p { margin: 0 0 8px 0; }`,
      `.${c.actions} { font-size: 11px; margin-top: 6px; }`,
      `.${c.replies} { margin-top: 8px; margin-left: 34px; padding-left: 10px; border-left: 2px solid ${p.line}; }`,
      `.${c.replyCount} { margin-top: 4px; font-size: 11px; color: ${p.accent}; }`,
      `.${c.form} { background: ${p.panel}; border: 1px solid ${p.line}; padding: 12px 14px; margin-top: 10px; }`,
      `.${c.input} { width: 100%; max-width: 540px; border: 1px solid ${p.line}; padding: 4px 6px; font-family: inherit; font-size: 12px; }`,
      `.${c.loadMore} { margin-top: 8px; font-size: 11px; }`,
    ].join('\n');
  }

  if (spec.profile.key === 'inlineMixed') {
    return [
      ...common,
      `.${c.shell} { width: 760px; margin: 0 auto; padding: 18px 0 32px; }`,
      `.${c.header} { background: ${p.panel}; border: 1px solid ${p.line}; padding: 12px 14px; }`,
      `.${c.list} { background: ${p.panel}; border: 1px solid ${p.line}; border-top: 0; padding: 10px 14px; }`,
      `.${c.item} { border-top: 1px solid ${p.line}; padding: 10px 0; overflow: hidden; }`,
      `.${c.item}:first-child { border-top: 0; }`,
      `.${c.profilePic} { float: left; width: ${spec.avatarSize}px; height: ${spec.avatarSize}px; margin-right: 10px; display: block; }`,
      `.${c.meta} { font-size: 12px; margin-bottom: 6px; }`,
      `.${c.author} { font-weight: bold; }`,
      `.${c.time} { color: ${p.accent}; font-size: 11px; }`,
      `.${c.body} p { margin: 0 0 8px 0; }`,
      `.${c.actions} { font-size: 11px; margin-top: 6px; }`,
      `.${c.replies} { margin-top: 8px; margin-left: 32px; padding-left: 10px; border-left: 2px solid ${p.line}; }`,
      `.${c.form} { background: ${p.panel}; border: 1px solid ${p.line}; padding: 12px 14px; margin-top: 10px; }`,
      `.${c.input} { width: 100%; max-width: 540px; border: 1px solid ${p.line}; padding: 4px 6px; font-family: inherit; font-size: 12px; }`,
      `.${c.loadMore} { margin-top: 8px; font-size: 11px; }`,
    ].join('\n');
  }

  return [
    ...common,
    `.${c.shell} { width: 760px; margin: 0 auto; padding: 18px 0 32px; }`,
    `.${c.header} { background: ${p.panel}; border: 1px solid ${p.line}; padding: 12px 14px; }`,
    `.${c.list} { background: ${p.panel}; border: 1px solid ${p.line}; border-top: 0; padding: 10px 14px; }`,
    `.${c.item} { border-top: 1px solid ${p.line}; padding: 10px 0; overflow: hidden; }`,
    `.${c.item}:first-child { border-top: 0; }`,
    `.${c.profilePic} { float: left; width: ${spec.avatarSize}px; height: ${spec.avatarSize}px; margin-right: 10px; display: block; }`,
    `.${c.meta} { font-size: 12px; margin-bottom: 6px; }`,
    `.${c.author} { font-weight: bold; }`,
    `.${c.time} { color: ${p.accent}; font-size: 11px; }`,
    `.${c.body} p { margin: 0 0 8px 0; }`,
    `.${c.actions} { font-size: 11px; margin-top: 6px; }`,
    `.${c.form} { background: ${p.panel}; border: 1px solid ${p.line}; padding: 12px 14px; margin-top: 10px; }`,
    `.${c.input} { width: 100%; max-width: 540px; border: 1px solid ${p.line}; padding: 4px 6px; font-family: inherit; font-size: 12px; }`,
    `.${c.loadMore} { margin-top: 8px; font-size: 11px; }`,
  ].join('\n');
}

function renderPage(spec, tree) {
  const classes = spec.profile.classes;
  const css = buildCss(spec);
  const story = renderStory(spec);
  const heading = renderHeading(spec);
  const topComposer = spec.composerPosition === 'top' || spec.composerPosition === 'both' ? renderComposer(spec, 'top') : '';
  const bottomComposer = spec.composerPosition === 'bottom' || spec.composerPosition === 'both' ? renderComposer(spec, 'bottom') : '';
  const list = renderCommentList(spec, tree);
  const loadMore = renderLoadMore(spec);
  const shellInner = [
    topComposer,
    heading,
    list,
    loadMore,
    bottomComposer,
  ].filter(Boolean).join('\n');

  const commentsBlock = spec.useIframe
    ? [
      `<div class="${classes.shell}">`,
      `<div class="${classes.shellBar}">Embedded social comments</div>`,
      `<div class="${classes.shellBody}">`,
      `<section id="comments">`,
      shellInner,
      `</section>`,
      `</div>`,
      `</div>`,
    ].join('\n')
    : [
      `<${spec.useSection ? 'section' : 'div'} id="comments"${spec.profile.classless ? ` class="${classes.shell}"` : ` class="${classes.shell}"`}>`,
      shellInner,
      `</${spec.useSection ? 'section' : 'div'}>`,
    ].join('\n');

  const outer = spec.profile.classless
    ? [
      `<div id="page">`,
      story,
      commentsBlock,
      `</div>`,
    ].join('\n')
    : [
      `<div class="page">`,
      story,
      commentsBlock,
      `</div>`,
    ].join('\n');

  return [
    '<!DOCTYPE html>',
    '<html>',
    '<head>',
    '<meta charset="utf-8">',
    `<title>${escapeHtml(spec.scenario.site)} - ${escapeHtml(spec.scenario.title)}</title>`,
    '<style type="text/css">',
    css,
    '</style>',
    '</head>',
    '<body>',
    outer,
    '</body>',
    '</html>',
  ].join('\n');
}

function updateIndexFile() {
  const index = fs.readFileSync(indexPath, 'utf8');
  const updated = index
    .replace(/\| 04 \| [^|]+ \| `\/synthetic\/prompt_04\/` \|/, '| 04 | 100 / 100 | `/synthetic/prompt_04/` |')
    .replace(/\*\*Total:\*\* [^\n]+/, '**Total:** 400 / 2,000');
  fs.writeFileSync(indexPath, updated, 'utf8');
}

function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  for (let num = 1; num <= 100; num += 1) {
    const spec = pageSpec(num);
    const tree = buildTree(spec);
    const html = renderPage(spec, tree);
    const filename = path.join(outputDir, `page_${String(num).padStart(3, '0')}.html`);
    fs.writeFileSync(filename, html, 'utf8');
  }
  updateIndexFile();
  console.log(`Wrote 100 pages to ${outputDir}`);
  console.log(`Updated ${indexPath}`);
}

main();
