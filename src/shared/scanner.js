'use strict';

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { chromium } = require('playwright');

let browserPromise;

function getFeaturePath() {
  return path.resolve(__dirname, '..', 'commentFeatures.js');
}

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: true });
  }
  return browserPromise;
}

async function safeWait(page, state, timeoutMs) {
  try {
    await page.waitForLoadState(state, { timeout: timeoutMs });
  } catch (_) {
    return;
  }
}

async function safeWaitForFunction(page, expression, timeoutMs) {
  try {
    await page.waitForFunction(expression, { timeout: timeoutMs });
  } catch (_) {
    return;
  }
}

async function dismissConsentPrompts(page) {
  await page.evaluate(() => {
    function deepQuerySelectorAll(selector) {
      const results = [];
      const seen = new Set();
      const stack = [document];

      while (stack.length) {
        const root = stack.pop();
        if (!root || !root.querySelectorAll) continue;
        let matches = [];
        let hosts = [];
        try {
          matches = Array.from(root.querySelectorAll(selector));
          hosts = Array.from(root.querySelectorAll('*')).filter((el) => el && el.shadowRoot);
        } catch (_) {
          matches = [];
          hosts = [];
        }

        matches.forEach((match) => {
          if (!match || seen.has(match)) return;
          seen.add(match);
          results.push(match);
        });

        hosts.forEach((host) => {
          if (host.shadowRoot) {
            stack.push(host.shadowRoot);
          }
        });
      }

      return results;
    }

    const pattern = /\b(accept|agree|allow all|got it|continue)\b/i;
    const candidates = deepQuerySelectorAll('button, [role="button"], input[type="button"], input[type="submit"]');
    let clicked = 0;

    function isVisible(el) {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style && style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    }

    candidates.forEach((candidate) => {
      if (clicked >= 3) return;
      const label = `${candidate.innerText || ''} ${candidate.getAttribute('aria-label') || ''} ${candidate.value || ''}`.trim();
      if (pattern.test(label) && isVisible(candidate)) {
        candidate.click();
        clicked += 1;
      }
    });
  }).catch(() => {});
}

async function expandPotentialUgc(page) {
  await page.evaluate(() => {
    function deepQuerySelectorAll(selector) {
      const results = [];
      const seen = new Set();
      const stack = [document];

      while (stack.length) {
        const root = stack.pop();
        if (!root || !root.querySelectorAll) continue;
        let matches = [];
        let hosts = [];
        try {
          matches = Array.from(root.querySelectorAll(selector));
          hosts = Array.from(root.querySelectorAll('*')).filter((el) => el && el.shadowRoot);
        } catch (_) {
          matches = [];
          hosts = [];
        }

        matches.forEach((match) => {
          if (!match || seen.has(match)) return;
          seen.add(match);
          results.push(match);
        });

        hosts.forEach((host) => {
          if (host.shadowRoot) {
            stack.push(host.shadowRoot);
          }
        });
      }

      return results;
    }

    const pattern = /\b(show comments|view comments|load comments|load more|show more|more comments|more replies|more reviews|show replies|view replies|replies|comments)\b/i;
    const candidates = deepQuerySelectorAll('button, [role="button"], summary, details summary');
    let clicked = 0;

    function isVisible(el) {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style && style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    }

    candidates.forEach((candidate) => {
      if (clicked >= 6) return;
      const label = `${candidate.innerText || ''} ${candidate.getAttribute('aria-label') || ''}`.trim();
      if (pattern.test(label) && isVisible(candidate)) {
        candidate.click();
        clicked += 1;
      }
    });
  }).catch(() => {});
}

async function autoScroll(page, options = {}) {
  const steps = Math.max(1, Number(options.steps || 5));
  const stepDelayMs = Math.max(0, Number(options.stepDelayMs ?? 250));
  const bottomPauseMs = Math.max(0, Number(options.bottomPauseMs ?? Math.max(stepDelayMs, 300)));
  const stabilizationPasses = Math.max(1, Number(options.stabilizationPasses || 2));
  const returnToTop = options.returnToTop === true;
  return page.evaluate(async ({ steps, stepDelayMs, bottomPauseMs, stabilizationPasses, returnToTop }) => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const getScrollHeight = () => Math.max(
      document.body ? document.body.scrollHeight : 0,
      document.documentElement ? document.documentElement.scrollHeight : 0,
    );
    const startingHeight = getScrollHeight();
    let observedHeight = startingHeight;
    let heightChanged = false;
    let passesCompleted = 0;
    let previousSettledHeight = startingHeight;

    for (let pass = 0; pass < stabilizationPasses; pass += 1) {
      passesCompleted += 1;
      let passHeight = getScrollHeight();
      observedHeight = Math.max(observedHeight, passHeight);

      for (let i = 1; i <= steps; i += 1) {
        window.scrollTo(0, Math.round((passHeight * i) / steps));
        await sleep(stepDelayMs);
        passHeight = Math.max(passHeight, getScrollHeight());
        observedHeight = Math.max(observedHeight, passHeight);
      }

      window.scrollTo(0, Math.max(0, getScrollHeight() - window.innerHeight));
      await sleep(bottomPauseMs);
      const settledHeight = getScrollHeight();
      if (settledHeight > previousSettledHeight + 4) {
        heightChanged = true;
      }
      observedHeight = Math.max(observedHeight, settledHeight);
      if (Math.abs(settledHeight - previousSettledHeight) <= 4) {
        previousSettledHeight = settledHeight;
        break;
      }
      previousSettledHeight = settledHeight;
    }

    window.scrollTo(0, Math.max(0, getScrollHeight() - window.innerHeight));
    await sleep(bottomPauseMs);
    if (returnToTop) {
      window.scrollTo(0, 0);
    }
    return {
      startingHeight,
      finalHeight: getScrollHeight(),
      observedHeight,
      heightChanged,
      passesCompleted,
    };
  }, {
    steps,
    stepDelayMs,
    bottomPauseMs,
    stabilizationPasses,
    returnToTop,
  }).catch(() => ({
    startingHeight: 0,
    finalHeight: 0,
    observedHeight: 0,
    heightChanged: false,
    passesCompleted: 0,
  }));
}

async function waitForDocumentComplete(page, timeoutMs) {
  await safeWaitForFunction(page, () => document.readyState === 'complete', timeoutMs);
}

