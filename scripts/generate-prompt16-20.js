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

const reviewerNames16 = [
  'Avery', 'Mina', 'Noah', 'Rae', 'Jules', 'Pia', 'Theo', 'Ivy', 'Cora', 'Drew',
  'Lena', 'Milo', 'Nora', 'Owen', 'Zia', 'Eli', 'Tess', 'Finn', 'Maya', 'Cal',
];

const reviewTopics16 = [
  ['Electronics', 'A compact camera review page'],
  ['Kitchen', 'A coffee grinder with mostly positive feedback'],
  ['App Store', 'A mobile app review section with developer replies'],
  ['Booking', 'A hotel listing with pros and cons'],
  ['Trustpilot', 'A company page with verified ratings'],
  ['TripAdvisor', 'A travel review board with bubble scores'],
  ['Yelp', 'A restaurant review stream with elite badges'],
  ['Books', 'A book review panel with helpful votes'],
];

const reviewPhrases16 = [
  'I bought this as a gift and it was a hit.',
  'After using this for six months, I still think the build is solid.',
  'The value is good, but the setup could be easier.',
  'The seller response clarified the one issue I had.',
  'The picture quality is better than expected for the price.',
  'The room was clean and the staff handled everything quickly.',
  'The app update fixed the crash I mentioned in my earlier review.',
  'The product feels well made and the packaging was careful.',
];

const languagePacks17 = [
  {
    key: 'ar',
    lang: 'ar',
    dir: 'rtl',
    title: 'التعليقات',
    lede: 'واجهة عربية مع محاذاة من اليمين إلى اليسار.',
    heading: 'التعليقات',
    addLabel: 'إضافة تعليق',
    replyLabel: 'رد',
    sendLabel: 'إرسال',
    names: ['سارة', 'أحمد', 'ليلى', 'عمر', 'هدى', 'يوسف'],
    phrases: ['الشرح واضح جدًا.', 'أوافق على هذه النقطة.', 'هذا الترتيب يسهل القراءة.', 'المعلومات تبدو دقيقة.'],
    locale: 'ar-EG',
    font: "'Noto Sans Arabic', 'Segoe UI', sans-serif",
  },
  {
    key: 'he',
    lang: 'he',
    dir: 'rtl',
    title: 'תגובות',
    lede: 'ממשק עברי עם זרימה מימין לשמאל.',
    heading: 'תגובות',
    addLabel: 'הוספת תגובה',
    replyLabel: 'השב',
    sendLabel: 'שלח',
    names: ['דנה', 'אורי', 'מיכל', 'רון', 'נועה', 'טל'],
    phrases: ['הפריסה מאוד ברורה.', 'הערה טובה ומדויקת.', 'קל לעקוב אחרי השיחה הזו.', 'הסדר כאן עוזר מאוד.'],
    locale: 'he-IL',
    font: "'Noto Sans Hebrew', 'Segoe UI', sans-serif",
  },
  {
    key: 'zh-cn',
    lang: 'zh-CN',
    dir: 'ltr',
    title: '评论',
    lede: '简体中文页面，强调清晰的层级结构。',
    heading: '评论',
    addLabel: '发表评论',
    replyLabel: '回复',
    sendLabel: '提交',
    names: ['小明', '小李', '阿华', '晓雨', '明杰', '安然'],
    phrases: ['这个结构很清晰。', '我觉得这个结论合理。', '层级排版很好读。', '感谢分享这个信息。'],
    locale: 'zh-CN',
    font: "'Noto Sans CJK SC', 'Microsoft YaHei', sans-serif",
  },
  {
    key: 'zh-tw',
    lang: 'zh-TW',
    dir: 'ltr',
    title: '留言',
    lede: '繁體中文留言區。',
    heading: '留言',
    addLabel: '發表留言',
    replyLabel: '回覆',
    sendLabel: '送出',
    names: ['小安', '阿哲', '美玲', '家豪', '怡君', '冠廷'],
    phrases: ['這個版面很清楚。', '我同意這個說法。', '這種層級很好閱讀。', '內容很實用。'],
    locale: 'zh-TW',
    font: "'Noto Sans CJK TC', 'Microsoft JhengHei', sans-serif",
  },
  {
    key: 'ja',
    lang: 'ja',
    dir: 'ltr',
    title: 'コメント',
    lede: '日本語のコメント欄。',
    heading: 'コメント',
    addLabel: 'コメントを追加',
    replyLabel: '返信',
    sendLabel: '送信',
    names: ['美咲', '健太', 'ゆうき', '葵', '真央', '拓海'],
    phrases: ['この構成はとても読みやすいです。', 'この意見には納得できます。', '階層がわかりやすいですね。', '返信の位置が自然です。'],
    locale: 'ja-JP',
    font: "'Noto Sans JP', 'Hiragino Kaku Gothic ProN', sans-serif",
  },
  {
    key: 'ko',
    lang: 'ko',
    dir: 'ltr',
    title: '댓글',
    lede: '한국어 댓글 영역입니다.',
    heading: '댓글',
    addLabel: '댓글 추가',
    replyLabel: '답글',
    sendLabel: '전송',
    names: ['민수', '지연', '하늘', '서연', '도윤', '예진'],
    phrases: ['구조가 아주 깔끔합니다.', '이 의견에 동의합니다.', '단계가 명확해서 읽기 쉽네요.', '정리가 잘 되어 있습니다.'],
    locale: 'ko-KR',
    font: "'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif",
  },
  {
    key: 'ru',
    lang: 'ru',
    dir: 'ltr',
    title: 'Комментарии',
    lede: 'Русскоязычная область обсуждений.',
    heading: 'Комментарии',
    addLabel: 'Добавить комментарий',
    replyLabel: 'Ответить',
    sendLabel: 'Отправить',
    names: ['Ирина', 'Алексей', 'Олег', 'Мария', 'Дмитрий', 'Анна'],
    phrases: ['Структура здесь очень понятная.', 'Согласен с этим замечанием.', 'Иерархия читается без труда.', 'Хороший и аккуратный блок.'],
    locale: 'ru-RU',
    font: "'Noto Sans', 'Segoe UI', sans-serif",
  },
  {
    key: 'hi',
    lang: 'hi',
    dir: 'ltr',
    title: 'टिप्पणियां',
    lede: 'देवनागरी में लिखी गई टिप्पणी धारा।',
    heading: 'टिप्पणियां',
    addLabel: 'टिप्पणी जोड़ें',
    replyLabel: 'उत्तर दें',
    sendLabel: 'भेजें',
    names: ['आदित्य', 'नेहा', 'रोहन', 'सिया', 'विवेक', 'किरण'],
    phrases: ['यह संरचना बहुत साफ़ दिख रही है।', 'मैं इस बात से सहमत हूँ।', 'स्तरबद्ध व्यवस्था पढ़ने में आसान है।', 'यह प्रस्तुति अच्छी लगी।'],
    locale: 'hi-IN',
    font: "'Noto Sans Devanagari', 'Mangal', sans-serif",
  },
  {
    key: 'es',
    lang: 'es',
    dir: 'ltr',
    title: 'Comentarios',
    lede: 'Sección en español con usuarios y fechas locales.',
    heading: 'Comentarios',
    addLabel: 'Añadir comentario',
    replyLabel: 'Responder',
    sendLabel: 'Enviar',
    names: ['Ana', 'Luis', 'Marta', 'Diego', 'Sofía', 'Pablo'],
    phrases: ['La estructura se entiende muy bien.', 'Estoy de acuerdo con este punto.', 'El orden por niveles ayuda mucho.', 'Gracias por el contexto.'],
    locale: 'es-ES',
    font: "'Inter', 'Segoe UI', sans-serif",
  },
  {
    key: 'pt',
    lang: 'pt',
    dir: 'ltr',
    title: 'Comentários',
    lede: 'Bloco em português com estilo regional.',
    heading: 'Comentários',
    addLabel: 'Deixar um comentário',
    replyLabel: 'Responder',
    sendLabel: 'Enviar',
    names: ['João', 'Marina', 'Rafa', 'Lia', 'Tiago', 'Bruna'],
    phrases: ['A estrutura ficou muito clara.', 'Concordo com esse ponto.', 'A hierarquia ajuda bastante na leitura.', 'Boa organização dos blocos.'],
    locale: 'pt-BR',
    font: "'Inter', 'Segoe UI', sans-serif",
  },
  {
    key: 'fr',
    lang: 'fr',
    dir: 'ltr',
    title: 'Commentaires',
    lede: 'Disposition française avec texte clair.',
    heading: 'Commentaires',
    addLabel: 'Laisser un commentaire',
    replyLabel: 'Répondre',
    sendLabel: 'Envoyer',
    names: ['Claire', 'Luc', 'Maya', 'Hugo', 'Élise', 'Noé'],
    phrases: ['La structure est très claire.', 'Je suis d’accord avec ce point.', 'La hiérarchie facilite la lecture.', 'Le bloc reste facile à parcourir.'],
    locale: 'fr-FR',
    font: "'Inter', 'Segoe UI', sans-serif",
  },
  {
    key: 'de',
    lang: 'de',
    dir: 'ltr',
    title: 'Kommentare',
    lede: 'Deutsche Kommentaransicht mit klarer Typografie.',
    heading: 'Kommentare',
    addLabel: 'Kommentar hinterlassen',
    replyLabel: 'Antworten',
    sendLabel: 'Senden',
    names: ['Lena', 'Tom', 'Mila', 'Jonas', 'Emma', 'Noah'],
    phrases: ['Die Struktur ist sehr klar.', 'Dem Punkt stimme ich zu.', 'Die Ebenen sind gut lesbar.', 'Die Anordnung wirkt ordentlich.'],
    locale: 'de-DE',
    font: "'Inter', 'Segoe UI', sans-serif",
  },
  {
    key: 'mixed',
    lang: 'en',
    dir: 'ltr',
    title: 'Mixed languages',
    lede: 'English chrome with comment text in several scripts.',
    heading: 'Community',
    addLabel: 'Add note',
    replyLabel: 'Continue',
    sendLabel: 'Share',
    names: ['Ava', 'Mina', 'Kai', 'Yuki', 'Lina', 'Omar'],
    phrases: ['Hola, this structure is clear.', 'ありがとうございます, this makes sense.', 'هذه الفكرة واضحة.', 'C’est très lisible.', '구조가 좋아요.'],
    locale: 'en-US',
    font: "'Inter', 'Segoe UI', sans-serif",
  },
];

