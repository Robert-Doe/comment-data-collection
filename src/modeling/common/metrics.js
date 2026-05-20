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

// t-distribution critical values for df = n-1 (index 0 = df 0, not useful; index 1 = df 1, etc.)
// Using two-tailed 95% CI values from standard tables up to df=29, then 1.96 for large n.
const T_CRIT_95 = [
  Infinity, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365,
  2.306, 2.262, 2.228, 2.201, 2.179, 2.160, 2.145, 2.131, 2.120,
  2.110, 2.101, 2.093, 2.086, 2.080, 2.074, 2.069, 2.064, 2.060,
  2.056, 2.052, 2.048, 2.045,
];

/**
 * Compute mean ± std and 95% CI for an array of numeric values.
 */
function computeStatSummary(values) {
  const valid = (Array.isArray(values) ? values : []).filter((v) => typeof v === 'number' && isFinite(v));
  if (!valid.length) return { mean: null, std: null, ci95_lo: null, ci95_hi: null, n: 0 };
  const n = valid.length;
  const mean = valid.reduce((sum, v) => sum + v, 0) / n;
  const variance = n > 1 ? valid.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (n - 1) : 0;
  const std = Math.sqrt(variance);
  const tCritical = n >= 30 ? 1.96 : (T_CRIT_95[n - 1] || 2.045);
  const se = n > 1 ? std / Math.sqrt(n) : 0;
  return {
    mean: roundNumber(mean),
    std: roundNumber(std),
    ci95_lo: roundNumber(mean - tCritical * se),
    ci95_hi: roundNumber(mean + tCritical * se),
    n,
  };
}

/**
 * Bin scored rows by predicted probability and compare mean predicted vs actual positive rate.
 * Returns one entry per bin with count, mean_predicted, and fraction_positive.
 */
function computeCalibrationCurve(rows, nBins = 10) {
  const bins = Math.max(2, Math.min(20, Number(nBins) || 10));
  const labeled = (Array.isArray(rows) ? rows : []).filter(
    (row) => (row.binary_label === 0 || row.binary_label === 1) && typeof row.probability === 'number' && isFinite(row.probability),
  );
  const buckets = Array.from({ length: bins }, () => ({ count: 0, positives: 0, probSum: 0 }));
  labeled.forEach((row) => {
    const prob = Math.max(0, Math.min(1, row.probability));
    const idx = Math.min(Math.floor(prob * bins), bins - 1);
    buckets[idx].count += 1;
    buckets[idx].positives += row.binary_label;
    buckets[idx].probSum += prob;
  });
  return buckets.map((bucket, idx) => ({
    bin: idx,
    bin_start: roundNumber(idx / bins),
    bin_end: roundNumber((idx + 1) / bins),
    count: bucket.count,
    mean_predicted: bucket.count > 0 ? roundNumber(bucket.probSum / bucket.count) : null,
    fraction_positive: bucket.count > 0 ? roundNumber(bucket.positives / bucket.count) : null,
  }));
}

module.exports = {
  computeAllMetrics,
  computeBinaryMetrics,
  computeStatSummary,
  computeCalibrationCurve,
};
