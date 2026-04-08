'use strict';

const { roundNumber } = require('./utils');

function numberOption(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function average(values) {
  if (!Array.isArray(values) || !values.length) return 0;
  return values.reduce((sum, value) => sum + (Number(value) || 0), 0) / values.length;
}

function giniImpurity(labels) {
  const n = Array.isArray(labels) ? labels.length : 0;
  if (!n) return 0;
  const positives = labels.reduce((sum, label) => sum + (label === 1 ? 1 : 0), 0);
  const p = positives / n;
  return 1 - (p * p) - ((1 - p) * (1 - p));
}

function squaredError(values) {
  const n = Array.isArray(values) ? values.length : 0;
  if (!n) return 0;
  const total = values.reduce((sum, value) => sum + (Number(value) || 0), 0);
  const totalSquares = values.reduce((sum, value) => {
    const numeric = Number(value) || 0;
    return sum + (numeric * numeric);
  }, 0);
  return totalSquares - ((total * total) / n);
}

function leafProbability(labels) {
  if (!Array.isArray(labels) || !labels.length) return 0;
  return labels.reduce((sum, label) => sum + (label === 1 ? 1 : 0), 0) / labels.length;
}

function leafValue(values) {
  return average(values);
}

function shuffle(values) {
  const array = Array.isArray(values) ? values.slice() : [];
  for (let index = array.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [array[index], array[swapIndex]] = [array[swapIndex], array[index]];
  }
  return array;
}

function chooseFeatureSubset(dimension, requestedCount) {
  const size = Math.max(1, Math.min(dimension, Math.floor(numberOption(requestedCount, dimension))));
  const indices = Array.from({ length: dimension }, (_, index) => index);
  if (size >= dimension) return indices;
  return shuffle(indices).slice(0, size);
}

function partitionVectors(vectors, values, featureIndex, threshold) {
  const leftVectors = [];
  const leftValues = [];
  const rightVectors = [];
  const rightValues = [];

  for (let index = 0; index < vectors.length; index += 1) {
    if ((Number(vectors[index][featureIndex]) || 0) <= threshold) {
      leftVectors.push(vectors[index]);
      leftValues.push(values[index]);
    } else {
      rightVectors.push(vectors[index]);
      rightValues.push(values[index]);
    }
  }

  return {
    leftVectors,
    leftValues,
    rightVectors,
    rightValues,
  };
}

function findBestClassificationSplit(vectors, labels, featureIndices) {
  const n = Array.isArray(labels) ? labels.length : 0;
  const parentImpurity = giniImpurity(labels);
  const totalPositives = labels.reduce((sum, label) => sum + (label === 1 ? 1 : 0), 0);
  let leftPositives = 0;
  let leftCount = 0;
  let rightPositives = totalPositives;
  let rightCount = n;
  let bestFeature = -1;
  let bestThreshold = 0;
  let bestGain = 0;

  for (const featureIndex of featureIndices) {
    const indexed = vectors.map((vector, index) => ({
      value: Number(vector[featureIndex]) || 0,
      label: labels[index],
    })).sort((left, right) => left.value - right.value);

    leftPositives = 0;
    leftCount = 0;
    rightPositives = totalPositives;
    rightCount = n;

    for (let split = 0; split < n - 1; split += 1) {
      const current = indexed[split];
      const next = indexed[split + 1];

      leftCount += 1;
      rightCount -= 1;
      if (current.label === 1) {
        leftPositives += 1;
        rightPositives -= 1;
      }

      if (next.value === current.value) continue;

      const leftRatio = leftCount ? leftPositives / leftCount : 0;
      const rightRatio = rightCount ? rightPositives / rightCount : 0;
      const leftGini = 1 - (leftRatio * leftRatio) - ((1 - leftRatio) * (1 - leftRatio));
      const rightGini = 1 - (rightRatio * rightRatio) - ((1 - rightRatio) * (1 - rightRatio));
      const gain = parentImpurity - ((leftCount / n) * leftGini) - ((rightCount / n) * rightGini);

      if (gain > bestGain) {
        bestGain = gain;
        bestFeature = featureIndex;
        bestThreshold = (current.value + next.value) / 2;
      }
    }
  }

  return {
    featureIndex: bestFeature,
    threshold: bestThreshold,
    gain: bestGain,
  };
}

function findBestRegressionSplit(vectors, targets, featureIndices) {
  const n = Array.isArray(targets) ? targets.length : 0;
  const parentError = squaredError(targets);
  const totalSum = targets.reduce((sum, value) => sum + (Number(value) || 0), 0);
  const totalSquares = targets.reduce((sum, value) => {
    const numeric = Number(value) || 0;
    return sum + (numeric * numeric);
  }, 0);
  let bestFeature = -1;
  let bestThreshold = 0;
  let bestGain = 0;

  for (const featureIndex of featureIndices) {
    const indexed = vectors.map((vector, index) => ({
      value: Number(vector[featureIndex]) || 0,
      target: Number(targets[index]) || 0,
    })).sort((left, right) => left.value - right.value);

    let leftCount = 0;
    let leftSum = 0;
    let leftSquares = 0;
    let rightCount = n;
    let rightSum = totalSum;
    let rightSquares = totalSquares;

    for (let split = 0; split < n - 1; split += 1) {
      const current = indexed[split];
      const next = indexed[split + 1];

      leftCount += 1;
      rightCount -= 1;
      leftSum += current.target;
      leftSquares += current.target * current.target;
      rightSum -= current.target;
      rightSquares -= current.target * current.target;

      if (next.value === current.value) continue;

      const leftError = leftCount ? leftSquares - ((leftSum * leftSum) / leftCount) : 0;
      const rightError = rightCount ? rightSquares - ((rightSum * rightSum) / rightCount) : 0;
      const gain = parentError - leftError - rightError;

      if (gain > bestGain) {
        bestGain = gain;
        bestFeature = featureIndex;
        bestThreshold = (current.value + next.value) / 2;
      }
    }
  }

  return {
    featureIndex: bestFeature,
    threshold: bestThreshold,
    gain: bestGain,
  };
}

function buildClassificationTree(vectors, labels, options = {}, depth = 0, featureImportances) {
  const dimension = vectors[0].length;
  const maxDepth = Math.max(1, Math.floor(numberOption(options.maxDepth, 6)));
  const minSamplesSplit = Math.max(2, Math.floor(numberOption(options.minSamplesSplit, 4)));
  const minGain = Math.max(0, numberOption(options.minGain, 1e-8));
  const featureSubsampleSize = Math.max(
    1,
    Math.min(dimension, Math.floor(numberOption(options.featureSubsampleSize, dimension))),
  );

  const positiveCount = labels.reduce((sum, label) => sum + (label === 1 ? 1 : 0), 0);
  const probability = leafProbability(labels);
  const node = {
    leaf: true,
    probability,
    n: labels.length,
    positive_count: positiveCount,
    negative_count: labels.length - positiveCount,
  };

  if (
    depth >= maxDepth
    || labels.length < minSamplesSplit
    || giniImpurity(labels) <= 1e-12
  ) {
    return node;
  }

  const featureIndices = chooseFeatureSubset(dimension, featureSubsampleSize);
  const { featureIndex, threshold, gain } = findBestClassificationSplit(vectors, labels, featureIndices);

  if (featureIndex < 0 || gain <= minGain) {
    return node;
  }

  const { leftVectors, leftValues: leftLabels, rightVectors, rightValues: rightLabels } = partitionVectors(
    vectors,
    labels,
    featureIndex,
    threshold,
  );

  if (!leftVectors.length || !rightVectors.length) {
    return node;
  }

  if (Array.isArray(featureImportances)) {
    featureImportances[featureIndex] = (featureImportances[featureIndex] || 0) + (gain * labels.length);
  }

  return {
    leaf: false,
    probability,
    n: labels.length,
    positive_count: positiveCount,
    negative_count: labels.length - positiveCount,
    featureIndex,
    threshold,
    gain,
    left: buildClassificationTree(leftVectors, leftLabels, options, depth + 1, featureImportances),
    right: buildClassificationTree(rightVectors, rightLabels, options, depth + 1, featureImportances),
  };
}

function buildRegressionTree(vectors, targets, options = {}, depth = 0, featureImportances) {
  const dimension = vectors[0].length;
  const maxDepth = Math.max(1, Math.floor(numberOption(options.maxDepth, 3)));
  const minSamplesSplit = Math.max(2, Math.floor(numberOption(options.minSamplesSplit, 4)));
  const minGain = Math.max(0, numberOption(options.minGain, 1e-8));
  const featureSubsampleSize = Math.max(
    1,
    Math.min(dimension, Math.floor(numberOption(options.featureSubsampleSize, dimension))),
  );

  const value = leafValue(targets);
  const node = {
    leaf: true,
    value,
    n: targets.length,
  };

  if (
    depth >= maxDepth
    || targets.length < minSamplesSplit
    || squaredError(targets) <= 1e-12
  ) {
    return node;
  }

  const featureIndices = chooseFeatureSubset(dimension, featureSubsampleSize);
  const { featureIndex, threshold, gain } = findBestRegressionSplit(vectors, targets, featureIndices);

  if (featureIndex < 0 || gain <= minGain) {
    return node;
  }

  const { leftVectors, leftValues: leftTargets, rightVectors, rightValues: rightTargets } = partitionVectors(
    vectors,
    targets,
    featureIndex,
    threshold,
  );

  if (!leftVectors.length || !rightVectors.length) {
    return node;
  }

  if (Array.isArray(featureImportances)) {
    featureImportances[featureIndex] = (featureImportances[featureIndex] || 0) + (gain * targets.length);
  }

  return {
    leaf: false,
    value,
    n: targets.length,
    featureIndex,
    threshold,
    gain,
    left: buildRegressionTree(leftVectors, leftTargets, options, depth + 1, featureImportances),
    right: buildRegressionTree(rightVectors, rightTargets, options, depth + 1, featureImportances),
  };
}

function predictClassificationTree(node, vector) {
  if (!node) return 0.5;
  if (node.leaf || !node.left || !node.right) return Number(node.probability) || 0;
  if ((Number(vector[node.featureIndex]) || 0) <= node.threshold) {
    return predictClassificationTree(node.left, vector);
  }
  return predictClassificationTree(node.right, vector);
}

function predictRegressionTree(node, vector) {
  if (!node) return 0;
  if (node.leaf || !node.left || !node.right) return Number(node.value) || 0;
  if ((Number(vector[node.featureIndex]) || 0) <= node.threshold) {
    return predictRegressionTree(node.left, vector);
  }
  return predictRegressionTree(node.right, vector);
}

function explainTreePath(node, vector, contributions, depth, scoreKey, scale) {
  if (!node || node.leaf || depth > 64) return;
  const goLeft = (Number(vector[node.featureIndex]) || 0) <= node.threshold;
  const child = goLeft ? node.left : node.right;
  const parentScore = Number(node[scoreKey]) || 0;
  const childScore = Number(child && child[scoreKey]) || 0;
  const delta = (childScore - parentScore) * scale;

  if (Math.abs(delta) > 1e-12) {
    contributions[node.featureIndex] = (contributions[node.featureIndex] || 0) + delta;
  }

  explainTreePath(child, vector, contributions, depth + 1, scoreKey, scale);
}

function explainClassificationTree(node, vector, contributions, depth = 0) {
  explainTreePath(node, vector, contributions, depth, 'probability', 1);
}

function explainRegressionTree(node, vector, contributions, depth = 0, scale = 1) {
  explainTreePath(node, vector, contributions, depth, 'value', scale);
}

function bootstrapSample(vectors, labels, sampleSize) {
  const rowCount = Array.isArray(vectors) ? vectors.length : 0;
  if (!rowCount) {
    return {
      sampleVectors: [],
      sampleLabels: [],
    };
  }

  const desiredSize = Math.max(1, Math.floor(numberOption(sampleSize, rowCount)));
  const sampleVectors = [];
  const sampleLabels = [];

  for (let index = 0; index < desiredSize; index += 1) {
    const rowIndex = Math.floor(Math.random() * rowCount);
    sampleVectors.push(vectors[rowIndex]);
    sampleLabels.push(labels[rowIndex]);
  }

  return {
    sampleVectors,
    sampleLabels,
  };
}

function trainDecisionTree(vectors, labels, options = {}) {
  if (!Array.isArray(vectors) || !vectors.length) {
    throw new Error('Training requires at least one feature vector');
  }

  if (!Array.isArray(labels) || labels.length !== vectors.length) {
    throw new Error('Training labels must align with feature vectors');
  }

  const dimension = vectors[0].length;
  const featureImportances = new Array(dimension).fill(0);
  const tree = buildClassificationTree(vectors, labels, options, 0, featureImportances);
  const totalImportance = featureImportances.reduce((sum, value) => sum + value, 0) || 1;

  return {
    algorithm: 'decision_tree',
    tree,
    feature_importances: featureImportances.map((value) => roundNumber(value / totalImportance)),
    training_options: {
      maxDepth: Math.max(1, Math.floor(numberOption(options.maxDepth, 6))),
      minSamplesSplit: Math.max(2, Math.floor(numberOption(options.minSamplesSplit, 4))),
      featureSubsampleSize: Math.max(1, Math.min(dimension, Math.floor(numberOption(options.featureSubsampleSize, dimension)))),
    },
  };
}

function predictProbabilityDecisionTree(model, vector) {
  if (!model || !model.tree) return 0.5;
  return predictClassificationTree(model.tree, vector);
}

function predictProbabilities(model, vectors) {
  return (Array.isArray(vectors) ? vectors : []).map((vector) => predictProbabilityDecisionTree(model, vector));
}

function explainDecisionTree(model, vector, dimension) {
  const contributions = new Array(Math.max(0, Number(dimension) || 0)).fill(0);
  if (model && model.tree) {
    explainClassificationTree(model.tree, vector, contributions, 0);
  }
  return contributions;
}

function explainDecisionTreeTree(node, vector, contributions, depth = 0) {
  explainClassificationTree(node, vector, contributions, depth);
}

function predictTree(node, vector) {
  return predictClassificationTree(node, vector);
}

function buildTree(vectors, labels, options, depth, featureImportances) {
  return buildClassificationTree(vectors, labels, options, depth, featureImportances);
}

module.exports = {
  average,
  bootstrapSample,
  buildClassificationTree,
  buildRegressionTree,
  buildTree,
  explainClassificationTree,
  explainDecisionTree,
  explainDecisionTreeTree,
  explainRegressionTree,
  explainTree: explainClassificationTree,
  findBestClassificationSplit,
  findBestRegressionSplit,
  giniImpurity,
  leafProbability,
  leafValue,
  predictClassificationTree,
  predictProbabilityDecisionTree,
  predictProbabilities,
  predictRegressionTree,
  predictTree,
  squaredError,
  trainDecisionTree,
};
