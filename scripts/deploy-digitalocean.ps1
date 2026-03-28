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

$remoteScript = @"
set -euo pipefail

if [ ! -d "$AppDir/.git" ]; then
  if [ -z "$Repository" ]; then
    echo "Repository is required for first deploy."
    exit 1
  fi
  git clone "$Repository" "$AppDir"
fi

cd "$AppDir"
git fetch origin
git checkout "$Branch"
git pull --ff-only origin "$Branch"
docker compose --env-file "$EnvFile" -f "$ComposeFile" up -d --build
docker compose -f "$ComposeFile" ps
"@

$remoteScript | ssh "$User@$Host" "bash -s"
