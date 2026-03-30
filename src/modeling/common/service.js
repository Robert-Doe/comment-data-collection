'use strict';

const { parseCsvText } = require('../../shared/csv');
const { getFeatureCatalog, getFeatureCatalogForVariant, groupFeaturesByFamily } = require('./featureCatalog');
const { extractCandidateDataset, serializeDatasetCsv } = require('./dataset');
const { fitVectorizer, transformRow, transformRows } = require('./vectorizer');
const { trainLogisticRegression, predictProbability } = require('./logisticRegression');
const { computeAllMetrics } = require('./metrics');
const { buildArtifactId, saveModelArtifact, listModelArtifacts, loadModelArtifact, summarizeArtifact } = require('./artifacts');
const { hashString, normalizeHostname, parseCsvLikeLines, roundNumber } = require('./utils');
const { listModelVariants, getModelVariant } = require('../variants');

function buildOverview(items, artifactRoot) {
  return listModelArtifacts(artifactRoot).then((models) => {
    const dataset = extractCandidateDataset(items, {});
    return {
      dataset: dataset.summary,
      variants: listModelVariants().map((variant) => ({
        ...variant,
        feature_count: getFeatureCatalogForVariant(variant).length,
      })),
      feature_families: groupFeaturesByFamily(getFeatureCatalog()).map((family) => ({
        key: family.key,
        title: family.title,
        description: family.description,
        feature_count: family.features.length,
      })),
      models,
    };
  });
}

function splitRowsByDomain(rows, options = {}) {
  const modulo = Math.max(2, Number(options.modulo) || 5);
  const holdoutBucket = Math.max(0, Number(options.holdoutBucket) || 0) % modulo;
  const trainRows = [];
  const testRows = [];

  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const stableKey = row.hostname || row.frame_host || row.item_id || row.dataset_row_id;
    const bucket = hashString(stableKey) % modulo;
    if (bucket === holdoutBucket) {
      testRows.push(row);
    } else {
      trainRows.push(row);
    }
  });

  return {
    trainRows,
    testRows,
    split: {
      mode: 'domain_holdout',
      modulo,
      holdout_bucket: holdoutBucket,
    },
  };
}

function splitRowsByCandidate(rows, options = {}) {
  const modulo = Math.max(2, Number(options.modulo) || 5);
  const holdoutBucket = Math.max(0, Number(options.holdoutBucket) || 0) % modulo;
  const trainRows = [];
  const testRows = [];

  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const stableKey = row.dataset_row_id || row.item_id || row.candidate_key || row.row_number;
    const bucket = hashString(stableKey) % modulo;
    if (bucket === holdoutBucket) {
      testRows.push(row);
    } else {
      trainRows.push(row);
    }
  });

  return {
    trainRows,
    testRows,
    split: {
      mode: 'candidate_fallback',
      modulo,
      holdout_bucket: holdoutBucket,
    },
  };
}

function countBinaryLabels(rows) {
  return (Array.isArray(rows) ? rows : []).reduce((summary, row) => {
    if (row.binary_label === 1) summary.positive += 1;
    if (row.binary_label === 0) summary.negative += 1;
    return summary;
  }, {
    positive: 0,
    negative: 0,
  });
}

function ensureTrainableRows(rows, segmentName) {
  const counts = countBinaryLabels(rows);
  if (!counts.positive || !counts.negative) {
    throw new Error(`${segmentName} needs at least one positive and one negative human-reviewed candidate`);
  }
}

function canTrainRows(rows) {
  const counts = countBinaryLabels(rows);
  return counts.positive > 0 && counts.negative > 0;
}

function buildFeatureReliance(vectorizer, model) {
  const features = (vectorizer.descriptors || []).map((descriptor) => ({
    output_key: descriptor.output_key,
    feature_key: descriptor.feature_key,
    title: descriptor.title,
    family: descriptor.family,
    weight: roundNumber(model.weights[descriptor.index] || 0),
    absolute_weight: roundNumber(Math.abs(model.weights[descriptor.index] || 0)),
  }));

  const positive_weights = features
    .filter((entry) => entry.weight > 0)
    .sort((left, right) => right.weight - left.weight)
    .slice(0, 15);
  const negative_weights = features
    .filter((entry) => entry.weight < 0)
    .sort((left, right) => left.weight - right.weight)
    .slice(0, 15);

  const familyMap = new Map();
  features.forEach((entry) => {
    if (!familyMap.has(entry.family)) {
      familyMap.set(entry.family, {
        family: entry.family,
        total_absolute_weight: 0,
        top_feature: entry.title,
        top_weight: entry.absolute_weight,
      });
    }
    const family = familyMap.get(entry.family);
    family.total_absolute_weight += Math.abs(entry.weight);
    if (entry.absolute_weight > family.top_weight) {
      family.top_weight = entry.absolute_weight;
      family.top_feature = entry.title;
    }
  });

  const families = Array.from(familyMap.values())
    .map((entry) => ({
      ...entry,
      total_absolute_weight: roundNumber(entry.total_absolute_weight),
      top_weight: roundNumber(entry.top_weight),
    }))
    .sort((left, right) => right.total_absolute_weight - left.total_absolute_weight);

  return {
    positive_weights,
    negative_weights,
    family_importance: families,
  };
}

