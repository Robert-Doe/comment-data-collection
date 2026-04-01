'use strict';

const { sigmoid, roundNumber } = require('./utils');

function dotProduct(left, right) {
  let total = 0;
  for (let index = 0; index < left.length; index += 1) {
    total += (left[index] || 0) * (right[index] || 0);
  }
  return total;
}

function computeClassWeights(labels) {
  const positives = labels.filter((label) => label === 1).length;
  const negatives = labels.length - positives;

  return {
    positive: positives > 0 ? labels.length / (2 * positives) : 1,
    negative: negatives > 0 ? labels.length / (2 * negatives) : 1,
  };
}

function trainLogisticRegression(vectors, labels, options = {}) {
  if (!Array.isArray(vectors) || !vectors.length) {
    throw new Error('Training requires at least one feature vector');
  }

  if (!Array.isArray(labels) || labels.length !== vectors.length) {
    throw new Error('Training labels must align with feature vectors');
  }

  const dimension = vectors[0].length;
  const iterations = Math.max(50, Number(options.iterations) || 500);
  const learningRate = Number(options.learningRate) || 0.08;
  const l2 = Number(options.l2) || 0.0005;
  const epsilon = 1e-8;
  const weights = new Array(dimension).fill(0);
  let bias = 0;
  const classWeights = computeClassWeights(labels);
  const trace = [];

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const gradients = new Array(dimension).fill(0);
    let biasGradient = 0;
    let loss = 0;

    for (let rowIndex = 0; rowIndex < vectors.length; rowIndex += 1) {
      const vector = vectors[rowIndex];
      const label = labels[rowIndex];
      const logit = bias + dotProduct(weights, vector);
      const probability = sigmoid(logit);
      const sampleWeight = label === 1 ? classWeights.positive : classWeights.negative;
      const error = (probability - label) * sampleWeight;

      biasGradient += error;
      for (let featureIndex = 0; featureIndex < dimension; featureIndex += 1) {
        gradients[featureIndex] += error * vector[featureIndex];
      }

      const clampedProbability = Math.min(1 - epsilon, Math.max(epsilon, probability));
      loss += sampleWeight * (
        (-label * Math.log(clampedProbability))
        - ((1 - label) * Math.log(1 - clampedProbability))
      );
    }

    for (let featureIndex = 0; featureIndex < dimension; featureIndex += 1) {
      gradients[featureIndex] = (gradients[featureIndex] / vectors.length) + (l2 * weights[featureIndex]);
      weights[featureIndex] -= learningRate * gradients[featureIndex];
    }
    bias -= learningRate * (biasGradient / vectors.length);

    const averageLoss = (loss / vectors.length) + (l2 * weights.reduce((sum, weight) => sum + (weight * weight), 0) / 2);
    if ((iteration + 1) % 25 === 0 || iteration === 0 || iteration === iterations - 1) {
      trace.push({
        iteration: iteration + 1,
        loss: roundNumber(averageLoss, 8),
      });
    }
  }

  return {
    algorithm: 'logistic_regression',
    weights,
    bias,
    trace,
    training_options: {
      iterations,
      learningRate,
      l2,
    },
  };
}

function predictProbability(model, vector) {
  return sigmoid((model.bias || 0) + dotProduct(model.weights || [], vector || []));
}

function predictProbabilities(model, vectors) {
  return (Array.isArray(vectors) ? vectors : []).map((vector) => predictProbability(model, vector));
}

module.exports = {
  trainLogisticRegression,
  predictProbability,
  predictProbabilities,
};
