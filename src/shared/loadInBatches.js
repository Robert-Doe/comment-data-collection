'use strict';

function emitProgress(progress, patch) {
  if (typeof progress !== 'function') {
    return;
  }

  try {
    progress(patch);
  } catch (_) {
    // Monitoring should never break request handling.
  }
}

async function loadInBatches(fetchBatch, options = {}) {
  if (typeof fetchBatch !== 'function') {
    throw new TypeError('fetchBatch must be a function');
  }

  const batchSize = Math.max(1, Number(options.batchSize) || 250);
  const startOffset = Math.max(0, Number(options.offset) || 0);
  const totalValue = Number(options.total);
  const total = Number.isFinite(totalValue) && totalValue > 0 ? totalValue : null;
  const label = String(options.label || 'items').trim() || 'items';
  const progress = typeof options.progress === 'function' ? options.progress : null;
  const startMessage = String(options.startMessage || `Loading ${label}`).trim();
  const doneMessage = String(options.doneMessage || `Loaded ${label}`).trim();
  const loadedMessage = typeof options.loadedMessage === 'function'
    ? options.loadedMessage
    : (count, knownTotal) => `Loaded ${count}${knownTotal ? `/${knownTotal}` : ''} ${label}`;

  const items = [];
  let offset = startOffset;

  emitProgress(progress, {
    stage: 'loading',
    message: startMessage,
    progress: {
      current: 0,
      total,
      unit: label,
      indeterminate: total === null,
    },
  });

  while (true) {
    const batch = await fetchBatch({
      limit: batchSize,
      offset,
      batchIndex: Math.floor((offset - startOffset) / batchSize),
      loadedCount: items.length,
    });
    const page = Array.isArray(batch) ? batch : [];
    if (!page.length) {
      break;
    }

    items.push(...page);
    offset += page.length;

    emitProgress(progress, {
      stage: 'loading',
      message: loadedMessage(items.length, total),
      progress: {
        current: items.length,
        total,
        unit: label,
        indeterminate: total === null,
      },
    });

    if (page.length < batchSize) {
      break;
    }
  }

  emitProgress(progress, {
    stage: 'loading',
    message: `${doneMessage}${items.length ? ` (${items.length})` : ''}`,
    progress: {
      current: items.length,
      total: total || items.length || null,
      unit: label,
      indeterminate: false,
    },
  });

  return items;
}

module.exports = {
  loadInBatches,
};
