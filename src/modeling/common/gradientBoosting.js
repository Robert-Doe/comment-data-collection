'use strict';

const {
  buildRegressionTree,
  explainRegressionTree,
  predictRegressionTree,
} = require('./decisionTree');
const { roundNumber, sigmoid } = require('./utils');

function logit(probability) {
  const clamped = Math.min(0.999999, Math.max(0.000001, probability));
  return Math.log(clamped / (1 - clamped));
}

function trainGradientBoosting(vectors, labels, options = {}) {
  if (!Array.isArray(vectors) || !vectors.length) {
    throw new Error('Training requires at least one feature vector');
  }

  if (!Array.isArray(labels) || labels.length !== vectors.length) {
    throw new Error('Training labels must align with feature vectors');
  }

  const dimension = vectors[0].length;
  const estimatorCount = Math.max(5, Math.floor(Number(options.estimators || options.nEstimators) || 25));
  const learningRate = Math.max(0.001, Number(options.learningRate) || 0.1);
  const maxDepth = Math.max(1, Math.floor(Number(options.maxDepth) || 2));
  const minSamplesSplit = Math.max(2, Math.floor(Number(options.minSamplesSplit) || 4));
  const featureSubsampleSize = Math.max(1, Math.min(
    dimension,
    Math.floor(Number(options.featureSubsampleSize) || dimension),
  ));

  const positiveCount = labels.reduce((sum, label) => sum + (label === 1 ? 1 : 0), 0);
  const negativeCount = labels.length - positiveCount;
  const baseScore = logit((positiveCount + 0.5) / (labels.length + 1));
  const scores = new Array(vectors.length).fill(baseScore);
  const trees = [];
  const featureImportances = new Array(dimension).fill(0);
  const trace = [];

  for (let iteration = 0; iteration < estimatorCount; iteration += 1) {
    const probabilities = scores.map((score) => sigmoid(score));
    const residuals = labels.map((label, index) => label - probabilities[index]);
    const treeImportances = new Array(dimension).fill(0);
    const tree = buildRegressionTree(vectors, residuals, {
      maxDepth,
      minSamplesSplit,
      featureSubsampleSize,
    }, 0, treeImportances);

    trees.push(tree);
    for (let featureIndex = 0; featureIndex < dimension; featureIndex += 1) {
      featureImportances[featureIndex] += treeImportances[featureIndex] || 0;
    }

    for (let index = 0; index < scores.length; index += 1) {
      scores[index] += learningRate * predictRegressionTree(tree, vectors[index]);
    }

    if ((iteration + 1) % 5 === 0 || iteration === 0 || iteration === estimatorCount - 1) {
      const loss = labels.reduce((sum, label, index) => {
        const probability = probabilities[index];
        const clamped = Math.min(1 - 1e-8, Math.max(1e-8, probability));
        return sum + ((label === 1) ? -Math.log(clamped) : -Math.log(1 - clamped));
      }, 0) / labels.length;
      trace.push({
        iteration: iteration + 1,
        loss: roundNumber(loss, 8),
      });
    }
  }

  const totalImportance = featureImportances.reduce((sum, value) => sum + value, 0) || 1;

  return {
    algorithm: 'gradient_boosting',
    base_score: baseScore,
    learning_rate: learningRate,
    trees,
    feature_importances: featureImportances.map((value) => roundNumber(value / totalImportance)),
    trace,
    training_options: {
      estimators: estimatorCount,
      learningRate,
      maxDepth,
      minSamplesSplit,
      featureSubsampleSize,
    },
  };
}

function predictProbabilityGradientBoosting(model, vector) {
  if (!model) return 0.5;
  const learningRate = Math.max(0.001, Number(model.learning_rate || model.training_options && model.training_options.learningRate) || 0.1);
  const trees = Array.isArray(model.trees) ? model.trees : [];
  let score = Number(model.base_score) || 0;
  trees.forEach((tree) => {
    score += learningRate * predictRegressionTree(tree, vector);
  });
  return sigmoid(score);
}

function predictProbabilities(model, vectors) {
  return (Array.isArray(vectors) ? vectors : []).map((vector) => predictProbabilityGradientBoosting(model, vector));
}

function explainGradientBoosting(model, vector, dimension) {
  const trees = Array.isArray(model && model.trees) ? model.trees : [];
  const learningRate = Math.max(0.001, Number(model && (model.learning_rate || (model.training_options && model.training_options.learningRate))) || 0.1);
  const contributions = new Array(Math.max(0, Number(dimension) || 0)).fill(0);

  trees.forEach((tree) => {
    const treeContributions = new Array(contributions.length).fill(0);
    explainRegressionTree(tree, vector, treeContributions, 0, learningRate);
    for (let index = 0; index < contributions.length; index += 1) {
      contributions[index] += treeContributions[index];
    }
  });

  return contributions;
}

module.exports = {
  explainGradientBoosting,
  predictProbabilityGradientBoosting,
  predictProbabilities,
  trainGradientBoosting,
};
