(function bootstrap() {
  const config = window.__APP_CONFIG__ || {};
  const apiBase = (function resolveApi(base) {
    if (base) return String(base).replace(/\/$/, '');
    const { protocol, hostname } = window.location;
    if (hostname === 'localhost' || hostname === '127.0.0.1') return `${protocol}//${hostname}:3000`;
    return '';
  }(config.apiBaseUrl));

  // ── State ────────────────────────────────────────────────────────────────────

  let currentSessionId = null;
  let pagesOffset = 0;
  const PAGE_SIZE = 50;
  let pagesTotal = 0;
  let autoRefreshTimer = null;

  // ── DOM refs ──────────────────────────────────────────────────────────────────

  const crawlerForm = document.getElementById('crawler-form');
  const crawlerFormMessage = document.getElementById('crawler-form-message');
  const sessionsPanel = document.getElementById('sessions-panel');
  const sessionsList = document.getElementById('sessions-list');
  const refreshSessionsBtn = document.getElementById('refresh-sessions');

  const pagesPanel = document.getElementById('pages-panel');
  const pagesPanelTitle = document.getElementById('pages-panel-title');
  const sessionDetailBar = document.getElementById('session-detail-bar');
  const sessionControls = document.getElementById('session-controls');
  const pagesBack = document.getElementById('pages-back');
  const pagesRefresh = document.getElementById('pages-refresh');
  const pagesExportCsv = document.getElementById('pages-export-csv');
  const pagesList = document.getElementById('pages-list');
  const pagesPagination = document.getElementById('pages-pagination');
  const pagesPrev = document.getElementById('pages-prev');
  const pagesNext = document.getElementById('pages-next');
  const pagesPageInfo = document.getElementById('pages-page-info');

  const filterStatus = document.getElementById('filter-status');
  const filterRelevant = document.getElementById('filter-relevant');
  const filterMinScore = document.getElementById('filter-min-score');
  const filterApply = document.getElementById('filter-apply');

  const seedTabRow = document.getElementById('seed-tab-row');
  const seedManual = document.getElementById('seed-manual');
  const seedCsvDiv = document.getElementById('seed-csv');

  // ── Helpers ───────────────────────────────────────────────────────────────────

  async function apiFetch(path, opts = {}) {
    const res = await fetch(apiBase + path, {
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
      ...opts,
    });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try { const j = await res.json(); msg = j.error || msg; } catch (_) {}
      throw new Error(msg);
    }
    return res.json();
  }

  function setMessage(el, text, isError) {
    el.textContent = text;
    el.className = 'message' + (isError ? ' error' : '');
  }

  function statusBadge(status) {
    const cls = {
      running: 'badge-green',
      completed: 'badge-blue',
      paused: 'badge-yellow',
      stopped: 'badge-grey',
      failed: 'badge-red',
      pending: 'badge-grey',
    }[status] || 'badge-grey';
    return `<span class="badge ${cls}">${status}</span>`;
  }

  function progressBar(done, total) {
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return `<div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div><span class="progress-label">${done.toLocaleString()} / ${total.toLocaleString()} (${pct}%)</span></div>`;
  }

  function categoryBadges(cats) {
    if (!cats || !cats.length) return '<span class="muted">—</span>';
    return cats.map((c) => `<span class="badge badge-teal">${c}</span>`).join(' ');
  }

  function escHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function truncate(s, n) {
    if (!s) return '';
    return s.length > n ? s.slice(0, n) + '…' : s;
  }

  // ── Seed tab switching ────────────────────────────────────────────────────────

  seedTabRow.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-seed-tab]');
    if (!btn) return;
    document.querySelectorAll('[data-seed-tab]').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.seedTab;
    seedManual.style.display = tab === 'manual' ? '' : 'none';
    seedCsvDiv.style.display = tab === 'csv' ? '' : 'none';
  });

  // ── Create session ────────────────────────────────────────────────────────────

  crawlerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    setMessage(crawlerFormMessage, 'Starting crawl…', false);

    const fd = new FormData(crawlerForm);
    const csvFile = document.getElementById('seed-csv-file').files[0];
    const activeTab = document.querySelector('[data-seed-tab].active').dataset.seedTab;

    try {
      let res;
      if (activeTab === 'csv' && csvFile) {
        const formData = new FormData();
        formData.append('file', csvFile);
        formData.append('name', fd.get('name') || '');
        formData.append('maxDepth', fd.get('maxDepth'));
        formData.append('linksPerPage', fd.get('linksPerPage'));
        formData.append('crawlDelayMs', fd.get('crawlDelayMs'));
        formData.append('concurrency', fd.get('concurrency'));
        formData.append('maxPages', fd.get('maxPages'));
        const raw = await fetch(apiBase + '/api/crawler/sessions', { method: 'POST', body: formData });
        if (!raw.ok) {
          const j = await raw.json().catch(() => ({}));
          throw new Error(j.error || `HTTP ${raw.status}`);
        }
        res = await raw.json();
      } else {
        res = await apiFetch('/api/crawler/sessions', {
          method: 'POST',
          body: JSON.stringify({
            name: fd.get('name') || '',
            seedUrls: fd.get('seedUrls') || '',
            maxDepth: fd.get('maxDepth'),
            linksPerPage: fd.get('linksPerPage'),
            crawlDelayMs: fd.get('crawlDelayMs'),
            concurrency: fd.get('concurrency'),
            maxPages: fd.get('maxPages'),
          }),
        });
      }

      setMessage(crawlerFormMessage, `Session "${res.session.name}" started (ID ${res.session.id}).`, false);
      crawlerForm.reset();
      await loadSessions();
    } catch (err) {
      setMessage(crawlerFormMessage, err.message, true);
    }
  });

  // ── Sessions list ─────────────────────────────────────────────────────────────

  async function loadSessions() {
    try {
      const data = await apiFetch('/api/crawler/sessions');
      renderSessions(data.sessions || []);
    } catch (err) {
      sessionsList.innerHTML = `<p class="message error">${escHtml(err.message)}</p>`;
    }
  }

  function renderSessions(sessions) {
    if (!sessions.length) {
      sessionsList.innerHTML = '<p class="muted">No crawl sessions yet.</p>';
      return;
    }

    const rows = sessions.map((s) => {
      const pct = s.max_pages > 0 ? Math.round((s.total_queued / s.max_pages) * 100) : 0;
      return `
        <div class="list-row" data-session-id="${s.id}">
          <div class="list-row-main">
            <strong class="list-row-title">${escHtml(s.name)}</strong>
            <span class="list-row-meta">${statusBadge(s.active ? 'running' : s.status)}</span>
            <span class="list-row-meta muted">ID ${s.id} · depth ${s.max_depth} · ${s.links_per_page} links/page</span>
          </div>
          <div class="list-row-stats">
            <span class="stat"><strong>${s.total_crawled.toLocaleString()}</strong> crawled</span>
            <span class="stat"><strong>${s.total_relevant.toLocaleString()}</strong> relevant</span>
            <span class="stat"><strong>${s.total_failed.toLocaleString()}</strong> failed</span>
            <span class="stat"><strong>${s.total_queued.toLocaleString()}</strong> queued</span>
          </div>
          <div class="list-row-bar">${progressBar(s.total_crawled, s.total_queued)}</div>
          <div class="list-row-actions">
            <button class="compact link-button" data-action="view" data-session-id="${s.id}">View Pages</button>
            <button class="compact link-button danger" data-action="delete" data-session-id="${s.id}">Delete</button>
          </div>
        </div>`;
    });
    sessionsList.innerHTML = rows.join('');
  }

  sessionsList.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = btn.dataset.sessionId;
    const action = btn.dataset.action;
    if (action === 'view') {
      openPagesView(id);
    } else if (action === 'delete') {
      if (!confirm('Delete this session and all its pages?')) return;
      try {
        await apiFetch(`/api/crawler/sessions/${id}`, { method: 'DELETE' });
        await loadSessions();
      } catch (err) {
        alert(err.message);
      }
    }
  });

  refreshSessionsBtn.addEventListener('click', loadSessions);

  // ── Pages view ────────────────────────────────────────────────────────────────

  function openPagesView(sessionId) {
    currentSessionId = sessionId;
    pagesOffset = 0;
    clearAutoRefresh();
    sessionsPanel.style.display = 'none';
    document.getElementById('new-session-panel').style.display = 'none';
    pagesPanel.style.display = '';
    loadPagesView();
    scheduleAutoRefresh();
  }

  pagesBack.addEventListener('click', () => {
    clearAutoRefresh();
    currentSessionId = null;
    pagesPanel.style.display = 'none';
    sessionsPanel.style.display = '';
    document.getElementById('new-session-panel').style.display = '';
    loadSessions();
  });

  pagesRefresh.addEventListener('click', loadPagesView);
  filterApply.addEventListener('click', () => { pagesOffset = 0; loadPagesView(); });

  pagesPrev.addEventListener('click', () => {
    if (pagesOffset > 0) { pagesOffset = Math.max(0, pagesOffset - PAGE_SIZE); loadPagesView(); }
  });
  pagesNext.addEventListener('click', () => {
    if (pagesOffset + PAGE_SIZE < pagesTotal) { pagesOffset += PAGE_SIZE; loadPagesView(); }
  });

  async function loadPagesView() {
    if (!currentSessionId) return;
    try {
      const [sessionData, pagesData] = await Promise.all([
        apiFetch(`/api/crawler/sessions/${currentSessionId}`),
        apiFetch(`/api/crawler/sessions/${currentSessionId}/pages?` + new URLSearchParams({
          limit: PAGE_SIZE,
          offset: pagesOffset,
          ...(filterStatus.value ? { status: filterStatus.value } : {}),
          ...(filterRelevant.value ? { isRelevant: filterRelevant.value } : {}),
          ...(filterMinScore.value ? { minScore: filterMinScore.value } : {}),
        })),
      ]);

      const session = sessionData.session;
      const counts = sessionData.counts;
      renderSessionDetailBar(session, counts);
      renderSessionControls(session);
      pagesPanelTitle.textContent = `Pages — ${session.name}`;

      pagesTotal = pagesData.total;
      renderPages(pagesData.pages);

      pagesExportCsv.href = `${apiBase}/api/crawler/sessions/${currentSessionId}/export.csv`;
      pagesExportCsv.style.display = '';

      const totalPages = Math.ceil(pagesTotal / PAGE_SIZE);
      const currentPage = Math.floor(pagesOffset / PAGE_SIZE) + 1;
      pagesPageInfo.textContent = `Page ${currentPage} of ${Math.max(1, totalPages)} (${pagesTotal.toLocaleString()} items)`;
      pagesPagination.style.display = pagesTotal > PAGE_SIZE ? '' : 'none';
      pagesPrev.disabled = pagesOffset === 0;
      pagesNext.disabled = pagesOffset + PAGE_SIZE >= pagesTotal;
    } catch (err) {
      pagesList.innerHTML = `<p class="message error">${escHtml(err.message)}</p>`;
    }
  }

  function renderSessionDetailBar(session, counts) {
    const isActive = session.active || session.status === 'running';
    sessionDetailBar.innerHTML = `
      <div class="detail-stats">
        <span class="stat">${statusBadge(isActive ? 'running' : session.status)}</span>
        <span class="stat"><strong>${parseInt(counts.done || 0).toLocaleString()}</strong> done</span>
        <span class="stat"><strong>${parseInt(counts.pending || 0).toLocaleString()}</strong> pending</span>
        <span class="stat"><strong>${parseInt(counts.crawling || 0).toLocaleString()}</strong> crawling</span>
        <span class="stat"><strong>${parseInt(counts.relevant || 0).toLocaleString()}</strong> relevant</span>
        <span class="stat"><strong>${parseInt(counts.failed || 0).toLocaleString()}</strong> failed</span>
        <span class="stat"><strong>${parseInt(counts.total || 0).toLocaleString()}</strong> total queued</span>
        <span class="stat muted">depth ${session.max_depth} · ${session.links_per_page} links/page · ${session.concurrency} concurrent · ${session.crawl_delay_ms}ms delay</span>
      </div>
      ${progressBar(parseInt(counts.done || 0) + parseInt(counts.failed || 0), parseInt(counts.total || 0))}
    `;
  }

  function renderSessionControls(session) {
    const isActive = session.active || session.status === 'running';
    const btns = [];
    if (isActive) {
      btns.push(`<button class="compact link-button" data-ctrl="pause">Pause</button>`);
      btns.push(`<button class="compact link-button danger" data-ctrl="stop">Stop</button>`);
    } else if (session.status === 'paused' || session.status === 'stopped' || session.status === 'completed') {
      btns.push(`<button class="compact primary" data-ctrl="resume">Resume</button>`);
    } else if (session.status === 'failed') {
      btns.push(`<button class="compact primary" data-ctrl="resume">Retry</button>`);
    }
    sessionControls.innerHTML = btns.join('');
  }

  sessionControls.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-ctrl]');
    if (!btn || !currentSessionId) return;
    const ctrl = btn.dataset.ctrl;
    btn.disabled = true;
    try {
      await apiFetch(`/api/crawler/sessions/${currentSessionId}/${ctrl}`, { method: 'POST' });
      await loadPagesView();
    } catch (err) {
      alert(err.message);
    } finally {
      btn.disabled = false;
    }
  });

  function renderPages(pages) {
    if (!pages.length) {
      pagesList.innerHTML = '<p class="muted">No pages match the current filter.</p>';
      return;
    }

    const rows = pages.map((p) => {
      const relevanceClass = p.is_relevant ? 'row-relevant' : (p.is_relevant === false ? '' : '');
      const scoreBar = p.relevance_score > 0
        ? `<div class="mini-score-bar"><div class="mini-score-fill" style="width:${Math.round(p.relevance_score * 100)}%"></div></div>`
        : '';
      return `
        <div class="pages-row ${relevanceClass}" data-page-id="${p.id}">
          <div class="pages-row-header">
            <span class="pages-row-depth">d${p.depth}</span>
            <a class="pages-row-url" href="${escHtml(p.url)}" target="_blank" rel="noopener noreferrer">${escHtml(truncate(p.url, 100))}</a>
            ${p.is_relevant ? '<span class="badge badge-teal">relevant</span>' : ''}
            ${p.user_state ? `<span class="badge badge-yellow">${escHtml(p.user_state)}</span>` : ''}
          </div>
          <div class="pages-row-body">
            <span class="muted">${escHtml(truncate(p.title || '', 80))}</span>
            <span class="muted">HTTP ${p.http_status || '—'} · ${p.links_followed} links followed · status: ${p.status}</span>
            ${scoreBar}
            <div class="pages-row-cats">${categoryBadges(p.matched_categories)}</div>
            ${p.error_message ? `<span class="error-text">${escHtml(truncate(p.error_message, 120))}</span>` : ''}
          </div>
          <div class="pages-row-actions">
            <button class="compact link-button" data-page-action="relevant" data-page-id="${p.id}" title="Mark as relevant">✓ Relevant</button>
            <button class="compact link-button" data-page-action="irrelevant" data-page-id="${p.id}" title="Mark as not relevant">✗ Skip</button>
          </div>
        </div>`;
    });

    pagesList.innerHTML = rows.join('');
  }

  pagesList.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-page-action]');
    if (!btn || !currentSessionId) return;
    const action = btn.dataset.pageAction;
    const pageId = btn.dataset.pageId;
    const updates = action === 'relevant'
      ? { userState: 'mark_relevant', isRelevant: true }
      : { userState: 'mark_irrelevant', isRelevant: false };
    btn.disabled = true;
    try {
      await apiFetch(`/api/crawler/sessions/${currentSessionId}/pages/${pageId}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });
      await loadPagesView();
    } catch (err) {
      alert(err.message);
      btn.disabled = false;
    }
  });

  // ── Auto refresh ──────────────────────────────────────────────────────────────

  function scheduleAutoRefresh() {
    clearAutoRefresh();
    autoRefreshTimer = setInterval(async () => {
      if (!currentSessionId) return;
      try {
        const data = await apiFetch(`/api/crawler/sessions/${currentSessionId}`);
        const session = data.session;
        const isActive = session.active || session.status === 'running';
        if (isActive) {
          await loadPagesView();
        } else {
          clearAutoRefresh();
          await loadPagesView();
        }
      } catch (_) {}
    }, 5000);
  }

  function clearAutoRefresh() {
    if (autoRefreshTimer) { clearInterval(autoRefreshTimer); autoRefreshTimer = null; }
  }

  // ── Init ──────────────────────────────────────────────────────────────────────

  loadSessions();

  // Auto-refresh sessions list every 10s when on the sessions view
  setInterval(() => {
    if (!currentSessionId) loadSessions();
  }, 10000);

}());
