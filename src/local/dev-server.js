'use strict';

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { getConfig } = require('../shared/config');
const { parseCsvText } = require('../shared/csv');
const { serializeJobItemsCsv } = require('../shared/output');
const { scanUrl, closeBrowser } = require('../shared/scanner');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

function absoluteAssetUrl(req, url) {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  return `${req.protocol}://${req.get('host')}${url}`;
}

function materializeItem(item, req) {
  return {
    ...item,
    screenshot_url: absoluteAssetUrl(req, item.screenshot_url || ''),
  };
}

function ensureDirectory(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function createEmptyState() {
  return {
    jobs: [],
    items: [],
  };
}

function readState(statePath) {
  try {
    const raw = fs.readFileSync(statePath, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      jobs: Array.isArray(parsed.jobs) ? parsed.jobs : [],
      items: Array.isArray(parsed.items) ? parsed.items : [],
    };
  } catch (_) {
    return createEmptyState();
  }
}

function writeState(statePath, state) {
  ensureDirectory(statePath);
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function createLocalRuntime(options = {}) {
  const config = {
    ...getConfig(),
    ...options,
  };
  const statePath = options.statePath || path.resolve(process.cwd(), 'output', 'local-dev-state.json');
  const state = readState(statePath);
  const queue = [];
  let activeCount = 0;

  function persist() {
    writeState(statePath, state);
  }

  function getJob(jobId) {
    return state.jobs.find((job) => job.id === jobId) || null;
  }

  function getItemsForJob(jobId) {
    return state.items
      .filter((item) => item.job_id === jobId)
      .sort((left, right) => left.row_number - right.row_number);
  }

  function recomputeJob(jobId) {
    const job = getJob(jobId);
    if (!job) return null;
    const items = getItemsForJob(jobId);
    const countByStatus = (status) => items.filter((item) => item.status === status).length;

    job.pending_count = countByStatus('pending');
    job.queued_count = countByStatus('queued');
    job.running_count = countByStatus('running');
    job.completed_count = countByStatus('completed');
    job.failed_count = countByStatus('failed');
    job.detected_count = items.filter((item) => item.ugc_detected === true).length;
    job.updated_at = new Date().toISOString();

    if ((job.completed_count + job.failed_count) === job.total_urls && job.failed_count === job.total_urls) {
      job.status = 'failed';
      job.finished_at = new Date().toISOString();
    } else if ((job.completed_count + job.failed_count) === job.total_urls && job.failed_count > 0) {
      job.status = 'completed_with_errors';
      job.finished_at = new Date().toISOString();
    } else if ((job.completed_count + job.failed_count) === job.total_urls) {
      job.status = 'completed';
      job.finished_at = new Date().toISOString();
    } else if (job.running_count > 0 || job.completed_count > 0 || job.failed_count > 0) {
      job.status = 'running';
      job.finished_at = null;
    } else if (job.queued_count > 0) {
      job.status = 'queued';
      job.finished_at = null;
    } else if (job.pending_count > 0) {
      job.status = 'pending';
      job.finished_at = null;
    } else {
      job.status = 'queued';
      job.finished_at = null;
    }

    return job;
  }

  function claimPendingItems(jobId, limit) {
    const items = getItemsForJob(jobId)
      .filter((item) => item.status === 'pending')
      .slice(0, limit);

    items.forEach((item) => {
      item.status = 'queued';
      item.updated_at = new Date().toISOString();
    });

    recomputeJob(jobId);
    persist();
    return items;
  }

  function refillQueue(jobId, count) {
    const claimed = claimPendingItems(jobId, count);
    claimed.forEach((item) => {
      queue.push({
        jobId,
        itemId: item.id,
        rowNumber: item.row_number,
        normalizedUrl: item.normalized_url,
      });
    });
    processQueue();
    return claimed;
  }

  async function handleTask(task) {
    const item = state.items.find((entry) => entry.id === task.itemId);
    if (!item) return;

    item.status = 'running';
    item.attempts += 1;
    item.started_at = item.started_at || new Date().toISOString();
    item.updated_at = new Date().toISOString();
    recomputeJob(task.jobId);
    persist();

    const result = await scanUrl(task.normalizedUrl, {
      timeoutMs: config.scanTimeoutMs,
      postLoadDelayMs: config.postLoadDelayMs,
      maxCandidates: config.maxCandidates,
      maxResults: config.maxResults,
      captureScreenshots: config.captureScreenshots,
      artifactRoot: config.artifactRoot,
      artifactUrlBasePath: config.artifactUrlBasePath,
      publicBaseUrl: config.publicBaseUrl,
      jobId: task.jobId,
      itemId: task.itemId,
      rowNumber: task.rowNumber,
    });

    if (result.error) {
      item.status = 'failed';
      item.error_message = result.error;
      item.screenshot_path = result.screenshot_path || '';
      item.screenshot_url = result.screenshot_url || '';
      item.scan_result = result;
      item.completed_at = new Date().toISOString();
    } else {
      const best = result.best_candidate || {};
      item.status = 'completed';
      item.title = result.title || '';
      item.final_url = result.final_url || '';
      item.ugc_detected = !!result.ugc_detected;
      item.best_score = best.score ?? null;
      item.best_confidence = best.confidence || '';
      item.best_ugc_type = best.ugc_type || '';
      item.best_xpath = best.xpath || '';
      item.best_css_path = best.css_path || '';
      item.best_sample_text = best.sample_text || '';
      item.screenshot_path = result.screenshot_path || '';
      item.screenshot_url = result.screenshot_url || '';
      item.best_candidate = best;
      item.candidates = result.candidates || [];
      item.scan_result = result;
      item.error_message = result.access_reason || '';
      item.completed_at = new Date().toISOString();
    }

    item.updated_at = new Date().toISOString();
    recomputeJob(task.jobId);
    persist();
    refillQueue(task.jobId, config.queueRefillCount);
  }

  function processQueue() {
    while (activeCount < config.workerConcurrency && queue.length > 0) {
      const task = queue.shift();
      activeCount += 1;
      handleTask(task)
        .catch((error) => {
          console.error(error);
        })
        .finally(() => {
          activeCount -= 1;
          processQueue();
        });
    }
  }

  function createJobFromRecords({ sourceFilename, sourceColumn, records }) {
    const jobId = crypto.randomUUID();
    const now = new Date().toISOString();
    const job = {
      id: jobId,
      source_filename: sourceFilename || '',
      source_column: sourceColumn || '',
      status: 'pending',
      total_urls: records.length,
      pending_count: records.length,
      queued_count: 0,
      running_count: 0,
      completed_count: 0,
      failed_count: 0,
      detected_count: 0,
      error_message: '',
      created_at: now,
      updated_at: now,
      finished_at: null,
    };

    state.jobs.unshift(job);
    records.forEach((record) => {
      state.items.push({
        id: crypto.randomUUID(),
        job_id: jobId,
        row_number: record.__row_number,
        input_url: record.__input_url,
        normalized_url: record.__normalized_url,
        status: 'pending',
        attempts: 0,
        title: '',
        final_url: '',
        ugc_detected: null,
        best_score: null,
        best_confidence: '',
        best_ugc_type: '',
        best_xpath: '',
        best_css_path: '',
        best_sample_text: '',
        screenshot_path: '',
        screenshot_url: '',
        best_candidate: null,
        candidates: null,
        scan_result: null,
        error_message: '',
        created_at: now,
        updated_at: now,
        started_at: null,
        completed_at: null,
      });
    });

    recomputeJob(jobId);
    persist();
    refillQueue(jobId, Math.min(config.initialQueueFill, records.length));
    return job;
  }

  return {
    config,
    statePath,
    listJobs(limit = 25) {
      return state.jobs.slice(0, limit);
    },
    getJob,
    getJobItems(jobId, limit = 100, offset = 0) {
      return getItemsForJob(jobId).slice(offset, offset + limit);
    },
    createJobFromRecords,
    persist,
  };
}

function createLocalApp(options = {}) {
  const runtime = createLocalRuntime(options);
  const app = express();
  const webRoot = path.resolve(process.cwd(), 'web');

  app.set('trust proxy', true);
  app.use(cors({ origin: true }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, mode: 'local' });
  });

  app.get('/api/jobs', (req, res) => {
    const limit = Number(req.query.limit) || 25;
    res.json({ jobs: runtime.listJobs(limit) });
  });

  app.post('/api/jobs', upload.single('file'), (req, res) => {
    const uploadedText = req.file ? req.file.buffer.toString('utf8') : String(req.body.csvText || '');
    const sourceFilename = req.file ? req.file.originalname : (req.body.filename || 'upload.csv');
    const preferredColumn = req.body.urlColumn || '';

    if (!uploadedText.trim()) {
      res.status(400).json({ error: 'Upload a CSV file or provide csvText' });
      return;
    }

    const parsed = parseCsvText(uploadedText, preferredColumn);
    const records = parsed.records.filter((record) => record.__normalized_url);
    if (!records.length) {
      res.status(400).json({ error: 'No URLs found in the uploaded CSV' });
      return;
    }

    const job = runtime.createJobFromRecords({
      sourceFilename,
      sourceColumn: parsed.urlColumn,
      records,
    });

    res.status(202).json({
      jobId: job.id,
      totalUrls: job.total_urls,
      sourceColumn: parsed.urlColumn,
    });
  });

  app.get('/api/jobs/:jobId', (req, res) => {
    const limit = Math.max(1, Number(req.query.limit) || runtime.config.apiResultsPageSize);
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const job = runtime.getJob(req.params.jobId);
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    res.json({
      job,
      items: runtime.getJobItems(req.params.jobId, limit, offset).map((item) => materializeItem(item, req)),
      pagination: {
        limit,
        offset,
        total: job.total_urls,
      },
    });
  });

  app.get('/api/jobs/:jobId/results', (req, res) => {
    const limit = Math.max(1, Number(req.query.limit) || runtime.config.apiResultsPageSize);
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const job = runtime.getJob(req.params.jobId);
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    res.json({
      job,
      items: runtime.getJobItems(req.params.jobId, limit, offset).map((item) => materializeItem(item, req)),
      pagination: {
        limit,
        offset,
        total: job.total_urls,
      },
    });
  });

  app.get('/api/jobs/:jobId/download.csv', (req, res) => {
    const job = runtime.getJob(req.params.jobId);
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    const items = runtime.getJobItems(req.params.jobId, Math.max(1, job.total_urls), 0);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${job.id}.csv"`);
    res.send(`${serializeJobItemsCsv(items.map((item) => materializeItem(item, req)))}\n`);
  });

  app.get('/config.js', (_req, res) => {
    res.type('application/javascript');
    res.send('window.__APP_CONFIG__ = {"apiBaseUrl": ""};\n');
  });

  app.use(runtime.config.artifactUrlBasePath, express.static(runtime.config.artifactRoot));
  app.use(express.static(webRoot));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(webRoot, 'index.html'));
  });

  return { app, runtime };
}

async function main() {
  const { app } = createLocalApp();
  const port = Number(process.env.PORT || 3000);
  const server = app.listen(port, () => {
    console.log(`ugc-local listening on ${port}`);
  });

  const shutdown = async () => {
    server.close();
    await closeBrowser().catch(() => {});
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exitCode = 1;
  });
}

module.exports = {
  createLocalApp,
  createLocalRuntime,
};
