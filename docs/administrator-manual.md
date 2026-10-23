# MeasureMate Administrator Manual

**For:** business owners and branch managers who set up MeasureMate, look after staff access, and keep the business's data safe.
**Related manuals:** the *User Manual* (day-to-day work for staff) and the *Super Admin Manual* (for the people who run the MeasureMate service itself).

> **What is available today.** Business setup, branches, team and roles, plans, the audit log, and data export/deletion, plus customers and measurements (including templates). Order, payment and inventory administration will be added with those features; section 11 lists what is coming. This manual only describes screens that exist.

---

## 1. Who is an administrator?

| Role | Settings screens they can use |
|---|---|
| **Tenant Owner** | All of them: Business, Branches, Team, Plan, Audit log, Data & privacy. |
| **Branch Manager** | Branches, Team and Audit log. They cannot change business settings, the plan, or delete the business. |
| **Accountant**, **Read-Only Auditor** | Audit log only (view). |
| Everyone else | No Settings menu. |

You see **Settings** in the menu if your role includes at least one of those screens, and it opens on the first one you may use.

---

## 2. First-time setup (about 10 minutes)

1. **Register** your business (see the User Manual section 1, or the sign-up page). You become the **Tenant Owner** and start a free **14-day Professional trial**. No card is needed.
2. A **Main Branch**, 15 ready-made measurement templates, a starter price list and notification templates are created for you automatically.
3. Work through the **Getting started** checklist on the Dashboard:
   1. Review **Settings, Business** (currency, tax, numbering).
   2. Rename or add **Branches**.
   3. **Invite your team** and give each person the right role.
4. Add your first customers (User Manual section 3).

---

## 3. Business settings

**Settings, Business** (owners only). Tap **Save changes** when done; it turns on after you edit something.

### Business profile
Legal name, address, city and **brand colour**. These appear on documents and the customer portal when those features are released.

### Currency, tax and units
- **Country, currency, time zone**: set at registration. Change only if wrong.
- **Measurement unit**: inches or centimetres, used as the default display. Measurements are stored exactly (in millimetres), so switching later never loses accuracy.
- **Tax name** (GST, VAT, Sales tax ...), **default tax rate** and **tax registration number**: nothing assumes GST. Set the rate to `0` if you do not charge tax.
- **Prices already include tax**: tick if your quoted prices already contain tax.

### Numbering
Prefixes for customers, orders and invoices (for example `C-`, `ORD-`, `INV-`). Numbers count up automatically without gaps, separately for your business. Customer numbers are in use today; order and invoice numbers start with those features.

### Customer portal
- **Customers may view their own measurements**: off by default.
- **Customers may approve quotations online**: on by default.

These take effect when the portal is released.

---

## 4. Branches (your shops and workshops)

**Settings, Branches**. Each branch is one location. A single shop only needs the Main Branch.

- **Add:** *Add branch*, then name, short code (for example `MKT`; must be unique), optional city and phone.
- **Archive:** *Archive*, then confirm. The branch disappears from new work but history stays. A branch with open orders cannot be archived (this protects unfinished jobs once orders are released).
- Branch limits depend on your plan (section 6).

Staff with **branch-based roles** see only the branches you give them. Customers and measurements are currently shared across all branches of a business; branch limits will also apply to orders and payments when those arrive.

---

## 5. Team and roles

**Settings, Team**. Everyone has exactly one role per business, and the role decides what they can see and do.

### The roles

| Role | Typical person | What they can do today |
|---|---|---|
| **Tenant Owner** | You | Everything, including plan, settings, data export and deletion. |
| **Branch Manager** | Shop manager | Customers (add, edit, archive, merge, export), all measurement actions including restore and templates, branches, team, audit log. Not: plan, business settings. |
| **Receptionist** | Front desk | See and add/edit customers; see measurements and record a person's first measurements. |
| **Master Tailor** | Head tailor | See customers; record and change measurements; manage templates. |
| **Cutter, Stitcher, Quality Checker** | Workshop staff | See customers and measurements; record first measurements. |
| **Cashier** | Counter | See customers and measurements. (Payment and invoice rights apply when released.) |
| **Accountant** | Bookkeeper | See customers; Audit log. (Payment, invoice and report rights apply when released.) |
| **Read-Only Auditor** | Outside reviewer | View customers, measurements and the Audit log. Cannot change anything. |

*Branch-based roles* (Branch Manager, Receptionist, Master Tailor, Cutter, Stitcher, Quality Checker, Cashier) must be given at least one branch. *Business-wide roles* (Owner, Accountant, Auditor) work across all branches.

### Invite someone
1. **Invite**, then enter their **full name** and **email** and choose a **role**.
2. For branch-based roles, tick the **branches** they work in.
3. **Send invitation**.

What happens next:
- **New to MeasureMate:** they receive an invitation link, set a password and join. If email delivery is not configured for your installation, MeasureMate shows you the link; send it to them yourself (WhatsApp, SMS). It works **once** and expires in **7 days**. If it is lost or expired, tap **New invitation link** next to their name (shown while they are *Invited*).
- **Already a MeasureMate user** (for example they work in two businesses): they are added immediately with the role you chose, and can switch businesses from the name at the top left.

### Change someone's access
Tap **Edit access** next to a person, change their **role** and, for branch-based roles, their **branches**, then **Save**. Moving someone to a branch-based role without choosing a branch is refused, so nobody ends up with access to every branch by accident.

### Deactivate and reactivate
- **Deactivate** blocks their access to *your* business immediately. Their past work remains on record.
- **Reactivate** restores it.
- You cannot deactivate yourself, and the business must always keep **at least one active owner**.
- Owners cannot be edited from this screen. Adding a second owner is not yet available.

