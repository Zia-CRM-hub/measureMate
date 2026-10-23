# MeasureMate: Deployment Strategy, Running Costs and Open-Source Inventory

**Audience:** the owner/founder deciding how to host MeasureMate and what it will cost; the technical appendix is for whoever sets it up.
**Status of this document:** a plan based on the code as it stands today (customers, measurements, auth, multi-tenancy, platform admin). It is a recommendation, not a record of a production deployment. **No load test and no Linux/Docker deployment has been run yet**; see section 9 for what is missing.

> **About the numbers.** Cloud prices change often (Hetzner repriced its cloud lines in 2026). Every cost below is a **planning range to be confirmed on the provider's pricing page** before you commit. Sources consulted are listed at the end. Anything marked *assumption* is mine.

---

## 1. The short version

1. **Start small and cheap.** One virtual server (2 vCPU, 4 GB RAM) running the web app, the API and PostgreSQL, behind a free automatic-HTTPS proxy, with nightly encrypted backups to separate storage. Planning range: **about US$15 to 50 per month**.
2. **Move the database to a managed service when paying customers depend on it** (adds roughly **US$15 to 60 per month**, more for high availability). You are then paying for someone else to do backups, patching and failover.
3. **Scale out only when measurements say so.** The API is designed to run as several identical copies, but three small things need attention first (section 6).
4. **The software itself costs nothing in licences.** Every library installed is free and open source under commercial-friendly licences (section 3). Your real costs are hosting, email/SMS/WhatsApp messages, payment fees later, and people's time.

---

## 2. What has to run

| Part | What it is | Needed today? |
|---|---|---|
| **Web app** | Next.js (Node.js) serving the screens | Yes |
| **API** | NestJS (Node.js) | Yes |
| **Database** | PostgreSQL with the `pg_trgm` extension | Yes (the only stateful part) |
| **Reverse proxy** | Terminates HTTPS, forwards traffic | Yes |
| **Email sender (SMTP)** | Invitations and, later, receipts/reminders | Optional now (the app shows invite links if email is not set up) |
| **Object storage** | Backups now; customer photos/attachments later | Backups only |
| **Identity provider (OIDC)** | Single sign-on / MFA for production | Optional (built-in sign-in works) |
| Redis, MinIO, Prometheus/Grafana/Loki | In your original design | **Not used yet.** The queue is a database table and files are not stored yet. |

Everything the app needs fits on one modest server. PostgreSQL is the only part that must never lose data.

---

## 3. Free and open-source technologies actually used

I listed the licences of every package installed in the repository (about 570 packages incl. build tooling). **None is GPL, AGPL or SSPL**, the licences that can restrict a commercial SaaS. All are permissive:

| Licence | Packages (count) |
|---|---|
| MIT | 485 |
| ISC | 39 |
| Apache-2.0 | 23 |
| BSD-2 / BSD-3 | 3 / 17 |
| Other permissive (0BSD, MIT-0, MIT+Zlib, MIT/CC0) | 4 |
| Data/dev-only (CC-BY-4.0 `caniuse-lite`, Python-2.0 `argparse`) | 2 |
| Apache-2.0 + LGPL-3.0 (`sharp` image library binaries, optional, see note) | 1 |

### The main building blocks

| Technology | Role | Licence | Cost |
|---|---|---|---|
| Node.js | Runs the API and web server | MIT | Free |
| TypeScript | Language | Apache-2.0 | Free |
| **NestJS** | API framework | MIT | Free |
| **Next.js** + **React** | Web app | MIT | Free |
| Tailwind CSS | Styling | MIT | Free |
| TanStack Query, React Hook Form, Zod | Data fetching, forms, validation | MIT | Free |
| lucide-react | Icons | ISC | Free |
| **Prisma** | Database access and migrations | Apache-2.0 | Free |
| **PostgreSQL** (+ `pg_trgm`) | Database and fuzzy search; row-level security isolates tenants | PostgreSQL Licence (BSD-style) | Free |
| jose | Signed session tokens | MIT | Free |
| @node-rs/argon2 | Password hashing | MIT | Free |
| libphonenumber-js | International phone numbers | MIT | Free |
| pdfkit | PDF measurement sheets | MIT | Free |
| helmet, cookie-parser | Security headers, cookies | MIT | Free |
| nodemailer | Sends email through any SMTP service | MIT-0 | Free (the SMTP service may charge) |
| pnpm, Turborepo | Build tooling | MIT | Free |
| Jest, Supertest | Tests | MIT | Free |

**Licence notes**
- **`sharp`** (used optionally by Next.js for image resizing) ships libvips under **LGPL-3.0** as a separate binary. Using it unmodified in a hosted product is normally acceptable; if your lawyers prefer, set Next's `images.unoptimized` and it is not needed.
- **`caniuse-lite`** is browser-support *data* (CC-BY-4.0, attribution) used only at build time.

