# Fix: API Base URL Runtime Injection

## Problem

The Model Lab overview showed no statistics. All API calls (e.g. `/api/modeling/overview`, `/api/jobs`) silently returned nothing because the frontend JavaScript was sending requests to the wrong host.

### Root cause

The app uses two separate domains:
- **UI**: `xsscommentdetection.me` (served by nginx in the `ui` container)
- **API**: `api.xsscommentdetection.me` (served by the `api` container)

The frontend JavaScript constructs all API URLs using `window.__APP_CONFIG__.apiBaseUrl`. When that value is empty, requests go to the UI's own domain (nginx), which has no API routes and returns 404 for every call.

`apiBaseUrl` was empty because:
1. `docker-compose.digitalocean.yml` passed `API_BASE_URL` as a Docker build arg via compose variable substitution: `${API_BASE_URL}`
2. Compose variable substitution reads from a `.env` file, but there is **no `.env` file** on the server — only `.env.digitalocean`
3. So `${API_BASE_URL}` resolved to an empty string, the build arg was empty, and `config.js` was baked with `"apiBaseUrl": ""`

## Fix

Move `config.js` generation from **build time** to **container start time**.

### Changes

**`scripts/docker-entrypoint-ui.sh`** (new file)  
A shell script that runs automatically before nginx starts (placed in `/docker-entrypoint.d/`). It reads `$API_BASE_URL` from the container environment and writes `config.js` with the correct URL.

**`Dockerfile.ui`**  
- Removed: `ARG API_BASE_URL` and `ENV API_BASE_URL` (build-time baking)
- Added: `COPY scripts/docker-entrypoint-ui.sh /docker-entrypoint.d/40-write-config.sh` so nginx's base image entrypoint runs it before starting

**`docker-compose.digitalocean.yml`**  
- Removed: `args: API_BASE_URL: ${API_BASE_URL}` from the `ui` build section
- Added: `env_file: - .env.digitalocean` to the `ui` service so the runtime container gets `API_BASE_URL` from the correct env file (same as `api` and `worker`)

## Result

`config.js` now contains:
```javascript
window.__APP_CONFIG__ = {
  "apiBaseUrl": "https://api.xsscommentdetection.me",
  "buildVersion": ""
};
```

All API calls from the frontend now reach the API server correctly.

## Date

2026-04-19
