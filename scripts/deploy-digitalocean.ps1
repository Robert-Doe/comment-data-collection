param(
  [Parameter(Mandatory = $true)]
  [string]$Host,

  [string]$User = "root",
  [string]$AppDir = "/opt/comment-data-collection",
  [string]$Branch = "digitalocean-master",
  [string]$Repository = "",
  [string]$ComposeFile = "docker-compose.digitalocean.yml",
  [string]$EnvFile = ".env.digitalocean"
)

function Quote-BashValue {
  param(
    [string]$Value
  )

  return "'" + ($Value -replace "'", '''"''"''') + "'"
}

$remoteVars = @"
AppDir=$(Quote-BashValue $AppDir)
Branch=$(Quote-BashValue $Branch)
Repository=$(Quote-BashValue $Repository)
ComposeFile=$(Quote-BashValue $ComposeFile)
EnvFile=$(Quote-BashValue $EnvFile)
"@

$remoteScript = $remoteVars + @'
set -euo pipefail

get_last_env_value() {
  local key="$1"
  awk -F= -v target="$key" '
    /^[[:space:]]*[A-Za-z_][A-Za-z0-9_]*[[:space:]]*=/ {
      current=\$1
      gsub(/[[:space:]]/, "", current)
      if (current == target) {
        sub(/^[^=]*=/, "", \$0)
        value=\$0
      }
    }
    END {
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
      print value
    }
  ' "$EnvFile"
}

ensure_clean_worktree() {
  local status
  status="$(git status --porcelain --untracked-files=all | grep -vE '^\?\? (\.env\.digitalocean|\.env\.digitalocean\.bak\.[^[:space:]]+)$' || true)"
  if [ -n "$status" ]; then
    echo "Remote git worktree is dirty. Refusing to deploy inconsistent code."
    printf '%s\n' "$status"
    exit 1
  fi
}

ensure_unique_env_keys() {
  local duplicates
  duplicates="$(awk -F= '
    /^[[:space:]]*[A-Za-z_][A-Za-z0-9_]*[[:space:]]*=/ {
      key=\$1
      gsub(/[[:space:]]/, "", key)
      count[key] += 1
    }
    END {
      for (key in count) {
        if (count[key] > 1) {
          print key
        }
      }
    }
  ' "$EnvFile" | sort)"

  if [ -n "$duplicates" ]; then
    echo "Duplicate keys found in $EnvFile. Remove duplicates before deploying."
    printf '%s\n' "$duplicates"
    exit 1
  fi
}

ensure_numeric_env_relationships() {
  local worker_concurrency initial_queue_fill queue_refill_count queue_recovery_interval
  worker_concurrency="$(get_last_env_value WORKER_CONCURRENCY)"
  initial_queue_fill="$(get_last_env_value INITIAL_QUEUE_FILL)"
  queue_refill_count="$(get_last_env_value QUEUE_REFILL_COUNT)"
  queue_recovery_interval="$(get_last_env_value QUEUE_RECOVERY_INTERVAL_MS)"

  worker_concurrency="${worker_concurrency:-2}"
  initial_queue_fill="${initial_queue_fill:-$((worker_concurrency * 2))}"
  queue_refill_count="${queue_refill_count:-$worker_concurrency}"
  queue_recovery_interval="${queue_recovery_interval:-30000}"

  if ! [[ "$worker_concurrency" =~ ^[0-9]+$ ]] || [ "$worker_concurrency" -lt 1 ]; then
    echo "WORKER_CONCURRENCY must be a positive integer."
    exit 1
  fi
  if ! [[ "$initial_queue_fill" =~ ^[0-9]+$ ]] || [ "$initial_queue_fill" -lt "$worker_concurrency" ]; then
    echo "INITIAL_QUEUE_FILL must be an integer greater than or equal to WORKER_CONCURRENCY."
    exit 1
  fi
  if ! [[ "$queue_refill_count" =~ ^[0-9]+$ ]] || [ "$queue_refill_count" -lt "$worker_concurrency" ]; then
    echo "QUEUE_REFILL_COUNT must be an integer greater than or equal to WORKER_CONCURRENCY."
    exit 1
  fi
  if ! [[ "$queue_recovery_interval" =~ ^[0-9]+$ ]] || [ "$queue_recovery_interval" -lt 10000 ]; then
    echo "QUEUE_RECOVERY_INTERVAL_MS must be an integer of at least 10000."
    exit 1
  fi
}

if [ ! -d "$AppDir/.git" ]; then
  if [ -z "$Repository" ]; then
    echo "Repository is required for first deploy."
    exit 1
  fi
  git clone "$Repository" "$AppDir"
fi

cd "$AppDir"
git fetch origin
if git show-ref --verify --quiet "refs/heads/$Branch"; then
  git checkout "$Branch"
else
  git checkout -b "$Branch" "origin/$Branch"
fi
git pull --ff-only origin "$Branch"
ensure_clean_worktree

if [ ! -f "$EnvFile" ]; then
  echo "$EnvFile was not found in $AppDir."
  exit 1
fi

ensure_unique_env_keys
ensure_numeric_env_relationships

echo "Deploying branch $Branch at commit $(git rev-parse HEAD)"
docker compose --env-file "$EnvFile" -f "$ComposeFile" up -d --build
docker compose --env-file "$EnvFile" -f "$ComposeFile" ps
curl -fsS http://127.0.0.1:3000/api/health
'@

$remoteScript | ssh "$User@$Host" "bash -s"
