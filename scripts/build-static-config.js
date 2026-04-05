'use strict';

const fs = require('fs');
const path = require('path');

const outputPath = path.resolve(__dirname, '..', 'web', 'config.js');
const apiBaseUrl = process.env.API_BASE_URL || '';
const buildVersion = process.env.BUILD_VERSION || `${Date.now().toString(36)}`;

fs.writeFileSync(
  outputPath,
  `window.__APP_CONFIG__ = ${JSON.stringify({ apiBaseUrl, buildVersion }, null, 2)};\n`,
  'utf8',
);

console.log(`Wrote ${outputPath}`);
