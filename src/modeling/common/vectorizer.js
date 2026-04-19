'use strict';

function normalizeCategoryValue(value) {
  const text = String(value || '').trim();
  return text || '__missing__';
}

function fitVectorizer(rows, featureCatalog) {
  const descriptors = [];
  const numericStats = {};
  const categoricalMaps = {};
  let index = 0;

  (Array.isArray(featureCatalog) ? featureCatalog : []).forEach((entry) => {
    if (entry.type === 'number' || entry.type === 'boolean') {
      const values = (Array.isArray(rows) ? rows : [])
        .map((row) => row && row.feature_values ? Number(row.feature_values[entry.key]) || 0 : 0);
      const mean = entry.type === 'number' && values.length
        ? values.reduce((sum, value) => sum + value, 0) / values.length
        : 0;
      const variance = entry.type === 'number' && values.length
        ? values.reduce((sum, value) => {
          const delta = value - mean;
          return sum + (delta * delta);
        }, 0) / values.length
        : 0;
      const std = entry.type === 'number' && variance > 0
        ? Math.sqrt(variance)
        : 1;

      numericStats[entry.key] = {
        mean,
        std: std || 1,
      };
      descriptors.push({
        index,
        feature_key: entry.key,
        output_key: entry.key,
        title: entry.title,
        family: entry.family,
        type: entry.type,
      });
      index += 1;
      return;
    }

    if (entry.type === 'categorical') {
      const categories = Array.from(new Set((Array.isArray(rows) ? rows : [])
        .map((row) => normalizeCategoryValue(row && row.feature_values ? row.feature_values[entry.key] : ''))))
        .sort((left, right) => left.localeCompare(right));

      categoricalMaps[entry.key] = categories;
      categories.forEach((category) => {
        descriptors.push({
          index,
          feature_key: entry.key,
          output_key: `${entry.key}=${category}`,
          title: `${entry.title}: ${category}`,
          family: entry.family,
          type: entry.type,
          category,
        });
        index += 1;
      });
    }
  });

  return {
    featureCatalog: (featureCatalog || []).map((entry) => ({ ...entry })),
    descriptors,
    numericStats,
    categoricalMaps,
    dimension: descriptors.length,
  };
}

function transformRow(row, vectorizer) {
  const vector = new Array(vectorizer.dimension).fill(0);
  const featureValues = row && row.feature_values ? row.feature_values : {};

  vectorizer.descriptors.forEach((descriptor) => {
    if (descriptor.type === 'number') {
      const raw = Number(featureValues[descriptor.feature_key]) || 0;
      const stats = vectorizer.numericStats[descriptor.feature_key] || { mean: 0, std: 1 };
      vector[descriptor.index] = (raw - stats.mean) / (stats.std || 1);
      return;
    }

    if (descriptor.type === 'boolean') {
      vector[descriptor.index] = featureValues[descriptor.feature_key] ? 1 : 0;
      return;
    }

    if (descriptor.type === 'categorical') {
      const categoryValue = normalizeCategoryValue(featureValues[descriptor.feature_key]);
      vector[descriptor.index] = categoryValue === descriptor.category ? 1 : 0;
    }
  });

  return vector;
}

function transformRows(rows, vectorizer) {
  return (Array.isArray(rows) ? rows : []).map((row) => transformRow(row, vectorizer));
}

module.exports = {
  fitVectorizer,
  transformRow,
  transformRows,
};
