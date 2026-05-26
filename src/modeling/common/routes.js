'use strict';

const path = require('path');
const fs   = require('fs/promises');
const { fork } = require('child_process');
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
  getModelDetails,
  buildRuntimeModelBundle,
  scoreJobItems,
  scoreSiteGroups,
  computeDomainConfusion,
  scoreLiveUrlProbe,
  exportDataset,
  deleteModelArtifact,
  computeCommentArchetype,
  getDomainBuckets,
  getDomainCandidates,
} = require('./service');
const { extractCandidateDataset } = require('./dataset');
const { parseJobIdList } = require('./utils');
const { normalizeInputUrl } = require('../../shared/csv');
const { loadInBatches } = require('../../shared/loadInBatches');
const datasetCache = require('./datasetCache');
const { patchModelArtifact } = require('./artifacts');

// ─── TRAINING WORKER ──────────────────────────────────────────────────────────
// Training and compare jobs run in an isolated child process so the API heap
// is never at risk.  The parent does all DB access + feature extraction (with
// per-batch ref-nulling and explicit GC hints), then sends a compact ~12 MB
// dataset over IPC.  If the child OOMs, only it dies.
const WORKER_HEAP_MB = Math.max(512, Number(process.env.TRAINING_WORKER_HEAP_MB) || 3072);
const WORKER_PATH    = path.join(__dirname, 'trainWorker.js');

// Lightweight summary computed from already-extracted rows (item/candidate refs
// have been nulled, but the scalar fields are still present).
function buildDatasetSummary(rows) {
  const items = new Set();
  const binaryReviewedItems = new Set();
  const hostnames = new Set();
  let labeled = 0; let positive = 0; let negative = 0; let uncertain = 0; let unlabeled = 0;
  rows.forEach((row) => {
    if (row.item_id) items.add(row.item_id);
    if (row.hostname) hostnames.add(row.hostname);
    if (row.binary_label !== null && row.binary_label !== undefined) {
      labeled += 1;
      if (row.binary_label === 1) positive += 1;
      if (row.binary_label === 0) negative += 1;
    } else if (row.human_label === 'uncertain') {
      uncertain += 1;
    } else {
      unlabeled += 1;
    }
    if (row.review_complete_binary) binaryReviewedItems.add(row.item_id);
  });
  return {
    item_count:                      items.size,
    candidate_count:                 rows.length,
    labeled_candidate_count:         labeled,
    positive_candidate_count:        positive,
    negative_candidate_count:        negative,
    uncertain_candidate_count:       uncertain,
    unlabeled_candidate_count:       unlabeled,
    review_complete_binary_item_count: binaryReviewedItems.size,
    hostname_count:                  hostnames.size,
  };
}

// ─── ASYNC JOB STORE ──────────────────────────────────────────────────────────
// Training and comparison can take several minutes. Instead of holding the HTTP
// connection open (which causes proxy 504s), we respond 202 immediately and let
// the client poll a lightweight status endpoint.
//
// Jobs are keyed by UUID and pruned after 2 hours. A process restart clears
// all entries — that's fine, the browser will show "job not found" and the user
// can kick off a new run.
const trainingJobs = new Map();
const compareJobs  = new Map();
const diagJobs     = new Map(); // cross-validate + learning-curve

function recordJob(map, jobId, patch) {
  map.set(jobId, Object.assign(map.get(jobId) || {}, patch));
}

