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
  listTrainingAlgorithms,
  normalizeTrainingAlgorithm,
  trainModel,
  getModelDetails,
  buildRuntimeModelBundle,
  scoreJobItems,
  scoreSiteGroups,
  scoreLiveUrlProbe,
  exportDataset,
} = require('./service');
const { parseJobIdList } = require('./utils');
const { normalizeInputUrl } = require('../../shared/csv');
const { loadInBatches } = require('../../shared/loadInBatches');

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

  async function loadModelingItems(jobIds, progress) {
    return loadInBatches(async ({ limit, offset }) => dependencies.listItemsForModeling({
      jobIds,
      requireCandidates: true,
      limit,
      offset,
    }), {
      batchSize: modelingBatchSize,
      label: 'candidate rows',
      startMessage: jobIds.length
        ? `Loading candidate rows for ${jobIds.length} job(s)`
        : 'Loading candidate rows',
      doneMessage: 'Candidate rows loaded',
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

  router.get('/overview', async (req, res, next) => {
    try {
      const jobIds = normalizeJobIds(req.query.jobIds || '');
      const progress = requestProgress(req);
      progress && progress({ stage: 'overview', message: 'Loading overview dataset' });
      const items = await loadModelingItems(jobIds, progress);
      const overview = await buildOverview(items, dependencies.artifactRoot, {
        progress,
      });
      res.json(overview);
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
      progress && progress({ stage: 'training', message: 'Loading training dataset' });
      const items = await loadModelingItems(jobIds, progress);
      const trained = await trainModel(items, dependencies.artifactRoot, {
        variantId,
        algorithm,
        split: req.body && req.body.split ? req.body.split : undefined,
        trainingOptions: req.body && req.body.trainingOptions ? req.body.trainingOptions : undefined,
        progress,
      });
      res.status(201).json({
        ok: true,
        model: trained.artifact,
        summary: trained.summary,
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
      const liveProbeTimeoutMs = req.body && req.body.timeoutMs !== undefined ? req.body.timeoutMs : 30000;
      const liveProbePostLoadDelayMs = req.body && req.body.postLoadDelayMs !== undefined ? req.body.postLoadDelayMs : 0;
      const liveProbePreScreenshotDelayMs = req.body && req.body.preScreenshotDelayMs !== undefined ? req.body.preScreenshotDelayMs : 0;
      progress && progress({ stage: 'scanning', message: 'Scanning live URL' });
      const scanResult = await dependencies.scanUrl(normalizedUrl, {
        timeoutMs: liveProbeTimeoutMs,
        postLoadDelayMs: liveProbePostLoadDelayMs,
        preScreenshotDelayMs: liveProbePreScreenshotDelayMs,
        candidateMode,
        captureScreenshots: req.body && req.body.captureScreenshots !== undefined ? !!req.body.captureScreenshots : true,
        captureHtmlSnapshots: req.body && req.body.captureHtmlSnapshots !== undefined ? !!req.body.captureHtmlSnapshots : true,
        artifactRoot: dependencies.artifactRoot,
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
      });

      res.json({
        ok: true,
        url: normalizedUrl,
        candidate_mode: candidateMode || 'default',
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
      const items = await loadModelingItems(jobIds, progress);
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
