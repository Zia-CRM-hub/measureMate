import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { branchSchema, inviteEmployeeSchema, ROLE_PERMISSIONS, ROLE_KEYS, ROLE_LABELS, TENANT_WIDE_ROLES, RoleKey } from '@measuremate/validation';
import { AuditService } from '../../common/audit.service';
import { currentContext, currentTenantId } from '../../common/context';
import { Perm, Validates, ValidatesQuery } from '../../common/decorators';
import { EntitlementsService } from '../../common/entitlements.service';
import { badRequest, conflict, forbidden, notFound } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { Q, paginationShape, paged } from '../../common/query';
import { loadConfig } from '../../common/config';
import { AuthService } from '../auth/auth.service';
import { SessionService } from '../auth/session.service';
import { PLANS } from '../../common/plans';
import { buildTenantExport } from './export';

const settingsSchema = z.object({
  legalName: z.string().max(160).optional(), addressLine1: z.string().max(200).optional(), city: z.string().max(100).optional(),
  country: z.string().length(2).toUpperCase().optional(), currency: z.string().length(3).toUpperCase().optional(),
  timeZone: z.string().max(60).optional(), taxLabel: z.string().max(20).optional(), taxId: z.string().max(40).optional(),
  taxInclusive: z.boolean().optional(), defaultTaxPercent: z.string().regex(/^\d{1,3}(\.\d{1,4})?$/).optional(),
  measurementUnit: z.enum(['cm', 'in']).optional(), dateFormat: z.string().max(20).optional(), locale: z.string().max(10).optional(),
  invoicePrefix: z.string().max(10).optional(), orderPrefix: z.string().max(10).optional(), customerPrefix: z.string().max(10).optional(),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(), retentionDays: z.number().int().min(30).max(36500).optional(),
  portalShowMeasurements: z.boolean().optional(), portalQuoteApproval: z.boolean().optional(),
  workingHours: z.record(z.string(), z.string()).optional(),
  notificationSettings: z.record(z.string(), z.boolean()).optional(),
});
const memberUpdateSchema = z.object({
  role: inviteEmployeeSchema.shape.role.optional(), branchIds: z.array(z.string().uuid()).optional(),
  status: z.enum(['ACTIVE', 'DEACTIVATED']).optional(),
});
const planSchema = z.object({ planKey: z.enum(['STARTER', 'PROFESSIONAL', 'BUSINESS', 'ENTERPRISE']) });
const auditQuery = z.object({ ...paginationShape, action: z.string().optional(), entityType: z.string().optional(), entityId: z.string().optional() });