function pruneJobs(map) {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000; // 2 hours
  for (const [id, job] of map) {
    if ((job.startedAt || 0) < cutoff) map.delete(id);
  }
}

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

  // Build a lightweight dataset suitable for IPC transfer to the training worker.
  //
  // Strategy:
  //   1. Return the cache hit immediately (refs already nulled by prior call, or
  //      we null them now before serialisation — harmless since the scalar fields
  //      used by training are still intact).
  //   2. On a cache miss: page through the DB in batches of `modelingBatchSize`,
  //      extract features for each batch, immediately null the heavy item /
  //      candidate object refs, and hint the GC.  Peak heap per batch is ~150 MB
  //      instead of the ~6 GB you'd get loading everything at once.
  async function buildLightDataset(jobIds, variantId) {
    const cached = datasetCache.get(jobIds, variantId);
    if (cached) {
      // Null any lingering heavy refs so IPC serialisation stays cheap
      if (Array.isArray(cached.rows)) {
        cached.rows.forEach((row) => { row.item = null; row.candidate = null; });
      }
      return cached;
    }

    const variant = getModelVariant(variantId);
    // Extract once with an empty array to get the canonical featureCatalog for
    // this variant; re-use the same catalog for every batch so column order is
    // consistent.
    const { featureCatalog } = extractCandidateDataset([], { variant });
    const lightRows = [];
    let offset = 0;

    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      const batch = await dependencies.listItemsForModeling({
        jobIds,
        requireCandidates: true,
        modelingOnly: true,
        limit: modelingBatchSize,
        offset,
      });
      if (!Array.isArray(batch) || !batch.length) break;

      const { rows: batchRows } = extractCandidateDataset(batch, { variant, featureCatalog });
      for (const row of batchRows) {
        row.item      = null; // release heavy DB object so GC can reclaim it
        row.candidate = null;
        lightRows.push(row);
      }

      // Explicit GC hint — only active when --expose-gc is passed (dev / worker)
      if (typeof global.gc === 'function') global.gc();

      offset += batch.length;
      if (batch.length < modelingBatchSize) break; // last page
    }

    const dataset = { featureCatalog, rows: lightRows, summary: buildDatasetSummary(lightRows) };
    datasetCache.set(jobIds, variantId, dataset);
    return dataset;
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

  router.get('/job-label-summary', async (_req, res, next) => {
    try {
      const jobs = await dependencies.getJobLabelSummaries();
      const totals = jobs.reduce((acc, j) => {
        acc.positive += j.positive_candidates;
        acc.negative += j.negative_candidates;
        acc.inferred_positive += j.inferred_positive;
        acc.inferred_negative += j.inferred_negative;
        return acc;
      }, { positive: 0, negative: 0, inferred_positive: 0, inferred_negative: 0 });
      res.json({ jobs, totals });
    } catch (error) {
      next(error);
    }
  });

  router.post('/comment-archetype', async (req, res, next) => {
    try {
      const { modelId, jobIds: rawJobIds } = req.body || {};
      if (!modelId) return res.status(400).json({ error: 'modelId is required' });
      const jobIds = normalizeJobIds(rawJobIds || '');
      const items = await loadModelingItems(jobIds);
      const result = await computeCommentArchetype(dependencies.artifactRoot, String(modelId), items);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

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

  // PATCH /models/:artifactId/threshold
  //
  // Persist a new decision threshold to an already-trained artifact — no
  // retraining required. The threshold_curve stored in every artifact has
  // precision / recall / F1 / confusion counts at every 0.01 step, so we
  // can recalculate the reported test metrics for any threshold instantly.
  //
  // Body options (pick one):
  //   { threshold: 0.32 }        — use an explicit value
  //   { optimize: "f1" }         — auto-pick the max-F1 point  (default)
  //   { optimize: "recall" }     — max recall (finds everything, more FPs)
  //   { optimize: "precision" }  — max precision (very conservative)
  //   { optimize: "youden" }     — max (recall + specificity - 1)
  router.patch('/models/:artifactId/threshold', async (req, res, next) => {
    try {
      const existing = await getModelDetails(dependencies.artifactRoot, req.params.artifactId);
      if (!existing) {
        res.status(404).json({ error: 'Model artifact not found' });
        return;
      }

      const curve = Array.isArray(existing.threshold_curve) ? existing.threshold_curve : [];
      if (!curve.length) {
        res.status(400).json({ error: 'No threshold curve found — retrain the model to generate one' });
        return;
      }

      const body     = req.body || {};
      const optimize = String(body.optimize || 'f1').toLowerCase();

      // Determine target threshold
      let threshold;
      if (typeof body.threshold === 'number' && Number.isFinite(body.threshold)) {
        threshold = Math.max(0, Math.min(1, body.threshold));
      } else if (optimize === 'recall') {
        threshold = curve.reduce((b, p) => p.recall    > b.recall    ? p : b, curve[0]).t;
      } else if (optimize === 'precision') {
        threshold = curve.reduce((b, p) => p.precision > b.precision ? p : b, curve[0]).t;
      } else if (optimize === 'youden') {
        // Youden's J = sensitivity + specificity − 1
        // specificity = TN / (TN + FP) = 1 − FPR
        threshold = curve.reduce((best, p) => {
          const total    = (p.tp + p.fp + p.fn + p.tn) || 1;
          const negTotal = (p.fp + p.tn) || 1;
          const youden   = p.recall + (p.tn / negTotal) - 1;
          const bestY    = best.recall + (best.tn / ((best.fp + best.tn) || 1)) - 1;
          return youden > bestY ? p : best;
        }, curve[0]).t;
      } else {
        // Default: max F1
        threshold = curve.reduce((b, p) => p.f1 > b.f1 ? p : b, curve[0]).t;
      }

      // Nearest stored curve point to the resolved threshold
      const nearest = curve.reduce((b, p) =>
        Math.abs(p.t - threshold) < Math.abs(b.t - threshold) ? p : b, curve[0]);

      // Patch to write back to disk
      const patch = { optimal_threshold: nearest.t };

      // If the artifact has test evaluation, replace candidate_metrics from curve
      if (existing.evaluation && existing.evaluation.test && existing.evaluation.test.candidate_metrics) {
        patch.evaluation = {
          ...existing.evaluation,
          test: {
            ...existing.evaluation.test,
            candidate_metrics: {
              ...existing.evaluation.test.candidate_metrics,
              threshold: nearest.t,
              precision: nearest.precision,
              recall:    nearest.recall,
              f1:        nearest.f1,
              confusion: {
                true_positive:  nearest.tp,
                false_positive: nearest.fp,
                false_negative: nearest.fn,
                true_negative:  nearest.tn,
              },
            },
          },
        };
      }

      await patchModelArtifact(dependencies.artifactRoot, req.params.artifactId, patch);

      res.json({
        ok:                true,
        artifactId:        req.params.artifactId,
        optimal_threshold: nearest.t,
        optimize,
        metrics: {
          threshold: nearest.t,
          precision: nearest.precision,
          recall:    nearest.recall,
          f1:        nearest.f1,
          tp: nearest.tp,
          fp: nearest.fp,
          fn: nearest.fn,
          tn: nearest.tn,
        },
      });
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

  // POST /train \u2014 respond 202 immediately, run training in an isolated child.
  // The browser polls GET /train-status/:jobId every few seconds instead of
  // holding the connection open (which would hit the proxy's 120s timeout).
  //
  // Why fork?  Training can peak at 3+ GB of heap.  Running it in-process would
  // OOM the API.  The child gets its own heap budget; if it dies only it dies.
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

      const jobIds   = normalizeJobIds(req.body && req.body.jobIds || '');
      const excludeFeatures = Array.isArray(req.body && req.body.excludeFeatures) ? req.body.excludeFeatures.map(String) : [];
      const jobId    = crypto.randomUUID();
      const bodySnap = {
        imbalanceStrategy: req.body && req.body.imbalanceStrategy || undefined,
        split:             req.body && req.body.split             || undefined,
        trainingOptions:   req.body && req.body.trainingOptions   || undefined,
        excludeFeatures,
      };

      pruneJobs(trainingJobs);
      recordJob(trainingJobs, jobId, { status: 'running', startedAt: Date.now() });

      // Respond before training starts \u2014 no more 504s
      res.status(202).json({ ok: true, jobId, status: 'running' });

      // Detached promise \u2014 intentionally not awaited.
      // 1. Parent builds the lightweight dataset (batch DB load + ref-nulling).
      // 2. Forks a child with its own heap budget and passes the dataset over IPC.
      // 3. Child does the heavy training and writes the artifact to disk.
      // 4. Parent loads the persisted artifact and records the job result.
      Promise.resolve()
        .then(async () => {
          const dataset = await buildLightDataset(jobIds, variantId);

          return new Promise((resolve, reject) => {
            let settled = false;
            const child = fork(WORKER_PATH, [], {
              execArgv: [`--max-old-space-size=${WORKER_HEAP_MB}`, '--expose-gc'],
              env: process.env,
            });

            child.on('message', (msg) => {
              if (settled) return;
              settled = true;
              resolve(msg);
            });

            child.on('exit', (code, signal) => {
              if (settled) return;
              settled = true;
              reject(new Error(
                signal === 'SIGKILL'
                  ? 'Training ran out of memory (SIGKILL). The swap file is active; try a smaller training set or contact support.'
                  : `Training process exited unexpectedly (code ${code})`,
              ));
            });

            child.on('error', (err) => {
              if (settled) return;
              settled = true;
              reject(err);
            });

            child.send({
              task:              'train',
              variantId,
              algorithm,
              jobIds,
              imbalanceStrategy:  bodySnap.imbalanceStrategy,
              split:              bodySnap.split,
              trainingOptions:    bodySnap.trainingOptions,
              excludeFeatures:    bodySnap.excludeFeatures,
              artifactRoot:       dependencies.artifactRoot,
              dataset,
            });
          });
        })
        .then(async (msg) => {
          if (msg.type === 'error') throw new Error(msg.error || 'Worker reported an error');
          // Worker writes the artifact to disk and sends only { artifactId, summary }.
          // Load the full artifact so the polling client gets model metadata.
          const artifact = msg.artifactId
            ? await getModelDetails(dependencies.artifactRoot, msg.artifactId)
            : null;
          recordJob(trainingJobs, jobId, {
            status:     'done',
            finishedAt: Date.now(),
            result:     { ok: true, model: artifact, summary: msg.summary },
          });
        })
        .catch((err) => {
          recordJob(trainingJobs, jobId, {
            status:     'error',
            finishedAt: Date.now(),
            error:      err && err.message ? err.message : String(err),
          });
        });
    } catch (error) {
      next(error);
    }
  });

  router.get('/train-status/:jobId', (req, res) => {
    const job = trainingJobs.get(req.params.jobId);
    if (!job) {
      res.status(404).json({ error: 'Training job not found or expired' });
      return;
    }
    res.json({
      jobId:      req.params.jobId,
      status:     job.status,
      startedAt:  job.startedAt,
      finishedAt: job.finishedAt || null,
      result:     job.result    || null,
      error:      job.error     || null,
    });
  });

  // POST /compare-imbalance \u2014 same async fork pattern as /train.
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

      const jobIds   = normalizeJobIds(req.body && req.body.jobIds || '');
      const jobId    = crypto.randomUUID();
      const bodySnap = {
        imbalanceStrategy: req.body && req.body.imbalanceStrategy || undefined,
        split:             req.body && req.body.split             || undefined,
        trainingOptions:   req.body && req.body.trainingOptions   || undefined,
        strategies:        req.body && req.body.strategies        || undefined,
      };

      pruneJobs(compareJobs);
      recordJob(compareJobs, jobId, { status: 'running', startedAt: Date.now() });

      res.status(202).json({ ok: true, jobId, status: 'running' });

      Promise.resolve()
        .then(async () => {
          const dataset = await buildLightDataset(jobIds, variantId);

          return new Promise((resolve, reject) => {
            let settled = false;
            const child = fork(WORKER_PATH, [], {
              execArgv: [`--max-old-space-size=${WORKER_HEAP_MB}`, '--expose-gc'],
              env: process.env,
            });

            child.on('message', (msg) => {
              if (settled) return;
              settled = true;
              resolve(msg);
            });

            child.on('exit', (code, signal) => {
              if (settled) return;
              settled = true;
              reject(new Error(
                signal === 'SIGKILL'
                  ? 'Comparison ran out of memory (SIGKILL). Try a smaller training set.'
                  : `Comparison process exited unexpectedly (code ${code})`,
              ));
            });

            child.on('error', (err) => {
              if (settled) return;
              settled = true;
              reject(err);
            });

            child.send({
              task:              'compare',
              variantId,
              algorithm,
              jobIds,
              imbalanceStrategy: bodySnap.imbalanceStrategy,
              split:             bodySnap.split,
              trainingOptions:   bodySnap.trainingOptions,
              strategies:        bodySnap.strategies,
              artifactRoot:      dependencies.artifactRoot,
              dataset,
            });
          });
        })
        .then((msg) => {
          if (msg.type === 'error') throw new Error(msg.error || 'Worker reported an error');
          recordJob(compareJobs, jobId, {
            status:     'done',
            finishedAt: Date.now(),
            result:     msg.result || { ok: true, variantId, algorithm, jobIds },
          });
        })
        .catch((err) => {
          recordJob(compareJobs, jobId, {
            status:     'error',
            finishedAt: Date.now(),
            error:      err && err.message ? err.message : String(err),
          });
        });
    } catch (error) {
      next(error);
    }
  });

  router.get('/compare-status/:jobId', (req, res) => {
    const job = compareJobs.get(req.params.jobId);
    if (!job) {
      res.status(404).json({ error: 'Comparison job not found or expired' });
      return;
    }
    res.json({
      jobId:      req.params.jobId,
      status:     job.status,
      startedAt:  job.startedAt,
      finishedAt: job.finishedAt || null,
      result:     job.result    || null,
      error:      job.error     || null,
    });
  });

  // ── Diagnostics: cross-validate & learning-curve (async fork) ────────────────
  // Both run multiple training iterations and can take 2-5 minutes with tree
  // models.  Same 202+polling pattern as /train — never holds the HTTP connection.

  function forkDiagTask(task, jobId, variantId, algorithm, imbalanceStrategy, jobIds) {
    pruneJobs(diagJobs);
    recordJob(diagJobs, jobId, { status: 'running', startedAt: Date.now() });

    Promise.resolve()
      .then(async () => {
        const dataset = await buildLightDataset(jobIds, variantId);
        return new Promise((resolve, reject) => {
          let settled = false;
          const child = fork(WORKER_PATH, [], {
            execArgv: [`--max-old-space-size=${WORKER_HEAP_MB}`, '--expose-gc'],
            env: process.env,
          });
          child.on('message', (msg) => {
            if (settled) return;
            settled = true;
            resolve(msg);
          });
          child.on('exit', (code, signal) => {
            if (settled) return;
            settled = true;
            reject(new Error(
              signal === 'SIGKILL'
                ? `${task} ran out of memory (SIGKILL). Try a smaller dataset or a simpler algorithm.`
                : `${task} process exited unexpectedly (code ${code})`,
            ));
          });
          child.on('error', (err) => {
            if (settled) return;
            settled = true;
            reject(err);
          });
          child.send({ task, variantId, algorithm, imbalanceStrategy, jobIds, artifactRoot: dependencies.artifactRoot, dataset });
        });
      })
      .then(async (msg) => {
        if (msg.type === 'error') throw new Error(msg.error || 'Worker error');
        const result = msg.result || null;
        recordJob(diagJobs, jobId, { status: 'done', finishedAt: Date.now(), result });
        // Auto-save cross-validation results so the supervisor page can display them later
        if (task === 'cross-validate' && result) {
          try {
            const cvDir = path.join(dependencies.artifactRoot, '_cv_history');
            await fs.mkdir(cvDir, { recursive: true });
            const cvId  = crypto.randomUUID().slice(0, 8);
            const record = {
              id: cvId,
              variantId,
              algorithm,
              imbalanceStrategy: imbalanceStrategy || 'baseline',
              jobIds: jobIds || '',
              timestamp: new Date().toISOString(),
              ...result,
            };
            await fs.writeFile(path.join(cvDir, `${cvId}.json`), JSON.stringify(record, null, 2), 'utf8');
          } catch (_) { /* saving CV history is non-critical; swallow errors */ }
        }
      })
      .catch((err) => {
        recordJob(diagJobs, jobId, { status: 'error', finishedAt: Date.now(), error: err && err.message ? err.message : String(err) });
      });
  }

  // GET /cv-results — list all saved cross-validation history records
  router.get('/cv-results', async (req, res, next) => {
    try {
      const cvDir = path.join(dependencies.artifactRoot, '_cv_history');
      let files = [];
      try { files = await fs.readdir(cvDir); } catch (_) { /* no history yet */ }
      const results = [];
      for (const f of files.filter((f) => f.endsWith('.json'))) {
        try {
          const raw = await fs.readFile(path.join(cvDir, f), 'utf8');
          results.push(JSON.parse(raw));
        } catch (_) { continue; }
      }
      results.sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
      res.json({ ok: true, results });
    } catch (error) { next(error); }
  });

  router.post('/cross-validate', async (req, res, next) => {
    try {
      const variantId = String(req.body && req.body.variantId || '').trim();
      if (!getModelVariant(variantId)) return res.status(400).json({ error: 'Select a valid model variant' });
      const algorithm = normalizeTrainingAlgorithm(req.body && req.body.algorithm);
      if (!algorithm) return res.status(400).json({ error: 'Select a valid training algorithm' });
      const jobIds           = normalizeJobIds(req.body && req.body.jobIds || '');
      const imbalanceStrategy = req.body && req.body.imbalanceStrategy || undefined;
      const jobId            = crypto.randomUUID();
      res.status(202).json({ ok: true, jobId, status: 'running' });
      forkDiagTask('cross-validate', jobId, variantId, algorithm, imbalanceStrategy, jobIds);
    } catch (error) { next(error); }
  });

  router.post('/learning-curve', async (req, res, next) => {
    try {
      const variantId = String(req.body && req.body.variantId || '').trim();
      if (!getModelVariant(variantId)) return res.status(400).json({ error: 'Select a valid model variant' });
      const algorithm = normalizeTrainingAlgorithm(req.body && req.body.algorithm);
      if (!algorithm) return res.status(400).json({ error: 'Select a valid training algorithm' });
      const jobIds            = normalizeJobIds(req.body && req.body.jobIds || '');
      const imbalanceStrategy = req.body && req.body.imbalanceStrategy || undefined;
      const jobId             = crypto.randomUUID();
      res.status(202).json({ ok: true, jobId, status: 'running' });
      forkDiagTask('learning-curve', jobId, variantId, algorithm, imbalanceStrategy, jobIds);
    } catch (error) { next(error); }
  });

  router.get('/diag-status/:jobId', (req, res) => {
    const job = diagJobs.get(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Diagnostics job not found or expired' });
    res.json({
      jobId:      req.params.jobId,
      status:     job.status,
      startedAt:  job.startedAt,
      finishedAt: job.finishedAt || null,
      result:     job.result    || null,
      error:      job.error     || null,
    });
  });

  // POST /domain-buckets — fast synchronous inspection of domain holdout buckets.
  // Counts rows per bucket; no model training involved.
  router.post('/domain-buckets', async (req, res, next) => {
    try {
      const variantId = String(req.body && req.body.variantId || '').trim();
      if (!getModelVariant(variantId)) return res.status(400).json({ error: 'Select a valid model variant' });
      const jobIds  = normalizeJobIds(req.body && req.body.jobIds || '');
      const dataset = await buildLightDataset(jobIds, variantId);
      const result  = await getDomainBuckets(null, dependencies.artifactRoot, { variantId, dataset });
      res.json({ ok: true, ...result });
    } catch (error) { next(error); }
  });

  // POST /domain-candidates — returns the individual labeled rows for a specific domain key.
  // Used by the bucket inspector drill-down to verify per-domain candidate counts.
  router.post('/domain-candidates', async (req, res, next) => {
    try {
      const variantId = String(req.body && req.body.variantId || '').trim();
      if (!getModelVariant(variantId)) return res.status(400).json({ error: 'Select a valid model variant' });
      const jobIds = normalizeJobIds(req.body && req.body.jobIds || '');
      const domain = String(req.body && req.body.domain || '').trim();
      if (!domain) return res.status(400).json({ error: 'domain is required' });
      const dataset = await buildLightDataset(jobIds, variantId);
      const result  = await getDomainCandidates(null, dependencies.artifactRoot, { variantId, domain, dataset });
      res.json({ ok: true, ...result });
    } catch (error) { next(error); }
  });

  // POST /feature-selection — data-driven feature analysis (async fork).
  // Fits L1 LR + RF internally; no algorithm or strategy param needed.
  router.post('/feature-selection', async (req, res, next) => {
    try {
      const variantId = String(req.body && req.body.variantId || '').trim();
      if (!getModelVariant(variantId)) return res.status(400).json({ error: 'Select a valid model variant' });
      const jobIds = normalizeJobIds(req.body && req.body.jobIds || '');
      const jobId  = crypto.randomUUID();
      res.status(202).json({ ok: true, jobId, status: 'running' });
      forkDiagTask('feature-selection', jobId, variantId, null, null, jobIds);
    } catch (error) { next(error); }
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
