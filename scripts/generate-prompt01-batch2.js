'use strict';

const fs = require('fs');
const path = require('path');

const outputDir = path.resolve(__dirname, '..', 'synthetic_data', 'pages', 'prompt_01');
const indexPath = path.resolve(__dirname, '..', 'synthetic_data', 'INDEX.md');

const avatarGif =
  'data:image/gif;base64,R0lGODlhIAAgAPAAAP///wAAACH5BAAAAAAALAAAAAAgACAAAAIghI+py+0Po5y02ouzPgUAOw==';

const palettes = [
  {
    pageBg: '#EEEEEE',
    border: '#999999',
    header: '#336699',
    headerText: '#FFFFFF',
    bodyBg: '#FFFFFF',
    rowA: '#F5F5FF',
    rowB: '#FFFFF5',
    userBg: '#DDEEFF',
    userAlt: '#D6E4F5',
    meta: '#666666',
    link: '#003399',
    vlink: '#660066',
    accent: '#CCDDEE',
  },
  {
    pageBg: '#F3F0E8',
    border: '#8E7C5A',
    header: '#5C4B3A',
    headerText: '#FFF7EC',
    bodyBg: '#FFFDF8',
    rowA: '#F6E9D8',
    rowB: '#FFF4E8',
    userBg: '#EFD7B7',
    userAlt: '#E7CDA4',
    meta: '#6B563E',
    link: '#7C3F00',
    vlink: '#5D274E',
    accent: '#F0D7C3',
  },
  {
    pageBg: '#EEF3EF',
    border: '#6E826F',
    header: '#48634C',
    headerText: '#F7FFF8',
    bodyBg: '#FBFFFB',
    rowA: '#E7F0E7',
    rowB: '#F4FAF4',
    userBg: '#D7E7D9',
    userAlt: '#C8DBC9',
    meta: '#4B5A4D',
    link: '#355A39',
    vlink: '#5A3E51',
    accent: '#D7E4D9',
  },
  {
    pageBg: '#F8F2E7',
    border: '#A37D5A',
    header: '#9B5E3C',
    headerText: '#FFF8EF',
    bodyBg: '#FFFDF9',
    rowA: '#F9E7D4',
    rowB: '#FFF4E7',
    userBg: '#F0D3B7',
    userAlt: '#E7C1A2',
    meta: '#7A5338',
    link: '#8B3F1D',
    vlink: '#6C3A54',
    accent: '#F2DDC9',
  },
];

const namePools = [
  ['Harold', 'Mina', 'Otis', 'Guest'],
  ['Wren', 'Pete', 'Dana', 'Guest'],
  ['Abe', 'Lynn', 'Marta', 'Guest'],
  ['Rowan', 'Iris', 'Noah', 'Guest'],
  ['Tess', 'Clive', 'Nina', 'Guest'],
  ['Milo', 'June', 'Earl', 'Guest'],
  ['Ruth', 'Ivan', 'Cora', 'Guest'],
  ['Glen', 'Faye', 'Owen', 'Guest'],
];

