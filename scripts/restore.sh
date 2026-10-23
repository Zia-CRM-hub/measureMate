#!/usr/bin/env bash
# Restores an encrypted backup made by scripts/backup.sh.
#
#   bash scripts/restore.sh backups/measuremate-20261023-021500.dump.enc [target_database]
#
# By default it restores into a NEW scratch database "measuremate_restore_test" so you can inspect it
# without touching live data (this is the quarterly "restore drill").
# To replace the live database pass its name explicitly, stop the app first, and confirm when asked:
#   docker compose -f infrastructure/docker/docker-compose.yml --env-file .env stop api web proxy
set -euo pipefail
cd "$(dirname "$0")/.."

file="${1:?Usage: restore.sh <backup-file.dump.enc> [target_database]}"
[ -f "$file" ] || { echo "ERROR: $file not found"; exit 1; }
[ -f .env ] || { echo "ERROR: .env not found"; exit 1; }
set -a; . ./.env; set +a
: "${BACKUP_PASSPHRASE:?Set BACKUP_PASSPHRASE in .env}"
COMPOSE="docker compose -f infrastructure/docker/docker-compose.yml --env-file .env"
OWNER="${DB_OWNER_USER:-measuremate_owner}"
LIVE="${DB_NAME:-measuremate}"
target="${2:-measuremate_restore_test}"

if [ "$target" = "$LIVE" ]; then
  echo "WARNING: this will ERASE the live database '$LIVE' and replace it with the backup."
  echo "Make sure the app is stopped and you have a fresh backup of the current state."
  read -r -p "Type the database name to confirm: " answer
  [ "$answer" = "$LIVE" ] || { echo "Aborted."; exit 1; }
fi

echo "Decrypting and checking the backup ..."
tmp="$(mktemp)"; trap 'rm -f "$tmp"' EXIT
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$file" -out "$tmp" \
  || { echo "ERROR: could not decrypt (wrong BACKUP_PASSPHRASE or damaged file)"; exit 1; }

echo "Creating database '$target' ..."
$COMPOSE exec -T db psql -U "$OWNER" -d postgres -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE IF EXISTS \"$target\" WITH (FORCE)" -c "CREATE DATABASE \"$target\" OWNER \"$OWNER\""
$COMPOSE exec -T db psql -U "$OWNER" -d "$target" -v ON_ERROR_STOP=1 -c "CREATE EXTENSION IF NOT EXISTS pg_trgm"

echo "Restoring ..."
$COMPOSE exec -T db pg_restore -U "$OWNER" -d "$target" --no-owner --no-privileges --exit-on-error < "$tmp"

# The application role needs rights on the restored tables again (dumps are taken with --no-privileges).
$COMPOSE exec -T db psql -U "$OWNER" -d "$target" -v ON_ERROR_STOP=1 <<'SQL'
GRANT USAGE ON SCHEMA public TO mm_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO mm_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO mm_app;
SQL

echo "Sanity check:"
$COMPOSE exec -T db psql -U "$OWNER" -d "$target" -c \
  "SELECT (SELECT count(*) FROM tenants) AS tenants, (SELECT count(*) FROM customers) AS customers, (SELECT count(*) FROM users) AS users"
echo "Restore finished into '$target'."
[ "$target" = "$LIVE" ] && echo "Start the app again: docker compose -f infrastructure/docker/docker-compose.yml --env-file .env up -d"
exit 0
