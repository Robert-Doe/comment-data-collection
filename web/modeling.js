(function bootstrapModelLab() {
  const config = window.__APP_CONFIG__ || {};
  const apiBase = (config.apiBaseUrl || '').replace(/\/$/, '');

  const refreshButton = document.getElementById('refresh-modeling');
  const overviewShell = document.getElementById('model-overview');
  const variantCards = document.getElementById('variant-cards');
  const trainJobIds = document.getElementById('train-job-ids');
  const downloadAllDataset = document.getElementById('download-all-dataset');
  const trainMessage = document.getElementById('train-message');
  const trainResult = document.getElementById('train-result');
  const modelList = document.getElementById('model-list');
  const scoreModelId = document.getElementById('score-model-id');
  const scoreJobId = document.getElementById('score-job-id');
  const scoreJobForm = document.getElementById('score-job-form');
  const scoreJobMessage = document.getElementById('score-job-message');
  const scoreJobSummary = document.getElementById('score-job-summary');
  const scoreJobResults = document.getElementById('score-job-results');
  const recentJobsModel = document.getElementById('recent-jobs-model');
  const siteGroupForm = document.getElementById('site-group-form');
  const siteGroupModelId = document.getElementById('site-group-model-id');
  const siteGroupJobIds = document.getElementById('site-group-job-ids');
  const siteGroupFile = document.getElementById('site-group-file');
  const siteGroupText = document.getElementById('site-group-text');
  const siteGroupMessage = document.getElementById('site-group-message');
  const siteGroupResults = document.getElementById('site-group-results');

  let currentModels = [];
  let currentVariants = [];
  let currentOverview = null;

  function apiUrl(path) {
    return `${apiBase}${path}`;
  }

  function runtimeModelUrl(modelId) {
    return apiUrl(`/api/modeling/models/${encodeURIComponent(String(modelId || ''))}/runtime.json`);
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async function fetchJson(path, options) {
    const response = await fetch(apiUrl(path), options);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error || `Request failed: ${response.status}`);
    }
    return body;
  }

  function setMessage(node, text, isError) {
    node.textContent = text || '';
    node.className = isError ? 'message error' : 'message';
  }

  function formatMetric(value) {
    if (value === null || value === undefined || value === '') return '';
    if (typeof value === 'number') return String(Math.round(value * 1000) / 1000);
    return String(value);
  }

  function updateDatasetDownloadLink() {
    const jobIds = encodeURIComponent(trainJobIds.value.trim());
    downloadAllDataset.href = apiUrl(`/api/modeling/dataset.csv${jobIds ? `?jobIds=${jobIds}` : ''}`);
    variantCards.querySelectorAll('[data-dataset-variant]').forEach((link) => {
      const variantId = link.getAttribute('data-dataset-variant');
      if (!variantId) return;
      const params = [`variantId=${encodeURIComponent(variantId)}`];
      if (jobIds) params.push(`jobIds=${jobIds}`);
      link.href = apiUrl(`/api/modeling/dataset.csv?${params.join('&')}`);
    });
  }

  function renderOverview(overview) {
    currentOverview = overview;
    const dataset = overview && overview.dataset ? overview.dataset : null;
    const models = overview && Array.isArray(overview.models) ? overview.models : [];
    const families = overview && Array.isArray(overview.feature_families) ? overview.feature_families : [];

    if (!dataset) {
      overviewShell.className = 'summary empty';
      overviewShell.textContent = 'No modeling overview available.';
      return;
    }

    overviewShell.className = 'summary';
    overviewShell.innerHTML = [
      `<div><strong>Labeled Candidates:</strong> ${escapeHtml(dataset.labeled_candidate_count)}</div>`,
      `<div><strong>Positive Labels:</strong> ${escapeHtml(dataset.positive_candidate_count)}</div>`,
      `<div><strong>Negative Labels:</strong> ${escapeHtml(dataset.negative_candidate_count)}</div>`,
      `<div><strong>Uncertain Labels:</strong> ${escapeHtml(dataset.uncertain_candidate_count)}</div>`,
      `<div><strong>Candidate Rows:</strong> ${escapeHtml(dataset.candidate_count)}</div>`,
      `<div><strong>Reviewed Items:</strong> ${escapeHtml(dataset.review_complete_binary_item_count)}</div>`,
      `<div><strong>Hostnames:</strong> ${escapeHtml(dataset.hostname_count)}</div>`,
      `<div><strong>Saved Models:</strong> ${escapeHtml(models.length)}</div>`,
      `<div><strong>Feature Families:</strong> ${escapeHtml(families.length)}</div>`,
    ].join('');
  }

  function renderVariantCards(variants) {
    currentVariants = variants || [];
    if (!currentVariants.length) {
      variantCards.className = 'model-card-grid empty';
      variantCards.textContent = 'No model variants are available.';
      return;
    }

    variantCards.className = 'model-card-grid';
    variantCards.innerHTML = currentVariants.map((variant) => `
      <article class="model-card">
        <p class="eyebrow subtle">${escapeHtml(variant.id)}</p>
        <h3>${escapeHtml(variant.title)}</h3>
        <p>${escapeHtml(variant.description)}</p>
        <div class="feature-chip-list">
          <span class="feature-chip plain"><strong>Feature Count</strong><span>${escapeHtml(variant.feature_count)}</span></span>
          <span class="feature-chip ${variant.excludeKeywordFeatures ? 'muted' : 'good'}">
            <strong>Keyword Family</strong>
            <span>${variant.excludeKeywordFeatures ? 'excluded' : 'included'}</span>
          </span>
        </div>
        <div class="candidate-actions">
          <button class="primary" type="button" data-train-variant="${escapeHtml(variant.id)}">Train ${escapeHtml(variant.title)}</button>
          <a class="link-button" data-dataset-variant="${escapeHtml(variant.id)}" href="#">Download Variant Dataset</a>
        </div>
      </article>
    `).join('');
    updateDatasetDownloadLink();
  }

  function renderTrainResult(model) {
    if (!model) {
      trainResult.className = 'model-card-grid empty';
      trainResult.textContent = '';
      return;
    }

    const evaluation = model.evaluation && model.evaluation.test
      ? model.evaluation.test
      : model.evaluation && model.evaluation.train
        ? model.evaluation.train
        : null;
    const familyImportance = model.reliance && Array.isArray(model.reliance.family_importance)
      ? model.reliance.family_importance.slice(0, 6)
      : [];
    const positiveWeights = model.reliance && Array.isArray(model.reliance.positive_weights)
      ? model.reliance.positive_weights.slice(0, 5)
      : [];
    const negativeWeights = model.reliance && Array.isArray(model.reliance.negative_weights)
      ? model.reliance.negative_weights.slice(0, 5)
      : [];

    trainResult.className = 'model-card-grid';
    trainResult.innerHTML = `
      <article class="model-card">
        <p class="eyebrow subtle">Latest Training Result</p>
        <h3>${escapeHtml(model.variant_title || model.variant_id || '')}</h3>
        <p>Saved as <code>${escapeHtml(model.id || '')}</code>. This is the artifact you can use for scoring jobs and probing site groups.</p>
        <div class="summary tight-summary">
          <div><strong>Train Rows:</strong> ${escapeHtml(model.training_counts ? model.training_counts.train_rows : '')}</div>
          <div><strong>Test Rows:</strong> ${escapeHtml(model.training_counts ? model.training_counts.test_rows : '')}</div>
          <div><strong>Precision:</strong> ${escapeHtml(evaluation && evaluation.candidate_metrics ? formatMetric(evaluation.candidate_metrics.precision) : '')}</div>
          <div><strong>Recall:</strong> ${escapeHtml(evaluation && evaluation.candidate_metrics ? formatMetric(evaluation.candidate_metrics.recall) : '')}</div>
          <div><strong>F1:</strong> ${escapeHtml(evaluation && evaluation.candidate_metrics ? formatMetric(evaluation.candidate_metrics.f1) : '')}</div>
          <div><strong>Top-1 Accuracy:</strong> ${escapeHtml(evaluation && evaluation.ranking_metrics ? formatMetric(evaluation.ranking_metrics.top_1_accuracy) : '')}</div>
        </div>
      </article>
      <article class="model-card">
        <p class="eyebrow subtle">Feature Reliance</p>
        <h3>Most Influential Families</h3>
        <div class="feature-chip-list">
          ${familyImportance.map((family) => `
            <span class="feature-chip plain">
              <strong>${escapeHtml(family.family)}</strong>
              <span>${escapeHtml(formatMetric(family.total_absolute_weight))}</span>
            </span>
          `).join('')}
        </div>
        <p class="candidate-copy">These are the feature families the trained logistic model leaned on most heavily, based on summed absolute coefficient weight.</p>
      </article>
      <article class="model-card">
        <p class="eyebrow subtle">Positive Drivers</p>
        <h3>Top Positive Weights</h3>
        <div class="feature-chip-list">
          ${positiveWeights.map((entry) => `
            <span class="feature-chip good">
              <strong>${escapeHtml(entry.output_key)}</strong>
              <span>${escapeHtml(formatMetric(entry.weight))}</span>
            </span>
          `).join('')}
        </div>
      </article>
      <article class="model-card">
        <p class="eyebrow subtle">Negative Drivers</p>
        <h3>Top Negative Weights</h3>
        <div class="feature-chip-list">
          ${negativeWeights.map((entry) => `
            <span class="feature-chip muted">
              <strong>${escapeHtml(entry.output_key)}</strong>
              <span>${escapeHtml(formatMetric(entry.weight))}</span>
            </span>
          `).join('')}
        </div>
      </article>
    `;
  }

  function repopulateModelSelects(models) {
    currentModels = models || [];
    const options = currentModels.map((model) => `
      <option value="${escapeHtml(model.id)}">${escapeHtml(model.variant_title || model.variant_id || model.id)}</option>
    `).join('');

    [scoreModelId, siteGroupModelId].forEach((select) => {
      select.innerHTML = options || '<option value="">No trained models</option>';
      select.disabled = !options;
    });
  }

  function renderModelList(models) {
    repopulateModelSelects(models);
    if (!models || !models.length) {
      modelList.className = 'table-shell empty';
      modelList.textContent = 'No trained models saved yet.';
      return;
    }

    modelList.className = 'table-shell';
    modelList.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Artifact</th>
            <th>Variant</th>
            <th>Created</th>
            <th>Precision</th>
            <th>Recall</th>
            <th>F1</th>
            <th>Top-1</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${models.map((model) => {
            const evaluation = model.evaluation && model.evaluation.test
              ? model.evaluation.test
              : model.evaluation && model.evaluation.train
                ? model.evaluation.train
                : null;
            return `
              <tr>
                <td class="mono">${escapeHtml(model.id || '')}</td>
                <td>${escapeHtml(model.variant_title || model.variant_id || '')}</td>
                <td>${escapeHtml(model.created_at || '')}</td>
                <td>${escapeHtml(evaluation && evaluation.candidate_metrics ? formatMetric(evaluation.candidate_metrics.precision) : '')}</td>
                <td>${escapeHtml(evaluation && evaluation.candidate_metrics ? formatMetric(evaluation.candidate_metrics.recall) : '')}</td>
                <td>${escapeHtml(evaluation && evaluation.candidate_metrics ? formatMetric(evaluation.candidate_metrics.f1) : '')}</td>
                <td>${escapeHtml(evaluation && evaluation.ranking_metrics ? formatMetric(evaluation.ranking_metrics.top_1_accuracy) : '')}</td>
                <td>
                  <div class="action-stack">
                    <button class="secondary compact" type="button" data-use-model="${escapeHtml(model.id || '')}">Use</button>
                    <a class="link-button compact" href="${escapeHtml(runtimeModelUrl(model.id || ''))}">Runtime JSON</a>
                  </div>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  }

  function renderRecentJobs(jobs) {
    if (!jobs || !jobs.length) {
      recentJobsModel.className = 'table-shell empty';
      recentJobsModel.textContent = 'No jobs found.';
      return;
    }

    recentJobsModel.className = 'table-shell';
    recentJobsModel.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Job</th>
            <th>Status</th>
            <th>Completed</th>
            <th>Detected</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${jobs.map((job) => `
            <tr>
              <td class="mono">${escapeHtml(job.id)}</td>
              <td>${escapeHtml(job.status)}</td>
              <td>${escapeHtml(job.completed_count)}/${escapeHtml(job.total_urls)}</td>
              <td>${escapeHtml(job.detected_count)}</td>
              <td><button class="secondary compact" type="button" data-use-job="${escapeHtml(job.id)}">Use Job</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  function renderScoredJob(result) {
    const summary = result && result.summary ? result.summary : null;
    const items = result && Array.isArray(result.items) ? result.items : [];

    if (!summary) {
      scoreJobSummary.className = 'summary empty';
      scoreJobSummary.textContent = 'Run a scored job to see item-level predictions.';
      scoreJobResults.className = 'table-shell empty';
      scoreJobResults.textContent = 'No scored job loaded.';
      return;
    }

    scoreJobSummary.className = 'summary';
    scoreJobSummary.innerHTML = [
      `<div><strong>Items:</strong> ${escapeHtml(summary.item_count)}</div>`,
      `<div><strong>Candidates:</strong> ${escapeHtml(summary.candidate_count)}</div>`,
      `<div><strong>Predicted Positives:</strong> ${escapeHtml(summary.predicted_positive_item_count)}</div>`,
      `<div><strong>Manual Review:</strong> ${escapeHtml(summary.manual_review_item_count)}</div>`,
      `<div><strong>Mean Top Probability:</strong> ${escapeHtml(formatMetric(summary.mean_top_probability))}</div>`,
      `<div><strong>Model:</strong> ${escapeHtml(result.artifact ? result.artifact.id : '')}</div>`,
    ].join('');

    if (!items.length) {
      scoreJobResults.className = 'table-shell empty';
      scoreJobResults.textContent = 'This job has no stored candidates to score.';
      return;
    }

    scoreJobResults.className = 'table-shell';
    scoreJobResults.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Row</th>
            <th>URL</th>
            <th>Top Probability</th>
            <th>Top Label</th>
            <th>Manual Review</th>
            <th>Top Candidate Notes</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((item) => {
            const top = item.top_candidate || null;
            const positiveContributors = top && top.explanation && top.explanation.top_positive_contributors
              ? top.explanation.top_positive_contributors.slice(0, 3)
              : [];
            const negativeContributors = top && top.explanation && top.explanation.top_negative_contributors
              ? top.explanation.top_negative_contributors.slice(0, 2)
              : [];
            return `
              <tr>
                <td>${escapeHtml(item.row_number)}</td>
                <td class="mono">${item.final_url || item.normalized_url ? `<a href="${escapeHtml(item.final_url || item.normalized_url)}" target="_blank" rel="noreferrer">${escapeHtml(item.final_url || item.normalized_url)}</a>` : ''}</td>
                <td>${escapeHtml(top ? formatMetric(top.probability) : '')}</td>
                <td>${escapeHtml(top && top.human_label ? top.human_label : 'unlabeled')}</td>
                <td>${item.manual_review_suggested ? 'yes' : 'no'}</td>
                <td>
                  <details class="score-details" data-score-detail="job-${escapeHtml(item.item_id)}">
                    <summary>Inspect</summary>
                    <div class="score-details-body">
                      <p class="candidate-copy"><strong>Sample text:</strong> ${escapeHtml(top && top.sample_text ? top.sample_text : 'No sample text')}</p>
                      <div class="feature-chip-list">
                        ${positiveContributors.map((entry) => `
                          <span class="feature-chip good">
                            <strong>${escapeHtml(entry.output_key)}</strong>
                            <span>${escapeHtml(formatMetric(entry.contribution))}</span>
                          </span>
                        `).join('')}
                        ${negativeContributors.map((entry) => `
                          <span class="feature-chip muted">
                            <strong>${escapeHtml(entry.output_key)}</strong>
                            <span>${escapeHtml(formatMetric(entry.contribution))}</span>
                          </span>
                        `).join('')}
                      </div>
                    </div>
                  </details>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  }

  function renderSiteGroups(result) {
    const groups = result && Array.isArray(result.groups) ? result.groups : [];
    if (!groups.length) {
      siteGroupResults.className = 'table-shell empty';
      siteGroupResults.textContent = 'No matching hostnames were found in the stored jobs.';
      return;
    }

    siteGroupResults.className = 'table-shell';
    siteGroupResults.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Hostname</th>
            <th>Matched Items</th>
            <th>Manual Review</th>
            <th>Mean Top Probability</th>
            <th>Max Top Probability</th>
            <th>Examples</th>
          </tr>
        </thead>
        <tbody>
          ${groups.map((group) => `
            <tr>
              <td class="mono">${escapeHtml(group.hostname)}</td>
              <td>${escapeHtml(group.matched_item_count)}</td>
              <td>${escapeHtml(group.manual_review_item_count)}</td>
              <td>${escapeHtml(formatMetric(group.mean_top_probability))}</td>
              <td>${escapeHtml(formatMetric(group.max_top_probability))}</td>
              <td>
                <details class="score-details" data-score-detail="group-${escapeHtml(group.hostname)}">
                  <summary>Inspect</summary>
                  <div class="score-details-body">
                    <div class="feature-chip-list">
                      ${(group.items || []).slice(0, 8).map((item) => `
                        <span class="feature-chip plain">
                          <strong>Row ${escapeHtml(item.row_number)}</strong>
                          <span>${escapeHtml(item.top_candidate ? formatMetric(item.top_candidate.probability) : '')}</span>
                        </span>
                      `).join('')}
                    </div>
                  </div>
                </details>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  async function readSiteGroupText() {
    const typed = siteGroupText.value.trim();
    if (typed) return typed;
    if (siteGroupFile.files && siteGroupFile.files[0]) {
      return siteGroupFile.files[0].text();
    }
    return '';
  }

  async function refreshPage() {
    updateDatasetDownloadLink();
    const [overview, recentJobs] = await Promise.all([
      fetchJson('/api/modeling/overview'),
      fetchJson('/api/jobs?limit=15'),
    ]);

    renderOverview(overview);
    renderVariantCards(overview.variants || []);
    renderModelList(overview.models || []);
    renderRecentJobs(recentJobs.jobs || []);
  }

  async function trainVariant(variantId) {
    setMessage(trainMessage, 'Training model...', false);
    const body = {
      variantId,
      jobIds: trainJobIds.value.trim(),
    };
    const result = await fetchJson('/api/modeling/train', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    setMessage(trainMessage, `Saved model ${result.summary ? result.summary.id : ''}.`, false);
    renderTrainResult(result.model || null);
    await refreshPage();
  }

  refreshButton.addEventListener('click', () => {
    refreshPage().catch((error) => {
      setMessage(trainMessage, error.message || String(error), true);
    });
  });

  trainJobIds.addEventListener('input', updateDatasetDownloadLink);

  variantCards.addEventListener('click', (event) => {
    const button = event.target.closest('[data-train-variant]');
    if (!button) return;
    const variantId = button.getAttribute('data-train-variant');
    if (!variantId) return;
    trainVariant(variantId).catch((error) => {
      setMessage(trainMessage, error.message || String(error), true);
    });
  });

  modelList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-use-model]');
    if (!button) return;
    const modelId = button.getAttribute('data-use-model');
    if (!modelId) return;
    scoreModelId.value = modelId;
    siteGroupModelId.value = modelId;
  });

  recentJobsModel.addEventListener('click', (event) => {
    const button = event.target.closest('[data-use-job]');
    if (!button) return;
    const jobId = button.getAttribute('data-use-job');
    if (!jobId) return;
    scoreJobId.value = jobId;
  });

  scoreJobForm.addEventListener('submit', (event) => {
    event.preventDefault();
    setMessage(scoreJobMessage, 'Scoring job...', false);
    fetchJson('/api/modeling/score-job', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        modelId: scoreModelId.value,
        jobId: scoreJobId.value.trim(),
      }),
    })
      .then((result) => {
        setMessage(scoreJobMessage, 'Job scored.', false);
        renderScoredJob(result);
      })
      .catch((error) => {
        setMessage(scoreJobMessage, error.message || String(error), true);
      });
  });

  siteGroupForm.addEventListener('submit', (event) => {
    event.preventDefault();
    setMessage(siteGroupMessage, 'Running site-group probe...', false);
    readSiteGroupText()
      .then((text) => fetchJson('/api/modeling/site-groups', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          modelId: siteGroupModelId.value,
          jobIds: siteGroupJobIds.value.trim(),
          siteText: text,
        }),
      }))
      .then((result) => {
        setMessage(siteGroupMessage, 'Site-group probe completed.', false);
        renderSiteGroups(result);
      })
      .catch((error) => {
        setMessage(siteGroupMessage, error.message || String(error), true);
      });
  });

  renderTrainResult(null);
  renderScoredJob(null);
  updateDatasetDownloadLink();
  refreshPage().catch((error) => {
    setMessage(trainMessage, error.message || String(error), true);
  });
}());
