'use strict';

(function () {
  var appConfig = window.__APP_CONFIG__ || {};
  var apiBase = appConfig.apiBase || '';

  // ── Auth helpers ────────────────────────────────────────────────────────────
  function authHeaders() {
    try {
      var token = localStorage.getItem('ugc_auth_token');
      return token ? { Authorization: 'Bearer ' + token } : {};
    } catch (_) { return {}; }
  }

  function fetchJson(url, opts) {
    var merged = Object.assign({}, opts, {
      headers: Object.assign({}, authHeaders(), (opts && opts.headers) || {}),
    });
    return fetch(apiBase + url, merged).then(function (r) {
      return r.json().then(function (data) {
        if (!r.ok) throw new Error(data && data.error ? data.error : r.statusText);
        return data;
      });
    });
  }

  // ── DOM refs ─────────────────────────────────────────────────────────────────
  var previewEl    = document.getElementById('preview-stats');
  var jobsEl       = document.getElementById('source-jobs');
  var refreshBtn   = document.getElementById('refresh-btn');
  var nameInput    = document.getElementById('job-name');
  var inferredCb   = document.getElementById('include-inferred');
  var createBtn    = document.getElementById('create-btn');
  var statusEl     = document.getElementById('create-status');
  var resultEl     = document.getElementById('create-result');

  // ── Utils ─────────────────────────────────────────────────────────────────────
  function escHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtNum(n) {
    return Number(n || 0).toLocaleString();
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleDateString(); } catch (_) { return iso; }
  }

  // ── Preview ──────────────────────────────────────────────────────────────────
  function loadPreview() {
    previewEl.innerHTML = '<p style="color:var(--muted)">Loading preview…</p>';
    jobsEl.innerHTML    = '<p style="color:var(--muted)">Loading…</p>';
    fetchJson('/api/unifier/preview')
      .then(function (data) { renderPreview(data); })
      .catch(function (err) {
        previewEl.innerHTML = '<p style="color:#dc2626">Failed to load preview: ' + escHtml(err.message || String(err)) + '</p>';
        jobsEl.innerHTML = '';
      });
  }

  function statCard(label, value, note) {
    return '<article class="docs-card">'
      + '<div style="font-size:2rem;font-weight:800;line-height:1;margin-bottom:6px;color:var(--text)">' + escHtml(value) + '</div>'
      + '<div style="font-weight:600;font-size:0.9rem;margin-bottom:4px;color:var(--text)">' + escHtml(label) + '</div>'
      + (note ? '<div style="font-size:0.78rem;color:var(--muted)">' + escHtml(note) + '</div>' : '')
      + '</article>';
  }

  function renderPreview(data) {
    previewEl.innerHTML = [
      statCard('Unique URLs',       fmtNum(data.unique_urls),       'After deduplication by normalized URL'),
      statCard('Total Labeled',     fmtNum(data.total_labeled),     'Candidate reviews with a binary label'),
      statCard('Human Labeled',     fmtNum(data.human_labeled),     'source: web_review'),
      statCard('Inferred Labels',   fmtNum(data.inferred_labeled),  'source: inferred (model-generated)'),
      statCard('Source Jobs',       fmtNum(data.source_job_count),  'Jobs contributing labeled items'),
      statCard('Cross-job Dupes',   fmtNum(data.duplicate_urls),    'URLs in more than one job'),
    ].join('');

    var jobs = Array.isArray(data.source_jobs) ? data.source_jobs : [];
    if (!jobs.length) {
      jobsEl.innerHTML = '<p style="color:var(--muted)">No jobs found.</p>';
      return;
    }

    var rows = jobs.map(function (j) {
      return '<tr>'
        + '<td style="font-family:monospace;font-size:0.78rem;color:var(--muted)" title="' + escHtml(j.id) + '">' + escHtml(j.id.slice(0, 8)) + '…</td>'
        + '<td>' + escHtml(j.source_filename || '—') + '</td>'
        + '<td>' + fmtDate(j.created_at) + '</td>'
        + '<td style="text-align:right">' + fmtNum(j.total_urls) + '</td>'
        + '<td style="text-align:right">' + fmtNum(j.completed_count) + '</td>'
        + '<td style="text-align:right">' + fmtNum(j.detected_count) + '</td>'
        + '</tr>';
    }).join('');

    jobsEl.innerHTML = '<div style="overflow-x:auto">'
      + '<table style="width:100%;border-collapse:collapse;font-size:0.875rem">'
      + '<thead><tr style="border-bottom:2px solid var(--line)">'
      + '<th style="text-align:left;padding:8px 12px;color:var(--muted);font-weight:600">ID</th>'
      + '<th style="text-align:left;padding:8px 12px;color:var(--muted);font-weight:600">Source File</th>'
      + '<th style="text-align:left;padding:8px 12px;color:var(--muted);font-weight:600">Created</th>'
      + '<th style="text-align:right;padding:8px 12px;color:var(--muted);font-weight:600">Total</th>'
      + '<th style="text-align:right;padding:8px 12px;color:var(--muted);font-weight:600">Done</th>'
      + '<th style="text-align:right;padding:8px 12px;color:var(--muted);font-weight:600">Detected</th>'
      + '</tr></thead>'
      + '<tbody style="font-size:0.875rem">' + rows + '</tbody>'
      + '</table></div>';
  }

  // ── Create ───────────────────────────────────────────────────────────────────
  function handleCreate() {
    var name            = (nameInput.value || '').trim() || 'Unified Dataset';
    var includeInferred = inferredCb.checked;

    createBtn.disabled  = true;
    statusEl.textContent = 'Creating unified job…';
    statusEl.style.color = 'var(--muted)';
    resultEl.innerHTML   = '';

    fetchJson('/api/unifier/create', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name: name, includeInferred: includeInferred }),
    })
      .then(function (data) {
        createBtn.disabled   = false;
        statusEl.textContent = '';
        renderResult(data);
        loadPreview(); // refresh stats to reflect new job
      })
      .catch(function (err) {
        createBtn.disabled   = false;
        statusEl.textContent = 'Error: ' + String(err.message || err);
        statusEl.style.color = '#dc2626';
      });
  }

  function renderResult(data) {
    resultEl.innerHTML = '<div style="'
      + 'background:var(--panel);border:1px solid #16a34a;border-radius:16px;'
      + 'padding:24px;margin-top:4px">'
      + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">'
      + '<span style="font-size:1.25rem">✅</span>'
      + '<h3 style="margin:0;font-size:1.1rem">Unified job created</h3>'
      + '</div>'
      + '<p style="margin:0 0 12px;font-size:0.9rem">'
      + '<strong>' + escHtml(data.jobName) + '</strong>'
      + ' &nbsp;·&nbsp; ID: <code style="font-size:0.82rem;user-select:all">' + escHtml(data.jobId) + '</code>'
      + '</p>'
      + '<ul style="margin:0 0 16px;padding-left:20px;font-size:0.875rem;line-height:1.8">'
      + '<li><strong>' + fmtNum(data.totalUrls)          + '</strong> unique URLs merged</li>'
      + '<li><strong>' + fmtNum(data.detectedCount)       + '</strong> detected as comment regions</li>'
      + '<li><strong>' + fmtNum(data.sourceJobCount)      + '</strong> source jobs merged</li>'
      + '<li><strong>' + fmtNum(data.duplicatesRemoved)   + '</strong> cross-job duplicates removed</li>'
      + '</ul>'
      + '<a class="btn" href="./index.html" style="text-decoration:none;display:inline-block">'
      + 'Open Scanner to view job →'
      + '</a>'
      + '</div>';
  }

  // ── Wire events ───────────────────────────────────────────────────────────────
  refreshBtn.addEventListener('click', loadPreview);
  createBtn.addEventListener('click', handleCreate);

  // Expose for inline onclick if needed
  window.loadPreview = loadPreview;

  // ── Boot ──────────────────────────────────────────────────────────────────────
  loadPreview();
})();
