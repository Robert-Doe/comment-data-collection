'use strict';

const fs = require('fs');
const path = require('path');

const outputDir = path.resolve(__dirname, '..', 'synthetic_data', 'pages', 'prompt_02');
const indexPath = path.resolve(__dirname, '..', 'synthetic_data', 'INDEX.md');

const styles = ['phpbb', 'vbulletin', 'smf', 'ipb', 'generic'];

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const locations = [
  'Seattle, WA',
  'Austin, TX',
  'Toronto, ON',
  'London, UK',
  'Berlin, DE',
  'Sydney, AU',
  'Osaka, JP',
  'Dublin, IE',
  'Chicago, IL',
  'Portland, OR',
];
const ranks = ['Newbie', 'Member', 'Senior Member', 'Veteran', 'Moderator', 'Admin'];
const signaturePhrases = [
  'Keep the old parts working.',
  'Measure twice, post once.',
  'Vintage hardware still counts.',
  'Clear signal beats guesswork.',
  'Good notes save future repairs.',
  'The manual is usually right.',
];
const names = [
  'ByteRider', 'Mira', 'KernelKid', 'Tess', 'RetroMax', 'Bree', 'SolderJoe', 'Lena', 'GammaRay',
  'Otis', 'Nico', 'Penny', 'Rex', 'Ivy', 'Walt', 'June', 'Hank', 'Sana', 'Milo', 'Faye',
  'Derek', 'Mina', 'Paul', 'Gina', 'Vera', 'Noel', 'Ari', 'Rita', 'Cole', 'Dawn',
];

const scenarios = [
  {
    forumName: 'KernelTalk Forums',
    breadcrumb: ['Forum Index', 'Linux / Unix Help', 'Server Admin'],
    title: 'Apache 1.3 segfaults after mod_perl upgrade',
    intro: 'Apache starts, then dies as soon as the Perl handler loads.',
    issue: 'mod_perl',
    pollQuestion: 'What should be checked first?',
    pollOptions: ['httpd.conf', 'Perl module path', 'Apache build flags', 'Security logs'],
  },
  {
    forumName: 'PC Arena',
    breadcrumb: ['Forum Index', 'PC Gaming', 'Hardware'],
    title: 'GeForce 4 Ti 4200 artifacts after driver swap',
    intro: 'The game runs, but the screen fills with checkerboards under load.',
    issue: 'driver package',
    pollQuestion: 'Which part is most likely?',
    pollOptions: ['Driver install', 'GPU cooling', 'PSU sag', 'RAM timings'],
  },
  {
    forumName: 'AudioBench Forums',
    breadcrumb: ['Forum Index', 'DIY Electronics', 'Amplifiers'],
    title: 'Integrated amp hum after recap',
    intro: 'The hum is louder at idle than it was before the cap swap.',
    issue: 'filter cap',
    pollQuestion: 'Where would you probe first?',
    pollOptions: ['Power supply', 'Ground loop', 'Input jack', 'Bias network'],
  },
  {
    forumName: 'KitchenBoard',
    breadcrumb: ['Forum Index', 'Cooking', 'Bread'],
    title: 'Sourdough starter smells like acetone',
    intro: 'The starter is active, but the smell turned sharp overnight.',
    issue: 'starter',
    pollQuestion: 'What is the best fix?',
    pollOptions: ['Feed more often', 'Reduce hydration', 'Discard and restart', 'Move it warmer'],
  },
  {
    forumName: 'FootyTalk',
    breadcrumb: ['Forum Index', 'Sports', 'Premier League'],
    title: 'Match thread: Arsenal 4-1 Manchester United',
    intro: 'The scoreline is brutal but the opening half was tighter.',
    issue: 'pressing',
    pollQuestion: 'What swung the match?',
    pollOptions: ['Midfield press', 'Set pieces', 'Late subs', 'Goalkeeping'],
  },
  {
    forumName: 'OtakuBoard',
    breadcrumb: ['Forum Index', 'Anime', 'Season Thread'],
    title: 'Episode 12 discussion - did the ending land?',
    intro: 'The last five minutes changed the whole tone of the show.',
    issue: 'final scene',
    pollQuestion: 'How did you feel about the ending?',
    pollOptions: ['Loved it', 'Mixed', 'Did not work', 'Need next episode'],
  },
  {
    forumName: 'StoryLounge',
    breadcrumb: ['Forum Index', 'Writing', 'Fan Fiction'],
    title: 'Chapter 8 critique - pacing feels uneven',
    intro: 'The scene transitions are good, but the middle sags a bit.',
    issue: 'pacing',
    pollQuestion: 'Which part needs the most work?',
    pollOptions: ['Opening', 'Middle', 'Dialogue', 'Ending'],
  },
  {
    forumName: 'TubeForum',
    breadcrumb: ['Forum Index', 'Audio', 'Vintage Gear'],
    title: 'Dynaco ST-70 channel imbalance after recap',
    intro: 'The left side is low even after the capacitor replacement.',
    issue: 'cathode resistor',
    pollQuestion: 'What is the likeliest fault?',
    pollOptions: ['Cold joint', 'Wrong resistor', 'Bad tube', 'Bias drift'],
  },
  {
    forumName: 'GarageChat',
    breadcrumb: ['Forum Index', 'Auto Repair', 'Ignition'],
    title: 'Starter motor clicks once on cold mornings',
    intro: 'The battery is charged but the starter barely engages.',
    issue: 'solenoid',
    pollQuestion: 'What would you test first?',
    pollOptions: ['Battery load', 'Solenoid', 'Ground strap', 'Alternator'],
  },
  {
    forumName: 'DarkroomForum',
    breadcrumb: ['Forum Index', 'Photography', 'Film Development'],
    title: 'Tri-X negatives flat after Rodinal',
    intro: 'The negatives are clean but the contrast looks weak.',
    issue: 'development time',
    pollQuestion: 'What would you change?',
    pollOptions: ['Time', 'Temperature', 'Agitation', 'Dilution'],
  },
  {
    forumName: 'Workbench',
    breadcrumb: ['Forum Index', 'Woodworking', 'Joinery'],
    title: 'Mortise and tenon joint keeps racking',
    intro: 'The joint fits, but it still shifts under side load.',
    issue: 'shoulder fit',
    pollQuestion: 'What is the first correction?',
    pollOptions: ['Tighten shoulders', 'Increase glue surface', 'Adjust tenon width', 'Add a pin'],
  },
  {
    forumName: 'ParentingToday',
    breadcrumb: ['Forum Index', 'Parenting', 'Sleep'],
    title: 'Sleep training at 6 months',
    intro: 'Bedtime is the hard part and the wake-ups are worse.',
    issue: 'bedtime routine',
    pollQuestion: 'What helped most?',
    pollOptions: ['Earlier bedtime', 'Consistent routine', 'Shorter naps', 'Less stimulation'],
  },
  {
    forumName: 'GardenersOnline',
    breadcrumb: ['Forum Index', 'Gardening', 'Vegetables'],
    title: 'Tomato blight on lower leaves',
    intro: 'The spots started after a very wet week.',
    issue: 'fungal spray',
    pollQuestion: 'What would you do first?',
    pollOptions: ['Remove leaves', 'Spray copper', 'Water less', 'Rotate crops'],
  },
  {
    forumName: 'HamWave',
    breadcrumb: ['Forum Index', 'Amateur Radio', 'Digital Modes'],
    title: 'SSTV question - what mode for HF?',
    intro: 'I can send pictures locally, but HF gets messy fast.',
    issue: 'mode',
    pollQuestion: 'Which band would you try first?',
    pollOptions: ['20m', '40m', '80m', '15m'],
  },
  {
    forumName: 'StarGazers',
    breadcrumb: ['Forum Index', 'Astronomy', 'Eyepieces'],
    title: 'Best eyepiece for Jupiter and Saturn - 8 inch Dob',
    intro: 'I want more contrast without turning the view mushy.',
    issue: 'eyepiece',
    pollQuestion: 'What focal length works best?',
    pollOptions: ['6mm', '8mm', '10mm', '12mm'],
  },
  {
    forumName: 'TypewriterBench',
    breadcrumb: ['Forum Index', 'Typewriters', 'Restoration'],
    title: 'Platen hard on a Royal Quiet De Luxe',
    intro: 'The imprint is uneven and the platen has gone glassy.',
    issue: 'platen',
    pollQuestion: 'Which fix is most realistic?',
    pollOptions: ['Recover platen', 'Use a soft roller', 'Replace feed rollers', 'Adjust striker'],
  },
  {
    forumName: 'RetroBits',
    breadcrumb: ['Forum Index', 'Vintage Computing', 'Commodore 64'],
    title: 'SID chip repair - no sound',
    intro: 'The machine boots but the audio output stays dead.',
    issue: 'SID chip',
    pollQuestion: 'What would you replace first?',
    pollOptions: ['SID', 'PSU', 'CIA chip', 'Audio jack'],
  },
  {
    forumName: 'SciFiReaders',
    breadcrumb: ['Forum Index', 'Books', 'Discussion'],
    title: 'Enders Game reread - does the ending still work?',
    intro: 'The final act feels different now than it did on the first read.',
    issue: 'ending',
    pollQuestion: 'Did the ending hold up?',
    pollOptions: ['Yes', 'Mostly', 'Not really', 'Need context'],
  },
  {
    forumName: 'CinemaClub',
    breadcrumb: ['Forum Index', 'Film', 'Discussion'],
    title: 'Matrix Reloaded - pacing vs payoff',
    intro: 'The middle stretches, but the set pieces still carry the film.',
    issue: 'middle act',
    pollQuestion: 'What matters most here?',
    pollOptions: ['Action', 'Plot', 'Characters', 'Worldbuilding'],
  },
  {
    forumName: 'SynthForum',
    breadcrumb: ['Forum Index', 'Music Gear', 'Analog Synths'],
    title: 'Juno-106 voice chip failure after recap',
    intro: 'One voice is silent and the others drift a little.',
    issue: 'voice chip',
    pollQuestion: 'Which test gives the fastest answer?',
    pollOptions: ['Swap chips', 'Measure voltages', 'Inspect solder', 'Check power rails'],
  },
];

