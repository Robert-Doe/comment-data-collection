'use strict';

const keywordAware = require('./keywordAware');
const keywordAblated = require('./keywordAblated');

const MODEL_VARIANTS = [
  keywordAware,
  keywordAblated,
];

function listModelVariants() {
  return MODEL_VARIANTS.map((variant) => ({ ...variant }));
}

function getModelVariant(variantId) {
  const normalizedId = String(variantId || '').trim();
  return MODEL_VARIANTS.find((variant) => variant.id === normalizedId) || null;
}

module.exports = {
  MODEL_VARIANTS,
  listModelVariants,
  getModelVariant,
};
