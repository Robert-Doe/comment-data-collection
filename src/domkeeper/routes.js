'use strict';

/**
 * ============================================================================
 *  src/domkeeper/routes.js — the /api/domkeeper router
 * ============================================================================
 *
 * Mounted in src/api/server.js as:
 *
 *     app.use('/api/domkeeper', createDomKeeperRouter({ config }));
 *
 * placed BEFORE the global `express.json({ limit: '1mb' })` so this router's
 * own, larger body parser wins for the candidate payload (a full page's
 * candidate export runs a few hundred KB to a few MB).
 *
 * Routes:
 *   GET  /api/domkeeper/health    liveness + config summary (no secrets)
 *   POST /api/domkeeper/classify  body = __DOM_KEEPER_CANDIDATES_JSON__()
 *                                 header: Authorization: Bearer <DOMKEEPER_CLASSIFY_TOKEN>
 *
 * Auth here is a single static token (config.domKeeper.classifyToken), NOT the
 * session/DB auth the rest of the API uses — the browser extension can't do an
 * email/password login flow, and this endpoint has no access to any labelled
 * data, only the relay. If the token is unset the route is disabled (503).
 *
 * The Anthropic API key lives only in config.domKeeper.anthropicApiKey
 * (env ANTHROPIC_API_KEY) — never sent downstream, never logged.
 */

const crypto = require('crypto');
const express = require('express');

const { classifyCandidates } = require('./classifyService');

function constantTimeEqual(a, b) {
  const bufA = Buffer.from(String(a || ''));
  const bufB = Buffer.from(String(b || ''));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function createDomKeeperRouter({ config } = {}) {
  const dk = (config && config.domKeeper) || {};
  const router = express.Router();

  const maxBodyBytes = Number(dk.maxBodyBytes) || 4 * 1024 * 1024;
  router.use(express.json({ limit: maxBodyBytes }));

  // ── naive fixed-window rate limit, per client IP ──────────────────────
  const hits = new Map(); // ip -> { count, resetAt }
  const rateWindowMs = Number(dk.rateWindowMs) || 60000;
  const rateMax = Number(dk.rateMax) || 20;
  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [ip, rec] of hits) if (now > rec.resetAt) hits.delete(ip);
  }, rateWindowMs);
  if (typeof sweeper.unref === 'function') sweeper.unref();

  function rateLimited(ip) {
    const now = Date.now();
    let rec = hits.get(ip);
    if (!rec || now > rec.resetAt) {
      rec = { count: 0, resetAt: now + rateWindowMs };
      hits.set(ip, rec);
    }
    rec.count += 1;
    return rec.count > rateMax;
  }

  function tokenOk(req) {
    if (!dk.classifyToken) return false; // route disabled when unconfigured
    const hdr = req.headers.authorization || '';
    const got = hdr.startsWith('Bearer ') ? hdr.slice(7).trim() : '';
    return Boolean(got) && constantTimeEqual(got, dk.classifyToken);
  }

  router.get('/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'domkeeper-classify',
      enabled: Boolean(dk.classifyToken),
      has_api_key: Boolean(dk.anthropicApiKey || dk.openaiApiKey),
      has_anthropic_key: Boolean(dk.anthropicApiKey),
      has_openai_key: Boolean(dk.openaiApiKey),
      provider_mode: 'race',
      models: {
        anthropic: dk.anthropicModel || dk.model || 'claude-sonnet-5',
        openai: dk.openaiModel || 'gpt-4o-mini',
      },
      model: dk.anthropicModel || dk.model || dk.openaiModel || 'claude-sonnet-5',
      max_candidates: Number(dk.maxCandidates) || 40,
    });
  });

  router.post('/classify', async (req, res) => {
    const ip = (String(req.headers['x-forwarded-for'] || '').split(',')[0].trim())
      || req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';

    if (!dk.classifyToken) {
      return res.status(503).json({ error: 'DOM Keeper classifier is not enabled on this server (no DOMKEEPER_CLASSIFY_TOKEN).' });
    }
    if (!tokenOk(req)) {
      return res.status(401).json({ error: 'Missing or invalid bearer token.' });
    }
    if (rateLimited(ip)) {
      return res.status(429).json({ error: 'Rate limit exceeded, slow down.' });
    }

    const payload = req.body;
    const count = payload && Array.isArray(payload.candidates) ? payload.candidates.length : '?';
    const t0 = Date.now();
    try {
      const result = await classifyCandidates(payload, {
        anthropicApiKey: dk.anthropicApiKey,
        anthropicBaseUrl: dk.anthropicBaseUrl || 'https://api.anthropic.com',
        anthropicVersion: dk.anthropicVersion || '2023-06-01',
        anthropicModel: dk.anthropicModel || dk.model || 'claude-sonnet-5',
        openaiApiKey: dk.openaiApiKey,
        openaiBaseUrl: dk.openaiBaseUrl || 'https://api.openai.com',
        openaiOrganization: dk.openaiOrganization,
        openaiProject: dk.openaiProject,
        openaiModel: dk.openaiModel || 'gpt-4o-mini',
        maxOutputTokens: Number(dk.maxOutputTokens) || 4096,
        upstreamTimeoutMs: Number(dk.upstreamTimeoutMs) || 90000,
        maxCandidates: Number(dk.maxCandidates) || 40,
        sampleTextChars: Number(dk.sampleTextChars) || 600,
      });
      console.log(
        `[domkeeper/classify] ${ip} candidates=${count} → ${result.assessments.length} assessed, ` +
        `purify=${result.purify_targets.length}, ${Date.now() - t0}ms, ` +
        `provider=${result.provider || '?'}, ` +
        `tokens in/out=${(result.usage && result.usage.input_tokens) || '?'}/${(result.usage && result.usage.output_tokens) || '?'}`,
      );
      res.json(result);
    } catch (err) {
      const status = err.statusCode || 500;
      console.error(`[domkeeper/classify] ${ip} error ${status}: ${err.message}`);
      res.status(status).json({
        error: err.message || 'Internal error.',
        ...(err.providerErrors ? { provider_errors: err.providerErrors } : {}),
        // Only leak upstream error detail when explicitly in development.
        ...(process.env.NODE_ENV === 'development' && err.upstream ? { upstream: err.upstream } : {}),
      });
    }
  });

  return router;
}

module.exports = { createDomKeeperRouter };
