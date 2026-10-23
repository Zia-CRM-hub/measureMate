import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';
import { randomUUID, randomBytes } from 'node:crypto';
import { RegisterTenantInput, ROLE_PERMISSIONS, RoleKey } from '@measuremate/validation';
import { AuditService } from '../../common/audit.service';
import { currentContext } from '../../common/context';
import { EntitlementsService } from '../../common/entitlements.service';
import { AppError, badRequest, conflict, forbidden } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { bootstrapTenant } from '../tenant/bootstrap';
import { SessionService } from './session.service';

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
const BAD_CREDENTIALS = () => new AppError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password');

@Injectable()
export class AuthService {
  constructor(
    private readonly db: PrismaService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    private readonly entitlements: EntitlementsService,
  ) {}

  hashPassword(pw: string) { return hash(pw); }

  async registerTenant(input: RegisterTenantInput) {
    let user = await this.db.user.findUnique({ where: { email: input.email } });
    if (user) {
      const ok = user.passwordHash ? await verify(user.passwordHash, input.password) : false;
      if (!ok) throw conflict('ACCOUNT_EXISTS', 'An account with this email already exists. Sign in to add another business.');
    } else {
      user = await this.db.user.create({
        data: { email: input.email, fullName: input.ownerName, passwordHash: await hash(input.password) },
      });
    }
    const tenantId = randomUUID();
    const slug = `${input.businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)}-${randomBytes(3).toString('hex')}`;
    const plan = await this.db.plan.findUniqueOrThrow({ where: { key: 'PROFESSIONAL' } });

    await this.db.run(async (tx) => {
      await tx.tenant.create({ data: { id: tenantId, name: input.businessName, slug } });
      await tx.tenantSettings.create({
        data: {
          tenantId, country: input.country, currency: input.currency, timeZone: input.timeZone,
          measurementUnit: input.measurementUnit, legalName: input.businessName,
        },
      });
      await tx.subscription.create({
        data: { tenantId, planId: plan.id, status: 'TRIALING', currentPeriodEnd: new Date(Date.now() + 14 * 86400_000) },
      });
      const branch = await tx.branch.create({ data: { tenantId, name: 'Main Branch', code: 'MAIN' } });
      await tx.tenantMembership.create({ data: { tenantId, userId: user!.id, roleKey: 'TENANT_OWNER', branchIds: [] } });
      await tx.employee.create({ data: { tenantId, userId: user!.id, title: 'Owner' } });
      await bootstrapTenant(tx, tenantId, user!.id);
      await tx.usageCounter.createMany({ data: [{ tenantId, key: 'customers', value: 0 }] });
      await this.audit.recordTx(tx, { tenantId, actorId: user!.id, action: 'tenant.registered', entityType: 'tenant', entityId: tenantId, metadata: { branchId: branch.id } });
    }, { tenantId, userId: user.id });

    const { token, session } = await this.sessions.create(user.id, { tenantId });
    return { token, sessionId: session.id, tenantId, userId: user.id };
  }

