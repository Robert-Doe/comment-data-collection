(function bootstrapModelLab() {
  const config = window.__APP_CONFIG__ || {};
  const apiBase = (config.apiBaseUrl || '').replace(/\/$/, '');

  const refreshButton = document.getElementById('refresh-modeling');
  const overviewForm = document.getElementById('overview-form');
  const overviewJobIds = document.getElementById('overview-job-ids');
  const overviewClear = document.getElementById('overview-clear');
  const overviewMessage = document.getElementById('overview-message');
  const overviewShell = document.getElementById('model-overview');
  const variantCards = document.getElementById('variant-cards');
  const trainJobIds = document.getElementById('train-job-ids');
  const downloadAllDataset = document.getElementById('download-all-dataset');
  const trainAlgorithm = document.getElementById('train-algorithm');
  const trainImbalanceStrategy = document.getElementById('train-imbalance-strategy');
  const trainMessage = document.getElementById('train-message');
  const trainResult = document.getElementById('train-result');
  const imbalanceMessage = document.getElementById('imbalance-message');
  const imbalanceStrategyNote = document.getElementById('imbalance-strategy-note');
  const compareImbalanceButton = document.getElementById('compare-imbalance');
  const imbalanceResults = document.getElementById('imbalance-results');
  const modelList = document.getElementById('model-list');
  const modelThresholdTunerPanel = document.getElementById('model-threshold-tuner-panel');
  const modelDetailDialog = document.getElementById('model-detail-dialog');
  const modelDetailClose = document.getElementById('model-detail-close');
  const modelDetailEyebrow = document.getElementById('model-detail-eyebrow');
  const modelDetailTitle = document.getElementById('model-detail-title');
  const modelDetailBody = document.getElementById('model-detail-body');
  const scoreModelId = document.getElementById('score-model-id');
  const scoreJobId = document.getElementById('score-job-id');
  const scoreJobForm = document.getElementById('score-job-form');
  const scoreJobMessage = document.getElementById('score-job-message');
  const scoreJobSummary = document.getElementById('score-job-summary');
  const scoreJobInsights = document.getElementById('score-job-insights');
  const scoreJobResults = document.getElementById('score-job-results');
  const recentJobsModel = document.getElementById('recent-jobs-model');
  const siteGroupForm = document.getElementById('site-group-form');
  const siteGroupModelId = document.getElementById('site-group-model-id');
  const siteGroupJobIds = document.getElementById('site-group-job-ids');
  const siteGroupFile = document.getElementById('site-group-file');
  const siteGroupText = document.getElementById('site-group-text');
  const siteGroupMessage = document.getElementById('site-group-message');
  const siteGroupResults = document.getElementById('site-group-results');
  const siteGroupProgress = document.getElementById('site-group-progress');
  const liveProbeForm = document.getElementById('live-probe-form');
  const liveProbeModelId = document.getElementById('live-probe-model-id');
  const liveProbeCandidateMode = document.getElementById('live-probe-candidate-mode');
  const liveProbeTimeoutMs = document.getElementById('live-probe-timeout-ms');
  const liveProbePriority = document.getElementById('live-probe-priority');
  const liveProbeUrl = document.getElementById('live-probe-url');
  const liveProbeMessage = document.getElementById('live-probe-message');
  const liveProbeProgress = document.getElementById('live-probe-progress');
  const liveProbeSummary = document.getElementById('live-probe-summary');
  const liveProbeResults = document.getElementById('live-probe-results');
  const liveProbeInspectDialog = document.getElementById('live-probe-inspect-dialog');
  const liveProbeInspectTitle = document.getElementById('live-probe-inspect-title');
  const liveProbeInspectMeta = document.getElementById('live-probe-inspect-meta');
  const liveProbeInspectPills = document.getElementById('live-probe-inspect-pills');
  const liveProbeInspectScreenshots = document.getElementById('live-probe-inspect-screenshots');
  const liveProbeInspectSignals = document.getElementById('live-probe-inspect-signals');
  const liveProbeInspectNotes = document.getElementById('live-probe-inspect-notes');
  const liveProbeInspectMarkup = document.getElementById('live-probe-inspect-markup');
  const liveProbeInspectClose = document.getElementById('live-probe-inspect-close');
  const diagVariantId = document.getElementById('diag-variant-id');
  const diagAlgorithm = document.getElementById('diag-algorithm');
  const diagImbalanceStrategy = document.getElementById('diag-imbalance-strategy');
  const diagJobIds = document.getElementById('diag-job-ids');
  const diagCrossValidateButton = document.getElementById('diag-cross-validate');
  const diagLearningCurveButton = document.getElementById('diag-learning-curve');
  const diagMessage = document.getElementById('diag-message');
  const diagCvResult = document.getElementById('diag-cv-result');
  const diagLcResult = document.getElementById('diag-lc-result');
  const diagDomainBucketsButton = document.getElementById('diag-domain-buckets');
  const diagBucketResult = document.getElementById('diag-bucket-result');
  const diagFeatureSelectionButton = document.getElementById('diag-feature-selection');
  const diagFsResult = document.getElementById('diag-fs-result');
  const featureExclusionBlock = document.getElementById('feature-exclusion-block');
  const featureExclusionDetails = document.getElementById('feature-exclusion-details');
  const featureExclusionArrow = document.getElementById('feature-exclusion-arrow');
  const featureExclusionManualLabel = document.getElementById('feature-exclusion-manual-label');
  const featureExclusionStatus = document.getElementById('feature-exclusion-status');
  const featureExclusionClear = document.getElementById('feature-exclusion-clear');
  const featureExclusionToggle = document.getElementById('feature-exclusion-toggle');
  const featureExclusionTags = document.getElementById('feature-exclusion-tags');
  const featureExclusionFamilies = document.getElementById('feature-exclusion-families');
  const featureExclusionApplyBar = document.getElementById('feature-exclusion-apply-bar');
  const featureExclusionApplySummary = document.getElementById('feature-exclusion-apply-summary');
  const featureExclusionApplyDrop = document.getElementById('feature-exclusion-apply-drop');
  const featureExclusionApplyBoth = document.getElementById('feature-exclusion-apply-both');
  const archetypeModelId = document.getElementById('archetype-model-id');
  const archetypeJobIds = document.getElementById('archetype-job-ids');
  const archetypeTopN = document.getElementById('archetype-top-n');
  const archetypeAnalyzeButton = document.getElementById('archetype-analyze');
  const archetypeMessage = document.getElementById('archetype-message');
  const archetypeProfile = document.getElementById('archetype-profile');
  const archetypeSmoteNote = document.getElementById('archetype-smote-note');
  const archetypeShell = document.getElementById('archetype-shell');
  const labelSummaryShell = document.getElementById('label-summary-shell');
  const labelSummaryMessage = document.getElementById('label-summary-message');
  const labelSummaryActions = document.getElementById('label-summary-actions');
  const labelSummarySelectedTotals = document.getElementById('label-summary-selected-totals');
  const usePoolForTrainingButton = document.getElementById('use-pool-for-training');
  const refreshLabelSummaryButton = document.getElementById('refresh-label-summary');

  let currentLabelSummary = null;
  let currentModels = [];
  let currentVariants = [];
  let currentFsResult = null;
  let currentTrainingVariantId = '';
  let currentImbalanceStrategies = [];
  let currentOverview = null;
  let currentOverviewScope = '';
  let overviewPollHandle = null;
  let overviewPollScope = '';
  let overviewPollFetchInFlight = false;
  let liveProbeProgressPollHandle = null;
  let liveProbeProgressRequestToken = 0;
  let liveProbeProgressFetchInFlight = false;
  let currentLiveProbeResult = null;
  let currentLiveProbePage = 0;
  const overviewPollIntervalMs = 5000;
  const liveProbeCandidatePageSize = 6;
  const initialOverviewScope = new URLSearchParams(window.location.search).get('jobIds')
    || new URLSearchParams(window.location.search).get('jobId')
    || (function () { try { return localStorage.getItem('ugc_selected_job_id') || ''; } catch (_) { return ''; } }())
    || '';

  if (overviewJobIds && initialOverviewScope) {
    overviewJobIds.value = initialOverviewScope;
  }

  const ALGORITHM_LABELS = {
    logistic_regression: 'Logistic Regression',
    decision_tree: 'Decision Tree',
    random_forest: 'Random Forest',
    gradient_boosting: 'Gradient Boosting',
  };

  const IMBALANCE_STRATEGY_FALLBACKS = {
    baseline: {
      title: 'Baseline',
      description: 'Keep the original training split unchanged. Use this run as the control comparison.',
    },
    class_weighted: {
      title: 'Class Weighted',
      description: 'Bias the fit toward the minority class without mutating stored data.',
    },
    undersample: {
      title: 'Undersample Majority',
      description: 'Trim the majority class in memory until the classes are balanced.',
    },
    oversample: {
      title: 'Oversample Minority',
      description: 'Duplicate minority rows in memory until the classes are balanced.',
    },
    smote: {
      title: 'SMOTE-like',
      description: 'Create synthetic minority rows by interpolating between nearby neighbors.',
    },
  };

  function apiUrl(path) {
    return `${apiBase}${path}`;
  }

  function formatAlgorithmName(value) {
    const key = String(value || '').trim();
    if (!key) return 'Logistic Regression';
    return ALGORITHM_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase());
  }

  function getImbalanceStrategyMeta(value) {
    const key = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    const fromOverview = currentImbalanceStrategies.find((entry) => entry && entry.id === key);
    if (fromOverview) {
      return fromOverview;
    }
    return IMBALANCE_STRATEGY_FALLBACKS[key] || IMBALANCE_STRATEGY_FALLBACKS.baseline;
  }

  function runtimeModelUrl(modelId) {
    return apiUrl(`/api/modeling/models/${encodeURIComponent(String(modelId || ''))}/runtime.json`);
  }

  function resolveAssetUrl(url) {
    if (!url) return '';
    if (/^https?:\/\//i.test(url)) return url;
    return apiUrl(url);
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async function fetchJson(path, options) {
    const response = await fetch(apiUrl(path), options);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error || `Request failed: ${response.status}`);
    }
    return body;
  }

  function setMessage(node, text, isError) {
    node.textContent = text || '';
    node.className = isError ? 'message error' : 'message';
  }

  function setOverviewMessage(text, isError) {
    if (!overviewMessage) return;
    overviewMessage.textContent = text || '';
    overviewMessage.className = isError ? 'message error' : 'message';
  }

  function stopOverviewPolling() {
    if (overviewPollHandle) {
      window.clearInterval(overviewPollHandle);
    }
    overviewPollHandle = null;
    overviewPollScope = '';
    overviewPollFetchInFlight = false;
  }

  async function fetchOverviewSnapshot() {
    const jobIds = normalizeOverviewJobIds(overviewJobIds ? overviewJobIds.value : '');
    currentOverviewScope = jobIds.join(',');
    const overviewPath = `/api/modeling/overview${currentOverviewScope ? `?jobIds=${encodeURIComponent(currentOverviewScope)}` : ''}`;
    const selectedJobDetails = jobIds.length
      ? await Promise.all(jobIds.map(async (jobId) => {
        try {
          const response = await fetchJson(`/api/jobs/${encodeURIComponent(jobId)}?limit=1`);
          return response && response.job ? response.job : null;
        } catch (_) {
          return null;
        }
      }))
      : [];

    const overview = await fetchJson(overviewPath);
    return {
      ...overview,
      selected_job_details: selectedJobDetails.filter(Boolean),
    };
  }

  function startOverviewPolling() {
    if (!currentOverviewScope || overviewPollHandle) {
      return;
    }

    overviewPollScope = currentOverviewScope;
    const tick = () => {
      if (document.hidden || overviewPollFetchInFlight || overviewPollScope !== currentOverviewScope) {
        return;
      }

      overviewPollFetchInFlight = true;
      fetchOverviewSnapshot()
        .then((overview) => {
          if (overviewPollScope !== currentOverviewScope) {
            return;
          }
          renderOverview(overview);
        })
        .catch(() => {})
        .finally(() => {
          overviewPollFetchInFlight = false;
        });
    };

    overviewPollHandle = window.setInterval(tick, overviewPollIntervalMs);
    tick();
  }

  function syncOverviewPolling() {
    if (!currentOverviewScope) {
      stopOverviewPolling();
      return;
    }

    if (overviewPollHandle && overviewPollScope === currentOverviewScope) {
      return;
    }

    stopOverviewPolling();
    startOverviewPolling();
  }

  function setBusyState(element, busy) {
    if (!element) return;

    if (busy) {
      element.dataset.busy = 'true';
      if ('disabled' in element) {
        element.dataset.wasDisabled = element.disabled ? 'true' : 'false';
        element.disabled = true;
      }
      return;
    }

    delete element.dataset.busy;
    if ('disabled' in element) {
      if (element.dataset.wasDisabled !== 'true') {
        element.disabled = false;
      }
      delete element.dataset.wasDisabled;
    }
  }

  function flashActionState(element, state) {
    if (!element) return;
    const attribute = state === 'error' ? 'error' : 'success';
    element.dataset[attribute] = 'true';
    window.setTimeout(() => {
      delete element.dataset[attribute];
    }, 1400);
  }

  async function runElementAction(element, action) {
    setBusyState(element, true);
    try {
      const result = await action();
      flashActionState(element, 'success');
      return result;
    } catch (error) {
      flashActionState(element, 'error');
      throw error;
    } finally {
      setBusyState(element, false);
    }
  }

  function clearProbeProgress(node) {
    if (!node) return;
    node.hidden = true;
    node.innerHTML = '';
  }

  function formatProbeProgressLine(progress) {
    if (!progress || typeof progress !== 'object') {
      return '';
    }

    const currentValue = Number(progress.current);
    const totalValue = Number(progress.total);
    const hasTotal = Number.isFinite(totalValue) && totalValue > 0;
    const current = Number.isFinite(currentValue) && currentValue >= 0 ? currentValue : 0;
    const percentValue = Number(progress.percent);
    const hasPercent = progress.percent !== null
      && progress.percent !== undefined
      && Number.isFinite(percentValue);
    const unit = String(progress.unit || '').trim();
    const parts = [];

    if (hasTotal) {
      parts.push(`${current}/${totalValue}${unit ? ` ${unit}` : ''}`);
    }
    if (hasPercent) {
      parts.push(`${percentValue}%`);
    }

    return parts.join(' • ');
  }

  function formatDurationLabel(ms) {
    const totalSeconds = Math.max(1, Math.round(Math.max(0, Number(ms) || 0) / 1000));
    if (totalSeconds < 60) {
      return `${totalSeconds} second${totalSeconds === 1 ? '' : 's'}`;
    }
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (!seconds) {
      return `${minutes} minute${minutes === 1 ? '' : 's'}`;
    }
    return `${minutes} minute${minutes === 1 ? '' : 's'} ${seconds} second${seconds === 1 ? '' : 's'}`;
  }

  function buildMarkupPreviewDocument(value) {
    const content = value
      ? value
      : '<div></div>';
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https: http:; media-src data: https: http:; style-src 'unsafe-inline'; font-src data: https: http:; connect-src 'none'; frame-src 'none';">
    <style>
      :root {
        color-scheme: light;
      }
      * {
        box-sizing: border-box;
      }
      html, body {
        margin: 0;
        padding: 0;
        background: #ffffff;
        color: #111827;
        font: 14px/1.45 "Segoe UI", Arial, sans-serif;
      }
      body {
        padding: 12px;
      }
      .preview-shell {
        min-height: 100%;
      }
      img, video, canvas, svg, iframe {
        max-width: 100%;
      }
      a, button, input, select, textarea, summary, details {
        pointer-events: none !important;
      }
    </style>
  </head>
  <body>${content}</body>
</html>`;
  }

  function renderCandidateMarkupSection(label, value, meta) {
    if (!value) return '';
    const previewDocument = buildMarkupPreviewDocument(value);
    return `
      <details class="score-details candidate-markup-details" open>
        <summary>
          <span>${escapeHtml(label)}</span>
          ${meta ? `<span class="candidate-markup-meta">${escapeHtml(meta)}</span>` : ''}
        </summary>
        <div class="score-details-body candidate-markup-body">
          <div class="candidate-markup-preview-shell">
            <iframe
              class="candidate-markup-preview"
              loading="lazy"
              sandbox="allow-same-origin"
              referrerpolicy="no-referrer"
              srcdoc="${escapeHtml(previewDocument)}"
              title="${escapeHtml(label)} preview"></iframe>
          </div>
          <details class="candidate-markup-source-toggle">
            <summary>HTML Source</summary>
            <div class="score-details-body">
              <pre class="candidate-markup mono">${escapeHtml(value)}</pre>
            </div>
          </details>
        </div>
      </details>
    `;
  }

  function renderCandidateMarkupDetails(candidate) {
    if (!candidate) return '';
    const resolvedTag = candidate.candidate_resolved_tag_name ? `${candidate.candidate_resolved_tag_name}` : '';
    const outerMeta = candidate.candidate_outer_html_length
      ? `${resolvedTag ? `${resolvedTag} - ` : ''}${candidate.candidate_outer_html_length} chars${candidate.candidate_outer_html_truncated ? ' (truncated)' : ''}`
      : (candidate.candidate_outer_html_truncated ? 'Outer HTML truncated' : '');
    const markupSections = [];
    if (candidate.candidate_outer_html_excerpt) {
      markupSections.push(renderCandidateMarkupSection('Rendered HTML', candidate.candidate_outer_html_excerpt, outerMeta));
    }

    const screenshotUrl = resolveAssetUrl(candidate.candidate_screenshot_url || '');
    const screenshotLink = screenshotUrl
      ? `<p class="candidate-copy"><strong>Screenshot:</strong> <a href="${escapeHtml(screenshotUrl)}" target="_blank" rel="noreferrer">Open screenshot</a></p>`
      : '';
    const pageScreenshotUrl = resolveAssetUrl(candidate.item_screenshot_url || candidate.item_manual_uploaded_screenshot_url || '');
    const pageScreenshotLink = pageScreenshotUrl
      ? `<p class="candidate-copy"><strong>Page screenshot:</strong> <a href="${escapeHtml(pageScreenshotUrl)}" target="_blank" rel="noreferrer">Open page screenshot</a></p>`
      : '';
    const content = markupSections.filter(Boolean).join('');
    const loadingCopy = candidate.candidate_markup_loading
      ? '<p class="candidate-copy"><strong>Markup:</strong> loading candidate HTML...</p>'
      : '';
    const screenshotNote = candidate.candidate_screenshot_error
      ? `<p class="candidate-copy"><strong>Screenshot note:</strong> ${escapeHtml(candidate.candidate_screenshot_error)}</p>`
      : '';
    const markupNote = candidate.candidate_markup_error
      ? `<p class="candidate-copy"><strong>Markup note:</strong> ${escapeHtml(candidate.candidate_markup_error)}</p>`
      : '';

    if (!content && !screenshotLink && !pageScreenshotLink && !candidate.candidate_markup_error && !candidate.candidate_screenshot_error && !candidate.candidate_markup_loading) {
      return '';
    }

    return `
      <div class="candidate-markup-stack">
        ${loadingCopy}
        ${pageScreenshotLink}
        ${screenshotLink}
        ${content}
        ${screenshotNote}
        ${markupNote}
      </div>
    `;
  }

  function setProbeProgress(node, title, detail, progress) {
    if (!node) return;
    node.hidden = false;
    const progressLine = formatProbeProgressLine(progress);
    node.innerHTML = `
      <div class="probe-spinner" aria-hidden="true"></div>
      <div>
        <div class="probe-progress-title">${escapeHtml(title || 'Working...')}</div>
        ${progressLine ? `<div class="probe-progress-count">${escapeHtml(progressLine)}</div>` : ''}
        ${detail ? `<p class="probe-progress-copy">${escapeHtml(detail)}</p>` : ''}
      </div>
    `;
  }

  function stopLiveProbeProgressPolling() {
    if (liveProbeProgressPollHandle) {
      window.clearInterval(liveProbeProgressPollHandle);
    }
    liveProbeProgressPollHandle = null;
    liveProbeProgressFetchInFlight = false;
    liveProbeProgressRequestToken += 1;
  }

  function findLiveProbeRequest(snapshot) {
    const activeRequests = Array.isArray(snapshot && snapshot.activeRequests) ? snapshot.activeRequests : [];
    return activeRequests
      .slice()
      .reverse()
      .find((request) => request && request.path === '/api/modeling/probe-url') || null;
  }

  function renderLiveProbeProgressSnapshot(snapshot, fallbackTitle, fallbackDetail) {
    const request = findLiveProbeRequest(snapshot);
    if (!request) {
      return false;
    }

    const title = request.stage === 'scoring'
      ? 'Scoring live URL'
      : request.stage === 'scanning'
        ? (fallbackTitle || 'Scanning live URL')
        : (request.label || fallbackTitle || 'Working...');
    const detail = request.message || fallbackDetail || '';
    setProbeProgress(liveProbeProgress, title, detail, request.progress || null);
    return true;
  }

  async function refreshLiveProbeProgress(pollToken, fallbackTitle, fallbackDetail) {
    if (pollToken !== liveProbeProgressRequestToken || liveProbeProgressFetchInFlight) {
      return false;
    }

    liveProbeProgressFetchInFlight = true;
    try {
      const snapshot = await fetchJson('/api/requests', { cache: 'no-store' });
      if (pollToken !== liveProbeProgressRequestToken) {
        return false;
      }
      return renderLiveProbeProgressSnapshot(snapshot, fallbackTitle, fallbackDetail);
    } catch (_) {
      return false;
    } finally {
      liveProbeProgressFetchInFlight = false;
    }
  }

  function startLiveProbeProgressPolling(fallbackTitle, fallbackDetail) {
    stopLiveProbeProgressPolling();
    const pollToken = ++liveProbeProgressRequestToken;
    const tick = () => {
      if (document.hidden) {
        return;
      }
      refreshLiveProbeProgress(pollToken, fallbackTitle, fallbackDetail).catch(() => {});
    };

    liveProbeProgressPollHandle = window.setInterval(tick, 850);
    tick();
  }

  function syncLiveProbePriorityState() {
    if (!liveProbeTimeoutMs || !liveProbePriority) return;
    liveProbeTimeoutMs.disabled = !!liveProbePriority.checked;
  }

  function formatMetric(value, decimals = 3) {
    if (value === null || value === undefined || value === '') return '';
    if (typeof value === 'number') {
      const precision = Number.isFinite(decimals) ? Math.max(0, Math.min(6, Math.floor(decimals))) : 3;
      if (precision <= 3) {
        return String(Math.round(value * 1000) / 1000);
      }
      return Number(value).toFixed(precision);
    }
    return String(value);
  }

  function formatHumanLabel(label) {
    if (label === 'comment_region') return 'comment region';
    if (label === 'not_comment_region') return 'not comment';
    if (label === 'uncertain') return 'uncertain';
    return '';
  }

  function formatPredictionLabel(candidate) {
    if (!candidate) return '';
    if (candidate.predicted_label === 1) return 'predicted positive';
    if (candidate.predicted_label === 0) return 'predicted negative';
    return '';
  }

  function updateDatasetDownloadLink() {
    const jobIds = encodeURIComponent(trainJobIds.value.trim());
    downloadAllDataset.href = apiUrl(`/api/modeling/dataset.csv${jobIds ? `?jobIds=${jobIds}` : ''}`);
    variantCards.querySelectorAll('[data-dataset-variant]').forEach((link) => {
      const variantId = link.getAttribute('data-dataset-variant');
      if (!variantId) return;
      const params = [`variantId=${encodeURIComponent(variantId)}`];
      if (jobIds) params.push(`jobIds=${jobIds}`);
      link.href = apiUrl(`/api/modeling/dataset.csv?${params.join('&')}`);
    });
  }

  function updateImbalanceStrategyNote() {
    if (!imbalanceStrategyNote || !trainImbalanceStrategy) return;
    const meta = getImbalanceStrategyMeta(trainImbalanceStrategy.value);
    imbalanceStrategyNote.className = 'summary';
    imbalanceStrategyNote.innerHTML = `
      <div><strong>${escapeHtml(meta.title || 'Baseline')}</strong></div>
      <div>${escapeHtml(meta.description || 'This strategy keeps the training data unchanged.')}</div>
    `;
  }

  function renderLabelBalanceDonut(counts, options = {}) {
    const positive = Math.max(0, Number(counts && counts.positive) || 0);
    const negative = Math.max(0, Number(counts && counts.negative) || 0);
    const total = positive + negative;
    const positiveRatio = total > 0 ? positive / total : 0;
    const radius = 44;
    const circumference = 2 * Math.PI * radius;
    const positiveLength = Math.max(0, Math.min(circumference, circumference * positiveRatio));
    const negativeLength = Math.max(0, circumference - positiveLength);
    const centerTitle = options.centerTitle || String(total);
    const centerLabel = options.centerLabel || 'labels';
    const title = options.title || 'Label balance';
    const subtitle = options.subtitle || '';
    const positiveLabel = options.positiveLabel || 'Positive';
    const negativeLabel = options.negativeLabel || 'Negative';
    const positiveColor = options.positiveColor || 'rgba(29, 107, 87, 0.92)';
    const negativeColor = options.negativeColor || 'rgba(138, 45, 45, 0.92)';

    if (!total) {
      return `
        <div class="imbalance-donut empty">
          <div class="imbalance-donut-copy">No labeled rows available.</div>
        </div>
      `;
    }

    return `
      <div class="imbalance-donut">
        <svg class="imbalance-donut-chart" viewBox="0 0 120 120" role="img" aria-label="${escapeHtml(`${title}: ${positiveLabel} ${positive}, ${negativeLabel} ${negative}`)}">
          <circle cx="60" cy="60" r="${radius}" fill="none" stroke="${escapeHtml(negativeColor)}" stroke-width="18"></circle>
          <circle cx="60" cy="60" r="${radius}" fill="none" stroke="${escapeHtml(positiveColor)}" stroke-width="18" stroke-linecap="round" stroke-dasharray="${positiveLength} ${negativeLength}" transform="rotate(-90 60 60)"></circle>
          <text x="60" y="56" text-anchor="middle" class="imbalance-donut-value">${escapeHtml(centerTitle)}</text>
          <text x="60" y="73" text-anchor="middle" class="imbalance-donut-label">${escapeHtml(centerLabel)}</text>
        </svg>
        <div class="imbalance-donut-legend">
          <div class="imbalance-donut-legend-item"><span class="imbalance-dot good"></span><span>${escapeHtml(positiveLabel)} ${escapeHtml(positive)}</span></div>
          <div class="imbalance-donut-legend-item"><span class="imbalance-dot bad"></span><span>${escapeHtml(negativeLabel)} ${escapeHtml(negative)}</span></div>
          ${subtitle ? `<div class="imbalance-donut-subtitle">${escapeHtml(subtitle)}</div>` : ''}
        </div>
      </div>
    `;
  }

  function renderMetricBar(label, value, tone = 'plain') {
    const numeric = Number(value);
    const width = Number.isFinite(numeric) ? Math.max(0, Math.min(100, numeric * 100)) : 0;
    const display = Number.isFinite(numeric) ? formatMetric(numeric) : '';
    return `
      <div class="metric-row">
        <div class="metric-row-label">${escapeHtml(label)}</div>
        <div class="metric-row-track"><span class="metric-row-fill ${escapeHtml(tone)}" style="width:${width}%"></span></div>
        <div class="metric-row-value">${escapeHtml(display)}</div>
      </div>
    `;
  }

  function getMinorityShare(counts) {
    const positive = Math.max(0, Number(counts && counts.positive) || 0);
    const negative = Math.max(0, Number(counts && counts.negative) || 0);
    const total = positive + negative;
    if (!total) return null;
    return Math.min(positive, negative) / total;
  }

  function formatPercentage(value, decimals = 1) {
    if (value === null || value === undefined || value === '') return '';
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '';
    const precision = Number.isFinite(decimals) ? Math.max(0, Math.min(3, Math.floor(decimals))) : 1;
    return `${(numeric * 100).toFixed(precision)}%`;
  }

  function formatPercentagePoints(value, decimals = 1) {
    if (value === null || value === undefined || value === '') return '';
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '';
    const precision = Number.isFinite(decimals) ? Math.max(0, Math.min(3, Math.floor(decimals))) : 1;
    const sign = numeric > 0 ? '+' : '';
    return `${sign}${(numeric * 100).toFixed(precision)} pp`;
  }

  function renderConfusionMatrixCard(confusion, options = {}) {
    const truePositive = Math.max(0, Number(confusion && confusion.true_positive) || 0);
    const trueNegative = Math.max(0, Number(confusion && confusion.true_negative) || 0);
    const falsePositive = Math.max(0, Number(confusion && confusion.false_positive) || 0);
    const falseNegative = Math.max(0, Number(confusion && confusion.false_negative) || 0);
    const compared = truePositive + trueNegative + falsePositive + falseNegative;
    const precision = (truePositive + falsePositive) > 0
      ? truePositive / (truePositive + falsePositive)
      : 0;
    const recall = (truePositive + falseNegative) > 0
      ? truePositive / (truePositive + falseNegative)
      : 0;
    const f1 = (precision + recall) > 0
      ? (2 * precision * recall) / (precision + recall)
      : 0;
    const accuracy = compared > 0
      ? (truePositive + trueNegative) / compared
      : 0;
    const skippedSource = options.skipped !== undefined ? options.skipped : confusion && confusion.skipped;
    const skipped = Math.max(0, Number(skippedSource) || 0);

    if (!compared) {
      return `
        <article class="model-card confusion-card empty">
          <p class="eyebrow subtle">${escapeHtml(options.eyebrow || 'Confusion Matrix')}</p>
          <h3>${escapeHtml(options.title || 'Prediction Agreement')}</h3>
          <p class="candidate-copy">${escapeHtml(options.emptyText || 'No binary labels are available yet. Train on labeled rows or score a job with human labels to populate this matrix.')}</p>
        </article>
      `;
    }

    return `
      <article class="model-card confusion-card ${escapeHtml(options.cardClass || '')}">
        <p class="eyebrow subtle">${escapeHtml(options.eyebrow || 'Confusion Matrix')}</p>
        <h3>${escapeHtml(options.title || 'Prediction Agreement')}</h3>
        <div class="confusion-matrix">
          <div class="confusion-matrix-corner"></div>
          <div class="confusion-matrix-header">Predicted negative</div>
          <div class="confusion-matrix-header">Predicted positive</div>
          <div class="confusion-matrix-row-header">Actual negative</div>
          <div class="confusion-matrix-cell true-negative">
            <span>TN</span>
            <strong>${escapeHtml(trueNegative)}</strong>
          </div>
          <div class="confusion-matrix-cell false-positive">
            <span>FP</span>
            <strong>${escapeHtml(falsePositive)}</strong>
          </div>
          <div class="confusion-matrix-row-header">Actual positive</div>
          <div class="confusion-matrix-cell false-negative">
            <span>FN</span>
            <strong>${escapeHtml(falseNegative)}</strong>
          </div>
          <div class="confusion-matrix-cell true-positive">
            <span>TP</span>
            <strong>${escapeHtml(truePositive)}</strong>
          </div>
        </div>
        <div class="summary tight-summary">
          <div><strong>Compared:</strong> ${escapeHtml(compared)}</div>
          <div><strong>Accuracy:</strong> ${escapeHtml(formatMetric(accuracy))}</div>
          <div><strong>Precision:</strong> ${escapeHtml(formatMetric(precision))}</div>
          <div><strong>Recall:</strong> ${escapeHtml(formatMetric(recall))}</div>
          <div><strong>F1:</strong> ${escapeHtml(formatMetric(f1))}</div>
          ${skipped ? `<div><strong>Skipped:</strong> ${escapeHtml(skipped)}</div>` : ''}
        </div>
      </article>
    `;
  }

  function summarizeScoredCandidateConfusion(items) {
    return (Array.isArray(items) ? items : []).reduce((summary, item) => {
      (Array.isArray(item && item.candidates) ? item.candidates : []).forEach((candidate) => {
        const actual = candidate.binary_label;
        const predicted = candidate.predicted_label;
        if ((actual !== 0 && actual !== 1) || (predicted !== 0 && predicted !== 1)) {
          summary.skipped += 1;
          return;
        }

        summary.compared += 1;
        if (actual === 1 && predicted === 1) summary.true_positive += 1;
        else if (actual === 0 && predicted === 0) summary.true_negative += 1;
        else if (actual === 0 && predicted === 1) summary.false_positive += 1;
        else if (actual === 1 && predicted === 0) summary.false_negative += 1;
      });
      return summary;
    }, {
      compared: 0,
      true_positive: 0,
      true_negative: 0,
      false_positive: 0,
      false_negative: 0,
      skipped: 0,
    });
  }

  function renderProbabilityTrendCard(items, options = {}) {
    const ordered = (Array.isArray(items) ? items : [])
      .slice()
      .sort((left, right) => Number(left.row_number || 0) - Number(right.row_number || 0));
    if (!ordered.length) {
      return `
        <article class="model-card empty">
          <p class="eyebrow subtle">${escapeHtml(options.eyebrow || 'Progress')}</p>
          <h3>${escapeHtml(options.title || 'Probability Trend')}</h3>
          <p class="candidate-copy">No scored items are available yet.</p>
        </article>
      `;
    }

    const limit = Math.max(1, Number(options.limit) || 8);
    const visible = ordered.slice(0, limit);
    const maxProbability = Math.max(1, ...visible.map((item) => {
      const top = item && item.top_candidate ? Number(item.top_candidate.probability) : 0;
      return Number.isFinite(top) ? Math.max(0, top) : 0;
    }));
    const topProbabilityValues = visible.map((item) => Number(item && item.top_candidate ? item.top_candidate.probability : 0) || 0);
    const maxTopProbability = topProbabilityValues.length ? Math.max(...topProbabilityValues) : 0;

    return `
      <article class="model-card">
        <p class="eyebrow subtle">${escapeHtml(options.eyebrow || 'Progress')}</p>
        <h3>${escapeHtml(options.title || 'Probability Trend')}</h3>
        <p class="candidate-copy">${escapeHtml(options.copy || `Showing ${visible.length} of ${ordered.length} scored items in row order.`)}</p>
        <div class="analysis-bar-stack">
          ${visible.map((item, index) => {
            const top = item && item.top_candidate ? item.top_candidate : null;
            const probability = top ? Number(top.probability) || 0 : 0;
            const width = maxProbability > 0 ? Math.max(0, Math.min(100, (Math.max(0, probability) / maxProbability) * 100)) : 0;
            const tone = item.manual_review_suggested ? 'warn' : (top && top.predicted_label === 1 ? 'good' : 'plain');
            const label = formatHumanLabel(top && top.human_label) || formatPredictionLabel(top) || 'unlabeled';
            return `
              <div class="analysis-bar-row">
                <div class="analysis-bar-meta">
                  <span class="candidate-pill">#${escapeHtml(item.row_number || index + 1)}</span>
                  <span class="candidate-pill ${tone}">${escapeHtml(label || 'unlabeled')}</span>
                  ${item.manual_review_suggested ? '<span class="candidate-pill warn">manual review</span>' : ''}
                </div>
                <div class="analysis-bar-track"><span class="analysis-bar-fill ${escapeHtml(tone)}" style="width:${width}%"></span></div>
                <div class="analysis-bar-value">${escapeHtml(formatMetric(probability))}</div>
              </div>
            `;
          }).join('')}
        </div>
        <div class="summary tight-summary">
          <div><strong>Items:</strong> ${escapeHtml(ordered.length)}</div>
          <div><strong>Predicted Positives:</strong> ${escapeHtml((Array.isArray(items) ? items : []).filter((item) => item.top_candidate && item.top_candidate.probability >= 0.5).length)}</div>
          <div><strong>Manual Review:</strong> ${escapeHtml((Array.isArray(items) ? items : []).filter((item) => item.manual_review_suggested).length)}</div>
          <div><strong>Peak Probability:</strong> ${escapeHtml(formatMetric(maxTopProbability))}</div>
        </div>
      </article>
    `;
  }

  function resolveLiveProbeCandidateDetail(candidate) {
    if (!candidate) return null;
    const candidateValue = candidate.candidate && typeof candidate.candidate === 'object'
      ? candidate.candidate
      : {};
    const featureValues = candidate.feature_values && typeof candidate.feature_values === 'object'
      ? candidate.feature_values
      : {};
    const outerHtmlLength = Number(
      candidate.candidate_outer_html_length
      || candidateValue.candidate_outer_html_length
      || featureValues.candidate_outer_html_length
      || 0,
    ) || 0;
    return {
      ...candidateValue,
      ...featureValues,
      frame_url: candidate.frame_url || candidateValue.frame_url || featureValues.frame_url || '',
      frame_host: candidate.frame_host || candidateValue.frame_host || featureValues.frame_host || '',
      sample_text: candidate.sample_text || candidateValue.sample_text || featureValues.sample_text || '',
      score: candidate.score || candidateValue.score || featureValues.score || 0,
      confidence: candidate.confidence || candidateValue.confidence || featureValues.confidence || '',
      ugc_type: candidate.ugc_type || candidateValue.ugc_type || featureValues.ugc_type || '',
      candidate_screenshot_url: candidate.candidate_screenshot_url || candidateValue.candidate_screenshot_url || featureValues.candidate_screenshot_url || '',
      candidate_screenshot_error: candidate.candidate_screenshot_error || candidateValue.candidate_screenshot_error || featureValues.candidate_screenshot_error || '',
      item_screenshot_url: candidate.item_screenshot_url || candidateValue.item_screenshot_url || featureValues.item_screenshot_url || '',
      item_manual_uploaded_screenshot_url: candidate.item_manual_uploaded_screenshot_url || candidateValue.item_manual_uploaded_screenshot_url || featureValues.item_manual_uploaded_screenshot_url || '',
      candidate_outer_html_excerpt: candidate.candidate_outer_html_excerpt || candidateValue.candidate_outer_html_excerpt || featureValues.candidate_outer_html_excerpt || '',
      candidate_outer_html_length: outerHtmlLength,
      candidate_outer_html_truncated: !!(candidate.candidate_outer_html_truncated
        ?? candidateValue.candidate_outer_html_truncated
        ?? featureValues.candidate_outer_html_truncated),
      candidate_text_excerpt: candidate.candidate_text_excerpt || candidateValue.candidate_text_excerpt || featureValues.candidate_text_excerpt || '',
      candidate_markup_error: candidate.candidate_markup_error || candidateValue.candidate_markup_error || featureValues.candidate_markup_error || '',
      candidate_markup_loading: !!(candidate.candidate_markup_loading ?? candidateValue.candidate_markup_loading ?? featureValues.candidate_markup_loading),
      candidate_resolved_tag_name: candidate.candidate_resolved_tag_name || candidateValue.candidate_resolved_tag_name || featureValues.candidate_resolved_tag_name || '',
      candidate_markup_source: candidate.candidate_markup_source || candidateValue.candidate_markup_source || featureValues.candidate_markup_source || '',
    };
  }

  function getCurrentLiveProbeCandidates() {
    const items = currentLiveProbeResult && Array.isArray(currentLiveProbeResult.items)
      ? currentLiveProbeResult.items
      : [];
    const item = items[0] || null;
    return item && Array.isArray(item.candidates) ? item.candidates : [];
  }

  function getLiveProbeCandidateAtIndex(index) {
    const numericIndex = Number(index);
    if (!Number.isInteger(numericIndex) || numericIndex < 0) {
      return null;
    }
    const candidates = getCurrentLiveProbeCandidates();
    if (numericIndex >= candidates.length) {
      return null;
    }
    return {
      candidate: candidates[numericIndex],
      index: numericIndex,
      total: candidates.length,
    };
  }

  function renderInspectScreenshotPanel(label, url, options = {}) {
    const resolvedUrl = resolveAssetUrl(url || '');
    const error = String(options.error || '');
    const emptyText = String(options.emptyText || 'No screenshot was captured for this candidate.');
    const fallbackText = error || (resolvedUrl ? 'The stored screenshot URL could not be loaded.' : emptyText);
    const captionText = String(options.caption || '');
    const captionTone = error
      ? (String(error).toLowerCase().includes('skipped') ? 'warn' : 'error')
      : '';

    return `
      <figure class="inspect-screenshot-panel">
        <div class="inspect-screenshot-header">
          <strong>${escapeHtml(label)}</strong>
          ${resolvedUrl ? `<a href="${escapeHtml(resolvedUrl)}" target="_blank" rel="noreferrer">Open</a>` : ''}
        </div>
        <div class="inspect-screenshot-frame" data-inspect-screenshot-frame data-state="${resolvedUrl ? 'loading' : 'empty'}">
          ${resolvedUrl ? `
            <img
              class="inspect-screenshot-image"
              data-inspect-screenshot-image
              src="${escapeHtml(resolvedUrl)}"
              alt="${escapeHtml(label)}"
              loading="eager"
              decoding="async"
              referrerpolicy="no-referrer">
            <div class="inspect-screenshot-fallback" data-inspect-screenshot-fallback hidden>
              <strong>${escapeHtml(label)} unavailable</strong>
              <span>${escapeHtml(fallbackText)}</span>
            </div>
          ` : `
            <div class="inspect-screenshot-fallback" data-inspect-screenshot-fallback>
              <strong>${escapeHtml(label)} unavailable</strong>
              <span>${escapeHtml(fallbackText)}</span>
            </div>
          `}
        </div>
        ${captionText || error ? `<figcaption class="inspect-screenshot-caption${captionTone ? ` ${captionTone}` : ''}">${escapeHtml(captionText || error)}</figcaption>` : ''}
      </figure>
    `;
  }

  function hydrateInspectScreenshotPanels(root) {
    if (!root) return;
    root.querySelectorAll('[data-inspect-screenshot-image]').forEach((img) => {
      const frame = img.closest('[data-inspect-screenshot-frame]');
      if (!frame) return;
      const fallback = frame.querySelector('[data-inspect-screenshot-fallback]');
      const setState = (state) => {
        frame.dataset.state = state;
        if (fallback) {
          fallback.hidden = state === 'loaded';
        }
        img.hidden = state === 'error';
      };

      const markLoaded = () => {
        setState(img.naturalWidth > 0 ? 'loaded' : 'error');
      };

      img.addEventListener('load', markLoaded);
      img.addEventListener('error', () => setState('error'));
      if (img.complete) {
        markLoaded();
      }
    });
  }

  function openLiveProbeInspectModal(index) {
    if (!liveProbeInspectDialog || !liveProbeInspectTitle || !liveProbeInspectMeta || !liveProbeInspectPills || !liveProbeInspectScreenshots || !liveProbeInspectSignals || !liveProbeInspectNotes || !liveProbeInspectMarkup) {
      return;
    }

    const lookup = getLiveProbeCandidateAtIndex(index);
    if (!lookup || !lookup.candidate) {
      return;
    }

    const candidate = lookup.candidate;
    const detail = resolveLiveProbeCandidateDetail(candidate) || {};
    const summary = currentLiveProbeResult && currentLiveProbeResult.summary ? currentLiveProbeResult.summary : {};
    const scan = currentLiveProbeResult && currentLiveProbeResult.scan ? currentLiveProbeResult.scan : {};
    const artifactLimit = Math.max(0, Number(scan.candidate_review_artifact_limit) || 0);
    const rank = Number(candidate.candidate_rank || lookup.index + 1) || lookup.index + 1;
    const predictionLabel = formatPredictionLabel(candidate) || (candidate.predicted_label === 1 ? 'predicted positive' : candidate.predicted_label === 0 ? 'predicted negative' : 'uncertain');
    const humanLabel = candidate.human_label ? formatHumanLabel(candidate.human_label) || candidate.human_label : '';
    const candidateKey = String(candidate.candidate_key || candidate.xpath || candidate.css_path || `row-${rank}`);
    const candidateTag = detail.candidate_resolved_tag_name || detail.tag_name || detail.tag || '';
    const markupSource = detail.candidate_markup_source ? String(detail.candidate_markup_source).replace(/_/g, ' ') : '';
    const signalBits = [
      ...(candidate.explanation && Array.isArray(candidate.explanation.top_positive_contributors)
        ? candidate.explanation.top_positive_contributors.slice(0, 3)
        : []),
      ...(candidate.explanation && Array.isArray(candidate.explanation.top_negative_contributors)
        ? candidate.explanation.top_negative_contributors.slice(0, 2)
        : []),
    ];
    const inspectPills = [
      `<span class="candidate-pill ${candidate.predicted_label === 1 ? 'good' : 'warn'}">${escapeHtml(formatMetric(candidate.probability))}</span>`,
      `<span class="candidate-pill ${candidate.predicted_label === 1 ? 'good' : 'bad'}">${escapeHtml(humanLabel || predictionLabel)}</span>`,
      `<span class="candidate-pill plain">rank ${escapeHtml(rank)}</span>`,
      candidateTag ? `<span class="candidate-pill plain">${escapeHtml(candidateTag)}</span>` : '',
      markupSource ? `<span class="candidate-pill plain">${escapeHtml(markupSource)}</span>` : '',
      candidate.candidate_outer_html_truncated || detail.candidate_outer_html_truncated ? '<span class="candidate-pill warn">outer HTML truncated</span>' : '',
      artifactLimit && rank > artifactLimit && !detail.candidate_screenshot_url
        ? `<span class="candidate-pill warn">screenshot cap ${escapeHtml(artifactLimit)}</span>`
        : '',
    ].filter(Boolean).join('');

    const inspectMeta = [
      summary.page_title ? `Title: ${summary.page_title}` : '',
      detail.frame_host ? `Frame host: ${detail.frame_host}` : '',
      detail.frame_url ? `Frame URL: ${detail.frame_url}` : '',
      `Candidate key: ${candidateKey}`,
    ].filter(Boolean).join(' | ');

    const screenshotPanels = [
      renderInspectScreenshotPanel(
        'Candidate screenshot',
        detail.candidate_screenshot_url,
        {
          error: detail.candidate_screenshot_error,
          emptyText: artifactLimit && rank > artifactLimit
            ? `This candidate is outside the top ${artifactLimit} review-artifact captures.`
            : 'No candidate screenshot was captured for this row.',
          caption: detail.candidate_screenshot_url ? `Candidate rank ${rank}` : '',
        },
      ),
      renderInspectScreenshotPanel(
        'Page screenshot',
        detail.item_screenshot_url,
        {
          error: detail.item_screenshot_url ? '' : 'No page screenshot was recorded for this probe.',
          emptyText: 'No page screenshot is available for this probe.',
          caption: summary.page_final_url ? summary.page_final_url : '',
        },
      ),
    ];

    if (detail.item_manual_uploaded_screenshot_url && detail.item_manual_uploaded_screenshot_url !== detail.item_screenshot_url) {
      screenshotPanels.push(renderInspectScreenshotPanel(
        'Manual uploaded screenshot',
        detail.item_manual_uploaded_screenshot_url,
        {
          error: '',
          emptyText: 'No manually uploaded screenshot is attached to this row.',
          caption: 'Stored manual upload',
        },
      ));
    }

    const notes = [];
    if (artifactLimit && rank > artifactLimit && !detail.candidate_screenshot_url) {
      notes.push(`<p class="inspect-note warn">This candidate falls outside the live probe screenshot cap of ${escapeHtml(artifactLimit)}. The candidate is still scored, but its screenshot artifact was not captured.</p>`);
    } else if (detail.candidate_screenshot_error) {
      notes.push(`<p class="inspect-note ${String(detail.candidate_screenshot_error).toLowerCase().includes('skipped') ? 'warn' : 'error'}">${escapeHtml(detail.candidate_screenshot_error)}</p>`);
    }

    if (detail.candidate_markup_loading) {
      notes.push('<p class="inspect-note warn">Candidate HTML is still loading.</p>');
    } else if (detail.candidate_markup_error) {
      notes.push(`<p class="inspect-note error">${escapeHtml(detail.candidate_markup_error)}</p>`);
    }

    if (detail.candidate_outer_html_truncated) {
      notes.push(`<p class="inspect-note warn">Outer HTML is truncated at ${escapeHtml(detail.candidate_outer_html_length || 0)} characters.</p>`);
    }

    if (detail.sample_text) {
      const sampleText = String(detail.sample_text || '').trim();
      const samplePreview = sampleText.length > 360 ? `${sampleText.slice(0, 360)}...` : sampleText;
      notes.push(`<p class="inspect-note">Sample text: ${escapeHtml(samplePreview)}</p>`);
    }

    liveProbeInspectTitle.textContent = `Candidate #${rank} of ${lookup.total}`;
    liveProbeInspectMeta.textContent = inspectMeta;
    liveProbeInspectPills.innerHTML = inspectPills || '<span class="candidate-copy model-card-empty">No summary values are available for this candidate.</span>';
    liveProbeInspectScreenshots.innerHTML = screenshotPanels.join('');
    liveProbeInspectSignals.innerHTML = `
      <div class="candidate-copy inspect-signals-copy"><strong>Signals:</strong> ${escapeHtml(signalBits.length)} contributor${signalBits.length === 1 ? '' : 's'} surfaced by the model.</div>
      <div class="feature-chip-list">
        ${signalBits.length ? signalBits.map((entry) => `
          <span class="feature-chip ${entry.contribution >= 0 ? 'good' : 'muted'}">
            <strong>${escapeHtml(entry.title || entry.output_key)}</strong>
            <span>${escapeHtml(formatMetric(entry.contribution))}</span>
          </span>
        `).join('') : '<span class="candidate-copy model-card-empty">No explanation signals available.</span>'}
      </div>
    `;
    liveProbeInspectNotes.innerHTML = notes.join('');
    liveProbeInspectMarkup.innerHTML = renderCandidateMarkupDetails(detail)
      || '<p class="candidate-copy model-card-empty">No outer HTML excerpt was captured for this candidate.</p>';

    hydrateInspectScreenshotPanels(liveProbeInspectDialog);
    if (typeof liveProbeInspectDialog.showModal === 'function') {
      if (liveProbeInspectDialog.open) {
        liveProbeInspectDialog.close();
      }
      liveProbeInspectDialog.showModal();
    } else {
      liveProbeInspectDialog.setAttribute('open', '');
    }

    const inspectCard = liveProbeInspectDialog.querySelector('.inspect-card');
    if (inspectCard) {
      inspectCard.scrollTop = 0;
    }

    if (liveProbeInspectClose && typeof liveProbeInspectClose.focus === 'function') {
      liveProbeInspectClose.focus();
    }
  }

  const STRATEGY_COLORS = {
    baseline: '#64748b',
    class_weighted: '#3b82f6',
    undersample: '#f97316',
    oversample: '#22c55e',
    smote: '#a855f7',
    smote_weighted: '#ec4899',
  };

  function getStrategyColor(strategyId) {
    const key = String(strategyId || '').toLowerCase().replace(/[\s-]+/g, '_');
    return STRATEGY_COLORS[key] || '#94a3b8';
  }

  function renderRadarChart(comparisonRows, focusStrategy) {
    if (!comparisonRows.length) return '';
    const cx = 165, cy = 165, r = 115;
    const W = 330, H = 330;
    const metrics = [
      { label: 'F1', getter: (e) => e.candidateMetrics ? e.candidateMetrics.f1 : null },
      { label: 'Precision', getter: (e) => e.candidateMetrics ? e.candidateMetrics.precision : null },
      { label: 'Recall', getter: (e) => e.candidateMetrics ? e.candidateMetrics.recall : null },
      { label: 'PR AUC', getter: (e) => e.candidateMetrics ? e.candidateMetrics.pr_auc : null },
      { label: 'ROC AUC', getter: (e) => e.candidateMetrics ? e.candidateMetrics.roc_auc : null },
      { label: 'Top-1', getter: (e) => e.rankingMetrics ? e.rankingMetrics.top_1_accuracy : null },
    ];
    const n = metrics.length;
    const axes = metrics.map((m, i) => {
      const angle = (2 * Math.PI * i / n) - Math.PI / 2;
      return { ...m, angle,
        ax: cx + r * Math.cos(angle), ay: cy + r * Math.sin(angle),
        lx: cx + (r + 26) * Math.cos(angle), ly: cy + (r + 26) * Math.sin(angle),
      };
    });
    const rings = [0.25, 0.5, 0.75, 1.0].map((level) => {
      const pts = axes.map((a) => `${(cx + level * r * Math.cos(a.angle)).toFixed(1)},${(cy + level * r * Math.sin(a.angle)).toFixed(1)}`).join(' ');
      return `<polygon points="${pts}" fill="none" stroke="rgba(0,0,0,0.07)" stroke-width="1"/>`;
    }).join('');
    const ringLabels = [0.25, 0.5, 0.75, 1.0].map((level) => {
      const y = cy - level * r - 3;
      return `<text x="${cx + 4}" y="${y}" font-size="9" fill="rgba(0,0,0,0.3)" font-family="inherit">${Math.round(level * 100)}%</text>`;
    }).join('');
    const axisLines = axes.map((a) => `<line x1="${cx}" y1="${cy}" x2="${a.ax.toFixed(1)}" y2="${a.ay.toFixed(1)}" stroke="rgba(0,0,0,0.1)" stroke-width="1"/>`).join('');
    const axisLabels = axes.map((a) => {
      const anchor = Math.abs(Math.cos(a.angle)) < 0.15 ? 'middle' : (Math.cos(a.angle) > 0 ? 'start' : 'end');
      const dy = Math.sin(a.angle) > 0.5 ? 14 : (Math.sin(a.angle) < -0.5 ? 0 : 4);
      return `<text x="${a.lx.toFixed(1)}" y="${(a.ly + dy).toFixed(1)}" text-anchor="${anchor}" font-size="11" fill="var(--muted)" font-family="inherit" font-weight="600">${escapeHtml(a.label)}</text>`;
    }).join('');
    const polygons = comparisonRows.map((entry) => {
      const color = getStrategyColor(entry.run.strategy_id);
      const isFocus = entry.run.strategy_id === focusStrategy;
      const pts = axes.map((a) => {
        const val = a.getter(entry);
        const v = Number.isFinite(Number(val)) ? Math.max(0, Math.min(1, Number(val))) : 0;
        return `${(cx + v * r * Math.cos(a.angle)).toFixed(1)},${(cy + v * r * Math.sin(a.angle)).toFixed(1)}`;
      }).join(' ');
      return `<polygon points="${pts}" fill="${escapeHtml(color)}" fill-opacity="${isFocus ? 0.25 : 0.1}" stroke="${escapeHtml(color)}" stroke-width="${isFocus ? 2.5 : 1.5}" stroke-opacity="0.85"/>`;
    }).join('');
    const legendItems = comparisonRows.map((entry) => {
      const color = getStrategyColor(entry.run.strategy_id);
      const isFocus = entry.run.strategy_id === focusStrategy;
      return `<div class="radar-legend-item${isFocus ? ' is-focus' : ''}"><span class="radar-legend-dot" style="background:${escapeHtml(color)}"></span><span>${escapeHtml(entry.run.strategy.title || entry.run.strategy_id)}</span></div>`;
    }).join('');
    return `
      <div class="radar-chart-wrap">
        <svg viewBox="0 0 ${W} ${H}" class="radar-chart-svg" role="img" aria-label="Metric comparison radar chart">
          ${rings}${ringLabels}${axisLines}${polygons}${axisLabels}
        </svg>
        <div class="radar-legend">${legendItems}</div>
      </div>
    `;
  }

  function renderKnnDiagram(comparisonRows) {
    const smoteRows = comparisonRows.filter((e) => e.nearestNeighbors > 0 && e.syntheticRows > 0);
    if (!smoteRows.length) return '';
    // Fixed illustrative point positions in a 200x160 canvas
    const minority = [[40,80],[60,50],[90,65],[70,100],[110,45],[130,80],[50,120]];
    const majority = [[20,30],[150,30],[170,90],[160,140],[30,140],[100,130],[140,55],[80,20],[170,20]];
    const seedIdx = 2; // point at [90,65] is the "query" point
    const seed = minority[seedIdx];
    function dist(a, b) { return Math.sqrt((a[0]-b[0])**2 + (a[1]-b[1])**2); }
    // K=5 neighbors (closest minority points to seed, excluding seed itself)
    const neighbors = minority
      .map((p, i) => ({ p, i, d: dist(p, seed) }))
      .filter((x) => x.i !== seedIdx)
      .sort((a, b) => a.d - b.d)
      .slice(0, 5);
    // Synthetic point = midpoint between seed and first neighbor
    const synth = [
      Math.round((seed[0] + neighbors[0].p[0]) / 2),
      Math.round((seed[1] + neighbors[0].p[1]) / 2),
    ];
    const neighborLines = neighbors.map((nb) => `<line x1="${seed[0]}" y1="${seed[1]}" x2="${nb.p[0]}" y2="${nb.p[1]}" stroke="#a855f7" stroke-width="1.2" stroke-dasharray="4 2" opacity="0.6"/>`).join('');
    const majorityDots = majority.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="5" fill="rgba(138,45,45,0.7)" stroke="rgba(138,45,45,0.9)" stroke-width="1"/>`).join('');
    const minorityDots = minority.map((p, i) => {
      if (i === seedIdx) return `<circle cx="${p[0]}" cy="${p[1]}" r="7" fill="rgba(29,107,87,0.9)" stroke="rgba(29,107,87,1)" stroke-width="2"/>`;
      const isNeighbor = neighbors.some((nb) => nb.i === i);
      return `<circle cx="${p[0]}" cy="${p[1]}" r="${isNeighbor ? 6 : 5}" fill="${isNeighbor ? 'rgba(29,107,87,0.95)' : 'rgba(29,107,87,0.55)'}" stroke="rgba(29,107,87,0.8)" stroke-width="${isNeighbor ? 2 : 1}"/>`;
    }).join('');
    const synthDot = `<circle cx="${synth[0]}" cy="${synth[1]}" r="6" fill="rgba(168,85,247,0.3)" stroke="#a855f7" stroke-width="2" stroke-dasharray="3 2"/>`;
    const kCircle = `<circle cx="${seed[0]}" cy="${seed[1]}" r="${neighbors[neighbors.length-1].d.toFixed(1)}" fill="none" stroke="rgba(168,85,247,0.18)" stroke-width="1.5" stroke-dasharray="5 3"/>`;
    const svgStr = `<svg viewBox="0 0 200 160" class="knn-diagram-svg" role="img" aria-label="KNN synthesis diagram">
      ${kCircle}${neighborLines}${majorityDots}${minorityDots}${synthDot}
      <text x="92" y="60" font-size="9" fill="#1d6b57" font-weight="700" font-family="inherit">seed</text>
      <text x="${synth[0]+8}" y="${synth[1]+4}" font-size="9" fill="#a855f7" font-family="inherit">synthetic</text>
    </svg>`;
    const cards = smoteRows.map((entry) => {
      const color = getStrategyColor(entry.run.strategy_id);
      return `<div class="knn-stat-card">
        <div class="knn-stat-label">${escapeHtml(entry.run.strategy.title || entry.run.strategy_id)}</div>
        <div class="knn-stat-k" style="color:${escapeHtml(color)}">K = ${escapeHtml(entry.nearestNeighbors)}</div>
        <div class="knn-stat-rows">${escapeHtml(entry.syntheticRows)} synthetic rows generated</div>
        <div class="knn-stat-shift">Minority share: ${escapeHtml(formatPercentage(entry.originalMinorityShare))} → ${escapeHtml(formatPercentage(entry.preparedMinorityShare))}</div>
      </div>`;
    }).join('');
    return `
      <div class="knn-diagram-wrap">
        <div class="knn-diagram-visual">
          ${svgStr}
          <div class="knn-diagram-legend">
            <div class="knn-legend-item"><span class="knn-dot minority-seed"></span>Seed minority point</div>
            <div class="knn-legend-item"><span class="knn-dot minority-neighbor"></span>K nearest neighbors</div>
            <div class="knn-legend-item"><span class="knn-dot synthetic-point"></span>Synthetic point (interpolated)</div>
            <div class="knn-legend-item"><span class="knn-dot majority-point"></span>Majority class</div>
            <div class="knn-legend-item"><span class="knn-dot knn-radius"></span>K-neighborhood radius</div>
          </div>
        </div>
        <div class="knn-stat-cards">${cards}</div>
      </div>
    `;
  }

  function renderImbalanceComparison(result) {
    if (!imbalanceResults) return;
    const runs = result && Array.isArray(result.runs) ? result.runs : [];
    if (!runs.length) {
      imbalanceResults.className = 'model-card-grid empty';
      imbalanceResults.textContent = 'Run a comparison to see how imbalance strategies perform.';
      return;
    }

    const focusStrategy = String(result.focus_strategy || '').trim();
    const comparisonRows = runs.map((run) => {
      const summary = run.summary || {};
      const counts = summary.training_counts || {};
      const imbalance = summary.imbalance_strategy || {};
      const evaluation = summary.evaluation && (summary.evaluation.test || summary.evaluation.train)
        ? (summary.evaluation.test || summary.evaluation.train)
        : null;
      const candidateMetrics = evaluation && evaluation.candidate_metrics
        ? evaluation.candidate_metrics
        : null;
      const rankingMetrics = evaluation && evaluation.ranking_metrics
        ? evaluation.ranking_metrics
        : null;
      const originalCounts = imbalance.original_label_counts || counts.train_label_counts || {};
      const preparedCounts = imbalance.prepared_label_counts || counts.effective_train_label_counts || originalCounts;

      return {
        run,
        summary,
        counts,
        imbalance,
        evaluation,
        candidateMetrics,
        rankingMetrics,
        originalCounts,
        preparedCounts,
        originalMinorityShare: getMinorityShare(originalCounts),
        preparedMinorityShare: getMinorityShare(preparedCounts),
        syntheticRows: Math.max(0, Number(imbalance.synthetic_row_count) || 0),
        nearestNeighbors: Number.isFinite(Number(imbalance.nearest_neighbors))
          ? Number(imbalance.nearest_neighbors)
          : null,
      };
    });

    const focusRow = comparisonRows.find((entry) => entry.run.strategy_id === focusStrategy) || comparisonRows[0] || null;
    const focusRun = focusRow ? focusRow.run : null;
    const focusEvaluation = focusRow ? focusRow.evaluation : null;
    const focusConfusion = focusEvaluation && focusEvaluation.candidate_metrics
      ? focusEvaluation.candidate_metrics.confusion
      : null;
    const leaderboard = result.leaderboard || {};
    const leaderboardRows = [
      leaderboard.precision ? `<div><strong>Precision:</strong> ${escapeHtml(leaderboard.precision.strategy.title || leaderboard.precision.strategy_id)} (${escapeHtml(formatMetric(leaderboard.precision.value))})</div>` : '',
      leaderboard.recall ? `<div><strong>Recall:</strong> ${escapeHtml(leaderboard.recall.strategy.title || leaderboard.recall.strategy_id)} (${escapeHtml(formatMetric(leaderboard.recall.value))})</div>` : '',
      leaderboard.f1 ? `<div><strong>F1:</strong> ${escapeHtml(leaderboard.f1.strategy.title || leaderboard.f1.strategy_id)} (${escapeHtml(formatMetric(leaderboard.f1.value))})</div>` : '',
      leaderboard.pr_auc ? `<div><strong>PR AUC:</strong> ${escapeHtml(leaderboard.pr_auc.strategy.title || leaderboard.pr_auc.strategy_id)} (${escapeHtml(formatMetric(leaderboard.pr_auc.value))})</div>` : '',
      leaderboard.roc_auc ? `<div><strong>ROC AUC:</strong> ${escapeHtml(leaderboard.roc_auc.strategy.title || leaderboard.roc_auc.strategy_id)} (${escapeHtml(formatMetric(leaderboard.roc_auc.value))})</div>` : '',
      leaderboard.top_1_accuracy ? `<div><strong>Top-1:</strong> ${escapeHtml(leaderboard.top_1_accuracy.strategy.title || leaderboard.top_1_accuracy.strategy_id)} (${escapeHtml(formatMetric(leaderboard.top_1_accuracy.value))})</div>` : '',
    ].filter(Boolean);

    imbalanceResults.className = 'model-card-grid imbalance-comparison-grid';
    imbalanceResults.innerHTML = `
      <article class="model-card comparison-summary-card">
        <p class="eyebrow subtle">Imbalance Comparison</p>
        <h3>Metric Leaderboard</h3>
        <p class="candidate-copy">Which strategy topped each metric. Each run uses the same labeled dataset and model family — only the in-memory balancing changes.</p>
        <div class="summary tight-summary">
          ${leaderboardRows.join('')}
          <div><strong>Focus strategy:</strong> ${escapeHtml((getImbalanceStrategyMeta(focusStrategy) || {}).title || focusStrategy || 'Baseline')}</div>
        </div>
      </article>

      ${renderConfusionMatrixCard(focusConfusion, {
        eyebrow: 'Focus Strategy',
        title: `${(focusRun && focusRun.strategy && focusRun.strategy.title) || focusStrategy || 'Baseline'} Confusion Matrix`,
        emptyText: 'No confusion matrix for the selected strategy.',
        cardClass: 'comparison-confusion-card',
      })}

      <article class="model-card comparison-radar-card">
        <p class="eyebrow subtle">Multi-Metric View</p>
        <h3>Strategy Radar</h3>
        <p class="candidate-copy">Each coloured polygon represents one strategy. A larger area means better overall performance. The <strong>focus strategy</strong> is shown with a stronger fill. Perfect scores reach the outer ring; watch for strategies that are strong on recall but weak on precision (lopsided shapes).</p>
        ${renderRadarChart(comparisonRows, focusStrategy)}
      </article>

      <article class="model-card comparison-table-card">
        <p class="eyebrow subtle">Full Breakdown</p>
        <h3>Strategy-by-Strategy Table</h3>
        <p class="candidate-copy">
          <strong>K</strong> = nearest neighbours used by SMOTE-like synthesis (n/a for strategies that don't generate synthetic rows).
          <strong>Shift</strong> = how many percentage points the minority share grew after resampling — higher means more aggressive balancing.
          <strong>F1</strong> is the harmonic mean of precision and recall; use it when you want to balance both.
          <strong>PR AUC</strong> is the most reliable metric when positive examples are rare.
          The highlighted row is the current focus strategy.
        </p>
        <div class="table-shell comparison-table-shell">
          <table class="comparison-data-table">
            <thead>
              <tr>
                <th>Strategy</th>
                <th title="Nearest neighbours used during SMOTE-like synthesis">K</th>
                <th title="Original positive / negative class counts before resampling">Original split</th>
                <th title="Prepared positive / negative counts used for training">Prepared split</th>
                <th title="How the minority class share changed">Minority share → shift</th>
                <th title="Rows created in memory by oversampling or SMOTE">Synth rows</th>
                <th title="F1 score on held-out test set">F1</th>
                <th title="Precision: of all predicted positives, how many were correct">Precision</th>
                <th title="Recall: of all true positives, how many did the model find">Recall</th>
                <th title="Area under Precision-Recall curve — best metric for rare positive class">PR AUC</th>
                <th title="Area under ROC curve">ROC AUC</th>
                <th title="Whether the top-ranked candidate per page is truly positive">Top-1</th>
              </tr>
            </thead>
            <tbody>
              ${comparisonRows.map((entry) => {
                const isFocus = entry.run.strategy_id === focusStrategy;
                const color = getStrategyColor(entry.run.strategy_id);
                const original = (() => {
                  const pos = Number(entry.originalCounts.positive) || 0;
                  const neg = Number(entry.originalCounts.negative) || 0;
                  const total = pos + neg;
                  return { pos, neg, total, ratio: neg > 0 ? (neg/Math.max(pos,1)).toFixed(1)+':1' : 'n/a' };
                })();
                const prepared = (() => {
                  const pos = Number(entry.preparedCounts.positive) || 0;
                  const neg = Number(entry.preparedCounts.negative) || 0;
                  const total = pos + neg;
                  return { pos, neg, total, ratio: neg > 0 ? (neg/Math.max(pos,1)).toFixed(1)+':1' : 'n/a' };
                })();
                const shift = entry.preparedMinorityShare !== null && entry.originalMinorityShare !== null
                  ? entry.preparedMinorityShare - entry.originalMinorityShare : null;
                const renderMetricCell = (value, allValues) => {
                  if (value == null || !Number.isFinite(Number(value))) return '<td class="table-muted">—</td>';
                  const v = Number(value);
                  const maxV = Math.max(...allValues.filter(Number.isFinite));
                  const isBest = Math.abs(v - maxV) < 0.001;
                  const pct = maxV > 0 ? Math.round((v / maxV) * 100) : 0;
                  return `<td class="${isBest ? 'metric-best' : ''}">
                    <div class="metric-cell">
                      <div class="metric-mini-bar"><div class="metric-mini-fill" style="width:${pct}%;background:${escapeHtml(color)}"></div></div>
                      <span class="metric-cell-value">${escapeHtml(formatMetric(v))}</span>
                    </div>
                  </td>`;
                };
                const allF1 = comparisonRows.map((e) => e.candidateMetrics ? Number(e.candidateMetrics.f1) : NaN);
                const allPrec = comparisonRows.map((e) => e.candidateMetrics ? Number(e.candidateMetrics.precision) : NaN);
                const allRecall = comparisonRows.map((e) => e.candidateMetrics ? Number(e.candidateMetrics.recall) : NaN);
                const allPrAuc = comparisonRows.map((e) => e.candidateMetrics ? Number(e.candidateMetrics.pr_auc) : NaN);
                const allRocAuc = comparisonRows.map((e) => e.candidateMetrics ? Number(e.candidateMetrics.roc_auc) : NaN);
                const allTop1 = comparisonRows.map((e) => e.rankingMetrics ? Number(e.rankingMetrics.top_1_accuracy) : NaN);
                return `<tr class="${isFocus ? 'is-current' : ''}">
                  <td>
                    <div class="strategy-name-cell">
                      <span class="strategy-color-dot" style="background:${escapeHtml(color)}"></span>
                      <div>
                        <strong>${escapeHtml(entry.run.strategy.title || entry.run.strategy_id)}</strong>
                        <div class="table-muted">${escapeHtml(entry.imbalance.balancing_mode || entry.imbalance.id || 'baseline')}</div>
                      </div>
                    </div>
                  </td>
                  <td><strong>${escapeHtml(entry.nearestNeighbors !== null ? entry.nearestNeighbors : '—')}</strong></td>
                  <td>
                    <strong>${escapeHtml(original.pos)} / ${escapeHtml(original.neg)}</strong>
                    <div class="table-muted">${escapeHtml(original.ratio)} ratio</div>
                  </td>
                  <td>
                    <strong>${escapeHtml(prepared.pos)} / ${escapeHtml(prepared.neg)}</strong>
                    <div class="table-muted">${escapeHtml(prepared.ratio)} ratio</div>
                  </td>
                  <td>
                    <div>${escapeHtml(formatPercentage(entry.originalMinorityShare))} → <strong>${escapeHtml(formatPercentage(entry.preparedMinorityShare))}</strong></div>
                    <div class="table-muted shift-cell ${shift !== null && shift > 0 ? 'shift-positive' : ''}">${shift !== null ? (shift > 0 ? '+' : '') + escapeHtml(formatPercentagePoints(shift)) : '—'}</div>
                  </td>
                  <td>${escapeHtml(entry.syntheticRows > 0 ? String(entry.syntheticRows) : '—')}</td>
                  ${renderMetricCell(entry.candidateMetrics ? entry.candidateMetrics.f1 : null, allF1)}
                  ${renderMetricCell(entry.candidateMetrics ? entry.candidateMetrics.precision : null, allPrec)}
                  ${renderMetricCell(entry.candidateMetrics ? entry.candidateMetrics.recall : null, allRecall)}
                  ${renderMetricCell(entry.candidateMetrics ? entry.candidateMetrics.pr_auc : null, allPrAuc)}
                  ${renderMetricCell(entry.candidateMetrics ? entry.candidateMetrics.roc_auc : null, allRocAuc)}
                  ${renderMetricCell(entry.rankingMetrics ? entry.rankingMetrics.top_1_accuracy : null, allTop1)}
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </article>

      ${comparisonRows.some((e) => e.nearestNeighbors > 0 && e.syntheticRows > 0) ? `
      <article class="model-card comparison-knn-card">
        <p class="eyebrow subtle">How K-Nearest Neighbours Works</p>
        <h3>KNN Synthesis Diagram</h3>
        <p class="candidate-copy">
          SMOTE-like synthesis works in feature space, not in raw data. For each minority sample (green), the algorithm finds its <strong>K nearest minority neighbours</strong> (connected by dashed lines). A new synthetic row is created at a random point along the line between the seed and one of those neighbours (purple dashed circle).
          Majority class samples (red) are ignored during synthesis — the goal is to increase the density of the minority class without simply duplicating rows.
          A higher K creates more diverse synthetic samples; a lower K keeps synthesis conservative and close to existing examples.
        </p>
        ${renderKnnDiagram(comparisonRows)}
      </article>
      ` : ''}
    `;
  }

  function normalizeOverviewJobIds(value) {
    return Array.from(new Set(String(value || '')
      .split(/[,\s]+/)
      .map((entry) => entry.trim())
      .filter(Boolean)));
  }

  function buildOverviewUrl() {
    const jobIds = normalizeOverviewJobIds(overviewJobIds ? overviewJobIds.value : '');
    currentOverviewScope = jobIds.join(',');
    return `/api/modeling/overview${currentOverviewScope ? `?jobIds=${encodeURIComponent(currentOverviewScope)}` : ''}`;
  }

  function renderOverview(overview) {
    currentOverview = overview;
    setOverviewMessage('', false);
    currentImbalanceStrategies = Array.isArray(overview && overview.imbalance_strategies) && overview.imbalance_strategies.length
      ? overview.imbalance_strategies.slice()
      : currentImbalanceStrategies;
    const dataset = overview && overview.dataset ? overview.dataset : null;
    const models = overview && Array.isArray(overview.models) ? overview.models : [];
    const families = overview && Array.isArray(overview.feature_families) ? overview.feature_families : [];
    if (families.length && featureExclusionFamilies && !featureExclusionFamilies.children.length) {
      buildFeatureExclusionPanel(families);
    }
    const selectedJobs = overview && Array.isArray(overview.selected_jobs) ? overview.selected_jobs : [];
    const selectedJobDetails = overview && Array.isArray(overview.selected_job_details) ? overview.selected_job_details : [];
    const visibleJobs = selectedJobs.length ? selectedJobs : selectedJobDetails;
    const scopeLabel = currentOverviewScope
      ? normalizeOverviewJobIds(currentOverviewScope).join(', ')
      : 'Global dataset';

    if (!dataset && !visibleJobs.length) {
      overviewShell.className = 'summary empty';
      overviewShell.textContent = 'No modeling overview available.';
      syncOverviewPolling();
      return;
    }

    overviewShell.className = 'summary';
    const summaryRows = dataset
      ? [
        `<div><strong>Labeled Candidates:</strong> ${escapeHtml(dataset.labeled_candidate_count)}</div>`,
        `<div><strong>Positive Labels:</strong> ${escapeHtml(dataset.positive_candidate_count)}</div>`,
        `<div><strong>Negative Labels:</strong> ${escapeHtml(dataset.negative_candidate_count)}</div>`,
        `<div><strong>Uncertain Labels:</strong> ${escapeHtml(dataset.uncertain_candidate_count)}</div>`,
        `<div><strong>Candidate Rows:</strong> ${escapeHtml(dataset.candidate_count)}</div>`,
        `<div><strong>Reviewed Items:</strong> ${escapeHtml(dataset.review_complete_binary_item_count)}</div>`,
        `<div><strong>Hostnames:</strong> ${escapeHtml(dataset.hostname_count)}</div>`,
      ]
      : [
        '<div><strong>Labeled Candidates:</strong> 0</div>',
        '<div><strong>Positive Labels:</strong> 0</div>',
        '<div><strong>Negative Labels:</strong> 0</div>',
        '<div><strong>Uncertain Labels:</strong> 0</div>',
        '<div><strong>Candidate Rows:</strong> 0</div>',
        '<div><strong>Reviewed Items:</strong> 0</div>',
        '<div><strong>Hostnames:</strong> 0</div>',
      ];

    const selectedJobRows = visibleJobs.length
      ? visibleJobs.flatMap((job, index) => {
        const sourceJobIds = Array.isArray(job.source_job_ids) ? job.source_job_ids.filter(Boolean).join(', ') : '';
        const jobLabel = visibleJobs.length > 1 ? `Job ${index + 1}` : 'Selected Job';
        return [
          `<div><strong>${jobLabel} ID:</strong> ${escapeHtml(job.id || '')}</div>`,
          `<div><strong>Status:</strong> ${escapeHtml(job.status || '')}</div>`,
          `<div><strong>Total URLs:</strong> ${escapeHtml(job.total_urls || 0)}</div>`,
          `<div><strong>Completed:</strong> ${escapeHtml(job.completed_count || 0)}</div>`,
          `<div><strong>Failed:</strong> ${escapeHtml(job.failed_count || 0)}</div>`,
          `<div><strong>Detected:</strong> ${escapeHtml(job.detected_count || 0)}</div>`,
          `<div><strong>Pending:</strong> ${escapeHtml(job.pending_count || 0)}</div>`,
          `<div><strong>Queued:</strong> ${escapeHtml(job.queued_count || 0)}</div>`,
          `<div><strong>Running:</strong> ${escapeHtml(job.running_count || 0)}</div>`,
          `<div><strong>Mode:</strong> ${escapeHtml(job.candidate_mode || '')}</div>`,
          `<div><strong>Source:</strong> ${escapeHtml(job.source_filename || '')}</div>`,
          `<div><strong>Column:</strong> ${escapeHtml(job.source_column || '')}</div>`,
          sourceJobIds ? `<div><strong>Source Jobs:</strong> ${escapeHtml(sourceJobIds)}</div>` : '',
          `<div><strong>Updated:</strong> ${escapeHtml(job.updated_at || '')}</div>`,
        ].filter(Boolean);
      })
      : [];

    const noteRows = !dataset && visibleJobs.length
      ? [`<div class="candidate-copy">No labeled candidate rows were found for the selected job(s) yet. Live job totals are shown below.</div>`]
      : [];

    overviewShell.innerHTML = [
      ...selectedJobRows,
      ...summaryRows,
      `<div><strong>Saved Models:</strong> ${escapeHtml(models.length)}</div>`,
      `<div><strong>Feature Families:</strong> ${escapeHtml(families.length)}</div>`,
      `<div><strong>Scope:</strong> ${escapeHtml(scopeLabel)}</div>`,
      ...noteRows,
    ].join('');

    updateImbalanceStrategyNote();
    syncOverviewPolling();
  }

  function populateDiagVariantSelect(variants) {
    if (!diagVariantId) return;
    const current = diagVariantId.value;
    diagVariantId.innerHTML = (variants || []).map((v) => `<option value="${escapeHtml(v.id)}">${escapeHtml(v.title || v.id)}</option>`).join('') || '<option value="">No variants</option>';
    if (current && (variants || []).find((v) => v.id === current)) diagVariantId.value = current;
  }

  function renderVariantCards(variants) {
    currentVariants = variants || [];
    populateDiagVariantSelect(currentVariants);
    if (!currentVariants.length) {
      variantCards.className = 'model-card-grid empty';
      variantCards.textContent = 'No model variants are available.';
      return;
    }

    variantCards.className = 'model-card-grid';
    variantCards.innerHTML = currentVariants.map((variant) => {
      const usesKeywords = !variant.excludeKeywordFeatures;
      const algorithmLabel = trainAlgorithm
        ? formatAlgorithmName(trainAlgorithm.value)
        : 'Logistic Regression';
      return `
        <article class="model-card">
          <p class="eyebrow subtle">${escapeHtml(variant.id)}</p>
          <h3>${escapeHtml(variant.title)}</h3>
          <p>${escapeHtml(variant.description)}</p>
          <div class="feature-chip-list">
            <span class="feature-chip plain">
              <strong>Feature Count</strong><span>${escapeHtml(variant.feature_count)}</span>
            </span>
            <span class="feature-chip ${usesKeywords ? 'good' : 'muted'}" title="${usesKeywords ? 'Text keywords (e.g. "comments", "reply") are included as features' : 'Text keywords are excluded — only structural DOM signals remain'}">
              <strong>🔤 Keywords</strong>
              <span>${usesKeywords ? 'included' : 'excluded'}</span>
            </span>
            <span class="feature-chip plain" title="The classifier algorithm that will be used when you click Train">
              <strong>Algorithm</strong><span>${escapeHtml(algorithmLabel)}</span>
            </span>
          </div>
          <div class="candidate-actions">
            <button class="primary" type="button" data-train-variant="${escapeHtml(variant.id)}">Train ${escapeHtml(variant.title)}</button>
            <a class="link-button" data-dataset-variant="${escapeHtml(variant.id)}" href="#">Download Variant Dataset</a>
          </div>
        </article>
      `;
    }).join('');
    updateDatasetDownloadLink();
  }

  function renderTrainResult(model) {
    if (!model) {
      trainResult.className = 'model-card-grid empty';
      trainResult.textContent = '';
      if (imbalanceResults) {
        imbalanceResults.className = 'model-card-grid empty';
        imbalanceResults.textContent = '';
      }
      return;
    }

    const evaluation = model.evaluation && model.evaluation.test
      ? model.evaluation.test
      : model.evaluation && model.evaluation.train
        ? model.evaluation.train
        : null;
    const algorithmLabel = formatAlgorithmName(model.algorithm);
    const imbalance = model.imbalance_strategy || null;
    const trainingCounts = model.training_counts || {};
    const originalCounts = imbalance && imbalance.original_label_counts
      ? imbalance.original_label_counts
      : trainingCounts.train_label_counts || {};
    const preparedCounts = imbalance && imbalance.prepared_label_counts
      ? imbalance.prepared_label_counts
      : trainingCounts.effective_train_label_counts || originalCounts;
    const candidateMetrics = evaluation && evaluation.candidate_metrics
      ? evaluation.candidate_metrics
      : null;
    const rankingMetrics = evaluation && evaluation.ranking_metrics
      ? evaluation.ranking_metrics
      : null;
    const evaluationConfusion = evaluation && evaluation.candidate_metrics
      ? evaluation.candidate_metrics.confusion
      : null;
    const evaluationConfusionTitle = model.evaluation && model.evaluation.test
      ? 'Test Confusion Matrix'
      : 'Training Confusion Matrix';
    const familyImportance = model.reliance && Array.isArray(model.reliance.family_importance)
      ? model.reliance.family_importance.slice(0, 6)
      : [];
    const positiveWeights = model.reliance && Array.isArray(model.reliance.positive_weights)
      ? model.reliance.positive_weights.slice(0, 5)
      : [];
    const negativeWeights = model.reliance && Array.isArray(model.reliance.negative_weights)
      ? model.reliance.negative_weights.slice(0, 5)
      : [];
    const renderWeightList = (entries, tone, emptyMessage) => {
      if (!entries.length) {
        return `<p class="candidate-copy model-card-empty">${escapeHtml(emptyMessage)}</p>`;
      }
      return `
        <div class="feature-chip-list">
          ${entries.map((entry) => `
            <span class="feature-chip ${tone}">
              <strong>${escapeHtml(entry.title || entry.output_key)}</strong>
              <span>${escapeHtml(formatMetric(entry.weight, 5))}</span>
            </span>
          `).join('')}
        </div>
      `;
    };

    trainResult.className = 'model-card-grid';
    trainResult.innerHTML = `
      <article class="model-card">
        <p class="eyebrow subtle">Latest Training Result</p>
        <h3>${escapeHtml(model.variant_title || model.variant_id || '')}</h3>
        <p>Saved as <code>${escapeHtml(model.id || '')}</code>. This is the artifact you can use for scoring jobs and probing site groups.</p>
        <div class="summary tight-summary">
          <div><strong>Algorithm:</strong> ${escapeHtml(algorithmLabel)}</div>
          <div><strong>Imbalance:</strong> ${escapeHtml((imbalance && imbalance.title) || 'Baseline')}</div>
          <div><strong>Train Rows:</strong> ${escapeHtml(model.training_counts ? model.training_counts.train_rows : '')}</div>
          <div><strong>Effective Rows:</strong> ${escapeHtml(model.training_counts ? model.training_counts.effective_train_rows : '')}</div>
          <div><strong>Test Rows:</strong> ${escapeHtml(model.training_counts ? model.training_counts.test_rows : '')}</div>
          <div><strong>Nearest Neighbors (K):</strong> ${escapeHtml(imbalance && imbalance.nearest_neighbors !== null && imbalance.nearest_neighbors !== undefined ? imbalance.nearest_neighbors : 'n/a')}</div>
          <div><strong>Precision:</strong> ${escapeHtml(candidateMetrics ? formatMetric(candidateMetrics.precision) : '')}</div>
          <div><strong>Recall:</strong> ${escapeHtml(candidateMetrics ? formatMetric(candidateMetrics.recall) : '')}</div>
          <div><strong>F1:</strong> ${escapeHtml(candidateMetrics ? formatMetric(candidateMetrics.f1) : '')}</div>
          <div><strong>PR AUC:</strong> ${escapeHtml(candidateMetrics ? formatMetric(candidateMetrics.pr_auc) : '')}</div>
          <div><strong>ROC AUC:</strong> ${escapeHtml(candidateMetrics ? formatMetric(candidateMetrics.roc_auc) : '')}</div>
          <div><strong>Top-1 Accuracy:</strong> ${escapeHtml(rankingMetrics ? formatMetric(rankingMetrics.top_1_accuracy) : '')}</div>
        </div>
      </article>
      <article class="model-card">
        <p class="eyebrow subtle">Imbalance Diagnostics</p>
        <h3>${escapeHtml((imbalance && imbalance.title) || 'Baseline')}</h3>
        <div class="imbalance-chart-grid">
          ${renderLabelBalanceDonut(originalCounts, {
            centerTitle: `${originalCounts.positive || 0}:${originalCounts.negative || 0}`,
            centerLabel: 'original',
            title: 'Original label balance',
            subtitle: imbalance && imbalance.original_imbalance_ratio !== null && imbalance.original_imbalance_ratio !== undefined
              ? `Ratio: ${formatMetric(imbalance.original_imbalance_ratio, 2)}`
              : '',
          })}
          ${renderLabelBalanceDonut(preparedCounts, {
            centerTitle: `${preparedCounts.positive || 0}:${preparedCounts.negative || 0}`,
            centerLabel: 'prepared',
            title: 'Prepared label balance',
            subtitle: imbalance && imbalance.prepared_imbalance_ratio !== null && imbalance.prepared_imbalance_ratio !== undefined
              ? `Ratio: ${formatMetric(imbalance.prepared_imbalance_ratio, 2)}`
              : '',
          })}
        </div>
        <div class="summary tight-summary">
          <div><strong>Strategy:</strong> ${escapeHtml((imbalance && imbalance.description) || 'No resampling applied.')}</div>
          <div><strong>Original Rows:</strong> ${escapeHtml(imbalance ? imbalance.original_row_count : trainingCounts.train_rows || '')}</div>
          <div><strong>Prepared Rows:</strong> ${escapeHtml(imbalance ? imbalance.prepared_row_count : trainingCounts.effective_train_rows || '')}</div>
          <div><strong>Synthetic Rows:</strong> ${escapeHtml(imbalance ? imbalance.synthetic_row_count : 0)}</div>
          <div><strong>Nearest Neighbors (K):</strong> ${escapeHtml(imbalance && imbalance.nearest_neighbors !== null && imbalance.nearest_neighbors !== undefined ? imbalance.nearest_neighbors : 'n/a')}</div>
          <div><strong>Fallback:</strong> ${escapeHtml((imbalance && imbalance.fallback) || 'none')}</div>
          <div><strong>Class Weighting:</strong> ${imbalance && (imbalance.class_weighting || imbalance.class_weighting_effective) ? 'yes' : 'no'}</div>
          <div><strong>PR AUC:</strong> ${escapeHtml(candidateMetrics ? formatMetric(candidateMetrics.pr_auc) : '')}</div>
          <div><strong>ROC AUC:</strong> ${escapeHtml(candidateMetrics ? formatMetric(candidateMetrics.roc_auc) : '')}</div>
        </div>
        <p class="candidate-copy">The rows stay in memory only. Stored labels and source data are not changed.</p>
      </article>
      ${renderConfusionMatrixCard(evaluationConfusion, {
        eyebrow: 'Training Evaluation',
        title: evaluationConfusionTitle,
        emptyText: 'No binary confusion matrix is available for this model yet.',
      })}
      <article class="model-card">
        <p class="eyebrow subtle">Feature Reliance</p>
        <h3>Most Influential Families</h3>
        <div class="feature-chip-list">
          ${familyImportance.map((family) => `
            <span class="feature-chip plain">
              <strong>${escapeHtml(family.family)}</strong>
              <span>${escapeHtml(formatMetric(family.total_absolute_weight, 5))}</span>
            </span>
          `).join('')}
        </div>
        <p class="candidate-copy">These are the feature families the trained model leaned on most heavily, based on average absolute contribution across labeled training rows.</p>
      </article>
      <article class="model-card">
        <p class="eyebrow subtle">Positive Drivers</p>
        <h3>Top Positive Signals</h3>
        ${renderWeightList(positiveWeights, 'good', 'No positive signals surfaced in the current rounded summary.')}
      </article>
      <article class="model-card">
        <p class="eyebrow subtle">Negative Drivers</p>
        <h3>Top Negative Signals</h3>
        ${renderWeightList(negativeWeights, 'muted', 'No negative signals surfaced in the current rounded summary.')}
      </article>
    `;

    if (Array.isArray(model.threshold_curve) && model.threshold_curve.length > 0) {
      const tunerEl = buildThresholdTuner(model.threshold_curve, model.id);
      if (tunerEl) trainResult.appendChild(tunerEl);
    }
  }

  function buildThresholdTuner(curve, artifactId) {
    if (!Array.isArray(curve) || curve.length < 3) return null;

    const uid = String(artifactId || 'th').replace(/[^a-z0-9]/gi, '-').slice(0, 32);

    let bestIdx = 50;
    curve.forEach((p, i) => { if (p.f1 > curve[bestIdx].f1) bestIdx = i; });
    const bestPt = curve[bestIdx];

    const svgW = 300, svgH = 210;
    const lx = 40, rx = svgW - 12, ty = 8, by = svgH - 30;
    const cW = rx - lx, cH = by - ty;

    const sorted = curve.slice().sort((a, b) => a.recall - b.recall);
    const polyPts = sorted.map((p) =>
      `${(lx + p.recall * cW).toFixed(1)},${(by - p.precision * cH).toFixed(1)}`
    ).join(' ');

    const ticks = [0, 0.25, 0.5, 0.75, 1];
    const defIdx = 50;
    const def = curve[defIdx];

    const tickSvg = ticks.map((v) => `
      <line x1="${lx}" y1="${(by - v * cH).toFixed(1)}" x2="${rx}" y2="${(by - v * cH).toFixed(1)}" stroke="var(--line)" stroke-width="${v === 0 ? 1 : 0.5}" stroke-dasharray="${v === 0 ? '' : '3 3'}"/>
      <line x1="${(lx + v * cW).toFixed(1)}" y1="${ty}" x2="${(lx + v * cW).toFixed(1)}" y2="${by}" stroke="var(--line)" stroke-width="${v === 0 ? 1 : 0.5}" stroke-dasharray="${v === 0 ? '' : '3 3'}"/>
      <text x="${lx - 4}" y="${(by - v * cH + 3.5).toFixed(0)}" text-anchor="end" font-size="8.5" fill="var(--muted)">${v.toFixed(2)}</text>
      <text x="${(lx + v * cW).toFixed(0)}" y="${by + 13}" text-anchor="middle" font-size="8.5" fill="var(--muted)">${v.toFixed(2)}</text>
    `).join('');

    const article = document.createElement('article');
    article.className = 'analysis-card analysis-card-wide threshold-tuner-card';
    article.innerHTML = `
      <p class="eyebrow subtle">Threshold Tuner</p>
      <h3>Find Your Operating Point</h3>
      <p class="candidate-copy threshold-tuner-desc">Drag the slider to explore how precision, recall and F1 change at each decision threshold. The moving dot tracks your position on the PR curve. The green dot marks the best F1.</p>
      <div class="threshold-layout">
        <div class="threshold-pr-side">
          <svg class="threshold-pr-svg" viewBox="0 0 ${svgW} ${svgH}" aria-label="Precision–Recall Curve">
            ${tickSvg}
            <text x="${lx + cW / 2}" y="${by + 26}" text-anchor="middle" font-size="10" fill="var(--muted)" font-weight="600">Recall →</text>
            <text x="9" y="${ty + cH / 2}" text-anchor="middle" font-size="10" fill="var(--muted)" font-weight="600" transform="rotate(-90 9 ${ty + cH / 2})">Precision</text>
            <polyline points="${polyPts}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.8"/>
            <circle cx="${(lx + bestPt.recall * cW).toFixed(1)}" cy="${(by - bestPt.precision * cH).toFixed(1)}" r="6" fill="var(--success)" opacity="0.85"/>
            <circle class="th-dot-${uid}" cx="${(lx + def.recall * cW).toFixed(1)}" cy="${(by - def.precision * cH).toFixed(1)}" r="7.5" fill="var(--accent)" stroke="#fff" stroke-width="2.5"/>
          </svg>
          <p class="candidate-copy" style="font-size:0.8rem;margin-top:6px"><span style="color:var(--success)">●</span> Best F1 <strong>${formatMetric(bestPt.f1)}</strong> at t&nbsp;=&nbsp;<strong>${bestPt.t.toFixed(2)}</strong></p>
        </div>
        <div class="threshold-ctrl-side">
          <div class="threshold-stat-grid">
            <div class="threshold-stat">
              <span class="threshold-stat-label">Precision</span>
              <strong class="th-prec-${uid}">${formatMetric(def.precision)}</strong>
            </div>
            <div class="threshold-stat">
              <span class="threshold-stat-label">Recall</span>
              <strong class="th-rec-${uid}">${formatMetric(def.recall)}</strong>
            </div>
            <div class="threshold-stat">
              <span class="threshold-stat-label">F1</span>
              <strong class="th-f1-${uid}">${formatMetric(def.f1)}</strong>
            </div>
            <div class="threshold-stat">
              <span class="threshold-stat-label">Accuracy</span>
              <strong class="th-acc-${uid}">${formatMetric(def.accuracy)}</strong>
            </div>
          </div>
          <div class="threshold-mini-confusion">
            <div class="threshold-mc-cell good"><span>TP</span><strong class="th-tp-${uid}">${def.tp}</strong></div>
            <div class="threshold-mc-cell warn"><span>FP</span><strong class="th-fp-${uid}">${def.fp}</strong></div>
            <div class="threshold-mc-cell warn"><span>FN</span><strong class="th-fn-${uid}">${def.fn}</strong></div>
            <div class="threshold-mc-cell good"><span>TN</span><strong class="th-tn-${uid}">${def.tn}</strong></div>
          </div>
          <div class="threshold-best-f1-note">
            Best F1 at threshold <strong>${bestPt.t.toFixed(2)}</strong>
            <button class="secondary compact th-jump-${uid}" type="button">Jump there</button>
          </div>
        </div>
      </div>
      <div class="threshold-slider-wrap">
        <div class="threshold-slider-header">
          <span>Threshold</span>
          <strong class="th-val-${uid}">${def.t.toFixed(2)}</strong>
        </div>
        <input type="range" class="threshold-slider th-range-${uid}" min="0" max="${curve.length - 1}" value="${defIdx}" step="1">
        <div class="threshold-slider-ticks">
          <span>0.00</span><span>0.25</span><span>0.50</span><span>0.75</span><span>1.00</span>
        </div>
      </div>
      <div class="threshold-apply-row">
        <button class="primary compact th-apply-${uid}" type="button">Apply This Threshold</button>
        <span class="th-apply-msg-${uid} candidate-copy" aria-live="polite" style="margin-left:10px"></span>
      </div>
    `;

    const dot    = article.querySelector(`.th-dot-${uid}`);
    const precEl = article.querySelector(`.th-prec-${uid}`);
    const recEl  = article.querySelector(`.th-rec-${uid}`);
    const f1El   = article.querySelector(`.th-f1-${uid}`);
    const accEl  = article.querySelector(`.th-acc-${uid}`);
    const valEl  = article.querySelector(`.th-val-${uid}`);
    const tpEl   = article.querySelector(`.th-tp-${uid}`);
    const fpEl   = article.querySelector(`.th-fp-${uid}`);
    const fnEl   = article.querySelector(`.th-fn-${uid}`);
    const tnEl   = article.querySelector(`.th-tn-${uid}`);
    const slider = article.querySelector(`.th-range-${uid}`);
    const jumpBtn = article.querySelector(`.th-jump-${uid}`);

    const update = (idx) => {
      const p = curve[Math.max(0, Math.min(idx, curve.length - 1))];
      dot.setAttribute('cx', (lx + p.recall * cW).toFixed(1));
      dot.setAttribute('cy', (by - p.precision * cH).toFixed(1));
      precEl.textContent = formatMetric(p.precision);
      recEl.textContent  = formatMetric(p.recall);
      f1El.textContent   = formatMetric(p.f1);
      accEl.textContent  = formatMetric(p.accuracy);
      valEl.textContent  = p.t.toFixed(2);
      tpEl.textContent   = p.tp;
      fpEl.textContent   = p.fp;
      fnEl.textContent   = p.fn;
      tnEl.textContent   = p.tn;
    };

    const applyBtn = article.querySelector(`.th-apply-${uid}`);
    const applyMsg = article.querySelector(`.th-apply-msg-${uid}`);

    slider.addEventListener('input', () => update(Number(slider.value)));
    if (jumpBtn) jumpBtn.addEventListener('click', () => { slider.value = bestIdx; update(bestIdx); });

    if (applyBtn && artifactId) {
      applyBtn.addEventListener('click', async () => {
        const currentThreshold = parseFloat(valEl.textContent);
        if (!Number.isFinite(currentThreshold)) return;
        applyBtn.disabled = true;
        applyMsg.textContent = 'Saving…';
        try {
          await fetchJson(`/api/modeling/models/${encodeURIComponent(artifactId)}/threshold`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ threshold: currentThreshold }),
          });
          applyMsg.textContent = `Threshold ${currentThreshold.toFixed(2)} saved — model list updated.`;
          await refreshPage();
        } catch (err) {
          applyMsg.textContent = `Error: ${err && err.message ? err.message : String(err)}`;
        } finally {
          applyBtn.disabled = false;
        }
      });
    } else if (applyBtn) {
      applyBtn.style.display = 'none'; // no artifactId = read-only view
    }

    return article;
  }

  function repopulateModelSelects(models) {
    currentModels = models || [];
    const options = currentModels.map((model) => `
      <option value="${escapeHtml(model.id)}">${escapeHtml(`${model.variant_title || model.variant_id || model.id} • ${formatAlgorithmName(model.algorithm)} • ${String(model.created_at || '').slice(0, 10)}`)}</option>
    `).join('');

    [scoreModelId, siteGroupModelId, liveProbeModelId].forEach((select) => {
      select.innerHTML = options || '<option value="">No trained models</option>';
      select.disabled = !options;
    });
  }

  // ── variant badge helper ──────────────────────────────────────────────────────
  function variantBadge(variantId, variantTitle) {
    const id = String(variantId || '').toLowerCase();
    const label = variantTitle || variantId || 'Unknown';
    let color = '#6b7280'; let bg = '#f3f4f6'; // default / custom
    if (id === 'full' || id === 'default') { color = '#166534'; bg = '#dcfce7'; }
    else if (id.includes('ablat')) { color = '#92400e'; bg = '#fef3c7'; }
    else { color = '#1e40af'; bg = '#dbeafe'; } // custom
    return `<span style="font-size:0.7rem;font-weight:600;color:${color};background:${bg};border-radius:4px;padding:1px 6px;white-space:nowrap">${escapeHtml(label)}</span>`;
  }

  function renderModelList(models) {
    repopulateModelSelects(models);
    syncArchetypeModelSelector(models || []);
    if (!models || !models.length) {
      modelList.className = 'table-shell empty';
      modelList.textContent = 'No trained models saved yet.';
      return;
    }

    modelList.className = 'table-shell';
    modelList.innerHTML = `
      <table>
        <thead>
          <tr>
            <th style="min-width:180px">Artifact</th>
            <th>Variant</th>
            <th>Algorithm</th>
            <th title="Number of features the model was trained on">Features</th>
            <th>F1</th>
            <th>Precision</th>
            <th>Recall</th>
            <th>Top-1</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${models.map((model) => {
            const evaluation = model.evaluation && model.evaluation.test
              ? model.evaluation.test
              : model.evaluation && model.evaluation.train
                ? model.evaluation.train
                : null;
            const cm = evaluation && evaluation.candidate_metrics ? evaluation.candidate_metrics : null;
            const rm = evaluation && evaluation.ranking_metrics ? evaluation.ranking_metrics : null;
            const f1    = cm && cm.f1    != null ? cm.f1    : null;
            const prec  = cm && cm.precision != null ? cm.precision : null;
            const rec   = cm && cm.recall != null ? cm.recall : null;
            const top1  = rm && rm.top_1_accuracy != null ? rm.top_1_accuracy : null;
            const isTest = !!(model.evaluation && model.evaluation.test);
            // Colour-code F1 for at-a-glance quality
            const f1Color = f1 == null ? '' : f1 >= 0.8 ? 'color:#16a34a;font-weight:700' : f1 >= 0.6 ? 'color:#d97706;font-weight:600' : 'color:#dc2626';
            return `
              <tr>
                <td class="mono" style="font-size:0.78rem;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(model.id || '')}">${escapeHtml(model.id || '')}</td>
                <td>${variantBadge(model.variant_id, model.variant_title)}</td>
                <td style="font-size:0.82rem">${escapeHtml(formatAlgorithmName(model.algorithm))}</td>
                <td style="text-align:center">
                  <span style="font-size:0.78rem;font-weight:600;color:#374151">${model.feature_count != null ? model.feature_count : '—'}</span>
                </td>
                <td style="${f1Color}">${f1 != null ? formatMetric(f1) : '—'}${isTest ? '' : '<span title="Train set" style="color:#94a3b8;font-size:0.68rem"> tr</span>'}</td>
                <td>${prec != null ? formatMetric(prec) : '—'}</td>
                <td>${rec  != null ? formatMetric(rec)  : '—'}</td>
                <td>${top1 != null ? formatMetric(top1) : '—'}</td>
                <td>
                  <div class="action-stack">
                    <button class="primary compact" type="button" data-detail-model="${escapeHtml(model.id || '')}">Details</button>
                    <button class="secondary compact" type="button" data-use-model="${escapeHtml(model.id || '')}">Use</button>
                    <button class="secondary compact" type="button" data-tune-model="${escapeHtml(model.id || '')}">Tune</button>
                    <button class="secondary compact danger" type="button" data-delete-model="${escapeHtml(model.id || '')}">Delete</button>
                  </div>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  }

  // ── Model detail modal ────────────────────────────────────────────────────────
  function openModelDetailModal(modelId) {
    if (!modelDetailDialog) return;
    if (modelDetailEyebrow) modelDetailEyebrow.textContent = 'Model Artifact';
    if (modelDetailTitle)   modelDetailTitle.textContent   = modelId;
    if (modelDetailBody)    modelDetailBody.innerHTML = '<p style="color:#6b7280;text-align:center;margin:40px 0">Loading model details…</p>';
    modelDetailDialog.showModal();

    fetchJson(`/api/modeling/models/${encodeURIComponent(modelId)}`)
      .then(({ model }) => renderModelDetailModal(model))
      .catch((err) => {
        if (modelDetailBody) modelDetailBody.innerHTML = `<p style="color:#dc2626;text-align:center;margin:40px 0">Failed to load: ${escapeHtml(err.message || String(err))}</p>`;
      });
  }

  function metricCell(val, { good, warn } = {}) {
    if (val == null) return '<td style="color:#9ca3af;text-align:center">—</td>';
    const pct = (val * 100).toFixed(1) + '%';
    const color = good != null && val >= good ? '#16a34a' : warn != null && val >= warn ? '#d97706' : '#dc2626';
    return `<td style="text-align:center;font-weight:600;color:${color}">${pct}</td>`;
  }

  function renderModelDetailModal(artifact) {
    if (!artifact || !modelDetailBody) return;

    // ── gather data ───────────────────────────────────────────────────────────
    const ev       = artifact.evaluation || {};
    const trainEv  = ev.train || null;
    const testEv   = ev.test  || null;
    const trainCm  = trainEv && trainEv.candidate_metrics ? trainEv.candidate_metrics : null;
    const testCm   = testEv  && testEv.candidate_metrics  ? testEv.candidate_metrics  : null;
    const trainRm  = trainEv && trainEv.ranking_metrics   ? trainEv.ranking_metrics   : null;
    const testRm   = testEv  && testEv.ranking_metrics    ? testEv.ranking_metrics    : null;
    const xssRates = (testEv && testEv.xss_signal_rates) || (trainEv && trainEv.xss_signal_rates) || null;
    const tc       = artifact.training_counts || {};
    const ds       = artifact.dataset_summary || {};
    const reliance = artifact.reliance || {};
    const catalog  = Array.isArray(artifact.feature_catalog) ? artifact.feature_catalog : [];
    const strategy = artifact.imbalance_strategy || null;
    const split    = artifact.split || null;

    // Update header
    const vId = artifact.variant_id || '';
    const vTitle = artifact.variant_title || vId;
    if (modelDetailEyebrow) modelDetailEyebrow.textContent = `${vTitle}  ·  ${formatAlgorithmName(artifact.algorithm)}  ·  ${(artifact.created_at || '').slice(0, 16).replace('T', ' ')}`;
    if (modelDetailTitle)   modelDetailTitle.textContent = artifact.id || '';

    // ── feature breakdown: group catalog by family prefix ─────────────────────
    // Get the full variant catalog from the overview data (if available) so we
    // can highlight which features were EXCLUDED vs kept.
    const allFamilies = (currentOverview && Array.isArray(currentOverview.feature_families))
      ? currentOverview.feature_families : [];
    const usedKeys = new Set(catalog.map((f) => f.key));
    const totalVariantFeatures = allFamilies.reduce((s, fam) => s + (Array.isArray(fam.features) ? fam.features.length : 0), 0);
    const excludedCount = totalVariantFeatures - catalog.length;

    // Feature families HTML
    const familiesHtml = allFamilies.length ? allFamilies.map((fam) => {
      const famFeatures = Array.isArray(fam.features) ? fam.features : [];
      const usedInFam   = famFeatures.filter((f) => usedKeys.has(f.key));
      const droppedInFam = famFeatures.filter((f) => !usedKeys.has(f.key));
      const allUsed = droppedInFam.length === 0;
      const headerBg = allUsed ? '#f0fdf4' : '#fff7ed';
      const headerBorder = allUsed ? '#bbf7d0' : '#fed7aa';
      return `
        <div style="border:1px solid ${headerBorder};border-radius:6px;overflow:hidden;margin-bottom:6px">
          <div style="display:flex;align-items:center;gap:8px;padding:6px 12px;background:${headerBg}">
            <span style="font-size:0.8rem;font-weight:700;color:#1f2937;flex:1">${escapeHtml(fam.title)}</span>
            <span style="font-size:0.71rem;color:#6b7280">${usedInFam.length}/${famFeatures.length} used</span>
            ${droppedInFam.length ? `<span style="font-size:0.68rem;color:#c2410c;font-weight:600">${droppedInFam.length} excluded</span>` : ''}
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;background:#fff;padding:4px 8px">
            ${famFeatures.map((f) => {
              const used = usedKeys.has(f.key);
              return `<div style="display:flex;align-items:center;gap:5px;padding:2px 4px;border-radius:3px;${used ? '' : 'opacity:0.45'}">
                <span style="font-size:0.9rem">${used ? '✓' : '✕'}</span>
                <span style="font-family:ui-monospace,Consolas,monospace;font-size:0.72rem;color:${used ? '#111827' : '#9ca3af'};text-decoration:${used ? 'none' : 'line-through'}">${escapeHtml(f.key)}</span>
                <span style="font-size:0.62rem;color:#9ca3af;background:#f3f4f6;border-radius:2px;padding:0 3px;white-space:nowrap">${escapeHtml(f.type)}</span>
              </div>`;
            }).join('')}
          </div>
        </div>`;
    }).join('') : catalog.map((f) => `
      <span style="display:inline-block;font-family:ui-monospace,monospace;font-size:0.73rem;color:#374151;background:#f3f4f6;border:1px solid rgba(17,24,39,0.1);border-radius:3px;padding:1px 6px;margin:2px">${escapeHtml(f.key)}</span>
    `).join('');

    // ── feature importance rows ───────────────────────────────────────────────
    // reliance entries have: title, feature_key, output_key, weight, absolute_weight
    function importanceRows(items, dir) {
      if (!Array.isArray(items) || !items.length) return `<tr><td colspan="3" style="color:#9ca3af;text-align:center;padding:10px">—</td></tr>`;
      return items.slice(0, 12).map((item, i) => {
        const w    = typeof item.weight === 'number' ? item.weight : 0;
        const name = item.title || item.feature_key || item.output_key || '';
        const bar  = Math.min(100, Math.abs(w) * 120);
        const barColor = dir === 'pos' ? '#16a34a' : '#dc2626';
        return `<tr>
          <td style="padding:3px 8px;font-size:0.72rem;color:#6b7280;text-align:right;white-space:nowrap">${i + 1}</td>
          <td style="padding:3px 8px;font-size:0.75rem;color:#111827;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(item.feature_key || name)}">${escapeHtml(name)}</td>
          <td style="padding:3px 8px;min-width:100px">
            <div style="display:flex;align-items:center;gap:6px">
              <div style="height:8px;width:${Math.max(2, bar).toFixed(0)}px;background:${barColor};border-radius:2px;flex-shrink:0"></div>
              <span style="font-size:0.71rem;color:#374151;white-space:nowrap">${w.toFixed(3)}</span>
            </div>
          </td>
        </tr>`;
      }).join('');
    }

    // ── metrics helper ────────────────────────────────────────────────────────
    function metricRow(label, trainVal, testVal, opts = {}) {
      return `<tr>
        <td style="padding:5px 10px;font-size:0.8rem;color:#374151">${label}</td>
        ${metricCell(trainVal, opts)}
        ${metricCell(testVal, opts)}
      </tr>`;
    }

    // ── compose the body HTML ─────────────────────────────────────────────────
    modelDetailBody.innerHTML = `
      <!-- ① At-a-glance metrics -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px">
        ${[
          { label: 'F1 Score', val: testCm && testCm.f1 != null ? testCm.f1 : (trainCm ? trainCm.f1 : null), good: 0.8, warn: 0.6 },
          { label: 'Precision', val: testCm && testCm.precision != null ? testCm.precision : (trainCm ? trainCm.precision : null), good: 0.8, warn: 0.6 },
          { label: 'Recall', val: testCm && testCm.recall != null ? testCm.recall : (trainCm ? trainCm.recall : null), good: 0.8, warn: 0.6 },
          { label: 'Top-1 Acc', val: testRm && testRm.top_1_accuracy != null ? testRm.top_1_accuracy : (trainRm ? trainRm.top_1_accuracy : null), good: 0.9, warn: 0.7 },
        ].map(({ label, val, good, warn }) => {
          const pct = val != null ? (val * 100).toFixed(1) + '%' : '—';
          const color = val == null ? '#9ca3af' : val >= good ? '#16a34a' : val >= warn ? '#d97706' : '#dc2626';
          return `<div style="background:#fff;border:1px solid rgba(17,24,39,0.1);border-radius:8px;padding:14px;text-align:center">
            <p style="margin:0 0 4px;font-size:0.72rem;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em">${label}</p>
            <p style="margin:0;font-size:1.5rem;font-weight:700;color:${color}">${pct}</p>
            <p style="margin:2px 0 0;font-size:0.68rem;color:#9ca3af">${testEv ? 'test set' : 'train set'}</p>
          </div>`;
        }).join('')}
      </div>

      <!-- ② Training configuration -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:20px">
        <div style="background:#fff;border:1px solid rgba(17,24,39,0.1);border-radius:8px;padding:14px">
          <p style="margin:0 0 8px;font-size:0.75rem;font-weight:700;color:#1f2937;text-transform:uppercase;letter-spacing:0.04em">Dataset scope</p>
          <dl style="margin:0;display:grid;grid-template-columns:auto 1fr;gap:2px 10px;font-size:0.79rem">
            <dt style="color:#6b7280">Labeled rows</dt><dd style="margin:0;font-weight:600;color:#111827">${tc.total_labeled_rows != null ? tc.total_labeled_rows : (ds.labeled_candidate_count != null ? ds.labeled_candidate_count : '—')}</dd>
            <dt style="color:#6b7280">Positives</dt><dd style="margin:0;color:#16a34a;font-weight:600">${tc.train_label_counts && tc.train_label_counts.positive != null ? (tc.train_label_counts.positive + (tc.test_label_counts && tc.test_label_counts.positive ? tc.test_label_counts.positive : 0)) : (ds.positive_candidate_count != null ? ds.positive_candidate_count : '—')}</dd>
            <dt style="color:#6b7280">Negatives</dt><dd style="margin:0;color:#6b7280;font-weight:600">${tc.train_label_counts && tc.train_label_counts.negative != null ? (tc.train_label_counts.negative + (tc.test_label_counts && tc.test_label_counts.negative ? tc.test_label_counts.negative : 0)) : (ds.negative_candidate_count != null ? ds.negative_candidate_count : '—')}</dd>
            ${ds.job_count != null ? `<dt style="color:#6b7280">Jobs</dt><dd style="margin:0;font-weight:600;color:#111827">${ds.job_count}</dd>` : ''}
          </dl>
        </div>
        <div style="background:#fff;border:1px solid rgba(17,24,39,0.1);border-radius:8px;padding:14px">
          <p style="margin:0 0 8px;font-size:0.75rem;font-weight:700;color:#1f2937;text-transform:uppercase;letter-spacing:0.04em">Train / test split</p>
          <dl style="margin:0;display:grid;grid-template-columns:auto 1fr;gap:2px 10px;font-size:0.79rem">
            <dt style="color:#6b7280">Train rows</dt><dd style="margin:0;font-weight:600;color:#111827">${tc.train_rows != null ? tc.train_rows : '—'}</dd>
            <dt style="color:#6b7280">Test rows</dt><dd style="margin:0;font-weight:600;color:#111827">${tc.test_rows != null ? tc.test_rows : '—'}</dd>
            ${split && split.train_pct != null ? `<dt style="color:#6b7280">Split</dt><dd style="margin:0;font-weight:600;color:#111827">${(split.train_pct * 100).toFixed(0)}% / ${(split.test_pct * 100).toFixed(0)}%</dd>` : ''}
          </dl>
        </div>
        <div style="background:#fff;border:1px solid rgba(17,24,39,0.1);border-radius:8px;padding:14px">
          <p style="margin:0 0 8px;font-size:0.75rem;font-weight:700;color:#1f2937;text-transform:uppercase;letter-spacing:0.04em">Imbalance strategy</p>
          ${strategy
            ? `<p style="margin:0 0 4px;font-size:0.85rem;font-weight:600;color:#111827">${escapeHtml(typeof strategy === 'object' ? (strategy.title || strategy.id || '') : String(strategy))}</p>
               ${strategy.description ? `<p style="margin:0;font-size:0.76rem;color:#6b7280">${escapeHtml(strategy.description)}</p>` : ''}`
            : `<p style="margin:0;font-size:0.82rem;color:#9ca3af">Baseline (no resampling)</p>`}
        </div>
      </div>

      <!-- ③ Feature breakdown -->
      <div style="background:#fff;border:1px solid rgba(17,24,39,0.1);border-radius:8px;padding:16px;margin-bottom:20px">
        <div style="display:flex;align-items:baseline;gap:12px;margin-bottom:12px;flex-wrap:wrap">
          <p style="margin:0;font-size:0.75rem;font-weight:700;color:#1f2937;text-transform:uppercase;letter-spacing:0.04em">Features</p>
          <span style="font-size:0.9rem;font-weight:700;color:#111827">${catalog.length} active</span>
          ${excludedCount > 0
            ? `<span style="font-size:0.82rem;color:#c2410c;font-weight:600">${excludedCount} excluded</span>`
            : totalVariantFeatures > 0
              ? `<span style="font-size:0.78rem;color:#16a34a">All ${totalVariantFeatures} features included</span>`
              : ''}
          ${totalVariantFeatures > 0 && allFamilies.length > 0
            ? `<span style="font-size:0.74rem;color:#6b7280">(${allFamilies.length} families)</span>`
            : ''}
        </div>
        ${familiesHtml || '<p style="color:#9ca3af;font-size:0.82rem;margin:0">Feature catalog not available.</p>'}
      </div>

      <!-- ④ Full metrics table -->
      <div style="background:#fff;border:1px solid rgba(17,24,39,0.1);border-radius:8px;padding:16px;margin-bottom:20px;overflow-x:auto">
        <p style="margin:0 0 10px;font-size:0.75rem;font-weight:700;color:#1f2937;text-transform:uppercase;letter-spacing:0.04em">Full evaluation metrics</p>
        <table style="margin:0;width:100%">
          <thead><tr style="background:#f8faff">
            <th style="padding:6px 10px;font-size:0.74rem;text-align:left">Metric</th>
            <th style="padding:6px 10px;font-size:0.74rem;text-align:center">Train</th>
            <th style="padding:6px 10px;font-size:0.74rem;text-align:center">Test</th>
          </tr></thead>
          <tbody>
            ${metricRow('Precision (candidate)', trainCm && trainCm.precision, testCm && testCm.precision, { good: 0.8, warn: 0.6 })}
            ${metricRow('Recall (candidate)', trainCm && trainCm.recall, testCm && testCm.recall, { good: 0.8, warn: 0.6 })}
            ${metricRow('F1 Score', trainCm && trainCm.f1, testCm && testCm.f1, { good: 0.8, warn: 0.6 })}
            ${metricRow('AUC-ROC', trainCm && trainCm.auc_roc, testCm && testCm.auc_roc, { good: 0.85, warn: 0.7 })}
            ${metricRow('Top-1 Accuracy', trainRm && trainRm.top_1_accuracy, testRm && testRm.top_1_accuracy, { good: 0.9, warn: 0.75 })}
            ${metricRow('Top-3 Accuracy', trainRm && trainRm.top_3_accuracy, testRm && testRm.top_3_accuracy, { good: 0.95, warn: 0.8 })}
          </tbody>
        </table>
      </div>

      <!-- ⑤ XSS / precision-drain analysis -->
      ${xssRates ? (() => {
        const fpCount = xssRates.false_positive_count || 0;
        const signals = Array.isArray(xssRates.signals) ? xssRates.signals : [];
        const anySignal = signals.some((s) => s.count > 0);
        return `
      <div style="background:#fff;border:1px solid rgba(17,24,39,0.1);border-radius:8px;padding:16px;margin-bottom:20px">
        <div style="display:flex;align-items:baseline;gap:12px;margin-bottom:12px;flex-wrap:wrap">
          <p style="margin:0;font-size:0.75rem;font-weight:700;color:#1f2937;text-transform:uppercase;letter-spacing:0.04em">XSS signal presence in false positives</p>
          <span style="font-size:0.82rem;color:#6b7280">${fpCount} false positive candidate${fpCount !== 1 ? 's' : ''} (${testEv && testEv.xss_signal_rates ? 'test set' : 'train set'})</span>
        </div>
        ${fpCount === 0
          ? `<p style="margin:0;font-size:0.82rem;color:#9ca3af">No false positives at current threshold.</p>`
          : `<table style="margin:0;width:100%">
              <thead><tr style="background:#fafafa">
                <th style="padding:5px 10px;font-size:0.73rem;text-align:left;color:#6b7280">Signal</th>
                <th style="padding:5px 10px;font-size:0.73rem;text-align:center;color:#6b7280">FPs with signal</th>
                <th style="padding:5px 10px;font-size:0.73rem;text-align:center;color:#6b7280">% of FPs</th>
                <th style="padding:5px 10px;font-size:0.73rem;text-align:left;color:#6b7280"></th>
              </tr></thead>
              <tbody>${signals.map((s) => {
                const rate = s.rate || 0;
                const barColor = rate >= 0.5 ? '#dc2626' : rate >= 0.2 ? '#d97706' : '#6b7280';
                const barW = Math.round(rate * 120);
                return `<tr>
                  <td style="padding:4px 10px;font-size:0.78rem;color:#374151">${escapeHtml(s.label)}</td>
                  <td style="padding:4px 10px;font-size:0.78rem;font-weight:600;color:#111827;text-align:center">${s.count}</td>
                  <td style="padding:4px 10px;font-size:0.78rem;font-weight:600;color:${s.count > 0 ? barColor : '#9ca3af'};text-align:center">${s.count > 0 ? (rate * 100).toFixed(1) + '%' : '0%'}</td>
                  <td style="padding:4px 10px">
                    ${barW > 0 ? `<div style="height:7px;width:${barW}px;background:${barColor};border-radius:2px;opacity:0.7"></div>` : ''}
                  </td>
                </tr>`;
              }).join('')}</tbody>
            </table>`}
      </div>`;
      })() : ''}

      <!-- ⑥ Feature importance -->
      ${(Array.isArray(reliance.positive_weights) && reliance.positive_weights.length) || (Array.isArray(reliance.negative_weights) && reliance.negative_weights.length) ? `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div style="background:#fff;border:1px solid rgba(17,24,39,0.1);border-radius:8px;padding:14px;overflow:hidden">
          <p style="margin:0 0 8px;font-size:0.75rem;font-weight:700;color:#16a34a;text-transform:uppercase;letter-spacing:0.04em">↑ Positive drivers — UGC comment present</p>
          <table style="margin:0;width:100%">
            <tbody>${importanceRows(reliance.positive_weights, 'pos')}</tbody>
          </table>
        </div>
        <div style="background:#fff;border:1px solid rgba(17,24,39,0.1);border-radius:8px;padding:14px;overflow:hidden">
          <p style="margin:0 0 8px;font-size:0.75rem;font-weight:700;color:#dc2626;text-transform:uppercase;letter-spacing:0.04em">↓ Negative drivers — no comment region</p>
          <table style="margin:0;width:100%">
            <tbody>${importanceRows(reliance.negative_weights, 'neg')}</tbody>
          </table>
        </div>
      </div>` : ''}

      <!-- runtime link -->
      <div style="margin-top:16px;padding-top:14px;border-top:1px solid rgba(17,24,39,0.08);display:flex;gap:10px;align-items:center">
        <a href="${escapeHtml(runtimeModelUrl(artifact.id || ''))}" target="_blank"
           style="font-size:0.8rem;color:#3b82f6;text-decoration:none">View Runtime JSON ↗</a>
        <span style="color:#d1d5db">·</span>
        <span style="font-size:0.76rem;color:#9ca3af">Artifact ID: <code>${escapeHtml(artifact.id || '')}</code></span>
      </div>
    `;
  }

  // Close modal
  if (modelDetailClose) {
    modelDetailClose.addEventListener('click', () => { if (modelDetailDialog) modelDetailDialog.close(); });
  }
  if (modelDetailDialog) {
    modelDetailDialog.addEventListener('click', (e) => {
      // Close on backdrop click
      if (e.target === modelDetailDialog) modelDetailDialog.close();
    });
  }

  // Details button delegation on model list
  if (modelList) {
    modelList.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-detail-model]');
      if (btn) openModelDetailModal(btn.dataset.detailModel);
    });
  }

  function renderRecentJobs(jobs) {
    if (!jobs || !jobs.length) {
      recentJobsModel.className = 'table-shell empty';
      recentJobsModel.textContent = 'No jobs found.';
      return;
    }

    recentJobsModel.className = 'table-shell';
    recentJobsModel.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Job</th>
            <th>Status</th>
            <th>Completed</th>
            <th>Detected</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${jobs.map((job) => `
            <tr>
              <td class="mono">${escapeHtml(job.id)}</td>
              <td>${escapeHtml(job.status)}</td>
              <td>${escapeHtml(job.completed_count)}/${escapeHtml(job.total_urls)}</td>
              <td>${escapeHtml(job.detected_count)}</td>
              <td><button class="secondary compact" type="button" data-use-job="${escapeHtml(job.id)}">Use Job</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  function renderScoredJob(result) {
    const summary = result && result.summary ? result.summary : null;
    const items = result && Array.isArray(result.items) ? result.items : [];
    const scoredConfusion = summarizeScoredCandidateConfusion(items);

    if (!summary) {
      scoreJobSummary.className = 'summary empty';
      scoreJobSummary.textContent = 'Run a scored job to see item-level predictions.';
      if (scoreJobInsights) {
        scoreJobInsights.className = 'model-card-grid empty';
        scoreJobInsights.textContent = '';
      }
      scoreJobResults.className = 'table-shell empty';
      scoreJobResults.textContent = 'No scored job loaded.';
      return;
    }

    scoreJobSummary.className = 'summary';
    scoreJobSummary.innerHTML = [
      `<div><strong>Items:</strong> ${escapeHtml(summary.item_count)}</div>`,
      `<div><strong>Candidates:</strong> ${escapeHtml(summary.candidate_count)}</div>`,
      `<div><strong>Predicted Positives:</strong> ${escapeHtml(summary.predicted_positive_item_count)}</div>`,
      `<div><strong>Manual Review:</strong> ${escapeHtml(summary.manual_review_item_count)}</div>`,
      `<div><strong>Mean Top Probability:</strong> ${escapeHtml(formatMetric(summary.mean_top_probability))}</div>`,
      `<div><strong>Model:</strong> ${escapeHtml(result.artifact ? result.artifact.id : '')}</div>`,
      `<div><strong>Algorithm:</strong> ${escapeHtml(result.artifact ? formatAlgorithmName(result.artifact.algorithm) : '')}</div>`,
    ].join('');

    if (scoreJobInsights) {
      scoreJobInsights.className = 'model-card-grid score-job-insights-grid';
      scoreJobInsights.innerHTML = `
        ${renderProbabilityTrendCard(items, {
          eyebrow: 'Scored Pattern',
          title: 'Top Probability Trend',
          copy: 'The bars show the top candidate probability for each item in row order.',
          limit: 8,
        })}
        ${renderConfusionMatrixCard(scoredConfusion, {
          eyebrow: 'Scored Rows',
          title: 'Predicted vs Human Labels',
          emptyText: 'The scored rows do not have binary human labels yet.',
          cardClass: 'score-job-confusion-card',
        })}
      `;
    }

    if (!items.length) {
      scoreJobResults.className = 'table-shell empty';
      scoreJobResults.textContent = 'This job has no stored candidates to score.';
      return;
    }

    scoreJobResults.className = 'table-shell';
    scoreJobResults.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Row</th>
            <th>URL</th>
            <th>Top Probability</th>
            <th>Top Label</th>
            <th>Manual Review</th>
            <th>Top Candidate Notes</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((item) => {
            const top = item.top_candidate || null;
            const positiveContributors = top && top.explanation && top.explanation.top_positive_contributors
              ? top.explanation.top_positive_contributors.slice(0, 3)
              : [];
            const negativeContributors = top && top.explanation && top.explanation.top_negative_contributors
              ? top.explanation.top_negative_contributors.slice(0, 2)
              : [];
            return `
              <tr>
                <td>${escapeHtml(item.row_number)}</td>
                <td class="mono">${item.final_url || item.normalized_url ? `<a href="${escapeHtml(item.final_url || item.normalized_url)}" target="_blank" rel="noreferrer">${escapeHtml(item.final_url || item.normalized_url)}</a>` : ''}</td>
                <td>${escapeHtml(top ? formatMetric(top.probability) : '')}</td>
                <td>${escapeHtml(top && top.human_label ? top.human_label : 'unlabeled')}</td>
                <td>${item.manual_review_suggested ? 'yes' : 'no'}</td>
                <td>
                  <details class="score-details" data-score-detail="job-${escapeHtml(item.item_id)}">
                    <summary>Inspect</summary>
                    <div class="score-details-body">
                      <p class="candidate-copy"><strong>Sample text:</strong> ${escapeHtml(top && top.sample_text ? top.sample_text : 'No sample text')}</p>
                      <div class="feature-chip-list">
                        ${positiveContributors.map((entry) => `
                          <span class="feature-chip good">
                            <strong>${escapeHtml(entry.title || entry.output_key)}</strong>
                            <span>${escapeHtml(formatMetric(entry.contribution))}</span>
                          </span>
                        `).join('')}
                        ${negativeContributors.map((entry) => `
                          <span class="feature-chip muted">
                            <strong>${escapeHtml(entry.title || entry.output_key)}</strong>
                            <span>${escapeHtml(formatMetric(entry.contribution))}</span>
                          </span>
                        `).join('')}
                      </div>
                    </div>
                  </details>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  }

  function renderSiteGroups(result) {
    const groups = result && Array.isArray(result.groups) ? result.groups : [];
    if (!groups.length) {
      siteGroupResults.className = 'table-shell empty';
      siteGroupResults.textContent = 'No matching hostnames were found in the stored jobs.';
      return;
    }

    siteGroupResults.className = 'table-shell';
    siteGroupResults.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Hostname</th>
            <th>Matched Items</th>
            <th>Manual Review</th>
            <th>Mean Top Probability</th>
            <th>Max Top Probability</th>
            <th>Examples</th>
          </tr>
        </thead>
        <tbody>
          ${groups.map((group) => `
            <tr>
              <td class="mono">${escapeHtml(group.hostname)}</td>
              <td>${escapeHtml(group.matched_item_count)}</td>
              <td>${escapeHtml(group.manual_review_item_count)}</td>
              <td>${escapeHtml(formatMetric(group.mean_top_probability))}</td>
              <td>${escapeHtml(formatMetric(group.max_top_probability))}</td>
              <td>
                <details class="score-details" data-score-detail="group-${escapeHtml(group.hostname)}">
                  <summary>Inspect</summary>
                  <div class="score-details-body">
                    <div class="feature-chip-list">
                      ${(group.items || []).slice(0, 8).map((item) => `
                        <span class="feature-chip plain">
                          <strong>Row ${escapeHtml(item.row_number)}</strong>
                          <span>${escapeHtml(item.top_candidate ? formatMetric(item.top_candidate.probability) : '')}</span>
                        </span>
                      `).join('')}
                    </div>
                  </div>
                </details>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  function renderLiveProbe(result) {
    const nextResult = result || null;
    const isNewResult = nextResult !== currentLiveProbeResult;
    currentLiveProbeResult = nextResult;
    const summary = nextResult && nextResult.summary ? nextResult.summary : null;
    const items = nextResult && Array.isArray(nextResult.items) ? nextResult.items : [];
    const scan = nextResult && nextResult.scan ? nextResult.scan : null;
    const artifact = nextResult && nextResult.artifact ? nextResult.artifact : null;
    const item = items[0] || null;
    const allCandidates = item && Array.isArray(item.candidates) ? item.candidates : [];
    const scanError = summary ? String(summary.scan_error || (scan && scan.error) || '') : '';
    const scanWarning = scan ? String(scan.scan_warning || '') : '';
    const scanTimedOut = !!(scan && scan.timed_out) || /timed out/i.test(scanError);

    if (!summary) {
      currentLiveProbePage = 0;
      liveProbeSummary.className = 'summary empty';
      liveProbeSummary.textContent = 'Run a live URL probe to see the page-level verdict.';
      liveProbeResults.className = 'table-shell empty';
      liveProbeResults.textContent = 'No probe results loaded.';
      return;
    }

    liveProbeSummary.className = 'summary';
    const summaryRows = [
      `<div><strong>URL:</strong> ${escapeHtml(summary.page_input_url || result.url || '')}</div>`,
      `<div><strong>Final URL:</strong> ${escapeHtml(summary.page_final_url || (scan && scan.final_url) || '')}</div>`,
      `<div><strong>Title:</strong> ${escapeHtml(summary.page_title || (scan && scan.title) || '')}</div>`,
      `<div><strong>Mode:</strong> ${escapeHtml(summary.page_candidate_mode || result.candidate_mode || '')}</div>`,
      `<div><strong>Priority:</strong> ${summary.page_priority_probe || (scan && scan.priority_probe) ? 'yes' : 'no'}</div>`,
      `<div><strong>Model:</strong> ${escapeHtml(artifact ? `${artifact.variant_title || artifact.variant_id || ''} - ${artifact.id || ''}` : '')}</div>`,
      `<div><strong>Page Verdict:</strong> ${escapeHtml(summary.page_verdict || '')}</div>`,
      `<div><strong>Top Probability:</strong> ${escapeHtml(formatMetric(summary.page_top_probability))}</div>`,
      `<div><strong>Candidates:</strong> ${escapeHtml(summary.page_candidate_count)}</div>`,
      `<div><strong>Scanner Detected UGC:</strong> ${summary.page_detected ? 'yes' : 'no'}</div>`,
      `<div><strong>Blocked:</strong> ${summary.blocked_by_interstitial ? 'yes' : 'no'}</div>`,
      `<div><strong>Blocker Type:</strong> ${escapeHtml(summary.blocker_type || '')}</div>`,
      `<div><strong>Scan Error:</strong> ${escapeHtml(scanError || '')}</div>`,
    ];
    if (scanWarning) {
      summaryRows.push(`<div><strong>Scan Warning:</strong> ${escapeHtml(scanWarning)}</div>`);
    }
    liveProbeSummary.innerHTML = summaryRows.join('');

    if (!allCandidates.length) {
      currentLiveProbePage = 0;
      liveProbeResults.className = 'table-shell empty';
      liveProbeResults.textContent = scanTimedOut
        ? `The live scan timed out before it could score candidates.${scanWarning ? ` ${scanWarning}` : ''}`
        : scanError
          ? `The live scan failed before it could score candidates.${scanWarning ? ` ${scanWarning}` : ''}`
          : scanWarning
            ? `The live scan returned no scored candidates. ${scanWarning}`
            : 'The live scan returned no scored candidates.';
      return;
    }

    const totalPages = Math.max(1, Math.ceil(allCandidates.length / liveProbeCandidatePageSize));
    if (isNewResult) {
      currentLiveProbePage = 0;
    }
    currentLiveProbePage = Math.max(0, Math.min(currentLiveProbePage, totalPages - 1));
    const pageStart = currentLiveProbePage * liveProbeCandidatePageSize;
    const candidates = allCandidates.slice(pageStart, pageStart + liveProbeCandidatePageSize);
    const showingFrom = pageStart + 1;
    const showingTo = Math.min(allCandidates.length, pageStart + candidates.length);

    liveProbeResults.className = 'table-shell';
    liveProbeResults.innerHTML = `
      <div class="candidate-toolbar">
        <span class="candidate-page-copy">Showing candidates ${escapeHtml(showingFrom)}-${escapeHtml(showingTo)} of ${escapeHtml(allCandidates.length)}</span>
        <div class="candidate-pager">
          <button class="secondary compact" type="button" data-live-probe-page="prev" ${currentLiveProbePage > 0 ? '' : 'disabled'}>Previous</button>
          <span class="candidate-page-copy">Page ${escapeHtml(currentLiveProbePage + 1)} / ${escapeHtml(totalPages)}</span>
          <button class="secondary compact" type="button" data-live-probe-page="next" ${(currentLiveProbePage + 1) < totalPages ? '' : 'disabled'}>Next</button>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Rank</th>
            <th>Probability</th>
            <th>Prediction</th>
            <th>Repeat</th>
            <th>Homogeneity</th>
            <th>Tag</th>
            <th>Sample</th>
            <th>Signals</th>
          </tr>
        </thead>
        <tbody>
          ${candidates.map((candidate, index) => {
            const detail = resolveLiveProbeCandidateDetail(candidate);
            const predictedLabel = candidate.predicted_label === 1
              ? 'positive'
              : (candidate.predicted_label === 0 ? 'negative' : 'uncertain');
            const topPos = candidate.explanation && Array.isArray(candidate.explanation.top_positive_contributors)
              ? candidate.explanation.top_positive_contributors.slice(0, 3)
              : [];
            const topNeg = candidate.explanation && Array.isArray(candidate.explanation.top_negative_contributors)
              ? candidate.explanation.top_negative_contributors.slice(0, 2)
              : [];
            const signalBits = topPos.concat(topNeg).map((entry) => `
              <span class="feature-chip ${entry.contribution >= 0 ? 'good' : 'muted'}">
                <strong>${escapeHtml(entry.title || entry.output_key)}</strong>
                <span>${escapeHtml(formatMetric(entry.contribution))}</span>
              </span>
            `).join('');
            return `
              <tr>
                <td>${escapeHtml(pageStart + index + 1)}</td>
                <td>${escapeHtml(formatMetric(candidate.probability))}</td>
                <td><span class="${candidate.predicted_label === 1 ? 'review-chip' : 'review-chip warn'}">${escapeHtml(candidate.human_label || predictedLabel)}</span></td>
                <td>${escapeHtml(detail.repeating_group_count || detail.min_k_count || detail.unit_count || 0)}</td>
                <td>${escapeHtml(formatMetric(detail.sibling_homogeneity_score || detail.homogeneity || 0))}</td>
                <td class="mono">${escapeHtml(detail.tag_name || detail._root_tag || detail.tag || '')}</td>
                <td>${escapeHtml((detail.sample_text || '').slice(0, 140))}</td>
                <td>
                  <div class="candidate-inspect-stack">
                    <div class="feature-chip-list">${signalBits || '<span class="candidate-copy model-card-empty">No explanation signals available.</span>'}</div>
                    <button
                      class="secondary compact inspect-button"
                      type="button"
                      title="Open a wider inspect modal with screenshots and outer HTML"
                      aria-haspopup="dialog"
                      aria-controls="live-probe-inspect-dialog"
                      data-live-probe-inspect-index="${pageStart + index}">
                      Inspect
                    </button>
                  </div>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  }

  if (liveProbeResults) {
    liveProbeResults.addEventListener('click', (event) => {
      const button = event.target && typeof event.target.closest === 'function'
        ? event.target.closest('button[data-live-probe-page]')
        : null;
      const inspectButton = event.target && typeof event.target.closest === 'function'
        ? event.target.closest('button[data-live-probe-inspect-index]')
        : null;

      if (inspectButton && !inspectButton.disabled && currentLiveProbeResult) {
        const inspectIndex = Number(inspectButton.getAttribute('data-live-probe-inspect-index'));
        openLiveProbeInspectModal(inspectIndex);
        return;
      }

      if (!button || button.disabled || !currentLiveProbeResult) {
        return;
      }

      const direction = String(button.getAttribute('data-live-probe-page') || '').trim();
      if (!direction) {
        return;
      }

      const items = currentLiveProbeResult && Array.isArray(currentLiveProbeResult.items)
        ? currentLiveProbeResult.items
        : [];
      const item = items[0] || null;
      const totalCandidates = item && Array.isArray(item.candidates) ? item.candidates.length : 0;
      if (!totalCandidates) {
        return;
      }

      const totalPages = Math.max(1, Math.ceil(totalCandidates / liveProbeCandidatePageSize));
      const nextPage = direction === 'next'
        ? Math.min(totalPages - 1, currentLiveProbePage + 1)
        : Math.max(0, currentLiveProbePage - 1);
      if (nextPage === currentLiveProbePage) {
        return;
      }

      currentLiveProbePage = nextPage;
      renderLiveProbe(currentLiveProbeResult);
    });
  }

  if (liveProbeInspectClose && liveProbeInspectDialog) {
    liveProbeInspectClose.addEventListener('click', () => {
      if (typeof liveProbeInspectDialog.close === 'function' && liveProbeInspectDialog.open) {
        liveProbeInspectDialog.close();
      } else {
        liveProbeInspectDialog.removeAttribute('open');
      }
    });
  }

  if (liveProbeInspectDialog) {
    liveProbeInspectDialog.addEventListener('click', (event) => {
      if (event.target === liveProbeInspectDialog && typeof liveProbeInspectDialog.close === 'function') {
        liveProbeInspectDialog.close();
      }
    });
  }

  async function readSiteGroupText() {
    const typed = siteGroupText.value.trim();
    if (typed) return typed;
    if (siteGroupFile.files && siteGroupFile.files[0]) {
      return siteGroupFile.files[0].text();
    }
    return '';
  }

  function renderLabelSummary(data) {
    currentLabelSummary = data;
    const jobs = data && Array.isArray(data.jobs) ? data.jobs : [];
    if (!jobs.length) {
      labelSummaryShell.className = 'table-shell empty';
      labelSummaryShell.textContent = 'No labeled jobs found yet. Label some candidates and refresh.';
      if (labelSummaryActions) labelSummaryActions.style.display = 'none';
      return;
    }
    labelSummaryShell.className = 'table-shell';
    labelSummaryShell.innerHTML = `
      <table>
        <thead>
          <tr>
            <th style="width:2rem"><input type="checkbox" id="label-summary-check-all" title="Select all"></th>
            <th>Job ID</th>
            <th>Created</th>
            <th title="Human-labeled positive (comment_region)">Positives</th>
            <th title="Human-labeled negative (not_comment_region)">Negatives</th>
            <th title="Auto-inferred positive">Inf+</th>
            <th title="Auto-inferred negative">Inf−</th>
          </tr>
        </thead>
        <tbody>
          ${jobs.map((job) => {
            const created = job.created_at ? new Date(job.created_at).toLocaleDateString() : '';
            return `
              <tr>
                <td><input type="checkbox" class="label-pool-check" data-job-id="${escapeHtml(job.job_id)}" value="${escapeHtml(job.job_id)}"></td>
                <td class="mono" style="font-size:0.82rem">${escapeHtml(job.job_id)}</td>
                <td>${escapeHtml(created)}</td>
                <td><span class="review-chip">${escapeHtml(job.positive_candidates)}</span></td>
                <td><span class="review-chip warn">${escapeHtml(job.negative_candidates)}</span></td>
                <td class="muted">${escapeHtml(job.inferred_positive)}</td>
                <td class="muted">${escapeHtml(job.inferred_negative)}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
        <tfoot>
          <tr id="label-pool-selected-row" style="display:none">
            <td colspan="3" style="font-weight:600">Selected total</td>
            <td id="label-pool-sel-pos" class="mono"></td>
            <td id="label-pool-sel-neg" class="mono"></td>
            <td></td>
            <td></td>
          </tr>
          <tr>
            <td colspan="3" style="font-weight:600">All jobs total</td>
            <td class="mono">${escapeHtml(data.totals ? data.totals.positive : 0)}</td>
            <td class="mono">${escapeHtml(data.totals ? data.totals.negative : 0)}</td>
            <td class="mono muted">${escapeHtml(data.totals ? data.totals.inferred_positive : 0)}</td>
            <td class="mono muted">${escapeHtml(data.totals ? data.totals.inferred_negative : 0)}</td>
          </tr>
        </tfoot>
      </table>
    `;
    if (labelSummaryActions) labelSummaryActions.style.display = 'flex';
    updateLabelPoolSelection();
  }

  function updateLabelPoolSelection() {
    if (!labelSummaryShell || !currentLabelSummary) return;
    const checkboxes = labelSummaryShell.querySelectorAll('.label-pool-check');
    const checked = Array.from(checkboxes).filter((cb) => cb.checked);
    const jobs = currentLabelSummary && Array.isArray(currentLabelSummary.jobs) ? currentLabelSummary.jobs : [];
    let selPos = 0;
    let selNeg = 0;
    checked.forEach((cb) => {
      const job = jobs.find((j) => j.job_id === cb.value);
      if (job) {
        selPos += Number(job.positive_candidates) || 0;
        selNeg += Number(job.negative_candidates) || 0;
      }
    });
    const selRow = document.getElementById('label-pool-selected-row');
    const selPosEl = document.getElementById('label-pool-sel-pos');
    const selNegEl = document.getElementById('label-pool-sel-neg');
    if (selRow) selRow.style.display = checked.length ? '' : 'none';
    if (selPosEl) selPosEl.textContent = String(selPos);
    if (selNegEl) selNegEl.textContent = String(selNeg);
    if (labelSummarySelectedTotals) {
      labelSummarySelectedTotals.textContent = checked.length
        ? `${checked.length} job${checked.length > 1 ? 's' : ''} selected — ${selPos} positives, ${selNeg} negatives`
        : '';
    }
    if (usePoolForTrainingButton) {
      usePoolForTrainingButton.disabled = checked.length === 0;
    }
  }

  async function fetchLabelSummary() {
    if (!labelSummaryShell) return;
    try {
      const data = await fetchJson('/api/modeling/job-label-summary');
      renderLabelSummary(data);
    } catch (err) {
      if (labelSummaryMessage) setMessage(labelSummaryMessage, err.message || String(err), true);
    }
  }

  if (labelSummaryShell) {
    labelSummaryShell.addEventListener('change', (event) => {
      const checkAll = event.target.closest('#label-summary-check-all');
      if (checkAll) {
        const checkboxes = labelSummaryShell.querySelectorAll('.label-pool-check');
        checkboxes.forEach((cb) => { cb.checked = checkAll.checked; });
      }
      updateLabelPoolSelection();
    });
  }

  if (usePoolForTrainingButton) {
    usePoolForTrainingButton.addEventListener('click', () => {
      if (!labelSummaryShell) return;
      const checked = Array.from(labelSummaryShell.querySelectorAll('.label-pool-check:checked'));
      if (!checked.length) return;
      const ids = checked.map((cb) => cb.value).join(', ');
      if (trainJobIds) trainJobIds.value = ids;
      trainJobIds.dispatchEvent(new Event('input'));
      trainJobIds.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  if (refreshLabelSummaryButton) {
    refreshLabelSummaryButton.addEventListener('click', () => {
      if (labelSummaryMessage) setMessage(labelSummaryMessage, '', false);
      fetchLabelSummary().catch((err) => {
        if (labelSummaryMessage) setMessage(labelSummaryMessage, err.message || String(err), true);
      });
    });
  }

  function syncArchetypeModelSelector(models) {
    if (!archetypeModelId) return;
    const current = archetypeModelId.value;
    archetypeModelId.innerHTML = models.length
      ? models.map((m) => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.id)}</option>`).join('')
      : '<option value="">No trained models</option>';
    if (current && models.find((m) => m.id === current)) archetypeModelId.value = current;
  }

  function renderArchetype(data) {
    if (!data) {
      archetypeShell.className = 'table-shell empty';
      archetypeShell.textContent = 'Select a model and click Analyze to explore the comment archetype.';
      if (archetypeProfile) { archetypeProfile.style.display = 'none'; archetypeProfile.textContent = ''; }
      if (archetypeSmoteNote) { archetypeSmoteNote.style.display = 'none'; archetypeSmoteNote.textContent = ''; }
      return;
    }

    const stats = Array.isArray(data.class_stats) ? data.class_stats : [];
    const counts = data.counts || {};
    const topN = archetypeTopN ? (Number(archetypeTopN.value) || 0) : 25;

    // Sort by absolute contribution to positive class descending
    const sorted = stats.slice().sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
    const visible = topN > 0 ? sorted.slice(0, topN) : sorted;
    const maxAbsContrib = visible.reduce((m, s) => Math.max(m, Math.abs(s.contribution)), 0) || 1;

    // --- Archetype profile narrative ---
    const topPos = sorted.filter((s) => s.contribution > 0).slice(0, 8);
    const topNeg = sorted.filter((s) => s.contribution < 0).slice(0, 4);

    const booleanSignals = topPos.filter((s) => s.type === 'boolean' && s.mean_positive > 0.3)
      .map((s) => `<span class="feature-chip good"><strong>${escapeHtml(s.title)}</strong><span>${escapeHtml(Math.round(s.mean_positive * 100))}% of positives</span></span>`);
    const numericSignals = topPos.filter((s) => s.type === 'number')
      .map((s) => `<span class="feature-chip good"><strong>${escapeHtml(s.title)}</strong><span>avg ${escapeHtml(formatMetric(s.mean_positive))} (neg: ${escapeHtml(formatMetric(s.mean_negative))})</span></span>`);
    const catSignals = topPos.filter((s) => s.type === 'categorical' && s.mean_positive > 0.2)
      .map((s) => `<span class="feature-chip good"><strong>${escapeHtml(s.title)}</strong><span>${escapeHtml(Math.round(s.mean_positive * 100))}%</span></span>`);
    const negSignals = topNeg.map((s) => `<span class="feature-chip muted"><strong>${escapeHtml(s.title)}</strong><span>pushes negative</span></span>`);

    archetypeProfile.style.display = '';
    archetypeProfile.className = 'summary';
    archetypeProfile.innerHTML = `
      <div style="margin-bottom:10px">
        <strong>${escapeHtml(data.variant_title || data.variant_id || '')} — ${escapeHtml(data.algorithm || '')}</strong>
        &nbsp;·&nbsp; ${escapeHtml(counts.positive)} real positives &nbsp;·&nbsp; ${escapeHtml(counts.negative)} real negatives &nbsp;·&nbsp; ${escapeHtml(counts.synthetic)} SMOTE synthetics
      </div>
      <div style="margin-bottom:6px"><strong>Features that push toward comment_region:</strong></div>
      <div class="feature-chip-list" style="margin-bottom:10px">${(booleanSignals.concat(numericSignals, catSignals)).join('') || '<span class="candidate-copy muted">None found</span>'}</div>
      <div style="margin-bottom:6px"><strong>Features that push away from comment_region:</strong></div>
      <div class="feature-chip-list">${negSignals.join('') || '<span class="candidate-copy muted">None found</span>'}</div>
    `;

    // --- SMOTE note ---
    if (archetypeSmoteNote && data.smote_summary) {
      const sm = data.smote_summary;
      const synCount = counts.synthetic || 0;
      // Find top features where synthetic closely matches real positive (delta < 10%)
      const faithfulFeatures = stats.filter((s) => Math.abs(s.mean_synthetic - s.mean_positive) < 0.05 && Math.abs(s.contribution) > 0.01).length;
      archetypeSmoteNote.style.display = '';
      archetypeSmoteNote.className = 'summary';
      archetypeSmoteNote.innerHTML = `
        <strong>SMOTE Validation</strong>
        &nbsp;·&nbsp; ${escapeHtml(synCount)} synthetic samples generated
        &nbsp;·&nbsp; ${escapeHtml(faithfulFeatures)} features where synthetic mean is within 5% of real positive mean
        <div class="candidate-copy muted" style="margin-top:6px">
          When synthetic and real means align closely, SMOTE is interpolating in a region of feature space that genuinely represents comment structure.
          Large divergences indicate the synthesizer is extrapolating into uncharted territory — treat those features with caution.
        </div>
      `;
    }

    // --- Feature table ---
    archetypeShell.className = 'table-shell';
    archetypeShell.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Feature</th>
            <th>Family</th>
            <th title="Logistic regression coefficient">Coeff</th>
            <th title="Mean value across real positive (comment_region) candidates">Real Positive</th>
            <th title="Mean value across real negative (not_comment_region) candidates">Real Negative</th>
            <th title="Mean value across SMOTE-synthesized positive candidates">Synthetic Pos</th>
            <th title="Mean positive minus mean negative — higher means more discriminating">Δ</th>
            <th title="Contribution = mean_positive × coefficient — net push toward comment_region per typical positive">Contribution</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${visible.map((s) => {
            const contrib = s.contribution;
            const pct = Math.round((Math.abs(contrib) / maxAbsContrib) * 100);
            const isPositive = contrib >= 0;
            const deltaSign = s.delta > 0.01 ? '+' : (s.delta < -0.01 ? '' : '≈');
            const synDivergence = Math.abs(s.mean_synthetic - s.mean_positive);
            const synClass = synDivergence > 0.15 ? 'warn' : (synDivergence > 0.05 ? '' : 'good');
            const fmt = (v) => escapeHtml(String(v !== undefined ? Number(v).toFixed(3) : '—'));
            return `
              <tr>
                <td style="font-size:0.82rem">${escapeHtml(s.title)}</td>
                <td class="muted" style="font-size:0.78rem">${escapeHtml(s.family || '')}</td>
                <td class="mono" style="font-size:0.82rem;color:${s.coefficient >= 0 ? 'var(--accent)' : 'var(--muted)'}">${fmt(s.coefficient)}</td>
                <td class="mono">${fmt(s.mean_positive)}</td>
                <td class="mono">${fmt(s.mean_negative)}</td>
                <td class="mono"><span class="review-chip ${synClass}" style="font-size:0.78rem">${fmt(s.mean_synthetic)}</span></td>
                <td class="mono" style="color:${s.delta > 0.01 ? 'var(--accent)' : (s.delta < -0.01 ? 'var(--muted)' : '')}">${deltaSign}${fmt(s.delta)}</td>
                <td>
                  <div style="display:flex;align-items:center;gap:6px">
                    <div style="flex:0 0 80px;height:8px;background:var(--panel-bg);border-radius:4px;overflow:hidden">
                      <div style="height:100%;width:${pct}%;background:${isPositive ? 'var(--accent)' : 'var(--muted)'};border-radius:4px"></div>
                    </div>
                    <span class="mono" style="font-size:0.78rem;color:${isPositive ? 'var(--accent)' : 'var(--muted)'}">${isPositive ? '+' : ''}${fmt(contrib)}</span>
                  </div>
                </td>
                <td></td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  }

  if (archetypeAnalyzeButton) {
    archetypeAnalyzeButton.addEventListener('click', () => {
      if (!archetypeModelId || !archetypeModelId.value) {
        setMessage(archetypeMessage, 'Select a trained model first.', true);
        return;
      }
      runElementAction(archetypeAnalyzeButton, async () => {
        setMessage(archetypeMessage, 'Analyzing…', false);
        const result = await fetchJson('/api/modeling/comment-archetype', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            modelId: archetypeModelId.value,
            jobIds: archetypeJobIds ? archetypeJobIds.value.trim() : '',
          }),
        });
        setMessage(archetypeMessage, '', false);
        if (archetypeShell) archetypeShell._archetypeData = result;
        renderArchetype(result);
      }).catch((err) => {
        setMessage(archetypeMessage, err.message || String(err), true);
      });
    });
  }

  if (archetypeTopN) {
    archetypeTopN.addEventListener('change', () => {
      // Re-render with same data if available — store last result on the shell element
      if (archetypeShell && archetypeShell._archetypeData) {
        renderArchetype(archetypeShell._archetypeData);
      }
    });
  }

  async function refreshOverview() {
    const overview = await fetchOverviewSnapshot();
    renderOverview(overview);
    return overview;
  }

  async function refreshPage() {
    updateDatasetDownloadLink();
    const [overview, recentJobs] = await Promise.all([
      fetchOverviewSnapshot(),
      fetchJson('/api/jobs?limit=15'),
    ]);

    renderOverview(overview);
    renderVariantCards(overview.variants || []);
    renderModelList(overview.models || []);
    renderRecentJobs(recentJobs.jobs || []);
    syncOverviewPolling();
    fetchLabelSummary().catch(() => {});
  }

  async function trainVariant(variantId) {
    const algorithm = trainAlgorithm ? trainAlgorithm.value : 'logistic_regression';
    const imbalanceStrategy = trainImbalanceStrategy ? trainImbalanceStrategy.value : 'baseline';
    const strategyMeta = getImbalanceStrategyMeta(imbalanceStrategy);
    currentTrainingVariantId = variantId;
    const excludeFeatures = getExcludedFeatures();
    const exclusionNote = excludeFeatures.length ? ` · ${excludeFeatures.length} feature${excludeFeatures.length !== 1 ? 's' : ''} excluded` : '';
    setMessage(trainMessage, `Training model using ${formatAlgorithmName(algorithm)} with ${strategyMeta.title}${exclusionNote}…`, false);

    // POST returns 202 immediately with a jobId — training runs server-side.
    // We poll every 3 s so the proxy timeout is never an issue.
    const { jobId } = await fetchJson('/api/modeling/train', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        variantId,
        jobIds: trainJobIds.value.trim(),
        algorithm,
        imbalanceStrategy,
        excludeFeatures,
      }),
    });

    const startedAt = Date.now();
    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const status = await fetchJson(`/api/modeling/train-status/${jobId}`);
      if (status.status === 'done') {
        const result = status.result;
        setMessage(trainMessage, `Saved model ${result.summary ? result.summary.id : ''}.`, false);
        renderTrainResult(result.model || null);
        await refreshPage();
        return;
      }
      if (status.status === 'error') {
        throw new Error(status.error || 'Training failed on the server');
      }
      const elapsed = Math.round((Date.now() - startedAt) / 1000);
      setMessage(trainMessage, `Training in progress… (${elapsed}s elapsed)`, false);
    }
  }

  async function compareImbalanceStrategies() {
    const variantId = currentTrainingVariantId || (currentVariants.length ? currentVariants[0].id : '');
    if (!variantId) {
      throw new Error('Load training variants first.');
    }
    const selectedVariant = currentVariants.find((variant) => variant.id === variantId) || currentVariants[0] || null;
    const algorithm = trainAlgorithm ? trainAlgorithm.value : 'logistic_regression';
    const imbalanceStrategy = trainImbalanceStrategy ? trainImbalanceStrategy.value : 'baseline';
    const strategyMeta = getImbalanceStrategyMeta(imbalanceStrategy);
    setMessage(imbalanceMessage, `Comparing imbalance strategies for ${selectedVariant ? selectedVariant.title : variantId} with ${formatAlgorithmName(algorithm)} from ${strategyMeta.title}…`, false);

    const { jobId } = await fetchJson('/api/modeling/compare-imbalance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        variantId,
        jobIds: trainJobIds.value.trim(),
        algorithm,
        imbalanceStrategy,
      }),
    });

    const startedAt = Date.now();
    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const status = await fetchJson(`/api/modeling/compare-status/${jobId}`);
      if (status.status === 'done') {
        setMessage(imbalanceMessage, 'Comparison ready.', false);
        renderImbalanceComparison(status.result);
        return;
      }
      if (status.status === 'error') {
        throw new Error(status.error || 'Comparison failed on the server');
      }
      const elapsed = Math.round((Date.now() - startedAt) / 1000);
      setMessage(imbalanceMessage, `Comparing strategies… (${elapsed}s elapsed)`, false);
    }
  }

  refreshButton.addEventListener('click', () => {
    refreshPage().catch((error) => {
      setOverviewMessage(error.message || String(error), true);
    });
  });

  if (overviewForm) {
    overviewForm.addEventListener('submit', (event) => {
      event.preventDefault();
      refreshOverview().catch((error) => {
        setOverviewMessage(error.message || String(error), true);
      });
    });
  }

  if (overviewClear) {
    overviewClear.addEventListener('click', () => {
      if (overviewJobIds) {
        overviewJobIds.value = '';
      }
      refreshOverview().catch((error) => {
        setOverviewMessage(error.message || String(error), true);
      });
    });
  }


  window.addEventListener('storage', (event) => {
    if (event.key !== 'ugc_selected_job_id' || !overviewJobIds) return;
    const incoming = event.newValue || '';
    if (incoming === overviewJobIds.value) return;
    overviewJobIds.value = incoming;
    refreshOverview().catch(() => {});
  });
  trainJobIds.addEventListener('input', updateDatasetDownloadLink);

  if (trainAlgorithm) {
    trainAlgorithm.addEventListener('change', () => {
      if (currentVariants.length) renderVariantCards(currentVariants);
    });
  }

  if (trainImbalanceStrategy) {
    trainImbalanceStrategy.addEventListener('change', () => {
      updateImbalanceStrategyNote();
    });
  }

  variantCards.addEventListener('click', (event) => {
    const button = event.target.closest('[data-train-variant]');
    if (!button) return;
    const variantId = button.getAttribute('data-train-variant');
    if (!variantId) return;
    trainVariant(variantId).catch((error) => {
      setMessage(trainMessage, error.message || String(error), true);
    });
  });

  if (compareImbalanceButton) {
    compareImbalanceButton.addEventListener('click', () => {
      runElementAction(compareImbalanceButton, async () => {
        await compareImbalanceStrategies();
      }).catch((error) => {
        setMessage(imbalanceMessage, error.message || String(error), true);
      });
    });
  }

  modelList.addEventListener('click', (event) => {
    const useButton = event.target.closest('[data-use-model]');
    if (useButton) {
      const modelId = useButton.getAttribute('data-use-model');
      if (!modelId) return;
      scoreModelId.value = modelId;
      siteGroupModelId.value = modelId;
      liveProbeModelId.value = modelId;
      return;
    }

    const tuneButton = event.target.closest('[data-tune-model]');
    if (tuneButton) {
      const modelId = tuneButton.getAttribute('data-tune-model');
      if (!modelId || !modelThresholdTunerPanel) return;
      // Clear previous tuner and show a loading state
      modelThresholdTunerPanel.innerHTML = '<p class="candidate-copy" style="padding:12px 0">Loading threshold curve…</p>';
      modelThresholdTunerPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      fetchJson(`/api/modeling/models/${encodeURIComponent(modelId)}`)
        .then((data) => {
          const artifact = data && data.model ? data.model : data;
          const curve    = Array.isArray(artifact && artifact.threshold_curve) ? artifact.threshold_curve : [];
          modelThresholdTunerPanel.innerHTML = '';
          if (!curve.length) {
            modelThresholdTunerPanel.innerHTML = '<p class="message">This model has no threshold curve — retrain to generate one.</p>';
            return;
          }
          const tunerEl = buildThresholdTuner(curve, modelId);
          if (tunerEl) modelThresholdTunerPanel.appendChild(tunerEl);
        })
        .catch((err) => {
          if (modelThresholdTunerPanel) {
            modelThresholdTunerPanel.innerHTML = `<p class="message error">${escapeHtml(err && err.message ? err.message : String(err))}</p>`;
          }
        });
      return;
    }

    const deleteButton = event.target.closest('[data-delete-model]');
    if (deleteButton) {
      const modelId = deleteButton.getAttribute('data-delete-model');
      if (!modelId) return;
      if (!confirm(`Delete model "${modelId}"? This cannot be undone.`)) return;
      deleteButton.disabled = true;
      fetch(apiUrl(`/api/modeling/models/${encodeURIComponent(modelId)}`), { method: 'DELETE' })
        .then((res) => res.json())
        .then(() => refreshOverview())
        .catch((err) => {
          deleteButton.disabled = false;
          alert(`Delete failed: ${err.message || err}`);
        });
    }
  });

  recentJobsModel.addEventListener('click', (event) => {
    const button = event.target.closest('[data-use-job]');
    if (!button) return;
    const jobId = button.getAttribute('data-use-job');
    if (!jobId) return;
    scoreJobId.value = jobId;
    if (overviewJobIds) {
      overviewJobIds.value = jobId;
    }
    refreshOverview().catch((error) => {
      setOverviewMessage(error.message || String(error), true);
    });
  });

  scoreJobForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (overviewJobIds) {
      overviewJobIds.value = scoreJobId.value.trim();
    }
    refreshOverview().catch((error) => {
      setOverviewMessage(error.message || String(error), true);
    });
    setMessage(scoreJobMessage, 'Scoring job...', false);
    fetchJson('/api/modeling/score-job', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        modelId: scoreModelId.value,
        jobId: scoreJobId.value.trim(),
      }),
    })
      .then((result) => {
        setMessage(scoreJobMessage, 'Job scored.', false);
        renderScoredJob(result);
      })
      .catch((error) => {
        setMessage(scoreJobMessage, error.message || String(error), true);
      });
  });

  syncLiveProbePriorityState();
  if (liveProbePriority) {
    liveProbePriority.addEventListener('change', syncLiveProbePriorityState);
  }

  siteGroupForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const submitButton = siteGroupForm.querySelector('button[type="submit"]');
    runElementAction(submitButton, async () => {
      setMessage(siteGroupMessage, 'Running site-group probe...', false);
      setProbeProgress(
        siteGroupProgress,
        'Running site-group probe',
        'This compares stored rows against the selected model and may take a moment on large jobs. Previous results stay visible until the probe finishes.',
      );
      const text = await readSiteGroupText();
      const result = await fetchJson('/api/modeling/site-groups', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          modelId: siteGroupModelId.value,
          jobIds: siteGroupJobIds.value.trim(),
          siteText: text,
        }),
      });
      setMessage(siteGroupMessage, 'Site-group probe completed.', false);
      renderSiteGroups(result);
    }).catch((error) => {
      setMessage(siteGroupMessage, error.message || String(error), true);
    }).finally(() => {
      clearProbeProgress(siteGroupProgress);
    });
  });

  liveProbeForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const submitButton = liveProbeForm.querySelector('button[type="submit"]');
    const timeoutValue = liveProbeTimeoutMs ? Number(liveProbeTimeoutMs.value) : NaN;
    const priorityProbe = !liveProbePriority || liveProbePriority.checked;
    const timeoutMs = priorityProbe
      ? 0
      : (Number.isFinite(timeoutValue) && timeoutValue >= 1000 ? timeoutValue : 300000);
    runElementAction(submitButton, async () => {
      setMessage(liveProbeMessage, priorityProbe ? 'Probing live URL at priority...' : 'Probing live URL...', false);
      const liveProbeTitle = priorityProbe ? 'Priority live URL scan' : 'Scanning live URL';
      const liveProbeDetail = priorityProbe
        ? 'The live probe keeps reporting scan steps and model scoring counts while it runs.'
        : `This can take up to ${formatDurationLabel(timeoutMs)} on heavy pages. Keep this tab open while the probe reports live scan steps and candidate counts. Previous results stay visible until the new scan completes.`;
      setProbeProgress(
        liveProbeProgress,
        liveProbeTitle,
        liveProbeDetail,
        {
          current: 0,
          total: 5,
          unit: 'scan steps',
          indeterminate: false,
        },
      );
      startLiveProbeProgressPolling(liveProbeTitle, liveProbeDetail);
      const result = await fetchJson('/api/modeling/probe-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          modelId: liveProbeModelId.value,
          url: liveProbeUrl.value.trim(),
          candidateMode: liveProbeCandidateMode.value,
          timeoutMs,
          priorityProbe,
        }),
      });
      const summary = result && result.summary ? result.summary : null;
      const scan = result && result.scan ? result.scan : null;
      const scanError = summary ? String(summary.scan_error || (scan && scan.error) || '') : '';
      const scanTimedOut = !!(scan && scan.timed_out) || /timed out/i.test(scanError);
      if (scanTimedOut) {
        setMessage(liveProbeMessage, `Live URL probe timed out: ${scanError || 'no result'}.`, true);
      } else if (scanError) {
        setMessage(liveProbeMessage, `Live URL probe failed: ${scanError}.`, true);
      } else {
        setMessage(liveProbeMessage, 'Live URL probe completed.', false);
      }
      renderLiveProbe(result);
    }).catch((error) => {
      setMessage(liveProbeMessage, error.message || String(error), true);
    }).finally(() => {
      stopLiveProbeProgressPolling();
      clearProbeProgress(liveProbeProgress);
    });
  });

  function renderCvResult(result) {
    if (!diagCvResult) return;
    if (!result || !result.folds) {
      diagCvResult.className = 'table-shell empty';
      diagCvResult.textContent = 'No cross-validation result.';
      return;
    }
    const agg = result.aggregate || {};
    const aggRows = [
      ['F1 (at 0.50 threshold)', agg.f1],
      ['F1 (per-fold best threshold ★)', agg.best_f1],
      ['Precision', agg.precision],
      ['Recall', agg.recall],
      ['ROC-AUC', agg.roc_auc],
      ['PR-AUC', agg.pr_auc],
      ['Top-1 Accuracy', agg.top_1_accuracy],
      ['MRR', agg.mean_reciprocal_rank],
    ].filter(([, s]) => s && s.mean !== null);

    const completedFolds = result.folds.filter((f) => !f.skipped);

    diagCvResult.className = 'table-shell';
    diagCvResult.innerHTML = `
      <h3 style="margin:0 0 8px">5-Fold Cross-Validation — ${escapeHtml(result.algorithm || '')} / ${escapeHtml(result.imbalance_strategy || '')} — ${result.total_labeled} labeled rows</h3>
      <h4 style="margin:8px 0 4px;color:var(--muted)">Aggregate (mean ± std [95% CI])</h4>
      <table>
        <thead><tr><th>Metric</th><th>Mean</th><th>Std</th><th>95% CI</th><th>n Folds</th></tr></thead>
        <tbody>
          ${aggRows.map(([label, stat]) => `
            <tr>
              <td>${escapeHtml(label)}</td>
              <td class="mono">${stat.mean !== null ? Number(stat.mean).toFixed(3) : '—'}</td>
              <td class="mono">${stat.std !== null ? Number(stat.std).toFixed(3) : '—'}</td>
              <td class="mono">${stat.ci95_lo !== null ? `[${Number(stat.ci95_lo).toFixed(3)}–${Number(stat.ci95_hi).toFixed(3)}]` : '—'}</td>
              <td class="mono">${stat.n}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <h4 style="margin:16px 0 4px;color:var(--muted)">Per-Fold Results</h4>
      <table>
        <thead><tr><th>Fold</th><th>Train</th><th>Test</th><th>F1 @0.50</th><th>Best F1 ★</th><th>Best Threshold</th><th>Precision</th><th>Recall</th><th>ROC-AUC</th><th>PR-AUC</th></tr></thead>
        <tbody>
          ${result.folds.map((fold) => {
            if (fold.skipped) {
              return `<tr><td>${fold.fold}</td><td colspan="9" style="color:var(--muted)">${escapeHtml(fold.reason || 'Skipped')}</td></tr>`;
            }
            const cm = fold.metrics && fold.metrics.candidate_metrics || {};
            const bm = fold.best_threshold_metrics || {};
            const bestF1 = bm.f1 !== undefined ? bm.f1 : null;
            const f1At50 = cm.f1 !== undefined ? cm.f1 : null;
            const bestIsBetter = bestF1 !== null && f1At50 !== null && bestF1 > f1At50 + 0.01;
            return `
              <tr>
                <td class="mono">${fold.fold}</td>
                <td class="mono">${fold.train_count}</td>
                <td class="mono">${fold.test_count}</td>
                <td class="mono">${f1At50 !== null ? f1At50 : '—'}</td>
                <td class="mono" style="${bestIsBetter ? 'color:var(--accent);font-weight:600' : ''}">${bestF1 !== null ? bestF1 : '—'}</td>
                <td class="mono">${bm.threshold !== undefined ? bm.threshold : '—'}</td>
                <td class="mono">${cm.precision !== undefined ? cm.precision : '—'}</td>
                <td class="mono">${cm.recall !== undefined ? cm.recall : '—'}</td>
                <td class="mono">${cm.roc_auc !== null && cm.roc_auc !== undefined ? cm.roc_auc : '—'}</td>
                <td class="mono">${cm.pr_auc !== null && cm.pr_auc !== undefined ? cm.pr_auc : '—'}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
      ${completedFolds.length > 0 ? `
        <details style="margin-top:12px">
          <summary style="cursor:pointer;color:var(--muted);font-size:0.85rem">Calibration curves (per fold)</summary>
          <table style="margin-top:8px">
            <thead><tr><th>Fold</th><th>Bin</th><th>Count</th><th>Mean Predicted</th><th>Fraction Positive</th></tr></thead>
            <tbody>
              ${completedFolds.flatMap((f) => (f.calibration || []).map((b) => `
                <tr>
                  <td class="mono">${f.fold}</td>
                  <td class="mono">${b.bin_start}–${b.bin_end}</td>
                  <td class="mono">${b.count}</td>
                  <td class="mono">${b.mean_predicted !== null ? b.mean_predicted : '—'}</td>
                  <td class="mono">${b.fraction_positive !== null ? b.fraction_positive : '—'}</td>
                </tr>
              `)).join('')}
            </tbody>
          </table>
        </details>
      ` : ''}
    `;
  }

  function renderLcResult(result) {
    if (!diagLcResult) return;
    if (!result || !result.points) {
      diagLcResult.className = 'table-shell empty';
      diagLcResult.textContent = 'No learning curve result.';
      return;
    }
    diagLcResult.className = 'table-shell';
    diagLcResult.innerHTML = `
      <h3 style="margin:0 0 8px">Learning Curve — ${escapeHtml(result.algorithm || '')} / ${escapeHtml(result.imbalance_strategy || '')} — fixed test set: ${result.test_count} rows</h3>
      <p style="font-size:0.85rem;color:var(--muted);margin:0 0 8px">Each row trains on a fraction of the domain-holdout training split. A gap between Train F1 and Test F1 indicates overfitting; converging curves signal data saturation.</p>
      <table>
        <thead>
          <tr>
            <th>Fraction</th><th>Train Count</th><th>Train F1</th><th>Train ROC-AUC</th>
            <th>Test F1</th><th>Test Precision</th><th>Test Recall</th><th>Test ROC-AUC</th><th>Test PR-AUC</th>
          </tr>
        </thead>
        <tbody>
          ${result.points.map((pt) => {
            if (pt.skipped) {
              return `<tr><td class="mono">${(pt.fraction * 100).toFixed(0)}%</td><td colspan="8" style="color:var(--muted)">${escapeHtml(pt.reason || 'Skipped')}</td></tr>`;
            }
            const tr = pt.train_metrics || {};
            const te = pt.test_metrics || {};
            const gap = (typeof tr.f1 === 'number' && typeof te.f1 === 'number') ? (tr.f1 - te.f1) : null;
            const gapColor = gap === null ? '' : (gap > 0.1 ? 'color:var(--warn,#f59e0b)' : 'color:var(--accent)');
            return `
              <tr>
                <td class="mono">${(pt.fraction * 100).toFixed(0)}%</td>
                <td class="mono">${pt.train_count}</td>
                <td class="mono" style="${gapColor}">${tr.f1 !== undefined ? tr.f1 : '—'}</td>
                <td class="mono">${tr.roc_auc !== null && tr.roc_auc !== undefined ? tr.roc_auc : '—'}</td>
                <td class="mono">${te.f1 !== undefined ? te.f1 : '—'}</td>
                <td class="mono">${te.precision !== undefined ? te.precision : '—'}</td>
                <td class="mono">${te.recall !== undefined ? te.recall : '—'}</td>
                <td class="mono">${te.roc_auc !== null && te.roc_auc !== undefined ? te.roc_auc : '—'}</td>
                <td class="mono">${te.pr_auc !== null && te.pr_auc !== undefined ? te.pr_auc : '—'}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  }

  // Stores the variant + jobIds context so domain drill-down clicks know what to fetch
  let currentDiagBucketContext = null;

  function renderDomainBuckets(result) {
    if (!diagBucketResult) return;
    if (!result || !Array.isArray(result.buckets)) {
      diagBucketResult.className = 'table-shell empty';
      diagBucketResult.textContent = 'No domain bucket data.';
      return;
    }
    const bucketColors = ['#3b82f6', '#60a5fa', '#f87171', '#34d399', '#a78bfa'];
    diagBucketResult.className = 'table-shell';
    diagBucketResult.innerHTML = `
      <h3 style="margin:0 0 6px">Domain Bucket Inspector — ${result.total_labeled} labeled rows across ${result.n_buckets} buckets</h3>
      <p style="font-size:0.82rem;color:#6b7280;margin:0 0 4px">Each domain is deterministically assigned to a bucket by <code>hash(hostname) % 5</code>. Bucket N is the held-out test set for Fold N in cross-validation.</p>
      <p style="font-size:0.79rem;color:#3b82f6;margin:0 0 12px">💡 Click any domain to inspect its labeled candidates and verify the counts.</p>
      ${result.buckets.map((b) => `
        <details style="margin-bottom:10px;border:1px solid rgba(17,24,39,0.15);border-radius:6px;overflow:hidden">
          <summary style="padding:8px 12px;cursor:pointer;background:#1e293b;display:flex;align-items:center;gap:10px;font-size:0.88rem;font-weight:600;color:#f1f5f9">
            <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${bucketColors[b.bucket]};flex-shrink:0"></span>
            Bucket ${b.bucket} — Fold ${b.bucket} test set
            <span style="color:#94a3b8;font-weight:400;margin-left:4px">${b.domain_count} domain${b.domain_count !== 1 ? 's' : ''} · ${b.row_count} rows · ${b.positive_count} with comments</span>
          </summary>
          <div style="overflow-x:auto;max-height:400px;overflow-y:auto">
            <table style="margin:0">
              <thead><tr>
                <th style="min-width:220px">Domain <span style="font-weight:400;font-size:0.74rem;color:#94a3b8">(click to inspect)</span></th>
                <th>Labeled Rows</th><th>With Comments</th><th>Comment Rate</th>
              </tr></thead>
              <tbody>
                ${b.domains.map((d) => `
                  <tr class="domain-bucket-row">
                    <td class="mono" style="cursor:pointer;color:#2563eb;text-decoration:underline;text-decoration-style:dotted;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
                        data-domain="${escapeHtml(d.domain)}"
                        title="Click to view ${d.count} candidate row${d.count !== 1 ? 's' : ''} for ${escapeHtml(d.domain)}">
                      ${escapeHtml(d.domain)}
                    </td>
                    <td class="mono">${d.count}</td>
                    <td class="mono">${d.positive_count}</td>
                    <td class="mono" style="${d.positive_rate > 0.7 ? 'color:#16a34a;font-weight:600' : d.positive_rate < 0.1 ? 'color:#9ca3af' : ''}">${(d.positive_rate * 100).toFixed(1)}%</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </details>
      `).join('')}
    `;
  }

  // Resolves a diag API response that may be either:
  //   - Synchronous: { ok, folds/points/buckets, ... }  (server returns result inline)
  //   - Async/202:   { ok, jobId, status: 'running' }   (server forks; poll diag-status)
  async function resolveDiagResponse(res, dataKey, onProgress) {
    if (res.jobId && !res[dataKey]) {
      const startedAt = Date.now();
      for (;;) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const status = await fetchJson(`/api/modeling/diag-status/${res.jobId}`);
        if (status.status === 'done') return status.result;
        if (status.status === 'error') throw new Error(status.error || 'Diagnostics failed on the server');
        onProgress && onProgress(Math.round((Date.now() - startedAt) / 1000));
      }
    }
    return res;
  }

  if (diagCrossValidateButton) {
    diagCrossValidateButton.addEventListener('click', () => {
      const variantId = diagVariantId ? diagVariantId.value : '';
      if (!variantId) { setMessage(diagMessage, 'Select a model variant first.', true); return; }
      runElementAction(diagCrossValidateButton, async () => {
        setMessage(diagMessage, 'Running 5-fold cross-validation…', false);
        if (diagCvResult) { diagCvResult.className = 'table-shell empty'; diagCvResult.textContent = 'Running…'; }
        const res = await fetchJson('/api/modeling/cross-validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            variantId,
            algorithm: diagAlgorithm ? diagAlgorithm.value : 'logistic_regression',
            imbalanceStrategy: diagImbalanceStrategy ? diagImbalanceStrategy.value : 'baseline',
            jobIds: diagJobIds ? diagJobIds.value.trim() : '',
          }),
        });
        const result = await resolveDiagResponse(res, 'folds', (s) => setMessage(diagMessage, `Running 5-fold cross-validation… (${s}s elapsed)`, false));
        setMessage(diagMessage, 'Cross-validation complete.', false);
        renderCvResult(result);
      }).catch((err) => {
        setMessage(diagMessage, err.message || String(err), true);
        if (diagCvResult) { diagCvResult.className = 'table-shell empty'; diagCvResult.textContent = 'Cross-validation failed.'; }
      });
    });
  }

  if (diagLearningCurveButton) {
    diagLearningCurveButton.addEventListener('click', () => {
      const variantId = diagVariantId ? diagVariantId.value : '';
      if (!variantId) { setMessage(diagMessage, 'Select a model variant first.', true); return; }
      runElementAction(diagLearningCurveButton, async () => {
        setMessage(diagMessage, 'Computing learning curve…', false);
        if (diagLcResult) { diagLcResult.className = 'table-shell empty'; diagLcResult.textContent = 'Running…'; }
        const res = await fetchJson('/api/modeling/learning-curve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            variantId,
            algorithm: diagAlgorithm ? diagAlgorithm.value : 'logistic_regression',
            imbalanceStrategy: diagImbalanceStrategy ? diagImbalanceStrategy.value : 'baseline',
            jobIds: diagJobIds ? diagJobIds.value.trim() : '',
          }),
        });
        const result = await resolveDiagResponse(res, 'points', (s) => setMessage(diagMessage, `Computing learning curve… (${s}s elapsed)`, false));
        setMessage(diagMessage, 'Learning curve complete.', false);
        renderLcResult(result);
      }).catch((err) => {
        setMessage(diagMessage, err.message || String(err), true);
        if (diagLcResult) { diagLcResult.className = 'table-shell empty'; diagLcResult.textContent = 'Learning curve failed.'; }
      });
    });
  }

  if (diagDomainBucketsButton) {
    diagDomainBucketsButton.addEventListener('click', () => {
      const variantId = diagVariantId ? diagVariantId.value : '';
      if (!variantId) { setMessage(diagMessage, 'Select a model variant first.', true); return; }
      runElementAction(diagDomainBucketsButton, async () => {
        setMessage(diagMessage, 'Inspecting domain buckets…', false);
        if (diagBucketResult) { diagBucketResult.className = 'table-shell empty'; diagBucketResult.textContent = 'Loading…'; }
        const jobIds = diagJobIds ? diagJobIds.value.trim() : '';
        // Save context so domain drill-down clicks know what variant+jobs to query against
        currentDiagBucketContext = { variantId, jobIds };
        const result = await fetchJson('/api/modeling/domain-buckets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ variantId, jobIds }),
        });
        setMessage(diagMessage, '', false);
        renderDomainBuckets(result);
      }).catch((err) => {
        setMessage(diagMessage, err.message || String(err), true);
        if (diagBucketResult) { diagBucketResult.className = 'table-shell empty'; diagBucketResult.textContent = 'Domain bucket inspection failed.'; }
      });
    });
  }

  // ── Domain drill-down: click a domain row to see its individual candidates ────
  if (diagBucketResult) {
    diagBucketResult.addEventListener('click', async (e) => {
      const domainCell = e.target.closest('[data-domain]');
      if (!domainCell || !currentDiagBucketContext) return;

      const domain = domainCell.dataset.domain;
      const parentRow = domainCell.closest('tr');
      if (!parentRow) return;

      // Toggle: clicking the same domain again collapses the panel
      const nextRow = parentRow.nextElementSibling;
      if (nextRow && nextRow.dataset.detailFor === domain) {
        nextRow.remove();
        domainCell.style.fontWeight = '';
        return;
      }

      // Close any currently open detail panels within the same table
      const parentTable = parentRow.closest('table');
      if (parentTable) {
        parentTable.querySelectorAll('[data-detail-for]').forEach((r) => r.remove());
        parentTable.querySelectorAll('[data-domain]').forEach((c) => { c.style.fontWeight = ''; });
      }

      // Show loading row
      domainCell.style.fontWeight = '700';
      const loadingRow = document.createElement('tr');
      loadingRow.dataset.detailFor = domain;
      loadingRow.innerHTML = `<td colspan="4" style="padding:10px 16px;color:#6b7280;font-size:0.82rem;background:#f8faff;border-top:2px solid #3b82f6">
        Loading candidates for <strong style="color:#1d4ed8">${escapeHtml(domain)}</strong>…
      </td>`;
      parentRow.insertAdjacentElement('afterend', loadingRow);

      try {
        const data = await fetchJson('/api/modeling/domain-candidates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...currentDiagBucketContext, domain }),
        });

        loadingRow.remove();
        const candidates = Array.isArray(data.candidates) ? data.candidates : [];
        const positives  = candidates.filter((c) => c.label === 1).length;
        const negatives  = candidates.length - positives;
        const uniqueJobs = [...new Set(candidates.map((c) => c.job_id).filter(Boolean))];

        const candidateRowsHtml = candidates.length
          ? candidates.map((c, i) => `
              <tr style="background:${i % 2 === 0 ? '#fff' : '#f8faff'}">
                <td style="padding:5px 10px;color:#9ca3af;font-size:0.75rem;text-align:right">${i + 1}</td>
                <td style="padding:5px 10px;font-family:ui-monospace,Consolas,monospace;font-size:0.74rem;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#374151" title="${escapeHtml(c.candidate_id)}">${escapeHtml(c.candidate_id)}</td>
                <td style="padding:5px 10px;font-family:ui-monospace,Consolas,monospace;font-size:0.74rem;color:#374151">${escapeHtml(c.job_id || '—')}</td>
                <td style="padding:5px 10px;font-size:0.8rem;text-align:center">
                  ${c.label === 1
                    ? '<span style="color:#16a34a;font-weight:700" title="Positive — labeled as having spam/UGC comments">✓ spam</span>'
                    : '<span style="color:#9ca3af" title="Negative — labeled as clean">✗ clean</span>'}
                </td>
                <td style="padding:5px 10px">
                  ${c.job_id
                    ? `<a href="./index.html?jobId=${encodeURIComponent(c.job_id)}" target="_blank"
                          style="font-size:0.74rem;color:#3b82f6;text-decoration:none;white-space:nowrap"
                          title="Open job ${escapeHtml(c.job_id)} in the Scanner">View job ↗</a>`
                    : ''}
                </td>
              </tr>`)
            .join('')
          : `<tr><td colspan="5" style="padding:14px;color:#9ca3af;text-align:center;font-size:0.82rem">No labeled rows found for this domain in the current dataset scope.</td></tr>`;

        const detailRow = document.createElement('tr');
        detailRow.dataset.detailFor = domain;
        detailRow.innerHTML = `
          <td colspan="4" style="padding:0;border-top:2px solid #3b82f6">
            <div style="background:#eff6ff;padding:8px 14px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px">
              <span style="font-size:0.82rem;font-weight:600;color:#1d4ed8">${escapeHtml(domain)}</span>
              <span style="font-size:0.79rem;color:#374151">
                ${candidates.length} row${candidates.length !== 1 ? 's' : ''} total &nbsp;·&nbsp;
                <span style="color:#16a34a;font-weight:600">${positives} spam</span> &nbsp;/&nbsp;
                <span style="color:#6b7280">${negatives} clean</span>
                ${uniqueJobs.length ? ' &nbsp;·&nbsp; Jobs: <code style="font-size:0.74rem">' + uniqueJobs.map((j) => escapeHtml(j)).join(', ') + '</code>' : ''}
              </span>
              <button data-collapse-domain="${escapeHtml(domain)}"
                      style="font-size:0.74rem;padding:2px 8px;border:1px solid #bfdbfe;border-radius:4px;background:#fff;color:#1d4ed8;cursor:pointer">
                ✕ Close
              </button>
            </div>
            <div style="overflow-x:auto;max-height:300px;overflow-y:auto">
              <table style="margin:0;border:none;width:100%;table-layout:fixed">
                <colgroup>
                  <col style="width:40px"><col style="width:auto"><col style="width:120px"><col style="width:90px"><col style="width:80px">
                </colgroup>
                <thead><tr style="background:#dbeafe;position:sticky;top:0">
                  <th style="padding:5px 10px;font-size:0.74rem;text-align:right">#</th>
                  <th style="padding:5px 10px;font-size:0.74rem">Candidate ID</th>
                  <th style="padding:5px 10px;font-size:0.74rem">Job ID</th>
                  <th style="padding:5px 10px;font-size:0.74rem;text-align:center">Label</th>
                  <th style="padding:5px 10px;font-size:0.74rem">Link</th>
                </tr></thead>
                <tbody>${candidateRowsHtml}</tbody>
              </table>
            </div>
          </td>`;

        parentRow.insertAdjacentElement('afterend', detailRow);
      } catch (err) {
        loadingRow.innerHTML = `<td colspan="4" style="padding:10px 16px;color:#dc2626;font-size:0.82rem;background:#fef2f2;border-top:2px solid #f87171">
          Error loading candidates: ${escapeHtml(err.message || String(err))}
        </td>`;
      }
    });

    // Close button inside a detail panel
    diagBucketResult.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-collapse-domain]');
      if (!btn) return;
      const domain = btn.dataset.collapseDomain;
      if (diagBucketResult) {
        diagBucketResult.querySelectorAll(`[data-detail-for="${CSS.escape(domain)}"]`).forEach((r) => r.remove());
        diagBucketResult.querySelectorAll('[data-domain]').forEach((c) => {
          if (c.dataset.domain === domain) c.style.fontWeight = '';
        });
      }
    });
  }

  // ── Feature Exclusion panel ───────────────────────────────────────────────────
  // State: a Set of excluded feature keys — single source of truth.
  const excludedFeatureKeys = new Set();

  // Map of key → {title, type} for building tags; populated when panel is built.
  const featureMeta = new Map();

  function getExcludedFeatures() {
    return Array.from(excludedFeatureKeys);
  }

  function renderExclusionTags() {
    if (!featureExclusionTags) return;
    // Clear everything after the static "Excluded:" label (first child)
    while (featureExclusionTags.children.length > 1) {
      featureExclusionTags.removeChild(featureExclusionTags.lastChild);
    }

    if (excludedFeatureKeys.size === 0) {
      featureExclusionTags.style.display = 'none';
      return;
    }

    featureExclusionTags.style.cssText = featureExclusionTags.style.cssText.replace('display:none', '');
    featureExclusionTags.style.display = 'flex';
    excludedFeatureKeys.forEach((key) => {
      const meta = featureMeta.get(key) || { title: key };
      const tag = document.createElement('span');
      tag.style.cssText = 'display:inline-flex;align-items:center;gap:5px;padding:3px 8px 3px 10px;background:rgba(224,85,85,.13);border:1px solid rgba(224,85,85,.3);border-radius:12px;font-size:0.77rem;color:var(--red,#e05555)';
      const label = document.createElement('code');
      label.style.cssText = 'font-size:0.75rem';
      label.textContent = key;
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.title = `Re-include ${key}`;
      removeBtn.style.cssText = 'background:none;border:none;padding:0;cursor:pointer;color:var(--red,#e05555);font-size:0.85rem;line-height:1;opacity:.7;display:flex;align-items:center';
      removeBtn.innerHTML = '&#215;';
      removeBtn.addEventListener('click', () => {
        excludedFeatureKeys.delete(key);
        // Re-check the matching checkbox if the grid is built
        if (featureExclusionFamilies) {
          const cb = featureExclusionFamilies.querySelector(`input[type=checkbox][data-feature-key="${CSS.escape(key)}"]`);
          if (cb) {
            cb.checked = true;
            syncFamilyCheckbox(cb);
          }
        }
        updateExclusionUI();
      });
      tag.appendChild(label);
      tag.appendChild(removeBtn);
      featureExclusionTags.appendChild(tag);
    });
  }

  function syncFamilyCheckbox(featureCheckbox) {
    const familyEl = featureCheckbox.closest('[data-family-el]');
    if (!familyEl) return;
    const familyBox = familyEl.querySelector('input[type=checkbox][data-family-check]');
    const childBoxes = Array.from(familyEl.querySelectorAll('input[type=checkbox][data-feature-key]'));
    if (!familyBox || !childBoxes.length) return;
    const checkedCount = childBoxes.filter((b) => b.checked).length;
    if (checkedCount === childBoxes.length) { familyBox.checked = true; familyBox.indeterminate = false; }
    else if (checkedCount === 0) { familyBox.checked = false; familyBox.indeterminate = false; }
    else { familyBox.indeterminate = true; }
  }

  function updateExclusionUI() {
    const total = featureMeta.size;
    const excluded = excludedFeatureKeys.size;
    const active = total - excluded;

    // Status text
    if (featureExclusionStatus) {
      if (!total) {
        featureExclusionStatus.textContent = 'Loading…';
        featureExclusionStatus.style.color = 'var(--muted)';
      } else if (excluded) {
        featureExclusionStatus.textContent = `${active} of ${total} features active · ${excluded} excluded`;
        featureExclusionStatus.style.color = 'var(--amber,#f6a623)';
      } else {
        featureExclusionStatus.textContent = `All ${total} features active`;
        featureExclusionStatus.style.color = 'var(--muted)';
      }
    }

    // Clear button
    if (featureExclusionClear) featureExclusionClear.style.display = excluded ? '' : 'none';

    // Manual label count
    if (featureExclusionManualLabel) {
      featureExclusionManualLabel.textContent = total ? `Edit manually (${total} features)` : 'Edit manually';
    }

    // Tag strip
    renderExclusionTags();
  }

  function buildFeatureExclusionPanel(featureFamilies) {
    if (!featureExclusionFamilies || !Array.isArray(featureFamilies) || !featureFamilies.length) return;
    // Only build once
    if (featureMeta.size) return;

    featureExclusionFamilies.innerHTML = '';

    featureFamilies.forEach((family) => {
      if (!Array.isArray(family.features) || !family.features.length) return;

      // Register meta for tag rendering
      family.features.forEach((f) => featureMeta.set(f.key, { title: f.title, type: f.type }));

      const familyEl = document.createElement('div');
      familyEl.setAttribute('data-family-el', '');
      familyEl.style.cssText = 'border:1px solid rgba(17,24,39,0.15);border-radius:8px;overflow:hidden';

      // ── Family header: checkbox left, group name CENTERED, count right ──
      const header = document.createElement('div');
      header.style.cssText = 'position:relative;display:flex;align-items:center;justify-content:center;padding:9px 48px;background:#dde4f0;border-bottom:1px solid rgba(17,24,39,0.15)';

      const familyCheck = document.createElement('input');
      familyCheck.type = 'checkbox';
      familyCheck.checked = true;
      familyCheck.setAttribute('data-family-check', '');
      familyCheck.title = `Toggle all ${family.title} features`;
      familyCheck.style.cssText = 'position:absolute;left:14px;top:50%;transform:translateY(-50%);margin:0;cursor:pointer;width:15px;height:15px';

      const familyLabel = document.createElement('strong');
      familyLabel.style.cssText = 'font-size:0.84rem;font-weight:700;color:#111827;text-align:center;letter-spacing:0.01em';
      familyLabel.textContent = family.title;

      const familyCount = document.createElement('span');
      familyCount.style.cssText = 'position:absolute;right:12px;top:50%;transform:translateY(-50%);font-size:0.71rem;color:#4b5563;background:#fff;border:1px solid rgba(17,24,39,0.15);padding:1px 7px;border-radius:10px;white-space:nowrap';
      familyCount.textContent = `${family.features.length} feat.`;

      header.appendChild(familyCheck);
      header.appendChild(familyLabel);
      header.appendChild(familyCount);
      familyEl.appendChild(header);

      // ── Feature grid: explicit 2-column layout ──
      const grid = document.createElement('div');
      grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;background:#ffffff';

      const featureCheckboxes = [];

      family.features.forEach((feature, idx) => {
        const row = document.createElement('label');
        const borderRight = (idx % 2 === 0) ? ';border-right:1px solid rgba(17,24,39,0.1)' : '';
        row.style.cssText = 'display:flex;align-items:center;gap:7px;padding:6px 12px;cursor:pointer;border-bottom:1px solid rgba(17,24,39,0.08);box-sizing:border-box' + borderRight;
        row.title = feature.title || feature.key;

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = true;
        cb.dataset.featureKey = feature.key;
        cb.style.cssText = 'flex-shrink:0;margin:0;cursor:pointer;width:14px;height:14px';
        cb.addEventListener('change', () => {
          if (cb.checked) excludedFeatureKeys.delete(feature.key);
          else excludedFeatureKeys.add(feature.key);
          syncFamilyCheckbox(cb);
          updateExclusionUI();
        });

        const keyEl = document.createElement('span');
        keyEl.style.cssText = 'display:block;font-size:0.78rem;font-family:ui-monospace,Consolas,monospace;color:#111827;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
        keyEl.textContent = feature.key;

        const typeTag = document.createElement('span');
        typeTag.style.cssText = 'display:block;font-size:0.66rem;color:#4b5563;background:#f3f4f6;border:1px solid rgba(17,24,39,0.12);padding:1px 5px;border-radius:3px;white-space:nowrap;flex-shrink:0';
        typeTag.textContent = feature.type;

        row.appendChild(cb);
        row.appendChild(keyEl);
        row.appendChild(typeTag);
        grid.appendChild(row);
        featureCheckboxes.push(cb);
      });

      // Family toggle wires all its children
      familyCheck.addEventListener('change', () => {
        featureCheckboxes.forEach((cb) => {
          cb.checked = familyCheck.checked;
          if (familyCheck.checked) excludedFeatureKeys.delete(cb.dataset.featureKey);
          else excludedFeatureKeys.add(cb.dataset.featureKey);
        });
        familyCheck.indeterminate = false;
        updateExclusionUI();
      });

      familyEl.appendChild(grid);
      featureExclusionFamilies.appendChild(familyEl);
    });

    updateExclusionUI();
  }

  function applyFeatureSuggestions(fsFeatures, includeReview) {
    if (!Array.isArray(fsFeatures)) return;
    // Update the Set (source of truth)
    fsFeatures.forEach((f) => {
      if (f.verdict === 'drop' || (includeReview && f.verdict === 'review')) {
        excludedFeatureKeys.add(f.key);
      }
    });
    // Sync checkboxes in the grid (if it's been built)
    if (featureExclusionFamilies) {
      const boxes = featureExclusionFamilies.querySelectorAll('input[type=checkbox][data-feature-key]');
      boxes.forEach((box) => {
        box.checked = !excludedFeatureKeys.has(box.dataset.featureKey);
        syncFamilyCheckbox(box);
      });
    }
    updateExclusionUI();
    // Scroll the tag strip into view so the user sees the result
    if (featureExclusionTags) {
      featureExclusionTags.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      featureExclusionTags.style.transition = 'background .4s';
      featureExclusionTags.style.background = 'rgba(224,85,85,.08)';
      setTimeout(() => { featureExclusionTags.style.background = ''; }, 800);
    }
  }

  if (featureExclusionDetails) {
    featureExclusionDetails.addEventListener('toggle', () => {
      if (featureExclusionArrow) {
        featureExclusionArrow.style.transform = featureExclusionDetails.open ? 'rotate(90deg)' : '';
      }
    });
  }

  if (featureExclusionToggle) {
    featureExclusionToggle.addEventListener('click', () => {
      if (featureExclusionDetails) featureExclusionDetails.open = !featureExclusionDetails.open;
    });
  }

  if (featureExclusionClear) {
    featureExclusionClear.addEventListener('click', () => {
      excludedFeatureKeys.clear();
      if (featureExclusionFamilies) {
        featureExclusionFamilies.querySelectorAll('input[type=checkbox]').forEach((box) => {
          box.checked = true;
          box.indeterminate = false;
        });
      }
      updateExclusionUI();
    });
  }

  if (featureExclusionApplyDrop) {
    featureExclusionApplyDrop.addEventListener('click', () => {
      if (currentFsResult && Array.isArray(currentFsResult.features)) {
        applyFeatureSuggestions(currentFsResult.features, false);
      }
    });
  }

  if (featureExclusionApplyBoth) {
    featureExclusionApplyBoth.addEventListener('click', () => {
      if (currentFsResult && Array.isArray(currentFsResult.features)) {
        applyFeatureSuggestions(currentFsResult.features, true);
      }
    });
  }

  // ── Feature Selection render + handler ────────────────────────────────────────

  function renderFeatureSelection(result) {
    if (!diagFsResult) return;
    if (!result || !Array.isArray(result.features)) {
      diagFsResult.className = 'table-shell empty';
      diagFsResult.textContent = 'No feature analysis data.';
      return;
    }

    currentFsResult = result;

    // Show the apply bar in the Train Variants section
    const dropCount = result.features.filter((f) => f.verdict === 'drop').length;
    const reviewCount = result.features.filter((f) => f.verdict === 'review').length;
    if (featureExclusionApplyBar && (dropCount || reviewCount)) {
      if (featureExclusionApplySummary) {
        featureExclusionApplySummary.textContent = [
          dropCount ? `${dropCount} drop` : '',
          reviewCount ? `${reviewCount} review` : '',
        ].filter(Boolean).join(' · ');
      }
      featureExclusionApplyBar.style.display = 'flex';
    }

    const { features, summary, threshold_series: tSeries, total_labeled, feature_count } = result;

    const verdictColor = { drop: 'var(--red,#e05555)', review: 'var(--amber,#f6a623)', keep: 'var(--green,#34c77b)' };
    const verdictBg    = { drop: 'rgba(224,85,85,.08)', review: 'rgba(246,166,35,.08)', keep: '' };

    // Flag badge HTML
    function flagBadge(active, label, title) {
      const style = active
        ? 'display:inline-block;padding:1px 5px;border-radius:3px;font-size:10px;font-weight:700;background:rgba(224,85,85,.18);color:var(--red,#e05555);margin-right:3px'
        : 'display:inline-block;padding:1px 5px;border-radius:3px;font-size:10px;color:var(--muted);margin-right:3px;opacity:.35';
      return `<span style="${style}" title="${title}">${label}</span>`;
    }

    // Sort: drop first, then review, then keep; within each group sort by MI rank
    const sorted = [...features].sort((a, b) => {
      const order = { drop: 0, review: 1, keep: 2 };
      if (order[a.verdict] !== order[b.verdict]) return order[a.verdict] - order[b.verdict];
      return (a.mi_rank || 999) - (b.mi_rank || 999);
    });

    // Threshold series warnings
    const tsHtml = (Array.isArray(tSeries) && tSeries.length)
      ? `<div style="margin-bottom:16px">
          ${tSeries.map((g) => `
            <div style="background:rgba(246,166,35,.1);border:1px solid rgba(246,166,35,.3);border-radius:6px;padding:10px 14px;margin-bottom:8px;font-size:0.83rem">
              <strong style="color:var(--amber,#f6a623)">Structural redundancy: ${g.group}</strong><br>
              <span style="color:var(--muted)">${g.note}</span><br>
              <span style="margin-top:4px;display:block">${g.features.map((k) => `<code style="background:var(--surface-2,#1e293b);padding:1px 5px;border-radius:3px;margin-right:4px;font-size:11px">${k}</code>`).join('')}</span>
            </div>
          `).join('')}
        </div>`
      : '';

    // Correlated pairs summary
    const corrFeatures = features.filter((f) => f.corr_pairs && f.corr_pairs.length && f.flags.high_correlation);
    const corrHtml = corrFeatures.length
      ? `<div style="margin-bottom:16px;background:rgba(79,142,247,.07);border:1px solid rgba(79,142,247,.2);border-radius:6px;padding:10px 14px;font-size:0.83rem">
          <strong style="color:var(--accent,#4f8ef7)">High correlations (|r| ≥ 0.85)</strong>
          <span style="color:var(--muted);margin-left:6px">Lower-MI member flagged — keeping both is redundant.</span>
          <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px">
            ${corrFeatures.map((f) => f.corr_pairs.filter((p) => (f.flags.high_correlation)).map((p) =>
              `<span style="background:var(--surface-2,#1e293b);padding:3px 8px;border-radius:4px;font-size:11px">
                <code>${f.key}</code> ↔ <code>${p.key}</code>
                <span style="color:var(--muted);margin-left:4px">r=${p.r}</span>
              </span>`
            ).join('')).join('')}
          </div>
        </div>`
      : '';

    // Summary bar
    const summaryHtml = `
      <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:14px;align-items:center">
        <span style="font-size:0.82rem;color:var(--muted)">${feature_count} features · ${total_labeled} labeled rows · λ=${summary.chosen_l1_lambda}</span>
        <span style="padding:3px 10px;border-radius:12px;font-size:0.8rem;font-weight:700;background:rgba(224,85,85,.15);color:var(--red,#e05555)">Drop candidates: ${summary.drop_count}</span>
        <span style="padding:3px 10px;border-radius:12px;font-size:0.8rem;font-weight:700;background:rgba(246,166,35,.15);color:var(--amber,#f6a623)">Review: ${summary.review_count}</span>
        <span style="padding:3px 10px;border-radius:12px;font-size:0.8rem;font-weight:700;background:rgba(52,199,123,.15);color:var(--green,#34c77b)">Keep: ${summary.keep_count}</span>
      </div>
      <div style="display:flex;gap:6px;margin-bottom:12px;font-size:0.78rem;color:var(--muted)">
        <span>Flags:&nbsp;</span>
        ${flagBadge(true, 'V', 'Near-zero variance')} near-zero variance &nbsp;
        ${flagBadge(true, 'M', 'Low mutual information')} low MI &nbsp;
        ${flagBadge(true, 'L', 'Lasso zeroed out')} Lasso=0 &nbsp;
        ${flagBadge(true, 'R', 'Low RF importance')} low RF &nbsp;
        ${flagBadge(true, 'C', 'High correlation (lower-MI member)')} correlated
      </div>`;

    // Feature table
    const tableHtml = `
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:0.82rem">
          <thead>
            <tr style="border-bottom:2px solid var(--border);text-align:left">
              <th style="padding:6px 8px;color:var(--muted);font-weight:600">Feature</th>
              <th style="padding:6px 8px;color:var(--muted);font-weight:600">Family</th>
              <th style="padding:6px 8px;color:var(--muted);font-weight:600;text-align:right">MI rank</th>
              <th style="padding:6px 8px;color:var(--muted);font-weight:600;text-align:right">MI</th>
              <th style="padding:6px 8px;color:var(--muted);font-weight:600;text-align:right">Lasso coef</th>
              <th style="padding:6px 8px;color:var(--muted);font-weight:600;text-align:right">RF imp</th>
              <th style="padding:6px 8px;color:var(--muted);font-weight:600">Flags</th>
              <th style="padding:6px 8px;color:var(--muted);font-weight:600">Verdict</th>
            </tr>
          </thead>
          <tbody>
            ${sorted.map((f) => {
              const bg = verdictBg[f.verdict] || '';
              const lassoDisplay = f.lasso_coef === null ? '—' : f.lasso_coef === 0 ? '<span style="color:var(--red,#e05555)">0</span>' : f.lasso_coef.toFixed(4);
              const rfDisplay = f.rf_importance === null ? '—' : f.rf_importance < 0.003 ? `<span style="color:var(--red,#e05555)">${f.rf_importance.toFixed(4)}</span>` : f.rf_importance.toFixed(4);
              const miDisplay = f.mi < 0.005 ? `<span style="color:var(--red,#e05555)">${f.mi.toFixed(4)}</span>` : f.mi.toFixed(4);
              return `<tr style="border-bottom:1px solid var(--border);background:${bg}">
                <td style="padding:5px 8px;font-weight:500"><code style="font-size:11px">${f.key}</code></td>
                <td style="padding:5px 8px;color:var(--muted);font-size:11px">${f.family}</td>
                <td style="padding:5px 8px;text-align:right;color:var(--muted)">#${f.mi_rank}</td>
                <td style="padding:5px 8px;text-align:right">${miDisplay}</td>
                <td style="padding:5px 8px;text-align:right">${lassoDisplay}</td>
                <td style="padding:5px 8px;text-align:right">${rfDisplay}</td>
                <td style="padding:5px 8px;white-space:nowrap">
                  ${flagBadge(f.flags.near_zero_variance, 'V', 'Near-zero variance')}
                  ${flagBadge(f.flags.low_mi,            'M', 'Low mutual information')}
                  ${flagBadge(f.flags.lasso_zeroed,      'L', 'Lasso zeroed out')}
                  ${flagBadge(f.flags.low_rf_importance, 'R', 'Low RF importance')}
                  ${flagBadge(f.flags.high_correlation,  'C', 'High correlation — lower-MI member')}
                </td>
                <td style="padding:5px 8px">
                  <span style="padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;background:${verdictBg[f.verdict]};color:${verdictColor[f.verdict]}">${f.verdict.toUpperCase()}</span>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;

    diagFsResult.className = 'table-shell';
    diagFsResult.innerHTML = summaryHtml + tsHtml + corrHtml + tableHtml;
  }

  if (diagFeatureSelectionButton) {
    diagFeatureSelectionButton.addEventListener('click', () => {
      const variantId = diagVariantId ? diagVariantId.value : '';
      if (!variantId) { setMessage(diagMessage, 'Select a model variant first.', true); return; }
      runElementAction(diagFeatureSelectionButton, async () => {
        setMessage(diagMessage, 'Analysing features — fitting Lasso + Random Forest on your labeled data…', false);
        if (diagFsResult) { diagFsResult.className = 'table-shell empty'; diagFsResult.textContent = 'Running…'; }
        const res = await fetchJson('/api/modeling/feature-selection', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            variantId,
            jobIds: diagJobIds ? diagJobIds.value.trim() : '',
          }),
        });
        const result = await resolveDiagResponse(res, 'features', (s) => setMessage(diagMessage, `Analysing features… (${s}s elapsed)`, false));
        setMessage(diagMessage, 'Feature analysis complete.', false);
        renderFeatureSelection(result);
      }).catch((err) => {
        setMessage(diagMessage, err.message || String(err), true);
        if (diagFsResult) { diagFsResult.className = 'table-shell empty'; diagFsResult.textContent = 'Feature analysis failed.'; }
      });
    });
  }

  renderTrainResult(null);
  renderImbalanceComparison(null);
  renderScoredJob(null);
  renderLiveProbe(null);
  updateImbalanceStrategyNote();
  updateDatasetDownloadLink();
  refreshPage().catch((error) => {
    setOverviewMessage(error.message || String(error), true);
  });
}());
