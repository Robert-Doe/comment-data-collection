'use strict';

const { roundNumber } = require('./utils');

function safeDivide(numerator, denominator) {
  return denominator ? numerator / denominator : 0;
}

function buildConfusion(rows, threshold) {
  return (Array.isArray(rows) ? rows : []).reduce((summary, row) => {
    const actual = row.binary_label;
    const predicted = row.probability >= threshold ? 1 : 0;

    if (actual === 1 && predicted === 1) summary.true_positive += 1;
    if (actual === 0 && predicted === 0) summary.true_negative += 1;
    if (actual === 0 && predicted === 1) summary.false_positive += 1;
    if (actual === 1 && predicted === 0) summary.false_negative += 1;
    return summary;
  }, {
    true_positive: 0,
    true_negative: 0,
    false_positive: 0,
    false_negative: 0,
  });
}

function computeBinaryMetrics(rows, threshold = 0.5) {
  const confusion = buildConfusion(rows, threshold);
  const precision = safeDivide(confusion.true_positive, confusion.true_positive + confusion.false_positive);
  const recall = safeDivide(confusion.true_positive, confusion.true_positive + confusion.false_negative);
  const f1 = (precision + recall) > 0
    ? (2 * precision * recall) / (precision + recall)
    : 0;

  return {
    threshold,
    count: (rows || []).length,
    positive_count: (rows || []).filter((row) => row.binary_label === 1).length,
    negative_count: (rows || []).filter((row) => row.binary_label === 0).length,
    precision: roundNumber(precision),
    recall: roundNumber(recall),
    f1: roundNumber(f1),
    confusion,
  };
}

function computeRocAuc(rows) {
  const ranked = (Array.isArray(rows) ? rows : [])
    .filter((row) => row.binary_label === 0 || row.binary_label === 1)
    .slice()
    .sort((left, right) => right.probability - left.probability);
  const positives = ranked.filter((row) => row.binary_label === 1).length;
  const negatives = ranked.filter((row) => row.binary_label === 0).length;
  if (!positives || !negatives) return null;

  let truePositive = 0;
  let falsePositive = 0;
  let previousTruePositiveRate = 0;
  let previousFalsePositiveRate = 0;
  let auc = 0;

  ranked.forEach((row) => {
    if (row.binary_label === 1) {
      truePositive += 1;
    } else {
      falsePositive += 1;
    }

    const truePositiveRate = truePositive / positives;
    const falsePositiveRate = falsePositive / negatives;
    auc += (falsePositiveRate - previousFalsePositiveRate) * ((truePositiveRate + previousTruePositiveRate) / 2);
    previousTruePositiveRate = truePositiveRate;
    previousFalsePositiveRate = falsePositiveRate;
  });

  return roundNumber(auc);
}

function computePrAuc(rows) {
  const ranked = (Array.isArray(rows) ? rows : [])
    .filter((row) => row.binary_label === 0 || row.binary_label === 1)
    .slice()
    .sort((left, right) => right.probability - left.probability);
  const positives = ranked.filter((row) => row.binary_label === 1).length;
  if (!positives) return null;

  let truePositive = 0;
  let falsePositive = 0;
  let previousRecall = 0;
  let previousPrecision = 1;
  let auc = 0;

  ranked.forEach((row) => {
    if (row.binary_label === 1) {
      truePositive += 1;
    } else {
      falsePositive += 1;
    }

    const recall = truePositive / positives;
    const precision = safeDivide(truePositive, truePositive + falsePositive);
    auc += (recall - previousRecall) * ((precision + previousPrecision) / 2);
    previousRecall = recall;
    previousPrecision = precision;
  });

  return roundNumber(auc);
}

function groupRowsByItem(rows) {
  const groups = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const key = row.item_id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });
  groups.forEach((group) => {
    group.sort((left, right) => right.probability - left.probability);
  });
  return groups;
}

function isBinaryReviewedItem(group) {
  return group.length > 0 && group.every((row) => row.binary_label === 0 || row.binary_label === 1);
}