const platforms18 = [
  {
    key: 'staticman',
    label: 'Staticman',
    title: 'Staticman-backed build-time comments',
    formHtml: '<form method="POST" action="https://staticman.example/entry"><input type="hidden" name="redirect" value="/thank-you"><label>Name <input type="text" name="name"></label><label>Message <textarea rows="4" name="message"></textarea></label><button type="submit">Publish</button></form>',
    rootClass: 'comments-section comments-section--staticman',
    itemClass: 'comment-item',
    bodyClass: 'comment-body',
    metaClass: 'comment-meta',
    authorClass: 'comment-author',
    timeClass: 'comment-date',
    childrenClass: 'comment-children',
  },
  {
    key: 'netlify',
    label: 'Netlify Forms',
    title: 'Netlify Forms with a pre-rendered list',
    formHtml: '<form name="comments" netlify data-netlify="true"><input type="hidden" name="form-name" value="comments"><input type="hidden" name="_gotcha" style="display:none"><label>Name <input type="text" name="name"></label><label>Message <textarea rows="4" name="message"></textarea></label><button type="submit">Submit</button></form>',
    rootClass: 'comments-section comments-section--netlify',
    itemClass: 'comment-item',
    bodyClass: 'comment-body',
    metaClass: 'comment-meta',
    authorClass: 'comment-author',
    timeClass: 'comment-date',
    childrenClass: 'comment-children',
  },
  {
    key: 'utterances',
    label: 'Utterances',
    title: 'GitHub issue comments via Utterances',
    formHtml: '<div class="github-thread-hint">GitHub issue discussion is rendered below.</div>',
    rootClass: 'commento-root utterances-shell',
    itemClass: 'comment-item',
    bodyClass: 'comment-body',
    metaClass: 'comment-meta',
    authorClass: 'comment-author',
    timeClass: 'comment-date',
    childrenClass: 'comment-children',
  },
  {
    key: 'giscus',
    label: 'Giscus',
    title: 'GitHub discussions in a clean shell',
    formHtml: '<div class="giscus-hint">Conversation happens through GitHub Discussions.</div>',
    rootClass: 'commento-root giscus-shell',
    itemClass: 'comment-item',
    bodyClass: 'comment-body',
    metaClass: 'comment-meta',
    authorClass: 'comment-author',
    timeClass: 'comment-date',
    childrenClass: 'comment-children',
  },
  {
    key: 'commento',
    label: 'Commento',
    title: 'Privacy-focused minimal comments',
    formHtml: '<form class="commento-form"><textarea rows="4" placeholder="Share your thoughts"></textarea><button type="button">Post</button></form>',
    rootClass: 'commento-root',
    itemClass: 'commento-comment',
    bodyClass: 'commento-body',
    metaClass: 'commento-meta',
    authorClass: 'commento-author',
    timeClass: 'commento-time',
    childrenClass: 'commento-replies',
  },
  {
    key: 'hyvor',
    label: 'Hyvor Talk',
    title: 'Modern nested comments with emoji reactions',
    formHtml: '<form class="hyvor-editor"><textarea rows="4" placeholder="Join the conversation"></textarea><button type="button">Send</button></form>',
    rootClass: 'hyvor-talk-comments',
    itemClass: 'hyvor-comment',
    bodyClass: 'hyvor-body',
    metaClass: 'hyvor-meta',
    authorClass: 'hyvor-author',
    timeClass: 'hyvor-time',
    childrenClass: 'hyvor-replies',
  },
  {
    key: 'remark42',
    label: 'Remark42',
    title: 'Self-hosted comments with a clean shell',
    formHtml: '<form class="remark42-form"><textarea rows="4"></textarea><button type="button">Send</button></form>',
    rootClass: 'remark42',
    itemClass: 'remark42-comment',
    bodyClass: 'remark42-body',
    metaClass: 'remark42-meta',
    authorClass: 'remark42-author',
    timeClass: 'remark42-time',
    childrenClass: 'remark42-replies',
  },
  {
    key: 'serverless',
    label: 'Serverless',
    title: 'Custom serverless form and static output',
    formHtml: '<form class="serverless-form" action="/api/comment" method="post"><input type="text" name="name"><textarea rows="4" name="message"></textarea><button type="submit">Send</button></form>',
    rootClass: 'comments-section comments-section--serverless',
    itemClass: 'comment-item',
    bodyClass: 'comment-body',
    metaClass: 'comment-meta',
    authorClass: 'comment-author',
    timeClass: 'comment-date',
    childrenClass: 'comment-children',
  },
];

