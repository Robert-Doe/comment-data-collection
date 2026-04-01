'use strict';

const fs = require('fs/promises');
const path = require('path');
const { parseCsvText, normalizeHeader, normalizeInputUrl } = require('../src/shared/csv');

const RAW_SITES = `
News & Media
1. nytimes.com
2. washingtonpost.com
3. theguardian.com
4. foxnews.com
5. cnn.com
6. bbc.com/news
7. nbcnews.com
8. abcnews.go.com
9. reuters.com
10. apnews.com
11. time.com
12. usatoday.com
13. latimes.com
14. wsj.com
15. politico.com
16. axios.com
17. slate.com
18. vox.com
19. huffpost.com
20. thehill.com
21. newsweek.com
22. independent.co.uk
23. aljazeera.com
24. bloomberg.com
25. financialtimes.com
26. economist.com
27. newyorker.com
28. nationalreview.com
29. reason.com
30. dailycaller.com
31. theatlantic.com
32. wired.com
33. mashable.com
34. techcrunch.com
35. engadget.com
36. gizmodo.com
37. arstechnica.com
38. verge.com
39. zdnet.com
40. cnet.com

Tech & Programming Blogs
41. stackoverflow.com
42. dev.to
43. freecodecamp.org
44. hackernoon.com
45. medium.com
46. github.com/discussions
47. sitepoint.com
48. smashingmagazine.com
49. css-tricks.com
50. digitalocean.com/community
51. dzone.com
52. codeproject.com
53. geeksforgeeks.org
54. tutorialspoint.com
55. baeldung.com
56. towardsdatascience.com
57. kaggle.com
58. ai.googleblog.com
59. openai.com/blog
60. aws.amazon.com/blogs
61. azure.microsoft.com/blog
62. cloudflare.com/blog
63. mongodb.com/blog
64. redis.io/blog
65. postgresweekly.com
66. mysql.com/blog
67. oracle.com/blogs
68. ibm.com/blog
69. intel.com/content/www/us/en/blogs
70. nvidia.com/blog
71. unity.com/blog
72. unrealengine.com/blog
73. flutter.dev/blog
74. kotlinlang.org/blog
75. swift.org/blog
76. rust-lang.org/blog
77. golang.org/blog
78. python.org/blog
79. django-project.com/weblog
80. react.dev/blog

Business, Marketing & Finance
81. neilpatel.com/blog
82. backlinko.com/blog
83. copyblogger.com
84. smartblogger.com
85. problogger.com
86. quicksprout.com
87. hubspot.com/blog
88. ahrefs.com/blog
89. semrush.com/blog
90. moz.com/blog
91. marketingprofs.com
92. contentmarketinginstitute.com
93. socialmediaexaminer.com
94. buffer.com/resources
95. hootsuite.com/blog
96. shopify.com/blog
97. bigcommerce.com/blog
98. stripe.com/blog
99. squareup.com/us/en/blog
100. investopedia.com
101. seekingalpha.com
102. fool.com
103. marketwatch.com
104. zerohedge.com
105. morningstar.com
106. nerdwallet.com/blog
107. bankrate.com
108. money.com
109. businessinsider.com
110. entrepreneur.com
111. inc.com
112. fastcompany.com
113. hbr.org
114. forbes.com
115. bloombergopinion.com
116. smallbiztrends.com
117. oberlo.com/blog
118. growthhackers.com
119. producthunt.com
120. indiehackers.com

Forums & Community Platforms
121. reddit.com
122. quora.com
123. hackernews.ycombinator.com
124. stackexchange.com
125. superuser.com
126. serverfault.com
127. math.stackexchange.com
128. physics.stackexchange.com
129. law.stackexchange.com
130. academia.stackexchange.com
131. boards.ie
132. somethingawful.com/forums
133. resetera.com
134. neogaf.com
135. forum.xda-developers.com
136. linustechtips.com/forums
137. tomshardware.com/forums
138. anandtech.com/forums
139. macrumors.com/forums
140. avforums.com
141. bodybuilding.com/forums
142. babycenter.com/community
143. mumsnet.com
144. city-data.com/forum
145. skool.com
146. discourse.org (platform examples)
147. phpbb.com/community
148. vbulletin.com/forum
149. xenforo.com/community
150. ubuntuforums.org

Gaming & Entertainment
151. ign.com
152. gamespot.com
153. polygon.com
154. kotaku.com
155. pcgamer.com
156. eurogamer.net
157. metacritic.com
158. imdb.com
159. rotten tomatoes.com
160. letterboxd.com
161. comicbook.com
162. screenrant.com
163. collider.com
164. fandom.com
165. nexusmods.com
166. steamcommunity.com
167. gamefaqs.gamespot.com
168. giantbomb.com
169. destructoid.com
170. vg247.com

Lifestyle, Travel, Food, etc.
171. nomadicmatt.com
172. thepointsguy.com
173. lonelyplanet.com
174. travelandleisure.com
175. cntraveler.com
176. thekitchn.com
177. seriouseats.com
178. allrecipes.com
179. foodnetwork.com
180. minimalistbaker.com
181. lifehacker.com
182. apartmenttherapy.com
183. treehugger.com
184. mindbodygreen.com
185. greatist.com
186. verywellmind.com
187. healthline.com
188. webmd.com
189. psychologytoday.com
190. goodreads.com
191. medium.com/lifestyle
192. buzzfeed.com
193. boredpanda.com
194. cracked.com
195. thoughtcatalog.com
196. waitbutwhy.com
197. zenhabits.net
198. markmanson.net
199. jamesclear.com
200. tim.blog
`;