const pageSpecs = [
  {
    num: 73,
    site: 'RetroScope Forum',
    title: 'Lens helicoid slipped after cleaning',
    detail: 'focus helicoid',
    intro: 'The focus ring turns freely but infinity is gone.',
    count: 3,
    compose: 'none',
    layout: 'two',
    avatar: 'none',
    nameStyle: 'plain',
    replyMode: 'none',
    depth: 1,
    note: 'Archive copy - no compose box on this page.',
  },
  {
    num: 74,
    site: 'TapeDeckTalk',
    title: 'Cassette deck wow/flutter after belt swap',
    detail: 'idler belt',
    intro: 'Playback slows and the pitch wanders after the belt replacement.',
    count: 4,
    compose: 'textarea',
    layout: 'three',
    avatar: 'img',
    nameStyle: 'link',
    replyMode: 'replyQuote',
    depth: 2,
    note: 'Reply area is still open on this one.',
  },
  {
    num: 75,
    site: 'ProjectorPit',
    title: 'Focus drifts after bulb change',
    detail: 'focus mount',
    intro: 'The picture is sharp for a minute and then eases out again.',
    count: 5,
    compose: 'none',
    layout: 'two',
    avatar: 'color',
    nameStyle: 'font',
    replyMode: 'none',
    depth: 1,
    note: 'Read-only archive snapshot.',
  },
  {
    num: 76,
    site: 'TypewriterBench',
    title: 'Platen hard and uneven on a Quiet De Luxe',
    detail: 'platen',
    intro: 'The left side is still hard and the impression is uneven.',
    count: 3,
    compose: 'input',
    layout: 'three',
    avatar: 'none',
    nameStyle: 'bold',
    replyMode: 'replyOnly',
    depth: 1,
    note: 'Quick note field only, no full form.',
  },
  {
    num: 77,
    site: 'HamWave Board',
    title: 'Receiver hiss after recap',
    detail: 'first IF stage',
    intro: 'The hiss is louder than it was before the capacitor job.',
    count: 6,
    compose: 'none',
    layout: 'two',
    avatar: 'img',
    nameStyle: 'plain',
    replyMode: 'disabled',
    depth: 2,
    note: 'Posting is open for reading only.',
  },
  {
    num: 78,
    site: 'Watchmaker Club',
    title: 'Amplitude dropped after service',
    detail: 'escape wheel',
    intro: 'The watch is running, but the amplitude is way down.',
    count: 4,
    compose: 'textarea',
    layout: 'three',
    avatar: 'color',
    nameStyle: 'link',
    replyMode: 'replyQuote',
    depth: 1,
    note: 'Compose box is visible below the thread.',
  },
  {
    num: 79,
    site: 'DarkroomCraft',
    title: 'Tri-X grain too harsh after Rodinal',
    detail: 'development time',
    intro: 'The negatives came out much grainier than the last batch.',
    count: 5,
    compose: 'none',
    layout: 'two',
    avatar: 'none',
    nameStyle: 'font',
    replyMode: 'none',
    depth: 2,
    note: 'Archived lab notes, no posting form.',
  },
  {
    num: 80,
    site: 'BikeTech Forum',
    title: 'Rear hub play after bearing service',
    detail: 'cone adjustment',
    intro: 'The wheel still rocks side to side when I load it.',
    count: 2,
    compose: 'input',
    layout: 'three',
    avatar: 'img',
    nameStyle: 'bold',
    replyMode: 'replyOnly',
    depth: 1,
    note: 'Short form only, one line and send.',
  },
  {
    num: 81,
    site: 'SewingCircle',
    title: 'Needle timing off after oiling',
    detail: 'hook timing',
    intro: 'The machine stitches, but the timing is still wandering.',
    count: 7,
    compose: 'none',
    layout: 'two',
    avatar: 'color',
    nameStyle: 'plain',
    replyMode: 'none',
    depth: 3,
    note: 'Old archive page, no reply form.',
  },
  {
    num: 82,
    site: 'AmigaBench',
    title: 'Floppy drive belt slips on load',
    detail: 'belt tension',
    intro: 'The drive spins up, then slips before the disk reads.',
    count: 4,
    compose: 'textarea',
    layout: 'three',
    avatar: 'none',
    nameStyle: 'link',
    replyMode: 'replyQuote',
    depth: 2,
    note: 'Full reply box still present.',
  },
  {
    num: 83,
    site: 'AquariumKeepers',
    title: 'pH swings after water change',
    detail: 'buffering',
    intro: 'The tank settles for a while, then the pH drifts again.',
    count: 5,
    compose: 'none',
    layout: 'two',
    avatar: 'img',
    nameStyle: 'font',
    replyMode: 'disabled',
    depth: 1,
    note: 'Replies closed on this archive copy.',
  },
  {
    num: 84,
    site: 'ModelEngine Talk',
    title: 'Glow engine sputters under throttle',
    detail: 'needle valve',
    intro: 'Idle is fine, but the engine falls flat when I open it up.',
    count: 6,
    compose: 'input',
    layout: 'three',
    avatar: 'color',
    nameStyle: 'bold',
    replyMode: 'replyOnly',
    depth: 2,
    note: 'Quick note field only below the comments.',
  },
  {
    num: 85,
    site: 'StereoRepair',
    title: 'Channel imbalance after recap',
    detail: 'cathode resistor',
    intro: 'The left side is still low even after the capacitor swap.',
    count: 3,
    compose: 'none',
    layout: 'two',
    avatar: 'none',
    nameStyle: 'plain',
    replyMode: 'none',
    depth: 2,
    note: 'Read-only service log page.',
  },
  {
    num: 86,
    site: 'OrchidBoard',
    title: 'Leaves yellowing from the base',
    detail: 'crown rot',
    intro: 'The newest leaves are fading from the stem upward.',
    count: 4,
    compose: 'textarea',
    layout: 'three',
    avatar: 'img',
    nameStyle: 'link',
    replyMode: 'replyQuote',
    depth: 1,
    note: 'Message box is a textarea in the footer.',
  },
  {
    num: 87,
    site: 'FountainPen Forum',
    title: 'Nib scratchy after tuning',
    detail: 'tine alignment',
    intro: 'The nib feels dry on the upstroke and catches paper.',
    count: 5,
    compose: 'none',
    layout: 'two',
    avatar: 'color',
    nameStyle: 'font',
    replyMode: 'disabled',
    depth: 3,
    note: 'Archive-only page with no compose box.',
  },
  {
    num: 88,
    site: 'Woodturners',
    title: 'Lathe vibration at high speed',
    detail: 'tool rest',
    intro: 'The blank runs smooth at low speed, then chatters as it speeds up.',
    count: 6,
    compose: 'input',
    layout: 'three',
    avatar: 'none',
    nameStyle: 'bold',
    replyMode: 'replyOnly',
    depth: 2,
    note: 'Short message field only.',
  },
  {
    num: 89,
    site: 'SailboatDock',
    title: 'Rudder creak after haul-out',
    detail: 'tiller linkage',
    intro: 'The creak starts as soon as I put load on the steering.',
    count: 4,
    compose: 'none',
    layout: 'two',
    avatar: 'img',
    nameStyle: 'plain',
    replyMode: 'none',
    depth: 1,
    note: 'Comments visible, but the thread is closed.',
  },
  {
    num: 90,
    site: 'PotteryStudio',
    title: 'Kiln temp uneven at the top shelf',
    detail: 'element placement',
    intro: 'The top shelf is cooler than the middle by a noticeable margin.',
    count: 7,
    compose: 'textarea',
    layout: 'three',
    avatar: 'color',
    nameStyle: 'link',
    replyMode: 'replyQuote',
    depth: 3,
    note: 'Compose table remains on the page.',
  },
  {
    num: 91,
    site: 'CameraLab',
    title: 'Viewfinder lines after prism cleaning',
    detail: 'prism alignment',
    intro: 'The finder is bright, but the lines are still visible.',
    count: 3,
    compose: 'none',
    layout: 'two',
    avatar: 'none',
    nameStyle: 'font',
    replyMode: 'disabled',
    depth: 2,
    note: 'Archived technical note, no compose box.',
  },
  {
    num: 92,
    site: 'BanjoBench',
    title: 'Head buzz after bridge swap',
    detail: 'bridge height',
    intro: 'The note pops now and then, but the buzz is still there.',
    count: 5,
    compose: 'input',
    layout: 'three',
    avatar: 'img',
    nameStyle: 'bold',
    replyMode: 'replyOnly',
    depth: 1,
    note: 'Short reply field only.',
  },
  {
    num: 93,
    site: 'GardenPatch',
    title: 'Tomato leaves spotted after rain',
    detail: 'fungal spray',
    intro: 'The spots started right after a wet week.',
    count: 6,
    compose: 'none',
    layout: 'two',
    avatar: 'color',
    nameStyle: 'plain',
    replyMode: 'none',
    depth: 2,
    note: 'No compose area on this old page.',
  },
  {
    num: 94,
    site: 'OilLamp Club',
    title: 'Wick burns unevenly after trim',
    detail: 'wick height',
    intro: 'One side keeps burning hotter than the other.',
    count: 4,
    compose: 'textarea',
    layout: 'three',
    avatar: 'none',
    nameStyle: 'link',
    replyMode: 'replyQuote',
    depth: 2,
    note: 'Textarea compose box below the comments.',
  },
  {
    num: 95,
    site: 'SlideRule Society',
    title: 'Cursor sticks near the middle',
    detail: 'stock tension',
    intro: 'The slide moves fine until it reaches the center.',
    count: 5,
    compose: 'none',
    layout: 'two',
    avatar: 'img',
    nameStyle: 'font',
    replyMode: 'none',
    depth: 3,
    note: 'Read-only archive with no posting box.',
  },
  {
    num: 96,
    site: 'FloppyHelp',
    title: '520ST won\'t boot after belt replacement',
    detail: 'drive alignment',
    intro: 'The machine powers on, but the disk never catches.',
    count: 6,
    compose: 'input',
    layout: 'three',
    avatar: 'color',
    nameStyle: 'bold',
    replyMode: 'replyOnly',
    depth: 1,
    note: 'Single-line input and submit button.',
  },
  {
    num: 97,
    site: 'Railfan Workshop',
    title: 'HO coupler pops on curves',
    detail: 'coupler box',
    intro: 'The cars stay linked on the straight, then separate in the turn.',
    count: 3,
    compose: 'none',
    layout: 'two',
    avatar: 'none',
    nameStyle: 'plain',
    replyMode: 'disabled',
    depth: 2,
    note: 'Posting is closed on this copy.',
  },
  {
    num: 98,
    site: 'Bookbinder\'s Corner',
    title: 'Case spine cracks when opened',
    detail: 'glue line',
    intro: 'The joint opens before the cover can lay flat.',
    count: 4,
    compose: 'textarea',
    layout: 'three',
    avatar: 'img',
    nameStyle: 'link',
    replyMode: 'replyQuote',
    depth: 3,
    note: 'Textarea compose area still present.',
  },
  {
    num: 99,
    site: 'Gearhead Archive',
    title: 'Carburetor stumbles at idle',
    detail: 'mixture screw',
    intro: 'Throttle is okay, but the idle still hunts.',
    count: 5,
    compose: 'none',
    layout: 'two',
    avatar: 'color',
    nameStyle: 'font',
    replyMode: 'none',
    depth: 1,
    note: 'Archive page with no compose controls.',
  },
  {
    num: 100,
    site: 'VintageSynth',
    title: 'Voice chip failure after recap',
    detail: 'voice board',
    intro: 'One voice is silent and the others are drifting.',
    count: 7,
    compose: 'input',
    layout: 'three',
    avatar: 'none',
    nameStyle: 'bold',
    replyMode: 'replyOnly',
    depth: 2,
    note: 'The footer keeps it to a single-line compose field.',
  },
];

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function paletteFor(num) {
  return palettes[(num - 73) % palettes.length];
}