### Tools in your original plan, and their licences (not used yet)

| Tool | Licence | Comment |
|---|---|---|
| Keycloak (SSO/MFA) | Apache-2.0 | Free, but you run it (needs about 1 to 2 GB RAM extra) |
| Prometheus | Apache-2.0 | Free |
| Grafana, Loki, Tempo | **AGPL-3.0** | Free to run for your own monitoring; AGPL obligations apply if you modify and offer them to others. Check with legal. |
| Mailpit | MIT | Dev-only email catcher |
| Nginx / Traefik / **Caddy** | BSD-2 / MIT / Apache-2.0 | Caddy is the simplest (automatic HTTPS) |
| **Redis** | Redis 8 is tri-licensed incl. non-open-source terms | Prefer **Valkey** (BSD-3) if you need it later |
| **MinIO** | **AGPL-3.0** | Check current community-edition terms; alternatives: SeaweedFS (Apache-2.0) or a pay-as-you-go S3-compatible service |

*(Licence statements for tools not installed here are from general knowledge; verify before adopting them.)*

---

## 4. Deployment strategy

### 4.1 Principles
- **Same code, three environments:** a developer machine, **staging** (a copy of production for testing releases) and **production**.
- **Database first:** migrations run *before* the new version starts and are written to be backward-compatible for one release, so a rollback does not need a database restore.
- **Stateless app servers:** sessions live in the database, so any copy of the API can serve any request. That makes scaling and replacement easy.
- **Secrets only on the server** (never in Git), delivered through an environment file or a secrets manager.
- **Everything repeatable:** one script to install, one to deploy, one to restore.

### 4.2 Stages (grow only when you need to)

| Stage | When | Layout | Planning cost / month |
|---|---|---|---|
| **A. Pilot** | Up to your first few friendly shops | One small VPS: Caddy + web + API + PostgreSQL, nightly backups | **~US$15 to 30** |
| **B. Launch** | Paying customers | Larger VPS (2 to 4 vCPU, 4 to 8 GB) or **VPS + managed PostgreSQL**; separate staging server (can be switched off outside testing); monitoring and alerts | **~US$40 to 120** |
| **C. Growth** | Hundreds of businesses; uptime promises | 2 app servers behind a load balancer, managed PostgreSQL with standby (high availability) and read-only backups, Redis/Valkey for shared rate limits, object storage for files | **~US$150 to 400** |
| **D. Enterprise** | Large chains, contractual SLAs, data-residency demands | Multi-zone or multi-region, dedicated SSO, formal DR drills; Kubernetes only if you already have the skills | quote-driven |

*Assumption:* these bands combine the provider prices in section 5 with typical add-ons. They are not benchmarks.

### 4.3 Release process
1. Developer opens a pull request; **CI runs** lint, type-check, the 40 automated tests (real PostgreSQL), and a build.
2. Merge to `main` deploys automatically to **staging**; someone clicks through the key flows.
3. Tag a release (`v1.x`) to deploy to **production**: build, upload, run `prisma migrate deploy`, restart one process at a time, check `/api/v1/ready`.
4. **Rollback** = redeploy the previous tag; database stays (migrations are additive).
5. Announce maintenance with the platform **Announcements** banner.

### 4.4 Backups and recovery (non-negotiable)
- **Nightly full backup** (`pg_dump`) encrypted and copied to storage *at another provider or region*; keep 7 daily, 4 weekly, 12 monthly.
- Managed PostgreSQL adds **point-in-time recovery**, so you can restore to any minute in the last days.
- **Test a restore every quarter** into a scratch database; an untested backup is not a backup.
- Targets to agree with customers: **RPO** (data you can lose) 24 h on Stage A, minutes on managed Stage B+; **RTO** (time to restore) a few hours.
- Tenant deletion is permanent: take a backup before each purge (see Super Admin Manual).

### 4.5 Monitoring
- Free uptime monitor hitting `/api/v1/health` and `/api/v1/ready` with email/SMS alerts.
- The platform **System health** screen: database response time, queue backlog, memory.
- Server logs via the OS journal; disk, CPU and memory alerts from the provider.
- Later: Prometheus + Grafana, and error tracking (Sentry has a free tier or can be self-hosted).

