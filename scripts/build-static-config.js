'use strict';

const fs = require('fs');
const path = require('path');

const outputPath = path.resolve(__dirname, '..', 'web', 'config.js');
const apiBaseUrl = process.env.API_BASE_URL || '';

fs.writeFileSync(
  outputPath,
  `window.__APP_CONFIG__ = ${JSON.stringify({ apiBaseUrl }, null, 2)};\n`,
  'utf8',
);

console.log(`Wrote ${outputPath}`);
