'use strict';

const express = require('express');

const {
  FEATURE_FAMILIES,
  getFeatureCatalog,
  getFeatureCatalogForVariant,
  groupFeaturesByFamily,
} = require('./featureCatalog');
const { listModelVariants, getModelVariant } = require('../variants');
const {
  buildOverview,
  trainModel,
  getModelDetails,
  buildRuntimeModelBundle,
  scoreJobItems,
  scoreSiteGroups,
  exportDataset,
} = require('./service');
const { parseJobIdList } = require('./utils');

function normalizeJobIds(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || '').trim()).filter(Boolean);
  }
  return parseJobIdList(value);
}

function createModelingRouter(dependencies) {
  const router = express.Router();

  async function loadModelingItems(jobIds) {
    return dependencies.listItemsForModeling({
      jobIds,
      requireCandidates: true,
    });
  }

  router.get('/overview', async (req, res, next) => {
    try {
      const jobIds = normalizeJobIds(req.query.jobIds || '');
      const items = await loadModelingItems(jobIds);
      const overview = await buildOverview(items, dependencies.artifactRoot);
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

      const jobIds = normalizeJobIds(req.body && req.body.jobIds || '');
      const items = await loadModelingItems(jobIds);
      const trained = await trainModel(items, dependencies.artifactRoot, {
        variantId,
        split: req.body && req.body.split ? req.body.split : undefined,
        trainingOptions: req.body && req.body.trainingOptions ? req.body.trainingOptions : undefined,
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

      const items = await dependencies.getItemsForJob(jobId, job);
      const result = await scoreJobItems(items, dependencies.artifactRoot, modelId, {
        includeExplanations: req.body && req.body.includeExplanations !== false,
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

      const items = await loadModelingItems(jobIds);
      const result = await scoreSiteGroups(items, dependencies.artifactRoot, modelId, siteText, {});
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.get('/dataset.csv', async (req, res, next) => {
    try {
      const variantId = String(req.query.variantId || '').trim();
      const jobIds = normalizeJobIds(req.query.jobIds || '');
      const items = await loadModelingItems(jobIds);
      const exported = exportDataset(items, variantId);
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