### 4.6 Security checklist before real customer data
- [ ] HTTPS only (Caddy does this automatically); add HSTS at the proxy.
- [ ] `NODE_ENV=production`, a random **`SESSION_SECRET`** (32+ characters), secure cookies (automatic in production).
- [ ] The app connects as the **restricted database role** (`mm_app`, no superuser, no BYPASSRLS); migrations use the owner account. This is what makes tenant isolation hold even if there is an application bug.
- [ ] PostgreSQL reachable only from the app server (private network or firewall), never from the internet.
- [ ] SSH keys only, firewall allowing 80/443 (and SSH from your address), automatic security updates.
- [ ] Change the super-admin password; use SSO with MFA for staff accounts in production.
- [ ] Restrict or disable the public API documentation page (`/api/docs`) in production.
- [ ] Set `WEB_ORIGIN` and the web app's `API_URL` correctly; keep the browser talking to one origin.
- [ ] Encrypted backups, tested restore, documented who holds the keys.
- [ ] Privacy: choose a region that matches your customers' data-protection rules; publish a privacy notice; honour export/deletion requests (the app supports both).

---

## 5. Cost model

All figures are **planning ranges**, in US dollars unless stated, per month. Confirm with the provider.

### 5.1 Hosting (the main cost)

| Option | Indicative price | Notes |
|---|---|---|
| **Hetzner Cloud** (EU/US) | Historically the cheapest (a 2 vCPU/4 GB shared server was a few euros); **repriced in 2026, with sources disagreeing** and some cheap lines marked unavailable. Plan on **~€8 to 20** for 2 vCPU/4 GB and verify. | Best value; EU data centres suit GDPR |
| **DigitalOcean** | Droplet 2 vCPU/4 GB roughly **$20 to 32**; managed PostgreSQL from **~$15** (single node, 1 GB) and **~$30+** with a standby | Simple, good docs, managed DB |
| **AWS Lightsail** | 2 vCPU/4 GB roughly **$20 to 24**; managed database from **~$15**, **~$60** for 2 vCPU/4 GB; high availability about doubles the database | Easy path into the wider AWS if you grow |
| Other VPS providers (Vultr, Linode/Akamai, OVH, Contabo, Oracle Cloud free-tier ARM) | Broadly **$5 to 30** for comparable sizes | Free tiers exist but terms change; do not run paying customers on a free tier |

**Stage A realistic total:** server $10 to 25 + backup storage $1 to 5 + domain ~$1/month = **about $15 to 30**.
**Stage B:** server or two $25 to 60 + managed database $15 to 60 + staging $0 to 20 + backups/monitoring $0 to 10 = **about $40 to 150**.

### 5.2 Everything else