const aiThemes19 = [
  ['Sable', '#1f2a37', '#e5ebf1', '#6ea8fe'],
  ['Mint', '#183225', '#e9f3ee', '#53c89b'],
  ['Slate', '#20242d', '#edf1f7', '#84a7ff'],
  ['Citrine', '#2a2218', '#f8efe0', '#f0b14a'],
  ['Rose', '#322129', '#f7ebee', '#f49fb4'],
];

const aiNames19 = [
  'Avery', 'Mina', 'Noah', 'Rae', 'Jules', 'Pia', 'Theo', 'Ivy', 'Cora', 'Drew',
  'Lena', 'Milo', 'Nora', 'Owen', 'Zia', 'Eli', 'Tess', 'Finn', 'Maya', 'Cal',
];

const aiPhrases19 = [
  'The spacing and focus states are deliberately well tuned.',
  'I appreciate the way the reply form stays available without crowding the list.',
  'The code snippet is a nice touch for a technical thread.',
  'This filter bar keeps the interaction model tidy.',
  'The responsive behavior still feels restrained on smaller screens.',
  'The component hierarchy reads like a polished design system output.',
  'The container query makes the layout adapt without a lot of fuss.',
  'The modern color tokens are easy to scan and maintain.',
];

const readOnlyTopics20 = [
  ['Archived Thread', 'A locked archive with no compose UI'],
  ['Old Forum', 'A closed discussion with visible replies only'],
  ['Wayback Snapshot', 'A preserved page from an archived site'],
  ['Legal Hold', 'Comments disabled while the article sits under review'],
  ['Controversy Archive', 'A read-only snapshot with no input affordance'],
  ['Legacy CMS', 'A page frozen after moderation closed'],
];

const readOnlyNames20 = [
  'Avery', 'Mina', 'Noah', 'Rae', 'Jules', 'Pia', 'Theo', 'Ivy', 'Cora', 'Drew',
  'Lena', 'Milo', 'Nora', 'Owen', 'Zia', 'Eli', 'Tess', 'Finn', 'Maya', 'Cal',
];

const readOnlyPhrases20 = [
  'The discussion is still readable even though the thread is closed.',
  'A locked archive can still be useful for reference.',
  'The replies are visible, but the page itself is no longer editable.',
  'This snapshot keeps the history intact without allowing new input.',
  'The old layout is still legible after all these years.',
  'The structure is simple, but the archive banner makes the state clear.',
];

function renderAvatar(author, color, size = 34) {
  return buildAvatarSvg(author, color).replace('viewBox="0 0 64 64"', `viewBox="0 0 64 64" data-size="${size}"`);
}

function renderStars(rating, mode = 'stars') {
  const full = Math.max(0, Math.min(5, Math.round(rating)));
  const empty = 5 - full;
  if (mode === 'numeric') {
    return `<span class="rating rating--numeric">${rating.toFixed(1)} / 5</span>`;
  }
  if (mode === 'bubbles') {
    return `<span class="rating rating--bubbles">${'●'.repeat(full)}${'○'.repeat(empty)}</span>`;
  }
  return `<span class="rating rating--stars">${'★'.repeat(full)}${'☆'.repeat(empty)}</span>`;
}

function renderReviewItem(review, platform, options) {
  const rating = renderStars(review.rating, platform.ratingMode);
  const verified = review.verified ? '<span class="badge badge--verified">Verified Purchase</span>' : '';
  const helpful = review.helpful ? `<span class="helpful">Helpful (${review.helpful})</span>` : '';
  const title = review.title ? `<h3 class="review-title">${escapeHtml(review.title)}</h3>` : '';
  const response = review.response ? `<div class="seller-response"><strong>Seller response:</strong> ${escapeHtml(review.response)}</div>` : '';
  const prosCons = review.pros || review.cons
    ? `<div class="pros-cons">${review.pros ? `<div class="pros"><strong>Pros:</strong> ${escapeHtml(review.pros)}</div>` : ''}${review.cons ? `<div class="cons"><strong>Cons:</strong> ${escapeHtml(review.cons)}</div>` : ''}</div>`
    : '';
  const attachment = review.photo ? `<img class="review-photo" src="${escapeHtml(review.photo)}" alt="">` : '';
  const schemaOpen = options.schema ? ' itemscope itemtype="https://schema.org/Review"' : '';
  const schemaProps = options.schema
    ? '<meta itemprop="ratingValue" content="' + review.rating + '"><meta itemprop="author" content="' + escapeHtml(review.author) + '"><meta itemprop="datePublished" content="' + review.date + '">'
    : '';
  const platformClass = platform.itemClass;

  return [
    `<article class="${platformClass}" data-rating="${review.rating}" data-verified="${review.verified ? 'true' : 'false'}"${schemaOpen}>`,
    `<header class="review-header"><div class="review-meta"><span class="reviewer-name" itemprop="author">${escapeHtml(review.author)}</span> ${review.location ? `<span class="reviewer-location">${escapeHtml(review.location)}</span>` : ''} <time itemprop="datePublished">${escapeHtml(review.dateLabel)}</time></div>${rating}${verified}</header>`,
    title,
    `<div class="review-body" itemprop="reviewBody">${escapeHtml(review.body)}</div>`,
    prosCons,
    attachment,
    helpful,
    response,
    schemaProps,
    '</article>',
  ].filter(Boolean).join('\n');
}