function computeRankingMetrics(rows) {
  const groups = groupRowsByItem(rows);
  let top1Hits = 0;
  let reciprocalRankTotal = 0;
  let recallAt3Hits = 0;
  let eligibleItemCount = 0;

  groups.forEach((group) => {
    if (!isBinaryReviewedItem(group)) return;
    const positiveCount = group.filter((row) => row.binary_label === 1).length;
    if (!positiveCount) return;

    eligibleItemCount += 1;
    if (group[0] && group[0].binary_label === 1) {
      top1Hits += 1;
    }

    const positiveIndex = group.findIndex((row) => row.binary_label === 1);
    if (positiveIndex >= 0) {
      reciprocalRankTotal += 1 / (positiveIndex + 1);
    }

    if (group.slice(0, 3).some((row) => row.binary_label === 1)) {
      recallAt3Hits += 1;
    }
  });

  return {
    eligible_item_count: eligibleItemCount,
    top_1_accuracy: roundNumber(safeDivide(top1Hits, eligibleItemCount)),
    mean_reciprocal_rank: roundNumber(safeDivide(reciprocalRankTotal, eligibleItemCount)),
    recall_at_3: roundNumber(safeDivide(recallAt3Hits, eligibleItemCount)),
  };
}

function computePageMetrics(rows, options = {}) {
  const threshold = Number(options.threshold) || 0.5;
  const acceptThreshold = Number(options.acceptThreshold) || 0.8;
  const rejectThreshold = Number(options.rejectThreshold) || 0.2;
  const groups = groupRowsByItem(rows);

  let positiveItems = 0;
  let positiveItemsWithCorrectCandidate = 0;
  let negativeItems = 0;
  let negativeFalsePositiveItems = 0;
  let manualReviewItems = 0;
  let overconfidentFalsePositiveItems = 0;
  let eligibleItemCount = 0;

  groups.forEach((group) => {
    if (!isBinaryReviewedItem(group)) return;
    eligibleItemCount += 1;

    const hasPositive = group.some((row) => row.binary_label === 1);
    const predictedPositive = group.some((row) => row.binary_label === 1 && row.probability >= threshold);
    const maxProbability = group.reduce((maximum, row) => Math.max(maximum, row.probability), 0);
    const requiresManualReview = maxProbability < acceptThreshold && maxProbability > rejectThreshold;

    if (requiresManualReview) {
      manualReviewItems += 1;
    }

    if (hasPositive) {
      positiveItems += 1;
      if (predictedPositive) {
        positiveItemsWithCorrectCandidate += 1;
      }
      return;
    }

    negativeItems += 1;
    if (maxProbability >= threshold) {
      negativeFalsePositiveItems += 1;
    }
    if (maxProbability >= acceptThreshold) {
      overconfidentFalsePositiveItems += 1;
    }
  });

  return {
    eligible_item_count: eligibleItemCount,
    page_has_correct_candidate_rate: roundNumber(safeDivide(positiveItemsWithCorrectCandidate, positiveItems)),
    false_positive_page_rate: roundNumber(safeDivide(negativeFalsePositiveItems, negativeItems)),
    manual_review_rate: roundNumber(safeDivide(manualReviewItems, eligibleItemCount)),
    overconfident_false_positive_page_rate: roundNumber(safeDivide(overconfidentFalsePositiveItems, negativeItems)),
  };
}

function computeAllMetrics(rows, options = {}) {
  const labeledRows = (Array.isArray(rows) ? rows : []).filter((row) => row.binary_label === 0 || row.binary_label === 1);
  const binary = computeBinaryMetrics(labeledRows, options.threshold);
  return {
    candidate_metrics: {
      ...binary,
      roc_auc: computeRocAuc(labeledRows),
      pr_auc: computePrAuc(labeledRows),
    },
    ranking_metrics: computeRankingMetrics(labeledRows),
    page_metrics: computePageMetrics(labeledRows, options),
  };
}

module.exports = {
  computeAllMetrics,
  computeBinaryMetrics,
};
