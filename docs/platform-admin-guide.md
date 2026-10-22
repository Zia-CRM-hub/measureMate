# Platform Administrator Guide

For the people who run MeasureMate as a service: managing businesses (tenants), their plans, access and support.

## Signing in

The first super-admin is created at API start-up from two environment variables:

```
PLATFORM_ADMIN_EMAIL=you@yourcompany.com
PLATFORM_ADMIN_PASSWORD=<at least 12 characters>
```

- Set them only on the server. Never commit them.
- The password is used **only when the account does not exist yet**. Changing the variable later does not reset an existing password.
- In production, delegate sign-in to your identity provider (OIDC) and mark the user as a platform administrator; the built-in password login is meant for local development.

After signing in you land on **/platform** (not in any business).

## The golden rule: no silent access

Platform staff can see **counts and settings** of every business, but not customer, measurement, order or payment records. To see a business's data you must open a **support session** (below), which is reasoned, read-only, time-limited and visible to the business owner.

## Screens

| Screen | Use it to |
|---|---|
| **Overview** | See how many businesses are active, suspended, on trial or overdue, and platform usage. |
| **Businesses** | Search by business name, slug or owner email; filter by status or plan. |
| **Business detail** | Plan, usage against limits, exceptions, branches (stores), team, recent activity, and the actions below. |
| **Users** | Find any account; deactivate (signs the person out everywhere), reactivate, or unlock after too many failed sign-ins. |
| **Announcements** | Publish a banner that every business sees until you hide it. |
| **Feature flags** | Switch new features on or off. Every change is audited. |
| **Audit** | Review platform-wide or per-business activity, including support sessions. |
| **System health** | Database response time, job queue backlog and failures, server memory and uptime. |

## Common tasks

### Change a business's plan
Business detail → Plan → choose Starter / Professional / Business / Enterprise. Takes effect immediately. The business sees the change in its own audit log.

### Grant an exception (more branches, a feature switched on)
Business detail → **Entitlements and exceptions** → choose the limit or feature, set the value (`-1` = unlimited) → Save. Remove it when no longer needed. Exceptions override the plan for that business only.

### Suspend or restore a business
Business detail → **Suspend** (or **Restore**). A reason is required and recorded. A suspended business cannot sign in or use any feature; its data is kept. Restoring a business that asked to be deleted also cancels the deletion.

### Support session (look inside a business)
1. Business detail → **Support session**.
2. Enter a reason (for example "Ticket #123: customer cannot find measurements") and choose 15–60 minutes.
3. You see the business as a read-only auditor. You cannot change anything. A yellow banner shows throughout.
4. Click **End support session** when finished, or it expires on its own.

The business owner sees *start* and *end* of the session, your reason and its length in their Audit log. Platform tools are unavailable while a support session is active.

### Export a business's data
Business detail → **Export data** with a reason. The owner sees this in their audit log. Owners can also export their own data at any time.

### Delete a business permanently
Deletion is a three-step safeguard:
1. The **owner** requests deletion (Settings → Data & privacy). The business is immediately blocked.
2. A **grace period** must pass (14 days by default; `TENANT_DELETION_GRACE_DAYS`).
3. A platform administrator opens the business, clicks **Delete permanently**, gives a reason and types the business slug.

All of that business's records are erased. User accounts remain (they may belong to other businesses). A final audit event records the slug, name, reason and row counts. This cannot be undone: **export first** if there is any doubt.

## Safety notes

- Every platform action is written to the audit log with who, when and why.
- You cannot deactivate your own account.
- Rate limits and account lock-out (5 failed sign-ins, 15 minutes) apply to administrators too.
- Back up the database before permanent deletions (see the backup guide when it is published).

## Known limits in this release

- Billing uses a mock provider; plan changes do not charge anyone.
- The job queue is a database outbox, not Redis/BullMQ.
- Creating additional platform administrators is done by a developer (flag a user as platform admin in the database or via your identity provider); there is no screen for it yet.
