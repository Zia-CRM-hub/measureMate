# MeasureMate Super Admin Manual

**For:** the people who run MeasureMate as a service: platform administrators (super admins) who look after all businesses, their plans, access and support.
**Related manuals:** the *Administrator Manual* (what business owners and managers see) and the *User Manual* (what staff see). Read the Administrator Manual section 10 to know what your customers are told about your access.

> **Scope.** This manual covers the platform administration area that exists today. Billing is a mock provider, the job queue is a database outbox, and creating further super admins has no screen yet (section 9).

---

## 1. Principles you must follow

1. **No silent access.** You can see counts, plans and settings for every business, but **not** their customers, measurements, orders or payments. To see business data you must open a *support session* (section 5.4).
2. **Every action leaves a record.** Platform actions are written to the audit log. Those that affect a business also appear in **that business's own audit log**, with your reason.
3. **Reasons are mandatory** for suspend, restore, support sessions, exports and deletion (at least 5 characters). Write something a colleague or the business owner could understand later, for example *"Ticket #123: customer cannot find measurements"*.
4. **Least privilege.** Use your super-admin account only for administration. Use a separate ordinary account for anything else.

---

## 2. Signing in

### First super admin
It is created when the API starts, from two environment variables set **on the server**:

```
PLATFORM_ADMIN_EMAIL=you@yourcompany.com
PLATFORM_ADMIN_PASSWORD=<at least 12 characters>
```

- Never commit these or put them in chat or tickets.
- The password is used **only if the account does not exist yet**. Changing the variable later does not change an existing password. If the email already belongs to a normal user, that user is promoted to platform administrator and keeps their password.
- If the password is shorter than 12 characters the account is **not** created and an error is logged.

### Signing in
Open the sign-in page and use that email and password. You are taken to **/platform**. Platform administrators have no business of their own unless they also belong to one; if you do, you are still sent to /platform.

Production note: the built-in password sign-in is intended for development and small installations. For production, use your identity provider (OIDC / SSO with MFA) and mark the user as a platform administrator.

### Account protection
Five wrong passwords lock the account for 15 minutes. Another super admin can unlock it (Users, **Unlock**). Sessions last 12 hours by default.

---

## 3. The screens

| Screen | Purpose |
|---|---|
| **Overview** | Businesses by status (active, suspended, pending deletion) and by plan, trials, overdue subscriptions, new businesses in 30 days, user accounts, total customers and orders. Tiles link to filtered lists. |
| **Businesses** | Search by business name, slug or **owner email**; filter by status and plan. Shows owner, plan, status, branches (stores), staff, customers and orders. |
| **Business detail** | Plan, usage against limits, entitlements and exceptions, branches, team, recent activity, and all actions in section 5. |
| **Users** | Search every account; deactivate, reactivate, unlock. |
| **Announcements** | Banners shown to every business. |
| **Feature flags** | On/off switches for gradual rollout. |
| **Audit** | Platform-wide or per-business audit events. |
| **System health** | Database response time, job queue, server memory and uptime. Refreshes every 15 seconds. |

On a phone the sections are a scrolling tab bar under the header.

---

## 4. Looking after the platform

### Overview checks (daily)
- Anything under **Payment overdue** or **Pending deletion** needing action?
- **System health** shows *All systems normal*. If *Degraded*, the database is responding slowly.
- **Job queue**: *Failed in last 24 h* should be 0; *Oldest waiting* should be seconds, not minutes.

### Finding a business
**Businesses**, then search. Searching by the owner's email is the quickest way to answer "my login does not work" tickets: it also shows the business status (a suspended business is a common cause).

### Users
- **Deactivate** signs the person out of **every** business immediately and blocks sign-in. Use for compromised accounts or leavers when the business owner cannot act.
- **Reactivate** restores sign-in. **Unlock** clears a lock-out after failed attempts.
- You cannot deactivate your own account.

---

## 5. Managing a business

Open it from **Businesses**.

### 5.1 Change a plan
**Plan** buttons: Starter, Professional, Business, Enterprise. Takes effect immediately and is shown in the business's audit log as `platform.plan_changed`. (Billing is simulated; no money moves.)

| Plan | Branches | Team | Customers | Extras |
|---|---|---|---|---|
| Starter | 1 | 3 | 300 | Core |
| Professional | 3 | 15 | 5,000 | Inventory, reports, portal, branded documents |
| Business | 10 | 50 | 50,000 | As Professional |
| Enterprise | Unlimited | Unlimited | Unlimited | As Professional |

New businesses start on a **14-day Professional trial**.

### 5.2 Grant an exception
**Entitlements and exceptions**: choose a limit (branches, team members, customers) or a feature (inventory, reports, portal, multi-branch, branded PDFs), set the value (**-1 = unlimited**; features on/off) and **Save**. Exceptions override the plan for that business only and are listed in amber so you remember to remove them. Both setting and removing are audited.

Use exceptions for goodwill, pilots and migrations. Do not use them to give permanent discounts; change the plan instead.

### 5.3 Suspend and restore
- **Suspend** (reason required): everyone in the business is blocked with "This business account is currently suspended"; **data is kept**. Support sessions still work so you can investigate.
- **Restore** (reason required): re-enables the business. If the business had asked to be deleted, restoring **cancels the deletion**.

### 5.4 Support session (look inside a business)
1. **Support session**, then enter the **reason** and a length of 15, 30, 45 or 60 minutes.
2. You are taken into the business as a **read-only auditor**. A yellow banner shows the reason and expiry. You can look but cannot change anything.
3. Platform tools are unavailable during the session. Click **End support session** in the banner to return to /platform, or wait for it to expire.