const DOMAIN_FIXES = {
  'rotten tomatoes.com': 'rottentomatoes.com',
};

const SITE_OVERRIDES = {
  'github.com/discussions': {
    baseUrl: 'https://github.com/orgs/community/discussions',
    searchScope: 'github.com discussions',
  },
  'discourse.org (platform examples)': {
    displaySite: 'discourse.org (platform examples)',
    baseUrl: 'https://meta.discourse.org/',
    searchScope: 'meta.discourse.org',
    allowedHosts: ['meta.discourse.org', 'discourse.org'],
    kind: 'forum',
  },
  'phpbb.com/community': {
    baseUrl: 'https://www.phpbb.com/community/',
  },
  'vbulletin.com/forum': {
    baseUrl: 'https://www.vbulletin.com/forum/',
  },
  'xenforo.com/community': {
    baseUrl: 'https://xenforo.com/community/',
  },
  'cloudflare.com/blog': {
    baseUrl: 'https://blog.cloudflare.com/',
    allowedHosts: ['blog.cloudflare.com', 'cloudflare.com'],
  },
  'python.org/blog': {
    baseUrl: 'https://blog.python.org/',
    allowedHosts: ['blog.python.org', 'python.org'],
    searchScope: 'blog.python.org',
  },
  'golang.org/blog': {
    baseUrl: 'https://go.dev/blog/',
    allowedHosts: ['go.dev', 'golang.org'],
    searchScope: 'go.dev/blog',
  },
  'ai.googleblog.com': {
    baseUrl: 'https://blog.google/technology/ai/',
    allowedHosts: ['blog.google', 'ai.googleblog.com'],
    searchScope: 'blog.google AI',
  },
  'abcnews.go.com': {
    baseUrl: 'https://abcnews.go.com/',
  },
};

const DEFAULT_HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'accept-language': 'en-US,en;q=0.9',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'cache-control': 'no-cache',
  pragma: 'no-cache',
};