const lockedPages = new Set([7, 14, 21, 28, 35, 42, 49, 56, 63, 70, 77, 84, 91, 98, 100]);
const pollPages = new Set([4, 13, 22, 31, 40, 49, 58, 67, 76, 85]);

const avatarPalette = [
  '#7f4f90',
  '#3f6b99',
  '#8b5a2b',
  '#4b7f61',
  '#9a4f57',
  '#5d6f8f',
  '#7d6a47',
  '#436c8f',
];

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripTags(value) {
  return String(value).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function svgDataUri(svg) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function initials(name) {
  const clean = String(name).replace(/[^A-Za-z0-9]/g, '');
  if (!clean) return 'U';
  return clean.slice(0, 2).toUpperCase();
}

function avatarSrc(name, bg) {
  const letter = initials(name);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" rx="3" fill="${bg}"/><text x="16" y="21" text-anchor="middle" font-family="Verdana,Arial,sans-serif" font-size="14" font-weight="bold" fill="#ffffff">${esc(letter)}</text></svg>`;
  return svgDataUri(svg);
}

function signatureBannerSrc(text, bg) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="88" height="31"><rect width="88" height="31" rx="3" fill="${bg}"/><text x="44" y="19" text-anchor="middle" font-family="Verdana,Arial,sans-serif" font-size="9" fill="#ffffff">${esc(text)}</text></svg>`;
  return svgDataUri(svg);
}

function smileySrc() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle cx="8" cy="8" r="7" fill="#ffe66d" stroke="#caa400" stroke-width="1"/><circle cx="5.5" cy="6" r="1" fill="#553300"/><circle cx="10.5" cy="6" r="1" fill="#553300"/><path d="M4.8 9.2c1 1.3 2.1 2 3.2 2s2.2-.7 3.2-2" fill="none" stroke="#553300" stroke-width="1" stroke-linecap="round"/></svg>`;
  return svgDataUri(svg);
}

const smileyImg = `<img src="${smileySrc()}" width="16" height="16" alt=":)" />`;
const lockImg = svgDataUri(
  `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect x="4" y="7" width="8" height="7" rx="1.5" fill="#c0c0c0" stroke="#666666" stroke-width="1"/><path d="M5 7V5.8C5 4.1 6.3 3 8 3s3 1.1 3 2.8V7" fill="none" stroke="#666666" stroke-width="1"/><circle cx="8" cy="10.5" r="1" fill="#666666"/></svg>`,
);