function explainScoredRow(row, vectorizer, model, options = {}) {
  const vector = transformRow(row, vectorizer);
  const contributions = vectorizer.descriptors
    .map((descriptor) => ({
      output_key: descriptor.output_key,
      feature_key: descriptor.feature_key,
      title: descriptor.title,
      family: descriptor.family,
      value: roundNumber(vector[descriptor.index] || 0),
      contribution: roundNumber((vector[descriptor.index] || 0) * (model.weights[descriptor.index] || 0)),
    }))
    .filter((entry) => entry.value !== 0 && entry.contribution !== 0)
    .sort((left, right) => Math.abs(right.contribution) - Math.abs(left.contribution));

  const topCount = Math.max(3, Number(options.topCount) || 6);
  return {
    top_positive_contributors: contributions.filter((entry) => entry.contribution > 0).slice(0, topCount),
    top_negative_contributors: contributions.filter((entry) => entry.contribution < 0).slice(0, topCount),
  };
}

function scoreRows(rows, artifact, options = {}) {
  const vectorizer = artifact.vectorizer;
  const model = artifact.model;

  return (Array.isArray(rows) ? rows : []).map((row) => {
    const vector = transformRow(row, vectorizer);
    const probability = predictProbability(model, vector);
    return {
      ...row,
      probability: roundNumber(probability),
      predicted_label: probability >= (Number(options.threshold) || 0.5) ? 1 : 0,
      explanation: options.includeExplanations === false
        ? null
        : explainScoredRow(row, vectorizer, model, options),
    };
  });
}

function groupScoredRowsByItem(scoredRows) {
  const groups = new Map();

  (Array.isArray(scoredRows) ? scoredRows : []).forEach((row) => {
    if (!groups.has(row.item_id)) {
      groups.set(row.item_id, {
        item_id: row.item_id,
        job_id: row.job_id,
        row_number: row.row_number,
        hostname: row.hostname,
        normalized_url: row.normalized_url,
        final_url: row.final_url,
        analysis_source: row.analysis_source,
        item_status: row.item_status,
        item_ugc_detected: row.item_ugc_detected,
        candidates: [],
      });
    }

    groups.get(row.item_id).candidates.push(row);
  });

  groups.forEach((group) => {
    group.candidates.sort((left, right) => right.probability - left.probability);
    group.top_candidate = group.candidates[0] || null;
    group.manual_review_suggested = !!group.top_candidate
      && group.top_candidate.probability < 0.8
      && group.top_candidate.probability > 0.2;
    group.review_complete_binary = group.candidates.every((row) => row.binary_label === 0 || row.binary_label === 1);
  });

  return Array.from(groups.values())
    .sort((left, right) => {
      if (!left.top_candidate || !right.top_candidate) {
        return left.row_number - right.row_number;
      }
      return right.top_candidate.probability - left.top_candidate.probability
        || left.row_number - right.row_number;
    });
}

function summarizeScoredItems(items) {
  const summary = {
    item_count: items.length,
    candidate_count: 0,
    predicted_positive_item_count: 0,
    manual_review_item_count: 0,
    mean_top_probability: 0,
  };

  let topProbabilityTotal = 0;
  items.forEach((item) => {
    summary.candidate_count += item.candidates.length;
    if (item.top_candidate && item.top_candidate.probability >= 0.5) {
      summary.predicted_positive_item_count += 1;
    }
    if (item.manual_review_suggested) {
      summary.manual_review_item_count += 1;
    }
    topProbabilityTotal += item.top_candidate ? item.top_candidate.probability : 0;
  });

  summary.mean_top_probability = items.length
    ? roundNumber(topProbabilityTotal / items.length)
    : 0;

  return summary;
}

