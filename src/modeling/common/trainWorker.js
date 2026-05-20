'use strict';

// ─── TRAINING WORKER ──────────────────────────────────────────────────────────
// Forked by the API so training memory is isolated from the server process.
// IMPORTANT: this worker does NOT touch the database.  The parent loads all
// candidate rows, extracts feature vectors in batches, nulls the heavy
// item/candidate references, and sends the resulting lightweight dataset
// over IPC (~12 MB).  This child receives it and runs the training algorithm.
//
// Separation of concerns:
//   Parent  — DB access, batch loading, feature extraction, ref nulling
//   Child   — pure in-memory model training, isolated heap
//
// If the child OOMs, only it dies — the API and job store survive.
// ──────────────────────────────────────────────────────────────────────────────

const { getModelVariant } = require('../variants');
const { trainModel, compareImbalanceStrategies, runCrossValidation, computeLearningCurve, analyzeFeatures } = require('./service');

function tryGC() {
  if (typeof global.gc === 'function') global.gc();
}

process.on('message', async (msg) => {
  try {
    const {
      task,
      variantId,
      algorithm,
      jobIds,
      imbalanceStrategy,
      split,
      trainingOptions,
      artifactRoot,
      strategies,
      dataset,       // pre-built lightweight dataset from parent
    } = msg;

    if (!dataset || !Array.isArray(dataset.rows)) {
      throw new Error('No dataset received from parent process');
    }

    // GC hint before the heavy training phase
    tryGC();

    if (task === 'compare') {
      const result = await compareImbalanceStrategies(null, artifactRoot, {
        variantId,
        algorithm,
        imbalanceStrategy,
        split,
        trainingOptions,
        strategies,
        dataset,
      });
      process.send({
        type: 'done',
        result: { ok: true, variantId, algorithm, jobIds, ...result },
      });
    } else if (task === 'cross-validate') {
      const result = await runCrossValidation(null, artifactRoot, {
        variantId,
        algorithm,
        imbalanceStrategy,
        dataset,
      });
      process.send({
        type: 'done',
        result: { ok: true, ...result },
      });
    } else if (task === 'learning-curve') {
      const result = await computeLearningCurve(null, artifactRoot, {
        variantId,
        algorithm,
        imbalanceStrategy,
        dataset,
      });
      process.send({
        type: 'done',
        result: { ok: true, ...result },
      });
    } else if (task === 'feature-selection') {
      const result = await analyzeFeatures(null, artifactRoot, { variantId, dataset });
      process.send({ type: 'done', result: { ok: true, ...result } });
    } else {
      const trained = await trainModel(null, artifactRoot, {
        variantId,
        algorithm,
        imbalanceStrategy,
        split,
        trainingOptions,
        dataset,
      });
      // Send only the compact summary — not the full artifact with weights.
      // The parent loads the persisted artifact from disk for the job result.
      process.send({
        type: 'done',
        artifactId: trained.artifact ? trained.artifact.id : null,
        summary:    trained.summary  || null,
      });
    }
  } catch (err) {
    process.send({
      type:  'error',
      error: err && err.message ? err.message : String(err),
    });
  } finally {
    // Give the IPC message time to flush before the process exits
    setTimeout(() => process.exit(0), 300);
  }
});
