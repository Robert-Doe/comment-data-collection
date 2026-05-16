'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const outputDir = path.resolve(__dirname, '..', 'synthetic_data', 'pages', 'prompt_03');
const indexPath = path.resolve(__dirname, '..', 'synthetic_data', 'INDEX.md');

const scenarios = [
  {
    siteName: 'LayoutLab',
    breadcrumbs: ['Home', 'Web Design', 'Layout'],
    title: 'Sidebar jumps below the article after the new ad slot',
    intro: 'The thread keeps circling floats, clears, and old browser quirks.',
    issue: 'float clearing',
    fix: 'the container needs a clear',
  },
  {
    siteName: 'ParentingPost',
    breadcrumbs: ['Home', 'Family', 'Sleep'],
    title: 'Bedtime keeps slipping after daycare',
    intro: 'Readers compare routines, naps, and the last drink before bed.',
    issue: 'bedtime routine',
    fix: 'the evening routine needs to stay fixed',
  },
  {
    siteName: 'BreadBoard',
    breadcrumbs: ['Home', 'Kitchen', 'Bread'],
    title: 'Starter smells sharp after the weekend',
    intro: 'The comments turn into a mix of feeding schedules and temperature notes.',
    issue: 'starter feed',
    fix: 'the starter needs a fresh feeding',
  },
  {
    siteName: 'MoneyDesk',
    breadcrumbs: ['Home', 'Money', 'Savings'],
    title: 'Six-month CD or high-yield savings?',
    intro: 'The replies compare interest rates, liquidity, and risk.',
    issue: 'rate choice',
    fix: 'the lockup period needs to match the plan',
  },
  {
    siteName: 'CityDesk',
    breadcrumbs: ['Home', 'Local', 'Transit'],
    title: 'Bike lane proposal gets heated',
    intro: 'The discussion moves fast between safety, parking, and traffic flow.',
    issue: 'street design',
    fix: 'the traffic pattern needs to be measured first',
  },
  {
    siteName: 'TravelNotes',
    breadcrumbs: ['Home', 'Travel', 'Europe'],
    title: 'Two nights in Lisbon, enough or too short?',
    intro: 'People talk about walkable hills, tram lines, and where to eat late.',
    issue: 'short stay',
    fix: 'the itinerary needs one slower day',
  },
  {
    siteName: 'PaintRoom',
    breadcrumbs: ['Home', 'Design', 'Interiors'],
    title: 'Gray paint made the office feel smaller',
    intro: 'The replies argue over undertones, light, and trim color.',
    issue: 'color balance',
    fix: 'the room needs more contrast',
  },
  {
    siteName: 'GardenPatch',
    breadcrumbs: ['Home', 'Garden', 'Vegetables'],
    title: 'Tomato leaves curling after a wet week',
    intro: 'The thread weighs fungus, watering, and sun exposure.',
    issue: 'leaf curl',
    fix: 'the soil and watering need a closer look',
  },
  {
    siteName: 'RouterRoom',
    breadcrumbs: ['Home', 'Tech', 'Networking'],
    title: 'Router overheats when more than two people are online',
    intro: 'The comments bounce between vents, firmware, and load.',
    issue: 'heat under load',
    fix: 'the airflow needs to improve',
  },
  {
    siteName: 'PhotoLab',
    breadcrumbs: ['Home', 'Photography', 'Film'],
    title: 'Flat negatives after switching developer',
    intro: 'People compare dilution, agitation, and timing.',
    issue: 'development time',
    fix: 'the tank needs a longer test roll',
  },
  {
    siteName: 'NeedleDrop',
    breadcrumbs: ['Home', 'Audio', 'Vinyl'],
    title: 'Turntable hum after a capacitor swap',
    intro: 'The replies focus on grounding, solder joints, and wiring.',
    issue: 'ground loop',
    fix: 'the ground path needs a clean recheck',
  },
  {
    siteName: 'FilmClub',
    breadcrumbs: ['Home', 'Film', 'Discussion'],
    title: 'Indie ending landed differently on a second watch',
    intro: 'The thread splits between pacing, payoff, and theme.',
    issue: 'ending',
    fix: 'the final scene needs context',
  },
  {
    siteName: 'BookCorner',
    breadcrumbs: ['Home', 'Books', 'Reading'],
    title: 'Second read changes the meaning of the ending',
    intro: 'Readers call out foreshadowing, tone, and character arcs.',
    issue: 'foreshadowing',
    fix: 'the ending needs the earlier clues',
  },
  {
    siteName: 'ClassroomRoom',
    breadcrumbs: ['Home', 'School', 'Kids'],
    title: 'Homework load in fifth grade feels heavy',
    intro: 'The comments swap schedules, expectations, and after-school time.',
    issue: 'homework load',
    fix: 'the evening routine needs more breathing room',
  },
  {
    siteName: 'HealthDesk',
    breadcrumbs: ['Home', 'Health', 'Work'],
    title: 'Desk posture makes shoulders hurt by noon',
    intro: 'The replies go through chair height, monitor position, and breaks.',
    issue: 'desk posture',
    fix: 'the desk setup needs a reset',
  },
  {
    siteName: 'DogPark',
    breadcrumbs: ['Home', 'Pets', 'Dogs'],
    title: 'New rescue dog hides when guests arrive',
    intro: 'People trade notes on patience, crates, and noisy rooms.',
    issue: 'fear of guests',
    fix: 'the dog needs slower introductions',
  },
  {
    siteName: 'CareerBoard',
    breadcrumbs: ['Home', 'Work', 'Jobs'],
    title: 'Junior salaries in Portland still look squeezed',
    intro: 'The discussion compares rent, offers, and local hiring.',
    issue: 'salary pressure',
    fix: 'the offer needs to match the market',
  },
  {
    siteName: 'DIYBench',
    breadcrumbs: ['Home', 'DIY', 'Paint'],
    title: 'Painting trim over old oil finish',
    intro: 'The thread argues about sanding, primer, and drying time.',
    issue: 'oil finish prep',
    fix: 'the trim needs a proper primer coat',
  },
  {
    siteName: 'KitchenCast',
    breadcrumbs: ['Home', 'Kitchen', 'Cast Iron'],
    title: 'Cast iron seasoning turned blotchy',
    intro: 'The replies compare oil choice, heat, and cleanup.',
    issue: 'seasoning layer',
    fix: 'the pan needs another thin coat',
  },
  {
    siteName: 'CRTClub',
    breadcrumbs: ['Home', 'Retro', 'Computing'],
    title: 'CRT monitor flicker after the power strip swap',
    intro: 'The comments trace the problem through cable length, mains noise, and age.',
    issue: 'power noise',
    fix: 'the power path needs a steadier source',
  },
];

const palettes = [
  { bg: '#eef2ee', panel: '#ffffff', line: '#c8d4cb', text: '#1f2623', accent: '#436b58', soft: '#edf6f0', reply: '#dbe8df' },
  { bg: '#f7f2ea', panel: '#fffdf8', line: '#d9c8ae', text: '#2d2419', accent: '#8a5d24', soft: '#f7efe2', reply: '#efe2cf' },
  { bg: '#f0f3f7', panel: '#ffffff', line: '#cad4df', text: '#202833', accent: '#325b86', soft: '#e9f0f7', reply: '#dce6f2' },
  { bg: '#f6eef0', panel: '#fffafa', line: '#d9c2c7', text: '#332228', accent: '#8a4758', soft: '#f7eaed', reply: '#f0dfe3' },
  { bg: '#eef4fb', panel: '#ffffff', line: '#c6d4e6', text: '#1f2a36', accent: '#4f6f95', soft: '#e4edf8', reply: '#d8e4f1' },
  { bg: '#f3f5ef', panel: '#ffffff', line: '#cfd6c4', text: '#23281f', accent: '#6f8b44', soft: '#edf2e5', reply: '#e0e8d5' },
  { bg: '#f8f7f3', panel: '#ffffff', line: '#d5d1c3', text: '#2b2a25', accent: '#7a6951', soft: '#f1eee8', reply: '#e7e2d7' },
  { bg: '#f0eef5', panel: '#ffffff', line: '#d1cde0', text: '#272433', accent: '#5b5c8e', soft: '#e7e5f1', reply: '#dcd9ea' },
];

