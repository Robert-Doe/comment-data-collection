'use strict';

const {
  bootstrapSample,
  buildClassificationTree,
  explainClassificationTree,
  predictClassificationTree,
} = require('./decisionTree');
const { roundNumber } = require('./utils');

function trainRandomForest(vectors, labels, options = {}) {
  if (!Array.isArray(vectors) || !vectors.length) {
    throw new Error('Training requires at least one feature vector');
  }

  if (!Array.isArray(labels) || labels.length !== vectors.length) {
    throw new Error('Training labels must align with feature vectors');
  }

  const dimension = vectors[0].length;
  const treeCount = Math.max(5, Math.floor(Number(options.trees || options.nTrees) || 25));
  const maxDepth = Math.max(2, Math.floor(Number(options.maxDepth) || 6));
  const minSamplesSplit = Math.max(2, Math.floor(Number(options.minSamplesSplit) || 4));
  const sampleRatio = Math.max(0.1, Number(options.sampleRatio) || 1);
  const featureSubsampleSize = Math.max(1, Math.min(
    dimension,
    Math.floor(Number(options.featureSubsampleSize) || Math.sqrt(dimension) || 1),
  ));

  const trees = [];
  const featureImportances = new Array(dimension).fill(0);

  for (let treeIndex = 0; treeIndex < treeCount; treeIndex += 1) {
    const sampleSize = Math.max(1, Math.round(vectors.length * sampleRatio));
    const sample = bootstrapSample(vectors, labels, sampleSize);
    const treeImportances = new Array(dimension).fill(0);
    const tree = buildClassificationTree(sample.sampleVectors, sample.sampleLabels, {
      maxDepth,
      minSamplesSplit,
      featureSubsampleSize,
    }, 0, treeImportances);
    trees.push(tree);
    for (let featureIndex = 0; featureIndex < dimension; featureIndex += 1) {
      featureImportances[featureIndex] += treeImportances[featureIndex] || 0;
    }
  }

  const totalImportance = featureImportances.reduce((sum, value) => sum + value, 0) || 1;

  return {
    algorithm: 'random_forest',
    trees,
    feature_importances: featureImportances.map((value) => roundNumber(value / totalImportance)),
    training_options: {
      trees: treeCount,
      maxDepth,
      minSamplesSplit,
      sampleRatio: roundNumber(sampleRatio, 4),
      featureSubsampleSize,
    },
  };
}

function predictProbabilityRandomForest(model, vector) {
  const trees = Array.isArray(model && model.trees) ? model.trees : [];
  if (!trees.length) return 0.5;
  const total = trees.reduce((sum, tree) => sum + predictClassificationTree(tree, vector), 0);
  return total / trees.length;
}

function predictProbabilities(model, vectors) {
  return (Array.isArray(vectors) ? vectors : []).map((vector) => predictProbabilityRandomForest(model, vector));
}

function explainRandomForest(model, vector, dimension) {
  const trees = Array.isArray(model && model.trees) ? model.trees : [];
  const contributions = new Array(Math.max(0, Number(dimension) || 0)).fill(0);
  if (!trees.length) return contributions;

  trees.forEach((tree) => {
    const treeContributions = new Array(contributions.length).fill(0);
    explainClassificationTree(tree, vector, treeContributions, 0);
    for (let index = 0; index < contributions.length; index += 1) {
      contributions[index] += treeContributions[index] / trees.length;
    }
  });

  return contributions;
}

module.exports = {
  explainRandomForest,
  predictProbabilityRandomForest,
  predictProbabilities,
  trainRandomForest,
};
