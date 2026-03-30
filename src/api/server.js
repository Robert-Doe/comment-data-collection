'use strict';

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs/promises');

const { getConfig } = require('../shared/config');
const { parseCsvText } = require('../shared/csv');
const { renderDotToSvg } = require('../shared/graphviz');
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
const { analyzeManualCapture } = require('../shared/manualCapture');
const { buildHtmlSnapshotDot, hydrateCandidateMarkupFromSnapshot } = require('../shared/scanner');
const { normalizeJobScanSettings } = require('../shared/jobSettings');
const { createModelingRouter } = require('../modeling/common/routes');
const { listModelArtifacts } = require('../modeling/common/artifacts');
const {
  normalizeCandidateReviewLabel,
  applyCandidateReviews,
  summarizeCandidateReviews,
} = require('../shared/candidateReviews');
const {
  ensureSchema,
  createJob,
  listJobs,
  getJob,
  getJobItem,
  getJobItems,
  listItemsForModeling,
  listManualReviewCandidates,
  setManualReviewTarget,
  getManualReviewTarget,
  markItemCompleted,
  markItemFailed,
  upsertCandidateReview,
  recomputeJob,
} = require('../shared/store');
const {
  getSharedQueue,
} = require('../shared/queue');
const { fillQueueForJob } = require('../shared/jobQueue');

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

function createCorsOptions(config) {
  return {
    exposedHeaders: ['Content-Disposition', 'Content-Type'],
    origin(origin, callback) {
      if (!origin || config.frontendOrigin === '*' || origin === config.frontendOrigin) {
        callback(null, true);
        return;
      }

      if (/^chrome-extension:\/\//i.test(origin) || /^moz-extension:\/\//i.test(origin)) {
        callback(null, true);
        return;
      }

      callback(null, false);
    },
  };
}

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
    manual_uploaded_screenshot_url: versionedAssetUrl(req, item.manual_uploaded_screenshot_url || '', assetVersion),
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
      const value = await fs.readFile(filePath, 'utf8');
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