function authorBankFor(num) {
  return namePools[(num - 73) % namePools.length];
}

function usernameMarkup(style, name, palette, id) {
  const href = `profile.html?id=${id}`;
  switch (style) {
    case 'link':
      return `<b><a href="${href}">${esc(name)}</a></b>`;
    case 'bold':
      return `<b>${esc(name)}</b>`;
    case 'font':
      return `<font face="Verdana" size="1" color="${palette.link}">${esc(name)}</font>`;
    case 'plain':
    default:
      return esc(name);
  }
}

function avatarMarkup(type, palette, label) {
  if (type === 'img') {
    return `<img src="${avatarGif}" width="32" height="32" alt="${esc(label)}" border="0">`;
  }
  if (type === 'color') {
    return `<table border="0" cellpadding="0" cellspacing="0"><tr><td width="28" height="28" bgcolor="${palette.accent}"></td></tr></table>`;
  }
  return '';
}

function footerMarkup(spec, index, isReply) {
  if (spec.replyMode === 'none') {
    return '';
  }
  if (spec.replyMode === 'disabled') {
    return `<br><br><font size="1">[${isReply ? 'Reply disabled' : 'Replies closed'}]</font>`;
  }
  if (spec.replyMode === 'replyOnly') {
    return `<br><br><font size="1"><a href="#">Reply</a></font>`;
  }
  if (spec.replyMode === 'replyQuote') {
    return `<br><br><font size="1"><a href="#">Reply</a> | <a href="#">Quote</a></font>`;
  }
  return '';
}

