#!/usr/bin/env bash
# Deploys the current checkout with Docker Compose and verifies it is healthy.
#
#   bash scripts/deploy.sh            # build, migrate, restart, health-check
#
# Rollback: git checkout <previous-tag> && bash scripts/deploy.sh   (migrations are additive).
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] || { echo "ERROR: .env not found. Copy .env.example and fill it in (sh scripts/gen-secrets.sh)."; exit 1; }
set -a; . ./.env; set +a

# ---- environment validation: fail early with a readable message ----
missing=0
need() { if [ -z "${!1:-}" ]; then echo "ERROR: $1 is empty in .env"; missing=1; fi; }
need DOMAIN; need DB_OWNER_PASSWORD; need DB_APP_PASSWORD; need SESSION_SECRET
[ "${#SESSION_SECRET}" -ge 32 ] || { echo "ERROR: SESSION_SECRET must be at least 32 characters"; missing=1; }
if [ -n "${PLATFORM_ADMIN_EMAIL:-}" ] && [ "${#PLATFORM_ADMIN_PASSWORD}" -lt 12 ]; then
  echo "ERROR: PLATFORM_ADMIN_PASSWORD must be at least 12 characters"; missing=1
fi
[ "$missing" -eq 0 ] || exit 1

COMPOSE="docker compose -f infrastructure/docker/docker-compose.yml --env-file .env"

if [ -f backups/.last-ok ] || [ "${SKIP_BACKUP:-0}" = "1" ]; then :; else
  echo "Tip: take a backup before upgrading (bash scripts/backup.sh). Set SKIP_BACKUP=1 to silence this."
fi

echo "Building images ..."
$COMPOSE build
echo "Starting (migrations run first) ..."
$COMPOSE up -d --remove-orphans

echo "Waiting for the API to become healthy ..."
for i in $(seq 1 60); do
  status="$($COMPOSE ps --format '{{.Service}} {{.Health}}' api 2>/dev/null | awk '{print $2}' || true)"
  if [ "$status" = "healthy" ]; then echo "API is healthy."; break; fi
  if [ "$i" = "60" ]; then echo "ERROR: API did not become healthy. Logs:"; $COMPOSE logs --tail=80 api migrate; exit 1; fi
  sleep 3
done
$COMPOSE ps
echo "Deployed. Open https://${DOMAIN}"