function createApp(config = getConfig()) {
  const app = express();
  app.set('trust proxy', true);
  app.use(cors(createCorsOptions(config)));
  app.use(express.json({ limit: '1mb' }));
  app.use(config.artifactUrlBasePath, express.static(config.artifactRoot));
  app.use('/api/modeling', createModelingRouter({
    artifactRoot: config.modelArtifactRoot,
    listModelArtifacts: () => listModelArtifacts(config.modelArtifactRoot),
    listItemsForModeling: (options) => listItemsForModeling(options, config.databaseUrl),
    getJob: (jobId) => getJob(jobId, config.databaseUrl),
    getItemsForJob: async (jobId, job) => getJobItems(jobId, {
      limit: Math.max(1, Number(job && job.total_urls) || 100),
      offset: 0,
    }, config.databaseUrl),
  }));

  app.get('/api/health', async (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/jobs', async (req, res, next) => {
    try {
      const limit = Number(req.query.limit) || 25;
      const jobs = await listJobs(limit, config.databaseUrl);
      res.json({ jobs });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/jobs', upload.single('file'), async (req, res, next) => {
    try {
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

      const jobSettings = normalizeJobScanSettings({
        scanDelayMs: req.body.scanDelayMs,
        screenshotDelayMs: req.body.screenshotDelayMs,
      }, {
        scanDelayMs: config.postLoadDelayMs,
        screenshotDelayMs: config.preScreenshotDelayMs,
      });

      const job = await createJob({
        sourceFilename,
        sourceColumn: parsed.urlColumn,
        records,
        batchSize: config.ingestBatchSize,
        scanDelayMs: jobSettings.scanDelayMs,
        screenshotDelayMs: jobSettings.screenshotDelayMs,
      }, config.databaseUrl);

      const queue = getSharedQueue(config.redisUrl);
      await fillQueueForJob(
        job.id,
        Math.min(config.initialQueueFill, job.totalUrls),
        config.databaseUrl,
        queue,
      );

      res.status(202).json({
        jobId: job.id,
        totalUrls: job.totalUrls,
        sourceColumn: parsed.urlColumn,
        scanDelayMs: jobSettings.scanDelayMs,
        screenshotDelayMs: jobSettings.screenshotDelayMs,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/jobs/:jobId', async (req, res, next) => {
    try {
      const limit = Math.max(1, Number(req.query.limit) || config.apiResultsPageSize);
      const offset = Math.max(0, Number(req.query.offset) || 0);
      const job = await getJob(req.params.jobId, config.databaseUrl);
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      const items = await getJobItems(req.params.jobId, { limit, offset }, config.databaseUrl);
      res.json({
        job,
        items: items.map((item) => materializeItem(item, req)),
        pagination: {
          limit,
          offset,
          total: job.total_urls,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/jobs/:jobId/results', async (req, res, next) => {
    try {
      const limit = Math.max(1, Number(req.query.limit) || config.apiResultsPageSize);
      const offset = Math.max(0, Number(req.query.offset) || 0);
      const job = await getJob(req.params.jobId, config.databaseUrl);
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      const items = await getJobItems(req.params.jobId, { limit, offset }, config.databaseUrl);
      res.json({
        job,
        items: items.map((item) => materializeItem(item, req)),
        pagination: {
          limit,
          offset,
          total: job.total_urls,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/jobs/:jobId/items/:itemId', async (req, res, next) => {
    try {
      const item = await getJobItem(req.params.jobId, req.params.itemId, config.databaseUrl);
      if (!item) {
        res.status(404).json({ error: 'Job item not found' });
        return;
      }
      res.json({
        item: materializeItem(item, req),
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/manual-review/target', async (req, res, next) => {
    try {
      const jobId = String(req.body && req.body.jobId || '').trim();
      const itemId = String(req.body && req.body.itemId || '').trim();
      if (!jobId || !itemId) {
        res.status(400).json({ error: 'jobId and itemId are required' });
        return;
      }

      const item = await getJobItem(jobId, itemId, config.databaseUrl);
      if (!item) {
        res.status(404).json({ error: 'Job item not found' });
        return;
      }

      const target = await setManualReviewTarget({
        job_id: jobId,
        item_id: itemId,
        capture_url: String(req.body && req.body.captureUrl || expectedManualCaptureUrl(item) || ''),
        title: String(req.body && req.body.title || item.manual_capture_title || item.title || ''),
      }, config.databaseUrl);

      res.json({
        ok: true,
        target: {
          ...target,
          item: materializeItem(item, req),
        },
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/manual-review/lookup', async (req, res, next) => {
    try {
      const rawUrl = String(req.query.url || '');
      if (!rawUrl.trim()) {
        res.status(400).json({ error: 'Query parameter "url" is required' });
        return;
      }

      const candidates = await listManualReviewCandidates(500, config.databaseUrl);
      const manualTargetSelection = await getManualReviewTarget(config.databaseUrl);
      const manualTargetItem = manualTargetSelection
        ? await getJobItem(String(manualTargetSelection.job_id || ''), String(manualTargetSelection.item_id || ''), config.databaseUrl)
        : null;
      const matches = findManualReviewMatches(candidates, rawUrl, 10);
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
    } catch (error) {
      next(error);
    }
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
        const job = await getJob(req.params.jobId, config.databaseUrl);
        if (!job) {
          res.status(404).json({ error: 'Job not found' });
          return;
        }

        const item = await getJobItem(req.params.jobId, req.params.itemId, config.databaseUrl);
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

        const { scanResult } = await analyzeManualCapture({
          jobId: req.params.jobId,
          itemId: req.params.itemId,
          rowNumber: item.row_number,
          html,
          rawHtml,
          captureUrl: String(req.body.captureUrl || item.final_url || item.normalized_url || ''),
          title: String(req.body.title || item.title || ''),
          notes: String(req.body.notes || ''),
          snapshotMode: String(req.body.snapshotMode || 'dom_html'),
          screenshotBuffer: screenshotFile ? screenshotFile.buffer : null,
          screenshotFilename: screenshotFile ? screenshotFile.originalname : '',
          screenshotContentType: screenshotFile ? screenshotFile.mimetype : '',
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

        if (scanResult.error) {
          await markItemFailed(req.params.itemId, scanResult, config.databaseUrl);
        } else {
          await markItemCompleted(req.params.itemId, scanResult, config.databaseUrl);
        }
        await recomputeJob(req.params.jobId, config.databaseUrl);

        const updated = await getJobItem(req.params.jobId, req.params.itemId, config.databaseUrl);
        res.json({
          ok: true,
          item: materializeItem(updated, req),
        });
      } catch (error) {
        next(error);
      }
    },
  );

  app.post('/api/jobs/:jobId/items/:itemId/candidates/:candidateKey/review', async (req, res, next) => {
    try {
      const job = await getJob(req.params.jobId, config.databaseUrl);
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      const item = await getJobItem(req.params.jobId, req.params.itemId, config.databaseUrl);
      if (!item) {
        res.status(404).json({ error: 'Job item not found' });
        return;
      }

      const label = normalizeCandidateReviewLabel(req.body && req.body.label);
      const notes = String(req.body && req.body.notes || '');
      const clear = !!(req.body && req.body.clear);
      const candidateKey = String(req.params.candidateKey || '').trim();
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

      await upsertCandidateReview(req.params.jobId, req.params.itemId, {
        candidate_key: candidateKey,
        label: clear ? '' : label,
        notes,
        xpath: candidate.xpath || '',
        css_path: candidate.css_path || '',
        candidate_rank: candidate.candidate_rank || 0,
        source: 'web_review',
      }, config.databaseUrl);

      const updated = await getJobItem(req.params.jobId, req.params.itemId, config.databaseUrl);
      res.json({
        ok: true,
        item: materializeItem(updated, req),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/jobs/:jobId/items/:itemId/candidates/:candidateKey/markup', async (req, res, next) => {
    try {
      const job = await getJob(req.params.jobId, config.databaseUrl);
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      const item = await getJobItem(req.params.jobId, req.params.itemId, config.databaseUrl);
      if (!item) {
        res.status(404).json({ error: 'Job item not found' });
        return;
      }

      const candidateKey = String(req.params.candidateKey || '').trim();
      const candidates = Array.isArray(item.candidates) ? item.candidates : [];
      const candidate = candidates.find((entry) => String(entry.candidate_key || '') === candidateKey);
      if (!candidate) {
        res.status(404).json({ error: 'Candidate not found on this item' });
        return;
      }

      const hasStoredMarkup = !!(
        candidate.candidate_outer_html_excerpt
        || candidate.candidate_inner_html_excerpt
        || candidate.candidate_markup_error
      );

      if (hasStoredMarkup) {
        res.json({
          markup: {
            candidate_outer_html_excerpt: candidate.candidate_outer_html_excerpt || '',
            candidate_outer_html_length: candidate.candidate_outer_html_length || 0,
            candidate_outer_html_truncated: !!candidate.candidate_outer_html_truncated,
            candidate_inner_html_excerpt: candidate.candidate_inner_html_excerpt || '',
            candidate_inner_html_length: candidate.candidate_inner_html_length || 0,
            candidate_inner_html_truncated: !!candidate.candidate_inner_html_truncated,
            candidate_text_excerpt: candidate.candidate_text_excerpt || '',
            candidate_markup_error: candidate.candidate_markup_error || '',
            candidate_resolved_tag_name: candidate.candidate_resolved_tag_name || '',
            candidate_markup_source: 'stored_candidate',
          },
        });
        return;
      }

      const html = await readSnapshotHtmlForItem(item);
      const markup = await hydrateCandidateMarkupFromSnapshot({
        html,
        raw_html: html,
        normalized_url: item.final_url || item.manual_capture_url || item.normalized_url || 'about:blank',
        final_url: item.final_url || item.normalized_url || '',
        capture_url: item.manual_capture_url || item.final_url || item.normalized_url || '',
        title: item.manual_capture_title || item.title || '',
      }, candidate, {
        timeoutMs: config.scanTimeoutMs,
      });

      res.json({
        markup: {
          ...markup,
          candidate_markup_source: 'snapshot_backfill',
        },
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/jobs/:jobId/items/:itemId/graph.dot', async (req, res, next) => {
    try {
      const job = await getJob(req.params.jobId, config.databaseUrl);
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      const item = await getJobItem(req.params.jobId, req.params.itemId, config.databaseUrl);
      if (!item) {
        res.status(404).json({ error: 'Job item not found' });
        return;
      }

      const graph = await buildGraphForItem(item, config);

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
      const job = await getJob(req.params.jobId, config.databaseUrl);
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      const item = await getJobItem(req.params.jobId, req.params.itemId, config.databaseUrl);
      if (!item) {
        res.status(404).json({ error: 'Job item not found' });
        return;
      }

      const graph = await buildGraphForItem(item, config);
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

  app.get('/api/jobs/:jobId/download.csv', async (req, res, next) => {
    try {
      const job = await getJob(req.params.jobId, config.databaseUrl);
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      const items = await getJobItems(req.params.jobId, { limit: Math.max(1, job.total_urls), offset: 0 }, config.databaseUrl);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${job.id}.csv"`);
      res.send(`${serializeJobItemsCsv(items.map((item) => materializeItem(item, req)))}\n`);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/jobs/:jobId/features.csv', async (req, res, next) => {
    try {
      const job = await getJob(req.params.jobId, config.databaseUrl);
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      const items = await getJobItems(req.params.jobId, { limit: Math.max(1, job.total_urls), offset: 0 }, config.databaseUrl);
      const materializedItems = items.map((item) => materializeItem(item, req));
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${job.id}.features.csv"`);
      res.send(`${serializeJobSiteBreakdownCsv(materializedItems)}\n`);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/jobs/:jobId/candidates.csv', async (req, res, next) => {
    try {
      const job = await getJob(req.params.jobId, config.databaseUrl);
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      const items = await getJobItems(req.params.jobId, { limit: Math.max(1, job.total_urls), offset: 0 }, config.databaseUrl);
      const materializedItems = items.map((item) => materializeItem(item, req));
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${job.id}.candidates.csv"`);
      res.send(`${serializeJobCandidateDetailsCsv(materializedItems)}\n`);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/jobs/:jobId/summary.csv', async (req, res, next) => {
    try {
      const job = await getJob(req.params.jobId, config.databaseUrl);
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      const items = await getJobItems(req.params.jobId, { limit: Math.max(1, job.total_urls), offset: 0 }, config.databaseUrl);
      const materializedItems = items.map((item) => materializeItem(item, req));
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${job.id}.summary.csv"`);
      res.send(`${serializeJobSummaryCsv(job, materializedItems)}\n`);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/jobs/:jobId/report.xlsx', async (req, res, next) => {
    try {
      const job = await getJob(req.params.jobId, config.databaseUrl);
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      const items = await getJobItems(req.params.jobId, { limit: Math.max(1, job.total_urls), offset: 0 }, config.databaseUrl);
      const materializedItems = items.map((item) => materializeItem(item, req));
      const workbook = await buildJobReportWorkbook(job, materializedItems);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${job.id}.report.xlsx"`);
      res.send(workbook);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/downloads/sample-sites-labeled.csv', async (_req, res, next) => {
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

  app.use((error, _req, res, _next) => {
    console.error(error);
    res.status(500).json({
      error: error && error.message ? error.message : 'Internal server error',
    });
  });

  return app;
}

async function main() {
  const config = getConfig();
  await ensureSchema(config.databaseUrl);
  const app = createApp(config);
  app.listen(config.port, () => {
    console.log(`ugc-api listening on ${config.port}`);
  });
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exitCode = 1;
  });
}

module.exports = {
  createApp,
};
