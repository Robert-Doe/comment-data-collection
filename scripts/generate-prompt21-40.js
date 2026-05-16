'use strict';

const fs = require('fs');
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
  writePage,
} = require('./synthetic-page-utils');

const repoRoot = path.resolve(__dirname, '..');
const pagesRoot = path.join(repoRoot, 'synthetic_data', 'pages');
const indexPath = path.join(repoRoot, 'synthetic_data', 'INDEX.md');

const genericNames = [
  'Avery', 'Mina', 'Noah', 'Rae', 'Jules', 'Pia', 'Theo', 'Ivy', 'Cora', 'Drew',
  'Lena', 'Milo', 'Nora', 'Owen', 'Zia', 'Eli', 'Tess', 'Finn', 'Maya', 'Cal',
  'Rowan', 'Sage', 'Luca', 'Nina', 'Otis', 'June', 'Ruth', 'Ben', 'Kira', 'Jae',
];

const genericCities = [
  'Austin, TX', 'Portland, OR', 'Seattle, WA', 'Denver, CO', 'Boston, MA', 'Atlanta, GA',
  'San Diego, CA', 'Chicago, IL', 'Toronto, ON', 'Vancouver, BC', 'Berlin, DE', 'London, UK',
];

const avatarColors = ['#4d7ea8', '#4f8a63', '#8a5d3f', '#7a4f8d', '#6f6fa6', '#a56f4f'];

const monthsFull = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function svgDataUri(svg) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function safeJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function wrapDocument({
  doctype = '<!DOCTYPE html>',
  htmlAttrs = 'lang="en" dir="ltr"',
  headExtras = [],
  bodyAttrs = '',
  bodyContent = '',
}) {
  const extras = Array.isArray(headExtras) ? headExtras.filter(Boolean) : [headExtras].filter(Boolean);
  const bodyAttrText = bodyAttrs ? ` ${bodyAttrs.trim()}` : '';
  return [
    doctype,
    `<html ${htmlAttrs}>`,
    '<head>',
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    ...extras,
    '</head>',
    `<body${bodyAttrText}>`,
    bodyContent,
    '</body>',
    '</html>',
  ].join('\n');
}

function averageRating(items) {
  if (!items.length) return 0;
  const total = items.reduce((sum, item) => sum + Number(item.rating || 0), 0);
  return total / items.length;
}

function monthYear(date) {
  return `${monthsShort[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function longDate(date) {
  return `${monthsFull[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

function shortSlashDate(date) {
  const yy = String(date.getUTCFullYear()).slice(-2);
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}/${yy}`;
}

function formatSentenceSet(rng, sentences, minCount = 1, maxCount = 3) {
  const count = intBetween(rng, minCount, maxCount);
  const output = [];
  for (let i = 0; i < count; i += 1) {
    output.push(pick(rng, sentences));
  }
  return output.join(' ');
}

function buildStarSvg(fill = '#f5b301', stroke = '#b57b00') {
  return svgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
      <polygon points="10,1.6 12.8,6.7 18.4,7.3 14.2,11 15.4,16.6 10,13.8 4.6,16.6 5.8,11 1.6,7.3 7.2,6.7"
        fill="${fill}" stroke="${stroke}" stroke-width="0.9"/>
    </svg>
  `);
}

const fullStarUri = buildStarSvg('#f2b51d', '#ad7400');
const emptyStarUri = buildStarSvg('#fdfdfd', '#d0c6b0');

function buildStarRow(rating, max = 5, mode = 'img') {
  const full = Math.max(0, Math.min(max, Math.round(Number(rating))));
  if (mode === 'text') {
    return `${'★'.repeat(full)}${'☆'.repeat(max - full)}`;
  }
  const stars = [];
  for (let i = 0; i < max; i += 1) {
    stars.push(`<img src="${i < full ? fullStarUri : emptyStarUri}" width="14" height="14" alt="">`);
  }
  return stars.join('');
}

function buildRatingText(rating, max = 5) {
  return `${Number(rating).toFixed(rating % 1 === 0 ? 0 : 1)} out of ${max}`;
}

function buildPlaceholderGraphic(label, bg = '#e7edf7', fg = '#1d2430', width = 160, height = 110) {
  return svgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="g" x1="0" x2="1">
          <stop offset="0%" stop-color="${bg}"/>
          <stop offset="100%" stop-color="#ffffff"/>
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" rx="14" fill="url(#g)"/>
      <rect x="${Math.round(width * 0.12)}" y="${Math.round(height * 0.18)}" width="${Math.round(width * 0.76)}" height="${Math.round(height * 0.18)}" rx="8" fill="${bg}" opacity="0.8"/>
      <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(height * 0.16)}" font-weight="700" fill="${fg}">${escapeHtml(label)}</text>
    </svg>
  `);
}

function buildPhotoThumbnail(label, palette = ['#f0d7c3', '#9b5e3c', '#fff']) {
  const [a, b, c] = palette;
  return svgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
      <defs>
        <linearGradient id="p" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${a}"/>
          <stop offset="55%" stop-color="${b}"/>
          <stop offset="100%" stop-color="${c}"/>
        </linearGradient>
      </defs>
      <rect width="160" height="160" rx="16" fill="url(#p)"/>
      <circle cx="118" cy="34" r="18" fill="rgba(255,255,255,0.25)"/>
      <rect x="18" y="96" width="124" height="26" rx="13" fill="rgba(255,255,255,0.24)"/>
      <text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="700" fill="#fff">${escapeHtml(label)}</text>
    </svg>
  `);
}

function buildVideoThumbnail(label, palette = ['#111827', '#7c3aed', '#fff']) {
  const [a, b, c] = palette;
  return svgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 320">
      <defs>
        <linearGradient id="v" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${a}"/>
          <stop offset="55%" stop-color="${b}"/>
          <stop offset="100%" stop-color="${c}"/>
        </linearGradient>
      </defs>
      <rect width="180" height="320" rx="20" fill="url(#v)"/>
      <circle cx="90" cy="150" r="34" fill="rgba(255,255,255,0.3)"/>
      <polygon points="80,132 80,168 112,150" fill="#fff"/>
      <rect x="16" y="248" width="148" height="32" rx="16" fill="rgba(255,255,255,0.2)"/>
      <text x="50%" y="218" dominant-baseline="middle" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="700" fill="#fff">${escapeHtml(label)}</text>
    </svg>
  `);
}

function makeReviews(rng, count, config = {}) {
  const reviews = [];
  for (let i = 0; i < count; i += 1) {
    const author = pick(rng, config.authors || genericNames);
    const date = config.date
      ? config.date(rng, i)
      : new Date(Date.UTC(
        intBetween(rng, config.yearRange?.[0] ?? 2018, config.yearRange?.[1] ?? 2024),
        intBetween(rng, 0, 11),
        intBetween(rng, 1, 28),
      ));
    const rating = typeof config.rating === 'function'
      ? config.rating(rng, i)
      : Array.isArray(config.rating)
        ? pick(rng, config.rating)
        : intBetween(rng, config.minRating ?? 3, config.maxRating ?? 5);
    const review = {
      index: i + 1,
      author,
      rating,
      title: config.titles ? pick(rng, config.titles) : '',
      body: config.body
        ? config.body(rng, i, author, rating)
        : formatSentenceSet(rng, config.sentences || ['The page reads well.', 'The spacing feels balanced.', 'The details are easy to scan.'], config.minSentences ?? 1, config.maxSentences ?? 3),
      date,
      dateText: config.dateText ? config.dateText(date, i, rng) : longDate(date),
      shortDateText: config.shortDateText ? config.shortDateText(date, i, rng) : shortSlashDate(date),
      monthYearText: config.monthYearText ? config.monthYearText(date, i, rng) : monthYear(date),
      helpful: config.helpful ? intBetween(rng, config.helpful[0], config.helpful[1]) : intBetween(rng, 0, 120),
      helpfulNo: config.helpfulNo ? intBetween(rng, config.helpfulNo[0], config.helpfulNo[1]) : intBetween(rng, 0, 30),
      verified: config.verified === undefined ? chance(rng, 0.5) : chance(rng, config.verified),
      disclosure: config.disclosures ? pick(rng, config.disclosures) : '',
      location: config.locations ? pick(rng, config.locations) : '',
      avatar: config.avatar === false ? '' : buildAvatarSvg(author, pick(rng, config.avatarColors || avatarColors)),
      extra: config.extra ? config.extra(rng, i, author, rating, date) : {},
    };
    reviews.push(review);
  }
  return reviews;
}

function renderReviewMetricBars(reviews) {
  const buckets = [0, 0, 0, 0, 0];
  reviews.forEach((review) => {
    const bucket = Math.max(1, Math.min(5, Math.round(Number(review.rating || 0))));
    buckets[bucket - 1] += 1;
  });
  const max = Math.max(...buckets, 1);
  return buckets.slice().reverse().map((count, index) => {
    const star = 5 - index;
    const width = Math.max(8, Math.round((count / max) * 180));
    return `<div style="display:flex; align-items:center; gap:8px; margin:6px 0;"><span style="width:32px;">${star} star</span><div style="flex:0 0 180px; height:8px; background:#dde5ef; border-radius:999px; overflow:hidden;"><div style="width:${width}px; height:8px; background:#f0b429;"></div></div><span>${count}</span></div>`;
  }).join('');
}

function renderBadgeList(badges) {
  return badges && badges.length
    ? `<div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:8px;">${badges.map((badge) => `<span style="display:inline-block; padding:3px 8px; border-radius:999px; background:#eef3ff; color:#365; font-size:11px;">${escapeHtml(badge)}</span>`).join('')}</div>`
    : '';
}

function renderCommonHero({ kicker, title, lede, score, reviewCount, extra = '' }) {
  return `
    <div style="padding:18px; border:1px solid #d9dfe8; border-radius:14px; background:#fff; margin-bottom:14px;">
      <div style="display:flex; justify-content:space-between; gap:16px; align-items:flex-start; flex-wrap:wrap;">
        <div>
          ${kicker ? `<div style="text-transform:uppercase; letter-spacing:.08em; font-size:11px; color:#667;">${escapeHtml(kicker)}</div>` : ''}
          <h1 style="margin:4px 0 8px; font-size:28px; line-height:1.15;">${escapeHtml(title)}</h1>
          <div style="color:#556; line-height:1.5; max-width:68ch;">${escapeHtml(lede)}</div>
        </div>
        <div style="min-width:190px; border:1px solid #e4e9f1; border-radius:12px; padding:12px 14px; background:#f8fbff;">
          <div style="font-size:12px; color:#667;">Average score</div>
          <div style="font-size:30px; font-weight:700; margin:4px 0;">${Number(score).toFixed(1)}</div>
          <div style="font-size:12px; color:#667;">${escapeHtml(reviewCount)} reviews</div>
        </div>
      </div>
      ${extra}
    </div>
  `;
}

function renderModernReviewCard(review, options = {}) {
  const tag = options.tag || 'article';
  const cls = options.className || 'review-card';
  const stars = options.starMode === 'text' ? buildStarRow(review.rating, options.maxStars || 5, 'text') : buildStarRow(review.rating, options.maxStars || 5, 'img');
  const metaParts = [
    `<span style="font-weight:700;">${escapeHtml(review.author)}</span>`,
    review.location ? `<span>${escapeHtml(review.location)}</span>` : '',
    `<time datetime="${review.date.toISOString().slice(0, 10)}">${escapeHtml(review.dateText)}</time>`,
  ].filter(Boolean).join(' <span style="color:#ccd;">•</span> ');
  const attrs = review.extra.attributes
    ? `<dl style="display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px 14px; margin:10px 0 0;"><dt style="font-size:12px; color:#667;">${escapeHtml(review.extra.attributes[0])}</dt><dd style="margin:0;">${escapeHtml(review.extra.attributes[1])}</dd></dl>`
    : '';
  const content = [
    `<div style="display:flex; gap:12px; align-items:flex-start;">`,
    review.avatar ? `<img src="${review.avatar}" alt="${escapeHtml(review.author)}" style="width:${options.avatarSize || 42}px; height:${options.avatarSize || 42}px; border-radius:50%; flex:0 0 auto;">` : '',
    `<div style="min-width:0; flex:1;">`,
    `<div style="display:flex; justify-content:space-between; gap:8px; align-items:flex-start; flex-wrap:wrap;">`,
    `<div>${metaParts}</div>`,
    `<div style="color:#f0b429; white-space:nowrap;">${stars}</div>`,
    `</div>`,
    review.title ? `<h3 style="margin:10px 0 6px; font-size:${options.titleSize || 18}px; line-height:1.25;">${escapeHtml(review.title)}</h3>` : '',
    `<div style="line-height:1.6; color:#28303d;">${escapeHtml(review.body)}</div>`,
    attrs,
    review.extra.photo ? `<img src="${review.extra.photo}" alt="" style="display:block; width:100%; max-width:260px; border-radius:12px; margin-top:10px;">` : '',
    review.extra.video ? `<div style="margin-top:10px;">${review.extra.video}</div>` : '',
    review.extra.note ? `<div style="margin-top:10px; font-size:12px; color:#667;">${escapeHtml(review.extra.note)}</div>` : '',
    review.extra.helpfulText ? `<div style="margin-top:10px; font-size:12px; color:#667;">${escapeHtml(review.extra.helpfulText)}</div>` : '',
    review.extra.badges ? renderBadgeList(review.extra.badges) : '',
    `</div>`,
    `</div>`,
  ].filter(Boolean).join('\n');
  return `<${tag} class="${cls}" style="border:1px solid #e2e7ef; border-radius:12px; padding:14px; background:#fff;">${content}</${tag}>`;
}

function renderLegacyStars(rating, max = 5) {
  const full = Math.max(0, Math.min(max, Math.round(rating)));
  const stars = [];
  for (let i = 0; i < max; i += 1) {
    stars.push(`<img src="${i < full ? fullStarUri : emptyStarUri}" width="13" height="13" alt="">`);
  }
  return stars.join('');
}

function renderLegacyBar() {
  return '<table width="100%" bgcolor="#999999" height="1" cellpadding="0" cellspacing="0"><tr><td></td></tr></table>';
}

const legacy21Products = [
  {
    site: 'Epinions',
    title: 'Canon PowerShot S30 review archive',
    product: 'Canon PowerShot S30 digital camera',
    category: 'Digital Cameras',
    summary: 'A cream-and-tan comparison page with left-rail reviewer cards and pros/cons prose.',
  },
  {
    site: 'CNET Reviews',
    title: 'Linksys BEFSR41 broadband router',
    product: 'Linksys BEFSR41 router',
    category: 'Networking',
    summary: 'A compact blue-gray score sheet with a 10-point rating and editor-style copy.',
  },
  {
    site: 'Amazon',
    title: 'Sony DVP-NS715P DVD player',
    product: 'Sony DVP-NS715P DVD player',
    category: 'DVD Players',
    summary: 'An early Amazon-style review page with helpful votes and seller follow-up notes.',
  },
  {
    site: 'eBay Feedback',
    title: 'Seagate Barracuda ATA IV hard drive',
    product: 'Seagate Barracuda ATA IV',
    category: 'Storage',
    summary: 'Compact feedback rows with positive, neutral, and negative labels.',
  },
];

const legacy21Sentences = [
  'I purchased this item in October 2002 and used it almost every day after that.',
  'The build feels solid for a product from this era, and the controls are easy to read.',
  'Setup took a little longer than expected, but the result was worth it for the price.',
  'Picture quality is better than I expected from a compact unit with this feature set.',
  'The seller shipped quickly and the packaging protected the item well on arrival.',
  'Pros and cons were easy to separate after a week of use, which made the summary useful.',
  'I would buy this again if I needed the same category because the value was strong.',
  'The interface is plain, but that also makes it straightforward to use every time.',
];

