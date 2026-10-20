import { Body, Controller, Get, HttpCode, Post, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { z } from 'zod';
import { loginSchema, registerTenantSchema } from '@measuremate/validation';
import { loadConfig } from '../../common/config';
import { currentContext } from '../../common/context';
import { NoTenant, Public, Validates } from '../../common/decorators';
import { AuditService } from '../../common/audit.service';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';

const switchSchema = z.object({ tenantId: z.string().uuid() });
const acceptSchema = z.object({ token: z.string().min(10), password: z.string().min(10).max(128), fullName: z.string().trim().min(2).max(120).optional() });

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  private readonly cfg = loadConfig();
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  private setCookies(res: Response, token: string) {
    const common = { sameSite: 'lax' as const, secure: this.cfg.cookieSecure, path: '/', maxAge: this.cfg.SESSION_TTL_HOURS * 3600_000 };
    res.cookie('mm_session', token, { ...common, httpOnly: true });
    res.cookie('mm_csrf', this.sessions.csrfToken(), { ...common, httpOnly: false });
  }

  @Public() @Throttle({ default: { limit: 10, ttl: 60_000 } }) @Post('register') @Validates(registerTenantSchema)
  async register(@Body() body: z.infer<typeof registerTenantSchema>, @Res({ passthrough: true }) res: Response) {
    const r = await this.auth.registerTenant(body);
    this.setCookies(res, r.token);
    return { token: r.token, tenantId: r.tenantId };
  }

  @Public() @Throttle({ default: { limit: 10, ttl: 60_000 } }) @HttpCode(200) @Post('login') @Validates(loginSchema)
  async login(@Body() body: z.infer<typeof loginSchema>, @Res({ passthrough: true }) res: Response) {
    const r = await this.auth.login(body.email, body.password);
    this.setCookies(res, r.token);
    return { token: r.token };
  }

  @Public() @Throttle({ default: { limit: 10, ttl: 60_000 } }) @Post('accept-invite') @Validates(acceptSchema)
  async accept(@Body() body: z.infer<typeof acceptSchema>, @Res({ passthrough: true }) res: Response) {
    const r = await this.auth.acceptInvite(body.token, body.password, body.fullName);
    this.setCookies(res, r.token);
    return { token: r.token };
  }

  @NoTenant() @Get('me')
  me() { return this.auth.me(); }

  @NoTenant() @HttpCode(200) @Post('switch-tenant') @Validates(switchSchema)
  async switchTenant(@Body() body: z.infer<typeof switchSchema>) { return this.auth.switchTenant(body.tenantId); }

  @NoTenant() @HttpCode(200) @Post('logout')
  async logout(@Res({ passthrough: true }) res: Response) {
    const c = currentContext();
    if (!c.sessionId.startsWith('oidc:')) await this.sessions.revoke(c.sessionId);
    await this.audit.record({ action: 'auth.logout', tenantId: c.tenantId });
    res.clearCookie('mm_session', { path: '/' });
    res.clearCookie('mm_csrf', { path: '/' });
    return { ok: true };
  }

  @NoTenant() @HttpCode(200) @Post('logout-all')
  async logoutAll(@Res({ passthrough: true }) res: Response) {
    const c = currentContext();
    await this.sessions.revokeAllForUser(c.userId);
    await this.audit.record({ action: 'auth.sessions_revoked', tenantId: c.tenantId, entityType: 'user', entityId: c.userId });
    res.clearCookie('mm_session', { path: '/' });
    res.clearCookie('mm_csrf', { path: '/' });
    return { ok: true };
  }
}
