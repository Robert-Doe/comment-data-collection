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
  const labelSummaryShell = document.getElementById('label-summary-shell');
  const labelSummaryMessage = document.getElementById('label-summary-message');
  const labelSummaryActions = document.getElementById('label-summary-actions');
  const labelSummarySelectedTotals = document.getElementById('label-summary-selected-totals');
  const usePoolForTrainingButton = document.getElementById('use-pool-for-training');
  const refreshLabelSummaryButton = document.getElementById('refresh-label-summary');

  let currentLabelSummary = null;
  let currentModels = [];
  let currentVariants = [];
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

  function renderVariantCards(variants) {
    currentVariants = variants || [];
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

    slider.addEventListener('input', () => update(Number(slider.value)));
    if (jumpBtn) jumpBtn.addEventListener('click', () => { slider.value = bestIdx; update(bestIdx); });

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

  function renderModelList(models) {
    repopulateModelSelects(models);
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
            <th>Artifact</th>
            <th>Variant</th>
            <th>Algorithm</th>
            <th>Created</th>
            <th>Precision</th>
            <th>Recall</th>
            <th>F1</th>
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
            return `
              <tr>
                <td class="mono">${escapeHtml(model.id || '')}</td>
                <td>${escapeHtml(model.variant_title || model.variant_id || '')}</td>
                <td>${escapeHtml(formatAlgorithmName(model.algorithm))}</td>
                <td>${escapeHtml(model.created_at || '')}</td>
                <td>${escapeHtml(evaluation && evaluation.candidate_metrics ? formatMetric(evaluation.candidate_metrics.precision) : '')}</td>
                <td>${escapeHtml(evaluation && evaluation.candidate_metrics ? formatMetric(evaluation.candidate_metrics.recall) : '')}</td>
                <td>${escapeHtml(evaluation && evaluation.candidate_metrics ? formatMetric(evaluation.candidate_metrics.f1) : '')}</td>
                <td>${escapeHtml(evaluation && evaluation.ranking_metrics ? formatMetric(evaluation.ranking_metrics.top_1_accuracy) : '')}</td>
                <td>
                  <div class="action-stack">
                    <button class="secondary compact" type="button" data-use-model="${escapeHtml(model.id || '')}">Use</button>
                    <a class="link-button compact" href="${escapeHtml(runtimeModelUrl(model.id || ''))}">Runtime JSON</a>
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
    setMessage(trainMessage, `Training model using ${formatAlgorithmName(algorithm)} with ${strategyMeta.title}…`, false);
    const body = {
      variantId,
      jobIds: trainJobIds.value.trim(),
      algorithm,
      imbalanceStrategy,
    };
    const result = await fetchJson('/api/modeling/train', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    setMessage(trainMessage, `Saved model ${result.summary ? result.summary.id : ''}.`, false);
    renderTrainResult(result.model || null);
    await refreshPage();
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
    const result = await fetchJson('/api/modeling/compare-imbalance', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        variantId,
        jobIds: trainJobIds.value.trim(),
        algorithm,
        imbalanceStrategy,
      }),
    });
    setMessage(imbalanceMessage, 'Comparison ready.', false);
    renderImbalanceComparison(result);
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
