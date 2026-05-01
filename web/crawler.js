(function bootstrap() {
  const config = window.__APP_CONFIG__ || {};
  const apiBase = (function resolveApi(base) {
    if (base) return String(base).replace(/\/$/, '');
    const { protocol, hostname, port, origin } = window.location;
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]')
      return port === '3000' ? origin : `${protocol}//${hostname}:3000`;
    if (hostname.startsWith('api.')) return origin;
    if (hostname.startsWith('www.')) return `${protocol}//api.${hostname.slice(4)}`;
    return `${protocol}//api.${hostname}`;
  }(config.apiBaseUrl));

  // ── State ─────────────────────────────────────────────────────────────────────
  let currentSessionId = null;
  let pagesOffset = 0;
  const PAGE_SIZE = 50;
  let pagesTotal = 0;
  let autoRefreshTimer = null;
  const selectedPageIds = new Set();   // client-side checkbox selection
  let pendingPromoteIds = null;        // IDs being promoted (null = use all relevant)

  // ── DOM refs ──────────────────────────────────────────────────────────────────
  const crawlerForm        = document.getElementById('crawler-form');
  const crawlerFormMessage = document.getElementById('crawler-form-message');
  const sessionsPanel      = document.getElementById('sessions-panel');
  const sessionsList       = document.getElementById('sessions-list');
  const refreshSessionsBtn = document.getElementById('refresh-sessions');

  const pagesPanel      = document.getElementById('pages-panel');
  const pagesPanelTitle = document.getElementById('pages-panel-title');
  const sessionDetailBar = document.getElementById('session-detail-bar');
  const sessionControls  = document.getElementById('session-controls');
  const pagesBack        = document.getElementById('pages-back');
  const pagesTreeBtn     = document.getElementById('pages-tree-btn');
  const pagesRefresh     = document.getElementById('pages-refresh');
  const pagesExportCsv   = document.getElementById('pages-export-csv');
  const pagesList        = document.getElementById('pages-list');
  const pagesPagination  = document.getElementById('pages-pagination');
  const pagesPrev        = document.getElementById('pages-prev');
  const pagesNext        = document.getElementById('pages-next');
  const pagesPageInfo    = document.getElementById('pages-page-info');

  const filterStatus    = document.getElementById('filter-status');
  const filterRelevant  = document.getElementById('filter-relevant');
  const filterMinScore  = document.getElementById('filter-min-score');
  const filterTraining  = document.getElementById('filter-training');
  const filterApply     = document.getElementById('filter-apply');
  const selectAllVisible = document.getElementById('select-all-visible');

  const bulkBar       = document.getElementById('bulk-bar');
  const bulkCount     = document.getElementById('bulk-count');
  const bulkPromote   = document.getElementById('bulk-promote');
  const bulkTrain     = document.getElementById('bulk-train');
  const bulkRelevant  = document.getElementById('bulk-relevant');
  const bulkIrrelevant = document.getElementById('bulk-irrelevant');
  const bulkClear     = document.getElementById('bulk-clear');

  const treePanel      = document.getElementById('tree-panel');
  const treePanelTitle = document.getElementById('tree-panel-title');
  const treeBack       = document.getElementById('tree-back');
  const treeRoot       = document.getElementById('tree-root');

  const ancestryOverlay = document.getElementById('ancestry-overlay');
  const ancestryContent = document.getElementById('ancestry-content');
  const ancestryClose   = document.getElementById('ancestry-close');

  const promoteOverlay    = document.getElementById('promote-overlay');
  const promoteForm       = document.getElementById('promote-form');
  const promotePageCount  = document.getElementById('promote-page-count');
  const promoteName       = document.getElementById('promote-name');
  const promoteScanDelay  = document.getElementById('promote-scan-delay');
  const promoteScreenshotDelay = document.getElementById('promote-screenshot-delay');
  const promoteMinScore   = document.getElementById('promote-min-score');
  const promoteMode       = document.getElementById('promote-mode');
  const promoteMessage    = document.getElementById('promote-message');
  const promoteClose      = document.getElementById('promote-close');
  const promoteCancel     = document.getElementById('promote-cancel');

  const seedTabRow = document.getElementById('seed-tab-row');
  const seedManual = document.getElementById('seed-manual');
  const seedCsvDiv = document.getElementById('seed-csv');
  const newSessionPanel = document.getElementById('new-session-panel');

  // ── Helpers ───────────────────────────────────────────────────────────────────
  async function apiFetch(path, opts = {}) {
    const isFormData = opts.body instanceof FormData;
    const res = await fetch(apiBase + path, {
      ...opts,
      headers: isFormData ? (opts.headers || {}) : { 'Content-Type': 'application/json', ...(opts.headers || {}) },
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
    const cls = { running: 'badge-green', completed: 'badge-blue', paused: 'badge-yellow', stopped: 'badge-grey', failed: 'badge-red', pending: 'badge-grey' }[status] || 'badge-grey';
    return `<span class="badge ${cls}">${status}</span>`;
  }

  function progressBar(done, total) {
    const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
    return `<div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div><span class="progress-label">${done.toLocaleString()} / ${total.toLocaleString()} (${pct}%)</span></div>`;
  }

  function categoryBadges(cats) {
    if (!cats || !cats.length) return '<span class="muted">—</span>';
    return cats.map((c) => `<span class="badge badge-teal">${escHtml(c)}</span>`).join(' ');
  }

  function escHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function truncate(s, n) { return s && s.length > n ? s.slice(0, n) + '…' : (s || ''); }

  // ── Selection helpers ─────────────────────────────────────────────────────────
  function updateBulkBar() {
    const n = selectedPageIds.size;
    bulkBar.style.display = n > 0 ? '' : 'none';
    bulkCount.textContent = `${n} selected`;
    selectAllVisible.checked = n > 0 && document.querySelectorAll('.page-checkbox').length > 0 &&
      [...document.querySelectorAll('.page-checkbox')].every((cb) => cb.checked);
  }

  function togglePage(id, checked) {
    if (checked) selectedPageIds.add(id);
    else selectedPageIds.delete(id);
    updateBulkBar();
  }

  function clearSelection() {
    selectedPageIds.clear();
    document.querySelectorAll('.page-checkbox').forEach((cb) => { cb.checked = false; });
    updateBulkBar();
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
        ['name', 'maxDepth', 'linksPerPage', 'crawlDelayMs', 'concurrency', 'maxPages'].forEach((k) => formData.append(k, fd.get(k) || ''));
        const raw = await fetch(apiBase + '/api/crawler/sessions', { method: 'POST', body: formData });
        if (!raw.ok) { const j = await raw.json().catch(() => ({})); throw new Error(j.error || `HTTP ${raw.status}`); }
        res = await raw.json();
      } else {
        res = await apiFetch('/api/crawler/sessions', {
          method: 'POST',
          body: JSON.stringify({ name: fd.get('name') || '', seedUrls: fd.get('seedUrls') || '', maxDepth: fd.get('maxDepth'), linksPerPage: fd.get('linksPerPage'), crawlDelayMs: fd.get('crawlDelayMs'), concurrency: fd.get('concurrency'), maxPages: fd.get('maxPages') }),
        });
      }
      setMessage(crawlerFormMessage, `Session "${res.session.name}" started (ID ${res.session.id}).`, false);
      crawlerForm.reset();
      await loadSessions();
    } catch (err) { setMessage(crawlerFormMessage, err.message, true); }
  });

  // ── Sessions list ─────────────────────────────────────────────────────────────
  async function loadSessions() {
    try {
      const data = await apiFetch('/api/crawler/sessions');
      renderSessions(data.sessions || []);
    } catch (err) { sessionsList.innerHTML = `<p class="message error">${escHtml(err.message)}</p>`; }
  }

  function renderSessions(sessions) {
    if (!sessions.length) { sessionsList.innerHTML = '<p class="muted">No crawl sessions yet.</p>'; return; }
    sessionsList.innerHTML = sessions.map((s) => {
      const active = s.active || s.status === 'running';
      return `<div class="list-row">
        <div class="list-row-main">
          <strong class="list-row-title">${escHtml(s.name)}</strong>
          ${statusBadge(active ? 'running' : s.status)}
          <span class="list-row-meta muted">ID ${s.id} · depth ${s.max_depth} · ${s.links_per_page} links/page · ${s.concurrency} workers</span>
        </div>
        <div class="list-row-stats">
          <span class="stat"><strong>${s.total_crawled.toLocaleString()}</strong> crawled</span>
          <span class="stat"><strong>${s.total_relevant.toLocaleString()}</strong> relevant</span>
          <span class="stat"><strong>${s.total_failed.toLocaleString()}</strong> failed</span>
          <span class="stat"><strong>${s.total_queued.toLocaleString()}</strong> queued</span>
        </div>
        <div class="list-row-bar">${progressBar(s.total_crawled + s.total_failed, s.total_queued)}</div>
        <div class="list-row-actions">
          <button class="compact link-button" data-action="view" data-session-id="${s.id}">View Pages</button>
          <button class="compact link-button" data-action="tree" data-session-id="${s.id}">Tree</button>
          <button class="compact link-button danger" data-action="delete" data-session-id="${s.id}">Delete</button>
        </div>
      </div>`;
    }).join('');
  }

  sessionsList.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = btn.dataset.sessionId;
    if (btn.dataset.action === 'view') openPagesView(id);
    else if (btn.dataset.action === 'tree') openTreeView(id);
    else if (btn.dataset.action === 'delete') {
      if (!confirm('Delete this session and all its pages?')) return;
      try { await apiFetch(`/api/crawler/sessions/${id}`, { method: 'DELETE' }); await loadSessions(); }
      catch (err) { alert(err.message); }
    }
  });

  refreshSessionsBtn.addEventListener('click', loadSessions);

  // ── Pages view ────────────────────────────────────────────────────────────────
  function showPanel(name) {
    newSessionPanel.style.display = name === 'sessions' ? '' : 'none';
    sessionsPanel.style.display   = name === 'sessions' ? '' : 'none';
    pagesPanel.style.display      = name === 'pages'    ? '' : 'none';
    treePanel.style.display       = name === 'tree'     ? '' : 'none';
  }

  function openPagesView(sessionId) {
    currentSessionId = sessionId;
    pagesOffset = 0;
    clearSelection();
    clearAutoRefresh();
    showPanel('pages');
    loadPagesView();
    scheduleAutoRefresh();
  }

  pagesBack.addEventListener('click', () => { clearAutoRefresh(); currentSessionId = null; showPanel('sessions'); loadSessions(); });
  pagesRefresh.addEventListener('click', loadPagesView);
  filterApply.addEventListener('click', () => { pagesOffset = 0; loadPagesView(); });
  pagesPrev.addEventListener('click', () => { if (pagesOffset > 0) { pagesOffset = Math.max(0, pagesOffset - PAGE_SIZE); loadPagesView(); } });
  pagesNext.addEventListener('click', () => { if (pagesOffset + PAGE_SIZE < pagesTotal) { pagesOffset += PAGE_SIZE; loadPagesView(); } });

  pagesTreeBtn.addEventListener('click', () => { if (currentSessionId) openTreeView(currentSessionId); });

  selectAllVisible.addEventListener('change', (e) => {
    document.querySelectorAll('.page-checkbox').forEach((cb) => {
      cb.checked = e.target.checked;
      togglePage(Number(cb.dataset.pageId), e.target.checked);
    });
    updateBulkBar();
  });

  async function loadPagesView() {
    if (!currentSessionId) return;
    try {
      const params = new URLSearchParams({ limit: PAGE_SIZE, offset: pagesOffset });
      if (filterStatus.value) params.set('status', filterStatus.value);
      if (filterRelevant.value) params.set('isRelevant', filterRelevant.value);
      if (filterMinScore.value) params.set('minScore', filterMinScore.value);
      if (filterTraining.checked) params.set('userState', 'mark_training');

      const [sessionData, pagesData] = await Promise.all([
        apiFetch(`/api/crawler/sessions/${currentSessionId}`),
        apiFetch(`/api/crawler/sessions/${currentSessionId}/pages?${params}`),
      ]);

      const session = sessionData.session;
      const counts  = sessionData.counts;
      renderSessionDetailBar(session, counts);
      renderSessionControls(session);
      pagesPanelTitle.textContent = `Pages — ${session.name}`;

      pagesTotal = pagesData.total;
      renderPages(pagesData.pages);

      pagesExportCsv.href = `${apiBase}/api/crawler/sessions/${currentSessionId}/export.csv`;
      pagesExportCsv.style.display = '';

      const totalPages  = Math.ceil(pagesTotal / PAGE_SIZE);
      const currentPage = Math.floor(pagesOffset / PAGE_SIZE) + 1;
      pagesPageInfo.textContent = `Page ${currentPage} of ${Math.max(1, totalPages)} (${pagesTotal.toLocaleString()} items)`;
      pagesPagination.style.display = pagesTotal > PAGE_SIZE ? '' : 'none';
      pagesPrev.disabled = pagesOffset === 0;
      pagesNext.disabled = pagesOffset + PAGE_SIZE >= pagesTotal;
    } catch (err) { pagesList.innerHTML = `<p class="message error">${escHtml(err.message)}</p>`; }
  }

  function renderSessionDetailBar(session, counts) {
    const active = session.active || session.status === 'running';
    sessionDetailBar.innerHTML = `
      <div class="detail-stats">
        ${statusBadge(active ? 'running' : session.status)}
        <span class="stat"><strong>${parseInt(counts.done || 0).toLocaleString()}</strong> done</span>
        <span class="stat"><strong>${parseInt(counts.pending || 0).toLocaleString()}</strong> pending</span>
        <span class="stat"><strong>${parseInt(counts.crawling || 0).toLocaleString()}</strong> in flight</span>
        <span class="stat"><strong>${parseInt(counts.relevant || 0).toLocaleString()}</strong> relevant</span>
        <span class="stat"><strong>${parseInt(counts.failed || 0).toLocaleString()}</strong> failed</span>
        <span class="stat"><strong>${parseInt(counts.total || 0).toLocaleString()}</strong> total</span>
        <span class="stat muted">depth ${session.max_depth} · ${session.links_per_page} links/page · ${session.concurrency} workers · ${session.crawl_delay_ms}ms delay</span>
      </div>
      ${progressBar(parseInt(counts.done || 0) + parseInt(counts.failed || 0), parseInt(counts.total || 0))}`;
  }

  function renderSessionControls(session) {
    const active = session.active || session.status === 'running';
    const btns = [];
    if (active) {
      btns.push(`<button class="compact link-button" data-ctrl="pause">Pause</button>`);
      btns.push(`<button class="compact link-button danger" data-ctrl="stop">Stop</button>`);
    } else if (['paused', 'stopped', 'completed', 'failed'].includes(session.status)) {
      btns.push(`<button class="compact primary" data-ctrl="resume">Resume</button>`);
    }
    btns.push(`<button class="compact link-button" data-ctrl="promote-all">Promote All Relevant → Job</button>`);
    sessionControls.innerHTML = btns.join('');
  }

  sessionControls.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-ctrl]');
    if (!btn || !currentSessionId) return;
    const ctrl = btn.dataset.ctrl;
    if (ctrl === 'promote-all') { openPromoteModal(null); return; }
    btn.disabled = true;
    try { await apiFetch(`/api/crawler/sessions/${currentSessionId}/${ctrl}`, { method: 'POST' }); await loadPagesView(); }
    catch (err) { alert(err.message); }
    finally { btn.disabled = false; }
  });

  // ── Page rows ─────────────────────────────────────────────────────────────────
  function renderPages(pages) {
    if (!pages.length) { pagesList.innerHTML = '<p class="muted">No pages match the current filter.</p>'; return; }
    pagesList.innerHTML = pages.map((p) => {
      const rel = p.is_relevant;
      const rowCls = rel ? 'pages-row row-relevant' : 'pages-row';
      const checked = selectedPageIds.has(p.id) ? 'checked' : '';
      const trainBadge = p.include_in_training ? '<span class="badge badge-yellow">training</span>' : '';
      const scoreBar = p.relevance_score > 0
        ? `<div class="mini-score-bar"><div class="mini-score-fill" style="width:${Math.round(p.relevance_score * 100)}%"></div></div>` : '';
      return `<div class="${rowCls}" data-page-id="${p.id}">
        <div class="pages-row-header">
          <input type="checkbox" class="page-checkbox" data-page-id="${p.id}" ${checked} style="flex-shrink:0">
          <span class="pages-row-depth">d${p.depth}</span>
          <a class="pages-row-url" href="${escHtml(p.url)}" target="_blank" rel="noopener noreferrer">${escHtml(truncate(p.url, 90))}</a>
          ${rel ? '<span class="badge badge-teal">relevant</span>' : ''}
          ${trainBadge}
          ${p.user_state && p.user_state !== 'mark_training' ? `<span class="badge badge-grey">${escHtml(p.user_state)}</span>` : ''}
        </div>
        <div class="pages-row-body">
          ${p.title ? `<span class="muted">${escHtml(truncate(p.title, 80))}</span>` : ''}
          <span class="muted">HTTP ${p.http_status || '—'} · ${p.links_followed || 0} new links queued · ${p.outbound_links_found || 0} found · status: ${p.status}</span>
          ${scoreBar}
          <div class="pages-row-cats">${categoryBadges(p.matched_categories)}</div>
          ${p.error_message ? `<span class="error-text">${escHtml(truncate(p.error_message, 120))}</span>` : ''}
        </div>
        <div class="pages-row-actions">
          <button class="compact link-button" data-page-action="trace" data-page-id="${p.id}">🔍 Trace</button>
          <button class="compact link-button" data-page-action="children" data-page-id="${p.id}" data-url="${escHtml(p.url)}">▶ Children</button>
          <button class="compact link-button" data-page-action="relevant" data-page-id="${p.id}">✓ Relevant</button>
          <button class="compact link-button" data-page-action="irrelevant" data-page-id="${p.id}">✗ Skip</button>
          <button class="compact link-button" data-page-action="train" data-page-id="${p.id}">🏷 Training</button>
        </div>
      </div>`;
    }).join('');
  }

  pagesList.addEventListener('change', (e) => {
    if (e.target.classList.contains('page-checkbox')) {
      togglePage(Number(e.target.dataset.pageId), e.target.checked);
    }
  });

  pagesList.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-page-action]');
    if (!btn || !currentSessionId) return;
    const action  = btn.dataset.pageAction;
    const pageId  = btn.dataset.pageId;

    if (action === 'trace') { await showAncestry(pageId); return; }
    if (action === 'children') { await showInlineChildren(pageId, btn.dataset.url, btn); return; }

    const updates = {
      relevant:   { userState: 'mark_relevant', isRelevant: true },
      irrelevant: { userState: 'mark_irrelevant', isRelevant: false },
      train:      { userState: 'mark_training', include_in_training: true },
    }[action];
    if (!updates) return;
    btn.disabled = true;
    try {
      await apiFetch(`/api/crawler/sessions/${currentSessionId}/pages/${pageId}`, { method: 'PATCH', body: JSON.stringify(updates) });
      await loadPagesView();
    } catch (err) { alert(err.message); btn.disabled = false; }
  });

  // ── Ancestry modal ────────────────────────────────────────────────────────────
  ancestryClose.addEventListener('click', () => { ancestryOverlay.style.display = 'none'; });
  ancestryOverlay.addEventListener('click', (e) => { if (e.target === ancestryOverlay) ancestryOverlay.style.display = 'none'; });

  async function showAncestry(pageId) {
    ancestryContent.innerHTML = '<p class="muted">Loading…</p>';
    ancestryOverlay.style.display = 'flex';
    try {
      const data = await apiFetch(`/api/crawler/sessions/${currentSessionId}/pages/${pageId}/ancestry`);
      const chain = data.ancestry || [];
      if (!chain.length) { ancestryContent.innerHTML = '<p class="muted">No ancestry found.</p>'; return; }
      ancestryContent.innerHTML = chain.map((p, i) => {
        const indent = i * 20;
        const rel = p.is_relevant ? '<span class="badge badge-teal">relevant</span>' : '';
        const cats = p.matched_categories && p.matched_categories.length ? categoryBadges(p.matched_categories) : '';
        const isLast = i === chain.length - 1;
        return `<div class="ancestry-node ${isLast ? 'ancestry-node-current' : ''}" style="margin-left:${indent}px">
          <span class="pages-row-depth">d${p.depth}${p.is_seed ? ' seed' : ''}</span>
          <a href="${escHtml(p.url)}" target="_blank" rel="noopener" class="pages-row-url">${escHtml(truncate(p.url, 80))}</a>
          ${rel} ${cats}
          ${p.title ? `<span class="muted">${escHtml(truncate(p.title, 60))}</span>` : ''}
        </div>
        ${i < chain.length - 1 ? `<div class="ancestry-arrow" style="margin-left:${indent + 10}px">↓</div>` : ''}`;
      }).join('');
    } catch (err) { ancestryContent.innerHTML = `<p class="message error">${escHtml(err.message)}</p>`; }
  }

  // ── Inline children under a page row ─────────────────────────────────────────
  async function showInlineChildren(pageId, parentUrl, triggerBtn) {
    const existingPanel = document.getElementById(`children-${pageId}`);
    if (existingPanel) { existingPanel.remove(); triggerBtn.textContent = '▶ Children'; return; }
    triggerBtn.textContent = '⟳ Loading…';
    try {
      const data = await apiFetch(`/api/crawler/sessions/${currentSessionId}/pages/${pageId}/children`);
      const children = data.children || [];
      const panel = document.createElement('div');
      panel.id = `children-${pageId}`;
      panel.className = 'inline-children';
      if (!children.length) {
        panel.innerHTML = '<p class="muted" style="padding:6px 0">No children crawled yet.</p>';
      } else {
        panel.innerHTML = `<div class="inline-children-header"><strong>${children.length} children of</strong> <span class="muted">${escHtml(truncate(parentUrl, 60))}</span></div>` +
          children.map((c) => {
            const rel = c.is_relevant ? '<span class="badge badge-teal">relevant</span>' : '';
            return `<div class="inline-child-row">
              <span class="pages-row-depth">d${c.depth}</span>
              <a class="pages-row-url" href="${escHtml(c.url)}" target="_blank" rel="noopener">${escHtml(truncate(c.url, 70))}</a>
              ${rel} ${categoryBadges(c.matched_categories)}
              <span class="muted">${c.links_followed || 0} links queued</span>
              <button class="compact link-button" data-page-action="trace" data-page-id="${c.id}" style="font-size:0.75rem">Trace</button>
            </div>`;
          }).join('');
      }
      triggerBtn.closest('.pages-row').after(panel);
      triggerBtn.textContent = '▼ Children';
    } catch (err) { alert(err.message); triggerBtn.textContent = '▶ Children'; }
  }

  // ── Bulk actions ──────────────────────────────────────────────────────────────
  bulkClear.addEventListener('click', clearSelection);

  bulkRelevant.addEventListener('click', async () => {
    if (!selectedPageIds.size) return;
    await bulkPatch([...selectedPageIds], { is_relevant: true, user_state: 'mark_relevant' });
  });
  bulkIrrelevant.addEventListener('click', async () => {
    if (!selectedPageIds.size) return;
    await bulkPatch([...selectedPageIds], { is_relevant: false, user_state: 'mark_irrelevant' });
  });
  bulkTrain.addEventListener('click', async () => {
    if (!selectedPageIds.size) return;
    await bulkPatch([...selectedPageIds], { include_in_training: true, user_state: 'mark_training' });
  });
  bulkPromote.addEventListener('click', () => {
    openPromoteModal([...selectedPageIds]);
  });

  async function bulkPatch(ids, updates) {
    try {
      await apiFetch(`/api/crawler/sessions/${currentSessionId}/pages/bulk`, { method: 'PATCH', body: JSON.stringify({ pageIds: ids, updates }) });
      clearSelection();
      await loadPagesView();
    } catch (err) { alert(err.message); }
  }

  // ── Promote to Job modal ──────────────────────────────────────────────────────
  promoteClose.addEventListener('click', () => { promoteOverlay.style.display = 'none'; });
  promoteCancel.addEventListener('click', () => { promoteOverlay.style.display = 'none'; });
  promoteOverlay.addEventListener('click', (e) => { if (e.target === promoteOverlay) promoteOverlay.style.display = 'none'; });

  function openPromoteModal(pageIds) {
    pendingPromoteIds = pageIds;
    const label = pageIds ? `${pageIds.length} selected pages` : 'all relevant pages';
    promotePageCount.textContent = `Will promote ${label} to a new Scanner job.`;
    promoteMessage.textContent = '';
    promoteName.value = '';
    promoteOverlay.style.display = 'flex';
  }

  promoteForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    setMessage(promoteMessage, 'Creating job(s)…', false);
    try {
      const body = {
        pageIds: pendingPromoteIds || undefined,
        jobName: promoteName.value.trim() || undefined,
        scanDelayMs: Number(promoteScanDelay.value),
        screenshotDelayMs: Number(promoteScreenshotDelay.value),
        candidateMode: promoteMode.value,
        minScore: Number(promoteMinScore.value),
      };
      const data = await apiFetch(`/api/crawler/sessions/${currentSessionId}/promote-to-job`, { method: 'POST', body: JSON.stringify(body) });
      const jobCount = data.jobs.length;
      if (jobCount === 1) {
        setMessage(promoteMessage, `Job created! ${data.totalUrls} URLs queued.`, false);
        promoteMessage.innerHTML += ` <a href="./index.html" style="color:var(--accent)">→ Open Scanner</a>`;
      } else {
        setMessage(promoteMessage, `${jobCount} jobs created across ${data.totalUrls} URLs:`, false);
        const links = data.jobs.map((j) =>
          `<a href="./index.html" style="color:var(--accent)">${escHtml(j.name)} (${j.totalUrls})</a>`
        ).join(' · ');
        promoteMessage.innerHTML += `<br><small>${links}</small>`;
      }
      clearSelection();
    } catch (err) { setMessage(promoteMessage, err.message, true); }
  });

  // ── Tree view ─────────────────────────────────────────────────────────────────
  treeBack.addEventListener('click', () => { showPanel('pages'); });

  async function openTreeView(sessionId) {
    currentSessionId = sessionId;
    clearAutoRefresh();
    showPanel('tree');
    treeRoot.innerHTML = '<p class="muted">Loading seeds…</p>';
    try {
      const sessionData = await apiFetch(`/api/crawler/sessions/${sessionId}`);
      treePanelTitle.textContent = `Crawl Tree — ${sessionData.session.name}`;
      const data = await apiFetch(`/api/crawler/sessions/${sessionId}/seeds`);
      const seeds = data.seeds || [];
      if (!seeds.length) { treeRoot.innerHTML = '<p class="muted">No seed pages found yet.</p>'; return; }
      treeRoot.innerHTML = '';
      seeds.forEach((seed) => {
        treeRoot.appendChild(buildTreeNode(seed, sessionId, 0));
      });
    } catch (err) { treeRoot.innerHTML = `<p class="message error">${escHtml(err.message)}</p>`; }
  }

  function buildTreeNode(page, sessionId, indent) {
    const wrapper = document.createElement('div');
    wrapper.className = 'tree-node';
    wrapper.style.marginLeft = `${indent}px`;

    const rel = page.is_relevant ? '<span class="badge badge-teal">relevant</span>' : '';
    const train = page.include_in_training ? '<span class="badge badge-yellow">training</span>' : '';
    const cats = page.matched_categories && page.matched_categories.length ? categoryBadges(page.matched_categories) : '';
    const hasChildren = (page.links_followed || 0) > 0;

    wrapper.innerHTML = `
      <div class="tree-node-row ${page.is_relevant ? 'tree-relevant' : ''}">
        <button class="tree-expand ${hasChildren ? '' : 'tree-expand-empty'}" data-page-id="${page.id}" data-expanded="false">${hasChildren ? '▶' : '·'}</button>
        <span class="pages-row-depth">d${page.depth}${page.is_seed ? ' seed' : ''}</span>
        <a class="pages-row-url" href="${escHtml(page.url)}" target="_blank" rel="noopener">${escHtml(truncate(page.url, 70))}</a>
        ${rel} ${train} ${cats}
        <span class="muted">${page.links_followed || 0} links queued · HTTP ${page.http_status || '—'}</span>
        <button class="compact link-button tree-trace-btn" data-page-id="${page.id}" style="font-size:0.75rem">Trace</button>
      </div>
      <div class="tree-children" style="display:none"></div>`;

    const expandBtn = wrapper.querySelector('.tree-expand');
    const childrenDiv = wrapper.querySelector('.tree-children');

    if (hasChildren) {
      expandBtn.addEventListener('click', async () => {
        const expanded = expandBtn.dataset.expanded === 'true';
        if (expanded) {
          childrenDiv.style.display = 'none';
          expandBtn.textContent = '▶';
          expandBtn.dataset.expanded = 'false';
          return;
        }
        expandBtn.textContent = '⟳';
        try {
          const data = await apiFetch(`/api/crawler/sessions/${sessionId}/pages/${page.id}/children`);
          childrenDiv.innerHTML = '';
          (data.children || []).forEach((child) => {
            childrenDiv.appendChild(buildTreeNode(child, sessionId, 0));
          });
          if (!data.children || !data.children.length) {
            childrenDiv.innerHTML = '<p class="muted" style="padding:4px 0 4px 20px">No children loaded yet.</p>';
          }
          childrenDiv.style.display = '';
          expandBtn.textContent = '▼';
          expandBtn.dataset.expanded = 'true';
        } catch (err) { expandBtn.textContent = '▶'; alert(err.message); }
      });
    }

    wrapper.querySelector('.tree-trace-btn').addEventListener('click', async () => {
      // Switch to pages panel ancestry view
      showPanel('pages');
      pagesPanel.style.display = '';
      treePanel.style.display = 'none';
      await showAncestry(page.id);
    });

    return wrapper;
  }

  // ── Auto refresh ──────────────────────────────────────────────────────────────
  function scheduleAutoRefresh() {
    clearAutoRefresh();
    autoRefreshTimer = setInterval(async () => {
      if (!currentSessionId) return;
      try {
        const data = await apiFetch(`/api/crawler/sessions/${currentSessionId}`);
        if (data.session.active || data.session.status === 'running') {
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
  setInterval(() => { if (!currentSessionId) loadSessions(); }, 10000);
}());
