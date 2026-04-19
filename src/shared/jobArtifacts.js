'use strict';

const fs = require('fs/promises');
const path = require('path');
const { buildArtifactUrl } = require('./manualCapture');

const ARTIFACT_FIELD_PAIRS = [
  ['candidate_screenshot_path', 'candidate_screenshot_url'],
  ['screenshot_path', 'screenshot_url'],
  ['manual_uploaded_screenshot_path', 'manual_uploaded_screenshot_url'],
  ['manual_html_path', 'manual_html_url'],
  ['manual_raw_html_path', 'manual_raw_html_url'],
];

function isUnderArtifactRoot(artifactRoot, absolutePath) {
  if (!artifactRoot || !absolutePath) {
    return false;
  }

  const resolvedRoot = path.resolve(artifactRoot);
  const resolvedPath = path.resolve(absolutePath);
  const relative = path.relative(resolvedRoot, resolvedPath);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}

async function copyArtifactReference(sourcePath, options = {}) {
  const artifactRoot = options.artifactRoot ? path.resolve(options.artifactRoot) : '';
  const destinationJobId = String(options.jobId || '').trim();
  if (!artifactRoot || !destinationJobId || !sourcePath || !isUnderArtifactRoot(artifactRoot, sourcePath)) {
    return null;
  }

  const copyCache = options.copyCache || new Map();
  if (options.copyCache !== copyCache) {
    options.copyCache = copyCache;
  }
  if (copyCache.has(sourcePath)) {
    return copyCache.get(sourcePath);
  }

  const resolvedSourcePath = path.resolve(sourcePath);
  const relativePath = path.relative(artifactRoot, resolvedSourcePath);
  if (!relativePath || relativePath.startsWith('..')) {
    return null;
  }

  const parts = relativePath.split(path.sep);
  if (parts.length < 2) {
    return null;
  }

  parts[1] = destinationJobId;
  const destinationRelativePath = path.join(...parts);
  const destinationPath = path.join(artifactRoot, destinationRelativePath);

  try {
    await fs.mkdir(path.dirname(destinationPath), { recursive: true });
    await fs.copyFile(resolvedSourcePath, destinationPath);
  } catch (error) {
    return null;
  }

  const copied = {
    path: destinationPath,
    url: buildArtifactUrl(destinationRelativePath, options),
    relativePath: destinationRelativePath,
  };
  copyCache.set(sourcePath, copied);
  return copied;
}

async function cloneValueWithArtifactCopies(value, options = {}) {
  if (Array.isArray(value)) {
    const cloned = [];
    for (const entry of value) {
      cloned.push(await cloneValueWithArtifactCopies(entry, options));
    }
    return cloned;
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const cloned = {};
  for (const [key, entry] of Object.entries(value)) {
    cloned[key] = await cloneValueWithArtifactCopies(entry, options);
  }

  for (const [pathKey, urlKey] of ARTIFACT_FIELD_PAIRS) {
    const sourcePath = typeof value[pathKey] === 'string' ? value[pathKey].trim() : '';
    if (!sourcePath) {
      continue;
    }

    const copied = await copyArtifactReference(sourcePath, {
      ...options,
      sourceUrl: typeof value[urlKey] === 'string' ? value[urlKey] : '',
    });
    if (copied) {
      cloned[pathKey] = copied.path;
      if (urlKey) {
        cloned[urlKey] = copied.url;
      }
    }
  }

  return cloned;
}

module.exports = {
  ARTIFACT_FIELD_PAIRS,
  cloneValueWithArtifactCopies,
  copyArtifactReference,
  isUnderArtifactRoot,
};
