# DOM Keeper candidate classifier — `POST /api/domkeeper/classify`

A relay endpoint used by the **DOM Keeper browser extension** (separate repo).
The extension builds an inert mirror of each page and a trained random forest
scores candidate regions for "is this user-generated content". That verdict
reads structure only. This endpoint adds a second opinion: it hands the
candidate metadata **plus the visible-text sample** to configured server-side
LLM providers and asks which regions are actually places where end users post
comments — the ones worth hardening against injection.

It has **no access to any labelled data or job**. It is a stateless prompt
relay. It is intentionally not behind the session/DB auth the rest of the API
uses (the extension can't do an email/password login); it uses a single
static token instead.

## Files

| file | role |
|------|------|
| `src/domkeeper/classifyService.js` | pure functions: `compact` → `buildRequest` → provider calls → merge answers back onto each `seq`. No Express, no DB. |
| `src/domkeeper/routes.js` | `createDomKeeperRouter({ config })` — the Express router (own body parser, static-token auth, per-IP rate limit). |
| `src/api/server.js` | mounts it: `app.use('/api/domkeeper', createDomKeeperRouter({ config }))`, **before** the global `express.json({ limit: '1mb' })` so the larger candidate payload parses. |
| `src/shared/config.js` | `config.domKeeper` block, all from env. |

## Enable it

Add a caller token and at least one provider key to `.env.digitalocean` (the
`api` service's `env_file`):

```
DOMKEEPER_CLASSIFY_TOKEN=<long random string>   # what the extension sends as Bearer
ANTHROPIC_API_KEY=<your Claude API key>          # server-side only
OPENAI_API_KEY=<your OpenAI API key>             # optional fallback/race provider
```

Without `DOMKEEPER_CLASSIFY_TOKEN` the route returns `503` (disabled).
Without at least one provider key, non-empty classifications return `503`.
If both `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` are present, the endpoint sends
both requests concurrently and returns the first valid provider response. The
slower request is cancelled client-side after a winner is chosen.

Optional: `DOMKEEPER_ANTHROPIC_MODEL` (default `claude-sonnet-5`),
`DOMKEEPER_OPENAI_MODEL` (default `gpt-4o-mini`),
`DOMKEEPER_PROVIDER_MODE` (`race`, `anthropic`, or `openai`; default `race`),
`DOMKEEPER_ANTHROPIC_MODELS` / `DOMKEEPER_OPENAI_MODELS` (comma-separated
allowlists the extension may choose from),
`DOMKEEPER_CLASSIFY_MAX_CANDIDATES` (40), `DOMKEEPER_CLASSIFY_RATE_MAX` (20/min/IP).

### Deploy (DigitalOcean droplet, docker-compose)

`docker-compose.digitalocean.yml` bind-mounts `./src` into the `api`
container, so no image rebuild is needed for this code — pull and recreate:

```bash
cd <repo>
git pull                                   # brings src/domkeeper/ + the 4 edits
nano .env.digitalocean                      # add the two vars above
docker compose -f docker-compose.digitalocean.yml up -d api
curl -s http://<host>:3000/api/domkeeper/health
# → {"ok":true,"service":"domkeeper-classify","enabled":true,"has_api_key":true,...}
```

`up -d` (not `restart`) is required so the container re-reads `env_file`.
No new npm dependency — the route uses `express`, `crypto`, and global
`fetch` (Node ≥ 18).

## Routes

### `GET /api/domkeeper/health`
```json
{ "ok": true, "service": "domkeeper-classify", "enabled": true,
  "has_api_key": true, "has_anthropic_key": true, "has_openai_key": true,
  "provider_mode": "race", "provider_options": ["race", "anthropic", "openai"],
  "provider_aliases": { "claude": "anthropic" },
  "models": { "anthropic": "claude-sonnet-5", "openai": "gpt-4o-mini" },
  "model_options": { "anthropic": ["claude-sonnet-5"], "openai": ["gpt-4o-mini"] },
  "model": "claude-sonnet-5", "max_candidates": 40 }
```

Public deployed check:

```bash
curl -s https://api.xsscommentdetection.me/api/domkeeper/health
```

### `POST /api/domkeeper/classify`

Header: `Authorization: Bearer <DOMKEEPER_CLASSIFY_TOKEN>`
Body: the extension's `window.__DOM_KEEPER_CANDIDATES_JSON__()` output
(`{ url, title, model, candidates: [ { seq, css, sample_text, verdict, heuristic, features }, … ] }`).

Optional extension-selected provider/model fields:

```json
{
  "provider_mode": "openai",
  "models": { "openai": "gpt-4o-mini" }
}
```

`provider_mode` may be `race`, `anthropic`, `claude`, or `openai`; `provider`
is accepted as a backward-friendly alias. Requested models must be present in
the server's health `model_options` allowlist.

Response:
```jsonc
{
  "model": "claude-sonnet-5",
  "provider": "anthropic",
  "provider_mode": "race",
  "providers_attempted": ["anthropic", "openai"],
  "provider_errors": [],
  "page": { "url": "...", "title": "...", "total_candidates": 25 },
  "assessments": [
    { "seq": 12086, "recommended_action": "purify", "will_host_user_comments": true,
      "likelihood": 0.88, "ugc_kind": "social_feed", "reason": "...",
      "local_model": { "probability": 0.665, "band": "ugc" }, "combined_score": 0.88 }
    // one per candidate, purify/monitor first
  ],
  "purify_targets": [ { "seq": 12086, "css": "...", "likelihood": 0.88, "reason": "..." } ],
  "monitor_targets": [ 7280 ],
  "page_summary": "…",
  "unanswered_seqs": [],
  "usage": { "input_tokens": 24500, "output_tokens": 900 }
}
```

## What is Sent to Providers

Per candidate: the 81 features from `src/modeling/common/featureCatalog.js`, a
~600-char text sample, DOM Keeper's heuristic signals, the local model's
probability. Plus page URL/title. **Not** cookies, credentials, full page
HTML, or the extension's ~250-key raw feature dict. See `compact()` in
`classifyService.js`.

## Security

- `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`: env only, never logged, never in a response.
- caller auth: `DOMKEEPER_CLASSIFY_TOKEN`, constant-time compared.
- body cap 4 MB, candidate cap 40, per-IP fixed-window rate limit.
- request bodies are not logged (they contain sampled page text).