const keywordFreeSimple = {
  root: 'page',
  shell: 'thread',
  story: 'story',
  crumbs: 'crumbs',
  headingWrap: 'heading-wrap',
  heading: 'heading',
  intro: 'lede',
  list: 'stream',
  item: 'entry',
  meta: 'meta',
  author: 'author',
  badge: 'badge',
  stamp: 'stamp',
  body: 'body',
  avatar: 'avatar',
  avatarText: 'avatar-text',
  actions: 'tools',
  children: 'children',
  form: 'replybox',
  note: 'note',
  field: 'field',
  label: 'label',
  captcha: 'captcha',
  spacer: 'spacer',
  footer: 'footer',
};

const keywordFreeOpaque = {
  root: 'pg',
  shell: 'th',
  story: 'st',
  crumbs: 'cr',
  headingWrap: 'hw',
  heading: 'hd',
  intro: 'ld',
  list: 'stm',
  item: 'en',
  meta: 'mt',
  author: 'au',
  badge: 'bg',
  stamp: 'ts',
  body: 'bd',
  avatar: 'av',
  avatarText: 'at',
  actions: 'tl',
  children: 'ch',
  form: 'rb',
  note: 'nt',
  field: 'fd',
  label: 'lb',
  captcha: 'cp',
  spacer: 'sp',
  footer: 'ft',
};

const deepChainClasses = {
  story: 'story',
  crumbs: 'crumbs',
  headingWrap: 'heading-wrap',
  heading: 'heading',
  intro: 'lede',
  shell: 'shell',
  list: 'post-list',
  item: 'post',
  meta: 'post-meta',
  author: 'post-author',
  badge: 'post-badge',
  stamp: 'post-stamp',
  body: 'post-body',
  avatar: 'post-avatar',
  avatarText: 'post-avatar-text',
  actions: 'post-tools',
  children: 'post-children',
  form: 'composer',
  note: 'note',
  field: 'field',
  label: 'label',
  captcha: 'captcha',
  spacer: 'spacer',
  footer: 'foot',
};

const floatClassicClasses = {
  story: 'story',
  crumbs: 'crumbs',
  headingWrap: 'heading-wrap',
  heading: 'heading',
  intro: 'lede',
  shell: 'comment-shell',
  list: 'comment-feed',
  item: 'comment-item',
  meta: 'comment-meta',
  author: 'comment-author',
  badge: 'comment-badge',
  stamp: 'comment-stamp',
  body: 'comment-body',
  avatar: 'comment-avatar',
  avatarText: 'comment-avatar-text',
  actions: 'comment-tools',
  children: 'comment-replies',
  form: 'comment-form',
  note: 'comment-note',
  field: 'field',
  label: 'label',
  captcha: 'captcha',
  spacer: 'spacer',
  footer: 'comment-footer',
};

const idLayoutClasses = {
  story: 'story',
  crumbs: 'crumbs',
  headingWrap: 'heading-wrap',
  heading: 'heading',
  intro: 'lede',
  shell: 'page-shell',
  list: 'comment-list',
  item: 'row',
  meta: 'meta',
  author: 'author',
  badge: 'badge',
  stamp: 'stamp',
  body: 'body',
  avatar: 'avatar',
  avatarText: 'avatar-text',
  actions: 'tools',
  children: 'children',
  form: 'comment-form',
  note: 'note',
  field: 'field',
  label: 'label',
  captcha: 'captcha',
  spacer: 'spacer',
  footer: 'footer',
};

const blockClasses = {
  story: 'story',
  crumbs: 'crumbs',
  headingWrap: 'heading-wrap',
  heading: 'heading',
  intro: 'lede',
  shell: 'comment-shell',
  list: 'comment-list',
  item: 'comment-block',
  meta: 'comment-header',
  author: 'comment-author',
  badge: 'comment-badge',
  stamp: 'comment-date',
  body: 'comment-text',
  avatar: 'avatar',
  avatarText: 'avatar-text',
  actions: 'comment-footer',
  children: 'comment-children',
  form: 'comment-form',
  note: 'comment-note',
  field: 'field',
  label: 'label',
  captcha: 'captcha',
  spacer: 'spacer',
  footer: 'footer',
};

const drupalClasses = {
  story: 'story',
  crumbs: 'crumbs',
  headingWrap: 'heading-wrap',
  heading: 'heading',
  intro: 'lede',
  shell: 'page',
  list: 'comment-list',
  item: 'views-row',
  meta: 'submitted',
  author: 'author',
  badge: 'badge',
  stamp: 'stamp',
  body: 'field field--name-body',
  avatar: 'avatar',
  avatarText: 'avatar-text',
  actions: 'links',
  children: 'indented',
  form: 'comment-form',
  note: 'comment-note',
  field: 'field',
  label: 'label',
  captcha: 'captcha',
  spacer: 'spacer',
  footer: 'footer',
};

const microClasses = {
  story: 'story',
  crumbs: 'crumbs',
  headingWrap: 'heading-wrap',
  heading: 'heading',
  intro: 'lede',
  shell: 'hentry',
  list: 'entry-comments',
  item: 'entry-comment',
  meta: 'vcard',
  author: 'fn',
  badge: 'badge',
  stamp: 'updated',
  body: 'comment-content',
  avatar: 'avatar',
  avatarText: 'avatar-text',
  actions: 'reply',
  children: 'children',
  form: 'comment-form',
  note: 'note',
  field: 'field',
  label: 'label',
  captcha: 'captcha',
  spacer: 'spacer',
  footer: 'footer',
};

const bemClasses = {
  story: 'story',
  crumbs: 'crumbs',
  headingWrap: 'heading-wrap',
  heading: 'heading',
  intro: 'lede',
  shell: 'comment',
  list: 'comment__list',
  item: 'comment__item',
  meta: 'comment__meta',
  author: 'comment__author',
  badge: 'comment__badge',
  stamp: 'comment__stamp',
  body: 'comment__body',
  avatar: 'comment__avatar',
  avatarText: 'comment__avatar-text',
  actions: 'comment__actions',
  children: 'comment__children',
  form: 'comment__form',
  note: 'comment__note',
  field: 'comment__field',
  label: 'comment__label',
  captcha: 'comment__captcha',
  spacer: 'comment__spacer',
  footer: 'comment__footer',
};

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

function escapeAttr(value) {
  return escapeHtml(value);
}

function md5Hex(value) {
  return crypto.createHash('md5').update(String(value)).digest('hex');
}

function pick(array, index) {
  return array[index % array.length];
}

function pageSpec(num) {
  const topic = scenarios[(num - 1) % scenarios.length];
  const pageGroup =
    num <= 10 ? 'keyword-free-simple'
      : num <= 20 ? 'keyword-free-opaque'
        : num <= 35 ? 'deep-chain'
          : num <= 45 ? 'float-classic'
            : num <= 56 ? 'id-layout'
              : num <= 67 ? 'comment-block'
                : num <= 78 ? 'drupal'
                  : num <= 89 ? 'micro'
                    : 'bem';

  const replyDepth = (num - 1) % 3;
  const totalComments = 2 + ((num * 7) % 17);
  const hasForm = num % 6 !== 0 && num % 11 !== 0;
  const separatedCompose = num >= 36 && num <= 45;
  const formMode = separatedCompose ? (num % 2 === 0 ? 'multi' : 'textarea') : (hasForm ? (num % 5 === 0 ? 'multi' : 'textarea') : 'none');
  const avatarMode = pick(['image', 'color', 'none'], num - 1);
  const indentMode = num % 2 === 0 ? 'margin' : 'padding';
  const headingMode = pick(['reader', 'what', 'join', 'discussion', 'count', 'latest'], num + 1);
  const hasCaptcha = [7, 12, 18, 23, 29, 37, 40, 44, 58, 63, 71, 79, 86, 94].includes(num);
  const hasNotify = num % 3 === 0 || num % 8 === 0;
  const topComposer = !separatedCompose && formMode !== 'none' && num % 2 === 0;
  const showPager = num % 4 === 0 || num % 9 === 0;
  const palette = palettes[(num - 1) % palettes.length];

  return {
    num,
    topic,
    pageGroup,
    replyDepth,
    totalComments,
    formMode,
    avatarMode,
    indentMode,
    headingMode,
    hasCaptcha,
    hasNotify,
    separatedCompose,
    topComposer,
    showPager,
    palette,
    classes: getClasses(pageGroup),
  };
}