const styleThemes = {
  phpbb: {
    name: 'phpbb',
    bodyBg: '#E9EEF5',
    pageText: '#333333',
    link: '#003399',
    visited: '#660066',
    border: '#99A7B8',
    header: '#336699',
    headerText: '#FFFFFF',
    rowA: '#F7F9FC',
    rowB: '#EDF4FF',
    userA: '#DDEEFF',
    userB: '#D6E4F5',
    accent: '#CCDDEE',
    outerClass: 'forumline',
    userClass: 'posterinfo',
    bodyClass: 'postbody',
    titleClass: 'posttitle',
    footerClass: 'postfoot',
    titleTag: 'h2',
  },
  vbulletin: {
    name: 'vbulletin',
    bodyBg: '#F4F4F4',
    pageText: '#2d2d2d',
    link: '#1F4E79',
    visited: '#7a1f4d',
    border: '#7F8FA6',
    header: '#5F7193',
    headerText: '#FFFFFF',
    rowA: '#FFFFFF',
    rowB: '#F1F4F9',
    userA: '#E4ECF8',
    userB: '#D8E2F0',
    accent: '#DCE5F0',
    outerClass: 'postbit',
    userClass: 'userinfo',
    bodyClass: 'content',
    titleClass: 'postdetails',
    footerClass: 'postdetails',
    titleTag: 'h1',
  },
  smf: {
    name: 'smf',
    bodyBg: '#F6F7F5',
    pageText: '#2f2f2f',
    link: '#3A5A7A',
    visited: '#6d4961',
    border: '#B1B9A9',
    header: '#6E846A',
    headerText: '#FFFFFF',
    rowA: '#FFFFFF',
    rowB: '#F3F7F2',
    userA: '#E4EEE1',
    userB: '#D9E5D6',
    accent: '#DCE8D9',
    outerClass: 'windowbg',
    userClass: 'poster',
    bodyClass: 'postarea',
    titleClass: 'titlebg',
    footerClass: 'post_wrapper',
    titleTag: 'h2',
  },
  ipb: {
    name: 'ipb',
    bodyBg: '#F7F2EE',
    pageText: '#322821',
    link: '#7A3C1D',
    visited: '#5c3151',
    border: '#B3987F',
    header: '#A05E3B',
    headerText: '#FFFFFF',
    rowA: '#FFF9F4',
    rowB: '#F7EDE2',
    userA: '#F0D8C2',
    userB: '#E8CBB1',
    accent: '#EDD9C8',
    outerClass: 'postbitlegacy',
    userClass: 'userinfo',
    bodyClass: 'postcontent',
    titleClass: 'posthead',
    footerClass: 'postdetails',
    titleTag: 'h1',
  },
  generic: {
    name: 'generic',
    bodyBg: '#F6EFE7',
    pageText: '#342820',
    link: '#7A3E17',
    visited: '#66335d',
    border: '#A99074',
    header: '#7B5A3F',
    headerText: '#FFF8EF',
    rowA: '#FFF8F1',
    rowB: '#F3E7D8',
    userA: '#ECD8C2',
    userB: '#E2C7A8',
    accent: '#EAD8C5',
    outerClass: 'forum-post',
    userClass: 'user-info',
    bodyClass: 'post-content',
    titleClass: 'post-meta',
    footerClass: 'post-meta',
    titleTag: 'h2',
  },
};

function scenarioFor(num) {
  return scenarios[Math.floor((num - 1) / 5)];
}

function styleFor(num) {
  return styleThemes[styles[(num - 1) % styles.length]];
}

function pageSpec(num) {
  const scenario = scenarioFor(num);
  const style = styleFor(num);
  const stacked =
    (style.name === 'smf' && num % 4 === 0) ||
    (style.name === 'ipb' && num % 5 === 0) ||
    (style.name === 'generic' && num % 2 === 0);
  const postCount = 3 + ((num * 7) % 13);
  const pageTotal = 2 + ((num + Math.floor((num - 1) / 5)) % 4);
  const currentPage = 1 + ((num + Math.floor((num - 1) / 3)) % pageTotal);
  return {
    num,
    scenario,
    style,
    stacked,
    postCount,
    pageTotal,
    currentPage,
    compose: num % 2 === 0,
    locked: lockedPages.has(num),
    poll: pollPages.has(num),
    paginationTop: num % 4 === 0 || num % 5 === 0,
    paginationBottom: num % 3 === 0 || num % 8 === 0,
    showModControls: num % 3 !== 0,
    showIp: num % 8 === 0 || num % 11 === 0,
    useGuest: num % 6 === 0,
    lastEdited: num % 9 === 0,
  };
}

function monthFor(num, offset) {
  return months[(num + offset) % months.length];
}

function yearFor(num, offset) {
  return 2001 + ((num + offset) % 7);
}

function makeJoinDate(num, index) {
  return `Joined: ${monthFor(num, index)} ${yearFor(num, index)}`;
}

function makeMemberPosts(num, index) {
  return 120 + ((num * 73 + index * 41) % 1800);
}

function makeLocation(num, index) {
  return locations[(num + index * 2) % locations.length];
}

function makeRank(num, index) {
  return ranks[(num + index) % ranks.length];
}

function makeUserName(num, index) {
  return names[(num * 3 + index * 5) % names.length];
}

function makeGuestName(num) {
  return num % 2 === 0 ? 'Guest' : 'Anonymous';
}

function makeBodyParagraphs(spec, index, previousPost) {
  const issue = spec.scenario.issue;
  const title = spec.scenario.title;

  if (index === 0) {
    return [
      `${spec.scenario.intro} I checked the <strong>${esc(issue)}</strong> first and the symptom stayed with the same side.`,
      `This started right after the last change, so I am trying to narrow it down to one part of the chain.`,
    ];
  }

  const templates = [
    `Check the <strong>${esc(issue)}</strong> and the joints around it. That is where I would start.`,
    `The same symptom staying with the board points back to the <strong>${esc(issue)}</strong> rather than a general failure.`,
    `I would reflow that area and meter it before changing anything else.`,
    `If the fault follows the <strong>${esc(issue)}</strong>, the problem is probably local.`,
    `The manual usually has one detail that makes this obvious once you look again.`,
    `That is still consistent with a cold joint or an out-of-range part near the <strong>${esc(issue)}</strong>.`,
    `A side-by-side measurement would tell you more than another quick visual check.`,
  ];

  const first = templates[(spec.num + index) % templates.length];
  const second = index % 2 === 0
    ? `I would compare the readings against the other side and see whether the <strong>${esc(issue)}</strong> is the only thing out of line.`
    : `The next pass should tell you whether the <strong>${esc(issue)}</strong> is actually the culprit.`;

  const lines = [first];
  if (index % 2 === 0 || index === spec.postCount - 1) {
    lines.push(second);
  } else if (previousPost) {
    lines.push(`I agree with ${previousPost.author}; that lines up with what the meter is showing on my end.`);
  }
  return lines;
}