function buildPrompt16Page(pageNum) {
  const rng = createRng(16000 + pageNum);
  const topic = reviewTopics16[(pageNum - 1) % reviewTopics16.length];
  const platform = [
    {
      key: 'amazon',
      label: 'Amazon',
      ratingMode: 'stars',
      itemClass: 'review review--amazon',
    },
    {
      key: 'yelp',
      label: 'Yelp',
      ratingMode: 'stars',
      itemClass: 'review review--yelp',
    },
    {
      key: 'tripadvisor',
      label: 'TripAdvisor',
      ratingMode: 'bubbles',
      itemClass: 'review review--tripadvisor',
    },
    {
      key: 'booking',
      label: 'Booking.com',
      ratingMode: 'numeric',
      itemClass: 'review review--booking',
    },
    {
      key: 'appstore',
      label: 'App Store',
      ratingMode: 'stars',
      itemClass: 'review review--appstore',
    },
    {
      key: 'trustpilot',
      label: 'Trustpilot',
      ratingMode: 'numeric',
      itemClass: 'review review--trustpilot',
    },
    {
      key: 'maps',
      label: 'Google Maps',
      ratingMode: 'stars',
      itemClass: 'review review--maps',
    },
    {
      key: 'custom',
      label: 'Custom',
      ratingMode: 'stars',
      itemClass: 'review review--custom',
    },
  ][(pageNum - 1) % 8];

  const count = intBetween(rng, 3, 20);
  const showForm = chance(rng, 0.6);
  const showSummary = chance(rng, 0.5);
  const showTabs = chance(rng, 0.1);
  const showSellerResponse = chance(rng, 0.15);
  const showDistribution = chance(rng, 0.3);
  const reviews = Array.from({ length: count }, (_, index) => {
    const author = pick(rng, reviewerNames16);
    const date = new Date(Date.UTC(2023, intBetween(rng, 0, 11), intBetween(rng, 1, 28)));
    return {
      author,
      rating: intBetween(rng, 1, 5) + (chance(rng, 0.3) ? 0.5 : 0),
      title: chance(rng, 0.7) ? pick(rng, ['Great value', 'Pretty good', 'Worth the money', 'Solid choice', 'Mixed but useful']) : '',
      body: `${pick(rng, reviewPhrases16)} ${topic[1].toLowerCase().includes('mobile') ? 'The mobile app version behaved as expected.' : ''}`.trim(),
      location: chance(rng, 0.4) ? pick(rng, ['Seattle, WA', 'Austin, TX', 'Toronto, ON', 'Berlin, DE', 'Sydney, AU']) : '',
      date: date.toISOString().slice(0, 10),
      dateLabel: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      verified: chance(rng, 0.2),
      helpful: chance(rng, 0.55) ? intBetween(rng, 1, 84) : 0,
      response: showSellerResponse && index === 1 ? 'Thanks for the detailed feedback. We have shared this with the team.' : '',
      pros: chance(rng, 0.35) ? 'Easy setup, clean packaging, and a solid finish.' : '',
      cons: chance(rng, 0.25) ? 'Minor learning curve on the first use.' : '',
      photo: chance(rng, 0.2) ? `https://example.invalid/review/${pageNum}-${index}.jpg` : '',
    };
  });

  const reviewHtml = reviews.map((review) => renderReviewItem(review, platform, { schema: chance(rng, 0.45) })).join('\n');
  const ratingAverage = (reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length).toFixed(1);

  const form = showForm
    ? [
      '<section class="write-review">',
      '<h2>Write a review</h2>',
      '<form>',
      '<label>Rating <select><option>5</option><option>4</option><option>3</option><option>2</option><option>1</option></select></label>',
      '<label>Title <input type="text" name="title"></label>',
      '<label>Review <textarea rows="4" name="body"></textarea></label>',
      '<button type="button">Submit review</button>',
      '</form>',
      '</section>',
    ].join('\n')
    : '';

  const tabs = showTabs
    ? '<nav class="tabs"><a href="#" class="active">Top Reviews</a> <a href="#">All Reviews</a></nav>'
    : '';
  const summary = showSummary
    ? `<div class="summary"><strong>${ratingAverage} / 5</strong> based on ${count} reviews.</div>`
    : '';
  const distribution = showDistribution
    ? '<div class="distribution"><div class="bar" style="width:68%"></div><div class="bar" style="width:18%"></div><div class="bar" style="width:8%"></div></div>'
    : '';

  const css = [
    'body { margin: 0; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f4f6f9; color: #1f2733; }',
    '.page { width: min(980px, calc(100% - 24px)); margin: 0 auto; padding: 20px 0 44px; }',
    '.hero { background: #fff; border: 1px solid #d9dfe8; border-radius: 12px; padding: 18px; margin-bottom: 16px; }',
    '.hero h1 { margin: 4px 0 8px; font-size: 28px; }',
    '.review-section { background: #fff; border: 1px solid #d9dfe8; border-radius: 12px; padding: 18px; }',
    '.review { border-top: 1px solid #e2e7ef; padding: 14px 0; }',
    '.review:first-child { border-top: 0; padding-top: 0; }',
    '.review-header { display: flex; gap: 10px; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }',
    '.reviewer-name { font-weight: 700; }',
    '.review-title { margin: 0 0 8px; font-size: 18px; }',
    '.review-body { line-height: 1.55; }',
    '.badge--verified, .helpful { display: inline-block; margin-left: 8px; padding: 2px 8px; border-radius: 999px; background: #eef3ff; font-size: 11px; }',
    '.seller-response { margin-top: 10px; padding: 10px 12px; background: #f7f2ea; border: 1px solid #e4d7c4; border-radius: 10px; }',
    '.pros-cons { margin-top: 10px; display: grid; gap: 8px; }',
    '.review-photo { display: block; width: 100%; max-width: 260px; border-radius: 10px; margin-top: 10px; }',
    '.summary, .distribution { margin-bottom: 14px; }',
    '.distribution .bar { height: 8px; background: #d9e2f2; border-radius: 999px; margin-bottom: 8px; }',
    '.write-review form { display: grid; gap: 10px; max-width: 540px; }',
    '.write-review input, .write-review textarea, .write-review select { width: 100%; box-sizing: border-box; border: 1px solid #ccd5e1; padding: 8px 10px; font: inherit; }',
    '.tabs { margin-bottom: 12px; display: flex; gap: 10px; }',
    '.tabs a { text-decoration: none; padding: 4px 10px; border-radius: 999px; background: #eef3ff; color: #245; }',
    '.tabs a.active { background: #245; color: #fff; }',
  ].join('\n');

  const body = [
    '<div class="page">',
    '<section class="hero">',
    `<p class="kicker">${escapeHtml(platform.label)}</p>`,
    `<h1>${escapeHtml(topic[1])}</h1>`,
    `<p class="lede">The page mixes ratings, review titles, helpful votes, and structured metadata.</p>`,
    '</section>',
    '<section class="review-section">',
    tabs,
    summary,
    distribution,
    reviewHtml,
    form,
    '</section>',
    '</div>',
  ].filter(Boolean).join('\n');

  return wrapHtml({
    title: `${platform.label} - ${topic[1]}`,
    bodyContent: body,
    headExtras: `<style>${css}</style>`,
  });
}

function renderLanguageComment(pack, node, childrenHtml, options) {
  const avatar = options.showAvatar
    ? `<img class="avatar" src="${escapeHtml(node.avatar)}" alt="${escapeHtml(node.author)}">`
    : '';
  const time = options.showTime ? `<time datetime="${node.datetime}">${escapeHtml(node.timeLabel)}</time>` : '';
  const badge = node.badge ? `<span class="badge">${escapeHtml(node.badge)}</span>` : '';
  return [
    `<article class="lang-comment" data-id="${escapeHtml(node.id)}" data-depth="${node.depth}">`,
    avatar,
    '<div class="lang-comment__body">',
    `<div class="lang-comment__meta"><span class="lang-comment__author">${escapeHtml(node.author)}</span> ${time} ${badge}</div>`,
    `<div class="lang-comment__text">${escapeHtml(node.body)}</div>`,
    childrenHtml ? `<div class="lang-comment__children">${childrenHtml}</div>` : '',
    '</div>',
    '</article>',
  ].filter(Boolean).join('\n');
}