function getClasses(pageGroup) {
  switch (pageGroup) {
    case 'keyword-free-simple':
      return keywordFreeSimple;
    case 'keyword-free-opaque':
      return keywordFreeOpaque;
    case 'deep-chain':
      return deepChainClasses;
    case 'float-classic':
      return floatClassicClasses;
    case 'id-layout':
      return idLayoutClasses;
    case 'comment-block':
      return blockClasses;
    case 'drupal':
      return drupalClasses;
    case 'micro':
      return microClasses;
    case 'bem':
      return bemClasses;
    default:
      return keywordFreeSimple;
  }
}

function buildHeading(spec) {
  switch (spec.headingMode) {
    case 'reader':
      return 'Reader Comments';
    case 'what':
      return 'What do you think?';
    case 'join':
      return 'Join the discussion';
    case 'discussion':
      return 'Discussion';
    case 'count':
      return `${spec.totalComments} Comments`;
    case 'latest':
      return 'Latest replies';
    default:
      return 'Comments';
  }
}

function buildComposerHeading(spec) {
  const labels = ['Leave a Comment', 'Add Your Reply', 'Post a Response'];
  return pick(labels, spec.num);
}

function buildDate(spec, seq, style) {
  const year = 2004 + ((spec.num + seq) % 6);
  const month = (spec.num * 3 + seq) % 12;
  const day = ((spec.num * 5 + seq) % 28) + 1;
  const hour24 = (spec.num * 7 + seq * 3) % 24;
  const minute = (spec.num * 11 + seq * 13) % 60;
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fullMonthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const hour12 = hour24 % 12 || 12;
  const ampm = hour24 < 12 ? 'am' : 'pm';

  if (style === 'short') {
    return `${day} ${monthNames[month]} ${String(year).slice(2)}`;
  }
  if (style === 'iso') {
    return `${year}-${pad2(month + 1)}-${pad2(day)} ${pad2(hour24)}:${pad2(minute)}`;
  }
  return `${fullMonthNames[month]} ${day}, ${year} at ${hour12}:${pad2(minute)} ${ampm}`;
}

function authorName(spec, seq, level) {
  const names = [
    'Mara', 'Jon', 'Nina', 'Iris', 'Dev', 'Ruth', 'Cal', 'Sana', 'Eli', 'Tara',
    'Owen', 'Leah', 'Mika', 'Rex', 'June', 'Noah', 'Pia', 'Cole', 'Vera', 'Ari',
    'Gabe', 'Hana', 'Luca', 'Zoe', 'Nate', 'Mila', 'Theo', 'Ivy', 'Arlo', 'Dina',
  ];
  const guests = ['Guest', 'Anonymous', 'Reader', 'Visitor'];
  if ((spec.num + seq + level) % 7 === 0) {
    return pick(guests, spec.num + seq + level);
  }
  return pick(names, spec.num * 3 + seq * 5 + level);
}

function roleLabel(spec, seq, level) {
  const roles = ['Member', 'Member', 'Reader', 'Contributor', 'Moderator', 'Guest'];
  if ((spec.num + seq + level) % 11 === 0) {
    return 'Admin';
  }
  return pick(roles, spec.num + seq + level);
}

function avatarSeed(spec, seq, level) {
  return md5Hex(`${spec.topic.siteName}:${spec.num}:${seq}:${level}`);
}

function buildParagraphs(spec, node) {
  const issue = escapeHtml(spec.topic.issue);
  const fix = escapeHtml(spec.topic.fix);
  const title = escapeHtml(spec.topic.title.toLowerCase());
  const level = node.level;
  const seed = spec.num + node.seq + level;

  if (level === 0) {
    switch (seed % 4) {
      case 0:
        return [
          `I have seen ${issue} show up exactly when ${fix}. <strong>That is the first thing I would verify.</strong>`,
          `For ${title}, the visible symptom is usually smaller than the layout change behind it.`,
        ];
      case 1:
        return [
          `The page reads like a ${issue} problem rather than a content problem. <em>${fix}</em> explains most of it.`,
          `Once the outer wrapper shifts, the rest of the thread tends to follow the same path.`,
        ];
      case 2:
        return [
          `This feels like the wrappers changed under the page. <b>${fix}</b> is the clue I would chase first.`,
          `The visible break can look random, but the cause is often very repeatable.`,
        ];
      default:
        return [
          `The symptoms are small, but the cause is bigger.<br><i>${fix} needs a closer look.</i>`,
          `I would keep the fix narrow until the basic shape is stable again.`,
        ];
    }
  }

  if (level === 1) {
    switch (seed % 4) {
      case 0:
        return [
          `That matches what I saw too. <strong>${fix}</strong> cleared it up once the layout settled.`,
          `I would still check the outer box before touching the content.`,
        ];
      case 1:
        return [
          `I agree on the ${issue} part. <em>${fix}</em> is the quickest test here.`,
          `If the page only breaks after the new wrapper loads, that is the real clue.`,
        ];
      case 2:
        return [
          `The quick proof is to simplify the page one layer at a time. <b>${fix}</b> should be obvious after that.`,
          `A small change often explains the whole thread.`,
        ];
      default:
        return [
          `Short version: this still looks like the wrapper level to me.<br><i>${fix} is where I would start.</i>`,
          `If the browser view changes, the layout issue follows right away.`,
        ];
    }
  }

  switch (seed % 4) {
    case 0:
      return [
        `Agreed, but I would also check the parent box. <strong>${issue}</strong> tends to collapse from the outside in.`,
        `The safest move is to make one layer boring again before adding anything else.`,
      ];
    case 1:
      return [
        `I would keep the fix small and repeatable. <em>${fix}</em> beats a larger rewrite in this case.`,
        `Once the baseline holds, the rest of the page is easier to read.`,
      ];
    case 2:
      return [
        `If it only happens in one browser, the old quirks layer is probably involved. <b>${fix}</b> still looks right though.`,
        `That kind of bug usually hides in one extra wrapper or one stale width value.`,
      ];
    default:
      return [
        `The quicker test is to strip the outer divs and see what remains.<br><i>${fix} is the part worth isolating.</i>`,
        `A nested layout can hide the answer until the page is simplified.`,
      ];
  }
}

function buildTree(spec) {
  const total = spec.totalComments;
  const roots = [];
  const seqState = { value: 0 };

  function makeNode(level) {
    seqState.value += 1;
    const seq = seqState.value;
    const style = pick(['long', 'short', 'iso'], spec.num + seq + level);
    const node = {
      seq,
      level,
      author: authorName(spec, seq, level),
      role: roleLabel(spec, seq, level),
      stamp: buildDate(spec, seq, style),
      avatar: avatarSeed(spec, seq, level),
      children: [],
    };
    return node;
  }

  if (spec.replyDepth === 0) {
    for (let i = 0; i < total; i += 1) {
      roots.push(makeNode(0));
    }
    return roots;
  }

  const desiredRoots = spec.replyDepth === 1 ? 3 + (spec.num % 4) : 2 + (spec.num % 3);
  const rootCount = Math.max(1, Math.min(desiredRoots, total - 1));
  for (let i = 0; i < rootCount; i += 1) {
    roots.push(makeNode(0));
  }

  let remaining = total - rootCount;
  const allNodes = roots.slice();
  let cursor = 0;

  while (remaining > 0) {
    const eligible = allNodes.filter((node) => node.level < spec.replyDepth);
    const parent = eligible[cursor % eligible.length];
    const child = makeNode(parent.level + 1);
    parent.children.push(child);
    allNodes.push(child);
    remaining -= 1;
    cursor += 1;
  }

  return roots;
}

