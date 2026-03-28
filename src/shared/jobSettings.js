'use strict';

function toNumber(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampNumber(value, fallback, min, max) {
  const parsed = toNumber(value, fallback);
  return Math.max(min, Math.min(max, parsed));
}

function normalizeJobScanSettings(input = {}, defaults = {}) {
  const defaultScanDelayMs = clampNumber(defaults.scanDelayMs, 6000, 0, 120000);
  const defaultScreenshotDelayMs = clampNumber(defaults.screenshotDelayMs, 1500, 0, 60000);
  return {
    scanDelayMs: clampNumber(
      input.scanDelayMs !== undefined ? input.scanDelayMs : input.postLoadDelayMs,
      defaultScanDelayMs,
      0,
      120000,
    ),
    screenshotDelayMs: clampNumber(
      input.screenshotDelayMs !== undefined ? input.screenshotDelayMs : input.preScreenshotDelayMs,
      defaultScreenshotDelayMs,
      0,
      60000,
    ),
  };
}

function extractJobScanSettings(job = {}, defaults = {}) {
  return normalizeJobScanSettings({
    scanDelayMs: job.scan_delay_ms !== undefined ? job.scan_delay_ms : job.scanDelayMs,
    screenshotDelayMs: job.screenshot_delay_ms !== undefined ? job.screenshot_delay_ms : job.screenshotDelayMs,
  }, defaults);
}

module.exports = {
  normalizeJobScanSettings,
  extractJobScanSettings,
};
