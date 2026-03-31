(function bootstrap() {
  const config = window.__APP_CONFIG__ || {};
  const apiBase = (config.apiBaseUrl || '').replace(/\/$/, '');

  const form = document.getElementById('upload-form');
  const fileInput = document.getElementById('csv-file');
  const urlColumnInput = document.getElementById('url-column');
  const scanDelayInput = document.getElementById('scan-delay-ms');
  const screenshotDelayInput = document.getElementById('screenshot-delay-ms');
  const formMessage = document.getElementById('form-message');
  const jobSummary = document.getElementById('job-summary');
  const jobEvents = document.getElementById('job-events');
  const jobItems = document.getElementById('job-items');
  const recentJobs = document.getElementById('recent-jobs');
  const refreshJobsButton = document.getElementById('refresh-jobs');
  const downloadReportXlsx = document.getElementById('download-report-xlsx');
  const downloadSummaryCsv = document.getElementById('download-summary-csv');
  const downloadFeaturesCsv = document.getElementById('download-features-csv');
  const downloadCandidatesCsv = document.getElementById('download-candidates-csv');
  const downloadCsv = document.getElementById('download-csv');
  const downloadJson = document.getElementById('download-json');
  const downloadSampleCsv = document.getElementById('download-sample-csv');
  const downloadExtensionZip = document.getElementById('download-extension-zip');
  const workspaceSelection = document.getElementById('workspace-selection');
  const workspaceTabs = Array.from(document.querySelectorAll('[data-workspace-tab]'));
  const workspacePanels = Array.from(document.querySelectorAll('[data-workspace-panel]'));

  const manualContext = document.getElementById('manual-context');
  const manualForm = document.getElementById('manual-upload-form');
  const manualJobId = document.getElementById('manual-job-id');
  const manualItemId = document.getElementById('manual-item-id');
  const manualCaptureUrl = document.getElementById('manual-capture-url');
  const manualCaptureTitle = document.getElementById('manual-capture-title');
  const manualNotes = document.getElementById('manual-notes');
  const manualHtmlFile = document.getElementById('manual-html-file');
  const manualScreenshotFile = document.getElementById('manual-screenshot-file');
  const manualMessage = document.getElementById('manual-message');
  const manualCopyConfigButton = document.getElementById('manual-copy-config');
  const candidateReview = document.getElementById('candidate-review');
  const candidateMessage = document.getElementById('candidate-message');
  const scoringBreakdown = document.getElementById('scoring-breakdown');
  const viewSvgGraphLink = document.getElementById('view-svg-graph');
  const downloadSvgGraphLink = document.getElementById('download-svg-graph');
  const downloadDotGraphLink = document.getElementById('download-dot-graph');
  const downloadCandidateJsonButton = document.getElementById('download-candidate-json');
  const downloadCandidateCsvButton = document.getElementById('download-candidate-csv');
  const managerSelection = document.getElementById('manager-selection');
  const managerForm = document.getElementById('manager-replace-form');
  const managerJobId = document.getElementById('manager-job-id');
  const managerSourceColumn = document.getElementById('manager-source-column');
  const managerScanDelayInput = document.getElementById('manager-scan-delay-ms');
  const managerScreenshotDelayInput = document.getElementById('manager-screenshot-delay-ms');
  const managerReplaceFile = document.getElementById('manager-replace-file');
  const managerMessage = document.getElementById('manager-message');
  const managerResumeButton = document.getElementById('manager-resume-job');
  const managerRestartButton = document.getElementById('manager-restart-job');
  const managerDeleteButton = document.getElementById('manager-delete-job');
  const managerClearJobsButton = document.getElementById('manager-clear-jobs');
  const confirmDialog = document.getElementById('confirm-dialog');
  const confirmTitle = document.getElementById('confirm-title');
  const confirmDescription = document.getElementById('confirm-description');
  const confirmAccept = document.getElementById('confirm-accept');
  const toastStack = document.getElementById('toast-stack');

  let currentJobId = new URLSearchParams(window.location.search).get('jobId') || '';
  let currentJob = null;
  let currentOffset = 0;
  let selectedManualItemId = '';
  let activeWorkspaceTab = 'queue';
  let currentCandidatePage = 0;
  let currentItemsById = new Map();
  let managerFormJobId = '';
  let confirmResolver = null;
  const pageSize = 50;
  const candidatePageSize = 1;
  const activePollIntervalMs = 4000;
  const terminalPollIntervalMs = 12000;
  const actionStateDurationMs = 1400;
  let pollHandle = null;
  let pollJobId = '';
  let pollIntervalMs = 0;
  const candidateMarkupCache = new Map();
  const candidateMarkupPending = new Set();
  const scoreDetailOpenState = new Set();

  function apiUrl(path) {
    return `${apiBase}${path}`;
  }

  function absoluteApiBase() {
    return apiBase || window.location.origin;
  }

  function stopPolling() {
    if (pollHandle) {
      clearInterval(pollHandle);
    }
    pollHandle = null;
    pollJobId = '';
    pollIntervalMs = 0;
  }

  function startPolling(jobId, intervalMs) {
    if (!jobId) {
      stopPolling();
      return;
    }
    if (pollHandle && pollJobId === jobId && pollIntervalMs === intervalMs) {
      return;
    }
    stopPolling();
    pollJobId = jobId;
    pollIntervalMs = intervalMs;
    pollHandle = setInterval(() => {
      refreshJob(jobId).catch((error) => {
        console.error(error);
      });
    }, intervalMs);
  }

  function pollIntervalForStatus(status) {
    return ['completed', 'completed_with_errors', 'failed'].includes(status)
      ? terminalPollIntervalMs
      : activePollIntervalMs;
  }

  function setResourceDownloads() {
    downloadSampleCsv.href = apiUrl('/api/downloads/sample-sites-labeled.csv');
    downloadExtensionZip.href = apiUrl('/api/downloads/extension.zip');
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

  async function copyText(value) {
    const text = String(value ?? '');
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function' && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const input = document.createElement('textarea');
    input.value = text;
    input.setAttribute('readonly', 'readonly');
    input.style.position = 'fixed';
    input.style.top = '-9999px';
    input.style.left = '-9999px';
    document.body.appendChild(input);
    input.focus();
    input.select();

    let copied = false;
    try {
      copied = document.execCommand('copy');
    } finally {
      input.remove();
    }

    if (!copied) {
      throw new Error('Copy failed. Use HTTPS or copy the text manually.');
    }
  }

  function setMessage(text, isError) {
    formMessage.textContent = text || '';
    formMessage.className = isError ? 'message error' : 'message';
  }

  function setManualMessage(text, isError) {
    manualMessage.textContent = text || '';
    manualMessage.className = isError ? 'message error' : 'message';
  }

  function setCandidateMessage(text, isError) {
    candidateMessage.textContent = text || '';
    candidateMessage.className = isError ? 'message error' : 'message';
  }

  function setManagerMessage(text, isError) {
    managerMessage.textContent = text || '';
    managerMessage.className = isError ? 'message error' : 'message';
  }

  function showToast(text, options = {}) {
    if (!toastStack || !text) return;
    const tone = options.tone || 'info';
    const timeoutMs = Math.max(1800, Number(options.timeoutMs) || (tone === 'error' ? 5200 : 3200));
    const toast = document.createElement('div');
    const copy = document.createElement('div');
    toast.className = `toast toast-${tone}`;
    toast.setAttribute('role', tone === 'error' ? 'alert' : 'status');
    copy.className = 'toast-copy';
    copy.textContent = text;
    toast.appendChild(copy);
    toastStack.appendChild(toast);

    const dismiss = () => {
      toast.classList.remove('visible');
      toast.classList.add('leaving');
      window.setTimeout(() => {
        toast.remove();
      }, 220);
    };

    requestAnimationFrame(() => {
      toast.classList.add('visible');
    });
    const timer = window.setTimeout(dismiss, timeoutMs);
    toast.addEventListener('click', () => {
      window.clearTimeout(timer);
      dismiss();
    }, { once: true });
  }

  function setBusyState(element, busy) {
    if (!element) return;

    if (busy) {
      element.dataset.busy = 'true';
      if ('disabled' in element) {
        element.dataset.wasDisabled = element.disabled ? 'true' : 'false';
        element.disabled = true;
      } else {
        element.dataset.hadDisabledClass = element.classList.contains('disabled') ? 'true' : 'false';
      }
      return;
    }

    delete element.dataset.busy;
    if ('disabled' in element) {
      if (element.dataset.wasDisabled !== 'true') {
        element.disabled = false;
      }
      delete element.dataset.wasDisabled;
    } else {
      delete element.dataset.hadDisabledClass;
    }
  }

  function flashActionState(element, state) {
    if (!element) return;
    const attribute = state === 'error' ? 'error' : 'success';
    element.dataset[attribute] = 'true';
    window.setTimeout(() => {
      delete element.dataset[attribute];
    }, actionStateDurationMs);
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

  function confirmAction(options = {}) {
    const title = options.title || 'Confirm action';
    const description = options.description || '';
    const acceptLabel = options.acceptLabel || 'Continue';
    const danger = options.danger !== false;

    if (!confirmDialog || typeof confirmDialog.showModal !== 'function') {
      return Promise.resolve(window.confirm(description || title));
    }

    if (confirmResolver) {
      confirmResolver(false);
      confirmResolver = null;
    }

    confirmTitle.textContent = title;
    confirmDescription.textContent = description;
    confirmAccept.textContent = acceptLabel;
    confirmAccept.classList.toggle('danger-button', danger);
    confirmDialog.returnValue = 'cancel';
    confirmDialog.showModal();

    return new Promise((resolve) => {
      confirmResolver = resolve;
    });
  }

  function canResumeJob(job) {
    if (!job) return false;
    return (Number(job.pending_count) || 0) > 0
      || (Number(job.queued_count) || 0) > 0
      || (Number(job.running_count) || 0) > 0;
  }

  function resetCurrentJobSelection(options = {}) {
    currentJob = null;
    currentJobId = '';
    currentOffset = 0;
    selectedManualItemId = '';
    currentItemsById = new Map();
    managerFormJobId = '';
    stopPolling();
    window.history.replaceState({}, '', window.location.pathname);
    renderSummary(null);
    renderItems([], null);
    renderWorkspaceSelection(null);
    renderCandidateReview(null);
    renderScoringBreakdown(null);
    renderJobEvents([], { message: options.eventsMessage || 'Select a job to view recent events.' });
    renderJobManager(null);
    setDownloads('');
    setMessage(options.formMessage || '', false);
    setManualMessage('', false);
    setCandidateMessage('', false);
    setManagerMessage(options.managerMessage || '', false);
  }

  function selectedItem() {
    return selectedManualItemId ? (currentItemsById.get(selectedManualItemId) || null) : null;
  }

  function setCandidateExportState(item) {
    const hasCandidates = !!(item && Array.isArray(item.candidates) && item.candidates.length);
    const jobId = currentJobId || (item && item.job_id) || '';
    const hasSnapshot = !!(item && jobId && item.id && (item.manual_html_url || item.manual_raw_html_url));
    const svgViewHref = hasSnapshot ? apiUrl(`/api/jobs/${jobId}/items/${item.id}/graph.svg`) : '#';
    const svgDownloadHref = hasSnapshot ? apiUrl(`/api/jobs/${jobId}/items/${item.id}/graph.svg?download=1`) : '#';
    const dotHref = hasSnapshot ? apiUrl(`/api/jobs/${jobId}/items/${item.id}/graph.dot`) : '#';
    downloadCandidateJsonButton.disabled = !hasCandidates;
    downloadCandidateCsvButton.disabled = !hasCandidates;
    viewSvgGraphLink.classList.toggle('disabled', !hasSnapshot);
    viewSvgGraphLink.href = svgViewHref;
    viewSvgGraphLink.title = hasSnapshot
      ? 'Open the rendered SVG graph in a new tab.'
      : 'SVG export requires a stored HTML snapshot.';
    downloadSvgGraphLink.classList.toggle('disabled', !hasSnapshot);
    downloadSvgGraphLink.href = svgDownloadHref;
    downloadSvgGraphLink.title = hasSnapshot
      ? 'Download the rendered SVG graph.'
      : 'SVG export requires a stored HTML snapshot.';
    downloadDotGraphLink.classList.toggle('disabled', !hasSnapshot);
    downloadDotGraphLink.href = dotHref;
    downloadDotGraphLink.title = hasSnapshot
      ? 'Download the Graphviz DOT tree for this stored HTML snapshot.'
      : 'DOT export requires a stored HTML snapshot.';
  }

  function setWorkspaceTab(tabId) {
    activeWorkspaceTab = tabId || 'queue';
    workspaceTabs.forEach((button) => {
      const isActive = button.getAttribute('data-workspace-tab') === activeWorkspaceTab;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    workspacePanels.forEach((panel) => {
      const isActive = panel.getAttribute('data-workspace-panel') === activeWorkspaceTab;
      panel.classList.toggle('active', isActive);
    });
  }

  function applyScoreDetailState() {
    scoringBreakdown.querySelectorAll('details[data-score-detail]').forEach((details) => {
      const key = details.getAttribute('data-score-detail');
      details.open = !!(key && scoreDetailOpenState.has(key));
    });
  }

  function setDownloads(jobId) {
    if (!jobId) {
      downloadReportXlsx.classList.add('disabled');
      downloadReportXlsx.href = '#';
      downloadSummaryCsv.classList.add('disabled');
      downloadSummaryCsv.href = '#';
      downloadFeaturesCsv.classList.add('disabled');
      downloadFeaturesCsv.href = '#';
      downloadCandidatesCsv.classList.add('disabled');
      downloadCandidatesCsv.href = '#';
      downloadCsv.classList.add('disabled');
      downloadJson.classList.add('disabled');
      downloadCsv.href = '#';
      downloadJson.href = '#';
      return;
    }

    downloadReportXlsx.classList.remove('disabled');
    downloadSummaryCsv.classList.remove('disabled');
    downloadFeaturesCsv.classList.remove('disabled');
    downloadCandidatesCsv.classList.remove('disabled');
    downloadCsv.classList.remove('disabled');
    downloadJson.classList.remove('disabled');
    downloadReportXlsx.href = apiUrl(`/api/jobs/${jobId}/report.xlsx`);
    downloadSummaryCsv.href = apiUrl(`/api/jobs/${jobId}/summary.csv`);
    downloadFeaturesCsv.href = apiUrl(`/api/jobs/${jobId}/features.csv`);
    downloadCandidatesCsv.href = apiUrl(`/api/jobs/${jobId}/candidates.csv`);
    downloadCsv.href = apiUrl(`/api/jobs/${jobId}/download.csv`);
    downloadJson.href = apiUrl(`/api/jobs/${jobId}/results`);
  }

  function renderSummary(job) {
    if (!job) {
      jobSummary.className = 'summary empty';
      jobSummary.textContent = 'No job selected.';
      return;
    }

    jobSummary.className = 'summary';
    jobSummary.innerHTML = [
      `<div><strong>Job:</strong> ${escapeHtml(job.id)}</div>`,
      `<div><strong>Status:</strong> ${escapeHtml(job.status)}</div>`,
      `<div><strong>Pending:</strong> ${escapeHtml(job.pending_count)}</div>`,
      `<div><strong>Queued:</strong> ${escapeHtml(job.queued_count)}</div>`,
      `<div><strong>Running:</strong> ${escapeHtml(job.running_count)}</div>`,
      `<div><strong>Completed:</strong> ${escapeHtml(job.completed_count)}</div>`,
      `<div><strong>Failed:</strong> ${escapeHtml(job.failed_count)}</div>`,
      `<div><strong>Detected:</strong> ${escapeHtml(job.detected_count)}</div>`,
      `<div><strong>Total:</strong> ${escapeHtml(job.total_urls)}</div>`,
      `<div><strong>Scan Delay:</strong> ${escapeHtml(job.scan_delay_ms ?? '')} ms</div>`,
      `<div><strong>Screenshot Delay:</strong> ${escapeHtml(job.screenshot_delay_ms ?? '')} ms</div>`,
    ].join('');
  }

  function formatEventTimestamp(value) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return '';
    }
    return parsed.toLocaleString();
  }

  function renderJobEvents(events, options = {}) {
    const message = options.message || (currentJobId ? 'No events recorded yet for this job.' : 'Select a job to view recent events.');
    if (!events || !events.length) {
      jobEvents.className = options.isError ? 'event-list empty error' : 'event-list empty';
      jobEvents.textContent = message;
      return;
    }

    const rows = events.map((event) => {
      const level = String(event.level || 'info').toLowerCase();
      const scope = String(event.scope || 'job').replace(/_/g, ' ');
      const detailBits = [];
      if (event.row_number) {
        detailBits.push(`row ${event.row_number}`);
      }
      if (event.details && event.details.normalized_url) {
        detailBits.push(String(event.details.normalized_url));
      }
      if (event.details && event.details.manual_capture_url) {
        detailBits.push(String(event.details.manual_capture_url));
      }
      if (event.details && Number.isFinite(Number(event.details.max_attempts))) {
        detailBits.push(`max attempts ${event.details.max_attempts}`);
      }
      return `
        <article class="event-item level-${escapeHtml(level)}">
          <div class="event-item-top">
            <div class="event-badges">
              <span class="event-level ${escapeHtml(level)}">${escapeHtml(level)}</span>
              <span class="event-scope">${escapeHtml(scope)}</span>
              ${event.event_type ? `<span class="event-type mono">${escapeHtml(event.event_type)}</span>` : ''}
            </div>
            <time class="event-time" datetime="${escapeHtml(event.created_at || '')}">${escapeHtml(formatEventTimestamp(event.created_at))}</time>
          </div>
          <div class="event-message">${escapeHtml(event.message || '')}</div>
          ${detailBits.length ? `<div class="event-meta">${escapeHtml(detailBits.join(' | '))}</div>` : ''}
        </article>
      `;
    }).join('');

    jobEvents.className = 'event-list';
    jobEvents.innerHTML = rows;
  }

  function reviewChip(item) {
    const chips = [];
    const candidateCount = Array.isArray(item.candidates) ? item.candidates.length : 0;
    const reviewSummary = item.candidate_review_summary || {};
    const reviewedCount = Number(reviewSummary.total || 0);

    if (item.analysis_source === 'manual_snapshot') {
      chips.push('<span class="review-chip">manual snapshot</span>');
    }

    if (item.manual_capture_required) {
      const title = escapeHtml(item.manual_capture_reason || 'Manual review recommended');
      chips.push(`<span class="review-chip warn" title="${title}">needs manual</span>`);
    }

    if (candidateCount > 0 && reviewedCount === 0) {
      chips.push('<span class="review-chip warn">needs labels</span>');
    } else if (candidateCount > 0 && reviewedCount > 0) {
      chips.push(`<span class="review-chip">reviewed ${escapeHtml(reviewedCount)}/${escapeHtml(candidateCount)}</span>`);
    }

    return chips.join(' ');
  }

  function renderManualArtifactLinks(item, emptyText = '') {
    if (!item) return emptyText;

    const links = [];
    const hasSeparateUploadedScreenshot = !!item.manual_uploaded_screenshot_url;

    if (item.manual_uploaded_screenshot_url) {
      links.push(`<a class="link-button compact" href="${escapeHtml(resolveAssetUrl(item.manual_uploaded_screenshot_url))}" target="_blank" rel="noreferrer">Uploaded Screenshot</a>`);
    }
    if (item.screenshot_url) {
      const screenshotLabel = item.analysis_source === 'manual_snapshot'
        ? (hasSeparateUploadedScreenshot ? 'Rendered Snapshot' : 'Screenshot')
        : 'Screenshot';
      links.push(`<a class="link-button compact" href="${escapeHtml(resolveAssetUrl(item.screenshot_url))}" target="_blank" rel="noreferrer">${screenshotLabel}</a>`);
    }
    if (item.manual_html_url) {
      links.push(`<a class="link-button compact" href="${escapeHtml(resolveAssetUrl(item.manual_html_url))}" target="_blank" rel="noreferrer">Styled Snapshot HTML</a>`);
    }
    if (item.manual_raw_html_url) {
      links.push(`<a class="link-button compact" href="${escapeHtml(resolveAssetUrl(item.manual_raw_html_url))}" target="_blank" rel="noreferrer">Raw DOM HTML</a>`);
    }

    if (!links.length) {
      return emptyText;
    }

    return `<div class="action-stack">${links.join('')}</div>`;
  }

  function renderCandidateScreenshotFallback(candidate, heading) {
    const previewText = escapeHtml(candidate && candidate.sample_text
      ? candidate.sample_text
      : 'No sample text is available for this candidate.');
    const errorText = escapeHtml(candidate && candidate.candidate_screenshot_error
      ? candidate.candidate_screenshot_error
      : 'Candidate screenshot was not captured for this candidate.');
    return `
      <div class="candidate-shot-fallback">
        <strong>${escapeHtml(heading || 'Text Preview')}</strong>
        <span>${previewText}</span>
        <small>${errorText}</small>
      </div>
    `;
  }

  function renderCandidateVisual(candidate, options = {}) {
    const assetUrl = candidate && candidate.candidate_screenshot_url
      ? resolveAssetUrl(candidate.candidate_screenshot_url)
      : '';
    const imageClass = escapeHtml(options.imageClass || 'candidate-shot');
    if (assetUrl) {
      const linkClass = options.linkClass ? ` class="${escapeHtml(options.linkClass)}"` : '';
      return `
        <a${linkClass} href="${escapeHtml(assetUrl)}" target="_blank" rel="noreferrer">
          <img class="${imageClass}" src="${escapeHtml(assetUrl)}" alt="Candidate ${escapeHtml(candidate && candidate.candidate_rank)} screenshot">
        </a>
      `;
    }
    return `
      <div class="${imageClass} empty">
        ${renderCandidateScreenshotFallback(candidate, options.fallbackHeading || 'Text Preview')}
      </div>
    `;
  }

  function buildMarkupPreviewDocument(value, mode) {
    const content = mode === 'inner'
      ? `<section class="preview-shell">${value}</section>`
      : value;
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
  <body>${value ? content : '<div></div>'}</body>
</html>`;
  }

  function renderCandidateMarkupSection(label, value, meta, mode) {
    if (!value) return '';
    const previewDocument = buildMarkupPreviewDocument(value, mode);
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
    const markupSections = [];
    const resolvedTag = candidate.candidate_resolved_tag_name ? `${candidate.candidate_resolved_tag_name}` : '';
    const outerMeta = candidate.candidate_outer_html_length
      ? `${resolvedTag ? `${resolvedTag} · ` : ''}${candidate.candidate_outer_html_length} chars${candidate.candidate_outer_html_truncated ? ' · truncated' : ''}`
      : '';
    const innerMeta = candidate.candidate_inner_html_length
      ? `${candidate.candidate_inner_html_length} chars${candidate.candidate_inner_html_truncated ? ' · truncated' : ''}`
      : '';

    markupSections.push(renderCandidateMarkupSection('Outer HTML', candidate.candidate_outer_html_excerpt || '', outerMeta, 'outer'));
    markupSections.push(renderCandidateMarkupSection('Inner HTML', candidate.candidate_inner_html_excerpt || '', innerMeta, 'inner'));

    const content = markupSections.filter(Boolean).join('');
    const loadingCopy = candidate.candidate_markup_loading
      ? '<p class="candidate-copy"><strong>Markup:</strong> loading stored candidate HTML...</p>'
      : '';

    if (!content && !candidate.candidate_markup_error && !candidate.candidate_markup_loading) {
      return '';
    }

    return `
      <div class="candidate-markup-stack">
        ${loadingCopy}
        ${content}
        ${candidate.candidate_markup_error
          ? `<p class="candidate-copy"><strong>Markup note:</strong> ${escapeHtml(candidate.candidate_markup_error)}</p>`
          : ''}
      </div>
    `;
  }

  function candidateMarkupCacheKey(item, candidate) {
    const jobId = currentJobId || (item && item.job_id) || '';
    const itemId = item && item.id ? item.id : '';
    const candidateKey = candidate && candidate.candidate_key ? candidate.candidate_key : '';
    return `${jobId}:${itemId}:${candidateKey}`;
  }

  function mergeCandidateMarkup(item, candidate) {
    if (!candidate) return candidate;
    const cached = candidateMarkupCache.get(candidateMarkupCacheKey(item, candidate));
    return cached ? { ...candidate, ...cached } : candidate;
  }

  function candidateHasMarkup(candidate) {
    return !!(candidate && (
      candidate.candidate_outer_html_excerpt
      || candidate.candidate_inner_html_excerpt
      || candidate.candidate_markup_error
      || candidate.candidate_markup_loading
    ));
  }

  async function ensureCandidateMarkup(item, candidate) {
    if (!item || !candidate || candidateHasMarkup(candidate)) return;
    const cacheKey = candidateMarkupCacheKey(item, candidate);
    if (!cacheKey || candidateMarkupPending.has(cacheKey)) return;

    candidateMarkupPending.add(cacheKey);
    candidateMarkupCache.set(cacheKey, { candidate_markup_loading: true });
    const selected = selectedItem();
    if (selected && selected.id === item.id) {
      renderCandidateReview(selected);
      renderScoringBreakdown(selected);
    }

    try {
      const response = await fetchJson(`/api/jobs/${currentJobId || item.job_id}/items/${item.id}/candidates/${candidate.candidate_key}/markup`);
      candidateMarkupCache.set(cacheKey, {
        ...(response && response.markup ? response.markup : {}),
        candidate_markup_loading: false,
      });
    } catch (error) {
      candidateMarkupCache.set(cacheKey, {
        candidate_markup_loading: false,
        candidate_markup_error: error && error.message ? error.message : String(error),
      });
    } finally {
      candidateMarkupPending.delete(cacheKey);
      const selectedCurrent = selectedItem();
      if (selectedCurrent && selectedCurrent.id === item.id) {
        renderCandidateReview(selectedCurrent);
        renderScoringBreakdown(selectedCurrent);
      }
    }
  }

  function humanLabelText(label) {
    if (label === 'comment_region') return 'human: comment region';
    if (label === 'not_comment_region') return 'human: not comment';
    if (label === 'uncertain') return 'human: uncertain';
    return '';
  }

  function humanLabelClass(label) {
    if (label === 'comment_region') return 'good';
    if (label === 'not_comment_region') return 'bad';
    if (label === 'uncertain') return 'warn';
    return '';
  }

  function preferredReviewTab(item) {
    return item && Array.isArray(item.candidates) && item.candidates.length ? 'candidates' : 'manual';
  }

  function renderWorkspaceSelection(item) {
    if (!item) {
      workspaceSelection.className = 'workspace-selection empty';
      workspaceSelection.textContent = 'Select a row from the table to open the manual or candidate review workspace.';
      return;
    }

    const reviewSummary = item.candidate_review_summary || {};
    const scanResult = item.scan_result || {};
    workspaceSelection.className = 'workspace-selection';
    workspaceSelection.innerHTML = [
      `<div><strong>Row:</strong> ${escapeHtml(item.row_number)}</div>`,
      `<div><strong>Source:</strong> ${escapeHtml(item.analysis_source || 'automated')}</div>`,
      `<div><strong>UGC:</strong> ${item.ugc_detected ? 'yes' : 'no'}</div>`,
      `<div><strong>Candidates:</strong> ${escapeHtml(Array.isArray(item.candidates) ? item.candidates.length : 0)}</div>`,
      `<div><strong>Reviewed:</strong> ${escapeHtml(reviewSummary.total ?? 0)}</div>`,
      `<div><strong>Access Flag:</strong> ${escapeHtml(scanResult.blocker_type || 'clear')}</div>`,
      `<div><strong>Reason:</strong> ${escapeHtml(item.manual_capture_reason || item.error_message || '')}</div>`,
      `<div><strong>URL:</strong> ${escapeHtml(item.final_url || item.normalized_url || '')}</div>`,
    ].join('');
  }

  function renderSignalList(signals, className) {
    const values = Array.isArray(signals) ? signals.filter(Boolean).slice(0, 10) : [];
    if (!values.length) return '';
    return `
      <div class="candidate-signal-list">
        ${values.map((signal) => `<span class="candidate-signal ${className}">${escapeHtml(signal)}</span>`).join('')}
      </div>
    `;
  }

  function renderFeatureList(entries, className, emptyText) {
    if (!entries.length) {
      return `<p class="candidate-copy">${escapeHtml(emptyText)}</p>`;
    }
    return `
      <div class="feature-chip-list">
        ${entries.map(([key, value]) => `
          <span class="feature-chip ${className}">
            <strong>${escapeHtml(key)}</strong>
            <span>${escapeHtml(value)}</span>
          </span>
        `).join('')}
      </div>
    `;
  }

  function humanizeFeatureName(key) {
    const acronyms = new Map([
      ['aria', 'ARIA'],
      ['css', 'CSS'],
      ['csrf', 'CSRF'],
      ['html', 'HTML'],
      ['id', 'ID'],
      ['json', 'JSON'],
      ['ld', 'LD'],
      ['og', 'OG'],
      ['sig', 'SIG'],
      ['ugc', 'UGC'],
      ['ui', 'UI'],
      ['url', 'URL'],
      ['xpath', 'XPath'],
    ]);
    return String(key || '')
      .split('_')
      .filter(Boolean)
      .map((part) => {
        const lower = part.toLowerCase();
        if (acronyms.has(lower)) return acronyms.get(lower);
        if (/^\d+$/.test(part)) return part;
        return lower.charAt(0).toUpperCase() + lower.slice(1);
      })
      .join(' ');
  }

  function formatMetricValue(value) {
    if (value === null || value === undefined || value === '') return '';
    if (Array.isArray(value)) return value.join(', ');
    if (typeof value === 'number' && Number.isFinite(value)) {
      if (Number.isInteger(value)) return String(value);
      return String(Math.round(value * 1000) / 1000);
    }
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    return String(value);
  }

  function renderMetricList(rows, emptyText) {
    const filtered = (rows || []).filter(([, value]) => value !== null && value !== undefined && value !== '');
    if (!filtered.length) {
      return `<p class="candidate-copy">${escapeHtml(emptyText)}</p>`;
    }
    return `
      <div class="score-metric-list">
        ${filtered.map(([label, value]) => `
          <div class="score-metric-row">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(formatMetricValue(value))}</strong>
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderScoreStat(label, value, tone) {
    return `
      <article class="score-stat ${tone || ''}">
        <span class="score-stat-label">${escapeHtml(label)}</span>
        <strong class="score-stat-value">${escapeHtml(formatMetricValue(value))}</strong>
      </article>
    `;
  }

  function truncateMetricText(value, maxLength) {
    const text = String(value || '').trim();
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength - 1).trimEnd()}...`;
  }

  function toFileSafeSegment(value, fallback) {
    const cleaned = String(value || '')
      .replace(/[^a-z0-9._-]+/gi, '-')
      .replace(/^-+|-+$/g, '');
    return cleaned || fallback;
  }

  function triggerDownload(filename, content, type) {
    const blob = new Blob([content], { type });
    triggerBlobDownload(filename, blob);
  }

  function triggerBlobDownload(filename, blob) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function extractFilenameFromDisposition(disposition, fallbackFilename) {
    const value = String(disposition || '');
    const utf8Match = value.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match && utf8Match[1]) {
      try {
        return decodeURIComponent(utf8Match[1].trim());
      } catch (_) {
        return utf8Match[1].trim();
      }
    }

    const plainMatch = value.match(/filename="?([^"]+)"?/i);
    if (plainMatch && plainMatch[1]) {
      return plainMatch[1].trim();
    }

    return fallbackFilename;
  }

  function buildGraphDownloadFilename(item, extension) {
    const rowSegment = toFileSafeSegment(item && item.row_number, 'item');
    const urlSource = item && (item.final_url || item.manual_capture_url || item.normalized_url || '');
    let hostSegment = 'graph';
    try {
      hostSegment = toFileSafeSegment(new URL(urlSource).hostname, 'graph');
    } catch (_) {
      hostSegment = toFileSafeSegment(urlSource, 'graph');
    }
    return `${hostSegment}-${rowSegment}.${extension}`;
  }

  async function downloadRemoteFile(url, fallbackFilename) {
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'omit',
    });
    if (!response.ok) {
      throw new Error(`Download failed with status ${response.status}`);
    }

    const blob = await response.blob();
    const filename = extractFilenameFromDisposition(
      response.headers.get('Content-Disposition'),
      fallbackFilename,
    );
    triggerBlobDownload(filename, blob);
  }

  async function handleGraphDownload(event, link, extension, successText) {
    event.preventDefault();
    if (!link || link.classList.contains('disabled')) {
      return;
    }

    const href = String(link.getAttribute('href') || '').trim();
    if (!href || href === '#') {
      return;
    }

    const item = selectedItem();
    try {
      await runElementAction(link, () => downloadRemoteFile(href, buildGraphDownloadFilename(item, extension)));
      setCandidateMessage(successText, false);
      showToast(successText, { tone: 'success' });
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      setCandidateMessage(message, true);
      showToast(message, { tone: 'error' });
    }
  }

  function normalizeCandidateExportValue(value) {
    if (value === null || value === undefined) return '';
    if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
      return JSON.stringify(value);
    }
    return String(value);
  }

  function escapeCsv(value) {
    const text = String(value ?? '');
    if (/[",\n]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }

  function preferredCandidateHeaders(candidates) {
    const preferred = [
      'candidate_rank',
      'candidate_key',
      'detected',
      'score',
      'confidence',
      'base_detected',
      'acceptance_gate_passed',
      'keyword_gate_tier',
      'keyword_evidence_strength',
      'keyword_evidence_present',
      'keyword_evidence_signals',
      'explicit_keyword_signal_count',
      'supporting_keyword_signal_count',
      'strong_keyword_signal_count',
      'medium_keyword_signal_count',
      'semantic_support_count',
      'structural_support_count',
      'interaction_support_count',
      'repeated_structure_support',
      'high_assurance_without_keywords',
      'acceptance_gate_reason',
      'ugc_type',
      'xpath',
      'css_path',
      'wildcard_xpath_template',
      'unit_count',
      'sample_text',
      'matched_signals',
      'penalty_signals',
      'candidate_screenshot_url',
      'candidate_outer_html_excerpt',
      'candidate_outer_html_length',
      'candidate_outer_html_truncated',
      'candidate_inner_html_excerpt',
      'candidate_inner_html_length',
      'candidate_inner_html_truncated',
      'candidate_text_excerpt',
      'candidate_markup_error',
      'candidate_resolved_tag_name',
      'human_label',
      'human_notes',
      'human_reviewed_at',
      'frame_url',
      'frame_key',
    ];
    const allKeys = new Set();
    (candidates || []).forEach((candidate) => {
      Object.keys(candidate || {}).forEach((key) => allKeys.add(key));
    });
    const ordered = preferred.filter((key) => allKeys.has(key));
    Array.from(allKeys)
      .filter((key) => !ordered.includes(key))
      .sort()
      .forEach((key) => ordered.push(key));
    return ordered;
  }

  function downloadCandidateJson(item) {
    if (!item || !Array.isArray(item.candidates) || !item.candidates.length) return;
    const payload = {
      job_id: item.job_id || currentJobId || '',
      item_id: item.id || '',
      row_number: item.row_number,
      normalized_url: item.normalized_url || '',
      final_url: item.final_url || '',
      analysis_source: item.analysis_source || '',
      ugc_detected: !!item.ugc_detected,
      candidate_review_summary: item.candidate_review_summary || {},
      candidates: item.candidates,
    };
    const fileBase = toFileSafeSegment(`${item.row_number || 'row'}-${item.id || 'item'}-candidates`, 'candidates');
    triggerDownload(`${fileBase}.json`, `${JSON.stringify(payload, null, 2)}\n`, 'application/json');
    setCandidateMessage('Candidate JSON downloaded.', false);
    flashActionState(downloadCandidateJsonButton, 'success');
    showToast('Candidate JSON downloaded.', { tone: 'success' });
  }

  function downloadCandidateCsv(item) {
    if (!item || !Array.isArray(item.candidates) || !item.candidates.length) return;
    const headers = preferredCandidateHeaders(item.candidates);
    const lines = [headers.map(escapeCsv).join(',')];
    item.candidates.forEach((candidate) => {
      const row = headers.map((header) => escapeCsv(normalizeCandidateExportValue(candidate[header])));
      lines.push(row.join(','));
    });
    const fileBase = toFileSafeSegment(`${item.row_number || 'row'}-${item.id || 'item'}-candidates`, 'candidates');
    triggerDownload(`${fileBase}.csv`, `${lines.join('\n')}\n`, 'text/csv;charset=utf-8');
    setCandidateMessage('Candidate CSV downloaded.', false);
    flashActionState(downloadCandidateCsvButton, 'success');
    showToast('Candidate CSV downloaded.', { tone: 'success' });
  }

  function renderCandidateReview(item) {
    if (!item) {
      candidateReview.className = 'candidate-review empty';
      candidateReview.textContent = 'Select a row from Job Status to inspect and label candidate regions.';
      setCandidateExportState(null);
      return;
    }

    const candidates = Array.isArray(item.candidates) ? item.candidates : [];
    const summary = item.candidate_review_summary || {};
    const scanResult = item.scan_result || {};
    const hasGraphSnapshot = !!(item.manual_html_url || item.manual_raw_html_url);
    if (!candidates.length) {
      candidateReview.className = 'candidate-review empty';
      candidateReview.textContent = 'This row does not have candidate regions yet. Run the scan or upload a manual snapshot first.';
      setCandidateExportState(item);
      return;
    }

    const totalPages = Math.max(1, Math.ceil(candidates.length / candidatePageSize));
    currentCandidatePage = Math.min(currentCandidatePage, totalPages - 1);
    const startIndex = currentCandidatePage * candidatePageSize;
    const visibleCandidates = candidates
      .slice(startIndex, startIndex + candidatePageSize)
      .map((candidate) => {
        const merged = mergeCandidateMarkup(item, candidate);
        ensureCandidateMarkup(item, merged).catch((error) => console.error(error));
        return merged;
      });

    const cards = visibleCandidates.map((candidate) => {
      const noteId = `candidate-notes-${candidate.candidate_key || candidate.candidate_rank || 'x'}`;
      const label = humanLabelText(candidate.human_label);
      const labelClass = humanLabelClass(candidate.human_label);
      const matchedSignals = renderSignalList(candidate.matched_signals, 'good');
      const penaltySignals = renderSignalList(candidate.penalty_signals, 'bad');
      return `
        <article class="candidate-card ${candidate.human_label ? 'active-review' : ''}">
          ${renderCandidateVisual(candidate, {
            imageClass: 'candidate-shot',
            fallbackHeading: 'Text Preview',
          })}
          <div class="candidate-meta">
            <div class="candidate-meta-row">
              <span class="candidate-pill">rank ${escapeHtml(candidate.candidate_rank)}</span>
              <span class="candidate-pill">${escapeHtml(candidate.confidence || 'unknown')}</span>
              <span class="candidate-pill">${escapeHtml(candidate.ugc_type || 'candidate')}</span>
              <span class="candidate-pill">${escapeHtml(candidate.score ?? '')}</span>
              <span class="candidate-pill">${escapeHtml(candidate.keyword_evidence_strength || 'none')}</span>
              <span class="candidate-pill ${candidate.acceptance_gate_passed ? 'good' : 'bad'}">gate ${candidate.acceptance_gate_passed ? 'pass' : 'fail'}</span>
              ${candidate.detected ? '<span class="candidate-pill good">detected</span>' : ''}
              ${label ? `<span class="candidate-pill ${labelClass}">${escapeHtml(label)}</span>` : ''}
            </div>
            <p class="candidate-copy">${escapeHtml(candidate.sample_text || 'No sample text available for this candidate.')}</p>
            <p class="candidate-copy mono">${escapeHtml(candidate.xpath || candidate.css_path || '')}</p>
            ${renderCandidateMarkupDetails(candidate)}
            ${matchedSignals ? `<div><p class="candidate-copy"><strong>Positive Signals</strong></p>${matchedSignals}</div>` : ''}
            ${penaltySignals ? `<div><p class="candidate-copy"><strong>Penalty Signals</strong></p>${penaltySignals}</div>` : ''}
            <label class="field">
              <span>Review Notes</span>
              <textarea id="${escapeHtml(noteId)}" class="candidate-notes" rows="3" placeholder="Optional reason for the label">${escapeHtml(candidate.human_notes || '')}</textarea>
            </label>
            <div class="candidate-actions">
              <button class="compact" type="button" data-candidate-review="${escapeHtml(candidate.candidate_key || '')}" data-label-value="comment_region">Comment Region</button>
              <button class="compact" type="button" data-candidate-review="${escapeHtml(candidate.candidate_key || '')}" data-label-value="not_comment_region">Not Comment</button>
              <button class="compact" type="button" data-candidate-review="${escapeHtml(candidate.candidate_key || '')}" data-label-value="uncertain">Uncertain</button>
              <button class="secondary compact" type="button" data-candidate-clear="${escapeHtml(candidate.candidate_key || '')}">Clear</button>
            </div>
          </div>
        </article>
      `;
    }).join('');

    candidateReview.className = 'candidate-review';
    candidateReview.innerHTML = `
      <div class="summary">
        <div><strong>Source:</strong> ${escapeHtml(item.analysis_source || 'automated')}</div>
        <div><strong>Access Flag:</strong> ${escapeHtml(scanResult.blocker_type || 'clear')}</div>
        <div><strong>Candidate Count:</strong> ${escapeHtml(candidates.length)}</div>
        <div><strong>Reviewed:</strong> ${escapeHtml(summary.total ?? 0)}</div>
        <div><strong>Comment Region:</strong> ${escapeHtml(summary.comment_region ?? 0)}</div>
        <div><strong>Not Comment:</strong> ${escapeHtml(summary.not_comment_region ?? 0)}</div>
        <div><strong>Uncertain:</strong> ${escapeHtml(summary.uncertain ?? 0)}</div>
      </div>
      ${hasGraphSnapshot ? '' : '<p class="candidate-copy"><strong>Graph export unavailable:</strong> this row does not have a stored HTML snapshot yet. Older automated rows need a rescan or manual upload before SVG/DOT can be generated.</p>'}
      ${scanResult.access_reason ? `<p class="candidate-copy"><strong>Access Reason:</strong> ${escapeHtml(scanResult.access_reason)}</p>` : ''}
      <p class="candidate-copy"><strong>Artifact note:</strong> the image below is an element-level crop resolved from the candidate's stored xpath/CSS path, not the raw page screenshot uploaded by the extension. The HTML panels show the candidate's stored markup so you can inspect the suspected DOM region even when the crop is misleading.</p>
      ${renderManualArtifactLinks(item, '')}
      <div class="candidate-toolbar">
        <span class="candidate-page-copy">Reviewing candidate ${escapeHtml(startIndex + 1)} of ${escapeHtml(candidates.length)}</span>
        <div class="candidate-pager">
          <button class="secondary compact" type="button" data-candidate-page="prev" ${currentCandidatePage > 0 ? '' : 'disabled'}>Previous</button>
          <span class="candidate-page-copy">Page ${escapeHtml(currentCandidatePage + 1)} / ${escapeHtml(totalPages)}</span>
          <button class="secondary compact" type="button" data-candidate-page="next" ${(currentCandidatePage + 1) < totalPages ? '' : 'disabled'}>Next</button>
        </div>
      </div>
      <div class="candidate-grid">${cards}</div>
    `;
    setCandidateExportState(item);
  }

  function explanationCandidate(item) {
    const candidates = Array.isArray(item && item.candidates) ? item.candidates : [];
    if (!candidates.length) return null;
    if (currentCandidatePage >= 0 && currentCandidatePage < candidates.length) {
      return mergeCandidateMarkup(item, candidates[currentCandidatePage]);
    }
    const best = item && item.best_candidate ? item.best_candidate : null;
    if (!best) return mergeCandidateMarkup(item, candidates[0]);
    return mergeCandidateMarkup(item, (
      candidates.find((candidate) => candidate.candidate_key && candidate.candidate_key === best.candidate_key)
      || candidates.find((candidate) => candidate.xpath === best.xpath && candidate.css_path === best.css_path)
      || candidates[0]
    ));
  }

  function explainFeatureBuckets(candidate) {
    const ignored = new Set([
      'candidate_rank',
      'candidate_key',
      'detected',
      'score',
      'confidence',
      'ugc_type',
      'matched_signals',
      'penalty_signals',
      'human_label',
      'human_notes',
      'human_reviewed_at',
      'candidate_screenshot_url',
      'candidate_screenshot_error',
      'candidate_outer_html_excerpt',
      'candidate_outer_html_length',
      'candidate_outer_html_truncated',
      'candidate_inner_html_excerpt',
      'candidate_inner_html_length',
      'candidate_inner_html_truncated',
      'candidate_text_excerpt',
      'candidate_markup_error',
      'candidate_resolved_tag_name',
      'base_detected',
      'acceptance_gate_passed',
      'keyword_evidence_present',
      'keyword_evidence_strength',
      'keyword_evidence_signals',
      'keyword_gate_tier',
      'explicit_keyword_signal_count',
      'supporting_keyword_signal_count',
      'strong_keyword_signal_count',
      'medium_keyword_signal_count',
      'semantic_support_count',
      'structural_support_count',
      'interaction_support_count',
      'repeated_structure_support',
      'high_assurance_without_keywords',
      'acceptance_gate_reason',
      'xpath',
      'css_path',
      'sample_text',
      'frame_url',
      'frame_name',
      'frame_key',
      'frame_title',
    ]);
    const trueFlags = [];
    const falseFlags = [];
    const numericValues = [];
    const textValues = [];

    Object.keys(candidate || {})
      .sort((left, right) => left.localeCompare(right))
      .forEach((key) => {
        if (ignored.has(key) || key.startsWith('_')) return;
        const value = candidate[key];
        if (typeof value === 'boolean') {
          if (value) trueFlags.push([key, 'true']);
          else falseFlags.push([key, 'false']);
          return;
        }
        if (typeof value === 'number' && Number.isFinite(value)) {
          numericValues.push([key, String(value)]);
          return;
        }
        if (typeof value === 'string' && value.trim()) {
          textValues.push([key, value]);
        }
      });

    return {
      trueFlags,
      falseFlags,
      numericValues,
      textValues,
    };
  }

  function renderScoringBreakdown(item) {
    if (!item) {
      scoringBreakdown.className = 'candidate-review empty';
      scoringBreakdown.textContent = 'Select a row from Job Status to inspect the scoring breakdown.';
      return;
    }

    const candidate = explanationCandidate(item);
    const candidates = Array.isArray(item.candidates) ? item.candidates : [];
    const scanResult = item.scan_result || {};
    if (!candidate) {
      scoringBreakdown.className = 'candidate-review empty';
      scoringBreakdown.textContent = 'This row has no candidate regions yet, so there is no feature breakdown to explain.';
      return;
    }
    ensureCandidateMarkup(item, candidate).catch((error) => console.error(error));

    const buckets = explainFeatureBuckets(candidate);
    const matchedSignalsArray = Array.isArray(candidate.matched_signals) ? candidate.matched_signals.filter(Boolean) : [];
    const penaltySignalsArray = Array.isArray(candidate.penalty_signals) ? candidate.penalty_signals.filter(Boolean) : [];
    const keywordSignalsArray = Array.isArray(candidate.keyword_evidence_signals) ? candidate.keyword_evidence_signals.filter(Boolean) : [];
    const matchedSignals = renderSignalList(matchedSignalsArray, 'good');
    const penaltySignals = renderSignalList(penaltySignalsArray, 'bad');
    const keywordSignals = renderSignalList(keywordSignalsArray, candidate.acceptance_gate_passed ? 'good' : 'bad');
    const importantMissingKeys = new Set([
      'aria_role_comment',
      'schema_org_comment_itemtype',
      'comment_header_with_count',
      'keyword_container_high',
      'keyword_unit_high',
      'keyword_direct_text_high',
      'keyword_attr_value_high',
      'keyword_container_med',
      'has_avatar',
      'includes_author',
      'has_relative_time',
      'reply_button_per_unit',
      'report_flag_button_per_unit',
      'permalink_per_unit',
      'upvote_downvote_pair',
      'deleted_placeholder_present',
      'pagination_load_more_adjacent',
      'has_nearby_textarea',
      'microdata_itemprop_author',
      'microdata_itemprop_date_published',
      'repeated_structure_support',
      'sig_id_recursive_nesting',
    ]);
    const notableMissing = buckets.falseFlags.filter(([key]) => importantMissingKeys.has(key)).slice(0, 8);
    const gatePassed = !!candidate.acceptance_gate_passed;
    const baseThresholdPassed = !!candidate.base_detected;
    const keywordMetrics = [
      ['Base threshold', baseThresholdPassed ? 'passed' : 'failed'],
      ['Acceptance gate', gatePassed ? 'passed' : 'failed'],
      ['Gate tier', candidate.keyword_gate_tier || 'missing'],
      ['Keyword evidence', candidate.keyword_evidence_strength || 'none'],
      ['Explicit keyword signals', candidate.explicit_keyword_signal_count],
      ['Supporting keyword signals', candidate.supporting_keyword_signal_count],
      ['Medium keyword signals', candidate.medium_keyword_signal_count],
      ['Repeated sibling support', candidate.repeated_structure_support ? 'yes' : 'no'],
      ['Semantic support count', candidate.semantic_support_count],
      ['Structural support count', candidate.structural_support_count],
      ['Interaction support count', candidate.interaction_support_count],
      ['High-assurance override', candidate.high_assurance_without_keywords ? 'yes' : 'no'],
    ];
    const structuralMetrics = [
      ['Unit count', candidate.unit_count],
      ['Repeated sibling groups', candidate.repeating_group_count],
      ['Repeated sibling support', candidate.repeated_structure_support ? 'yes' : 'no'],
      ['Dominant group strategy', candidate.dominant_group_strategy],
      ['Sibling homogeneity', candidate.sibling_homogeneity_score],
      ['Internal max depth', candidate.internal_max_depth],
      ['Internal tag variety', candidate.internal_tag_variety],
      ['Reply nesting depth', candidate.reply_nesting_depth],
      ['Wildcard XPath template', candidate.wildcard_xpath_template],
    ];
    const identityMetrics = [
      ['Has avatar', candidate.has_avatar],
      ['Includes author', candidate.includes_author],
      ['Has relative time', candidate.has_relative_time],
      ['Author avatar coverage', candidate.author_avatar_coverage],
      ['Author timestamp colocated', candidate.author_timestamp_colocated],
      ['Profile link coverage', candidate.profile_link_coverage],
      ['Verification badge present', candidate.verification_badge_present],
    ];
    const interactionMetrics = [
      ['Reply button coverage', candidate.reply_button_unit_coverage],
      ['Report flag coverage', candidate.report_flag_unit_coverage],
      ['Permalink per unit', candidate.permalink_per_unit],
      ['Reaction coverage', candidate.reaction_coverage],
      ['Edit/delete coverage', candidate.edit_delete_coverage],
      ['Upvote/downvote pair', candidate.upvote_downvote_pair],
      ['Collapse/expand control', candidate.collapse_expand_control],
      ['Load more nearby', candidate.pagination_load_more_adjacent],
      ['Nearby textarea', candidate.has_nearby_textarea],
    ];
    const contentMetrics = [
      ['Text words', candidate.text_word_count],
      ['Text chars', candidate.text_char_count],
      ['Sentence count', candidate.text_sentence_count],
      ['External link density low', candidate.external_link_density_low],
      ['Link density', candidate.link_density],
      ['Sample texts captured', Array.isArray(candidate.sample_texts) ? candidate.sample_texts.length : ''],
    ];
    const humanReviewMetrics = [
      ['Human label', candidate.human_label || ''],
      ['Human reviewed at', candidate.human_reviewed_at || ''],
      ['Human notes', truncateMetricText(candidate.human_notes || '', 140)],
      ['Item source', item.analysis_source || ''],
      ['Manual capture required', item.manual_capture_required ? 'yes' : 'no'],
      ['Blocker flag', scanResult.blocker_type || 'clear'],
      ['Access reason', truncateMetricText(scanResult.access_reason || '', 140)],
    ];
    let verdictTitle = 'Scanner kept this candidate below threshold';
    let verdictCopy = `Candidate #${candidate.candidate_rank} stayed below the decision threshold. The scanner found ${matchedSignalsArray.length} positive signals and ${penaltySignalsArray.length} penalties. ${candidate.acceptance_gate_reason || ''}`;
    if (candidate.detected) {
      verdictTitle = 'Scanner selected this candidate';
      verdictCopy = `Candidate #${candidate.candidate_rank} was promoted at score ${formatMetricValue(candidate.score)}. ${candidate.acceptance_gate_reason || ''}`;
    } else if (baseThresholdPassed && !gatePassed) {
      verdictTitle = 'Raw score passed, but the keyword gate rejected this candidate';
      verdictCopy = `Candidate #${candidate.candidate_rank} cleared the raw score threshold at score ${formatMetricValue(candidate.score)}, but the acceptance gate blocked it. ${candidate.acceptance_gate_reason || ''}`;
    }
    const candidateScreenshot = renderCandidateVisual(candidate, {
      linkClass: 'score-shot-link',
      imageClass: 'score-shot',
      fallbackHeading: 'Candidate Text Preview',
    });
    const candidateSummary = candidates.slice(0, 5).map((entry) => `
      <tr>
        <td>${escapeHtml(entry.candidate_rank)}</td>
        <td>${escapeHtml(entry.score ?? '')}</td>
        <td>${escapeHtml(entry.confidence || '')}</td>
        <td>${escapeHtml(entry.ugc_type || '')}</td>
        <td>${escapeHtml(entry.keyword_evidence_strength || 'none')}</td>
        <td>${entry.acceptance_gate_passed ? 'pass' : 'fail'}</td>
        <td>${entry.detected ? 'yes' : 'no'}</td>
        <td>${escapeHtml(entry.human_label || '')}</td>
      </tr>
    `).join('');

    scoringBreakdown.className = 'candidate-review';
    scoringBreakdown.innerHTML = `
      <div class="score-shell">
        <section class="score-hero">
          <article class="score-verdict ${candidate.detected ? 'good' : 'bad'}">
            <div class="candidate-meta-row">
              <span class="candidate-pill ${candidate.detected ? 'good' : 'bad'}">${candidate.detected ? 'detected' : 'not detected'}</span>
              <span class="candidate-pill">candidate ${escapeHtml(candidate.candidate_rank)}</span>
              <span class="candidate-pill">${escapeHtml(candidate.ugc_type || 'candidate')}</span>
              <span class="candidate-pill">${escapeHtml(candidate.confidence || 'unknown')}</span>
            </div>
            <h4>${escapeHtml(verdictTitle)}</h4>
            <p class="candidate-copy">${escapeHtml(verdictCopy)}</p>
            <div class="candidate-meta-row">
              <span class="candidate-pill">source ${escapeHtml(item.analysis_source || 'automated')}</span>
              <span class="candidate-pill">score ${escapeHtml(candidate.score ?? '')}</span>
              <span class="candidate-pill">true flags ${escapeHtml(buckets.trueFlags.length)}</span>
              <span class="candidate-pill">false flags ${escapeHtml(buckets.falseFlags.length)}</span>
              <span class="candidate-pill ${scanResult.blocker_type ? 'warn' : ''}">blocker ${escapeHtml(scanResult.blocker_type || 'clear')}</span>
            </div>
          </article>
          <div class="score-pill-grid">
            ${renderScoreStat('Matched signals', matchedSignalsArray.length, 'good')}
            ${renderScoreStat('Penalty signals', penaltySignalsArray.length, 'bad')}
            ${renderScoreStat('Base threshold', baseThresholdPassed ? 'passed' : 'failed', baseThresholdPassed ? 'good' : 'bad')}
            ${renderScoreStat('Acceptance gate', gatePassed ? 'passed' : 'failed', gatePassed ? 'good' : 'bad')}
            ${renderScoreStat('Keyword evidence', candidate.keyword_evidence_strength || 'none', gatePassed ? 'good' : 'bad')}
            ${renderScoreStat('Repeated sibling', candidate.repeated_structure_support ? 'yes' : 'no', candidate.repeated_structure_support ? 'good' : '')}
            ${renderScoreStat('Candidates on row', candidates.length, '')}
            ${renderScoreStat('Human label', candidate.human_label || 'none', 'warn')}
          </div>
        </section>

        <section class="score-grid">
          <article class="score-card score-card-wide">
            <div class="score-shot-shell">
              ${candidateScreenshot}
            </div>
            <div class="score-card-copy">
              <h4>Selected Candidate</h4>
              <p class="candidate-copy">${escapeHtml(candidate.sample_text || 'No sample text available.')}</p>
              <p class="candidate-copy mono">${escapeHtml(candidate.xpath || candidate.css_path || '')}</p>
              ${renderCandidateMarkupDetails(candidate)}
              ${scanResult.access_reason ? `<p class="candidate-copy"><strong>Access Reason:</strong> ${escapeHtml(scanResult.access_reason)}</p>` : ''}
            </div>
          </article>

          <article class="score-card">
            <h4>Why It Matched</h4>
            ${matchedSignals || '<p class="candidate-copy">No positive signals were attached to this candidate.</p>'}
          </article>

          <article class="score-card">
            <h4>What Weakens It</h4>
            ${penaltySignals || '<p class="candidate-copy">No penalty signals were attached to this candidate.</p>'}
          </article>

          <article class="score-card">
            <h4>Keyword And Gate</h4>
            <p class="candidate-copy">${escapeHtml(candidate.acceptance_gate_reason || 'No acceptance-gate explanation was stored for this candidate.')}</p>
            ${keywordSignals || '<p class="candidate-copy">No keyword signals were stored for this candidate.</p>'}
            ${renderMetricList(keywordMetrics, 'No keyword-gate metrics were stored for this candidate.')}
          </article>

          <article class="score-card">
            <h4>Structural Evidence</h4>
            ${renderMetricList(structuralMetrics, 'No structural metrics were stored for this candidate.')}
          </article>

          <article class="score-card">
            <h4>Author And Time Cues</h4>
            ${renderMetricList(identityMetrics, 'No author/time cues were stored for this candidate.')}
          </article>

          <article class="score-card">
            <h4>Interaction Cues</h4>
            ${renderMetricList(interactionMetrics, 'No interaction cues were stored for this candidate.')}
          </article>

          <article class="score-card">
            <h4>Content Profile</h4>
            ${renderMetricList(contentMetrics, 'No content metrics were stored for this candidate.')}
          </article>

          <article class="score-card">
            <h4>Human Review State</h4>
            ${renderMetricList(humanReviewMetrics, 'No human-review metadata is attached to this candidate yet.')}
          </article>

          <article class="score-card">
            <h4>Missing Expected Cues</h4>
            ${renderFeatureList(notableMissing.map(([key, value]) => [humanizeFeatureName(key), value]), 'muted', 'No notable missing cues from the curated review list.')}
          </article>
        </section>

        <details class="score-details" data-score-detail="true-features">
          <summary>All true features (${escapeHtml(buckets.trueFlags.length)})</summary>
          <div class="score-details-body">
            ${renderFeatureList(buckets.trueFlags.map(([key, value]) => [humanizeFeatureName(key), value]), 'good', 'No boolean features evaluated to true.')}
          </div>
        </details>

        <details class="score-details" data-score-detail="false-features">
          <summary>All false features (${escapeHtml(buckets.falseFlags.length)})</summary>
          <div class="score-details-body">
            ${renderFeatureList(buckets.falseFlags.map(([key, value]) => [humanizeFeatureName(key), value]), 'muted', 'No boolean features evaluated to false.')}
          </div>
        </details>

        <details class="score-details" data-score-detail="numeric-metrics">
          <summary>Raw numeric metrics (${escapeHtml(buckets.numericValues.length)})</summary>
          <div class="score-details-body">
            ${renderFeatureList(buckets.numericValues.map(([key, value]) => [humanizeFeatureName(key), value]), 'plain', 'No numeric metrics were stored for this candidate.')}
          </div>
        </details>

        <details class="score-details" data-score-detail="text-metrics">
          <summary>Raw text metrics (${escapeHtml(buckets.textValues.length)})</summary>
          <div class="score-details-body">
            ${renderFeatureList(buckets.textValues.map(([key, value]) => [humanizeFeatureName(key), truncateMetricText(value, 160)]), 'plain', 'No text-valued features were stored for this candidate.')}
          </div>
        </details>

        <div class="table-shell score-candidate-table">
          <table>
            <caption>Top candidate comparison</caption>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Score</th>
                <th>Confidence</th>
                <th>Type</th>
                <th>Keywords</th>
                <th>Gate</th>
                <th>Detected</th>
                <th>Human Label</th>
              </tr>
            </thead>
            <tbody>${candidateSummary}</tbody>
          </table>
        </div>
      </div>
    `;
    applyScoreDetailState();
  }

  function selectManualItem(item, nextTab) {
    const previousItemId = selectedManualItemId;
    selectedManualItemId = item ? item.id : '';
    manualCopyConfigButton.disabled = !item;
    if (!item || previousItemId !== selectedManualItemId) {
      currentCandidatePage = 0;
    }
    renderWorkspaceSelection(item);

    if (!item) {
      manualContext.className = 'summary empty';
      manualContext.textContent = 'Select a row from Job Status to prepare a manual capture.';
      manualJobId.value = '';
      manualItemId.value = '';
      manualCaptureUrl.value = '';
      manualCaptureTitle.value = '';
      manualNotes.value = '';
      renderCandidateReview(null);
      renderScoringBreakdown(null);
      setWorkspaceTab(nextTab || 'queue');
      return;
    }

    manualJobId.value = currentJobId || item.job_id || '';
    manualItemId.value = item.id || '';
    manualCaptureUrl.value = item.manual_capture_url || item.final_url || item.normalized_url || '';
    manualCaptureTitle.value = item.manual_capture_title || item.title || '';
    manualNotes.value = item.manual_capture_notes || item.manual_capture_reason || '';

    manualContext.className = 'summary';
    manualContext.innerHTML = [
      `<div><strong>Row:</strong> ${escapeHtml(item.row_number)}</div>`,
      `<div><strong>Item:</strong> ${escapeHtml(item.id || '')}</div>`,
      `<div><strong>Current Source:</strong> ${escapeHtml(item.analysis_source || 'automated')}</div>`,
      `<div><strong>Snapshot Mode:</strong> ${escapeHtml(item.manual_capture_mode || '')}</div>`,
      `<div><strong>Manual Review:</strong> ${item.manual_capture_required ? 'required' : 'optional'}</div>`,
      `<div><strong>Candidates:</strong> ${escapeHtml(Array.isArray(item.candidates) ? item.candidates.length : 0)}</div>`,
      `<div><strong>Candidate Reviews:</strong> ${escapeHtml(item.candidate_review_summary ? item.candidate_review_summary.total : 0)}</div>`,
      `<div><strong>URL:</strong> ${escapeHtml(item.final_url || item.normalized_url || '')}</div>`,
      `<div><strong>Reason:</strong> ${escapeHtml(item.manual_capture_reason || item.error_message || '')}</div>`,
      `<div><strong>Artifacts:</strong>${renderManualArtifactLinks(item, '<p class="candidate-copy">No stored manual artifacts yet.</p>')}</div>`,
    ].join('');
    renderCandidateReview(item);
    renderScoringBreakdown(item);
    if (nextTab) {
      setWorkspaceTab(nextTab);
    }
  }

  function renderItems(items, pagination) {
    currentItemsById = new Map((items || []).map((item) => [item.id, item]));
    if (selectedManualItemId) {
      if (currentItemsById.has(selectedManualItemId)) {
        selectManualItem(currentItemsById.get(selectedManualItemId) || null);
      } else {
        selectedManualItemId = '';
        selectManualItem(null);
      }
    }

    if (!items || !items.length) {
      jobItems.className = 'table-shell empty';
      jobItems.textContent = 'No rows for this job yet.';
      return;
    }

    const rows = items.map((item) => `
      <tr>
        <td>${escapeHtml(item.row_number)}</td>
        <td class="mono">${item.normalized_url ? `<a href="${escapeHtml(item.normalized_url)}" target="_blank" rel="noreferrer">${escapeHtml(item.normalized_url)}</a>` : ''}</td>
        <td>${escapeHtml(item.status || '')}</td>
        <td>${escapeHtml(item.best_ugc_type || '')}</td>
        <td>${escapeHtml(item.best_score ?? '')}</td>
        <td>${item.ugc_detected ? 'yes' : 'no'}</td>
        <td>${escapeHtml(Array.isArray(item.candidates) ? item.candidates.length : 0)} / ${escapeHtml(item.candidate_review_summary ? item.candidate_review_summary.total || 0 : 0)}</td>
        <td>${reviewChip(item)}</td>
        <td>${item.screenshot_url ? `<a href="${escapeHtml(resolveAssetUrl(item.screenshot_url))}" target="_blank" rel="noreferrer">View</a>` : ''}</td>
        <td>
          <div class="action-stack">
            <button class="secondary compact" type="button" data-review-item="${escapeHtml(item.id || '')}">Review</button>
            <button class="secondary compact" type="button" data-manual-item="${escapeHtml(item.id || '')}">Manual</button>
            ${item.manual_html_url ? `<a class="link-button compact" href="${escapeHtml(resolveAssetUrl(item.manual_html_url))}" target="_blank" rel="noreferrer">Snapshot</a>` : ''}
            ${item.manual_raw_html_url ? `<a class="link-button compact" href="${escapeHtml(resolveAssetUrl(item.manual_raw_html_url))}" target="_blank" rel="noreferrer">Raw</a>` : ''}
          </div>
        </td>
        <td>${escapeHtml(item.error_message || '')}</td>
      </tr>
    `).join('');

    const total = pagination && pagination.total ? pagination.total : items.length;
    const offset = pagination && Number.isFinite(pagination.offset) ? pagination.offset : 0;
    const limit = pagination && Number.isFinite(pagination.limit) ? pagination.limit : items.length;
    const showingFrom = total ? offset + 1 : 0;
    const showingTo = Math.min(offset + limit, total);
    const hasPrev = offset > 0;
    const hasNext = offset + limit < total;

    jobItems.className = 'table-shell';
    jobItems.innerHTML = `
      <div class="pager">
        <span>Showing ${showingFrom}-${showingTo} of ${total}</span>
        <div class="pager-actions">
          <button class="secondary compact" type="button" data-page-action="prev" ${hasPrev ? '' : 'disabled'}>Previous</button>
          <button class="secondary compact" type="button" data-page-action="next" ${hasNext ? '' : 'disabled'}>Next</button>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Row</th>
            <th>URL</th>
            <th>Status</th>
            <th>Type</th>
            <th>Score</th>
            <th>UGC</th>
            <th>Candidates</th>
            <th>Review</th>
            <th>Screenshot</th>
            <th>Actions</th>
            <th>Error</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  function renderJobManager(job) {
    const replaceButton = managerForm ? managerForm.querySelector('button[type="submit"]') : null;
    if (!job) {
      managerSelection.className = 'summary empty';
      managerSelection.textContent = 'Select a job from Job Status or Recent Jobs to manage it here.';
      managerJobId.value = '';
      managerSourceColumn.value = '';
      managerScanDelayInput.value = '';
      managerScreenshotDelayInput.value = '';
      managerReplaceFile.value = '';
      managerResumeButton.disabled = true;
      managerRestartButton.disabled = true;
      managerDeleteButton.disabled = true;
      if (replaceButton) {
        replaceButton.disabled = true;
      }
      return;
    }

    managerSelection.className = 'summary tight-summary';
    managerSelection.innerHTML = [
      `<div><strong>Job:</strong> ${escapeHtml(job.id)}</div>`,
      `<div><strong>Source:</strong> ${escapeHtml(job.source_filename || 'upload.csv')}</div>`,
      `<div><strong>Column:</strong> ${escapeHtml(job.source_column || '(auto)')}</div>`,
      `<div><strong>Status:</strong> ${escapeHtml(job.status || '')}</div>`,
      `<div><strong>Progress:</strong> ${escapeHtml(job.completed_count || 0)}/${escapeHtml(job.total_urls || 0)}</div>`,
      `<div><strong>Pending:</strong> ${escapeHtml(job.pending_count || 0)}</div>`,
      `<div><strong>Queued:</strong> ${escapeHtml(job.queued_count || 0)}</div>`,
      `<div><strong>Running:</strong> ${escapeHtml(job.running_count || 0)}</div>`,
    ].join('');

    if (managerFormJobId !== job.id) {
      managerJobId.value = job.id || '';
      managerSourceColumn.value = job.source_column || '';
      managerScanDelayInput.value = job.scan_delay_ms ?? '';
      managerScreenshotDelayInput.value = job.screenshot_delay_ms ?? '';
      managerReplaceFile.value = '';
      managerFormJobId = job.id;
    } else {
      managerJobId.value = job.id || '';
    }

    managerResumeButton.disabled = !canResumeJob(job);
    managerRestartButton.disabled = false;
    managerDeleteButton.disabled = false;
    if (replaceButton) {
      replaceButton.disabled = false;
    }
  }

  function renderRecentJobs(jobs) {
    if (!jobs || !jobs.length) {
      recentJobs.className = 'table-shell empty';
      recentJobs.textContent = 'No jobs loaded.';
      return;
    }

    const rows = jobs.map((job) => `
      <tr data-job-id="${escapeHtml(job.id)}" class="${currentJobId === job.id ? 'is-current' : ''}">
        <td class="mono">${escapeHtml(job.id)}</td>
        <td>${escapeHtml(job.status)}</td>
        <td>${escapeHtml(job.completed_count)}/${escapeHtml(job.total_urls)}</td>
        <td>${escapeHtml(job.detected_count)}</td>
        <td>
          <div class="job-action-grid">
            <button class="secondary compact" type="button" data-open-job="${escapeHtml(job.id)}">Open</button>
            <button class="secondary compact" type="button" data-manage-job="${escapeHtml(job.id)}">Manage</button>
            <button class="secondary compact" type="button" data-resume-job="${escapeHtml(job.id)}" ${canResumeJob(job) ? '' : 'disabled'}>Resume</button>
            <button class="secondary compact" type="button" data-restart-job="${escapeHtml(job.id)}">Restart</button>
            <button class="secondary compact danger-button" type="button" data-delete-job="${escapeHtml(job.id)}">Delete</button>
          </div>
        </td>
      </tr>
    `).join('');

    recentJobs.className = 'table-shell';
    recentJobs.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Job</th>
            <th>Status</th>
            <th>Progress</th>
            <th>Detected</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  async function fetchJson(path, options = {}) {
    const response = await fetch(apiUrl(path), {
      cache: 'no-store',
      ...options,
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `Request failed: ${response.status}`);
    }
    return response.json();
  }

  async function fetchJobEvents(jobId) {
    if (!jobId) {
      renderJobEvents([], { message: 'Select a job to view recent events.' });
      return [];
    }

    try {
      const body = await fetchJson(`/api/jobs/${jobId}/events?limit=80`);
      const events = Array.isArray(body && body.events) ? body.events : [];
      renderJobEvents(events);
      return events;
    } catch (error) {
      renderJobEvents([], {
        message: error && error.message ? error.message : 'Failed to load job events.',
        isError: true,
      });
      return [];
    }
  }

  async function refreshSelectedItem() {
    if (!currentJobId || !selectedManualItemId) return null;
    const data = await fetchJson(`/api/jobs/${currentJobId}/items/${selectedManualItemId}`);
    const item = data && data.item ? data.item : null;
    if (item) {
      currentItemsById.set(item.id, item);
      selectManualItem(item);
    }
    return item;
  }

  async function primeManualTarget(item) {
    if (!item || !item.id) {
      throw new Error('Select a row first.');
    }

    const response = await fetch(apiUrl('/api/manual-review/target'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jobId: currentJobId || item.job_id || '',
        itemId: item.id,
        captureUrl: manualCaptureUrl.value.trim() || item.manual_capture_url || item.final_url || item.normalized_url || '',
        title: manualCaptureTitle.value.trim() || item.manual_capture_title || item.title || '',
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error || 'Failed to prime manual target.');
    }
    return body.target || null;
  }

  async function postJobAction(jobId, path, options = {}) {
    const response = await fetch(apiUrl(path), {
      method: options.method || 'POST',
      body: options.body,
      headers: options.headers,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error || 'Job action failed.');
    }

    await refreshJobs().catch((error) => {
      console.error(error);
    });
    if (body && body.deletedJobId) {
      if (currentJobId === body.deletedJobId) {
        resetCurrentJobSelection({
          managerMessage: 'Job removed.',
          eventsMessage: 'Select a job to view recent events.',
        });
      }
      return body;
    }
    if (options.skipFollowUpRefresh) {
      return body;
    }

    const nextJobId = body.jobId || (body.job && body.job.id) || jobId || currentJobId;
    if (nextJobId) {
      currentOffset = 0;
      await refreshJob(nextJobId);
    }
    return body;
  }

  async function refreshJob(jobId) {
    if (!jobId) return;
    const [{ job, items, pagination }] = await Promise.all([
      fetchJson(`/api/jobs/${jobId}?limit=${pageSize}&offset=${currentOffset}`),
      fetchJobEvents(jobId),
    ]);
    if (currentJobId && currentJobId !== jobId && selectedManualItemId) {
      selectedManualItemId = '';
      selectManualItem(null);
    }
    currentJob = job;
    currentJobId = jobId;
    window.history.replaceState({}, '', `?jobId=${jobId}`);
    renderSummary(job);
    renderItems(items, pagination);
    renderJobManager(job);
    await refreshSelectedItem().catch((error) => console.error(error));
    setDownloads(jobId);
    refreshJobs().catch((error) => console.error(error));
    startPolling(jobId, pollIntervalForStatus(job.status));
  }

  async function refreshJobs() {
    const data = await fetchJson('/api/jobs?limit=10');
    const jobs = data.jobs || [];
    renderRecentJobs(jobs);
    return jobs;
  }

  async function handleResumeJob(jobId, triggerElement) {
    if (!jobId) return;
    try {
      setManagerMessage('Resuming unfinished rows...', false);
      const body = await runElementAction(triggerElement, () => postJobAction(jobId, `/api/jobs/${jobId}/resume`));
      const replacedCount = Number(body && body.replacedCount) || 0;
      const message = replacedCount
        ? `Resumed ${replacedCount} unfinished row(s).`
        : 'Resume requested. No unfinished rows needed replacement.';
      setManagerMessage(message, false);
      showToast(message, { tone: 'success' });
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      setManagerMessage(message, true);
      showToast(message, { tone: 'error' });
    }
  }

  async function handleRestartJob(jobId, triggerElement) {
    if (!jobId) return;
    const confirmed = await confirmAction({
      title: 'Restart this job?',
      description: `This will reset all rows for job ${jobId} and start the scan again from the beginning.`,
      acceptLabel: 'Restart Job',
      danger: true,
    });
    if (!confirmed) {
      return;
    }

    try {
      setManagerMessage('Restarting job...', false);
      await runElementAction(triggerElement, () => postJobAction(jobId, `/api/jobs/${jobId}/restart`));
      const message = `Job ${jobId} restarted.`;
      setManagerMessage(message, false);
      showToast(message, { tone: 'success' });
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      setManagerMessage(message, true);
      showToast(message, { tone: 'error' });
    }
  }

  async function handleDeleteJob(jobId, triggerElement) {
    if (!jobId) return;
    const confirmed = await confirmAction({
      title: 'Delete this job?',
      description: `This removes job ${jobId}, its rows, saved results, and job history for the current runtime.`,
      acceptLabel: 'Delete Job',
      danger: true,
    });
    if (!confirmed) {
      return;
    }

    try {
      setManagerMessage('Deleting job...', false);
      await runElementAction(triggerElement, () => postJobAction(jobId, `/api/jobs/${jobId}`, { method: 'DELETE' }));
      const message = `Job ${jobId} deleted.`;
      setManagerMessage(message, false);
      showToast(message, { tone: 'success' });
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      setManagerMessage(message, true);
      showToast(message, { tone: 'error' });
    }
  }

  async function handleReplaceJob(event) {
    event.preventDefault();
    if (!currentJobId || !currentJob) {
      setManagerMessage('Select a job first.', true);
      showToast('Select a job first.', { tone: 'error' });
      return;
    }

    const file = managerReplaceFile.files[0];
    if (!file) {
      setManagerMessage('Choose a replacement CSV first.', true);
      showToast('Choose a replacement CSV first.', { tone: 'error' });
      return;
    }

    const submitButton = managerForm.querySelector('button[type="submit"]');
    try {
      setManagerMessage('Replacing job CSV...', false);
      const formData = new FormData();
      formData.append('file', file);
      if (managerSourceColumn.value.trim()) {
        formData.append('urlColumn', managerSourceColumn.value.trim());
      }
      if (managerScanDelayInput.value.trim()) {
        formData.append('scanDelayMs', managerScanDelayInput.value.trim());
      }
      if (managerScreenshotDelayInput.value.trim()) {
        formData.append('screenshotDelayMs', managerScreenshotDelayInput.value.trim());
      }

      const body = await runElementAction(submitButton, () => postJobAction(currentJobId, `/api/jobs/${currentJobId}/replace`, {
        body: formData,
      }));
      managerReplaceFile.value = '';
      const message = `Job ${currentJobId} updated with ${body.totalUrls || 0} row(s).`;
      setManagerMessage(message, false);
      showToast(message, { tone: 'success' });
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      setManagerMessage(message, true);
      showToast(message, { tone: 'error' });
    }
  }

  async function handleClearAllJobs(triggerElement) {
    const confirmed = await confirmAction({
      title: 'Clear all jobs?',
      description: 'This removes every saved job in the current runtime. Use this only when you want to wipe the job database and start fresh.',
      acceptLabel: 'Clear All Jobs',
      danger: true,
    });
    if (!confirmed) {
      return;
    }

    try {
      setManagerMessage('Clearing saved jobs...', false);
      const body = await runElementAction(triggerElement, () => postJobAction('', '/api/jobs/clear', {
        skipFollowUpRefresh: true,
      }));
      resetCurrentJobSelection({
        managerMessage: `Cleared ${body.deletedCount || 0} job(s).`,
        eventsMessage: 'Select a job to view recent events.',
      });
      await refreshJobs();
      const message = `Cleared ${body.deletedCount || 0} job(s).`;
      setManagerMessage(message, false);
      showToast(message, { tone: 'success' });
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      setManagerMessage(message, true);
      showToast(message, { tone: 'error' });
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const file = fileInput.files[0];
    if (!file) {
      setMessage('Choose a CSV file first.', true);
      showToast('Choose a CSV file first.', { tone: 'error' });
      return;
    }

    const submitButton = form.querySelector('button[type="submit"]');
    try {
      setMessage('Starting scan...', false);
      await runElementAction(submitButton, async () => {
        const formData = new FormData();
        formData.append('file', file);
        if (urlColumnInput.value.trim()) {
          formData.append('urlColumn', urlColumnInput.value.trim());
        }
        if (scanDelayInput && scanDelayInput.value.trim()) {
          formData.append('scanDelayMs', scanDelayInput.value.trim());
        }
        if (screenshotDelayInput && screenshotDelayInput.value.trim()) {
          formData.append('screenshotDelayMs', screenshotDelayInput.value.trim());
        }

        const response = await fetch(apiUrl('/api/jobs'), {
          method: 'POST',
          body: formData,
        });

        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(body.error || 'Failed to create job.');
        }

        setMessage(
          `Job ${body.jobId} created. Scan delay ${body.scanDelayMs ?? ''} ms, screenshot delay ${body.screenshotDelayMs ?? ''} ms.`,
          false,
        );
        showToast(`Job ${body.jobId} created.`, { tone: 'success' });
        await refreshJobs();
        currentOffset = 0;
        await refreshJob(body.jobId);
      });
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      setMessage(message, true);
      showToast(message, { tone: 'error' });
    }
  }

  async function handleManualSubmit(event) {
    event.preventDefault();

    if (!currentJobId || !selectedManualItemId) {
      setManualMessage('Select a row first.', true);
      showToast('Select a row first.', { tone: 'error' });
      return;
    }

    const htmlFile = manualHtmlFile.files[0];
    if (!htmlFile) {
      setManualMessage('Choose an HTML snapshot file.', true);
      showToast('Choose an HTML snapshot file.', { tone: 'error' });
      return;
    }

    const submitButton = manualForm.querySelector('button[type="submit"]');
    try {
      setManualMessage('Uploading manual snapshot...', false);
      await runElementAction(submitButton, async () => {
        const formData = new FormData();
        formData.append('snapshot', htmlFile);
        if (manualScreenshotFile.files[0]) {
          formData.append('screenshot', manualScreenshotFile.files[0]);
        }
        if (manualCaptureUrl.value.trim()) {
          formData.append('captureUrl', manualCaptureUrl.value.trim());
        }
        if (manualCaptureTitle.value.trim()) {
          formData.append('title', manualCaptureTitle.value.trim());
        }
        if (manualNotes.value.trim()) {
          formData.append('notes', manualNotes.value.trim());
        }

        const response = await fetch(apiUrl(`/api/jobs/${currentJobId}/items/${selectedManualItemId}/manual-capture`), {
          method: 'POST',
          body: formData,
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(body.error || 'Failed to upload manual snapshot.');
        }

        manualHtmlFile.value = '';
        manualScreenshotFile.value = '';
        setManualMessage('Manual snapshot analyzed.', false);
        showToast('Manual snapshot analyzed.', { tone: 'success' });
        if (body.item) {
          currentItemsById.set(body.item.id, body.item);
          selectManualItem(body.item, preferredReviewTab(body.item));
        }
        await refreshJob(currentJobId);
      });
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      setManualMessage(message, true);
      showToast(message, { tone: 'error' });
    }
  }

  async function copyManualConfig() {
    if (!currentJobId || !selectedManualItemId) {
      setManualMessage('Select a row first.', true);
      showToast('Select a row first.', { tone: 'error' });
      return;
    }

    const item = currentItemsById.get(selectedManualItemId);
    const payload = {
      apiBaseUrl: absoluteApiBase(),
      jobId: currentJobId,
      itemId: selectedManualItemId,
      captureUrl: manualCaptureUrl.value.trim() || (item ? item.final_url || item.normalized_url || '' : ''),
      title: manualCaptureTitle.value.trim() || (item ? item.title || '' : ''),
      notes: manualNotes.value.trim(),
      snapshotMode: 'frozen_styles',
    };

    await runElementAction(manualCopyConfigButton, async () => {
      await copyText(JSON.stringify(payload, null, 2));
    });
    setManualMessage('Fallback extension config copied to clipboard.', false);
    showToast('Fallback extension config copied to clipboard.', { tone: 'success' });
  }

  async function saveCandidateReview(candidateKey, label, notes, clear) {
    if (!currentJobId || !selectedManualItemId) {
      setCandidateMessage('Select a row first.', true);
      showToast('Select a row first.', { tone: 'error' });
      return;
    }

    const activeButton = candidateReview.querySelector(clear
      ? `[data-candidate-clear="${CSS.escape(candidateKey)}"]`
      : `[data-candidate-review="${CSS.escape(candidateKey)}"][data-label-value="${CSS.escape(label)}"]`);

    try {
      await runElementAction(activeButton, async () => {
        const response = await fetch(apiUrl(`/api/jobs/${currentJobId}/items/${selectedManualItemId}/candidates/${encodeURIComponent(candidateKey)}/review`), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            label: clear ? '' : label,
            notes: notes || '',
            clear: !!clear,
          }),
        });

        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(body.error || 'Failed to save candidate review.');
        }

        const item = body.item || null;
        if (item) {
          currentItemsById.set(item.id, item);
          selectManualItem(item);
        }
      });
      const message = clear ? 'Candidate review cleared.' : 'Candidate review saved.';
      setCandidateMessage(message, false);
      showToast(message, { tone: 'success' });
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      setCandidateMessage(message, true);
      showToast(message, { tone: 'error' });
    }
  }

  form.addEventListener('submit', (event) => {
    handleSubmit(event).catch((error) => console.error(error));
  });

  manualForm.addEventListener('submit', (event) => {
    handleManualSubmit(event).catch((error) => console.error(error));
  });

  managerForm.addEventListener('submit', (event) => {
    handleReplaceJob(event).catch((error) => console.error(error));
  });

  manualCopyConfigButton.addEventListener('click', () => {
    copyManualConfig().catch((error) => {
      const message = error && error.message ? error.message : String(error);
      setManualMessage(message, true);
      showToast(message, { tone: 'error' });
    });
  });

  refreshJobsButton.addEventListener('click', () => {
    runElementAction(refreshJobsButton, async () => {
      if (currentJobId) {
        await refreshJob(currentJobId);
        return;
      }
      await refreshJobs();
    }).catch((error) => {
      showToast(error && error.message ? error.message : String(error), { tone: 'error' });
    });
  });

  workspaceTabs.forEach((button) => {
    button.addEventListener('click', () => {
      setWorkspaceTab(button.getAttribute('data-workspace-tab'));
    });
  });

  recentJobs.addEventListener('click', (event) => {
    const button = event.target.closest('[data-open-job]');
    if (button) {
      const jobId = button.getAttribute('data-open-job');
      if (!jobId) return;
      currentOffset = 0;
      runElementAction(button, () => refreshJob(jobId)).catch((error) => {
        showToast(error && error.message ? error.message : String(error), { tone: 'error' });
      });
      return;
    }

    const manageButton = event.target.closest('[data-manage-job]');
    if (manageButton) {
      const jobId = manageButton.getAttribute('data-manage-job');
      if (!jobId) return;
      currentOffset = 0;
      runElementAction(manageButton, async () => {
        await refreshJob(jobId);
        setWorkspaceTab('manager');
      }).catch((error) => {
        showToast(error && error.message ? error.message : String(error), { tone: 'error' });
      });
      return;
    }

    const resumeButton = event.target.closest('[data-resume-job]');
    if (resumeButton) {
      const jobId = resumeButton.getAttribute('data-resume-job');
      handleResumeJob(jobId, resumeButton).catch((error) => console.error(error));
      return;
    }

    const restartButton = event.target.closest('[data-restart-job]');
    if (restartButton) {
      const jobId = restartButton.getAttribute('data-restart-job');
      handleRestartJob(jobId, restartButton).catch((error) => console.error(error));
      return;
    }

    const deleteButton = event.target.closest('[data-delete-job]');
    if (deleteButton) {
      const jobId = deleteButton.getAttribute('data-delete-job');
      handleDeleteJob(jobId, deleteButton).catch((error) => console.error(error));
    }
  });

  jobItems.addEventListener('click', (event) => {
    const pageButton = event.target.closest('[data-page-action]');
    if (pageButton && currentJobId) {
      const action = pageButton.getAttribute('data-page-action');
      if (action === 'prev') {
        currentOffset = Math.max(0, currentOffset - pageSize);
      } else if (action === 'next') {
        currentOffset += pageSize;
      }
      refreshJob(currentJobId).catch((error) => console.error(error));
      return;
    }

    const manualButton = event.target.closest('[data-manual-item]');
    if (manualButton) {
      const itemId = manualButton.getAttribute('data-manual-item');
      if (!itemId) return;
      const item = currentItemsById.get(itemId) || null;
      selectManualItem(item, 'manual');
      if (!item) {
        setManualMessage('', false);
      } else {
        setManualMessage('Priming extension auto-match for this row...', false);
        primeManualTarget(item)
          .then(() => {
            setManualMessage('Extension auto-match primed for this row.', false);
          })
          .catch((error) => {
            setManualMessage(error.message || String(error), true);
          });
      }
      setCandidateMessage('', false);
      return;
    }

    const reviewButton = event.target.closest('[data-review-item]');
    if (!reviewButton) return;
    const itemId = reviewButton.getAttribute('data-review-item');
    if (!itemId) return;
    const item = currentItemsById.get(itemId) || null;
    selectManualItem(item, preferredReviewTab(item));
    setManualMessage('', false);
    setCandidateMessage('', false);
  });

  candidateReview.addEventListener('click', (event) => {
    const pageButton = event.target.closest('[data-candidate-page]');
    if (pageButton) {
      const action = pageButton.getAttribute('data-candidate-page');
      const item = selectedItem();
      if (!item || !Array.isArray(item.candidates) || !item.candidates.length) return;
      const totalPages = Math.max(1, Math.ceil(item.candidates.length / candidatePageSize));
      if (action === 'prev') {
        currentCandidatePage = Math.max(0, currentCandidatePage - 1);
      } else if (action === 'next') {
        currentCandidatePage = Math.min(totalPages - 1, currentCandidatePage + 1);
      }
      renderCandidateReview(item);
      renderScoringBreakdown(item);
      return;
    }

    const reviewButton = event.target.closest('[data-candidate-review]');
    if (reviewButton) {
      const candidateKey = reviewButton.getAttribute('data-candidate-review');
      const label = reviewButton.getAttribute('data-label-value');
      if (!candidateKey || !label) return;
      const notesField = document.getElementById(`candidate-notes-${candidateKey}`);
      const notes = notesField ? notesField.value.trim() : '';
      saveCandidateReview(candidateKey, label, notes, false).catch((error) => {
        setCandidateMessage(error.message || String(error), true);
      });
      return;
    }

    const clearButton = event.target.closest('[data-candidate-clear]');
    if (!clearButton) return;
    const candidateKey = clearButton.getAttribute('data-candidate-clear');
    if (!candidateKey) return;
    saveCandidateReview(candidateKey, '', '', true).catch((error) => {
      setCandidateMessage(error.message || String(error), true);
    });
  });

  scoringBreakdown.addEventListener('toggle', (event) => {
    const details = event.target;
    if (!(details instanceof HTMLDetailsElement)) return;
    const key = details.getAttribute('data-score-detail');
    if (!key) return;
    if (details.open) {
      scoreDetailOpenState.add(key);
    } else {
      scoreDetailOpenState.delete(key);
    }
  });

  downloadCandidateJsonButton.addEventListener('click', () => {
    downloadCandidateJson(selectedItem());
  });

  downloadCandidateCsvButton.addEventListener('click', () => {
    downloadCandidateCsv(selectedItem());
  });

  downloadSvgGraphLink.addEventListener('click', (event) => {
    handleGraphDownload(event, downloadSvgGraphLink, 'svg', 'SVG graph downloaded.');
  });

  downloadDotGraphLink.addEventListener('click', (event) => {
    handleGraphDownload(event, downloadDotGraphLink, 'dot', 'DOT graph downloaded.');
  });

  managerResumeButton.addEventListener('click', () => {
    handleResumeJob(currentJobId, managerResumeButton).catch((error) => console.error(error));
  });

  managerRestartButton.addEventListener('click', () => {
    handleRestartJob(currentJobId, managerRestartButton).catch((error) => console.error(error));
  });

  managerDeleteButton.addEventListener('click', () => {
    handleDeleteJob(currentJobId, managerDeleteButton).catch((error) => console.error(error));
  });

  managerClearJobsButton.addEventListener('click', () => {
    handleClearAllJobs(managerClearJobsButton).catch((error) => console.error(error));
  });

  if (confirmDialog) {
    confirmDialog.addEventListener('close', () => {
      if (!confirmResolver) return;
      const resolve = confirmResolver;
      confirmResolver = null;
      resolve(confirmDialog.returnValue === 'accept');
    });
  }

  setResourceDownloads();
  setDownloads(currentJobId);
  setWorkspaceTab('queue');
  renderWorkspaceSelection(null);
  renderCandidateReview(null);
  renderScoringBreakdown(null);
  renderJobManager(null);
  renderJobEvents([], { message: 'Select a job to view recent events.' });
  refreshJobs().catch((error) => console.error(error));
  if (currentJobId) {
    refreshJob(currentJobId).catch((error) => console.error(error));
  }
}());
