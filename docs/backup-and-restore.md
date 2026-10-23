# Backup and Restore Guide

**For:** whoever operates the MeasureMate server. Read it before you have customers, and rehearse it.

> **Status.** The scripts below are syntax-checked but have **not yet been run against a live Docker deployment**. Do your first backup *and* restore on a staging server before trusting them in production.

## What gets backed up

The PostgreSQL database holds everything: businesses, customers, measurements (all revisions), users and audit history. That is the only data that matters today. (Uploaded files are not stored yet; when they are, they need backing up too.)

You should also keep, **separately and safely**:
- `.env` (database passwords, `SESSION_SECRET`)
- `BACKUP_PASSPHRASE`. **Without it the encrypted backups cannot be restored.** Store it in a password manager and with a second trusted person.

## Targets (agree these with customers)

| | Docker on one server | Managed PostgreSQL |
|---|---|---|
| **RPO** (how much data you can lose) | up to 24 hours (nightly backup) | minutes (point-in-time recovery) |
| **RTO** (time to get running again) | a few hours | an hour or two |

## Taking a backup

```bash
bash scripts/backup.sh
```

- Dumps the database with `pg_dump`, **encrypts it (AES-256)** with `BACKUP_PASSPHRASE` and writes `backups/measuremate-YYYYmmdd-HHMMSS.dump.enc`.
- Refuses to keep a suspiciously small file.
- If `RCLONE_REMOTE` is set, copies the file off the server (`rclone` must be installed and configured). **A backup on the same disk is not a backup.** Use a different provider or region.
- Keeps the newest 7 daily, 4 weekly (Sundays) and 12 monthly (1st) files locally.

Schedule it nightly:

```cron
15 2 * * *  cd /opt/measuremate && bash scripts/backup.sh >> backups/backup.log 2>&1
```

Also take one **manually before** every upgrade and **before any permanent business deletion** (see the Super Admin Manual).

## Restore drill (do this every quarter)

Restores into a scratch database, leaving live data untouched:

```bash
bash scripts/restore.sh backups/measuremate-20261023-021500.dump.enc
```

It decrypts, recreates a database called `measuremate_restore_test`, restores into it, re-grants the application role and prints row counts (businesses, customers, users). Check the numbers look right, then drop the scratch database:

```bash
docker compose -f infrastructure/docker/docker-compose.yml --env-file .env exec db \
  psql -U measuremate_owner -d postgres -c 'DROP DATABASE measuremate_restore_test'
```

Record the date and result of every drill.

## Real disaster recovery (replace the live database)

1. Tell customers (a platform **Announcement** can only be shown while the app is up; otherwise use email/status page).
2. Stop the app: `docker compose -f infrastructure/docker/docker-compose.yml --env-file .env stop api web proxy`
3. **Back up whatever is left** first, even if it looks broken.
4. Restore into the live name and confirm when asked:
   `bash scripts/restore.sh backups/<file>.dump.enc measuremate`
5. Start again: `docker compose -f infrastructure/docker/docker-compose.yml --env-file .env up -d`
6. Check `https://<your domain>/api/v1/ready`, sign in as the super admin, open a known business and confirm recent data.
7. Note what time the backup was taken; everything after is lost. Tell affected businesses.

## Managed PostgreSQL (recommended once you have paying customers)

Use the provider's automated backups with **point-in-time recovery**, keep at least 7 days of history, and still take your own encrypted dump weekly to a different provider (protects against account problems). Restore through the provider's console into a *new* database, point `DATABASE_URL` at it, redeploy, and verify.

## Deleting a business

Permanent deletion removes the business's rows, including from backups only as old backups expire. State your backup retention in your privacy notice (for example "removed from backups within 12 months"). If a person requests erasure, note that restoring an old backup could bring their data back: re-apply pending deletions after any restore.

## Checklist

- [ ] Nightly backup scheduled and its log reviewed weekly
- [ ] Backups copied to a different provider or region
- [ ] `BACKUP_PASSPHRASE` and `.env` stored safely, held by two people
- [ ] Restore drill done in the last 3 months (date: ________ result: ________)
- [ ] Backup taken before each upgrade and each permanent deletion
- [ ] After any restore, pending deletions re-applied