function buildPrompt17Page(pageNum) {
  const rng = createRng(17000 + pageNum);
  const pack = languagePacks17[(pageNum - 1) % languagePacks17.length];
  const count = intBetween(rng, 3, 20);
  const topLevelCount = intBetween(rng, 2, Math.min(6, count));
  const maxDepth = intBetween(rng, 0, 2);
  const showForm = chance(rng, 0.8);
  const showAvatar = chance(rng, 0.8);
  const showTime = chance(rng, 0.85);
  const showHreflang = chance(rng, 0.3);
  const showPinned = chance(rng, 0.15);

  const roots = buildForest(rng, {
    totalCount: count,
    topLevelCount: maxDepth === 0 ? count : topLevelCount,
    maxDepth,
    ensureDepth: maxDepth,
    makeNode: ({ depth, index, path: nodePath, rng: nodeRng }) => {
      const author = pick(nodeRng, pack.names);
      const date = new Date(Date.UTC(2024, intBetween(nodeRng, 0, 11), intBetween(nodeRng, 1, 28)));
      return {
        id: `${pageNum}-${nodePath.join('-')}`,
        author,
        body: `${pick(nodeRng, pack.phrases)} ${depth >= 1 ? pack.phrases[0] : ''}`.trim(),
        datetime: date.toISOString(),
        timeLabel: date.toLocaleDateString(pack.locale, { year: 'numeric', month: 'short', day: 'numeric' }),
        avatar: buildAvatarSvg(author, pick(nodeRng, ['#4d7ea8', '#4f8a63', '#8a5d3f', '#7a4f8d'])),
        badge: showPinned && index === 1 ? 'Pinned' : '',
        depth,
      };
    },
  });

  const comments = renderTree(roots, (node, childrenHtml) => renderLanguageComment(pack, node, childrenHtml, { showAvatar, showTime }));
  const compose = showForm
    ? [
      '<form class="compose">',
      `<label>${escapeHtml(pack.addLabel)} <textarea rows="4" placeholder="${escapeHtml(pack.addLabel)}"></textarea></label>`,
      `<button type="button">${escapeHtml(pack.sendLabel)}</button>`,
      '</form>',
    ].join('\n')
    : '';

  const rtlCss = pack.dir === 'rtl'
    ? '.lang-shell { direction: rtl; text-align: right; } .avatar { float: right; margin-right: 0; margin-left: 10px; } .lang-comment__children { margin-left: 0; margin-right: 24px; padding-left: 0; padding-right: 12px; border-left: 0; border-right: 2px solid #e1e6ee; } .compose { justify-items: end; }'
    : '';
  const cjkCss = ['zh-CN', 'zh-TW', 'ja', 'ko'].includes(pack.key)
    ? `${pack.font ? `body { font-family: ${pack.font}; }` : ''} .lang-comment__text { word-break: break-all; }`
    : '';
  const noAvatarCss = !showAvatar ? '.avatar { display: none; }' : '';
  const css = [
    'body { margin: 0; background: #f5f7fb; color: #1d2430; line-height: 1.6; }',
    '.page { width: min(940px, calc(100% - 24px)); margin: 0 auto; padding: 20px 0 44px; }',
    '.hero { background: #fff; border: 1px solid #d9dfe8; border-radius: 12px; padding: 18px; margin-bottom: 16px; }',
    '.hero h1 { margin: 4px 0 8px; font-size: 28px; }',
    '.lang-shell { background: #fff; border: 1px solid #d9dfe8; border-radius: 12px; padding: 18px; }',
    '.lang-comment { border-top: 1px solid #e2e7ef; padding: 14px 0; }',
    '.lang-comment:first-child { border-top: 0; padding-top: 0; }',
    '.lang-comment__meta { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; font-size: 12px; color: #667; margin-bottom: 8px; }',
    '.lang-comment__author { font-weight: 700; }',
    '.lang-comment__text { line-height: 1.55; }',
    '.lang-comment__children { margin-top: 12px; margin-left: 24px; padding-left: 12px; border-left: 2px solid #e2e7ef; }',
    '.avatar { width: 28px; height: 28px; border-radius: 50%; vertical-align: middle; margin-right: 8px; }',
    '.badge { display: inline-block; padding: 1px 6px; border-radius: 999px; background: #eef3ff; font-size: 11px; }',
    '.compose { margin-top: 16px; display: grid; gap: 10px; max-width: 540px; }',
    '.compose textarea, .compose button { font: inherit; }',
    '.compose textarea { width: 100%; min-height: 90px; box-sizing: border-box; border: 1px solid #ccd5e1; padding: 10px; border-radius: 10px; }',
    '.compose button { width: fit-content; border: 1px solid #ccd5e1; background: #fff; padding: 8px 14px; border-radius: 999px; }',
    rtlCss,
    cjkCss,
    noAvatarCss,
    showHreflang ? '<link rel="alternate" hreflang="en" href="?lang=en">' : '',
  ].filter(Boolean).join('\n');

  const body = [
    '<div class="page">',
    '<section class="hero">',
    `<p class="kicker">${escapeHtml(pack.title)}</p>`,
    `<h1>${escapeHtml(pack.heading)}</h1>`,
    `<p class="lede">${escapeHtml(pack.lede)}</p>`,
    '</section>',
    `<section class="lang-shell" lang="${escapeHtml(pack.lang)}" dir="${escapeHtml(pack.dir)}">`,
    comments,
    compose,
    '</section>',
    '</div>',
  ].join('\n');

  return wrapHtml({
    title: `${pack.title} - ${pack.heading}`,
    lang: pack.lang,
    dir: pack.dir,
    bodyContent: body,
    headExtras: `<style>${css}</style>`,
  });
}

function renderJamComment(node, childrenHtml, platform, options) {
  const avatar = `<img class="${platform.avatarClass}" src="${escapeHtml(node.avatar)}" alt="${escapeHtml(node.author)}">`;
  const gitLink = options.github ? `<a href="https://github.com/${encodeURIComponent(node.author)}">${escapeHtml(node.author)}</a>` : `<span>${escapeHtml(node.author)}</span>`;
  const response = node.badge ? `<span class="author-badge">Author</span>` : '';
  const reactions = node.reactions ? `<div class="reactions">${node.reactions}</div>` : '';
  const meta = `<div class="${platform.metaClass}">${gitLink} ${response} <time>${escapeHtml(node.timeLabel)}</time></div>`;
  return [
    `<article class="${platform.itemClass}" data-depth="${node.depth}">`,
    avatar,
    '<div class="comment-main">',
    meta,
    `<div class="${platform.bodyClass}">${escapeHtml(node.body)}</div>`,
    reactions,
    childrenHtml ? `<div class="${platform.childrenClass}">${childrenHtml}</div>` : '',
    '</div>',
    '</article>',
  ].filter(Boolean).join('\n');
}

