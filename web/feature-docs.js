(function bootstrapFeatureDocs() {
  const config = window.__APP_CONFIG__ || {};
  const apiBase = (config.apiBaseUrl || '').replace(/\/$/, '');

  const variantDocs = document.getElementById('variant-docs');
  const featureFamilies = document.getElementById('feature-families');
  const featureGlossary = document.getElementById('feature-glossary');
  const featureFilter = document.getElementById('feature-filter');
  const featureFilterMode = document.getElementById('feature-filter-mode');

  let groupedFeatures = [];

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

  async function fetchJson(path) {
    const response = await fetch(apiUrl(path));
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error || `Request failed: ${response.status}`);
    }
    return body;
  }

  function renderVariants(variants) {
    if (!variants || !variants.length) {
      variantDocs.className = 'docs-card-grid empty';
      variantDocs.textContent = 'No model variants are available.';
      return;
    }

    variantDocs.className = 'docs-card-grid';
    variantDocs.innerHTML = variants.map((variant) => `
      <article class="docs-card">
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
      </article>
    `).join('');
  }

  function renderFamilies(grouped) {
    if (!grouped || !grouped.length) {
      featureFamilies.className = 'docs-card-grid empty';
      featureFamilies.textContent = 'No feature families are available.';
      return;
    }

    featureFamilies.className = 'docs-card-grid';
    featureFamilies.innerHTML = grouped.map((family) => `
      <article class="docs-card">
        <h3>${escapeHtml(family.title)}</h3>
        <p>${escapeHtml(family.description)}</p>
        <div class="feature-chip-list">
          <span class="feature-chip plain"><strong>Feature Count</strong><span>${escapeHtml((family.features || []).length)}</span></span>
        </div>
      </article>
    `).join('');
  }

  function matchesKeywordMode(feature, mode) {
    if (mode === 'keywords') return !!feature.keywordFeature;
    if (mode === 'non-keywords') return !feature.keywordFeature;
    return true;
  }

  function renderGlossary() {
    const query = featureFilter.value.trim().toLowerCase();
    const mode = featureFilterMode.value;
    const sections = groupedFeatures
      .map((family) => ({
        ...family,
        features: (family.features || []).filter((feature) => {
          if (!matchesKeywordMode(feature, mode)) return false;
          if (!query) return true;
          const haystack = [
            feature.key,
            feature.title,
            feature.family,
            feature.description,
            feature.meaning,
            feature.level,
            feature.type,
          ].join(' ').toLowerCase();
          return haystack.includes(query);
        }),
      }))
      .filter((family) => family.features.length > 0);

    if (!sections.length) {
      featureGlossary.className = 'feature-doc-grid empty';
      featureGlossary.textContent = 'No features matched the current filter.';
      return;
    }

    featureGlossary.className = 'feature-doc-grid';
    featureGlossary.innerHTML = sections.map((family) => `
      <section class="docs-section">
        <div class="panel-header compact-header">
          <h3>${escapeHtml(family.title)}</h3>
        </div>
        <div class="feature-doc-grid">
          ${family.features.map((feature) => `
            <article class="feature-doc-card">
              <p class="eyebrow subtle">${escapeHtml(feature.key)}</p>
              <h3>${escapeHtml(feature.title)}</h3>
              <div class="feature-chip-list">
                <span class="feature-chip plain"><strong>Type</strong><span>${escapeHtml(feature.type)}</span></span>
                <span class="feature-chip plain"><strong>Level</strong><span>${escapeHtml(feature.level)}</span></span>
                <span class="feature-chip ${feature.keywordFeature ? 'warn' : 'good'}">
                  <strong>Keyword Family</strong>
                  <span>${feature.keywordFeature ? 'yes' : 'no'}</span>
                </span>
              </div>
              <p>${escapeHtml(feature.description)}</p>
              <p class="candidate-copy"><strong>What it really means:</strong> ${escapeHtml(feature.meaning)}</p>
            </article>
          `).join('')}
        </div>
      </section>
    `).join('');
  }

  Promise.all([
    fetchJson('/api/modeling/variants'),
    fetchJson('/api/modeling/features'),
  ])
    .then(([variantPayload, featurePayload]) => {
      renderVariants(variantPayload.variants || []);
      groupedFeatures = featurePayload.grouped || [];
      renderFamilies(groupedFeatures);
      renderGlossary();
    })
    .catch((error) => {
      featureGlossary.className = 'feature-doc-grid empty';
      featureGlossary.textContent = error.message || String(error);
      variantDocs.className = 'docs-card-grid empty';
      variantDocs.textContent = error.message || String(error);
      featureFamilies.className = 'docs-card-grid empty';
      featureFamilies.textContent = error.message || String(error);
    });

  featureFilter.addEventListener('input', renderGlossary);
  featureFilterMode.addEventListener('change', renderGlossary);
}());
