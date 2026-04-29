'use strict';

(function bootstrapDomainMetrics() {
  const config = window.__APP_CONFIG__ || {};
  const apiBase = (config.apiBaseUrl || '').replace(/\/+$/, '');

  function apiUrl(path) { return `${apiBase}${path}`; }

  function esc(v) {
    return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function pct(v, dp) {
    if (v === null || v === undefined || isNaN(Number(v))) return '—';
    return (Number(v) * 100).toFixed(dp !== undefined ? dp : 1) + '%';
  }

  function num(v) {
    if (v === null || v === undefined) return '—';
    return String(Number(v));
  }

  async function fetchJson(path, opts) {
    const res = await fetch(apiUrl(path), {
      headers: { Accept: 'application/json', ...((opts && opts.headers) || {}) },
      ...(opts || {}),
    });
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch (_) { /* */ }
    if (!res.ok) throw new Error((data && data.error) || `HTTP ${res.status}`);
    return data;
  }

  // ── DOM refs ─────────────────────────────────────────────────────────────────
  const confForm          = document.getElementById('confusion-form');
  const confModelId       = document.getElementById('conf-model-id');
  const confJobIds        = document.getElementById('conf-job-ids');
  const confSiteText      = document.getElementById('conf-site-text');
  const confFetchUrl      = document.getElementById('conf-fetch-url');
  const confFetchBtn      = document.getElementById('conf-fetch-btn');
  const fetchMessage      = document.getElementById('fetch-message');
  const confThreshold     = document.getElementById('conf-threshold');
  const thresholdDisplay  = document.getElementById('conf-threshold-display');
  const confSubmit        = document.getElementById('conf-submit');
  const confClear         = document.getElementById('conf-clear');
  const confMessage       = document.getElementById('conf-message');
  const resultsPanel      = document.getElementById('results-panel');
  const resultsSubtitle   = document.getElementById('results-subtitle');
  const statRow           = document.getElementById('stat-row');
  const cmContainer       = document.getElementById('cm-svg-container');
  const arcContainer      = document.getElementById('accuracy-arc-container');
  const metricTiles       = document.getElementById('metric-tiles');
  const candidateSummary  = document.getElementById('candidate-summary');
  const chartsPanel       = document.getElementById('charts-panel');
  const f1BarChart        = document.getElementById('f1-bar-chart');
  const prScatterChart    = document.getElementById('pr-scatter-chart');
  const domainTablePanel  = document.getElementById('domain-table-panel');
  const domainCountBadge  = document.getElementById('domain-count-badge');
  const domainTableShell  = document.getElementById('domain-table-shell');

  // ── Sort state ────────────────────────────────────────────────────────────────
  let sortKey = 'labeled_candidates';
  let sortDir = 'desc';
  let lastDomains = [];

  // ── Threshold slider ──────────────────────────────────────────────────────────
  confThreshold.addEventListener('input', () => {
    thresholdDisplay.textContent = Number(confThreshold.value).toFixed(2);
  });

  // ── Load models ───────────────────────────────────────────────────────────────
  async function loadModels() {
    try {
      const data = await fetchJson('/api/modeling/models');
      const models = Array.isArray(data && data.models) ? data.models : [];
      if (!models.length) {
        confModelId.innerHTML = '<option value="">No trained models — train one in Model Lab first</option>';
        confModelId.disabled = true;
        return;
      }
      confModelId.innerHTML = models.map((m) => {
        const label = [
          m.variant_title || m.variant_id || m.id,
          m.algorithm ? m.algorithm.replace(/_/g, ' ') : '',
          m.created_at ? String(m.created_at).slice(0, 10) : '',
        ].filter(Boolean).join(' · ');
        return `<option value="${esc(m.id)}">${esc(label)}</option>`;
      }).join('');
      confModelId.disabled = false;
    } catch (err) {
      confModelId.innerHTML = `<option value="">Failed: ${esc(err.message)}</option>`;
    }
  }

  // ── Fetch domain list ─────────────────────────────────────────────────────────
  confFetchBtn.addEventListener('click', async () => {
    const url = String(confFetchUrl.value || '').trim();
    if (!url) { showFetch('Enter a URL first.', true); return; }
    confFetchBtn.disabled = true;
    showFetch('Fetching…', false);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const existing = String(confSiteText.value || '').trim();
      confSiteText.value = existing ? existing + '\n' + text : text;
      const lines = text.split('\n').filter((l) => l.trim()).length;
      showFetch(`Appended ${lines} line(s).`, false);
    } catch (err) {
      showFetch(`Fetch failed: ${err.message}. The server must allow CORS.`, true);
    } finally {
      confFetchBtn.disabled = false;
    }
  });

  function showFetch(msg, isErr) {
    fetchMessage.textContent = msg;
    fetchMessage.className = isErr ? 'message error' : 'message';
  }

  confClear.addEventListener('click', () => {
    resultsPanel.style.display = 'none';
    chartsPanel.style.display = 'none';
    domainTablePanel.style.display = 'none';
    confMessage.textContent = '';
    lastDomains = [];
  });

  // ═══════════════════════════════════════════════════════════════════════════
  //  SVG CHART HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  function scoreColor(v) {
    if (v === null || v === undefined || isNaN(Number(v))) return '#9ca3af';
    const h = Math.round(Number(v) * 120);           // 0=red, 120=green
    const s = 65;
    const l = Number(v) > 0.6 ? 40 : Number(v) > 0.35 ? 46 : 52;
    return `hsl(${h},${s}%,${l}%)`;
  }

  function scoreColorAlpha(v, a) {
    if (v === null || v === undefined || isNaN(Number(v))) return `rgba(156,163,175,${a})`;
    const h = Math.round(Number(v) * 120);
    return `hsla(${h},65%,50%,${a})`;
  }

  // ── 1. Confusion Matrix heatmap ───────────────────────────────────────────
  function drawConfusionMatrix(container, cm) {
    if (!container || !cm) return;
    const { true_positive: tp, false_positive: fp, false_negative: fn, true_negative: tn } = cm;
    const W = 380, H = 340;
    const mL = 96, mT = 80, cW = 132, cH = 118, gap = 8;

    function cell(x, y, value, label, bg, fg, abbr) {
      const maxVal = Math.max(tp, fp, fn, tn, 1);
      const alpha = 0.12 + 0.72 * (value / maxVal);
      return `
        <g transform="translate(${x},${y})">
          <rect width="${cW}" height="${cH}" rx="12" fill="${bg}" fill-opacity="${alpha}" stroke="${bg}" stroke-opacity="${alpha + 0.15}" stroke-width="1.5"/>
          <text x="${cW / 2}" y="30" text-anchor="middle" font-size="11" font-weight="700" fill="${fg}" opacity=".7">${esc(abbr)}</text>
          <text x="${cW / 2}" y="${cH / 2 + 14}" text-anchor="middle" font-size="32" font-weight="800" fill="${fg}">${esc(String(value))}</text>
          <text x="${cW / 2}" y="${cH - 14}" text-anchor="middle" font-size="10" fill="${fg}" opacity=".65">${esc(label)}</text>
        </g>`;
    }

    const x0 = mL, x1 = mL + cW + gap;
    const y0 = mT, y1 = mT + cH + gap;

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" class="chart-svg">
      <!-- Axis header: Predicted -->
      <text x="${mL + cW + gap / 2}" y="18" text-anchor="middle" font-size="12" font-weight="700" fill="currentColor" opacity=".55">PREDICTED</text>
      <text x="${x0 + cW / 2}" y="36" text-anchor="middle" font-size="11" fill="currentColor" opacity=".45">Positive</text>
      <text x="${x1 + cW / 2}" y="36" text-anchor="middle" font-size="11" fill="currentColor" opacity=".45">Negative</text>

      <!-- Axis header: Actual (rotated) -->
      <text transform="rotate(-90) translate(${-(mT + cH + gap / 2)}, 18)" text-anchor="middle" font-size="12" font-weight="700" fill="currentColor" opacity=".55">ACTUAL</text>
      <text transform="rotate(-90) translate(${-(y0 + cH / 2)}, 54)" text-anchor="middle" font-size="11" fill="currentColor" opacity=".45">Positive</text>
      <text transform="rotate(-90) translate(${-(y1 + cH / 2)}, 54)" text-anchor="middle" font-size="11" fill="currentColor" opacity=".45">Negative</text>

      <!-- Diagonal "correct" indicator -->
      <rect x="${x0 - 3}" y="${y0 - 3}" width="${cW + 6}" height="${cH + 6}" rx="14" fill="none" stroke="#16a34a" stroke-width="1.5" stroke-dasharray="5 3" opacity=".35"/>
      <rect x="${x1 - 3}" y="${y1 - 3}" width="${cW + 6}" height="${cH + 6}" rx="14" fill="none" stroke="#2563eb" stroke-width="1.5" stroke-dasharray="5 3" opacity=".35"/>

      ${cell(x0, y0, tp, 'True Positive',  '#16a34a', '#15803d', 'TP')}
      ${cell(x1, y0, fn, 'False Negative', '#dc2626', '#b91c1c', 'FN')}
      ${cell(x0, y1, fp, 'False Positive', '#d97706', '#b45309', 'FP')}
      ${cell(x1, y1, tn, 'True Negative',  '#2563eb', '#1d4ed8', 'TN')}
    </svg>`;
    container.innerHTML = svg;
  }

  // ── 2. Accuracy arc (gauge) ───────────────────────────────────────────────
  function drawAccuracyArc(container, accuracy) {
    if (!container) return;
    if (accuracy === null || accuracy === undefined) {
      container.innerHTML = '<p class="subtle" style="text-align:center">—</p>';
      return;
    }
    const v = Math.max(0, Math.min(1, Number(accuracy)));
    const W = 200, H = 130;
    const cx = 100, cy = 110, r = 80, stroke = 14;
    const angle = v * Math.PI;
    const ex = cx + r * Math.cos(Math.PI - angle);
    const ey = cy - r * Math.sin(Math.PI - angle);
    const largeArc = angle > Math.PI / 2 ? 1 : 0;
    // track arc (full half-circle from left to right)
    const arcColor = scoreColor(v);

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" class="chart-svg">
      <!-- Track -->
      <path d="M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}"
        fill="none" stroke="currentColor" stroke-opacity=".1" stroke-width="${stroke}" stroke-linecap="round"/>
      <!-- Value arc -->
      <path d="M ${cx - r} ${cy} A ${r} ${r} 0 ${largeArc} 1 ${ex} ${ey}"
        fill="none" stroke="${esc(arcColor)}" stroke-width="${stroke}" stroke-linecap="round"/>
      <!-- End cap dot -->
      <circle cx="${ex}" cy="${ey}" r="${stroke / 2 + 1}" fill="${esc(arcColor)}"/>
      <!-- Value text -->
      <text x="${cx}" y="${cy - 10}" text-anchor="middle" font-size="30" font-weight="800" fill="${esc(arcColor)}">${esc(pct(v, 1))}</text>
      <text x="${cx}" y="${cy + 10}" text-anchor="middle" font-size="11" fill="currentColor" opacity=".5">accuracy</text>
      <!-- Scale labels -->
      <text x="${cx - r - 4}" y="${cy + 14}" text-anchor="middle" font-size="10" fill="currentColor" opacity=".4">0%</text>
      <text x="${cx + r + 4}" y="${cy + 14}" text-anchor="middle" font-size="10" fill="currentColor" opacity=".4">100%</text>
    </svg>`;
    container.innerHTML = svg;
  }

  // ── 3. F1 horizontal bar chart ────────────────────────────────────────────
  function drawF1Bars(container, domains) {
    if (!container) return;
    const assessed = domains.filter((d) => d.labeled_candidates > 0 && d._f1 !== null)
      .slice().sort((a, b) => (b._f1 || 0) - (a._f1 || 0))
      .slice(0, 40);

    if (!assessed.length) {
      container.innerHTML = '<p class="subtle" style="padding:16px 0">No assessed domains yet.</p>';
      return;
    }

    const barH = 22, barGap = 5, labelW = 180, valW = 44, padR = 16, padT = 8;
    const plotW = 320;
    const W = labelW + plotW + valW + padR;
    const H = padT + assessed.length * (barH + barGap) + 4;

    const bars = assessed.map((d, i) => {
      const y = padT + i * (barH + barGap);
      const f1 = d._f1 || 0;
      const prec = d._precision || 0;
      const rec  = d._recall    || 0;
      const f1W  = Math.round(f1   * plotW);
      const precW = Math.round(prec * plotW);
      const recW  = Math.round(rec  * plotW);
      const col = scoreColor(f1);
      const colDark = scoreColor(Math.min(1, f1 + 0.12));
      const tooltip = `${d.hostname}\nF1: ${pct(f1)} · Precision: ${pct(prec)} · Recall: ${pct(rec)}\nLabeled: ${d.labeled_candidates}`;
      return `
        <g transform="translate(${labelW},${y})">
          <title>${esc(tooltip)}</title>
          <!-- Recall track -->
          <rect x="0" y="4" width="${recW}" height="${barH - 8}" rx="3" fill="${esc(col)}" opacity=".35"/>
          <!-- Precision track (layered) -->
          <rect x="0" y="4" width="${precW}" height="${barH - 8}" rx="3" fill="${esc(col)}" opacity=".55"/>
          <!-- F1 bar (main) -->
          <rect x="0" y="0" width="${f1W}" height="${barH}" rx="4" fill="${esc(col)}"/>
          <!-- Value -->
          <text x="${f1W + 6}" y="${barH / 2 + 4}" font-size="11" font-weight="600" fill="${esc(colDark)}">${esc(pct(f1, 0))}</text>
        </g>
        <text x="${labelW - 8}" y="${y + barH / 2 + 4}" text-anchor="end" font-size="11" fill="currentColor" opacity=".7"
          style="font-family:monospace">${esc(d.hostname.length > 26 ? d.hostname.slice(0, 24) + '…' : d.hostname)}</text>`;
    }).join('');

    // Vertical grid lines
    const gridLines = [0.2, 0.4, 0.6, 0.8, 1.0].map((v) => {
      const x = labelW + Math.round(v * plotW);
      return `<line x1="${x}" y1="${padT}" x2="${x}" y2="${H}" stroke="currentColor" stroke-opacity=".08" stroke-width="1"/>
              <text x="${x}" y="${H + 2}" text-anchor="middle" font-size="9" fill="currentColor" opacity=".4">${Math.round(v * 100)}%</text>`;
    }).join('');

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H + 14}" class="chart-svg">
      ${gridLines}
      ${bars}
    </svg>`;
    container.innerHTML = svg;

    // Legend
    const legend = document.createElement('div');
    legend.style.cssText = 'display:flex;gap:16px;margin-top:8px;font-size:11px;color:var(--muted)';
    legend.innerHTML = `
      <span style="display:flex;align-items:center;gap:4px">
        <span style="display:inline-block;width:24px;height:8px;background:#16a34a;border-radius:2px;opacity:.9"></span> F1
      </span>
      <span style="display:flex;align-items:center;gap:4px">
        <span style="display:inline-block;width:24px;height:8px;background:#16a34a;border-radius:2px;opacity:.55"></span> Precision
      </span>
      <span style="display:flex;align-items:center;gap:4px">
        <span style="display:inline-block;width:24px;height:8px;background:#16a34a;border-radius:2px;opacity:.35"></span> Recall
      </span>`;
    container.appendChild(legend);
  }

  // ── 4. Precision–Recall scatter ───────────────────────────────────────────
  function drawPRScatter(container, domains) {
    if (!container) return;
    const assessed = domains.filter(
      (d) => d.labeled_candidates > 0 && d._precision !== null && d._recall !== null);

    if (!assessed.length) {
      container.innerHTML = '<p class="subtle" style="padding:16px 0">No assessed domains yet.</p>';
      return;
    }

    const W = 340, H = 320;
    const mL = 46, mT = 16, mR = 16, mB = 46;
    const pW = W - mL - mR, pH = H - mT - mB;
    const maxLabeled = Math.max(...assessed.map((d) => d.labeled_candidates), 1);

    function px(recall) { return mL + recall * pW; }
    function py(prec)   { return mT + (1 - prec) * pH; }

    // Grid
    const gridLines = [0, 0.2, 0.4, 0.6, 0.8, 1.0].map((v) => {
      const gx = mL + v * pW;
      const gy = mT + (1 - v) * pH;
      return `
        <line x1="${gx}" y1="${mT}" x2="${gx}" y2="${mT + pH}" stroke="currentColor" stroke-opacity=".07" stroke-width="1"/>
        <line x1="${mL}" y1="${gy}" x2="${mL + pW}" y2="${gy}" stroke="currentColor" stroke-opacity=".07" stroke-width="1"/>
        <text x="${gx}" y="${mT + pH + 14}" text-anchor="middle" font-size="9" fill="currentColor" opacity=".4">${Math.round(v * 100)}%</text>
        <text x="${mL - 6}" y="${gy + 3}" text-anchor="end" font-size="9" fill="currentColor" opacity=".4">${Math.round(v * 100)}%</text>`;
    }).join('');

    // F1 iso-curves (dashed lines at F1=0.2,0.4,0.6,0.8)
    const isoCurves = [0.2, 0.4, 0.6, 0.8].map((f1) => {
      // P = f1*R / (2R - f1), for R > f1/2
      const pts = [];
      for (let ri = 1; ri <= 50; ri++) {
        const r = ri / 50;
        if (2 * r - f1 <= 0) continue;
        const p = (f1 * r) / (2 * r - f1);
        if (p > 1.01 || p < 0) continue;
        pts.push(`${px(r).toFixed(1)},${py(Math.min(p, 1)).toFixed(1)}`);
      }
      return pts.length < 2 ? '' : `
        <polyline points="${pts.join(' ')}" fill="none" stroke="currentColor" stroke-opacity=".12" stroke-width="1" stroke-dasharray="3 3"/>
        <text x="${px(1) + 3}" y="${py((f1 * 1) / (2 * 1 - f1)) + 3}" font-size="8" fill="currentColor" opacity=".35">F1=${f1}</text>`;
    }).join('');

    // Ideal quadrant shading
    const idealShade = `<rect x="${mL + pW * 0.6}" y="${mT}" width="${pW * 0.4}" height="${pH * 0.4}" rx="4" fill="#16a34a" fill-opacity=".04"/>`;

    // Bubbles
    const bubbles = assessed.map((d) => {
      const r = 4 + 14 * Math.sqrt(d.labeled_candidates / maxLabeled);
      const cx = px(d._recall || 0);
      const cy = py(d._precision || 0);
      const col = scoreColor(d._f1);
      const tooltip = `${d.hostname}\nPrecision: ${pct(d._precision)} · Recall: ${pct(d._recall)}\nF1: ${pct(d._f1)} · Labeled: ${d.labeled_candidates}`;
      return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}"
        fill="${esc(col)}" fill-opacity=".7" stroke="${esc(col)}" stroke-width="1.5" stroke-opacity=".9">
        <title>${esc(tooltip)}</title>
      </circle>`;
    }).join('');

    // Axes
    const axes = `
      <line x1="${mL}" y1="${mT}" x2="${mL}" y2="${mT + pH}" stroke="currentColor" stroke-opacity=".25" stroke-width="1.5"/>
      <line x1="${mL}" y1="${mT + pH}" x2="${mL + pW}" y2="${mT + pH}" stroke="currentColor" stroke-opacity=".25" stroke-width="1.5"/>
      <text x="${mL + pW / 2}" y="${H - 4}" text-anchor="middle" font-size="11" fill="currentColor" opacity=".55">Recall →</text>
      <text transform="rotate(-90) translate(${-(mT + pH / 2)}, 12)" text-anchor="middle" font-size="11" fill="currentColor" opacity=".55">← Precision</text>`;

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" class="chart-svg">
      ${gridLines}
      ${isoCurves}
      ${idealShade}
      ${axes}
      ${bubbles}
    </svg>`;
    container.innerHTML = svg;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  RESULTS RENDERERS
  // ═══════════════════════════════════════════════════════════════════════════

  function renderStatRow(result) {
    const cards = [
      { label: 'Domains Requested', value: result.requested_domain_count !== null ? num(result.requested_domain_count) : 'All', accent: '#2563eb' },
      { label: 'Domains in Dataset', value: num(result.matched_domain_count), accent: '#7c3aed' },
      { label: 'Domains Assessed',   value: num(result.assessed_domain_count), accent: '#0891b2' },
      { label: 'Total Candidates',   value: num(result.total_candidates), accent: '#6b7280' },
      { label: 'Labeled Candidates', value: num(result.labeled_candidates), accent: '#d97706' },
    ];
    statRow.innerHTML = cards.map((c) =>
      `<div class="stat-card" style="--card-accent:${c.accent}">
        <div class="s-label">${esc(c.label)}</div>
        <div class="s-value">${esc(c.value)}</div>
      </div>`).join('');
  }

  function metricQuality(v) {
    if (v === null || v === undefined) return 'plain';
    const n = Number(v);
    if (n >= 0.75) return 'good';
    if (n >= 0.5)  return 'mid';
    return 'poor';
  }

  function renderOverallMetrics(overall, threshold) {
    if (!overall) {
      cmContainer.innerHTML = '<p class="subtle" style="padding:20px">No labeled candidates in this result set — add labels via the Labeler tab in the Scanner first.</p>';
      arcContainer.innerHTML = '';
      metricTiles.innerHTML = '';
      candidateSummary.innerHTML = '';
      return;
    }
    const cm   = overall.candidate_metrics && overall.candidate_metrics.confusion;
    const cmet = overall.candidate_metrics || {};
    const pm   = overall.page_metrics || {};

    const accuracy = cm
      ? (cm.true_positive + cm.true_negative) /
        Math.max(1, cm.true_positive + cm.true_negative + cm.false_positive + cm.false_negative)
      : null;

    drawConfusionMatrix(cmContainer, cm);
    drawAccuracyArc(arcContainer, accuracy);

    metricTiles.innerHTML = [
      { label: 'Precision', value: pct(cmet.precision), q: metricQuality(cmet.precision) },
      { label: 'Recall',    value: pct(cmet.recall),    q: metricQuality(cmet.recall) },
      { label: 'F1 Score',  value: pct(cmet.f1),        q: metricQuality(cmet.f1) },
      { label: 'ROC AUC',   value: cmet.roc_auc !== null && cmet.roc_auc !== undefined ? Number(cmet.roc_auc).toFixed(3) : '—', q: metricQuality(cmet.roc_auc) },
      { label: 'PR AUC',    value: cmet.pr_auc  !== null && cmet.pr_auc  !== undefined ? Number(cmet.pr_auc).toFixed(3)  : '—', q: metricQuality(cmet.pr_auc) },
      { label: 'Threshold', value: Number(threshold).toFixed(2), q: 'plain' },
    ].map((t) => `<div class="metric-tile ${t.q}"><div class="mt-label">${esc(t.label)}</div><div class="mt-value">${esc(t.value)}</div></div>`).join('');

    candidateSummary.innerHTML = [
      { label: 'Labeled', value: num(cmet.count) },
      { label: 'Positive (UGC)', value: num(cmet.positive_count) },
      { label: 'Negative', value: num(cmet.negative_count) },
      { label: 'Page-level recall', value: pct(pm.page_has_correct_candidate_rate) },
      { label: 'Page-level FP rate', value: pct(pm.false_positive_page_rate) },
      { label: 'Manual review rate', value: pct(pm.manual_review_rate) },
    ].map((i) => `<div class="cs-item"><div class="cs-label">${esc(i.label)}</div><div class="cs-val">${esc(i.value)}</div></div>`).join('');
  }

  // ── Domain table ──────────────────────────────────────────────────────────
  const COLS = [
    { key: 'hostname',           label: 'Domain',     numeric: false },
    { key: 'total_candidates',   label: 'Cands',      numeric: true  },
    { key: 'labeled_candidates', label: 'Labeled',    numeric: true  },
    { key: 'tp',  label: 'TP', numeric: true },
    { key: 'fp',  label: 'FP', numeric: true },
    { key: 'fn',  label: 'FN', numeric: true },
    { key: 'tn',  label: 'TN', numeric: true },
    { key: 'f1',        label: 'F1',        numeric: true },
    { key: 'precision', label: 'Precision', numeric: true },
    { key: 'recall',    label: 'Recall',    numeric: true },
    { key: 'status',    label: 'Status',    numeric: false },
  ];

  function domainSortVal(d, key) {
    switch (key) {
      case 'hostname':           return d.hostname;
      case 'total_candidates':   return d.total_candidates;
      case 'labeled_candidates': return d.labeled_candidates;
      case 'tp':  return d._cm ? d._cm.true_positive  : -1;
      case 'fp':  return d._cm ? d._cm.false_positive : -1;
      case 'fn':  return d._cm ? d._cm.false_negative : -1;
      case 'tn':  return d._cm ? d._cm.true_negative  : -1;
      case 'f1':        return d._f1        !== null ? d._f1        : -1;
      case 'precision': return d._precision !== null ? d._precision : -1;
      case 'recall':    return d._recall    !== null ? d._recall    : -1;
      case 'status':    return d.labeled_candidates > 0 ? 0 : d.total_candidates > 0 ? 1 : 2;
      default: return 0;
    }
  }

  function miniBar(value, color) {
    const w = Math.round(Math.max(0, Math.min(1, Number(value || 0))) * 56);
    return `<div class="mini-bar-wrap">
      <div class="mini-bar-track"><div class="mini-bar-fill" style="width:${w}px;background:${color}"></div></div>
      <span class="mini-bar-val">${pct(value, 0)}</span>
    </div>`;
  }

  function renderDomainTable(domains) {
    if (!domains.length) {
      domainTableShell.innerHTML = '<p class="subtle" style="padding:16px 0">No matching domains in the dataset.</p>';
      return;
    }

    const sorted = domains.slice().sort((a, b) => {
      const av = domainSortVal(a, sortKey), bv = domainSortVal(b, sortKey);
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === 'asc' ? av - bv : bv - av;
    });

    const headers = COLS.map((c) => {
      const cls = sortKey === c.key ? `sort-${sortDir}` : '';
      return `<th data-sort="${esc(c.key)}" class="${cls}">${esc(c.label)}</th>`;
    }).join('');

    const rows = sorted.map((d) => {
      const cm = d._cm;
      const f1col = d._f1 !== null ? scoreColor(d._f1) : '#9ca3af';
      const pcol  = d._precision !== null ? scoreColor(d._precision) : '#9ca3af';
      const rcol  = d._recall    !== null ? scoreColor(d._recall)    : '#9ca3af';

      let badge;
      if (d.labeled_candidates > 0) badge = '<span class="badge badge-assessed">Assessed</span>';
      else if (d.total_candidates > 0) badge = '<span class="badge badge-pending">Unlabeled</span>';
      else badge = '<span class="badge badge-unseen">Not in dataset</span>';

      return `<tr>
        <td class="host" title="${esc(d.hostname)}">${esc(d.hostname)}</td>
        <td class="num">${num(d.total_candidates)}</td>
        <td class="num">${num(d.labeled_candidates)}</td>
        <td class="num" style="color:var(--c-tp, #16a34a)">${cm ? num(cm.true_positive)  : '—'}</td>
        <td class="num" style="color:var(--c-fp, #d97706)">${cm ? num(cm.false_positive) : '—'}</td>
        <td class="num" style="color:var(--c-fn, #dc2626)">${cm ? num(cm.false_negative) : '—'}</td>
        <td class="num" style="color:var(--c-tn, #2563eb)">${cm ? num(cm.true_negative)  : '—'}</td>
        <td>${d._f1 !== null ? miniBar(d._f1, f1col) : '<span style="color:var(--muted)">—</span>'}</td>
        <td>${d._precision !== null ? miniBar(d._precision, pcol) : '<span style="color:var(--muted)">—</span>'}</td>
        <td>${d._recall !== null ? miniBar(d._recall, rcol) : '<span style="color:var(--muted)">—</span>'}</td>
        <td>${badge}</td>
      </tr>`;
    }).join('');

    domainTableShell.innerHTML = `<table class="dm-table">
      <thead><tr>${headers}</tr></thead>
      <tbody>${rows}</tbody>
    </table>`;

    domainTableShell.querySelectorAll('th[data-sort]').forEach((th) => {
      th.addEventListener('click', () => {
        const key = th.getAttribute('data-sort');
        if (sortKey === key) { sortDir = sortDir === 'asc' ? 'desc' : 'asc'; }
        else { sortKey = key; sortDir = key === 'hostname' ? 'asc' : 'desc'; }
        renderDomainTable(lastDomains);
      });
    });
  }

  function prepareDomains(domains) {
    return (Array.isArray(domains) ? domains : []).map((d) => {
      const cm   = d.metrics && d.metrics.candidate_metrics && d.metrics.candidate_metrics.confusion
        ? d.metrics.candidate_metrics.confusion : null;
      const cmet = d.metrics && d.metrics.candidate_metrics ? d.metrics.candidate_metrics : null;
      const accuracy = cm
        ? (cm.true_positive + cm.true_negative) /
          Math.max(1, cm.true_positive + cm.true_negative + cm.false_positive + cm.false_negative)
        : null;
      return {
        ...d,
        _cm:       cm,
        _accuracy: accuracy,
        _precision: cmet ? cmet.precision : null,
        _recall:    cmet ? cmet.recall    : null,
        _f1:        cmet ? cmet.f1        : null,
      };
    });
  }

  // ── Form submit ───────────────────────────────────────────────────────────
  confForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const modelId = String(confModelId.value || '').trim();
    if (!modelId) {
      confMessage.textContent = 'Select a model first.';
      confMessage.className = 'message error';
      return;
    }

    confSubmit.disabled = true;
    confMessage.innerHTML = '<span class="running-indicator"><span class="spinner"></span> Running analysis…</span>';
    confMessage.className = 'message';
    resultsPanel.style.display = 'none';
    chartsPanel.style.display = 'none';
    domainTablePanel.style.display = 'none';

    try {
      const result = await fetchJson('/api/modeling/domain-confusion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelId,
          jobIds:    String(confJobIds.value   || '').trim(),
          siteText:  String(confSiteText.value || '').trim(),
          threshold: Number(confThreshold.value),
        }),
      });

      confMessage.textContent = '';

      const art = result.artifact || {};
      resultsSubtitle.textContent = [
        art.variant_title || art.id || '',
        `threshold ${Number(result.threshold).toFixed(2)}`,
      ].filter(Boolean).join(' · ');

      renderStatRow(result);
      renderOverallMetrics(result.overall_metrics, result.threshold);
      resultsPanel.style.display = '';

      lastDomains = prepareDomains(result.domains);

      drawF1Bars(f1BarChart, lastDomains);
      drawPRScatter(prScatterChart, lastDomains);
      document.getElementById('f1-bar-subtitle').textContent =
        `${lastDomains.filter((d) => d.labeled_candidates > 0).length} assessed domain(s) · sorted by F1`;
      chartsPanel.style.display = '';

      domainCountBadge.textContent = `${lastDomains.length} domain(s)`;
      renderDomainTable(lastDomains);
      domainTablePanel.style.display = '';

    } catch (err) {
      confMessage.textContent = err.message || 'Analysis failed.';
      confMessage.className = 'message error';
    } finally {
      confSubmit.disabled = false;
    }
  });

  // ── Boot ──────────────────────────────────────────────────────────────────
  loadModels();
})();