function buildPrompt18Page(pageNum) {
  const rng = createRng(18000 + pageNum);
  const platform = platforms18[(pageNum - 1) % platforms18.length];
  const count = intBetween(rng, 2, 15);
  const topLevelCount = intBetween(rng, 2, Math.min(6, count));
  const maxDepth = chance(rng, 0.35) ? 1 : 0;
  const darkMode = chance(rng, 0.3);
  const showBuildDate = chance(rng, 0.5);
  const showSkeleton = chance(rng, 0.4);
  const showForm = chance(rng, 0.8);
  const tailwindMode = chance(rng, 0.4);
  const cssModulesMode = !tailwindMode && chance(rng, 0.5);

  const roots = buildForest(rng, {
    totalCount: count,
    topLevelCount: maxDepth === 0 ? count : topLevelCount,
    maxDepth,
    ensureDepth: maxDepth,
    makeNode: ({ depth, index, path: nodePath, rng: nodeRng }) => {
      const author = pick(nodeRng, reviewerNames16);
      const date = new Date(Date.UTC(2025, intBetween(nodeRng, 0, 11), intBetween(nodeRng, 1, 28)));
      return {
        id: `${pageNum}-${nodePath.join('-')}`,
        author,
        body: `${pick(nodeRng, reviewPhrases16)} ${chance(nodeRng, 0.25) ? 'The build-time output keeps the list visible before hydration.' : ''}`.trim(),
        timeLabel: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        avatar: buildAvatarSvg(author, pick(nodeRng, ['#4d7ea8', '#4f8a63', '#8a5d3f', '#7a4f8d'])),
        badge: chance(nodeRng, 0.2) ? 'Author' : '',
        reactions: chance(nodeRng, 0.3) ? '👍 12 · ❤️ 4 · 🎉 2' : '',
        depth,
      };
    },
  });

  const comments = renderTree(roots, (node, childrenHtml) => renderJamComment(node, childrenHtml, {
    avatarClass: tailwindMode ? 'w-10 h-10 rounded-full flex-shrink-0' : 'comment-avatar',
    itemClass: tailwindMode ? 'flex gap-4 py-6 border-b border-gray-200 dark:border-gray-700' : 'comment-item',
    bodyClass: tailwindMode ? 'flex-1 min-w-0' : 'comment-content',
    metaClass: tailwindMode ? 'flex items-center gap-2 mb-1' : 'comment-meta',
    childrenClass: tailwindMode ? 'ml-10 mt-3' : 'comment-children',
  }, { github: platform.key === 'utterances' || platform.key === 'giscus' }));

  const skeleton = showSkeleton
    ? '<div class="skeleton-stack"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>'
    : '';
  const form = showForm
    ? platform.formHtml
    : '';

  const css = [
    'body { margin: 0; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f4f6f9; color: #1f2733; }',
    '.page { width: min(960px, calc(100% - 24px)); margin: 0 auto; padding: 20px 0 44px; }',
    '.hero { background: #fff; border: 1px solid #d9dfe8; border-radius: 12px; padding: 18px; margin-bottom: 16px; }',
    '.hero h1 { margin: 4px 0 8px; font-size: 28px; }',
    '.comments-section, .commento-root, .hyvor-talk-comments, .remark42 { background: #fff; border: 1px solid #d9dfe8; border-radius: 12px; padding: 18px; }',
    '.comment-item, .hyvor-comment, .remark42-comment, .commento-comment { border-top: 1px solid #e2e7ef; padding: 14px 0; }',
    '.comment-item:first-child, .hyvor-comment:first-child, .remark42-comment:first-child, .commento-comment:first-child { border-top: 0; padding-top: 0; }',
    '.comment-meta, .hyvor-meta, .remark42-meta, .commento-meta { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; font-size: 12px; color: #667; margin-bottom: 8px; }',
    '.comment-avatar, .hyvor-author, .remark42-author, .commento-author { width: 34px; height: 34px; border-radius: 50%; object-fit: cover; flex: 0 0 auto; }',
    '.comment-body, .hyvor-body, .remark42-body, .commento-body { line-height: 1.55; }',
    '.comment-children, .hyvor-replies, .remark42-replies, .commento-replies { margin-top: 12px; margin-left: 24px; padding-left: 12px; border-left: 2px solid #e1e6ee; }',
    '.author-badge { display: inline-block; padding: 1px 6px; border-radius: 999px; background: #eef3ff; font-size: 11px; }',
    '.skeleton-stack { display: grid; gap: 10px; }',
    '.skeleton { height: 54px; border-radius: 12px; background: linear-gradient(90deg, #edf1f6, #f7f9fc, #edf1f6); }',
    '.build-note { margin-bottom: 14px; color: #667; font-size: 12px; }',
    '.dark .comments-section, .dark .commento-root, .dark .hyvor-talk-comments, .dark .remark42 { background: #151a22; border-color: #2a323e; color: #e8edf4; }',
    '.dark .comment-item, .dark .hyvor-comment, .dark .remark42-comment, .dark .commento-comment { border-color: #2a323e; }',
    tailwindMode ? '.hero { box-shadow: 0 1px 3px rgba(0,0,0,0.08); }' : '',
    cssModulesMode ? '.comment-section { border-radius: 12px; }' : '',
  ].filter(Boolean).join('\n');

  const body = [
    `<div class="page${darkMode ? ' dark' : ''}">`,
    '<section class="hero">',
    `<p class="kicker">${escapeHtml(platform.label)}</p>`,
    `<h1>${escapeHtml(platform.title)}</h1>`,
    '<p class="lede">The comments are pre-rendered or hydrated from a compact static shell.</p>',
    showBuildDate ? `<div class="build-note">Last built: ${new Date(Date.UTC(2025, 4, 14, 9, 32)).toUTCString()}</div>` : '',
    '</section>',
    '<section class="comments-section" aria-live="polite">',
    skeleton,
    comments,
    form,
    '</section>',
    '</div>',
  ].filter(Boolean).join('\n');

  return wrapHtml({
    title: `${platform.label} - ${platform.title}`,
    bodyContent: body,
    headExtras: `<style>${css}</style>`,
  });
}

function renderAiComment(node, childrenHtml, options) {
  const reactions = node.reactions ? `<div class="reactions">${node.reactions}</div>` : '';
  const code = node.code ? `<pre><code class="language-javascript">${escapeHtml(node.code)}</code></pre>` : '';
  return [
    `<article class="comment-card" data-depth="${node.depth}" aria-describedby="meta-${node.id}">`,
    `<header class="comment-header" id="meta-${node.id}">`,
    `<img class="avatar" src="${escapeHtml(node.avatar)}" alt="${escapeHtml(node.author)}">`,
    `<div class="identity"><strong>${escapeHtml(node.author)}</strong> ${node.badge ? `<span class="badge">${escapeHtml(node.badge)}</span>` : ''} <time>${escapeHtml(node.timeLabel)}</time></div>`,
    '</header>',
    `<div class="comment-body">${escapeHtml(node.body)}</div>`,
    code,
    reactions,
    childrenHtml ? `<div class="comment-children">${childrenHtml}</div>` : '',
    '</article>',
  ].filter(Boolean).join('\n');
}

