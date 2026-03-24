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

async function capturePageScreenshot(page, normalizedUrl, options = {}) {
  if (!options.captureScreenshots || !options.artifactRoot) {
    return {
      screenshot_path: '',
      screenshot_url: '',
    };
  }

  const urlHash = crypto.createHash('sha1').update(String(normalizedUrl || page.url() || '')).digest('hex').slice(0, 12);
  const jobSegment = sanitizeSegment(options.jobId || 'adhoc', 'adhoc');
  const rowSegment = sanitizeSegment(options.rowNumber || options.itemId || urlHash, urlHash);
  const itemSegment = sanitizeSegment(options.itemId || urlHash, urlHash);
  const relativePath = path.join('screenshots', jobSegment, `${rowSegment}-${itemSegment}.png`);
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

async function detectPageAccess(page) {
  const frameUrls = page.frames().map((frame) => frame.url());
  const pageInfo = await page.evaluate(() => {
    const text = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
    const title = (document.title || '').trim();
    const combined = `${title} ${text}`;
    const hasCloudflareText = /verify to continue|checking if the site connection is secure|review the security of your connection before proceeding|attention required/i.test(combined);
    const hasCaptchaText = /captcha|human verification|security check|are you a human|unusual traffic/i.test(combined);
    const hasLoginWallText = /\b(sign in|log in|join|create account|start trial|subscribe)\b/i.test(combined)
      && /\b(to continue|to view|to watch|to comment|to reply|to proceed)\b/i.test(combined);
    const hasTurnstile = !!document.querySelector('[id^="cf-chl-widget"], .cf-turnstile, [name="cf-turnstile-response"]');
    const hasCaptchaIframe = !!document.querySelector('iframe[src*="captcha"], iframe[src*="turnstile"], iframe[src*="challenge"]');

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
  const hasCaptchaFrame = frameUrls.some((url) => /captcha|turnstile|challenge/i.test(url));

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

    if (access.blocked) {
      return result;
    }

    const responseText = response ? await response.text().catch(() => '') : '';
    const currentHtml = await page.content().catch(() => '');
    const rawHtml = currentHtml || responseText;
    const responseHeaders = response ? response.headers() : {};
    const maxResults = options.maxResults || 5;
    const candidateBuckets = [];

    candidateBuckets.push(...await extractCandidatesFromFrame(page.mainFrame(), rawHtml, responseHeaders, options));

    const childFrames = page.frames()
      .filter((frame) => frame !== page.mainFrame())
      .filter((frame) => frame.url() && !/challenges\.cloudflare\.com/i.test(frame.url()));

    for (const frame of childFrames) {
      const frameHtml = await frame.content().catch(() => '');
      const frameCandidates = await extractCandidatesFromFrame(frame, frameHtml, {}, options);
      candidateBuckets.push(...frameCandidates);
    }

    const candidates = dedupeCandidates(sortCandidates(candidateBuckets), maxResults);
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
  closeBrowser,
};
