'use strict';

const express = require('express');
const crypto = require('crypto');

const {
  FEATURE_FAMILIES,
  getFeatureCatalog,
  getFeatureCatalogForVariant,
  groupFeaturesByFamily,
} = require('./featureCatalog');
const { listModelVariants, getModelVariant } = require('../variants');
const {
  buildOverview,
  extractCandidateDataset,
  listTrainingAlgorithms,
  normalizeTrainingAlgorithm,
  compareImbalanceStrategies,
  trainModel,
  getModelDetails,
  buildRuntimeModelBundle,
  scoreJobItems,
  scoreSiteGroups,
  computeDomainConfusion,
  scoreLiveUrlProbe,
  exportDataset,
  deleteModelArtifact,
} = require('./service');
const { parseJobIdList } = require('./utils');
const { normalizeInputUrl } = require('../../shared/csv');
const { loadInBatches } = require('../../shared/loadInBatches');
const datasetCache = require('./datasetCache');

function normalizeJobIds(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || '').trim()).filter(Boolean);
  }
  return parseJobIdList(value);
}

function createModelingRouter(dependencies) {
  const router = express.Router();
  const modelingBatchSize = Math.max(100, Number(process.env.MODELING_BATCH_SIZE) || 250);

  function requestProgress(req) {
    return req && req.requestProgress && typeof req.requestProgress.update === 'function'
      ? (patch) => req.requestProgress.update(patch || {})
      : null;
  }

  async function loadModelingItems(jobIds, progress, options = {}) {
    const summaryOnly = !!options.summaryOnly;
    const modelingOnly = !!options.modelingOnly;
    return loadInBatches(async ({ limit, offset }) => dependencies.listItemsForModeling({
      jobIds,
      requireCandidates: true,
      summaryOnly,
      modelingOnly,
      limit,
      offset,
    }), {
      batchSize: modelingBatchSize,
      label: summaryOnly ? 'candidate summaries' : 'candidate rows',
      startMessage: jobIds.length
        ? `Loading ${summaryOnly ? 'candidate summaries' : 'candidate rows'} for ${jobIds.length} job(s)`
        : `Loading ${summaryOnly ? 'candidate summaries' : 'candidate rows'}`,
      doneMessage: summaryOnly ? 'Candidate summaries loaded' : 'Candidate rows loaded',
      progress,
    });
  }

  async function loadJobItems(jobId, job, progress) {
    const total = Math.max(0, Number(job && job.total_urls) || 0) || null;
    return loadInBatches(async ({ limit, offset }) => dependencies.getItemsForJob(jobId, job, {
      limit,
      offset,
    }), {
      batchSize: modelingBatchSize,
      total,
      label: 'job rows',
      progress,
      startMessage: total
        ? `Loading ${total} job row(s)`
        : 'Loading job rows',
      loadedMessage: (count, knownTotal) => `Loaded ${count}${knownTotal ? `/${knownTotal}` : ''} job row(s)`,
      doneMessage: 'Job rows loaded',
    });
  }

  // Warm all variants for jobIds in background after overview loads.
  // Deduplicates concurrent requests via the pending map; silently ignores errors.
  function triggerBackgroundWarm(jobIds) {
    const variants = listModelVariants();
    const allCached = variants.every((v) => !!datasetCache.get(jobIds, v.id));
    if (allCached) return;

    setImmediate(() => {
      loadModelingItems(jobIds, null, { modelingOnly: true })
        .then((items) => {
          for (const variant of variants) {
            if (!datasetCache.get(jobIds, variant.id)) {
              try {
                const dataset = extractCandidateDataset(items, { variant: getModelVariant(variant.id) });
                datasetCache.set(jobIds, variant.id, dataset);
              } catch (_) { /* never interrupt */ }
            }
          }
        })
        .catch(() => { /* silently ignore warm errors */ });
    });
  }

  router.get('/overview', async (req, res, next) => {
    try {
      const jobIds = normalizeJobIds(req.query.jobIds || '');
      const progress = requestProgress(req);
      progress && progress({ stage: 'overview', message: 'Loading overview dataset' });
      const items = await loadModelingItems(jobIds, progress, { summaryOnly: true });
      const overview = await buildOverview(items, dependencies.artifactRoot, {
        progress,
      });
      const selectedJobs = jobIds.length
        ? (await Promise.all(jobIds.map(async (jobId) => dependencies.getJob(jobId)))).filter(Boolean)
        : [];
      res.json({
        ...overview,
        selected_job_ids: jobIds,
        selected_jobs: selectedJobs,
      });
      // Warm the modeling dataset in background so train/compare are instant next time
      triggerBackgroundWarm(jobIds);
    } catch (error) {
      next(error);
    }
  });

  router.get('/variants', (_req, res) => {
    res.json({
      variants: listModelVariants().map((variant) => ({
        ...variant,
        feature_count: getFeatureCatalogForVariant(variant).length,
      })),
    });
  });

  router.get('/features', (_req, res) => {
    res.json({
      families: FEATURE_FAMILIES,
      grouped: groupFeaturesByFamily(getFeatureCatalog()),
      total_count: getFeatureCatalog().length,
    });
  });

  router.get('/algorithms', (_req, res) => {
    res.json({
      algorithms: listTrainingAlgorithms(),
    });
  });

  router.get('/models', async (_req, res, next) => {
    try {
      const models = await dependencies.listModelArtifacts();
      res.json({ models });
    } catch (error) {
      next(error);
    }
  });

  router.get('/models/:artifactId', async (req, res, next) => {
    try {
      const artifact = await getModelDetails(dependencies.artifactRoot, req.params.artifactId);
      if (!artifact) {
        res.status(404).json({ error: 'Model artifact not found' });
        return;
      }
      res.json({ model: artifact });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/models/:artifactId', async (req, res, next) => {
    try {
      const deleted = await deleteModelArtifact(dependencies.artifactRoot, req.params.artifactId);
      if (!deleted) {
        res.status(404).json({ error: 'Model artifact not found' });
        return;
      }
      res.json({ deleted: true });
    } catch (error) {
      next(error);
    }
  });

  router.get('/models/:artifactId/runtime.json', async (req, res, next) => {
    try {
      const artifact = await getModelDetails(dependencies.artifactRoot, req.params.artifactId);
      if (!artifact) {
        res.status(404).json({ error: 'Model artifact not found' });
        return;
      }

      const runtimeBundle = buildRuntimeModelBundle(artifact, {
        positiveThreshold: req.query.positiveThreshold,
        manualReviewLow: req.query.manualReviewLow,
        manualReviewHigh: req.query.manualReviewHigh,
      });
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${artifact.id}-runtime.json"`);
      res.send(`${JSON.stringify(runtimeBundle, null, 2)}\n`);
    } catch (error) {
      next(error);
    }
  });

  // Expose cache state for debugging / monitoring
  router.get('/cache-status', (_req, res) => {
    res.json(datasetCache.stats());
  });

  // Manually kick off cache warming (called by frontend if needed)
  router.post('/warm-cache', (req, res) => {
    const jobIds = normalizeJobIds(req.body && req.body.jobIds || '');
    triggerBackgroundWarm(jobIds);
    res.json({ ok: true, jobIds });
  });

  router.post('/train', async (req, res, next) => {
    try {
      const variantId = String(req.body && req.body.variantId || '').trim();
      if (!getModelVariant(variantId)) {
        res.status(400).json({ error: 'Select a valid model variant' });
        return;
      }

      const algorithm = normalizeTrainingAlgorithm(req.body && req.body.algorithm);
      if (!algorithm) {
        res.status(400).json({ error: 'Select a valid training algorithm' });
        return;
      }

      const jobIds = normalizeJobIds(req.body && req.body.jobIds || '');
      const progress = requestProgress(req);

      const cachedDataset = datasetCache.get(jobIds, variantId);
      if (cachedDataset) {
        progress && progress({ stage: 'training', message: 'Dataset ready (cached) \u2014 starting model fit' });
      } else {
        progress && progress({ stage: 'training', message: 'Loading training dataset' });
      }

      // Cache hit: skip DB entirely. trainModel ignores items when dataset is provided.
      const items = cachedDataset ? null : await loadModelingItems(jobIds, progress, { modelingOnly: true });
      const trained = await trainModel(items, dependencies.artifactRoot, {
        variantId,
        algorithm,
        imbalanceStrategy: req.body && req.body.imbalanceStrategy ? req.body.imbalanceStrategy : undefined,
        split: req.body && req.body.split ? req.body.split : undefined,
        trainingOptions: req.body && req.body.trainingOptions ? req.body.trainingOptions : undefined,
        dataset: cachedDataset || undefined,
        progress,
      });
      res.status(201).json({
        ok: true,
        model: trained.artifact,
        summary: trained.summary,
        cache_hit: !!cachedDataset,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/compare-imbalance', async (req, res, next) => {
    try {
      const variantId = String(req.body && req.body.variantId || '').trim();
      if (!getModelVariant(variantId)) {
        res.status(400).json({ error: 'Select a valid model variant' });
        return;
      }

      const algorithm = normalizeTrainingAlgorithm(req.body && req.body.algorithm);
      if (!algorithm) {
        res.status(400).json({ error: 'Select a valid training algorithm' });
        return;
      }

      const jobIds = normalizeJobIds(req.body && req.body.jobIds || '');
      const progress = requestProgress(req);

      const cachedDataset = datasetCache.get(jobIds, variantId);
      if (cachedDataset) {
        progress && progress({ stage: 'training', message: 'Dataset ready (cached) \u2014 comparing strategies' });
      } else {
        progress && progress({ stage: 'training', message: 'Loading comparison dataset' });
      }

      // Cache hit: skip DB entirely. compareImbalanceStrategies ignores items when dataset is provided.
      const items = cachedDataset ? null : await loadModelingItems(jobIds, progress, { modelingOnly: true });
      const comparison = await compareImbalanceStrategies(items, dependencies.artifactRoot, {
        variantId,
        algorithm,
        imbalanceStrategy: req.body && req.body.imbalanceStrategy ? req.body.imbalanceStrategy : undefined,
        split: req.body && req.body.split ? req.body.split : undefined,
        trainingOptions: req.body && req.body.trainingOptions ? req.body.trainingOptions : undefined,
        strategies: req.body && req.body.strategies ? req.body.strategies : undefined,
        dataset: cachedDataset || undefined,
        progress,
      });
      res.json({
        ok: true,
        variantId,
        algorithm,
        jobIds,
        cache_hit: !!cachedDataset,
        ...comparison,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/score-job', async (req, res, next) => {
    try {
      const modelId = String(req.body && req.body.modelId || '').trim();
      const jobId = String(req.body && req.body.jobId || '').trim();
      if (!modelId || !jobId) {
        res.status(400).json({ error: 'modelId and jobId are required' });
        return;
      }

      const job = await dependencies.getJob(jobId);
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      const progress = requestProgress(req);
      progress && progress({ stage: 'scoring', message: 'Loading job rows for scoring' });
      const items = await loadJobItems(jobId, job, progress);
      const result = await scoreJobItems(items, dependencies.artifactRoot, modelId, {
        includeExplanations: req.body && req.body.includeExplanations !== false,
        progress,
      });
      res.json({
        job,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/site-groups', async (req, res, next) => {
    try {
      const modelId = String(req.body && req.body.modelId || '').trim();
      const siteText = String(req.body && req.body.siteText || '');
      const jobIds = normalizeJobIds(req.body && req.body.jobIds || '');
      if (!modelId || !siteText.trim()) {
        res.status(400).json({ error: 'modelId and siteText are required' });
        return;
      }

      const progress = requestProgress(req);
      progress && progress({ stage: 'scoring', message: 'Loading site groups dataset' });
      const items = await loadModelingItems(jobIds, progress);
      const result = await scoreSiteGroups(items, dependencies.artifactRoot, modelId, siteText, {
        progress,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post('/domain-confusion', async (req, res, next) => {
    try {
      const modelId = String(req.body && req.body.modelId || '').trim();
      const siteText = String(req.body && req.body.siteText || '');
      const jobIds = normalizeJobIds(req.body && req.body.jobIds || '');
      const threshold = req.body && req.body.threshold != null ? Number(req.body.threshold) : 0.5;
      if (!modelId) {
        res.status(400).json({ error: 'modelId is required' });
        return;
      }

      const progress = requestProgress(req);
      progress && progress({ stage: 'scoring', message: 'Loading labeled candidates' });
      const items = await loadModelingItems(jobIds, progress);
      const result = await computeDomainConfusion(items, dependencies.artifactRoot, modelId, siteText, threshold, {
        progress,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post('/probe-url', async (req, res, next) => {
    try {
      const modelId = String(req.body && req.body.modelId || '').trim();
      const rawUrl = String(req.body && req.body.url || '');
      const candidateMode = String(req.body && req.body.candidateMode || '').trim();
      if (!modelId || !rawUrl.trim()) {
        res.status(400).json({ error: 'modelId and url are required' });
        return;
      }

      const normalizedUrl = normalizeInputUrl(rawUrl);
      if (!/^https?:\/\//i.test(normalizedUrl)) {
        res.status(400).json({ error: 'Enter a valid http or https URL' });
        return;
      }

      if (typeof dependencies.scanUrl !== 'function') {
        res.status(500).json({ error: 'Live URL scanning is not available in this runtime' });
        return;
      }

      const progress = requestProgress(req);
      const liveJobId = `live-url-probe-${crypto.randomUUID()}`;
      const liveItemId = req.body && req.body.itemId ? String(req.body.itemId) : crypto.randomUUID();
      const body = req.body || {};
      const priorityProbe = body.priorityProbe !== undefined ? !!body.priorityProbe : false;
      const liveProbeCandidateLimit = body.maxCandidates !== undefined && body.maxCandidates !== ''
        ? Math.max(1, Number(body.maxCandidates) || 0)
        : 100;
      const liveProbeResultLimit = body.maxResults !== undefined && body.maxResults !== ''
        ? Math.max(1, Number(body.maxResults) || 0)
        : liveProbeCandidateLimit;
      const liveProbeTimeoutMs = body.timeoutMs !== undefined && body.timeoutMs !== ''
        ? body.timeoutMs
        : 300000;
      const liveProbePostLoadDelayMs = body.postLoadDelayMs !== undefined && body.postLoadDelayMs !== ''
        ? body.postLoadDelayMs
        : 6000;
      const liveProbePreScreenshotDelayMs = body.preScreenshotDelayMs !== undefined && body.preScreenshotDelayMs !== ''
        ? body.preScreenshotDelayMs
        : 1500;
      progress && progress({
        stage: 'scanning',
        message: priorityProbe ? 'Priority live URL scan started' : 'Live URL scan started',
        progress: {
          current: 0,
          total: 5,
          unit: 'scan steps',
          indeterminate: false,
        },
      });
      const scanResult = await dependencies.scanUrl(normalizedUrl, {
        timeoutMs: priorityProbe ? 0 : liveProbeTimeoutMs,
        postLoadDelayMs: liveProbePostLoadDelayMs,
        preScreenshotDelayMs: liveProbePreScreenshotDelayMs,
        candidateMode,
        scanLabel: 'Live URL probe',
        priorityProbe,
        progress,
        maxCandidates: liveProbeCandidateLimit,
        maxResults: liveProbeResultLimit,
        captureScreenshots: req.body && req.body.captureScreenshots !== undefined ? !!req.body.captureScreenshots : true,
        captureHtmlSnapshots: req.body && req.body.captureHtmlSnapshots !== undefined ? !!req.body.captureHtmlSnapshots : true,
        maxCandidateReviewArtifacts: req.body && req.body.maxCandidateReviewArtifacts !== undefined
          ? Math.max(0, Number(req.body.maxCandidateReviewArtifacts) || 0)
          : 15,
        artifactRoot: dependencies.scanArtifactRoot || dependencies.artifactRoot,
        publicBaseUrl: req.body && req.body.publicBaseUrl ? req.body.publicBaseUrl : undefined,
        jobId: liveJobId,
        itemId: liveItemId,
        rowNumber: req.body && req.body.rowNumber ? req.body.rowNumber : 'live-url',
      });

      if (scanResult.error) {
        progress && progress({ stage: 'scanning', message: scanResult.error });
      }

      const result = await scoreLiveUrlProbe(scanResult, dependencies.artifactRoot, modelId, {
        candidateMode,
        jobId: liveJobId,
        itemId: liveItemId,
        rowNumber: 'live-url',
        includeExplanations: req.body && req.body.includeExplanations !== false,
        threshold: req.body && req.body.threshold,
        progress,
        progressInterval: 10,
      });

      res.json({
        ok: true,
        url: normalizedUrl,
        candidate_mode: candidateMode || 'default',
        priority_probe: priorityProbe,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/dataset.csv', async (req, res, next) => {
    try {
      const variantId = String(req.query.variantId || '').trim();
      const jobIds = normalizeJobIds(req.query.jobIds || '');
      const progress = requestProgress(req);
      progress && progress({ stage: 'exporting', message: 'Loading dataset for export' });
      const items = await loadModelingItems(jobIds, progress, { modelingOnly: true });
      const exported = exportDataset(items, variantId, {
        progress,
      });
      const filenameBase = variantId ? `candidate-dataset-${variantId}` : 'candidate-dataset-all-features';
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.csv"`);
      res.send(exported.csv);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = {
  createModelingRouter,
};
