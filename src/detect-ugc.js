'use strict';

const fs = require('fs');
const path = require('path');

const { getConfig } = require('./shared/config');
const { loadRecordsFromFile } = require('./shared/csv');
const { serializeJobItemsCsv } = require('./shared/output');
const { scanUrl, closeBrowser } = require('./shared/scanner');

function parseArgs(argv) {
  const options = {
    input: '',
    output: path.resolve(process.cwd(), 'output', 'ugc-results.json'),
    urlColumn: '',
    limit: Infinity,
    concurrency: 2,
    timeoutMs: 45000,
    postLoadDelayMs: 3000,
    maxCandidates: 25,
    maxResults: 5,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--input') options.input = argv[++i];
    else if (arg === '--output') options.output = path.resolve(process.cwd(), argv[++i]);
    else if (arg === '--url-column') options.urlColumn = argv[++i];
    else if (arg === '--limit') options.limit = Number(argv[++i]);
    else if (arg === '--concurrency') options.concurrency = Number(argv[++i]);
    else if (arg === '--timeout') options.timeoutMs = Number(argv[++i]);
    else if (arg === '--post-load-delay') options.postLoadDelayMs = Number(argv[++i]);
    else if (arg === '--max-candidates') options.maxCandidates = Number(argv[++i]);
    else if (arg === '--max-results') options.maxResults = Number(argv[++i]);
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
    '  --post-load-delay <ms>',
    '  --max-candidates <n>',
    '  --max-results <n>',
  ].join('\n'));
}

function ensureDirectoryForFile(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeResults(outputPath, results) {
  ensureDirectoryForFile(outputPath);

  if (outputPath.endsWith('.jsonl')) {
    fs.writeFileSync(outputPath, `${results.map((result) => JSON.stringify(result)).join('\n')}\n`, 'utf8');
  } else {
    fs.writeFileSync(outputPath, `${JSON.stringify(results, null, 2)}\n`, 'utf8');
  }

  const summaryPath = outputPath.replace(/\.(json|jsonl)$/i, '.summary.csv');
  const summaryItems = results.map((result) => {
    const best = result.best_candidate || {};
    return {
      row_number: result.row_number,
      input_url: result.input_url,
      normalized_url: result.normalized_url,
      final_url: result.final_url,
      title: result.title,
      status: result.error ? 'failed' : 'completed',
      ugc_detected: result.ugc_detected,
      best_confidence: best.confidence || '',
      best_ugc_type: best.ugc_type || '',
      best_score: best.score ?? '',
      best_xpath: best.xpath || '',
      best_css_path: best.css_path || '',
      best_sample_text: best.sample_text || '',
      screenshot_url: result.screenshot_url || '',
      screenshot_path: result.screenshot_path || '',
      error_message: result.error || result.access_reason || '',
    };
  });
  fs.writeFileSync(summaryPath, `${serializeJobItemsCsv(summaryItems)}\n`, 'utf8');
  return summaryPath;
}

async function runBatch(records, options) {
  const config = getConfig();
  const queue = records.slice();
  const results = [];
  const workerCount = Math.max(1, Math.min(options.concurrency, queue.length || 1));

  await Promise.all(Array.from({ length: workerCount }, async (_, workerIndex) => {
    while (queue.length) {
      const record = queue.shift();
      if (!record) break;

      const scanResult = await scanUrl(record.__normalized_url, {
        timeoutMs: options.timeoutMs,
        postLoadDelayMs: options.postLoadDelayMs,
        maxCandidates: options.maxCandidates,
        maxResults: options.maxResults,
        captureScreenshots: config.captureScreenshots,
        artifactRoot: config.artifactRoot,
        artifactUrlBasePath: config.artifactUrlBasePath,
        publicBaseUrl: config.publicBaseUrl,
        jobId: 'cli',
        itemId: `row-${record.__row_number}`,
        rowNumber: record.__row_number,
      });

      const result = {
        row_number: record.__row_number,
        input_url: record.__input_url,
        normalized_url: record.__normalized_url,
        final_url: scanResult.final_url,
        title: scanResult.title,
        ugc_detected: scanResult.ugc_detected,
        best_candidate: scanResult.best_candidate,
        candidates: scanResult.candidates,
        error: scanResult.error,
        access_reason: scanResult.access_reason,
        screenshot_url: scanResult.screenshot_url,
        screenshot_path: scanResult.screenshot_path,
      };

      results.push(result);
      const status = result.error ? `error: ${result.error}` : `${result.ugc_detected ? 'ugc' : 'no-ugc'} score=${result.best_candidate ? result.best_candidate.score : 'n/a'}`;
      console.log(`[worker ${workerIndex + 1}] ${result.normalized_url} -> ${status}`);
    }
  }));

  results.sort((left, right) => left.row_number - right.row_number);
  return results;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || !options.input) {
    printUsage();
    if (!options.input) process.exitCode = 1;
    return;
  }

  const { records, urlColumn, inputPath } = loadRecordsFromFile(options.input, options.urlColumn);
  const filtered = records
    .filter((record) => record.__normalized_url)
    .slice(0, Number.isFinite(options.limit) ? options.limit : records.length);

  if (!filtered.length) {
    throw new Error('No URLs found in the input file');
  }

  console.log(`Input: ${inputPath}`);
  console.log(`URL column: ${urlColumn}`);
  console.log(`Rows queued: ${filtered.length}`);

  const results = await runBatch(filtered, options);
  const summaryPath = writeResults(options.output, results);
  console.log(`Wrote ${results.length} results to ${options.output}`);
  console.log(`Wrote summary CSV to ${summaryPath}`);
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(error && error.stack ? error.stack : String(error));
      process.exitCode = 1;
    })
    .finally(async () => {
      await closeBrowser().catch(() => {});
    });
}

module.exports = {
  parseArgs,
  writeResults,
};