function makeQuoteHtml(style, quotedPost) {
  if (!quotedPost) return '';
  const excerpt = esc(quotedPost.excerpt || quotedPost.bodyText.slice(0, 140));
  const author = esc(quotedPost.author);
  switch (style.name) {
    case 'phpbb':
      return [
        `<table width="95%" border="0" cellpadding="3" cellspacing="1" bgcolor="#b5c4d4" class="quote">`,
        `<tr><td bgcolor="#f6f8fb"><font face="Verdana" size="1" color="#666666"><b>Quote from ${author}</b></font><br><font face="Verdana" size="2" color="#333333">${excerpt}</font></td></tr>`,
        `</table>`,
      ].join('');
    case 'vbulletin':
      return `<blockquote class="vbquote"><div class="quotemeta"><strong>Originally posted by ${author}</strong></div><div class="quotetext">${excerpt}</div></blockquote>`;
    case 'smf':
      return [
        `<table width="95%" border="0" cellpadding="4" cellspacing="0" bgcolor="#d9e2d1" class="quotetable">`,
        `<tr><td bgcolor="#eef3ea"><font face="Verdana" size="1" color="#5b6b56"><b>Quote from ${author}</b></font></td></tr>`,
        `<tr><td bgcolor="#ffffff"><font face="Verdana" size="2" color="#333333">${excerpt}</font></td></tr>`,
        `</table>`,
      ].join('');
    case 'ipb':
      return `<blockquote class="ipbquote"><span class="quotetitle"><strong>Quote from ${author}</strong></span><br><span class="quotetext">${excerpt}</span></blockquote>`;
    default:
      return [
        `<table width="95%" border="0" cellpadding="4" cellspacing="0" bgcolor="#dbc8b5" class="quotetable">`,
        `<tr><td bgcolor="#f7f1eb"><font face="Verdana" size="1" color="#6b5443"><b>Quoted from ${author}</b></font><br><font face="Verdana" size="2" color="#333333">${excerpt}</font></td></tr>`,
        `</table>`,
      ].join('');
  }
}

function makeSignatureHtml(spec, index) {
  const phrase = signaturePhrases[(spec.num + index) % signaturePhrases.length];
  if (index % 5 === 0) {
    const colors = ['#5d6f8f', '#8b5a2b', '#4b7f61', '#7f4f90', '#9a4f57'];
    const bg = colors[(spec.num + index) % colors.length];
    const src = signatureBannerSrc(phrase, bg);
    return `<img src="${src}" width="88" height="31" alt="${esc(phrase)}" />`;
  }
  if (index % 2 === 0) {
    return `<font face="Verdana" size="1" color="#666666">-- ${esc(phrase)}</font>`;
  }
  return '';
}

function makeBodyHtml(spec, post, index) {
  const quoted = post.quote ? makeQuoteHtml(spec.style, post.quote) : '';
  const paragraphs = post.paragraphs.join('<br><br>');
  let html = '';
  if (quoted) {
    html += quoted + '<br><br>';
  }
  html += `<font face="Verdana" size="2" color="#333333">${paragraphs}</font>`;
  if ((spec.num + index) % 4 === 0) {
    html += ` ${smileyImg}`;
  }
  if (post.signatureHtml) {
    html += `<br><br><hr size="1" noshade>${post.signatureHtml}`;
  }
  if (spec.showModControls) {
    html += `<br><br><font face="Verdana" size="1" color="#666666">${post.modControls}</font>`;
  }
  if (post.ipHtml) {
    html += `<br><br><font face="Verdana" size="1" color="#666666">${post.ipHtml}</font>`;
  }
  if (post.lastEditedHtml) {
    html += `<br><br>${post.lastEditedHtml}`;
  }
  return html;
}

function buildPosts(spec) {
  const posts = [];
  for (let i = 0; i < spec.postCount; i += 1) {
    const isGuest = spec.useGuest && i === spec.postCount - 1;
    const author = isGuest ? makeGuestName(spec.num) : makeUserName(spec.num, i);
    const avatarBg = avatarPalette[(spec.num + i) % avatarPalette.length];
    const avatarType = isGuest ? 'none' : (i % 3 === 0 ? 'image' : i % 3 === 1 ? 'color' : 'none');
    const avatarHtml =
      avatarType === 'image'
        ? `<img src="${avatarSrc(author, avatarBg)}" width="32" height="32" alt="${esc(author)}" border="0" />`
        : avatarType === 'color'
          ? `<table border="0" cellpadding="0" cellspacing="0"><tr><td width="32" height="32" bgcolor="${avatarBg}" align="center" valign="middle"><font face="Verdana" size="1" color="#FFFFFF"><b>${esc(initials(author))}</b></font></td></tr></table>`
          : '';
    const joinDate = isGuest ? 'Guest account' : makeJoinDate(spec.num, i);
    const postCount = isGuest ? 'Not registered' : `Posts: ${makeMemberPosts(spec.num, i)}`;
    const rank = isGuest ? 'Guest' : makeRank(spec.num, i);
    const location = isGuest ? 'Guest' : makeLocation(spec.num, i);
    const online = !isGuest && (spec.num + i) % 2 === 0;
    const onlineHtml = `<span style="color:${online ? '#2a7c2a' : '#777777'}">●</span> ${online ? 'Online' : 'Offline'}`;
    const dateText = `${monthFor(spec.num, i)} ${1 + ((spec.num + i * 3) % 27)}, ${yearFor(spec.num, i)}`;
    const dateHtml = spec.num % 4 === 0 ? `<abbr title="${esc(dateText)}">${esc(dateText)}</abbr>` : esc(dateText);
    const paragraphs = makeBodyParagraphs(spec, i, posts[i - 1]);
    const quote = spec.num % 2 === 0 && i > 0 && (i === 1 || (i % 4 === 0));
    const quotePost = quote ? posts[i - 1] : null;
    const signatureHtml = isGuest ? '' : makeSignatureHtml(spec, i);
    const controls = spec.showModControls
      ? ['[Edit]', '[Delete]', '[Quote]'].join(' ')
      : '';
    const ipHtml = spec.showIp && (i === 0 || i === spec.postCount - 1)
      ? `IP: 192.168.${(spec.num * 7 + i) % 255}.${(spec.num * 11 + i * 3) % 255}`
      : '';
    const lastEditedHtml = spec.lastEdited && i === spec.postCount - 1
      ? `<font face="Verdana" size="1" color="#666666">Last edited by ${esc(author)} on <abbr title="${esc(dateText)}">${esc(dateText)}</abbr></font>`
      : '';
    posts.push({
      author,
      isGuest,
      avatarHtml,
      avatarBg,
      joinDate,
      postCount,
      rank,
      location,
      onlineHtml,
      dateHtml,
      dateText,
      paragraphs,
      quote: quotePost,
      signatureHtml,
      modControls: controls,
      ipHtml,
      lastEditedHtml,
      index: i,
      excerpt: stripTags(paragraphs[0]),
      bodyText: stripTags(paragraphs.join(' ')),
    });
  }
  return posts;
}