function renderBreadcrumbs(spec, classes) {
  const crumbHtml = spec.topic.breadcrumbs.map((crumb, index) => {
    const link = `<a href="#">${escapeHtml(crumb)}</a>`;
    return index === spec.topic.breadcrumbs.length - 1
      ? `<li class="current">${link}</li>`
      : `<li>${link}</li>`;
  }).join('');

  return [
    `<div class="${classes.crumbs}">`,
    `<ul>`,
    crumbHtml,
    `</ul>`,
    `</div>`,
  ].join('\n');
}

function renderHeader(spec, classes) {
  const title = escapeHtml(spec.topic.title);
  const intro = escapeHtml(spec.topic.intro);
  return [
    `<div class="${classes.story}">`,
    renderBreadcrumbs(spec, classes),
    `<div class="${classes.headingWrap}">`,
    `<h1>${escapeHtml(spec.topic.siteName)}</h1>`,
    `<h2>${title}</h2>`,
    `</div>`,
    `<p class="${classes.intro}">${intro}</p>`,
    `</div>`,
  ].join('\n');
}

function renderThreadHeading(spec, classes) {
  const heading = buildHeading(spec);
  return [
    `<div class="${classes.headingWrap}">`,
    `<h3 class="${classes.heading}">${escapeHtml(heading)}</h3>`,
    `</div>`,
  ].join('\n');
}

function renderSpacer(spec, classes) {
  return [
    `<div class="${classes.spacer}"></div>`,
    `<div class="${classes.spacer}"></div>`,
    `<div class="${classes.spacer}"></div>`,
    `<div class="${classes.spacer}"></div>`,
  ].join('\n');
}

function renderComposer(spec, classes) {
  const heading = buildComposerHeading(spec);
  if (spec.formMode === 'none') {
    return [
      `<div class="${classes.form}">`,
      `<h3>${escapeHtml(heading)}</h3>`,
      `<div class="${classes.note}">Replies are closed on this page.</div>`,
      `</div>`,
    ].join('\n');
  }

  const notify = spec.hasNotify
    ? [
      `<div class="${classes.field}">`,
      `<label class="${classes.label}"><input type="checkbox" name="notify"> Notify me of followup comments via e-mail</label>`,
      `</div>`,
    ].join('\n')
    : '';

  const captcha = spec.hasCaptcha
    ? [
      `<div class="${classes.captcha}">`,
      `<img src="captcha.php" width="120" height="40" alt="captcha">`,
      `<input type="text" name="captcha" value="">`,
      `</div>`,
    ].join('\n')
    : '';

  const formFields = spec.formMode === 'multi'
    ? [
      `<div class="${classes.field}">`,
      `<label class="${classes.label}">Name <input type="text" name="name" value=""></label>`,
      `</div>`,
      `<div class="${classes.field}">`,
      `<label class="${classes.label}">Email <input type="text" name="email" value=""></label>`,
      `</div>`,
      `<div class="${classes.field}">`,
      `<label class="${classes.label}">Website <input type="text" name="website" value=""></label>`,
      `</div>`,
      `<div class="${classes.field}">`,
      `<label class="${classes.label}">Message <textarea name="message" rows="6" cols="52"></textarea></label>`,
      `</div>`,
    ].join('\n')
    : [
      `<div class="${classes.field}">`,
      `<label class="${classes.label}">Message <textarea name="message" rows="7" cols="56"></textarea></label>`,
      `</div>`,
    ].join('\n');

  return [
    `<div class="${classes.form}">`,
    `<h3>${escapeHtml(heading)}</h3>`,
    `<form action="#" method="post">`,
    formFields,
    notify,
    captcha,
    `<div class="${classes.footer}">`,
    `<button type="submit">Post</button>`,
    `</div>`,
    `</form>`,
    `</div>`,
  ].filter(Boolean).join('\n');
}