function buildPrompt21Page(pageNum) {
  const rng = createRng(21000 + pageNum);
  const variant = pageNum % 4;
  const product = legacy21Products[(pageNum - 1) % legacy21Products.length];
  const reviewCount = intBetween(rng, 3, 12);
  const reviews = makeReviews(rng, reviewCount, {
    authors: genericNames,
    yearRange: [1998, 2004],
    titles: ['Works well', 'Good value', 'Mixed but useful', 'Solid overall', 'Worth the price'],
    sentences: legacy21Sentences,
    minSentences: 2,
    maxSentences: 4,
    extra: (reviewRng, index, author) => ({
      pros: pick(reviewRng, [
        'Clear manual, easy controls, and a practical feature set.',
        'Good packaging, responsive seller, and quick setup.',
        'Strong value and a sensible layout for the era.',
      ]),
      cons: pick(reviewRng, [
        'Menu text is small and the plastic shell feels light.',
        'The software bundle is dated and not especially polished.',
        'The first-time setup takes a few extra steps.',
      ]),
      bottomLine: pick(reviewRng, [
        'Bottom Line: I would recommend it to someone who wants a dependable everyday unit.',
        'Bottom Line: The feature set is not fancy, but it does what it claims to do.',
        'Bottom Line: A reasonable buy if you care about function more than finish.',
      ]),
      helpful: chance(reviewRng, 0.45) ? intBetween(reviewRng, 3, 85) : 0,
      helpfulNo: chance(reviewRng, 0.2) ? intBetween(reviewRng, 0, 8) : 0,
      memberSince: `Member since: ${intBetween(reviewRng, 1999, 2003)}`,
      reviewCount: `Reviews written: ${intBetween(reviewRng, 4, 117)}`,
      saleLabel: index % 3 === 0 ? 'Verified purchase' : '',
      verdict: ['positive', 'neutral', 'negative'][index % 3],
    }),
  });
  const score = averageRating(reviews);
  const useHelpful = chance(rng, 0.4);
  const showSummary = chance(rng, 0.7);
  const showForm = chance(rng, 0.5);
  const showImage = chance(rng, 0.85);
  const showTenScale = variant === 1;
  const htmlVariant = variant === 0 ? 'epinions' : variant === 1 ? 'cnet' : variant === 2 ? 'amazon' : 'ebay';
  const headerImage = buildPlaceholderGraphic(product.product, '#d9e2f2', '#24364a', 170, 120);

  const summaryBlock = showSummary ? `
    <table width="100%" cellpadding="8" cellspacing="0" border="0" bgcolor="#f8f4e8">
      <tr>
        <td width="40%" valign="top">
          <font face="Arial" size="2" color="#333333"><b>Aggregate rating</b><br />
          ${renderLegacyStars(score)} <b>${score.toFixed(1)} / 5</b><br />
          ${reviews.length} reviews</font>
        </td>
        <td width="60%" valign="top">
          <font face="Arial" size="2" color="#333333"><b>Rating breakdown</b><br />
          ${renderReviewMetricBars(reviews)}</font>
        </td>
      </tr>
    </table>
    ${renderLegacyBar()}
  ` : '';

  const reviewRows = reviews.map((review, idx) => {
    const color = idx % 2 === 0 ? '#f5f1e7' : '#fffdf8';
    const ratingText = showTenScale ? `${(review.rating * 2).toFixed(1)} / 10` : buildRatingText(review.rating);
    const label = htmlVariant === 'ebay'
      ? `<font face="Arial" size="2" color="${review.extra.verdict === 'positive' ? '#006600' : review.extra.verdict === 'negative' ? '#cc0000' : '#666666'}"><b>${String(review.extra.verdict || 'neutral').toUpperCase()}</b></font>`
      : `<font face="Arial" size="2" color="#333333"><b>Rating:</b> ${ratingText}</font>`;
    const helpful = useHelpful && review.helpful
      ? `<br /><font face="Arial" size="2" color="#666666">Was this review helpful? <a href="#">Yes</a> (${review.helpful}) / <a href="#">No</a></font>`
      : '';
    const title = review.title ? `<font face="Arial" size="3" color="#000000"><b>${escapeHtml(review.title)}</b></font><br />` : '';
    const pros = `<br /><font face="Arial" size="2" color="#336600"><b>Pros:</b> ${escapeHtml(review.extra.pros)}</font>`;
    const cons = `<br /><font face="Arial" size="2" color="#cc0000"><b>Cons:</b> ${escapeHtml(review.extra.cons)}</font>`;
    const bottom = `<br /><font face="Arial" size="2" color="#333333"><b>${escapeHtml(review.extra.bottomLine)}</b></font>`;
    const seller = chance(rng, 0.25) ? `<br /><font face="Arial" size="2" color="#666666">Seller response: Thanks for the detailed feedback.</font>` : '';
    const leftRail = `
      <td width="24%" valign="top" bgcolor="#dde8f7">
        <font face="Arial" size="2" color="#003399"><b>${escapeHtml(review.author)}</b></font><br />
        <font face="Arial" size="1" color="#666666">${escapeHtml(review.extra.memberSince)}</font><br />
        <font face="Arial" size="1" color="#666666">${escapeHtml(review.extra.reviewCount)}</font><br />
        <font face="Arial" size="1" color="#666666">${escapeHtml(review.dateText)}</font>
      </td>`;
    const bodyCell = `
      <td width="76%" valign="top" bgcolor="${color}">
        ${title}
        <font face="Arial" size="2" color="#333333">${label}<br />
        ${escapeHtml(review.body)}</font>
        ${pros}
        ${cons}
        ${bottom}
        ${helpful}
        ${seller}
      </td>`;
    return `
      <tr>
        ${leftRail}
        ${bodyCell}
      </tr>`;
  }).join('\n');

  const formBlock = showForm ? `
    ${renderLegacyBar()}
    <table width="100%" cellpadding="8" cellspacing="0" border="0" bgcolor="#f7f7f7">
      <tr><td>
        <font face="Arial" size="2" color="#333333"><b>Write a review</b></font><br />
        <form>
          <table width="100%" cellpadding="4" cellspacing="0" border="0">
            <tr><td width="20%"><font face="Arial" size="2">Name</font></td><td><input type="text" size="30" /></td></tr>
            <tr><td><font face="Arial" size="2">Rating</font></td><td><select><option>5</option><option>4</option><option>3</option><option>2</option><option>1</option></select></td></tr>
            <tr><td valign="top"><font face="Arial" size="2">Review</font></td><td><textarea rows="4" cols="48"></textarea></td></tr>
          </table>
        </form>
      </td></tr>
    </table>
  ` : '';

  const body = `
    <table width="760" align="center" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff">
      <tr>
        <td bgcolor="${htmlVariant === 'cnet' ? '#2b4b75' : htmlVariant === 'ebay' ? '#efe7d6' : '#f3efe4'}" style="padding:14px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td valign="top">
                <font face="Arial" size="4" color="${htmlVariant === 'cnet' ? '#ffffff' : '#333333'}"><b>${escapeHtml(product.site)} Reviews</b></font><br />
                <font face="Arial" size="2" color="${htmlVariant === 'cnet' ? '#e9eef7' : '#666666'}">${escapeHtml(product.summary)}</font>
              </td>
              <td align="right" valign="top">
                <font face="Arial" size="2" color="${htmlVariant === 'cnet' ? '#ffffff' : '#333333'}"><b>${escapeHtml(product.category)}</b></font><br />
                <font face="Arial" size="2" color="${htmlVariant === 'cnet' ? '#dbe6f7' : '#666666'}">${escapeHtml(product.product)}</font>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td bgcolor="#fefcf7" style="padding:14px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td width="34%" valign="top">${showImage ? `<img src="${headerImage}" width="170" height="120" alt="${escapeHtml(product.product)}" border="0" />` : ''}</td>
              <td width="66%" valign="top">
                <font face="Arial" size="3" color="#000000"><b>${escapeHtml(product.title)}</b></font><br />
                <font face="Arial" size="2" color="#333333">Average score: ${showTenScale ? `${(score * 2).toFixed(1)} / 10` : `${score.toFixed(1)} / 5`}</font><br />
                <font face="Arial" size="2" color="#333333">By ${reviews.length} reviewers over the 1998-2004 archive window.</font>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td>${summaryBlock}</td>
      </tr>
      <tr>
        <td>
          <table width="100%" cellpadding="8" cellspacing="0" border="0">
            ${reviewRows}
          </table>
        </td>
      </tr>
      <tr>
        <td>${formBlock}</td>
      </tr>
    </table>
  `;

  return wrapDocument({
    doctype: '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN" "http://www.w3.org/TR/html4/loose.dtd">',
    htmlAttrs: 'lang="en"',
    headExtras: [
      `<title>${escapeHtml(product.site)} - ${escapeHtml(product.product)}</title>`,
      '<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">',
    ],
    bodyAttrs: 'bgcolor="#f0efe7" style="margin:0;"',
    bodyContent: body,
  });
}

const forum22Topics = [
  ['Is the Canon EOS 300D worth buying?', 'Canon EOS 300D', 'Photography'],
  ['iPod vs. Creative Zen - which should I get?', 'iPod photo', 'Portable Audio'],
  ['Anyone else having lockups with the D-Link router?', 'D-Link DI-604', 'Networking'],
  ['Just got the GeForce FX 5900 and need impressions', 'GeForce FX 5900', 'Graphics Cards'],
  ['Printer choice for a small office?', 'HP OfficeJet 5610', 'Printers'],
];

const forumReplies22 = [
  'I have had mine for six months and it still behaves the same way.',
  'The spec sheet looked fine, but the real-world result was better than expected.',
  'If you are coming from a cheaper model, the difference is immediately obvious.',
  'The biggest issue for me was setup, not day-to-day use.',
  'I would read the sticky post first because it answers the common questions.',
  'The thread stayed useful because people kept posting actual measurements.',
];

function buildPrompt22Page(pageNum) {
  const rng = createRng(22000 + pageNum);
  const topic = forum22Topics[(pageNum - 1) % forum22Topics.length];
  const postCount = intBetween(rng, 6, 24);
  const maxDepth = chance(rng, 0.6) ? intBetween(rng, 1, 2) : 0;
  const topLevelCount = maxDepth === 0 ? postCount : intBetween(rng, 3, Math.min(8, postCount));
  const forumName = pick(rng, ['HardwareTalk', 'PhotoForum 2006', 'Consumer Tech Board', 'Pocket Gadget Forum']);
  const sticky = chance(rng, 0.45);
  const showPagination = chance(rng, 0.5);

  const posts = buildForest(rng, {
    totalCount: postCount,
    topLevelCount,
    maxDepth,
    ensureDepth: maxDepth,
    makeNode: ({ depth, index, path: nodePath, rng: nodeRng }) => {
      const author = pick(nodeRng, genericNames);
      const rank = pick(nodeRng, ['Junior Member', 'Member', 'Senior Member', 'Veteran', 'Moderator']);
      const title = depth === 0 && index === 1 ? topic[0] : pick(nodeRng, ['Re: worth it?', 'A couple of notes', 'Short answer', 'My experience', 'Follow-up']);
      const postDate = new Date(Date.UTC(intBetween(nodeRng, 2002, 2008), intBetween(nodeRng, 0, 11), intBetween(nodeRng, 1, 28), intBetween(nodeRng, 8, 22), intBetween(nodeRng, 0, 59)));
      const hasQuote = depth > 0 && chance(nodeRng, 0.7);
      return {
        id: `p${pageNum}-${nodePath.join('-')}`,
        author,
        rank,
        title,
        postCount: intBetween(nodeRng, 14, 6280),
        avatar: buildAvatarSvg(author, pick(nodeRng, avatarColors)),
        dateText: `${monthsFull[postDate.getUTCMonth()]} ${postDate.getUTCDate()}, ${postDate.getUTCFullYear()} ${String(postDate.getUTCHours()).padStart(2, '0')}:${String(postDate.getUTCMinutes()).padStart(2, '0')}`,
        body: `${pick(nodeRng, forumReplies22)} ${depth >= 1 ? 'The reply stays short because the earlier quote already covers most of it.' : ''}`,
        quote: hasQuote ? pick(nodeRng, forumReplies22) : '',
        quoteAuthor: hasQuote ? pick(nodeRng, genericNames) : '',
        thanks: chance(nodeRng, 0.55) ? intBetween(nodeRng, 1, 52) : 0,
        signature: chance(nodeRng, 0.35) ? pick(nodeRng, ['-- Ben', '-- "PixelPete"', '-- M.', '-- HardwareGuy']) : '',
        edited: chance(nodeRng, 0.3) ? `Last edited by ${author} on ${monthsShort[postDate.getUTCMonth()]} ${postDate.getUTCDate()}/${String(postDate.getUTCFullYear()).slice(-2)} at ${String(postDate.getUTCHours()).padStart(2, '0')}:${String(postDate.getUTCMinutes()).padStart(2, '0')} PM` : '',
        sticky: sticky && index === 1,
      };
    },
  });

  const threadHtml = renderTree(posts, (node, childrenHtml) => {
    const quote = node.quote
      ? `<table width="100%" cellpadding="4" cellspacing="0" border="0" style="margin-bottom:8px;"><tr><td style="background:#f0f0f0; border-left:3px solid #999999;"><font face="Arial" size="2"><b>Originally posted by ${escapeHtml(node.quoteAuthor || node.author)}:</b><br />${escapeHtml(node.quote)}</font></td></tr></table>`
      : '';
    const thanks = node.thanks ? `<br /><font face="Arial" size="2" color="#666666">Thanks: ${node.thanks}</font>` : '';
    const signature = node.signature ? `<hr size="1" noshade="noshade" /><font face="Arial" size="2" color="#666666">${escapeHtml(node.signature)}</font>` : '';
    const edit = node.edited ? `<br /><i><font face="Arial" size="1" color="#666666">${escapeHtml(node.edited)}</font></i>` : '';
    const stickyMark = node.sticky ? `<div style="margin-bottom:6px;"><font face="Arial" size="2" color="#cc0000"><b>Important</b></font></div>` : '';
    return `
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:12px; border:1px solid #c8d3e2;">
        <tr bgcolor="${node.depth % 2 === 0 ? '#e8eef7' : '#f4f7fb'}">
          <td colspan="2" style="padding:8px 10px;">
            ${stickyMark}
            <font face="Arial" size="2" color="#333333"><b>${escapeHtml(node.title)}</b></font>
            <span style="float:right;"><img src="${svgDataUri(`
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 18">
                <rect width="80" height="18" rx="9" fill="#d9e7f7"/>
                <text x="40" y="12" text-anchor="middle" font-family="Arial" font-size="10" font-weight="700" fill="#335577">Post</text>
              </svg>
            `)}" width="80" height="18" alt=""></span>
          </td>
        </tr>
        <tr>
          <td width="22%" valign="top" bgcolor="#f7f9fc" style="padding:10px; border-right:1px solid #d7deea;">
            <img src="${node.avatar}" width="42" height="42" alt="" style="display:block; border:1px solid #ccd7e7; margin-bottom:8px;" />
            <font face="Arial" size="2" color="#003399"><b>${escapeHtml(node.author)}</b></font><br />
            <font face="Arial" size="1" color="#666666">${escapeHtml(node.rank)}</font><br />
            <font face="Arial" size="1" color="#666666">Posts: ${node.postCount}</font><br />
            <font face="Arial" size="1" color="#666666">${escapeHtml(node.dateText)}</font>
          </td>
          <td valign="top" bgcolor="#ffffff" style="padding:10px;">
            ${quote}
            <font face="Arial" size="2" color="#333333">${escapeHtml(node.body)}</font>
            ${thanks}
            ${signature}
            ${edit}
            <div style="margin-top:8px;">
              <font face="Arial" size="2"><a href="#">Report post</a> &nbsp; <a href="#">Edit post</a></font>
            </div>
            ${childrenHtml ? `<div style="margin-top:10px; margin-left:18px; border-left:2px solid #d9e2f0; padding-left:12px;">${childrenHtml}</div>` : ''}
          </td>
        </tr>
      </table>
    `;
  });

  const pagination = showPagination
    ? `<div style="margin:12px 0; font-family:Arial, sans-serif; font-size:12px;">Page 1 of 3 &nbsp; <a href="#">1</a> <a href="#">2</a> <a href="#">3</a> <a href="#">Next &raquo;</a></div>`
    : '';

  const breadcrumb = `<div style="font-family:Arial, sans-serif; font-size:12px; margin-bottom:8px; color:#666;">Forum &rarr; ${escapeHtml(topic[2])} &rarr; ${escapeHtml(topic[0])}</div>`;

  const body = `
    <table width="780" align="center" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff">
      <tr>
        <td bgcolor="#2f4f74" style="padding:12px 14px;">
          <font face="Arial" size="4" color="#ffffff"><b>${escapeHtml(forumName)}</b></font><br />
          <font face="Arial" size="2" color="#e6eef8">Product discussion thread archive from 2002-2008</font>
        </td>
      </tr>
      <tr>
        <td bgcolor="#f2f6fb" style="padding:10px 14px;">
          ${breadcrumb}
          <font face="Arial" size="4" color="#111111"><b>${escapeHtml(topic[0])}</b></font>
          ${pagination}
        </td>
      </tr>
      <tr>
        <td style="padding:14px; background:#ffffff;">
          ${sticky ? `<table width="100%" cellpadding="8" cellspacing="0" border="0" bgcolor="#fff5cc"><tr><td><font face="Arial" size="2" color="#333333"><b>Sticky</b>: Please read the thread rules before posting.</font></td></tr></table><br />` : ''}
          ${threadHtml}
        </td>
      </tr>
    </table>
  `;

  return wrapDocument({
    doctype: '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN" "http://www.w3.org/TR/html4/loose.dtd">',
    htmlAttrs: 'lang="en"',
    headExtras: [
      `<title>${escapeHtml(topic[0])} - ${escapeHtml(forumName)}</title>`,
      '<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">',
    ],
    bodyAttrs: 'style="margin:0; background:#dde6f2;"',
    bodyContent: body,
  });
}

const web23Products = [
  ['Garmin nuvi 350', 'A compact GPS unit with user ratings and helpful votes.'],
  ['TomTom One', 'An early navigation gadget with AJAX star widgets.'],
  ['Canon A620', 'A consumer camera page with a product price and add-to-cart link.'],
  ['Sony VAIO UX', 'A tiny early smartphone-like device with rounded corners.'],
  ['Western Digital My Book', 'An external hard drive page with a dynamic review tab panel.'],
  ['Panasonic TH-50PX50U', 'A flat-panel TV review island with image-swapping stars.'],
];

const web23Sentences = [
  'I bought this on sale at Best Buy and honestly the value is better than the spec sheet suggests.',
  'Specs are solid, but the real-world performance is what made me keep it.',
  'The page loads like a classic partial, and the comments are easy to skim quickly.',
  'The rounded boxes feel like the right amount of polish for that era.',
  'The helpful votes are nice because they let the stronger reviews rise to the top.',
  'The review content has the same practical tone I remember from those sites.',
];

