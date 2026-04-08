'use strict';

const { applyCandidateReviews } = require('../../shared/candidateReviews');
const { getFeatureCatalogForVariant } = require('./featureCatalog');
const { normalizeHostname } = require('./utils');

function toBinaryLabel(label) {
  if (label === 'comment_region') return 1;
  if (label === 'not_comment_region') return 0;
  return null;
}

function normalizeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeBoolean(value) {
  return value ? 1 : 0;
}

function normalizeCategorical(value) {
  const text = String(value || '').trim();
  return text || '__missing__';
}

function getContextFeatureValue(item, candidate, key) {
  if (candidate && candidate[key] !== undefined) {
    return candidate[key];
  }

  if (key === 'analysis_source') {
    return item && item.analysis_source ? item.analysis_source : 'automated';
  }

  if (key === 'blocker_type') {
    return item && item.scan_result && item.scan_result.blocker_type
      ? item.scan_result.blocker_type
      : '';
  }

  if (key === 'frame_count') {
    return item && item.scan_result && item.scan_result.frame_count !== undefined
      ? item.scan_result.frame_count
      : 0;
  }

  return '';
}

function getFeatureValue(item, candidate, entry) {
  const rawValue = getContextFeatureValue(item, candidate, entry.key);

  if (entry.type === 'number') {
    return normalizeNumber(rawValue);
  }

  if (entry.type === 'boolean') {
    return normalizeBoolean(rawValue);
  }

  if (entry.type === 'categorical') {
    return normalizeCategorical(rawValue);
  }

  return rawValue;
}

function countLabels(candidates) {
  return (Array.isArray(candidates) ? candidates : []).reduce((summary, candidate) => {
    if (candidate.human_label === 'comment_region') summary.positive += 1;
    if (candidate.human_label === 'not_comment_region') summary.negative += 1;
    if (candidate.human_label === 'uncertain') summary.uncertain += 1;
    if (!candidate.human_label) summary.unlabeled += 1;
    return summary;
  }, {
    positive: 0,
    negative: 0,
    uncertain: 0,
    unlabeled: 0,
  });
}

function buildCandidateRow(item, candidate, featureCatalog, itemLabelCounts, reviewCoverage) {
  const hostname = normalizeHostname(item.final_url || item.normalized_url || '');
  const frameUrl = String(candidate.frame_url || '');
  const frameHost = normalizeHostname(frameUrl);
  const featureValues = featureCatalog.reduce((accumulator, entry) => {
    accumulator[entry.key] = getFeatureValue(item, candidate, entry);
    return accumulator;
  }, {});

  return {
    dataset_row_id: `${String(item.id || '')}:${String(candidate.candidate_key || candidate.xpath || candidate.css_path || candidate.candidate_rank || '')}`,
    job_id: String(item.job_id || ''),
    item_id: String(item.id || ''),
    row_number: Number(item.row_number) || 0,
    candidate_key: String(candidate.candidate_key || ''),
    candidate_rank: Number(candidate.candidate_rank) || 0,
    normalized_url: String(item.normalized_url || ''),
    final_url: String(item.final_url || ''),
    hostname,
    frame_url: frameUrl,
    frame_host: frameHost,
    analysis_source: String(item.analysis_source || 'automated'),
    manual_captured_at: String(item.manual_captured_at || ''),
    item_status: String(item.status || ''),
    item_ugc_detected: item.ugc_detected === undefined || item.ugc_detected === null
      ? ''
      : (item.ugc_detected ? 'true' : 'false'),
    candidate_screenshot_url: String(candidate.candidate_screenshot_url || ''),
    item_screenshot_url: String(item.screenshot_url || ''),
    item_manual_uploaded_screenshot_url: String(item.manual_uploaded_screenshot_url || ''),
    human_label: String(candidate.human_label || ''),
    binary_label: toBinaryLabel(candidate.human_label),
    review_complete_binary: reviewCoverage.review_complete_binary,
    item_positive_label_count: itemLabelCounts.positive,
    item_negative_label_count: itemLabelCounts.negative,
    sample_text: String(candidate.sample_text || ''),
    score: normalizeNumber(candidate.score),
    confidence: String(candidate.confidence || ''),
    ugc_type: String(candidate.ugc_type || ''),
    feature_values: featureValues,
    candidate,
    item,
  };
}

function summarizeRows(rows) {
  const summary = {
    item_count: 0,
    candidate_count: rows.length,
    labeled_candidate_count: 0,
    positive_candidate_count: 0,
    negative_candidate_count: 0,
    uncertain_candidate_count: 0,
    unlabeled_candidate_count: 0,
    review_complete_binary_item_count: 0,
    hostname_count: 0,
  };
  const items = new Set();
  const binaryReviewedItems = new Set();
  const hostnames = new Set();

  rows.forEach((row) => {
    items.add(row.item_id);
    if (row.hostname) hostnames.add(row.hostname);
    if (row.binary_label !== null) {
      summary.labeled_candidate_count += 1;
      if (row.binary_label === 1) summary.positive_candidate_count += 1;
      if (row.binary_label === 0) summary.negative_candidate_count += 1;
    } else if (row.human_label === 'uncertain') {
      summary.uncertain_candidate_count += 1;
    } else {
      summary.unlabeled_candidate_count += 1;
    }

    if (row.review_complete_binary) {
      binaryReviewedItems.add(row.item_id);
    }
  });

  summary.item_count = items.size;
  summary.review_complete_binary_item_count = binaryReviewedItems.size;
  summary.hostname_count = hostnames.size;
  return summary;
}

