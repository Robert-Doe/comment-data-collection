'use strict';

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const options = {
    input: '',
    output: path.resolve(process.cwd(), 'output', 'ugc-results.json'),
    urlColumn: '',
    limit: Infinity,
    concurrency: 2,
    timeoutMs: 45000,
    maxCandidates: 25,
    maxResults: 5,
    browser: 'chromium',
    headless: true,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--input') options.input = argv[++i];
    else if (arg === '--output') options.output = path.resolve(process.cwd(), argv[++i]);
    else if (arg === '--url-column') options.urlColumn = argv[++i];
    else if (arg === '--limit') options.limit = Number(argv[++i]);
    else if (arg === '--concurrency') options.concurrency = Number(argv[++i]);
    else if (arg === '--timeout') options.timeoutMs = Number(argv[++i]);
    else if (arg === '--max-candidates') options.maxCandidates = Number(argv[++i]);
    else if (arg === '--max-results') options.maxResults = Number(argv[++i]);
    else if (arg === '--browser') options.browser = argv[++i];
    else if (arg === '--headful') options.headless = false;
    else if (arg === '--headless') options.headless = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function printUsage() {
  console.log([
    'Usage:',
    '  node src/detect-ugc.js --input sites.csv [--output output/ugc-results.json] [--url-column url]',
    '',
    'Options:',
    '  --limit <n>',
    '  --concurrency <n>',
    '  --timeout <ms>',
    '  --max-candidates <n>',
    '  --max-results <n>',
    '  --browser chromium|firefox|webkit',
    '  --headful',
  ].join('\n'));
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (char === '\r') {
      continue;
    } else {
      cell += char;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function rowsToObjects(rows) {
  if (!rows.length) return [];
  const headers = rows[0].map((header, index) => normalizeHeader(header || `column_${index + 1}`));
  return rows.slice(1)
    .filter((row) => row.some((value) => String(value || '').trim() !== ''))
    .map((row, index) => {
      const record = { __row_number: index + 2 };
      headers.forEach((header, headerIndex) => {
        record[header] = row[headerIndex] !== undefined ? String(row[headerIndex]) : '';
      });
      return record;
    });
}

function normalizeHeader(value) {
  return String(value || '')
    .trim()
    .replace(/^\uFEFF/, '')
    .replace(/\s+/g, '_')
    .toLowerCase();
}

function detectUrlColumn(records, preferredColumn) {
  if (!records.length) return '';
  const headers = Object.keys(records[0]).filter((key) => !key.startsWith('__'));
  if (preferredColumn) {
    const normalized = normalizeHeader(preferredColumn);
    if (headers.includes(normalized)) return normalized;
    throw new Error(`URL column "${preferredColumn}" was not found in CSV headers`);
  }

  const candidates = ['url', 'site', 'website', 'link', 'href', 'domain'];
  for (const candidate of candidates) {
    if (headers.includes(candidate)) return candidate;
  }

  return headers[0] || '';
}

function normalizeInputUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^\/\//.test(raw)) return `https:${raw}`;
  if (/^[\w.-]+\.[a-z]{2,}(?:[\/?#]|$)/i.test(raw)) return `https://${raw}`;
  return raw;
}

function loadRecords(inputPath, preferredColumn) {
  const absolutePath = path.resolve(process.cwd(), inputPath);
  const raw = fs.readFileSync(absolutePath, 'utf8');
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  if (lines.length && !lines[0].includes(',') && lines.every((line) => /^([a-z]+:)?\/\//i.test(line) || /^[\w.-]+\.[a-z]{2,}/i.test(line))) {
    const records = lines.map((line, index) => ({
      __row_number: index + 1,
      url: line,
    }));
    return {
      inputPath: absolutePath,
      urlColumn: 'url',
      records,
    };
  }

  const records = rowsToObjects(parseCsv(raw));
  const urlColumn = detectUrlColumn(records, preferredColumn);
  const normalizedRecords = records.map((record) => ({
    ...record,
    __input_url: record[urlColumn],
    __normalized_url: normalizeInputUrl(record[urlColumn]),
  }));

  return {
    inputPath: absolutePath,
    urlColumn,
    records: normalizedRecords,
  };
}

function ensureDirectoryForFile(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function escapeCsv(value) {
  const text = String(value ?? '');
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function serializeSummaryCsv(results) {
  const headers = [
    'row_number',
    'input_url',
    'normalized_url',
    'final_url',
    'title',
    'ugc_detected',
    'confidence',
    'ugc_type',
    'score',
    'unit_count',
    'xpath',
    'css_path',
    'matched_signals',
    'penalty_signals',
    'sample_text',
    'error',
  ];

  const lines = [headers.join(',')];
  results.forEach((result) => {
    const best = result.best_candidate || {};
    const row = [
      result.row_number,
      result.input_url,
      result.normalized_url,
      result.final_url || '',
      result.title || '',
      result.ugc_detected,
      best.confidence || '',
      best.ugc_type || '',
      best.score ?? '',
      best.unit_count ?? '',
      best.xpath || '',
      best.css_path || '',
      Array.isArray(best.matched_signals) ? best.matched_signals.join('|') : '',
      Array.isArray(best.penalty_signals) ? best.penalty_signals.join('|') : '',
      best.sample_text || '',
      result.error || '',
    ].map(escapeCsv);
    lines.push(row.join(','));
  });
  return lines.join('\n');
}

async function safeWait(page, state, timeoutMs) {
  try {
    await page.waitForLoadState(state, { timeout: timeoutMs });
  } catch (_) {
    return;
  }
}

async function dismissConsentPrompts(page) {
  await page.evaluate(() => {
    const pattern = /\b(accept|agree|allow all|got it|continue)\b/i;
    const candidates = Array.from(document.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"]'));
    let clicked = 0;

    function isVisible(el) {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style && style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    }

    candidates.forEach((candidate) => {
      if (clicked >= 3) return;
      const label = `${candidate.innerText || ''} ${candidate.getAttribute('aria-label') || ''} ${candidate.value || ''}`.trim();
      if (pattern.test(label) && isVisible(candidate)) {
        candidate.click();
        clicked += 1;
      }
    });
  }).catch(() => {});
}

async function expandPotentialUgc(page) {
  await page.evaluate(() => {
    const pattern = /\b(show comments|view comments|load comments|load more|show more|more comments|more replies|more reviews|show replies|view replies|replies|comments)\b/i;
    const candidates = Array.from(document.querySelectorAll('button, [role="button"], summary, details summary'));
    let clicked = 0;

    function isVisible(el) {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style && style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    }

    candidates.forEach((candidate) => {
      if (clicked >= 6) return;
      const label = `${candidate.innerText || ''} ${candidate.getAttribute('aria-label') || ''}`.trim();
      if (pattern.test(label) && isVisible(candidate)) {
        candidate.click();
        clicked += 1;
      }
    });
  }).catch(() => {});
}

async function autoScroll(page) {
  await page.evaluate(async () => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const steps = 5;
    const maxHeight = Math.max(document.body ? document.body.scrollHeight : 0, document.documentElement ? document.documentElement.scrollHeight : 0);
    for (let i = 1; i <= steps; i += 1) {
      window.scrollTo(0, Math.round((maxHeight * i) / steps));
      await sleep(500);
    }
    window.scrollTo(0, 0);
  }).catch(() => {});
}

async function buildContext(browserType, browser, featurePath) {
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
  });

  await context.addInitScript({ path: featurePath });
  await context.route('**/*', (route) => {
    const type = route.request().resourceType();
    if (type === 'image' || type === 'media' || type === 'font') {
      route.abort().catch(() => {});
      return;
    }
    route.continue().catch(() => {});
  });

  return context;
}

async function detectOnRecord(context, record, options) {
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(options.timeoutMs);
  page.setDefaultTimeout(options.timeoutMs);

  const result = {
    row_number: record.__row_number,
    input_url: record.__input_url || '',
    normalized_url: record.__normalized_url || '',
    final_url: '',
    title: '',
    ugc_detected: false,
    best_candidate: null,
    candidates: [],
    error: '',
  };

  try {
    if (!record.__normalized_url) {
      throw new Error('Missing URL value');
    }

    const response = await page.goto(record.__normalized_url, {
      waitUntil: 'domcontentloaded',
      timeout: options.timeoutMs,
    });

    await safeWait(page, 'networkidle', 7000);
    await dismissConsentPrompts(page);
    await expandPotentialUgc(page);
    await autoScroll(page);
    await safeWait(page, 'networkidle', 4000);

    const rawHtml = response ? await response.text().catch(() => '') : '';
    const responseHeaders = response ? response.headers() : {};
    const candidates = await page.evaluate(({ html, headers, detectionOptions }) => {
      if (typeof extractCandidateRegions !== 'function') {
        throw new Error('extractCandidateRegions is not available in the page context');
      }
      return extractCandidateRegions(html || document.documentElement.outerHTML, headers || {}, detectionOptions);
    }, {
      html: rawHtml,
      headers: responseHeaders,
      detectionOptions: {
        maxCandidates: options.maxCandidates,
        maxResults: options.maxResults,
      },
    });

    result.final_url = page.url();
    result.title = await page.title().catch(() => '');
    result.candidates = candidates;
    result.best_candidate = candidates[0] || null;
    result.ugc_detected = !!(result.best_candidate && result.best_candidate.detected);
  } catch (error) {
    result.error = error && error.message ? error.message : String(error);
  } finally {
    await page.close().catch(() => {});
  }

  return result;
}

async function runBatch(records, options, featurePath) {
  const { chromium, firefox, webkit } = require('playwright');
  const browserTypes = { chromium, firefox, webkit };
  const browserType = browserTypes[options.browser];
  if (!browserType) {
    throw new Error(`Unsupported browser: ${options.browser}`);
  }

  const browser = await browserType.launch({ headless: options.headless });
  const queue = records.slice();
  const results = [];

  try {
    const workerCount = Math.max(1, Math.min(options.concurrency, queue.length || 1));
    await Promise.all(Array.from({ length: workerCount }, async (_, workerIndex) => {
      const context = await buildContext(browserType, browser, featurePath);
      try {
        while (queue.length) {
          const record = queue.shift();
          if (!record) break;
          const result = await detectOnRecord(context, record, options);
          results.push(result);
          const status = result.error ? `error: ${result.error}` : `${result.ugc_detected ? 'ugc' : 'no-ugc'} score=${result.best_candidate ? result.best_candidate.score : 'n/a'}`;
          console.log(`[worker ${workerIndex + 1}] ${result.normalized_url} -> ${status}`);
        }
      } finally {
        await context.close().catch(() => {});
      }
    }));
  } finally {
    await browser.close().catch(() => {});
  }

  results.sort((left, right) => left.row_number - right.row_number);
  return results;
}

function writeResults(outputPath, results) {
  ensureDirectoryForFile(outputPath);
  if (outputPath.endsWith('.jsonl')) {
    fs.writeFileSync(outputPath, `${results.map((result) => JSON.stringify(result)).join('\n')}\n`, 'utf8');
  } else {
    fs.writeFileSync(outputPath, `${JSON.stringify(results, null, 2)}\n`, 'utf8');
  }

  const summaryPath = outputPath.replace(/\.(json|jsonl)$/i, '.summary.csv');
  fs.writeFileSync(summaryPath, `${serializeSummaryCsv(results)}\n`, 'utf8');
  return summaryPath;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || !options.input) {
    printUsage();
    if (!options.input) process.exitCode = 1;
    return;
  }

  const { records, urlColumn, inputPath } = loadRecords(options.input, options.urlColumn);
  const filtered = records
    .filter((record) => record.__normalized_url)
    .slice(0, Number.isFinite(options.limit) ? options.limit : records.length);

  if (!filtered.length) {
    throw new Error('No URLs found in the input file');
  }

  const featurePath = path.resolve(__dirname, 'commentFeatures.js');
  console.log(`Input: ${inputPath}`);
  console.log(`URL column: ${urlColumn}`);
  console.log(`Rows queued: ${filtered.length}`);

  const results = await runBatch(filtered, options, featurePath);
  const summaryPath = writeResults(options.output, results);
  console.log(`Wrote ${results.length} results to ${options.output}`);
  console.log(`Wrote summary CSV to ${summaryPath}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exitCode = 1;
  });
}

module.exports = {
  parseArgs,
  parseCsv,
  rowsToObjects,
  detectUrlColumn,
  normalizeInputUrl,
  loadRecords,
  serializeSummaryCsv,
};
