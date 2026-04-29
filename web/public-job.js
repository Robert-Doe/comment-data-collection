'use strict';

(function bootstrapPublicIntake() {
  const config = window.__APP_CONFIG__ || {};
  const apiBase = resolveApiBase(config.apiBaseUrl);

  const pageTitle = document.getElementById('page-title');
  const pageLede = document.getElementById('page-lede');
  const openScannerLink = document.getElementById('open-scanner-link');
  const openJobLink = document.getElementById('open-job-link');
  const refreshJobButton = document.getElementById('refresh-job');
  const refreshItemsButton = document.getElementById('refresh-items');
  const startPendingButton = document.getElementById('start-pending');
  const jobTarget = document.getElementById('job-target');
  const jobTargetMessage = document.getElementById('job-target-message');
  const intakeMessage = document.getElementById('intake-message');
  const jobSummary = document.getElementById('job-summary');
  const jobItems = document.getElementById('job-items');
  const jobEvents = document.getElementById('job-events');
  const jobStatusBadge = document.getElementById('job-status-badge');
  const singleUrlForm = document.getElementById('single-url-form');
  const singleUrlInput = document.getElementById('single-url-input');
  const singleUrlAddScanButton = document.getElementById('single-url-add-scan');
  const csvForm = document.getElementById('csv-form');
  const csvFileInput = document.getElementById('csv-file');
  const csvUrlColumnInput = document.getElementById('csv-url-column');
  const csvTextInput = document.getElementById('csv-text');
  const csvAddScanButton = document.getElementById('csv-add-scan');

  const urlSearchParams = new URLSearchParams(window.location.search);
  let currentJobId = String(urlSearchParams.get('jobId') || config.publicJobId || '').trim();
  let currentJob = null;
  let currentItemsOffset = 0;
  let refreshHandle = null;
  const publicItemsPageSize = 25;

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

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatNumber(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? String(numeric) : '0';
  }

  function formatTimestamp(value) {
    if (!value) {
      return 'Never';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return String(value);
    }
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  async function fetchJson(path, options = {}) {
    const response = await fetch(apiUrl(path), {
      headers: {
        Accept: 'application/json',
        ...(options.headers || {}),
      },
      ...options,
    });

    const text = await response.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (_) {
        data = null;
      }
    }

    if (!response.ok) {
      const message = data && data.error ? data.error : `Request failed with status ${response.status}`;
      throw new Error(message);
    }

    return data;
  }

  function setMessage(message, isError = false) {
    if (!intakeMessage) return;
    intakeMessage.textContent = message || '';
    intakeMessage.className = isError ? 'message error' : 'message';
  }

  function setJobMessage(message, isError = false) {
    if (!jobTargetMessage) return;
    jobTargetMessage.textContent = message || '';
    jobTargetMessage.className = isError ? 'public-note message error' : 'public-note';
  }

  function setActionBusy(button, busy) {
    if (!button) return;
    if (busy) {
      button.dataset.prevDisabled = button.disabled ? 'true' : 'false';
      button.dataset.busy = 'true';
      button.disabled = true;
    } else {
      if (Object.prototype.hasOwnProperty.call(button.dataset, 'prevDisabled')) {
        button.disabled = button.dataset.prevDisabled === 'true';
        delete button.dataset.prevDisabled;
      }
      delete button.dataset.busy;
    }
  }

  function setActionsBusy(buttons, busy) {
    buttons.forEach((button) => setActionBusy(button, busy));
  }

  function updateJobLinks(jobId) {
    const targetHref = jobId ? `./index.html?jobId=${encodeURIComponent(jobId)}` : '#';
    if (openJobLink) {
      openJobLink.href = targetHref;
      openJobLink.setAttribute('aria-disabled', jobId ? 'false' : 'true');
      openJobLink.tabIndex = jobId ? 0 : -1;
      openJobLink.classList.toggle('disabled', !jobId);
    }
  }

  function setFormState(enabled) {
    const controls = [
      singleUrlInput,
      singleUrlAddScanButton,
      csvFileInput,
      csvUrlColumnInput,
      csvTextInput,
      csvAddScanButton,
    ];
    controls.forEach((control) => {
      if (control) {
        control.disabled = !enabled;
      }
    });
  }

  function renderJob(job) {
    currentJob = job || null;

    if (!job) {
      if (jobTarget) {
        jobTarget.className = 'summary empty';
        jobTarget.textContent = currentJobId
          ? 'This job could not be loaded.'
          : 'Set PUBLIC_JOB_ID in config.js or pass ?jobId=... to target the shared job.';
      }
      if (jobSummary) {
        jobSummary.className = 'summary empty';
        jobSummary.textContent = 'No public job loaded yet.';
      }
      if (jobStatusBadge) {
        jobStatusBadge.textContent = currentJobId ? 'Job unavailable' : 'No job configured';
      }
      if (startPendingButton) {
        startPendingButton.disabled = true;
        startPendingButton.textContent = 'Start Pending';
      }
      if (refreshItemsButton) {
        refreshItemsButton.disabled = true;
      }
      setFormState(false);
      return;
    }

    if (jobTarget) {
      jobTarget.className = 'summary';
      jobTarget.innerHTML = [
        `<div><strong>Job ID:</strong> <span class="public-code">${escapeHtml(job.id)}</span></div>`,
        `<div><strong>Label:</strong> ${escapeHtml(config.publicJobLabel || job.source_filename || 'Public intake job')}</div>`,
        `<div><strong>Status:</strong> ${escapeHtml(job.status || 'unknown')}</div>`,
        `<div><strong>Total URLs:</strong> ${formatNumber(job.total_urls)}</div>`,
        `<div><strong>Pending:</strong> ${formatNumber(job.pending_count)}</div>`,
        `<div><strong>Queued:</strong> ${formatNumber(job.queued_count)}</div>`,
        `<div><strong>Running:</strong> ${formatNumber(job.running_count)}</div>`,
        `<div><strong>Completed:</strong> ${formatNumber(job.completed_count)}</div>`,
        `<div><strong>Failed:</strong> ${formatNumber(job.failed_count)}</div>`,
      ].join('');
    }

    if (jobSummary) {
      jobSummary.className = 'summary';
      jobSummary.innerHTML = [
        `<div><strong>Source:</strong> ${escapeHtml(job.source_filename || config.publicJobLabel || 'Public intake job')}</div>`,
        `<div><strong>Column:</strong> ${escapeHtml(job.source_column || 'n/a')}</div>`,
        `<div><strong>Mode:</strong> ${escapeHtml(job.candidate_mode || 'default')}</div>`,
        `<div><strong>Scan Delay:</strong> ${formatNumber(job.scan_delay_ms)} ms</div>`,
        `<div><strong>Screenshot Delay:</strong> ${formatNumber(job.screenshot_delay_ms)} ms</div>`,
        `<div><strong>Detected:</strong> ${formatNumber(job.detected_count)}</div>`,
        `<div><strong>Updated:</strong> ${escapeHtml(formatTimestamp(job.updated_at))}</div>`,
        `<div><strong>Finished:</strong> ${escapeHtml(formatTimestamp(job.finished_at))}</div>`,
      ].join('');
    }

    if (jobStatusBadge) {
      jobStatusBadge.textContent = `${job.status || 'unknown'} | ${formatNumber(job.total_urls)} total`;
    }

    if (startPendingButton) {
      const hasPending = Math.max(0, Number(job.pending_count) || 0) > 0;
      startPendingButton.disabled = !hasPending;
      startPendingButton.textContent = hasPending ? 'Start Pending' : 'No Pending Rows';
    }
    if (refreshItemsButton) {
      refreshItemsButton.disabled = false;
    }

    setFormState(true);
    updateJobLinks(job.id);
    setJobMessage(`Current target: ${job.id}. Add rows below, then use Start Pending if you want to queue staged rows later.`);
  }

  function renderEvents(events) {
    if (!jobEvents) return;

    const items = Array.isArray(events) ? events : [];
    if (!items.length) {
      jobEvents.className = 'event-list empty';
      jobEvents.textContent = currentJobId
        ? 'No recent events for this public job yet.'
        : 'Load a job to see the latest events.';
      return;
    }

    jobEvents.className = 'event-list';
    jobEvents.innerHTML = items.map((event) => {
      const level = String(event.level || 'info').toLowerCase();
      const scope = String(event.scope || 'job');
      const type = String(event.event_type || '');
      const message = String(event.message || '');
      return [
        `<article class="event-item level-${escapeHtml(level)}">`,
        '<div class="event-item-top">',
        '<div class="event-badges">',
        `<span class="event-level ${escapeHtml(level)}">${escapeHtml(level)}</span>`,
        `<span class="event-scope">${escapeHtml(scope)}</span>`,
        type ? `<span class="event-type">${escapeHtml(type)}</span>` : '',
        '</div>',
        `<time class="event-time" datetime="${escapeHtml(event.created_at || '')}">${escapeHtml(formatTimestamp(event.created_at))}</time>`,
        '</div>',
        `<div class="event-message">${escapeHtml(message)}</div>`,
        '</article>',
      ].join('');
    }).join('');
  }

  function renderItems(items, pagination) {
    if (!jobItems) return;

    const rows = Array.isArray(items) ? items : [];
    if (!rows.length) {
      jobItems.className = 'table-shell empty';
      jobItems.textContent = currentJobId
        ? 'No URLs have been added to this public job yet.'
        : 'Load a job to see its URL list.';
      return;
    }

    const renderedRows = rows.map((item) => {
      const jobId = String(item.job_id || currentJobId || '').trim();
      const itemUrl = item.normalized_url || item.input_url || '';
      return `
      <tr>
        <td>${escapeHtml(item.row_number || '')}</td>
        <td class="mono">${itemUrl ? `<a href="${escapeHtml(itemUrl)}" target="_blank" rel="noreferrer">${escapeHtml(itemUrl)}</a>` : ''}</td>
        <td>${escapeHtml(item.status || '')}</td>
        <td>${escapeHtml(item.started_at ? formatTimestamp(item.started_at) : '')}</td>
        <td>${escapeHtml(item.completed_at ? formatTimestamp(item.completed_at) : '')}</td>
        <td>${escapeHtml(item.error_message || '')}</td>
        <td>
          <div class="action-stack">
            ${jobId ? `<a class="link-button compact" href="./index.html?jobId=${encodeURIComponent(jobId)}" target="_blank" rel="noreferrer">Open Job</a>` : ''}
            ${itemUrl ? `<a class="link-button compact" href="${escapeHtml(itemUrl)}" target="_blank" rel="noreferrer">Open URL</a>` : ''}
          </div>
        </td>
      </tr>`;
    }).join('');

    const total = pagination && Number.isFinite(Number(pagination.total))
      ? Number(pagination.total)
      : rows.length;
    const offset = pagination && Number.isFinite(Number(pagination.offset))
      ? Number(pagination.offset)
      : currentItemsOffset;
    const limit = pagination && Number.isFinite(Number(pagination.limit))
      ? Number(pagination.limit)
      : rows.length;
    const showingFrom = total ? offset + 1 : 0;
    const showingTo = Math.min(offset + limit, total || rows.length);
    const hasPrev = offset > 0;
    const hasNext = offset + limit < total;

    jobItems.className = 'table-shell';
    jobItems.innerHTML = `
      <div class="pager">
        <span>Showing ${showingFrom}-${showingTo} of ${total}</span>
        <div class="pager-actions">
          <button class="secondary compact" type="button" data-items-page="prev" ${hasPrev ? '' : 'disabled'}>Previous</button>
          <button class="secondary compact" type="button" data-items-page="next" ${hasNext ? '' : 'disabled'}>Next</button>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Row</th>
            <th>URL</th>
            <th>Status</th>
            <th>Started</th>
            <th>Completed</th>
            <th>Error</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>${renderedRows}</tbody>
      </table>
    `;
  }

  function updatePageCopy(job) {
    if (!pageTitle || !pageLede) {
      return;
    }

    const titlePrefix = config.publicJobLabel
      ? String(config.publicJobLabel)
      : (job && job.source_filename ? String(job.source_filename) : 'Public Job Queue');
    pageTitle.textContent = titlePrefix;

    if (job) {
      pageLede.textContent = `Add a single URL or import a CSV into the shared job ${job.id}. Leave scanning off to stage rows for later, or start the queue immediately after the add.`;
    } else if (currentJobId) {
      pageLede.textContent = `The public intake page is targeting job ${currentJobId}. Add a single URL or import a CSV, then choose whether to start the queue immediately.`;
    } else {
      pageLede.textContent = 'Set PUBLIC_JOB_ID in config.js or open the page with ?jobId=... so the intake form knows which shared job to use.';
    }
  }

  async function refreshJob() {
    if (!currentJobId) {
      currentJob = null;
      updatePageCopy(null);
      renderJob(null);
      renderItems([], null);
      renderEvents([]);
      if (refreshJobButton) {
        refreshJobButton.disabled = true;
      }
      return;
    }

    if (refreshJobButton) {
      refreshJobButton.disabled = true;
    }

    try {
      const [jobResponse, eventResponse] = await Promise.all([
        fetchJson(`/api/jobs/${encodeURIComponent(currentJobId)}?limit=${publicItemsPageSize}&offset=${currentItemsOffset}`),
        fetchJson(`/api/jobs/${encodeURIComponent(currentJobId)}/events?limit=25`),
      ]);
      const job = jobResponse && jobResponse.job ? jobResponse.job : null;
      currentJob = job;
      updateJobLinks(currentJobId);
      updatePageCopy(job);
      renderJob(job);
      renderItems(jobResponse.items || [], jobResponse.pagination || null);
      renderEvents(eventResponse.events || []);
      setMessage('');
    } catch (error) {
      currentJob = null;
      updatePageCopy(null);
      renderJob(null);
      renderItems([], null);
      renderEvents([]);
      setJobMessage(error && error.message ? error.message : 'Failed to load the public job.', true);
      setMessage(error && error.message ? error.message : 'Failed to load the public job.', true);
    } finally {
      if (refreshJobButton) {
        refreshJobButton.disabled = !currentJobId;
      }
    }
  }

  async function appendFromSingleUrl(startImmediately) {
    if (!currentJobId) {
      setMessage('Set PUBLIC_JOB_ID or add ?jobId=... before adding URLs.', true);
      return;
    }

    const value = String(singleUrlInput && singleUrlInput.value || '').trim();
    if (!value) {
      setMessage('Enter a URL first.', true);
      return;
    }

    const submitButtons = [
      singleUrlForm ? singleUrlForm.querySelector('button[type="submit"]') : null,
      singleUrlAddScanButton,
    ].filter(Boolean);
    const formData = new FormData();
    formData.append('csvText', value);
    formData.append('filename', 'single-url.txt');
    formData.append('startImmediately', startImmediately ? 'true' : 'false');

    setActionsBusy(submitButtons, true);
    setMessage(startImmediately ? 'Adding URL and starting the queue...' : 'Adding URL to the shared job...');
    try {
      const body = await fetchJson(`/api/jobs/${encodeURIComponent(currentJobId)}/append`, {
        method: 'POST',
        body: formData,
      });
      singleUrlInput.value = '';
      const addedCount = Number(body.insertedCount) || 0;
      const queuedCount = Number(body.queuedCount) || 0;
      setMessage(startImmediately
        ? `Added ${addedCount} URL(s) and queued ${queuedCount} pending row(s).`
        : `Added ${addedCount} URL(s) to the shared job.`);
      currentItemsOffset = 0;
      await refreshJob();
    } catch (error) {
      setMessage(error && error.message ? error.message : 'Failed to add the URL.', true);
    } finally {
      setActionsBusy(submitButtons, false);
    }
  }

  async function appendFromCsv(startImmediately) {
    if (!currentJobId) {
      setMessage('Set PUBLIC_JOB_ID or add ?jobId=... before importing CSV rows.', true);
      return;
    }

    const file = csvFileInput && csvFileInput.files ? csvFileInput.files[0] : null;
    const text = String(csvTextInput && csvTextInput.value || '').trim();
    if (!file && !text) {
      setMessage('Choose a CSV file or paste CSV/URL text first.', true);
      return;
    }

    const submitButtons = [
      csvForm ? csvForm.querySelector('button[type="submit"]') : null,
      csvAddScanButton,
    ].filter(Boolean);
    const formData = new FormData();
    if (file) {
      formData.append('file', file);
    } else {
      formData.append('csvText', text);
      formData.append('filename', 'public-intake.csv');
    }
    if (csvUrlColumnInput && String(csvUrlColumnInput.value || '').trim()) {
      formData.append('urlColumn', csvUrlColumnInput.value.trim());
    }
    formData.append('startImmediately', startImmediately ? 'true' : 'false');

    setActionsBusy(submitButtons, true);
    setMessage(startImmediately ? 'Importing rows and starting the queue...' : 'Importing rows into the shared job...');
    try {
      const body = await fetchJson(`/api/jobs/${encodeURIComponent(currentJobId)}/append`, {
        method: 'POST',
        body: formData,
      });
      if (csvFileInput) csvFileInput.value = '';
      if (csvTextInput) csvTextInput.value = '';
      const addedCount = Number(body.insertedCount) || 0;
      const queuedCount = Number(body.queuedCount) || 0;
      setMessage(startImmediately
        ? `Imported ${addedCount} URL(s) and queued ${queuedCount} pending row(s).`
        : `Imported ${addedCount} URL(s) into the shared job.`);
      currentItemsOffset = 0;
      await refreshJob();
    } catch (error) {
      setMessage(error && error.message ? error.message : 'Failed to import the CSV.', true);
    } finally {
      setActionsBusy(submitButtons, false);
    }
  }

  async function startPendingRows() {
    if (!currentJobId) {
      setMessage('Set PUBLIC_JOB_ID or add ?jobId=... before starting the queue.', true);
      return;
    }

    const wasDisabled = startPendingButton ? startPendingButton.disabled : false;
    const originalLabel = startPendingButton ? startPendingButton.textContent : '';
    if (startPendingButton) {
      startPendingButton.disabled = true;
      startPendingButton.textContent = 'Starting...';
    }
    setMessage('Starting pending rows...');
    let refreshed = false;
    try {
      const body = await fetchJson(`/api/jobs/${encodeURIComponent(currentJobId)}/start`, {
        method: 'POST',
      });
      const queuedCount = Number(body.queuedCount) || 0;
      setMessage(queuedCount
        ? `Queued ${queuedCount} pending row(s).`
        : 'No pending rows were available to queue.');
      currentItemsOffset = 0;
      await refreshJob();
      refreshed = true;
    } catch (error) {
      setMessage(error && error.message ? error.message : 'Failed to start the queue.', true);
    } finally {
      if (!refreshed && startPendingButton) {
        startPendingButton.disabled = wasDisabled;
        startPendingButton.textContent = originalLabel || 'Start Pending';
      }
    }
  }

  if (openScannerLink) {
    openScannerLink.href = currentJobId
      ? `./index.html?jobId=${encodeURIComponent(currentJobId)}`
      : './index.html';
  }

  updateJobLinks(currentJobId);

  if (singleUrlForm) {
    singleUrlForm.addEventListener('submit', (event) => {
      event.preventDefault();
      appendFromSingleUrl(false);
    });
  }

  if (singleUrlAddScanButton) {
    singleUrlAddScanButton.addEventListener('click', () => {
      appendFromSingleUrl(true);
    });
  }

  if (csvForm) {
    csvForm.addEventListener('submit', (event) => {
      event.preventDefault();
      appendFromCsv(false);
    });
  }

  if (csvAddScanButton) {
    csvAddScanButton.addEventListener('click', () => {
      appendFromCsv(true);
    });
  }

  if (startPendingButton) {
    startPendingButton.addEventListener('click', () => {
      startPendingRows();
    });
  }

  if (refreshJobButton) {
    refreshJobButton.addEventListener('click', () => {
      refreshJob();
    });
  }

  if (refreshItemsButton) {
    refreshItemsButton.addEventListener('click', () => {
      currentItemsOffset = 0;
      refreshJob();
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      return;
    }
    refreshJob();
  });

  if (jobItems) {
    jobItems.addEventListener('click', (event) => {
      const button = event.target && event.target.closest ? event.target.closest('[data-items-page]') : null;
      if (!button || !currentJobId) {
        return;
      }
      const action = button.getAttribute('data-items-page');
      if (action === 'prev') {
        currentItemsOffset = Math.max(0, currentItemsOffset - publicItemsPageSize);
      } else if (action === 'next') {
        currentItemsOffset += publicItemsPageSize;
      }
      refreshJob();
    });
  }

  refreshJob();
  refreshHandle = window.setInterval(() => {
    if (!document.hidden) {
      refreshJob();
    }
  }, 15000);

  window.addEventListener('beforeunload', () => {
    if (refreshHandle) {
      window.clearInterval(refreshHandle);
    }
  });
})();
