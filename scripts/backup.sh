#!/usr/bin/env bash
# Encrypted PostgreSQL backup for the Docker Compose deployment.
#
#   bash scripts/backup.sh
#
# Reads .env (BACKUP_PASSPHRASE, BACKUP_DIR, optional RCLONE_REMOTE, DB_* values).
# Output: $BACKUP_DIR/measuremate-YYYYmmdd-HHMMSS.dump.enc   (custom-format dump, AES-256 encrypted)
# Retention: keeps the newest 7 daily, 4 weekly (Sundays) and 12 monthly (1st of month) files.
# Schedule it, e.g. with cron:   15 2 * * *  cd /opt/measuremate && bash scripts/backup.sh >> backups/backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] || { echo "ERROR: .env not found (run from the repository root)"; exit 1; }
set -a; . ./.env; set +a
: "${BACKUP_PASSPHRASE:?Set BACKUP_PASSPHRASE in .env}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
COMPOSE="docker compose -f infrastructure/docker/docker-compose.yml --env-file .env"
OWNER="${DB_OWNER_USER:-measuremate_owner}"
DB="${DB_NAME:-measuremate}"

mkdir -p "$BACKUP_DIR"
stamp="$(date +%Y%m%d-%H%M%S)"
out="$BACKUP_DIR/measuremate-$stamp.dump.enc"
tmp="$out.partial"

echo "[$(date -Is)] dumping $DB ..."
# -Fc = compressed custom format, restorable with pg_restore (also allows partial restores).
$COMPOSE exec -T db pg_dump -U "$OWNER" -d "$DB" -Fc --no-owner --no-privileges \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE -out "$tmp"
mv "$tmp" "$out"

# Refuse to call it a backup if the file is implausibly small.
size="$(wc -c < "$out")"
[ "$size" -gt 2048 ] || { echo "ERROR: backup is only $size bytes, something is wrong"; rm -f "$out"; exit 1; }
echo "[$(date -Is)] wrote $out ($size bytes)"

if [ -n "${RCLONE_REMOTE:-}" ]; then
  echo "[$(date -Is)] copying to $RCLONE_REMOTE ..."
  rclone copy "$out" "$RCLONE_REMOTE" --immutable
fi

# ---- retention (local copies) ----
keep=""
mapfile -t files < <(ls -1 "$BACKUP_DIR"/measuremate-*.dump.enc 2>/dev/null | sort -r)
daily=0; weekly=0; monthly=0
for f in "${files[@]}"; do
  base="$(basename "$f")"; d="${base#measuremate-}"; d="${d:0:8}"
  dow="$(date -d "$d" +%u 2>/dev/null || echo 0)"; dom="${d:6:2}"
  if [ "$daily" -lt 7 ]; then keep="$keep $f"; daily=$((daily+1)); continue; fi
  if [ "$dom" = "01" ] && [ "$monthly" -lt 12 ]; then keep="$keep $f"; monthly=$((monthly+1)); continue; fi
  if [ "$dow" = "7" ] && [ "$weekly" -lt 4 ]; then keep="$keep $f"; weekly=$((weekly+1)); continue; fi
  rm -f "$f"
done
echo "[$(date -Is)] done. Remember: a backup you have never restored is only a hope. Run scripts/restore.sh on a test machine regularly."
