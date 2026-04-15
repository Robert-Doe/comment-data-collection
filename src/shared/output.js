'use strict';

const ExcelJS = require('exceljs');

function escapeCsv(value) {
  const text = String(value ?? '');
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function normalizeExportValue(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) {
    return JSON.stringify(value);
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return value;
}

function serializeObjectRowsCsv(rows, preferredHeaders = []) {
  const records = Array.isArray(rows) ? rows : [];
  const allKeys = new Set();
  records.forEach((row) => {
    Object.keys(row || {}).forEach((key) => allKeys.add(key));
  });

  const headers = preferredHeaders.filter((key) => allKeys.has(key));
  Array.from(allKeys)
    .filter((key) => !headers.includes(key))
    .sort((left, right) => left.localeCompare(right))
    .forEach((key) => headers.push(key));

  const lines = [headers.map(escapeCsv).join(',')];
  records.forEach((row) => {
    lines.push(headers.map((header) => escapeCsv(normalizeExportValue(row[header]))).join(','));
  });
  return lines.join('\n');
}

function incrementCount(map, key) {
  const normalizedKey = String(key || '').trim() || 'unknown';
  map.set(normalizedKey, (map.get(normalizedKey) || 0) + 1);
}

function appendCounts(lines, group, counts) {
  Array.from(counts.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .forEach(([metric, value]) => {
      lines.push({
        section: 'count',
        group,
        metric,
        value,
      });
    });
}

function resolveBestCandidate(item) {
  const candidates = Array.isArray(item && item.candidates) ? item.candidates : [];
  const best = item && item.best_candidate ? item.best_candidate : null;
  if (!best && candidates.length) return candidates[0];
  if (!best) return null;

  if (best.candidate_key) {
    const matchedByKey = candidates.find((candidate) => candidate && candidate.candidate_key === best.candidate_key);
    if (matchedByKey) return matchedByKey;
  }

  const matchedByPath = candidates.find((candidate) => candidate
    && candidate.xpath === best.xpath
    && candidate.css_path === best.css_path);
  if (matchedByPath) return matchedByPath;

  return candidates[0] || best;
}

function buildJobItemRecord(item) {
  const candidateCount = Array.isArray(item.candidates) ? item.candidates.length : 0;
  const reviewSummary = item.candidate_review_summary || {};
  const scanResult = item.scan_result || {};
  return {
    job_id: item.job_id || '',
    row_number: item.row_number,
    input_url: item.input_url,
    normalized_url: item.normalized_url,
    final_url: item.final_url || '',
    title: item.title || '',
    status: item.status || '',
    ugc_detected: item.ugc_detected,
    confidence: item.best_confidence || '',
    ugc_type: item.best_ugc_type || '',
    score: item.best_score ?? '',
    xpath: item.best_xpath || '',
    css_path: item.best_css_path || '',
    sample_text: item.best_sample_text || '',
    candidate_count: candidateCount,
    candidate_review_count: reviewSummary.total ?? '',
    candidate_comment_region_reviews: reviewSummary.comment_region ?? '',
    candidate_not_comment_reviews: reviewSummary.not_comment_region ?? '',
    candidate_uncertain_reviews: reviewSummary.uncertain ?? '',
    candidate_selection_mode: scanResult.candidate_selection_mode || '',
    candidate_selection_limit: scanResult.candidate_selection_limit ?? '',
    candidate_review_artifact_limit: scanResult.candidate_review_artifact_limit ?? '',
    candidate_heuristic_summary: scanResult.candidate_heuristic_summary || '',
    heuristic_best_candidate_key: scanResult.heuristic_best_candidate_key || '',
    heuristic_best_candidate_label: scanResult.heuristic_best_candidate_label || '',
    heuristic_best_candidate_reason: scanResult.heuristic_best_candidate_reason || '',
    analysis_source: item.analysis_source || '',
    manual_capture_required: item.manual_capture_required,
    manual_capture_reason: item.manual_capture_reason || '',
    manual_capture_mode: item.manual_capture_mode || '',
    manual_html_url: item.manual_html_url || '',
    manual_raw_html_url: item.manual_raw_html_url || '',
    manual_capture_url: item.manual_capture_url || '',
    manual_captured_at: item.manual_captured_at || '',
    manual_uploaded_screenshot_url: item.manual_uploaded_screenshot_url || '',
    manual_uploaded_screenshot_path: item.manual_uploaded_screenshot_path || '',
    screenshot_url: item.screenshot_url || '',
    screenshot_path: item.screenshot_path || '',
    blocked_by_interstitial: scanResult.blocked_by_interstitial ?? '',
    blocker_type: scanResult.blocker_type || '',
    access_reason: scanResult.access_reason || '',
    frame_count: scanResult.frame_count ?? '',
    created_at: item.created_at || '',
    updated_at: item.updated_at || '',
    completed_at: item.completed_at || '',
    error_message: item.error_message || '',
  };
}

function buildJobItemsRows(items) {
  return (Array.isArray(items) ? items : []).map((item) => buildJobItemRecord(item));
}

function serializeJobItemsCsv(items) {
  return serializeObjectRowsCsv(buildJobItemsRows(items), [
    'job_id',
    'row_number',
    'input_url',
    'normalized_url',
    'final_url',
    'title',
    'status',
    'ugc_detected',
    'confidence',
    'ugc_type',
    'score',
    'xpath',
    'css_path',
    'sample_text',
    'candidate_count',
    'candidate_review_count',
    'candidate_comment_region_reviews',
    'candidate_not_comment_reviews',
    'candidate_uncertain_reviews',
    'candidate_selection_mode',
    'candidate_selection_limit',
    'candidate_review_artifact_limit',
    'candidate_heuristic_summary',
    'heuristic_best_candidate_key',
    'heuristic_best_candidate_label',
    'heuristic_best_candidate_reason',
    'analysis_source',
    'manual_capture_required',
    'manual_capture_reason',
    'manual_capture_mode',
    'manual_html_url',
    'manual_raw_html_url',
    'manual_capture_url',
    'manual_captured_at',
    'manual_uploaded_screenshot_url',
    'manual_uploaded_screenshot_path',
    'screenshot_url',
    'screenshot_path',
    'blocked_by_interstitial',
    'blocker_type',
    'access_reason',
    'frame_count',
    'created_at',
    'updated_at',
    'completed_at',
    'error_message',
  ]);
}

function buildJobSummaryRows(job, items) {
  const rows = Array.isArray(items) ? items : [];
  const statusCounts = new Map();
  const typeCounts = new Map();
  const confidenceCounts = new Map();
  const analysisSourceCounts = new Map();
  const blockerCounts = new Map();

  let ugcDetectedCount = 0;
  let ugcNotDetectedCount = 0;
  let manualCaptureRequiredCount = 0;
  let manualSnapshotCount = 0;
  let manualCapturedCount = 0;
  let blockedCount = 0;
  let errorCount = 0;
  let candidateRowsCount = 0;
  let candidateCountTotal = 0;
  let candidateReviewTotal = 0;
  let candidateCommentRegionTotal = 0;
  let candidateNotCommentTotal = 0;
  let candidateUncertainTotal = 0;

  rows.forEach((item) => {
    const reviewSummary = item.candidate_review_summary || {};
    const candidateCount = Array.isArray(item.candidates) ? item.candidates.length : 0;
    const scanResult = item.scan_result || {};

    incrementCount(statusCounts, item.status || 'unknown');
    if (item.best_ugc_type) incrementCount(typeCounts, item.best_ugc_type);
    if (item.best_confidence) incrementCount(confidenceCounts, item.best_confidence);
    if (item.analysis_source) incrementCount(analysisSourceCounts, item.analysis_source);
    if (scanResult.blocker_type) incrementCount(blockerCounts, scanResult.blocker_type);

    if (item.ugc_detected === true) ugcDetectedCount += 1;
    else if (item.ugc_detected === false) ugcNotDetectedCount += 1;

    if (item.manual_capture_required) manualCaptureRequiredCount += 1;
    if (item.analysis_source === 'manual_snapshot') manualSnapshotCount += 1;
    if (item.manual_captured_at) manualCapturedCount += 1;
    if (scanResult.blocked_by_interstitial) blockedCount += 1;
    if (item.error_message) errorCount += 1;
    if (candidateCount > 0) candidateRowsCount += 1;
    candidateCountTotal += candidateCount;
    candidateReviewTotal += Number(reviewSummary.total || 0);
    candidateCommentRegionTotal += Number(reviewSummary.comment_region || 0);
    candidateNotCommentTotal += Number(reviewSummary.not_comment_region || 0);
    candidateUncertainTotal += Number(reviewSummary.uncertain || 0);
  });

  const lines = [
    {
      section: 'overview',
      group: 'job',
      metric: 'job_id',
      value: job && job.id ? job.id : '',
    },
    {
      section: 'overview',
      group: 'job',
      metric: 'status',
      value: job && job.status ? job.status : '',
    },
    {
      section: 'overview',
      group: 'job',
      metric: 'source_filename',
      value: job && job.source_filename ? job.source_filename : '',
    },
    {
      section: 'overview',
      group: 'job',
      metric: 'source_column',
      value: job && job.source_column ? job.source_column : '',
    },
    {
      section: 'overview',
      group: 'job',
      metric: 'candidate_mode',
      value: job && (job.candidate_mode || job.candidateMode) ? (job.candidate_mode || job.candidateMode) : '',
    },
    {
      section: 'overview',
      group: 'job',
      metric: 'created_at',
      value: job && job.created_at ? job.created_at : '',
    },
    {
      section: 'overview',
      group: 'job',
      metric: 'updated_at',
      value: job && job.updated_at ? job.updated_at : '',
    },
    {
      section: 'overview',
      group: 'job',
      metric: 'finished_at',
      value: job && job.finished_at ? job.finished_at : '',
    },
    {
      section: 'overview',
      group: 'rows',
      metric: 'total_urls',
      value: job && job.total_urls !== undefined ? job.total_urls : rows.length,
    },
    {
      section: 'overview',
      group: 'rows',
      metric: 'ugc_detected_count',
      value: ugcDetectedCount,
    },
    {
      section: 'overview',
      group: 'rows',
      metric: 'ugc_not_detected_count',
      value: ugcNotDetectedCount,
    },
    {
      section: 'overview',
      group: 'rows',
      metric: 'manual_capture_required_count',
      value: manualCaptureRequiredCount,
    },
    {
      section: 'overview',
      group: 'rows',
      metric: 'manual_snapshot_count',
      value: manualSnapshotCount,
    },
    {
      section: 'overview',
      group: 'rows',
      metric: 'manual_captured_count',
      value: manualCapturedCount,
    },
    {
      section: 'overview',
      group: 'rows',
      metric: 'blocked_count',
      value: blockedCount,
    },
    {
      section: 'overview',
      group: 'rows',
      metric: 'error_count',
      value: errorCount,
    },
    {
      section: 'overview',
      group: 'candidates',
      metric: 'rows_with_candidates',
      value: candidateRowsCount,
    },
    {
      section: 'overview',
      group: 'candidates',
      metric: 'candidate_count_total',
      value: candidateCountTotal,
    },
    {
      section: 'overview',
      group: 'candidates',
      metric: 'candidate_review_total',
      value: candidateReviewTotal,
    },
    {
      section: 'overview',
      group: 'candidates',
      metric: 'comment_region_labels',
      value: candidateCommentRegionTotal,
    },
    {
      section: 'overview',
      group: 'candidates',
      metric: 'not_comment_labels',
      value: candidateNotCommentTotal,
    },
    {
      section: 'overview',
      group: 'candidates',
      metric: 'uncertain_labels',
      value: candidateUncertainTotal,
    },
  ];

  appendCounts(lines, 'status', statusCounts);
  appendCounts(lines, 'ugc_type', typeCounts);
  appendCounts(lines, 'confidence', confidenceCounts);
  appendCounts(lines, 'analysis_source', analysisSourceCounts);
  appendCounts(lines, 'blocker_type', blockerCounts);

  return lines;
}

function serializeJobSummaryCsv(job, items) {
  return serializeObjectRowsCsv(buildJobSummaryRows(job, items), [
    'section',
    'group',
    'metric',
    'value',
  ]);
}

function buildSiteBreakdownRows(items) {
  return (Array.isArray(items) ? items : []).map((item) => {
    const scanResult = item.scan_result || {};
    const reviewSummary = item.candidate_review_summary || {};
    const bestCandidate = resolveBestCandidate(item);
    const record = {
      job_id: item.job_id || '',
      item_id: item.id || '',
      row_number: item.row_number,
      input_url: item.input_url || '',
      normalized_url: item.normalized_url || '',
      final_url: item.final_url || '',
      title: item.title || '',
      status: item.status || '',
      analysis_source: item.analysis_source || '',
      ugc_detected: item.ugc_detected,
      manual_capture_required: item.manual_capture_required,
      manual_capture_reason: item.manual_capture_reason || '',
      manual_capture_mode: item.manual_capture_mode || '',
      manual_captured_at: item.manual_captured_at || '',
      candidate_count: Array.isArray(item.candidates) ? item.candidates.length : 0,
      candidate_review_count: reviewSummary.total ?? '',
      comment_region_reviews: reviewSummary.comment_region ?? '',
      not_comment_reviews: reviewSummary.not_comment_region ?? '',
      uncertain_reviews: reviewSummary.uncertain ?? '',
      manual_uploaded_screenshot_url: item.manual_uploaded_screenshot_url || '',
      screenshot_url: item.screenshot_url || '',
      blocker_type: scanResult.blocker_type || '',
      access_reason: scanResult.access_reason || '',
      blocked_by_interstitial: scanResult.blocked_by_interstitial ?? '',
      frame_count: scanResult.frame_count ?? '',
      best_candidate_key: bestCandidate && bestCandidate.candidate_key ? bestCandidate.candidate_key : '',
      best_candidate_rank: bestCandidate && bestCandidate.candidate_rank !== undefined ? bestCandidate.candidate_rank : '',
      best_candidate_detected: bestCandidate && bestCandidate.detected !== undefined ? bestCandidate.detected : '',
      best_candidate_score: bestCandidate && bestCandidate.score !== undefined ? bestCandidate.score : '',
      best_candidate_confidence: bestCandidate && bestCandidate.confidence ? bestCandidate.confidence : '',
      best_candidate_ugc_type: bestCandidate && bestCandidate.ugc_type ? bestCandidate.ugc_type : '',
      best_candidate_human_label: bestCandidate && bestCandidate.human_label ? bestCandidate.human_label : '',
      best_candidate_human_notes: bestCandidate && bestCandidate.human_notes ? bestCandidate.human_notes : '',
      best_candidate_human_reviewed_at: bestCandidate && bestCandidate.human_reviewed_at ? bestCandidate.human_reviewed_at : '',
      best_candidate_matched_signals: bestCandidate && bestCandidate.matched_signals ? JSON.stringify(bestCandidate.matched_signals) : '',
      best_candidate_penalty_signals: bestCandidate && bestCandidate.penalty_signals ? JSON.stringify(bestCandidate.penalty_signals) : '',
      best_candidate_xpath: bestCandidate && bestCandidate.xpath ? bestCandidate.xpath : '',
      best_candidate_css_path: bestCandidate && bestCandidate.css_path ? bestCandidate.css_path : '',
      best_candidate_sample_text: bestCandidate && bestCandidate.sample_text ? bestCandidate.sample_text : '',
      best_candidate_selection_mode: scanResult.candidate_selection_mode || '',
    };

    if (bestCandidate) {
      Object.keys(bestCandidate)
        .filter((key) => !record.hasOwnProperty(`best_candidate_${key}`))
        .sort((left, right) => left.localeCompare(right))
        .forEach((key) => {
          record[`best_candidate_${key}`] = normalizeExportValue(bestCandidate[key]);
        });
    }

    return record;
  });
}

function serializeJobSiteBreakdownCsv(items) {
  return serializeObjectRowsCsv(buildSiteBreakdownRows(items), [
    'job_id',
    'item_id',
    'row_number',
    'input_url',
    'normalized_url',
    'final_url',
    'title',
    'status',
    'analysis_source',
    'ugc_detected',
    'manual_capture_required',
    'manual_capture_reason',
    'manual_capture_mode',
    'manual_captured_at',
    'candidate_count',
    'candidate_review_count',
    'comment_region_reviews',
    'not_comment_reviews',
    'uncertain_reviews',
    'manual_uploaded_screenshot_url',
    'screenshot_url',
    'blocker_type',
    'access_reason',
    'blocked_by_interstitial',
    'frame_count',
    'best_candidate_key',
    'best_candidate_rank',
    'best_candidate_detected',
    'best_candidate_score',
    'best_candidate_confidence',
    'best_candidate_selection_mode',
    'best_candidate_base_detected',
    'best_candidate_acceptance_gate_passed',
    'best_candidate_keyword_gate_tier',
    'best_candidate_keyword_evidence_strength',
    'best_candidate_keyword_evidence_signals',
    'best_candidate_explicit_keyword_signal_count',
    'best_candidate_supporting_keyword_signal_count',
    'best_candidate_medium_keyword_signal_count',
    'best_candidate_repeated_structure_support',
    'best_candidate_semantic_support_count',
    'best_candidate_structural_support_count',
    'best_candidate_interaction_support_count',
    'best_candidate_acceptance_gate_reason',
    'best_candidate_heuristic_pseudo_label',
    'best_candidate_heuristic_pseudo_confidence',
    'best_candidate_heuristic_pseudo_reason',
    'best_candidate_heuristic_pseudo_source',
    'best_candidate_ugc_type',
    'best_candidate_human_label',
    'best_candidate_human_notes',
    'best_candidate_human_reviewed_at',
    'best_candidate_matched_signals',
    'best_candidate_penalty_signals',
    'best_candidate_xpath',
    'best_candidate_css_path',
    'best_candidate_sample_text',
  ]);
}

function buildCandidateRows(items) {
  const rows = [];
  (Array.isArray(items) ? items : []).forEach((item) => {
    const reviewSummary = item.candidate_review_summary || {};
    const scanResult = item.scan_result || {};
    const candidates = Array.isArray(item.candidates) ? item.candidates : [];
    candidates.forEach((candidate) => {
      const row = {
        job_id: item.job_id || '',
        item_id: item.id || '',
        row_number: item.row_number,
        input_url: item.input_url || '',
        normalized_url: item.normalized_url || '',
        final_url: item.final_url || '',
        title: item.title || '',
        item_status: item.status || '',
        item_analysis_source: item.analysis_source || '',
        item_ugc_detected: item.ugc_detected,
        item_manual_capture_required: item.manual_capture_required,
        item_manual_captured_at: item.manual_captured_at || '',
        item_candidate_count: candidates.length,
        item_candidate_review_count: reviewSummary.total ?? '',
        item_comment_region_reviews: reviewSummary.comment_region ?? '',
        item_not_comment_reviews: reviewSummary.not_comment_region ?? '',
        item_uncertain_reviews: reviewSummary.uncertain ?? '',
        item_candidate_selection_mode: scanResult.candidate_selection_mode || '',
        item_candidate_selection_limit: scanResult.candidate_selection_limit ?? '',
        item_candidate_review_artifact_limit: scanResult.candidate_review_artifact_limit ?? '',
        item_candidate_heuristic_summary: scanResult.candidate_heuristic_summary || '',
        item_heuristic_best_candidate_key: scanResult.heuristic_best_candidate_key || '',
        item_heuristic_best_candidate_label: scanResult.heuristic_best_candidate_label || '',
        item_heuristic_best_candidate_reason: scanResult.heuristic_best_candidate_reason || '',
        item_manual_uploaded_screenshot_url: item.manual_uploaded_screenshot_url || '',
        item_blocker_type: scanResult.blocker_type || '',
        item_access_reason: scanResult.access_reason || '',
        item_screenshot_url: item.screenshot_url || '',
      };

      Object.keys(candidate || {})
        .sort((left, right) => left.localeCompare(right))
        .forEach((key) => {
          row[key] = normalizeExportValue(candidate[key]);
        });
      rows.push(row);
    });
  });
  return rows;
}

function serializeJobCandidateDetailsCsv(items) {
  return serializeObjectRowsCsv(buildCandidateRows(items), [
    'job_id',
    'item_id',
    'row_number',
    'input_url',
    'normalized_url',
    'final_url',
    'title',
    'item_status',
    'item_analysis_source',
    'item_ugc_detected',
    'item_manual_capture_required',
    'item_manual_captured_at',
    'item_candidate_count',
    'item_candidate_review_count',
    'item_comment_region_reviews',
    'item_not_comment_reviews',
    'item_uncertain_reviews',
    'item_candidate_selection_mode',
    'item_candidate_selection_limit',
    'item_candidate_review_artifact_limit',
    'item_candidate_heuristic_summary',
    'item_heuristic_best_candidate_key',
    'item_heuristic_best_candidate_label',
    'item_heuristic_best_candidate_reason',
    'item_manual_uploaded_screenshot_url',
    'item_blocker_type',
    'item_access_reason',
    'item_screenshot_url',
    'candidate_rank',
    'candidate_key',
    'candidate_selection_mode',
    'detected',
    'score',
    'confidence',
    'heuristic_pseudo_label',
    'heuristic_pseudo_confidence',
    'heuristic_pseudo_reason',
    'heuristic_pseudo_source',
    'base_detected',
    'acceptance_gate_passed',
    'keyword_gate_tier',
    'keyword_evidence_strength',
    'keyword_evidence_signals',
    'explicit_keyword_signal_count',
    'supporting_keyword_signal_count',
    'medium_keyword_signal_count',
    'repeated_structure_support',
    'semantic_support_count',
    'structural_support_count',
    'interaction_support_count',
    'acceptance_gate_reason',
    'ugc_type',
    'matched_signals',
    'penalty_signals',
    'human_label',
    'human_notes',
    'human_reviewed_at',
    'candidate_screenshot_url',
    'xpath',
    'css_path',
    'sample_text',
    'frame_url',
    'frame_key',
    'frame_title',
  ]);
}

function appendSheet(workbook, name, rows, preferredHeaders) {
  const records = Array.isArray(rows) ? rows : [];
  const allKeys = new Set();
  records.forEach((row) => {
    Object.keys(row || {}).forEach((key) => allKeys.add(key));
  });

  const headers = preferredHeaders.filter((key) => allKeys.has(key));
  Array.from(allKeys)
    .filter((key) => !headers.includes(key))
    .sort((left, right) => left.localeCompare(right))
    .forEach((key) => headers.push(key));

  const worksheet = workbook.addWorksheet(name);
  worksheet.columns = headers.map((header) => ({
    header,
    key: header,
    width: Math.min(Math.max(header.length + 4, 16), 42),
  }));

  records.forEach((row) => {
    const normalized = {};
    headers.forEach((header) => {
      normalized[header] = normalizeExportValue(row[header]);
    });
    worksheet.addRow(normalized);
  });

  if (worksheet.rowCount > 0) {
    worksheet.getRow(1).font = { bold: true };
  }
}

async function buildJobReportWorkbook(job, items) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'UGC Scanner';
  workbook.created = new Date();
  appendSheet(workbook, 'Overview', buildJobSummaryRows(job, items), ['section', 'group', 'metric', 'value']);
  appendSheet(workbook, 'Rows', buildJobItemsRows(items), [
    'job_id',
    'row_number',
    'input_url',
    'normalized_url',
    'final_url',
    'title',
    'status',
    'ugc_detected',
    'confidence',
    'ugc_type',
    'score',
    'xpath',
    'css_path',
    'sample_text',
    'candidate_count',
    'candidate_review_count',
    'candidate_selection_mode',
    'candidate_selection_limit',
    'candidate_review_artifact_limit',
    'candidate_heuristic_summary',
    'heuristic_best_candidate_key',
    'heuristic_best_candidate_label',
    'heuristic_best_candidate_reason',
    'analysis_source',
    'manual_capture_required',
    'manual_capture_reason',
    'manual_capture_mode',
    'manual_captured_at',
    'manual_uploaded_screenshot_url',
    'screenshot_url',
    'manual_html_url',
    'manual_raw_html_url',
    'blocked_by_interstitial',
    'blocker_type',
    'access_reason',
  ]);
  appendSheet(workbook, 'SiteBreakdown', buildSiteBreakdownRows(items), [
    'job_id',
    'item_id',
    'row_number',
    'normalized_url',
    'final_url',
    'status',
    'analysis_source',
    'ugc_detected',
    'manual_capture_mode',
    'manual_uploaded_screenshot_url',
    'screenshot_url',
    'best_candidate_score',
    'best_candidate_confidence',
    'best_candidate_base_detected',
    'best_candidate_acceptance_gate_passed',
    'best_candidate_keyword_gate_tier',
    'best_candidate_keyword_evidence_strength',
    'best_candidate_keyword_evidence_signals',
    'best_candidate_acceptance_gate_reason',
    'best_candidate_heuristic_pseudo_label',
    'best_candidate_heuristic_pseudo_confidence',
    'best_candidate_heuristic_pseudo_reason',
    'best_candidate_heuristic_pseudo_source',
    'best_candidate_ugc_type',
    'best_candidate_detected',
    'best_candidate_selection_mode',
    'best_candidate_human_label',
    'best_candidate_matched_signals',
    'best_candidate_penalty_signals',
  ]);
  appendSheet(workbook, 'Candidates', buildCandidateRows(items), [
    'job_id',
    'item_id',
    'row_number',
    'normalized_url',
    'final_url',
    'item_analysis_source',
    'item_manual_uploaded_screenshot_url',
    'item_screenshot_url',
    'item_candidate_selection_limit',
    'item_candidate_review_artifact_limit',
    'item_candidate_heuristic_summary',
    'item_heuristic_best_candidate_key',
    'item_heuristic_best_candidate_label',
    'item_heuristic_best_candidate_reason',
    'candidate_rank',
    'candidate_key',
    'detected',
    'score',
    'confidence',
    'heuristic_pseudo_label',
    'heuristic_pseudo_confidence',
    'heuristic_pseudo_reason',
    'heuristic_pseudo_source',
    'base_detected',
    'acceptance_gate_passed',
    'keyword_gate_tier',
    'keyword_evidence_strength',
    'keyword_evidence_signals',
    'explicit_keyword_signal_count',
    'supporting_keyword_signal_count',
    'medium_keyword_signal_count',
    'repeated_structure_support',
    'semantic_support_count',
    'structural_support_count',
    'interaction_support_count',
    'acceptance_gate_reason',
    'ugc_type',
    'human_label',
    'human_notes',
    'matched_signals',
    'penalty_signals',
    'xpath',
    'css_path',
  ]);
  return workbook.xlsx.writeBuffer();
}

module.exports = {
  escapeCsv,
  serializeJobItemsCsv,
  serializeJobSummaryCsv,
  serializeJobSiteBreakdownCsv,
  serializeJobCandidateDetailsCsv,
  buildJobReportWorkbook,
};
