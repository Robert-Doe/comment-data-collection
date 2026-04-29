#!/bin/sh
# Writes config.js from runtime environment before nginx starts.
# nginx base image auto-runs scripts in /docker-entrypoint.d/ before starting.
set -e
CONFIG=/usr/share/nginx/html/config.js
API_BASE="${API_BASE_URL:-}"
VERSION="${BUILD_VERSION:-}"
PUBLIC_JOB_ID="${PUBLIC_JOB_ID:-}"
PUBLIC_JOB_LABEL="${PUBLIC_JOB_LABEL:-}"
printf 'window.__APP_CONFIG__ = {\n  "apiBaseUrl": "%s",\n  "buildVersion": "%s",\n  "publicJobId": "%s",\n  "publicJobLabel": "%s"\n};\n' "$API_BASE" "$VERSION" "$PUBLIC_JOB_ID" "$PUBLIC_JOB_LABEL" > "$CONFIG"
echo "[ui-entrypoint] config.js written (apiBaseUrl=$API_BASE publicJobId=$PUBLIC_JOB_ID)"