function buildCss(spec) {
  const p = spec.palette;
  const c = spec.classes;
  const base = [
    'body {',
    `  background: ${p.bg};`,
    `  color: ${p.text};`,
    '  margin: 0;',
    '  font-family: Verdana, Arial, sans-serif;',
    '  font-size: 13px;',
    '  line-height: 1.45;',
    '}',
    'a:link { color: ' + p.accent + '; }',
    'a:visited { color: ' + p.accent + '; }',
    'h1, h2, h3, p, ul { margin: 0; padding: 0; }',
    'ul { list-style: none; }',
    '.sep { color: ' + p.line + '; }',
    `.${c.story} { margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px solid ${p.line}; }`,
    `.${c.crumbs} { font-size: 11px; margin-bottom: 10px; }`,
    `.${c.crumbs} li { display: inline; margin-right: 6px; }`,
    `.${c.headingWrap} { margin-bottom: 10px; }`,
    `.${c.heading} { font-size: 20px; margin-bottom: 6px; }`,
    `.${c.intro} { font-size: 12px; color: ${p.accent}; }`,
  ].join('\n');

  if (spec.pageGroup === 'keyword-free-simple' || spec.pageGroup === 'keyword-free-opaque') {
    const c = spec.classes;
    const box = spec.num > 60 ? 'box-shadow: 0 1px 2px rgba(0,0,0,0.08);' : '';
    return [
      base,
      `.${c.root} { width: 760px; margin: 0 auto; padding: 18px 0 36px; }`,
      `.${c.story} { background: ${p.panel}; border: 1px solid ${p.line}; padding: 14px 16px; ${box} }`,
      `.${c.crumbs} { font-size: 11px; margin-bottom: 10px; }`,
      `.${c.crumbs} li { display: inline; margin-right: 6px; }`,
      `.${c.headingWrap} { margin-bottom: 10px; }`,
      `.${c.heading} { font-size: 20px; margin-bottom: 6px; }`,
      `.${c.intro} { font-size: 12px; color: ${p.accent}; }`,
      `.${c.list} { margin-top: 14px; }`,
      `.${c.item} { background: ${p.panel}; border: 1px solid ${p.line}; padding: 10px; margin-bottom: 10px; ${box} }`,
      `.${c.meta} { display: block; margin-bottom: 8px; overflow: hidden; }`,
      `.${c.author} { font-weight: bold; }`,
      `.${c.badge} { margin-left: 8px; padding: 1px 5px; background: ${p.soft}; border: 1px solid ${p.line}; font-size: 11px; }`,
      `.${c.stamp} { float: right; color: ${p.accent}; font-size: 11px; }`,
      `.${c.body} p { margin: 0 0 8px 0; }`,
      `.${c.avatar} { float: left; width: 48px; height: 48px; margin-right: 10px; border: 1px solid ${p.line}; overflow: hidden; text-align: center; line-height: 48px; background: ${p.soft}; }`,
      `.${c.avatar} img { display: block; width: 48px; height: 48px; }`,
      `.${c.avatarText} { font-weight: bold; color: ${p.accent}; }`,
      `.${c.body} { overflow: hidden; }`,
      `.${c.tools} { margin-top: 8px; font-size: 11px; color: ${p.accent}; }`,
      `.${c.children} { margin-top: 10px; border-left: 3px solid ${p.accent}; padding-left: 10px; }`,
      `.${c.form} { background: ${p.panel}; border: 1px solid ${p.line}; padding: 12px 14px; margin-top: 14px; ${box} }`,
      `.${c.field} { margin-top: 8px; }`,
      `.${c.label} { display: block; font-size: 12px; }`,
      `.${c.label} input, .${c.label} textarea { display: block; width: 96%; margin-top: 4px; border: 1px solid ${p.line}; padding: 5px; font-family: inherit; font-size: 13px; background: #fff; }`,
      `.${c.captcha} { margin-top: 8px; }`,
      `.${c.captcha} img { vertical-align: middle; border: 1px solid ${p.line}; }`,
      `.${c.captcha} input { width: 130px; margin-left: 8px; border: 1px solid ${p.line}; padding: 4px; }`,
      `.${c.footer} { margin-top: 10px; }`,
      `.${c.footer} button { border: 1px solid ${p.line}; background: ${p.soft}; padding: 5px 12px; font-family: inherit; }`,
      `.${c.note} { margin-top: 8px; color: ${p.accent}; }`,
    ].join('\n');
  }

  if (spec.pageGroup === 'deep-chain') {
    const c = spec.classes;
    const box = spec.num > 30 ? 'box-shadow: 0 1px 2px rgba(0,0,0,0.07);' : '';
    return [
      base,
      `div.wrapper { width: 760px; margin: 0 auto; padding: 18px 0 36px; }`,
      `div.wrapper div.inner div.content-area div.main-col div.block div.shell { background: ${p.panel}; border: 1px solid ${p.line}; padding: 14px; ${box} }`,
      `div.wrapper div.inner div.content-area div.main-col div.block div.shell h1 { font-size: 24px; margin-bottom: 6px; }`,
      `div.wrapper div.inner div.content-area div.main-col div.block div.shell h2 { font-size: 18px; margin-bottom: 10px; }`,
      `div.wrapper div.inner div.content-area div.main-col div.block div.shell .post-list { margin-top: 12px; }`,
      `div.wrapper div.inner div.content-area div.main-col div.block div.shell .post { background: ${p.panel}; border: 1px solid ${p.line}; padding: 10px; margin-bottom: 10px; }`,
      `div.wrapper div.inner div.content-area div.main-col div.block div.shell .post-meta { overflow: hidden; margin-bottom: 8px; }`,
      `div.wrapper div.inner div.content-area div.main-col div.block div.shell .post-author { font-weight: bold; }`,
      `div.wrapper div.inner div.content-area div.main-col div.block div.shell .post-badge { margin-left: 8px; padding: 1px 5px; background: ${p.soft}; border: 1px solid ${p.line}; font-size: 11px; }`,
      `div.wrapper div.inner div.content-area div.main-col div.block div.shell .post-stamp { float: right; color: ${p.accent}; font-size: 11px; }`,
      `div.wrapper div.inner div.content-area div.main-col div.block div.shell .post-body p { margin: 0 0 8px 0; }`,
      `div.wrapper div.inner div.content-area div.main-col div.block div.shell .post-avatar { float: left; width: 48px; height: 48px; margin-right: 10px; border: 1px solid ${p.line}; overflow: hidden; text-align: center; line-height: 48px; background: ${p.soft}; }`,
      `div.wrapper div.inner div.content-area div.main-col div.block div.shell .post-avatar img { display: block; width: 48px; height: 48px; }`,
      `div.wrapper div.inner div.content-area div.main-col div.block div.shell .post-avatar-text { font-weight: bold; color: ${p.accent}; }`,
      `div.wrapper div.inner div.content-area div.main-col div.block div.shell .post-body { overflow: hidden; }`,
      `div.wrapper div.inner div.content-area div.main-col div.block div.shell .post-tools { margin-top: 8px; font-size: 11px; }`,
      `div.wrapper div.inner div.content-area div.main-col div.block div.shell .post-children { margin-top: 10px; border-left: 3px solid ${p.accent}; padding-left: 10px; }`,
      `div.wrapper div.inner div.content-area div.main-col div.block div.shell .composer { background: ${p.panel}; border: 1px solid ${p.line}; padding: 12px 14px; margin-top: 14px; }`,
      `div.wrapper div.inner div.content-area div.main-col div.block div.shell .field { margin-top: 8px; }`,
      `div.wrapper div.inner div.content-area div.main-col div.block div.shell .label { display: block; font-size: 12px; }`,
      `div.wrapper div.inner div.content-area div.main-col div.block div.shell .label input, div.wrapper div.inner div.content-area div.main-col div.block div.shell .label textarea { display: block; width: 96%; margin-top: 4px; border: 1px solid ${p.line}; padding: 5px; font-family: inherit; font-size: 13px; }`,
      `div.wrapper div.inner div.content-area div.main-col div.block div.shell .captcha { margin-top: 8px; }`,
      `div.wrapper div.inner div.content-area div.main-col div.block div.shell .captcha img { vertical-align: middle; border: 1px solid ${p.line}; }`,
      `div.wrapper div.inner div.content-area div.main-col div.block div.shell .captcha input { width: 130px; margin-left: 8px; border: 1px solid ${p.line}; padding: 4px; }`,
      `div.wrapper div.inner div.content-area div.main-col div.block div.shell .spacer { height: 12px; }`,
      `div.wrapper div.inner div.content-area div.main-col div.block div.shell .foot button { border: 1px solid ${p.line}; background: ${p.soft}; padding: 5px 12px; font-family: inherit; }`,
      `div.wrapper div.inner div.content-area div.main-col div.block div.shell .note { margin-top: 8px; color: ${p.accent}; }`,
    ].join('\n');
  }

  if (spec.pageGroup === 'float-classic') {
    const c = spec.classes;
    const box = spec.num > 40 ? 'box-shadow: 0 1px 2px rgba(0,0,0,0.08);' : '';
    return [
      base,
      `#page { width: 760px; margin: 0 auto; padding: 18px 0 36px; }`,
      `#comments { background: ${p.panel}; border: 1px solid ${p.line}; padding: 14px; ${box} }`,
      `#comments h1 { font-size: 24px; margin-bottom: 6px; }`,
      `#comments h2 { font-size: 18px; margin-bottom: 10px; }`,
      `.comment-shell .comment-feed { margin-top: 12px; }`,
      `.comment-item { border-top: 1px solid ${p.line}; padding: 12px 0; overflow: hidden; }`,
      `.comment-item:first-child { border-top: 0; }`,
      `.comment-meta { overflow: hidden; margin-bottom: 8px; }`,
      `.comment-author { font-weight: bold; }`,
      `.comment-badge { margin-left: 8px; padding: 1px 5px; background: ${p.soft}; border: 1px solid ${p.line}; font-size: 11px; }`,
      `.comment-stamp { float: right; color: ${p.accent}; font-size: 11px; }`,
      `.comment-avatar { float: left; width: 48px; height: 48px; margin-right: 10px; border: 1px solid ${p.line}; overflow: hidden; text-align: center; line-height: 48px; background: ${p.soft}; }`,
      `.comment-avatar img { display: block; width: 48px; height: 48px; }`,
      `.comment-avatar-text { font-weight: bold; color: ${p.accent}; }`,
      `.comment-body { overflow: hidden; }`,
      `.comment-body p { margin: 0 0 8px 0; }`,
      `.comment-tools { margin-top: 8px; font-size: 11px; }`,
      `.comment-item.reply { border-left: 3px solid ${p.accent}; padding-left: 12px; }`,
      `.comment-replies { margin-top: 10px; }`,
      `.comment-form { background: ${p.panel}; border: 1px solid ${p.line}; padding: 12px 14px; margin-top: 14px; }`,
      `.comment-form .field { margin-top: 8px; }`,
      `.comment-form .label { display: block; font-size: 12px; }`,
      `.comment-form .label input, .comment-form .label textarea { display: block; width: 96%; margin-top: 4px; border: 1px solid ${p.line}; padding: 5px; font-family: inherit; font-size: 13px; }`,
      `.comment-form .captcha { margin-top: 8px; }`,
      `.comment-form .captcha img { vertical-align: middle; border: 1px solid ${p.line}; }`,
      `.comment-form .captcha input { width: 130px; margin-left: 8px; border: 1px solid ${p.line}; padding: 4px; }`,
      `.comment-footer { margin-top: 10px; }`,
      `.comment-footer button { border: 1px solid ${p.line}; background: ${p.soft}; padding: 5px 12px; font-family: inherit; }`,
      `.comment-note { margin-top: 8px; color: ${p.accent}; }`,
    ].join('\n');
  }

  if (spec.pageGroup === 'id-layout') {
    const c = spec.classes;
    const box = spec.num > 50 ? 'box-shadow: 0 1px 2px rgba(0,0,0,0.08);' : '';
    return [
      base,
      '#page-shell { width: 760px; margin: 0 auto; padding: 18px 0 36px; }',
      '#comments { background: ' + p.panel + '; border: 1px solid ' + p.line + '; padding: 14px; ' + box + ' }',
      '#comments h1 { font-size: 24px; margin-bottom: 6px; }',
      '#comments h2 { font-size: 18px; margin-bottom: 10px; }',
      '#comment-list { margin-top: 12px; }',
      '#comment-list .row { background: ' + p.panel + '; border: 1px solid ' + p.line + '; padding: 10px; margin-bottom: 10px; overflow: hidden; }',
      '#comment-list .meta { overflow: hidden; margin-bottom: 8px; }',
      '#comment-list .author { font-weight: bold; }',
      '#comment-list .badge { margin-left: 8px; padding: 1px 5px; background: ' + p.soft + '; border: 1px solid ' + p.line + '; font-size: 11px; }',
      '#comment-list .stamp { float: right; color: ' + p.accent + '; font-size: 11px; }',
      '#comment-list .avatar { float: left; width: 48px; height: 48px; margin-right: 10px; border: 1px solid ' + p.line + '; overflow: hidden; text-align: center; line-height: 48px; background: ' + p.soft + '; }',
      '#comment-list .avatar img { display: block; width: 48px; height: 48px; }',
      '#comment-list .avatar-text { font-weight: bold; color: ' + p.accent + '; }',
      '#comment-list .body { overflow: hidden; }',
      '#comment-list .body p { margin: 0 0 8px 0; }',
      '#comment-list .tools { margin-top: 8px; font-size: 11px; }',
      '#comment-list .children { margin-top: 10px; border-left: 3px solid ' + p.accent + '; padding-left: 10px; }',
      '#comment-form { background: ' + p.panel + '; border: 1px solid ' + p.line + '; padding: 12px 14px; margin-top: 14px; }',
      '#comment-form .field { margin-top: 8px; }',
      '#comment-form .label { display: block; font-size: 12px; }',
      '#comment-form .label input, #comment-form .label textarea { display: block; width: 96%; margin-top: 4px; border: 1px solid ' + p.line + '; padding: 5px; font-family: inherit; font-size: 13px; }',
      '#comment-form .captcha { margin-top: 8px; }',
      '#comment-form .captcha img { vertical-align: middle; border: 1px solid ' + p.line + '; }',
      '#comment-form .captcha input { width: 130px; margin-left: 8px; border: 1px solid ' + p.line + '; padding: 4px; }',
      '#comment-form .footer { margin-top: 10px; }',
      '#comment-form .footer button { border: 1px solid ' + p.line + '; background: ' + p.soft + '; padding: 5px 12px; font-family: inherit; }',
      '#comment-form .note { margin-top: 8px; color: ' + p.accent + '; }',
    ].join('\n');
  }

  if (spec.pageGroup === 'comment-block') {
    const c = spec.classes;
    const box = spec.num > 60 ? 'box-shadow: 0 1px 2px rgba(0,0,0,0.08);' : '';
    return [
      base,
      `.${c.shell} { width: 760px; margin: 0 auto; padding: 18px 0 36px; }`,
      `.${c.list} { background: ${p.panel}; border: 1px solid ${p.line}; padding: 14px; ${box} }`,
      `.${c.item} { border-top: 1px solid ${p.line}; padding: 12px 0; overflow: hidden; }`,
      `.${c.item}:first-child { border-top: 0; }`,
      `.${c.meta} { overflow: hidden; margin-bottom: 8px; }`,
      `.${c.author} { font-weight: bold; }`,
      `.${c.badge} { margin-left: 8px; padding: 1px 5px; background: ${p.soft}; border: 1px solid ${p.line}; font-size: 11px; }`,
      `.${c.stamp} { float: right; color: ${p.accent}; font-size: 11px; }`,
      `.${c.avatar} { float: left; width: 48px; height: 48px; margin-right: 10px; border: 1px solid ${p.line}; overflow: hidden; text-align: center; line-height: 48px; background: ${p.soft}; }`,
      `.${c.avatar} img { display: block; width: 48px; height: 48px; }`,
      `.${c.avatarText} { font-weight: bold; color: ${p.accent}; }`,
      `.${c.body} { overflow: hidden; }`,
      `.${c.body} p { margin: 0 0 8px 0; }`,
      `.${c.actions} { margin-top: 8px; font-size: 11px; }`,
      `.${c.item}.reply { border-left: 3px solid ${p.accent}; padding-left: 12px; }`,
      `.${c.children} { margin-top: 10px; }`,
      `.${c.form} { background: ${p.panel}; border: 1px solid ${p.line}; padding: 12px 14px; margin-top: 14px; ${box} }`,
      `.${c.field} { margin-top: 8px; }`,
      `.${c.label} { display: block; font-size: 12px; }`,
      `.${c.label} input, .${c.label} textarea { display: block; width: 96%; margin-top: 4px; border: 1px solid ${p.line}; padding: 5px; font-family: inherit; font-size: 13px; }`,
      `.${c.captcha} { margin-top: 8px; }`,
      `.${c.captcha} img { vertical-align: middle; border: 1px solid ${p.line}; }`,
      `.${c.captcha} input { width: 130px; margin-left: 8px; border: 1px solid ${p.line}; padding: 4px; }`,
      `.${c.footer} { margin-top: 10px; }`,
      `.${c.footer} button { border: 1px solid ${p.line}; background: ${p.soft}; padding: 5px 12px; font-family: inherit; }`,
      `.${c.note} { margin-top: 8px; color: ${p.accent}; }`,
    ].join('\n');
  }

  if (spec.pageGroup === 'drupal') {
    const c = spec.classes;
    const box = spec.num > 70 ? 'box-shadow: 0 1px 2px rgba(0,0,0,0.08);' : '';
    return [
      base,
      `.${c.shell} { width: 760px; margin: 0 auto; padding: 18px 0 36px; }`,
      `.${c.list} { background: ${p.panel}; border: 1px solid ${p.line}; padding: 14px; ${box} }`,
      `.${c.item} { border-bottom: 1px dashed ${p.line}; padding: 12px 0; overflow: hidden; }`,
      `.${c.item}:last-child { border-bottom: 0; }`,
      `.${c.meta} { overflow: hidden; margin-bottom: 8px; font-size: 12px; }`,
      `.${c.author} { font-weight: bold; }`,
      `.${c.badge} { margin-left: 8px; padding: 1px 5px; background: ${p.soft}; border: 1px solid ${p.line}; font-size: 11px; }`,
      `.${c.stamp} { float: right; color: ${p.accent}; }`,
      `.${c.body} { overflow: hidden; }`,
      `.${c.body} p { margin: 0 0 8px 0; }`,
      `.${c.avatar} { float: left; width: 48px; height: 48px; margin-right: 10px; border: 1px solid ${p.line}; overflow: hidden; text-align: center; line-height: 48px; background: ${p.soft}; }`,
      `.${c.avatar} img { display: block; width: 48px; height: 48px; }`,
      `.${c.avatarText} { font-weight: bold; color: ${p.accent}; }`,
      `.${c.actions} { margin-top: 8px; font-size: 11px; }`,
      `.${c.children} { margin-top: 10px; border-left: 3px solid ${p.accent}; padding-left: 10px; }`,
      `.${c.form} { background: ${p.panel}; border: 1px solid ${p.line}; padding: 12px 14px; margin-top: 14px; }`,
      `.${c.field} { margin-top: 8px; }`,
      `.${c.label} { display: block; font-size: 12px; }`,
      `.${c.label} input, .${c.label} textarea { display: block; width: 96%; margin-top: 4px; border: 1px solid ${p.line}; padding: 5px; font-family: inherit; font-size: 13px; }`,
      `.${c.captcha} { margin-top: 8px; }`,
      `.${c.captcha} img { vertical-align: middle; border: 1px solid ${p.line}; }`,
      `.${c.captcha} input { width: 130px; margin-left: 8px; border: 1px solid ${p.line}; padding: 4px; }`,
      `.${c.footer} { margin-top: 10px; }`,
      `.${c.footer} button { border: 1px solid ${p.line}; background: ${p.soft}; padding: 5px 12px; font-family: inherit; }`,
      `.${c.note} { margin-top: 8px; color: ${p.accent}; }`,
    ].join('\n');
  }

  if (spec.pageGroup === 'micro') {
    const c = spec.classes;
    const box = spec.num > 80 ? 'box-shadow: 0 1px 2px rgba(0,0,0,0.08);' : '';
    return [
      base,
      `.${c.shell} { width: 760px; margin: 0 auto; padding: 18px 0 36px; }`,
      `.${c.list} { background: ${p.panel}; border: 1px solid ${p.line}; padding: 14px; ${box} }`,
      `.${c.item} { border-top: 1px solid ${p.line}; padding: 12px 0; overflow: hidden; }`,
      `.${c.item}:first-child { border-top: 0; }`,
      `.${c.meta} { overflow: hidden; margin-bottom: 8px; }`,
      `.${c.author} { font-weight: bold; }`,
      `.${c.badge} { margin-left: 8px; padding: 1px 5px; background: ${p.soft}; border: 1px solid ${p.line}; font-size: 11px; }`,
      `.${c.stamp} { float: right; color: ${p.accent}; font-size: 11px; }`,
      `.${c.avatar} { float: left; width: 48px; height: 48px; margin-right: 10px; border: 1px solid ${p.line}; overflow: hidden; text-align: center; line-height: 48px; background: ${p.soft}; }`,
      `.${c.avatar} img { display: block; width: 48px; height: 48px; }`,
      `.${c.avatarText} { font-weight: bold; color: ${p.accent}; }`,
      `.${c.body} { overflow: hidden; }`,
      `.${c.body} p { margin: 0 0 8px 0; }`,
      `.${c.actions} { margin-top: 8px; font-size: 11px; }`,
      `.${c.children} { margin-top: 10px; border-left: 3px solid ${p.accent}; padding-left: 10px; }`,
      `.${c.form} { background: ${p.panel}; border: 1px solid ${p.line}; padding: 12px 14px; margin-top: 14px; }`,
      `.${c.field} { margin-top: 8px; }`,
      `.${c.label} { display: block; font-size: 12px; }`,
      `.${c.label} input, .${c.label} textarea { display: block; width: 96%; margin-top: 4px; border: 1px solid ${p.line}; padding: 5px; font-family: inherit; font-size: 13px; }`,
      `.${c.captcha} { margin-top: 8px; }`,
      `.${c.captcha} img { vertical-align: middle; border: 1px solid ${p.line}; }`,
      `.${c.captcha} input { width: 130px; margin-left: 8px; border: 1px solid ${p.line}; padding: 4px; }`,
      `.${c.footer} { margin-top: 10px; }`,
      `.${c.footer} button { border: 1px solid ${p.line}; background: ${p.soft}; padding: 5px 12px; font-family: inherit; }`,
      `.${c.note} { margin-top: 8px; color: ${p.accent}; }`,
    ].join('\n');
  }

  const box = spec.num > 90 ? 'box-shadow: 0 1px 2px rgba(0,0,0,0.08);' : '';
  return [
    base,
    `.${c.shell} { width: 760px; margin: 0 auto; padding: 18px 0 36px; }`,
    `.${c.list} { background: ${p.panel}; border: 1px solid ${p.line}; padding: 14px; ${box} }`,
    `.${c.item} { border-top: 1px solid ${p.line}; padding: 12px 0; overflow: hidden; }`,
    `.${c.item}:first-child { border-top: 0; }`,
    `.${c.meta} { overflow: hidden; margin-bottom: 8px; }`,
    `.${c.author} { font-weight: bold; }`,
    `.${c.badge} { margin-left: 8px; padding: 1px 5px; background: ${p.soft}; border: 1px solid ${p.line}; font-size: 11px; }`,
    `.${c.stamp} { float: right; color: ${p.accent}; font-size: 11px; }`,
    `.${c.avatar} { float: left; width: 48px; height: 48px; margin-right: 10px; border: 1px solid ${p.line}; overflow: hidden; text-align: center; line-height: 48px; background: ${p.soft}; }`,
    `.${c.avatar} img { display: block; width: 48px; height: 48px; }`,
    `.${c.avatarText} { font-weight: bold; color: ${p.accent}; }`,
    `.${c.body} { overflow: hidden; }`,
    `.${c.body} p { margin: 0 0 8px 0; }`,
    `.${c.actions} { margin-top: 8px; font-size: 11px; }`,
    `.${c.children} { margin-top: 10px; border-left: 3px solid ${p.accent}; padding-left: 10px; }`,
    `.${c.form} { background: ${p.panel}; border: 1px solid ${p.line}; padding: 12px 14px; margin-top: 14px; }`,
    `.${c.field} { margin-top: 8px; }`,
    `.${c.label} { display: block; font-size: 12px; }`,
    `.${c.label} input, .${c.label} textarea { display: block; width: 96%; margin-top: 4px; border: 1px solid ${p.line}; padding: 5px; font-family: inherit; font-size: 13px; }`,
    `.${c.captcha} { margin-top: 8px; }`,
    `.${c.captcha} img { vertical-align: middle; border: 1px solid ${p.line}; }`,
    `.${c.captcha} input { width: 130px; margin-left: 8px; border: 1px solid ${p.line}; padding: 4px; }`,
    `.${c.footer} { margin-top: 10px; }`,
    `.${c.footer} button { border: 1px solid ${p.line}; background: ${p.soft}; padding: 5px 12px; font-family: inherit; }`,
    `.${c.note} { margin-top: 8px; color: ${p.accent}; }`,
  ].join('\n');
}