function commentBody(spec, phraseIndex, isReply) {
  const detail = spec.detail;
  const fragments = [
    `I would meter the ${detail} first and compare both sides. A small drift there can throw the whole section off.`,
    `A cold joint around the ${detail} area is enough to cause this kind of behavior.`,
    `If the symptom stays with the same channel, the ${detail} is probably where the fault lives.`,
    `Check the service notes for the ${detail}; the original values often explain the imbalance.`,
    `After I reflowed that area, the readings came back into line on my bench.`,
    `If you have a spare part, swap it in temporarily and see whether the change follows the ${detail}.`,
    `The symptom sounds mechanical at first, but the ${detail} can still be the real problem.`,
    `I would not trust the first visual inspection alone; measure the ${detail} and the surrounding joints.`,
  ];
  const replyFragments = [
    `Thanks, that lines up with what I am seeing on the meter.`,
    `I checked that area again and the reading changed when I touched the joint.`,
    `That gives me a clear place to start. I will reflow it and test again.`,
    `The fault does stay with the same side, so this is probably local to the ${detail}.`,
    `Good call. The next pass will be on that section with the loupe and the meter.`,
  ];
  const base = isReply ? replyFragments[phraseIndex % replyFragments.length] : fragments[phraseIndex % fragments.length];
  return base;
}

