#!/bin/sh
# Runs once, when the database volume is first created.
# Creates the restricted application role. Row-Level Security is only enforced for roles that are
# neither superusers nor BYPASSRLS, so the API must connect as this role (never as the owner).
set -eu
: "${MM_APP_PASSWORD:?MM_APP_PASSWORD must be set}"
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<EOSQL
CREATE ROLE mm_app LOGIN PASSWORD '${MM_APP_PASSWORD}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
GRANT USAGE ON SCHEMA public TO mm_app;
EOSQL
