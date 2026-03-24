'use strict';

const fs = require('fs');
const path = require('path');

function normalizeHeader(value) {
  return String(value || '')
    .trim()
    .replace(/^\uFEFF/, '')
    .replace(/\s+/g, '_')
    .toLowerCase();
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (char === '\r') {
      continue;
    } else {
      cell += char;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function rowsToObjects(rows) {
  if (!rows.length) return [];
  const headers = rows[0].map((header, index) => normalizeHeader(header || `column_${index + 1}`));
  return rows.slice(1)
    .filter((row) => row.some((value) => String(value || '').trim() !== ''))
    .map((row, index) => {
      const record = { __row_number: index + 2 };
      headers.forEach((header, headerIndex) => {
        record[header] = row[headerIndex] !== undefined ? String(row[headerIndex]) : '';
      });
      return record;
    });
}

function detectUrlColumn(records, preferredColumn) {
  if (!records.length) return '';
  const headers = Object.keys(records[0]).filter((key) => !key.startsWith('__'));

  if (preferredColumn) {
    const normalized = normalizeHeader(preferredColumn);
    if (headers.includes(normalized)) return normalized;
    throw new Error(`URL column "${preferredColumn}" was not found in CSV headers`);
  }

  const candidates = ['url', 'site', 'website', 'link', 'href', 'domain'];
  for (const candidate of candidates) {
    if (headers.includes(candidate)) return candidate;
  }

  return headers[0] || '';
}

function normalizeInputUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^\/\//.test(raw)) return `https:${raw}`;
  if (/^[\w.-]+\.[a-z]{2,}(?:[\/?#]|$)/i.test(raw)) return `https://${raw}`;
  return raw;
}

function parseCsvText(rawText, preferredColumn = '') {
  const text = String(rawText || '');
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  if (lines.length && !lines[0].includes(',') && lines.every((line) => /^([a-z]+:)?\/\//i.test(line) || /^[\w.-]+\.[a-z]{2,}/i.test(line))) {
    return {
      urlColumn: 'url',
      records: lines.map((line, index) => ({
        __row_number: index + 1,
        url: line,
        __input_url: line,
        __normalized_url: normalizeInputUrl(line),
      })),
    };
  }

  const records = rowsToObjects(parseCsv(text));
  const urlColumn = detectUrlColumn(records, preferredColumn);
  return {
    urlColumn,
    records: records.map((record) => ({
      ...record,
      __input_url: record[urlColumn],
      __normalized_url: normalizeInputUrl(record[urlColumn]),
    })),
  };
}

function loadRecordsFromFile(inputPath, preferredColumn = '') {
  const absolutePath = path.resolve(process.cwd(), inputPath);
  const raw = fs.readFileSync(absolutePath, 'utf8');
  const parsed = parseCsvText(raw, preferredColumn);
  return {
    inputPath: absolutePath,
    urlColumn: parsed.urlColumn,
    records: parsed.records,
  };
}

module.exports = {
  parseCsv,
  rowsToObjects,
  normalizeHeader,
  detectUrlColumn,
  normalizeInputUrl,
  parseCsvText,
  loadRecordsFromFile,
};
