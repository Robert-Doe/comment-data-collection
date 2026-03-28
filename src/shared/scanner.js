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

async function dismissConsentPrompts(page) {
  await page.evaluate(() => {
    const pattern = /\b(accept|agree|allow all|got it|continue)\b/i;
    const candidates = Array.from(document.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"]'));
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
    const pattern = /\b(show comments|view comments|load comments|load more|show more|more comments|more replies|more reviews|show replies|view replies|replies|comments)\b/i;
    const candidates = Array.from(document.querySelectorAll('button, [role="button"], summary, details summary'));
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

async function autoScroll(page) {
  await page.evaluate(async () => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const steps = 5;
    const maxHeight = Math.max(document.body ? document.body.scrollHeight : 0, document.documentElement ? document.documentElement.scrollHeight : 0);
    for (let i = 1; i <= steps; i += 1) {
      window.scrollTo(0, Math.round((maxHeight * i) / steps));
      await sleep(500);
    }
    window.scrollTo(0, 0);
  }).catch(() => {});
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

async function captureCandidateScreenshot(page, frame, candidate, options = {}) {
  const empty = {
    candidate_screenshot_path: '',
    candidate_screenshot_url: '',
    candidate_screenshot_error: '',
  };

  if (!options.captureScreenshots || !options.artifactRoot || !page || !frame || !candidate) {
    return empty;
  }

  try {
    const handle = await resolveCandidateElementHandle(frame, candidate);
    if (!handle) {
      return {
        ...empty,
        candidate_screenshot_error: 'Candidate element could not be resolved from xpath/css path',
      };
    }

    const box = await handle.boundingBox();
    await handle.dispose().catch(() => {});
    if (!box || box.width <= 1 || box.height <= 1) {
      return {
        ...empty,
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
    await page.screenshot({
      path: absolutePath,
      clip: {
        x: Math.max(0, box.x),
        y: Math.max(0, box.y),
        width: Math.max(1, box.width),
        height: Math.max(1, box.height),
      },
      animations: 'disabled',
    });

    return {
      candidate_screenshot_path: absolutePath,
      candidate_screenshot_url: buildArtifactUrl(relativePath, options),
      candidate_screenshot_error: '',
    };
  } catch (error) {
    return {
      ...empty,
      candidate_screenshot_error: error && error.message ? error.message : String(error),
    };
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

    if (index < reviewArtifactLimit && frame) {
      Object.assign(candidate, await captureCandidateScreenshot(page, frame, candidate, options));
    } else {
      candidate.candidate_screenshot_path = '';
      candidate.candidate_screenshot_url = '';
      candidate.candidate_screenshot_error = index >= reviewArtifactLimit
        ? 'Candidate screenshot was skipped because only the top review candidates get screenshot artifacts.'
        : 'Candidate screenshot could not be captured because its frame was unavailable.';
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
    function isVisible(el) {
      if (!el) return false;
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style && style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    }

    const text = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
    const title = (document.title || '').trim();
    const combined = `${title} ${text}`;
    const captchaIframes = Array.from(document.querySelectorAll('iframe[src*="captcha"], iframe[src*="turnstile"], iframe[src*="challenge"], iframe[src*="recaptcha"]'));
    const hasCloudflareText = /verify to continue|checking if the site connection is secure|review the security of your connection before proceeding|attention required/i.test(combined);
    const hasCaptchaText = /captcha|human verification|security check|are you a human|unusual traffic/i.test(combined);
    const hasLoginWallText = /\b(sign in|log in|join|create account|start trial|subscribe)\b/i.test(combined)
      && /\b(to continue|to view|to watch|to comment|to reply|to proceed)\b/i.test(combined);
    const hasTurnstile = !!document.querySelector('[id^="cf-chl-widget"], .cf-turnstile, [name="cf-turnstile-response"]');
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
  const timeoutMs = options.timeoutMs || 45000;
  const postLoadDelayMs = options.postLoadDelayMs || 3000;
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
  };

  try {
    const response = await page.goto(normalizedUrl, {
      waitUntil: 'domcontentloaded',
      timeout: timeoutMs,
    });

    await safeWait(page, 'networkidle', 7000);
    await dismissConsentPrompts(page);
    await expandPotentialUgc(page);
    await autoScroll(page);
    await safeWait(page, 'networkidle', 4000);
    if (postLoadDelayMs > 0) {
      await page.waitForTimeout(postLoadDelayMs);
    }

    try {
      const screenshot = await capturePageScreenshot(page, normalizedUrl, options);
      result.screenshot_path = screenshot.screenshot_path;
      result.screenshot_url = screenshot.screenshot_url;
    } catch (error) {
      result.screenshot_error = error && error.message ? error.message : String(error);
    }

    const access = await detectPageAccess(page);
    result.final_url = page.url();
    result.title = await page.title().catch(() => access.title || '');
    result.blocked_by_interstitial = access.blocked;
    result.blocker_type = access.blockerType;
    result.access_reason = access.reason;
    result.page_text_sample = access.pageTextSample;
    result.frame_count = access.frameCount;

    const responseText = response ? await response.text().catch(() => '') : '';
    const currentHtml = await page.content().catch(() => '');
    const rawHtml = currentHtml || responseText;
    Object.assign(result, await persistPageHtmlSnapshot(currentHtml || rawHtml, responseText || rawHtml, page.url() || normalizedUrl, options));
    const responseHeaders = response ? response.headers() : {};
    const candidates = await collectCandidatesFromPage(page, rawHtml, responseHeaders, options);
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
  const timeoutMs = options.timeoutMs || 20000;
  const postLoadDelayMs = options.postLoadDelayMs || 0;
  const maxResults = Math.max(1, Number(options.maxResults || 5));
  const maxCandidates = Math.max(maxResults, Number(options.maxCandidates || 25));
  const maxNodes = Math.max(200, Number(options.maxDotNodes || 1500));
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
          node = node.parentElement;
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
        const childTags = Array.from(el.children || [])
          .filter(isElement)
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

      function shortLabel(el) {
        return tagNameOf(el);
      }

      function classifyNodeFeature(el, childElements, context = {}) {
        const tag = tagNameOf(el);
        if (nonContentTags.has(tag)) return null;
        const role = normalizeSpace(el.getAttribute ? el.getAttribute('role') : '').toLowerCase();
        const text = normalizeSpace(el.textContent || '');
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
        const children = Array.from(root && root.children ? root.children : []).filter(isElement);
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
        const root = resolveXPath(candidate.xpath || '');
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
          node = node.parentElement;
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
        const children = Array.from(el.children || []).filter(isElement);
        const insideBlock = ancestorDistance(el.parentElement, blockMeta, 6) >= 0;
        const insideList = ancestorDistance(el.parentElement, candidateRootMeta, 8) >= 0;
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
          const children = Array.from(el.children || []).filter(isElement);
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
  if (!html.trim()) {
    throw new Error('HTML snapshot is required');
  }

  const context = await createContext();
  const page = await context.newPage();
  const timeoutMs = options.timeoutMs || 20000;
  const postLoadDelayMs = options.postLoadDelayMs || 0;
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
    screenshot_path: snapshot.screenshot_path || '',
    screenshot_url: snapshot.screenshot_url || '',
    screenshot_error: '',
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
    await safeWait(page, 'networkidle', 2000);
    if (postLoadDelayMs > 0) {
      await page.waitForTimeout(postLoadDelayMs);
    }

    if (!result.screenshot_path && !result.screenshot_url && options.captureScreenshots) {
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

    const rawHtml = html || await page.content().catch(() => '');
    const candidates = await collectCandidatesFromPage(page, rawHtml, snapshot.response_headers || {}, options);
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

async function closeBrowser() {
  if (!browserPromise) return;
  const browser = await browserPromise;
  browserPromise = null;
  await browser.close().catch(() => {});
}

module.exports = {
  scanUrl,
  analyzeHtmlSnapshot,
  buildHtmlSnapshotDot,
  deriveManualCaptureState,
  closeBrowser,
};
