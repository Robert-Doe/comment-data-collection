(function bootstrap() {
  const config = window.__APP_CONFIG__ || {};
  const apiBase = (config.apiBaseUrl || '').replace(/\/$/, '');

  const form = document.getElementById('upload-form');
  const fileInput = document.getElementById('csv-file');
  const urlColumnInput = document.getElementById('url-column');
  const formMessage = document.getElementById('form-message');
  const jobSummary = document.getElementById('job-summary');
  const jobItems = document.getElementById('job-items');
  const recentJobs = document.getElementById('recent-jobs');
  const refreshJobsButton = document.getElementById('refresh-jobs');
  const downloadCsv = document.getElementById('download-csv');
  const downloadJson = document.getElementById('download-json');

  let currentJobId = new URLSearchParams(window.location.search).get('jobId') || '';
  let currentOffset = 0;
  const pageSize = 50;
  let pollHandle = null;

  function apiUrl(path) {
    return `${apiBase}${path}`;
  }

  function resolveAssetUrl(url) {
    if (!url) return '';
    if (/^https?:\/\//i.test(url)) return url;
    return apiUrl(url);
  }

  function setMessage(text, isError) {
    formMessage.textContent = text || '';
    formMessage.className = isError ? 'message error' : 'message';
  }

  function setDownloads(jobId) {
    if (!jobId) {
      downloadCsv.classList.add('disabled');
      downloadJson.classList.add('disabled');
      downloadCsv.href = '#';
      downloadJson.href = '#';
      return;
    }

    downloadCsv.classList.remove('disabled');
    downloadJson.classList.remove('disabled');
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
      `<div><strong>Job:</strong> ${job.id}</div>`,
      `<div><strong>Status:</strong> ${job.status}</div>`,
      `<div><strong>Pending:</strong> ${job.pending_count}</div>`,
      `<div><strong>Queued:</strong> ${job.queued_count}</div>`,
      `<div><strong>Running:</strong> ${job.running_count}</div>`,
      `<div><strong>Completed:</strong> ${job.completed_count}</div>`,
      `<div><strong>Failed:</strong> ${job.failed_count}</div>`,
      `<div><strong>Detected:</strong> ${job.detected_count}</div>`,
      `<div><strong>Total:</strong> ${job.total_urls}</div>`,
    ].join('');
  }

  function renderItems(items, pagination) {
    if (!items || !items.length) {
      jobItems.className = 'table-shell empty';
      jobItems.textContent = 'No rows for this job yet.';
      return;
    }

    const rows = items.map((item) => `
      <tr>
        <td>${item.row_number}</td>
        <td class="mono">${item.normalized_url || ''}</td>
        <td>${item.status}</td>
        <td>${item.best_ugc_type || ''}</td>
        <td>${item.best_score ?? ''}</td>
        <td>${item.ugc_detected ? 'yes' : 'no'}</td>
        <td>${item.screenshot_url ? `<a href="${resolveAssetUrl(item.screenshot_url)}" target="_blank" rel="noreferrer">View</a>` : ''}</td>
        <td>${item.error_message || ''}</td>
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
            <th>Screenshot</th>
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
      <tr data-job-id="${job.id}">
        <td class="mono">${job.id}</td>
        <td>${job.status}</td>
        <td>${job.completed_count}/${job.total_urls}</td>
        <td>${job.detected_count}</td>
        <td><button class="secondary compact" type="button" data-open-job="${job.id}">Open</button></td>
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

  async function refreshJob(jobId) {
    if (!jobId) return;
    const { job, items, pagination } = await fetchJson(`/api/jobs/${jobId}?limit=${pageSize}&offset=${currentOffset}`);
    currentJobId = jobId;
    window.history.replaceState({}, '', `?jobId=${jobId}`);
    renderSummary(job);
    renderItems(items, pagination);
    setDownloads(jobId);

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

    const response = await fetch(apiUrl('/api/jobs'), {
      method: 'POST',
      body: formData,
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(body.error || 'Failed to create job.', true);
      return;
    }

    setMessage(`Job ${body.jobId} created.`, false);
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

  form.addEventListener('submit', (event) => {
    handleSubmit(event).catch((error) => {
      setMessage(error.message || String(error), true);
    });
  });

  refreshJobsButton.addEventListener('click', () => {
    refreshJobs().catch((error) => console.error(error));
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
    const button = event.target.closest('[data-page-action]');
    if (!button || !currentJobId) return;
    const action = button.getAttribute('data-page-action');
    if (action === 'prev') {
      currentOffset = Math.max(0, currentOffset - pageSize);
    } else if (action === 'next') {
      currentOffset += pageSize;
    }
    refreshJob(currentJobId).catch((error) => console.error(error));
  });

  setDownloads(currentJobId);
  refreshJobs().catch((error) => console.error(error));
  if (currentJobId) {
    refreshJob(currentJobId).catch((error) => console.error(error));
    pollHandle = setInterval(() => {
      refreshJob(currentJobId).catch((error) => console.error(error));
    }, 4000);
  }
}());
