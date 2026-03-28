'use strict';

const { normalizeInputUrl } = require('./csv');

function stripTrackingParams(url) {
  const keysToDrop = [
    'fbclid',
    'gclid',
    'igshid',
    'mc_cid',
    'mc_eid',
    'ref',
    'ref_src',
    'source',
    'src',
    'si',
    'spm',
  ];

  keysToDrop.forEach((key) => {
    url.searchParams.delete(key);
  });

  Array.from(url.searchParams.keys())
    .filter((key) => /^utm_/i.test(key))
    .forEach((key) => url.searchParams.delete(key));
}

function parseLookupUrl(rawUrl) {
  const normalized = normalizeInputUrl(rawUrl || '');
  if (!normalized) return null;

  try {
    const url = new URL(normalized);
    stripTrackingParams(url);
    url.hash = '';

    if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80')) {
      url.port = '';
    }

    const sortedEntries = Array.from(url.searchParams.entries()).sort(([left], [right]) => left.localeCompare(right));
    url.search = '';
    sortedEntries.forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });

    const pathname = url.pathname.replace(/\/+$/, '') || '/';
    const importantKeys = ['v', 'id', 'p', 'story_fbid', 'comment_id', 'review_id', 'thread_id'];
    const importantParams = {};
    importantKeys.forEach((key) => {
      const value = url.searchParams.get(key);
      if (value) importantParams[key] = value;
    });

    return {
      raw: rawUrl || '',
      normalized,
      href: url.toString(),
      origin: url.origin,
      host: url.host,
      pathname,
      pathKey: `${url.origin}${pathname}`,
      importantParams,
    };
  } catch (_) {
    return {
      raw: rawUrl || '',
      normalized,
      href: normalized,
      origin: '',
      host: '',
      pathname: normalized,
      pathKey: normalized,
      importantParams: {},
    };
  }
}

function countSharedImportantParams(left, right) {
  const keys = new Set([
    ...Object.keys(left || {}),
    ...Object.keys(right || {}),
  ]);

  let matches = 0;
  keys.forEach((key) => {
    if (left[key] && right[key] && left[key] === right[key]) {
      matches += 1;
    }
  });
  return matches;
}

function scoreItemAgainstUrl(item, rawUrl) {
  const target = parseLookupUrl(rawUrl);
  if (!target) return 0;

  const candidateUrls = [
    item.manual_capture_url,
    item.final_url,
    item.normalized_url,
    item.input_url,
  ].filter(Boolean);

  let bestScore = 0;
  candidateUrls.forEach((candidateUrl) => {
    const candidate = parseLookupUrl(candidateUrl);
    if (!candidate) return;

    if (candidate.href === target.href) {
      bestScore = Math.max(bestScore, 100);
      return;
    }

    if (candidate.pathKey === target.pathKey) {
      const sharedImportant = countSharedImportantParams(candidate.importantParams, target.importantParams);
      bestScore = Math.max(bestScore, sharedImportant > 0 ? 95 : 85);
      return;
    }

    if (candidate.origin && target.origin && candidate.origin === target.origin) {
      const leftSegments = candidate.pathname.split('/').filter(Boolean);
      const rightSegments = target.pathname.split('/').filter(Boolean);
      if (leftSegments.length && rightSegments.length) {
        const lastLeft = leftSegments[leftSegments.length - 1];
        const lastRight = rightSegments[rightSegments.length - 1];
        if (lastLeft === lastRight) {
          bestScore = Math.max(bestScore, 72);
          return;
        }
      }
    }

    if (candidate.host && target.host && candidate.host === target.host) {
      bestScore = Math.max(bestScore, 60);
    }
  });

  if (item.manual_capture_required) {
    bestScore += 5;
  }
  if (item.analysis_source === 'manual_snapshot') {
    bestScore -= 10;
  }

  return bestScore;
}

function findManualReviewMatches(items, rawUrl, limit = 5) {
  return (items || [])
    .map((item) => ({
      ...item,
      lookup_score: scoreItemAgainstUrl(item, rawUrl),
    }))
    .filter((item) => item.lookup_score >= 60)
    .sort((left, right) => (
      (right.lookup_score || 0) - (left.lookup_score || 0)
        || Number(!!right.manual_capture_required) - Number(!!left.manual_capture_required)
        || String(right.job_id || '').localeCompare(String(left.job_id || ''))
        || (left.row_number || 0) - (right.row_number || 0)
    ))
    .slice(0, limit);
}

module.exports = {
  parseLookupUrl,
  scoreItemAgainstUrl,
  findManualReviewMatches,
};