function renderPoll(spec, theme) {
  if (!spec.poll) return '';
  const options = spec.scenario.pollOptions;
  const rows = options
    .map((option, index) => {
      const width = 20 + ((spec.num * 11 + index * 17) % 61);
      return [
        `<tr>`,
        `<td width="45%" bgcolor="${theme.rowA}"><font face="Verdana" size="2">${esc(option)}</font></td>`,
        `<td width="45%" bgcolor="${theme.rowB}">`,
        `<table width="100%" cellspacing="0" cellpadding="0" border="0"><tr>`,
        `<td width="${width}%" bgcolor="${theme.header}" height="10">&nbsp;</td>`,
        `<td bgcolor="#dfe5d8" height="10">&nbsp;</td>`,
        `</tr></table>`,
        `</td>`,
        `<td width="10%" align="right" bgcolor="${theme.rowA}"><font face="Verdana" size="1">${width}%</font></td>`,
        `</tr>`,
      ].join('');
    })
    .join('\n');

  return [
    `<table width="780" border="0" cellpadding="4" cellspacing="1" align="center" bgcolor="${theme.border}" class="poll">`,
    `<tr><td colspan="3" bgcolor="${theme.header}"><font face="Arial" size="2" color="${theme.headerText}"><b>Poll: ${esc(spec.scenario.pollQuestion)}</b></font></td></tr>`,
    rows,
    `<tr><td colspan="3" bgcolor="${theme.accent}"><font face="Verdana" size="1" color="#666666">Votes: ${(spec.num * 13) % 250 + 18}</font></td></tr>`,
    `</table>`,
  ].join('\n');
}

function renderPagination(spec, theme, position) {
  if (!(position === 'top' ? spec.paginationTop : spec.paginationBottom)) return '';
  const prev = spec.currentPage > 1 ? '&laquo; Prev' : '';
  const next = spec.currentPage < spec.pageTotal ? 'Next &raquo;' : '';
  return [
    `<table width="780" border="0" cellpadding="4" cellspacing="0" align="center" bgcolor="${theme.accent}">`,
    `<tr><td align="right"><font face="Verdana" size="1" color="#666666">${prev ? `${prev} | ` : ''}Page ${spec.currentPage} of ${spec.pageTotal}${next ? ` | ${next}` : ''}</font></td></tr>`,
    `</table>`,
  ].join('\n');
}

function renderLockedBanner(spec, theme) {
  if (!spec.locked) return '';
  return [
    `<table width="780" border="0" cellpadding="6" cellspacing="0" align="center" bgcolor="${theme.accent}">`,
    `<tr><td><img src="${lockImg}" width="16" height="16" alt="locked" /> <font face="Verdana" size="2" color="#666666"><b>This thread has been closed by a moderator.</b> No new replies can be posted.</font></td></tr>`,
    `</table>`,
  ].join('\n');
}

function renderComposeBox(spec, theme, label) {
  if (!spec.compose || spec.locked) return '';
  const toolbar = ['B', 'i', 'u', 'Quote', 'Code']
    .map((t) => `<input type="button" value="${t}" />`)
    .join(' ');
  const nameField = spec.num % 4 === 0 ? `<tr><td valign="top"><font face="Verdana" size="2">Name:</font></td><td><input type="text" name="author" size="30" /></td></tr>` : '';
  const emailField = spec.num % 6 === 0 ? `<tr><td valign="top"><font face="Verdana" size="2">Email:</font></td><td><input type="text" name="email" size="30" /></td></tr>` : '';
  const textareaRows = spec.style.name === 'generic' ? 6 : 5;
  return [
    `<table width="780" border="0" cellpadding="6" cellspacing="0" align="center" bgcolor="${theme.accent}" class="replybox">`,
    `<tr><td colspan="2" bgcolor="${theme.header}"><font face="Arial" size="2" color="${theme.headerText}"><b>${esc(label)}</b></font></td></tr>`,
    `<tr><td colspan="2"><font face="Verdana" size="1" color="#666666">${toolbar}</font></td></tr>`,
    nameField,
    emailField,
    `<tr><td valign="top"><font face="Verdana" size="2">Message:</font></td><td><textarea name="message" rows="${textareaRows}" cols="60"></textarea></td></tr>`,
    `<tr><td></td><td><input type="submit" value="Post Reply" /></td></tr>`,
    `</table>`,
  ].filter(Boolean).join('\n');
}

function renderThreadShellStart(spec, theme) {
  return [
    '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN">',
    '<html>',
    '<head>',
    `<title>${esc(spec.scenario.forumName)} - ${esc(spec.scenario.title)}</title>`,
    '<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1">',
    `<style type="text/css">
body { background: ${theme.bodyBg}; color: ${theme.pageText}; margin: 0; font-family: Verdana, Arial, sans-serif; }
table { color: ${theme.pageText}; }
a:link { color: ${theme.link}; }
a:visited { color: ${theme.visited}; }
.forum-shell { width: 780px; margin: 0 auto; }
.quote .quotemeta, .quote .quoteheader, .quotetable { font-family: Verdana, Arial, sans-serif; }
.${theme.outerClass} { border: 1px solid ${theme.border}; }
.${theme.userClass} { vertical-align: top; }
.${theme.bodyClass} { vertical-align: top; }
.${theme.titleClass} { font-family: Arial, Verdana, sans-serif; }
.postfoot { font-size: 11px; color: #666666; }
.sigsep { border-top: 1px solid #c9c9c9; margin-top: 8px; padding-top: 4px; }
.locked-banner { font-size: 12px; }
</style>`,
    '</head>',
    `<body bgcolor="${theme.bodyBg}" text="${theme.pageText}" link="${theme.link}" vlink="${theme.visited}">`,
  ].join('\n');
}