function makeNode(spec, names, bodyIndex, authorIndex, isReply, depthLeft, replyStyle) {
  const palette = paletteFor(spec.num);
  const author = names[authorIndex % names.length];
  const role = author === 'Guest' ? 'Guest' : 'Member';
  const dateBase = 2 + bodyIndex + (isReply ? 1 : 0);
  const day = String((dateBase % 27) + 1).padStart(2, '0');
  const date = `Mar ${day}, 2001`;
  const body = commentBody(spec, bodyIndex, isReply);
  const node = {
    author,
    role,
    date,
    body,
    footer: footerMarkup(spec, bodyIndex, isReply),
    replies: [],
  };
  if (depthLeft > 0) {
    return node;
  }
  return node;
}

function buildTree(spec, names) {
  const count = spec.count;
  const nodes = [];
  const palette = paletteFor(spec.num);
  const nameStyle = spec.nameStyle;
  const nextName = (i) => names[i % names.length];

  function buildNode(index, isReply) {
    const author = nextName(index);
    const role = author === 'Guest' ? 'Guest' : 'Member';
    const dateDay = String(((index + spec.num) % 27) + 1).padStart(2, '0');
    const date = `Mar ${dateDay}, 2001`;
    const body = commentBody(spec, index, isReply);
    return {
      author,
      role,
      date,
      body,
      footer: footerMarkup(spec, index, isReply),
      replies: [],
    };
  }

  if (count <= 0) {
    return nodes;
  }

  if (spec.depth === 1 || count === 1) {
    for (let i = 0; i < count; i += 1) {
      nodes.push(buildNode(i, false));
    }
    return nodes;
  }

  const top1 = buildNode(0, false);
  nodes.push(top1);

  if (count === 2) {
    top1.replies.push(buildNode(1, true));
    return nodes;
  }

  const top2 = buildNode(1, false);
  nodes.push(top2);
  const reply1 = buildNode(2, true);
  top2.replies.push(reply1);

  let cursor = 3;
  if (spec.depth >= 3 && count >= 4) {
    const reply2 = buildNode(3, true);
    reply1.replies.push(reply2);
    cursor = 4;
  }

  for (let i = cursor; i < count; i += 1) {
    nodes.push(buildNode(i, false));
  }

  return nodes;
}