### When someone leaves or loses a phone
Deactivate them straight away. Then review **Audit log** for any unusual recent activity.

### Good practice
- One login per person. Never share accounts; the audit trail depends on it.
- Give the **lowest role** that lets someone do their job.
- Protect the owner login (strong password, never shared). Adding a second owner is not yet available in the app; it is planned.
- Review the Team list every few months.

---

## 6. Plans

**Settings, Plan** (owners only).

| Plan | Branches | Team members | Customers | Included |
|---|---|---|---|---|
| Starter | 1 | 3 | 300 | Core features |
| Professional | 3 | 15 | 5,000 | + inventory, reports, customer portal, branded documents |
| Business | 10 | 50 | 50,000 | Same as Professional, higher limits |
| Enterprise | Unlimited | Unlimited | Unlimited | Same, no limits |

- Prices shown are **examples** and payment is **simulated** in this release: choosing a plan switches it immediately without charging anyone.
- You cannot move to a plan that is smaller than what you already use. For example, with 3 branches you cannot move to Starter until you archive branches.
- When you reach a limit, MeasureMate says so and the action is refused until you upgrade or free up space.
- MeasureMate support may grant you a special exception (for example one extra branch). It appears in your Audit log.

---

## 7. Audit log

**Settings, Audit log** (owners, branch managers, accountants, auditors).

A permanent record of important actions: sign-ins, team changes, settings and plan changes, branch changes, customer creation/changes/merges/exports, measurement changes and restores, data exports, and any action by MeasureMate support staff.

- Use the filter with a prefix such as `customer.`, `measurement.`, `auth.` or `platform.`.
- **Details** shows who, when, from which address and what changed.
- Entries can never be edited or deleted. Passwords and secrets are never recorded.
- Anything beginning `platform.` was done by MeasureMate staff, with a reason; see section 10.

---

## 8. Customers and measurements as an administrator

Day-to-day use is in the User Manual. Managers and owners additionally can:

- **Archive / Restore** a customer who no longer visits.
- **Merge** accidental duplicates: open the customer you want to *keep*, tap **Merge**, choose the duplicate. People, measurements and notes move across; the duplicate is archived. Payment and invoice records stay as issued.
- **Export** customers to a spreadsheet (Customers, Export). Exports are logged. Spreadsheet formulas in names are neutralised so a malicious name cannot run code in Excel.
- **Restore** an older measurement revision (adds a new revision; nothing is overwritten).
- **Manage measurement templates** (Master Tailors can too): Measurements, then **Copy** a built-in template, then **Edit** your copy. You can rename sections, add or remove measurements, reorder them, mark them required, add help text and set "warn if below/above" limits (in cm).
  - Built-in templates cannot be edited; copy them first.
  - Editing a template never changes existing customers' saved measurements; they are stored by measurement key.

---

## 9. Your data and privacy

**Settings, Data & privacy** (owners only).

- **Export all data:** downloads customers, measurements, orders, payments and invoices as one file. Passwords and secrets are never included. Do this regularly and store it safely.
- **Delete this business:** type the **exact business name**. Access is **blocked immediately** and, after a grace period (14 days by default), MeasureMate staff permanently erase all of your records. User accounts are not erased because a person may belong to other businesses. **Export first**; this cannot be undone after the grace period. To cancel before it happens, contact MeasureMate support.
- Your records are completely separate from every other business. Other shops cannot see yours, and the system enforces this at the database level.
- Collect only what you need. Marking a customer's **offers and greetings** consent is your responsibility: only tick it when they agreed.

---

## 10. MeasureMate support access (what to expect)

MeasureMate staff cannot silently browse your customers or measurements. They see only counts and settings. If they need to look inside to help you, they must open a **support session**:
- read-only (they cannot change anything),
- time-limited (15 to 60 minutes),
- with a **reason**, and
- recorded in **your** Audit log (`platform.impersonation_started` and `..._ended`, with the reason).

Likewise a support **data export** records its reason in your Audit log. If you see platform activity you did not expect, contact MeasureMate support.

MeasureMate may also **suspend** a business (for example for unpaid bills). Everyone sees "This business account is currently suspended" until it is restored; data is kept.

---

## 11. What is coming

Not yet available: orders and the production board, trials and alterations, payments, receipts and invoices (and their numbering and tax settings in use), appointments and reminders, inventory and suppliers, reports and exports, the customer portal, and self-service password reset. Administration for these (price lists, workflow stages, notification templates, branch scope for orders) will be added to this manual as they are released.

---

## 12. Troubleshooting for administrators

| Problem | What to do |
|---|---|
| A team member cannot sign in | Check they are not **Deactivated** (Settings, Team). If locked out after 5 wrong passwords, they wait 15 minutes; MeasureMate support can unlock sooner. |
| Invitation link is invalid or lost | Links work once and expire in 7 days. In Settings, Team, tap **New invitation link** next to the pending person. |
| "A business must keep at least one active owner" | You are the only owner, so you cannot be demoted or deactivated. Adding further owners is planned. |
| "Choose at least one branch for this role" | Tick a branch for branch-based roles. |
| "Your plan allows up to N ..." | Upgrade in Settings, Plan, or archive/deactivate to free space. |
| "Branch has open orders" | Finish or move those orders before archiving the branch. |
| Someone sees too little or too much | Review their role in section 5 and use **Edit access**. |
| Settings menu is missing | Your role has no settings screens. Ask an owner. |

---

*MeasureMate is under active development. If this manual and the screen disagree, trust the screen and report it so the manual can be corrected.*
