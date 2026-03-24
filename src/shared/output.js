'use strict';

function escapeCsv(value) {
  const text = String(value ?? '');
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function serializeJobItemsCsv(items) {
  const headers = [
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
    'screenshot_url',
    'screenshot_path',
    'error_message',
  ];

  const lines = [headers.join(',')];
  items.forEach((item) => {
    const row = [
      item.row_number,
      item.input_url,
      item.normalized_url,
      item.final_url || '',
      item.title || '',
      item.status || '',
      item.ugc_detected,
      item.best_confidence || '',
      item.best_ugc_type || '',
      item.best_score ?? '',
      item.best_xpath || '',
      item.best_css_path || '',
      item.best_sample_text || '',
      item.screenshot_url || '',
      item.screenshot_path || '',
      item.error_message || '',
    ].map(escapeCsv);
    lines.push(row.join(','));
  });

  return lines.join('\n');
}

module.exports = {
  escapeCsv,
  serializeJobItemsCsv,
};
