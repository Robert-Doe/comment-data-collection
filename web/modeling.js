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
  const overviewPollIntervalMs = 5000;
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
      ? `${resolvedTag ? `${resolvedTag} - ` : ''}${candidate.candidate_outer_html_length} chars`
      : '';
    const markupSections = [];
    if (candidate.candidate_outer_html_excerpt) {
      markupSections.push(renderCandidateMarkupSection('Rendered HTML', candidate.candidate_outer_html_excerpt, outerMeta));
    }

    const screenshotUrl = resolveAssetUrl(candidate.candidate_screenshot_url || '');
    const screenshotLink = screenshotUrl
      ? `<p class="candidate-copy"><strong>Screenshot:</strong> <a href="${escapeHtml(screenshotUrl)}" target="_blank" rel="noreferrer">Open screenshot</a></p>`
      : '';
    const content = markupSections.filter(Boolean).join('');
    const loadingCopy = candidate.candidate_markup_loading
      ? '<p class="candidate-copy"><strong>Markup:</strong> loading candidate HTML...</p>'
      : '';

    if (!content && !screenshotLink && !candidate.candidate_markup_error && !candidate.candidate_markup_loading) {
      return '';
    }

    return `
      <div class="candidate-markup-stack">
        ${loadingCopy}
        ${screenshotLink}
        ${content}
        ${candidate.candidate_markup_error
          ? `<p class="candidate-copy"><strong>Markup note:</strong> ${escapeHtml(candidate.candidate_markup_error)}</p>`
          : ''}
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

  function renderImbalanceComparison(result) {
    if (!imbalanceResults) return;
    const runs = result && Array.isArray(result.runs) ? result.runs : [];
    if (!runs.length) {
      imbalanceResults.className = 'model-card-grid empty';
      imbalanceResults.textContent = 'Run a comparison to see how imbalance strategies perform.';
      return;
    }

    const focusStrategy = String(result.focus_strategy || '').trim();
    const focusRun = runs.find((run) => run.strategy_id === focusStrategy) || runs[0] || null;
    const focusEvaluation = focusRun && focusRun.summary && focusRun.summary.evaluation
      ? (focusRun.summary.evaluation.test || focusRun.summary.evaluation.train || null)
      : null;
    const focusConfusion = focusEvaluation && focusEvaluation.candidate_metrics
      ? focusEvaluation.candidate_metrics.confusion
      : null;
    const leaderboard = result.leaderboard || {};
    const leaderboardRows = [
      leaderboard.precision ? `<div><strong>Precision:</strong> ${escapeHtml(leaderboard.precision.strategy.title || leaderboard.precision.strategy_id)} (${escapeHtml(formatMetric(leaderboard.precision.value))})</div>` : '',
      leaderboard.recall ? `<div><strong>Recall:</strong> ${escapeHtml(leaderboard.recall.strategy.title || leaderboard.recall.strategy_id)} (${escapeHtml(formatMetric(leaderboard.recall.value))})</div>` : '',
      leaderboard.f1 ? `<div><strong>F1:</strong> ${escapeHtml(leaderboard.f1.strategy.title || leaderboard.f1.strategy_id)} (${escapeHtml(formatMetric(leaderboard.f1.value))})</div>` : '',
      leaderboard.top_1_accuracy ? `<div><strong>Top-1:</strong> ${escapeHtml(leaderboard.top_1_accuracy.strategy.title || leaderboard.top_1_accuracy.strategy_id)} (${escapeHtml(formatMetric(leaderboard.top_1_accuracy.value))})</div>` : '',
    ].filter(Boolean);

    imbalanceResults.className = 'model-card-grid imbalance-comparison-grid';
    imbalanceResults.innerHTML = `
      <article class="model-card comparison-summary-card">
        <p class="eyebrow subtle">Imbalance Comparison</p>
        <h3>Metric Leaderboard</h3>
        <div class="summary tight-summary">
          ${leaderboardRows.join('')}
          <div><strong>Focus:</strong> ${escapeHtml((getImbalanceStrategyMeta(focusStrategy) || {}).title || focusStrategy || 'Baseline')}</div>
        </div>
        <p class="candidate-copy">Each run uses the same labeled dataset and the same model family. Only the in-memory balancing strategy changes.</p>
      </article>
      ${renderConfusionMatrixCard(focusConfusion, {
        eyebrow: 'Focus Strategy',
        title: `${(focusRun && focusRun.strategy && focusRun.strategy.title) || focusStrategy || 'Baseline'} Confusion Matrix`,
        emptyText: 'The selected strategy does not have a binary confusion matrix yet.',
        cardClass: 'comparison-confusion-card',
      })}
      <article class="model-card comparison-chart-card">
        <p class="eyebrow subtle">F1 Graph</p>
        <h3>Strategy Score Bars</h3>
        <div class="comparison-chart">
          ${runs.map((run) => {
            const metrics = run.summary && run.summary.evaluation ? (run.summary.evaluation.test || run.summary.evaluation.train || null) : null;
            const candidateMetrics = metrics && metrics.candidate_metrics ? metrics.candidate_metrics : null;
            const f1 = candidateMetrics ? Number(candidateMetrics.f1) : NaN;
            const tone = run.strategy_id === focusStrategy ? 'good' : 'plain';
            return `
              <div class="comparison-chart-row">
                <div class="comparison-chart-label">${escapeHtml(run.strategy.title || run.strategy_id)}</div>
                <div class="comparison-chart-track"><span class="comparison-chart-fill ${tone}" style="width:${Number.isFinite(f1) ? Math.max(0, Math.min(100, f1 * 100)) : 0}%"></span></div>
                <div class="comparison-chart-value">${escapeHtml(Number.isFinite(f1) ? formatMetric(f1) : '')}</div>
              </div>
            `;
          }).join('')}
        </div>
      </article>
      ${runs.map((run) => {
        const summary = run.summary || {};
        const counts = summary.training_counts || {};
        const imbalance = summary.imbalance_strategy || {};
        const evaluation = summary.evaluation && (summary.evaluation.test || summary.evaluation.train)
          ? (summary.evaluation.test || summary.evaluation.train)
          : null;
        const candidateMetrics = evaluation && evaluation.candidate_metrics ? evaluation.candidate_metrics : null;
        const rankingMetrics = evaluation && evaluation.ranking_metrics ? evaluation.ranking_metrics : null;
        const isFocus = run.strategy_id === focusStrategy;
        const originalCounts = imbalance.original_label_counts || counts.train_label_counts || {};
        const preparedCounts = imbalance.prepared_label_counts || counts.effective_train_label_counts || originalCounts;
        return `
          <article class="model-card ${isFocus ? 'is-focused' : ''}">
            <p class="eyebrow subtle">${escapeHtml(run.strategy.title || run.strategy_id)}</p>
            <h3>${escapeHtml(run.strategy.title || run.strategy_id)}</h3>
            <p class="candidate-copy">${escapeHtml(run.strategy.description || '')}</p>
            ${renderLabelBalanceDonut(preparedCounts, {
              centerTitle: `${preparedCounts.positive || 0}:${preparedCounts.negative || 0}`,
              centerLabel: 'prepared',
              title: run.strategy.title,
              subtitle: imbalance.balancing_mode ? `Mode: ${imbalance.balancing_mode}` : '',
            })}
            <div class="summary tight-summary">
              <div><strong>Original:</strong> ${escapeHtml(originalCounts.positive || 0)} / ${escapeHtml(originalCounts.negative || 0)}</div>
              <div><strong>Prepared:</strong> ${escapeHtml(preparedCounts.positive || 0)} / ${escapeHtml(preparedCounts.negative || 0)}</div>
              <div><strong>Rows:</strong> ${escapeHtml(imbalance.original_row_count || counts.train_rows || 0)} -> ${escapeHtml(imbalance.prepared_row_count || counts.effective_train_rows || counts.train_rows || 0)}</div>
              <div><strong>Fallback:</strong> ${escapeHtml(imbalance.fallback || 'none')}</div>
              <div><strong>Class Weighting:</strong> ${imbalance.class_weighting || imbalance.class_weighting_effective ? 'yes' : 'no'}</div>
              <div><strong>F1:</strong> ${escapeHtml(candidateMetrics ? formatMetric(candidateMetrics.f1) : '')}</div>
              <div><strong>Recall:</strong> ${escapeHtml(candidateMetrics ? formatMetric(candidateMetrics.recall) : '')}</div>
              <div><strong>Precision:</strong> ${escapeHtml(candidateMetrics ? formatMetric(candidateMetrics.precision) : '')}</div>
              <div><strong>Top-1:</strong> ${escapeHtml(rankingMetrics ? formatMetric(rankingMetrics.top_1_accuracy) : '')}</div>
            </div>
            <div class="metric-stack">
              ${renderMetricBar('F1', candidateMetrics ? Number(candidateMetrics.f1) : NaN, isFocus ? 'good' : 'plain')}
              ${renderMetricBar('Recall', candidateMetrics ? Number(candidateMetrics.recall) : NaN, 'good')}
              ${renderMetricBar('Precision', candidateMetrics ? Number(candidateMetrics.precision) : NaN, 'plain')}
              ${renderMetricBar('Top-1', rankingMetrics ? Number(rankingMetrics.top_1_accuracy) : NaN, 'muted')}
            </div>
          </article>
        `;
      }).join('')}
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
          <div><strong>Precision:</strong> ${escapeHtml(evaluation && evaluation.candidate_metrics ? formatMetric(evaluation.candidate_metrics.precision) : '')}</div>
          <div><strong>Recall:</strong> ${escapeHtml(evaluation && evaluation.candidate_metrics ? formatMetric(evaluation.candidate_metrics.recall) : '')}</div>
          <div><strong>F1:</strong> ${escapeHtml(evaluation && evaluation.candidate_metrics ? formatMetric(evaluation.candidate_metrics.f1) : '')}</div>
          <div><strong>Top-1 Accuracy:</strong> ${escapeHtml(evaluation && evaluation.ranking_metrics ? formatMetric(evaluation.ranking_metrics.top_1_accuracy) : '')}</div>
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
          <div><strong>Fallback:</strong> ${escapeHtml((imbalance && imbalance.fallback) || 'none')}</div>
          <div><strong>Class Weighting:</strong> ${imbalance && (imbalance.class_weighting || imbalance.class_weighting_effective) ? 'yes' : 'no'}</div>
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
    const summary = result && result.summary ? result.summary : null;
    const items = result && Array.isArray(result.items) ? result.items : [];
    const scan = result && result.scan ? result.scan : null;
    const artifact = result && result.artifact ? result.artifact : null;
    const item = items[0] || null;
    const candidates = item && Array.isArray(item.candidates) ? item.candidates.slice(0, 15) : [];
    const scanError = summary ? String(summary.scan_error || (scan && scan.error) || '') : '';
    const scanTimedOut = !!(scan && scan.timed_out) || /timed out/i.test(scanError);

    if (!summary) {
      liveProbeSummary.className = 'summary empty';
      liveProbeSummary.textContent = 'Run a live URL probe to see the page-level verdict.';
      liveProbeResults.className = 'table-shell empty';
      liveProbeResults.textContent = 'No probe results loaded.';
      return;
    }

    liveProbeSummary.className = 'summary';
    liveProbeSummary.innerHTML = [
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
    ].join('');

    if (!candidates.length) {
      liveProbeResults.className = 'table-shell empty';
      liveProbeResults.textContent = scanTimedOut
        ? 'The live scan timed out before it could score candidates.'
        : scanError
          ? 'The live scan failed before it could score candidates.'
          : 'The live scan returned no scored candidates.';
      return;
    }

    liveProbeResults.className = 'table-shell';
    liveProbeResults.innerHTML = `
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
                <td>${escapeHtml(index + 1)}</td>
                <td>${escapeHtml(formatMetric(candidate.probability))}</td>
                <td><span class="${candidate.predicted_label === 1 ? 'review-chip' : 'review-chip warn'}">${escapeHtml(candidate.human_label || predictedLabel)}</span></td>
                <td>${escapeHtml(candidate.repeating_group_count || candidate.min_k_count || candidate.unit_count || 0)}</td>
                <td>${escapeHtml(formatMetric(candidate.sibling_homogeneity_score || candidate.homogeneity || 0))}</td>
                <td class="mono">${escapeHtml(candidate.tag_name || candidate._root_tag || candidate.tag || '')}</td>
                <td>${escapeHtml((candidate.sample_text || '').slice(0, 140))}</td>
                <td>
                  <details class="score-details" data-score-detail="probe-${escapeHtml(candidate.candidate_key || candidate.xpath || index)}">
                    <summary>Inspect</summary>
                    <div class="score-details-body">
                      <div class="feature-chip-list">${signalBits || '<span class="candidate-copy model-card-empty">No explanation signals available.</span>'}</div>
                      ${renderCandidateMarkupDetails(candidate)}
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

  async function readSiteGroupText() {
    const typed = siteGroupText.value.trim();
    if (typed) return typed;
    if (siteGroupFile.files && siteGroupFile.files[0]) {
      return siteGroupFile.files[0].text();
    }
    return '';
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
    const button = event.target.closest('[data-use-model]');
    if (!button) return;
    const modelId = button.getAttribute('data-use-model');
    if (!modelId) return;
    scoreModelId.value = modelId;
    siteGroupModelId.value = modelId;
    liveProbeModelId.value = modelId;
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
