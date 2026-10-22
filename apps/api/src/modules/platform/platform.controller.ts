import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import { loadConfig } from '../../common/config';
import { NoTenant, PlatformOnly, Validates, ValidatesQuery } from '../../common/decorators';
import { Q, paginationShape } from '../../common/query';
import { SessionService } from '../auth/session.service';
import { PlatformService } from './platform.service';

const reason = z.string().trim().min(5, 'Please give a reason (at least 5 characters)').max(500);
const tenantQuery = z.object({ q: z.string().max(100).optional(), status: z.string().optional(), plan: z.string().optional(), ...paginationShape });
const userQuery = z.object({ q: z.string().max(100).optional(), ...paginationShape });
const auditQuery = z.object({ tenantId: z.string().uuid().optional(), action: z.string().max(60).optional(), ...paginationShape });
const planBody = z.object({ planKey: z.enum(['STARTER', 'PROFESSIONAL', 'BUSINESS', 'ENTERPRISE']), status: z.enum(['TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED']).optional() });
const overrideBody = z.object({ key: z.string(), intValue: z.number().int().min(-1).max(1_000_000).optional(), enabled: z.boolean().optional(), note: z.string().max(200).optional() });
const reasonBody = z.object({ reason });
const impersonateBody = z.object({ reason, minutes: z.number().int().min(5).max(60).default(30) });
const purgeBody = z.object({ confirmSlug: z.string().min(3), reason });
const userStatusBody = z.object({ status: z.enum(['ACTIVE', 'DEACTIVATED']) });
const announcementBody = z.object({ title: z.string().trim().min(3).max(120), body: z.string().trim().min(3).max(1000) });
const flagBody = z.object({ enabled: z.boolean(), description: z.string().max(200).optional() });

@ApiTags('Platform administration')
@PlatformOnly()
@Controller('platform')
export class PlatformController {
  private readonly cfg = loadConfig();
  constructor(private readonly svc: PlatformService, private readonly sessions: SessionService) {}

  private cookie(res: Response, token: string, hours: number) {
    const common = { sameSite: 'lax' as const, secure: this.cfg.cookieSecure, path: '/', maxAge: hours * 3600_000 };
    res.cookie('mm_session', token, { ...common, httpOnly: true });
    res.cookie('mm_csrf', this.sessions.csrfToken(), { ...common, httpOnly: false });
  }

  @Get('overview') overview() { return this.svc.overview(); }
  @Get('health') health() { return this.svc.health(); }

  @Get('tenants') @ValidatesQuery(tenantQuery)
  async tenants(@Q() q: z.infer<typeof tenantQuery>) {
    const r = await this.svc.listTenants(q);
    return { data: r.data, meta: { total: r.total, page: q.page, pageSize: q.pageSize, pages: Math.max(1, Math.ceil(r.total / q.pageSize)) } };
  }
  @Get('tenants/:id') tenant(@Param('id', ParseUUIDPipe) id: string) { return this.svc.tenantDetail(id); }

  @Post('tenants/:id/plan') @HttpCode(200) @Validates(planBody)
  plan(@Param('id', ParseUUIDPipe) id: string, @Body() b: z.infer<typeof planBody>) { return this.svc.setPlan(id, b.planKey, b.status); }

  @Put('tenants/:id/overrides') @Validates(overrideBody)
  override(@Param('id', ParseUUIDPipe) id: string, @Body() b: z.infer<typeof overrideBody>) { return this.svc.setOverride(id, b.key, b); }
  @Delete('tenants/:id/overrides/:key')
  removeOverride(@Param('id', ParseUUIDPipe) id: string, @Param('key') key: string) { return this.svc.removeOverride(id, key); }

  @Post('tenants/:id/suspend') @HttpCode(200) @Validates(reasonBody)
  suspend(@Param('id', ParseUUIDPipe) id: string, @Body() b: z.infer<typeof reasonBody>) { return this.svc.suspend(id, b.reason); }
  @Post('tenants/:id/restore') @HttpCode(200) @Validates(reasonBody)
  restore(@Param('id', ParseUUIDPipe) id: string, @Body() b: z.infer<typeof reasonBody>) { return this.svc.restore(id, b.reason); }