async function settlePageForDetection(page, options = {}) {
  const loadWaitMs = Math.max(1000, Number(options.loadWaitMs || 15000));
  const networkIdleWaitMs = Math.max(1000, Number(options.networkIdleWaitMs || 8000));
  const actionSettleMs = Math.max(0, Number(options.actionSettleMs || 350));
  const postLoadDelayMs = Math.max(0, Number(options.postLoadDelayMs || 0));
  const loadSettlePasses = Math.max(1, Number(options.loadSettlePasses || 2));
  const scrollBackToTop = options.scrollBackToTop === true;
  const bottomPauseMs = Math.max(0, Number(options.bottomPauseMs ?? Math.max(actionSettleMs, 350)));

  await waitForDocumentComplete(page, loadWaitMs);
  await safeWait(page, 'load', loadWaitMs);
  await safeWait(page, 'networkidle', networkIdleWaitMs);

  for (let pass = 0; pass < loadSettlePasses; pass += 1) {
    await dismissConsentPrompts(page);
    if (actionSettleMs > 0) {
      await page.waitForTimeout(actionSettleMs);
    }
    await expandPotentialUgc(page);
    if (actionSettleMs > 0) {
      await page.waitForTimeout(actionSettleMs);
    }
    const scrollSummary = await autoScroll(page, {
      steps: 6,
      stepDelayMs: 220,
      bottomPauseMs,
      stabilizationPasses: 2,
      returnToTop: scrollBackToTop,
    });
    await safeWait(page, 'load', Math.min(loadWaitMs, 8000));
    await safeWait(page, 'networkidle', networkIdleWaitMs);
    await waitForDocumentComplete(page, Math.min(loadWaitMs, 8000));
    if (actionSettleMs > 0) {
      await page.waitForTimeout(actionSettleMs);
    }
    await expandPotentialUgc(page);
    if (actionSettleMs > 0) {
      await page.waitForTimeout(actionSettleMs);
    }
    if (!scrollSummary.heightChanged) {
      break;
    }
  }

  if (postLoadDelayMs > 0) {
    await page.waitForTimeout(postLoadDelayMs);
  }
}

async function loadPageWithRetries(page, normalizedUrl, options = {}) {
  const timeoutMs = Math.max(1000, Number(options.timeoutMs ?? 45000));
  const navigationRetries = Math.max(1, Number(options.navigationRetries ?? 2));
  const retryableStatuses = new Set([408, 425, 429, 500, 502, 503, 504]);
  let lastError = null;

  for (let attempt = 1; attempt <= navigationRetries; attempt += 1) {
    try {
      const response = await page.goto(normalizedUrl, {
        waitUntil: 'domcontentloaded',
        timeout: timeoutMs,
      });
      const status = response ? Number(response.status()) : 0;
      if (status && retryableStatuses.has(status) && attempt < navigationRetries) {
        lastError = new Error(`Navigation returned retryable status ${status}`);
      } else {
        return {
          response,
          attemptCount: attempt,
        };
      }
    } catch (error) {
      lastError = error;
      if (attempt >= navigationRetries) {
        throw error;
      }
    }

    await page.waitForTimeout(Math.min(2500 * attempt, 8000));
  }

  throw lastError || new Error(`Unable to load ${normalizedUrl}`);
}

function summarizePageAccessSignals(access) {
  if (!access || !access.blocked) return '';
  if (access.blockerType === 'cloudflare') {
    return 'Blocked by Cloudflare verification challenge';
  }
  if (access.blockerType === 'captcha') {
    return 'Blocked by CAPTCHA or human verification challenge';
  }
  if (access.blockerType === 'login_wall') {
    return 'Blocked by a login or membership wall';
  }
  return 'Blocked by an access interstitial';
}