What the business sees: `platform.impersonation_started` and `platform.impersonation_ended` in their audit log, including your reason. Everything you view while in the session is attributed to you.

Take screenshots only if the customer asked for them; do not copy customer data out of the system.

### 5.5 Export a business's data
**Export data** (reason required) downloads all customers, measurements, orders, payments and invoices as JSON. Password hashes and secrets are never included. The owner sees `platform.tenant_exported` and your reason. Store the file securely, share it only with the business owner, and delete your copy afterwards. Owners can export their own data themselves (Settings, Data & privacy), which is preferable.

### 5.6 Delete a business permanently
Deletion has deliberate safeguards:

1. The **owner** requests deletion (Settings, Data & privacy; they must type the business name). The business is blocked straight away and shows as *Pending deletion*.
2. A **grace period** must pass: **14 days** by default (`TENANT_DELETION_GRACE_DAYS` on the server). Until then the Delete button is refused with the earliest allowed date.
3. A super admin opens the business, chooses **Delete permanently**, gives a reason and types the **slug** (not the display name) exactly.

All of the business's records are erased in one transaction (including audit events for that business). User accounts remain because a person may belong to other businesses. One final platform audit event records the slug, name, reason and number of rows removed per table.

**This cannot be undone.** Before deleting: confirm the request really came from the owner, make sure they have exported what they need, and take a database backup.

---

## 6. Announcements and feature flags

- **Announcements:** title and message appear as a banner on every business while **Live**. **Hide** removes it without deleting; **Delete** removes it permanently. Keep them short and say when the issue will be over.
- **Feature flags:** name them in lowercase (letters, digits, `-`, `.`, `_`), add a description of what the flag does, and switch **On/Off**. Flags are stored and audited now; features consult them as they are built. Delete flags once a feature is fully released.

---

## 7. Audit review

**Audit** lists events across the platform; **Full audit trail** on a business filters to it. Filter by prefix:

| Prefix | Meaning |
|---|---|
| `platform.` | Super-admin actions (plan, overrides, suspend/restore, support sessions, exports, deletion, users, announcements, flags). |
| `auth.` | Sign-ins, failed sign-ins, tenant switching, invitations accepted, sessions revoked. |
| `tenant.` | Business registration, settings, export, deletion request. |
| `employee.` | Invitations, role and status changes. |
| `customer.`, `household.` | Customer lifecycle and consent changes. |
| `measurement.` | Templates, profiles, revisions, restores, sheets printed. |

Events marked **support session** were performed during an impersonation. Entries are append-only: the database refuses edits and deletions, apart from the permanent business deletion described above.

---

## 8. Playbooks

| Situation | What to do |
|---|---|
| **"I cannot sign in"** | Find the owner by email. Check *Users* (deactivated? locked?) and the business (suspended?). Unlock or reactivate as appropriate, with a note in the ticket. |
| **Customer says data is missing** | Ask for permission, then open a support session with the ticket number as the reason and look. Do not change data. |
| **Business over its limit** | Offer an upgrade, or a time-limited exception with a note, and diarise its removal. |
| **Non-payment** | Suspend with the reason and invoice reference. After payment, restore. Data is never deleted for non-payment alone. |
| **Compromised account** | Deactivate the user (signs out everywhere), tell the owner, review the business's audit log, reactivate after a password change. |
| **Owner wants to leave** | Ask them to export, then to request deletion themselves. Wait for the grace period; do not shorten it. |
| **Owner requests deletion by mistake** | Restore the business before the grace period ends. |
| **Planned maintenance** | Publish an announcement; hide it afterwards. |

---

## 9. Server configuration and known limits

### Settings that affect you

| Variable | Meaning |
|---|---|
| `PLATFORM_ADMIN_EMAIL`, `PLATFORM_ADMIN_PASSWORD` | Creates the first super admin at start-up (section 2). |
| `TENANT_DELETION_GRACE_DAYS` | Days between a deletion request and when permanent deletion is allowed (default 14). |
| `SESSION_SECRET` | Signs sessions; **required (32+ characters) in production**. Changing it signs everyone out. |
| `SESSION_TTL_HOURS` | Session length (default 12). |
| `OIDC_ISSUER`, `OIDC_AUDIENCE` | Enable sign-in through your identity provider. |
| `COOKIE_SECURE` | Cookies are marked secure automatically in production. |

### Known limits in this release
- **Billing is a mock provider.** Plan changes do not charge or bill anyone.
- **No screen to create more super admins.** A developer promotes a user (database flag) or your identity provider maps them. Keep at least two, so one can unlock the other.
- **No screen to add a second owner to a business.** Planned.
- **Job queue** is a database outbox (no Redis/BullMQ yet); health shows its backlog.
- **Self-service password reset** is not available; administrators help users out of band.
- **Support session expiry** ends access at the expiry time; ending early is recommended.
- Backups, restore drills and observability dashboards belong to the deployment guide and are not part of this screen set.

---

## 10. Safety checklist for super admins

- [ ] Strong, unique password; MFA through your identity provider in production.
- [ ] At least two super admins.
- [ ] Reasons written for every action, with ticket numbers.
- [ ] Support sessions ended as soon as the task is done.
- [ ] Exports deleted from your device after delivery.
- [ ] Permanent deletions only with owner confirmation, an export and a backup.
- [ ] Exceptions reviewed monthly and removed when no longer needed.

---

*MeasureMate is under active development. If this manual and the screen disagree, trust the screen and correct the manual.*