function summarizeEvaluationForRuntime(evaluation) {
  if (!evaluation) return null;

  function slimSegment(segment) {
    if (!segment) return null;
    return {
      candidate_metrics: segment.candidate_metrics || null,
      ranking_metrics: segment.ranking_metrics || null,
      page_metrics: segment.page_metrics || null,
    };
  }

  return {
    train: slimSegment(evaluation.train),
    test: slimSegment(evaluation.test),
  };
}

function buildRuntimeModelBundle(artifact, options = {}) {
  if (!artifact) return null;

  const positiveThreshold = Number(options.positiveThreshold);
  const manualReviewLow = Number(options.manualReviewLow);
  const manualReviewHigh = Number(options.manualReviewHigh);
  const vectorizer = artifact.vectorizer || {};
  const model = artifact.model || {};
  const reliance = artifact.reliance || {};

  return {
    schema_version: 1,
    artifact_type: 'ugc_candidate_runtime_model',
    artifact_id: artifact.id,
    variant_id: artifact.variant_id,
    variant_title: artifact.variant_title,
    variant_description: artifact.variant_description,
    created_at: artifact.created_at,
    algorithm: artifact.algorithm,
    feature_count: artifact.feature_count,
    thresholds: {
      positive: Number.isFinite(positiveThreshold) ? positiveThreshold : 0.5,
      manual_review_low: Number.isFinite(manualReviewLow) ? manualReviewLow : 0.2,
      manual_review_high: Number.isFinite(manualReviewHigh) ? manualReviewHigh : 0.8,
    },
    feature_catalog: Array.isArray(artifact.feature_catalog)
      ? artifact.feature_catalog.map((entry) => ({ ...entry }))
      : [],
    vectorizer: {
      descriptors: Array.isArray(vectorizer.descriptors)
        ? vectorizer.descriptors.map((entry) => ({ ...entry }))
        : [],
      numericStats: vectorizer.numericStats ? { ...vectorizer.numericStats } : {},
      categoricalMaps: vectorizer.categoricalMaps ? { ...vectorizer.categoricalMaps } : {},
      dimension: Number(vectorizer.dimension) || 0,
    },
    model: {
      algorithm: model.algorithm || artifact.algorithm,
      weights: Array.isArray(model.weights) ? model.weights.slice() : [],
      bias: Number(model.bias) || 0,
    },
    evaluation_summary: summarizeEvaluationForRuntime(artifact.evaluation),
    reliance_summary: {
      family_importance: Array.isArray(reliance.family_importance)
        ? reliance.family_importance.map((entry) => ({ ...entry }))
        : [],
      positive_weights: Array.isArray(reliance.positive_weights)
        ? reliance.positive_weights.map((entry) => ({ ...entry }))
        : [],
      negative_weights: Array.isArray(reliance.negative_weights)
        ? reliance.negative_weights.map((entry) => ({ ...entry }))
        : [],
    },
  };
}

async function trainModel(items, artifactRoot, trainingInput = {}) {
  const variant = getModelVariant(trainingInput.variantId);
  if (!variant) {
    throw new Error('Select a valid model variant');
  }

  const dataset = extractCandidateDataset(items, { variant });
  const labeledRows = dataset.rows.filter((row) => row.binary_label === 0 || row.binary_label === 1);
  if (labeledRows.length < 4) {
    throw new Error('Model training needs at least 4 human-reviewed binary candidate labels');
  }

  let split = splitRowsByDomain(labeledRows, trainingInput.split);
  if (!canTrainRows(split.trainRows)) {
    split = splitRowsByCandidate(labeledRows, trainingInput.split);
  }
  ensureTrainableRows(split.trainRows, 'Training split');

  const vectorizer = fitVectorizer(split.trainRows, dataset.featureCatalog);
  const trainVectors = transformRows(split.trainRows, vectorizer);
  const trainLabels = split.trainRows.map((row) => row.binary_label);
  const model = trainLogisticRegression(trainVectors, trainLabels, trainingInput.trainingOptions);
  const scoredTrainRows = scoreRows(split.trainRows, { vectorizer, model }, { includeExplanations: false });
  const scoredTestRows = scoreRows(split.testRows, { vectorizer, model }, { includeExplanations: false });
  const evaluation = {
    train: computeAllMetrics(scoredTrainRows, {}),
    test: split.testRows.length ? computeAllMetrics(scoredTestRows, {}) : null,
  };
  const reliance = buildFeatureReliance(vectorizer, model);

  const artifact = {
    id: buildArtifactId(variant.id),
    variant_id: variant.id,
    variant_title: variant.title,
    variant_description: variant.description,
    algorithm: model.algorithm,
    created_at: new Date().toISOString(),
    feature_count: dataset.featureCatalog.length,
    feature_catalog: dataset.featureCatalog,
    vectorizer,
    model,
    split,
    training_counts: {
      total_labeled_rows: labeledRows.length,
      train_rows: split.trainRows.length,
      test_rows: split.testRows.length,
      train_label_counts: countBinaryLabels(split.trainRows),
      test_label_counts: countBinaryLabels(split.testRows),
    },
    dataset_summary: dataset.summary,
    evaluation,
    reliance,
  };

  const artifactPath = await saveModelArtifact(artifactRoot, artifact);
  artifact.file_path = artifactPath;

  return {
    artifact,
    summary: summarizeArtifact(artifact),
  };
}