function extractCandidateDataset(items, options = {}) {
  const variant = options.variant || null;
  const featureCatalog = Array.isArray(options.featureCatalog) && options.featureCatalog.length
    ? options.featureCatalog.map((entry) => ({ ...entry }))
    : getFeatureCatalogForVariant(variant);
  const progress = typeof options.progress === 'function' ? options.progress : null;
  const progressInterval = Math.max(1, Number(options.progressInterval) || 50);
  const sourceItems = Array.isArray(items) ? items : [];
  const totalItems = sourceItems.length;

  const rows = [];

  sourceItems.forEach((item, index) => {
    if (progress && (index === 0 || (index + 1) % progressInterval === 0 || index + 1 === totalItems)) {
      progress({
        stage: 'extracting',
        message: `Extracting candidate rows ${index + 1}/${totalItems}`,
        progress: {
          current: index + 1,
          total: totalItems,
          unit: 'items',
          indeterminate: totalItems === 0,
        },
      });
    }

    const reviewedCandidates = applyCandidateReviews(item && item.candidates ? item.candidates : [], item && item.candidate_reviews ? item.candidate_reviews : []);
    if (!reviewedCandidates.length) {
      return;
    }

    const labelCounts = countLabels(reviewedCandidates);
    const reviewCoverage = {
      reviewed_count: labelCounts.positive + labelCounts.negative + labelCounts.uncertain,
      review_complete_binary: reviewedCandidates.length > 0
        && (labelCounts.positive + labelCounts.negative) === reviewedCandidates.length,
    };

    reviewedCandidates.forEach((candidate) => {
      rows.push(buildCandidateRow(item, candidate, featureCatalog, labelCounts, reviewCoverage));
    });
  });

  return {
    featureCatalog,
    rows,
    summary: summarizeRows(rows),
  };
}

function quoteCsvValue(value) {
  const text = String(value === null || value === undefined ? '' : value);
  if (!/[",\r\n]/.test(text)) {
    return text;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

function serializeDatasetCsv(rows, featureCatalog, options = {}) {
  const catalog = Array.isArray(featureCatalog) ? featureCatalog : [];
  const metadataColumns = [
    'dataset_row_id',
    'job_id',
    'item_id',
    'row_number',
    'candidate_key',
    'candidate_rank',
    'normalized_url',
    'final_url',
    'hostname',
    'frame_url',
    'frame_host',
    'analysis_source',
    'manual_captured_at',
    'item_status',
    'item_ugc_detected',
    'candidate_screenshot_url',
    'item_screenshot_url',
    'item_manual_uploaded_screenshot_url',
    'human_label',
    'binary_label',
    'review_complete_binary',
    'item_positive_label_count',
    'item_negative_label_count',
    'sample_text',
    'score',
    'confidence',
    'ugc_type',
  ];

  const header = metadataColumns.concat(catalog.map((entry) => entry.key));
  const lines = [header.join(',')];

  const progress = typeof options.progress === 'function' ? options.progress : null;
  const progressInterval = Math.max(1, Number(options.progressInterval) || 100);
  const sourceRows = Array.isArray(rows) ? rows : [];
  const totalRows = sourceRows.length;

  if (progress) {
    progress({
      stage: 'exporting',
      message: `Writing CSV rows ${totalRows ? `0/${totalRows}` : '0'}`,
      progress: {
        current: 0,
        total: totalRows,
        unit: 'rows',
        indeterminate: totalRows === 0,
      },
    });
  }

  sourceRows.forEach((row, index) => {
    if (progress && (index === 0 || (index + 1) % progressInterval === 0 || index + 1 === totalRows)) {
      progress({
        stage: 'exporting',
        message: `Writing CSV rows ${index + 1}/${totalRows}`,
        progress: {
          current: index + 1,
          total: totalRows,
          unit: 'rows',
          indeterminate: totalRows === 0,
        },
      });
    }

    const values = metadataColumns
      .map((column) => row[column])
      .concat(catalog.map((entry) => row.feature_values ? row.feature_values[entry.key] : ''))
      .map((value) => quoteCsvValue(value));
    lines.push(values.join(','));
  });

  if (progress) {
    progress({
      stage: 'exporting',
      message: `CSV ready (${totalRows} row(s))`,
      progress: {
        current: totalRows,
        total: totalRows || 1,
        unit: 'rows',
        indeterminate: false,
      },
    });
  }

  return `${lines.join('\n')}\n`;
}

module.exports = {
  toBinaryLabel,
  extractCandidateDataset,
  serializeDatasetCsv,
};
