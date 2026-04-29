(function bootstrap() {
  const config = window.__APP_CONFIG__ || {};
  const apiBase = resolveApiBase(config.apiBaseUrl);

  const form = document.getElementById('upload-form');
  const fileInput = document.getElementById('csv-file');
  const urlColumnInput = document.getElementById('url-column');
  const candidateModeInput = document.getElementById('candidate-mode');
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
  const downloadBackupJson = document.getElementById('download-backup-json');
  const downloadBackupDb = document.getElementById('download-backup-db');
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
  const backupImportForm = document.getElementById('backup-import-form');
  const backupFileInput = document.getElementById('backup-file');
  const mergeForm = document.getElementById('job-merge-form');
  const mergeJobIdA = document.getElementById('merge-job-id-a');
  const mergeJobIdB = document.getElementById('merge-job-id-b');
  const mergeSourceFilename = document.getElementById('merge-source-filename');
  const mergeCandidateModeInput = document.getElementById('merge-candidate-mode');
  const mergeScanDelayInput = document.getElementById('merge-scan-delay-ms');
  const mergeScreenshotDelayInput = document.getElementById('merge-screenshot-delay-ms');
  const mergeMessage = document.getElementById('merge-message');
  const jobLabelerReview = document.getElementById('job-labeler-review');
  const jobLabelerMessage = document.getElementById('job-labeler-message');
  const jobLabelerReloadButton = document.getElementById('job-labeler-reload');
  const jobLabelerPrevButton = document.getElementById('job-labeler-prev');
  const jobLabelerNextButton = document.getElementById('job-labeler-next');
  const jobLabelerAutoAdvance = document.getElementById('job-labeler-auto-advance');
  const jobLabelerFilterUnlabeled = document.getElementById('job-labeler-filter-unlabeled');
  const jobLabelerJumpForm = document.getElementById('job-labeler-jump-form');
  const jobLabelerJumpPosition = document.getElementById('job-labeler-jump-position');
  const jobLabelerJumpButton = document.getElementById('job-labeler-jump-button');
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
  const managerCandidateModeInput = document.getElementById('manager-candidate-mode');
  const managerScanDelayInput = document.getElementById('manager-scan-delay-ms');
  const managerScreenshotDelayInput = document.getElementById('manager-screenshot-delay-ms');
  const managerReplaceFile = document.getElementById('manager-replace-file');
  const managerMessage = document.getElementById('manager-message');
  const managerResumeButton = document.getElementById('manager-resume-job');
  const managerResumeFailedButton = document.getElementById('manager-resume-failed-job');
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
  let currentJobEvents = [];
  let currentJobEventsPage = 0;
  const jobEventsPageSize = 12;
  let currentItemsById = new Map();
  let managerFormJobId = '';
  let confirmResolver = null;
  let jobLabelerLoadingJobId = '';
  let jobLabelerLoadingPromise = null;
  let jobLabelerTransition = null;
  let jobLabelerTransitionTimer = null;
  const pageSize = 50;
  // Load labeler rows in smaller chunks so opening the tab is immediate.
  const jobLabelerBatchSize = pageSize;
  const jobLabelerPrefetchThreshold = 8;
  const candidatePageSize = 1;
  const activePollIntervalMs = 4000;
  const terminalPollIntervalMs = 12000;
  const recentJobsPollIntervalMs = 15000;
  const actionStateDurationMs = 1400;
  const jobLabelerTransitionMs = 140;
  let pollHandle = null;
  let pollJobId = '';
  let pollIntervalMs = 0;
  let recentJobsPollHandle = null;
  let refreshJobToken = 0;
  const candidateMarkupCache = new Map();
  const candidateMarkupPending = new Set();
  const scoreDetailOpenState = new Set();
  const jobLabelerCache = new Map();
  let jobLabelerLoadToken = 0;

  function normalizeBaseUrl(value) {
    return String(value || '').trim().replace(/\/+$/g, '');
  }

  function isLoopbackHost(hostname) {
    return hostname === 'localhost'
      || hostname === '127.0.0.1'
      || hostname === '::1'
      || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname);
  }

  function resolveApiBase(explicitBase) {
    const configured = normalizeBaseUrl(explicitBase);
    if (configured) {
      return configured;
    }

    const { protocol, hostname, port, origin } = window.location;
    if (isLoopbackHost(hostname)) {
      const loopbackHost = hostname.includes(':') ? `[${hostname}]` : hostname;
      return port === '3000'
        ? origin
        : `${protocol}//${loopbackHost}:3000`;
    }

    if (hostname.startsWith('api.')) {
      return origin;
    }

    if (hostname.startsWith('www.')) {
      return `${protocol}//api.${hostname.slice(4)}`;
    }

    return `${protocol}//api.${hostname}`;
  }

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
      if (document.hidden) {
        return;
      }
      refreshJob(jobId, { skipRecentJobsRefresh: true }).catch((error) => {
        console.error(error);
      });
    }, intervalMs);
  }

  function pollIntervalForStatus(status) {
    return ['completed', 'completed_with_errors', 'failed'].includes(status)
      ? terminalPollIntervalMs
      : activePollIntervalMs;
  }

  function pickInitialJob(jobs) {
    if (!Array.isArray(jobs) || !jobs.length) {
      return null;
    }

    const preferredStatuses = ['running', 'queued', 'pending'];
    for (const status of preferredStatuses) {
      const match = jobs.find((job) => job && job.status === status);
      if (match) {
        return match;
      }
    }

    return jobs[0] || null;
  }

  function startRecentJobsPolling() {
    if (recentJobsPollHandle) {
      return;
    }

    recentJobsPollHandle = window.setInterval(() => {
      if (document.hidden) {
        return;
      }
      refreshJobs().catch((error) => {
        console.error(error);
      });
    }, recentJobsPollIntervalMs);
  }

  function stopRecentJobsPolling() {
    if (recentJobsPollHandle) {
      window.clearInterval(recentJobsPollHandle);
    }
    recentJobsPollHandle = null;
  }

  function setResourceDownloads() {
    downloadSampleCsv.href = apiUrl('/api/downloads/sample-sites-labeled.csv');
    downloadExtensionZip.href = apiUrl('/api/downloads/extension.zip');
    if (downloadBackupJson) {
      downloadBackupJson.href = apiUrl('/api/backups/export.json');
    }
    if (downloadBackupDb) {
      downloadBackupDb.href = apiUrl('/api/backups/export.db');
    }
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

  function formatCandidateMode(value) {
    const mode = String(value || 'default');
    if (mode === 'repetition_first') {
      return 'Research mode, repetition first';
    }
    return 'Default';
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

  function setJobLabelerMessage(text, isError) {
    jobLabelerMessage.textContent = text || '';
    jobLabelerMessage.className = isError ? 'message error' : 'message';
  }

  function setManagerMessage(text, isError) {
    managerMessage.textContent = text || '';
    managerMessage.className = isError ? 'message error' : 'message';
  }

  function setMergeMessage(text, isError) {
    if (!mergeMessage) return;
    mergeMessage.textContent = text || '';
    mergeMessage.className = isError ? 'message error' : 'message';
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

  function canResumeFailedJob(job) {
    if (!job) return false;
    return (Number(job.failed_count) || 0) > 0;
  }

  function resetCurrentJobSelection(options = {}) {
    currentJob = null;
    currentJobId = '';
    currentOffset = 0;
    selectedManualItemId = '';
    currentJobEvents = [];
    currentJobEventsPage = 0;
    currentItemsById = new Map();
    managerFormJobId = '';
    stopPolling();
    stopJobLabelerTransition();
    window.history.replaceState({}, '', window.location.pathname);
    renderSummary(null);
    renderItems([], null);
    renderWorkspaceSelection(null);
    renderCandidateReview(null);
    renderJobLabelerReview();
    renderScoringBreakdown(null);
    renderJobEvents([], { message: options.eventsMessage || 'Select a job to view recent events.' });
    renderJobManager(null);
    setDownloads('');
    setMessage(options.formMessage || '', false);
    setManualMessage('', false);
    setCandidateMessage('', false);
    setJobLabelerMessage('', false);
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
    if (activeWorkspaceTab === 'candidates') {
      renderCandidateReview(selectedItem());
      return;
    }
    if (activeWorkspaceTab === 'scoring') {
      renderScoringBreakdown(selectedItem());
      return;
    }
    if (activeWorkspaceTab === 'labeler') {
      renderJobLabelerReview();
    }
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
      `<div><strong>Scanner Mode:</strong> ${escapeHtml(formatCandidateMode(job.candidate_mode || job.candidateMode))}</div>`,
      ...(Array.isArray(job.source_job_ids) && job.source_job_ids.length
        ? [`<div><strong>Source Jobs:</strong> ${escapeHtml(job.source_job_ids.join(', '))}</div>`]
        : []),
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
    if (Array.isArray(events)) {
      currentJobEvents = events.slice();
    } else if (!Array.isArray(currentJobEvents)) {
      currentJobEvents = [];
    }

    if (options.resetPage !== false) {
      currentJobEventsPage = 0;
    }

    const message = options.message || (currentJobId ? 'No events recorded yet for this job.' : 'Select a job to view recent events.');
    if (!currentJobEvents.length) {
      jobEvents.className = options.isError ? 'event-list empty error' : 'event-list empty';
      jobEvents.textContent = message;
      return;
    }

    const totalPages = Math.max(1, Math.ceil(currentJobEvents.length / jobEventsPageSize));
    currentJobEventsPage = Math.max(0, Math.min(currentJobEventsPage, totalPages - 1));
    const startIndex = currentJobEventsPage * jobEventsPageSize;
    const pageEvents = currentJobEvents.slice(startIndex, startIndex + jobEventsPageSize);

    const rows = pageEvents.map((event) => {
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
    const pager = totalPages > 1
      ? `
        <div class="pager event-pager">
          <span>Showing ${escapeHtml(startIndex + 1)}-${escapeHtml(Math.min(startIndex + jobEventsPageSize, currentJobEvents.length))} of ${escapeHtml(currentJobEvents.length)}</span>
          <div class="pager-actions">
            <button class="secondary compact" type="button" data-event-page="prev" title="Show the previous page of job events." ${currentJobEventsPage > 0 ? '' : 'disabled'}>Previous</button>
            <button class="secondary compact" type="button" data-event-page="next" title="Show the next page of job events." ${(currentJobEventsPage + 1) < totalPages ? '' : 'disabled'}>Next</button>
          </div>
        </div>
      `
      : '';
    jobEvents.innerHTML = `${pager}${rows}`;
  }

  function reviewChip(item) {
    const chips = [];
    const candidateCount = Array.isArray(item.candidates) ? item.candidates.length : 0;
    const reviewSummary = item.candidate_review_summary || {};
    const heuristicSummary = item.scan_result && item.scan_result.candidate_heuristic_summary ? item.scan_result.candidate_heuristic_summary : null;
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

    if (heuristicSummary && heuristicSummary.total) {
      chips.push(`<span class="review-chip">heuristic ${escapeHtml(heuristicSummary.ugc || 0)}/${escapeHtml(heuristicSummary.total)}</span>`);
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
      ? `${resolvedTag ? `${resolvedTag} - ` : ''}${candidate.candidate_outer_html_length} chars`
      : '';

    markupSections.push(renderCandidateMarkupSection('Outer HTML', candidate.candidate_outer_html_excerpt || '', outerMeta, 'outer'));

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

  function renderCandidateMarkupDetails(candidate) {
    if (!candidate) return '';
    const markupSections = [];
    const resolvedTag = candidate.candidate_resolved_tag_name ? `${candidate.candidate_resolved_tag_name}` : '';
    const outerMeta = candidate.candidate_outer_html_length
      ? `${resolvedTag ? `${resolvedTag} - ` : ''}${candidate.candidate_outer_html_length} chars`
      : '';

    markupSections.push(renderCandidateMarkupSection('Outer HTML', candidate.candidate_outer_html_excerpt || '', outerMeta, 'outer'));

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
      (candidate.candidate_outer_html_excerpt && !candidate.candidate_outer_html_truncated)
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
      const labelerState = currentJobLabelerState();
      const activeEntry = currentJobLabelerEntry();
      if (
        activeWorkspaceTab === 'labeler'
        && labelerState
        && activeEntry
        && activeEntry.itemId === item.id
        && activeEntry.candidateKey === candidate.candidate_key
      ) {
        renderJobLabelerReview();
      }
    }
  }

  function currentJobLabelerState() {
    return currentJobId ? (jobLabelerCache.get(currentJobId) || null) : null;
  }

  function currentJobLabelerEntry() {
    const state = currentJobLabelerState();
    if (!state || !state.entries.length) return null;
    state.index = Math.max(0, Math.min(state.index || 0, state.entries.length - 1));
    return state.entries[state.index] || null;
  }

  function currentCandidateReviewSelection() {
    const item = selectedItem();
    if (!item || !Array.isArray(item.candidates) || !item.candidates.length) return null;

    const totalPages = Math.max(1, Math.ceil(item.candidates.length / candidatePageSize));
    const page = Math.max(0, Math.min(currentCandidatePage || 0, totalPages - 1));
    const candidate = item.candidates
      .slice(page * candidatePageSize, (page + 1) * candidatePageSize)[0] || null;
    const candidateKey = String(candidate && candidate.candidate_key || '').trim();

    if (!candidate || !candidateKey) return null;
    return {
      item,
      candidate,
      candidateKey,
      page,
      totalPages,
    };
  }

  function jobLabelerEntryKey(entry) {
    if (!entry) return '';
    return `${entry.itemId || ''}:${entry.candidateKey || ''}`;
  }

  function jobLabelerCandidateForEntry(state, entry) {
    if (!state || !entry) return { item: null, candidate: null };
    const item = state.itemsById.get(entry.itemId) || null;
    const candidates = Array.isArray(item && item.candidates) ? item.candidates : [];
    const candidate = candidates.find((value) => String(value.candidate_key || '') === entry.candidateKey) || null;
    return {
      item,
      candidate: candidate ? mergeCandidateMarkup(item, candidate) : null,
    };
  }

  function candidateReviewStatus(candidate) {
    const label = String(candidate && candidate.human_label || '').trim();
    if (!label) return 'unreviewed';
    return label;
  }

  function advanceCandidateReviewAfterSave(item, previousPage) {
    const activeItem = item || selectedItem();
    if (!activeItem || !Array.isArray(activeItem.candidates) || !activeItem.candidates.length) {
      return false;
    }

    const totalPages = Math.max(1, Math.ceil(activeItem.candidates.length / candidatePageSize));
    const nextPage = Math.min(Math.max(0, Number(previousPage) || 0) + 1, totalPages - 1);
    const advanced = nextPage > (Number(previousPage) || 0);
    currentCandidatePage = nextPage;
    renderCandidateReview(activeItem);
    renderScoringBreakdown(activeItem);
    return advanced;
  }

  function patchCandidateInItemMap(itemMap, itemId, candidateKey, updater) {
    if (!itemMap || typeof itemMap.get !== 'function' || typeof itemMap.set !== 'function') return null;
    const item = itemMap.get(itemId);
    if (!item) return null;
    const candidates = Array.isArray(item.candidates) ? item.candidates : [];
    const candidateIndex = candidates.findIndex((entry) => String(entry.candidate_key || '') === candidateKey);
    if (candidateIndex < 0) return null;
    const previousCandidate = candidates[candidateIndex];
    const patch = typeof updater === 'function' ? updater(previousCandidate) : updater;
    const nextCandidate = {
      ...previousCandidate,
      ...(patch || {}),
    };
    const nextCandidates = candidates.slice();
    nextCandidates[candidateIndex] = nextCandidate;
    const nextItem = {
      ...item,
      candidates: nextCandidates,
    };
    itemMap.set(itemId, nextItem);
    return {
      item: nextItem,
      candidate: nextCandidate,
      previousCandidate,
    };
  }

  function snapshotCandidateReviewState(candidate) {
    return {
      human_label: candidate && candidate.human_label ? candidate.human_label : '',
      human_notes: candidate && candidate.human_notes ? candidate.human_notes : '',
      human_reviewed_at: candidate && candidate.human_reviewed_at ? candidate.human_reviewed_at : '',
      human_review_source: candidate && candidate.human_review_source ? candidate.human_review_source : '',
      job_labeler_pending_save: !!(candidate && candidate.job_labeler_pending_save),
    };
  }

  function applyCandidateReviewSnapshot(itemMap, itemId, candidateKey, snapshot) {
    return patchCandidateInItemMap(itemMap, itemId, candidateKey, snapshot);
  }

  function rowSortValue(value) {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) return asNumber;
    return Number.MAX_SAFE_INTEGER;
  }

  function buildJobLabelerEntries(items) {
    return (items || [])
      .slice()
      .sort((left, right) => {
        const rowDelta = rowSortValue(left.row_number) - rowSortValue(right.row_number);
        if (rowDelta !== 0) return rowDelta;
        return String(left.id || '').localeCompare(String(right.id || ''));
      })
      .flatMap((item) => {
        const candidates = Array.isArray(item && item.candidates) ? item.candidates : [];
        return candidates.map((candidate, index) => ({
          itemId: item.id,
          candidateKey: String(candidate.candidate_key || ''),
          rowNumber: item.row_number,
          candidateRank: Number(candidate.candidate_rank) || (index + 1),
        }));
      })
      .filter((entry) => entry.itemId && entry.candidateKey)
      .sort((left, right) => {
        const rowDelta = rowSortValue(left.rowNumber) - rowSortValue(right.rowNumber);
        if (rowDelta !== 0) return rowDelta;
        const itemDelta = String(left.itemId || '').localeCompare(String(right.itemId || ''));
        if (itemDelta !== 0) return itemDelta;
        return left.candidateRank - right.candidateRank;
      });
  }

  function findNextUnreviewedLabelerIndex(state, startIndex) {
    if (!state || !state.entries.length) return -1;
    const start = Math.max(0, Number(startIndex) || 0);
    for (let index = start; index < state.entries.length; index += 1) {
      const { candidate } = jobLabelerCandidateForEntry(state, state.entries[index]);
      if (!candidateReviewStatus(candidate) || candidateReviewStatus(candidate) === 'unreviewed') {
        return index;
      }
    }
    return -1;
  }

  function findPrevUnreviewedLabelerIndex(state, beforeIndex) {
    if (!state || !state.entries.length) return -1;
    const end = Math.min(beforeIndex - 1, state.entries.length - 1);
    for (let index = end; index >= 0; index -= 1) {
      const { candidate } = jobLabelerCandidateForEntry(state, state.entries[index]);
      if (!candidateReviewStatus(candidate) || candidateReviewStatus(candidate) === 'unreviewed') return index;
    }
    return -1;
  }

  function isFilteringUnlabeled() {
    return !!(jobLabelerFilterUnlabeled && jobLabelerFilterUnlabeled.checked);
  }

  function setJobLabelerNavState(state) {
    const disabled = !state || !state.entries.length;
    const transitioning = !!(jobLabelerTransition && jobLabelerTransition.jobId === currentJobId);
    const hasMore = !!(state && state.hasMore);
    const loadingMore = !!(state && state.loadingMorePromise);
    const currentIndex = Math.max(0, Number(state && state.index) || 0);
    const lastIndex = Math.max(0, (state && state.entries ? state.entries.length : 0) - 1);
    const filtering = isFilteringUnlabeled();
    let atEnd;
    if (filtering) {
      const nextUnreviewed = findNextUnreviewedLabelerIndex(state, currentIndex + 1);
      atEnd = nextUnreviewed < 0 && !(hasMore);
    } else {
      atEnd = currentIndex >= lastIndex;
    }
    const atStart = filtering
      ? findPrevUnreviewedLabelerIndex(state, currentIndex) < 0
      : currentIndex <= 0;
    jobLabelerPrevButton.disabled = disabled || transitioning || atStart;
    jobLabelerNextButton.disabled = disabled
      || transitioning
      || (!hasMore && atEnd)
      || (loadingMore && atEnd);
    if (jobLabelerJumpPosition) {
      jobLabelerJumpPosition.disabled = disabled || transitioning || loadingMore;
    }
    if (jobLabelerJumpButton) {
      jobLabelerJumpButton.disabled = disabled || transitioning || loadingMore;
    }
  }

  function stopJobLabelerTransition() {
    if (jobLabelerTransitionTimer) {
      window.clearTimeout(jobLabelerTransitionTimer);
    }
    jobLabelerTransitionTimer = null;
    jobLabelerTransition = null;
  }

  function startJobLabelerTransition(message) {
    stopJobLabelerTransition();
    jobLabelerTransition = {
      jobId: currentJobId,
      message: message || 'Saving label...',
    };
    renderJobLabelerReview();
    jobLabelerTransitionTimer = window.setTimeout(() => {
      jobLabelerTransitionTimer = null;
      jobLabelerTransition = null;
      renderJobLabelerReview();
    }, jobLabelerTransitionMs);
  }

  function moveJobLabelerEntryToRetryPosition(state, entryKey) {
    if (!state || !entryKey) return;
    const fromIndex = state.entries.findIndex((entry) => jobLabelerEntryKey(entry) === entryKey);
    if (fromIndex < 0) return;
    const [entry] = state.entries.splice(fromIndex, 1);
    if (fromIndex < state.index) {
      state.index = Math.max(0, (state.index || 0) - 1);
    }
    const insertAt = Math.min(state.entries.length, (state.index || 0) + 1);
    state.entries.splice(insertAt, 0, entry);
  }

  function createJobLabelerState(options = {}) {
    return {
      itemsById: new Map(),
      entries: [],
      index: 0,
      loadedRows: 0,
      totalRows: Math.max(0, Number(options.totalRows) || 0),
      nextOffset: 0,
      hasMore: false,
      loadingMorePromise: null,
      focusEntryKey: String(options.focusEntryKey || ''),
      pendingAdvanceFromIndex: -1,
    };
  }

  function findJobLabelerEntryIndex(state, entryKey) {
    if (!state || !entryKey) return -1;
    return state.entries.findIndex((entry) => jobLabelerEntryKey(entry) === entryKey);
  }

  function resolveJobLabelerSelection(state) {
    if (!state) return false;

    if (state.pendingAdvanceFromIndex >= 0) {
      const nextUnreviewed = findNextUnreviewedLabelerIndex(state, state.pendingAdvanceFromIndex);
      if (nextUnreviewed >= 0) {
        state.index = nextUnreviewed;
        state.pendingAdvanceFromIndex = -1;
        return true;
      }
    }

    return false;
  }

  function pickInitialJobLabelerIndex(state) {
    if (!state) return -1;

    if (state.focusEntryKey) {
      const focusIndex = findJobLabelerEntryIndex(state, state.focusEntryKey);
      if (focusIndex >= 0) {
        state.focusEntryKey = '';
        return focusIndex;
      }
      return -1;
    }

    const firstUnreviewed = findNextUnreviewedLabelerIndex(state, 0);
    if (firstUnreviewed >= 0) {
      return firstUnreviewed;
    }
    return -1;
  }

  function appendJobLabelerBatch(state, batchItems, pagination) {
    if (!state) return 0;

    const items = Array.isArray(batchItems) ? batchItems : [];
    items.forEach((item) => {
      if (item && item.id) {
        state.itemsById.set(item.id, item);
      }
    });

    const entries = buildJobLabelerEntries(items);
    if (entries.length) {
      state.entries.push(...entries);
    }

    state.loadedRows += items.length;

    const totalRows = Math.max(0, Number(pagination && pagination.total) || 0);
    if (totalRows) {
      state.totalRows = Math.max(state.totalRows || 0, totalRows);
    }

    const offset = Math.max(0, Number(pagination && pagination.offset) || state.nextOffset || 0);
    const limit = Math.max(1, Number(pagination && pagination.limit) || items.length || jobLabelerBatchSize);
    state.nextOffset = offset + items.length;
    state.hasMore = state.totalRows ? state.nextOffset < state.totalRows : items.length >= limit;

    resolveJobLabelerSelection(state);
    return entries.length;
  }

  async function fetchJobLabelerBatch(jobId, offset, limit) {
    const body = await fetchJson(`/api/jobs/${jobId}?limit=${limit}&offset=${offset}`);
    return {
      items: Array.isArray(body && body.items) ? body.items : [],
      pagination: body && body.pagination ? body.pagination : { limit, offset, total: 0 },
    };
  }

  async function loadNextJobLabelerBatch(jobId, state) {
    if (!state || !jobId) return 0;
    if (!state.hasMore) return 0;
    if (state.loadingMorePromise) {
      return state.loadingMorePromise;
    }

    state.loadingMorePromise = (async () => {
      const { items, pagination } = await fetchJobLabelerBatch(jobId, state.nextOffset, jobLabelerBatchSize);
      return appendJobLabelerBatch(state, items, pagination);
    })();

    try {
      return await state.loadingMorePromise;
    } finally {
      state.loadingMorePromise = null;
      if (currentJobId === jobId && currentJobLabelerState() === state && activeWorkspaceTab === 'labeler') {
        renderJobLabelerReview();
      }
    }
  }

  function maybePrefetchJobLabelerEntries(jobId) {
    const state = currentJobLabelerState();
    if (!state || currentJobId !== jobId || activeWorkspaceTab !== 'labeler') return null;
    if (!state.hasMore || state.loadingMorePromise) return null;

    const remaining = Math.max(0, (state.entries.length - 1) - Math.max(0, state.index || 0));
    if (remaining > jobLabelerPrefetchThreshold) return null;

    const promise = loadNextJobLabelerBatch(jobId, state);
    promise.catch((error) => {
      console.error(error);
    }).finally(() => {
      if (currentJobId === jobId && currentJobLabelerState() === state && activeWorkspaceTab === 'labeler') {
        maybePrefetchJobLabelerEntries(jobId);
      }
    });
    return promise;
  }

  async function ensureJobLabelerEntriesForIndex(jobId, state, targetIndex) {
    if (!state) return false;
    while (state.hasMore && targetIndex >= state.entries.length) {
      await loadNextJobLabelerBatch(jobId, state);
    }
    return targetIndex < state.entries.length;
  }

  function invalidateJobLabelerCache(jobId) {
    if (!jobId) return;
    jobLabelerCache.delete(jobId);
    if (jobLabelerLoadingJobId === jobId) {
      jobLabelerLoadToken += 1;
      jobLabelerLoadingJobId = '';
      jobLabelerLoadingPromise = null;
    }
    if (jobLabelerTransition && jobLabelerTransition.jobId === jobId) {
      stopJobLabelerTransition();
    }
  }

  async function loadJobLabelerState(jobId, force) {
    if (!jobId) return null;
    if (!force && jobLabelerCache.has(jobId)) {
      return jobLabelerCache.get(jobId);
    }
    if (!force && jobLabelerLoadingJobId === jobId && jobLabelerLoadingPromise) {
      return jobLabelerLoadingPromise;
    }

    const existing = jobLabelerCache.get(jobId);
    const existingEntry = existing && existing.entries[existing.index || 0]
      ? `${existing.entries[existing.index || 0].itemId}:${existing.entries[existing.index || 0].candidateKey}`
      : '';
    const total = Math.max(0, Number(currentJob && currentJob.id === jobId ? currentJob.total_urls : 0) || 0);
    jobLabelerLoadingJobId = jobId;
    const loadToken = ++jobLabelerLoadToken;
    jobLabelerLoadingPromise = (async () => {
      const state = createJobLabelerState({
        totalRows: total,
        focusEntryKey: existingEntry,
      });
      let offset = 0;
      do {
        const { items, pagination } = await fetchJobLabelerBatch(jobId, offset, jobLabelerBatchSize);
        if (jobLabelerLoadToken !== loadToken || jobLabelerLoadingJobId !== jobId) {
          return null;
        }
        appendJobLabelerBatch(state, items, pagination);

        const resolvedIndex = pickInitialJobLabelerIndex(state);
        if (resolvedIndex >= 0) {
          state.index = resolvedIndex;
          break;
        }

        if (!state.hasMore) {
          break;
        }
        offset = state.nextOffset;
      } while (true);

      if (state.focusEntryKey) {
        const fallbackIndex = findNextUnreviewedLabelerIndex(state, 0);
        state.index = fallbackIndex >= 0 ? fallbackIndex : 0;
        state.focusEntryKey = '';
      }
      if (!state.entries.length) {
        state.index = 0;
      }

      if (jobLabelerLoadToken !== loadToken || jobLabelerLoadingJobId !== jobId) {
        return null;
      }
      jobLabelerCache.set(jobId, state);
      return state;
    })();

    try {
      return await jobLabelerLoadingPromise;
    } finally {
      if (jobLabelerLoadToken === loadToken && jobLabelerLoadingJobId === jobId) {
        jobLabelerLoadingJobId = '';
        jobLabelerLoadingPromise = null;
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

  function candidateHeuristicLabel(candidate) {
    const label = String(candidate && candidate.heuristic_pseudo_label || '').trim();
    if (label) return label;
    if (candidate && candidate.detected) return 'ugc';
    if (candidate && (candidate.repeated_structure_support || Number(candidate.score) >= 10)) return 'uncertain';
    return 'not_ugc';
  }

  function candidateHeuristicReason(candidate) {
    return String(candidate && candidate.heuristic_pseudo_reason || candidate && candidate.acceptance_gate_reason || '').trim();
  }

  function heuristicLabelText(label) {
    if (label === 'ugc') return 'system: ugc';
    if (label === 'not_ugc') return 'system: not ugc';
    if (label === 'uncertain') return 'system: uncertain';
    return 'system: unknown';
  }

  function heuristicLabelClass(label) {
    if (label === 'ugc') return 'good';
    if (label === 'not_ugc') return 'bad';
    if (label === 'uncertain') return 'warn';
    return '';
  }

  function summarizeCandidateHeuristics(candidates) {
    return (Array.isArray(candidates) ? candidates : []).reduce((summary, candidate) => {
      const label = candidateHeuristicLabel(candidate);
      summary.total += 1;
      if (label === 'ugc') summary.ugc += 1;
      else if (label === 'not_ugc') summary.not_ugc += 1;
      else summary.uncertain += 1;
      if (candidate && candidate.detected) summary.detected += 1;
      if (candidate && candidate.acceptance_gate_passed) summary.gate_passed += 1;
      if (candidate && candidate.repeated_structure_support) summary.repeating_structure += 1;
      return summary;
    }, {
      total: 0,
      ugc: 0,
      not_ugc: 0,
      uncertain: 0,
      detected: 0,
      gate_passed: 0,
      repeating_structure: 0,
    });
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
    const heuristicSummary = scanResult.candidate_heuristic_summary || summarizeCandidateHeuristics(item.candidates);
    workspaceSelection.className = 'workspace-selection';
    workspaceSelection.innerHTML = [
      `<div><strong>Row:</strong> ${escapeHtml(item.row_number)}</div>`,
      `<div><strong>Source:</strong> ${escapeHtml(item.analysis_source || 'automated')}</div>`,
      `<div><strong>UGC:</strong> ${item.ugc_detected ? 'yes' : 'no'}</div>`,
      `<div><strong>Candidates:</strong> ${escapeHtml(Array.isArray(item.candidates) ? item.candidates.length : 0)}</div>`,
      `<div><strong>Reviewed:</strong> ${escapeHtml(reviewSummary.total ?? 0)}</div>`,
      `<div><strong>Selection Limit:</strong> ${escapeHtml(scanResult.candidate_selection_limit ?? (Array.isArray(item.candidates) ? item.candidates.length : 0))}</div>`,
      `<div><strong>Artifact Limit:</strong> ${escapeHtml(scanResult.candidate_review_artifact_limit ?? 5)}</div>`,
      `<div><strong>Heuristic UGC:</strong> ${escapeHtml(heuristicSummary.ugc ?? 0)}</div>`,
      `<div><strong>Heuristic Uncertain:</strong> ${escapeHtml(heuristicSummary.uncertain ?? 0)}</div>`,
      `<div><strong>Heuristic Not UGC:</strong> ${escapeHtml(heuristicSummary.not_ugc ?? 0)}</div>`,
      `<div><strong>Heuristic Detected:</strong> ${escapeHtml(heuristicSummary.detected ?? 0)}</div>`,
      `<div><strong>Gate Passed:</strong> ${escapeHtml(heuristicSummary.gate_passed ?? 0)}</div>`,
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

  function normalizeScanBinaryLabel(label) {
    const normalized = String(label || '').trim();
    if (normalized === 'comment_region') return 1;
    if (normalized === 'not_comment_region') return 0;
    return null;
  }

  function normalizeScanSystemLabel(candidate) {
    const label = candidateHeuristicLabel(candidate);
    if (label === 'ugc') return 1;
    if (label === 'not_ugc') return 0;
    return null;
  }

  function summarizeScanCandidateLabels(candidates) {
    return (Array.isArray(candidates) ? candidates : []).reduce((summary, candidate) => {
      summary.total += 1;

      const humanLabel = String(candidate && candidate.human_label || '').trim();
      const actual = normalizeScanBinaryLabel(humanLabel);
      if (actual === 1) {
        summary.comment_region += 1;
        summary.human_binary_reviewed += 1;
      } else if (actual === 0) {
        summary.not_comment_region += 1;
        summary.human_binary_reviewed += 1;
      } else if (humanLabel === 'uncertain') {
        summary.uncertain += 1;
        summary.human_reviewed += 1;
      } else {
        summary.unlabeled += 1;
      }

      const predicted = normalizeScanSystemLabel(candidate);
      if (predicted === 1) summary.system_ugc += 1;
      else if (predicted === 0) summary.system_not_ugc += 1;
      else summary.system_uncertain += 1;

      if (actual === null || predicted === null) {
        return summary;
      }

      summary.compared += 1;
      if (actual === 1 && predicted === 1) summary.true_positive += 1;
      else if (actual === 0 && predicted === 0) summary.true_negative += 1;
      else if (actual === 0 && predicted === 1) summary.false_positive += 1;
      else if (actual === 1 && predicted === 0) summary.false_negative += 1;

      return summary;
    }, {
      total: 0,
      comment_region: 0,
      not_comment_region: 0,
      uncertain: 0,
      unlabeled: 0,
      human_reviewed: 0,
      human_binary_reviewed: 0,
      system_ugc: 0,
      system_not_ugc: 0,
      system_uncertain: 0,
      compared: 0,
      true_positive: 0,
      true_negative: 0,
      false_positive: 0,
      false_negative: 0,
    });
  }

  function renderScanProgressCard(candidates, summary, options = {}) {
    const ordered = (Array.isArray(candidates) ? candidates : [])
      .slice()
      .sort((left, right) => Number(left.candidate_rank || 0) - Number(right.candidate_rank || 0));
    if (!ordered.length) {
      return `
        <article class="analysis-card empty">
          <p class="candidate-copy">No candidates were stored for this row yet.</p>
        </article>
      `;
    }

    const limit = Math.max(1, Number(options.limit) || 6);
    const visible = ordered.slice(0, limit);
    const maxScore = Math.max(1, ...visible.map((candidate) => Math.max(0, Number(candidate.score) || 0)));

    return `
      <article class="analysis-card">
        <p class="eyebrow subtle">${escapeHtml(options.eyebrow || 'Pattern Graph')}</p>
        <h3>${escapeHtml(options.title || 'Candidate Score Progression')}</h3>
        <p class="candidate-copy">${escapeHtml(options.copy || `Showing ${visible.length} of ${ordered.length} candidates in stored rank order.`)}</p>
        <div class="analysis-bar-stack">
          ${visible.map((candidate, index) => {
            const score = Number(candidate.score) || 0;
            const width = maxScore > 0 ? Math.max(0, Math.min(100, (Math.max(0, score) / maxScore) * 100)) : 0;
            const humanText = humanLabelText(candidate.human_label) || 'human: unreviewed';
            const heuristicLabel = candidateHeuristicLabel(candidate);
            const heuristicText = heuristicLabelText(heuristicLabel);
            const tone = humanLabelClass(candidate.human_label) || heuristicLabelClass(heuristicLabel) || '';
            return `
              <div class="analysis-bar-row">
                <div class="analysis-bar-meta">
                  <span class="candidate-pill">#${escapeHtml(candidate.candidate_rank || index + 1)}</span>
                  <span class="candidate-pill ${humanLabelClass(candidate.human_label)}">${escapeHtml(humanText)}</span>
                  <span class="candidate-pill ${heuristicLabelClass(heuristicLabel)}">${escapeHtml(heuristicText)}</span>
                </div>
                <div class="analysis-bar-track">
                  <span class="analysis-bar-fill ${escapeHtml(tone)}" style="width:${width}%"></span>
                </div>
                <div class="analysis-bar-value">${escapeHtml(formatMetricValue(score))}</div>
              </div>
            `;
          }).join('')}
        </div>
        <div class="summary tight-summary">
          <div><strong>Reviewed:</strong> ${escapeHtml(summary.human_binary_reviewed + summary.uncertain)}</div>
          <div><strong>Comment:</strong> ${escapeHtml(summary.comment_region)}</div>
          <div><strong>Not Comment:</strong> ${escapeHtml(summary.not_comment_region)}</div>
          <div><strong>Uncertain:</strong> ${escapeHtml(summary.uncertain)}</div>
          <div><strong>Unlabeled:</strong> ${escapeHtml(summary.unlabeled)}</div>
          <div><strong>System UGC:</strong> ${escapeHtml(summary.system_ugc)}</div>
          <div><strong>System Not UGC:</strong> ${escapeHtml(summary.system_not_ugc)}</div>
          <div><strong>System Uncertain:</strong> ${escapeHtml(summary.system_uncertain)}</div>
        </div>
      </article>
    `;
  }

  function renderScanConfusionCard(summary, options = {}) {
    const truePositive = Math.max(0, Number(summary && summary.true_positive) || 0);
    const trueNegative = Math.max(0, Number(summary && summary.true_negative) || 0);
    const falsePositive = Math.max(0, Number(summary && summary.false_positive) || 0);
    const falseNegative = Math.max(0, Number(summary && summary.false_negative) || 0);
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

    if (!compared) {
      return `
        <article class="analysis-card empty">
          <p class="eyebrow subtle">${escapeHtml(options.eyebrow || 'Agreement')}</p>
          <h3>${escapeHtml(options.title || 'Human vs System Confusion Matrix')}</h3>
          <p class="candidate-copy">${escapeHtml(options.emptyText || 'No binary human labels are available yet. Label comment and not-comment rows to populate this matrix.')}</p>
        </article>
      `;
    }

    return `
      <article class="analysis-card">
        <p class="eyebrow subtle">${escapeHtml(options.eyebrow || 'Agreement')}</p>
        <h3>${escapeHtml(options.title || 'Human vs System Confusion Matrix')}</h3>
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
          <div><strong>Accuracy:</strong> ${escapeHtml(formatMetricValue(accuracy))}</div>
          <div><strong>Precision:</strong> ${escapeHtml(formatMetricValue(precision))}</div>
          <div><strong>Recall:</strong> ${escapeHtml(formatMetricValue(recall))}</div>
          <div><strong>F1:</strong> ${escapeHtml(formatMetricValue(f1))}</div>
          <div><strong>System uncertain:</strong> ${escapeHtml(summary.system_uncertain || 0)}</div>
        </div>
      </article>
    `;
  }

  function renderScanInsightGrid(candidates, options = {}) {
    const summary = summarizeScanCandidateLabels(candidates);
    return `
      <div class="analysis-grid">
        ${renderScanProgressCard(candidates, summary, options)}
        ${renderScanConfusionCard(summary, options)}
      </div>
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
      'heuristic_pseudo_label',
      'heuristic_pseudo_confidence',
      'heuristic_pseudo_reason',
      'heuristic_pseudo_source',
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
    const scanResult = item.scan_result || {};
    const payload = {
      job_id: item.job_id || currentJobId || '',
      item_id: item.id || '',
      row_number: item.row_number,
      normalized_url: item.normalized_url || '',
      final_url: item.final_url || '',
      analysis_source: item.analysis_source || '',
      ugc_detected: !!item.ugc_detected,
      candidate_review_summary: item.candidate_review_summary || {},
      candidate_heuristic_summary: scanResult.candidate_heuristic_summary || summarizeCandidateHeuristics(item.candidates),
      candidate_selection_limit: scanResult.candidate_selection_limit ?? '',
      candidate_review_artifact_limit: scanResult.candidate_review_artifact_limit ?? '',
      heuristic_best_candidate_key: scanResult.heuristic_best_candidate_key || '',
      heuristic_best_candidate_label: scanResult.heuristic_best_candidate_label || '',
      heuristic_best_candidate_reason: scanResult.heuristic_best_candidate_reason || '',
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
    const heuristicSummary = scanResult.candidate_heuristic_summary || summarizeCandidateHeuristics(candidates);
    if (!candidates.length) {
      candidateReview.className = 'candidate-review empty';
      const alreadyScanned = item.status === 'completed' || item.status === 'failed'
        || item.analysis_source === 'manual_snapshot'
        || !!(item.manual_html_url || item.manual_raw_html_url)
        || !!(item.scan_result);
      candidateReview.textContent = alreadyScanned
        ? 'No candidate regions were detected in this scan. The page may have been inaccessible, blocked, or does not contain recognisable UGC structure.'
        : 'This row does not have candidate regions yet. Run the scan or upload a manual snapshot first.';
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
      const heuristicLabel = candidateHeuristicLabel(candidate);
      const heuristicClass = heuristicLabelClass(heuristicLabel);
      const heuristicText = heuristicLabelText(heuristicLabel);
      const heuristicReason = candidateHeuristicReason(candidate);
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
              <span class="candidate-pill ${heuristicClass}">${escapeHtml(heuristicText)}</span>
              <span class="candidate-pill">${escapeHtml(candidate.keyword_evidence_strength || 'none')}</span>
              <span class="candidate-pill ${candidate.acceptance_gate_passed ? 'good' : 'bad'}">gate ${candidate.acceptance_gate_passed ? 'pass' : 'fail'}</span>
              ${candidate.detected ? '<span class="candidate-pill good">detected</span>' : ''}
              ${label ? `<span class="candidate-pill ${labelClass}">${escapeHtml(label)}</span>` : ''}
            </div>
            <p class="candidate-copy">${escapeHtml(candidate.sample_text || 'No sample text available for this candidate.')}</p>
            <p class="candidate-copy mono">${escapeHtml(candidate.xpath || candidate.css_path || '')}</p>
            ${heuristicReason ? `<p class="candidate-copy"><strong>System Cue:</strong> ${escapeHtml(heuristicReason)}</p>` : ''}
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
        <div><strong>Selection Limit:</strong> ${escapeHtml(scanResult.candidate_selection_limit ?? candidates.length)}</div>
        <div><strong>Artifact Limit:</strong> ${escapeHtml(scanResult.candidate_review_artifact_limit ?? 5)}</div>
        <div><strong>Reviewed:</strong> ${escapeHtml(summary.total ?? 0)}</div>
        <div><strong>Comment Region:</strong> ${escapeHtml(summary.comment_region ?? 0)}</div>
        <div><strong>Not Comment:</strong> ${escapeHtml(summary.not_comment_region ?? 0)}</div>
        <div><strong>Uncertain:</strong> ${escapeHtml(summary.uncertain ?? 0)}</div>
        <div><strong>Heuristic UGC:</strong> ${escapeHtml(heuristicSummary.ugc ?? 0)}</div>
        <div><strong>Heuristic Uncertain:</strong> ${escapeHtml(heuristicSummary.uncertain ?? 0)}</div>
        <div><strong>Heuristic Not UGC:</strong> ${escapeHtml(heuristicSummary.not_ugc ?? 0)}</div>
        <div><strong>Heuristic Detected:</strong> ${escapeHtml(heuristicSummary.detected ?? 0)}</div>
        <div><strong>Gate Passed:</strong> ${escapeHtml(heuristicSummary.gate_passed ?? 0)}</div>
      </div>
      ${renderScanInsightGrid(candidates, {
        eyebrow: 'Scan Pattern',
        title: 'Candidate Score Progression',
        copy: 'The chart shows the stored scan order, while the matrix compares human labels against the system cue for the same row.',
        limit: 6,
      })}
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

  function getJobLabelerCandidates(state) {
    return (Array.isArray(state && state.entries) ? state.entries : [])
      .map((entry) => {
        const resolved = jobLabelerCandidateForEntry(state, entry);
        return resolved && resolved.candidate ? resolved.candidate : null;
      })
      .filter(Boolean);
  }

  function renderJobLabelerSummary(state) {
    const itemsWithCandidates = new Set();
    let reviewed = 0;
    let commentRegion = 0;
    let notComment = 0;
    let uncertain = 0;
    const loadingRows = state.hasMore || state.loadingMorePromise
      ? `<div><strong>Rows Loaded:</strong> ${escapeHtml(state.loadedRows || 0)}${state.totalRows ? ` / ${escapeHtml(state.totalRows)}` : ''}</div>`
      : '';

    state.entries.forEach((entry) => {
      itemsWithCandidates.add(entry.itemId);
      const { candidate } = jobLabelerCandidateForEntry(state, entry);
      const status = candidateReviewStatus(candidate);
      if (status === 'unreviewed') return;
      reviewed += 1;
      if (status === 'comment_region') commentRegion += 1;
      if (status === 'not_comment_region') notComment += 1;
      if (status === 'uncertain') uncertain += 1;
    });

    const totalUnreviewed = state.entries.length - reviewed;
    let positionLine;
    if (isFilteringUnlabeled()) {
      const unreviewedUpToCursor = state.entries.slice(0, (state.index || 0) + 1).filter((entry) => {
        const { candidate } = jobLabelerCandidateForEntry(state, entry);
        return !candidateReviewStatus(candidate) || candidateReviewStatus(candidate) === 'unreviewed';
      }).length;
      positionLine = `<div><strong>Unlabeled Position:</strong> ${escapeHtml(unreviewedUpToCursor)} / ${escapeHtml(totalUnreviewed)}${state.hasMore ? '+' : ''}</div>`;
    } else {
      positionLine = `<div><strong>Cursor Position:</strong> ${escapeHtml((state.index || 0) + 1)} / ${escapeHtml(state.entries.length)}</div>`;
    }

    return `
      <div class="summary">
        <div><strong>Rows With Candidates:</strong> ${escapeHtml(itemsWithCandidates.size)}</div>
        <div><strong>Total Candidates:</strong> ${escapeHtml(state.entries.length)}</div>
        ${loadingRows}
        <div><strong>Reviewed:</strong> ${escapeHtml(reviewed)}</div>
        <div><strong>Remaining:</strong> ${escapeHtml(totalUnreviewed)}</div>
        <div><strong>Comment Region:</strong> ${escapeHtml(commentRegion)}</div>
        <div><strong>Not Comment:</strong> ${escapeHtml(notComment)}</div>
        <div><strong>Uncertain:</strong> ${escapeHtml(uncertain)}</div>
        ${positionLine}
      </div>
    `;
  }

  function renderJobLabelerReview() {
    if (!jobLabelerReview) return;
    if (!currentJobId) {
      jobLabelerReview.className = 'candidate-review empty';
      jobLabelerReview.textContent = 'Select a job, then open Labeler to build a batched review queue from that job.';
      setJobLabelerNavState(null);
      return;
    }

    if (jobLabelerLoadingJobId === currentJobId && jobLabelerLoadingPromise) {
      jobLabelerReview.className = 'candidate-review empty';
      jobLabelerReview.textContent = 'Loading the first candidate batch across the selected job...';
      setJobLabelerNavState(null);
      return;
    }

    const state = currentJobLabelerState();
    if (!state) {
      jobLabelerReview.className = 'candidate-review empty';
      jobLabelerReview.textContent = 'Open Labeler to load a batched review queue.';
      setJobLabelerNavState(null);
      return;
    }

    if (!state.entries.length) {
      jobLabelerReview.className = 'candidate-review empty';
      jobLabelerReview.textContent = 'This job does not have candidate screenshots to label yet.';
      setJobLabelerNavState(state);
      return;
    }

    if (jobLabelerTransition && jobLabelerTransition.jobId === currentJobId) {
      jobLabelerReview.className = 'candidate-review';
      jobLabelerReview.innerHTML = `
        ${renderJobLabelerSummary(state)}
        ${renderScanInsightGrid(getJobLabelerCandidates(state), {
          eyebrow: 'Job Pattern',
          title: 'Job-Wide Candidate Progression',
          copy: 'This chart updates as you label the queue and shows where human labels agree or disagree with the system cue.',
          limit: 6,
        })}
        <div class="job-labeler-transition-card">
          <div class="job-labeler-transition-spinner" aria-hidden="true"></div>
          <p class="candidate-copy"><strong>${escapeHtml(jobLabelerTransition.message || 'Saving label...')}</strong></p>
          <p class="candidate-copy">Preparing the next candidate...</p>
        </div>
      `;
      setJobLabelerNavState(state);
      return;
    }

    state.index = Math.max(0, Math.min(state.index || 0, state.entries.length - 1));
    const entry = state.entries[state.index];
    const { item, candidate } = jobLabelerCandidateForEntry(state, entry);
    if (!item || !candidate) {
      jobLabelerReview.className = 'candidate-review empty';
      jobLabelerReview.textContent = 'The current candidate could not be resolved from the loaded job cache. Reload the queue and try again.';
      setJobLabelerNavState(state);
      return;
    }

    ensureCandidateMarkup(item, candidate).catch((error) => console.error(error));
    const noteId = 'job-labeler-notes';
    const label = humanLabelText(candidate.human_label);
    const labelClass = humanLabelClass(candidate.human_label);
    const heuristicLabel = candidateHeuristicLabel(candidate);
    const heuristicClass = heuristicLabelClass(heuristicLabel);
    const heuristicText = heuristicLabelText(heuristicLabel);
    const heuristicReason = candidateHeuristicReason(candidate);
    const matchedSignals = renderSignalList(candidate.matched_signals, 'good');
    const penaltySignals = renderSignalList(candidate.penalty_signals, 'bad');
    const loadingNote = state.loadingMorePromise
      ? '<p class="candidate-copy"><strong>Loading more candidates in the background.</strong></p>'
      : '';

    jobLabelerReview.className = 'candidate-review';
    jobLabelerReview.innerHTML = `
      ${renderJobLabelerSummary(state)}
      ${renderScanInsightGrid(getJobLabelerCandidates(state), {
        eyebrow: 'Job Pattern',
        title: 'Job-Wide Candidate Progression',
        copy: 'This chart updates as you label the queue and shows where human labels agree or disagree with the system cue.',
        limit: 6,
      })}
      ${loadingNote}
      <div class="candidate-toolbar job-labeler-toolbar">
        <span class="candidate-page-copy">Row ${escapeHtml(item.row_number || '')} • Candidate rank ${escapeHtml(candidate.candidate_rank || entry.candidateRank || '')}</span>
        <div class="candidate-pager">
          <span class="candidate-page-copy">${escapeHtml(item.analysis_source || 'automated')}</span>
          <span class="candidate-page-copy">${escapeHtml(item.final_url || item.normalized_url || '')}</span>
        </div>
      </div>
      <div class="candidate-grid">
        <article class="candidate-card ${candidate.human_label ? 'active-review' : ''}">
          <div class="job-labeler-stage">
            ${renderCandidateVisual(candidate, {
              imageClass: 'candidate-shot job-labeler-shot',
              fallbackHeading: 'Text Preview',
            })}
            <div class="job-labeler-links">
              ${item.final_url || item.normalized_url
                ? `<a class="link-button compact" href="${escapeHtml(item.final_url || item.normalized_url)}" target="_blank" rel="noreferrer">Open Page</a>`
                : ''}
              ${candidate.candidate_screenshot_url
                ? `<a class="link-button compact" href="${escapeHtml(resolveAssetUrl(candidate.candidate_screenshot_url))}" target="_blank" rel="noreferrer">Open Screenshot</a>`
                : ''}
            </div>
          </div>
          <div class="candidate-meta">
            <div class="candidate-meta-row">
              <span class="candidate-pill">row ${escapeHtml(item.row_number || '')}</span>
              <span class="candidate-pill">rank ${escapeHtml(candidate.candidate_rank || entry.candidateRank || '')}</span>
              <span class="candidate-pill">${escapeHtml(candidate.confidence || 'unknown')}</span>
              <span class="candidate-pill">${escapeHtml(candidate.ugc_type || 'candidate')}</span>
              <span class="candidate-pill ${heuristicClass}">${escapeHtml(heuristicText)}</span>
              <span class="candidate-pill ${candidate.acceptance_gate_passed ? 'good' : 'bad'}">gate ${candidate.acceptance_gate_passed ? 'pass' : 'fail'}</span>
              ${candidate.job_labeler_pending_save ? '<span class="candidate-pill warn">saving</span>' : ''}
              ${candidate.detected ? '<span class="candidate-pill good">detected</span>' : ''}
              ${label ? `<span class="candidate-pill ${labelClass}">${escapeHtml(label)}</span>` : '<span class="candidate-pill">unreviewed</span>'}
            </div>
            <p class="candidate-copy">${escapeHtml(candidate.sample_text || 'No sample text available for this candidate.')}</p>
            <p class="candidate-copy mono">${escapeHtml(candidate.xpath || candidate.css_path || '')}</p>
            ${heuristicReason ? `<p class="candidate-copy"><strong>System Cue:</strong> ${escapeHtml(heuristicReason)}</p>` : ''}
            <p class="candidate-copy"><strong>URL:</strong> ${escapeHtml(item.final_url || item.normalized_url || '')}</p>
            ${renderCandidateMarkupDetails(candidate)}
            ${matchedSignals ? `<div><p class="candidate-copy"><strong>Positive Signals</strong></p>${matchedSignals}</div>` : ''}
            ${penaltySignals ? `<div><p class="candidate-copy"><strong>Penalty Signals</strong></p>${penaltySignals}</div>` : ''}
            <label class="field">
              <span>Review Notes</span>
              <textarea id="${noteId}" class="candidate-notes" rows="3" placeholder="Optional reason for the label">${escapeHtml(candidate.human_notes || '')}</textarea>
            </label>
            <div class="candidate-actions">
              <button class="compact" type="button" data-job-labeler-review="${escapeHtml(candidate.candidate_key || '')}" data-item-id="${escapeHtml(item.id || '')}" data-label-value="comment_region">Comment Region</button>
              <button class="compact" type="button" data-job-labeler-review="${escapeHtml(candidate.candidate_key || '')}" data-item-id="${escapeHtml(item.id || '')}" data-label-value="not_comment_region">Not Comment</button>
              <button class="compact" type="button" data-job-labeler-review="${escapeHtml(candidate.candidate_key || '')}" data-item-id="${escapeHtml(item.id || '')}" data-label-value="uncertain">Uncertain</button>
              <button class="secondary compact" type="button" data-job-labeler-clear="${escapeHtml(candidate.candidate_key || '')}" data-item-id="${escapeHtml(item.id || '')}">Clear</button>
            </div>
            <p class="candidate-copy job-labeler-shortcuts"><strong>Shortcuts:</strong> left/right arrows move through the queue. Press <code>1</code>, <code>2</code>, or <code>3</code> to apply a label.</p>
          </div>
        </article>
      </div>
    `;
    setJobLabelerNavState(state);
    maybePrefetchJobLabelerEntries(currentJobId);
  }

  async function ensureJobLabelerLoaded(force) {
    if (!currentJobId || !jobLabelerReview) {
      renderJobLabelerReview();
      return;
    }
    renderJobLabelerReview();
    try {
      await loadJobLabelerState(currentJobId, !!force);
      renderJobLabelerReview();
      maybePrefetchJobLabelerEntries(currentJobId);
    } catch (error) {
      renderJobLabelerReview();
      throw error;
    }
  }

  async function stepJobLabeler(direction) {
    const state = currentJobLabelerState();
    if (!state || !state.entries.length) return;
    const jobId = currentJobId;
    state.pendingAdvanceFromIndex = -1;
    const step = direction < 0 ? -1 : 1;

    if (isFilteringUnlabeled()) {
      const currentIndex = state.index || 0;
      const targetIndex = step > 0
        ? findNextUnreviewedLabelerIndex(state, currentIndex + 1)
        : findPrevUnreviewedLabelerIndex(state, currentIndex);

      if (targetIndex >= 0) {
        if (targetIndex === currentIndex) return;
        state.index = targetIndex;
        setJobLabelerMessage('', false);
        renderJobLabelerReview();
        maybePrefetchJobLabelerEntries(jobId);
        return;
      }

      if (step > 0 && state.hasMore) {
        const loadTarget = state.entries.length;
        startJobLabelerTransition('Loading more candidates...');
        try {
          await ensureJobLabelerEntriesForIndex(jobId, state, loadTarget);
          if (currentJobLabelerState() !== state || currentJobId !== jobId) return;
          const nextAfterLoad = findNextUnreviewedLabelerIndex(state, loadTarget);
          if (nextAfterLoad >= 0) state.index = nextAfterLoad;
          setJobLabelerMessage('', false);
          stopJobLabelerTransition();
          renderJobLabelerReview();
          maybePrefetchJobLabelerEntries(jobId);
        } catch (error) {
          stopJobLabelerTransition();
          throw error;
        }
      }
      return;
    }

    const targetIndex = Math.max(0, (state.index || 0) + step);
    const nextIndex = Math.min(targetIndex, state.entries.length - 1);
    if (targetIndex >= state.entries.length && state.hasMore) {
      startJobLabelerTransition('Loading more candidates...');
      try {
        await ensureJobLabelerEntriesForIndex(jobId, state, targetIndex);
        if (currentJobLabelerState() !== state || currentJobId !== jobId) {
          return;
        }
        state.index = Math.min(targetIndex, state.entries.length - 1);
        setJobLabelerMessage('', false);
        stopJobLabelerTransition();
        renderJobLabelerReview();
        maybePrefetchJobLabelerEntries(jobId);
        return;
      } catch (error) {
        stopJobLabelerTransition();
        throw error;
      }
    }
    if (nextIndex === state.index) return;
    state.index = nextIndex;
    setJobLabelerMessage('', false);
    renderJobLabelerReview();
    maybePrefetchJobLabelerEntries(jobId);
  }

  function handleJobLabelerStep(direction) {
    stepJobLabeler(direction).catch((error) => {
      const message = error && error.message ? error.message : String(error);
      setJobLabelerMessage(message, true);
      showToast(message, { tone: 'error' });
    });
  }

  async function jumpJobLabelerToPosition(position) {
    const targetPosition = Math.floor(Number(position));
    if (!Number.isFinite(targetPosition) || targetPosition < 1) {
      throw new Error('Enter a candidate position of 1 or greater.');
    }

    const jobId = currentJobId;
    if (!jobId) {
      throw new Error('Select a job first.');
    }

    await ensureJobLabelerLoaded(false);
    const state = currentJobLabelerState();
    if (!state || !state.entries.length) {
      throw new Error('This job does not have candidates to label yet.');
    }

    startJobLabelerTransition(`Jumping to position ${targetPosition}...`);
    try {
      await ensureJobLabelerEntriesForIndex(jobId, state, targetPosition - 1 + jobLabelerBatchSize);
      if (currentJobLabelerState() !== state || currentJobId !== jobId) {
        return;
      }

      const requestedIndex = targetPosition - 1;
      const resolvedIndex = Math.min(requestedIndex, state.entries.length - 1);
      const clamped = resolvedIndex !== requestedIndex;
      state.index = Math.max(0, resolvedIndex);
      if (jobLabelerJumpPosition) {
        jobLabelerJumpPosition.value = String(state.index + 1);
      }
      setJobLabelerMessage(
        clamped
          ? `Requested position ${targetPosition} is beyond the loaded queue. Showing the last available candidate.`
          : `Jumped to position ${targetPosition}.`,
        false,
      );
      showToast(
        clamped
          ? `Requested position ${targetPosition} is beyond the loaded queue.`
          : `Jumped to position ${targetPosition}.`,
        { tone: clamped ? 'info' : 'success' },
      );
      stopJobLabelerTransition();
      renderJobLabelerReview();
      maybePrefetchJobLabelerEntries(jobId);
    } catch (error) {
      stopJobLabelerTransition();
      throw error;
    }
  }

  function advanceJobLabelerAfterSave(state, previousIndex) {
    if (!state || !state.entries.length) return;
    state.pendingAdvanceFromIndex = -1;
    const startIndex = Math.min(previousIndex + 1, state.entries.length - 1);
    if (jobLabelerAutoAdvance && jobLabelerAutoAdvance.checked) {
      const nextUnreviewed = findNextUnreviewedLabelerIndex(state, startIndex);
      if (nextUnreviewed >= 0) {
        state.index = nextUnreviewed;
        maybePrefetchJobLabelerEntries(currentJobId);
        return;
      }
      state.pendingAdvanceFromIndex = startIndex;
    }
    state.index = Math.min(startIndex, state.entries.length - 1);
    maybePrefetchJobLabelerEntries(currentJobId);
  }

  function applyOptimisticJobLabelerReview(state, entry, label, notes, clear) {
    if (!state || !entry) return null;
    const snapshotState = currentJobLabelerState();
    const current = jobLabelerCandidateForEntry(state, entry);
    if (!current.candidate) return null;
    const snapshot = snapshotCandidateReviewState(current.candidate);
    const nextPatch = {
      human_label: clear ? '' : label,
      human_notes: notes || '',
      human_reviewed_at: clear ? '' : new Date().toISOString(),
      human_review_source: clear ? '' : 'web_review',
      job_labeler_pending_save: true,
    };
    applyCandidateReviewSnapshot(state.itemsById, entry.itemId, entry.candidateKey, nextPatch);
    if (currentItemsById.has(entry.itemId)) {
      applyCandidateReviewSnapshot(currentItemsById, entry.itemId, entry.candidateKey, nextPatch);
    }
    return {
      entryKey: jobLabelerEntryKey(entry),
      previousIndex: snapshotState ? (snapshotState.index || 0) : 0,
      snapshot,
    };
  }

  function finalizeOptimisticJobLabelerReview(state, entry) {
    if (!state || !entry) return;
    applyCandidateReviewSnapshot(state.itemsById, entry.itemId, entry.candidateKey, {
      job_labeler_pending_save: false,
    });
    if (currentItemsById.has(entry.itemId)) {
      applyCandidateReviewSnapshot(currentItemsById, entry.itemId, entry.candidateKey, {
        job_labeler_pending_save: false,
      });
    }
  }

  function rollbackOptimisticJobLabelerReview(state, entry, optimisticState) {
    if (!state || !entry || !optimisticState) return;
    const rollbackPatch = {
      ...optimisticState.snapshot,
      job_labeler_pending_save: false,
    };
    applyCandidateReviewSnapshot(state.itemsById, entry.itemId, entry.candidateKey, rollbackPatch);
    if (currentItemsById.has(entry.itemId)) {
      applyCandidateReviewSnapshot(currentItemsById, entry.itemId, entry.candidateKey, rollbackPatch);
    }
    moveJobLabelerEntryToRetryPosition(state, optimisticState.entryKey);
  }

  function submitJobLabelerReview(entry, label, notes, clear) {
    const state = currentJobLabelerState();
    if (!state || !entry) return Promise.resolve();
    const optimisticState = applyOptimisticJobLabelerReview(state, entry, label, notes, clear);
    if (!optimisticState) {
      return Promise.reject(new Error('Candidate could not be prepared for review.'));
    }

    if (!clear) {
      advanceJobLabelerAfterSave(state, optimisticState.previousIndex);
      startJobLabelerTransition('Saving label...');
    } else {
      renderJobLabelerReview();
    }

    return saveCandidateReview(entry.candidateKey, label, notes, clear, {
      itemId: entry.itemId,
      setMessage: setJobLabelerMessage,
      scopeElement: jobLabelerReview,
      syncSelectedItem: false,
      includeItemResponse: false,
      silentSuccess: true,
      silentError: true,
      onSaved() {
        finalizeOptimisticJobLabelerReview(state, entry);
        if (activeWorkspaceTab === 'labeler' && !(jobLabelerTransition && jobLabelerTransition.jobId === currentJobId)) {
          renderJobLabelerReview();
        }
      },
    }).catch((error) => {
      stopJobLabelerTransition();
      rollbackOptimisticJobLabelerReview(state, entry, optimisticState);
      renderJobLabelerReview();
      const message = 'Label save failed. Candidate returned to the queue.';
      setJobLabelerMessage(message, true);
      showToast(message, { tone: 'error' });
      throw error;
    });
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
      'heuristic_pseudo_label',
      'heuristic_pseudo_confidence',
      'heuristic_pseudo_reason',
      'heuristic_pseudo_source',
      'candidate_screenshot_url',
      'candidate_screenshot_error',
      'candidate_outer_html_excerpt',
      'candidate_outer_html_length',
      'candidate_outer_html_truncated',
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
    const heuristicLabel = candidateHeuristicLabel(candidate);
    const heuristicClass = heuristicLabelClass(heuristicLabel);
    const heuristicText = heuristicLabelText(heuristicLabel);
    const heuristicReason = candidateHeuristicReason(candidate);
    const heuristicSummary = scanResult.candidate_heuristic_summary || summarizeCandidateHeuristics(candidates);
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
    let verdictTitle = 'Heuristic left this candidate for review';
    let verdictCopy = `System cue marked this candidate as ${heuristicText}. ${heuristicReason || candidate.acceptance_gate_reason || ''}`;
    if (heuristicLabel === 'ugc') {
      verdictTitle = 'Heuristic marked this candidate as likely UGC';
      verdictCopy = `The rule-based cue promoted candidate #${candidate.candidate_rank} at score ${formatMetricValue(candidate.score)}. Human review still decides the final label. ${heuristicReason || candidate.acceptance_gate_reason || ''}`;
    } else if (heuristicLabel === 'not_ugc') {
      verdictTitle = 'Heuristic marked this candidate as likely not UGC';
      verdictCopy = `Candidate #${candidate.candidate_rank} did not build enough structure or keyword evidence to earn a positive system cue. Human review can still override that cue. ${heuristicReason || candidate.acceptance_gate_reason || ''}`;
    } else if (baseThresholdPassed && !gatePassed) {
      verdictTitle = 'Heuristic kept this candidate in the review set';
      verdictCopy = `Candidate #${candidate.candidate_rank} cleared the raw score threshold at score ${formatMetricValue(candidate.score)}, but the heuristic stayed cautious and left it for human review. ${heuristicReason || candidate.acceptance_gate_reason || ''}`;
    }
    const candidateScreenshot = renderCandidateVisual(candidate, {
      linkClass: 'score-shot-link',
      imageClass: 'score-shot',
      fallbackHeading: 'Candidate Text Preview',
    });
    const candidateSummaryRows = candidates.map((entry) => {
      const entryHeuristicLabel = candidateHeuristicLabel(entry);
      const entryHeuristicText = heuristicLabelText(entryHeuristicLabel);
      const entryHeuristicClass = heuristicLabelClass(entryHeuristicLabel);
      return `
        <tr>
          <td>${escapeHtml(entry.candidate_rank)}</td>
          <td>${escapeHtml(entry.score ?? '')}</td>
          <td><span class="candidate-pill ${entryHeuristicClass}">${escapeHtml(entryHeuristicText)}</span></td>
          <td>${escapeHtml(entry.repeating_group_count ?? '')}</td>
          <td>${escapeHtml(entry.keyword_evidence_strength || 'none')}</td>
          <td>${entry.acceptance_gate_passed ? 'pass' : 'fail'}</td>
          <td>${entry.detected ? 'yes' : 'no'}</td>
          <td>${escapeHtml(entry.human_label || '')}</td>
        </tr>
      `;
    }).join('');

    scoringBreakdown.className = 'candidate-review';
    scoringBreakdown.innerHTML = `
      <div class="score-shell">
        <section class="score-hero">
          <article class="score-verdict ${heuristicClass || (candidate.detected ? 'good' : 'bad')}">
            <div class="candidate-meta-row">
              <span class="candidate-pill ${candidate.detected ? 'good' : 'bad'}">${candidate.detected ? 'detected' : 'not detected'}</span>
              <span class="candidate-pill">candidate ${escapeHtml(candidate.candidate_rank)}</span>
              <span class="candidate-pill">${escapeHtml(candidate.ugc_type || 'candidate')}</span>
              <span class="candidate-pill">${escapeHtml(candidate.confidence || 'unknown')}</span>
              <span class="candidate-pill ${heuristicClass}">${escapeHtml(heuristicText)}</span>
            </div>
            <h4>${escapeHtml(verdictTitle)}</h4>
            <p class="candidate-copy">${escapeHtml(verdictCopy)}</p>
            <div class="candidate-meta-row">
              <span class="candidate-pill">source ${escapeHtml(item.analysis_source || 'automated')}</span>
              <span class="candidate-pill">score ${escapeHtml(candidate.score ?? '')}</span>
              <span class="candidate-pill">heuristic ${escapeHtml(heuristicLabel)}</span>
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
            ${renderScoreStat('Heuristic cue', heuristicText, heuristicClass)}
            ${renderScoreStat('Keyword evidence', candidate.keyword_evidence_strength || 'none', gatePassed ? 'good' : 'bad')}
            ${renderScoreStat('Repeated sibling', candidate.repeated_structure_support ? 'yes' : 'no', candidate.repeated_structure_support ? 'good' : '')}
            ${renderScoreStat('Candidates on row', candidates.length, '')}
            ${renderScoreStat('Heuristic UGC', heuristicSummary.ugc, 'good')}
            ${renderScoreStat('Heuristic uncertain', heuristicSummary.uncertain, 'warn')}
            ${renderScoreStat('Selection limit', scanResult.candidate_selection_limit ?? candidates.length, '')}
            ${renderScoreStat('Human label', candidate.human_label || 'none', 'warn')}
          </div>
        </section>

        ${renderScanInsightGrid(candidates, {
          eyebrow: 'Row Pattern',
          title: 'Scoring Pattern Overview',
          copy: 'This view shows how the candidate scores progress through the row and where human labels match the system cue.',
          limit: 6,
        })}

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
            <h4>System Cue</h4>
            ${renderMetricList([
              ['Heuristic label', heuristicText],
              ['Heuristic confidence', candidate.heuristic_pseudo_confidence || candidate.confidence || ''],
              ['Heuristic source', candidate.heuristic_pseudo_source || 'rule_based'],
              ['Heuristic reason', truncateMetricText(heuristicReason || '', 180)],
              ['Selection limit', scanResult.candidate_selection_limit ?? ''],
              ['Artifact limit', scanResult.candidate_review_artifact_limit ?? ''],
              ['Heuristic total', heuristicSummary.total],
              ['Heuristic UGC', heuristicSummary.ugc],
              ['Heuristic uncertain', heuristicSummary.uncertain],
              ['Heuristic not UGC', heuristicSummary.not_ugc],
            ], 'No heuristic cue was stored for this candidate.')}
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
            <caption>All candidates on this row</caption>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Score</th>
                <th>System Cue</th>
                <th>Repeating</th>
                <th>Keywords</th>
                <th>Gate</th>
                <th>Detected</th>
                <th>Human Label</th>
              </tr>
            </thead>
            <tbody>${candidateSummaryRows}</tbody>
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
      managerCandidateModeInput.value = 'default';
      managerScanDelayInput.value = '';
      managerScreenshotDelayInput.value = '';
      managerReplaceFile.value = '';
      if (backupFileInput) backupFileInput.value = '';
      managerResumeButton.disabled = true;
      managerResumeFailedButton.disabled = true;
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
      `<div><strong>Mode:</strong> ${escapeHtml(formatCandidateMode(job.candidate_mode || job.candidateMode))}</div>`,
      `<div><strong>Status:</strong> ${escapeHtml(job.status || '')}</div>`,
      `<div><strong>Progress:</strong> ${escapeHtml(job.completed_count || 0)}/${escapeHtml(job.total_urls || 0)}</div>`,
      `<div><strong>Pending:</strong> ${escapeHtml(job.pending_count || 0)}</div>`,
      `<div><strong>Queued:</strong> ${escapeHtml(job.queued_count || 0)}</div>`,
      `<div><strong>Running:</strong> ${escapeHtml(job.running_count || 0)}</div>`,
    ].join('');

    if (managerFormJobId !== job.id) {
      managerJobId.value = job.id || '';
      managerSourceColumn.value = job.source_column || '';
      managerCandidateModeInput.value = job.candidate_mode || job.candidateMode || 'default';
      managerScanDelayInput.value = job.scan_delay_ms ?? '';
      managerScreenshotDelayInput.value = job.screenshot_delay_ms ?? '';
      managerReplaceFile.value = '';
      managerFormJobId = job.id;
    } else {
      managerJobId.value = job.id || '';
    }

    managerResumeButton.disabled = !canResumeJob(job);
    managerResumeFailedButton.disabled = !canResumeFailedJob(job);
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
            <button class="secondary compact" type="button" data-resume-failed-job="${escapeHtml(job.id)}" ${canResumeFailedJob(job) ? '' : 'disabled'}>Resume Failed</button>
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
      const body = await fetchJson(`/api/jobs/${jobId}/events?limit=120`);
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
      invalidateJobLabelerCache(body.deletedJobId);
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

  async function postJsonAction(path, payload, options = {}) {
    const response = await fetch(apiUrl(path), {
      method: options.method || 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      body: JSON.stringify(payload || {}),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error || 'Request failed.');
    }
    return body;
  }

  async function refreshJob(jobId, options = {}) {
    if (!jobId) return;
    const previousPollingJobId = pollJobId;
    const previousPollingInterval = pollIntervalMs;
    stopPolling();
    const requestToken = ++refreshJobToken;
    const isStale = () => requestToken !== refreshJobToken;
    const previousJobId = currentJobId;
    try {
      const [{ job, items, pagination }] = await Promise.all([
        fetchJson(`/api/jobs/${jobId}?limit=${pageSize}&offset=${currentOffset}`),
        fetchJobEvents(jobId),
      ]);
      if (isStale()) {
        return null;
      }
      if (currentJobId && currentJobId !== jobId && selectedManualItemId) {
        selectedManualItemId = '';
        selectManualItem(null);
      }
      currentJob = job;
      currentJobId = jobId;
      window.history.replaceState({}, '', `?jobId=${jobId}`);
      try { localStorage.setItem('ugc_selected_job_id', jobId); } catch (_) {}
      renderSummary(job);
      renderItems(items, pagination);
      renderJobManager(job);
      await refreshSelectedItem().catch((error) => console.error(error));
      if (isStale()) {
        return null;
      }
      setDownloads(jobId);
      if (activeWorkspaceTab === 'labeler') {
        if (previousJobId !== jobId) {
          ensureJobLabelerLoaded(false).catch((error) => {
            const message = error && error.message ? error.message : String(error);
            setJobLabelerMessage(message, true);
            showToast(message, { tone: 'error' });
          });
        } else {
          renderJobLabelerReview();
        }
      }
      if (!options.skipRecentJobsRefresh) {
        refreshJobs().catch((error) => console.error(error));
      }
      if (isStale()) {
        return null;
      }
      startPolling(jobId, pollIntervalForStatus(job.status));
    } catch (error) {
      if (requestToken === refreshJobToken && previousPollingJobId) {
        startPolling(previousPollingJobId, previousPollingInterval || activePollIntervalMs);
      }
      throw error;
    }
  }

  async function refreshJobs(options = {}) {
    const data = await fetchJson('/api/jobs?limit=10');
    const jobs = data.jobs || [];
    renderRecentJobs(jobs);
    if (options.autoselect && !currentJobId) {
      const preferred = pickInitialJob(jobs);
      if (preferred && preferred.id) {
        currentOffset = 0;
        await refreshJob(preferred.id).catch((error) => {
          console.error(error);
        });
      }
    }
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

  async function handleResumeFailedJob(jobId, triggerElement) {
    if (!jobId) return;
    try {
      setManagerMessage('Re-queuing failed URLs...', false);
      const body = await runElementAction(triggerElement, () => postJobAction(jobId, `/api/jobs/${jobId}/resume-failed`));
      const resumedCount = Number(body && body.resumedCount) || 0;
      const message = resumedCount
        ? `Re-queued ${resumedCount} failed URL(s) for retry.`
        : 'No failed URLs found to resume.';
      setManagerMessage(message, false);
      showToast(message, { tone: 'success' });
      await refreshJob(jobId);
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
      invalidateJobLabelerCache(jobId);
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
      invalidateJobLabelerCache(jobId);
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
      if (managerCandidateModeInput && managerCandidateModeInput.value.trim()) {
        formData.append('candidateMode', managerCandidateModeInput.value.trim());
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
      invalidateJobLabelerCache(currentJobId);
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
      jobLabelerCache.clear();
      jobLabelerLoadingJobId = '';
      jobLabelerLoadingPromise = null;
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

  async function handleBackupImport(event) {
    event.preventDefault();
    if (!backupFileInput) {
      return;
    }

    const file = backupFileInput.files[0];
    if (!file) {
      setManagerMessage('Choose a backup file first.', true);
      showToast('Choose a backup file first.', { tone: 'error' });
      return;
    }

    const submitButton = backupImportForm ? backupImportForm.querySelector('button[type="submit"]') : null;
    try {
      setManagerMessage('Importing backup...', false);
      const formData = new FormData();
      formData.append('file', file);
      const body = await runElementAction(submitButton, async () => {
        const response = await fetch(apiUrl('/api/backups/import'), {
          method: 'POST',
          body: formData,
        });
        const responseBody = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(responseBody.error || 'Backup import failed.');
        }
        return responseBody;
      });

      backupFileInput.value = '';
      await refreshJobs().catch((error) => console.error(error));
      if (currentJobId) {
        await refreshJob(currentJobId).catch((error) => console.error(error));
      }
      const imported = body.imported || {};
      const message = `Imported backup: ${imported.jobs || 0} jobs, ${imported.items || 0} items.`;
      setManagerMessage(message, false);
      showToast(message, { tone: 'success' });
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      setManagerMessage(message, true);
      showToast(message, { tone: 'error' });
    }
  }

  async function handleCombineJobs(event) {
    event.preventDefault();

    const jobIdA = mergeJobIdA ? mergeJobIdA.value.trim() : '';
    const jobIdB = mergeJobIdB ? mergeJobIdB.value.trim() : '';
    if (!jobIdA || !jobIdB) {
      setMergeMessage('Provide two source job IDs first.', true);
      showToast('Provide two source job IDs first.', { tone: 'error' });
      return;
    }

    const submitButton = mergeForm ? mergeForm.querySelector('button[type="submit"]') : null;
    try {
      setMergeMessage('Combining jobs...', false);
      const body = await runElementAction(submitButton, () => postJsonAction('/api/jobs/merge', {
        jobIds: [jobIdA, jobIdB],
        sourceFilename: mergeSourceFilename ? mergeSourceFilename.value.trim() : '',
        candidateMode: mergeCandidateModeInput ? mergeCandidateModeInput.value.trim() : 'default',
        scanDelayMs: mergeScanDelayInput ? mergeScanDelayInput.value.trim() : '',
        screenshotDelayMs: mergeScreenshotDelayInput ? mergeScreenshotDelayInput.value.trim() : '',
      }));

      const mergedJobId = body.jobId || (body.job && body.job.id) || '';
      if (mergedJobId) {
        currentOffset = 0;
        await refreshJob(mergedJobId).catch((error) => console.error(error));
      } else {
        await refreshJobs().catch((error) => console.error(error));
      }

      const message = mergedJobId
        ? `Combined jobs into new job ${mergedJobId}.`
        : 'Combined jobs into a new aggregate job.';
      setMergeMessage(message, false);
      showToast(message, { tone: 'success' });
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      setMergeMessage(message, true);
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
        if (candidateModeInput && candidateModeInput.value.trim()) {
          formData.append('candidateMode', candidateModeInput.value.trim());
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
          `Job ${body.jobId} created. Mode ${formatCandidateMode(body.candidateMode || candidateModeInput.value)}, scan delay ${body.scanDelayMs ?? ''} ms, screenshot delay ${body.screenshotDelayMs ?? ''} ms.`,
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
        invalidateJobLabelerCache(currentJobId);
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

  async function saveCandidateReview(candidateKey, label, notes, clear, options = {}) {
    const itemId = options.itemId || selectedManualItemId;
    const setMessage = options.setMessage || setCandidateMessage;
    const scopeElement = options.scopeElement || candidateReview;

    if (!currentJobId || !itemId) {
      setMessage('Select a row first.', true);
      showToast('Select a row first.', { tone: 'error' });
      return;
    }

    const activeButton = scopeElement.querySelector(clear
      ? `[data-candidate-clear="${CSS.escape(candidateKey)}"]`
      : `[data-candidate-review="${CSS.escape(candidateKey)}"][data-label-value="${CSS.escape(label)}"]`)
      || scopeElement.querySelector(clear
        ? `[data-job-labeler-clear="${CSS.escape(candidateKey)}"]`
        : `[data-job-labeler-review="${CSS.escape(candidateKey)}"][data-label-value="${CSS.escape(label)}"]`);

    try {
      await runElementAction(activeButton, async () => {
        const response = await fetch(apiUrl(`/api/jobs/${currentJobId}/items/${itemId}/candidates/${encodeURIComponent(candidateKey)}/review`), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            label: clear ? '' : label,
            notes: notes || '',
            clear: !!clear,
            includeItem: options.includeItemResponse !== false,
          }),
        });

        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(body.error || 'Failed to save candidate review.');
        }

        const item = body.item || null;
        if (item) {
          currentItemsById.set(item.id, item);
          const labelerState = jobLabelerCache.get(currentJobId);
          if (labelerState) {
            labelerState.itemsById.set(item.id, item);
          }
          if (options.syncSelectedItem !== false) {
            selectManualItem(item);
          }
          if (typeof options.onSaved === 'function') {
            options.onSaved(item);
          }
        }
        if (typeof options.onSaved === 'function' && !item) {
          options.onSaved(null);
        }
        return body;
      });
      const message = clear ? 'Candidate review cleared.' : 'Candidate review saved.';
      if (!options.silentSuccess) {
        setMessage(message, false);
        showToast(message, { tone: 'success' });
      }
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      setMessage(message, true);
      if (!options.silentError) {
        showToast(message, { tone: 'error' });
      }
      throw error;
    }
  }

  function handleCandidateReviewShortcut(label) {
    const selection = currentCandidateReviewSelection();
    if (!selection) {
      setCandidateMessage('Select a row first.', true);
      showToast('Select a row first.', { tone: 'error' });
      return;
    }

    const notesField = document.getElementById(`candidate-notes-${selection.candidateKey}`);
    const notes = notesField ? notesField.value.trim() : '';
    const previousPage = selection.page;
    saveCandidateReview(selection.candidateKey, label, notes, false, {
      silentSuccess: true,
      onSaved(savedItem) {
        const advanced = advanceCandidateReviewAfterSave(savedItem || selection.item, previousPage);
        const message = advanced
          ? 'Candidate review saved. Advanced to the next candidate.'
          : 'Candidate review saved.';
        setCandidateMessage(message, false);
        showToast(message, { tone: 'success' });
      },
    }).catch((error) => {
      const message = error && error.message ? error.message : String(error);
      setCandidateMessage(message, true);
    });
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

  if (backupImportForm) {
    backupImportForm.addEventListener('submit', (event) => {
      handleBackupImport(event).catch((error) => console.error(error));
    });
  }

  if (mergeForm) {
    mergeForm.addEventListener('submit', (event) => {
      handleCombineJobs(event).catch((error) => console.error(error));
    });
  }

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
      const tabId = button.getAttribute('data-workspace-tab');
      setWorkspaceTab(tabId);
      if (tabId === 'labeler') {
        ensureJobLabelerLoaded(false).catch((error) => {
          const message = error && error.message ? error.message : String(error);
          setJobLabelerMessage(message, true);
          showToast(message, { tone: 'error' });
        });
      }
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

    const resumeFailedButton = event.target.closest('[data-resume-failed-job]');
    if (resumeFailedButton) {
      const jobId = resumeFailedButton.getAttribute('data-resume-failed-job');
      handleResumeFailedJob(jobId, resumeFailedButton).catch((error) => console.error(error));
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

  jobEvents.addEventListener('click', (event) => {
    const pageButton = event.target.closest('[data-event-page]');
    if (!pageButton || !currentJobEvents.length) return;
    const action = pageButton.getAttribute('data-event-page');
    const totalPages = Math.max(1, Math.ceil(currentJobEvents.length / jobEventsPageSize));
    if (action === 'prev') {
      currentJobEventsPage = Math.max(0, currentJobEventsPage - 1);
    } else if (action === 'next') {
      currentJobEventsPage = Math.min(totalPages - 1, currentJobEventsPage + 1);
    }
    renderJobEvents(currentJobEvents, { resetPage: false });
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

  jobLabelerReview.addEventListener('click', (event) => {
    const reviewButton = event.target.closest('[data-job-labeler-review]');
    if (reviewButton) {
      const candidateKey = reviewButton.getAttribute('data-job-labeler-review');
      const itemId = reviewButton.getAttribute('data-item-id');
      const label = reviewButton.getAttribute('data-label-value');
      if (!candidateKey || !itemId || !label) return;
      const entry = currentJobLabelerEntry();
      if (!entry || entry.itemId !== itemId || entry.candidateKey !== candidateKey) return;
      const notesField = document.getElementById('job-labeler-notes');
      const notes = notesField ? notesField.value.trim() : '';
      submitJobLabelerReview(entry, label, notes, false).catch(() => {});
      return;
    }

    const clearButton = event.target.closest('[data-job-labeler-clear]');
    if (!clearButton) return;
    const candidateKey = clearButton.getAttribute('data-job-labeler-clear');
    const itemId = clearButton.getAttribute('data-item-id');
    if (!candidateKey || !itemId) return;
    const entry = currentJobLabelerEntry();
    if (!entry || entry.itemId !== itemId || entry.candidateKey !== candidateKey) return;
    submitJobLabelerReview(entry, '', '', true).catch(() => {});
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

  jobLabelerReloadButton.addEventListener('click', () => {
    runElementAction(jobLabelerReloadButton, async () => {
      if (!currentJobId) {
        throw new Error('Select a job first.');
      }
      invalidateJobLabelerCache(currentJobId);
      await ensureJobLabelerLoaded(true);
      setJobLabelerMessage('Job-wide candidate queue reloaded.', false);
      showToast('Job-wide candidate queue reloaded.', { tone: 'success' });
    }).catch((error) => {
      const message = error && error.message ? error.message : String(error);
      setJobLabelerMessage(message, true);
      showToast(message, { tone: 'error' });
    });
  });

  if (jobLabelerJumpForm) {
    jobLabelerJumpForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const positionValue = jobLabelerJumpPosition ? jobLabelerJumpPosition.value.trim() : '';
      runElementAction(jobLabelerJumpButton || jobLabelerJumpForm, async () => {
        if (!positionValue) {
          throw new Error('Enter a candidate position first.');
        }
        await jumpJobLabelerToPosition(positionValue);
      }).catch((error) => {
        const message = error && error.message ? error.message : String(error);
        setJobLabelerMessage(message, true);
        showToast(message, { tone: 'error' });
      });
    });
  }

  jobLabelerPrevButton.addEventListener('click', () => {
    handleJobLabelerStep(-1);
  });

  jobLabelerNextButton.addEventListener('click', () => {
    handleJobLabelerStep(1);
  });

  if (jobLabelerFilterUnlabeled) {
    jobLabelerFilterUnlabeled.addEventListener('change', () => {
      const state = currentJobLabelerState();
      if (state && jobLabelerFilterUnlabeled.checked) {
        const firstUnreviewed = findNextUnreviewedLabelerIndex(state, 0);
        if (firstUnreviewed >= 0) state.index = firstUnreviewed;
      }
      renderJobLabelerReview();
    });
  }

  managerResumeButton.addEventListener('click', () => {
    handleResumeJob(currentJobId, managerResumeButton).catch((error) => console.error(error));
  });

  managerResumeFailedButton.addEventListener('click', () => {
    handleResumeFailedJob(currentJobId, managerResumeFailedButton).catch((error) => console.error(error));
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

  document.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target;
    const tagName = target && target.tagName ? target.tagName.toLowerCase() : '';
    const isTypingTarget = tagName === 'input' || tagName === 'textarea' || tagName === 'select';
    if (activeWorkspaceTab === 'candidates') {
      if (isTypingTarget) return;
      let label = '';
      if (event.key === '1') label = 'comment_region';
      if (event.key === '2') label = 'not_comment_region';
      if (event.key === '3') label = 'uncertain';
      if (!label) return;

      event.preventDefault();
      handleCandidateReviewShortcut(label);
      return;
    }

    if (activeWorkspaceTab !== 'labeler') return;
    if (isTypingTarget) return;

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      handleJobLabelerStep(-1);
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      handleJobLabelerStep(1);
      return;
    }

    const activeEntry = currentJobLabelerEntry();
    if (!activeEntry) return;
    const notesField = document.getElementById('job-labeler-notes');
    const notes = notesField ? notesField.value.trim() : '';
    let label = '';
    if (event.key === '1') label = 'comment_region';
    if (event.key === '2') label = 'not_comment_region';
    if (event.key === '3') label = 'uncertain';
    if (!label) return;

    event.preventDefault();
    submitJobLabelerReview(activeEntry, label, notes, false).catch(() => {});
  });

  if (confirmDialog) {
    confirmDialog.addEventListener('close', () => {
      if (!confirmResolver) return;
      const resolve = confirmResolver;
      confirmResolver = null;
      resolve(confirmDialog.returnValue === 'accept');
    });
  }

  window.addEventListener('beforeunload', () => {
    stopPolling();
    stopRecentJobsPolling();
  });

  setResourceDownloads();
  setDownloads(currentJobId);
  setWorkspaceTab('queue');
  renderWorkspaceSelection(null);
  renderCandidateReview(null);
  renderJobLabelerReview();
  renderScoringBreakdown(null);
  renderJobManager(null);
  renderJobEvents([], { message: 'Select a job to view recent events.' });
  startRecentJobsPolling();
  if (currentJobId) {
    refreshJob(currentJobId).catch((error) => {
      console.error(error);
      refreshJobs({ autoselect: true }).catch((fallbackError) => console.error(fallbackError));
    });
  } else {
    refreshJobs({ autoselect: true }).catch((error) => console.error(error));
  }
}());