  async login(email: string, password: string) {
    const user = await this.db.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) { await hash('timing-equaliser'); throw BAD_CREDENTIALS(); }
    if (user.status !== 'ACTIVE') throw new AppError(403, 'ACCOUNT_DEACTIVATED', 'This account is deactivated');
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AppError(429, 'ACCOUNT_LOCKED', `Too many failed attempts. Try again in ${LOCK_MINUTES} minutes.`);
    }
    if (!(await verify(user.passwordHash, password))) {
      const failed = user.failedLogins + 1;
      await this.db.user.update({
        where: { id: user.id },
        data: { failedLogins: failed, lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null },
      });
      await this.audit.record({ action: 'auth.login_failed', actorId: user.id, entityType: 'user', entityId: user.id, metadata: { failed } });
      throw BAD_CREDENTIALS();
    }
    await this.db.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });

    const memberships = await this.db.run((tx) => tx.tenantMembership.findMany({
      where: { userId: user.id, status: 'ACTIVE' }, orderBy: { createdAt: 'asc' },
    }), { tenantId: null, userId: user.id });
    const { token, session } = await this.sessions.create(user.id, { tenantId: memberships[0]?.tenantId ?? null });
    await this.audit.record({ action: 'auth.login', actorId: user.id, tenantId: session.activeTenantId, entityType: 'user', entityId: user.id });
    return { token, sessionId: session.id, userId: user.id };
  }

  async me() {
    const c = currentContext();
    const [memberships, announcements] = await Promise.all([
      this.db.run((tx) => tx.tenantMembership.findMany({
        where: { userId: c.userId, status: 'ACTIVE' }, include: { tenant: { select: { id: true, name: true, status: true } } },
      }), { tenantId: null, userId: c.userId }),
      this.db.platformAnnouncement.findMany({ where: { active: true }, orderBy: { createdAt: 'desc' }, take: 3 }),
    ]);
    let tenant: unknown = null;
    if (c.tenantId) {
      const [t, ent] = await Promise.all([
        this.db.run((tx) => tx.tenant.findUnique({ where: { id: c.tenantId! }, include: { settings: true } })),
        this.entitlements.get(c.tenantId),
      ]);
      if (t) {
        const s = t.settings;
        tenant = {
          id: t.id, name: t.name, slug: t.slug, status: t.status,
          settings: s && {
            currency: s.currency, country: s.country, timeZone: s.timeZone, measurementUnit: s.measurementUnit,
            taxLabel: s.taxLabel, brandColor: s.brandColor, locale: s.locale, dateFormat: s.dateFormat, taxInclusive: s.taxInclusive,
          },
          entitlements: ent,
        };
      }
    }
    return {
      user: { id: c.userId, email: c.userEmail, fullName: c.fullName, isPlatformAdmin: c.isPlatformAdmin },
      activeTenant: tenant,
      role: c.role, branchIds: c.branchIds, permissions: c.permissions, customerId: c.customerId,
      tenants: memberships.map((m) => ({ id: m.tenant.id, name: m.tenant.name, role: m.roleKey })),
      impersonation: c.impersonatorId ? { reason: c.impersonationReason, expiresAt: c.sessionExpiresAt } : null,
      announcements,
    };
  }

  async switchTenant(tenantId: string) {
    const c = currentContext();
    // Membership is checked under the user's own identity — tenant id from the browser is never trusted.
    const m = await this.db.run((tx) => tx.tenantMembership.findFirst({
      where: { tenantId, userId: c.userId, status: 'ACTIVE' }, include: { tenant: true },
    }), { tenantId, userId: c.userId });
    if (!m) throw forbidden('You do not have access to that business');
    if (m.tenant.status !== 'ACTIVE') throw new AppError(403, 'TENANT_SUSPENDED', 'That business account is suspended');
    await this.db.session.update({ where: { id: c.sessionId }, data: { activeTenantId: tenantId } });
    await this.audit.record({ action: 'auth.tenant_switched', tenantId, entityType: 'tenant', entityId: tenantId });
    return { tenantId, role: m.roleKey as RoleKey, permissions: ROLE_PERMISSIONS[m.roleKey as RoleKey] };
  }

  async acceptInvite(token: string, password: string, fullName?: string) {
    const claims = await this.sessions.verifyInvite(token);
    if (!claims) throw badRequest('INVALID_INVITE', 'This invitation link is invalid or has expired');
    const user = await this.db.user.findUnique({ where: { id: claims.userId } });
    if (!user || user.status !== 'ACTIVE') throw badRequest('INVALID_INVITE', 'This invitation link is invalid or has expired');
    const passwordHash = await hash(password);
    // The invitation must still be pending *before* any credential changes: a used or stale link must never reset a password.
    await this.db.run(async (tx) => {
      const claimed = await tx.tenantMembership.updateMany({
        where: { tenantId: claims.tenantId, userId: user.id, status: 'INVITED' }, data: { status: 'ACTIVE' },
      });
      if (claimed.count === 0) throw badRequest('INVALID_INVITE', 'This invitation was already used or is no longer valid');
      await tx.$executeRaw`UPDATE users SET "passwordHash" = ${passwordHash}, "fullName" = ${fullName?.trim() || user.fullName}, "updatedAt" = now() WHERE id = ${user.id}::uuid`;
      await this.audit.recordTx(tx, { tenantId: claims.tenantId, actorId: user.id, action: 'auth.invite_accepted', entityType: 'user', entityId: user.id });
    }, { tenantId: claims.tenantId, userId: user.id });
    const { token: sessionToken, session } = await this.sessions.create(user.id, { tenantId: claims.tenantId });
    return { token: sessionToken, sessionId: session.id };
  }
}
