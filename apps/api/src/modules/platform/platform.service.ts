import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { hash } from '@node-rs/argon2';
import { Prisma } from '@prisma/client';
import { AuditService } from '../../common/audit.service';
import { loadConfig } from '../../common/config';
import { currentContext } from '../../common/context';
import { EntitlementsService } from '../../common/entitlements.service';
import { badRequest, conflict, forbidden, notFound } from '../../common/errors';
import { PLANS } from '../../common/plans';
import { PrismaService, Tx } from '../../common/prisma.service';
import { SessionService } from '../auth/session.service';
import { buildTenantExport } from '../tenant/export';

const OVERRIDE_FEATURES = ['inventory', 'reports', 'portal', 'multi_branch', 'pdf_branding'];
export const OVERRIDE_KEYS = ['max_branches', 'max_employees', 'max_customers', ...OVERRIDE_FEATURES.map((f) => `feature.${f}`)];

/** Delete order (children before parents) for the tenant purge. */
const PURGE_ORDER = [
  'notification_logs', 'notification_jobs', 'notification_templates', 'comments', 'attachments', 'inventory_transactions',
  'inventory_items', 'suppliers', 'credit_notes', 'refunds', 'payment_allocations', 'payments', 'invoice_items', 'invoices',
  'quotations', 'price_list_items', 'price_lists', 'appointments', 'quality_checks', 'alterations', 'trials',
  'order_item_assignments', 'order_status_history', 'order_items', 'orders', 'measurement_values', 'style_preferences',
  'measurement_revisions', 'measurement_profiles', 'measurement_template_fields', 'measurement_template_sections',
  'measurement_templates', 'saved_filters', 'customer_tags', 'tags', 'customer_consents', 'customer_contacts',
  'household_members', 'households', 'customers', 'production_stages', 'idempotency_keys', 'usage_counters', 'sequences',
  'tenant_entitlement_overrides', 'employees', 'tenant_memberships', 'branches', 'subscriptions', 'tenant_settings', 'audit_events',
];

