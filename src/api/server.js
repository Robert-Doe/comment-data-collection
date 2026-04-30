'use strict';

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs/promises');
const os = require('os');

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
const { buildHtmlSnapshotDot, hydrateCandidateMarkupFromSnapshot, analyzeHtmlSnapshot, scanUrl } = require('../shared/scanner');
const { normalizeJobScanSettings } = require('../shared/jobSettings');
const { createModelingRouter } = require('../modeling/common/routes');
const { listModelArtifacts } = require('../modeling/common/artifacts');
const { loadInBatches } = require('../shared/loadInBatches');
const { createRequestTracker } = require('../shared/requestTracker');
const {
  normalizeCandidateReviewLabel,
  applyCandidateReviews,
  summarizeCandidateReviews,
  upsertCandidateReview: upsertCandidateReviewArray,
} = require('../shared/candidateReviews');
const {
  getPool,
  ensureSchema,
  createJob,
  buildProjectBackup,
  restoreProjectBackup,
  combineJobs,
  replaceJobRecords,
  appendJobRecords,
  restartJob,
  resumeJob,
  resumeFailedItems,
  deleteJob,
  clearAllJobs,
  clearJobArtifactPaths,
  listJobs,
  listRecentJobItems,
  getJob,
  getJobItem,
  getJobItems,
  getJobItemsByStatus,
  getDatabaseSummary,
  getDatabaseQuerySnapshot,
  appendJobEvent,
  listAllEvents,
  listJobEvents,
  listItemsForModeling,
  listManualReviewCandidates,
  searchJobs,
  searchJobItems,
  searchJobEvents,
  setManualReviewTarget,
  getManualReviewTarget,
  markItemCompleted,
  markItemFailed,
  upsertCandidateReview: persistCandidateReview,
  recomputeJob,
} = require('../shared/store');
const {
  decodeProjectBackup,
  encodeProjectBackup,
} = require('../shared/projectBackup');
const {
  getSharedQueue,
  removeQueueItems,
} = require('../shared/queue');
const {
  getCrawlerSession,
  listCrawlerSessions,
  updateCrawlerPage,
  listCrawlerPages,
  getCrawlerPageCounts,
  deleteCrawlerSession,
  getPageAncestry,
  getPageChildren,
  getSessionSeeds,
  bulkUpdateCrawlerPages,
  getSessionRelevantPages,
} = require('../shared/crawlerStore');
const {
  startCrawlSession,
  pauseCrawlSession,
  resumeCrawlSession,
  stopCrawlSession,
  recoverRunningSessions,
  isSessionActive,
  normalizeCrawlerUrl,
  UGC_CATEGORIES,
} = require('../shared/crawlerService');
const { fillQueueForJob } = require('../shared/jobQueue');
const { sendStartedNotification } = require('../shared/notifications');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

const backupUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 200 * 1024 * 1024,
  },
});

const crawlerUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024,
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
  const allowedOrigins = new Set(
    (Array.isArray(config.frontendOrigins) ? config.frontendOrigins : [config.frontendOrigin])
      .map((origin) => String(origin || '').trim().replace(/\/+$/g, ''))
      .filter(Boolean),
  );
  const allowAllOrigins = allowedOrigins.has('*');

  return {
    exposedHeaders: ['Content-Disposition', 'Content-Type'],
    origin(origin, callback) {
      const normalizedOrigin = String(origin || '').trim().replace(/\/+$/g, '');
      if (!normalizedOrigin || allowAllOrigins || allowedOrigins.has(normalizedOrigin)) {
        callback(null, true);
        return;
      }

      if (/^chrome-extension:\/\//i.test(normalizedOrigin) || /^moz-extension:\/\//i.test(normalizedOrigin)) {
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

async function readSnapshotHtmlForItem(item, options = {}) {
  const preferRendered = options.preferRendered !== false;
  const candidates = preferRendered
    ? [
      item && item.manual_html_path ? item.manual_html_path : '',
      item && item.manual_raw_html_path ? item.manual_raw_html_path : '',
    ]
    : [
      item && item.manual_raw_html_path ? item.manual_raw_html_path : '',
      item && item.manual_html_path ? item.manual_html_path : '',
    ];

  for (const filePath of candidates.filter(Boolean)) {
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
    candidateMode: item && item.scan_result
      ? (item.scan_result.candidate_selection_mode || item.scan_result.candidateMode || 'default')
      : 'default',
  });
}

function queueFillCountForJob(job, config) {
  if (!job) return 0;
  const pendingCount = Math.max(0, Number(job.pending_count) || 0);
  const totalUrls = Math.max(0, Number(job.total_urls) || 0);
  return Math.min(config.initialQueueFill, pendingCount || totalUrls);
}

function normalizeJobIdList(values) {
  return Array.isArray(values)
    ? Array.from(new Set(values.map((entry) => String(entry || '').trim()).filter(Boolean)))
    : [];
}

function buildBackupDownloadName(format) {
  return `comment-data-collection-backup${String(format || 'json').trim().toLowerCase() === 'db' ? '.db' : '.json'}`;
}

async function listAllJobItemsForAction(jobId, config, progress) {
  const job = await getJob(jobId, config.databaseUrl);
  if (!job) {
    return {
      job: null,
      items: [],
    };
  }

  const total = Math.max(1, Number(job.total_urls) || 1);
  const items = await loadInBatches(async ({ limit, offset }) => getJobItems(jobId, {
    limit,
    offset,
  }, config.databaseUrl), {
    batchSize: Math.max(100, Number(config.apiResultsPageSize) || 250),
    total,
    label: 'job rows',
    progress,
    startMessage: `Loading ${total} job row(s)`,
    loadedMessage: (count, knownTotal) => `Loaded ${count}${knownTotal ? `/${knownTotal}` : ''} job row(s)`,
    doneMessage: 'Job rows loaded',
  });
  return { job, items };
}

async function purgeJobArtifactFiles(jobId, artifactRoot, databaseUrl) {
  const path = require('path');
  const { execSync } = require('child_process');
  const subDirs = ['screenshots', 'candidate-screenshots', 'html-snapshots', 'manual-captures'];
  let bytesFreed = 0;
  let dirsRemoved = 0;
  for (const dir of subDirs) {
    const dirPath = path.join(artifactRoot, dir, jobId);
    try {
      try {
        const sizeOut = execSync(`du -sb "${dirPath}" 2>/dev/null`, { timeout: 5000 }).toString().trim();
        bytesFreed += Number(sizeOut.split(/\s/)[0]) || 0;
      } catch (_) {}
      await fs.rm(dirPath, { recursive: true, force: true });
      dirsRemoved++;
    } catch (_) {}
  }
  await clearJobArtifactPaths(jobId, databaseUrl);
  return { bytesFreed, dirsRemoved };
}

function createApp(config = getConfig()) {
  const app = express();
  const requestTracker = createRequestTracker({
    historyLimit: 25,
    historyThresholdMs: 500,
  });
  app.set('trust proxy', true);
  app.use(cors(createCorsOptions(config)));
  app.use(requestTracker.middleware);
  app.use(express.json({ limit: '1mb' }));
  app.use(config.artifactUrlBasePath, express.static(config.artifactRoot));
  app.use('/api/modeling', createModelingRouter({
    artifactRoot: config.modelArtifactRoot,
    scanArtifactRoot: config.artifactRoot,
    listModelArtifacts: () => listModelArtifacts(config.modelArtifactRoot),
    listItemsForModeling: (options) => listItemsForModeling(options, config.databaseUrl),
    getJob: (jobId) => getJob(jobId, config.databaseUrl),
    getItemsForJob: async (jobId, job, options = {}) => getJobItems(jobId, {
      limit: Math.max(1, Number(options.limit) || Number(job && job.total_urls) || 100),
      offset: Math.max(0, Number(options.offset) || 0),
    }, config.databaseUrl),
    scanUrl: (normalizedUrl, options = {}) => scanUrl(normalizedUrl, options),
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
      const progress = req.requestProgress;
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
      progress && progress.update({
        stage: 'parsing',
        message: `Parsed ${records.length} URL(s) from the upload`,
        progress: {
          current: records.length,
          total: records.length,
          unit: 'rows',
          indeterminate: false,
        },
      });

      const jobSettings = normalizeJobScanSettings({
        scanDelayMs: req.body.scanDelayMs,
        screenshotDelayMs: req.body.screenshotDelayMs,
        candidateMode: req.body.candidateMode,
      }, {
        scanDelayMs: config.postLoadDelayMs,
        screenshotDelayMs: config.preScreenshotDelayMs,
        candidateMode: 'default',
      });
      progress && progress.update({
        stage: 'creating',
        message: `Creating job for ${records.length} row(s)`,
        progress: {
          current: 0,
          total: 1,
          unit: 'job',
          indeterminate: false,
        },
      });

      const job = await createJob({
        sourceFilename,
        sourceColumn: parsed.urlColumn,
        records,
        batchSize: config.ingestBatchSize,
        scanDelayMs: jobSettings.scanDelayMs,
        screenshotDelayMs: jobSettings.screenshotDelayMs,
        candidateMode: jobSettings.candidateMode,
      }, config.databaseUrl);

      const queue = getSharedQueue(config.redisUrl);
      progress && progress.update({
        stage: 'queueing',
        message: 'Priming worker queue',
        progress: {
          current: 0,
          total: Math.min(config.initialQueueFill, job.totalUrls),
          unit: 'rows',
          indeterminate: false,
        },
      });
      await fillQueueForJob(
        job.id,
        Math.min(config.initialQueueFill, job.totalUrls),
        config.databaseUrl,
        queue,
      );

      const createdEvent = await appendJobEvent({
        jobId: job.id,
        scope: 'job',
        eventType: 'job_created',
        eventKey: 'job_created',
        message: `Job created with ${job.totalUrls} row(s) from ${sourceFilename || 'upload.csv'}.`,
        details: {
          total_urls: job.totalUrls,
          source_filename: sourceFilename || '',
          source_column: parsed.urlColumn || '',
          scan_delay_ms: job.scanDelayMs,
          screenshot_delay_ms: job.screenshotDelayMs,
          candidate_mode: job.candidateMode,
        },
      }, config.databaseUrl);
      if (createdEvent) {
        sendStartedNotification(config, {
          id: job.id,
          total_urls: job.totalUrls,
          scan_delay_ms: job.scanDelayMs,
          screenshot_delay_ms: job.screenshotDelayMs,
          candidate_mode: job.candidateMode,
          source_filename: sourceFilename || '',
          source_column: parsed.urlColumn || '',
        }, {
          sourceFilename,
          sourceColumn: parsed.urlColumn,
        }).catch(async (notificationError) => {
          const message = notificationError && notificationError.message ? notificationError.message : String(notificationError);
          console.error(`job start notification failed for ${job.id}: ${message}`);
          await appendJobEvent({
            jobId: job.id,
            scope: 'notification',
            level: 'warn',
            eventType: 'notification_error',
            message: `Failed to send job-start email: ${message}`,
          }, config.databaseUrl).catch(() => {});
        });
      }

      res.status(202).json({
        jobId: job.id,
        totalUrls: job.totalUrls,
        sourceColumn: parsed.urlColumn,
        scanDelayMs: jobSettings.scanDelayMs,
        screenshotDelayMs: jobSettings.screenshotDelayMs,
        candidateMode: jobSettings.candidateMode,
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/jobs/clear', async (_req, res, next) => {
    try {
      const jobs = await listJobs(10000, config.databaseUrl);
      const itemIds = [];
      for (const job of jobs) {
        const items = await getJobItems(job.id, {
          limit: Math.max(1, Number(job.total_urls) || 1),
          offset: 0,
        }, config.databaseUrl);
        itemIds.push(...items.map((item) => item.id));
      }

      if (itemIds.length) {
        const queue = getSharedQueue(config.redisUrl);
        await removeQueueItems(queue, itemIds);
      }
      const deletedCount = await clearAllJobs(config.databaseUrl);
      res.json({
        ok: true,
        deletedCount,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/backups/export.json', async (_req, res, next) => {
    try {
      const backup = await buildProjectBackup(config.databaseUrl);
      const encoded = encodeProjectBackup(backup, 'json');
      res.setHeader('Content-Type', encoded.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${buildBackupDownloadName('json')}"`);
      res.send(encoded.buffer);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/backups/export.db', async (_req, res, next) => {
    try {
      const backup = await buildProjectBackup(config.databaseUrl);
      const encoded = encodeProjectBackup(backup, 'db');
      res.setHeader('Content-Type', encoded.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${buildBackupDownloadName('db')}"`);
      res.send(encoded.buffer);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/backups/import', backupUpload.single('file'), async (req, res, next) => {
    try {
      const uploadedFile = req.file || null;
      if (!uploadedFile || !uploadedFile.buffer || !uploadedFile.buffer.length) {
        res.status(400).json({ error: 'Upload a JSON or .db backup file' });
        return;
      }

      const backup = decodeProjectBackup(uploadedFile.buffer, uploadedFile.originalname || '');
      const result = await restoreProjectBackup(backup, config.databaseUrl);
      res.json({
        ok: true,
        imported: {
          jobs: result.jobCount,
          items: result.itemCount,
          events: result.eventCount,
          manualReviewTargets: result.manualReviewTargetCount,
        },
        touchedJobIds: result.jobIds,
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/jobs/merge', async (req, res, next) => {
    try {
      const sourceJobIds = normalizeJobIdList(req.body && (req.body.jobIds || req.body.sourceJobIds));
      if (sourceJobIds.length < 2) {
        res.status(400).json({ error: 'Provide at least two job IDs to combine' });
        return;
      }

      const combined = await combineJobs(sourceJobIds, {
        sourceFilename: req.body && req.body.sourceFilename,
        sourceColumn: req.body && req.body.sourceColumn,
        scanDelayMs: req.body && req.body.scanDelayMs,
        screenshotDelayMs: req.body && req.body.screenshotDelayMs,
        candidateMode: req.body && req.body.candidateMode,
        defaultScanDelayMs: config.postLoadDelayMs,
        defaultScreenshotDelayMs: config.preScreenshotDelayMs,
        artifactRoot: config.artifactRoot,
        artifactUrlBasePath: config.artifactUrlBasePath,
        publicBaseUrl: config.publicBaseUrl,
      }, config.databaseUrl);

      await appendJobEvent({
        jobId: combined.jobId,
        scope: 'job',
        eventType: 'job_combined',
        eventKey: `job_combined:${combined.jobId}`,
        message: `Combined ${sourceJobIds.length} jobs into a new aggregate job.`,
        details: {
          source_job_ids: sourceJobIds,
          total_urls: combined.totalUrls,
          counts: combined.counts,
        },
      }, config.databaseUrl).catch(() => {});

      const job = await getJob(combined.jobId, config.databaseUrl);
      res.status(201).json({
        ok: true,
        job,
        jobId: combined.jobId,
        sourceJobIds: combined.sourceJobIds,
        totalUrls: combined.totalUrls,
        counts: combined.counts,
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/jobs/:jobId/resume', async (req, res, next) => {
    try {
      const progress = req.requestProgress;
      progress && progress.update({ stage: 'loading', message: 'Loading job rows for resume' });
      const { job, items } = await listAllJobItemsForAction(req.params.jobId, config, progress);
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      const staleItemIds = items
        .filter((item) => ['pending', 'queued', 'running'].includes(item.status))
        .map((item) => item.id);
      if (staleItemIds.length) {
        const queue = getSharedQueue(config.redisUrl);
        await removeQueueItems(queue, staleItemIds);
      }

      const resumed = await resumeJob(req.params.jobId, {
        batchSize: config.ingestBatchSize,
      }, config.databaseUrl);
      const queue = getSharedQueue(config.redisUrl);
      await fillQueueForJob(
        req.params.jobId,
        queueFillCountForJob(resumed && resumed.job ? resumed.job : job, config),
        config.databaseUrl,
        queue,
      );
      const updatedJob = await getJob(req.params.jobId, config.databaseUrl);
      await appendJobEvent({
        jobId: req.params.jobId,
        scope: 'job',
        eventType: 'job_resumed',
        eventKey: `job_resumed:${Date.now()}`,
        message: resumed && resumed.replacedCount
          ? `Resumed ${resumed.replacedCount} unfinished row(s).`
          : 'Resume requested. No unfinished rows required replacement.',
        details: {
          replaced_count: resumed && resumed.replacedCount ? resumed.replacedCount : 0,
          queued_fill_count: queueFillCountForJob(updatedJob, config),
        },
      }, config.databaseUrl).catch(() => {});

      res.json({
        ok: true,
        job: updatedJob,
        replacedCount: resumed && resumed.replacedCount ? resumed.replacedCount : 0,
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/jobs/:jobId/resume-failed', async (req, res, next) => {
    try {
      const { job } = await listAllJobItemsForAction(req.params.jobId, config);
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      const result = await resumeFailedItems(req.params.jobId, {}, config.databaseUrl);
      const queue = getSharedQueue(config.redisUrl);
      await fillQueueForJob(
        req.params.jobId,
        queueFillCountForJob(result && result.job ? result.job : job, config),
        config.databaseUrl,
        queue,
      );
      const updatedJob = await getJob(req.params.jobId, config.databaseUrl);
      await appendJobEvent({
        jobId: req.params.jobId,
        scope: 'job',
        eventType: 'job_resume_failed',
        eventKey: `job_resume_failed:${Date.now()}`,
        message: result && result.resumedCount
          ? `Re-queued ${result.resumedCount} previously failed URL(s).`
          : 'Resume failed requested. No failed rows found.',
        details: { resumed_count: result && result.resumedCount ? result.resumedCount : 0 },
      }, config.databaseUrl).catch(() => {});

      res.json({
        ok: true,
        job: updatedJob,
        resumedCount: result && result.resumedCount ? result.resumedCount : 0,
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/jobs/:jobId/restart', async (req, res, next) => {
    try {
      const progress = req.requestProgress;
      progress && progress.update({ stage: 'loading', message: 'Loading job rows for restart' });
      const { job, items } = await listAllJobItemsForAction(req.params.jobId, config, progress);
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      if (items.length) {
        const queue = getSharedQueue(config.redisUrl);
        await removeQueueItems(queue, items.map((item) => item.id));
      }

      const restartedJob = await restartJob(req.params.jobId, {
        batchSize: config.ingestBatchSize,
      }, config.databaseUrl);
      const queue = getSharedQueue(config.redisUrl);
      await fillQueueForJob(
        req.params.jobId,
        queueFillCountForJob(restartedJob, config),
        config.databaseUrl,
        queue,
      );
      const updatedJob = await getJob(req.params.jobId, config.databaseUrl);
      await appendJobEvent({
        jobId: req.params.jobId,
        scope: 'job',
        eventType: 'job_restarted',
        message: `Job restarted with ${updatedJob ? updatedJob.total_urls : job.total_urls} row(s).`,
        details: {
          total_urls: updatedJob ? updatedJob.total_urls : job.total_urls,
          scan_delay_ms: updatedJob ? updatedJob.scan_delay_ms : job.scan_delay_ms,
          screenshot_delay_ms: updatedJob ? updatedJob.screenshot_delay_ms : job.screenshot_delay_ms,
          candidate_mode: updatedJob ? updatedJob.candidate_mode : job.candidate_mode,
        },
      }, config.databaseUrl).catch(() => {});

      res.json({
        ok: true,
        job: updatedJob,
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/jobs/:jobId/replace', upload.single('file'), async (req, res, next) => {
    try {
      const progress = req.requestProgress;
      progress && progress.update({ stage: 'loading', message: 'Loading job rows for replacement' });
      const { job, items } = await listAllJobItemsForAction(req.params.jobId, config, progress);
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      const uploadedText = req.file ? req.file.buffer.toString('utf8') : String(req.body.csvText || '');
      const sourceFilename = req.file ? req.file.originalname : (req.body.filename || job.source_filename || 'upload.csv');
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
        candidateMode: req.body.candidateMode,
      }, {
        scanDelayMs: job.scan_delay_ms,
        screenshotDelayMs: job.screenshot_delay_ms,
        candidateMode: job.candidate_mode,
      });

      if (items.length) {
        const queue = getSharedQueue(config.redisUrl);
        await removeQueueItems(queue, items.map((item) => item.id));
      }

      await replaceJobRecords(req.params.jobId, {
        sourceFilename,
        sourceColumn: parsed.urlColumn,
        records,
        batchSize: config.ingestBatchSize,
        scanDelayMs: jobSettings.scanDelayMs,
        screenshotDelayMs: jobSettings.screenshotDelayMs,
        candidateMode: jobSettings.candidateMode,
      }, config.databaseUrl);

      const queue = getSharedQueue(config.redisUrl);
      const updatedJob = await getJob(req.params.jobId, config.databaseUrl);
      await fillQueueForJob(
        req.params.jobId,
        queueFillCountForJob(updatedJob, config),
        config.databaseUrl,
        queue,
      );
      const refreshedJob = await getJob(req.params.jobId, config.databaseUrl);
      await appendJobEvent({
        jobId: req.params.jobId,
        scope: 'job',
        eventType: 'job_replaced',
        message: `Job updated with ${records.length} row(s) from ${sourceFilename || 'upload.csv'}.`,
        details: {
          total_urls: records.length,
          source_filename: sourceFilename || '',
          source_column: parsed.urlColumn || '',
          scan_delay_ms: jobSettings.scanDelayMs,
          screenshot_delay_ms: jobSettings.screenshotDelayMs,
          candidate_mode: jobSettings.candidateMode,
        },
      }, config.databaseUrl).catch(() => {});

      res.json({
        ok: true,
        job: refreshedJob,
        totalUrls: records.length,
        sourceColumn: parsed.urlColumn,
        scanDelayMs: jobSettings.scanDelayMs,
        screenshotDelayMs: jobSettings.screenshotDelayMs,
        candidateMode: jobSettings.candidateMode,
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/jobs/:jobId/append', upload.single('file'), async (req, res, next) => {
    try {
      const job = await getJob(req.params.jobId, config.databaseUrl);
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      const uploadedText = req.file ? req.file.buffer.toString('utf8') : String(req.body.csvText || '');
      if (!uploadedText.trim()) {
        res.status(400).json({ error: 'Upload a CSV file or provide csvText' });
        return;
      }

      const preferredColumn = req.body.urlColumn || '';
      const parsed = parseCsvText(uploadedText, preferredColumn);
      const records = parsed.records.filter((record) => record.__normalized_url);
      if (!records.length) {
        res.status(400).json({ error: 'No URLs found in the uploaded CSV' });
        return;
      }

      const { insertedCount } = await appendJobRecords(req.params.jobId, {
        records,
        batchSize: config.ingestBatchSize,
      }, config.databaseUrl);

      const startImmediately = String(req.body.startImmediately || '').toLowerCase() === 'true';
      let queuedCount = 0;
      if (startImmediately) {
        const updatedJob = await getJob(req.params.jobId, config.databaseUrl);
        const queue = getSharedQueue(config.redisUrl);
        const filled = await fillQueueForJob(
          req.params.jobId,
          Math.max(config.initialQueueFill, updatedJob.pending_count || 0),
          config.databaseUrl,
          queue,
        );
        queuedCount = filled.length;
      }

      await appendJobEvent({
        jobId: req.params.jobId,
        scope: 'job',
        eventType: 'rows_appended',
        message: `Appended ${insertedCount} row(s).${startImmediately ? ` Queued ${queuedCount}.` : ''}`,
        details: { inserted_count: insertedCount, queued_count: queuedCount },
      }, config.databaseUrl).catch(() => {});

      res.json({ ok: true, insertedCount, queuedCount });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/jobs/:jobId/start', async (req, res, next) => {
    try {
      const job = await getJob(req.params.jobId, config.databaseUrl);
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      const pendingCount = Math.max(0, Number(job.pending_count) || 0);
      if (!pendingCount) {
        res.json({ ok: true, queuedCount: 0 });
        return;
      }

      const queue = getSharedQueue(config.redisUrl);
      const filled = await fillQueueForJob(
        req.params.jobId,
        pendingCount,
        config.databaseUrl,
        queue,
      );

      await appendJobEvent({
        jobId: req.params.jobId,
        scope: 'job',
        eventType: 'queue_started',
        message: `Queued ${filled.length} pending row(s).`,
        details: { queued_count: filled.length },
      }, config.databaseUrl).catch(() => {});

      res.json({ ok: true, queuedCount: filled.length });
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/jobs/:jobId', async (req, res, next) => {
    try {
      const progress = req.requestProgress;
      progress && progress.update({ stage: 'loading', message: 'Loading job rows for delete' });
      const { job, items } = await listAllJobItemsForAction(req.params.jobId, config, progress);
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      if (items.length) {
        const queue = getSharedQueue(config.redisUrl);
        await removeQueueItems(queue, items.map((item) => item.id));
      }

      // Clean up artifact files before removing DB record
      await purgeJobArtifactFiles(req.params.jobId, config.artifactRoot, config.databaseUrl).catch(() => {});
      await deleteJob(req.params.jobId, config.databaseUrl);
      res.json({
        ok: true,
        deletedJobId: req.params.jobId,
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

  app.get('/api/jobs/:jobId/events', async (req, res, next) => {
    try {
      const job = await getJob(req.params.jobId, config.databaseUrl);
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      const limit = Math.max(1, Math.min(250, Number(req.query.limit) || 80));
      const itemId = String(req.query.itemId || '').trim();
      const events = await listJobEvents(req.params.jobId, {
        limit,
        itemId: itemId || undefined,
      }, config.databaseUrl);
      res.json({ events });
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

  app.get('/api/jobs/:jobId/items', async (req, res, next) => {
    try {
      const job = await getJob(req.params.jobId, config.databaseUrl);
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }
      const status = String(req.query.status || '').trim();
      const limit = Math.max(1, Number(req.query.limit) || 500);
      const offset = Math.max(0, Number(req.query.offset) || 0);
      const items = status
        ? await getJobItemsByStatus(req.params.jobId, status, { limit, offset }, config.databaseUrl)
        : await getJobItems(req.params.jobId, { limit, offset }, config.databaseUrl);
      res.json({ items: items.map((item) => materializeItem(item, req)) });
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

        const submittedAt = new Date().toISOString();
        const { jobId, itemId } = req.params;
        const captureArgs = {
          jobId,
          itemId,
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
        };
        const captureOpts = {
          timeoutMs: config.scanTimeoutMs,
          postLoadDelayMs: 0,
          maxCandidates: config.maxCandidates,
          maxResults: config.maxResults,
          captureScreenshots: config.captureScreenshots,
          artifactRoot: config.artifactRoot,
          artifactUrlBasePath: config.artifactUrlBasePath,
          publicBaseUrl: config.publicBaseUrl,
          candidateMode: job.candidate_mode || job.candidateMode || 'default',
        };

        // Return immediately so the extension can move on; analysis runs in background.
        res.status(202).json({ ok: true, pending: true, jobId, itemId, submittedAt });

        setImmediate(async () => {
          try {
            const { scanResult } = await analyzeManualCapture(captureArgs, captureOpts);
            if (scanResult.error) {
              await markItemFailed(itemId, scanResult, config.databaseUrl);
            } else {
              await markItemCompleted(itemId, scanResult, config.databaseUrl);
            }
            await recomputeJob(jobId, config.databaseUrl);
            await appendJobEvent({
              jobId,
              itemId,
              rowNumber: item.row_number,
              scope: 'manual_capture',
              level: scanResult.error ? 'warn' : 'info',
              eventType: scanResult.error ? 'manual_capture_failed' : 'manual_capture_processed',
              message: scanResult.error
                ? `Manual snapshot failed for row ${item.row_number}: ${scanResult.error}`
                : `Manual snapshot processed for row ${item.row_number}.`,
              details: {
                analysis_source: scanResult.analysis_source || 'manual_snapshot',
                manual_capture_url: scanResult.manual_capture_url || item.manual_capture_url || item.normalized_url || '',
                ugc_detected: !!scanResult.ugc_detected,
                candidate_count: Array.isArray(scanResult.candidates) ? scanResult.candidates.length : 0,
              },
            }, config.databaseUrl).catch(() => {});
          } catch (bgError) {
            const message = bgError && bgError.message ? bgError.message : String(bgError);
            console.error(`[manual-capture] background analysis failed for item ${itemId}: ${message}`);
            await markItemFailed(itemId, { error: message }, config.databaseUrl).catch(() => {});
            await recomputeJob(jobId, config.databaseUrl).catch(() => {});
          }
        });
      } catch (error) {
        next(error);
      }
    },
  );

  app.post('/api/jobs/:jobId/items/:itemId/candidates/:candidateKey/review', async (req, res, next) => {
    try {
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

      const nextReviews = await persistCandidateReview(req.params.jobId, req.params.itemId, {
        candidate_key: candidateKey,
        label: clear ? '' : label,
        notes,
        xpath: candidate.xpath || '',
        css_path: candidate.css_path || '',
        candidate_rank: candidate.candidate_rank || 0,
        source: 'web_review',
      }, config.databaseUrl, item);

      const includeItem = !(
        req.body
        && (req.body.includeItem === false || String(req.body.includeItem || '').toLowerCase() === 'false')
      );

      if (!includeItem) {
        res.json({
          ok: true,
          candidate_key: candidateKey,
          candidate_review_summary: summarizeCandidateReviews(nextReviews || []),
        });
        return;
      }

      const updatedItem = {
        ...item,
        candidate_reviews: Array.isArray(nextReviews) ? nextReviews : upsertCandidateReviewArray(item.candidate_reviews || [], {
          candidate_key: candidateKey,
          label: clear ? '' : label,
          notes,
          xpath: candidate.xpath || '',
          css_path: candidate.css_path || '',
          candidate_rank: candidate.candidate_rank || 0,
          source: 'web_review',
        }),
        updated_at: new Date().toISOString(),
      };
      res.json({
        ok: true,
        item: materializeItem(updatedItem, req),
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
        (candidate.candidate_outer_html_excerpt && !candidate.candidate_outer_html_truncated)
        || candidate.candidate_markup_error
      );

      if (hasStoredMarkup) {
        res.json({
          markup: {
            candidate_outer_html_excerpt: candidate.candidate_outer_html_excerpt || '',
            candidate_outer_html_length: candidate.candidate_outer_html_length || 0,
            candidate_outer_html_truncated: !!candidate.candidate_outer_html_truncated,
            candidate_text_excerpt: candidate.candidate_text_excerpt || '',
            candidate_markup_error: candidate.candidate_markup_error || '',
            candidate_resolved_tag_name: candidate.candidate_resolved_tag_name || '',
            candidate_markup_source: 'stored_candidate',
          },
        });
        return;
      }

      const html = await readSnapshotHtmlForItem(item, { preferRendered: true });
      const snapshot = {
        html,
        raw_html: html,
        normalized_url: item.final_url || item.manual_capture_url || item.normalized_url || 'about:blank',
        final_url: item.final_url || item.normalized_url || '',
        capture_url: item.manual_capture_url || item.final_url || item.normalized_url || '',
        title: item.manual_capture_title || item.title || '',
      };

      let markup = null;
      let markupSource = 'snapshot_backfill';
      try {
        markup = await hydrateCandidateMarkupFromSnapshot(snapshot, candidate, {
          timeoutMs: config.scanTimeoutMs,
        });
      } catch (directError) {
        const fallbackResult = await analyzeHtmlSnapshot(snapshot, {
          timeoutMs: config.scanTimeoutMs,
          postLoadDelayMs: 0,
          captureScreenshots: false,
          maxCandidates: Math.max(config.maxCandidates, 50),
          maxResults: Math.max(config.maxResults, 50),
          candidateMode: job.candidate_mode || job.candidateMode || 'default',
        });
        const fallbackCandidates = Array.isArray(fallbackResult.candidates) ? fallbackResult.candidates : [];
        const matched = fallbackCandidates.find((entry) => (
          (candidate.candidate_key && entry.candidate_key && entry.candidate_key === candidate.candidate_key)
          || (
            entry.xpath === candidate.xpath
            && entry.css_path === candidate.css_path
          )
          || (
            entry.node_id
            && candidate.node_id
            && entry.node_id === candidate.node_id
            && entry.structural_signature === candidate.structural_signature
          )
        ));

        if (!matched) {
          throw directError;
        }

        markup = {
          candidate_outer_html_excerpt: matched.candidate_outer_html_excerpt || '',
          candidate_outer_html_length: matched.candidate_outer_html_length || 0,
          candidate_outer_html_truncated: !!matched.candidate_outer_html_truncated,
          candidate_text_excerpt: matched.candidate_text_excerpt || '',
          candidate_markup_error: matched.candidate_markup_error || '',
          candidate_resolved_tag_name: matched.candidate_resolved_tag_name || matched.tag_name || '',
        };
        markupSource = 'snapshot_redetect';
      }

      const normalizedMarkup = {
        candidate_outer_html_excerpt: markup && markup.candidate_outer_html_excerpt ? markup.candidate_outer_html_excerpt : '',
        candidate_outer_html_length: markup && markup.candidate_outer_html_length ? markup.candidate_outer_html_length : 0,
        candidate_outer_html_truncated: !!(markup && markup.candidate_outer_html_truncated),
        candidate_text_excerpt: markup && markup.candidate_text_excerpt ? markup.candidate_text_excerpt : '',
        candidate_markup_error: markup && markup.candidate_markup_error ? markup.candidate_markup_error : '',
        candidate_resolved_tag_name: markup && markup.candidate_resolved_tag_name ? markup.candidate_resolved_tag_name : '',
        candidate_markup_source: markupSource,
      };

      res.json({
        markup: normalizedMarkup,
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
      const progress = req.requestProgress;
      progress && progress.update({ stage: 'loading', message: 'Loading job rows for CSV export' });
      const { job, items } = await listAllJobItemsForAction(req.params.jobId, config, progress);
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      progress && progress.update({ stage: 'exporting', message: 'Serializing CSV export' });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${job.id}.csv"`);
      res.send(`${serializeJobItemsCsv(items.map((item) => materializeItem(item, req)))}\n`);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/jobs/:jobId/features.csv', async (req, res, next) => {
    try {
      const progress = req.requestProgress;
      progress && progress.update({ stage: 'loading', message: 'Loading job rows for features export' });
      const { job, items } = await listAllJobItemsForAction(req.params.jobId, config, progress);
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      progress && progress.update({ stage: 'exporting', message: 'Serializing features export' });
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
      const progress = req.requestProgress;
      progress && progress.update({ stage: 'loading', message: 'Loading job rows for candidates export' });
      const { job, items } = await listAllJobItemsForAction(req.params.jobId, config, progress);
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      progress && progress.update({ stage: 'exporting', message: 'Serializing candidates export' });
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
      const progress = req.requestProgress;
      progress && progress.update({ stage: 'loading', message: 'Loading job rows for summary export' });
      const { job, items } = await listAllJobItemsForAction(req.params.jobId, config, progress);
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      progress && progress.update({ stage: 'exporting', message: 'Serializing summary export' });
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
      const progress = req.requestProgress;
      progress && progress.update({ stage: 'loading', message: 'Loading job rows for report export' });
      const { job, items } = await listAllJobItemsForAction(req.params.jobId, config, progress);
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      progress && progress.update({ stage: 'exporting', message: 'Building workbook' });
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

  // Global events feed across all jobs
  app.get('/api/events', async (req, res, next) => {
    try {
      const limit = Math.min(250, Math.max(1, Number(req.query.limit) || 100));
      const since = req.query.since ? String(req.query.since) : '';
      const events = await listAllEvents({ limit, since: since || undefined }, config.databaseUrl);
      res.json({ events });
    } catch (error) {
      next(error);
    }
  });

  // Detailed system health
  app.get('/api/health/detailed', async (req, res, next) => {
    try {
      const { execSync } = require('child_process');
      const requestSnapshot = requestTracker.getSnapshot();
      const querySnapshot = getDatabaseQuerySnapshot();
      let diskFree = null;
      let diskTotal = null;
      try {
        const df = execSync("df -k / | tail -1 | awk '{print $2,$4}'", { timeout: 5000 }).toString().trim();
        const parts = df.split(' ');
        diskTotal = Number(parts[0]) * 1024;
        diskFree = Number(parts[1]) * 1024;
      } catch (_) {}

      const { getSharedRedis: _getRedis } = require('../shared/queue');
      const queue = getSharedQueue(config.redisUrl);
      let queueCounts = null;
      try {
        queueCounts = await queue.getJobCounts(
          'waiting',
          'active',
          'delayed',
          'failed',
          'completed',
          'paused',
          'waiting-children',
          'prioritized',
        );
      } catch (_) {}

      let redisOk = false;
      try {
        const r = _getRedis(config.redisUrl);
        await r.ping();
        redisOk = true;
      } catch (_) {}

      const jobs = await listJobs(10, config.databaseUrl);
      const recentItems = await listRecentJobItems(20, config.databaseUrl);
      const recentEvents = await listAllEvents({ limit: 25 }, config.databaseUrl);
      const databaseSummary = await getDatabaseSummary(config.databaseUrl);
      const terminalStatuses = new Set(['completed', 'completed_with_errors', 'failed']);
      const activeJobs = jobs.filter((j) => !terminalStatuses.has(String(j.status || '')));
      const processUptimeMs = Math.max(0, Math.round(process.uptime() * 1000));

      res.json({
        ok: true,
        redis: redisOk,
        diskFree,
        diskTotal,
        diskUsedPct: diskTotal ? Math.round((1 - diskFree / diskTotal) * 100) : null,
        system: {
          pid: process.pid,
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
          uptimeMs: processUptimeMs,
          uptimeSeconds: Math.round(processUptimeMs / 1000),
          memoryUsage: process.memoryUsage(),
          loadAverage: os.loadavg(),
        },
        queue: {
          name: 'ugc-scan-url',
          counts: queueCounts,
        },
        database: {
          ...databaseSummary,
          recentItems,
          recentEvents,
          activeQueryCount: querySnapshot.activeQueryCount,
          recentQueryCount: querySnapshot.recentQueryCount,
          activeQueries: querySnapshot.activeQueries,
          recentQueries: querySnapshot.recentQueries,
          queryHotspots: querySnapshot.hotQueries,
        },
        activeJobCount: activeJobs.length,
        activeJobs: activeJobs.map((j) => ({
          id: j.id,
          status: j.status,
          total_urls: j.total_urls,
          completed_count: j.completed_count,
          running_count: j.running_count,
          queued_count: j.queued_count,
          failed_count: j.failed_count,
          pending_count: j.pending_count,
          in_flight_count: (Number(j.running_count) || 0) + (Number(j.queued_count) || 0),
          detected_count: j.detected_count,
        })),
        recentJobs: jobs,
        activeRequestCount: requestSnapshot.activeRequestCount,
        recentRequestCount: requestSnapshot.recentRequestCount,
        activeRequests: requestSnapshot.activeRequests,
        recentRequests: requestSnapshot.recentRequests,
        requestHotspots: requestSnapshot.hotRequests || [],
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/requests', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(requestTracker.getSnapshot());
  });

  app.get('/api/queries', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const limit = Math.min(100, Math.max(1, Number(_req.query.limit) || 50));
    const hotLimit = Math.min(25, Math.max(1, Number(_req.query.hotLimit) || 12));
    res.json(getDatabaseQuerySnapshot({ limit, hotLimit }));
  });

  app.get('/api/admin/search', async (req, res, next) => {
    try {
      const scope = String(req.query.scope || 'all').trim().toLowerCase();
      const query = String(req.query.q != null ? req.query.q : req.query.query || '').trim();
      const jobId = String(req.query.jobId || '').trim();
      const itemId = String(req.query.itemId || '').trim();
      const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 15));

      const result = {
        ok: true,
        scope,
        query,
        jobId: jobId || null,
        itemId: itemId || null,
        limit,
        jobs: [],
        items: [],
        events: [],
      };

      if (scope === 'all' || scope === 'jobs') {
        const jobs = await searchJobs({
          query,
          limit,
        }, config.databaseUrl);
        result.jobs = jobs;
      }

      if (scope === 'all' || scope === 'items') {
        const items = await searchJobItems({
          query,
          limit,
          jobId: jobId || undefined,
        }, config.databaseUrl);
        result.items = items;
      }

      if (scope === 'all' || scope === 'events') {
        const events = await searchJobEvents({
          query,
          limit,
          jobId: jobId || undefined,
          itemId: itemId || undefined,
        }, config.databaseUrl);
        result.events = events;
      }

      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/admin/sql', async (req, res, next) => {
    try {
      const progress = req.requestProgress;
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const sql = String(body.sql != null ? body.sql : body.query || '').trim();
      const params = Array.isArray(body.params)
        ? body.params
        : (Array.isArray(body.values) ? body.values : []);
      const maxRows = Math.max(1, Math.min(500, Number(body.maxRows) || 250));

      if (!sql) {
        res.status(400).json({ error: 'SQL is required' });
        return;
      }

      const startedAt = Date.now();
      progress && progress.update({
        stage: 'sql',
        message: 'Running SQL query',
        progress: {
          current: 0,
          total: 1,
          unit: 'query',
          indeterminate: true,
        },
      });

      const db = getPool(config.databaseUrl);
      const result = await db.query(sql, params);
      const rows = Array.isArray(result.rows) ? result.rows.slice(0, maxRows) : [];

      progress && progress.update({
        stage: 'sql',
        message: 'SQL query complete',
        progress: {
          current: 1,
          total: 1,
          unit: 'query',
          indeterminate: false,
        },
      });

      res.json({
        ok: true,
        sql,
        params,
        command: result.command || null,
        rowCount: Number.isFinite(Number(result.rowCount)) ? Number(result.rowCount) : null,
        rows,
        rowsTruncated: Array.isArray(result.rows) ? result.rows.length > rows.length : false,
        fields: Array.isArray(result.fields) ? result.fields.map((field) => field && field.name).filter(Boolean) : [],
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      next(error);
    }
  });

  // Restart worker via Redis control signal
  app.post('/api/admin/restart-worker', async (req, res, next) => {
    try {
      const { createRedisConnection } = require('../shared/queue');
      const controlPub = createRedisConnection(config.redisUrl);
      await controlPub.publish('ugc:control', 'restart');
      await controlPub.quit().catch(() => {});
      res.json({ ok: true, message: 'Restart signal sent to worker' });
    } catch (error) {
      next(error);
    }
  });

  // Serve monitoring dashboard
  app.get('/monitor', (_req, res) => {
    const path = require('path');
    res.sendFile(path.join(__dirname, 'monitor.html'));
  });

  // Purge artifact files for a single job and clear their DB paths
  app.post('/api/jobs/:jobId/purge-artifacts', async (req, res, next) => {
    try {
      const job = await getJob(req.params.jobId, config.databaseUrl);
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }
      const result = await purgeJobArtifactFiles(req.params.jobId, config.artifactRoot, config.databaseUrl);
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  });

  // Purge artifacts for all completed jobs, keeping the N most recent
  app.post('/api/admin/purge-artifacts', async (req, res, next) => {
    try {
      const progress = req.requestProgress;
      const keepRecentJobs = Math.max(0, Number(req.query.keepRecentJobs != null ? req.query.keepRecentJobs : req.body && req.body.keepRecentJobs) || 1);
      const jobs = await listJobs(100, config.databaseUrl);
      const completedJobs = jobs.filter((j) => j.status === 'completed' || j.status === 'completed_with_errors');
      // Sort newest first (listJobs already returns newest first, but be explicit)
      completedJobs.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
      const toClean = completedJobs.slice(keepRecentJobs);
      const results = [];
      progress && progress.update({
        stage: 'purging',
        message: `Purging artifacts for ${toClean.length} job(s)`,
        progress: {
          current: 0,
          total: toClean.length,
          unit: 'jobs',
          indeterminate: toClean.length === 0,
        },
      });
      for (let index = 0; index < toClean.length; index += 1) {
        const job = toClean[index];
        const r = await purgeJobArtifactFiles(job.id, config.artifactRoot, config.databaseUrl);
        results.push({ jobId: job.id, ...r });
        progress && progress.update({
          stage: 'purging',
          message: `Purged ${index + 1}/${toClean.length} job(s)`,
          progress: {
            current: index + 1,
            total: toClean.length,
            unit: 'jobs',
            indeterminate: false,
          },
        });
      }
      const totalBytesFreed = results.reduce((s, r) => s + (r.bytesFreed || 0), 0);
      res.json({ ok: true, purged: results.length, totalBytesFreed, jobs: results });
    } catch (error) {
      next(error);
    }
  });

  // ── Crawler API ──────────────────────────────────────────────────────────────

  app.get('/api/crawler/categories', (_req, res) => {
    res.json({ categories: UGC_CATEGORIES.map((c) => ({ key: c.key, label: c.label })) });
  });

  app.get('/api/crawler/sessions', async (_req, res, next) => {
    try {
      const sessions = await listCrawlerSessions(config.databaseUrl);
      res.json({ sessions: sessions.map((s) => ({ ...s, active: isSessionActive(s.id) })) });
    } catch (err) { next(err); }
  });

  app.post('/api/crawler/sessions', crawlerUpload.single('file'), async (req, res, next) => {
    try {
      const body = req.body || {};
      const name = String(body.name || '').trim() || `Crawl ${new Date().toISOString().slice(0, 19)}`;
      const maxDepth = Math.max(1, Math.min(5, Number(body.maxDepth) || 3));
      const linksPerPage = Math.max(1, Math.min(50, Number(body.linksPerPage) || 20));
      const crawlDelayMs = Math.max(0, Math.min(30000, Number(body.crawlDelayMs) || 1500));
      const concurrency = Math.max(1, Math.min(20, Number(body.concurrency) || 5));
      const maxPages = Math.max(10, Math.min(50000, Number(body.maxPages) || 5000));

      let seedUrls = [];
      let seedSource = 'manual';
      let seedFilename = null;

      if (req.file) {
        // CSV upload — extract URLs from first column or 'domain'/'url' column
        const text = req.file.buffer.toString('utf8');
        seedFilename = req.file.originalname;
        seedSource = 'csv';
        const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        // Detect header
        const header = lines[0].toLowerCase().split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
        const urlColIdx = header.findIndex((h) => h === 'url' || h === 'domain' || h === 'site');
        const startLine = urlColIdx >= 0 ? 1 : 0;
        const colIdx = urlColIdx >= 0 ? urlColIdx : 0;
        for (const line of lines.slice(startLine)) {
          if (!line) continue;
          const parts = line.split(',');
          let raw = (parts[colIdx] || '').trim().replace(/^"|"$/g, '');
          if (!raw) continue;
          if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw;
          try { new URL(raw); seedUrls.push(raw); } catch (_) {}
          if (seedUrls.length >= 1000) break;
        }
      } else {
        // Manual seed URLs — newline or comma separated
        const raw = String(body.seedUrls || '');
        seedUrls = raw.split(/[\n,]+/).map((u) => u.trim()).filter(Boolean).map((u) => {
          if (!/^https?:\/\//i.test(u)) return 'https://' + u;
          return u;
        }).filter((u) => { try { new URL(u); return true; } catch (_) { return false; } });
      }

      if (!seedUrls.length) {
        res.status(400).json({ error: 'No valid seed URLs provided' });
        return;
      }

      const session = await startCrawlSession({
        name,
        seedUrls,
        seedSource,
        seedFilename,
        maxDepth,
        linksPerPage,
        crawlDelayMs,
        concurrency,
        maxPages,
      }, config.databaseUrl);

      res.status(201).json({ session: { ...session, active: true } });
    } catch (err) { next(err); }
  });

  app.get('/api/crawler/sessions/:sessionId', async (req, res, next) => {
    try {
      const session = await getCrawlerSession(req.params.sessionId, config.databaseUrl);
      if (!session) { res.status(404).json({ error: 'Session not found' }); return; }
      const counts = await getCrawlerPageCounts(req.params.sessionId, config.databaseUrl);
      res.json({ session: { ...session, active: isSessionActive(session.id) }, counts });
    } catch (err) { next(err); }
  });

  app.post('/api/crawler/sessions/:sessionId/pause', async (req, res, next) => {
    try {
      const session = await getCrawlerSession(req.params.sessionId, config.databaseUrl);
      if (!session) { res.status(404).json({ error: 'Session not found' }); return; }
      await pauseCrawlSession(session.id, config.databaseUrl);
      res.json({ ok: true, status: 'paused' });
    } catch (err) { next(err); }
  });

  app.post('/api/crawler/sessions/:sessionId/resume', async (req, res, next) => {
    try {
      const session = await getCrawlerSession(req.params.sessionId, config.databaseUrl);
      if (!session) { res.status(404).json({ error: 'Session not found' }); return; }
      await resumeCrawlSession(session.id, config.databaseUrl);
      res.json({ ok: true, status: 'running' });
    } catch (err) { next(err); }
  });

  app.post('/api/crawler/sessions/:sessionId/stop', async (req, res, next) => {
    try {
      const session = await getCrawlerSession(req.params.sessionId, config.databaseUrl);
      if (!session) { res.status(404).json({ error: 'Session not found' }); return; }
      await stopCrawlSession(session.id, config.databaseUrl);
      res.json({ ok: true, status: 'stopped' });
    } catch (err) { next(err); }
  });

  app.delete('/api/crawler/sessions/:sessionId', async (req, res, next) => {
    try {
      const session = await getCrawlerSession(req.params.sessionId, config.databaseUrl);
      if (!session) { res.status(404).json({ error: 'Session not found' }); return; }
      if (isSessionActive(session.id)) {
        await stopCrawlSession(session.id, config.databaseUrl);
      }
      await deleteCrawlerSession(session.id, config.databaseUrl);
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  app.get('/api/crawler/sessions/:sessionId/pages', async (req, res, next) => {
    try {
      const session = await getCrawlerSession(req.params.sessionId, config.databaseUrl);
      if (!session) { res.status(404).json({ error: 'Session not found' }); return; }
      const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));
      const offset = Math.max(0, Number(req.query.offset) || 0);
      const { rows, total } = await listCrawlerPages(session.id, {
        limit,
        offset,
        status: req.query.status || undefined,
        isRelevant: req.query.isRelevant,
        minScore: req.query.minScore,
        userState: req.query.userState,
      }, config.databaseUrl);
      res.json({ pages: rows, total, limit, offset });
    } catch (err) { next(err); }
  });

  app.patch('/api/crawler/sessions/:sessionId/pages/:pageId', async (req, res, next) => {
    try {
      const updates = {};
      if (req.body.userState !== undefined) updates.user_state = req.body.userState || null;
      if (req.body.isRelevant !== undefined) updates.is_relevant = Boolean(req.body.isRelevant);
      await updateCrawlerPage(req.params.pageId, updates, config.databaseUrl);
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  // Ancestry chain for a single page (seed → … → this page)
  app.get('/api/crawler/sessions/:sessionId/pages/:pageId/ancestry', async (req, res, next) => {
    try {
      const chain = await getPageAncestry(req.params.pageId, config.databaseUrl);
      res.json({ ancestry: chain });
    } catch (err) { next(err); }
  });

  // Direct children of a page (lazy tree expansion)
  app.get('/api/crawler/sessions/:sessionId/pages/:pageId/children', async (req, res, next) => {
    try {
      const children = await getPageChildren(req.params.pageId, req.params.sessionId, config.databaseUrl);
      res.json({ children });
    } catch (err) { next(err); }
  });

  // Seed pages for the session tree root
  app.get('/api/crawler/sessions/:sessionId/seeds', async (req, res, next) => {
    try {
      const seeds = await getSessionSeeds(req.params.sessionId, config.databaseUrl);
      res.json({ seeds });
    } catch (err) { next(err); }
  });

  // Bulk update page states (user_state, is_relevant, include_in_training)
  app.patch('/api/crawler/sessions/:sessionId/pages/bulk', async (req, res, next) => {
    try {
      const { pageIds, updates } = req.body;
      if (!Array.isArray(pageIds) || !pageIds.length) {
        res.status(400).json({ error: 'pageIds array required' }); return;
      }
      const allowed = {};
      if (updates.user_state !== undefined) allowed.user_state = updates.user_state || null;
      if (updates.is_relevant !== undefined) allowed.is_relevant = Boolean(updates.is_relevant);
      if (updates.include_in_training !== undefined) allowed.include_in_training = Boolean(updates.include_in_training);
      await bulkUpdateCrawlerPages(pageIds.map(Number), allowed, config.databaseUrl);
      res.json({ ok: true, updated: pageIds.length });
    } catch (err) { next(err); }
  });

  // Promote selected (or all relevant) pages to a Scanner job
  app.post('/api/crawler/sessions/:sessionId/promote-to-job', async (req, res, next) => {
    try {
      const session = await getCrawlerSession(req.params.sessionId, config.databaseUrl);
      if (!session) { res.status(404).json({ error: 'Session not found' }); return; }

      const { pageIds, onlyTraining, jobName, scanDelayMs = 6000, screenshotDelayMs = 1500, candidateMode = 'default' } = req.body;
      const pages = await getSessionRelevantPages(req.params.sessionId, {
        pageIds: Array.isArray(pageIds) && pageIds.length ? pageIds.map(Number) : undefined,
        onlyTraining: Boolean(onlyTraining),
      }, config.databaseUrl);

      if (!pages.length) { res.status(400).json({ error: 'No pages matched' }); return; }

      const csvText = 'url\n' + pages.map((p) => p.url).join('\n');
      const name = jobName || `Crawler export — ${session.name}`;
      const parsed = parseCsvText(csvText, 'url');
      const job = await createJob({
        sourceFilename: name,
        sourceColumn: 'url',
        records: parsed.records,
        scanDelayMs: Number(scanDelayMs),
        screenshotDelayMs: Number(screenshotDelayMs),
        candidateMode,
      }, config.databaseUrl);

      res.status(201).json({ ok: true, jobId: job.jobId, totalUrls: job.totalUrls });
    } catch (err) { next(err); }
  });

  // Export relevant pages as CSV for feeding into Scanner
  app.get('/api/crawler/sessions/:sessionId/export.csv', async (req, res, next) => {
    try {
      const session = await getCrawlerSession(req.params.sessionId, config.databaseUrl);
      if (!session) { res.status(404).json({ error: 'Session not found' }); return; }
      const minScore = Number(req.query.minScore) || 0;
      const { rows } = await listCrawlerPages(session.id, {
        limit: 10000, offset: 0, isRelevant: 'true', minScore,
      }, config.databaseUrl);
      const header = 'url,title,depth,relevance_score,matched_categories\n';
      const lines = rows.map((p) =>
        [p.url, p.title || '', p.depth, p.relevance_score, (p.matched_categories || []).join('|')]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(','),
      );
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="crawler-session-${session.id}-relevant.csv"`);
      res.send(header + lines.join('\n'));
    } catch (err) { next(err); }
  });

  // ── End Crawler API ───────────────────────────────────────────────────────────

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
  recoverRunningSessions(config.databaseUrl).catch((e) => {
    console.error('[crawler] recovery error:', e);
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