function renderNode(spec, node, classes) {
  const avatar = avatarMarkup(spec, node, classes);
  const paragraphs = buildParagraphs(spec, node).map((text) => `<p>${text}</p>`).join('\n');
  const children = node.children.length
    ? `<div class="${classes.children}">\n${node.children.map((child) => renderNode(spec, child, classes)).join('\n')}\n</div>`
    : '';
  const actions = [
    `<a href="#">Reply</a>`,
    `<span class="sep">|</span>`,
    `<a href="#">Quote</a>`,
  ].join(' ');

  let metaAvatar = '';
  if (avatar) {
    metaAvatar = avatar;
  }

  const classList = [classes.item];
  if (node.level > 0) {
    classList.push('reply');
  }

  return [
    `<div class="${classList.join(' ')}"${indentStyle(spec, node.level)} id="${classes.item}-${spec.num}-${node.seq}">`,
    `<div class="${classes.meta}">`,
    metaAvatar,
    `<div class="meta-core">`,
    `<span class="${classes.author}">${escapeHtml(node.author)}</span>`,
    `<span class="${classes.badge}">${escapeHtml(node.role)}</span>`,
    `<span class="${classes.stamp}">${escapeHtml(node.stamp)}</span>`,
    `</div>`,
    `</div>`,
    `<div class="${classes.body}">`,
    paragraphs,
    `</div>`,
    `<div class="${classes.actions}">`,
    actions,
    `</div>`,
    children,
    `</div>`,
  ].filter(Boolean).join('\n');
}

