'use strict';

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { getConfig } = require('../shared/config');
const { parseCsvText } = require('../shared/csv');
const { resolveProjectPath, sendFileDownload, streamDirectoryZip } = require('../shared/downloads');
const { findManualReviewMatches } = require('../shared/manualReviewLookup');
const {
  expectedManualCaptureUrl,
  buildManualReviewTarget,
  mergeManualTargetMatch,
} = require('../shared/manualReviewTarget');
const {
  serializeJobItemsCsv,
  serializeJobSummaryCsv,
  serializeJobSiteBreakdownCsv,
  serializeJobCandidateDetailsCsv,
  buildJobReportWorkbook,
} = require('../shared/output');
const { renderDotToSvg } = require('../shared/graphviz');
const { scanUrl, buildHtmlSnapshotDot, deriveManualCaptureState, closeBrowser } = require('../shared/scanner');
const { analyzeManualCapture } = require('../shared/manualCapture');
const {
  normalizeCandidateReviewLabel,
  applyCandidateReviews,
  summarizeCandidateReviews,
  upsertCandidateReview,
} = require('../shared/candidateReviews');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

const manualCaptureUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024,
    fieldSize: 25 * 1024 * 1024,
  },
});

function absoluteAssetUrl(req, url) {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  return `${req.protocol}://${req.get('host')}${url}`;
}

function versionedAssetUrl(req, url, version) {
  const absoluteUrl = absoluteAssetUrl(req, url);
  if (!absoluteUrl) return '';
  const token = String(version || '').trim();
  if (!token) return absoluteUrl;
  return `${absoluteUrl}${absoluteUrl.includes('?') ? '&' : '?'}v=${encodeURIComponent(token)}`;
}

function materializeItem(item, req) {
  const assetVersion = item.manual_captured_at || item.updated_at || item.completed_at || item.created_at || '';
  const candidateReviews = Array.isArray(item.candidate_reviews) ? item.candidate_reviews : [];
  const candidates = applyCandidateReviews(item.candidates || [], candidateReviews).map((candidate) => ({
    ...candidate,
    candidate_screenshot_url: versionedAssetUrl(req, candidate.candidate_screenshot_url || '', assetVersion),
  }));
  return {
    ...item,
    candidates,
    candidate_reviews: candidateReviews,
    candidate_review_summary: summarizeCandidateReviews(candidateReviews),
    screenshot_url: versionedAssetUrl(req, item.screenshot_url || '', assetVersion),
    manual_html_url: versionedAssetUrl(req, item.manual_html_url || '', assetVersion),
    manual_raw_html_url: versionedAssetUrl(req, item.manual_raw_html_url || '', assetVersion),
  };
}

function materializeLookupItem(item, req) {
  if (!item) return null;
  const materialized = materializeItem(item, req);
  if (item.lookup_score === undefined && !item.lookup_source) {
    return materialized;
  }
  return {
    ...materialized,
    lookup_score: item.lookup_score,
    lookup_source: item.lookup_source || 'url_lookup',
  };
}

async function readSnapshotHtmlForItem(item) {
  const candidates = [
    item && item.manual_raw_html_path ? item.manual_raw_html_path : '',
    item && item.manual_html_path ? item.manual_html_path : '',
  ].filter(Boolean);

  for (const filePath of candidates) {
    try {
      const value = await fs.promises.readFile(filePath, 'utf8');
      if (String(value || '').trim()) {
        return value;
      }
    } catch (_) {
      continue;
    }
  }

  throw new Error('Stored HTML snapshot could not be read');
}

