(function bootSupervisor() {
  'use strict';

  const config  = window.__APP_CONFIG__ || {};
  const apiBase = (config.apiBaseUrl || '').replace(/\/$/, '');

  // ── DOM refs ───────────────────────────────────────────────────────────────
  const supRefresh       = document.getElementById('sup-refresh');
  const supOverviewMsg   = document.getElementById('sup-overview-msg');
  const supModelHistory  = document.getElementById('sup-model-history');
  const supModelSelect   = document.getElementById('sup-model-select');
  const supWeightsMsg    = document.getElementById('sup-weights-msg');
  const supWeightsShell  = document.getElementById('sup-weights-shell');
  const supCvMsg         = document.getElementById('sup-cv-msg');
  const supCvHistory     = document.getElementById('sup-cv-history');

  // ── State ──────────────────────────────────────────────────────────────────
  let featureMeanings = {};   // key → { title, description, meaning }
  let allModels       = [];

  // ── Utilities ─────────────────────────────────────────────────────────────
  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmt(val) {
    if (val == null) return '—';
    return (Number(val) * 100).toFixed(1) + '%';
  }

  function fmtRaw(val, decimals = 3) {
    if (val == null || val === '') return '—';
    return Number(val).toFixed(decimals);
  }

  function metricColor(val) {
    if (val == null) return '#9ca3af';
    return val >= 0.8 ? '#16a34a' : val >= 0.6 ? '#d97706' : '#dc2626';
  }

  function setMsg(el, text, isError) {
    if (!el) return;
    el.textContent = text;
    el.style.color = isError ? '#dc2626' : '#6b7280';
    el.style.display = text ? '' : 'none';
  }

  function authHeaders() {
    try {
      const token = localStorage.getItem('ugc_auth_token');
      return token ? { Authorization: 'Bearer ' + token } : {};
    } catch (_) { return {}; }
  }

  function fetchJson(url, opts) {
    const merged = Object.assign({}, opts, {
      headers: Object.assign({}, authHeaders(), opts && opts.headers),
    });
    return fetch(apiBase + url, merged).then((r) => {
      if (!r.ok) return r.json().then((e) => Promise.reject(new Error(e.error || r.statusText)));
      return r.json();
    });
  }

  function formatAlgorithm(alg) {
    const map = {
      logistic_regression: 'Logistic Regression',
      decision_tree:       'Decision Tree',
      random_forest:       'Random Forest',
      gradient_boosting:   'Gradient Boosting',
      neural_network:      'Neural Network',
    };
    return map[alg] || alg || '—';
  }

  function strategyLabel(s) {
    if (!s) return 'Baseline';
    if (typeof s === 'object') return s.title || s.id || 'Unknown';
    const map = {
      baseline: 'Baseline', class_weighted: 'Class Weighted',
      undersample: 'Undersample', oversample: 'Oversample', smote: 'SMOTE',
    };
    return map[String(s)] || String(s);
  }

  // ── Model History rendering ────────────────────────────────────────────────
  function renderModelHistory(models) {
    allModels = models;
    if (!models || !models.length) {
      supModelHistory.className = 'table-shell empty';
      supModelHistory.textContent = 'No trained models found.';
      return;
    }

    // Populate select
    supModelSelect.innerHTML = models.map((m) =>
      `<option value="${escapeHtml(m.id)}">${escapeHtml(m.id)}</option>`
    ).join('');

    supModelHistory.className = 'table-shell';
    supModelHistory.innerHTML = `
      <table>
        <thead>
          <tr>
            <th style="min-width:170px">Artifact ID</th>
            <th>Variant</th>
            <th>Algorithm</th>
            <th>Strategy</th>
            <th title="Features the model was trained on">Feat.</th>
            <th title="F1 score">F1</th>
            <th title="Precision">Prec</th>
            <th title="Recall">Rec</th>
            <th title="Top-1 ranking accuracy">Top-1</th>
            <th title="Source of metrics">Set</th>
            <th>Trained</th>
          </tr>
        </thead>
        <tbody>
          ${models.map((m, idx) => {
            const ev  = m.evaluation && m.evaluation.test  ? m.evaluation.test
                      : m.evaluation && m.evaluation.train ? m.evaluation.train : null;
            const cm  = ev && ev.candidate_metrics ? ev.candidate_metrics : null;
            const rm  = ev && ev.ranking_metrics   ? ev.ranking_metrics   : null;
            const isTest = !!(m.evaluation && m.evaluation.test);
            const f1  = cm ? cm.f1        : null;
            const pre = cm ? cm.precision : null;
            const rec = cm ? cm.recall    : null;
            const t1  = rm ? rm.top_1_accuracy : null;
            const vId = String(m.variant_id || '').toLowerCase();
            const vBg = vId === 'full' || vId === 'default' ? '#dcfce7'
                      : vId.includes('ablat') ? '#fef3c7' : '#dbeafe';
            const vColor = vId === 'full' || vId === 'default' ? '#166534'
                         : vId.includes('ablat') ? '#92400e' : '#1e40af';
            return `<tr style="${idx === 0 ? 'background:#fafff8' : ''}">
              <td class="mono" style="font-size:0.76rem;max-width:190px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(m.id)}">${escapeHtml(m.id)}</td>
              <td><span style="font-size:0.7rem;font-weight:600;color:${vColor};background:${vBg};border-radius:4px;padding:1px 6px;white-space:nowrap">${escapeHtml(m.variant_title || m.variant_id || '')}</span></td>
              <td style="font-size:0.8rem;white-space:nowrap">${escapeHtml(formatAlgorithm(m.algorithm))}</td>
              <td style="font-size:0.78rem;white-space:nowrap">${escapeHtml(strategyLabel(m.imbalance_strategy))}</td>
              <td style="text-align:center;font-size:0.8rem;font-weight:600;color:#374151">${m.feature_count != null ? m.feature_count : '—'}</td>
              <td style="text-align:center;font-weight:700;color:${metricColor(f1)}">${fmt(f1)}</td>
              <td style="text-align:center;color:${metricColor(pre)}">${fmt(pre)}</td>
              <td style="text-align:center;color:${metricColor(rec)}">${fmt(rec)}</td>
              <td style="text-align:center;color:${metricColor(t1)}">${fmt(t1)}</td>
              <td style="text-align:center;font-size:0.7rem;color:${isTest ? '#16a34a' : '#9ca3af'}">${isTest ? 'test' : 'train'}</td>
              <td style="font-size:0.76rem;color:#6b7280;white-space:nowrap">${escapeHtml((m.created_at || '').slice(0, 16).replace('T', ' '))}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      ${models.length > 1 ? renderF1Sparkline(models) : ''}
    `;
  }

  function renderF1Sparkline(models) {
    // Simple inline F1 bar chart showing progression newest → oldest
    const sorted = [...models].reverse(); // oldest first for chart
    const max = 1;
    const bars = sorted.map((m) => {
      const ev = m.evaluation && m.evaluation.test ? m.evaluation.test
               : m.evaluation && m.evaluation.train ? m.evaluation.train : null;
      const f1 = ev && ev.candidate_metrics ? ev.candidate_metrics.f1 : null;
      const pct = f1 != null ? Math.round(f1 * 100) : 0;
      const color = metricColor(f1);
      return `<div style="display:flex;flex-direction:column;align-items:center;gap:3px;flex:1;min-width:0">
        <div style="width:100%;background:#f3f4f6;border-radius:3px;height:80px;position:relative;overflow:hidden">
          <div style="position:absolute;bottom:0;left:0;right:0;background:${color};height:${pct}%;border-radius:3px 3px 0 0;transition:height 0.3s"></div>
          <span style="position:absolute;top:4px;left:0;right:0;text-align:center;font-size:0.68rem;font-weight:700;color:${pct > 50 ? '#fff' : color}">${pct ? pct + '%' : '—'}</span>
        </div>
        <span style="font-size:0.62rem;color:#6b7280;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;width:100%;max-width:70px" title="${escapeHtml(m.id)}">${escapeHtml((m.variant_title || m.variant_id || '').slice(0, 10))}</span>
      </div>`;
    }).join('');
    return `
      <div style="margin-top:18px;padding:14px;background:#f8faff;border-radius:8px;border:1px solid rgba(17,24,39,0.1)">
        <p style="margin:0 0 10px;font-size:0.74rem;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:0.04em">F1 Progression (oldest → newest)</p>
        <div style="display:flex;gap:6px;align-items:flex-end;height:100px">${bars}</div>
      </div>`;
  }

  // ── Feature Weight Interpreter ─────────────────────────────────────────────
  async function loadWeights(modelId) {
    if (!modelId) return;
    setMsg(supWeightsMsg, 'Loading…', false);
    supWeightsShell.className = 'table-shell empty';
    supWeightsShell.textContent = 'Loading…';

    try {
      const { model } = await fetchJson(`/api/modeling/models/${encodeURIComponent(modelId)}`);
      setMsg(supWeightsMsg, '', false);
      renderWeights(model);
    } catch (err) {
      setMsg(supWeightsMsg, err.message || String(err), true);
      supWeightsShell.className = 'table-shell empty';
      supWeightsShell.textContent = 'Failed to load model.';
    }
  }

  function renderWeights(artifact) {
    if (!artifact) return;
    const reliance   = artifact.reliance || {};
    const pos        = Array.isArray(reliance.positive_weights) ? reliance.positive_weights : [];
    const neg        = Array.isArray(reliance.negative_weights) ? reliance.negative_weights : [];
    const all        = [...pos.map((e) => ({ ...e, dir: 'pos' })), ...neg.map((e) => ({ ...e, dir: 'neg' }))];
    all.sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));
    const catalog    = Array.isArray(artifact.feature_catalog) ? artifact.feature_catalog : [];

    // Build lookup from feature_key → catalog entry
    const catalogLookup = {};
    catalog.forEach((f) => { catalogLookup[f.key] = f; });

    if (!all.length) {
      supWeightsShell.className = 'table-shell empty';
      supWeightsShell.textContent = 'No feature weight data available for this model (not computed for tree-based models in the same way — use feature importances in the Model Detail modal instead).';
      return;
    }

    const maxAbs = Math.max(...all.map((e) => Math.abs(e.weight || 0)), 0.001);

    supWeightsShell.className = 'table-shell';

    const rows = all.map((entry, i) => {
      const w        = entry.weight || 0;
      const absW     = Math.abs(w);
      const barPct   = Math.round((absW / maxAbs) * 100);
      const isPos    = w > 0;
      const barColor = isPos ? '#16a34a' : '#dc2626';
      const dirLabel = isPos
        ? '<span style="color:#16a34a;font-weight:700;font-size:0.74rem">↑ UGC present</span>'
        : '<span style="color:#dc2626;font-weight:700;font-size:0.74rem">↓ No comment</span>';

      // Look up plain-language meaning
      const fKey    = entry.feature_key || '';
      const catEntry = catalogLookup[fKey] || featureMeanings[fKey] || null;
      const meaning  = catEntry ? (catEntry.meaning || catEntry.description || '') : '';
      const title    = entry.title || (catEntry ? catEntry.title : '') || fKey;

      // For tag_name= style keys, extract the category
      const isEncoded = entry.output_key && entry.output_key.includes('=');
      const categoryNote = isEncoded
        ? `<span style="font-size:0.7rem;color:#3b82f6;margin-left:4px">value: <code>${escapeHtml(entry.output_key.split('=').slice(1).join('='))}</code></span>`
        : '';

      return `
        <tr style="background:${i % 2 === 0 ? '#fff' : '#f9fafb'}">
          <td style="padding:8px 10px;width:24px;text-align:right;color:#9ca3af;font-size:0.74rem;white-space:nowrap">${i + 1}</td>
          <td style="padding:8px 10px;min-width:150px">
            <div style="font-size:0.8rem;font-weight:600;color:#111827">${escapeHtml(title)}${categoryNote}</div>
            <div style="font-family:ui-monospace,Consolas,monospace;font-size:0.68rem;color:#9ca3af;margin-top:1px">${escapeHtml(entry.output_key || fKey)}</div>
          </td>
          <td style="padding:8px 10px;min-width:160px">
            <div style="display:flex;align-items:center;gap:8px">
              <div style="flex:1;background:#f3f4f6;border-radius:3px;height:10px;overflow:hidden;min-width:80px">
                <div style="height:100%;background:${barColor};width:${barPct}%;border-radius:3px"></div>
              </div>
              <span style="font-family:ui-monospace,monospace;font-size:0.73rem;color:#374151;white-space:nowrap">${w >= 0 ? '+' : ''}${fmtRaw(w)}</span>
            </div>
          </td>
          <td style="padding:8px 10px;white-space:nowrap">${dirLabel}</td>
          <td style="padding:8px 12px;font-size:0.77rem;color:#4b5563;max-width:340px">${escapeHtml(meaning)}</td>
        </tr>`;
    }).join('');

    supWeightsShell.innerHTML = `
      <div style="padding:10px 14px 6px;background:#f8faff;border-bottom:1px solid rgba(17,24,39,0.08)">
        <p style="margin:0;font-size:0.8rem;color:#374151">
          Showing <strong>${all.length}</strong> features for <code style="font-size:0.78rem">${escapeHtml(artifact.id)}</code>
          &nbsp;·&nbsp; ${pos.length} push toward UGC present &nbsp;·&nbsp; ${neg.length} push toward no comment region
        </p>
      </div>
      <div style="overflow-x:auto">
        <table style="margin:0;width:100%">
          <thead><tr style="background:#f3f4f6;position:sticky;top:0">
            <th style="padding:6px 10px;font-size:0.72rem;text-align:right">#</th>
            <th style="padding:6px 10px;font-size:0.72rem">Feature</th>
            <th style="padding:6px 10px;font-size:0.72rem">Weight</th>
            <th style="padding:6px 10px;font-size:0.72rem">Direction</th>
            <th style="padding:6px 12px;font-size:0.72rem">What it measures</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  // ── Cross-Validation History ───────────────────────────────────────────────
  function renderCvHistory(results) {
    if (!results || !results.length) {
      supCvHistory.className = 'table-shell empty';
      supCvHistory.textContent = 'No cross-validation history yet. Run cross-validation in the Model Lab Diagnostics section — results are automatically saved here.';
      return;
    }

    supCvHistory.className = 'table-shell';
    supCvHistory.innerHTML = results.map((run) => {
      const folds  = Array.isArray(run.folds) ? run.folds : [];
      const f1s    = folds.map((f) => f && f.candidate_metrics ? (f.candidate_metrics.f1 || 0) : 0).filter((v) => v > 0);
      const meanF1 = f1s.length ? f1s.reduce((s, v) => s + v, 0) / f1s.length : null;
      const stdF1  = f1s.length > 1
        ? Math.sqrt(f1s.reduce((s, v) => s + (v - meanF1) ** 2, 0) / f1s.length)
        : null;

      const foldRows = folds.map((fold, fi) => {
        const cm = fold && fold.candidate_metrics ? fold.candidate_metrics : null;
        const f1 = cm ? cm.f1 : null;
        const stability = f1 != null && meanF1 ? Math.abs(f1 - meanF1) : null;
        const weakFlag = stability != null && stability > 0.1
          ? '<span style="color:#d97706;font-size:0.68rem;font-weight:600" title="This fold deviates significantly from the mean — investigate domain distribution for Bucket ' + fi + '"> ⚠ weak fold</span>'
          : '';
        return `<tr>
          <td style="padding:4px 10px;font-size:0.78rem;text-align:center">Fold ${fi}</td>
          <td style="padding:4px 10px;text-align:center;font-weight:600;color:${metricColor(f1)}">${fmt(f1)}${weakFlag}</td>
          <td style="padding:4px 10px;text-align:center;color:${metricColor(cm ? cm.precision : null)}">${fmt(cm ? cm.precision : null)}</td>
          <td style="padding:4px 10px;text-align:center;color:${metricColor(cm ? cm.recall : null)}">${fmt(cm ? cm.recall : null)}</td>
          <td style="padding:4px 10px;text-align:center;color:#6b7280;font-size:0.74rem">${fold.train_size != null ? fold.train_size : '—'} / ${fold.test_size != null ? fold.test_size : '—'}</td>
        </tr>`;
      }).join('');

      return `
        <details style="margin-bottom:10px;border:1px solid rgba(17,24,39,0.12);border-radius:8px;overflow:hidden">
          <summary style="padding:10px 14px;cursor:pointer;background:#1e293b;display:flex;align-items:center;gap:12px;font-size:0.86rem;font-weight:600;color:#f1f5f9;list-style:none">
            <span style="flex:1">
              ${escapeHtml(run.variantId || '—')}
              &nbsp;·&nbsp; ${escapeHtml(formatAlgorithm(run.algorithm))}
              &nbsp;·&nbsp; ${escapeHtml(strategyLabel(run.imbalanceStrategy))}
            </span>
            <span style="font-size:0.78rem;font-weight:400;color:#94a3b8">${escapeHtml((run.timestamp || '').slice(0, 16).replace('T', ' '))}</span>
            ${meanF1 != null
              ? `<span style="font-size:0.85rem;font-weight:700;color:${metricColor(meanF1)}">Mean F1: ${fmt(meanF1)}${stdF1 != null ? ' ±' + fmtRaw(stdF1, 3) : ''}</span>`
              : ''}
          </summary>
          <div style="padding:0">
            <div style="padding:8px 14px;background:#f8faff;border-bottom:1px solid rgba(17,24,39,0.08);font-size:0.78rem;color:#4b5563">
              ${folds.length} folds
              ${meanF1 != null ? ` &nbsp;·&nbsp; Mean F1: <strong style="color:${metricColor(meanF1)}">${fmt(meanF1)}</strong>` : ''}
              ${stdF1 != null ? ` &nbsp;·&nbsp; Std dev: <strong>${fmtRaw(stdF1, 3)}</strong>${stdF1 > 0.08 ? ' <span style="color:#d97706">(high variance — dataset may be unstable)</span>' : ''}` : ''}
              ${run.jobIds ? ` &nbsp;·&nbsp; Job scope: <code>${escapeHtml(run.jobIds)}</code>` : ''}
            </div>
            <table style="margin:0;width:100%">
              <thead><tr style="background:#e8edf5">
                <th style="padding:5px 10px;font-size:0.72rem;text-align:center">Fold</th>
                <th style="padding:5px 10px;font-size:0.72rem;text-align:center">F1</th>
                <th style="padding:5px 10px;font-size:0.72rem;text-align:center">Precision</th>
                <th style="padding:5px 10px;font-size:0.72rem;text-align:center">Recall</th>
                <th style="padding:5px 10px;font-size:0.72rem;text-align:center">Train / Test rows</th>
              </tr></thead>
              <tbody>${foldRows}</tbody>
            </table>
            ${run.jobIds ? `<div style="padding:6px 14px;border-top:1px solid rgba(17,24,39,0.06);background:#f8faff;font-size:0.73rem;color:#9ca3af">Run ID: <code>${escapeHtml(run.id || '')}</code></div>` : ''}
          </div>
        </details>`;
    }).join('');
  }

  // ── Load everything ────────────────────────────────────────────────────────
  // NOTE: We deliberately avoid /api/modeling/overview here — that endpoint
  // loads the entire candidate dataset from the DB (can take 20-30 seconds).
  // Instead we use three fast disk-only endpoints:
  //   GET /api/modeling/models   (~70ms)  — artifact list with metrics
  //   GET /api/modeling/features (~3ms)   — full feature catalog with meanings
  //   GET /api/modeling/cv-results (~4ms) — saved CV history
  async function loadAll() {
    setMsg(supOverviewMsg, 'Loading…', false);
    setMsg(supCvMsg, 'Loading…', false);

    const [modelsResult, featuresResult, cvResult] = await Promise.allSettled([
      fetchJson('/api/modeling/models'),
      fetchJson('/api/modeling/features'),
      fetchJson('/api/modeling/cv-results'),
    ]);

    // ── Feature meanings (build lookup before rendering models) ──────────────
    if (featuresResult.status === 'fulfilled') {
      // /features returns { grouped: [ { key, title, description, features: [...] } ] }
      const grouped = Array.isArray(featuresResult.value.grouped) ? featuresResult.value.grouped : [];
      grouped.forEach((fam) => {
        if (Array.isArray(fam.features)) {
          fam.features.forEach((f) => {
            featureMeanings[f.key] = { title: f.title, description: f.description || '', meaning: f.meaning || '' };
          });
        }
      });
    }

    // ── Model history ────────────────────────────────────────────────────────
    if (modelsResult.status === 'fulfilled') {
      const models = Array.isArray(modelsResult.value.models) ? modelsResult.value.models : [];
      renderModelHistory(models);
      setMsg(supOverviewMsg, '', false);
    } else {
      setMsg(supOverviewMsg, 'Failed to load models: ' + (modelsResult.reason && modelsResult.reason.message || 'Unknown error'), true);
      supModelHistory.className = 'table-shell empty';
      supModelHistory.textContent = 'Could not load model history.';
    }

    // ── CV history ───────────────────────────────────────────────────────────
    if (cvResult.status === 'fulfilled') {
      renderCvHistory(cvResult.value.results || []);
      setMsg(supCvMsg, '', false);
    } else {
      setMsg(supCvMsg, 'Could not load CV history: ' + (cvResult.reason && cvResult.reason.message || ''), true);
      supCvHistory.className = 'table-shell empty';
      supCvHistory.textContent = 'CV history unavailable.';
    }
  }

  // ── Events ────────────────────────────────────────────────────────────────
  if (supRefresh) {
    supRefresh.addEventListener('click', () => loadAll());
  }

  if (supModelSelect) {
    supModelSelect.addEventListener('change', () => {
      const id = supModelSelect.value;
      if (id) loadWeights(id);
    });
  }

  // Auto-load weights when a model is available and nothing is selected
  function autoSelectFirstModel() {
    if (supModelSelect && supModelSelect.value) {
      loadWeights(supModelSelect.value);
    }
  }

  // ── Boot ──────────────────────────────────────────────────────────────────
  loadAll().then(() => autoSelectFirstModel());

})();