function buildPrompt23Page(pageNum) {
  const rng = createRng(23000 + pageNum);
  const product = web23Products[(pageNum - 1) % web23Products.length];
  const reviewCount = intBetween(rng, 5, 15);
  const reviews = makeReviews(rng, reviewCount, {
    authors: genericNames,
    yearRange: [2005, 2010],
    titles: ['Great purchase', 'Pretty good', 'Works for me', 'Useful and fast', 'Solid value'],
    sentences: web23Sentences,
    minSentences: 1,
    maxSentences: 3,
    helpful: [5, 120],
    verified: 0.5,
    extra: (reviewRng, index) => ({
      helpfulText: `${intBetween(reviewRng, 0, 75)} of ${intBetween(reviewRng, 1, 90)} found this review helpful`,
      photo: chance(reviewRng, 0.22) ? buildPlaceholderGraphic('photo', '#e8eef7', '#355', 260, 160) : '',
      note: chance(reviewRng, 0.4) ? 'AJAX star widget rendered on hover in the original site.' : '',
      badges: chance(reviewRng, 0.25) ? ['Verified buyer'] : [],
    }),
  });
  const score = averageRating(reviews);
  const showTabPanel = chance(rng, 0.7);
  const showLoadMore = chance(rng, 0.8);
  const showAjaxComment = chance(rng, 0.9);
  const reviewHtml = reviews.map((review) => renderModernReviewCard(review, {
    className: 'reviewItem',
    titleSize: 17,
    avatarSize: 36,
  })).join('\n');
  const selectStub = `onchange="loadSort(this.value)"`;

  const body = `
    <div style="max-width:980px; margin:0 auto; padding:18px 12px 44px;">
      <div style="display:flex; gap:14px; align-items:flex-start; justify-content:space-between; flex-wrap:wrap; padding:16px; border:1px solid #d8dfeb; border-radius:14px; background:#fff;">
        <div style="min-width:280px;">
          <div style="font-size:12px; color:#667;">Web 2.0 review widget</div>
          <h1 style="margin:4px 0 6px; font-size:28px;">${escapeHtml(product[0])}</h1>
          <div style="max-width:62ch; color:#445; line-height:1.55;">${escapeHtml(product[1])}</div>
          <div style="margin-top:10px;"><a href="#" style="color:#336699;">Add to Cart</a></div>
        </div>
        <img src="${buildPlaceholderGraphic(product[0], '#e5ecf8', '#25405f', 180, 120)}" width="180" height="120" alt="${escapeHtml(product[0])}" style="border:1px solid #cfd8e7; border-radius:10px;">
        <div style="min-width:220px; border:1px solid #d9e1ee; border-radius:12px; background:#f8fbff; padding:12px 14px;">
          <div style="font-size:12px; color:#667;">Average rating</div>
          <div style="font-size:30px; font-weight:700; margin:3px 0;">${score.toFixed(1)}</div>
          <div style="color:#f0b429; margin-bottom:6px;">${buildStarRow(score)}</div>
          <div style="font-size:12px; color:#667;">${reviews.length} reviews</div>
        </div>
      </div>
      <div id="review-container" style="margin-top:14px; border:1px solid #d8dfeb; border-radius:14px; background:#fff; overflow:hidden;">
        <!-- AJAX partial begin -->
        <div style="padding:14px 16px; background:linear-gradient(180deg,#eff5ff,#ffffff); border-bottom:1px solid #e4ebf5;">
          <div style="display:flex; gap:12px; justify-content:space-between; flex-wrap:wrap; align-items:center;">
            <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
              ${showTabPanel ? `<a href="#" style="padding:8px 12px; border-radius:999px; background:#336699; color:#fff; text-decoration:none;">Write a review</a>` : `<a href="#" style="color:#336699;">Write a review</a>`}
              <label style="font-size:12px; color:#667;">Sort by:
                <select ${selectStub} style="margin-left:4px;">
                  <option>Most Helpful</option>
                  <option>Most Recent</option>
                  <option>Highest Rated</option>
                </select>
              </label>
            </div>
            <div style="font-size:12px; color:#667;">XMLHttpRequest partial loading</div>
          </div>
        </div>
        <div style="padding:16px;">
          <div style="display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; margin-bottom:16px;">
            <div style="padding:10px; border:1px solid #e3e8f0; border-radius:10px; background:#f9fbff;">${renderReviewMetricBars(reviews)}</div>
            <div style="grid-column:span 3; padding:10px 12px; border:1px solid #e3e8f0; border-radius:10px; background:#f9fbff;">
              <div style="font-size:12px; color:#667;">Loaded from AJAX</div>
              <div style="font-size:14px; line-height:1.5;">${showAjaxComment ? 'The review widget would be fetched via XMLHttpRequest and injected into this container.' : 'The widget uses image-swapped stars, rounded corners, and static JavaScript hooks.'}</div>
            </div>
          </div>
          <div style="display:grid; gap:14px;">
            ${reviewHtml}
          </div>
          ${showLoadMore ? `<div style="margin-top:16px; display:flex; justify-content:space-between; gap:10px; align-items:center; flex-wrap:wrap;"><a href="javascript:loadPage(2)">Next page</a><a href="javascript:loadPage(2)">Load more reviews</a></div>` : ''}
        </div>
      </div>
      <script type="text/javascript">
        function loadPage(pageNum) { /* AJAX call would go here */ }
        function loadSort(value) { /* AJAX sort would go here */ }
        function voteHelpful(id, vote) { /* AJAX vote would go here */ }
        function swapStars(id, value) { /* hover state would go here */ }
      </script>
    </div>
  `;

  return wrapDocument({
    doctype: '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">',
    htmlAttrs: 'xmlns="http://www.w3.org/1999/xhtml" xml:lang="en" lang="en"',
    headExtras: [
      `<title>${escapeHtml(product[0])} Reviews</title>`,
      '<style type="text/css">body { margin: 0; font-family: Arial, Helvetica, sans-serif; background: #eef3fb; color: #1f2733; } a { color: #336699; } select, input, textarea { font: inherit; } .reviewItem { box-shadow: 0 1px 2px rgba(0,0,0,.05); }</style>',
    ],
    bodyAttrs: 'style="margin:0;"',
    bodyContent: body,
  });
}

const micro24Items = [
  ['Cafe', 'Bistro reviews with vCard annotations'],
  ['Hotel', 'Trip reviews with hReview and hAtom cues'],
  ['Software', 'Legacy software reviews in microformat markup'],
  ['Book', 'Reader reviews with profile links and dates'],
  ['Plumber', 'Local service reviews with aggregate rating'],
  ['Restaurant', 'Dining reviews with visible summary and description'],
];

const micro24Bodies = [
  'The layout is still simple, but the microformat annotations make the source easy to parse.',
  'It feels like a real early-2010s page where class names were part of the SEO strategy.',
  'The review text is structured cleanly and the date markup is machine-readable.',
  'The reviewer card uses a classic vCard block and the summary stays short.',
  'A crawler would be able to find the rating even if the visual layout is understated.',
];

function buildPrompt24Page(pageNum) {
  const rng = createRng(24000 + pageNum);
  const item = micro24Items[(pageNum - 1) % micro24Items.length];
  const count = intBetween(rng, 4, 12);
  const reviews = makeReviews(rng, count, {
    authors: genericNames,
    yearRange: [2005, 2011],
    titles: ['Great stop', 'Solid value', 'Useful detail', 'Worth the visit', 'Would return'],
    sentences: micro24Bodies,
    minSentences: 1,
    maxSentences: 3,
    locations: genericCities,
    extra: (reviewRng, index) => ({
      version: chance(reviewRng, 0.25) ? `Version ${intBetween(reviewRng, 1, 4)}.${intBetween(reviewRng, 0, 9)}` : '',
      url: chance(reviewRng, 0.4) ? `https://example.com/users/${index + 1}` : '',
      email: chance(reviewRng, 0.2) ? `user${index + 1}@example.com` : '',
      itemName: item[0],
      itemType: item[1],
    }),
  });
  const score = averageRating(reviews);
  const aggregate = `
    <div class="aggregate hreview-aggregate" style="padding:12px; border:1px solid #d9d9d9; background:#f9f9f9; margin-bottom:14px;">
      <span class="item"><span class="fn">${escapeHtml(item[0])}</span></span><br />
      <span class="rating" title="${score.toFixed(1)}">${buildStarRow(score)} ${score.toFixed(1)} / 5</span><br />
      <span class="count">${reviews.length}</span> reviews
    </div>
  `;
  const reviewHtml = reviews.map((review, idx) => {
    const withVcard = idx % 2 === 0;
    const ratingMarkup = idx % 3 === 0
      ? `<span class="rating"><span class="value">${Math.round(review.rating)}</span>/<span class="best">5</span></span>`
      : `<abbr class="rating" title="${Math.round(review.rating)}">${buildStarRow(review.rating)}</abbr>`;
    return `
      <div class="hreview" style="border-bottom:1px solid #cccccc; padding:12px 0;">
        <div style="float:left; margin:0 10px 6px 0;"><img src="${review.avatar}" width="38" height="38" alt="${escapeHtml(review.author)}" style="border-radius:50%;" /></div>
        <div>
          <div class="${withVcard ? 'reviewer vcard' : 'reviewer'}">
            <span class="fn">${escapeHtml(review.author)}</span>
            ${review.location ? `<span class="adr">, ${escapeHtml(review.location)}</span>` : ''}
            ${chance(rng, 0.35) && review.extra.url ? `<a class="url" href="${escapeHtml(review.extra.url)}">profile</a>` : ''}
            ${chance(rng, 0.2) && review.extra.email ? `<span class="email">${escapeHtml(review.extra.email)}</span>` : ''}
          </div>
          <div style="margin:4px 0;">${ratingMarkup}</div>
          <h3 class="summary" style="margin:0 0 4px; font-size:18px;">${escapeHtml(review.title)}</h3>
          <div class="description">${escapeHtml(review.body)}</div>
          <div style="margin-top:4px;"><abbr class="dtreviewed" title="${review.date.toISOString().slice(0, 10)}">${escapeHtml(review.dateText)}</abbr></div>
          ${review.extra.version ? `<div class="version">${escapeHtml(review.extra.version)}</div>` : ''}
        </div>
        <div style="clear:both;"></div>
      </div>
    `;
  }).join('\n');

  const body = `
    <div style="width:min(920px, calc(100% - 24px)); margin:0 auto; padding:18px 0 40px; font-family:Arial, Helvetica, sans-serif; color:#333;">
      <div style="padding:16px; background:#fff; border:1px solid #d8d8d8; border-radius:10px;">
        <div style="font-size:12px; color:#666;">Microformat era review hub</div>
        <h1 style="margin:4px 0 6px; font-size:28px;">${escapeHtml(item[0])} Reviews</h1>
        <div style="color:#555; line-height:1.55;">${escapeHtml(item[1])}</div>
      </div>
      <div style="margin-top:14px;">
        <div class="breadcrumb" style="font-size:12px; color:#666; margin-bottom:10px;">Home &raquo; Reviews &raquo; ${escapeHtml(item[0])}</div>
        ${aggregate}
        ${reviewHtml}
      </div>
    </div>
  `;

  return wrapDocument({
    doctype: '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">',
    htmlAttrs: 'xmlns="http://www.w3.org/1999/xhtml" lang="en"',
    headExtras: [
      '<link rel="profile" href="http://microformats.org/profile/hreview">',
      `<title>${escapeHtml(item[0])} Reviews</title>`,
      '<style type="text/css">body { margin: 0; background: #f7f7f7; color: #333; } .hreview .rating { color: #b57b00; }</style>',
    ],
    bodyContent: body,
  });
}

const mobile25Topics = [
  ['m.yelp.com', 'Cafe reviews in mobile view', 'Restaurant'],
  ['m.amazon.com', 'Product reviews on a stripped-down mobile page', 'Product'],
  ['m.trip.com', 'Hotel reviews shown in a compact stack', 'Hotel'],
  ['m.carriers.com', 'Mobile carrier reviews with tiny text and links', 'Carrier'],
  ['m.apps.com', 'App reviews from the early smartphone web', 'App'],
];

const mobile25Bodies = [
  'Good food, will return.',
  'Battery dies fast. Not worth it.',
  'Short wait, decent value, no surprises.',
  'Easy to read on a phone, which mattered a lot at the time.',
  'Read the summary and the verdict was clear enough.',
  'The mobile page is sparse, but it gets to the point quickly.',
];

function buildPrompt25Page(pageNum) {
  const rng = createRng(25000 + pageNum);
  const topic = mobile25Topics[(pageNum - 1) % mobile25Topics.length];
  const isWap = pageNum % 2 === 0;
  const reviewCount = intBetween(rng, 3, 8);
  const reviews = makeReviews(rng, reviewCount, {
    authors: genericNames,
    yearRange: [2007, 2012],
    titles: ['Quick take', 'Worth it', 'Okay', 'Great value', 'Short answer'],
    sentences: mobile25Bodies,
    minSentences: 1,
    maxSentences: 2,
    avatar: false,
    verified: 0.3,
    extra: (reviewRng, index) => ({
      shortSummary: chance(reviewRng, 0.45) ? `${pick(reviewRng, ['Read full review', 'More details', 'Continue'])}` : '',
      helpfulText: !isWap && chance(reviewRng, 0.5) ? 'Helpful? Yes | No' : '',
      ratingText: chance(reviewRng, 0.4) ? `${Math.round(reviewRng() * 4) + 1}/5 stars` : '',
    }),
  });
  const score = averageRating(reviews);
  const showFullSite = chance(rng, 0.85);
  const showNext = chance(rng, 0.65);
  const showHelp = !isWap && chance(rng, 0.7);
  const compactCss = isWap
    ? ''
    : '<style type="text/css">body { margin: 8px; font-family: Arial, sans-serif; font-size: 14px; color: #222; } a { color: #06c; } .review { border-top: 1px solid #ddd; padding: 10px 0; }</style>';

  const reviewHtml = reviews.map((review) => `
    <div class="review" style="${isWap ? 'border-top:1px solid #ccc; padding:10px 0;' : ''}">
      <h2 style="margin:0 0 4px; font-size:16px;">${escapeHtml(review.title)}</h2>
      <div style="font-size:12px; color:#666;">${escapeHtml(review.author)} &middot; ${escapeHtml(review.monthYearText)}</div>
      <div style="margin:4px 0; color:#111;">${review.extra.ratingText || buildStarRow(review.rating, 5, 'text')}</div>
      <div style="line-height:1.45;">${escapeHtml(review.body)} ${review.extra.shortSummary ? `<a href="#">[...]\u00a0${escapeHtml(review.extra.shortSummary)}</a>` : ''}</div>
      ${showHelp && review.extra.helpfulText ? `<div style="font-size:12px; margin-top:4px;">${escapeHtml(review.extra.helpfulText)}</div>` : ''}
    </div>
  `).join('\n');

  const banner = isWap ? '' : `<div style="margin:10px 0; padding:8px 10px; background:#f4f8ff; border:1px solid #d8e4f5;">Are you looking for the full site? <a href="#">View desktop version</a></div>`;

  const body = isWap
    ? `
      <div style="padding:8px;">
        <h1 style="font-size:18px; margin:0 0 6px;">${escapeHtml(topic[1])}</h1>
        <div style="font-size:12px; color:#333;">${escapeHtml(topic[0])}</div>
        <div style="margin:6px 0; font-size:12px;">Score: ${score.toFixed(1)} / 5</div>
        ${showFullSite ? `<div style="margin:6px 0;"><a href="#">View full site</a></div>` : ''}
        ${showNext ? `<div style="margin:6px 0;"><a href="?page=2">Next 5 reviews</a></div>` : ''}
        ${reviewHtml}
      </div>
    `
    : `
      <div style="width:min(520px, 100%); margin:0 auto; padding:8px;">
        <div style="padding:10px; background:#fff; border:1px solid #ddd;">
          <div style="font-size:12px; color:#666;">${escapeHtml(topic[0])}</div>
          <h1 style="font-size:20px; margin:4px 0;">${escapeHtml(topic[1])}</h1>
          <div style="font-size:12px; margin-bottom:6px;">Aggregate score: ${score.toFixed(1)} / 5</div>
          ${banner}
          ${showFullSite ? `<div style="margin:8px 0;"><a href="#">View full site</a></div>` : ''}
          ${showNext ? `<div style="margin:8px 0;"><a href="?page=2">Next 5 reviews</a></div>` : ''}
          ${reviewHtml}
        </div>
      </div>
    `;

  const doctype = isWap
    ? '<!DOCTYPE html PUBLIC "-//WAPFORUM//DTD XHTML Mobile 1.0//EN" "http://www.wapforum.org/DTD/xhtml-mobile10.dtd">'
    : '<!DOCTYPE html>';
  const htmlAttrs = isWap ? 'xmlns="http://www.w3.org/1999/xhtml" lang="en"' : 'lang="en"';
  const headExtras = [
    `<title>${escapeHtml(topic[1])}</title>`,
    isWap ? '' : '<meta name="viewport" content="width=device-width; initial-scale=1.0; maximum-scale=1.0;">',
    compactCss,
  ].filter(Boolean);

  return wrapDocument({
    doctype,
    htmlAttrs,
    headExtras,
    bodyContent: body,
  });
}

const schema26Entities = [
  { type: 'Product', name: 'SlatePad 10 tablet', brand: 'Northwind', model: 'SP10' },
  { type: 'LocalBusiness', name: 'Pear Tree Deli', brand: 'Local', model: 'Cafe' },
  { type: 'Hotel', name: 'Harbor View Hotel', brand: 'Harbor View', model: 'Deluxe' },
  { type: 'Software', name: 'NoteFlow Pro', brand: 'NoteFlow', model: 'Desktop' },
  { type: 'Course', name: 'Evening UX Bootcamp', brand: 'Craft School', model: '2023 cohort' },
  { type: 'Movie', name: 'Night Circuit', brand: 'Studio North', model: 'Theatrical' },
  { type: 'Book', name: 'The Practical Field Guide', brand: 'Paperstack', model: 'First edition' },
];

const schema26Bodies = [
  'The page uses the same schema vocabulary Google started encouraging in the rich-snippet era.',
  'The structured data and the visible review text line up cleanly, which is exactly what the page is aiming for.',
  'The design is transitional: modern cards with enough microdata to satisfy search engines.',
  'The reviewer names, stars, and dates all sit in the DOM where microdata parsers expect them.',
  'The layout keeps the reviews readable while preserving the annotation details in the source.',
];

