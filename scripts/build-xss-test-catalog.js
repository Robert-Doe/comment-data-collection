'use strict';

const crypto = require('crypto');
const fs = require('fs/promises');
const fsSync = require('fs');
const https = require('https');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const payloadsPath = path.join(repoRoot, 'payloads.html');
const outputPath = path.join(repoRoot, 'src', 'shared', 'xss-test-pages', 'catalog.json');
const portswiggerUrl = 'https://portswigger.net/web-security/cross-site-scripting/cheat-sheet';

const renderModes = [
  'static-ssr',
  'csr-innerHTML',
  'csr-insertAdjacentHTML',
  'csr-range-fragment',
  'csr-template-clone',
  'spa-route-hydration',
  'shadow-dom',
  'iframe-srcdoc',
];

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: {
        'User-Agent': 'comment-data-collection-xss-test-builder/1.0',
        Accept: 'text/html,application/xhtml+xml',
      },
    }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        resolve(fetchText(new URL(response.headers.location, url).toString()));
        return;
      }

      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`GET ${url} failed with HTTP ${response.statusCode}`));
        return;
      }

      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => resolve(body));
    });

    request.setTimeout(30000, () => {
      request.destroy(new Error(`GET ${url} timed out`));
    });
    request.on('error', reject);
  });
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

function stripTags(value) {
  return decodeHtml(String(value || '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeWhitespace(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .replace(/\s+\n/g, '\n')
    .trim();
}

function compactPayload(value) {
  return normalizeWhitespace(value).replace(/\s+/g, ' ').trim();
}

function normalizeKey(payload) {
  return compactPayload(payload).toLowerCase();
}

function slugify(value, fallback = 'payload') {
  const slug = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 64);
  return slug || fallback;
}

function digest(payload) {
  return crypto.createHash('sha256').update(String(payload || '')).digest('hex').slice(0, 12);
}

function getLastMatch(pattern, source) {
  let found = null;
  let match;
  pattern.lastIndex = 0;
  while ((match = pattern.exec(source))) {
    found = match;
  }
  return found;
}

function extractNearestHeading(html, offset, level) {
  const start = Math.max(0, offset - 120000);
  const preceding = html.slice(start, offset);
  const heading = getLastMatch(new RegExp(`<h${level}\\b[^>]*id="([^"]+)"[^>]*>([\\s\\S]*?)<\\/h${level}>`, 'g'), preceding);
  if (!heading) return null;
  return {
    id: heading[1],
    title: stripTags(heading[2]),
  };
}

function extractNearestDetails(html, offset) {
  const start = Math.max(0, offset - 30000);
  const preceding = html.slice(start, offset);
  const details = getLastMatch(/<details\b[^>]*id="([^"]+)"[^>]*>\s*<summary>([\s\S]*?)<\/summary>/g, preceding);
  if (!details) return null;
  const title = stripTags(details[2]);
  if (/^event handlers|^content types/i.test(title)) return null;
  return {
    id: details[1],
    title,
  };
}

function extractNearestParagraph(html, offset) {
  const start = Math.max(0, offset - 3000);
  const preceding = html.slice(start, offset);
  const paragraphs = [...preceding.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)]
    .map((match) => stripTags(match[1]))
    .filter((text) => text && !/^(event|description|tag|code|copy|compatibility):?$/i.test(text));
  return paragraphs.length ? paragraphs[paragraphs.length - 1] : '';
}

function extractFirstTag(payload) {
  const match = String(payload || '').match(/<\s*\/?\s*([a-zA-Z][a-zA-Z0-9:-]*)/);
  return match ? match[1].toLowerCase() : '';
}

function extractEvents(payload) {
  const events = new Set();
  const rx = /\bon[a-zA-Z0-9:-]+(?=\s*=)/g;
  let match;
  while ((match = rx.exec(String(payload || '')))) {
    events.add(match[0].toLowerCase());
  }
  return Array.from(events).sort();
}

