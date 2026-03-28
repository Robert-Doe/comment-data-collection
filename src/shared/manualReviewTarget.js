'use strict';

const { scoreItemAgainstUrl } = require('./manualReviewLookup');

const MANUAL_TARGET_MAX_AGE_MS = 30 * 60 * 1000;

function expectedManualCaptureUrl(item, selection) {
  return String(
    (selection && selection.capture_url)
      || (item && item.manual_capture_url)
      || (item && item.final_url)
      || (item && item.normalized_url)
      || (item && item.input_url)
      || '',
  );
}

function buildManualReviewTarget(selection, item, rawUrl) {
  if (!selection || !item) return null;

  const selectedAt = selection.updated_at || selection.created_at || '';
  const selectedTime = selectedAt ? new Date(selectedAt).getTime() : NaN;
  const ageMs = Number.isFinite(selectedTime)
    ? Math.max(0, Date.now() - selectedTime)
    : null;
  const isRecent = typeof ageMs === 'number' && ageMs <= MANUAL_TARGET_MAX_AGE_MS;
  const expectedUrl = expectedManualCaptureUrl(item, selection);
  const lookupScore = scoreItemAgainstUrl({
    manual_capture_url: expectedUrl,
    final_url: item.final_url,
    normalized_url: item.normalized_url,
    input_url: item.input_url,
    manual_capture_required: item.manual_capture_required,
    analysis_source: item.analysis_source,
  }, rawUrl);

  return {
    selection_key: selection.selection_key || 'latest',
    job_id: item.job_id || selection.job_id || '',
    item_id: item.id || selection.item_id || '',
    capture_url: expectedUrl,
    title: selection.title || item.manual_capture_title || item.title || '',
    created_at: selection.created_at || '',
    updated_at: selection.updated_at || '',
    age_ms: ageMs,
    is_recent: !!isRecent,
    lookup_score: lookupScore,
    url_matches_expected: lookupScore >= 60,
    item: {
      ...item,
      lookup_score: lookupScore,
      lookup_source: 'manual_target',
    },
  };
}

function mergeManualTargetMatch(matches, manualTarget) {
  const rankedMatches = Array.isArray(matches) ? matches.slice() : [];
  const limit = Math.max(rankedMatches.length, 1);
  const shouldPromoteTarget = !!(
    manualTarget
      && manualTarget.item
      && manualTarget.is_recent
      && manualTarget.lookup_score >= 60
  );

  if (shouldPromoteTarget) {
    const targetId = String(manualTarget.item.id || '');
    const deduped = rankedMatches.filter((item) => String(item.id || '') !== targetId);
    deduped.unshift(manualTarget.item);
    return {
      selected: manualTarget.item,
      matches: deduped.slice(0, limit),
    };
  }

  return {
    selected: rankedMatches[0] || null,
    matches: rankedMatches,
  };
}

module.exports = {
  MANUAL_TARGET_MAX_AGE_MS,
  expectedManualCaptureUrl,
  buildManualReviewTarget,
  mergeManualTargetMatch,
};