function buildPrompt26Page(pageNum) {
  const rng = createRng(26000 + pageNum);
  const entity = schema26Entities[(pageNum - 1) % schema26Entities.length];
  const reviewCount = intBetween(rng, 5, 20);
  const reviews = makeReviews(rng, reviewCount, {
    authors: genericNames,
    yearRange: [2011, 2016],
    titles: ['Great choice', 'Solid experience', 'Good enough', 'Worth it', 'Nice details'],
    sentences: schema26Bodies,
    minSentences: 1,
    maxSentences: 3,
    locations: genericCities,
    avatarColors,
    extra: (reviewRng, index) => ({
      attributes: chance(reviewRng, 0.45) ? [pick(reviewRng, ['Aspect', 'Category', 'Type', 'Use case']), pick(reviewRng, ['Battery life', 'Service', 'Comfort', 'Performance'])] : null,
      photo: chance(reviewRng, 0.2) ? buildPlaceholderGraphic('review', '#e8f3ff', '#27527a', 220, 140) : '',
      badges: chance(reviewRng, 0.25) ? ['Top reviewer'] : [],
    }),
  });
  const score = averageRating(reviews);
  const type = entity.type === 'LocalBusiness' ? 'https://schema.org/LocalBusiness' : `https://schema.org/${entity.type}`;
  const rootAttrs = `itemscope itemtype="${type}"`;
  const reviewCards = reviews.map((review, index) => {
    const semanticTag = index % 2 === 0 ? 'article' : 'div';
    const reviewType = 'https://schema.org/Review';
    return `
      <${semanticTag} itemscope itemtype="${reviewType}" style="border:1px solid #dde4ed; border-radius:12px; padding:14px; background:#fff; margin-bottom:12px;">
        <div style="display:flex; gap:12px; align-items:flex-start;">
          <img src="${review.avatar}" alt="${escapeHtml(review.author)}" style="width:44px; height:44px; border-radius:50%;">
          <div style="flex:1; min-width:0;">
            <div style="display:flex; justify-content:space-between; gap:8px; flex-wrap:wrap;">
              <span itemprop="author" itemscope itemtype="https://schema.org/Person"><span itemprop="name" style="font-weight:700;">${escapeHtml(review.author)}</span></span>
              <time itemprop="datePublished" datetime="${review.date.toISOString().slice(0, 10)}" style="color:#667;">${escapeHtml(review.dateText)}</time>
            </div>
            <div style="margin:4px 0; color:#f0b429;">${buildStarRow(review.rating)}</div>
            <div itemprop="reviewRating" itemscope itemtype="https://schema.org/Rating">
              <meta itemprop="ratingValue" content="${review.rating}">
              <meta itemprop="bestRating" content="5">
            </div>
            <h3 itemprop="name" style="margin:8px 0 6px; font-size:18px;">${escapeHtml(review.title)}</h3>
            <div itemprop="reviewBody" style="line-height:1.6; color:#27303d;">${escapeHtml(review.body)}</div>
            ${review.extra.badges ? renderBadgeList(review.extra.badges) : ''}
          </div>
        </div>
      </${semanticTag}>
    `;
  }).join('\n');

  const productMarkup = `
    <section style="padding:16px; border:1px solid #d8e0ea; border-radius:14px; background:#fff; margin-bottom:14px;">
      <div style="display:flex; gap:14px; justify-content:space-between; flex-wrap:wrap;">
        <div>
          <div style="font-size:12px; color:#667;">Schema.org review page</div>
          <h1 itemprop="name" style="margin:4px 0 8px; font-size:28px;">${escapeHtml(entity.name)}</h1>
          <div style="color:#556;">${escapeHtml(schema26Bodies[0])}</div>
        </div>
        <div style="min-width:200px; padding:12px 14px; border:1px solid #e5ebf2; border-radius:12px; background:#f7fbff;">
          <div style="font-size:12px; color:#667;">Aggregate rating</div>
          <div itemprop="aggregateRating" itemscope itemtype="https://schema.org/AggregateRating">
            <div style="font-size:30px; font-weight:700; margin:4px 0;">${score.toFixed(1)}</div>
            <div style="color:#f0b429;">${buildStarRow(score)}</div>
            <meta itemprop="ratingValue" content="${score.toFixed(1)}">
            <meta itemprop="reviewCount" content="${reviews.length}">
            <meta itemprop="bestRating" content="5">
          </div>
        </div>
      </div>
      <div style="display:none;" ${rootAttrs}>
        <span itemprop="brand">${escapeHtml(entity.brand)}</span>
        <span itemprop="model">${escapeHtml(entity.model)}</span>
      </div>
    </section>
  `;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': entity.type,
    name: entity.name,
    brand: entity.brand,
    model: entity.model,
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: Number(score.toFixed(1)),
      reviewCount: reviews.length,
      bestRating: 5,
    },
    review: reviews.slice(0, 10).map((review) => ({
      '@type': 'Review',
      author: { '@type': 'Person', name: review.author },
      datePublished: review.date.toISOString().slice(0, 10),
      reviewRating: { '@type': 'Rating', ratingValue: review.rating, bestRating: 5 },
      reviewBody: review.body,
    })),
  };

  const body = `
    <div style="width:min(980px, calc(100% - 24px)); margin:0 auto; padding:18px 0 40px; font-family:system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color:#1f2733;">
      ${renderCommonHero({
        kicker: entity.type,
        title: `${entity.name} Reviews`,
        lede: 'A schema-marked review page from the 2011-2016 microdata era.',
        score,
        reviewCount: reviews.length,
      })}
      ${productMarkup}
      <section aria-label="Reviews" role="list" style="display:grid; gap:12px;">
        ${reviewCards}
      </section>
    </div>
  `;

  return wrapDocument({
    doctype: '<!DOCTYPE html>',
    htmlAttrs: 'lang="en"',
    headExtras: [
      `<title>${escapeHtml(entity.name)} Reviews</title>`,
      '<meta name="description" content="Schema.org microdata review page">',
      chance(rng, 0.6) ? `<script type="application/ld+json">${safeJson(jsonLd)}</script>` : '',
    ].filter(Boolean),
    bodyContent: body,
  });
}

const bootstrap27Products = [
  ['FitTrack Band', 'A fitness tracker page from the Bootstrap 3 era.'],
  ['Echo Dot Mini', 'A smart home device review section in a panel layout.'],
  ['StreamStick 4K', 'A streaming stick review page with Font Awesome stars.'],
  ['BrewMaster One', 'A home appliance review section with a card grid.'],
  ['PixelBook Go', 'A laptop page using cards and media objects.'],
  ['SoundCore Pro', 'A headset review section with badges and pagination.'],
];

const bootstrap27Bodies = [
  'The card layout is exactly what you would expect from that 2013-2017 Bootstrap wave.',
  'The panel heading and the media object make the page feel immediately familiar.',
  'The review text is compact but still detailed enough to be useful.',
  'The star icons and progress bars are doing most of the visual work here.',
  'The page is clean, balanced, and very much of its era.',
];

function buildPrompt27Page(pageNum) {
  const rng = createRng(27000 + pageNum);
  const version = pageNum % 10 < 3 ? 2 : pageNum % 10 < 8 ? 3 : 4;
  const product = bootstrap27Products[(pageNum - 1) % bootstrap27Products.length];
  const reviews = makeReviews(rng, intBetween(rng, 6, 20), {
    authors: genericNames,
    yearRange: [2013, 2017],
    titles: ['Nice upgrade', 'Good value', 'Solid build', 'Would recommend', 'Mostly happy'],
    sentences: bootstrap27Bodies,
    minSentences: 1,
    maxSentences: 3,
    extra: (reviewRng, index) => ({
      badges: chance(reviewRng, 0.35) ? ['Verified purchase'] : [],
      attributes: chance(reviewRng, 0.45) ? ['Pros', pick(reviewRng, ['Easy setup', 'Sharp screen', 'Good battery', 'Responsive app'])] : null,
      photo: chance(reviewRng, 0.18) ? buildPhotoThumbnail('UGC photo', ['#f0d7c3', '#9b5e3c', '#fff']) : '',
    }),
  });
  const score = averageRating(reviews);
  const reviewCount = reviews.length;
  const progressHtml = renderReviewMetricBars(reviews);
  const panelClass = version === 2 ? 'panel' : version === 3 ? 'panel panel-default' : 'card';
  const cardClass = version === 2 ? 'well' : version === 3 ? 'panel panel-default' : 'card';
  const rootClass = version === 2 ? 'row-fluid' : 'row';
  const ratingClass = version === 4 ? 'fa fa-star' : 'glyphicon glyphicon-star';
  const bootstrapLink = version === 4
    ? '<link rel="stylesheet" href="https://stackpath.bootstrapcdn.com/bootstrap/4.6.2/css/bootstrap.min.css">'
    : version === 2
      ? '<link rel="stylesheet" href="https://maxcdn.bootstrapcdn.com/bootstrap/2.3.2/css/bootstrap.min.css">'
      : '<link rel="stylesheet" href="https://maxcdn.bootstrapcdn.com/bootstrap/3.3.7/css/bootstrap.min.css">';
  const faLink = chance(rng, 0.6) ? '<link rel="stylesheet" href="https://maxcdn.bootstrapcdn.com/font-awesome/4.7.0/css/font-awesome.min.css">' : '';
  const semanticReview = chance(rng, 0.45);
  const body = `
    <div class="container" style="padding:18px 0 44px;">
      <div class="row">
        <div class="col-md-12">
          <div class="well" style="background:#fff;">
            <div class="row">
              <div class="${version === 2 ? 'span8' : 'col-md-8'}">
                <h1 style="margin-top:0;">${escapeHtml(product[0])}</h1>
                <div>${escapeHtml(product[1])}</div>
              </div>
              <div class="${version === 2 ? 'span4' : 'col-md-4'}" style="text-align:right;">
                <div style="font-size:12px; color:#667;">Average rating</div>
                <div style="font-size:30px; font-weight:700;">${score.toFixed(1)}</div>
                <div style="color:#f0ad4e;">${buildStarRow(score)}</div>
                <div style="font-size:12px; color:#667;">${reviewCount} reviews</div>
              </div>
            </div>
          </div>
          <div class="btn-group" style="margin-bottom:10px;">
            <button class="btn btn-${version === 4 ? 'success' : 'primary'}">Most Recent</button>
            <button class="btn btn-default">Most Helpful</button>
            <button class="btn btn-default">Highest Rated</button>
          </div>
          <div class="btn-group" style="margin-bottom:10px; float:right;">
            <button class="btn btn-${version === 4 ? 'primary' : 'success'}">Write a Review</button>
          </div>
          <div class="clearfix"></div>
          <div class="row" style="margin-bottom:16px;">
            <div class="col-md-4">
              <div class="panel panel-default">
                <div class="panel-heading">Rating breakdown</div>
                <div class="panel-body">${progressHtml}</div>
              </div>
            </div>
            <div class="col-md-8">
              <div class="panel panel-default">
                <div class="panel-body" style="line-height:1.55;">${version === 4 ? 'Bootstrap 4 cards and media objects defined the look of review sections in this era.' : 'Bootstrap grids and panel classes kept review sections predictable across the web.'}</div>
              </div>
            </div>
          </div>
          <section class="reviews-section" role="list">
            ${reviews.map((review, index) => {
              const card = `
                <div class="${cardClass}"${semanticReview ? ' style="margin-bottom:12px;"' : ''}>
                  <div class="${version === 4 ? 'card-body' : 'panel-body'}">
                    <div class="media">
                      <div class="media-left">
                        <img src="${review.avatar}" class="${version === 4 ? 'rounded-circle' : 'img-circle'}" style="width:50px; height:50px;" alt="${escapeHtml(review.author)}">
                      </div>
                      <div class="media-body">
                        <div style="display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap;">
                          <div>
                            <strong>${escapeHtml(review.author)}</strong>
                            ${review.extra.badges.length ? `<span class="badge" style="margin-left:8px;">Verified Purchase</span>` : ''}
                            <div style="font-size:12px; color:#667;">${escapeHtml(review.dateText)}</div>
                          </div>
                          <div style="color:#f0ad4e; white-space:nowrap;">${Array.from({ length: 5 }, (_, i) => `<i class="${ratingClass}">${i < Math.round(review.rating) ? '★' : '☆'}</i>`).join(' ')}</div>
                        </div>
                        <h3 style="margin:8px 0 6px; font-size:18px;">${escapeHtml(review.title)}</h3>
                        <div style="line-height:1.6;">${escapeHtml(review.body)}</div>
                        ${review.extra.photo ? `<div style="margin-top:10px;"><img src="${review.extra.photo}" alt="" style="max-width:240px; width:100%; border-radius:8px;"></div>` : ''}
                        ${review.extra.attributes ? `<div style="margin-top:10px; font-size:12px; color:#667;"><strong>${escapeHtml(review.extra.attributes[0])}:</strong> ${escapeHtml(review.extra.attributes[1])}</div>` : ''}
                      </div>
                    </div>
                  </div>
                </div>`;
              return semanticReview ? `<article>${card}</article>` : card;
            }).join('\n')}
          </section>
          <ul class="pagination">
            <li class="active"><a href="#">1</a></li>
            <li><a href="#">2</a></li>
            <li><a href="#">3</a></li>
          </ul>
        </div>
      </div>
    </div>
  `;

  const style = `
    <style>
      body { background:#f5f7fb; color:#1f2733; }
      .panel, .card, .well { border-radius: 8px; }
      .reviews-section .media { margin-top: 0; }
      .btn { border-radius: 4px; }
      .pagination > li > a { border-radius: 4px; }
    </style>
  `;

  return wrapDocument({
    doctype: '<!DOCTYPE html>',
    htmlAttrs: 'lang="en"',
    headExtras: [
      `<title>${escapeHtml(product[0])} Reviews</title>`,
      bootstrapLink,
      faLink,
      style,
      '<script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>',
      '<script src="https://maxcdn.bootstrapcdn.com/bootstrap/3.3.7/js/bootstrap.min.js"></script>',
    ].filter(Boolean),
    bodyContent: body,
  });
}

const widget28Products = [
  ['Herbal Shampoo', 'A cruelty-free product with syndicated reviews.'],
  ['Trail Boot', 'Outdoor gear reviews from a vendor widget.'],
  ['Vitamin D3', 'Supplement reviews inside a branded widget.'],
  ['Cordless Drill', 'Hardware reviews with photo thumbnails.'],
  ['Baby Bottle', 'Family product reviews and Q&A.'],
  ['Noise-Canceling Earbuds', 'Electronics accessory reviews with platform branding.'],
];

const widget28Platforms = [
  {
    name: 'Bazaarvoice',
    root: 'BVRRContainer',
    classPrefix: 'bv-',
    footer: 'Powered by Bazaarvoice',
    wrapperClass: 'bv-cv2-cleanslate',
    badge: 'Verified Purchaser',
  },
  {
    name: 'PowerReviews',
    root: 'powerreviews-root',
    classPrefix: 'pr-',
    footer: 'Reviews by PowerReviews',
    wrapperClass: 'p-w-r',
    badge: 'Verified Buyer',
  },
  {
    name: 'Yotpo',
    root: 'yotpo-main-widget',
    classPrefix: 'yotpo-',
    footer: 'Powered by Yotpo',
    wrapperClass: 'yotpo-widget',
    badge: 'Incentivized Review',
  },
  {
    name: 'TrustPilot',
    root: 'trustbox',
    classPrefix: 'tp-',
    footer: 'Reviews powered by Trustpilot',
    wrapperClass: 'tp-widget',
    badge: 'Customer review',
  },
  {
    name: 'Stamped',
    root: 'stamped-main-widget',
    classPrefix: 'stamped-',
    footer: 'Powered by Stamped',
    wrapperClass: 'stamped-widget',
    badge: 'Verified Buyer',
  },
];

