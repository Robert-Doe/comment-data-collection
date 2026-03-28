'use strict';

const { instance } = require('@viz-js/viz');

let vizPromise;

async function getViz() {
  if (!vizPromise) {
    vizPromise = instance();
  }
  return vizPromise;
}

async function renderDotToSvg(dot, options = {}) {
  const source = String(dot || '');
  if (!source.trim()) {
    throw new Error('DOT source is required');
  }

  const viz = await getViz();
  return viz.renderString(source, {
    format: 'svg',
    engine: options.engine || 'dot',
  });
}

module.exports = {
  renderDotToSvg,
};