async function buildGraphForItem(item, config) {
  if (!item.manual_html_path && !item.manual_raw_html_path) {
    throw new Error('Graph export requires a stored HTML snapshot');
  }

  const html = await readSnapshotHtmlForItem(item);
  return buildHtmlSnapshotDot({
    html,
    normalized_url: item.final_url || item.manual_capture_url || item.normalized_url || 'about:blank',
    final_url: item.final_url || item.normalized_url || '',
    capture_url: item.manual_capture_url || item.final_url || item.normalized_url || '',
    title: item.manual_capture_title || item.title || '',
  }, {
    timeoutMs: config.scanTimeoutMs,
    postLoadDelayMs: 0,
    maxCandidates: config.maxCandidates,
    maxResults: config.maxResults,
    maxDotNodes: 1500,
    rowNumber: item.row_number,
    itemId: item.id,
  });
}

function ensureDirectory(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function createEmptyState() {
  return {
    jobs: [],
    items: [],
    manual_review_target: null,
  };
}

function readState(statePath) {
  try {
    const raw = fs.readFileSync(statePath, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      jobs: Array.isArray(parsed.jobs) ? parsed.jobs : [],
      items: Array.isArray(parsed.items) ? parsed.items : [],
      manual_review_target: parsed.manual_review_target && typeof parsed.manual_review_target === 'object'
        ? parsed.manual_review_target
        : null,
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
  const statePath = options.statePath
    || process.env.LOCAL_STATE_PATH
    || path.resolve(process.cwd(), 'output', 'local-dev-state.json');
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

  function getItem(jobId, itemId) {
    return state.items.find((item) => item.job_id === jobId && item.id === itemId) || null;
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
      navigationRetries: config.navigationRetries,
      loadSettlePasses: config.loadSettlePasses,
      negativeRetrySettlePasses: config.negativeRetrySettlePasses,
      actionSettleMs: config.actionSettleMs,
      maxCandidates: config.maxCandidates,
      maxResults: config.maxResults,
      captureScreenshots: config.captureScreenshots,
      captureHtmlSnapshots: config.captureHtmlSnapshots,
      artifactRoot: config.artifactRoot,
      artifactUrlBasePath: config.artifactUrlBasePath,
      publicBaseUrl: config.publicBaseUrl,
      jobId: task.jobId,
      itemId: task.itemId,
      rowNumber: task.rowNumber,
    });
    const manualState = deriveManualCaptureState(result, 'automated');
    result.analysis_source = 'automated';
    result.manual_capture_required = manualState.required;
    result.manual_capture_reason = manualState.reason;

    if (result.error) {
      item.status = 'failed';
      item.error_message = result.error;
      item.screenshot_path = result.screenshot_path || '';
      item.screenshot_url = result.screenshot_url || '';
      item.manual_capture_mode = result.manual_capture_mode || ((result.manual_html_path || result.manual_raw_html_path) ? 'automated_page_html' : '');
      item.manual_html_path = result.manual_html_path || '';
      item.manual_html_url = result.manual_html_url || '';
      item.manual_raw_html_path = result.manual_raw_html_path || '';
      item.manual_raw_html_url = result.manual_raw_html_url || '';
      item.scan_result = result;
      item.analysis_source = result.analysis_source;
      item.manual_capture_required = result.manual_capture_required;
      item.manual_capture_reason = result.manual_capture_reason;
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
      item.manual_capture_mode = result.manual_capture_mode || ((result.manual_html_path || result.manual_raw_html_path) ? 'automated_page_html' : '');
      item.manual_html_path = result.manual_html_path || '';
      item.manual_html_url = result.manual_html_url || '';
      item.manual_raw_html_path = result.manual_raw_html_path || '';
      item.manual_raw_html_url = result.manual_raw_html_url || '';
      item.best_candidate = best;
      item.candidates = result.candidates || [];
      item.scan_result = result;
      item.analysis_source = result.analysis_source;
      item.manual_capture_required = result.manual_capture_required;
      item.manual_capture_reason = result.manual_capture_reason;
      item.error_message = item.ugc_detected ? '' : (result.access_reason || '');
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
        analysis_source: 'automated',
        manual_capture_required: false,
        manual_capture_reason: '',
        manual_capture_mode: '',
        manual_html_path: '',
        manual_html_url: '',
        manual_raw_html_path: '',
        manual_raw_html_url: '',
        manual_capture_url: '',
        manual_capture_title: '',
        manual_capture_notes: '',
        manual_captured_at: null,
        candidate_reviews: [],
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

  function resumeIncompleteJobs() {
    const incompleteJobs = state.jobs.filter((job) => {
      const terminal = job && ['completed', 'completed_with_errors', 'failed'].includes(job.status);
      return !terminal;
    });

    incompleteJobs.forEach((job) => {
      state.items.forEach((item) => {
        if (item.job_id !== job.id) return;
        if (item.status === 'queued' || item.status === 'running') {
          item.status = 'pending';
          item.updated_at = new Date().toISOString();
        }
      });
      recomputeJob(job.id);
    });

    persist();
    incompleteJobs.forEach((job) => {
      const pendingCount = getItemsForJob(job.id).filter((item) => item.status === 'pending').length;
      if (pendingCount > 0) {
        refillQueue(job.id, Math.min(config.initialQueueFill, pendingCount));
      }
    });
  }

  resumeIncompleteJobs();

  return {
    config,
    statePath,
    listJobs(limit = 25) {
      return state.jobs.slice(0, limit);
    },
    getJob,
    getItem,
    getJobItems(jobId, limit = 100, offset = 0) {
      return getItemsForJob(jobId).slice(offset, offset + limit);
    },
    getManualReviewTarget() {
      return state.manual_review_target || null;
    },
    setManualReviewTarget(target) {
      state.manual_review_target = {
        selection_key: 'latest',
        job_id: String(target && target.job_id || ''),
        item_id: String(target && target.item_id || ''),
        capture_url: String(target && target.capture_url || ''),
        title: String(target && target.title || ''),
        created_at: state.manual_review_target && state.manual_review_target.created_at
          ? state.manual_review_target.created_at
          : new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      persist();
      return state.manual_review_target;
    },
    findManualReviewMatches(rawUrl, limit = 10) {
      const candidates = state.items.filter((item) => item.manual_capture_required || item.analysis_source === 'manual_snapshot');
      return findManualReviewMatches(candidates, rawUrl, limit);
    },
    createJobFromRecords,
    persist,
    async applyManualCapture(jobId, itemId, capture) {
      const item = getItem(jobId, itemId);
      if (!item) {
        throw new Error('Job item not found');
      }

      const { scanResult, artifacts } = await analyzeManualCapture({
        jobId,
        itemId,
        rowNumber: item.row_number,
        html: capture.html,
        rawHtml: capture.rawHtml,
        captureUrl: capture.captureUrl || item.final_url || item.normalized_url,
        title: capture.title || item.title || '',
        notes: capture.notes || '',
        snapshotMode: capture.snapshotMode || 'dom_html',
        screenshotBuffer: capture.screenshotBuffer,
        screenshotFilename: capture.screenshotFilename,
        screenshotContentType: capture.screenshotContentType,
      }, {
        timeoutMs: config.scanTimeoutMs,
        postLoadDelayMs: 0,
        maxCandidates: config.maxCandidates,
        maxResults: config.maxResults,
        captureScreenshots: config.captureScreenshots,
        artifactRoot: config.artifactRoot,
        artifactUrlBasePath: config.artifactUrlBasePath,
        publicBaseUrl: config.publicBaseUrl,
      });

      const best = scanResult.best_candidate || {};
      item.status = scanResult.error ? 'failed' : 'completed';
      item.title = scanResult.title || capture.title || item.title || '';
      item.final_url = scanResult.final_url || capture.captureUrl || item.final_url || item.normalized_url;
      item.ugc_detected = !!scanResult.ugc_detected;
      item.best_score = best.score ?? null;
      item.best_confidence = best.confidence || '';
      item.best_ugc_type = best.ugc_type || '';
      item.best_xpath = best.xpath || '';
      item.best_css_path = best.css_path || '';
      item.best_sample_text = best.sample_text || '';
      item.screenshot_path = scanResult.screenshot_path || artifacts.screenshot_path || '';
      item.screenshot_url = scanResult.screenshot_url || artifacts.screenshot_url || '';
      item.analysis_source = 'manual_snapshot';
      item.manual_capture_required = false;
      item.manual_capture_reason = '';
      item.manual_capture_mode = scanResult.manual_capture_mode || artifacts.manual_capture_mode || 'dom_html';
      item.manual_html_path = artifacts.manual_html_path || '';
      item.manual_html_url = artifacts.manual_html_url || '';
      item.manual_raw_html_path = artifacts.manual_raw_html_path || '';
      item.manual_raw_html_url = artifacts.manual_raw_html_url || '';
      item.manual_capture_url = capture.captureUrl || item.final_url || item.normalized_url;
      item.manual_capture_title = capture.title || item.title || '';
      item.manual_capture_notes = capture.notes || '';
      item.manual_captured_at = new Date().toISOString();
      item.best_candidate = best;
      item.candidates = scanResult.candidates || [];
      item.scan_result = scanResult;
      item.error_message = scanResult.error || (item.ugc_detected ? '' : (scanResult.access_reason || ''));
      item.completed_at = new Date().toISOString();
      item.updated_at = new Date().toISOString();

      recomputeJob(jobId);
      persist();
      return item;
    },
    updateCandidateReview(jobId, itemId, candidateKey, reviewInput) {
      const item = getItem(jobId, itemId);
      if (!item) {
        throw new Error('Job item not found');
      }

      item.candidate_reviews = upsertCandidateReview(item.candidate_reviews || [], {
        ...reviewInput,
        candidate_key: candidateKey,
      });
      item.updated_at = new Date().toISOString();
      persist();
      return item;
    },
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

  app.get('/api/jobs/:jobId/items/:itemId', (req, res) => {
    const item = runtime.getItem(req.params.jobId, req.params.itemId);
    if (!item) {
      res.status(404).json({ error: 'Job item not found' });
      return;
    }
    res.json({
      item: materializeItem(item, req),
    });
  });

  app.post('/api/manual-review/target', (req, res) => {
    const jobId = String(req.body && req.body.jobId || '').trim();
    const itemId = String(req.body && req.body.itemId || '').trim();
    if (!jobId || !itemId) {
      res.status(400).json({ error: 'jobId and itemId are required' });
      return;
    }

    const item = runtime.getItem(jobId, itemId);
    if (!item) {
      res.status(404).json({ error: 'Job item not found' });
      return;
    }

    const target = runtime.setManualReviewTarget({
      job_id: jobId,
      item_id: itemId,
      capture_url: String(req.body && req.body.captureUrl || expectedManualCaptureUrl(item) || ''),
      title: String(req.body && req.body.title || item.manual_capture_title || item.title || ''),
    });

    res.json({
      ok: true,
      target: {
        ...target,
        item: materializeItem(item, req),
      },
    });
  });

  app.get('/api/manual-review/lookup', (req, res) => {
    const rawUrl = String(req.query.url || '');
    if (!rawUrl.trim()) {
      res.status(400).json({ error: 'Query parameter "url" is required' });
      return;
    }

    const matches = runtime.findManualReviewMatches(rawUrl, 10);
    const manualTargetSelection = runtime.getManualReviewTarget();
    const manualTargetItem = manualTargetSelection
      ? runtime.getItem(String(manualTargetSelection.job_id || ''), String(manualTargetSelection.item_id || ''))
      : null;
    const manualTarget = buildManualReviewTarget(manualTargetSelection, manualTargetItem, rawUrl);
    const lookup = mergeManualTargetMatch(matches, manualTarget);
    res.json({
      url: rawUrl,
      matchCount: lookup.matches.length,
      selected: lookup.selected ? materializeLookupItem(lookup.selected, req) : null,
      matches: lookup.matches.map((item) => materializeLookupItem(item, req)),
      manualTarget: manualTarget
        ? {
          ...manualTarget,
          item: materializeLookupItem(manualTarget.item, req),
        }
        : null,
    });
  });

  app.post(
    '/api/jobs/:jobId/items/:itemId/manual-capture',
    manualCaptureUpload.fields([
      { name: 'snapshot', maxCount: 1 },
      { name: 'rawSnapshot', maxCount: 1 },
      { name: 'screenshot', maxCount: 1 },
    ]),
    async (req, res, next) => {
      try {
        const job = runtime.getJob(req.params.jobId);
        if (!job) {
          res.status(404).json({ error: 'Job not found' });
          return;
        }

        const item = runtime.getItem(req.params.jobId, req.params.itemId);
        if (!item) {
          res.status(404).json({ error: 'Job item not found' });
          return;
        }

        const snapshotFile = req.files && req.files.snapshot ? req.files.snapshot[0] : null;
        const rawSnapshotFile = req.files && req.files.rawSnapshot ? req.files.rawSnapshot[0] : null;
        const screenshotFile = req.files && req.files.screenshot ? req.files.screenshot[0] : null;
        const html = snapshotFile
          ? snapshotFile.buffer.toString('utf8')
          : String(req.body.html || '');
        const rawHtml = rawSnapshotFile
          ? rawSnapshotFile.buffer.toString('utf8')
          : String(req.body.rawHtml || '');

        if (!html.trim() && !rawHtml.trim()) {
          res.status(400).json({ error: 'HTML snapshot is required' });
          return;
        }

        const updated = await runtime.applyManualCapture(req.params.jobId, req.params.itemId, {
          html,
          rawHtml,
          captureUrl: String(req.body.captureUrl || item.final_url || item.normalized_url || ''),
          title: String(req.body.title || item.title || ''),
          notes: String(req.body.notes || ''),
          snapshotMode: String(req.body.snapshotMode || 'dom_html'),
          screenshotBuffer: screenshotFile ? screenshotFile.buffer : null,
          screenshotFilename: screenshotFile ? screenshotFile.originalname : '',
          screenshotContentType: screenshotFile ? screenshotFile.mimetype : '',
        });

        res.json({
          ok: true,
          item: materializeItem(updated, req),
        });
      } catch (error) {
        next(error);
      }
    },
  );

  app.post('/api/jobs/:jobId/items/:itemId/candidates/:candidateKey/review', (req, res) => {
    const job = runtime.getJob(req.params.jobId);
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    const item = runtime.getItem(req.params.jobId, req.params.itemId);
    if (!item) {
      res.status(404).json({ error: 'Job item not found' });
      return;
    }

    const candidateKey = String(req.params.candidateKey || '').trim();
    const label = normalizeCandidateReviewLabel(req.body && req.body.label);
    const notes = String(req.body && req.body.notes || '');
    const clear = !!(req.body && req.body.clear);
    const candidates = Array.isArray(item.candidates) ? item.candidates : [];
    const candidate = candidates.find((entry) => String(entry.candidate_key || '') === candidateKey);

    if (!candidate) {
      res.status(404).json({ error: 'Candidate not found on this item' });
      return;
    }

    if (!clear && !label) {
      res.status(400).json({ error: 'Provide a valid candidate label' });
      return;
    }

    const updated = runtime.updateCandidateReview(req.params.jobId, req.params.itemId, candidateKey, {
      label: clear ? '' : label,
      notes,
      xpath: candidate.xpath || '',
      css_path: candidate.css_path || '',
      candidate_rank: candidate.candidate_rank || 0,
      source: 'web_review',
    });

    res.json({
      ok: true,
      item: materializeItem(updated, req),
    });
  });

  app.get('/api/jobs/:jobId/items/:itemId/graph.dot', async (req, res, next) => {
    try {
      const job = runtime.getJob(req.params.jobId);
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      const item = runtime.getItem(req.params.jobId, req.params.itemId);
      if (!item) {
        res.status(404).json({ error: 'Job item not found' });
        return;
      }

      const graph = await buildGraphForItem(item, runtime.config);

      res.setHeader('Content-Type', 'text/vnd.graphviz; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${graph.filename}"`);
      res.send(graph.dot);
    } catch (error) {
      if (error && /stored HTML snapshot|Graph export requires/i.test(error.message || '')) {
        res.status(400).json({ error: error.message });
        return;
      }
      next(error);
    }
  });

  app.get('/api/jobs/:jobId/items/:itemId/graph.svg', async (req, res, next) => {
    try {
      const job = runtime.getJob(req.params.jobId);
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      const item = runtime.getItem(req.params.jobId, req.params.itemId);
      if (!item) {
        res.status(404).json({ error: 'Job item not found' });
        return;
      }

      const graph = await buildGraphForItem(item, runtime.config);
      const svg = await renderDotToSvg(graph.dot);
      const download = String(req.query.download || '') === '1';

      res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
      if (download) {
        res.setHeader('Content-Disposition', `attachment; filename="${graph.filename.replace(/\.dot$/i, '.svg')}"`);
      }
      res.send(svg);
    } catch (error) {
      if (error && /stored HTML snapshot|Graph export requires/i.test(error.message || '')) {
        res.status(400).json({ error: error.message });
        return;
      }
      next(error);
    }
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

  app.get('/api/jobs/:jobId/features.csv', (req, res) => {
    const job = runtime.getJob(req.params.jobId);
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    const items = runtime.getJobItems(req.params.jobId, Math.max(1, job.total_urls), 0).map((item) => materializeItem(item, req));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${job.id}.features.csv"`);
    res.send(`${serializeJobSiteBreakdownCsv(items)}\n`);
  });

  app.get('/api/jobs/:jobId/candidates.csv', (req, res) => {
    const job = runtime.getJob(req.params.jobId);
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    const items = runtime.getJobItems(req.params.jobId, Math.max(1, job.total_urls), 0).map((item) => materializeItem(item, req));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${job.id}.candidates.csv"`);
    res.send(`${serializeJobCandidateDetailsCsv(items)}\n`);
  });

  app.get('/api/jobs/:jobId/summary.csv', (req, res) => {
    const job = runtime.getJob(req.params.jobId);
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    const items = runtime.getJobItems(req.params.jobId, Math.max(1, job.total_urls), 0).map((item) => materializeItem(item, req));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${job.id}.summary.csv"`);
    res.send(`${serializeJobSummaryCsv(job, items)}\n`);
  });

  app.get('/api/jobs/:jobId/report.xlsx', async (req, res, next) => {
    try {
      const job = runtime.getJob(req.params.jobId);
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      const items = runtime.getJobItems(req.params.jobId, Math.max(1, job.total_urls), 0).map((item) => materializeItem(item, req));
      const workbook = await buildJobReportWorkbook(job, items);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${job.id}.report.xlsx"`);
      res.send(workbook);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/downloads/sample-sites-labeled.csv', (_req, res, next) => {
    try {
      sendFileDownload(
        res,
        resolveProjectPath('fixtures', 'sample-sites-labeled.csv'),
        'sample-sites-labeled.csv',
        'text/csv; charset=utf-8',
      );
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/downloads/extension.zip', async (_req, res, next) => {
    try {
      await streamDirectoryZip(
        res,
        resolveProjectPath('extension', 'manual-capture'),
        'manual-capture-extension.zip',
        'manual-capture',
      );
    } catch (error) {
      next(error);
    }
  });

  app.get('/config.js', (_req, res) => {
    res.type('application/javascript');
    res.send('window.__APP_CONFIG__ = {"apiBaseUrl": ""};\n');
  });

  app.use(runtime.config.artifactUrlBasePath, express.static(runtime.config.artifactRoot));
  app.use(express.static(webRoot));
  app.use((error, _req, res, _next) => {
    console.error(error);
    res.status(500).json({
      error: error && error.message ? error.message : 'Internal server error',
    });
  });
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