function buildPrompt19Page(pageNum) {
  const rng = createRng(19000 + pageNum);
  const theme = aiThemes19[(pageNum - 1) % aiThemes19.length];
  const count = intBetween(rng, 3, 20);
  const topLevelCount = intBetween(rng, 2, Math.min(6, count));
  const maxDepth = intBetween(rng, 0, 2);
  const showCounter = chance(rng, 0.4);
  const showError = chance(rng, 0.12);
  const showSort = chance(rng, 0.2);
  const showPagination = chance(rng, 0.15);
  const formMode = ['minimal', 'standard', 'rich', 'authenticated'][pageNum % 4];

  const roots = buildForest(rng, {
    totalCount: count,
    topLevelCount: maxDepth === 0 ? count : topLevelCount,
    maxDepth,
    ensureDepth: maxDepth,
    makeNode: ({ depth, index, path: nodePath, rng: nodeRng }) => {
      const author = pick(nodeRng, aiNames19);
      const date = new Date(Date.UTC(2025, intBetween(nodeRng, 0, 11), intBetween(nodeRng, 1, 28)));
      return {
        id: `${pageNum}-${nodePath.join('-')}`,
        author,
        body: `${pick(nodeRng, aiPhrases19)} ${depth >= 1 ? 'The hierarchy stays clean even when replies are present.' : ''}`.trim(),
        timeLabel: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        avatar: buildAvatarSvg(author, theme[3]),
        badge: chance(nodeRng, 0.1) ? 'Top fan' : '',
        reactions: chance(nodeRng, 0.35) ? '👍 12 · ❤️ 4 · 💡 2' : '',
        code: chance(nodeRng, 0.2) ? 'const score = comments.length > 0 ? comments.length : 1;' : '',
        depth,
      };
    },
  });

  const comments = renderTree(roots, (node, childrenHtml) => renderAiComment(node, childrenHtml, {}));
  const counter = showCounter ? `<span aria-live="polite"><span id="char-count">0</span>/500 characters</span>` : '';
  const error = showError ? '<p role="alert" class="error-message">Please enter a name</p>' : '';
  const sortBar = showSort ? '<div class="sort-filter"><button type="button" class="active">Top</button><button type="button">Newest</button><button type="button">Filter</button></div>' : '';
  const pagination = showPagination ? '<nav class="pagination"><a href="#">&laquo;</a><a href="#" class="active">1</a><a href="#">2</a><a href="#">3</a><a href="#">&raquo;</a></nav>' : '';

  const form = [
    '<form class="comment-form">',
    formMode === 'authenticated' ? '<div class="composer-row"><img class="avatar" src="data:image/svg+xml;utf8,%3Csvg xmlns%3D%22http://www.w3.org/2000/svg%22 viewBox%3D%220 0 64 64%22%3E%3Crect width%3D%2264%22 height%3D%2264%22 rx%3D%2232%22 fill%3D%22%236ea8fe%22/%3E%3C/svg%3E" alt="You"><textarea rows="4" placeholder="Share your perspective"></textarea></div>' : '',
    formMode === 'minimal' ? '<textarea rows="4" placeholder="Share your perspective"></textarea>' : '',
    formMode === 'standard' ? '<label>Name <input type="text" name="name"></label><label>Email <input type="email" name="email"></label><label>Message <textarea rows="4"></textarea></label>' : '',
    formMode === 'rich' ? '<label>Name <input type="text" name="name"></label><label>Email <input type="email" name="email"></label><label>Website <input type="url" name="url"></label><label>Message <textarea rows="4"></textarea></label>' : '',
    '<div class="form-actions"><button type="button">Post</button><button type="button" class="secondary">Cancel</button></div>',
    error,
    counter,
    '</form>',
  ].join('\n');

  const css = [
    '@layer base, components, utilities;',
    '@layer base {',
    '  :root { --color-surface-comment: oklch(98% 0.015 250); --color-border: oklch(86% 0.02 250); --color-text-secondary: oklch(44% 0.03 250); --color-focus: oklch(65% 0.16 250); --radius-avatar: 999px; --spacing-comment-gap: 16px; }',
    '  body { margin: 0; font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: oklch(98% 0.01 250); color: oklch(22% 0.03 250); }',
    '  button, input, textarea { font: inherit; }',
    '  button:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }',
    '}',
    '@layer components {',
    '  .page { width: min(960px, calc(100% - 24px)); margin: 0 auto; padding: 20px 0 44px; }',
    '  .hero { background: white; border: 1px solid var(--color-border); border-radius: 12px; padding: 18px; margin-bottom: 16px; }',
    '  .hero h1 { margin: 4px 0 8px; font-size: 28px; }',
    '  .comment-shell { container-name: comments; container-type: inline-size; background: var(--color-surface-comment); border: 1px solid var(--color-border); border-radius: 12px; padding: 18px; }',
    '  .comment-card { border-top: 1px solid var(--color-border); padding-block: 14px; padding-inline: 0; }',
    '  .comment-card:first-child { border-top: 0; padding-top: 0; }',
    '  .comment-header { display: flex; gap: 12px; align-items: center; margin-bottom: 8px; min-width: 0; }',
    '  .avatar { width: 40px; height: 40px; border-radius: var(--radius-avatar); }',
    '  .identity { min-width: 0; }',
    '  .comment-body { overflow-wrap: break-word; word-break: break-word; }',
    '  .comment-children { border-inline-start: 2px solid var(--color-border); margin-inline-start: 24px; padding-inline-start: 12px; margin-block-start: 12px; }',
    '  .reactions { margin-block-start: 8px; color: var(--color-text-secondary); font-size: 12px; }',
    '  .comment-form { margin-block-start: 18px; display: grid; gap: 12px; }',
    '  .comment-form textarea, .comment-form input { width: 100%; box-sizing: border-box; border: 1px solid var(--color-border); border-radius: 12px; padding: 12px; }',
    '  .comment-form .form-actions { display: flex; gap: 10px; }',
    '  .comment-form button { border: 1px solid var(--color-border); background: white; border-radius: 999px; padding: 8px 14px; }',
    '  .sort-filter { display: flex; gap: 8px; margin-bottom: 14px; }',
    '  .sort-filter button { border: 1px solid var(--color-border); background: white; border-radius: 999px; padding: 6px 12px; }',
    '  .sort-filter .active { background: oklch(36% 0.06 250); color: white; }',
    '  .pagination { display: flex; gap: 8px; margin-top: 16px; }',
    '  .pagination a { text-decoration: none; padding: 4px 8px; border: 1px solid var(--color-border); border-radius: 8px; }',
    '  .error-message { color: oklch(52% 0.16 20); margin: 0; }',
    '}',
    '@layer utilities {',
    '  @container comments (min-width: 520px) { .comment-card { padding-inline: 4px; } .avatar { width: 48px; height: 48px; } }',
    '  @media (prefers-color-scheme: dark) { :root { --color-surface-comment: oklch(20% 0.02 250); --color-border: oklch(35% 0.02 250); --color-text-secondary: oklch(70% 0.02 250); } body { background: oklch(16% 0.02 250); color: oklch(94% 0.02 250); } .hero, .comment-shell, .comment-form textarea, .comment-form input, .sort-filter button, .comment-form button, .pagination a { background: oklch(20% 0.02 250); color: inherit; } }',
    '  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto; transition-duration: 0.01ms !important; } }',
    '}',
  ].join('\n');

  const body = [
    '<div class="page">',
    '<section class="hero">',
    '<p class="kicker">AI-assisted UI</p>',
    '<h1>Modern minimalist comments</h1>',
    '<p class="lede">The layout uses logical properties, container queries, and clean aria markup.</p>',
    '</section>',
    `<section class="comment-shell" role="region" aria-label="Comments section" aria-live="polite" aria-atomic="true" aria-busy="false">`,
    sortBar,
    comments,
    form,
    pagination,
    '</section>',
    '</div>',
  ].filter(Boolean).join('\n');

  return wrapHtml({
    title: `AI-assisted modern minimalist comment UI`,
    bodyContent: body,
    headExtras: `<style>${css}</style>`,
  });
}

function renderReadOnlyItem(node, platform, childrenHtml) {
  const meta = node.timeLabel ? `<time>${escapeHtml(node.timeLabel)}</time>` : '';
  const avatar = node.avatar ? `<img class="${platform.avatarClass}" src="${escapeHtml(node.avatar)}" alt="${escapeHtml(node.author)}">` : '';
  return [
    `<article class="${platform.itemClass}" data-depth="${node.depth}" data-id="${escapeHtml(node.id)}">`,
    avatar,
    `<div class="${platform.bodyClass}">`,
    `<div class="${platform.metaClass}"><span class="${platform.authorClass}">${escapeHtml(node.author)}</span> ${meta}</div>`,
    `<div class="${platform.textClass}">${escapeHtml(node.body)}</div>`,
    node.count ? `<div class="count">${escapeHtml(node.count)}</div>` : '',
    childrenHtml ? `<div class="${platform.childrenClass}">${childrenHtml}</div>` : '',
    '</div>',
    '</article>',
  ].filter(Boolean).join('\n');
}

