'use strict';

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const { analyzeHtmlSnapshot } = require('./scanner');

function sanitizeSegment(value, fallback = 'item') {
  const cleaned = String(value || '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || fallback;
}

function toPosixPath(value) {
  return String(value || '').replace(/\\/g, '/');
}

function buildArtifactUrl(relativePath, options = {}) {
  if (!relativePath) return '';
  const basePath = String(options.artifactUrlBasePath || '/artifacts').replace(/\/$/, '');
  const publicPath = `${basePath}/${toPosixPath(relativePath).replace(/^\/+/, '')}`;
  const publicBaseUrl = String(options.publicBaseUrl || '').replace(/\/$/, '');
  return publicBaseUrl ? `${publicBaseUrl}${publicPath}` : publicPath;
}

function extensionFromUpload(filename = '', contentType = '') {
  const lowerName = String(filename || '').toLowerCase();
  const lowerType = String(contentType || '').toLowerCase();

  if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg') || lowerType.includes('jpeg')) return '.jpg';
  if (lowerName.endsWith('.webp') || lowerType.includes('webp')) return '.webp';
  if (lowerName.endsWith('.gif') || lowerType.includes('gif')) return '.gif';
  return '.png';
}

async function writeArtifact(root, relativePath, value, encoding) {
  const absolutePath = path.join(root, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, value, encoding);
  return absolutePath;
}

async function storeManualCaptureArtifacts(capture, options = {}) {
  if (!options.artifactRoot) {
    throw new Error('artifactRoot is required for manual capture storage');
  }

  const itemHash = crypto.createHash('sha1')
    .update(`${capture.jobId || ''}:${capture.itemId || ''}:${capture.captureUrl || ''}`)
    .digest('hex')
    .slice(0, 8);
  const jobSegment = sanitizeSegment(capture.jobId || 'manual-job', 'manual-job');
  const rowSegment = sanitizeSegment(capture.rowNumber || capture.itemId || itemHash, itemHash);
  const itemSegment = sanitizeSegment(capture.itemId || itemHash, itemHash);
  const artifactVersion = sanitizeSegment(
    capture.captureRevision || `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    'capture',
  );
  const baseDir = path.join('manual-captures', jobSegment, `${rowSegment}-${itemSegment}`, artifactVersion);
  const snapshotMode = String(capture.snapshotMode || 'dom_html');
  const renderedHtml = String(capture.html || capture.rawHtml || '');

  const manualHtmlRelativePath = path.join(baseDir, 'snapshot.html');
  const manualHtmlPath = await writeArtifact(options.artifactRoot, manualHtmlRelativePath, renderedHtml, 'utf8');

  let manualRawHtmlRelativePath = '';
  let manualRawHtmlPath = '';
  const rawHtml = String(capture.rawHtml || '');
  if (rawHtml.trim()) {
    manualRawHtmlRelativePath = path.join(baseDir, 'snapshot.raw.html');
    manualRawHtmlPath = await writeArtifact(options.artifactRoot, manualRawHtmlRelativePath, rawHtml, 'utf8');
  }

  let manualScreenshotRelativePath = '';
  let manualScreenshotPath = '';
  if (capture.screenshotBuffer && capture.screenshotBuffer.length) {
    manualScreenshotRelativePath = path.join(
      baseDir,
      `snapshot${extensionFromUpload(capture.screenshotFilename, capture.screenshotContentType)}`,
    );
    manualScreenshotPath = await writeArtifact(options.artifactRoot, manualScreenshotRelativePath, capture.screenshotBuffer);
  }

  const metadataRelativePath = path.join(baseDir, 'capture.json');
  const metadata = {
    jobId: capture.jobId || '',
    itemId: capture.itemId || '',
    rowNumber: capture.rowNumber || '',
    captureUrl: capture.captureUrl || '',
    title: capture.title || '',
    notes: capture.notes || '',
    snapshotMode,
    capturedAt: new Date().toISOString(),
    artifactVersion,
  };
  await writeArtifact(options.artifactRoot, metadataRelativePath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');

  return {
    artifact_version: artifactVersion,
    manual_html_path: manualHtmlPath,
    manual_html_url: buildArtifactUrl(manualHtmlRelativePath, options),
    manual_raw_html_path: manualRawHtmlPath,
    manual_raw_html_url: buildArtifactUrl(manualRawHtmlRelativePath, options),
    manual_capture_mode: snapshotMode,
    manual_uploaded_screenshot_path: manualScreenshotPath,
    manual_uploaded_screenshot_url: buildArtifactUrl(manualScreenshotRelativePath, options),
  };
}

async function analyzeManualCapture(capture, options = {}) {
  const html = String(capture.html || '');
  const rawHtml = String(capture.rawHtml || '');
  if (!html.trim() && !rawHtml.trim()) {
    throw new Error('Manual capture HTML is required');
  }

  const artifacts = await storeManualCaptureArtifacts(capture, options);
  const scanResult = await analyzeHtmlSnapshot({
    html: html.trim() || rawHtml,
    raw_html: rawHtml,
    normalized_url: capture.captureUrl || '',
    final_url: capture.captureUrl || '',
    capture_url: capture.captureUrl || '',
    title: capture.title || '',
    notes: capture.notes || '',
    manual_uploaded_screenshot_path: artifacts.manual_uploaded_screenshot_path,
    manual_uploaded_screenshot_url: artifacts.manual_uploaded_screenshot_url,
    manual_html_path: artifacts.manual_html_path,
    manual_html_url: artifacts.manual_html_url,
    manual_raw_html_path: artifacts.manual_raw_html_path,
    manual_raw_html_url: artifacts.manual_raw_html_url,
  }, {
    ...options,
    jobId: capture.jobId,
    itemId: capture.itemId,
    rowNumber: capture.rowNumber,
    candidateMode: capture.candidateMode || options.candidateMode || 'default',
    artifactVersion: artifacts.artifact_version,
  });

  scanResult.analysis_source = 'manual_snapshot';
  scanResult.manual_capture_required = false;
  scanResult.manual_capture_reason = '';
  scanResult.manual_html_path = artifacts.manual_html_path;
  scanResult.manual_html_url = artifacts.manual_html_url;
  scanResult.manual_raw_html_path = artifacts.manual_raw_html_path;
  scanResult.manual_raw_html_url = artifacts.manual_raw_html_url;
  scanResult.manual_uploaded_screenshot_path = artifacts.manual_uploaded_screenshot_path;
  scanResult.manual_uploaded_screenshot_url = artifacts.manual_uploaded_screenshot_url;
  scanResult.manual_capture_mode = artifacts.manual_capture_mode;
  scanResult.manual_capture_url = capture.captureUrl || '';
  scanResult.manual_capture_title = capture.title || '';
  scanResult.manual_capture_notes = capture.notes || '';

  return {
    scanResult,
    artifacts,
  };
}

module.exports = {
  buildArtifactUrl,
  storeManualCaptureArtifacts,
  analyzeManualCapture,
};
