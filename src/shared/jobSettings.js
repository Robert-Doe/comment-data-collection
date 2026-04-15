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

function normalizeCandidateSelectionMode(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized || normalized === 'default' || normalized === 'baseline' || normalized === 'current') {
    return 'default';
  }

  if (
    normalized === 'research'
    || normalized === 'repetition_first'
    || normalized === 'repetition-first'
    || normalized === 'repetition_only'
    || normalized === 'repetition-only'
    || normalized === 'structure_first'
    || normalized === 'structure-first'
  ) {
    return 'repetition_first';
  }

  return 'default';
}

function normalizeJobScanSettings(input = {}, defaults = {}) {
  const defaultScanDelayMs = clampNumber(defaults.scanDelayMs, 750, 0, 120000);
  const defaultScreenshotDelayMs = clampNumber(defaults.screenshotDelayMs, 250, 0, 60000);
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
    candidateMode: normalizeCandidateSelectionMode(
      input.candidateMode !== undefined
        ? input.candidateMode
        : (
          input.candidateSelectionMode !== undefined
            ? input.candidateSelectionMode
            : (
              input.scanMode !== undefined
                ? input.scanMode
                : defaults.candidateMode
            )
        ),
    ),
  };
}

function extractJobScanSettings(job = {}, defaults = {}) {
  return normalizeJobScanSettings({
    scanDelayMs: job.scan_delay_ms !== undefined ? job.scan_delay_ms : job.scanDelayMs,
    screenshotDelayMs: job.screenshot_delay_ms !== undefined ? job.screenshot_delay_ms : job.screenshotDelayMs,
    candidateMode: job.candidate_mode !== undefined ? job.candidate_mode : job.candidateMode,
  }, defaults);
}

module.exports = {
  normalizeCandidateSelectionMode,
  normalizeJobScanSettings,
  extractJobScanSettings,
};
