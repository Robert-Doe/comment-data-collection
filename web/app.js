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

  let currentJobId = new URLSearchParams(window.location.search).get('jobId') || '';
  let currentOffset = 0;
  let selectedManualItemId = '';
  let activeWorkspaceTab = 'queue';
  let currentCandidatePage = 0;
  let currentItemsById = new Map();
  const pageSize = 50;
  const candidatePageSize = 1;
  let pollHandle = null;
  const scoreDetailOpenState = new Set();

  function apiUrl(path) {
    return `${apiBase}${path}`;
  }

  function absoluteApiBase() {
    return apiBase || window.location.origin;
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
      await downloadRemoteFile(href, buildGraphDownloadFilename(item, extension));
      setCandidateMessage(successText, false);
    } catch (error) {
      setCandidateMessage(error && error.message ? error.message : String(error), true);
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
    const visibleCandidates = candidates.slice(startIndex, startIndex + candidatePageSize);

    const cards = visibleCandidates.map((candidate) => {
      const noteId = `candidate-notes-${candidate.candidate_key || candidate.candidate_rank || 'x'}`;
      const label = humanLabelText(candidate.human_label);
      const labelClass = humanLabelClass(candidate.human_label);
      const matchedSignals = renderSignalList(candidate.matched_signals, 'good');
      const penaltySignals = renderSignalList(candidate.penalty_signals, 'bad');
      const candidateScreenshotEmptyMessage = escapeHtml(candidate.candidate_screenshot_error || 'No candidate screenshot was captured for this candidate.');
      return `
        <article class="candidate-card ${candidate.human_label ? 'active-review' : ''}">
          ${candidate.candidate_screenshot_url
            ? `<a href="${escapeHtml(resolveAssetUrl(candidate.candidate_screenshot_url))}" target="_blank" rel="noreferrer"><img class="candidate-shot" src="${escapeHtml(resolveAssetUrl(candidate.candidate_screenshot_url))}" alt="Candidate ${escapeHtml(candidate.candidate_rank)} screenshot"></a>`
            : `<div class="candidate-shot empty">${candidateScreenshotEmptyMessage}</div>`}
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
      <p class="candidate-copy"><strong>Screenshot note:</strong> the images below are candidate-region crops from analysis, not the raw page screenshot uploaded by the extension.</p>
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
      return candidates[currentCandidatePage];
    }
    const best = item && item.best_candidate ? item.best_candidate : null;
    if (!best) return candidates[0];
    return candidates.find((candidate) => candidate.candidate_key && candidate.candidate_key === best.candidate_key)
      || candidates.find((candidate) => candidate.xpath === best.xpath && candidate.css_path === best.css_path)
      || candidates[0];
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
    const candidateScreenshot = candidate.candidate_screenshot_url
      ? `
        <a class="score-shot-link" href="${escapeHtml(resolveAssetUrl(candidate.candidate_screenshot_url))}" target="_blank" rel="noreferrer">
          <img class="score-shot" src="${escapeHtml(resolveAssetUrl(candidate.candidate_screenshot_url))}" alt="Candidate ${escapeHtml(candidate.candidate_rank)} screenshot">
        </a>
      `
      : `<div class="candidate-shot empty">${escapeHtml(candidate.candidate_screenshot_error || 'No candidate screenshot was captured for this candidate.')}</div>`;
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
    if (selectedManualItemId && currentItemsById.has(selectedManualItemId)) {
      selectManualItem(currentItemsById.get(selectedManualItemId) || null);
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

  function renderRecentJobs(jobs) {
    if (!jobs || !jobs.length) {
      recentJobs.className = 'table-shell empty';
      recentJobs.textContent = 'No jobs loaded.';
      return;
    }

    const rows = jobs.map((job) => `
      <tr data-job-id="${escapeHtml(job.id)}">
        <td class="mono">${escapeHtml(job.id)}</td>
        <td>${escapeHtml(job.status)}</td>
        <td>${escapeHtml(job.completed_count)}/${escapeHtml(job.total_urls)}</td>
        <td>${escapeHtml(job.detected_count)}</td>
        <td><button class="secondary compact" type="button" data-open-job="${escapeHtml(job.id)}">Open</button></td>
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

  async function fetchJson(path) {
    const response = await fetch(apiUrl(path));
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `Request failed: ${response.status}`);
    }
    return response.json();
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

  async function refreshJob(jobId) {
    if (!jobId) return;
    const { job, items, pagination } = await fetchJson(`/api/jobs/${jobId}?limit=${pageSize}&offset=${currentOffset}`);
    if (currentJobId && currentJobId !== jobId && selectedManualItemId) {
      selectedManualItemId = '';
      selectManualItem(null);
    }
    currentJobId = jobId;
    window.history.replaceState({}, '', `?jobId=${jobId}`);
    renderSummary(job);
    renderItems(items, pagination);
    await refreshSelectedItem().catch((error) => console.error(error));
    setDownloads(jobId);
    refreshJobs().catch((error) => console.error(error));

    const terminal = ['completed', 'completed_with_errors', 'failed'].includes(job.status);
    if (terminal && pollHandle) {
      clearInterval(pollHandle);
      pollHandle = null;
    }
  }

  async function refreshJobs() {
    const data = await fetchJson('/api/jobs?limit=10');
    renderRecentJobs(data.jobs || []);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage('Starting scan...', false);

    const file = fileInput.files[0];
    if (!file) {
      setMessage('Choose a CSV file first.', true);
      return;
    }

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
      setMessage(body.error || 'Failed to create job.', true);
      return;
    }

    setMessage(
      `Job ${body.jobId} created. Scan delay ${body.scanDelayMs ?? ''} ms, screenshot delay ${body.screenshotDelayMs ?? ''} ms.`,
      false,
    );
    await refreshJobs();
    currentOffset = 0;
    await refreshJob(body.jobId);

    if (pollHandle) clearInterval(pollHandle);
    pollHandle = setInterval(() => {
      refreshJob(body.jobId).catch((error) => {
        console.error(error);
      });
    }, 4000);
  }

  async function handleManualSubmit(event) {
    event.preventDefault();
    setManualMessage('Uploading manual snapshot...', false);

    if (!currentJobId || !selectedManualItemId) {
      setManualMessage('Select a row first.', true);
      return;
    }

    const htmlFile = manualHtmlFile.files[0];
    if (!htmlFile) {
      setManualMessage('Choose an HTML snapshot file.', true);
      return;
    }

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
      setManualMessage(body.error || 'Failed to upload manual snapshot.', true);
      return;
    }

    manualHtmlFile.value = '';
    manualScreenshotFile.value = '';
    setManualMessage('Manual snapshot analyzed.', false);
    if (body.item) {
      currentItemsById.set(body.item.id, body.item);
      selectManualItem(body.item, preferredReviewTab(body.item));
    }
    await refreshJob(currentJobId);
  }

  async function copyManualConfig() {
    if (!currentJobId || !selectedManualItemId) {
      setManualMessage('Select a row first.', true);
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

    await copyText(JSON.stringify(payload, null, 2));
    setManualMessage('Fallback extension config copied to clipboard.', false);
  }

  async function saveCandidateReview(candidateKey, label, notes, clear) {
    if (!currentJobId || !selectedManualItemId) {
      setCandidateMessage('Select a row first.', true);
      return;
    }

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

    setCandidateMessage(clear ? 'Candidate review cleared.' : 'Candidate review saved.', false);
  }

  form.addEventListener('submit', (event) => {
    handleSubmit(event).catch((error) => {
      setMessage(error.message || String(error), true);
    });
  });

  manualForm.addEventListener('submit', (event) => {
    handleManualSubmit(event).catch((error) => {
      setManualMessage(error.message || String(error), true);
    });
  });

  manualCopyConfigButton.addEventListener('click', () => {
    copyManualConfig().catch((error) => {
      setManualMessage(error.message || String(error), true);
    });
  });

  refreshJobsButton.addEventListener('click', () => {
    refreshJobs().catch((error) => console.error(error));
  });

  workspaceTabs.forEach((button) => {
    button.addEventListener('click', () => {
      setWorkspaceTab(button.getAttribute('data-workspace-tab'));
    });
  });

  recentJobs.addEventListener('click', (event) => {
    const button = event.target.closest('[data-open-job]');
    if (!button) return;
    const jobId = button.getAttribute('data-open-job');
    if (!jobId) return;
    currentOffset = 0;
    refreshJob(jobId).catch((error) => console.error(error));
    if (pollHandle) clearInterval(pollHandle);
    pollHandle = setInterval(() => {
      refreshJob(jobId).catch((error) => console.error(error));
    }, 4000);
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

  setResourceDownloads();
  setDownloads(currentJobId);
  setWorkspaceTab('queue');
  renderWorkspaceSelection(null);
  renderCandidateReview(null);
  renderScoringBreakdown(null);
  refreshJobs().catch((error) => console.error(error));
  if (currentJobId) {
    refreshJob(currentJobId).catch((error) => console.error(error));
    pollHandle = setInterval(() => {
      refreshJob(currentJobId).catch((error) => console.error(error));
    }, 4000);
  }
}());