function sanitizeSegment(value, fallback = 'item') {
  const cleaned = String(value || '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || fallback;
}

function toPosixPath(value) {
  return String(value || '').replace(/\\/g, '/');
}

function buildArtifactUrl(relativePath, options = {}) {
  if (!relativePath) return '';
  const basePath = String(options.artifactUrlBasePath || '/artifacts').replace(/\/$/, '');
  const publicPath = `${basePath}/${toPosixPath(relativePath).replace(/^\/+/, '')}`;
  const publicBaseUrl = String(options.publicBaseUrl || '').replace(/\/$/, '');
  return publicBaseUrl ? `${publicBaseUrl}${publicPath}` : publicPath;
}

function getArtifactSegments(options = {}, fallbackKey = '') {
  const safeFallback = sanitizeSegment(fallbackKey || 'item', 'item');
  return {
    jobSegment: sanitizeSegment(options.jobId || 'adhoc', 'adhoc'),
    rowSegment: sanitizeSegment(options.rowNumber || options.itemId || safeFallback, safeFallback),
    itemSegment: sanitizeSegment(options.itemId || safeFallback, safeFallback),
  };
}

function getArtifactVersionSegment(options = {}) {
  const raw = String(options.artifactVersion || '').trim();
  if (!raw) return '';
  return sanitizeSegment(raw, 'v');
}

function buildFrameKey(frame) {
  if (!frame) return '';
  const parent = frame.parentFrame();
  return [
    frame.url() || '',
    frame.name() || '',
    parent ? (parent.url() || '') : 'main',
  ].join('::');
}

function buildCandidateKey(candidate = {}) {
  return crypto.createHash('sha1')
    .update([
      candidate.frame_key || '',
      candidate.frame_url || '',
      candidate.xpath || '',
      candidate.css_path || '',
      candidate.node_id || '',
      candidate.structural_signature || '',
    ].join('|'))
    .digest('hex')
    .slice(0, 16);
}

async function resolveCandidateElementHandle(frame, candidate) {
  if (!frame || !candidate) return null;

  const selectors = [];
  if (candidate.xpath) selectors.push({ type: 'xpath', value: candidate.xpath });
  if (candidate.css_path) selectors.push({ type: 'css', value: candidate.css_path });

  for (const selector of selectors) {
    try {
      const locator = selector.type === 'xpath'
        ? frame.locator(`xpath=${selector.value}`).first()
        : frame.locator(selector.value).first();
      const count = await locator.count();
      if (!count) continue;
      await locator.scrollIntoViewIfNeeded().catch(() => {});
      const handle = await locator.elementHandle();
      if (handle) return handle;
    } catch (_) {
      continue;
    }
  }

  return null;
}

async function extractCandidateMarkup(handle, options = {}) {
  const maxHtmlChars = Math.max(500, Number(options.maxCandidateHtmlChars || 8000));
  return handle.evaluate((node, input) => {
    const outerHtml = String(node && node.outerHTML ? node.outerHTML : '');
    const innerHtml = String(node && node.innerHTML ? node.innerHTML : '');
    const text = String((node && (node.innerText || node.textContent)) || '')
      .replace(/\s+/g, ' ')
      .trim();
    return {
      candidate_outer_html_excerpt: outerHtml.slice(0, input.maxHtmlChars),
      candidate_outer_html_length: outerHtml.length,
      candidate_outer_html_truncated: outerHtml.length > input.maxHtmlChars,
      candidate_inner_html_excerpt: innerHtml.slice(0, input.maxHtmlChars),
      candidate_inner_html_length: innerHtml.length,
      candidate_inner_html_truncated: innerHtml.length > input.maxHtmlChars,
      candidate_text_excerpt: text.slice(0, 1200),
      candidate_markup_error: '',
      candidate_resolved_tag_name: node && node.tagName ? String(node.tagName).toLowerCase() : '',
    };
  }, { maxHtmlChars });
}

async function captureCandidateArtifacts(page, frame, candidate, options = {}) {
  const emptyScreenshot = {
    candidate_screenshot_path: '',
    candidate_screenshot_url: '',
    candidate_screenshot_error: '',
  };

  if (!page || !frame || !candidate) {
    return {
      ...emptyScreenshot,
      candidate_markup_error: 'Candidate frame or page was unavailable.',
    };
  }

  let handle = null;
  let markup = {};
  try {
    handle = await resolveCandidateElementHandle(frame, candidate);
    if (!handle) {
      return {
        ...emptyScreenshot,
        candidate_screenshot_error: 'Candidate element could not be resolved from xpath/css path',
        candidate_markup_error: 'Candidate element could not be resolved from xpath/css path',
      };
    }

    try {
      markup = await extractCandidateMarkup(handle, options);
    } catch (error) {
      markup = {
        candidate_markup_error: error && error.message ? error.message : String(error),
      };
    }

    if (!options.captureScreenshots || !options.artifactRoot) {
      return {
        ...emptyScreenshot,
        ...markup,
      };
    }

    const box = await handle.boundingBox();
    if (!box || box.width <= 1 || box.height <= 1) {
      return {
        ...emptyScreenshot,
        ...markup,
        candidate_screenshot_error: 'Candidate element has no visible bounding box',
      };
    }

    const { jobSegment, rowSegment, itemSegment } = getArtifactSegments(options, candidate.candidate_key || 'candidate');
    const versionSegment = getArtifactVersionSegment(options);
    const rankSegment = String(candidate.candidate_rank || 0).padStart(2, '0');
    const pathParts = [
      'candidate-screenshots',
      jobSegment,
      `${rowSegment}-${itemSegment}`,
    ];
    if (versionSegment) pathParts.push(versionSegment);
    pathParts.push(`${rankSegment}-${candidate.candidate_key || 'candidate'}.png`);
    const relativePath = path.join(...pathParts);
    const absolutePath = path.join(options.artifactRoot, relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await handle.screenshot({
      path: absolutePath,
      animations: 'disabled',
    });

    return {
      ...emptyScreenshot,
      ...markup,
      candidate_screenshot_path: absolutePath,
      candidate_screenshot_url: buildArtifactUrl(relativePath, options),
      candidate_screenshot_error: '',
    };
  } catch (error) {
    return {
      ...emptyScreenshot,
      ...markup,
      candidate_screenshot_error: error && error.message ? error.message : String(error),
    };
  } finally {
    if (handle) {
      await handle.dispose().catch(() => {});
    }
  }
}

async function enrichCandidatesWithArtifacts(page, candidates, frameLookup, options = {}) {
  const reviewArtifactLimit = Math.max(0, Number(options.maxCandidateReviewArtifacts || options.maxResults || 5));
  const enriched = [];

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = {
      ...candidates[index],
      candidate_rank: index + 1,
      candidate_key: buildCandidateKey(candidates[index]),
    };
    const frame = frameLookup.get(candidate.frame_key || '');

    if (frame) {
      const artifactOptions = index < reviewArtifactLimit
        ? options
        : { ...options, captureScreenshots: false };
      Object.assign(candidate, await captureCandidateArtifacts(page, frame, candidate, artifactOptions));
      if (index >= reviewArtifactLimit) {
        candidate.candidate_screenshot_error = 'Candidate screenshot was skipped because only the top review candidates get screenshot artifacts.';
      }
    } else {
      candidate.candidate_screenshot_path = '';
      candidate.candidate_screenshot_url = '';
      candidate.candidate_screenshot_error = index >= reviewArtifactLimit
        ? 'Candidate screenshot was skipped because only the top review candidates get screenshot artifacts.'
        : 'Candidate screenshot could not be captured because its frame was unavailable.';
      candidate.candidate_markup_error = 'Candidate markup could not be captured because its frame was unavailable.';
    }

    enriched.push(candidate);
  }

  return enriched;
}

async function capturePageScreenshot(page, normalizedUrl, options = {}) {
  if (!options.captureScreenshots || !options.artifactRoot) {
    return {
      screenshot_path: '',
      screenshot_url: '',
    };
  }

  const urlHash = crypto.createHash('sha1').update(String(normalizedUrl || page.url() || '')).digest('hex').slice(0, 12);
  const { jobSegment, rowSegment, itemSegment } = getArtifactSegments(options, urlHash);
  const versionSegment = getArtifactVersionSegment(options);
  const relativePath = versionSegment
    ? path.join('screenshots', jobSegment, `${rowSegment}-${itemSegment}`, versionSegment, 'page.png')
    : path.join('screenshots', jobSegment, `${rowSegment}-${itemSegment}.png`);
  const absolutePath = path.join(options.artifactRoot, relativePath);

  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await page.screenshot({
    path: absolutePath,
    fullPage: options.screenshotFullPage !== false,
    animations: 'disabled',
  });

  return {
    screenshot_path: absolutePath,
    screenshot_url: buildArtifactUrl(relativePath, options),
  };
}

async function persistPageHtmlSnapshot(html, rawHtml, normalizedUrl, options = {}) {
  const empty = {
    manual_html_path: '',
    manual_html_url: '',
    manual_raw_html_path: '',
    manual_raw_html_url: '',
  };

  const resolvedHtml = String(html || '').trim();
  const resolvedRawHtml = String(rawHtml || '').trim();
  if (!options.captureHtmlSnapshots || !options.artifactRoot || (!resolvedHtml && !resolvedRawHtml)) {
    return empty;
  }

  const urlHash = crypto.createHash('sha1').update(String(normalizedUrl || '')).digest('hex').slice(0, 12);
  const { jobSegment, rowSegment, itemSegment } = getArtifactSegments(options, urlHash);
  const versionSegment = getArtifactVersionSegment(options);
  const baseDir = versionSegment
    ? path.join('html-snapshots', jobSegment, `${rowSegment}-${itemSegment}`, versionSegment)
    : path.join('html-snapshots', jobSegment, `${rowSegment}-${itemSegment}`);

  let manualHtmlPath = '';
  let manualHtmlUrl = '';
  if (resolvedHtml) {
    const htmlRelativePath = path.join(baseDir, 'snapshot.html');
    manualHtmlPath = path.join(options.artifactRoot, htmlRelativePath);
    await fs.mkdir(path.dirname(manualHtmlPath), { recursive: true });
    await fs.writeFile(manualHtmlPath, `${resolvedHtml}\n`, 'utf8');
    manualHtmlUrl = buildArtifactUrl(htmlRelativePath, options);
  }

  let manualRawHtmlPath = '';
  let manualRawHtmlUrl = '';
  if (resolvedRawHtml && resolvedRawHtml !== resolvedHtml) {
    const rawRelativePath = path.join(baseDir, 'snapshot.raw.html');
    manualRawHtmlPath = path.join(options.artifactRoot, rawRelativePath);
    await fs.mkdir(path.dirname(manualRawHtmlPath), { recursive: true });
    await fs.writeFile(manualRawHtmlPath, `${resolvedRawHtml}\n`, 'utf8');
    manualRawHtmlUrl = buildArtifactUrl(rawRelativePath, options);
  }

  return {
    manual_html_path: manualHtmlPath,
    manual_html_url: manualHtmlUrl,
    manual_raw_html_path: manualRawHtmlPath,
    manual_raw_html_url: manualRawHtmlUrl,
  };
}

async function detectPageAccess(page) {
  const frameUrls = page.frames().map((frame) => frame.url());
  const pageInfo = await page.evaluate(() => {
    function deepQuerySelectorAll(selector) {
      const results = [];
      const seen = new Set();
      const stack = [document];

      while (stack.length) {
        const root = stack.pop();
        if (!root || !root.querySelectorAll) continue;
        let matches = [];
        let hosts = [];
        try {
          matches = Array.from(root.querySelectorAll(selector));
          hosts = Array.from(root.querySelectorAll('*')).filter((el) => el && el.shadowRoot);
        } catch (_) {
          matches = [];
          hosts = [];
        }

        matches.forEach((match) => {
          if (!match || seen.has(match)) return;
          seen.add(match);
          results.push(match);
        });

        hosts.forEach((host) => {
          if (host.shadowRoot) {
            stack.push(host.shadowRoot);
          }
        });
      }

      return results;
    }

    function isVisible(el) {
      if (!el) return false;
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style && style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    }

    const text = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
    const title = (document.title || '').trim();
    const combined = `${title} ${text}`;
    const captchaIframes = deepQuerySelectorAll('iframe[src*="captcha"], iframe[src*="turnstile"], iframe[src*="challenge"], iframe[src*="recaptcha"]');
    const hasCloudflareText = /verify to continue|checking if the site connection is secure|review the security of your connection before proceeding|attention required/i.test(combined);
    const hasCaptchaText = /captcha|human verification|security check|are you a human|unusual traffic/i.test(combined);
    const hasLoginWallText = /\b(sign in|log in|join|create account|start trial|subscribe)\b/i.test(combined)
      && /\b(to continue|to view|to watch|to comment|to reply|to proceed)\b/i.test(combined);
    const hasTurnstile = deepQuerySelectorAll('[id^="cf-chl-widget"], .cf-turnstile, [name="cf-turnstile-response"]').length > 0;
    const hasCaptchaIframe = captchaIframes.some((iframe) => {
      const src = String(iframe.getAttribute('src') || '');
      const rect = iframe.getBoundingClientRect();
      if (/recaptcha\/(?:enterprise\/)?anchor/i.test(src)) {
        return false;
      }
      return isVisible(iframe) && rect.width >= 160 && rect.height >= 60;
    });

    return {
      title,
      pageTextSample: text.slice(0, 600),
      pageTextLength: text.length,
      hasCloudflareText,
      hasCaptchaText,
      hasLoginWallText,
      hasTurnstile,
      hasCaptchaIframe,
    };
  }).catch(() => ({
    title: '',
    pageTextSample: '',
    pageTextLength: 0,
    hasCloudflareText: false,
    hasCaptchaText: false,
    hasLoginWallText: false,
    hasTurnstile: false,
    hasCaptchaIframe: false,
  }));

  const hasCloudflareFrame = frameUrls.some((url) => /challenges\.cloudflare\.com/i.test(url));
  const hasCaptchaFrame = frameUrls.some((url) => {
    if (!/captcha|turnstile|challenge|recaptcha/i.test(url)) return false;
    return !/google\.com\/recaptcha\/(?:enterprise\/)?anchor/i.test(url);
  });

  let blockerType = '';
  if (pageInfo.hasCloudflareText || pageInfo.hasTurnstile || hasCloudflareFrame) {
    blockerType = 'cloudflare';
  } else if (pageInfo.hasCaptchaText || pageInfo.hasCaptchaIframe || hasCaptchaFrame) {
    blockerType = 'captcha';
  } else if (pageInfo.hasLoginWallText) {
    blockerType = 'login_wall';
  }

  const blocked = !!blockerType;
  return {
    blocked,
    blockerType,
    reason: summarizePageAccessSignals({ blocked, blockerType }),
    frameCount: frameUrls.length,
    frameUrls,
    pageTextSample: pageInfo.pageTextSample,
    pageTextLength: pageInfo.pageTextLength,
    title: pageInfo.title,
  };
}

async function extractCandidatesFromFrame(frame, rawHtml, responseHeaders, options) {
  try {
    const candidates = await frame.evaluate(({ html, headers, detectionOptions }) => {
      if (typeof extractCandidateRegions !== 'function') {
        throw new Error('extractCandidateRegions is not available in the frame context');
      }
      return extractCandidateRegions(html || document.documentElement.outerHTML, headers || {}, detectionOptions);
    }, {
      html: rawHtml,
      headers: responseHeaders,
      detectionOptions: {
        maxCandidates: options.maxCandidates || 25,
        maxResults: options.maxResults || 5,
      },
    });

    return candidates.map((candidate) => ({
      ...candidate,
      frame_url: frame.url(),
      frame_name: frame.name() || '',
      frame_key: buildFrameKey(frame),
      frame_is_main: !frame.parentFrame(),
      frame_title: candidate.frame_title || '',
    }));
  } catch (_) {
    return [];
  }
}

function sortCandidates(candidates) {
  return candidates.sort((left, right) => (
    Number(!!right.detected) - Number(!!left.detected)
      || (right.score || 0) - (left.score || 0)
      || (right.unit_count || 0) - (left.unit_count || 0)
      || (right.total_text_length || 0) - (left.total_text_length || 0)
  ));
}

function dedupeCandidates(candidates, maxResults) {
  const seen = new Set();
  const deduped = [];

  candidates.forEach((candidate) => {
    if (deduped.length >= maxResults) return;
    const key = `${candidate.frame_url || ''}::${candidate.xpath || ''}::${candidate.css_path || ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    deduped.push(candidate);
  });

  return deduped;
}

async function collectCandidatesFromPage(page, rawHtml, responseHeaders, options = {}) {
  const maxResults = options.maxResults || 5;
  const candidateBuckets = [];
  const frameLookup = new Map();
  frameLookup.set(buildFrameKey(page.mainFrame()), page.mainFrame());

  candidateBuckets.push(...await extractCandidatesFromFrame(page.mainFrame(), rawHtml, responseHeaders, options));

  const childFrames = page.frames()
    .filter((frame) => frame !== page.mainFrame())
    .filter((frame) => frame.url() && !/challenges\.cloudflare\.com/i.test(frame.url()));

  for (const frame of childFrames) {
    frameLookup.set(buildFrameKey(frame), frame);
    const frameHtml = await frame.content().catch(() => '');
    const frameCandidates = await extractCandidatesFromFrame(frame, frameHtml, {}, options);
    candidateBuckets.push(...frameCandidates);
  }

  const selected = dedupeCandidates(sortCandidates(candidateBuckets), maxResults);
  return enrichCandidatesWithArtifacts(page, selected, frameLookup, options);
}

function deriveManualCaptureState(result, source = 'automated') {
  if (source !== 'automated') {
    return {
      required: false,
      reason: '',
    };
  }

  if (result.error) {
    return {
      required: true,
      reason: result.error,
    };
  }

  if (result.ugc_detected) {
    return {
      required: false,
      reason: '',
    };
  }

  if (result.access_reason) {
    return {
      required: true,
      reason: result.access_reason,
    };
  }

  if (!result.candidates || !result.candidates.length) {
    return {
      required: true,
      reason: 'Automated scan found no candidate UGC region; manual interaction may be required.',
    };
  }

  return {
    required: true,
    reason: 'Automated scan found no UGC; manual capture may help after click, scroll, login, or CAPTCHA resolution.',
  };
}

async function createContext() {
  const browser = await getBrowser();
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
  });

  await context.addInitScript({ path: getFeaturePath() });
  await context.route('**/*', (route) => {
    const type = route.request().resourceType();
    if (type === 'image' || type === 'media' || type === 'font') {
      route.abort().catch(() => {});
      return;
    }
    route.continue().catch(() => {});
  });

  return context;
}

async function scanUrl(normalizedUrl, options = {}) {
  const context = await createContext();
  const page = await context.newPage();
  const timeoutMs = Math.max(1000, Number(options.timeoutMs ?? 90000));
  const postLoadDelayMs = Math.max(0, Number(options.postLoadDelayMs ?? 6000));
  const preScreenshotDelayMs = Math.max(0, Number(options.preScreenshotDelayMs ?? 1500));
  const navigationRetries = Math.max(1, Number(options.navigationRetries ?? 2));
  const loadSettlePasses = Math.max(1, Number(options.loadSettlePasses ?? 2));
  const negativeRetrySettlePasses = Math.max(1, Number(options.negativeRetrySettlePasses ?? 2));
  const actionSettleMs = Math.max(0, Number(options.actionSettleMs ?? 1250));
  page.setDefaultNavigationTimeout(timeoutMs);
  page.setDefaultTimeout(timeoutMs);

  const result = {
    input_url: normalizedUrl,
    normalized_url: normalizedUrl,
    final_url: '',
    title: '',
    ugc_detected: false,
    best_candidate: null,
    candidates: [],
    error: '',
    blocked_by_interstitial: false,
    blocker_type: '',
    access_reason: '',
    page_text_sample: '',
    frame_count: 0,
    screenshot_path: '',
    screenshot_url: '',
    screenshot_error: '',
    manual_html_path: '',
    manual_html_url: '',
    manual_raw_html_path: '',
    manual_raw_html_url: '',
    navigation_attempts: 0,
    settle_passes_applied: 0,
    negative_retry_applied: false,
    scan_delay_ms_applied: postLoadDelayMs,
    screenshot_delay_ms_applied: preScreenshotDelayMs,
  };

  try {
    const navigation = await loadPageWithRetries(page, normalizedUrl, {
      timeoutMs,
      navigationRetries,
    });
    const response = navigation.response;
    result.navigation_attempts = navigation.attemptCount;

    await settlePageForDetection(page, {
      timeoutMs,
      postLoadDelayMs,
      loadSettlePasses,
      actionSettleMs,
    });
    result.settle_passes_applied = loadSettlePasses;

    const responseText = response ? await response.text().catch(() => '') : '';
    const responseHeaders = response ? response.headers() : {};
    let currentHtml = await page.content().catch(() => '');
    let rawHtml = currentHtml || responseText;
    let access = await detectPageAccess(page);
    let candidates = await collectCandidatesFromPage(page, rawHtml, responseHeaders, options);
    let bestCandidate = candidates[0] || null;
    let ugcDetected = !!(bestCandidate && bestCandidate.detected);

    if (!access.blocked && !ugcDetected) {
      result.negative_retry_applied = true;
      await settlePageForDetection(page, {
        timeoutMs,
        postLoadDelayMs,
        loadSettlePasses: negativeRetrySettlePasses,
        actionSettleMs,
      });
      result.settle_passes_applied += negativeRetrySettlePasses;
      currentHtml = await page.content().catch(() => '');
      rawHtml = currentHtml || responseText;
      access = await detectPageAccess(page);
      candidates = await collectCandidatesFromPage(page, rawHtml, responseHeaders, options);
      bestCandidate = candidates[0] || null;
      ugcDetected = !!(bestCandidate && bestCandidate.detected);
    }

    await waitForDocumentComplete(page, 5000);
    await safeWait(page, 'networkidle', 2500);
    if (preScreenshotDelayMs > 0) {
      await page.waitForTimeout(preScreenshotDelayMs);
    }

    try {
      const screenshot = await capturePageScreenshot(page, normalizedUrl, options);
      result.screenshot_path = screenshot.screenshot_path;
      result.screenshot_url = screenshot.screenshot_url;
    } catch (error) {
      result.screenshot_error = error && error.message ? error.message : String(error);
    }

    result.final_url = page.url();
    result.title = await page.title().catch(() => access.title || '');
    result.blocked_by_interstitial = access.blocked;
    result.blocker_type = access.blockerType;
    result.access_reason = access.reason;
    result.page_text_sample = access.pageTextSample;
    result.frame_count = access.frameCount;

    Object.assign(result, await persistPageHtmlSnapshot(currentHtml || rawHtml, responseText || rawHtml, page.url() || normalizedUrl, options));
    result.candidates = candidates;
    result.best_candidate = bestCandidate;
    result.ugc_detected = ugcDetected;
  } catch (error) {
    result.error = error && error.message ? error.message : String(error);
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
  }

  return result;
}

function injectBaseHref(html, normalizedUrl) {
  if (!normalizedUrl || !/^https?:\/\//i.test(normalizedUrl)) {
    return html;
  }

  if (/<base\s/i.test(html)) {
    return html;
  }

  const baseTag = `<base href="${normalizedUrl.replace(/"/g, '&quot;')}">`;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`);
  }

  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html([^>]*)>/i, `<html$1><head>${baseTag}</head>`);
  }

  return `<head>${baseTag}</head>${html}`;
}