function renderThreadShellEnd(spec, theme) {
  return [
    `<table width="780" border="0" cellpadding="4" cellspacing="0" align="center"><tr><td align="center"><font face="Verdana" size="1" color="#666666">&copy; 2003 ${esc(spec.scenario.forumName)}. All rights reserved.</font></td></tr></table>`,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

function renderBreadcrumb(spec, theme, titlePrefix) {
  const breadcrumb = spec.scenario.breadcrumb.map(esc).join(' &gt; ');
  return [
    `<table width="780" border="0" cellpadding="4" cellspacing="0" align="center" bgcolor="${theme.accent}">`,
    `<tr><td><font face="Verdana" size="2">${breadcrumb} &gt; ${esc(titlePrefix)}</font></td></tr>`,
    `</table>`,
  ].join('\n');
}

function renderTitleBlock(spec, theme, useTag, prefix) {
  const titleText = prefix ? `${prefix} ${spec.scenario.title}` : spec.scenario.title;
  return [
    `<table width="780" border="0" cellpadding="8" cellspacing="0" align="center" bgcolor="${theme.header}">`,
    `<tr><td><${useTag} style="margin:0; color:${theme.headerText}; font-family: Arial, Verdana, sans-serif;"><b>${esc(titleText)}</b></${useTag}></td></tr>`,
    `</table>`,
  ].join('\n');
}

function renderTopicIntro(spec, theme) {
  return [
    `<table width="780" border="0" cellpadding="8" cellspacing="0" align="center" bgcolor="${theme.rowA}">`,
    `<tr><td><font face="Verdana" size="2">${esc(spec.scenario.intro)}</font></td></tr>`,
    `</table>`,
  ].join('\n');
}

function renderPostUserInfo(spec, post, theme, styleName, stacked) {
  const avatar = post.avatarHtml ? `<div>${post.avatarHtml}</div>` : '';
  const metaBits = [];
  if (post.isGuest) {
    metaBits.push('<font face="Verdana" size="1" color="#666666">Guest</font>');
    metaBits.push('<font face="Verdana" size="1" color="#666666">Not registered</font>');
  } else {
    metaBits.push(`<span style="color:#4a4a4a">${esc(post.rank)}</span>`);
    metaBits.push(`<font face="Verdana" size="1" color="#666666">${esc(post.joinDate)}</font>`);
    metaBits.push(`<font face="Verdana" size="1" color="#666666">${esc(post.postCount)}</font>`);
    metaBits.push(`<font face="Verdana" size="1" color="#666666">${esc(post.location)}</font>`);
  }
  metaBits.push(`<font face="Verdana" size="1" color="#666666">${post.onlineHtml}</font>`);
  const userName = post.isGuest
    ? `<b>${esc(post.author)}</b>`
    : `<span class="username" style="color:${theme.link}"><b>${esc(post.author)}</b></span>`;
  const panel = [
    avatar ? `${avatar}<br>` : '',
    `<font face="Verdana" size="2"><b>${userName}</b></font><br>`,
    metaBits.join('<br>'),
  ].join('');
  if (stacked) {
    return [
      `<table width="100%" border="0" cellpadding="4" cellspacing="0" bgcolor="${theme.userA}">`,
      `<tr><td>${panel}</td></tr>`,
      `</table>`,
    ].join('');
  }
  return [
    `<table width="100%" border="0" cellpadding="0" cellspacing="0">`,
    `<tr><td bgcolor="${theme.userA}" style="padding:8px;">${panel}</td></tr>`,
    `</table>`,
  ].join('');
}

function renderPostBody(spec, post, theme, styleName) {
  const title = spec.scenario.title;
  const bodyHtml = makeBodyHtml(spec, post, post.index || 0);
  const dateBlock = spec.num % 4 === 0
    ? `<font face="Verdana" size="1" color="#666666"><abbr title="${esc(post.dateText)}">${esc(post.dateText)}</abbr></font>`
    : `<font face="Verdana" size="1" color="#666666">${esc(post.dateText)}</font>`;
  return [
    `<div class="${theme.titleClass}"><font face="Verdana" size="2"><b>${esc(title)}</b></font><br>${dateBlock}</div>`,
    bodyHtml,
  ].join('');
}

function renderPostCell(spec, post, theme, index) {
  const rowBg = index % 2 === 0 ? theme.rowA : theme.rowB;
  const userBg = index % 2 === 0 ? theme.userA : theme.userB;
  const stacked = spec.stacked;
  const userInfo = renderPostUserInfo(spec, post, theme, styleFor(spec.num).name, stacked);
  const bodyDate = `<font face="Verdana" size="1" color="#666666">${esc(post.dateText)}</font>`;
  const bodyParts = [];
  if (post.quote) {
    bodyParts.push(makeQuoteHtml(theme, post.quote));
  }
  bodyParts.push(`<font face="Verdana" size="2" color="#333333">${post.paragraphs.join('<br><br>')}</font>`);
  if ((spec.num + index) % 4 === 0) {
    bodyParts.push(`<br>${smileyImg}`);
  }
  if (post.signatureHtml) {
    bodyParts.push(`<div class="sigsep"><font face="Verdana" size="1" color="#666666">${post.signatureHtml}</font></div>`);
  }
  if (spec.showModControls) {
    bodyParts.push(`<div class="postfoot">${post.modControls}</div>`);
  }
  if (post.ipHtml) {
    bodyParts.push(`<div class="postfoot">${esc(post.ipHtml)}</div>`);
  }
  if (post.lastEditedHtml) {
    bodyParts.push(`<div class="postfoot">${post.lastEditedHtml}</div>`);
  }
  if (stacked) {
    return [
      `<table width="100%" border="0" cellpadding="0" cellspacing="1" bgcolor="${theme.border}" class="${theme.outerClass}">`,
      `<tr><td bgcolor="${userBg}" style="padding:8px;">${userInfo}</td></tr>`,
      `<tr><td bgcolor="${rowBg}" style="padding:8px;">${bodyDate}<br><br>${bodyParts.join('<br>')}</td></tr>`,
      `</table>`,
    ].join('\n');
  }
  return [
    `<table width="100%" border="0" cellpadding="0" cellspacing="1" bgcolor="${theme.border}" class="${theme.outerClass}">`,
    `<tr>`,
    `<td width="165" bgcolor="${userBg}" class="${theme.userClass}" style="padding:8px;">${userInfo}</td>`,
    `<td bgcolor="${rowBg}" class="${theme.bodyClass}" style="padding:8px;">${bodyDate}<br><br>${bodyParts.join('<br>')}</td>`,
    `</tr>`,
    `</table>`,
  ].join('\n');
}

function renderLockNotice(spec, theme) {
  if (!spec.locked) return '';
  return [
    `<table width="780" border="0" cellpadding="6" cellspacing="0" align="center" bgcolor="${theme.accent}">`,
    `<tr><td><img src="${lockImg}" width="16" height="16" alt="locked" /> <font face="Verdana" size="2" color="#666666"><b>This thread has been closed by a moderator.</b> No new replies can be posted.</font></td></tr>`,
    `</table>`,
  ].join('\n');
}

function renderPollSection(spec, theme) {
  if (!spec.poll) return '';
  const options = spec.scenario.pollOptions;
  const rows = options
    .map((option, index) => {
      const width = 20 + ((spec.num * 11 + index * 17) % 61);
      return [
        `<tr>`,
        `<td width="42%" bgcolor="${theme.rowA}"><font face="Verdana" size="2">${esc(option)}</font></td>`,
        `<td width="48%" bgcolor="${theme.rowB}">`,
        `<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>`,
        `<td width="${width}%" height="10" bgcolor="${theme.header}">&nbsp;</td>`,
        `<td height="10" bgcolor="#d9e2d4">&nbsp;</td>`,
        `</tr></table>`,
        `</td>`,
        `<td width="10%" align="right" bgcolor="${theme.rowA}"><font face="Verdana" size="1">${width}%</font></td>`,
        `</tr>`,
      ].join('');
    })
    .join('\n');
  return [
    `<table width="780" border="0" cellpadding="4" cellspacing="1" align="center" bgcolor="${theme.border}" class="poll">`,
    `<tr><td colspan="3" bgcolor="${theme.header}"><font face="Arial" size="2" color="${theme.headerText}"><b>Poll: ${esc(spec.scenario.pollQuestion)}</b></font></td></tr>`,
    rows,
    `<tr><td colspan="3" bgcolor="${theme.accent}"><font face="Verdana" size="1" color="#666666">Votes: ${(spec.num * 13) % 250 + 18}</font></td></tr>`,
    `</table>`,
  ].join('\n');
}

function renderPaginationSection(spec, theme, position) {
  if (!(position === 'top' ? spec.paginationTop : spec.paginationBottom)) return '';
  const prev = spec.currentPage > 1 ? '&laquo; Prev' : '';
  const next = spec.currentPage < spec.pageTotal ? 'Next &raquo;' : '';
  return [
    `<table width="780" border="0" cellpadding="4" cellspacing="0" align="center" bgcolor="${theme.accent}">`,
    `<tr><td align="right"><font face="Verdana" size="1" color="#666666">${prev ? `${prev} | ` : ''}Page ${spec.currentPage} of ${spec.pageTotal}${next ? ` | ${next}` : ''}</font></td></tr>`,
    `</table>`,
  ].join('\n');
}

function renderComposer(spec, theme, label) {
  if (!spec.compose || spec.locked) return '';
  const toolbar = ['B', 'i', 'u', 'Quote', 'Code']
    .map((button) => `<input type="button" value="${button}" />`)
    .join(' ');
  const nameField = spec.num % 4 === 0
    ? `<tr><td valign="top"><font face="Verdana" size="2">Name:</font></td><td><input type="text" name="author" size="30" /></td></tr>`
    : '';
  const emailField = spec.num % 6 === 0
    ? `<tr><td valign="top"><font face="Verdana" size="2">Email:</font></td><td><input type="text" name="email" size="30" /></td></tr>`
    : '';
  const textRows = spec.stacked ? 6 : 5;
  return [
    `<table width="780" border="0" cellpadding="6" cellspacing="0" align="center" bgcolor="${theme.accent}" class="replybox">`,
    `<tr><td colspan="2" bgcolor="${theme.header}"><font face="Arial" size="2" color="${theme.headerText}"><b>${esc(label)}</b></font></td></tr>`,
    `<tr><td colspan="2"><font face="Verdana" size="1" color="#666666">${toolbar}</font></td></tr>`,
    nameField,
    emailField,
    `<tr><td valign="top"><font face="Verdana" size="2">Message:</font></td><td><textarea name="message" rows="${textRows}" cols="60"></textarea></td></tr>`,
    `<tr><td></td><td><input type="submit" value="Post Reply" /></td></tr>`,
    `</table>`,
  ].filter(Boolean).join('\n');
}

function renderStylePage(spec, theme, posts) {
  const titlePrefix =
    theme.name === 'phpbb'
      ? `Topic: ${spec.scenario.title}`
      : theme.name === 'vbulletin'
        ? spec.scenario.title
        : theme.name === 'smf'
          ? spec.scenario.title
          : theme.name === 'ipb'
            ? `Topic: ${spec.scenario.title}`
            : spec.scenario.title;
  const titleTag = theme.titleTag;
  const titleBlock = renderTitleBlock(spec, theme, titleTag, theme.name === 'phpbb' || theme.name === 'ipb' ? 'Topic:' : '');
  const breadcrumb = renderBreadcrumb(spec, theme, spec.scenario.title);
  const intro = renderTopicIntro(spec, theme);
  const poll = renderPollSection(spec, theme);
  const locked = renderLockNotice(spec, theme);
  const paginationTop = renderPaginationSection(spec, theme, 'top');
  const paginationBottom = renderPaginationSection(spec, theme, 'bottom');
  const composerLabel =
    theme.name === 'phpbb'
      ? 'Post a Reply'
      : theme.name === 'vbulletin'
        ? 'Quick Reply'
        : theme.name === 'smf'
          ? 'Fast Reply'
          : theme.name === 'ipb'
            ? 'Add a Reply'
            : 'Reply';
  const composer = renderComposer(spec, theme, composerLabel);

  let postsHtml = '';
  if (theme.name === 'vbulletin') {
    postsHtml = posts
      .map((post, index) => [
        `<table width="780" border="0" cellpadding="0" cellspacing="1" align="center" bgcolor="${theme.border}" class="${theme.outerClass}">`,
        `<tr><td colspan="2" bgcolor="${index % 2 === 0 ? theme.header : '#7488aa'}"><font face="Arial" size="2" color="${theme.headerText}"><b>${esc(post.author)}</b> <span class="postdetails">${esc(post.dateText)}</span>${spec.showModControls ? `<span style="float:right;">[Edit] [Delete] [Quote]</span>` : ''}</font></td></tr>`,
        spec.stacked
          ? `<tr><td colspan="2" bgcolor="${index % 2 === 0 ? theme.rowA : theme.rowB}" style="padding:8px;"><table width="100%" border="0" cellpadding="0" cellspacing="0"><tr><td>${renderPostUserInfo(spec, post, theme, theme.name, true)}</td></tr><tr><td style="padding-top:8px;">${renderPostBody(spec, post, theme, theme.name)}</td></tr></table></td></tr>`
          : `<tr><td width="165" bgcolor="${index % 2 === 0 ? theme.userA : theme.userB}" class="${theme.userClass}" style="padding:8px;">${renderPostUserInfo(spec, post, theme, theme.name, false)}</td><td bgcolor="${index % 2 === 0 ? theme.rowA : theme.rowB}" class="${theme.bodyClass}" style="padding:8px;">${renderPostBody(spec, post, theme, theme.name)}</td></tr>`,
        `</table>`,
      ].join('\n'))
      .join('\n<br>\n');
  } else if (theme.name === 'smf') {
    postsHtml = [
      `<table width="780" border="0" cellpadding="0" cellspacing="1" align="center" bgcolor="${theme.border}" class="bordercolor">`,
      posts
        .map((post, index) => [
          `<tr class="${index % 2 === 0 ? 'windowbg' : 'windowbg2'}">`,
          spec.stacked
            ? `<td colspan="2" style="padding:8px;"><table width="100%" border="0" cellpadding="0" cellspacing="0"><tr><td>${renderPostUserInfo(spec, post, theme, theme.name, true)}</td></tr><tr><td style="padding-top:8px;">${renderPostBody(spec, post, theme, theme.name)}</td></tr></table></td>`
            : `<td width="165" valign="top" bgcolor="${index % 2 === 0 ? theme.userA : theme.userB}" class="${theme.userClass}" style="padding:8px;">${renderPostUserInfo(spec, post, theme, theme.name, false)}</td><td valign="top" bgcolor="${index % 2 === 0 ? theme.rowA : theme.rowB}" class="${theme.bodyClass}" style="padding:8px;">${renderPostBody(spec, post, theme, theme.name)}</td>`,
          `</tr>`,
        ].join('\n'))
        .join('\n'),
      `</table>`,
    ].join('\n');
  } else if (theme.name === 'ipb') {
    postsHtml = posts
      .map((post, index) => [
        `<table width="780" border="0" cellpadding="0" cellspacing="1" align="center" bgcolor="${theme.border}" class="${theme.outerClass}">`,
        `<tr><td colspan="2" bgcolor="${index % 2 === 0 ? theme.header : '#c27c55'}" class="${theme.titleClass}" style="padding:6px;"><font face="Arial" size="2" color="${theme.headerText}"><b>${esc(post.author)}</b> - ${esc(post.dateText)}${spec.showModControls ? ` <span style="float:right;">[Edit] [Delete] [Quote]</span>` : ''}</font></td></tr>`,
        spec.stacked
          ? `<tr><td colspan="2" bgcolor="${index % 2 === 0 ? theme.rowA : theme.rowB}" style="padding:8px;"><table width="100%" border="0" cellpadding="0" cellspacing="0"><tr><td>${renderPostUserInfo(spec, post, theme, theme.name, true)}</td></tr><tr><td style="padding-top:8px;">${renderPostBody(spec, post, theme, theme.name)}</td></tr></table></td></tr>`
          : `<tr><td width="165" valign="top" bgcolor="${index % 2 === 0 ? theme.userA : theme.userB}" class="${theme.userClass}" style="padding:8px;">${renderPostUserInfo(spec, post, theme, theme.name, false)}</td><td valign="top" bgcolor="${index % 2 === 0 ? theme.rowA : theme.rowB}" class="${theme.bodyClass}" style="padding:8px;">${renderPostBody(spec, post, theme, theme.name)}</td></tr>`,
        `</table>`,
      ].join('\n'))
      .join('\n<br>\n');
  } else if (theme.name === 'generic') {
    postsHtml = posts
      .map((post, index) => [
        `<table width="780" border="0" cellpadding="0" cellspacing="1" align="center" bgcolor="${theme.border}" class="${theme.outerClass}">`,
        spec.stacked
          ? [
              `<tr><td bgcolor="${index % 2 === 0 ? theme.header : '#8c674b'}" style="padding:6px;"><font face="Arial" size="2" color="${theme.headerText}"><b>${esc(post.author)}</b> <span style="float:right;">${esc(post.dateText)}</span></font></td></tr>`,
              `<tr><td bgcolor="${index % 2 === 0 ? theme.rowA : theme.rowB}" class="${theme.bodyClass}" style="padding:8px;"><table width="100%" border="0" cellpadding="0" cellspacing="0"><tr><td>${renderPostUserInfo(spec, post, theme, theme.name, true)}</td></tr><tr><td style="padding-top:8px;">${renderPostBody(spec, post, theme, theme.name)}</td></tr></table></td></tr>`,
            ].join('\n')
          : `<tr><td width="165" bgcolor="${index % 2 === 0 ? theme.userA : theme.userB}" class="${theme.userClass}" style="padding:8px;">${renderPostUserInfo(spec, post, theme, theme.name, false)}</td><td bgcolor="${index % 2 === 0 ? theme.rowA : theme.rowB}" class="${theme.bodyClass}" style="padding:8px;">${renderPostBody(spec, post, theme, theme.name)}</td></tr>`,
        `</table>`,
      ].join('\n'))
      .join('\n<br>\n');
  } else {
    postsHtml = posts
      .map((post, index) => [
        `<table width="780" border="0" cellpadding="0" cellspacing="1" align="center" bgcolor="${theme.border}" class="${theme.outerClass}">`,
        spec.stacked
          ? `<tr><td bgcolor="${index % 2 === 0 ? theme.rowA : theme.rowB}" style="padding:8px;"><table width="100%" border="0" cellpadding="0" cellspacing="0"><tr><td>${renderPostUserInfo(spec, post, theme, theme.name, true)}</td></tr><tr><td style="padding-top:8px;">${renderPostBody(spec, post, theme, theme.name)}</td></tr></table></td></tr>`
          : `<tr><td width="165" bgcolor="${index % 2 === 0 ? theme.userA : theme.userB}" class="${theme.userClass}" style="padding:8px;">${renderPostUserInfo(spec, post, theme, theme.name, false)}</td><td bgcolor="${index % 2 === 0 ? theme.rowA : theme.rowB}" class="${theme.bodyClass}" style="padding:8px;">${renderPostBody(spec, post, theme, theme.name)}</td></tr>`,
        `</table>`,
      ].join('\n'))
      .join('\n<br>\n');
  }

  return [
    renderThreadShellStart(spec, theme),
    `<table width="780" border="0" cellpadding="0" cellspacing="0" align="center" class="forum-shell"><tr><td>`,
    `<table width="780" border="0" cellpadding="0" cellspacing="0" align="center" bgcolor="${theme.header}"><tr><td height="42" style="padding-left:10px;"><font face="Arial" size="3" color="${theme.headerText}"><b>${esc(spec.scenario.forumName)}</b></font></td></tr></table>`,
    breadcrumb,
    paginationTop,
    titleBlock,
    intro,
    poll,
    locked,
    paginationBottom,
    postsHtml,
    paginationBottom,
    composer,
    `</td></tr></table>`,
    renderThreadShellEnd(spec, theme),
  ].filter(Boolean).join('\n');
}

function updateIndexFile() {
  const index = fs.readFileSync(indexPath, 'utf8');
  const updated = index
    .replace(/\| 02 \| [^|]+ \| `\/synthetic\/prompt_02\/` \|/, '| 02 | 100 / 100 | `/synthetic/prompt_02/` |')
    .replace(/\*\*Total:\*\* [^\n]+/, '**Total:** 200 / 2,000');
  fs.writeFileSync(indexPath, updated, 'utf8');
}

function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  for (let num = 1; num <= 100; num += 1) {
    const spec = pageSpec(num);
    const posts = buildPosts(spec);
    const html = renderStylePage(spec, spec.style, posts);
    const filename = path.join(outputDir, `page_${String(num).padStart(3, '0')}.html`);
    fs.writeFileSync(filename, html, 'utf8');
  }
  updateIndexFile();
  console.log(`Wrote 100 pages to ${outputDir}`);
  console.log(`Updated ${indexPath}`);
}

main();