async function getModelDetails(artifactRoot, artifactId) {
  const artifact = await loadModelArtifact(artifactRoot, artifactId);
  if (!artifact) return null;
  return artifact;
}

async function scoreJobItems(items, artifactRoot, artifactId, options = {}) {
  const artifact = await loadModelArtifact(artifactRoot, artifactId);
  if (!artifact) {
    throw new Error('Model artifact not found');
  }

  const dataset = extractCandidateDataset(items, {
    featureCatalog: artifact.feature_catalog,
  });
  const scoredRows = scoreRows(dataset.rows, artifact, options);
  const scoredItems = groupScoredRowsByItem(scoredRows);

  return {
    artifact: summarizeArtifact(artifact),
    summary: summarizeScoredItems(scoredItems),
    items: scoredItems,
  };
}

function parseSiteUpload(text) {
  const rawText = String(text || '');
  try {
    const parsed = parseCsvText(rawText);
    const hosts = Array.from(new Set((parsed.records || [])
      .map((record) => normalizeHostname(record.__normalized_url || record.__input_url || ''))
      .filter(Boolean)));
    if (hosts.length) {
      return hosts;
    }
  } catch (_) {
    // Fallback to plain line parsing below.
  }

  return Array.from(new Set(parseCsvLikeLines(rawText)
    .map((entry) => normalizeHostname(entry))
    .filter((entry) => entry && /\./.test(entry))));
}

async function scoreSiteGroups(items, artifactRoot, artifactId, text, options = {}) {
  const artifact = await loadModelArtifact(artifactRoot, artifactId);
  if (!artifact) {
    throw new Error('Model artifact not found');
  }

  const requestedHosts = parseSiteUpload(text);
  if (!requestedHosts.length) {
    throw new Error('Upload or paste at least one URL or hostname');
  }

  const filteredItems = (Array.isArray(items) ? items : []).filter((item) => {
    const hostname = normalizeHostname(item.final_url || item.normalized_url || '');
    return requestedHosts.includes(hostname);
  });

  const scored = await scoreJobItems(filteredItems, artifactRoot, artifactId, options);
  const groups = requestedHosts.map((hostname) => {
    const hostItems = scored.items.filter((item) => item.hostname === hostname);
    const topProbabilityMean = hostItems.length
      ? roundNumber(hostItems.reduce((sum, item) => sum + (item.top_candidate ? item.top_candidate.probability : 0), 0) / hostItems.length)
      : 0;
    return {
      hostname,
      matched_item_count: hostItems.length,
      manual_review_item_count: hostItems.filter((item) => item.manual_review_suggested).length,
      mean_top_probability: topProbabilityMean,
      max_top_probability: roundNumber(hostItems.reduce((maximum, item) => {
        const value = item.top_candidate ? item.top_candidate.probability : 0;
        return Math.max(maximum, value);
      }, 0)),
      items: hostItems.slice(0, 25),
    };
  });

  return {
    artifact: summarizeArtifact(artifact),
    requested_host_count: requestedHosts.length,
    matched_host_count: groups.filter((group) => group.matched_item_count > 0).length,
    groups,
  };
}

function exportDataset(items, variantId) {
  const variant = variantId ? getModelVariant(variantId) : null;
  const dataset = extractCandidateDataset(items, { variant });
  return {
    csv: serializeDatasetCsv(dataset.rows, dataset.featureCatalog),
    summary: dataset.summary,
    featureCatalog: dataset.featureCatalog,
  };
}

module.exports = {
  buildOverview,
  trainModel,
  getModelDetails,
  buildRuntimeModelBundle,
  scoreJobItems,
  scoreSiteGroups,
  exportDataset,
};