  /** Starts a read-only, time-limited, audited support session inside the business. */
  @Post('tenants/:id/impersonate') @HttpCode(200) @Validates(impersonateBody)
  async impersonate(@Param('id', ParseUUIDPipe) id: string, @Body() b: z.infer<typeof impersonateBody>, @Res({ passthrough: true }) res: Response) {
    const r = await this.svc.impersonate(id, b.reason, b.minutes);
    this.cookie(res, r.token, b.minutes / 60);
    return { tenantName: r.tenantName, expiresAt: r.expiresAt };
  }

  @Post('tenants/:id/export') @HttpCode(200) @Validates(reasonBody)
  exportTenant(@Param('id', ParseUUIDPipe) id: string, @Body() b: z.infer<typeof reasonBody>) { return this.svc.exportTenant(id, b.reason); }

  @Post('tenants/:id/purge') @HttpCode(200) @Validates(purgeBody)
  purge(@Param('id', ParseUUIDPipe) id: string, @Body() b: z.infer<typeof purgeBody>) { return this.svc.purge(id, b.confirmSlug, b.reason); }

  @Get('users') @ValidatesQuery(userQuery)
  async users(@Q() q: z.infer<typeof userQuery>) {
    const r = await this.svc.listUsers(q);
    return { data: r.data, meta: { total: r.total, page: q.page, pageSize: q.pageSize, pages: Math.max(1, Math.ceil(r.total / q.pageSize)) } };
  }
  @Post('users/:id/status') @HttpCode(200) @Validates(userStatusBody)
  userStatus(@Param('id', ParseUUIDPipe) id: string, @Body() b: z.infer<typeof userStatusBody>) { return this.svc.setUserStatus(id, b.status); }
  @Post('users/:id/unlock') @HttpCode(200)
  unlock(@Param('id', ParseUUIDPipe) id: string) { return this.svc.unlockUser(id); }

  @Get('announcements') announcements() { return this.svc.announcements(); }
  @Post('announcements') @Validates(announcementBody)
  createAnnouncement(@Body() b: z.infer<typeof announcementBody>) { return this.svc.createAnnouncement(b); }
  @Patch('announcements/:id') @Validates(announcementBody.partial().extend({ active: z.boolean().optional() }))
  updateAnnouncement(@Param('id', ParseUUIDPipe) id: string, @Body() b: { active?: boolean; title?: string; body?: string }) { return this.svc.updateAnnouncement(id, b); }
  @Delete('announcements/:id') deleteAnnouncement(@Param('id', ParseUUIDPipe) id: string) { return this.svc.deleteAnnouncement(id); }

  @Get('feature-flags') flags() { return this.svc.flags(); }
  @Put('feature-flags/:key') @Validates(flagBody)
  setFlag(@Param('key') key: string, @Body() b: z.infer<typeof flagBody>) { return this.svc.setFlag(key.toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 60), b); }
  @Delete('feature-flags/:key') deleteFlag(@Param('key') key: string) { return this.svc.deleteFlag(key); }

  @Get('audit-events') @ValidatesQuery(auditQuery)
  async audit(@Q() q: z.infer<typeof auditQuery>) {
    const r = await this.svc.auditEvents(q);
    return { data: r.data, meta: { total: r.total, page: q.page, pageSize: q.pageSize, pages: Math.max(1, Math.ceil(r.total / q.pageSize)) } };
  }
}

/** Ends an impersonation session and returns the admin to their own platform session. Lives outside /platform
 * because impersonation sessions are deliberately blocked from platform tools. */
@ApiTags('Platform administration')
@Controller('support')
export class SupportSessionController {
  private readonly cfg = loadConfig();
  constructor(private readonly svc: PlatformService, private readonly sessions: SessionService) {}

  @NoTenant() @Post('end-session') @HttpCode(200)
  async end(@Res({ passthrough: true }) res: Response) {
    const r = await this.svc.endImpersonation();
    const common = { sameSite: 'lax' as const, secure: this.cfg.cookieSecure, path: '/', maxAge: this.cfg.SESSION_TTL_HOURS * 3600_000 };
    res.cookie('mm_session', r.token, { ...common, httpOnly: true });
    res.cookie('mm_csrf', this.sessions.csrfToken(), { ...common, httpOnly: false });
    return { ok: true };
  }
}
