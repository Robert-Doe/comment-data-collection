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

async function buildOverview(items, artifactRoot, options = {}) {
  const progress = typeof options.progress === 'function' ? options.progress : null;
  const models = await listModelArtifacts(artifactRoot);
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

  const insights = await buildModelInsights(dataset.summary, models, artifactRoot, {
    progressionLimit: options.progressionLimit,
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
    imbalance_strategies: listImbalanceStrategies(),
    models,
    insights,
  };
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

const IMBALANCE_STRATEGIES = [
  {
    id: 'baseline',
    title: 'Baseline',
    description: 'Keep the original labeled training split unchanged. Use this as the control run for comparison.',
  },
  {
    id: 'class_weighted',
    title: 'Class Weighted',
    description: 'Bias the fit toward the minority class without mutating stored data. Logistic regression uses true loss weighting; other trainers use a weighted bootstrap approximation.',
  },
  {
    id: 'undersample',
    title: 'Undersample Majority',
    description: 'Trim the majority class in memory so both classes are balanced before training.',
  },
  {
    id: 'oversample',
    title: 'Oversample Minority',
    description: 'Duplicate minority rows in memory until the classes are balanced.',
  },
  {
    id: 'smote',
    title: 'SMOTE-like',
    description: 'Create synthetic minority rows by interpolating between nearby minority neighbors in feature space.',
  },
];

function listImbalanceStrategies() {
  return IMBALANCE_STRATEGIES.map((entry) => ({ ...entry }));
}

function normalizeImbalanceStrategy(value) {
  const normalized = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!normalized) {
    return 'baseline';
  }

  const aliases = {
    none: 'baseline',
    original: 'baseline',
    base: 'baseline',
    weighted: 'class_weighted',
    classweight: 'class_weighted',
    classweights: 'class_weighted',
    classweighted: 'class_weighted',
    downsample: 'undersample',
    upsample: 'oversample',
    smote_like: 'smote',
    smotelike: 'smote',
  };

  const resolved = aliases[normalized] || normalized;
  return IMBALANCE_STRATEGIES.some((entry) => entry.id === resolved) ? resolved : null;
}

function getImbalanceStrategyMeta(value) {
  const normalized = normalizeImbalanceStrategy(value) || 'baseline';
  return IMBALANCE_STRATEGIES.find((entry) => entry.id === normalized) || IMBALANCE_STRATEGIES[0];
}

function createSeededRng(seed) {
  let state = hashString(seed) || 0x1a2b3c4d;
  return function nextRandom() {
    state += 0x6D2B79F5;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleWithRng(values, rng) {
  const array = Array.isArray(values) ? values.slice() : [];
  const random = typeof rng === 'function' ? rng : Math.random;
  for (let index = array.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [array[index], array[swapIndex]] = [array[swapIndex], array[index]];
  }
  return array;
}

function cloneTrainingRow(row, overrides = {}) {
  const featureValues = {
    ...((row && row.feature_values && typeof row.feature_values === 'object') ? row.feature_values : {}),
    ...((overrides.feature_values && typeof overrides.feature_values === 'object') ? overrides.feature_values : {}),
  };
  const clone = {
    ...(row || {}),
    ...overrides,
    feature_values: featureValues,
  };

  if (row && row.candidate && typeof row.candidate === 'object') {
    clone.candidate = { ...row.candidate };
  }
  if (row && row.item && typeof row.item === 'object') {
    clone.item = { ...row.item };
  }

  return clone;
}

function euclideanDistance(left, right) {
  const dimension = Math.max(Array.isArray(left) ? left.length : 0, Array.isArray(right) ? right.length : 0);
  let total = 0;
  for (let index = 0; index < dimension; index += 1) {
    const delta = (Number(left && left[index]) || 0) - (Number(right && right[index]) || 0);
    total += delta * delta;
  }
  return Math.sqrt(total);
}

function pickWeightedIndex(weights, rng) {
  const random = typeof rng === 'function' ? rng : Math.random;
  const values = Array.isArray(weights) ? weights.map((weight) => Math.max(0, Number(weight) || 0)) : [];
  const totalWeight = values.reduce((sum, value) => sum + value, 0);
  if (!values.length || totalWeight <= 0) {
    return 0;
  }

  const target = random() * totalWeight;
  let cumulative = 0;
  for (let index = 0; index < values.length; index += 1) {
    cumulative += values[index];
    if (target <= cumulative) {
      return index;
    }
  }
  return values.length - 1;
}

function pickSmoteNeighborIndex(baseIndex, vectors, rng, neighborCount) {
  const baseVector = Array.isArray(vectors) && vectors[baseIndex] ? vectors[baseIndex] : [];
  const candidates = [];

  for (let index = 0; index < (Array.isArray(vectors) ? vectors.length : 0); index += 1) {
    if (index === baseIndex) continue;
    candidates.push({
      index,
      distance: euclideanDistance(baseVector, vectors[index]),
    });
  }

  if (!candidates.length) {
    return baseIndex;
  }

  candidates.sort((left, right) => left.distance - right.distance || left.index - right.index);
  const limit = Math.max(1, Math.min(Math.floor(Number(neighborCount) || 1), candidates.length));
  const ranked = candidates.slice(0, limit);
  return ranked[Math.floor((typeof rng === 'function' ? rng() : Math.random()) * ranked.length)]?.index ?? candidates[0].index;
}

function buildSyntheticSmoteRow(baseRow, neighborRow, featureCatalog, alpha, syntheticIndex, options = {}) {
  const featureValues = {
    ...((baseRow && baseRow.feature_values && typeof baseRow.feature_values === 'object') ? baseRow.feature_values : {}),
  };
  const blend = Math.max(0, Math.min(1, Number(alpha) || 0));

  (Array.isArray(featureCatalog) ? featureCatalog : []).forEach((feature) => {
    const leftValue = baseRow && baseRow.feature_values ? baseRow.feature_values[feature.key] : undefined;
    const rightValue = neighborRow && neighborRow.feature_values ? neighborRow.feature_values[feature.key] : undefined;

    if (feature.type === 'number') {
      const leftNumber = Number(leftValue) || 0;
      const rightNumber = Number(rightValue) || 0;
      featureValues[feature.key] = roundNumber(leftNumber + ((rightNumber - leftNumber) * blend));
      return;
    }

    if (feature.type === 'boolean') {
      featureValues[feature.key] = blend < 0.5 ? !!leftValue : !!rightValue;
      return;
    }

    if (feature.type === 'categorical') {
      featureValues[feature.key] = blend < 0.5
        ? String(leftValue || '')
        : String(rightValue || leftValue || '');
    }
  });

  const baseId = String(baseRow && (baseRow.dataset_row_id || baseRow.item_id || baseRow.row_number) || 'synthetic');
  const neighborId = String(neighborRow && (neighborRow.dataset_row_id || neighborRow.item_id || neighborRow.row_number) || 'neighbor');
  return cloneTrainingRow(baseRow, {
    dataset_row_id: `${baseId}::smote::${syntheticIndex}`,
    item_id: `${String(baseRow && (baseRow.item_id || baseId) || 'item')}::smote`,
    candidate_key: `${String(baseRow && (baseRow.candidate_key || baseId) || 'candidate')}::smote::${syntheticIndex}`,
    row_number: Number(baseRow && baseRow.row_number) || (syntheticIndex + 1),
    analysis_source: 'synthetic_smote',
    synthetic_source: {
      mode: 'smote',
      source_row_id: baseId,
      neighbor_row_id: neighborId,
      alpha: roundNumber(blend, 4),
      ...((options && options.syntheticSource) || {}),
    },
    feature_values: featureValues,
  });
}

function buildWeightedBootstrapRows(rows, rng) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  if (!sourceRows.length) {
    return [];
  }

  const counts = countBinaryLabels(sourceRows);
  const positiveWeight = counts.positive > 0 ? sourceRows.length / (2 * counts.positive) : 1;
  const negativeWeight = counts.negative > 0 ? sourceRows.length / (2 * counts.negative) : 1;
  const weights = sourceRows.map((row) => (row.binary_label === 1 ? positiveWeight : negativeWeight));
  const preparedRows = [];

  for (let index = 0; index < sourceRows.length; index += 1) {
    const chosenIndex = pickWeightedIndex(weights, rng);
    const chosenRow = sourceRows[chosenIndex] || sourceRows[0];
    preparedRows.push(cloneTrainingRow(chosenRow, {
      dataset_row_id: `${String(chosenRow.dataset_row_id || chosenRow.item_id || chosenRow.row_number || 'row')}::weighted::${index}`,
      item_id: `${String(chosenRow.item_id || chosenRow.dataset_row_id || 'item')}::weighted`,
      row_number: index + 1,
      analysis_source: 'weighted_bootstrap',
      synthetic_source: {
        mode: 'class_weighted',
        source_row_id: String(chosenRow.dataset_row_id || chosenRow.item_id || chosenRow.row_number || ''),
      },
    }));
  }

  return preparedRows;
}

function summarizeImbalancePreparation(sourceRows, preparedRows, strategy, options = {}) {
  const sourceCounts = countBinaryLabels(sourceRows);
  const preparedCounts = countBinaryLabels(preparedRows);
  const sourceLabeled = sourceCounts.positive + sourceCounts.negative;
  const preparedLabeled = preparedCounts.positive + preparedCounts.negative;
  const sourceMinority = Math.min(sourceCounts.positive, sourceCounts.negative);
  const sourceMajority = Math.max(sourceCounts.positive, sourceCounts.negative);
  const preparedMinority = Math.min(preparedCounts.positive, preparedCounts.negative);
  const preparedMajority = Math.max(preparedCounts.positive, preparedCounts.negative);
  const normalizedStrategy = normalizeImbalanceStrategy(strategy) || 'baseline';
  const meta = getImbalanceStrategyMeta(normalizedStrategy);

  return {
    id: normalizedStrategy,
    title: meta.title,
    description: meta.description,
    algorithm: options.algorithm || null,
    class_weighting: !!options.classWeighting,
    class_weighting_effective: !!options.classWeightingEffective,
    fallback: options.fallback || null,
    nearest_neighbors: options.nearestNeighbors || null,
    original_row_count: Array.isArray(sourceRows) ? sourceRows.length : 0,
    prepared_row_count: Array.isArray(preparedRows) ? preparedRows.length : 0,
    original_label_counts: sourceCounts,
    prepared_label_counts: preparedCounts,
    original_labeled_count: sourceLabeled,
    prepared_labeled_count: preparedLabeled,
    original_imbalance_ratio: sourceMinority > 0 ? roundNumber(sourceMajority / sourceMinority) : null,
    prepared_imbalance_ratio: preparedMinority > 0 ? roundNumber(preparedMajority / preparedMinority) : null,
    synthetic_row_count: Math.max(0, (Array.isArray(preparedRows) ? preparedRows.length : 0) - (Array.isArray(sourceRows) ? sourceRows.length : 0)),
    balancing_mode: normalizedStrategy === 'class_weighted' && !options.classWeightingEffective
      ? 'weighted_bootstrap'
      : normalizedStrategy,
  };
}

function prepareImbalanceTrainingRows(rows, featureCatalog, vectorizer, strategy, options = {}) {
  const sourceRows = (Array.isArray(rows) ? rows : []).filter((row) => row && (row.binary_label === 0 || row.binary_label === 1));
  const normalizedStrategy = normalizeImbalanceStrategy(strategy) || 'baseline';
  const algorithm = normalizeTrainingAlgorithm(options.algorithm);
  const seed = [
    options.seed || '',
    normalizedStrategy,
    algorithm || 'logistic_regression',
    sourceRows.length,
    countBinaryLabels(sourceRows).positive,
    countBinaryLabels(sourceRows).negative,
  ].join('|');
  const rng = createSeededRng(seed);
  const counts = countBinaryLabels(sourceRows);
  const positiveRows = sourceRows.filter((row) => row.binary_label === 1);
  const negativeRows = sourceRows.filter((row) => row.binary_label === 0);
  const minorityLabel = counts.positive <= counts.negative ? 1 : 0;
  const majorityLabel = minorityLabel === 1 ? 0 : 1;
  const minorityRows = minorityLabel === 1 ? positiveRows : negativeRows;
  const majorityRows = majorityLabel === 1 ? positiveRows : negativeRows;
  let preparedRows = sourceRows.map((row) => cloneTrainingRow(row));
  let classWeighting = false;
  let classWeightingEffective = false;
  let fallback = null;
  let nearestNeighbors = null;

  if (!sourceRows.length) {
    return {
      rows: [],
      classWeighting: false,
      summary: summarizeImbalancePreparation(sourceRows, [], normalizedStrategy, {
        algorithm,
      }),
    };
  }

  if (normalizedStrategy === 'class_weighted') {
    if (algorithm === 'logistic_regression') {
      classWeighting = true;
      classWeightingEffective = true;
    } else if (sourceCounts.positive !== sourceCounts.negative) {
      preparedRows = buildWeightedBootstrapRows(sourceRows, rng);
    }
  } else if (normalizedStrategy === 'undersample') {
    if (minorityRows.length && majorityRows.length > minorityRows.length) {
      const trimmedMajority = shuffleWithRng(majorityRows, rng).slice(0, minorityRows.length);
      preparedRows = shuffleWithRng(
        minorityRows.concat(trimmedMajority).map((row) => cloneTrainingRow(row)),
        rng,
      );
    }
  } else if (normalizedStrategy === 'oversample') {
    if (minorityRows.length && majorityRows.length > minorityRows.length) {
      preparedRows = sourceRows.map((row) => cloneTrainingRow(row));
      let syntheticIndex = 0;
      let minorityCount = minorityRows.length;
      while (minorityCount < majorityRows.length) {
        const sourceRow = minorityRows[Math.floor(rng() * minorityRows.length)] || minorityRows[0];
        preparedRows.push(cloneTrainingRow(sourceRow, {
          dataset_row_id: `${String(sourceRow.dataset_row_id || sourceRow.item_id || sourceRow.row_number || 'row')}::oversample::${syntheticIndex}`,
          item_id: `${String(sourceRow.item_id || sourceRow.dataset_row_id || 'item')}::oversample`,
          candidate_key: `${String(sourceRow.candidate_key || sourceRow.dataset_row_id || 'candidate')}::oversample::${syntheticIndex}`,
          row_number: Number(sourceRow.row_number) || (syntheticIndex + 1),
          analysis_source: 'synthetic_oversample',
          synthetic_source: {
            mode: 'oversample',
            source_row_id: String(sourceRow.dataset_row_id || sourceRow.item_id || sourceRow.row_number || ''),
          },
        }));
        minorityCount += 1;
        syntheticIndex += 1;
      }
      preparedRows = shuffleWithRng(preparedRows, rng);
    }
  } else if (normalizedStrategy === 'smote') {
    if (minorityRows.length >= 2 && majorityRows.length > minorityRows.length) {
      const minorityVectors = transformRows(minorityRows, vectorizer);
      preparedRows = sourceRows.map((row) => cloneTrainingRow(row));
      let syntheticIndex = 0;
      let minorityCount = minorityRows.length;
      nearestNeighbors = Math.min(5, minorityRows.length - 1);
      while (minorityCount < majorityRows.length) {
        const baseIndex = Math.floor(rng() * minorityRows.length);
        const neighborIndex = pickSmoteNeighborIndex(baseIndex, minorityVectors, rng, nearestNeighbors);
        const baseRow = minorityRows[baseIndex] || minorityRows[0];
        const neighborRow = minorityRows[neighborIndex] || minorityRows[(baseIndex + 1) % minorityRows.length] || baseRow;
        preparedRows.push(buildSyntheticSmoteRow(baseRow, neighborRow, featureCatalog, rng(), syntheticIndex, {
          syntheticSource: {
            base_index: baseIndex,
            neighbor_index: neighborIndex,
          },
        }));
        minorityCount += 1;
        syntheticIndex += 1;
      }
      preparedRows = shuffleWithRng(preparedRows, rng);
    } else if (minorityRows.length && majorityRows.length > minorityRows.length) {
      fallback = 'oversample';
      preparedRows = sourceRows.map((row) => cloneTrainingRow(row));
      let syntheticIndex = 0;
      let minorityCount = minorityRows.length;
      while (minorityCount < majorityRows.length) {
        const sourceRow = minorityRows[Math.floor(rng() * minorityRows.length)] || minorityRows[0];
        preparedRows.push(cloneTrainingRow(sourceRow, {
          dataset_row_id: `${String(sourceRow.dataset_row_id || sourceRow.item_id || sourceRow.row_number || 'row')}::smote-fallback::${syntheticIndex}`,
          item_id: `${String(sourceRow.item_id || sourceRow.dataset_row_id || 'item')}::smote-fallback`,
          candidate_key: `${String(sourceRow.candidate_key || sourceRow.dataset_row_id || 'candidate')}::smote-fallback::${syntheticIndex}`,
          row_number: Number(sourceRow.row_number) || (syntheticIndex + 1),
          analysis_source: 'synthetic_smote_fallback',
          synthetic_source: {
            mode: 'smote_fallback_oversample',
            source_row_id: String(sourceRow.dataset_row_id || sourceRow.item_id || sourceRow.row_number || ''),
          },
        }));
        minorityCount += 1;
        syntheticIndex += 1;
      }
      preparedRows = shuffleWithRng(preparedRows, rng);
    }
  }

  return {
    rows: preparedRows,
    classWeighting,
    summary: summarizeImbalancePreparation(sourceRows, preparedRows, normalizedStrategy, {
      algorithm,
      classWeighting,
      classWeightingEffective,
      fallback,
      nearestNeighbors,
    }),
  };
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

function summarizeLatestModelArtifact(artifact) {
  if (!artifact) {
    return null;
  }

  const summary = summarizeArtifact(artifact);
  const evaluation = artifact.evaluation || null;
  const reliance = artifact.reliance || {};

  return {
    ...summary,
    dataset_summary: artifact.dataset_summary || summary.dataset_summary || null,
    split: artifact.split || null,
    imbalance_strategy: artifact.imbalance_strategy || null,
    training_counts: artifact.training_counts || null,
    evaluation: evaluation ? {
      train: evaluation.train || null,
      test: evaluation.test || null,
    } : null,
    reliance: {
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

function buildLabelBalanceSummary(datasetSummary = {}) {
  const positive = Math.max(0, Number(datasetSummary.positive_candidate_count) || 0);
  const negative = Math.max(0, Number(datasetSummary.negative_candidate_count) || 0);
  const uncertain = Math.max(0, Number(datasetSummary.uncertain_candidate_count) || 0);
  const unlabeled = Math.max(0, Number(datasetSummary.unlabeled_candidate_count) || 0);
  const totalCandidates = Math.max(0, Number(datasetSummary.candidate_count) || 0);
  const labeledCandidates = positive + negative;
  const minorityCount = Math.min(positive, negative);
  const majorityCount = Math.max(positive, negative);
  const positiveShare = labeledCandidates ? roundNumber(positive / labeledCandidates) : 0;
  const negativeShare = labeledCandidates ? roundNumber(negative / labeledCandidates) : 0;
  const labeledShare = totalCandidates ? roundNumber(labeledCandidates / totalCandidates) : 0;
  const uncertainShare = totalCandidates ? roundNumber(uncertain / totalCandidates) : 0;
  const unlabeledShare = totalCandidates ? roundNumber(unlabeled / totalCandidates) : 0;
  const imbalanceRatio = minorityCount > 0 ? roundNumber(majorityCount / minorityCount) : null;

  return {
    total_candidates: totalCandidates,
    labeled_candidates: labeledCandidates,
    positive_count: positive,
    negative_count: negative,
    uncertain_count: uncertain,
    unlabeled_count: unlabeled,
    labeled_share: labeledShare,
    uncertain_share: uncertainShare,
    unlabeled_share: unlabeledShare,
    positive_share: positiveShare,
    negative_share: negativeShare,
    imbalance_ratio: imbalanceRatio,
    is_single_class: !positive || !negative,
    minority_label: positive === negative
      ? null
      : (positive < negative ? 'comment_region' : 'not_comment_region'),
    majority_label: positive === negative
      ? null
      : (positive > negative ? 'comment_region' : 'not_comment_region'),
    minority_share: labeledCandidates ? roundNumber(minorityCount / labeledCandidates) : 0,
    slices: [
      {
        key: 'positive',
        label: 'comment_region',
        value: positive,
        color: '#2f7d57',
        meta: `${positive} labeled`,
      },
      {
        key: 'negative',
        label: 'not_comment_region',
        value: negative,
        color: '#b85a47',
        meta: `${negative} labeled`,
      },
      {
        key: 'uncertain',
        label: 'uncertain',
        value: uncertain,
        color: '#b8892e',
        meta: `${uncertain} uncertain`,
      },
      {
        key: 'unlabeled',
        label: 'unlabeled',
        value: unlabeled,
        color: '#8d6f4d',
        meta: `${unlabeled} unlabeled`,
      },
    ],
  };
}

function buildModelProgression(models, options = {}) {
  const limit = Math.max(1, Number(options.limit) || 8);
  const selectedModels = Array.isArray(models)
    ? models.slice(0, limit).slice().reverse()
    : [];
  const points = selectedModels.map((model, index) => {
    const evaluation = model && model.evaluation ? model.evaluation : null;
    const candidateMetrics = (evaluation && evaluation.test && evaluation.test.candidate_metrics)
      || (evaluation && evaluation.train && evaluation.train.candidate_metrics)
      || null;

    return {
      id: model && model.id ? model.id : null,
      created_at: model && model.created_at ? model.created_at : null,
      label: model && model.created_at
        ? new Date(model.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        : `Run ${index + 1}`,
      variant_id: model && model.variant_id ? model.variant_id : null,
      variant_title: model && model.variant_title ? model.variant_title : null,
      algorithm: model && model.algorithm ? model.algorithm : null,
      imbalance_strategy: model && model.imbalance_strategy ? {
        id: model.imbalance_strategy.id || null,
        title: model.imbalance_strategy.title || null,
      } : null,
      candidate_count: model && model.dataset_summary ? Number(model.dataset_summary.candidate_count) || 0 : 0,
      labeled_count: model && model.dataset_summary ? Number(model.dataset_summary.labeled_candidate_count) || 0 : 0,
      precision: candidateMetrics && candidateMetrics.precision != null ? candidateMetrics.precision : null,
      recall: candidateMetrics && candidateMetrics.recall != null ? candidateMetrics.recall : null,
      f1: candidateMetrics && candidateMetrics.f1 != null ? candidateMetrics.f1 : null,
      roc_auc: candidateMetrics && candidateMetrics.roc_auc != null ? candidateMetrics.roc_auc : null,
      pr_auc: candidateMetrics && candidateMetrics.pr_auc != null ? candidateMetrics.pr_auc : null,
      threshold: candidateMetrics && candidateMetrics.threshold != null ? candidateMetrics.threshold : null,
    };
  });

  const latest = points.length ? points[points.length - 1] : null;
  const first = points.length ? points[0] : null;

  function delta(metricKey) {
    const latestValue = Number(latest && latest[metricKey]) || 0;
    const firstValue = Number(first && first[metricKey]) || 0;
    return roundNumber(latestValue - firstValue);
  }

  return {
    points,
    latest,
    first,
    trend: points.length > 1 ? {
      f1_delta: delta('f1'),
      precision_delta: delta('precision'),
      recall_delta: delta('recall'),
      roc_auc_delta: delta('roc_auc'),
      pr_auc_delta: delta('pr_auc'),
    } : null,
  };
}

function buildModelGuidance(balanceSummary, latestModel, progression) {
  const guidance = [];
  const labeledCandidates = Number(balanceSummary && balanceSummary.labeled_candidates) || 0;
  const imbalanceRatio = balanceSummary && Number.isFinite(Number(balanceSummary.imbalance_ratio))
    ? Number(balanceSummary.imbalance_ratio)
    : null;
  const latestEvaluation = latestModel
    && latestModel.evaluation
    && ((latestModel.evaluation.test && latestModel.evaluation.test.candidate_metrics)
      || (latestModel.evaluation.train && latestModel.evaluation.train.candidate_metrics))
    || null;
  const familyImportance = Array.isArray(latestModel && latestModel.reliance && latestModel.reliance.family_importance)
    ? latestModel.reliance.family_importance
    : [];
  const totalFamilyWeight = familyImportance.reduce((sum, entry) => sum + (Number(entry.total_absolute_weight) || 0), 0);
  const topFamilyWeight = familyImportance.length ? Number(familyImportance[0].total_absolute_weight) || 0 : 0;
  const topFamilyShare = totalFamilyWeight > 0 ? roundNumber(topFamilyWeight / totalFamilyWeight) : 0;

  if (!labeledCandidates) {
    guidance.push({
      tone: 'warn',
      title: 'No binary labels yet',
      body: 'Collect at least one positive and one negative candidate before training. The monitor can still show structure, but the model cannot learn a separator yet.',
    });
  } else if (labeledCandidates < 20) {
    guidance.push({
      tone: 'warn',
      title: 'Label volume is still small',
      body: 'You have fewer than 20 binary labels. Keep labeling before leaning on resampling or neighbor-based methods.',
    });
  }

  if (imbalanceRatio && imbalanceRatio >= 3) {
    guidance.push({
      tone: 'warn',
      title: 'Minority class is underrepresented',
      body: `The class split is about ${imbalanceRatio}:1. Class weights, targeted labeling, or SMOTE-style oversampling can help once the minority class has enough clean examples.`,
    });
  }

  if (latestModel && latestModel.imbalance_strategy && latestModel.imbalance_strategy.id === 'baseline' && imbalanceRatio && imbalanceRatio >= 3) {
    guidance.push({
      tone: 'info',
      title: 'Run an imbalance comparison',
      body: 'Baseline is useful as a control, but you now have in-memory class weighting, undersampling, oversampling, and SMOTE-like synthesis available for side-by-side comparison.',
    });
  }

  if (balanceSummary && balanceSummary.uncertain_share >= 0.15) {
    guidance.push({
      tone: 'info',
      title: 'Uncertain labels are high',
      body: 'Review uncertain candidates before retraining. Ambiguous labels can confuse both KNN-style methods and tree-based models.',
    });
  }

  if (latestEvaluation) {
    const precision = Number(latestEvaluation.precision) || 0;
    const recall = Number(latestEvaluation.recall) || 0;
    const f1 = Number(latestEvaluation.f1) || 0;
    const rocAuc = latestEvaluation.roc_auc;
    const prAuc = latestEvaluation.pr_auc;

    if (precision > recall + 0.15) {
      guidance.push({
        tone: 'info',
        title: 'Model is conservative',
        body: 'Precision is ahead of recall. Lowering the decision threshold or collecting more positive labels may improve recall.',
      });
    } else if (recall > precision + 0.15) {
      guidance.push({
        tone: 'info',
        title: 'Model is broad',
        body: 'Recall is ahead of precision. More negative labels or a stricter threshold can reduce false positives.',
      });
    }

    if (f1 && latestModel && latestModel.evaluation && latestModel.evaluation.test && latestModel.evaluation.train) {
      const trainF1 = Number(latestModel.evaluation.train.candidate_metrics && latestModel.evaluation.train.candidate_metrics.f1) || 0;
      const testF1 = Number(latestModel.evaluation.test.candidate_metrics && latestModel.evaluation.test.candidate_metrics.f1) || 0;
      if (trainF1 - testF1 > 0.12) {
        guidance.push({
          tone: 'warn',
          title: 'Possible overfitting',
          body: 'Train F1 is noticeably ahead of test F1. Review feature concentration, reduce noise, or add more labels before making stronger assumptions.',
        });
      }
    }

    if (rocAuc != null || prAuc != null) {
      guidance.push({
        tone: 'good',
        title: 'Latest evaluation snapshot',
        body: `Precision ${precision}, recall ${recall}, F1 ${f1}${rocAuc != null ? `, ROC AUC ${rocAuc}` : ''}${prAuc != null ? `, PR AUC ${prAuc}` : ''}.`,
      });
    }
  }

  if (topFamilyShare >= 0.6) {
    guidance.push({
      tone: 'warn',
      title: 'Feature reliance is concentrated',
      body: `The strongest feature family accounts for about ${(topFamilyShare * 100).toFixed(0)}% of the current absolute importance. That is workable, but it is worth watching for narrow shortcuts.`,
    });
  }

  if (!guidance.length) {
    guidance.push({
      tone: 'good',
      title: 'Training signal looks usable',
      body: 'The current label mix is reasonable. Use the feature chart to confirm that the model is leaning on meaningful families instead of one brittle shortcut.',
    });
  }

  guidance.push({
    tone: 'info',
    title: 'SMOTE and KNN, in practice',
    body: 'SMOTE creates synthetic minority examples from nearby neighbors. KNN-style methods work best when feature scaling is sensible and the minority class has enough clean neighbors to describe a real local pattern.',
  });

  if (progression && Array.isArray(progression.points) && progression.points.length > 1 && progression.trend) {
    guidance.push({
      tone: 'info',
      title: 'Model progression',
      body: `Across the latest ${progression.points.length} run(s), F1 changed by ${progression.trend.f1_delta}, ROC AUC by ${progression.trend.roc_auc_delta}, and PR AUC by ${progression.trend.pr_auc_delta}.`,
    });
  }

  return guidance;
}

async function buildModelInsights(datasetSummary, models, artifactRoot, options = {}) {
  const balance = buildLabelBalanceSummary(datasetSummary);
  const progression = buildModelProgression(models, {
    limit: options.progressionLimit || 8,
  });
  const latestSummary = Array.isArray(models) && models.length ? models[0] : null;
  let latestArtifact = null;
  if (latestSummary) {
    try {
      latestArtifact = await loadModelArtifact(artifactRoot, latestSummary.id);
    } catch (_) {
      latestArtifact = null;
    }
  }
  const latestModel = summarizeLatestModelArtifact(latestArtifact);
  const featureInsights = latestModel && latestModel.reliance
    ? {
      family_importance: Array.isArray(latestModel.reliance.family_importance)
        ? latestModel.reliance.family_importance.slice(0, 8)
        : [],
      positive_weights: Array.isArray(latestModel.reliance.positive_weights)
        ? latestModel.reliance.positive_weights.slice(0, 10)
        : [],
      negative_weights: Array.isArray(latestModel.reliance.negative_weights)
        ? latestModel.reliance.negative_weights.slice(0, 10)
        : [],
      feature_importances: Array.isArray(latestModel.reliance.feature_importances)
        ? latestModel.reliance.feature_importances.slice(0, 15)
        : [],
    }
    : {
      family_importance: [],
      positive_weights: [],
      negative_weights: [],
      feature_importances: [],
    };

  return {
    dataset_balance: balance,
    progression,
    latest_model: latestModel,
    feature_insights: featureInsights,
    guidance: buildModelGuidance(balance, latestModel, progression),
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
  const normalizedAlgorithm = normalizeTrainingAlgorithm(trainingInput.algorithm);
  if (!normalizedAlgorithm) {
    throw new Error('Select a valid training algorithm');
  }
  const hasExplicitStrategy = String(trainingInput.imbalanceStrategy || '').trim().length > 0;
  const normalizedStrategy = normalizeImbalanceStrategy(trainingInput.imbalanceStrategy) || 'baseline';
  if (hasExplicitStrategy && !normalizeImbalanceStrategy(trainingInput.imbalanceStrategy)) {
    throw new Error('Select a valid imbalance strategy');
  }
  const trainingPreparation = prepareImbalanceTrainingRows(
    split.trainRows,
    dataset.featureCatalog,
    vectorizer,
    normalizedStrategy,
    {
      algorithm: normalizedAlgorithm,
      seed: trainingInput.seed || `${variant.id}:${normalizedAlgorithm}:${normalizedStrategy}:${labeledRows.length}`,
    },
  );
  const preparedTrainRows = Array.isArray(trainingPreparation.rows) ? trainingPreparation.rows : split.trainRows;
  const trainVectors = transformRows(preparedTrainRows, vectorizer);
  const trainLabels = preparedTrainRows.map((row) => row.binary_label);

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

  const model = trainModelByAlgorithm(normalizedAlgorithm, trainVectors, trainLabels, {
    ...(trainingInput.trainingOptions || {}),
    classWeighting: trainingPreparation.classWeighting,
  });
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
    imbalance_strategy: trainingPreparation.summary,
    created_at: new Date().toISOString(),
    feature_count: dataset.featureCatalog.length,
    feature_catalog: dataset.featureCatalog,
    vectorizer,
    model,
    split: summarizeSplit(split, labeledRows.length),
    training_counts: {
      total_labeled_rows: labeledRows.length,
      train_rows: split.trainRows.length,
      effective_train_rows: preparedTrainRows.length,
      test_rows: split.testRows.length,
      train_label_counts: countBinaryLabels(split.trainRows),
      effective_train_label_counts: countBinaryLabels(preparedTrainRows),
      test_label_counts: countBinaryLabels(split.testRows),
    },
    dataset_summary: dataset.summary,
    evaluation,
    reliance,
  };

  const persistArtifact = trainingInput.persistArtifact !== false;
  if (persistArtifact) {
    const artifactPath = await saveModelArtifact(artifactRoot, artifact);
    artifact.file_path = artifactPath;
  } else {
    artifact.file_path = '';
  }

  emitProgress(progress, {
    stage: 'training',
    message: persistArtifact
      ? `Saved model artifact ${artifact.id}`
      : `Prepared comparison run ${artifact.id}`,
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

async function compareImbalanceStrategies(items, artifactRoot, trainingInput = {}) {
  const requestedStrategies = Array.isArray(trainingInput.strategies)
    ? trainingInput.strategies
    : String(trainingInput.strategies || '')
      .split(',')
      .map((entry) => String(entry || '').trim())
      .filter(Boolean);
  const normalizedRequestedStrategies = requestedStrategies
    .map((strategy) => normalizeImbalanceStrategy(strategy))
    .filter(Boolean);
  const compareStrategyIds = normalizedRequestedStrategies.length
    ? normalizedRequestedStrategies
    : listImbalanceStrategies().map((entry) => entry.id);
  const focusStrategy = normalizeImbalanceStrategy(trainingInput.imbalanceStrategy) || 'baseline';
  const runs = [];

  for (const strategyId of compareStrategyIds) {
    const trained = await trainModel(items, artifactRoot, {
      ...trainingInput,
      imbalanceStrategy: strategyId,
      persistArtifact: false,
      progress: null,
    });
    const summary = trained && trained.summary ? trained.summary : summarizeArtifact(trained && trained.artifact);
    runs.push({
      strategy_id: strategyId,
      strategy: getImbalanceStrategyMeta(strategyId),
      summary,
      evaluation: summary ? summary.evaluation || null : null,
      training_counts: summary ? summary.training_counts || null : null,
    });
  }

  const metricValue = (run, sectionName, metricName) => {
    const evaluation = run && run.evaluation ? run.evaluation : null;
    const chosenSet = evaluation && evaluation.test
      ? evaluation.test
      : evaluation && evaluation.train
        ? evaluation.train
        : null;
    const section = chosenSet && chosenSet[sectionName] ? chosenSet[sectionName] : null;
    const value = section && section[metricName] !== undefined ? section[metricName] : null;
    return Number.isFinite(Number(value)) ? Number(value) : null;
  };

  const bestByMetric = (sectionName, metricName) => {
    let bestRun = null;
    let bestValue = -Infinity;
    runs.forEach((run) => {
      const value = metricValue(run, sectionName, metricName);
      if (value === null) {
        return;
      }
      if (value > bestValue) {
        bestValue = value;
        bestRun = run;
      }
    });

    return bestRun ? {
      strategy_id: bestRun.strategy_id,
      strategy: bestRun.strategy,
      value: roundNumber(bestValue, 4),
    } : null;
  };

  return {
    focus_strategy: focusStrategy,
    strategies: listImbalanceStrategies(),
    runs,
    leaderboard: {
      precision: bestByMetric('candidate_metrics', 'precision'),
      recall: bestByMetric('candidate_metrics', 'recall'),
      f1: bestByMetric('candidate_metrics', 'f1'),
      top_1_accuracy: bestByMetric('ranking_metrics', 'top_1_accuracy'),
    },
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
  const progress = typeof options.progress === 'function' ? options.progress : null;
  const progressInterval = Math.max(1, Number(options.progressInterval) || 100);

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

  emitProgress(progress, {
    stage: 'scoring',
    message: candidateRows.length
      ? `Scoring ${candidateRows.length} live candidate row(s)`
      : 'No live candidate rows to score',
    progress: {
      current: 0,
      total: candidateRows.length || 1,
      unit: 'rows',
      indeterminate: candidateRows.length === 0,
    },
  });

  const scoredRows = candidateRows.length
    ? scoreRows(candidateRows, artifact, {
      includeExplanations: options.includeExplanations !== false,
      threshold: options.threshold,
      progress,
      progressInterval,
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

  emitProgress(progress, {
    stage: 'scoring',
    message: `Scored ${scoredItems.length} live item(s)`,
    progress: {
      current: scoredItems.length,
      total: scoredItems.length || 1,
      unit: 'items',
      indeterminate: false,
    },
  });

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
  listImbalanceStrategies,
  normalizeImbalanceStrategy,
  trainModel,
  compareImbalanceStrategies,
  getModelDetails,
  buildRuntimeModelBundle,
  scoreJobItems,
  scoreSiteGroups,
  scoreLiveUrlProbe,
  exportDataset,
};
