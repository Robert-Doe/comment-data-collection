'use strict';

(function () {
  // ── helpers ──────────────────────────────────────────────────────────────────
  function resolveApiBase() {
    const cfg = window.__APP_CONFIG__ || {};
    if (cfg.apiBase) return String(cfg.apiBase).replace(/\/$/, '');
    const h = location.hostname;
    if (h === 'localhost' || h === '127.0.0.1') return 'http://localhost:3000';
    return 'https://api.' + h.replace(/^www\./, '');
  }
  const API = resolveApiBase();

  function getAuthHeaders() {
    const token = (window.__AUTH__ && window.__AUTH__.getToken && window.__AUTH__.getToken())
      || localStorage.getItem('auth_token') || '';
    return token ? { Authorization: 'Bearer ' + token } : {};
  }

  async function fetchJson(path, opts = {}) {
    const res = await fetch(API + path, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders(), ...(opts.headers || {}) },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || ('HTTP ' + res.status));
    return body;
  }

  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function setMessage(el, text, isError) {
    if (!el) return;
    el.textContent = text;
    el.style.color = isError ? 'var(--c-poor)' : 'var(--muted)';
  }

  function pct(rate) {
    return rate != null ? (rate * 100).toFixed(1) + '%' : '—';
  }

  function posColor(rate) {
    if (rate == null) return 'var(--muted)';
    if (rate >= 0.3) return 'var(--c-good)';
    if (rate >= 0.1) return 'var(--c-mid)';
    return 'var(--c-poor)';
  }

  // ── DOM refs ─────────────────────────────────────────────────────────────────
  const variantSelect   = document.getElementById('variant-id');
  const jobIdsInput     = document.getElementById('job-ids');
  const loadBtn         = document.getElementById('load-btn');
  const loadMessage     = document.getElementById('load-message');
  const bucketOverview  = document.getElementById('bucket-overview');
  const overviewSubtitle= document.getElementById('overview-subtitle');
  const bucketGrid      = document.getElementById('bucket-grid');
  const invPanel        = document.getElementById('investigation-panel');
  const invTitle        = document.getElementById('inv-title');
  const invSubtitle     = document.getElementById('inv-subtitle');
  const rateCompare     = document.getElementById('rate-compare');
  const suggestionsList = document.getElementById('suggestions-list');
  const shiftTbody      = document.getElementById('shift-tbody');
  const domainTbody     = document.getElementById('domain-tbody');
  const invMessage      = document.getElementById('inv-message');

  // ── load variants ─────────────────────────────────────────────────────────
  fetchJson('/api/modeling/variants').then((data) => {
    const variants = Array.isArray(data.variants) ? data.variants : [];
    if (!variants.length) { variantSelect.innerHTML = '<option value="">No variants</option>'; return; }
    variantSelect.innerHTML = variants.map((v) =>
      `<option value="${escapeHtml(v.id)}">${escapeHtml(v.title || v.id)}</option>`
    ).join('');
  }).catch(() => {
    variantSelect.innerHTML = '<option value="">Failed to load</option>';
  });

  // ── load bucket map ───────────────────────────────────────────────────────
  loadBtn.addEventListener('click', async () => {
    const variantId = variantSelect.value;
    if (!variantId) { setMessage(loadMessage, 'Select a model variant first.', true); return; }
    loadBtn.disabled = true;
    loadBtn.textContent = 'Loading…';
    setMessage(loadMessage, '', false);
    bucketOverview.style.display = 'none';
    invPanel.style.display = 'none';

    try {
      const result = await fetchJson('/api/modeling/domain-buckets', {
        method: 'POST',
        body: JSON.stringify({ variantId, jobIds: jobIdsInput.value.trim() }),
      });
      renderBucketGrid(result);
      setMessage(loadMessage, '', false);
    } catch (err) {
      setMessage(loadMessage, err.message || String(err), true);
    } finally {
      loadBtn.disabled = false;
      loadBtn.textContent = 'Load Bucket Map';
    }
  });

  function renderBucketGrid(result) {
    const buckets = Array.isArray(result.buckets) ? result.buckets : [];
    overviewSubtitle.textContent = `${result.total_labeled || 0} total labeled candidates across ${buckets.length} buckets`;

    bucketGrid.innerHTML = buckets.map((b) => {
      const posRate  = b.row_count > 0 ? b.positive_count / b.row_count : 0;
      const barColor = posRate >= 0.3 ? '#16a34a' : posRate >= 0.1 ? '#d97706' : '#dc2626';
      const barW     = Math.round(posRate * 100);

      const topDomains = (b.domains || []).slice(0, 8);
      const domainPills = topDomains.map((d) => {
        const cls = d.positive_rate >= 0.2 ? 'domain-pill pos' : 'domain-pill';
        const label = d.domain.length > 22 ? d.domain.slice(0, 20) + '…' : d.domain;
        return `<span class="${cls}" title="${escapeHtml(d.domain)} — ${pct(d.positive_rate)} positive">${escapeHtml(label)}</span>`;
      }).join('');
      const extra = (b.domains || []).length > 8
        ? `<span class="domain-pill" style="color:var(--muted)">+${(b.domains.length - 8)} more</span>` : '';

      return `
        <div class="bucket-card" id="bucket-card-${b.bucket}">
          <div class="bc-title">Bucket ${b.bucket}</div>
          <div class="bc-fold">Fold ${b.bucket}</div>
          <div class="bc-count">${b.row_count} candidates · ${b.domain_count} domains</div>
          <div class="pos-bar-track">
            <div class="pos-bar-fill" style="width:${barW}%;background:${barColor}"></div>
          </div>
          <div style="font-size:11px;color:${barColor};font-weight:700">${pct(posRate)} positive</div>
          <div class="domain-pills">${domainPills}${extra}</div>
          <button class="investigate-btn" data-fold="${b.bucket}" data-total="${b.row_count}">
            Investigate fold ${b.bucket} →
          </button>
        </div>`;
    }).join('');

    bucketOverview.style.display = '';

    bucketGrid.querySelectorAll('.investigate-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const fold = Number(btn.getAttribute('data-fold'));
        runInvestigation(fold, btn);
      });
    });
  }

  // ── investigation ─────────────────────────────────────────────────────────
  async function runInvestigation(foldIndex, triggerBtn) {
    const variantId = variantSelect.value;
    if (!variantId) return;

    // mark active card
    document.querySelectorAll('.bucket-card').forEach((c) => c.classList.remove('active'));
    const card = document.getElementById('bucket-card-' + foldIndex);
    if (card) card.classList.add('active');

    // disable all investigate buttons while running
    document.querySelectorAll('.investigate-btn').forEach((b) => { b.disabled = true; });
    triggerBtn.textContent = 'Investigating…';
    setMessage(invMessage, '', false);
    invPanel.style.display = 'none';

    try {
      const result = await fetchJson('/api/modeling/fold-investigation', {
        method: 'POST',
        body: JSON.stringify({
          variantId,
          foldIndex,
          jobIds: jobIdsInput.value.trim(),
        }),
      });
      renderInvestigation(foldIndex, result);
      invPanel.style.display = '';
      invPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      setMessage(invMessage, 'Investigation failed: ' + (err.message || String(err)), true);
    } finally {
      document.querySelectorAll('.investigate-btn').forEach((b) => { b.disabled = false; });
      triggerBtn.textContent = `Investigate fold ${foldIndex} →`;
    }
  }

  function renderInvestigation(foldIndex, r) {
    invTitle.textContent = `Fold ${foldIndex} Investigation`;
    invSubtitle.textContent = `${r.test_count} test candidates · ${r.train_count} training candidates`;

    // ── rate comparison ────────────────────────────────────────────────────
    const overallPct  = pct(r.overall_positive_rate);
    const trainPct    = pct(r.train_positive_rate);
    const testPct     = pct(r.test_positive_rate);

    const ratio = r.train_positive_rate > 0
      ? r.test_positive_rate / r.train_positive_rate : (r.test_positive_rate > 0 ? Infinity : 1);
    const testClass = ratio < 0.5 ? 'warning' : ratio > 2 ? 'warning' : 'ok';

    rateCompare.innerHTML = `
      <div class="rate-card neutral">
        <div class="rc-label">Overall dataset</div>
        <div class="rc-val">${overallPct}</div>
        <div class="rc-sub">all labeled candidates</div>
      </div>
      <div class="rate-card neutral">
        <div class="rc-label">Training buckets</div>
        <div class="rc-val">${trainPct}</div>
        <div class="rc-sub">what the model learned from</div>
      </div>
      <div class="rate-card ${testClass}">
        <div class="rc-label">Test bucket (fold ${foldIndex})</div>
        <div class="rc-val">${testPct}</div>
        <div class="rc-sub">${ratio < 0.5 ? `${(1/ratio).toFixed(1)}× fewer positives than training` : ratio > 2 ? `${ratio.toFixed(1)}× more positives than training` : 'close to training rate'}</div>
      </div>`;

    // ── suggestions ───────────────────────────────────────────────────────
    const suggestions = Array.isArray(r.suggestions) ? r.suggestions : [];
    const icons = { data_gap: '⚠️', calibration: '⚖️', feature_shift: '📐', coverage: '🔬' };
    if (suggestions.length) {
      suggestionsList.innerHTML = suggestions.map((s) => `
        <div class="suggestion ${escapeHtml(s.type)}">
          <span class="suggestion-icon">${icons[s.type] || 'ℹ️'}</span>
          <span>${escapeHtml(s.message)}</span>
        </div>`).join('');
    } else {
      suggestionsList.innerHTML = '<p style="font-size:13px;color:var(--muted)">No significant issues detected for this fold.</p>';
    }

    // ── feature shifts ─────────────────────────────────────────────────────
    const shifts = Array.isArray(r.top_feature_shifts) ? r.top_feature_shifts.slice(0, 20) : [];
    shiftTbody.innerHTML = shifts.map((f) => {
      const d = f.cohens_d;
      const abs = f.abs_d;
      let badgeClass, arrow;
      if (abs >= 0.5 && d > 0)       { badgeClass = 'd-large-pos';  arrow = '↑'; }
      else if (abs >= 0.5 && d < 0)  { badgeClass = 'd-large-neg';  arrow = '↓'; }
      else if (abs >= 0.2 && d > 0)  { badgeClass = 'd-medium-pos'; arrow = '↑'; }
      else if (abs >= 0.2 && d < 0)  { badgeClass = 'd-medium-neg'; arrow = '↓'; }
      else                            { badgeClass = 'd-small';      arrow = d > 0 ? '↑' : (d < 0 ? '↓' : '—'); }

      const sizeLabel = abs >= 0.5 ? 'large' : abs >= 0.2 ? 'medium' : 'small';
      return `<tr>
        <td>${escapeHtml(f.title)}</td>
        <td class="mono">${escapeHtml(f.family || '—')}</td>
        <td class="num">${f.train_mean}</td>
        <td class="num">${f.test_mean}</td>
        <td class="num"><span class="d-badge ${badgeClass}">${arrow} ${d.toFixed(3)}</span></td>
        <td style="font-size:11px;color:var(--muted)">${sizeLabel}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:16px">No feature shift data</td></tr>';

    // ── domain breakdown ──────────────────────────────────────────────────
    const domains = Array.isArray(r.test_domains) ? r.test_domains : [];
    domainTbody.innerHTML = domains.map((d) => {
      const rate  = d.positive_rate || 0;
      const color = rate >= 0.3 ? '#16a34a' : rate >= 0.1 ? '#d97706' : '#dc2626';
      const barW  = Math.round(rate * 100);
      return `<tr>
        <td class="host">${escapeHtml(d.domain)}</td>
        <td class="num">${d.count}</td>
        <td class="num" style="color:${color};font-weight:600">${d.positive_count}</td>
        <td>
          <div class="mini-bar-wrap">
            <div class="mini-bar-track">
              <div class="mini-bar-fill" style="width:${barW}%;background:${color}"></div>
            </div>
            <span class="mini-bar-val" style="color:${color};font-weight:600">${pct(rate)}</span>
          </div>
        </td>
      </tr>`;
    }).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:16px">No domains</td></tr>';
  }

  // ── app shell nav ─────────────────────────────────────────────────────────
  if (window.__APP_SHELL__ && typeof window.__APP_SHELL__.render === 'function') {
    window.__APP_SHELL__.render('app-shell');
  }
})();
