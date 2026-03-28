'use strict';

const VALID_REVIEW_LABELS = new Set([
  'comment_region',
  'not_comment_region',
  'uncertain',
]);

function normalizeCandidateReviewLabel(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return VALID_REVIEW_LABELS.has(normalized) ? normalized : '';
}

function normalizeCandidateKey(value) {
  return String(value || '').trim();
}

function normalizeCandidateReviews(reviews) {
  if (!Array.isArray(reviews)) return [];
  return reviews
    .filter((review) => review && typeof review === 'object')
    .map((review) => ({
      candidate_key: normalizeCandidateKey(review.candidate_key || review.candidateKey),
      label: normalizeCandidateReviewLabel(review.label),
      notes: String(review.notes || ''),
      xpath: String(review.xpath || ''),
      css_path: String(review.css_path || ''),
      candidate_rank: Number(review.candidate_rank) || 0,
      source: String(review.source || 'human_review'),
      created_at: String(review.created_at || review.createdAt || ''),
      updated_at: String(review.updated_at || review.updatedAt || ''),
    }))
    .filter((review) => review.candidate_key);
}

function buildCandidateReviewIndex(reviews) {
  const index = new Map();
  normalizeCandidateReviews(reviews).forEach((review) => {
    index.set(review.candidate_key, review);
  });
  return index;
}

function applyCandidateReviews(candidates, reviews) {
  const reviewIndex = buildCandidateReviewIndex(reviews);
  return (Array.isArray(candidates) ? candidates : []).map((candidate, index) => {
    const candidateKey = normalizeCandidateKey(candidate.candidate_key || candidate.candidateKey);
    const review = candidateKey ? reviewIndex.get(candidateKey) : null;
    return {
      ...candidate,
      candidate_key: candidateKey,
      candidate_rank: Number(candidate.candidate_rank) || index + 1,
      human_label: review ? review.label : '',
      human_notes: review ? review.notes : '',
      human_reviewed_at: review ? (review.updated_at || review.created_at || '') : '',
      human_review_source: review ? review.source : '',
    };
  });
}

function summarizeCandidateReviews(reviews) {
  const normalized = normalizeCandidateReviews(reviews);
  return normalized.reduce((summary, review) => {
    summary.total += 1;
    if (review.label === 'comment_region') summary.comment_region += 1;
    if (review.label === 'not_comment_region') summary.not_comment_region += 1;
    if (review.label === 'uncertain') summary.uncertain += 1;
    return summary;
  }, {
    total: 0,
    comment_region: 0,
    not_comment_region: 0,
    uncertain: 0,
  });
}

function upsertCandidateReview(existingReviews, reviewInput) {
  const nextLabel = normalizeCandidateReviewLabel(reviewInput && reviewInput.label);
  const candidateKey = normalizeCandidateKey(reviewInput && reviewInput.candidate_key);
  if (!candidateKey) {
    throw new Error('candidate_key is required');
  }

  const existing = normalizeCandidateReviews(existingReviews);
  const now = new Date().toISOString();
  const nextReviews = existing.filter((review) => review.candidate_key !== candidateKey);

  if (!nextLabel) {
    return nextReviews;
  }

  const previous = existing.find((review) => review.candidate_key === candidateKey);
  nextReviews.push({
    candidate_key: candidateKey,
    label: nextLabel,
    notes: String(reviewInput && reviewInput.notes || ''),
    xpath: String(reviewInput && reviewInput.xpath || (previous ? previous.xpath : '') || ''),
    css_path: String(reviewInput && reviewInput.css_path || (previous ? previous.css_path : '') || ''),
    candidate_rank: Number(reviewInput && reviewInput.candidate_rank) || (previous ? previous.candidate_rank : 0) || 0,
    source: String(reviewInput && reviewInput.source || (previous ? previous.source : '') || 'human_review'),
    created_at: previous ? (previous.created_at || previous.updated_at || now) : now,
    updated_at: now,
  });

  nextReviews.sort((left, right) => (
    (left.candidate_rank || 0) - (right.candidate_rank || 0)
      || String(left.candidate_key).localeCompare(String(right.candidate_key))
  ));
  return nextReviews;
}

module.exports = {
  VALID_REVIEW_LABELS,
  normalizeCandidateReviewLabel,
  normalizeCandidateReviews,
  buildCandidateReviewIndex,
  applyCandidateReviews,
  summarizeCandidateReviews,
  upsertCandidateReview,
};