function indentStyle(spec, level) {
  if (level === 0) {
    return '';
  }
  const size = level * 22;
  return spec.indentMode === 'margin' ? ` style="margin-left:${size}px"` : ` style="padding-left:${size}px"`;
}

function avatarMarkup(spec, node, classes) {
  if (spec.avatarMode === 'none') {
    return '';
  }

  const initials = node.author
    .split(/\s+/)
    .map((part) => part.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'NA';

  if (spec.avatarMode === 'image') {
    return `<div class="${classes.avatar}"><img src="https://www.gravatar.com/avatar/${node.avatar}?s=48" width="48" height="48" alt=""></div>`;
  }

  const swatches = ['#8aa1b3', '#b38a8a', '#8ab38f', '#b39b6f', '#7b89b4', '#a17fb2'];
  const swatch = pick(swatches, spec.num + node.seq);
  return `<div class="${classes.avatar}" style="background:${swatch};"><span class="${classes.avatarText}">${escapeHtml(initials)}</span></div>`;
}

function renderComments(spec, classes, tree) {
  const open = spec.pageGroup === 'id-layout'
    ? `<div id="${classes.list}" class="${classes.list}">`
    : `<div class="${classes.list}">`;
  return `${open}\n${tree.map((node) => renderNode(spec, node, classes)).join('\n')}\n</div>`;
}

function renderBreadcrumbs(spec, classes) {
  const crumbs = spec.topic.breadcrumbs.map((crumb) => `<li><a href="#">${escapeHtml(crumb)}</a></li>`).join('\n');
  return [
    `<div class="${classes.crumbs}">`,
    `<ul>`,
    crumbs,
    `</ul>`,
    `</div>`,
  ].join('\n');
}

function renderHeader(spec, classes) {
  return [
    `<div class="${classes.story}">`,
    renderBreadcrumbs(spec, classes),
    `<div class="${classes.headingWrap}">`,
    `<h1>${escapeHtml(spec.topic.siteName)}</h1>`,
    `<h2>${escapeHtml(spec.topic.title)}</h2>`,
    `</div>`,
    `<p class="${classes.intro}">${escapeHtml(spec.topic.intro)}</p>`,
    `</div>`,
  ].join('\n');
}

function renderThreadHeading(spec, classes) {
  return [
    `<div class="${classes.headingWrap}">`,
    `<h3 class="${classes.heading}">${escapeHtml(buildHeading(spec))}</h3>`,
    `</div>`,
  ].join('\n');
}

function renderSpacer(classes) {
  return [
    `<div class="${classes.spacer}"></div>`,
    `<div class="${classes.spacer}"></div>`,
    `<div class="${classes.spacer}"></div>`,
    `<div class="${classes.spacer}"></div>`,
  ].join('\n');
}

function renderComposer(spec, classes) {
  const heading = buildComposerHeading(spec);
  if (spec.formMode === 'none') {
    return [
      spec.pageGroup === 'id-layout'
        ? `<div id="${classes.form}" class="${classes.form}">`
        : `<div class="${classes.form}">`,
      `<h3>${escapeHtml(heading)}</h3>`,
      `<div class="${classes.note}">Replies are closed on this page.</div>`,
      `</div>`,
    ].join('\n');
  }

  const simpleField = [
    `<div class="${classes.field}">`,
    `<label class="${classes.label}">Message <textarea name="message" rows="7" cols="56"></textarea></label>`,
    `</div>`,
  ].join('\n');

  const multiFields = [
    `<div class="${classes.field}">`,
    `<label class="${classes.label}">Name <input type="text" name="name" value=""></label>`,
    `</div>`,
    `<div class="${classes.field}">`,
    `<label class="${classes.label}">Email <input type="text" name="email" value=""></label>`,
    `</div>`,
    `<div class="${classes.field}">`,
    `<label class="${classes.label}">Website <input type="text" name="website" value=""></label>`,
    `</div>`,
    `<div class="${classes.field}">`,
    `<label class="${classes.label}">Message <textarea name="message" rows="6" cols="52"></textarea></label>`,
    `</div>`,
  ].join('\n');

  const notify = spec.hasNotify
    ? [
      `<div class="${classes.field}">`,
      `<label class="${classes.label}"><input type="checkbox" name="notify"> Notify me of followup comments via e-mail</label>`,
      `</div>`,
    ].join('\n')
    : '';

  const captcha = spec.hasCaptcha
    ? [
      `<div class="${classes.captcha}">`,
      `<img src="captcha.php" width="120" height="40" alt="captcha">`,
      `<input type="text" name="captcha" value="">`,
      `</div>`,
    ].join('\n')
    : '';

  const fields = spec.formMode === 'multi' ? multiFields : simpleField;

  return [
    spec.pageGroup === 'id-layout'
      ? `<div id="${classes.form}" class="${classes.form}">`
      : `<div class="${classes.form}">`,
    `<h3>${escapeHtml(heading)}</h3>`,
    `<form action="#" method="post">`,
    fields,
    notify,
    captcha,
    `<div class="${classes.footer}">`,
    `<button type="submit">Post</button>`,
    `</div>`,
    `</form>`,
    `</div>`,
  ].filter(Boolean).join('\n');
}

function renderPage(spec, tree) {
  const classes = spec.classes;
  const css = buildCss(spec);
  const header = renderHeader(spec, classes);
  const threadHeading = renderThreadHeading(spec, classes);
  const comments = renderComments(spec, classes, tree);
  const composer = renderComposer(spec, classes);
  const separator = spec.separatedCompose ? renderSpacer(classes) : '';

  let content;
  if (spec.separatedCompose) {
    content = [
      header,
      threadHeading,
      comments,
      separator,
      composer,
    ].join('\n');
  } else if (spec.topComposer && spec.formMode !== 'none') {
    content = [
      header,
      composer,
      threadHeading,
      comments,
    ].join('\n');
  } else {
    content = [
      header,
      threadHeading,
      comments,
      composer,
    ].join('\n');
  }

  if (spec.pageGroup === 'deep-chain') {
    return [
      '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN">',
      '<html>',
      '<head>',
      '<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1">',
      `<title>${escapeHtml(spec.topic.siteName)} - ${escapeHtml(spec.topic.title)}</title>`,
      '<style type="text/css">',
      css,
      '</style>',
      '</head>',
      '<body>',
      '<div class="wrapper">',
      '<div class="inner">',
      '<div class="content-area">',
      '<div class="main-col">',
      '<div class="block">',
      '<div class="shell">',
      content,
      '</div>',
      '</div>',
      '</div>',
      '</div>',
      '</div>',
      '</div>',
      '</body>',
      '</html>',
    ].join('\n');
  }

  if (spec.pageGroup === 'float-classic') {
    return [
      '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN">',
      '<html>',
      '<head>',
      '<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1">',
      `<title>${escapeHtml(spec.topic.siteName)} - ${escapeHtml(spec.topic.title)}</title>`,
      '<style type="text/css">',
      css,
      '</style>',
      '</head>',
      '<body>',
      '<div id="page">',
      '<div id="comments">',
      content,
      '</div>',
      '</div>',
      '</body>',
      '</html>',
    ].join('\n');
  }

  if (spec.pageGroup === 'id-layout') {
    return [
      '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN">',
      '<html>',
      '<head>',
      '<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1">',
      `<title>${escapeHtml(spec.topic.siteName)} - ${escapeHtml(spec.topic.title)}</title>`,
      '<style type="text/css">',
      css,
      '</style>',
      '</head>',
      '<body>',
      '<div id="page-shell">',
      '<div id="comments">',
      content,
      '</div>',
      '</div>',
      '</body>',
      '</html>',
    ].join('\n');
  }

  if (spec.pageGroup === 'comment-block' || spec.pageGroup === 'drupal' || spec.pageGroup === 'micro' || spec.pageGroup === 'bem') {
    const outerClass = spec.classes.shell;
    return [
      '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN">',
      '<html>',
      '<head>',
      '<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1">',
      `<title>${escapeHtml(spec.topic.siteName)} - ${escapeHtml(spec.topic.title)}</title>`,
      '<style type="text/css">',
      css,
      '</style>',
      '</head>',
      '<body>',
      `<div class="${outerClass}">`,
      content,
      '</div>',
      '</body>',
      '</html>',
    ].join('\n');
  }

  return [
    '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN">',
    '<html>',
    '<head>',
    '<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1">',
    `<title>${escapeHtml(spec.topic.siteName)} - ${escapeHtml(spec.topic.title)}</title>`,
    '<style type="text/css">',
    css,
    '</style>',
    '</head>',
    '<body>',
    `<div class="${spec.classes.root}">`,
    `<div class="${spec.classes.shell}">`,
    content,
    '</div>',
    '</div>',
    '</body>',
    '</html>',
  ].join('\n');
}

function updateIndexFile() {
  const index = fs.readFileSync(indexPath, 'utf8');
  const updated = index
    .replace(/\| 03 \| [^|]+ \| `\/synthetic\/prompt_03\/` \|/, '| 03 | 100 / 100 | `/synthetic/prompt_03/` |')
    .replace(/\*\*Total:\*\* [^\n]+/, '**Total:** 300 / 2,000');
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