function renderNode(node, spec, palette, level, index, names) {
  const rowBg = index % 2 === 0 ? palette.rowA : palette.rowB;
  const userCellBg = index % 2 === 0 ? palette.userBg : palette.userAlt;
  const spacerCell = spec.layout === 'three' ? `<td width="28" bgcolor="${palette.border}">&nbsp;</td>` : '';
  const avatar = avatarMarkup(spec.avatar, palette, node.author);
  const userBody = [];
  if (avatar) {
    userBody.push('<table border="0" cellpadding="0" cellspacing="0" width="100%"><tr>');
    userBody.push(`<td width="36" valign="top">${avatar}</td>`);
    userBody.push('<td valign="top">');
  }
  userBody.push(`<font face="Verdana" size="1" color="${palette.meta}">${esc(node.role)}</font><br>`);
  userBody.push(`${usernameMarkup(spec.nameStyle, node.author, palette, 400 + index)}<br>`);
  userBody.push(`<font face="Verdana" size="1" color="${palette.meta}">Posts: ${100 + (spec.num % 50) + index * 3}<br>Joined: Feb 2000</font>`);
  if (avatar) {
    userBody.push('</td></tr></table>');
  }

  const footer = node.footer;
  const replySection = node.replies.length
    ? `<table width="100%" border="0" cellpadding="0" cellspacing="1" bgcolor="${palette.border}">${renderRows(
        node.replies,
        spec,
        palette,
        level + 1,
        names,
      )}</table>`
    : '';

  let message = `<font face="Verdana" size="2" color="#333333"><b>${esc(spec.title)}</b></font><br>`;
  message += `<font face="Verdana" size="1" color="${palette.meta}">${esc(node.date)}</font><br><br>`;
  message += `<font face="Verdana" size="2" color="#333333">${esc(node.body)}</font>`;
  message += footer;
  if (replySection) {
    message += `<br><br>${replySection}`;
  }

  const rowCells = spec.layout === 'three'
    ? `${spacerCell}<td width="140" valign="top" bgcolor="${userCellBg}" style="padding:8px;">${userBody.join('')}</td><td valign="top" bgcolor="${rowBg}" style="padding:8px;">${message}</td>`
    : `<td width="140" valign="top" bgcolor="${userCellBg}" style="padding:8px;">${userBody.join('')}</td><td valign="top" bgcolor="${rowBg}" style="padding:8px;">${message}</td>`;

  return `<!-- comment box begin --><tr bgcolor="${rowBg}">${rowCells}</tr><!-- comment box end -->`;
}

function renderRows(nodes, spec, palette, level, names) {
  return nodes
    .map((node, index) => renderNode(node, spec, palette, level, index, names))
    .join('\n');
}

