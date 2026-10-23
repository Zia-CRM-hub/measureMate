# MeasureMate

Multi-tenant SaaS for tailors, boutiques and custom-apparel businesses: customers and families, versioned measurements, and (in progress) orders, production, payments and invoices.

**Status:** under active development. Working today: sign-up and onboarding, multi-tenant isolation (PostgreSQL Row-Level Security), branches, team and roles, plans and entitlements, customers and households with fuzzy search, measurement templates with immutable revisions, platform administration, audit log. **Not built yet:** orders and production, payments and invoices, inventory, appointments, notifications, reports, customer portal.

## Documentation

| Document | For |
|---|---|
| [User Manual](docs/user-manual.md) | Shop staff |
| [Administrator Manual](docs/administrator-manual.md) | Business owners and managers |
| [Super Admin Manual](docs/super-admin-manual.md) | People who run the service |
| [Deployment strategy and costs](docs/deployment-and-costs.md) | Owner / whoever hosts it, with the open-source licence inventory |
| [Backup and restore](docs/backup-and-restore.md) | Whoever operates the server |

## Stack

Next.js 15 + React 19 + Tailwind (web) · NestJS 11 (API, OpenAPI at `/api/docs`) · PostgreSQL 18 with `pg_trgm` + Prisma 6 · pnpm workspaces + Turborepo · Jest + Supertest. All dependencies are free/open-source with permissive licences.

```
apps/api            NestJS API, Prisma schema and migrations, tests
apps/web            Next.js web app (mobile-first, installable PWA)
packages/validation Shared rules: unit conversion, money maths, order workflow, permissions, schemas
infrastructure/     Docker, Caddy, systemd
scripts/            deploy, backup, restore, secret generation
docs/               manuals and guides
```

## Run it on your own computer (no Docker needed)

Requirements: Node.js 22 or newer, pnpm 9 (`corepack enable` or `npm i -g pnpm@9`).

```bash
pnpm install
pnpm --filter @measuremate/validation build

# 1. A local PostgreSQL (embedded binaries; keeps running in this terminal, data in apps/api/.pgdata)
pnpm --filter @measuremate/api db:local
```

In a second terminal create `apps/api/.env` (never commit it):

```
DATABASE_URL=postgresql://mm_app:mm_app@localhost:54320/measuremate
DIRECT_URL=postgresql://postgres:postgres@localhost:54320/measuremate
# optional: first super admin (password 12+ characters)
PLATFORM_ADMIN_EMAIL=admin@measuremate.local
PLATFORM_ADMIN_PASSWORD=choose-a-long-password
```

```bash
pnpm --filter @measuremate/api db:migrate      # create the tables, security policies and triggers
pnpm --filter @measuremate/api build
pnpm --filter @measuremate/api start           # API on http://localhost:4000  (docs: /api/docs)

# third terminal
pnpm --filter @measuremate/web build
pnpm --filter @measuremate/web start           # web on http://localhost:3100
```

Open <http://localhost:3100/register> to create a business. The web app forwards `/api/*` to the API (set `API_URL` when *building* the web app if the API is elsewhere).

## Tests

```bash
pnpm --filter @measuremate/validation test
pnpm --filter @measuremate/api test     # starts a throwaway real PostgreSQL, runs the real migrations
```

The API tests cover tenant isolation (including at the database level), authentication, lock-out, CSRF, customers and search, measurement revisions and conversions, and platform administration. CI (`.github/workflows/ci.yml`) runs type-checks, tests and builds on every push.

## Run it with Docker (server or laptop)

```bash
cp .env.example .env
sh scripts/gen-secrets.sh        # prints strong values; paste them into .env, set DOMAIN
bash scripts/deploy.sh           # validates .env, builds, migrates, starts, health-checks
```

This starts PostgreSQL, the API, the web app and a Caddy proxy with automatic HTTPS. Add `--profile dev` to the compose command to include Mailpit. Backups: see [docs/backup-and-restore.md](docs/backup-and-restore.md).

> The Docker files have been written and syntax-checked but **not yet built or run** (the author's machine has no Docker). Treat the first run on a staging server as a test. The non-Docker path above is what has been exercised.

## Security notes

- Tenant isolation is enforced by PostgreSQL Row-Level Security; the API connects as a restricted role (`mm_app`) that cannot bypass it.
- Measurement history, payments, invoices, stock movements and audit events are append-only at the database level.
- Platform staff cannot read business data except through a reasoned, read-only, time-limited, audited support session.
- Report security issues privately to the maintainers; do not open public issues for vulnerabilities.
