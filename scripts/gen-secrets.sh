#!/usr/bin/env bash
# Prints strong random values for the secrets in .env. Copy the ones you need; nothing is written to disk.
#   sh scripts/gen-secrets.sh
set -euo pipefail

rand() { openssl rand -base64 48 | tr -d '/+=\n' | cut -c1-"$1"; }

cat <<EOF
# Paste into your .env (do not share, do not commit)
DB_OWNER_PASSWORD=$(rand 32)
DB_APP_PASSWORD=$(rand 32)
SESSION_SECRET=$(rand 48)
PLATFORM_ADMIN_PASSWORD=$(rand 20)
BACKUP_PASSPHRASE=$(rand 32)
EOF
