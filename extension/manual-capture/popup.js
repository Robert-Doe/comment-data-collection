(function main() {
  const apiBaseUrlInput = document.getElementById('api-base-url');
  const currentPageEl = document.getElementById('current-page');
  const matchedItemEl = document.getElementById('matched-item');
  const matchSelectField = document.getElementById('match-select-field');
  const matchSelect = document.getElementById('match-select');
  const snapshotModeInput = document.getElementById('snapshot-mode');
  const notesInput = document.getElementById('notes');
  const configJsonInput = document.getElementById('config-json');
  const statusEl = document.getElementById('status');
  const applyConfigButton = document.getElementById('apply-config');
  const refreshTabButton = document.getElementById('refresh-tab');
  const captureUploadButton = document.getElementById('capture-upload');

  const STORAGE_KEY = 'ugc-manual-capture-config';
  const PENDING_KEY = 'ugc-pending-captures';
  let currentTab = null;
  let currentMatch = null;
  let currentMatches = [];
  let currentManualTarget = null;
  let manualOverride = null;
  const pollTimers = new Map(); // itemId → timer id

  function setStatus(text, isError) {
    statusEl.textContent = text || '';
    statusEl.className = isError ? 'status error' : 'status';
  }

  function normalizeApiBase(value) {
    return String(value || '').trim().replace(/\/$/, '');
  }

  function normalizeSnapshotMode(value) {
    return value === 'dom_html' ? 'dom_html' : 'frozen_styles';
  }

  function getStoredConfig() {
    return new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEY], (result) => {
        resolve(result[STORAGE_KEY] || {});
      });
    });
  }

  function saveConfig(config) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY]: config }, resolve);
    });
  }

  function getPendingCaptures() {
    return new Promise((resolve) => {
      chrome.storage.local.get([PENDING_KEY], (result) => {
        resolve(Array.isArray(result[PENDING_KEY]) ? result[PENDING_KEY] : []);
      });
    });
  }

  function savePendingCaptures(list) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [PENDING_KEY]: list }, resolve);
    });
  }

  async function addPendingCapture(entry) {
    const list = await getPendingCaptures();
    const next = list.filter((e) => e.itemId !== entry.itemId);
    next.push(entry);
    await savePendingCaptures(next);
    renderPendingCaptures(next);
  }

  async function removePendingCapture(itemId) {
    const list = await getPendingCaptures();
    const next = list.filter((e) => e.itemId !== itemId);
    await savePendingCaptures(next);
    renderPendingCaptures(next);
  }

  function renderPendingCaptures(list) {
    const container = document.getElementById('pending-captures');
    const section = document.getElementById('pending-section');
    if (!container || !section) return;
    const active = Array.isArray(list) ? list : [];
    if (!active.length) {
      section.classList.add('hidden');
      container.innerHTML = '';
      return;
    }
    section.classList.remove('hidden');
    container.innerHTML = active.map((entry) => {
      const label = entry.title ? entry.title : (entry.itemId || '');
      const stateText = entry.state === 'done'
        ? (entry.ugcDetected ? 'Done — UGC detected' : 'Done — no UGC')
        : entry.state === 'error'
          ? `Failed: ${entry.error || 'unknown error'}`
          : 'Analyzing…';
      const stateClass = entry.state === 'done' ? 'pill-done' : entry.state === 'error' ? 'pill-error' : 'pill-pending';
      return `<div class="pending-row">
        <span class="pending-label" title="${escapeAttr(entry.itemId || '')}">${escapeHtml(label)}</span>
        <span class="pending-state ${stateClass}">${escapeHtml(stateText)}</span>
      </div>`;
    }).join('');
  }

  function escapeHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function escapeAttr(str) {
    return String(str || '').replace(/"/g, '&quot;');
  }

  async function pollPendingCapture(entry) {
    if (pollTimers.has(entry.itemId)) return; // already polling
    const INTERVAL = 3000;
    const MAX_POLLS = 200; // 10 min ceiling
    let count = 0;

    async function tick() {
      count += 1;
      if (count > MAX_POLLS) {
        await removePendingCapture(entry.itemId);
        pollTimers.delete(entry.itemId);
        return;
      }
      try {
        const res = await fetch(`${entry.apiBaseUrl}/api/jobs/${encodeURIComponent(entry.jobId)}/items/${encodeURIComponent(entry.itemId)}`);
        if (!res.ok) throw new Error(`status ${res.status}`);
        const body = await res.json();
        const item = body && body.item ? body.item : null;
        if (item && item.updated_at && item.updated_at > entry.submittedAt) {
          // Analysis finished (success or fail)
          const ugcDetected = !!item.ugc_detected;
          const failed = item.status === 'failed';
          const updated = {
            ...entry,
            state: failed ? 'error' : 'done',
            ugcDetected,
            error: failed ? (item.error_message || 'analysis failed') : '',
          };
          const list = await getPendingCaptures();
          const next = list.map((e) => (e.itemId === entry.itemId ? updated : e));
          await savePendingCaptures(next);
          renderPendingCaptures(next);

          // Update the main matched-item display if it's the same item
          if (currentMatch && currentMatch.id === entry.itemId) {
            currentMatch = item;
            const { currentManualTarget: target } = window.__ugcPopupState || {};
            renderMatchSummary(item, target || currentManualTarget);
          }

          // Leave the row visible briefly so the user can read the result, then clean up
          setTimeout(async () => {
            await removePendingCapture(entry.itemId);
            pollTimers.delete(entry.itemId);
          }, 8000);
          return;
        }
      } catch (_) {
        // network hiccup — keep polling
      }
      pollTimers.set(entry.itemId, setTimeout(tick, INTERVAL));
    }

    pollTimers.set(entry.itemId, setTimeout(tick, INTERVAL));
  }

  function getActiveTab() {
    return new Promise((resolve, reject) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!tabs || !tabs.length) {
          reject(new Error('No active tab found'));
          return;
        }
        resolve(tabs[0]);
      });
    });
  }

  function executeInTab(tabId, fn, args = []) {
    return new Promise((resolve, reject) => {
      chrome.scripting.executeScript(
        {
          target: { tabId },
          func: fn,
          args,
        },
        (results) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve(results && results[0] ? results[0].result : null);
        },
      );
    });
  }

  function captureVisibleScreenshot(windowId) {
    return new Promise((resolve, reject) => {
      chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, (dataUrl) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(dataUrl || '');
      });
    });
  }

  function renderCurrentPage(tab, pageInfo) {
    const url = pageInfo && pageInfo.url ? pageInfo.url : (tab && tab.url ? tab.url : '');
    const title = pageInfo && pageInfo.title ? pageInfo.title : (tab && tab.title ? tab.title : '');
    currentPageEl.textContent = url
      ? `${title || '(untitled)'}\n${url}`
      : 'Open the target page, then click Refresh Match.';
  }

  function renderMatchSummary(item, manualTarget) {
    if (!item) {
      if (manualTarget && manualTarget.item) {
        const expectedUrl = manualTarget.capture_url || (manualTarget.item && (manualTarget.item.manual_capture_url || manualTarget.item.final_url || manualTarget.item.normalized_url)) || '';
        const parts = [
          `Scanner selected Job ${manualTarget.item.job_id}`,
          `Row ${manualTarget.item.row_number}`,
          manualTarget.is_recent ? 'selected recently' : 'selected earlier',
          manualTarget.url_matches_expected
            ? 'Selected row is waiting for confirmation from lookup.'
            : 'Current tab URL does not match the selected row yet.',
          expectedUrl ? `Expected URL: ${expectedUrl}` : '',
        ].filter(Boolean);
        matchedItemEl.textContent = parts.join('\n');
      } else {
        matchedItemEl.textContent = 'No matching scanner row was found for this page. If the row exists in the scanner, make sure the current tab URL matches the scan row URL.';
      }
      captureUploadButton.disabled = true;
      return;
    }

    const parts = [
      `Job ${item.job_id}`,
      `Row ${item.row_number}`,
      item.lookup_source === 'manual_target' ? 'selected in scanner' : 'matched by URL',
      item.manual_capture_required ? 'needs review' : (item.analysis_source || 'automated'),
      item.lookup_score !== undefined ? `lookup ${item.lookup_score}` : '',
      item.manual_capture_reason || item.error_message || '',
    ].filter(Boolean);

    matchedItemEl.textContent = parts.join('\n');
    captureUploadButton.disabled = false;
  }

  function renderMatchSelect(matches) {
    matchSelect.innerHTML = '';
    if (!matches || matches.length <= 1) {
      matchSelectField.classList.add('hidden');
      return;
    }

    matches.forEach((item) => {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = `Job ${item.job_id} | Row ${item.row_number} | Score ${item.lookup_score} | ${item.lookup_source === 'manual_target' ? 'selected row' : 'url match'}`;
      matchSelect.appendChild(option);
    });

    matchSelectField.classList.remove('hidden');
  }

  async function refreshTabInfo() {
    currentTab = await getActiveTab();
    const info = await executeInTab(currentTab.id, () => ({
      url: window.location.href,
      title: document.title || '',
    }));
    renderCurrentPage(currentTab, info || {});
    return {
      tab: currentTab,
      pageInfo: info || {},
    };
  }

  async function lookupMatch(url) {
    const apiBaseUrl = normalizeApiBase(apiBaseUrlInput.value);
    if (!apiBaseUrl) {
      throw new Error('API Base URL is required');
    }

    const response = await fetch(`${apiBaseUrl}/api/manual-review/lookup?url=${encodeURIComponent(url)}`);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error || `Lookup failed: ${response.status}`);
    }

    currentManualTarget = body.manualTarget || null;
    currentMatches = Array.isArray(body.matches) ? body.matches : [];
    currentMatch = null;
    renderMatchSelect(currentMatches);

    if (manualOverride && manualOverride.itemId) {
      currentMatch = currentMatches.find((item) => item.id === manualOverride.itemId) || null;
    }

    if (!currentMatch) {
      currentMatch = body.selected || currentMatches[0] || null;
    }

    if (currentMatch) {
      matchSelect.value = currentMatch.id;
    }

    renderMatchSummary(currentMatch, currentManualTarget);
    return currentMatch;
  }

  async function refreshMatch() {
    const { pageInfo } = await refreshTabInfo();
    const url = pageInfo && pageInfo.url ? pageInfo.url : (currentTab && currentTab.url ? currentTab.url : '');
    if (!url) {
      throw new Error('Could not determine the current tab URL');
    }
    return lookupMatch(url);
  }

  async function captureSnapshot(tab, snapshotMode) {
    const details = await executeInTab(tab.id, (mode) => {
      function toDoctypeString() {
        if (!document.doctype) return '<!doctype html>';
        return `<!DOCTYPE ${document.doctype.name || 'html'}>`;
      }

      function serializeComputedStyle(style) {
        if (!style) return '';
        const declarations = [];
        for (let index = 0; index < style.length; index += 1) {
          const property = style[index];
          const value = style.getPropertyValue(property);
          if (!value) continue;
          declarations.push(`${property}: ${value} !important;`);
        }
        return declarations.join(' ');
      }

      function syncCurrentState(source, target) {
        if (!source || !target || !source.tagName || !target.tagName) return;

        if (source.tagName === 'INPUT') {
          if (source.type === 'checkbox' || source.type === 'radio') {
            if (source.checked) target.setAttribute('checked', '');
            else target.removeAttribute('checked');
          } else {
            target.setAttribute('value', source.value || '');
          }
        }

        if (source.tagName === 'TEXTAREA') {
          target.textContent = source.value || '';
        }

        if (source.tagName === 'SELECT') {
          const sourceOptions = Array.from(source.options || []);
          const targetOptions = Array.from(target.options || []);
          sourceOptions.forEach((option, index) => {
            const targetOption = targetOptions[index];
            if (!targetOption) return;
            if (option.selected) targetOption.setAttribute('selected', '');
            else targetOption.removeAttribute('selected');
          });
        }

        if (source.tagName === 'DETAILS') {
          if (source.open) target.setAttribute('open', '');
          else target.removeAttribute('open');
        }
      }

      function buildPseudoRule(source, pseudo, freezeId) {
        const style = window.getComputedStyle(source, pseudo);
        if (!style) return '';
        const content = style.getPropertyValue('content');
        const display = style.getPropertyValue('display');
        if ((!content || content === 'none' || content === 'normal' || content === '""' || content === "''") && display === 'none') {
          return '';
        }

        const declarations = serializeComputedStyle(style);
        if (!declarations) return '';
        return `[data-ugc-freeze-id="${freezeId}"]${pseudo} { ${declarations} }`;
      }

      function ensureHead(cloneRoot) {
        let head = cloneRoot.querySelector('head');
        if (!head) {
          head = document.createElement('head');
          cloneRoot.insertBefore(head, cloneRoot.firstChild || null);
        }
        return head;
      }

      function buildFrozenHtml() {
        const cloneRoot = document.documentElement.cloneNode(true);
        const sourceElements = [document.documentElement].concat(Array.from(document.documentElement.querySelectorAll('*')));
        const clonedElements = [cloneRoot].concat(Array.from(cloneRoot.querySelectorAll('*')));
        const rules = [];

        for (let index = 0; index < sourceElements.length && index < clonedElements.length; index += 1) {
          const source = sourceElements[index];
          const target = clonedElements[index];
          const freezeId = `ugc-freeze-${index + 1}`;
          target.setAttribute('data-ugc-freeze-id', freezeId);
          syncCurrentState(source, target);

          const declarations = serializeComputedStyle(window.getComputedStyle(source));
          if (declarations) {
            rules.push(`[data-ugc-freeze-id="${freezeId}"] { ${declarations} }`);
          }

          const beforeRule = buildPseudoRule(source, '::before', freezeId);
          const afterRule = buildPseudoRule(source, '::after', freezeId);
          if (beforeRule) rules.push(beforeRule);
          if (afterRule) rules.push(afterRule);
        }

        cloneRoot.querySelectorAll('script, noscript').forEach((node) => node.remove());
        cloneRoot.querySelectorAll('style, link[rel="stylesheet"]').forEach((node) => node.remove());

        const head = ensureHead(cloneRoot);
        if (!head.querySelector('meta[charset]')) {
          const meta = document.createElement('meta');
          meta.setAttribute('charset', 'utf-8');
          head.insertBefore(meta, head.firstChild || null);
        }

        if (!head.querySelector('base')) {
          const base = document.createElement('base');
          base.setAttribute('href', window.location.href);
          head.insertBefore(base, head.firstChild || null);
        }

        const modeMeta = document.createElement('meta');
        modeMeta.setAttribute('name', 'ugc-snapshot-mode');
        modeMeta.setAttribute('content', 'frozen_styles');
        head.appendChild(modeMeta);

        const style = document.createElement('style');
        style.setAttribute('data-ugc-frozen-snapshot', 'true');
        style.textContent = `${rules.join('\n')}\n* { animation: none !important; transition: none !important; }`;
        head.appendChild(style);

        return `${toDoctypeString()}\n${cloneRoot.outerHTML}`;
      }

      const doctypePrefix = toDoctypeString();
      const rawHtml = document.documentElement ? `${doctypePrefix}\n${document.documentElement.outerHTML}` : '';
      const html = mode === 'frozen_styles' ? buildFrozenHtml() : rawHtml;

      return {
        html,
        rawHtml,
        title: document.title || '',
        url: window.location.href,
        snapshotMode: mode,
      };
    }, [normalizeSnapshotMode(snapshotMode)]);

    if (!details || !details.html) {
      throw new Error('Failed to capture DOM snapshot from the current tab');
    }

    const screenshotDataUrl = await captureVisibleScreenshot(tab.windowId);
    const screenshotBlob = await fetch(screenshotDataUrl).then((response) => response.blob());

    return {
      html: details.html,
      rawHtml: details.rawHtml || '',
      title: details.title || tab.title || '',
      url: details.url || tab.url || '',
      snapshotMode: normalizeSnapshotMode(details.snapshotMode || snapshotMode),
      screenshotBlob,
    };
  }

  function applyConfigJson() {
    let parsed;
    try {
      parsed = JSON.parse(configJsonInput.value || '{}');
    } catch (error) {
      setStatus(`Invalid JSON: ${error.message}`, true);
      return;
    }

    apiBaseUrlInput.value = normalizeApiBase(parsed.apiBaseUrl || parsed.apiBase || apiBaseUrlInput.value);
    snapshotModeInput.value = normalizeSnapshotMode(parsed.snapshotMode || snapshotModeInput.value);
    notesInput.value = parsed.notes || notesInput.value;
    manualOverride = {
      jobId: parsed.jobId || '',
      itemId: parsed.itemId || '',
      captureUrl: parsed.captureUrl || '',
      title: parsed.title || '',
      notes: parsed.notes || '',
    };

    if (manualOverride.jobId && manualOverride.itemId) {
      currentMatch = {
        job_id: manualOverride.jobId,
        id: manualOverride.itemId,
        row_number: '?',
        manual_capture_required: true,
        manual_capture_reason: 'Using fallback config override.',
      };
      renderMatchSummary(currentMatch, currentManualTarget);
    }

    setStatus('Fallback config applied. Auto-match will still run when available.', false);
  }

  async function uploadCapture() {
    const apiBaseUrl = normalizeApiBase(apiBaseUrlInput.value);
    const snapshotMode = normalizeSnapshotMode(snapshotModeInput.value);
    const targetItem = currentMatch || null;

    if (!apiBaseUrl) {
      setStatus('API Base URL is required.', true);
      return;
    }

    if (!targetItem || !targetItem.job_id || !targetItem.id) {
      setStatus('No matched scanner row is selected for this page.', true);
      return;
    }

    setStatus(snapshotMode === 'frozen_styles'
      ? 'Capturing frozen snapshot. This can take a few seconds on large pages...'
      : 'Capturing current tab...', false);

    const { tab, pageInfo } = await refreshTabInfo();
    const currentPageUrl = (pageInfo && pageInfo.url) || (tab && tab.url) || '';
    if (!(manualOverride && manualOverride.itemId)) {
      setStatus('Rechecking page match before upload...', false);
      const validatedMatch = currentPageUrl ? await lookupMatch(currentPageUrl) : null;
      const sameTarget = !!(validatedMatch
        && validatedMatch.id === targetItem.id
        && validatedMatch.job_id === targetItem.job_id);
      if (!sameTarget) {
        throw new Error('Current tab no longer matches the selected scanner row. Refresh Match and reopen the target page before uploading.');
      }
    }
    const snapshot = await captureSnapshot(tab, snapshotMode);
    const formData = new FormData();
    formData.append('snapshot', new Blob([snapshot.html], { type: 'text/html' }), snapshot.snapshotMode === 'frozen_styles' ? 'snapshot.frozen.html' : 'snapshot.html');
    if (snapshot.rawHtml) {
      formData.append('rawSnapshot', new Blob([snapshot.rawHtml], { type: 'text/html' }), 'snapshot.raw.html');
    }
    formData.append('snapshotMode', snapshot.snapshotMode);
    formData.append('captureUrl', snapshot.url || (pageInfo && pageInfo.url) || manualOverride?.captureUrl || '');
    formData.append('title', snapshot.title || manualOverride?.title || '');
    if (notesInput.value.trim()) {
      formData.append('notes', notesInput.value.trim());
    } else if (manualOverride && manualOverride.notes) {
      formData.append('notes', manualOverride.notes);
    }
    formData.append('screenshot', snapshot.screenshotBlob, 'manual-capture.png');

    await saveConfig({
      apiBaseUrl,
      snapshotMode: snapshot.snapshotMode,
      notes: notesInput.value.trim(),
    });

    setStatus('Uploading snapshot…', false);
    const response = await fetch(`${apiBaseUrl}/api/jobs/${encodeURIComponent(targetItem.job_id)}/items/${encodeURIComponent(targetItem.id)}/manual-capture`, {
      method: 'POST',
      body: formData,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error || `Upload failed: ${response.status}`);
    }

    if (response.status === 202 && body.pending) {
      // Server accepted the upload and is analysing in the background
      const pendingEntry = {
        jobId: body.jobId || targetItem.job_id,
        itemId: body.itemId || targetItem.id,
        submittedAt: body.submittedAt || new Date().toISOString(),
        apiBaseUrl,
        title: snapshot.title || targetItem.title || targetItem.normalized_url || '',
        state: 'analyzing',
      };
      await addPendingCapture(pendingEntry);
      pollPendingCapture(pendingEntry);
      setStatus(`Uploaded (${snapshot.snapshotMode}). Analysing in background — you can close this popup.`, false);
    } else {
      // Older server returning the full result synchronously
      currentMatch = body.item || currentMatch;
      renderMatchSummary(currentMatch, currentManualTarget);
      const detected = body.item && body.item.ugc_detected ? 'yes' : 'no';
      setStatus(`Snapshot uploaded. Mode: ${snapshot.snapshotMode}. UGC detected: ${detected}.`, false);
    }
  }

  applyConfigButton.addEventListener('click', () => {
    applyConfigJson();
  });

  refreshTabButton.addEventListener('click', () => {
    refreshMatch()
      .then(() => {
        if (currentMatch) {
          setStatus(
            currentMatch.lookup_source === 'manual_target'
              ? 'Matched the scanner row selected in the web app.'
              : 'Scanner row matched automatically.',
            false,
          );
          return;
        }
        if (currentManualTarget && currentManualTarget.item) {
          setStatus('A scanner row is selected, but this tab does not match the expected page yet.', false);
          return;
        }
        setStatus('No scanner row matched this page yet.', false);
      })
      .catch((error) => setStatus(error.message || String(error), true));
  });

  matchSelect.addEventListener('change', () => {
    currentMatch = currentMatches.find((item) => item.id === matchSelect.value) || currentMatch;
    renderMatchSummary(currentMatch, currentManualTarget);
  });

  captureUploadButton.addEventListener('click', () => {
    uploadCapture().catch((error) => {
      setStatus(error.message || String(error), true);
    });
  });

  getStoredConfig()
    .then(async (stored) => {
      apiBaseUrlInput.value = normalizeApiBase(stored.apiBaseUrl || 'http://localhost:3000');
      snapshotModeInput.value = normalizeSnapshotMode(stored.snapshotMode || 'frozen_styles');
      notesInput.value = stored.notes || '';
      captureUploadButton.disabled = true;
      await refreshMatch().catch(() => {});
      // Resume polling for any captures that were still in-flight when the popup was last closed.
      const pending = await getPendingCaptures().catch(() => []);
      renderPendingCaptures(pending);
      pending.forEach((entry) => {
        if (entry.state === 'analyzing') {
          pollPendingCapture(entry);
        }
      });
    })
    .catch((error) => {
      setStatus(error.message || String(error), true);
    });
}());