async function buildHtmlSnapshotDot(snapshot, options = {}) {
  const html = String(snapshot && snapshot.html ? snapshot.html : '');
  if (!html.trim()) {
    throw new Error('HTML snapshot is required');
  }

  const context = await createContext();
  const page = await context.newPage();
  const timeoutMs = Number(options.timeoutMs ?? 20000);
  const postLoadDelayMs = Number(options.postLoadDelayMs ?? 0);
  const maxResults = Math.max(1, Number(options.maxResults ?? 5));
  const maxCandidates = Math.max(maxResults, Number(options.maxCandidates ?? 25));
  const maxNodes = Math.max(200, Number(options.maxDotNodes ?? 1500));
  page.setDefaultNavigationTimeout(timeoutMs);
  page.setDefaultTimeout(timeoutMs);

  const normalizedUrl = snapshot.normalized_url || snapshot.final_url || snapshot.capture_url || 'about:blank';

  try {
    const htmlWithBase = injectBaseHref(html, normalizedUrl);
    await page.setContent(htmlWithBase, {
      waitUntil: 'domcontentloaded',
      timeout: timeoutMs,
    });
    await safeWait(page, 'networkidle', 2000);
    if (postLoadDelayMs > 0) {
      await page.waitForTimeout(postLoadDelayMs);
    }

    const graph = await page.evaluate(({ rawHtml, headers, graphOptions }) => {
      function esc(value) {
        return String(value || '')
          .replace(/\\/g, '\\\\')
          .replace(/"/g, '\\"')
          .replace(/\n/g, '\\n');
      }

      function isElement(node) {
        return !!node && node.nodeType === 1;
      }

      function normalizeSpace(value) {
        return String(value || '').replace(/\s+/g, ' ').trim();
      }

      function tagNameOf(el) {
        return el && el.tagName ? el.tagName.toLowerCase() : 'node';
      }

      const actionTags = new Set(['a', 'button', 'input', 'label', 'select', 'summary', 'textarea']);
      const mediaTags = new Set(['canvas', 'img', 'picture', 'svg', 'video']);
      const inlineTextTags = new Set(['a', 'abbr', 'b', 'cite', 'code', 'em', 'i', 'small', 'span', 'strong', 'time']);
      const nonContentTags = new Set(['body', 'defs', 'g', 'head', 'html', 'link', 'meta', 'path', 'script', 'style', 'title']);
      const metaTextPattern = /\b(\d+\s*(s|m|h|d|w|mo|yr)s?\b|ago|reply|replies|like|likes|share|shares|edited|pinned|follow|following)\b/i;

      function getShadowRoot(root) {
        if (!isElement(root) || !root.shadowRoot) return null;
        return root.shadowRoot;
      }

      function composedParentElement(node) {
        if (!node) return null;
        if (node.parentElement) return node.parentElement;
        if (node.getRootNode) {
          const root = node.getRootNode();
          if (root && root.host && root.host.nodeType === 1) {
            return root.host;
          }
        }
        return null;
      }

      function directChildren(root) {
        if (!root) return [];
        const seen = new Set();
        const children = [];
        function push(nodes) {
          Array.from(nodes || []).forEach((node) => {
            if (!isElement(node) || seen.has(node)) return;
            seen.add(node);
            children.push(node);
          });
        }

        if (root.nodeType === 9 && root.documentElement) {
          push([root.documentElement]);
        } else {
          push(root.children || []);
        }

        const shadowRoot = getShadowRoot(root);
        if (shadowRoot) {
          push(shadowRoot.children || []);
        }

        return children;
      }

      function allDescendants(root, includeRoot = false) {
        const descendants = [];
        const seen = new Set();
        const stack = includeRoot ? [root] : directChildren(root).slice().reverse();

        while (stack.length) {
          const node = stack.pop();
          if (!isElement(node) || seen.has(node)) continue;
          seen.add(node);
          descendants.push(node);
          directChildren(node)
            .slice()
            .reverse()
            .forEach((child) => stack.push(child));
        }

        return descendants;
      }

      function getNodeText(root) {
        if (!root) return '';
        const texts = [];
        const stack = [root];

        while (stack.length) {
          const node = stack.pop();
          if (!node) continue;
          if (node.nodeType === 3) {
            const value = normalizeSpace(node.nodeValue || '');
            if (value) texts.push(value);
            continue;
          }
          if (![1, 9, 11].includes(node.nodeType)) continue;

          const shadowRoot = getShadowRoot(node);
          if (shadowRoot) {
            Array.from(shadowRoot.childNodes || [])
              .slice()
              .reverse()
              .forEach((child) => stack.push(child));
          }

          Array.from(node.childNodes || [])
            .slice()
            .reverse()
            .forEach((child) => stack.push(child));
        }

        return normalizeSpace(texts.join(' '));
      }

      function matchesSelector(el, selector) {
        if (!isElement(el) || !selector) return false;
        try {
          return !!el.matches(selector);
        } catch (_) {
          return false;
        }
      }

      function deepQuerySelectorAll(root, selector, includeRoot = false) {
        if (!root || !selector) return [];
        const matches = [];
        const candidates = includeRoot ? [root].concat(allDescendants(root)) : allDescendants(root);
        candidates.forEach((candidate) => {
          if (matchesSelector(candidate, selector)) {
            matches.push(candidate);
          }
        });
        return matches;
      }

      function deepQuerySelector(root, selector, includeRoot = false) {
        const matches = deepQuerySelectorAll(root, selector, includeRoot);
        return matches.length ? matches[0] : null;
      }

      function getXPath(el) {
        if (!isElement(el)) return '';
        const parts = [];
        let node = el;
        while (node && node.nodeType === 1) {
          let index = 1;
          let sibling = node.previousElementSibling;
          while (sibling) {
            if (sibling.tagName === node.tagName) index += 1;
            sibling = sibling.previousElementSibling;
          }
          const tag = node.tagName.toLowerCase();
          parts.unshift(index > 1 ? `${tag}[${index}]` : tag);
          const parent = node.parentElement;
          if (parent) {
            node = parent;
            continue;
          }
          const root = node.getRootNode ? node.getRootNode() : null;
          if (root && root.host) {
            parts.unshift('#shadow-root');
            node = root.host;
            continue;
          }
          node = null;
        }
        return `/${parts.join('/')}`;
      }

      function getXPathStar(el) {
        const value = getXPath(el);
        if (!value) return '';
        if (/\[\d+\]$/.test(value)) {
          return value.replace(/\[\d+\]$/, '[*]');
        }
        return `${value}[*]`;
      }

      function structuralSignature(el) {
        if (!isElement(el)) return 'unknown[]';
        const tag = tagNameOf(el);
        const childTags = directChildren(el)
          .map((child) => tagNameOf(child))
          .filter(Boolean)
          .sort();
        return `${tag}[${childTags.join(',')}]`;
      }

      function resolveXPath(xpath) {
        if (!xpath) return null;
        try {
          return document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        } catch (_) {
          return null;
        }
      }

      function resolveCssPath(selector) {
        if (!selector) return null;
        const segments = String(selector)
          .split('>>')
          .map((segment) => segment.trim())
          .filter(Boolean)
          .map((segment) => segment.replace(/^css=/, '').trim())
          .filter(Boolean);
        if (!segments.length) return null;

        let contexts = [document];
        for (const segment of segments) {
          const nextContexts = [];
          const seen = new Set();

          contexts.forEach((context) => {
            const roots = [context];
            if (isElement(context) && context.shadowRoot) {
              roots.push(context.shadowRoot);
            }

            roots.forEach((root) => {
              if (!root || !root.querySelectorAll) return;
              let matches = [];
              try {
                matches = Array.from(root.querySelectorAll(segment));
              } catch (_) {
                matches = [];
              }
              matches.forEach((match) => {
                if (!isElement(match) || seen.has(match)) return;
                seen.add(match);
                nextContexts.push(match);
              });
            });
          });

          if (!nextContexts.length) {
            return null;
          }
          contexts = nextContexts;
        }

        return contexts.length ? contexts[0] : null;
      }

      function resolveCandidateRoot(candidate) {
        if (!candidate) return null;
        const cssResolved = resolveCssPath(candidate.css_path || '');
        if (isElement(cssResolved)) return cssResolved;
        const xpathResolved = resolveXPath(candidate.xpath || '');
        return isElement(xpathResolved) ? xpathResolved : null;
      }

      function shortLabel(el) {
        return tagNameOf(el);
      }

      function classifyNodeFeature(el, childElements, context = {}) {
        const tag = tagNameOf(el);
        if (nonContentTags.has(tag)) return null;
        const role = normalizeSpace(el.getAttribute ? el.getAttribute('role') : '').toLowerCase();
        const text = getNodeText(el);
        const childTags = childElements.map((child) => tagNameOf(child));
        const childCount = childTags.length;
        const mostlyInlineChildren = childCount === 0 || childTags.every((childTag) => inlineTextTags.has(childTag));
        const directAction = actionTags.has(tag) || role === 'button' || role === 'link' || role === 'textbox';
        const directMedia = mediaTags.has(tag);
        const hasActionChild = childTags.some((childTag) => actionTags.has(childTag));
        const hasMediaChild = childTags.some((childTag) => mediaTags.has(childTag));
        const metaLike = tag === 'time' || (mostlyInlineChildren && metaTextPattern.test(text));

        if (directAction || (hasActionChild && text.length > 0 && text.length <= 40 && childCount <= 4)) {
          return {
            kind: 'ACTION',
            fillcolor: '#fff1c7',
            color: '#ad7a00',
            penwidth: 1.8,
          };
        }

        if (directMedia || (hasMediaChild && text.length <= 24 && childCount <= 3)) {
          return {
            kind: 'MEDIA',
            fillcolor: '#dff3ff',
            color: '#2c6b94',
            penwidth: 1.7,
          };
        }

        if ((context.insideBlock && text.length >= 36 && mostlyInlineChildren) || (text.length >= 96 && mostlyInlineChildren)) {
          return {
            kind: 'COMMENT',
            fillcolor: '#ffdfe6',
            color: '#b4436c',
            penwidth: 2.2,
          };
        }

        if (metaLike || (mostlyInlineChildren && text.length > 0 && text.length <= 24)) {
          return {
            kind: 'META',
            fillcolor: '#f3edff',
            color: '#6d58a5',
            penwidth: 1.5,
          };
        }

        if (mostlyInlineChildren && text.length >= 24) {
          return {
            kind: 'TEXT',
            fillcolor: '#fff7db',
            color: '#9a7600',
            penwidth: 1.6,
          };
        }

        return null;
      }

      function dominantChildGroup(root) {
        const children = directChildren(root);
        if (children.length < 2) return null;

        const xpathGroups = new Map();
        children.forEach((child) => {
          const key = getXPathStar(child);
          if (!xpathGroups.has(key)) {
            xpathGroups.set(key, { strategy: 'xpath_star', key, elements: [] });
          }
          xpathGroups.get(key).elements.push(child);
        });

        const sigGroups = new Map();
        children.forEach((child) => {
          const key = structuralSignature(child);
          if (!sigGroups.has(key)) {
            sigGroups.set(key, { strategy: 'structural_signature', key, elements: [] });
          }
          sigGroups.get(key).elements.push(child);
        });

        const candidates = [];
        xpathGroups.forEach((group) => {
          if (group.elements.length >= 2) candidates.push(group);
        });
        sigGroups.forEach((group) => {
          if (group.elements.length >= 2) candidates.push(group);
        });

        if (!candidates.length) return null;

        candidates.sort((left, right) => (
          right.elements.length - left.elements.length
            || Number(left.strategy === 'xpath_star') - Number(right.strategy === 'xpath_star')
        ));
        return candidates[0];
      }

      const candidateRows = typeof extractCandidateRegions === 'function'
        ? extractCandidateRegions(rawHtml || document.documentElement.outerHTML, headers || {}, {
          maxResults: graphOptions.maxResults,
          maxCandidates: graphOptions.maxCandidates,
        })
        : [];

      const candidateRootMeta = new Map();
      const blockMeta = new Map();
      const candidateClusters = [];

      candidateRows.forEach((candidate, index) => {
        const root = resolveCandidateRoot(candidate);
        if (!isElement(root)) return;
        const rank = index + 1;
        const dominantGroup = dominantChildGroup(root);
        const blocks = dominantGroup ? dominantGroup.elements : [];
        const meta = {
          rank,
          score: Number(candidate.score || 0),
          detected: !!candidate.detected,
          unitCount: Number(candidate.unit_count || blocks.length || 0),
          confidence: String(candidate.confidence || ''),
          template: String(candidate.wildcard_xpath_template || (dominantGroup && dominantGroup.strategy === 'xpath_star' ? dominantGroup.key : '') || ''),
          xpath: String(candidate.xpath || ''),
        };
        candidateRootMeta.set(root, meta);
        blocks.forEach((block, blockIndex) => {
          if (!blockMeta.has(block)) {
            blockMeta.set(block, {
              rank,
              index: blockIndex + 1,
            });
          }
        });
        candidateClusters.push({ root, meta });
      });

      const rootEl = document.body || document.documentElement;
      const idMap = new WeakMap();
      let nextId = 1;
      const getId = (el) => {
        let id = idMap.get(el);
        if (!id) {
          id = `n${nextId++}`;
          idMap.set(el, id);
        }
        return id;
      };

      function ancestorDistance(el, markedMap, maxDepth) {
        let depth = 0;
        let node = el;
        while (node && node.nodeType === 1 && depth <= maxDepth) {
          if (markedMap.has(node)) return depth;
          node = composedParentElement(node);
          depth += 1;
        }
        return -1;
      }

      const nodes = [];
      const edges = [];
      const seen = new Set();
      const stack = [rootEl];
      let truncated = false;

      while (stack.length) {
        const el = stack.pop();
        if (!isElement(el)) continue;
        if (seen.has(el)) continue;
        if (seen.size >= graphOptions.maxNodes) {
          truncated = true;
          break;
        }
        seen.add(el);

        const id = getId(el);
        const listMeta = candidateRootMeta.get(el);
        const repeatedBlock = blockMeta.get(el);
        const children = directChildren(el);
        const insideBlock = ancestorDistance(composedParentElement(el), blockMeta, 6) >= 0;
        const insideList = ancestorDistance(composedParentElement(el), candidateRootMeta, 8) >= 0;
        const feature = insideBlock || insideList
          ? classifyNodeFeature(el, children, { insideBlock, insideList })
          : null;
        let label = shortLabel(el);
        let fillcolor = 'white';
        let color = 'gray55';
        let penwidth = 1.1;

        if (listMeta) {
          fillcolor = listMeta.detected ? '#d8f3e5' : '#fff0bf';
          color = listMeta.detected ? '#1a6b50' : '#9b6a00';
          penwidth = 3.2;
        } else if (repeatedBlock) {
          fillcolor = '#e6efff';
          color = '#2f5ea8';
          penwidth = 2.1;
        } else if (feature) {
          fillcolor = feature.fillcolor;
          color = feature.color;
          penwidth = feature.penwidth;
        }

        nodes.push({ id, label, fillcolor, color, penwidth });

        for (let i = children.length - 1; i >= 0; i -= 1) {
          const child = children[i];
          edges.push([id, getId(child)]);
          stack.push(child);
        }
      }

      const graphTitleParts = [];
      const title = normalizeSpace(document.title || '');
      if (title) {
        graphTitleParts.push(title);
      } else {
        graphTitleParts.push('Comment DOM review graph');
      }
      graphTitleParts.push(`lists=${candidateClusters.length}`);
      graphTitleParts.push(`blocks=${blockMeta.size}`);
      if (truncated) {
        graphTitleParts.push(`truncated_at=${graphOptions.maxNodes}`);
      }

      let dot = '';
      dot += 'digraph CommentDomReview {\n';
      dot += `  graph [rankdir=TB, fontsize=12, labelloc="t", label="${esc(graphTitleParts.join(' | '))}"];\n`;
      dot += '  node [shape=box, style="rounded,filled", fontname="Helvetica", fontsize=9];\n';
      dot += '  edge [color="gray72"];\n\n';

      candidateClusters.forEach((cluster, index) => {
        const clusterNodeIds = [];
        const clusterStack = [cluster.root];
        const clusterSeen = new Set();
        while (clusterStack.length) {
          const el = clusterStack.pop();
          if (!isElement(el) || clusterSeen.has(el) || !seen.has(el)) continue;
          clusterSeen.add(el);
          clusterNodeIds.push(getId(el));
          const children = directChildren(el);
          for (let i = children.length - 1; i >= 0; i -= 1) {
            clusterStack.push(children[i]);
          }
        }
        if (!clusterNodeIds.length) return;
        const templateText = cluster.meta.template ? ` | template=${cluster.meta.template}` : '';
        dot += `  subgraph cluster_${index + 1} {\n`;
        dot += `    label="${esc(`LIST #${cluster.meta.rank} | score=${cluster.meta.score} | units=${cluster.meta.unitCount}${templateText}`)}";\n`;
        dot += '    color="gray45";\n';
        dot += '    penwidth=1.8;\n';
        dot += '    style="rounded";\n';
        clusterNodeIds.forEach((nodeId) => {
          dot += `    ${nodeId};\n`;
        });
        dot += '  }\n\n';
      });

      nodes.forEach((node) => {
        dot += `  ${node.id} [label="${esc(node.label)}", fillcolor="${node.fillcolor}", color="${node.color}", penwidth=${node.penwidth}];\n`;
      });
      dot += '\n';
      const nodeIds = new Set(nodes.map((node) => node.id));
      let edgeCount = 0;
      edges.forEach(([from, to]) => {
        if (!nodeIds.has(from) || !nodeIds.has(to)) return;
        dot += `  ${from} -> ${to};\n`;
        edgeCount += 1;
      });
      dot += '}\n';

      return {
        dot,
        title: title || 'Comment DOM review graph',
        candidate_count: candidateClusters.length,
        block_count: blockMeta.size,
        node_count: nodes.length,
        edge_count: edgeCount,
        truncated,
      };
    }, {
      rawHtml: html,
      headers: snapshot.response_headers || {},
      graphOptions: {
        maxResults,
        maxCandidates,
        maxNodes,
      },
    });

    let hostSegment = 'snapshot';
    try {
      const url = new URL(normalizedUrl);
      hostSegment = sanitizeSegment(url.hostname || 'snapshot', 'snapshot');
    } catch (_) {
      hostSegment = 'snapshot';
    }

    return {
      ...graph,
      filename: `${hostSegment}-${sanitizeSegment(options.rowNumber || options.itemId || 'manual', 'manual')}.dot`,
    };
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
  }
}

async function analyzeHtmlSnapshot(snapshot, options = {}) {
  const html = String(snapshot && snapshot.html ? snapshot.html : '');
  const rawHtml = String(snapshot && snapshot.raw_html ? snapshot.raw_html : '');
  if (!html.trim()) {
    throw new Error('HTML snapshot is required');
  }

  const context = await createContext();
  const page = await context.newPage();
  const timeoutMs = Number(options.timeoutMs ?? 20000);
  const postLoadDelayMs = Number(options.postLoadDelayMs ?? 0);
  page.setDefaultNavigationTimeout(timeoutMs);
  page.setDefaultTimeout(timeoutMs);

  const normalizedUrl = snapshot.normalized_url || snapshot.final_url || snapshot.capture_url || 'about:blank';
  const result = {
    input_url: normalizedUrl,
    normalized_url: normalizedUrl,
    final_url: snapshot.final_url || snapshot.capture_url || normalizedUrl,
    title: snapshot.title || '',
    ugc_detected: false,
    best_candidate: null,
    candidates: [],
    error: '',
    blocked_by_interstitial: false,
    blocker_type: '',
    access_reason: '',
    page_text_sample: '',
    frame_count: 0,
    screenshot_path: '',
    screenshot_url: '',
    screenshot_error: '',
    manual_uploaded_screenshot_path: snapshot.manual_uploaded_screenshot_path || '',
    manual_uploaded_screenshot_url: snapshot.manual_uploaded_screenshot_url || '',
    analysis_source: 'manual_snapshot',
    manual_capture_required: false,
    manual_capture_reason: '',
    manual_html_path: snapshot.manual_html_path || '',
    manual_html_url: snapshot.manual_html_url || '',
    manual_capture_url: snapshot.capture_url || snapshot.final_url || normalizedUrl,
    manual_capture_title: snapshot.title || '',
    manual_capture_notes: snapshot.notes || '',
  };

  try {
    const htmlWithBase = injectBaseHref(html, normalizedUrl);
    await page.setContent(htmlWithBase, {
      waitUntil: 'domcontentloaded',
      timeout: timeoutMs,
    });
    await autoScroll(page, {
      steps: 4,
      stepDelayMs: 350,
      bottomPauseMs: 600,
      stabilizationPasses: 1,
      returnToTop: false,
    });
    await safeWait(page, 'networkidle', 2000);
    if (postLoadDelayMs > 0) {
      await page.waitForTimeout(postLoadDelayMs);
    }

    if (options.captureScreenshots) {
      try {
        const screenshot = await capturePageScreenshot(page, normalizedUrl, {
          ...options,
          jobId: options.jobId || 'manual',
          itemId: options.itemId || crypto.randomUUID(),
          rowNumber: options.rowNumber || 'manual',
        });
        result.screenshot_path = screenshot.screenshot_path;
        result.screenshot_url = screenshot.screenshot_url;
      } catch (error) {
        result.screenshot_error = error && error.message ? error.message : String(error);
      }
    }

    const access = await detectPageAccess(page);
    result.final_url = snapshot.final_url || snapshot.capture_url || normalizedUrl;
    result.title = snapshot.title || await page.title().catch(() => access.title || '');
    result.blocked_by_interstitial = access.blocked;
    result.blocker_type = access.blockerType;
    result.access_reason = access.reason;
    result.page_text_sample = access.pageTextSample;
    result.frame_count = access.frameCount;

    const candidateSourceHtml = rawHtml.trim() || html || await page.content().catch(() => '');
    const candidates = await collectCandidatesFromPage(page, candidateSourceHtml, snapshot.response_headers || {}, options);
    result.candidates = candidates;
    result.best_candidate = candidates[0] || null;
    result.ugc_detected = !!(result.best_candidate && result.best_candidate.detected);
  } catch (error) {
    result.error = error && error.message ? error.message : String(error);
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
  }

  return result;
}

async function hydrateCandidateMarkupFromSnapshot(snapshot, candidate, options = {}) {
  const html = String(snapshot && (snapshot.raw_html || snapshot.html) ? (snapshot.raw_html || snapshot.html) : '');
  if (!html.trim()) {
    throw new Error('HTML snapshot is required');
  }
  if (candidate && candidate.frame_is_main === false) {
    throw new Error('Stored HTML snapshots do not preserve iframe documents for this candidate');
  }

  const context = await createContext();
  const page = await context.newPage();
  const timeoutMs = Number(options.timeoutMs ?? 20000);
  page.setDefaultNavigationTimeout(timeoutMs);
  page.setDefaultTimeout(timeoutMs);

  const normalizedUrl = snapshot.normalized_url || snapshot.final_url || snapshot.capture_url || 'about:blank';

  try {
    const htmlWithBase = injectBaseHref(html, normalizedUrl);
    await page.setContent(htmlWithBase, {
      waitUntil: 'domcontentloaded',
      timeout: timeoutMs,
    });
    await safeWait(page, 'load', 2000);

    const handle = await resolveCandidateElementHandle(page.mainFrame(), candidate);
    if (!handle) {
      throw new Error('Candidate element could not be resolved from the stored snapshot');
    }

    try {
      return await extractCandidateMarkup(handle, options);
    } finally {
      await handle.dispose().catch(() => {});
    }
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
  }
}

async function closeBrowser() {
  if (!browserPromise) return;
  const browser = await browserPromise;
  browserPromise = null;
  await browser.close().catch(() => {});
}

module.exports = {
  scanUrl,
  analyzeHtmlSnapshot,
  hydrateCandidateMarkupFromSnapshot,
  buildHtmlSnapshotDot,
  deriveManualCaptureState,
  closeBrowser,
};