function buildPrompt28Page(pageNum) {
  const rng = createRng(28000 + pageNum);
  const platform = widget28Platforms[(pageNum - 1) % widget28Platforms.length];
  const product = widget28Products[(pageNum - 1) % widget28Products.length];
  const reviewCount = intBetween(rng, 5, 25);
  const reviews = makeReviews(rng, reviewCount, {
    authors: genericNames,
    yearRange: [2012, 2019],
    titles: ['Love it', 'Good quality', 'Nice packaging', 'Would buy again', 'Mostly positive'],
    sentences: [
      'The vendor widget keeps the host page tidy while still showing the full review content.',
      'The syndication note makes it feel like a real third-party review feed.',
      'The customer photos and badge system are the main visual signals here.',
      'The platform prefix in the class names is exactly what these integrations looked like.',
    ],
    minSentences: 1,
    maxSentences: 3,
    extra: (reviewRng, index) => ({
      badges: chance(reviewRng, 0.5) ? [platform.badge] : [],
      syndicated: chance(reviewRng, 0.35) ? `Originally posted on ${pick(reviewRng, ['PartnerStore.com', 'RetailerSite.com', 'ExamplePartner.com'])}` : '',
      photo: chance(reviewRng, 0.3) ? buildPhotoThumbnail(`Photo ${index + 1}`) : '',
      qna: chance(reviewRng, 0.18) ? `Q&A: ${pick(reviewRng, ['Does it run quiet?', 'Is the fit true to size?', 'How long does the battery last?'])}` : '',
    }),
  });
  const score = averageRating(reviews);
  const widgetId = platform.root;
  const reviewsHtml = reviews.map((review) => `
    <div class="${platform.classPrefix}content-review" data-rating="${review.rating}" data-review-id="${pageNum}-${review.index}" data-content-locale="en_US" style="padding:14px 0; border-top:1px solid #e5e9f1;">
      <div style="display:flex; gap:12px; align-items:flex-start;">
        <div class="${platform.classPrefix}author-avatar" style="width:42px; height:42px; border-radius:50%; background:#e8eef7; display:flex; align-items:center; justify-content:center; font-weight:700;">${review.author.slice(0, 2).toUpperCase()}</div>
        <div style="flex:1; min-width:0;">
          <div style="display:flex; justify-content:space-between; gap:8px; flex-wrap:wrap;">
            <strong class="${platform.classPrefix}author-name">${escapeHtml(review.author)}</strong>
            <span class="${platform.classPrefix}date" style="color:#667;">${escapeHtml(review.monthYearText)}</span>
          </div>
          <div style="color:#f0b429; margin:4px 0;">${buildStarRow(review.rating)}</div>
          <h3 class="${platform.classPrefix}headline" style="margin:0 0 6px; font-size:18px;">${escapeHtml(review.title)}</h3>
          <div class="${platform.classPrefix}body" style="line-height:1.6;">${escapeHtml(review.body)}</div>
          ${review.extra.photo ? `<img src="${review.extra.photo}" alt="" class="${platform.classPrefix}photo-thumbnail" style="display:block; width:100%; max-width:220px; border-radius:10px; margin-top:10px;">` : ''}
          ${review.extra.syndicated ? `<div class="${platform.classPrefix}syndicated" style="margin-top:8px; font-size:12px; color:#667;">${escapeHtml(review.extra.syndicated)}</div>` : ''}
          ${review.extra.qna ? `<div class="${platform.classPrefix}qna" style="margin-top:8px; font-size:12px; color:#445;">${escapeHtml(review.extra.qna)}</div>` : ''}
          <div class="${platform.classPrefix}footer" style="margin-top:8px; font-size:12px; color:#667;">${renderBadgeList(review.extra.badges)}</div>
        </div>
      </div>
    </div>
  `).join('\n');
  const qnaBlock = chance(rng, 0.45) ? `
    <div style="margin-top:14px; padding:14px; border:1px solid #dfe5ef; border-radius:12px; background:#f9fbff;">
      <strong>Questions & Answers</strong>
      <div style="margin-top:8px; line-height:1.6;">${pick(rng, [
        'Q: Does it fit as expected? A: Most reviews say yes.',
        'Q: Is the scent strong? A: Feedback is mixed but mostly positive.',
        'Q: Is the assembly hard? A: Most buyers said setup is simple.',
      ])}</div>
    </div>
  ` : '';
  const jsonLd = chance(rng, 0.5) ? {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product[0],
    aggregateRating: { '@type': 'AggregateRating', ratingValue: Number(score.toFixed(1)), reviewCount: reviewCount, bestRating: 5 },
  } : null;
  const body = `
    <div style="width:min(1020px, calc(100% - 24px)); margin:0 auto; padding:18px 0 40px;">
      <div style="padding:16px; border:1px solid #d9e1ec; border-radius:14px; background:#fff;">
        <div style="display:flex; justify-content:space-between; gap:14px; flex-wrap:wrap; align-items:flex-start;">
          <div style="min-width:260px;">
            <div style="font-size:12px; color:#667;">Third-party widget embed</div>
            <h1 style="margin:4px 0 6px; font-size:28px;">${escapeHtml(product[0])}</h1>
            <div style="line-height:1.55; color:#445;">${escapeHtml(product[1])}</div>
          </div>
          <div style="min-width:220px; padding:12px 14px; border:1px solid #e3e9f1; border-radius:12px; background:#f7fbff;">
            <div style="font-size:12px; color:#667;">Aggregate rating</div>
            <div style="font-size:30px; font-weight:700; margin:4px 0;">${score.toFixed(1)}</div>
            <div style="color:#f0b429;">${buildStarRow(score)}</div>
            <div style="font-size:12px; color:#667;">${reviewCount} reviews</div>
          </div>
        </div>
      </div>
      <div style="margin-top:14px; padding:16px; border:1px solid #d9e1ec; border-radius:14px; background:#fff;">
        <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:12px;">
          <span style="padding:6px 10px; border-radius:999px; background:#eef3ff;">All Reviews</span>
          <span style="padding:6px 10px; border-radius:999px; background:#eef3ff;">5 Star</span>
          <span style="padding:6px 10px; border-radius:999px; background:#eef3ff;">Verified Buyers</span>
          <span style="padding:6px 10px; border-radius:999px; background:#eef3ff;">With Photos</span>
        </div>
        <div id="${widgetId}" class="${platform.wrapperClass}">
          <div class="${platform.classPrefix}header" style="padding-bottom:12px; border-bottom:1px solid #e5e9f1;">
            <strong>${escapeHtml(platform.name)}</strong>
            <div style="font-size:12px; color:#667;">${escapeHtml(platform.footer)}</div>
          </div>
          <div class="${platform.classPrefix}summary" style="display:grid; grid-template-columns:1.1fr .9fr; gap:14px; margin:14px 0;">
            <div style="padding:12px; background:#f8fbff; border:1px solid #e2e9f4; border-radius:12px;">
              <div style="font-size:12px; color:#667;">Most helpful positive review</div>
              <div style="margin-top:6px; line-height:1.55;">${escapeHtml(reviews[0].body)}</div>
            </div>
            <div style="padding:12px; background:#f8fbff; border:1px solid #e2e9f4; border-radius:12px;">
              <div style="font-size:12px; color:#667;">Most helpful critical review</div>
              <div style="margin-top:6px; line-height:1.55;">${escapeHtml(reviews[Math.min(1, reviews.length - 1)].body)}</div>
            </div>
          </div>
          <div class="${platform.classPrefix}reviews" role="list">
            ${reviewsHtml}
          </div>
          ${qnaBlock}
        </div>
      </div>
      <div style="margin-top:10px; font-size:12px; color:#667;">${escapeHtml(platform.footer)}</div>
    </div>
  `;

  return wrapDocument({
    doctype: '<!DOCTYPE html>',
    htmlAttrs: 'lang="en"',
    headExtras: [
      `<title>${escapeHtml(product[0])} Reviews</title>`,
      chance(rng, 0.5) ? `<script type="application/ld+json">${safeJson(jsonLd)}</script>` : '',
      `<style>.${platform.wrapperClass} { color:#1f2733; } .${platform.wrapperClass} .${platform.classPrefix}reviews { display:grid; gap:0; }</style>`,
    ].filter(Boolean),
    bodyContent: body,
  });
}

const amp29Products = [
  ['Northwind Espresso Machine', 'A product page with AMP review components.'],
  ['TrailRunner Jacket', 'A travel review page rendered as AMP.'],
  ['Glow Serum', 'A beauty review page using amp-list and amp-img.'],
  ['Orbit Speaker', 'A small e-commerce review page with accordions.'],
  ['Fresh Bowls', 'A recipe review page with AMP structured data.'],
];

const amp29Bodies = [
  'The AMP page is lean and the review content is still easy to read.',
  'The aggregate score appears before the review list and the components stay strict.',
  'The canonical link and boilerplate make the page look exactly like a production AMP page.',
  'The fallback and placeholder content are where the review text would stream in.',
  'It feels like a mobile-optimized version of a larger product page.',
];

function buildAmpReviewSection(reviews) {
  return reviews.map((review) => `
    <article style="border-top:1px solid #e5e9f1; padding:12px 0;">
      <div style="display:flex; gap:10px; align-items:flex-start;">
        <amp-img src="${review.avatar}" width="40" height="40" layout="fixed" alt="${escapeHtml(review.author)}" style="border-radius:50%; overflow:hidden;"></amp-img>
        <div style="flex:1; min-width:0;">
          <div style="display:flex; justify-content:space-between; gap:8px; flex-wrap:wrap;">
            <strong>${escapeHtml(review.author)}</strong>
            <time datetime="${review.date.toISOString().slice(0, 10)}">${escapeHtml(review.dateText)}</time>
          </div>
          <div style="color:#f0b429;">${buildStarRow(review.rating, 5, 'text')}</div>
          <h3 style="margin:6px 0 4px; font-size:18px;">${escapeHtml(review.title)}</h3>
          <div style="line-height:1.6;">${escapeHtml(review.body)}</div>
        </div>
      </div>
    </article>
  `).join('\n');
}

function buildPrompt29Page(pageNum) {
  const rng = createRng(29000 + pageNum);
  const product = amp29Products[(pageNum - 1) % amp29Products.length];
  const reviewCount = intBetween(rng, 4, 15);
  const reviews = makeReviews(rng, reviewCount, {
    authors: genericNames,
    yearRange: [2016, 2021],
    titles: ['Great on mobile', 'Fast load', 'Clean presentation', 'Good value', 'Worth reading'],
    sentences: amp29Bodies,
    minSentences: 1,
    maxSentences: 3,
    extra: (reviewRng, index) => ({
      photo: '',
    }),
  });
  const score = averageRating(reviews);
  const componentScripts = [];
  const useAmpList = chance(rng, 0.75);
  const useAmpAccordion = chance(rng, 0.5);
  const useAmpBind = chance(rng, 0.5);
  const useAmpSidebar = chance(rng, 0.35);
  if (useAmpList) {
    componentScripts.push('<script async custom-element="amp-list" src="https://cdn.ampproject.org/v0/amp-list-0.1.js"></script>');
  }
  if (useAmpAccordion) {
    componentScripts.push('<script async custom-element="amp-accordion" src="https://cdn.ampproject.org/v0/amp-accordion-0.1.js"></script>');
  }
  if (useAmpBind) {
    componentScripts.push('<script async custom-element="amp-bind" src="https://cdn.ampproject.org/v0/amp-bind-0.1.js"></script>');
  }
  if (useAmpSidebar) {
    componentScripts.push('<script async custom-element="amp-sidebar" src="https://cdn.ampproject.org/v0/amp-sidebar-0.1.js"></script>');
  }
  const pageJsLd = {
    '@context': 'https://schema.org',
    '@type': pick(rng, ['Product', 'Hotel', 'Recipe', 'LocalBusiness']),
    name: product[0],
    aggregateRating: { '@type': 'AggregateRating', ratingValue: Number(score.toFixed(1)), reviewCount, bestRating: 5 },
    review: reviews.slice(0, 10).map((review) => ({
      '@type': 'Review',
      author: { '@type': 'Person', name: review.author },
      datePublished: review.date.toISOString().slice(0, 10),
      reviewRating: { '@type': 'Rating', ratingValue: review.rating, bestRating: 5 },
      reviewBody: review.body,
    })),
  };
  const ampListBlock = useAmpList ? `
    <amp-list src="https://example.com/api/reviews?product=${pageNum}" layout="responsive" width="400" height="600" ${chance(rng, 0.5) ? 'load-more="auto"' : ''}>
      <template type="amp-mustache">
        <div>{{reviewBody}}</div>
      </template>
      <div fallback>
        ${escapeHtml(reviews[0].body)}
      </div>
    </amp-list>
  ` : '';
  const sidebarBlock = useAmpSidebar ? `
    <amp-sidebar id="sidebar" layout="nodisplay">
      <nav style="padding:16px;"><a href="#">Overview</a><br /><a href="#">Reviews</a><br /><a href="#">Questions</a></nav>
    </amp-sidebar>
  ` : '';
  const accordionBlock = useAmpAccordion ? `
    <amp-accordion>
      <section>
        <h4>Older reviews</h4>
        <div>${escapeHtml(reviews[Math.max(0, reviews.length - 1)].body)}</div>
      </section>
    </amp-accordion>
  ` : '';
  const bindBlock = useAmpBind ? `
    <div class="filters">
      <button [class]="selectedSort == 'helpful' ? 'active' : ''">Helpful</button>
      <button [class]="selectedSort == 'recent' ? 'active' : ''">Recent</button>
      <button [class]="selectedSort == 'rating' ? 'active' : ''">Highest rated</button>
    </div>
  ` : '';
  const fallbackReviewCards = buildAmpReviewSection(reviews);
  const body = `
    <header style="padding:16px; border-bottom:1px solid #e5e9f1;">
      <div style="font-size:12px; color:#667;">AMP review page</div>
      <h1 style="margin:4px 0 8px; font-size:28px;">${escapeHtml(product[0])}</h1>
      <div style="color:#445;">${escapeHtml(product[1])}</div>
      <div style="margin-top:10px; color:#f0b429;">${buildStarRow(score, 5, 'text')}</div>
      <div>${score.toFixed(1)} / 5 &middot; ${reviews.length} reviews</div>
      <a href="/reviews/submit?product=${pageNum}" rel="nofollow">Write a review</a>
    </header>
    ${ampListBlock}
    <section style="padding:16px;">
      <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:12px;">
        <strong>Customer reviews</strong>
        ${bindBlock}
      </div>
      <div style="padding:12px; background:#eff6ff; border:1px solid #dbe7ff; border-radius:12px; margin-bottom:14px;">
        <div style="font-size:12px; color:#667;">AMP summary</div>
        <div style="margin-top:4px; line-height:1.55;">${escapeHtml(pick(rng, amp29Bodies))}</div>
      </div>
      ${sidebarBlock}
      ${accordionBlock}
      ${fallbackReviewCards}
    </section>
  `;

  return wrapDocument({
    doctype: '<!doctype html>',
    htmlAttrs: 'amp lang="en"',
    headExtras: [
      '<meta name="viewport" content="width=device-width,minimum-scale=1,initial-scale=1">',
      '<link rel="canonical" href="https://www.example.com/product/reviews">',
      '<script async src="https://cdn.ampproject.org/v0.js"></script>',
      '<style amp-boilerplate>body{-webkit-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-moz-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-ms-animation:-amp-start 8s steps(1,end) 0s 1 normal both;animation:-amp-start 8s steps(1,end) 0s 1 normal both}@-webkit-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-moz-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-ms-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-o-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}</style>',
      '<noscript><style amp-boilerplate>body{-webkit-animation:none;-moz-animation:none;-ms-animation:none;animation:none}</style></noscript>',
      '<style amp-custom>body{font-family:Arial,sans-serif;margin:0;color:#1f2733;background:#fff;} a{color:#336699;} section article{border-top:1px solid #e5e9f1;}</style>',
      `<script type="application/ld+json">${safeJson(pageJsLd)}</script>`,
      ...componentScripts,
      `<title>${escapeHtml(product[0])} Reviews</title>`,
    ].filter(Boolean),
    bodyContent: body,
  });
}

const spa30Products = [
  ['Next Frontier SaaS', 'A Next.js SSR review section.'],
  ['Vue Harbor App', 'A Nuxt SSR review section.'],
  ['Angular Desk Platform', 'An Angular Universal review section.'],
  ['Svelte Notes', 'A compiled SPA review section.'],
  ['Lit Studio', 'A Lit SSR output with review cards.'],
];

const spa30Bodies = [
  'The server-rendered HTML already includes everything needed before hydration.',
  'The framework fingerprints are obvious in the root attributes and data scripts.',
  'This is the kind of source view where the review content is present before any client code runs.',
  'The page is modern, componentized, and fully annotated for hydration.',
  'The DOM is practical and clean, with a few framework-specific markers mixed in.',
];

function buildPrompt30Page(pageNum) {
  const rng = createRng(30000 + pageNum);
  const framework = ['react', 'vue', 'angular'][pageNum % 3];
  const product = spa30Products[(pageNum - 1) % spa30Products.length];
  const reviews = makeReviews(rng, intBetween(rng, 6, 25), {
    authors: genericNames,
    yearRange: [2016, 2022],
    titles: ['Helpful', 'Detailed', 'Clear', 'Worth reading', 'Pretty solid'],
    sentences: spa30Bodies,
    minSentences: 1,
    maxSentences: 3,
    extra: (reviewRng, index) => ({
      badges: chance(reviewRng, 0.45) ? ['Verified buyer'] : [],
      note: chance(reviewRng, 0.25) ? 'Hydration marker in the source.' : '',
    }),
  });
  const score = averageRating(reviews);
  const reviewJson = reviews.map((review) => ({
    id: `${pageNum}-${review.index}`,
    author: review.author,
    date: review.date.toISOString().slice(0, 10),
    rating: review.rating,
    body: review.body,
  }));
  const schemaLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product[0],
    aggregateRating: { '@type': 'AggregateRating', ratingValue: Number(score.toFixed(1)), reviewCount: reviews.length, bestRating: 5 },
    review: reviewJson.slice(0, 12).map((review) => ({
      '@type': 'Review',
      author: { '@type': 'Person', name: review.author },
      datePublished: review.date,
      reviewRating: { '@type': 'Rating', ratingValue: review.rating, bestRating: 5 },
      reviewBody: review.body,
    })),
  };

  if (framework === 'react') {
    const data = {
      props: {
        pageProps: {
          product: { title: product[0], score: Number(score.toFixed(1)) },
          reviews: reviewJson,
        },
      },
      page: '/products/[id]',
      query: { id: `abc${pageNum}` },
    };
    const cards = reviews.map((review) => `
      <article data-reactid="${pageNum}-${review.index}" class="ReviewCard_container__3xKmP" style="border:1px solid #e5e9f1; border-radius:12px; padding:14px; background:#fff;">
        <div style="display:flex; justify-content:space-between; gap:8px; flex-wrap:wrap;"><strong>${escapeHtml(review.author)}</strong><time>${escapeHtml(review.dateText)}</time></div>
        <div style="color:#f0b429; margin:4px 0;">${buildStarRow(review.rating)}</div>
        <h3 style="margin:6px 0 4px;">${escapeHtml(review.title)}</h3>
        <div>${escapeHtml(review.body)}</div>
      </article>
    `).join('\n');
    return wrapDocument({
      doctype: '<!DOCTYPE html>',
      htmlAttrs: 'lang="en"',
      headExtras: [
        `<title>${escapeHtml(product[0])}</title>`,
        `<script id="__NEXT_DATA__" type="application/json">${safeJson(data)}</script>`,
        `<script>self.__next_f = self.__next_f || []; self.__next_f.push([1, ${safeJson('RSC payload for reviews')}]);</script>`,
      ],
      bodyContent: `
        <div id="__next" data-reactroot style="width:min(980px, calc(100% - 24px)); margin:0 auto; padding:18px 0 40px;">
          ${renderCommonHero({ kicker: 'React SSR', title: product[0], lede: product[1], score, reviewCount: reviews.length })}
          <section role="list" aria-label="Reviews" style="display:grid; gap:12px;">${cards}</section>
        </div>
      `,
    });
  }

  if (framework === 'vue') {
    const nuxt = { data: [{ reviews: reviewJson, product: product[0] }] };
    const cards = reviews.map((review) => `
      <!--[--><div data-v-3a2f5c1d style="border:1px solid #e5e9f1; border-radius:12px; padding:14px; background:#fff;">
        <div style="display:flex; justify-content:space-between; gap:8px; flex-wrap:wrap;"><strong>${escapeHtml(review.author)}</strong><time>${escapeHtml(review.dateText)}</time></div>
        <div style="color:#f0b429; margin:4px 0;">${buildStarRow(review.rating)}</div>
        <h3 style="margin:6px 0 4px;">${escapeHtml(review.title)}</h3>
        <div>${escapeHtml(review.body)}</div>
      </div><!--]-->
    `).join('\n');
    return wrapDocument({
      doctype: '<!DOCTYPE html>',
      htmlAttrs: 'lang="en"',
      headExtras: [
        `<title>${escapeHtml(product[0])}</title>`,
        `<script>window.__NUXT__=${safeJson(nuxt)};</script>`,
      ],
      bodyContent: `
        <div id="__nuxt" data-server-rendered="true" style="width:min(980px, calc(100% - 24px)); margin:0 auto; padding:18px 0 40px;">
          ${renderCommonHero({ kicker: 'Vue SSR', title: product[0], lede: product[1], score, reviewCount: reviews.length })}
          <section role="list" aria-label="Reviews">${cards}</section>
        </div>
      `,
    });
  }

  const cards = reviews.map((review, index) => `
    <!--ng-container--><app-review _nghost-c${index} style="display:block; border:1px solid #e5e9f1; border-radius:12px; padding:14px; background:#fff; margin-bottom:12px;">
      <div _ngcontent-c${index} style="display:flex; justify-content:space-between; gap:8px; flex-wrap:wrap;"><strong>${escapeHtml(review.author)}</strong><time>${escapeHtml(review.dateText)}</time></div>
      <div _ngcontent-c${index} style="color:#f0b429; margin:4px 0;">${buildStarRow(review.rating)}</div>
      <h3 _ngcontent-c${index} style="margin:6px 0 4px;">${escapeHtml(review.title)}</h3>
      <div _ngcontent-c${index}>${escapeHtml(review.body)}</div>
    </app-review>
  `).join('\n');
  return wrapDocument({
    doctype: '<!DOCTYPE html>',
    htmlAttrs: 'lang="en"',
    headExtras: [
      `<title>${escapeHtml(product[0])}</title>`,
      `<script>window.__angular_state__=${safeJson(reviewJson)};</script>`,
    ],
    bodyContent: `
      <app-root ng-version="12.2.0" style="display:block; width:min(980px, calc(100% - 24px)); margin:0 auto; padding:18px 0 40px;">
        ${renderCommonHero({ kicker: 'Angular SSR', title: product[0], lede: product[1], score, reviewCount: reviews.length })}
        <section role="list" aria-label="Reviews">${cards}</section>
      </app-root>
    `,
  });
}