function buildPrompt20Page(pageNum) {
  const rng = createRng(20000 + pageNum);
  const topic = readOnlyTopics20[(pageNum - 1) % readOnlyTopics20.length];
  const count = chance(rng, 0.05) ? 0 : intBetween(rng, 1, 40);
  const topLevelCount = count === 0 ? 0 : intBetween(rng, 1, Math.min(8, count));
  const maxDepth = intBetween(rng, 0, 2);
  const showNotice = chance(rng, 0.7);
  const showSocialShare = chance(rng, 0.1);
  const showLoginPrompt = chance(rng, 0.1);
  const style = [
    {
      key: 'table',
      rootClass: 'archive-table',
      itemClass: 'archive-row',
      bodyClass: 'archive-body',
      metaClass: 'archive-meta',
      authorClass: 'archive-author',
      textClass: 'archive-text',
      childrenClass: 'archive-children',
      avatarClass: 'archive-avatar',
    },
    {
      key: 'div',
      rootClass: 'archive-list',
      itemClass: 'archive-item',
      bodyClass: 'archive-body',
      metaClass: 'archive-meta',
      authorClass: 'archive-author',
      textClass: 'archive-text',
      childrenClass: 'archive-children',
      avatarClass: 'archive-avatar',
    },
    {
      key: 'semantic',
      rootClass: 'archive-section',
      itemClass: 'archive-article',
      bodyClass: 'archive-body',
      metaClass: 'archive-meta',
      authorClass: 'archive-author',
      textClass: 'archive-text',
      childrenClass: 'archive-children',
      avatarClass: 'archive-avatar',
    },
    {
      key: 'bootstrap',
      rootClass: 'archive-panel',
      itemClass: 'archive-media',
      bodyClass: 'archive-body',
      metaClass: 'archive-meta',
      authorClass: 'archive-author',
      textClass: 'archive-text',
      childrenClass: 'archive-children',
      avatarClass: 'archive-avatar',
    },
    {
      key: 'tailwind',
      rootClass: 'archive-tailwind',
      itemClass: 'archive-card',
      bodyClass: 'archive-body',
      metaClass: 'archive-meta',
      authorClass: 'archive-author',
      textClass: 'archive-text',
      childrenClass: 'archive-children',
      avatarClass: 'archive-avatar',
    },
    {
      key: 'ai',
      rootClass: 'archive-ai',
      itemClass: 'archive-entry',
      bodyClass: 'archive-body',
      metaClass: 'archive-meta',
      authorClass: 'archive-author',
      textClass: 'archive-text',
      childrenClass: 'archive-children',
      avatarClass: 'archive-avatar',
    },
  ][(pageNum - 1) % 6];

  const roots = buildForest(rng, {
    totalCount: count,
    topLevelCount: maxDepth === 0 ? count : topLevelCount,
    maxDepth,
    ensureDepth: maxDepth,
    makeNode: ({ depth, index, path: nodePath, rng: nodeRng }) => {
      const author = pick(nodeRng, readOnlyNames20);
      const date = new Date(Date.UTC(2010, intBetween(nodeRng, 0, 11), intBetween(nodeRng, 1, 28)));
      return {
        id: `${pageNum}-${nodePath.join('-')}`,
        author,
        body: `${pick(nodeRng, readOnlyPhrases20)} ${depth >= 1 ? 'The branch is visible but inactive.' : ''}`.trim(),
        timeLabel: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        avatar: buildAvatarSvg(author, pick(nodeRng, ['#4d7ea8', '#4f8a63', '#8a5d3f', '#7a4f8d'])),
        count: chance(nodeRng, 0.4) ? `${intBetween(nodeRng, 1, 24)} replies` : '',
        depth,
      };
    },
  });

  const comments = count === 0
    ? ''
    : renderTree(roots, (node, childrenHtml) => renderReadOnlyItem(node, style, childrenHtml));

  const notice = showNotice
    ? pick(rng, [
      '<div class="archive-notice">Comments are closed.</div>',
      '<div class="archive-notice">This thread has been locked.</div>',
      '<div class="archive-notice">This page was archived on May 14, 2026.</div>',
    ])
    : '';
  const loginPrompt = showLoginPrompt
    ? '<div class="login-prompt"><a href="/login">Log in</a> to view more history</div>'
    : '';
  const socialShare = showSocialShare
    ? '<div class="social-share"><a href="#">Share on X</a> <a href="#">Share on Mastodon</a></div>'
    : '';

  const css = [
    'body { margin: 0; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f5f7fb; color: #1f2733; }',
    '.page { width: min(980px, calc(100% - 24px)); margin: 0 auto; padding: 20px 0 44px; }',
    '.hero { background: #fff; border: 1px solid #d9dfe8; border-radius: 12px; padding: 18px; margin-bottom: 16px; }',
    '.hero h1 { margin: 4px 0 8px; font-size: 28px; }',
    '.archive-table, .archive-list, .archive-section, .archive-panel, .archive-tailwind, .archive-ai { background: #fff; border: 1px solid #d9dfe8; border-radius: 12px; padding: 18px; }',
    '.archive-row, .archive-item, .archive-article, .archive-media, .archive-card, .archive-entry { border-top: 1px solid #e2e7ef; padding: 14px 0; }',
    '.archive-row:first-child, .archive-item:first-child, .archive-article:first-child, .archive-media:first-child, .archive-card:first-child, .archive-entry:first-child { border-top: 0; padding-top: 0; }',
    '.archive-meta { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; font-size: 12px; color: #667; margin-bottom: 8px; }',
    '.archive-author { font-weight: 700; }',
    '.archive-text { line-height: 1.55; }',
    '.archive-children { margin-top: 12px; margin-left: 24px; padding-left: 12px; border-left: 2px solid #e1e6ee; }',
    '.archive-avatar { width: 30px; height: 30px; border-radius: 50%; vertical-align: middle; margin-right: 8px; }',
    '.archive-notice, .login-prompt, .social-share { margin-bottom: 12px; padding: 10px 12px; background: #f7f2ea; border: 1px solid #e4d7c4; border-radius: 10px; }',
    '.archive-table table { width: 100%; border-collapse: collapse; }',
    '.archive-table td, .archive-table th { border-top: 1px solid #e6ddd1; padding: 10px 8px; text-align: left; }',
    '.archive-tailwind .archive-entry { display: flex; gap: 12px; }',
    '.archive-tailwind .archive-body { flex: 1 1 auto; min-width: 0; }',
    '.archive-ai .archive-entry { box-shadow: 0 1px 3px rgba(0,0,0,0.05); }',
  ].join('\n');

  const body = [
    '<div class="page">',
    '<section class="hero">',
    `<p class="kicker">${escapeHtml(topic[0])}</p>`,
    `<h1>${escapeHtml(topic[1])}</h1>`,
    '<p class="lede">The page is fully readable, but there is no compose UI of any kind.</p>',
    '</section>',
    `<section class="${style.rootClass}">`,
    notice,
    loginPrompt,
    socialShare,
    comments,
    '</section>',
    '</div>',
  ].filter(Boolean).join('\n');

  const html = wrapHtml({
    title: `${topic[0]} - ${topic[1]}`,
    bodyContent: body,
    headExtras: `<style>${css}</style>`,
  });

  assertReadOnlyHtml(html);
  return html;
}

function assertReadOnlyHtml(html) {
  const lower = html.toLowerCase();
  const forbidden = ['<textarea', '<input type="text"', '<input type="email"', '<input type="url"', '<button', 'onclick=', 'onkeyup=', 'onchange='];
  for (const token of forbidden) {
    if (lower.includes(token)) {
      throw new Error(`Forbidden read-only token leaked: ${token}`);
    }
  }
}

function generatePages(outputDir, builder) {
  for (let pageNum = 1; pageNum <= 100; pageNum += 1) {
    writePage(outputDir, pageNum, builder(pageNum));
  }
}

function main() {
  generatePages(path.join(pagesRoot, 'prompt_16'), buildPrompt16Page);
  generatePages(path.join(pagesRoot, 'prompt_17'), buildPrompt17Page);
  generatePages(path.join(pagesRoot, 'prompt_18'), buildPrompt18Page);
  generatePages(path.join(pagesRoot, 'prompt_19'), buildPrompt19Page);
  generatePages(path.join(pagesRoot, 'prompt_20'), buildPrompt20Page);
  syncIndexCounts(indexPath, pagesRoot, 40);
  console.log(`Updated ${indexPath}`);
}

main();