function classifySinkTypes(payload) {
  const text = String(payload || '').toLowerCase();
  const sinkTypes = [];
  if (/<\s*script\b/.test(text)) sinkTypes.push('script-tag');
  if (/\bon[a-z0-9:-]+\s*=/.test(text)) sinkTypes.push('inline-event-handler');
  if (/\bjavascript\s*:/.test(text)) sinkTypes.push('javascript-url');
  if (/<\s*(svg|animate|set|use|math|mtext|mglyph)\b/.test(text)) sinkTypes.push('namespace-markup');
  if (/<\s*(iframe|object|embed|applet)\b/.test(text)) sinkTypes.push('embedded-content');
  if (/<\s*(template|noscript|xmp|plaintext|listing)\b/.test(text)) sinkTypes.push('parser-state');
  if (/\bdata\s*:[^"'\s>]+/.test(text)) sinkTypes.push('data-url');
  if (/\bstyle\s*=|<\s*style\b|expression\s*\(|@keyframes/i.test(payload)) sinkTypes.push('css-trigger');
  if (/\bsrcdoc\s*=/.test(text)) sinkTypes.push('srcdoc');
  if (/\bsrc\s*=|\bhref\s*=|\baction\s*=|\bformaction\s*=/.test(text)) sinkTypes.push('url-attribute');
  return Array.from(new Set(sinkTypes));
}

function inferName(payload, fallback) {
  const events = extractEvents(payload);
  if (events.length) return events.join(', ');
  const tag = extractFirstTag(payload);
  if (tag) return `<${tag}> vector`;
  return fallback;
}

function chooseRenderMode(payload, index) {
  const text = String(payload || '').toLowerCase();
  if (/<\s*(html|head|body|base|title|meta)\b/.test(text)) {
    return index % 2 === 0 ? 'static-ssr' : 'csr-innerHTML';
  }
  if (/<\s*script\b/.test(text)) {
    return index % 3 === 0 ? 'static-ssr' : 'csr-range-fragment';
  }
  return renderModes[index % renderModes.length];
}

function buildEntry(raw, metadata, nextNumber) {
  const payload = compactPayload(raw);
  const tag = extractFirstTag(payload);
  const events = extractEvents(payload);
  const sinkTypes = classifySinkTypes(payload);
  const title = metadata.title || inferName(payload, `payload ${nextNumber}`);
  const shortSlug = slugify([metadata.source, title, tag || events[0] || 'payload'].filter(Boolean).join('-'));
  return {
    id: `${metadata.prefix}-${String(nextNumber).padStart(5, '0')}-${shortSlug}-${digest(payload)}`,
    number: nextNumber,
    source: metadata.source,
    source_url: metadata.sourceUrl || '',
    proof_url: metadata.proofUrl || '',
    category: metadata.category || 'XSS payloads',
    group: metadata.group || '',
    title,
    description: metadata.description || '',
    tag,
    events,
    sink_types: sinkTypes,
    render_mode: chooseRenderMode(payload, nextNumber - 1),
    payload,
  };
}

function parsePortSwigger(html) {
  const entries = [];
  const seen = new Set();
  const codeLinkPattern = /<a\b[^>]*href="([^"]*context=[^"]*)"[^>]*>\s*<code>([\s\S]*?)<\/code>\s*<\/a>/g;
  let match;
  while ((match = codeLinkPattern.exec(html))) {
    const payload = compactPayload(decodeHtml(match[2]));
    if (!payload || seen.has(normalizeKey(payload))) continue;
    seen.add(normalizeKey(payload));

    const section = extractNearestHeading(html, match.index, 2);
    const subsection = extractNearestHeading(html, match.index, 3);
    const details = extractNearestDetails(html, match.index);
    const description = extractNearestParagraph(html, match.index);
    const title = details && details.title ? details.title : inferName(payload, 'PortSwigger vector');
    const href = decodeHtml(match[1]);
    const proofUrl = href.startsWith('http') ? href : new URL(href, portswiggerUrl).toString();

    entries.push({
      payload,
      source: 'portswigger',
      sourceUrl: portswiggerUrl,
      proofUrl,
      category: section && section.title ? section.title : 'PortSwigger XSS Cheat Sheet',
      group: subsection && subsection.title ? subsection.title : '',
      title,
      description,
    });
  }
  return entries;
}

function parseLocalPayloads() {
  if (!fsSync.existsSync(payloadsPath)) return [];
  const html = fsSync.readFileSync(payloadsPath, 'utf8');
  const fragments = [];
  const seen = new Set();
  const tagPattern = /<([a-zA-Z][^\s/>]*)(?:\s[^<>]*?\bon[a-zA-Z0-9:-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)[^<>]*)?>/g;
  let match;
  while ((match = tagPattern.exec(html))) {
    const raw = match[0].replace(/\s+/g, ' ').trim();
    if (!/\son[a-zA-Z0-9:-]+\s*=/.test(raw)) continue;
    const key = normalizeKey(raw);
    if (seen.has(key)) continue;
    seen.add(key);
    fragments.push({
      payload: raw,
      source: 'payloads-html',
      sourceUrl: 'payloads.html',
      proofUrl: '',
      category: 'Local payloads.html event variants',
      group: 'Expanded tag/event combinations',
      title: inferName(raw, 'Local event handler vector'),
      description: 'Extracted from the local payloads.html fixture as an individual opening fragment.',
    });
  }
  return fragments;
}

async function main() {
  const html = await fetchText(portswiggerUrl);
  const lastUpdatedMatch = html.match(/Last updated:\s*([^<.]+)/i);
  const portswiggerRawEntries = parsePortSwigger(html);
  const localRawEntries = parseLocalPayloads();

  const all = [];
  const seen = new Set();
  let number = 1;

  for (const raw of [...portswiggerRawEntries, ...localRawEntries]) {
    const key = normalizeKey(raw.payload);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const prefix = raw.source === 'portswigger' ? 'ps' : 'local';
    all.push(buildEntry(raw.payload, { ...raw, prefix }, number));
    number += 1;
  }

  const catalog = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    sources: [
      {
        name: 'PortSwigger XSS Cheat Sheet',
        url: portswiggerUrl,
        last_updated: lastUpdatedMatch ? stripTags(lastUpdatedMatch[1]) : '',
        unique_payload_count: portswiggerRawEntries.length,
      },
      {
        name: 'Local payloads.html',
        url: 'payloads.html',
        unique_payload_count: localRawEntries.length,
      },
    ],
    render_modes: renderModes,
    counts: {
      total: all.length,
      by_source: all.reduce((memo, entry) => {
        memo[entry.source] = (memo[entry.source] || 0) + 1;
        return memo;
      }, {}),
      by_render_mode: all.reduce((memo, entry) => {
        memo[entry.render_mode] = (memo[entry.render_mode] || 0) + 1;
        return memo;
      }, {}),
    },
    entries: all,
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${all.length} XSS test payloads to ${path.relative(repoRoot, outputPath)}`);
  console.log(`PortSwigger unique vectors: ${portswiggerRawEntries.length}`);
  console.log(`Local payloads.html fragments: ${localRawEntries.length}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exitCode = 1;
  });
}