const jam31Products = [
  ['Foundry Kit', 'A JAMstack-generated product page.'],
  ['Lattice CRM', 'A static export with build metadata.'],
  ['Orbit Backpack', 'A modern static site with review cards.'],
  ['Nimbus Notes', 'An Astro or Gatsby review page.'],
  ['Field Guide Pro', 'A Hugo/Eleventy review page.'],
];

const jam31Bodies = [
  'The build artifacts are visible in the HTML and the content is clearly pre-rendered.',
  'This looks like the output of a static pipeline with CMS-fed review data baked in.',
  'The page is semantic, fast, and full of framework fingerprints that static generators tend to leave behind.',
  'The review list is clean, accessible, and clearly part of the build output.',
  'The extra comments and preload hints make the page feel very much like a modern static export.',
];

function buildPrompt31Page(pageNum) {
  const rng = createRng(31000 + pageNum);
  const framework = ['gatsby', 'next', 'astro', 'hugo'][pageNum % 4];
  const product = jam31Products[(pageNum - 1) % jam31Products.length];
  const reviews = makeReviews(rng, intBetween(rng, 6, 30), {
    authors: genericNames,
    yearRange: [2018, 2024],
    titles: ['Static and clean', 'Fast build', 'Very readable', 'Nice export', 'Solid page'],
    sentences: jam31Bodies,
    minSentences: 1,
    maxSentences: 3,
    extra: (reviewRng, index) => ({
      badges: chance(reviewRng, 0.4) ? ['Top reviewer'] : [],
      note: chance(reviewRng, 0.2) ? 'Sourced from Contentful at build time.' : '',
    }),
  });
  const score = averageRating(reviews);
  const reviewJson = reviews.map((review) => ({
    author: review.author,
    date: review.date.toISOString().slice(0, 10),
    rating: review.rating,
    body: review.body,
  }));
  const sharedCards = reviews.map((review) => renderModernReviewCard(review, { className: 'review', titleSize: 17, avatarSize: 38 })).join('\n');
  const headExtras = [`<title>${escapeHtml(product[0])}</title>`, `<script type="application/ld+json">${safeJson({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product[0],
    aggregateRating: { '@type': 'AggregateRating', ratingValue: Number(score.toFixed(1)), reviewCount: reviews.length, bestRating: 5 },
    review: reviewJson.slice(0, 10).map((review) => ({
      '@type': 'Review',
      author: { '@type': 'Person', name: review.author },
      datePublished: review.date,
      reviewRating: { '@type': 'Rating', ratingValue: review.rating, bestRating: 5 },
      reviewBody: review.body,
    })),
  })}</script>`];
  if (framework === 'gatsby') {
    const body = `
      <div class="page" style="width:min(980px, calc(100% - 24px)); margin:0 auto; padding:18px 0 40px;">
        <!-- Gatsby Build: 2024-03-15T10:22:31.000Z -->
        <div class="gatsby-image-wrapper" style="position:relative; overflow:hidden; border-radius:14px; margin-bottom:14px;">
          <img src="${buildPlaceholderGraphic(product[0], '#e9eef7', '#29415d', 1200, 340)}" alt="${escapeHtml(product[0])}" style="display:block; width:100%;">
        </div>
        ${renderCommonHero({ kicker: 'Gatsby', title: product[0], lede: product[1], score, reviewCount: reviews.length })}
        <section role="list" aria-label="Reviews" style="display:grid; gap:12px;">${sharedCards}</section>
      </div>
    `;
    return wrapDocument({
      doctype: '<!DOCTYPE html>',
      htmlAttrs: 'lang="en"',
      headExtras: headExtras.concat([
        '<!-- Reviews loaded from Contentful CMS at build time -->',
      ]),
      bodyContent: body,
    });
  }
  if (framework === 'next') {
    const data = { props: { pageProps: { reviews: reviewJson, product: product[0] } }, page: '/reviews/[product]', buildId: 'abc123XYZ' };
    const body = `
      <div id="__next" style="width:min(980px, calc(100% - 24px)); margin:0 auto; padding:18px 0 40px;">
        ${renderCommonHero({ kicker: 'Next.js export', title: product[0], lede: product[1], score, reviewCount: reviews.length })}
        <section role="list" aria-label="Reviews" style="display:grid; gap:12px;">${sharedCards}</section>
      </div>
    `;
    return wrapDocument({
      doctype: '<!DOCTYPE html>',
      htmlAttrs: 'lang="en"',
      headExtras: headExtras.concat([
        `<script id="__NEXT_DATA__" type="application/json">${safeJson(data)}</script>`,
        '<link rel="preload" as="script" href="/_next/static/chunks/pages/reviews/[product].js">',
      ]),
      bodyContent: body,
    });
  }
  if (framework === 'astro') {
    const body = `
      <div data-astro-cid-abcd1234 style="width:min(980px, calc(100% - 24px)); margin:0 auto; padding:18px 0 40px;">
        <astro-island client="visible" data-astro-cid-abcd1234>
          ${renderCommonHero({ kicker: 'Astro', title: product[0], lede: product[1], score, reviewCount: reviews.length })}
        </astro-island>
        <section role="list" aria-label="Reviews" style="display:grid; gap:12px;">${sharedCards}</section>
      </div>
    `;
    return wrapDocument({
      doctype: '<!DOCTYPE html>',
      htmlAttrs: 'lang="en"',
      headExtras: headExtras.concat([
        '<link rel="preload" as="script" href="/_astro/ReviewCard.XXXXXXXX.js">',
      ]),
      bodyContent: body,
    });
  }
  const body = `
    <div style="width:min(980px, calc(100% - 24px)); margin:0 auto; padding:18px 0 40px;">
      <!-- Generated by Hugo 0.111.3 -->
      ${renderCommonHero({ kicker: 'Eleventy', title: product[0], lede: product[1], score, reviewCount: reviews.length })}
      <section role="list" aria-label="Reviews" style="display:grid; gap:12px;">${sharedCards}</section>
    </div>
  `;
  return wrapDocument({
    doctype: '<!DOCTYPE html>',
    htmlAttrs: 'lang="en"',
    headExtras,
    bodyContent: body,
  });
}

const ai32Products = [
  ['Vertex Earbuds', 'A modern review page with an AI summary block.'],
  ['HomeSense Camera', 'An AI-generated summary for a smart device.'],
  ['Flourish Shampoo', 'A review page with topic pills and sentiment grouping.'],
  ['Brix Coffee', 'A product page with synthesized themes above reviews.'],
  ['Orbit Vacuum', 'A modern page with robot-style summary content.'],
];

const ai32SummaryThemes = [
  'Customers frequently mention easy setup, strong battery life, and solid value.',
  'Most reviews praise the build quality, with a smaller group noting the price.',
  'Buyers tend to like the design and customer service, while mentioning a learning curve.',
  'The product is often described as easy to use, reliable, and more durable than expected.',
];

function buildPrompt32Page(pageNum) {
  const rng = createRng(32000 + pageNum);
  const product = ai32Products[(pageNum - 1) % ai32Products.length];
  const reviews = makeReviews(rng, intBetween(rng, 8, 20), {
    authors: genericNames,
    yearRange: [2022, 2025],
    titles: ['Love it', 'Very good', 'Solid buy', 'Happy with it', 'Nice upgrade'],
    sentences: [
      'The individual reviews still read like normal customer feedback beneath the summary block.',
      'The AI summary is distinct and clearly labeled, which matches the current retail pattern.',
      'The topic chips give the page a useful way to surface the main themes.',
      'The review cards remain readable and modern-looking after the AI panel.',
    ],
    minSentences: 1,
    maxSentences: 3,
    extra: (reviewRng, index) => ({
      badges: chance(reviewRng, 0.5) ? ['Verified Purchase'] : [],
      helpfulText: chance(reviewRng, 0.35) ? `${intBetween(reviewRng, 0, 200)} found this helpful` : '',
    }),
  });
  const score = averageRating(reviews);
  const summaryType = ['bullets', 'paragraph', 'sentiment', 'pills'][pageNum % 4];
  const aiBlock = summaryType === 'bullets'
    ? `<ul style="margin:0; padding-left:18px;">${ai32SummaryThemes.map((theme) => `<li>${escapeHtml(theme)}</li>`).join('')}</ul>`
    : summaryType === 'paragraph'
      ? `<p style="margin:0;">${escapeHtml(pick(rng, ai32SummaryThemes))} ${pick(rng, ['A few people mention the learning curve.', 'Some note the app integration.', 'A handful mention the price is high.'])}</p>`
      : summaryType === 'sentiment'
        ? `<div style="display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px;"><div><strong>Positive themes</strong><ul>${ai32SummaryThemes.slice(0, 2).map((theme) => `<li>${escapeHtml(theme)}</li>`).join('')}</ul></div><div><strong>Negative themes</strong><ul><li>${escapeHtml(pick(rng, ['Setup takes a minute.', 'The app has a few rough edges.', 'Some buyers wanted a lower price.']))}</li></ul></div></div>`
        : `<div style="display:flex; flex-wrap:wrap; gap:8px;">${['Battery life', 'Easy setup', 'Value for money', 'Customer service', 'Durability', 'Sound quality', 'Design'].map((pill) => `<button type="button" style="padding:6px 10px; border:1px solid #d3def2; border-radius:999px; background:#fff;">${pill}</button>`).join('')}</div>`;

  const reviewCards = reviews.map((review) => renderModernReviewCard(review, {
    className: 'review-card',
    titleSize: 18,
    avatarSize: 40,
    starMode: 'img',
  })).join('\n');

  const body = `
    <div style="width:min(980px, calc(100% - 24px)); margin:0 auto; padding:18px 0 40px; font-family:system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color:#1f2733;">
      ${renderCommonHero({ kicker: 'AI-assisted reviews', title: product[0], lede: product[1], score, reviewCount: reviews.length })}
      <section aria-label="AI Review Summary" style="padding:16px; border:1px solid #cfe0ff; border-radius:14px; background:#eff6ff; margin-bottom:14px;">
        <div style="display:flex; gap:10px; align-items:center; margin-bottom:8px;">
          <span style="font-size:20px;">🤖</span>
          <strong>AI-generated from the text of customer reviews</strong>
        </div>
        ${aiBlock}
        ${chance(rng, 0.6) ? '<div style="margin-top:10px; font-size:12px; color:#667;">This summary was generated by AI and may not reflect all customer opinions.</div>' : ''}
        ${chance(rng, 0.45) ? '<div style="margin-top:10px; font-size:12px; color:#667;">Was this summary helpful? <a href="#">Yes</a> <a href="#">No</a></div>' : ''}
      </section>
      <section style="margin-bottom:14px; display:flex; flex-wrap:wrap; gap:8px;">${['All', 'Battery life', 'Easy setup', 'Value for money', 'Customer service', 'Durability'].map((pill) => `<button type="button" style="padding:7px 10px; border:1px solid #d8e2f0; border-radius:999px; background:#fff;">${pill}</button>`).join('')}</section>
      <section role="list" aria-label="Reviews" style="display:grid; gap:12px;">${reviewCards}</section>
    </div>
  `;

  return wrapDocument({
    doctype: '<!DOCTYPE html>',
    htmlAttrs: chance(rng, 0.3) ? 'lang="en" class="dark"' : 'lang="en"',
    headExtras: [
      `<title>${escapeHtml(product[0])} Reviews</title>`,
      `<style>:root{--color-primary:#0070f3; --card-radius:0.75rem;} body{font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;} .review-card{box-shadow:0 1px 2px rgba(15,23,42,.05);}</style>`,
      `<script type="application/ld+json">${safeJson({
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: product[0],
        aggregateRating: { '@type': 'AggregateRating', ratingValue: Number(score.toFixed(1)), reviewCount: reviews.length, bestRating: 5 },
      })}</script>`,
    ],
    bodyContent: body,
  });
}

const video33Products = [
  ['Velvet Lip Tint', 'A TikTok-first beauty product page.'],
  ['Glow Tracker Band', 'A social commerce fitness accessory page.'],
  ['Cozy Throw', 'A home decor page with creator videos.'],
  ['Snap Lens Kit', 'A tech accessory page with short-form reviews.'],
  ['Protein Bites', 'A snack page with video-first UGC.'],
];

const video33Captions = [
  'This really works and the texture is better than expected.',
  'Bought this after seeing it on TikTok and it delivered.',
  'The setup took five minutes and the result looked great on camera.',
  'Short version: I would recommend it without hesitation.',
  'The creator demo matched my own experience pretty closely.',
];

function buildPrompt33Page(pageNum) {
  const rng = createRng(33000 + pageNum);
  const product = video33Products[(pageNum - 1) % video33Products.length];
  const videoCount = intBetween(rng, 6, 20);
  const textCount = intBetween(rng, 3, 10);
  const videoCards = [];
  for (let i = 0; i < videoCount; i += 1) {
    const platform = pick(rng, ['TikTok', 'Instagram', 'YouTube']);
    const handle = `@${pick(rng, ['mari', 'jules', 'sam', 'lex', 'noa', 'kira', 'tina', 'owen'])}${intBetween(rng, 1, 99)}`;
    const thumbs = buildVideoThumbnail(`${platform} ${i + 1}`, ['#111827', platform === 'TikTok' ? '#7c3aed' : platform === 'Instagram' ? '#ef4444' : '#2563eb', '#fff']);
    videoCards.push(`
      <div role="listitem" data-platform="${platform}" data-creator="${handle}" data-video-url="https://example.com/videos/${pageNum}-${i + 1}" style="position:relative; border:1px solid #e3e8f0; border-radius:14px; overflow:hidden; background:#fff;">
        <div style="position:relative; aspect-ratio:9/16; background:#111;">
          <img src="${thumbs}" alt="Video review by ${handle}" loading="lazy" style="display:block; width:100%; height:100%; object-fit:cover;">
          <button class="play-btn" aria-label="Play video review" style="position:absolute; inset:50% auto auto 50%; transform:translate(-50%, -50%); width:54px; height:54px; border-radius:50%; border:none; background:rgba(255,255,255,.92); font-size:20px;">▶</button>
          <span style="position:absolute; top:10px; right:10px; padding:3px 6px; border-radius:999px; background:rgba(0,0,0,.7); color:#fff; font-size:11px;">${String(intBetween(rng, 0, 2))}:${String(intBetween(rng, 15, 59)).padStart(2, '0')}</span>
        </div>
        <div style="padding:10px 10px 12px;">
          <div style="font-size:12px; color:#667;">${platform} · ${intBetween(rng, 12, 240)}K views</div>
          <div style="font-weight:700;">${handle}</div>
          <div style="font-size:12px; color:#667;">${intBetween(rng, 10, 240)}K followers</div>
          <div style="margin-top:6px; line-height:1.5;">${escapeHtml(pick(rng, video33Captions))}</div>
        </div>
      </div>
    `);
  }
  const textReviews = makeReviews(rng, textCount, {
    authors: genericNames,
    yearRange: [2020, 2025],
    titles: ['Loved it', 'Worth it', 'Great on camera', 'Nice surprise', 'Works well'],
    sentences: video33Captions,
    minSentences: 1,
    maxSentences: 2,
    extra: (reviewRng, index) => ({
      badges: chance(reviewRng, 0.4) ? ['Verified buyer'] : [],
    }),
  });
  const score = averageRating(textReviews);
  const textCards = textReviews.map((review) => renderModernReviewCard(review, { className: 'text-review', titleSize: 18, avatarSize: 40 })).join('\n');
  const videoLd = videoCards.slice(0, 8).map((_, index) => ({
    '@type': 'VideoObject',
    name: `${product[0]} video review ${index + 1}`,
    description: product[1],
  }));
  const body = `
    <div style="width:min(1120px, calc(100% - 24px)); margin:0 auto; padding:18px 0 40px; font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; color:#1f2733;">
      ${renderCommonHero({ kicker: 'Video-first UGC', title: product[0], lede: product[1], score, reviewCount: `${videoCount + textCount} total` })}
      <section aria-label="Video reviews" role="list" style="display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px;">
        ${videoCards.join('\n')}
      </section>
      <div style="margin:14px 0; display:flex; flex-wrap:wrap; gap:8px;">
        <button type="button" style="padding:7px 10px; border:1px solid #d8e2f0; border-radius:999px; background:#fff;">All Reviews</button>
        <button type="button" style="padding:7px 10px; border:1px solid #d8e2f0; border-radius:999px; background:#fff;">Video Reviews</button>
        <button type="button" style="padding:7px 10px; border:1px solid #d8e2f0; border-radius:999px; background:#fff;">Photo Reviews</button>
        <button type="button" style="padding:7px 10px; border:1px solid #d8e2f0; border-radius:999px; background:#fff;">Text Reviews</button>
      </div>
      <section style="padding:14px; border:1px solid #d8e2f0; border-radius:14px; background:#fff; margin-bottom:14px;">
        <div style="font-size:12px; color:#667;">Video review counts</div>
        <div style="margin-top:4px;">${videoCount} videos · ${textCount} text reviews</div>
      </section>
      <section role="list" aria-label="Text reviews" style="display:grid; gap:12px;">${textCards}</section>
    </div>
  `;

  return wrapDocument({
    doctype: '<!DOCTYPE html>',
    htmlAttrs: 'lang="en"',
    headExtras: [
      `<title>${escapeHtml(product[0])} Reviews</title>`,
      `<script type="application/ld+json">${safeJson({
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: product[0],
        aggregateRating: { '@type': 'AggregateRating', ratingValue: Number(score.toFixed(1)), reviewCount: videoCount + textCount, bestRating: 5 },
        video: videoLd,
      })}</script>`,
      '<style>body{margin:0;background:#fff;color:#1f2733;} @media (max-width: 900px){section[aria-label="Video reviews"]{grid-template-columns:repeat(2,minmax(0,1fr)) !important;}} @media (max-width: 640px){section[aria-label="Video reviews"]{grid-template-columns:1fr !important;}}</style>',
    ],
    bodyContent: body,
  });
}

