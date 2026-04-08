'use strict';

function normalizeSearchText(value) {
  return String(value == null ? '' : value).trim();
}

function splitSearchTerms(value, maxTerms = 5) {
  return normalizeSearchText(value)
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean)
    .slice(0, Math.max(1, Number(maxTerms) || 5));
}

function escapeLikePattern(value) {
  return String(value == null ? '' : value).replace(/[\\%_]/g, '\\$&');
}

function buildSearchClause(columns, query, params) {
  const terms = splitSearchTerms(query);
  if (!terms.length) {
    return '';
  }

  const columnList = Array.isArray(columns)
    ? columns.map((column) => String(column || '').trim()).filter(Boolean)
    : [];
  if (!columnList.length) {
    return '';
  }

  const clauses = terms.map((term) => {
    params.push(`%${escapeLikePattern(term)}%`);
    const placeholder = `$${params.length}`;
    return `(${columnList.map((column) => `COALESCE(CAST(${column} AS TEXT), '') ILIKE ${placeholder}`).join(' OR ')})`;
  });

  return clauses.join(' AND ');
}

function valueToSearchText(value) {
  if (value == null) {
    return '';
  }
  if (typeof value === 'string') {
    return value.toLowerCase();
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value).toLowerCase();
  }
  if (Array.isArray(value)) {
    return value.map(valueToSearchText).join(' ');
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value).toLowerCase();
    } catch (_) {
      return String(value).toLowerCase();
    }
  }
  return String(value).toLowerCase();
}

function recordMatchesQuery(record, query, keys) {
  const terms = splitSearchTerms(query);
  if (!terms.length) {
    return true;
  }

  const keyList = Array.isArray(keys)
    ? keys.map((key) => String(key || '').trim()).filter(Boolean)
    : [];
  if (!keyList.length) {
    return false;
  }

  const haystack = keyList
    .map((key) => valueToSearchText(record && record[key]))
    .join(' ');

  return terms.every((term) => haystack.includes(term.toLowerCase()));
}

module.exports = {
  buildSearchClause,
  escapeLikePattern,
  normalizeSearchText,
  recordMatchesQuery,
  splitSearchTerms,
  valueToSearchText,
};