@ApiTags('Tenant')
@Controller()
export class TenantController {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
    private readonly entitlements: EntitlementsService,
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
  ) {}

  // ───── settings ─────
  @Get('tenant/settings') @Perm('tenant.settings.manage')
  async getSettings() {
    return this.db.run((tx) => tx.tenantSettings.findUniqueOrThrow({ where: { tenantId: currentTenantId() } }));
  }

  @Patch('tenant/settings') @Perm('tenant.settings.manage') @Validates(settingsSchema)
  async updateSettings(@Body() body: z.infer<typeof settingsSchema>) {
    const tenantId = currentTenantId();
    return this.db.run(async (tx) => {
      const { workingHours, notificationSettings, ...rest } = body;
      const s = await tx.tenantSettings.update({
        where: { tenantId },
        data: { ...rest, ...(workingHours ? { workingHours } : {}), ...(notificationSettings ? { notificationSettings } : {}) },
      });
      await this.audit.recordTx(tx, { action: 'tenant.settings_updated', entityType: 'tenant', entityId: tenantId, metadata: body });
      return s;
    });
  }

  @Get('tenant/entitlements') @Perm('tenant.settings.manage')
  async ents() { return this.entitlements.get(currentTenantId()); }

  @Get('tenant/plans') @Perm('tenant.settings.manage')
  plans() { return PLANS; }

  /** Provider-neutral subscription change. The mock provider activates immediately. */
  @Post('tenant/subscription') @Perm('subscription.manage') @HttpCode(200) @Validates(planSchema)
  async changePlan(@Body() body: z.infer<typeof planSchema>) {
    const tenantId = currentTenantId();
    const plan = await this.db.plan.findUniqueOrThrow({ where: { key: body.planKey } });
    const result = await this.db.run(async (tx) => {
      const [branches, employees] = await Promise.all([
        tx.branch.count({ where: { tenantId, archivedAt: null } }), tx.employee.count({ where: { tenantId, active: true } }),
      ]);
      const def = PLANS.find((p) => p.key === body.planKey)!;
      if (def.limits.max_branches! >= 0 && branches > def.limits.max_branches!) throw conflict('DOWNGRADE_BLOCKED', `You have ${branches} branches; the ${def.name} plan allows ${def.limits.max_branches}. Archive branches first.`);
      if (def.limits.max_employees! >= 0 && employees > def.limits.max_employees!) throw conflict('DOWNGRADE_BLOCKED', `You have ${employees} employees; the ${def.name} plan allows ${def.limits.max_employees}.`);
      const sub = await tx.subscription.update({
        where: { tenantId },
        data: { planId: plan.id, status: 'ACTIVE', provider: 'mock', providerRef: `mock_${randomBytes(4).toString('hex')}`, currentPeriodEnd: new Date(Date.now() + 30 * 86400_000) },
      });
      await this.audit.recordTx(tx, { action: 'subscription.changed', entityType: 'subscription', entityId: tenantId, metadata: { plan: body.planKey } });
      return sub;
    });
    this.entitlements.invalidate(tenantId);
    return result;
  }

  // ───── branches ─────
  @Get('branches') @Perm('customer.view')
  async branches() {
    const c = currentContext();
    return this.db.run((tx) => tx.branch.findMany({
      where: { tenantId: c.tenantId!, archivedAt: null, ...(c.branchIds.length ? { id: { in: c.branchIds } } : {}) },
      orderBy: { name: 'asc' },
    }));
  }

  @Post('branches') @Perm('branch.manage') @Validates(branchSchema)
  async createBranch(@Body() body: z.infer<typeof branchSchema>) {
    const tenantId = currentTenantId();
    return this.db.run(async (tx) => {
      await this.entitlements.assertWithinLimit(tx, tenantId, 'max_branches', await tx.branch.count({ where: { tenantId, archivedAt: null } }));
      if (await tx.branch.findFirst({ where: { tenantId, code: body.code } })) throw conflict('BRANCH_CODE_EXISTS', `Branch code ${body.code} is already used`);
      const b = await tx.branch.create({ data: { ...body, tenantId } });
      await this.audit.recordTx(tx, { action: 'branch.created', entityType: 'branch', entityId: b.id, metadata: body });
      return b;
    });
  }

  @Patch('branches/:id') @Perm('branch.manage') @Validates(branchSchema.partial())
  async updateBranch(@Param('id', ParseUUIDPipe) id: string, @Body() body: Partial<z.infer<typeof branchSchema>>) {
    const tenantId = currentTenantId();
    return this.db.run(async (tx) => {
      const r = await tx.branch.updateMany({ where: { id, tenantId }, data: body });
      if (!r.count) throw notFound('Branch');
      await this.audit.recordTx(tx, { action: 'branch.updated', entityType: 'branch', entityId: id, metadata: body });
      return tx.branch.findUniqueOrThrow({ where: { id } });
    });
  }

  @Delete('branches/:id') @Perm('branch.manage')
  async archiveBranch(@Param('id', ParseUUIDPipe) id: string) {
    const tenantId = currentTenantId();
    return this.db.run(async (tx) => {
      const open = await tx.order.count({ where: { tenantId, branchId: id, status: { notIn: ['DELIVERED', 'CLOSED', 'CANCELLED'] } } });
      if (open) throw conflict('BRANCH_HAS_OPEN_ORDERS', `This branch has ${open} open orders. Complete or move them first.`);
      const r = await tx.branch.updateMany({ where: { id, tenantId }, data: { archivedAt: new Date() } });
      if (!r.count) throw notFound('Branch');
      await this.audit.recordTx(tx, { action: 'branch.archived', entityType: 'branch', entityId: id });
      return { ok: true };
    });
  }

  // ───── employees & roles ─────
  @Get('roles') @Perm('employee.manage')
  roles() {
    return ROLE_KEYS.filter((r) => r !== 'PLATFORM_ADMIN' && r !== 'CUSTOMER_PORTAL_USER')
      .map((key) => ({ key, name: ROLE_LABELS[key], permissions: ROLE_PERMISSIONS[key], tenantWide: TENANT_WIDE_ROLES.includes(key) }));
  }

  @Get('employees') @Perm('employee.manage')
  async employees() {
    const tenantId = currentTenantId();
    return this.db.run(async (tx) => {
      const ms = await tx.tenantMembership.findMany({ where: { tenantId, customerId: null }, include: { user: { select: { id: true, email: true, fullName: true } } }, orderBy: { createdAt: 'asc' } });
      return ms.map((m) => ({ membershipId: m.id, userId: m.userId, email: m.user.email, fullName: m.user.fullName, role: m.roleKey, branchIds: m.branchIds, status: m.status }));
    });
  }

  /** Assignable staff (names only) for dropdowns; available to anyone who can assign work. */
  @Get('staff') @Perm('order.view')
  async staff() {
    const tenantId = currentTenantId();
    return this.db.run(async (tx) => {
      const ms = await tx.tenantMembership.findMany({ where: { tenantId, status: 'ACTIVE', customerId: null }, include: { user: { select: { id: true, fullName: true } } } });
      return ms.map((m) => ({ userId: m.userId, fullName: m.user.fullName, role: m.roleKey, branchIds: m.branchIds }));
    });
  }

  @Post('employees/invite') @Perm('employee.manage') @Validates(inviteEmployeeSchema)
  async invite(@Body() body: z.infer<typeof inviteEmployeeSchema>) {
    const tenantId = currentTenantId();
    const role = body.role as RoleKey;
    if (!TENANT_WIDE_ROLES.includes(role) && body.branchIds.length === 0) throw badRequest('BRANCH_REQUIRED', 'Choose at least one branch for this role');
    let user = await this.db.user.findUnique({ where: { email: body.email } });
    const isNew = !user;
    if (!user) user = await this.db.user.create({ data: { email: body.email, fullName: body.fullName } });

    const result = await this.db.run(async (tx) => {
      await this.entitlements.assertWithinLimit(tx, tenantId, 'max_employees', await tx.employee.count({ where: { tenantId, active: true } }));
      if (body.branchIds.length) {
        const found = await tx.branch.count({ where: { tenantId, id: { in: body.branchIds } } });
        if (found !== body.branchIds.length) throw badRequest('INVALID_BRANCH', 'One or more branches do not exist');
      }
      if (await tx.tenantMembership.findFirst({ where: { tenantId, userId: user!.id } })) throw conflict('ALREADY_MEMBER', 'This person is already part of your team');
      const m = await tx.tenantMembership.create({
        data: { tenantId, userId: user!.id, roleKey: role, branchIds: TENANT_WIDE_ROLES.includes(role) ? [] : body.branchIds, status: isNew || !user!.passwordHash ? 'INVITED' : 'ACTIVE' },
      });
      await tx.employee.create({ data: { tenantId, userId: user!.id, branchIds: body.branchIds } });
      await this.audit.recordTx(tx, { action: 'employee.invited', entityType: 'membership', entityId: m.id, metadata: { email: body.email, role } });
      return m;
    });
    const inviteToken = result.status === 'INVITED' ? await this.sessions.signInvite(user.id, tenantId) : null;
    // In production the token is delivered by email only; it is returned here for non-production convenience.
    return { membershipId: result.id, status: result.status, inviteToken: loadConfig().isProd ? undefined : inviteToken };
  }

  /** Issues a fresh one-time link for an invitation that has not been accepted yet. */
  @Post('employees/:membershipId/resend-invite') @Perm('employee.manage') @HttpCode(200)
  async resendInvite(@Param('membershipId', ParseUUIDPipe) id: string) {
    const tenantId = currentTenantId();
    const m = await this.db.run(async (tx) => {
      const found = await tx.tenantMembership.findFirst({ where: { id, tenantId, status: 'INVITED' } });
      if (!found) throw notFound('Pending invitation');
      await this.audit.recordTx(tx, { action: 'employee.invite_resent', entityType: 'membership', entityId: id });
      return found;
    });
    const inviteToken = await this.sessions.signInvite(m.userId, tenantId);
    return { membershipId: id, status: 'INVITED', inviteToken: loadConfig().isProd ? undefined : inviteToken };
  }

  @Patch('employees/:membershipId') @Perm('employee.manage') @Validates(memberUpdateSchema)
  async updateMember(@Param('membershipId', ParseUUIDPipe) id: string, @Body() body: z.infer<typeof memberUpdateSchema>) {
    const tenantId = currentTenantId();
    const c = currentContext();
    return this.db.run(async (tx) => {
      const m = await tx.tenantMembership.findFirst({ where: { id, tenantId } });
      if (!m) throw notFound('Team member');
      if (m.userId === c.userId && body.status === 'DEACTIVATED') throw forbidden('You cannot deactivate yourself');
      if (m.roleKey === 'TENANT_OWNER' && (body.role || body.status === 'DEACTIVATED')) {
        const owners = await tx.tenantMembership.count({ where: { tenantId, roleKey: 'TENANT_OWNER', status: 'ACTIVE' } });
        if (owners <= 1) throw conflict('LAST_OWNER', 'A business must keep at least one active owner');
      }
      // A branch-scoped role must always name its branches: an empty list would mean "all branches".
      const newRole = (body.role ?? m.roleKey) as RoleKey;
      let newBranches = body.branchIds ?? m.branchIds;
      if (TENANT_WIDE_ROLES.includes(newRole)) newBranches = [];
      else if (newBranches.length === 0) throw badRequest('BRANCH_REQUIRED', 'Choose at least one branch for this role');
      if (newBranches.length && (await tx.branch.count({ where: { tenantId, id: { in: newBranches } } })) !== newBranches.length) throw badRequest('INVALID_BRANCH', 'One or more branches do not exist');
      const updated = await tx.tenantMembership.update({ where: { id }, data: { roleKey: newRole, branchIds: newBranches, status: body.status } });
      if (body.status === 'DEACTIVATED') await tx.employee.updateMany({ where: { tenantId, userId: m.userId }, data: { active: false } });
      await this.audit.recordTx(tx, { action: 'employee.updated', entityType: 'membership', entityId: id, metadata: body });
      return updated;
    });
  }

  // ───── audit, export, deletion ─────
  @Get('audit-events') @Perm('audit.view') @ValidatesQuery(auditQuery)
  async auditEvents(@Q() q: z.infer<typeof auditQuery>) {
    const tenantId = currentTenantId();
    const where = { tenantId, ...(q.action ? { action: { startsWith: q.action } } : {}), ...(q.entityType ? { entityType: q.entityType } : {}), ...(q.entityId ? { entityId: q.entityId } : {}) };
    const [rows, total] = await this.db.run((tx) => Promise.all([
      tx.auditEvent.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      tx.auditEvent.count({ where }),
    ]));
    return paged(rows, total, q.page, q.pageSize);
  }

  /** Full tenant data export (JSON). Tenant-scoped through RLS; secrets and password hashes are never included. */
  @Post('tenant/export') @Perm('tenant.settings.manage') @HttpCode(200)
  async exportData() {
    const tenantId = currentTenantId();
    return this.db.run(async (tx) => {
      const data = await buildTenantExport(tx, tenantId);
      await this.audit.recordTx(tx, { action: 'tenant.exported', entityType: 'tenant', entityId: tenantId });
      return data;
    }, { timeout: 60000 });
  }

  /** Starts the deletion workflow: marks the tenant for deletion; platform staff execute the purge after a grace period. */
  @Post('tenant/deletion-request') @Perm('tenant.settings.manage') @HttpCode(200)
  @Validates(z.object({ confirmName: z.string() }))
  async requestDeletion(@Body() body: { confirmName: string }) {
    const tenantId = currentTenantId();
    return this.db.run(async (tx) => {
      const t = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
      if (t.name !== body.confirmName) throw badRequest('CONFIRMATION_MISMATCH', 'Type the exact business name to confirm');
      if (currentContext().role !== 'TENANT_OWNER') throw forbidden('Only an owner can request deletion');
      await tx.tenant.update({ where: { id: tenantId }, data: { status: 'PENDING_DELETION', deletionRequestedAt: new Date() } });
      await this.audit.recordTx(tx, { action: 'tenant.deletion_requested', entityType: 'tenant', entityId: tenantId });
      return { status: 'PENDING_DELETION', message: 'Your data will be permanently deleted after the retention grace period. Contact support to cancel.' };
    });
  }

  @Put('saved-filters/:id') @Perm('customer.view') @Validates(z.object({ name: z.string().min(1).max(60), query: z.record(z.string(), z.any()) }))
  async upsertFilter(@Param('id', ParseUUIDPipe) id: string, @Body() b: { name: string; query: Record<string, unknown> }) {
    const c = currentContext();
    return this.db.run(async (tx) => {
      const existing = await tx.savedFilter.findFirst({ where: { id, tenantId: c.tenantId!, userId: c.userId } });
      if (existing) return tx.savedFilter.update({ where: { id }, data: { name: b.name, query: b.query as object } });
      return tx.savedFilter.create({ data: { id, tenantId: c.tenantId!, userId: c.userId, name: b.name, query: b.query as object } });
    });
  }

  @Get('saved-filters') @Perm('customer.view')
  async filters() {
    const c = currentContext();
    return this.db.run((tx) => tx.savedFilter.findMany({ where: { tenantId: c.tenantId!, userId: c.userId } }));
  }

  @Delete('saved-filters/:id') @Perm('customer.view')
  async deleteFilter(@Param('id', ParseUUIDPipe) id: string) {
    const c = currentContext();
    await this.db.run((tx) => tx.savedFilter.deleteMany({ where: { id, tenantId: c.tenantId!, userId: c.userId } }));
    return { ok: true };
  }
}