const social34Products = [
  ['Glow Serum', 'A Shopify-era DTC review section.'],
  ['Cloud Tee', 'An apparel page with photo UGC.'],
  ['Morning Blend', 'A coffee brand review section.'],
  ['Pet Collar', 'A pet product page with social proof.'],
  ['Room Mist', 'A home goods page with app-powered reviews.'],
];

const social34Bodies = [
  'The photo strip makes the page feel like a real social commerce storefront.',
  'The review cards are structured with attribute fields and strong social proof.',
  'The whole section reads like an Okendo or Loox widget embedded on a DTC site.',
  'The layout is aspirational but still practical for scanning a lot of feedback quickly.',
];

function buildPrompt34Page(pageNum) {
  const rng = createRng(34000 + pageNum);
  const product = social34Products[(pageNum - 1) % social34Products.length];
  const reviewCount = intBetween(rng, 8, 30);
  const reviews = makeReviews(rng, reviewCount, {
    authors: genericNames,
    yearRange: [2020, 2025],
    titles: ['Love it', 'Perfect', 'So good', 'Nice quality', 'Would repurchase'],
    sentences: social34Bodies,
    minSentences: 1,
    maxSentences: 3,
    locations: genericCities,
    extra: (reviewRng, index) => ({
      badges: chance(reviewRng, 0.55) ? ['Verified Buyer'] : [],
      attributes: [pick(reviewRng, ['What I love', 'Would recommend to', 'My skin type', 'Size purchased']), pick(reviewRng, ['The fit', 'Dry skin', 'Small', 'Daily use'])],
      photo: chance(reviewRng, 0.55) ? buildPhotoThumbnail(`Photo ${index + 1}`) : '',
      helpfulText: chance(reviewRng, 0.35) ? `${intBetween(reviewRng, 0, 120)} found this helpful` : '',
    }),
  });
  const score = averageRating(reviews);
  const photoStrip = reviews.slice(0, Math.min(8, reviews.length)).map((review, index) => `
    <div style="flex:0 0 120px; scroll-snap-align:start; position:relative;">
      <img src="${review.extra.photo || buildPhotoThumbnail(`UGC ${index + 1}`)}" alt="" loading="lazy" style="width:120px; height:120px; border-radius:12px; object-fit:cover;">
      <span style="position:absolute; left:8px; bottom:8px; padding:2px 6px; border-radius:999px; background:rgba(0,0,0,.65); color:#fff; font-size:11px;">${escapeHtml(review.author.slice(0, 2).toUpperCase())}</span>
    </div>
  `).join('');
  const reviewCards = reviews.map((review) => `
    <article role="listitem" style="display:grid; grid-template-columns:auto 1fr; gap:12px; border-top:1px solid #ece6dd; padding:14px 0;">
      <img src="${review.avatar}" alt="${escapeHtml(review.author)}" style="width:46px; height:46px; border-radius:50%;">
      <div style="min-width:0;">
        <div style="display:flex; justify-content:space-between; gap:8px; flex-wrap:wrap;">
          <div>
            <strong>${escapeHtml(review.author)}</strong> <span style="color:#667;">${escapeHtml(review.location)}</span>
            <div style="font-size:12px; color:#667;">${escapeHtml(review.dateText)}</div>
          </div>
          <div style="color:#f0b429;">${buildStarRow(review.rating)}</div>
        </div>
        <h3 style="margin:8px 0 6px; font-size:18px;">${escapeHtml(review.title)}</h3>
        <div style="line-height:1.6;">${escapeHtml(review.body)}</div>
        <dl style="display:grid; grid-template-columns:1fr 1fr; gap:6px 14px; margin:10px 0 0;">
          <dt style="font-size:12px; color:#667;">${escapeHtml(review.extra.attributes[0])}</dt>
          <dd style="margin:0;">${escapeHtml(review.extra.attributes[1])}</dd>
        </dl>
        ${review.extra.photo ? `<img src="${review.extra.photo}" alt="" loading="lazy" style="display:block; width:100%; max-width:240px; border-radius:12px; margin-top:10px;">` : ''}
        ${review.extra.helpfulText ? `<div style="font-size:12px; color:#667; margin-top:8px;">${escapeHtml(review.extra.helpfulText)}</div>` : ''}
        ${review.extra.badges.length ? renderBadgeList(review.extra.badges) : ''}
      </div>
    </article>
  `).join('\n');

  return wrapDocument({
    doctype: '<!DOCTYPE html>',
    htmlAttrs: 'lang="en"',
    headExtras: [
      `<title>${escapeHtml(product[0])} Reviews</title>`,
      '<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet">',
      `<script type="application/ld+json">${safeJson({
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: product[0],
        aggregateRating: { '@type': 'AggregateRating', ratingValue: Number(score.toFixed(1)), reviewCount: reviews.length, bestRating: 5 },
      })}</script>`,
      '<style>body{margin:0;font-family:\'DM Sans\',sans-serif;background:#fff;color:#1f2733;} .photo-strip{display:flex; overflow-x:auto; gap:8px; scroll-snap-type:x mandatory; padding-bottom:4px;} .review-card{border-top:1px solid #ece6dd;}</style>',
    ],
    bodyContent: `
      <div data-section-id="reviews-${pageNum}" data-section-type="reviews" style="width:min(1040px, calc(100% - 24px)); margin:0 auto; padding:18px 0 40px;">
        ${renderCommonHero({ kicker: 'Shopify / app output', title: product[0], lede: product[1], score, reviewCount: reviews.length })}
        <section style="padding:14px 0; border-top:1px solid #ece6dd; border-bottom:1px solid #ece6dd;">
          <div style="font-size:12px; color:#667; margin-bottom:8px;">Community Photos</div>
          <div class="photo-strip">${photoStrip}</div>
        </section>
        <section style="margin-top:14px; display:flex; flex-wrap:wrap; gap:8px;">
          ${['All Stars', '★★★★★', '★★★★', 'With Photos', 'Verified Buyers'].map((chip) => `<button type="button" style="padding:7px 10px; border:1px solid #e3d9c8; border-radius:999px; background:#fff;">${chip}</button>`).join('')}
        </section>
        <section role="list" aria-label="Customer reviews" style="margin-top:14px;">${reviewCards}</section>
        <div style="margin-top:14px; font-size:12px; color:#667;">Powered by ${escapeHtml(['Okendo', 'Loox', 'Judge.me', 'Stamped'][pageNum % 4])}</div>
      </div>
    `,
  });
}

function renderMinimal35Card(review, mode) {
  const bodyText = review.body;
  const star = mode === 'number' ? `${review.rating.toFixed(1)}` : buildStarRow(review.rating, 5, 'text');
  return `
    <div style="border:1px solid #e4e9f1; border-radius:12px; padding:12px; background:#fff;">
      <div style="display:flex; justify-content:space-between; gap:8px; flex-wrap:wrap;">
        <strong>${escapeHtml(review.author)}</strong>
        <div>${star}</div>
      </div>
      <div style="font-size:12px; color:#667;">${escapeHtml(review.dateText)}</div>
      ${review.title ? `<div style="font-weight:700; margin-top:6px;">${escapeHtml(review.title)}</div>` : ''}
      <div style="margin-top:6px;">${bodyText ? escapeHtml(bodyText) : ''}</div>
      ${review.extra.helpfulText ? `<div style="font-size:12px; color:#667; margin-top:4px;">${escapeHtml(review.extra.helpfulText)}</div>` : ''}
    </div>
  `;
}

function buildPrompt35Page(pageNum) {
  const rng = createRng(35000 + pageNum);
  const style = ['legacy', 'bootstrap', 'modern', 'amp'][pageNum % 4];
  const count = intBetween(rng, 8, 30);
  const reviews = makeReviews(rng, count, {
    authors: genericNames,
    yearRange: [2017, 2025],
    titles: ['', 'Great product', '', 'Works', 'Good enough'],
    sentences: ['Good.', 'Excellent.', 'Meh.', 'Perfect!', 'Disappointed.', 'Love it!', 'Highly recommended.', 'Fast shipping.'],
    minSentences: 0,
    maxSentences: 1,
    extra: (reviewRng, index) => ({
      helpfulText: chance(reviewRng, 0.35) ? `${intBetween(reviewRng, 0, 35)} found this helpful` : '',
    }),
  });
  const score = averageRating(reviews);
  const mode = chance(rng, 0.5) ? 'number' : 'stars';
  const cards = reviews.map((review) => renderMinimal35Card(review, mode)).join('\n');
  const hiddenCards = reviews.slice(0, 5).map((review) => renderMinimal35Card({ ...review, body: '' }, mode)).join('\n');
  const modernSection = `
    <section style="margin-top:14px;">
      <div style="padding:12px; border:1px solid #dbe3ef; border-radius:12px; background:#fff;">
        <div style="font-size:12px; color:#667;">Most helpful reviews</div>
        <div style="display:grid; gap:10px; margin-top:10px;">${hiddenCards}</div>
      </div>
      <div style="margin-top:14px; padding:12px; border:1px solid #dbe3ef; border-radius:12px; background:#fff;">
        <div style="font-size:12px; color:#667;">Recent reviews</div>
        <div style="display:grid; gap:10px; margin-top:10px;">${cards}</div>
      </div>
    </section>
  `;
  const legacySection = `
    <table width="100%" cellpadding="6" cellspacing="0" border="0" style="border:1px solid #ccc; background:#fff;">
      <tr><td><b>${escapeHtml(reviews[0].title || 'Great product')}</b><br />${escapeHtml(reviews[0].body)}</td></tr>
    </table>
    <table width="100%" cellpadding="6" cellspacing="0" border="0" style="border:1px solid #ccc; background:#fff; margin-top:10px;">
      <tr><td>${cards}</td></tr>
    </table>
  `;
  const ampSection = `
    <div style="padding:12px; border:1px solid #dbe3ef; border-radius:12px; background:#fff;">
      <div style="font-size:12px; color:#667;">AMP-like score view</div>
      <div style="font-size:26px; font-weight:700;">${score.toFixed(1)}</div>
      <div>${cards}</div>
    </div>
  `;
  const body = `
    <div style="width:min(980px, calc(100% - 24px)); margin:0 auto; padding:18px 0 40px; font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
      ${renderCommonHero({ kicker: 'Sparse reviews', title: 'Minimal-signal reviews', lede: 'A review section with structure intact but almost no written content.', score, reviewCount: reviews.length })}
      ${style === 'legacy' ? legacySection : style === 'bootstrap' ? modernSection : style === 'amp' ? ampSection : modernSection}
    </div>
  `;
  const headExtras = [
    `<title>Sparse reviews ${pageNum}</title>`,
    chance(rng, 0.4) ? `<script type="application/ld+json">${safeJson({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: 'Minimal-signal reviews',
      aggregateRating: { '@type': 'AggregateRating', ratingValue: Number(score.toFixed(1)), reviewCount: reviews.length, bestRating: 5 },
    })}</script>` : '',
  ].filter(Boolean);
  return wrapDocument({
    doctype: '<!DOCTYPE html>',
    htmlAttrs: 'lang="en"',
    headExtras,
    bodyContent: body,
  });
}

function buildPrompt36Page(pageNum) {
  const rng = createRng(36000 + pageNum);
  const count = intBetween(rng, 5, 20);
  const product = pick(rng, ['Aurora Headphones', 'Slate Tablet', 'Nimbus Coffee', 'Trail Jacket', 'Mosaic Lamp']);
  const reviews = makeReviews(rng, count, {
    authors: genericNames,
    yearRange: [2018, 2025],
    titles: ['', 'Great product', '', 'Solid', 'Worth it'],
    sentences: ['The structure is obvious even without extra labels.', 'That row is doing the heavy lifting on mobile.', 'The page keeps the reviews clear enough for humans.'],
    minSentences: 1,
    maxSentences: 3,
    avatar: false,
    extra: (reviewRng) => ({
      mode: pick(reviewRng, ['stars', 'numeric', 'img']),
    }),
  });
  const score = averageRating(reviews);
  const rows = reviews.map((review, index) => {
    const rating = review.extra.mode === 'numeric' ? `${Math.round(review.rating)}/5 stars` : review.extra.mode === 'img' ? `<img src="${fullStarUri}" width="14" height="14"><img src="${fullStarUri}" width="14" height="14"><img src="${fullStarUri}" width="14" height="14"><img src="${emptyStarUri}" width="14" height="14"><img src="${emptyStarUri}" width="14" height="14">` : '★★★★☆';
    if (index % 4 === 0) {
      return `<table width="100%" cellpadding="8" cellspacing="0" border="0" style="border:1px solid #ccc; margin-bottom:10px;"><tr><td width="20%">${rating}</td><td><b>${escapeHtml(review.title || 'Great product')}</b><p>${escapeHtml(review.body)}</p><p>By: ${escapeHtml(review.author)} — ${escapeHtml(review.dateText)}</p></td></tr></table>`;
    }
    if (index % 4 === 1) {
      return `<div style="display:flex; gap:12px; padding:12px; border:1px solid #ccc; margin-bottom:10px;"><div style="min-width:110px;">${rating}<br /><b>${escapeHtml(review.author)}</b></div><div><b>${escapeHtml(review.title || 'Review')}</b><p>${escapeHtml(review.body)}</p></div></div>`;
    }
    if (index % 4 === 2) {
      return `<ul style="border:1px solid #ccc; margin-bottom:10px; padding:10px 18px;"><li><b>${escapeHtml(review.author)}</b> ${rating}</li><li>${escapeHtml(review.body)}</li></ul>`;
    }
    return `<dl style="border:1px solid #ccc; margin-bottom:10px; padding:10px;"><dt><b>${escapeHtml(review.author)}</b></dt><dd>${rating}</dd><dt>Review</dt><dd>${escapeHtml(review.body)}</dd></dl>`;
  }).join('\n');
  const body = `
    <div style="padding:18px;">
      <h1 style="margin:0 0 8px;">${escapeHtml(product)}</h1>
      <p>Aggregate score: ${score.toFixed(1)} / 5</p>
      ${rows}
    </div>
  `;
  return wrapDocument({
    doctype: '<!DOCTYPE html>',
    htmlAttrs: 'lang="en"',
    headExtras: [`<title>${escapeHtml(product)}</title>`],
    bodyContent: body,
  });
}

function buildPrompt37Page(pageNum) {
  const rng = createRng(37000 + pageNum);
  const product = pick(rng, ['Herbal Cleanse', 'SEO Booster Pro', 'DropShip Blender', 'Hydration Capsule', 'Weight Loss Tea']);
  const reviews = makeReviews(rng, intBetween(rng, 10, 22), {
    authors: genericNames.concat(['User123456', 'Customer_7891011', 'Buyer_20230415']),
    yearRange: [2021, 2025],
    titles: ['Amazing!', 'Great value', 'Perfect', 'Best ever', 'Highly recommend'],
    sentences: [
      `This ${product} ${product.toLowerCase()} is the best ${product} I have ever used for everyday use.`,
      `If you're looking for ${product} near your location, this is the best option.`,
      'Great product! Love it. Would recommend.',
      'Excellent quality. Fast shipping. 5 stars.',
      'Perfect. Exactly as described. Very happy.',
      'I received this product free in exchange for my honest review.',
    ],
    minSentences: 1,
    maxSentences: 2,
    extra: (reviewRng, index) => ({
      badges: chance(reviewRng, 0.55) ? ['Verified'] : [],
      disclosure: chance(reviewRng, 0.25) ? 'Incentivized review' : '',
      hidden: chance(reviewRng, 0.15),
    }),
  });
  const score = reviews.reduce((sum, review) => sum + 5, 0) / reviews.length;
  const visible = reviews.map((review, index) => `
    <div style="border:1px solid #e0e6ee; border-radius:12px; padding:14px; background:#fff; margin-bottom:10px;">
      <div style="display:flex; justify-content:space-between; gap:8px; flex-wrap:wrap;"><strong>${escapeHtml(review.author)}</strong><span style="color:#f0b429;">${buildStarRow(5)}</span></div>
      <div style="font-size:12px; color:#667;">${escapeHtml(review.dateText)}</div>
      <h3 style="margin:6px 0 4px;">${escapeHtml(review.title)}</h3>
      <div style="line-height:1.6;">${escapeHtml(review.body)}</div>
      ${review.extra.disclosure ? `<div style="font-size:12px; color:#667; margin-top:6px;">[DISCLAIMER: ${escapeHtml(review.extra.disclosure)}]</div>` : ''}
      ${chance(rng, 0.3) ? '<div style="font-size:12px; color:#667; margin-top:6px;">Review removed by moderator</div>' : ''}
    </div>
  `).join('\n');
  const body = `
    <div style="width:min(980px, calc(100% - 24px)); margin:0 auto; padding:18px 0 40px; font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
      ${renderCommonHero({ kicker: 'Spam-contaminated reviews', title: product, lede: 'A review page polluted with keyword stuffing, fake verified reviews, and disclosure clutter.', score, reviewCount: reviews.length })}
      <section style="padding:12px; border:1px solid #dbe3ef; border-radius:12px; background:#fff; margin-bottom:14px;">
        <div style="font-size:12px; color:#667;">How was your experience?</div>
        <div style="margin-top:8px; display:flex; gap:8px; flex-wrap:wrap;"><a href="#">Great</a><a href="/support">Not great</a><a href="#">Neutral</a></div>
      </section>
      <section style="display:grid; gap:10px;">${visible}</section>
      ${chance(rng, 0.35) ? `<div style="margin-top:12px; font-size:12px; color:#667;">${intBetween(rng, 2, 12)} reviews hidden â€” these reviews do not meet our content policy.</div>` : ''}
    </div>
  `;
  return wrapDocument({
    doctype: '<!DOCTYPE html>',
    htmlAttrs: 'lang="en"',
    headExtras: [
      `<title>${escapeHtml(product)} Reviews</title>`,
      `<script type="application/ld+json">${safeJson({
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: product,
        aggregateRating: { '@type': 'AggregateRating', ratingValue: 5, reviewCount: reviews.length, bestRating: 5 },
      })}</script>`,
    ],
    bodyContent: body,
  });
}