| Item | Cost | Notes |
|---|---|---|
| Domain name | ~$10 to 20 / **year** | |
| HTTPS certificates | **Free** (Let's Encrypt via Caddy) | |
| Transactional email (invitations, receipts) | Free tiers (low hundreds of mails/day) up to **$15 to 25** for tens of thousands a month | Any SMTP provider works |
| **SMS and WhatsApp reminders** | **Per message**, varies by country and provider; passed on to shops or built into plan price | The app has the hooks; you choose a provider. Biggest *variable* cost once reminders are live |
| Online payment fees (when added) | Typically a percentage per transaction, charged by the gateway | Not a platform cost if paid by shops; the app never stores card details |
| Single sign-on / MFA | **Free** self-hosted Keycloak (needs RAM and care), or a paid identity service per user | Optional |
| Error tracking and monitoring | **Free** tiers or self-hosted | |
| Backup storage | ~$1 to 10 | Grows with data; compress and expire old backups |
| Legal (terms, privacy, DPA), accounting | One-off / yearly, not hosting | Do not skip |
| Security review / penetration test | One-off, typically the largest single "launch" cost | Recommended before enterprise customers |
| **People** (support, on-call, development) | **Usually the biggest cost by far** | Software is free, attention is not |

### 5.3 Does it pay for itself? (illustration only)
The plan prices in the app are **placeholders** (Starter $9, Professional $29, Business $79, Enterprise $199 per month). *Arithmetic on those assumptions:* a $40/month Stage A/B server is covered by **two Professional customers**; a $150/month Stage C setup by **about six**. Real pricing, churn, support load and messaging costs will move this, and it needs customer research, not my assumptions.

### 5.4 How many businesses fit on one server?
Unknown until load-tested. Each business is mostly rows in one database and light traffic (a handful of staff entering data). My *expectation* (to be tested, not a promise) is that a 2 vCPU/4 GB server comfortably serves **dozens to low hundreds of small shops**, with the database as the first bottleneck. **Run a load test before quoting any capacity.**

---

## 6. Scaling path and the three things to fix first

The app servers are stateless, so scaling out is mostly adding copies behind a load balancer. Before running **more than one API copy** you should:

1. **Share rate limiting.** It is per-process memory today; with two copies each allows its own quota. Move it to Redis/Valkey (or the proxy).
2. **Move background work to one worker.** Reminders and message sending (when built) must run in a single worker process (or use a queue like BullMQ) so messages are not sent twice.
3. **Use shared file storage** (S3-compatible) before storing customer photos or documents; local disk does not work across copies.

Also: the short-lived plan/entitlement cache (15 seconds) is per process and is harmless. Database growth is handled by vertical upgrade, then read replicas, then partitioning of the largest tables (orders, audit events) well down the road.

---

## 7. Appendix: single-server runbook (Stage A)

*These steps follow how the app was built and run during development (Windows). The Linux commands below have not been executed by me; treat as a checklist to validate on staging.*

**Server:** Ubuntu LTS, 2 vCPU/4 GB, firewall allowing 80/443, a DNS name pointing at it.

1. **Install:** Node.js 22 LTS, pnpm, PostgreSQL (the app has been tested on PostgreSQL 18; 14+ is expected to work), the `postgresql-contrib` package (for `pg_trgm`), and Caddy.
2. **Database:** create a database and two roles *before* the first migration:
   - an **owner** role for migrations;
   - **`mm_app`**: `LOGIN`, `NOSUPERUSER`, `NOBYPASSRLS`. The first migration grants it table rights only if a role with exactly this name exists.
3. **Get the code,** `pnpm install`, then build: `pnpm --filter @measuremate/validation build`, `pnpm --filter @measuremate/api build`, and for the web app `next build` **with `API_URL` set to the API's internal address**, because it is baked in at build time.
4. **Configuration** (environment file readable only by the service user):

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | connection string for **`mm_app`** |
| `DIRECT_URL` | connection string for the **owner** (used only by migrations) |
| `SESSION_SECRET` | 32+ random characters |
| `WEB_ORIGIN` | `https://your-domain` |
| `PORT` | `4000` (API) |
| `PLATFORM_ADMIN_EMAIL`, `PLATFORM_ADMIN_PASSWORD` | first super admin (12+ characters) |
| `SMTP_HOST`, `SMTP_PORT`, `MAIL_FROM` | optional email |
| `TENANT_DELETION_GRACE_DAYS` | default 14 |

5. **Migrate:** `prisma migrate deploy` using the owner connection.
6. **Run as services:** two `systemd` units (API on 4000, web on 3100) that restart on failure.
7. **Proxy (Caddy):** send everything to the web app on 3100 (it forwards `/api/*` to the API), automatic HTTPS.
8. **Backups:** a nightly `pg_dump | gzip | encrypt` job copying to another provider; a quarterly restore test.
9. **Monitor:** uptime check on `/api/v1/ready`.
10. **Smoke test:** register a business, add a customer and a measurement, sign in as the super admin.

---

## 8. Decisions needed from you

1. **Region and provider** (driven by where customers are and which privacy laws apply).
2. **Pilot or launch first?** Stage A is enough for pilots.
3. **Who is on call** if the service goes down at night?
4. **Messaging:** will shops pay for SMS/WhatsApp, or is it included in plans?
5. **Identity:** is built-in sign-in acceptable at launch, or do you need SSO/MFA from day one?
6. **Capacity promises:** do not quote them until a load test is done.

---

## 9. What is missing from the repository for deployment

Being straightforward: these exist only as a plan today and should be built next.

- Dockerfiles and a Docker Compose setup (this machine has no Docker, so they could not be tested here)
- A CI pipeline (GitHub Actions) running lint, type-check, tests and build
- Backup and restore scripts, and a restore-drill checklist
- `systemd` units / Caddy configuration files
- A production environment template (`.env.example`) and an environment-validation step in the deploy script
- Monitoring dashboards and alert rules
- A load test to replace the guesses in section 5.4

---

## Sources (consulted for pricing; verify on provider sites)

- [Hetzner 2026 price increase and availability (Findstack)](https://findstack.com/resources/hetzner-price-increase-2026)
- [Hetzner June 2026 cloud repricing (PrivateDevOps)](https://privatedevops.com/news/hetzner-june-2026-cloud-price-increase-what-to-do)
- [Hetzner Cloud review (Better Stack)](https://betterstack.com/community/guides/web-servers/hetzner-cloud-review/)
- [DigitalOcean managed PostgreSQL pricing](https://docs.digitalocean.com/products/databases/postgresql/details/pricing/)
- [DigitalOcean Droplet plan changes (changelog)](https://docs.digitalocean.com/notes/changelog/new-size-slugs-for-droplet-plan-changes)
- [AWS Lightsail pricing guide (Wring)](https://wring.co/blog/aws-lightsail-pricing-guide)
- [AWS Lightsail pricing 2026 breakdown (Kuberns)](https://kuberns.com/blogs/aws-lightsail-pricing-your-comprehensive-guide/)

*Licence counts come from `pnpm licenses list` run on this repository. Plan prices in the app are placeholders, not recommendations.*
