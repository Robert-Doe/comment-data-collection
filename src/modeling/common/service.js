'use strict';

const { parseCsvText } = require('../../shared/csv');
const { getFeatureCatalog, getFeatureCatalogForVariant, groupFeaturesByFamily } = require('./featureCatalog');
const { extractCandidateDataset, serializeDatasetCsv } = require('./dataset');
const { fitVectorizer, transformRow, transformRows } = require('./vectorizer');
const { trainLogisticRegression, predictProbability } = require('./logisticRegression');
const { trainDecisionTree, predictProbabilityDecisionTree, explainDecisionTree } = require('./decisionTree');
const { trainRandomForest, predictProbabilityRandomForest, explainRandomForest } = require('./randomForest');
const { trainGradientBoosting, predictProbabilityGradientBoosting, explainGradientBoosting } = require('./gradientBoosting');
const { computeAllMetrics } = require('./metrics');
const { buildArtifactId, saveModelArtifact, listModelArtifacts, loadModelArtifact, summarizeArtifact } = require('./artifacts');
const { hashString, normalizeHostname, parseCsvLikeLines, roundNumber } = require('./utils');
const { listModelVariants, getModelVariant } = require('../variants');

function emitProgress(progress, patch) {
  if (typeof progress !== 'function') {
    return;
  }

  try {
    progress(patch);
  } catch (_) {
    // Progress reporting must never interrupt model work.
  }
}