const EXCLUDED_FILE_EXTENSIONS = /\.(?:jpg|jpeg|png|gif|webp|svg|pdf|zip|mp3|mp4|mov|avi|wmv|xml|json|css|js)(?:[?#]|$)/i;
const NEGATIVE_PAGE_PATTERN = /\b(help|support|faq|policy|guidelines?|rules?|terms?|privacy|account|login|logout|sign[ -]?in|sign[ -]?out|sign[ -]?up|register|subscribe|subscription|newsletter|contact|feedback|about|careers?|jobs?|advertis(?:e|ing)|accessibility|authors?|tag|tags|category|categories|search|sitemap|cookie|preferences|comment(?:ing)? experience|comments? section|how to comment)\b/i;
const POSITIVE_PATH_PATTERN = /\b(comments?|discussion|discussions|thread|threads|topic|topics|forum|forums|question|questions|answer|answers|review|reviews|posts?|community|communities|reply|replies)\b/i;
const ARTICLE_PATH_PATTERN = /\/(?:\d{4}\/\d{2}\/\d{2}\/|article|articles|story|stories|blog|blogs|post|posts|news|politics|world|technology|tech|sports|travel|food|lifestyle)\//i;
const TECHNICAL_COMMENT_TOPIC_PATTERN = /\b(?:html|css|javascript|js|json|python|java|c\+\+|sql|bash|shell|code|source code|inline|multiline|block)\s+comments?\b|\bcomments?\s+in\s+(?:html|css|javascript|js|json|python|java|c\+\+|sql|bash|shell)\b|\bclean code comments?\b/i;
const DOCUMENTATION_PAGE_PATTERN = /\b(docs?|documentation|tutorials?|reference|learn|guide|guides|how to|how-to|syntax)\b/i;

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
    .replace(/&#x27;/g, '\'')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripTags(value) {
  return decodeHtmlEntities(String(value || '').replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeHost(value) {
  return String(value || '').toLowerCase().replace(/^www\./, '');
}

function parseRawSites(raw) {
  const rows = [];
  let category = '';

  for (const line of String(raw).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const itemMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
    if (itemMatch) {
      rows.push({
        id: Number(itemMatch[1]),
        input: itemMatch[2].trim(),
        category,
      });
      continue;
    }
    category = trimmed;
  }

  return rows;
}

function parseArgs(argv) {
  const options = {
    inputCsv: '',
    urlColumn: 'comment_url',
    siteColumn: 'site_name',
    categoryColumn: 'category',
    commentSystemColumn: 'comment_system',
    notesColumn: 'notes',
    outputName: '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--input-csv') options.inputCsv = argv[++index] || '';
    else if (argument === '--url-column') options.urlColumn = argv[++index] || '';
    else if (argument === '--site-column') options.siteColumn = argv[++index] || '';
    else if (argument === '--category-column') options.categoryColumn = argv[++index] || '';
    else if (argument === '--comment-system-column') options.commentSystemColumn = argv[++index] || '';
    else if (argument === '--notes-column') options.notesColumn = argv[++index] || '';
    else if (argument === '--output-name') options.outputName = argv[++index] || '';
    else if (argument === '--help' || argument === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

function inferKind(input, category) {
  const normalized = String(input).toLowerCase();
  if (/(stack(?:overflow|exchange)|superuser|serverfault|quora|hackernews|github\.com\/discussions)/.test(normalized)) return 'qa';
  if (/(reddit|forum|forums|boards\.ie|resetera|neogaf|mumsnet|city-data|skool|discourse|phpbb|vbulletin|xenforo|ubuntuforums|steamcommunity)/.test(normalized)) return 'forum';
  if (/(metacritic|imdb|rottentomatoes|letterboxd|goodreads)/.test(normalized)) return 'review';
  if (/(producthunt|indiehackers|growthhackers|fandom|nexusmods|gamefaqs)/.test(normalized)) return 'community';
  if (/Tech & Programming Blogs/i.test(category)) return 'blog';
  if (/Forums & Community Platforms/i.test(category)) return 'forum';
  if (/Gaming & Entertainment/i.test(category)) return 'article';
  if (/Business/i.test(category)) return 'blog';
  if (/Lifestyle/i.test(category)) return 'blog';
  return 'article';
}

function splitInputSite(siteInput) {
  const fixed = DOMAIN_FIXES[siteInput] || siteInput;
  if (fixed === 'discourse.org (platform examples)') {
    return { host: 'discourse.org', pathHint: '' };
  }
  const withoutDecoration = fixed.replace(/\s*\([^)]*\)\s*$/, '').trim();
  const slashIndex = withoutDecoration.indexOf('/');
  if (slashIndex === -1) {
    return { host: withoutDecoration, pathHint: '' };
  }
  return {
    host: withoutDecoration.slice(0, slashIndex),
    pathHint: withoutDecoration.slice(slashIndex),
  };
}

function buildSiteSeeds() {
  return parseRawSites(RAW_SITES).map((item) => {
    const override = SITE_OVERRIDES[item.input] || {};
    const split = splitInputSite(item.input);
    const host = normalizeHost(override.host || split.host);
    const baseUrl = override.baseUrl || `https://${DOMAIN_FIXES[item.input] || split.host}${split.pathHint}`;
    const allowedHosts = new Set([host, ...(override.allowedHosts || []).map(normalizeHost)]);
    return {
      id: item.id,
      category: item.category,
      site: item.input,
      displaySite: override.displaySite || item.input,
      host,
      pathHint: override.pathHint || split.pathHint || '',
      baseUrl,
      searchScope: override.searchScope || (DOMAIN_FIXES[item.input] || item.input.replace(/\s*\([^)]*\)\s*$/, '').trim()),
      kind: override.kind || inferKind(item.input, item.category),
      allowedHosts,
    };
  });
}

async function buildSiteSeedsFromCsv(inputCsvPath, options = {}) {
  const absolutePath = path.resolve(process.cwd(), inputCsvPath);
  const raw = await fs.readFile(absolutePath, 'utf8');
  const parsed = parseCsvText(raw, options.urlColumn || 'comment_url');
  const siteColumn = normalizeHeader(options.siteColumn || 'site_name');
  const categoryColumn = normalizeHeader(options.categoryColumn || 'category');
  const commentSystemColumn = normalizeHeader(options.commentSystemColumn || 'comment_system');
  const notesColumn = normalizeHeader(options.notesColumn || 'notes');

  return parsed.records
    .filter((record) => record.__normalized_url)
    .map((record, index) => {
      const normalizedUrl = normalizeInputUrl(record[parsed.urlColumn]);
      const parsedUrl = safeParseUrl(normalizedUrl);
      const siteName = String(record[siteColumn] || '').trim() || (parsedUrl ? normalizeHost(parsedUrl.host) : `row-${index + 1}`);
      const category = String(record[categoryColumn] || '').trim() || 'Uncategorized';
      const commentSystem = String(record[commentSystemColumn] || '').trim();
      const notes = String(record[notesColumn] || '').trim();
      const host = normalizeHost(parsedUrl ? parsedUrl.host : '');
      const pathHint = parsedUrl && parsedUrl.pathname && parsedUrl.pathname !== '/' ? parsedUrl.pathname : '';
      const searchScope = parsedUrl ? `${host}${pathHint}` : normalizedUrl;

      return {
        id: index + 1,
        category,
        site: siteName,
        displaySite: siteName,
        host,
        pathHint,
        baseUrl: normalizedUrl,
        searchScope,
        kind: inferKind(`${siteName} ${normalizedUrl} ${commentSystem}`, category),
        allowedHosts: new Set(host ? [host] : []),
        inputSeedUrl: normalizedUrl,
        inputCommentSystem: commentSystem,
        inputNotes: notes,
      };
    });
}

function toAbsoluteUrl(candidate, baseUrl) {
  try {
    return new URL(candidate, baseUrl).toString();
  } catch (_) {
    return '';
  }
}

function normalizeCandidateUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    url.hash = '';
    const kept = [];
    for (const [key, value] of url.searchParams.entries()) {
      if (/^(?:id|p|q|page|commentid|discussion|item)$/i.test(key)) {
        kept.push([key, value]);
      }
    }
    url.search = '';
    for (const [key, value] of kept) {
      url.searchParams.append(key, value);
    }
    if (url.pathname !== '/') {
      url.pathname = url.pathname.replace(/\/+$/, '');
    }
    return url.toString();
  } catch (_) {
    return '';
  }
}

function safeParseUrl(rawUrl) {
  try {
    return new URL(rawUrl);
  } catch (_) {
    return null;
  }
}

function sameSite(url, site) {
  try {
    const host = normalizeHost(new URL(url).host);
    if (site.allowedHosts.has(host)) return true;
    for (const allowedHost of site.allowedHosts) {
      if (host === allowedHost || host.endsWith(`.${allowedHost}`) || allowedHost.endsWith(`.${host}`)) {
        return true;
      }
    }
    return false;
  } catch (_) {
    return false;
  }
}

function isSkippableUrl(url) {
  if (!url) return true;
  if (!/^https?:\/\//i.test(url)) return true;
  if (/^(?:mailto|javascript|tel):/i.test(url)) return true;
  if (EXCLUDED_FILE_EXTENSIONS.test(url)) return true;
  return false;
}

function scorePath(urlString, site, text = '') {
  try {
    const url = new URL(urlString);
    const pathLower = url.pathname.toLowerCase();
    const titleText = String(text || '').toLowerCase();
    const segments = pathLower.split('/').filter(Boolean);
    let score = 0;

    if (!segments.length) score -= 4;
    if (segments.length >= 2) score += 3;
    if (segments.length >= 3) score += 2;
    if (ARTICLE_PATH_PATTERN.test(pathLower)) score += 4;
    if (POSITIVE_PATH_PATTERN.test(pathLower)) score += 8;
    if (/\d{4}\/\d{2}\/\d{2}/.test(pathLower)) score += 3;
    if (/\d{5,}/.test(pathLower)) score += 3;
    if (/-/.test(segments[segments.length - 1] || '')) score += 2;
    if (site.pathHint && pathLower.includes(site.pathHint.toLowerCase())) score += 2;
    if (titleText.length >= 24) score += 2;

    if (NEGATIVE_PAGE_PATTERN.test(pathLower)) score -= 16;
    if (NEGATIVE_PAGE_PATTERN.test(titleText)) score -= 12;
    if (/\/(?:topic|topics|forum|forums|questions|discussions?)\/?$/.test(pathLower)) score -= 3;
    if (/\/(?:news|politics|world|business|tech|technology|travel|food|blog|blogs|community|forums?)\/?$/.test(pathLower)) score -= 4;

    if (site.kind === 'qa' && /\/questions?\//.test(pathLower)) score += 10;
    if (site.kind === 'forum' && /\/(?:forum|forums|thread|threads|topic|topics|discussion|discussions|comments)\//.test(pathLower)) score += 10;
    if (site.kind === 'review' && /\/(?:title|movie|show|book|album|game|games|recipe|recipes|product|products|review|reviews)\//.test(pathLower)) score += 8;

    return score;
  } catch (_) {
    return -100;
  }
}

async function fetchText(url, options = {}) {
  const timeoutMs = Math.max(5000, Number(options.timeoutMs || 15000));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: DEFAULT_HEADERS,
      redirect: 'follow',
      signal: controller.signal,
    });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      url: response.url,
      text,
      contentType: response.headers.get('content-type') || '',
      error: '',
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      url,
      text: '',
      contentType: '',
      error: error && error.message ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

function isBlockedResponse(payload) {
  const sample = String(payload && payload.text ? payload.text : '').slice(0, 6000).toLowerCase();
  return (
    payload.status === 401 ||
    payload.status === 403 ||
    /just a moment|security verification|captcha|please enable js|disable any ad blocker|access denied|verify you are human|bot verification/.test(sample)
  );
}

function extractLinksFromHtml(html, baseUrl, site) {
  const results = [];
  const seen = new Set();
  const anchorPattern = /<a\b[^>]*href=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  let match = null;
  let iterations = 0;

  while ((match = anchorPattern.exec(html)) && iterations < 1200) {
    iterations += 1;
    const href = decodeHtmlEntities(match[2] || '').trim();
    if (!href || href.startsWith('#') || isSkippableUrl(href)) continue;
    const absoluteUrl = normalizeCandidateUrl(toAbsoluteUrl(href, baseUrl));
    if (!absoluteUrl || !sameSite(absoluteUrl, site)) continue;
    if (seen.has(absoluteUrl)) continue;
    seen.add(absoluteUrl);

    const anchorText = stripTags(match[3] || '');
    const discoveryScore = scorePath(absoluteUrl, site, anchorText);
    if (discoveryScore < 1) continue;

    results.push({
      url: absoluteUrl,
      source: 'homepage',
      query: 'homepage',
      title: anchorText,
      snippet: '',
      discoveryScore,
    });
  }

  return results.sort((left, right) => right.discoveryScore - left.discoveryScore).slice(0, 10);
}

function decodeDuckDuckGoUrl(rawUrl) {
  try {
    const resolved = new URL(rawUrl, 'https://duckduckgo.com');
    const target = resolved.searchParams.get('uddg');
    return target ? decodeURIComponent(target) : resolved.toString();
  } catch (_) {
    return '';
  }
}

function parseDuckDuckGoResults(html) {
  return String(html || '')
    .split('<div class="result results_links results_links_deep web-result ">')
    .slice(1)
    .map((block) => {
      const href = /class="result__a" href="([^"]+)"/i.exec(block);
      const title = /class="result__a" href="[^"]+">([\s\S]*?)<\/a>/i.exec(block);
      const snippet = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i.exec(block);
      return {
        url: decodeDuckDuckGoUrl(href ? href[1] : ''),
        title: stripTags(title ? title[1] : ''),
        snippet: stripTags(snippet ? snippet[1] : ''),
      };
    })
    .filter((item) => item.url);
}

function buildQueries(site) {
  const scope = site.searchScope;
  if (site.kind === 'qa') {
    return [
      `site:${scope} questions`,
      `site:${scope} answers`,
      `site:${scope} comments`,
    ];
  }
  if (site.kind === 'forum') {
    return [
      `site:${scope} discussion`,
      `site:${scope} thread`,
      `site:${scope} comments`,
    ];
  }
  if (site.kind === 'review') {
    return [
      `site:${scope} reviews`,
      `site:${scope} "user reviews"`,
      `site:${scope} comments`,
    ];
  }
  if (site.kind === 'community') {
    return [
      `site:${scope} discussions`,
      `site:${scope} comments`,
      `site:${scope} community`,
    ];
  }
  return [
    `site:${scope} comments`,
    `site:${scope} "leave a comment"`,
    `site:${scope} discussion`,
  ];
}

function scoreSearchResult(url, site, title, snippet) {
  const haystack = `${title} ${snippet}`.toLowerCase();
  let score = scorePath(url, site, title);
  if (/\bcomments?\b/.test(haystack)) score += 5;
  if (/\b(join the conversation|leave a comment|post a comment|reader comments)\b/.test(haystack)) score += 8;
  if (/\bdiscussion|thread|forum|topic|reply|replies\b/.test(haystack)) score += 6;
  if (/\bquestion|questions|answer|answers\b/.test(haystack)) score += 6;
  if (/\breview|reviews|rating|ratings\b/.test(haystack)) score += 6;
  if (NEGATIVE_PAGE_PATTERN.test(haystack)) score -= 16;
  if (/\bcommentary\b/.test(haystack)) score -= 6;
  return score;
}

async function discoverSearchCandidates(site) {
  const results = [];
  const seen = new Set();

  for (const query of buildQueries(site)) {
    const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const payload = await fetchText(url, { timeoutMs: 12000 });
    if (!payload.text) continue;
    for (const item of parseDuckDuckGoResults(payload.text)) {
      const normalizedUrl = normalizeCandidateUrl(item.url);
      if (!normalizedUrl || !sameSite(normalizedUrl, site)) continue;
      if (seen.has(normalizedUrl)) continue;
      seen.add(normalizedUrl);
      const discoveryScore = scoreSearchResult(normalizedUrl, site, item.title, item.snippet);
      if (discoveryScore < 1) continue;
      results.push({
        url: normalizedUrl,
        source: 'search',
        query,
        title: item.title,
        snippet: item.snippet,
        discoveryScore,
      });
    }
    if (results.length >= 8) break;
  }

  return results.sort((left, right) => right.discoveryScore - left.discoveryScore).slice(0, 10);
}

function addAllowedHost(site, url) {
  try {
    site.allowedHosts.add(normalizeHost(new URL(url).host));
  } catch (_) {
    return;
  }
}

function analyzeFetchedPage(payload, site, candidate) {
  const html = String(payload.text || '');
  const lower = html.toLowerCase();
  const title = stripTags((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || candidate.title || '');
  const titleLower = title.toLowerCase();
  const finalUrl = payload.url || candidate.url;
  const finalUrlLower = finalUrl.toLowerCase();
  let score = Number(candidate.discoveryScore || 0);
  const signals = [];
  const accessNotes = [];
  let hardSignalCount = 0;
  let articleHardSignalCount = 0;
  let qaStrong = false;
  let forumStrong = false;
  let reviewStrong = false;
  const parsedFinalUrl = safeParseUrl(finalUrl);
  const finalSegments = parsedFinalUrl ? parsedFinalUrl.pathname.split('/').filter(Boolean) : [];
  const lastSegment = finalSegments[finalSegments.length - 1] || '';
  const previousSegment = finalSegments[finalSegments.length - 2] || '';

  if (!payload.ok && payload.status) {
    accessNotes.push(`http ${payload.status}`);
  }
  if (payload.error) {
    accessNotes.push(payload.error);
  }
  if (isBlockedResponse(payload)) {
    accessNotes.push('blocked or verification required');
    score -= 2;
  }

  const hardSignals = [
    { pattern: /hedgehog-comment-embed/i, label: 'comment embed', type: 'comment' },
    { pattern: /disqus/i, label: 'disqus', type: 'comment' },
    { pattern: /giscus/i, label: 'giscus', type: 'comment' },
    { pattern: /utteranc\.es|utterances/i, label: 'utterances', type: 'comment' },
    { pattern: /viafoura/i, label: 'viafoura', type: 'comment' },
    { pattern: /spotim|openweb/i, label: 'spotim/openweb', type: 'comment' },
    { pattern: /coral-talk|coral comment/i, label: 'coral', type: 'comment' },
    { pattern: /hyvor-talk|hyvor/i, label: 'hyvor', type: 'comment' },
    { pattern: /graphcomment/i, label: 'graphcomment', type: 'comment' },
    { pattern: /commento/i, label: 'commento', type: 'comment' },
    { pattern: /remark42/i, label: 'remark42', type: 'comment' },
    { pattern: /facebook\.com\/plugins\/comments/i, label: 'facebook comments', type: 'comment' },
    { pattern: /commentcount/i, label: 'commentCount', type: 'comment' },
    { pattern: /show_comments/i, label: 'show_comments', type: 'comment' },
    { pattern: /comments?\s*:\s*\{[^}]{0,120}enabled/i, label: 'comments enabled flag', type: 'comment' },
    { pattern: /<[^>]+(?:id|class|data-[^=]+|aria-label|name)=["'][^"']*\bcomments?\b[^"']*["']/i, label: 'comment selector', type: 'comment' },
    { pattern: /<[^>]+(?:id|class|data-[^=]+|aria-label|name)=["'][^"']*\bdiscussion\b[^"']*["']/i, label: 'discussion selector', type: 'discussion' },
    { pattern: /<[^>]+(?:id|class|data-[^=]+|aria-label|name)=["'][^"']*\brepl(?:y|ies)\b[^"']*["']/i, label: 'reply selector', type: 'comment' },
    { pattern: /<[^>]+(?:id|class|data-[^=]+|aria-label|name)=["'][^"']*\breviews?\b[^"']*["']/i, label: 'review selector', type: 'review' },
    { pattern: /\bjoin the conversation\b/i, label: 'join the conversation', type: 'comment' },
    { pattern: /\bleave a comment\b|\bpost a comment\b|\badd a comment\b/i, label: 'comment prompt', type: 'comment' },
    { pattern: /\breader comments\b/i, label: 'reader comments', type: 'comment' },
    { pattern: /\bcommunity comments\b/i, label: 'community comments', type: 'comment' },
  ];

  for (const signal of hardSignals) {
    if (signal.pattern.test(html)) {
      score += 12;
      hardSignalCount += 1;
      if (signal.type !== 'review') {
        articleHardSignalCount += 1;
      }
      signals.push(signal.label);
    }
  }

  if (candidate.source === 'search' && /\bcomments?\b/i.test(candidate.snippet)) {
    score += 2;
  }

  if (site.kind === 'qa') {
    if (/itemtype="https:\/\/schema\.org\/qapage"/i.test(html) || /itemtype="https:\/\/schema\.org\/question"/i.test(html)) {
      score += 16;
      signals.push('QAPage schema');
      qaStrong = true;
    }
    if (/\banswers?\b/.test(lower) && /\bquestion\b/.test(lower)) {
      score += 8;
      signals.push('question/answer text');
    }
  }

  if (site.kind === 'forum' || site.kind === 'community') {
    if (/\bdiscussion\b|\bthread\b|\breplies?\b|\bposted by\b|\blast reply\b/i.test(lower)) {
      score += 8;
      signals.push('discussion thread text');
    }
  }

  if (site.kind === 'review') {
    if (/\buser reviews?\b|\breviewer\b|\brating\b|\bratings\b/i.test(lower)) {
      score += 8;
      signals.push('review text');
      reviewStrong = true;
    }
  }

  if (site.kind === 'article' || site.kind === 'blog') {
    if (/\bcomments?\b/i.test(lower) && /\brepl(?:y|ies)\b/i.test(lower)) {
      score += 4;
      signals.push('comments and replies text');
    }
  }

  const negativePage = (
    NEGATIVE_PAGE_PATTERN.test(titleLower) ||
    NEGATIVE_PAGE_PATTERN.test(candidate.snippet || '') ||
    NEGATIVE_PAGE_PATTERN.test(finalUrlLower)
  );
  if (negativePage) {
    score -= 18;
    signals.push('help/policy page');
  }
  if ((site.kind === 'article' || site.kind === 'blog') && hardSignalCount === 0) {
    const topicText = `${title} ${candidate.snippet}`.toLowerCase();
    if (TECHNICAL_COMMENT_TOPIC_PATTERN.test(topicText)) {
      score -= 18;
      signals.push('comment topic article');
    }
    if (DOCUMENTATION_PAGE_PATTERN.test(topicText)) {
      score -= 8;
      signals.push('documentation/tutorial page');
    }
  }
  if (/\bcommentary\b/.test(titleLower)) {
    score -= 8;
  }
  if (/\/(?:commentary|opinion\/commentary)\//.test(finalUrlLower)) {
    score -= 8;
  }

  const qaPathStrong = /\/(?:questions\/\d+|q\/\d+|a\/\d+)/.test(finalUrlLower);
  if (site.kind === 'qa' && qaPathStrong) {
    qaStrong = true;
  }

  const forumThreadPath = (
    /\/discussion\/\d+/.test(finalUrlLower) ||
    /\/(?:threads?|topic|topics)\/[^/?#]+/.test(finalUrlLower) ||
    /\/t\/[^/?#]+/.test(finalUrlLower) ||
    /showthread\.php(?:\?|$)/.test(finalUrlLower) ||
    /\/comments\/[^/?#]+/.test(finalUrlLower) ||
    /\/forum\/[^/?#]+\/\d+/.test(finalUrlLower)
  );
  if ((site.kind === 'forum' || site.kind === 'community') && forumThreadPath) {
    forumStrong = true;
  }
  if (site.kind === 'review' && /\/(?:movie|movies|tv|book|books|game|games|album|albums|recipe|recipes|product|products|reviews?)\//.test(finalUrlLower)) {
    reviewStrong = true;
  }

  let status = 'unresolved';
  const articlePageStrong = (
    finalSegments.length >= 2 &&
    (
      /\d{4}\/\d{2}\/\d{2}/.test(finalUrlLower) ||
      /\d{5,}/.test(finalUrlLower) ||
      lastSegment.split('-').filter(Boolean).length >= 4 ||
      /\.(?:html|htm)$/.test(lastSegment) ||
      /\b(article|story|stories|review|reviews|blog|post)\b/.test(previousSegment)
    )
  );
  const articleStrong = articlePageStrong && articleHardSignalCount > 0;
  const strongByKind = (
    articleStrong ||
    qaStrong ||
    forumStrong ||
    reviewStrong
  );
  if (negativePage && hardSignalCount < 2 && !qaStrong && !forumStrong && !reviewStrong) {
    status = 'unresolved';
  } else
  if (score >= 28 && strongByKind) {
    status = 'validated';
  } else if (score >= 18 && (strongByKind || hardSignalCount > 0)) {
    status = isBlockedResponse(payload) ? 'blocked-but-likely' : 'likely';
  } else if (score >= 10) {
    status = isBlockedResponse(payload) ? 'blocked-but-likely' : 'weak';
  }

  return {
    site: site.displaySite,
    category: site.category,
    id: site.id,
    kind: site.kind,
    inputSeedUrl: site.inputSeedUrl || site.baseUrl || '',
    inputCommentSystem: site.inputCommentSystem || '',
    inputNotes: site.inputNotes || '',
    url: candidate.url,
    finalUrl,
    title,
    source: candidate.source,
    query: candidate.query,
    discoveryScore: candidate.discoveryScore,
    score,
    status,
    signals: Array.from(new Set(signals)).slice(0, 6),
    accessNote: accessNotes.join('; '),
    httpStatus: payload.status,
  };
}

function compareEvaluations(left, right) {
  const rank = {
    validated: 4,
    likely: 3,
    'blocked-but-likely': 2,
    weak: 1,
    unresolved: 0,
  };
  return (
    (rank[right.status] || 0) - (rank[left.status] || 0) ||
    right.score - left.score ||
    right.discoveryScore - left.discoveryScore
  );
}

function csvEscape(value) {
  const stringValue = String(value ?? '');
  if (/[",\r\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function buildCsv(rows) {
  const headers = [
    'id',
    'category',
    'site',
    'kind',
    'input_seed_url',
    'input_comment_system',
    'input_notes',
    'status',
    'score',
    'source',
    'query',
    'url',
    'final_url',
    'title',
    'signals',
    'http_status',
    'access_note',
  ];
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(row[header])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

function buildStatusCountsCsv(rows, statusFiles = {}) {
  const counts = rows.reduce((accumulator, row) => {
    accumulator[row.status] = (accumulator[row.status] || 0) + 1;
    return accumulator;
  }, {});

  const orderedStatuses = Object.keys(counts).sort((left, right) => left.localeCompare(right));
  const lines = ['status,row_count,file_name'];

  for (const status of orderedStatuses) {
    lines.push([
      csvEscape(status),
      csvEscape(counts[status]),
      csvEscape(statusFiles[status] || ''),
    ].join(','));
  }

  return `${lines.join('\n')}\n`;
}

function buildMarkdown(rows) {
  const counts = rows.reduce((accumulator, row) => {
    accumulator[row.status] = (accumulator[row.status] || 0) + 1;
    return accumulator;
  }, {});

  const summary = [
    '# Comment-bearing page candidates',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    `Validated: ${counts.validated || 0} | Likely: ${counts.likely || 0} | Blocked-but-likely: ${counts['blocked-but-likely'] || 0} | Weak: ${counts.weak || 0} | Unresolved: ${counts.unresolved || 0}`,
    '',
    '| # | Site | Status | URL | Signals |',
    '| - | - | - | - | - |',
  ];

  for (const row of rows) {
    const urlCell = row.url ? `[${row.url}](${row.url})` : '';
    const signals = row.signals || row.access_note || '';
    summary.push(`| ${row.id} | ${row.site} | ${row.status} | ${urlCell} | ${signals} |`);
  }

  return `${summary.join('\n')}\n`;
}

async function evaluateCandidates(site, candidates) {
  const evaluated = [];
  const seen = new Set();

  for (const candidate of candidates) {
    if (!candidate || !candidate.url) continue;
    if (seen.has(candidate.url)) continue;
    seen.add(candidate.url);

    const payload = await fetchText(candidate.url, { timeoutMs: 15000 });
    if (payload.url) addAllowedHost(site, payload.url);
    const evaluation = analyzeFetchedPage(payload, site, candidate);
    evaluated.push(evaluation);

    if (evaluation.status === 'validated' && evaluation.score >= 34) {
      break;
    }
  }

  return evaluated.sort(compareEvaluations);
}

async function processSite(site, totalCount) {
  const siteCopy = {
    ...site,
    allowedHosts: new Set(site.allowedHosts),
  };

  const homepagePayload = await fetchText(siteCopy.baseUrl, { timeoutMs: 15000 });
  if (homepagePayload.url) addAllowedHost(siteCopy, homepagePayload.url);

  let homepageCandidates = [];
  if (homepagePayload.text && !isBlockedResponse(homepagePayload)) {
    homepageCandidates = extractLinksFromHtml(homepagePayload.text, homepagePayload.url || siteCopy.baseUrl, siteCopy);
  }

  let evaluated = await evaluateCandidates(siteCopy, homepageCandidates.slice(0, 4));
  let best = evaluated[0] || null;

  if (!best || best.status === 'unresolved' || best.status === 'weak') {
    const searchCandidates = await discoverSearchCandidates(siteCopy);
    const merged = [];
    const mergedSeen = new Set((homepageCandidates || []).map((candidate) => candidate.url));
    for (const candidate of searchCandidates) {
      if (mergedSeen.has(candidate.url)) continue;
      mergedSeen.add(candidate.url);
      merged.push(candidate);
    }
    const searchEvaluated = await evaluateCandidates(siteCopy, merged.slice(0, 5));
    evaluated = evaluated.concat(searchEvaluated).sort(compareEvaluations);
    best = evaluated[0] || best;
  }

  if (!best) {
    best = {
      id: siteCopy.id,
      category: siteCopy.category,
      site: siteCopy.displaySite,
      kind: siteCopy.kind,
      inputSeedUrl: siteCopy.inputSeedUrl || siteCopy.baseUrl || '',
      inputCommentSystem: siteCopy.inputCommentSystem || '',
      inputNotes: siteCopy.inputNotes || '',
      status: 'unresolved',
      score: 0,
      source: '',
      query: '',
      url: '',
      finalUrl: '',
      title: '',
      signals: [],
      httpStatus: homepagePayload.status,
      accessNote: homepagePayload.error || (isBlockedResponse(homepagePayload) ? 'homepage blocked or verification required' : ''),
      discoveryScore: 0,
    };
  }

  console.log(`[${siteCopy.id}/${totalCount}] ${siteCopy.displaySite} -> ${best.status}${best.url ? ` ${best.url}` : ''}`);
  return best;
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let index = 0;

  async function run() {
    while (true) {
      const currentIndex = index;
      index += 1;
      if (currentIndex >= items.length) return;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }

  const workers = Array.from({ length: Math.max(1, concurrency) }, () => run());
  await Promise.all(workers);
  return results;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const sites = options.inputCsv
    ? await buildSiteSeedsFromCsv(options.inputCsv, options)
    : buildSiteSeeds();
  const results = await mapWithConcurrency(sites, 4, (site) => processSite(site, sites.length));
  results.sort((left, right) => left.id - right.id);

  const outputDir = path.resolve(process.cwd(), 'output');
  const defaultDatasetName = options.inputCsv
    ? slugify(path.basename(options.inputCsv, path.extname(options.inputCsv)))
    : 'requested-comment-pages';
  const datasetDir = path.join(outputDir, options.outputName ? slugify(options.outputName) : defaultDatasetName);
  const statusDir = path.join(datasetDir, 'by-status');
  await fs.mkdir(datasetDir, { recursive: true });
  await fs.mkdir(statusDir, { recursive: true });

  const csvPath = path.join(datasetDir, 'all.csv');
  const markdownPath = path.join(datasetDir, 'all.md');
  const countsPath = path.join(datasetDir, 'status-counts.csv');

  await fs.writeFile(csvPath, buildCsv(results), 'utf8');
  await fs.writeFile(markdownPath, buildMarkdown(results), 'utf8');

  const counts = results.reduce((accumulator, row) => {
    accumulator[row.status] = (accumulator[row.status] || 0) + 1;
    return accumulator;
  }, {});

  const rowsByStatus = results.reduce((accumulator, row) => {
    if (!accumulator[row.status]) {
      accumulator[row.status] = [];
    }
    accumulator[row.status].push(row);
    return accumulator;
  }, {});

  const statusFiles = {};
  for (const [status, rows] of Object.entries(rowsByStatus)) {
    const fileName = `${slugify(status)}.csv`;
    const filePath = path.join(statusDir, fileName);
    await fs.writeFile(filePath, buildCsv(rows), 'utf8');
    statusFiles[status] = path.relative(datasetDir, filePath).replace(/\\/g, '/');
  }

  await fs.writeFile(countsPath, buildStatusCountsCsv(results, statusFiles), 'utf8');

  console.log(`Wrote ${csvPath}`);
  console.log(`Wrote ${markdownPath}`);
  console.log(`Wrote ${countsPath}`);
  console.log(`Wrote status CSVs in ${statusDir}`);
  console.log(JSON.stringify(counts, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exitCode = 1;
  });
}