function renderComposer(spec, palette) {
  if (spec.compose === 'none') {
    return `<table width="780" border="0" cellpadding="6" cellspacing="0" align="center" bgcolor="${palette.accent}"><tr><td><font face="Verdana" size="2" color="${palette.meta}">${esc(
      spec.note,
    )}</font></td></tr></table>`;
  }

  const field =
    spec.compose === 'textarea'
      ? '<textarea name="body" rows="5" cols="55"></textarea>'
      : '<input type="text" name="body" size="55">';

  return [
    `<table width="780" border="0" cellpadding="6" cellspacing="0" align="center" bgcolor="${palette.accent}">`,
    `<tr><td colspan="2" bgcolor="${palette.header}"><font face="Arial" size="2" color="${palette.headerText}"><b>${
      spec.compose === 'textarea' ? 'Post a Reply' : 'Quick Reply'
    }</b></font></td></tr>`,
    `<tr><td valign="top"><font face="Verdana" size="2">Message:</font></td><td>${field}</td></tr>`,
    `<tr><td></td><td><input type="submit" value="Send"></td></tr>`,
    `</table>`,
  ].join('\n');
}

function renderThread(spec, palette, names) {
  const threadNodes = buildTree(spec, names);
  return [
    `<table width="780" border="0" cellpadding="0" cellspacing="0" align="center" bgcolor="${palette.border}">`,
    `<tr><td bgcolor="${palette.header}" height="40"><font face="Arial" size="3" color="${palette.headerText}"><b>&nbsp;&nbsp;${esc(
      spec.site,
    )}</b></font></td></tr>`,
    `<tr><td><table width="100%" border="0" cellpadding="8" cellspacing="0" bgcolor="${palette.bodyBg}"><tr><td>`,
    `<font face="Verdana" size="3" color="${palette.header}"><b>${esc(spec.title)}</b></font><br>`,
    `<font face="Verdana" size="1" color="${palette.meta}">${esc(spec.intro)}</font>`,
    `</td></tr></table></td></tr>`,
    `</table>`,
    `<table width="780" border="0" cellpadding="0" cellspacing="0" align="center">`,
    `<tr><td bgcolor="${palette.header}" height="24"><font face="Verdana" size="2" color="${palette.headerText}"><b>&nbsp;&nbsp;Discussion (${spec.count})</b></font></td></tr>`,
    `</table>`,
    `<table class="tblForum" width="780" border="0" cellpadding="0" cellspacing="1" align="center" bgcolor="${palette.border}">`,
    renderRows(threadNodes, spec, palette, 0, names),
    `</table>`,
  ].join('\n');
}

function renderPage(spec) {
  const palette = paletteFor(spec.num);
  const names = authorBankFor(spec.num);
  const compose = renderComposer(spec, palette);
  const thread = renderThread(spec, palette, names);

  return [
    '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN">',
    '<html>',
    '<head>',
    `<title>${esc(spec.site)} - ${esc(spec.title)}</title>`,
    '<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1">',
    '</head>',
    `<body bgcolor="${palette.pageBg}" text="#333333" link="${palette.link}" vlink="${palette.vlink}">`,
    '<br>',
    thread,
    '<br>',
    compose,
    '<br>',
    `<table width="780" align="center" border="0"><tr><td align="center"><font face="Verdana" size="1" color="${palette.meta}">&copy; 2001 ${esc(
      spec.site,
    )}. All rights reserved.</font></td></tr></table>`,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  for (const spec of pageSpecs) {
    const filename = path.join(outputDir, `page_${String(spec.num).padStart(3, '0')}.html`);
    fs.writeFileSync(filename, renderPage(spec), 'utf8');
  }

  const index = fs.readFileSync(indexPath, 'utf8');
  const updated = index
    .replace(/\| 01 \| [^|]+ \| `\/synthetic\/prompt_01\/` \|/, '| 01 | 100 / 100 | `/synthetic/prompt_01/` |')
    .replace(/\*\*Total:\*\* [^\n]+/, '**Total:** 100 / 2,000');
  fs.writeFileSync(indexPath, updated, 'utf8');

  console.log(`Wrote ${pageSpecs.length} pages to ${outputDir}`);
  console.log(`Updated ${indexPath}`);
}

main();