@Injectable()
export class PlatformService implements OnModuleInit {
  private readonly log = new Logger('Platform');
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
    private readonly entitlements: EntitlementsService,
    private readonly sessions: SessionService,
  ) {}

  /** Creates/updates the first platform administrator from environment variables (never from code defaults). */
  async onModuleInit() {
    const cfg = loadConfig();
    if (!cfg.PLATFORM_ADMIN_EMAIL || !cfg.PLATFORM_ADMIN_PASSWORD) return;
    if (cfg.PLATFORM_ADMIN_PASSWORD.length < 12) { this.log.error('PLATFORM_ADMIN_PASSWORD must be at least 12 characters; admin not created'); return; }
    const email = cfg.PLATFORM_ADMIN_EMAIL.toLowerCase();
    const existing = await this.db.user.findUnique({ where: { email } });
    if (existing) {
      if (!existing.isPlatformAdmin) await this.db.user.update({ where: { id: existing.id }, data: { isPlatformAdmin: true } });
      return; // never overwrite an existing password from the environment
    }
    await this.db.user.create({ data: { email, fullName: 'Platform Administrator', passwordHash: await hash(cfg.PLATFORM_ADMIN_PASSWORD), isPlatformAdmin: true } });
    this.log.log(`Platform administrator created: ${email}`);
  }

  private run<T>(fn: (tx: Tx) => Promise<T>, timeout?: number) { return this.db.run(fn, { platform: true, tenantId: null, timeout }); }

  // ───── overview & health ─────
  overview() {
    return this.run(async (tx) => {
      const [byStatus, subs, users, customers, orders] = await Promise.all([
        tx.tenant.groupBy({ by: ['status'], _count: true }),
        tx.subscription.findMany({ select: { status: true, plan: { select: { key: true } } } }),
        tx.user.count(), tx.customer.count(), tx.order.count(),
      ]);
      const byPlan: Record<string, number> = {};
      for (const s of subs) byPlan[s.plan.key] = (byPlan[s.plan.key] ?? 0) + 1;
      const since = new Date(Date.now() - 30 * 86400_000);
      return {
        tenants: Object.fromEntries(byStatus.map((x) => [x.status, x._count])), byPlan,
        trialing: subs.filter((s) => s.status === 'TRIALING').length, pastDue: subs.filter((s) => s.status === 'PAST_DUE').length,
        users, customers, orders, newTenants30d: await tx.tenant.count({ where: { createdAt: { gte: since } } }),
      };
    });
  }

  async health() {
    const t0 = Date.now();
    await this.db.$queryRaw`SELECT 1`;
    const dbMs = Date.now() - t0;
    const jobs = await this.run(async (tx) => {
      const g = await tx.notificationJob.groupBy({ by: ['status'], _count: true });
      const oldest = await tx.notificationJob.findFirst({ where: { status: 'PENDING' }, orderBy: { scheduledFor: 'asc' }, select: { scheduledFor: true } });
      const failed = await tx.notificationJob.count({ where: { status: 'FAILED', createdAt: { gte: new Date(Date.now() - 86400_000) } } });
      return { byStatus: Object.fromEntries(g.map((x) => [x.status, x._count])), oldestPendingAgeSec: oldest ? Math.max(0, Math.round((Date.now() - +oldest.scheduledFor) / 1000)) : 0, failedLast24h: failed };
    });
    const mem = process.memoryUsage();
    return {
      status: dbMs < 1000 ? 'ok' : 'degraded', checkedAt: new Date().toISOString(),
      database: { status: 'up', latencyMs: dbMs }, queue: { kind: 'database outbox (notification_jobs)', ...jobs },
      process: { uptimeSec: Math.round(process.uptime()), rssMb: Math.round(mem.rss / 1048576), heapUsedMb: Math.round(mem.heapUsed / 1048576), node: process.version },
      dependencies: { redis: 'not used in this deployment', objectStorage: 'local disk' },
    };
  }

  // ───── tenants ─────
  async listTenants(p: { q?: string; status?: string; plan?: string; page: number; pageSize: number }) {
    return this.run(async (tx) => {
      const where: Prisma.TenantWhereInput = {
        ...(p.status ? { status: p.status } : {}),
        ...(p.plan ? { subscription: { plan: { key: p.plan } } } : {}),
        ...(p.q ? { OR: [
          { name: { contains: p.q, mode: 'insensitive' } }, { slug: { contains: p.q, mode: 'insensitive' } },
          { memberships: { some: { user: { email: { contains: p.q, mode: 'insensitive' } } } } },
        ] } : {}),
      };
      const [rows, total] = await Promise.all([
        tx.tenant.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (p.page - 1) * p.pageSize, take: p.pageSize, include: { subscription: { include: { plan: true } }, settings: { select: { country: true, currency: true } } } }),
        tx.tenant.count({ where }),
      ]);
      const ids = rows.map((r) => r.id);
      const [branches, customers, orders, members, owners] = await Promise.all([
        tx.branch.groupBy({ by: ['tenantId'], where: { tenantId: { in: ids }, archivedAt: null }, _count: true }),
        tx.customer.groupBy({ by: ['tenantId'], where: { tenantId: { in: ids } }, _count: true }),
        tx.order.groupBy({ by: ['tenantId'], where: { tenantId: { in: ids } }, _count: true }),
        tx.tenantMembership.groupBy({ by: ['tenantId'], where: { tenantId: { in: ids }, status: 'ACTIVE', customerId: null }, _count: true }),
        tx.tenantMembership.findMany({ where: { tenantId: { in: ids }, roleKey: 'TENANT_OWNER' }, include: { user: { select: { email: true, fullName: true } } } }),
      ]);
      const count = (g: { tenantId: string; _count: number }[], id: string) => g.find((x) => x.tenantId === id)?._count ?? 0;
      return {
        total,
        data: rows.map((t) => ({
          id: t.id, name: t.name, slug: t.slug, status: t.status, createdAt: t.createdAt, country: t.settings?.country, currency: t.settings?.currency,
          plan: t.subscription?.plan.key ?? null, subscriptionStatus: t.subscription?.status ?? null, periodEnd: t.subscription?.currentPeriodEnd ?? null,
          branches: count(branches, t.id), customers: count(customers, t.id), orders: count(orders, t.id), staff: count(members, t.id),
          owner: owners.find((o) => o.tenantId === t.id)?.user ?? null,
        })),
      };
    });
  }

  async tenantDetail(id: string) {
    return this.run(async (tx) => {
      const t = await tx.tenant.findUnique({ where: { id }, include: { subscription: { include: { plan: true } }, settings: true } });
      if (!t) throw notFound('Business');
      const [branches, members, overrides, recentAudit, customers, orders, counts] = await Promise.all([
        tx.branch.findMany({ where: { tenantId: id }, orderBy: { name: 'asc' }, select: { id: true, name: true, code: true, city: true, archivedAt: true } }),
        tx.tenantMembership.findMany({ where: { tenantId: id, customerId: null }, include: { user: { select: { id: true, email: true, fullName: true, status: true } } }, orderBy: { createdAt: 'asc' } }),
        tx.tenantEntitlementOverride.findMany({ where: { tenantId: id } }),
        tx.auditEvent.findMany({ where: { tenantId: id }, orderBy: { createdAt: 'desc' }, take: 15, select: { id: true, action: true, entityType: true, createdAt: true, impersonatorId: true } }),
        tx.customer.count({ where: { tenantId: id } }), tx.order.count({ where: { tenantId: id } }), Promise.resolve(null),
      ]);
      void counts;
      const ent = await this.entitlements.get(id, tx);
      const s = t.settings;
      return {
        id: t.id, name: t.name, slug: t.slug, status: t.status, createdAt: t.createdAt, deletionRequestedAt: t.deletionRequestedAt,
        settings: s && { country: s.country, currency: s.currency, timeZone: s.timeZone, legalName: s.legalName },
        subscription: t.subscription && { plan: t.subscription.plan.key, status: t.subscription.status, provider: t.subscription.provider, periodEnd: t.subscription.currentPeriodEnd },
        entitlements: ent, overrides,
        usage: { branches: branches.filter((b) => !b.archivedAt).length, staff: members.filter((m) => m.status === 'ACTIVE').length, customers, orders },
        branches, team: members.map((m) => ({ userId: m.userId, email: m.user.email, fullName: m.user.fullName, role: m.roleKey, status: m.status, userStatus: m.user.status })),
        recentAudit,
      };
    });
  }

  async setPlan(id: string, planKey: string, status?: string) {
    const plan = await this.db.plan.findUnique({ where: { key: planKey } });
    if (!plan) throw badRequest('UNKNOWN_PLAN', 'Unknown plan');
    await this.run(async (tx) => {
      const sub = await tx.subscription.findUnique({ where: { tenantId: id } });
      if (!sub) throw notFound('Subscription');
      await tx.subscription.update({ where: { tenantId: id }, data: { planId: plan.id, ...(status ? { status } : {}), provider: 'platform-admin' } });
      await this.audit.recordTx(tx, { tenantId: id, action: 'platform.plan_changed', entityType: 'subscription', entityId: id, metadata: { plan: planKey, status, by: 'platform' } });
    });
    this.entitlements.invalidate(id);
    return { ok: true, plan: PLANS.find((p) => p.key === planKey)?.name };
  }

  async setOverride(id: string, key: string, body: { intValue?: number; enabled?: boolean; note?: string }) {
    if (!OVERRIDE_KEYS.includes(key)) throw badRequest('UNKNOWN_KEY', 'Unknown entitlement');
    if (key.startsWith('feature.') ? body.enabled === undefined : body.intValue === undefined) throw badRequest('VALUE_REQUIRED', key.startsWith('feature.') ? 'Choose on or off' : 'Enter a limit (-1 for unlimited)');
    await this.run(async (tx) => {
      if (!(await tx.tenant.findUnique({ where: { id } }))) throw notFound('Business');
      await tx.tenantEntitlementOverride.upsert({
        where: { tenantId_key: { tenantId: id, key } }, update: { intValue: body.intValue ?? null, enabled: body.enabled ?? null, note: body.note, setBy: currentContext().userId },
        create: { tenantId: id, key, intValue: body.intValue ?? null, enabled: body.enabled ?? null, note: body.note, setBy: currentContext().userId },
      });
      await this.audit.recordTx(tx, { tenantId: id, action: 'platform.entitlement_override_set', entityType: 'tenant', entityId: id, metadata: { key, ...body } });
    });
    this.entitlements.invalidate(id);
    return { ok: true };
  }

  async removeOverride(id: string, key: string) {
    await this.run(async (tx) => {
      await tx.tenantEntitlementOverride.deleteMany({ where: { tenantId: id, key } });
      await this.audit.recordTx(tx, { tenantId: id, action: 'platform.entitlement_override_removed', entityType: 'tenant', entityId: id, metadata: { key } });
    });
    this.entitlements.invalidate(id);
    return { ok: true };
  }

  async suspend(id: string, reason: string) {
    return this.run(async (tx) => {
      const t = await tx.tenant.findUnique({ where: { id } });
      if (!t) throw notFound('Business');
      if (t.status === 'DELETED') throw conflict('DELETED', 'This business has been deleted');
      await tx.tenant.update({ where: { id }, data: { status: 'SUSPENDED' } });
      await this.audit.recordTx(tx, { tenantId: id, action: 'platform.tenant_suspended', entityType: 'tenant', entityId: id, metadata: { reason } });
      return { status: 'SUSPENDED' };
    });
  }

  async restore(id: string, reason: string) {
    return this.run(async (tx) => {
      const t = await tx.tenant.findUnique({ where: { id } });
      if (!t) throw notFound('Business');
      await tx.tenant.update({ where: { id }, data: { status: 'ACTIVE', deletionRequestedAt: null } });
      await this.audit.recordTx(tx, { tenantId: id, action: 'platform.tenant_restored', entityType: 'tenant', entityId: id, metadata: { reason, from: t.status } });
      return { status: 'ACTIVE' };
    });
  }

  async impersonate(id: string, reason: string, minutes: number) {
    const c = currentContext();
    const t = await this.run((tx) => tx.tenant.findUnique({ where: { id } }));
    if (!t) throw notFound('Business');
    const { token, session } = await this.sessions.create(c.userId, { tenantId: id, impersonatorId: c.userId, reason, hours: minutes / 60 });
    await this.audit.record({ tenantId: id, actorId: c.userId, action: 'platform.impersonation_started', entityType: 'tenant', entityId: id, metadata: { reason, minutes, sessionId: session.id } });
    return { token, tenantName: t.name, expiresAt: session.expiresAt };
  }

  async endImpersonation() {
    const c = currentContext();
    if (!c.impersonatorId) throw badRequest('NOT_IMPERSONATING', 'No support session is active');
    await this.sessions.revoke(c.sessionId);
    await this.audit.record({ tenantId: c.tenantId, actorId: c.userId, action: 'platform.impersonation_ended', entityType: 'tenant', entityId: c.tenantId ?? undefined });
    const { token } = await this.sessions.create(c.userId, { tenantId: null });
    return { token };
  }

  /** Platform-initiated data export. Requires a reason and leaves a tenant-visible audit event. */
  async exportTenant(id: string, reason: string) {
    return this.db.run(async (tx) => {
      if (!(await tx.tenant.findUnique({ where: { id } }))) throw notFound('Business');
      const data = await buildTenantExport(tx, id);
      await this.audit.recordTx(tx, { tenantId: id, action: 'platform.tenant_exported', entityType: 'tenant', entityId: id, metadata: { reason } });
      return data;
    }, { platform: true, tenantId: id, timeout: 120000 });
  }

  /** Permanently deletes a tenant that requested deletion and has passed the grace period. */
  async purge(id: string, confirmSlug: string, reason: string) {
    const graceDays = Number(process.env.TENANT_DELETION_GRACE_DAYS ?? 14);
    const t = await this.run((tx) => tx.tenant.findUnique({ where: { id } }));
    if (!t) throw notFound('Business');
    if (t.slug !== confirmSlug) throw badRequest('CONFIRMATION_MISMATCH', 'Type the business slug exactly to confirm');
    if (t.status !== 'PENDING_DELETION' || !t.deletionRequestedAt) throw conflict('NOT_PENDING_DELETION', 'The business owner must request deletion first');
    const eligible = new Date(t.deletionRequestedAt.getTime() + graceDays * 86400_000);
    if (eligible > new Date()) throw conflict('GRACE_PERIOD', `Deletion is allowed after ${eligible.toISOString().slice(0, 10)} (${graceDays}-day grace period)`);
    await this.db.run(async (tx) => {
      const counts: Record<string, number> = {};
      for (const table of PURGE_ORDER) {
        counts[table] = await tx.$executeRawUnsafe(`DELETE FROM "${table}" WHERE "tenantId" = $1::uuid`, id);
      }
      await tx.tenant.delete({ where: { id } });
      await this.audit.recordTx(tx, { tenantId: null, action: 'platform.tenant_purged', entityType: 'tenant', entityId: id, metadata: { slug: t.slug, name: t.name, reason, deletedRows: counts } });
    }, { platform: true, purge: true, tenantId: null, timeout: 120000 });
    this.entitlements.invalidate(id);
    return { ok: true };
  }

  // ───── users ─────
  async listUsers(p: { q?: string; page: number; pageSize: number }) {
    return this.run(async (tx) => {
      const where: Prisma.UserWhereInput = p.q ? { OR: [{ email: { contains: p.q, mode: 'insensitive' } }, { fullName: { contains: p.q, mode: 'insensitive' } }] } : {};
      const [rows, total] = await Promise.all([tx.user.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (p.page - 1) * p.pageSize, take: p.pageSize }), tx.user.count({ where })]);
      const m = await tx.tenantMembership.groupBy({ by: ['userId'], where: { userId: { in: rows.map((r) => r.id) } }, _count: true });
      return { total, data: rows.map((u) => ({ id: u.id, email: u.email, fullName: u.fullName, status: u.status, isPlatformAdmin: u.isPlatformAdmin, lockedUntil: u.lockedUntil, createdAt: u.createdAt, businesses: m.find((x) => x.userId === u.id)?._count ?? 0 })) };
    });
  }

  async setUserStatus(id: string, status: 'ACTIVE' | 'DEACTIVATED') {
    const c = currentContext();
    if (id === c.userId) throw forbidden('You cannot deactivate your own account');
    const u = await this.db.user.findUnique({ where: { id } });
    if (!u) throw notFound('User');
    await this.db.user.update({ where: { id }, data: { status } });
    if (status === 'DEACTIVATED') await this.sessions.revokeAllForUser(id);
    await this.audit.record({ action: status === 'DEACTIVATED' ? 'platform.user_deactivated' : 'platform.user_reactivated', entityType: 'user', entityId: id, metadata: { email: u.email } });
    return { ok: true };
  }

  async unlockUser(id: string) {
    const r = await this.db.user.updateMany({ where: { id }, data: { failedLogins: 0, lockedUntil: null } });
    if (!r.count) throw notFound('User');
    await this.audit.record({ action: 'platform.user_unlocked', entityType: 'user', entityId: id });
    return { ok: true };
  }

  // ───── announcements & flags ─────
  announcements() { return this.db.platformAnnouncement.findMany({ orderBy: { createdAt: 'desc' } }); }
  async createAnnouncement(b: { title: string; body: string }) {
    const a = await this.db.platformAnnouncement.create({ data: b });
    await this.audit.record({ action: 'platform.announcement_created', entityType: 'announcement', entityId: a.id, metadata: { title: b.title } });
    return a;
  }
  async updateAnnouncement(id: string, b: { active?: boolean; title?: string; body?: string }) {
    const r = await this.db.platformAnnouncement.updateMany({ where: { id }, data: b });
    if (!r.count) throw notFound('Announcement');
    await this.audit.record({ action: 'platform.announcement_updated', entityType: 'announcement', entityId: id, metadata: b });
    return { ok: true };
  }
  async deleteAnnouncement(id: string) {
    await this.db.platformAnnouncement.deleteMany({ where: { id } });
    await this.audit.record({ action: 'platform.announcement_deleted', entityType: 'announcement', entityId: id });
    return { ok: true };
  }
  flags() { return this.db.featureFlag.findMany({ orderBy: { key: 'asc' } }); }
  async setFlag(key: string, b: { enabled: boolean; description?: string }) {
    const f = await this.db.featureFlag.upsert({ where: { key }, update: b, create: { key, ...b } });
    await this.audit.record({ action: 'platform.feature_flag_set', entityType: 'feature_flag', entityId: key, metadata: b });
    return f;
  }
  async deleteFlag(key: string) {
    await this.db.featureFlag.deleteMany({ where: { key } });
    await this.audit.record({ action: 'platform.feature_flag_deleted', entityType: 'feature_flag', entityId: key });
    return { ok: true };
  }

  // ───── audit review ─────
  async auditEvents(p: { tenantId?: string; action?: string; page: number; pageSize: number }) {
    return this.run(async (tx) => {
      const where: Prisma.AuditEventWhereInput = { ...(p.tenantId ? { tenantId: p.tenantId } : {}), ...(p.action ? { action: { startsWith: p.action } } : {}) };
      const [rows, total] = await Promise.all([
        tx.auditEvent.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (p.page - 1) * p.pageSize, take: p.pageSize }), tx.auditEvent.count({ where }),
      ]);
      return { total, data: rows };
    });
  }
}
