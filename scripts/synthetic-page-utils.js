'use strict';

const fs = require('fs');
const path = require('path');

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function pad3(value) {
  return String(value).padStart(3, '0');
}

function createRng(seed) {
  let state = seed >>> 0;
  return function rng() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rng, values) {
  if (!values.length) {
    throw new Error('pick() requires a non-empty array');
  }
  return values[Math.floor(rng() * values.length)];
}

function intBetween(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

function chance(rng, probability) {
  return rng() < probability;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writePage(outputDir, pageNumber, html) {
  ensureDir(outputDir);
  const filename = path.join(outputDir, `page_${pad3(pageNumber)}.html`);
  fs.writeFileSync(filename, html, 'utf8');
}

function wrapHtml(options) {
  const {
    title,
    lang = 'en',
    dir = 'ltr',
    bodyClass = '',
    bodyAttrs = '',
    headExtras = [],
    bodyContent = '',
  } = options;

  const extras = Array.isArray(headExtras) ? headExtras.filter(Boolean) : [headExtras].filter(Boolean);
  const bodyClassAttr = bodyClass ? ` class="${bodyClass}"` : '';
  const extraBodyAttrs = bodyAttrs ? ` ${bodyAttrs.trim()}` : '';

  return [
    '<!DOCTYPE html>',
    `<html lang="${escapeHtml(lang)}" dir="${escapeHtml(dir)}">`,
    '<head>',
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    `<title>${escapeHtml(title)}</title>`,
    ...extras,
    '</head>',
    `<body${bodyClassAttr}${extraBodyAttrs}>`,
    bodyContent,
    '</body>',
    '</html>',
  ].join('\n');
}

function countHtmlFiles(dir) {
  if (!fs.existsSync(dir)) {
    return 0;
  }

  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.html'))
    .length;
}

function syncIndexCounts(indexPath, pageRoot, maxPrompt = 40) {
  const counts = {};
  for (let id = 1; id <= maxPrompt; id += 1) {
    const promptId = pad2(id);
    const promptDir = path.join(pageRoot, `prompt_${promptId}`);
    counts[promptId] = countHtmlFiles(promptDir);
  }

  const lines = fs.readFileSync(indexPath, 'utf8').split(/\r?\n/);
  const updatedLines = lines.map((line) => {
    const match = line.match(/^\| (\d{2}) \| ([0-9]+ \/ 100) \| `\/synthetic\/prompt_(\d{2})\/` \|$/);
    if (!match) {
      return line;
    }

    const id = match[1];
    const folderId = match[3];
    const count = counts[folderId] ?? 0;
    return `| ${id} | ${count} / 100 | \`/synthetic/prompt_${folderId}/\` |`;
  });

  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const finalText = updatedLines
    .join('\n')
    .replace(/^\*\*Total:\*\* .*$/m, `**Total:** ${total} / 2,000`);

  fs.writeFileSync(indexPath, finalText, 'utf8');
  return counts;
}

function buildForest(rng, options) {
  const {
    totalCount,
    topLevelCount,
    maxDepth,
    ensureDepth = 0,
    makeNode,
  } = options;

  if (typeof makeNode !== 'function') {
    throw new Error('buildForest() requires a makeNode function');
  }

  const roots = [];
  const nodes = [];
  let serial = 0;

  function createNode(depth, pathParts) {
    const node = makeNode({
      depth,
      index: serial + 1,
      serial: serial + 1,
      path: pathParts.slice(),
      rng,
    });
    serial += 1;
    node.depth = depth;
    node.path = pathParts.slice();
    node.children = [];
    nodes.push(node);
    return node;
  }

  const initialRoots = Math.min(topLevelCount, totalCount);
  for (let i = 0; i < initialRoots; i += 1) {
    roots.push(createNode(0, [i + 1]));
  }

  let chainParent = roots[0];
  for (let depth = 1; depth <= ensureDepth && nodes.length < totalCount && depth <= maxDepth; depth += 1) {
    const child = createNode(chainParent.depth + 1, chainParent.path.concat(chainParent.children.length + 1));
    chainParent.children.push(child);
    chainParent = child;
  }

  while (nodes.length < totalCount) {
    const expandable = nodes.filter((node) => node.depth < maxDepth);
    if (!expandable.length) {
      break;
    }
    const parent = pick(rng, expandable);
    const child = createNode(parent.depth + 1, parent.path.concat(parent.children.length + 1));
    parent.children.push(child);
  }

  return roots;
}

function renderTree(nodes, renderNode) {
  return nodes.map((node) => renderNode(node, renderTree(node.children, renderNode))).join('\n');
}

function initials(name) {
  const clean = String(name).replace(/[^A-Za-z0-9]/g, '');
  if (!clean) {
    return 'U';
  }
  return clean.slice(0, 2).toUpperCase();
}

function buildAvatarSvg(name, bg, fg = '#ffffff') {
  const label = escapeHtml(initials(name));
  return `data:image/svg+xml;utf8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="${escapeHtml(name)}">
      <rect width="64" height="64" rx="32" fill="${bg}"></rect>
      <text x="32" y="38" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="700" fill="${fg}">${label}</text>
    </svg>
  `)}`;
}

module.exports = {
  buildAvatarSvg,
  buildForest,
  chance,
  countHtmlFiles,
  createRng,
  ensureDir,
  escapeHtml,
  intBetween,
  pad2,
  pad3,
  pick,
  renderTree,
  syncIndexCounts,
  wrapHtml,
  writePage,
};