function buildPrompt38Page(pageNum) {
  const rng = createRng(38000 + pageNum);
  const product = pick(rng, ['Pro Research Platform', 'G2 Enterprise', 'Medical Device Review Hub', 'Financial Advisory Tool', 'Learning Platform']);
  const reviews = makeReviews(rng, intBetween(rng, 5, 16), {
    authors: genericNames,
    yearRange: [2020, 2025],
    titles: ['Strong platform', 'Good support', 'Useful results', 'Worth it', 'Clear value'],
    sentences: [
      'The review cards are present in the DOM, but the paywall makes the content harder to access.',
      'The blur overlay and login CTA are the main visual signals here.',
      'The structure remains visible even though the content is gated.',
    ],
    minSentences: 1,
    maxSentences: 2,
    extra: (reviewRng, index) => ({
      lock: chance(reviewRng, 0.45),
    }),
  });
  const score = averageRating(reviews);
  const gateMode = pageNum % 6;
  const visibleCount = gateMode === 0 ? 0 : gateMode === 1 ? 1 : gateMode === 2 ? 2 : gateMode === 3 ? 3 : gateMode === 4 ? 4 : 2;
  const visibleHtml = reviews.slice(0, visibleCount).map((review) => `
    <article style="border:1px solid #dbe3ef; border-radius:12px; padding:14px; background:#fff; margin-bottom:10px;">
      <div style="display:flex; justify-content:space-between; gap:8px; flex-wrap:wrap;"><strong>${escapeHtml(review.author)}</strong><span style="color:#f0b429;">${buildStarRow(review.rating)}</span></div>
      <div style="font-size:12px; color:#667;">${escapeHtml(review.dateText)}</div>
      <h3 style="margin:6px 0 4px;">${escapeHtml(review.title)}</h3>
      <div style="line-height:1.6;">${escapeHtml(review.body)}</div>
    </article>
  `).join('\n');
  const lockedHtml = reviews.slice(visibleCount).map((review) => `
    <article style="border:1px solid #dbe3ef; border-radius:12px; padding:14px; background:#fff; margin-bottom:10px; filter:blur(4px); pointer-events:none;">
      <div style="display:flex; justify-content:space-between; gap:8px; flex-wrap:wrap;"><strong>${escapeHtml(review.author)}</strong><span style="color:#f0b429;">${buildStarRow(review.rating)}</span></div>
      <div style="font-size:12px; color:#667;">${escapeHtml(review.dateText)}</div>
      <h3 style="margin:6px 0 4px;">${escapeHtml(review.title)}</h3>
      <div style="line-height:1.6;">${escapeHtml(review.body)}</div>
    </article>
  `).join('\n');
  const overlayText = ['Sign in to read all reviews', 'Subscribe to access full reviews', 'Join free to unlock reviews', 'Create an account to continue'][gateMode % 4];
  const body = `
    <div style="width:min(980px, calc(100% - 24px)); margin:0 auto; padding:18px 0 40px; font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
      ${renderCommonHero({ kicker: 'Gated reviews', title: product, lede: 'A review section whose content is visible in the DOM but visually obstructed by access barriers.', score, reviewCount: reviews.length })}
      <section style="position:relative; padding:14px; border:1px solid #dbe3ef; border-radius:14px; background:#fff;">
        <div style="margin-bottom:12px;">Showing ${visibleCount} of ${reviews.length} reviews. Sign in to see all reviews.</div>
        <div>${visibleHtml}</div>
        <div style="position:relative;">
          <div style="filter: blur(4px); pointer-events:none;">${lockedHtml}</div>
          <div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; background:rgba(255,255,255,.72);">
            <div style="padding:16px 18px; border:1px solid #cfd8e7; border-radius:12px; background:#fff; text-align:center;">
              <strong>${escapeHtml(overlayText)}</strong>
              <div style="margin-top:8px;"><a href="/login">Sign in</a> or <a href="/signup">create a free account</a></div>
            </div>
          </div>
        </div>
      </section>
    </div>
  `;
  return wrapDocument({
    doctype: '<!DOCTYPE html>',
    htmlAttrs: 'lang="en"',
    headExtras: [
      `<title>${escapeHtml(product)} Reviews</title>`,
      `<script type="application/ld+json">${safeJson({
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: product,
        aggregateRating: { '@type': 'AggregateRating', ratingValue: Number(score.toFixed(1)), reviewCount: reviews.length, bestRating: 5 },
      })}</script>`,
    ],
    bodyContent: body,
  });
}

function buildPrompt39Page(pageNum) {
  const rng = createRng(39000 + pageNum);
  const product = pick(rng, ['Obsidian Speaker', 'Atlas Vacuum', 'Kite Backpack', 'Halo Lamp', 'Forge Keyboard']);
  const reviews = makeReviews(rng, intBetween(rng, 5, 20), {
    authors: genericNames,
    yearRange: [2019, 2025],
    titles: ['Good', 'Worth it', 'Solid', 'Nice', 'Recommended'],
    sentences: [
      'The content is readable, but the structure is intentionally unconventional.',
      'The markup looks like it came from a CSS-in-JS bundle or a fragment-heavy renderer.',
      'The reviews are assembled visually even when the DOM order looks strange.',
    ],
    minSentences: 1,
    maxSentences: 3,
    extra: (reviewRng, index) => ({
      hash: pick(reviewRng, ['sc-bdXxxt kqWRSM', 'css-1a2b3c4', 'MuiBox-root css-1tu83q9', 'emotion-0']),
      type: pick(reviewRng, ['nav', 'table', 'details', 'aside', 'form']),
      obf: `ts-obf-${intBetween(reviewRng, 1000000, 2147483647)}`,
    }),
  });
  const score = averageRating(reviews);
  const cards = reviews.map((review, index) => {
    const svg = svgDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 18">
        <polygon points="9,1 11.8,6.1 17.6,6.6 13.3,10.3 14.5,16.1 9,13.3 3.5,16.1 4.7,10.3 .4,6.6 6.2,6.1" fill="#f0b429"/>
        <polygon points="31,1 33.8,6.1 39.6,6.6 35.3,10.3 36.5,16.1 31,13.3 25.5,16.1 26.7,10.3 22.4,6.6 28.2,6.1" fill="#f0b429"/>
        <polygon points="53,1 55.8,6.1 61.6,6.6 57.3,10.3 58.5,16.1 53,13.3 47.5,16.1 48.7,10.3 44.4,6.6 50.2,6.1" fill="#f0b429"/>
        <polygon points="75,1 77.8,6.1 83.6,6.6 79.3,10.3 80.5,16.1 75,13.3 69.5,16.1 70.7,10.3 66.4,6.6 72.2,6.1" fill="#f0b429"/>
      </svg>
    `);
    const block = `
      <div class="${review.extra.hash}" data-r7x2="${Math.round(review.rating)}" data-r9x9="${review.extra.obf}" style="border:1px solid #dbe3ef; border-radius:12px; padding:14px; background:#fff; margin-bottom:10px;">
        <div style="display:flex; justify-content:space-between; gap:8px; flex-wrap:wrap;">
          <strong>${escapeHtml(review.author)}</strong>
          <img src="${svg}" width="96" height="18" alt="">
        </div>
        <div style="font-size:12px; color:#667;">${escapeHtml(review.dateText)}</div>
        <div style="display:flex; gap:10px; margin-top:8px;">
          <div style="flex:1; order:${index % 2 === 0 ? 2 : 1};">${escapeHtml(review.body)}</div>
          <div style="flex:0 0 140px; order:${index % 2 === 0 ? 1 : 2}; color:#667;">${escapeHtml(review.title)}</div>
        </div>
      </div>
    `;
    if (review.extra.type === 'nav') {
      return `<nav class="${review.extra.hash}" style="margin-bottom:10px;">${block}</nav>`;
    }
    if (review.extra.type === 'table') {
      return `<table class="${review.extra.hash}" style="width:100%; margin-bottom:10px; border-collapse:collapse;"><tr><td>${block}</td></tr></table>`;
    }
    if (review.extra.type === 'details') {
      return `<details class="${review.extra.hash}" style="margin-bottom:10px;"><summary>Product info</summary>${block}</details>`;
    }
    if (review.extra.type === 'aside') {
      return `<aside class="${review.extra.hash}" style="margin-bottom:10px;">${block}</aside>`;
    }
    return `<form class="${review.extra.hash}" style="margin-bottom:10px;">${block}</form>`;
  }).join('\n');
  return wrapDocument({
    doctype: '<!DOCTYPE html>',
    htmlAttrs: 'lang="en"',
    headExtras: [
      `<title>${escapeHtml(product)} Reviews</title>`,
      '<style>.sc-bdXxxt.kqWRSM, .css-1a2b3c4, .MuiBox-root.css-1tu83q9, .emotion-0 { color:#1f2733; }</style>',
    ],
    bodyContent: `
      <div style="width:min(980px, calc(100% - 24px)); margin:0 auto; padding:18px 0 40px; font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
        <h1>${escapeHtml(product)}</h1>
        <div>Review section with intentionally obfuscated markup.</div>
        <div style="margin:10px 0; font-weight:700;">${score.toFixed(1)} / 5</div>
        ${cards}
      </div>
    `,
  });
}

function buildPrompt40Page(pageNum) {
  const rng = createRng(40000 + pageNum);
  const framework = ['hydrogen', 'next', 'medusa'][pageNum % 3];
  const product = pick(rng, ['Hydrogen Coat', 'Remix Kettle', 'Next Commerce Bag', 'Medusa Candle', 'Vercel Hoodie']);
  const reviews = makeReviews(rng, intBetween(rng, 5, 15), {
    authors: genericNames,
    yearRange: [2020, 2025],
    titles: ['Great', 'Solid', 'Worth it', 'Loved it', 'Nice product'],
    sentences: [
      'The headless storefront renders the review section with data islands and hydration markers.',
      'The SSR output includes the framework fingerprints you would expect from a modern commerce stack.',
      'The review cards are fully readable even before any client-side code runs.',
    ],
    minSentences: 1,
    maxSentences: 3,
    extra: (reviewRng, index) => ({
      badges: chance(reviewRng, 0.45) ? ['Verified Purchase'] : [],
      helpfulText: chance(reviewRng, 0.35) ? `${intBetween(reviewRng, 0, 140)} found this helpful` : '',
    }),
  });
  const score = averageRating(reviews);
  const reviewCards = reviews.map((review) => renderModernReviewCard(review, {
    className: 'review-card rounded-md border bg-card text-card-foreground shadow-sm',
    titleSize: 17,
    avatarSize: 38,
  })).join('\n');
  const sharedData = reviews.map((review) => ({
    id: `gid://shopify/ProductReview/${pageNum}-${review.index}`,
    body: review.body,
    rating: review.rating,
  }));
  const bodyCommon = `
    <main style="width:min(1040px, calc(100% - 24px)); margin:0 auto; padding:18px 0 40px; font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; color:#1f2733;">
      ${renderCommonHero({ kicker: 'Headless commerce', title: product, lede: 'API-first storefront review output with SSR markers and data islands.', score, reviewCount: reviews.length })}
      <section aria-label="Reviews" role="list" aria-live="polite" style="display:grid; gap:12px;">${reviewCards}</section>
    </main>
  `;
  if (framework === 'hydrogen') {
    return wrapDocument({
      doctype: '<!DOCTYPE html>',
      htmlAttrs: 'data-wf-locale="en-US" data-wf-domain="store.myshopify.com" lang="en" class="dark"',
      headExtras: [
        `<title>${escapeHtml(product)} Reviews</title>`,
        '<link rel="preload" as="image" href="/reviews/avatar-default.webp">',
        '<link data-remix-prefetch="true" rel="preload" href="/build/routes/products.$handle.js?t=1234567890" as="script">',
        `<script>window.__remixContext = ${safeJson({ state: { loaderData: { 'routes/products/$handle': { product: { title: product, reviews: sharedData } } } } })};</script>`,
        `<script type="application/ld+json">${safeJson({
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: product,
          aggregateRating: { '@type': 'AggregateRating', ratingValue: Number(score.toFixed(1)), reviewCount: reviews.length, bestRating: 5 },
        })}</script>`,
      ],
      bodyContent: `
        <!--$?--><template id="B:0"></template><!--/$-->
        ${bodyCommon}
        <script type="module" src="/build/routes/products.$handle.js?t=1234567890"></script>
      `,
    });
  }
  if (framework === 'next') {
    const nextData = { props: { pageProps: { product: { title: product }, reviews: sharedData } }, page: '/products/[handle]' };
    return wrapDocument({
      doctype: '<!DOCTYPE html>',
      htmlAttrs: 'lang="en" class="dark"',
      headExtras: [
        `<title>${escapeHtml(product)} Reviews</title>`,
        '<link rel="preload" as="fetch" href="/_next/data/BUILD_ID/products/slug.json" crossOrigin="anonymous">',
        `<script id="__NEXT_DATA__" type="application/json">${safeJson(nextData)}</script>`,
        `<script>self.__next_f = self.__next_f || []; self.__next_f.push([1, ${safeJson('encoded RSC payload')}]);</script>`,
        `<script type="application/ld+json">${safeJson({
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: product,
          aggregateRating: { '@type': 'AggregateRating', ratingValue: Number(score.toFixed(1)), reviewCount: reviews.length, bestRating: 5 },
        })}</script>`,
      ],
      bodyContent: `
        <div id="__next">
          <!-- This component was rendered on the server -->
          ${bodyCommon}
        </div>
      `,
    });
  }
  return wrapDocument({
    doctype: '<!DOCTYPE html>',
    htmlAttrs: 'lang="en" class="dark"',
    headExtras: [
      `<title>${escapeHtml(product)} Reviews</title>`,
      `<script>window.__medusa_config__ = ${safeJson({ storefront_url: 'https://store.example.com', publishable_api_key: 'pk_123456' })};</script>`,
      `<script type="application/json" id="reviews-data">${safeJson(sharedData)}</script>`,
      `<script type="application/ld+json">${safeJson({
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: product,
        aggregateRating: { '@type': 'AggregateRating', ratingValue: Number(score.toFixed(1)), reviewCount: reviews.length, bestRating: 5 },
      })}</script>`,
    ],
    bodyContent: `
      <div id="root">${bodyCommon}</div>
      <!-- Fragment: ReviewsFragment loaded via GraphQL -->
      <!-- This component was rendered on the server -->
    `,
  });
}

function generatePagesForPrompt(promptId, builder) {
  const promptFolder = `prompt_${String(promptId).padStart(2, '0')}`;
  const outputDir = path.join(pagesRoot, promptFolder);
  for (let pageNum = 1; pageNum <= 100; pageNum += 1) {
    writePage(outputDir, pageNum, builder(pageNum));
  }
}

function main() {
  generatePagesForPrompt(21, buildPrompt21Page);
  generatePagesForPrompt(22, buildPrompt22Page);
  generatePagesForPrompt(23, buildPrompt23Page);
  generatePagesForPrompt(24, buildPrompt24Page);
  generatePagesForPrompt(25, buildPrompt25Page);
  generatePagesForPrompt(26, buildPrompt26Page);
  generatePagesForPrompt(27, buildPrompt27Page);
  generatePagesForPrompt(28, buildPrompt28Page);
  generatePagesForPrompt(29, buildPrompt29Page);
  generatePagesForPrompt(30, buildPrompt30Page);
  generatePagesForPrompt(31, buildPrompt31Page);
  generatePagesForPrompt(32, buildPrompt32Page);
  generatePagesForPrompt(33, buildPrompt33Page);
  generatePagesForPrompt(34, buildPrompt34Page);
  generatePagesForPrompt(35, buildPrompt35Page);
  generatePagesForPrompt(36, buildPrompt36Page);
  generatePagesForPrompt(37, buildPrompt37Page);
  generatePagesForPrompt(38, buildPrompt38Page);
  generatePagesForPrompt(39, buildPrompt39Page);
  generatePagesForPrompt(40, buildPrompt40Page);
  const counts = syncIndexCounts(indexPath, pagesRoot, 40);
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const indexText = fs.readFileSync(indexPath, 'utf8').replace(/^\*\*Total:\*\* .*$/m, `**Total:** ${total} / 4,000`);
  fs.writeFileSync(indexPath, indexText, 'utf8');
  console.log(`Generated prompt_21 through prompt_40 under ${pagesRoot}`);
}

main();