function buildOverview(items, artifactRoot, options = {}) {
  const progress = typeof options.progress === 'function' ? options.progress : null;
  return listModelArtifacts(artifactRoot).then((models) => {
    const dataset = extractCandidateDataset(items, {
      progress: progress ? (patch) => emitProgress(progress, {
        ...patch,
        stage: 'overview',
      }) : null,
      progressInterval: options.progressInterval,
    });
    emitProgress(progress, {
      stage: 'overview',
      message: `Overview ready (${dataset.summary.item_count} item(s))`,
      progress: {
        current: dataset.summary.item_count,
        total: dataset.summary.item_count || 1,
        unit: 'items',
        indeterminate: false,
      },
    });
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

function summarizeSplit(split, totalRows) {
  if (!split || !split.split) return null;
  return {
    mode: split.split.mode,
    modulo: split.split.modulo,
    holdout_bucket: split.split.holdout_bucket,
    total_rows: Number(totalRows) || 0,
    train_rows: Array.isArray(split.trainRows) ? split.trainRows.length : 0,
    test_rows: Array.isArray(split.testRows) ? split.testRows.length : 0,
  };
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

const TRAINING_ALGORITHMS = [
  {
    id: 'logistic_regression',
    title: 'Logistic Regression',
  },
  {
    id: 'decision_tree',
    title: 'Decision Tree',
  },
  {
    id: 'random_forest',
    title: 'Random Forest',
  },
  {
    id: 'gradient_boosting',
    title: 'Gradient Boosting',
  },
];

function listTrainingAlgorithms() {
  return TRAINING_ALGORITHMS.map((entry) => ({ ...entry }));
}

function normalizeTrainingAlgorithm(value) {
  const normalized = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!normalized) {
    return 'logistic_regression';
  }
  return TRAINING_ALGORITHMS.some((entry) => entry.id === normalized) ? normalized : null;
}

function getArtifactAlgorithm(artifact) {
  const algorithm = artifact && (artifact.algorithm || (artifact.model && artifact.model.algorithm));
  return normalizeTrainingAlgorithm(algorithm) || 'logistic_regression';
}

function trainModelByAlgorithm(algorithm, vectors, labels, trainingOptions = {}) {
  const normalized = normalizeTrainingAlgorithm(algorithm) || 'logistic_regression';
  switch (normalized) {
    case 'decision_tree':
      return trainDecisionTree(vectors, labels, trainingOptions);
    case 'random_forest':
      return trainRandomForest(vectors, labels, trainingOptions);
    case 'gradient_boosting':
      return trainGradientBoosting(vectors, labels, trainingOptions);
    case 'logistic_regression':
    default:
      return trainLogisticRegression(vectors, labels, trainingOptions);
  }
}

function predictProbabilityForArtifact(artifact, vector) {
  const model = artifact && artifact.model ? artifact.model : artifact;
  switch (getArtifactAlgorithm(artifact)) {
    case 'decision_tree':
      return predictProbabilityDecisionTree(model, vector);
    case 'random_forest':
      return predictProbabilityRandomForest(model, vector);
    case 'gradient_boosting':
      return predictProbabilityGradientBoosting(model, vector);
    case 'logistic_regression':
    default:
      return predictProbability(model, vector);
  }
}

function explainModelContributions(artifact, vector, vectorizer) {
  const model = artifact && artifact.model ? artifact.model : artifact;
  const dimension = vectorizer && Array.isArray(vectorizer.descriptors)
    ? vectorizer.descriptors.length
    : (Array.isArray(vector) ? vector.length : 0);

  switch (getArtifactAlgorithm(artifact)) {
    case 'decision_tree':
      return explainDecisionTree(model, vector, dimension);
    case 'random_forest':
      return explainRandomForest(model, vector, dimension);
    case 'gradient_boosting':
      return explainGradientBoosting(model, vector, dimension);
    case 'logistic_regression':
    default: {
      const contributions = new Array(dimension).fill(0);
      const weights = Array.isArray(model && model.weights) ? model.weights : [];
      for (let index = 0; index < dimension; index += 1) {
        contributions[index] = (Number(vector[index]) || 0) * (Number(weights[index]) || 0);
      }
      return contributions;
    }
  }
}

function summarizeContributions(vectorizer, contributions, options = {}) {
  const descriptors = Array.isArray(vectorizer && vectorizer.descriptors) ? vectorizer.descriptors : [];
  const entries = descriptors
    .map((descriptor, index) => {
      const contribution = roundNumber(contributions[index] || 0);
      return {
        output_key: descriptor.output_key,
        feature_key: descriptor.feature_key,
        title: descriptor.title,
        family: descriptor.family,
        value: roundNumber(Number(contributions[index]) || 0),
        contribution,
        absolute_contribution: roundNumber(Math.abs(contribution)),
      };
    })
    .filter((entry) => entry.contribution !== 0)
    .sort((left, right) => Math.abs(right.contribution) - Math.abs(left.contribution));

  const topCount = Math.max(3, Number(options.topCount) || 6);
  return {
    top_positive_contributors: entries.filter((entry) => entry.contribution > 0).slice(0, topCount),
    top_negative_contributors: entries.filter((entry) => entry.contribution < 0).slice(0, topCount),
  };
}

function buildFeatureReliance(vectorizer, artifact, rows, options = {}) {
  const descriptors = Array.isArray(vectorizer && vectorizer.descriptors) ? vectorizer.descriptors : [];
  const rowCount = Array.isArray(rows) ? rows.length : 0;
  const progress = typeof options.progress === 'function' ? options.progress : null;
  const progressInterval = Math.max(1, Number(options.progressInterval) || 100);
  const signedTotals = new Array(descriptors.length).fill(0);
  const absoluteTotals = new Array(descriptors.length).fill(0);
  const familyMap = new Map();

  (Array.isArray(rows) ? rows : []).forEach((row, index) => {
    if (progress && (index === 0 || (index + 1) % progressInterval === 0 || index + 1 === rowCount)) {
      emitProgress(progress, {
        stage: 'reliance',
        message: `Computing feature reliance ${index + 1}/${rowCount}`,
        progress: {
          current: index + 1,
          total: rowCount,
          unit: 'rows',
          indeterminate: rowCount === 0,
        },
      });
    }

    const vector = transformRow(row, vectorizer);
    const contributions = explainModelContributions(artifact, vector, vectorizer);

    descriptors.forEach((descriptor, index) => {
      const contribution = Number(contributions[index]) || 0;
      signedTotals[index] += contribution;
      absoluteTotals[index] += Math.abs(contribution);
    });
  });

  const features = descriptors.map((descriptor, index) => ({
    output_key: descriptor.output_key,
    feature_key: descriptor.feature_key,
    title: descriptor.title,
    family: descriptor.family,
    weight: roundNumber(rowCount ? signedTotals[index] / rowCount : 0),
    absolute_weight: roundNumber(rowCount ? absoluteTotals[index] / rowCount : 0),
  }));

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
    family.total_absolute_weight += entry.absolute_weight;
    if (entry.absolute_weight > family.top_weight) {
      family.top_weight = entry.absolute_weight;
      family.top_feature = entry.title;
    }
  });

  const positive_weights = features
    .filter((entry) => entry.weight > 0)
    .sort((left, right) => right.weight - left.weight)
    .slice(0, 15);
  const negative_weights = features
    .filter((entry) => entry.weight < 0)
    .sort((left, right) => left.weight - right.weight)
    .slice(0, 15);
  const feature_importances = features
    .filter((entry) => entry.absolute_weight > 0)
    .sort((left, right) => right.absolute_weight - left.absolute_weight)
    .slice(0, 20);

  const families = Array.from(familyMap.values())
    .map((entry) => ({
      ...entry,
      total_absolute_weight: roundNumber(rowCount ? entry.total_absolute_weight / rowCount : 0),
      top_weight: roundNumber(entry.top_weight),
    }))
    .sort((left, right) => right.total_absolute_weight - left.total_absolute_weight);

  return {
    positive_weights,
    negative_weights,
    family_importance: families,
    feature_importances,
  };
}

function explainScoredRow(row, vectorizer, artifact, options = {}) {
  const vector = transformRow(row, vectorizer);
  const contributions = explainModelContributions(artifact, vector, vectorizer);
  return summarizeContributions(vectorizer, contributions, options);
}

function scoreRows(rows, artifact, options = {}) {
  const vectorizer = artifact.vectorizer;
  const sourceRows = Array.isArray(rows) ? rows : [];
  const totalRows = sourceRows.length;
  const progress = typeof options.progress === 'function' ? options.progress : null;
  const progressInterval = Math.max(1, Number(options.progressInterval) || 100);
  const threshold = Number(options.threshold) || 0.5;

  return sourceRows.map((row, index) => {
    if (progress && (index === 0 || (index + 1) % progressInterval === 0 || index + 1 === totalRows)) {
      emitProgress(progress, {
        stage: 'scoring',
        message: `Scoring candidate rows ${index + 1}/${totalRows}`,
        progress: {
          current: index + 1,
          total: totalRows,
          unit: 'rows',
          indeterminate: totalRows === 0,
        },
      });
    }

    const vector = transformRow(row, vectorizer);
    const probability = predictProbabilityForArtifact(artifact, vector);
    return {
      ...row,
      probability: roundNumber(probability),
      predicted_label: probability >= threshold ? 1 : 0,
      explanation: options.includeExplanations === false
        ? null
        : explainScoredRow(row, vectorizer, artifact, options),
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

    const { candidate: _c, item: _i, ...rowData } = row;
    groups.get(row.item_id).candidates.push(rowData);
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
  const runtimeModel = JSON.parse(JSON.stringify(model || {}));
  if (!runtimeModel.algorithm && artifact.algorithm) {
    runtimeModel.algorithm = artifact.algorithm;
  }

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
    model: runtimeModel,
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
      feature_importances: Array.isArray(reliance.feature_importances)
        ? reliance.feature_importances.map((entry) => ({ ...entry }))
        : [],
    },
  };
}

async function trainModel(items, artifactRoot, trainingInput = {}) {
  const variant = getModelVariant(trainingInput.variantId);
  if (!variant) {
    throw new Error('Select a valid model variant');
  }
  const progress = typeof trainingInput.progress === 'function' ? trainingInput.progress : null;
  const progressInterval = Math.max(1, Number(trainingInput.progressInterval) || 100);

  emitProgress(progress, {
    stage: 'training',
    message: 'Extracting training dataset',
    progress: {
      current: 0,
      total: Array.isArray(items) ? items.length : 0,
      unit: 'items',
      indeterminate: !Array.isArray(items) || items.length === 0,
    },
  });

  const dataset = extractCandidateDataset(items, {
    variant,
    progress: progress ? (patch) => emitProgress(progress, {
      ...patch,
      stage: 'training',
    }) : null,
    progressInterval,
  });
  const labeledRows = dataset.rows.filter((row) => row.binary_label === 0 || row.binary_label === 1);
  if (labeledRows.length < 4) {
    throw new Error('Model training needs at least 4 human-reviewed binary candidate labels');
  }

  emitProgress(progress, {
    stage: 'training',
    message: `Found ${labeledRows.length} human-reviewed candidate row(s)`,
    progress: {
      current: labeledRows.length,
      total: labeledRows.length,
      unit: 'rows',
      indeterminate: false,
    },
  });

  let split = splitRowsByDomain(labeledRows, trainingInput.split);
  if (!canTrainRows(split.trainRows)) {
    split = splitRowsByCandidate(labeledRows, trainingInput.split);
  }
  ensureTrainableRows(split.trainRows, 'Training split');

  const vectorizer = fitVectorizer(split.trainRows, dataset.featureCatalog);
  const trainVectors = transformRows(split.trainRows, vectorizer);
  const trainLabels = split.trainRows.map((row) => row.binary_label);
  const normalizedAlgorithm = normalizeTrainingAlgorithm(trainingInput.algorithm);
  if (!normalizedAlgorithm) {
    throw new Error('Select a valid training algorithm');
  }

  emitProgress(progress, {
    stage: 'training',
    message: `Training ${normalizedAlgorithm.replace(/_/g, ' ')}`,
    progress: {
      current: 0,
      total: 1,
      unit: 'model',
      indeterminate: false,
    },
  });

  const model = trainModelByAlgorithm(normalizedAlgorithm, trainVectors, trainLabels, trainingInput.trainingOptions);
  const trainingArtifact = {
    algorithm: model.algorithm,
    model,
  };
  const scoredTrainRows = scoreRows(split.trainRows, { vectorizer, ...trainingArtifact }, {
    includeExplanations: false,
    progressInterval,
    progress: progress ? (patch) => emitProgress(progress, {
      ...patch,
      stage: 'training',
    }) : null,
  });
  const scoredTestRows = scoreRows(split.testRows, { vectorizer, ...trainingArtifact }, {
    includeExplanations: false,
    progressInterval,
    progress: progress ? (patch) => emitProgress(progress, {
      ...patch,
      stage: 'training',
    }) : null,
  });
  const evaluation = {
    train: computeAllMetrics(scoredTrainRows, {}),
    test: split.testRows.length ? computeAllMetrics(scoredTestRows, {}) : null,
  };
  emitProgress(progress, {
    stage: 'training',
    message: 'Computing feature reliance',
    progress: {
      current: 0,
      total: split.trainRows.length || 1,
      unit: 'rows',
      indeterminate: split.trainRows.length === 0,
    },
  });
  const reliance = buildFeatureReliance(vectorizer, trainingArtifact, split.trainRows, {
    progressInterval,
    progress: progress ? (patch) => emitProgress(progress, {
      ...patch,
      stage: 'training',
    }) : null,
  });

  const artifact = {
    id: buildArtifactId(variant.id),
    variant_id: variant.id,
    variant_title: variant.title,
    variant_description: variant.description,
    algorithm: trainingArtifact.algorithm,
    created_at: new Date().toISOString(),
    feature_count: dataset.featureCatalog.length,
    feature_catalog: dataset.featureCatalog,
    vectorizer,
    model,
    split: summarizeSplit(split, labeledRows.length),
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

  emitProgress(progress, {
    stage: 'training',
    message: `Saved model artifact ${artifact.id}`,
    progress: {
      current: 1,
      total: 1,
      unit: 'artifact',
      indeterminate: false,
    },
  });

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
  const progress = typeof options.progress === 'function' ? options.progress : null;
  const progressInterval = Math.max(1, Number(options.progressInterval) || 100);

  emitProgress(progress, {
    stage: 'scoring',
    message: 'Extracting scoring dataset',
    progress: {
      current: 0,
      total: Array.isArray(items) ? items.length : 0,
      unit: 'items',
      indeterminate: !Array.isArray(items) || items.length === 0,
    },
  });

  const dataset = extractCandidateDataset(items, {
    featureCatalog: artifact.feature_catalog,
    progress: progress ? (patch) => emitProgress(progress, {
      ...patch,
      stage: 'scoring',
    }) : null,
    progressInterval,
  });
  emitProgress(progress, {
    stage: 'scoring',
    message: `Scoring ${dataset.rows.length} candidate row(s)`,
    progress: {
      current: 0,
      total: dataset.rows.length || 1,
      unit: 'rows',
      indeterminate: dataset.rows.length === 0,
    },
  });
  const scoredRows = scoreRows(dataset.rows, artifact, {
    ...options,
    progressInterval,
    progress: progress ? (patch) => emitProgress(progress, {
      ...patch,
      stage: 'scoring',
    }) : null,
  });
  emitProgress(progress, {
    stage: 'scoring',
    message: 'Grouping scored rows by item',
    progress: {
      current: dataset.rows.length,
      total: dataset.rows.length || 1,
      unit: 'rows',
      indeterminate: false,
    },
  });
  const scoredItems = groupScoredRowsByItem(scoredRows);

  emitProgress(progress, {
    stage: 'scoring',
    message: `Scored ${scoredItems.length} item(s)`,
    progress: {
      current: scoredItems.length,
      total: scoredItems.length || 1,
      unit: 'items',
      indeterminate: false,
    },
  });

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

async function scoreLiveUrlProbe(scanResult, artifactRoot, artifactId, options = {}) {
  const artifact = await loadModelArtifact(artifactRoot, artifactId);
  if (!artifact) {
    throw new Error('Model artifact not found');
  }

  const candidateRowsSource = Array.isArray(scanResult && scanResult.candidates)
    ? scanResult.candidates
    : [];
  const probeJobId = String(options.jobId || scanResult.job_id || 'live-url-probe');
  const probeItemId = String(options.itemId || scanResult.item_id || `probe-${Date.now().toString(36)}`);
  const normalizedUrl = String(scanResult && (scanResult.normalized_url || scanResult.input_url) || options.url || '');
  const finalUrl = String(scanResult && scanResult.final_url || normalizedUrl || '');
  const hostname = normalizeHostname(finalUrl || normalizedUrl || '');
  const analysisSource = String(scanResult && scanResult.analysis_source || 'live_url_probe');
  const itemStatus = scanResult && scanResult.error ? 'failed' : 'completed';
  const scanError = String(scanResult && scanResult.error || '');
  const scanTimedOut = !!(scanResult && scanResult.timed_out)
    || /timed out/i.test(scanError);
  const candidateMode = String(
    scanResult && (scanResult.candidate_selection_mode || scanResult.candidateMode)
      || options.candidateMode
      || 'default',
  );

  const candidateRows = candidateRowsSource.map((candidate, index) => ({
    dataset_row_id: `${probeItemId}:${String(candidate.candidate_key || candidate.xpath || candidate.css_path || candidate.candidate_rank || index + 1)}`,
    job_id: probeJobId,
    item_id: probeItemId,
    row_number: index + 1,
    candidate_key: String(candidate.candidate_key || candidate.xpath || candidate.css_path || ''),
    candidate_rank: Number(candidate.candidate_rank || index + 1) || index + 1,
    normalized_url: normalizedUrl,
    final_url: finalUrl,
    hostname,
    frame_url: String(candidate.frame_url || ''),
    frame_host: normalizeHostname(candidate.frame_url || ''),
    analysis_source: analysisSource,
    manual_captured_at: '',
    item_status: itemStatus,
    item_ugc_detected: scanResult && scanResult.ugc_detected ? 'true' : 'false',
    candidate_screenshot_url: String(candidate.candidate_screenshot_url || ''),
    item_screenshot_url: String(scanResult && scanResult.screenshot_url || ''),
    item_manual_uploaded_screenshot_url: '',
    human_label: '',
    binary_label: null,
    review_complete_binary: false,
    item_positive_label_count: 0,
    item_negative_label_count: 0,
    sample_text: String(candidate.sample_text || ''),
    score: Number(candidate.score) || 0,
    confidence: String(candidate.confidence || candidate.heuristic_pseudo_confidence || ''),
    ugc_type: String(candidate.ugc_type || candidate.heuristic_pseudo_label || ''),
    feature_values: candidate,
    candidate,
    item: {
      id: probeItemId,
      job_id: probeJobId,
      row_number: 1,
      normalized_url: normalizedUrl,
      final_url: finalUrl,
      hostname,
      analysis_source: analysisSource,
      status: itemStatus,
      ugc_detected: !!(scanResult && scanResult.ugc_detected),
      scan_result: scanResult || null,
    },
  }));

  const scoredRows = candidateRows.length
    ? scoreRows(candidateRows, artifact, {
      includeExplanations: options.includeExplanations !== false,
      threshold: options.threshold,
      progress: options.progress,
      progressInterval: options.progressInterval,
    })
    : [];

  const scoredItems = candidateRows.length
    ? groupScoredRowsByItem(scoredRows)
    : [{
      item_id: probeItemId,
      job_id: probeJobId,
      row_number: 1,
      hostname,
      normalized_url: normalizedUrl,
      final_url: finalUrl,
      analysis_source: analysisSource,
      item_status: itemStatus,
      item_ugc_detected: scanResult && scanResult.ugc_detected,
      candidates: [],
      top_candidate: null,
      manual_review_suggested: false,
      review_complete_binary: false,
    }];

  const summary = summarizeScoredItems(scoredItems);
  const topCandidate = scoredItems[0] ? scoredItems[0].top_candidate : null;
  summary.page_input_url = scanResult && scanResult.input_url ? scanResult.input_url : normalizedUrl;
  summary.page_final_url = finalUrl;
  summary.page_title = scanResult && scanResult.title ? scanResult.title : '';
  summary.page_priority_probe = !!(scanResult && scanResult.priority_probe);
  summary.page_predicted_positive = !!(topCandidate && topCandidate.probability >= 0.5);
  summary.page_top_probability = topCandidate ? roundNumber(topCandidate.probability) : 0;
  summary.page_verdict = scanTimedOut
    ? 'probe_timed_out'
    : (scanError
      ? 'probe_failed'
      : (summary.page_predicted_positive ? 'comments_likely_present' : 'comments_unlikely'));
  summary.page_candidate_count = candidateRows.length;
  summary.page_detected = !!(scanResult && scanResult.ugc_detected);
  summary.page_candidate_mode = candidateMode;
  summary.blocked_by_interstitial = !!(scanResult && scanResult.blocked_by_interstitial);
  summary.blocker_type = String(scanResult && scanResult.blocker_type || '');
  summary.scan_error = scanError;

  return {
    artifact: summarizeArtifact(artifact),
    scan: scanResult || null,
    summary,
    items: scoredItems,
  };
}

function exportDataset(items, variantId, options = {}) {
  const variant = variantId ? getModelVariant(variantId) : null;
  const progress = typeof options.progress === 'function' ? options.progress : null;
  const progressInterval = Math.max(1, Number(options.progressInterval) || 100);
  const dataset = extractCandidateDataset(items, {
    variant,
    progress: progress ? (patch) => emitProgress(progress, {
      ...patch,
      stage: 'exporting',
    }) : null,
    progressInterval,
  });
  return {
    csv: serializeDatasetCsv(dataset.rows, dataset.featureCatalog, {
      progress: progress ? (patch) => emitProgress(progress, {
        ...patch,
        stage: 'exporting',
      }) : null,
      progressInterval,
    }),
    summary: dataset.summary,
    featureCatalog: dataset.featureCatalog,
  };
}

module.exports = {
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
};
