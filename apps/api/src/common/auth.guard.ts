import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ROLE_PERMISSIONS, TENANT_WIDE_ROLES, RoleKey, Permission } from '@measuremate/validation';
import { contextStore, RequestContext } from './context';
import { EntitlementsService } from './entitlements.service';
import { AppError, forbidden } from './errors';
import { FEATURE, IS_PUBLIC, NO_TENANT, PERMS, PLATFORM_ONLY } from './decorators';
import { PrismaService } from './prisma.service';
import { SessionService } from '../modules/auth/session.service';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly db: PrismaService,
    private readonly sessions: SessionService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const handler = ctx.getHandler();
    const klass = ctx.getClass();
    const get = <T>(k: string) => this.reflector.getAllAndOverride<T>(k, [handler, klass]);
    if (get<boolean>(IS_PUBLIC)) return true;

    const req = ctx.switchToHttp().getRequest<Request>();
    const bearer = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null;
    const cookieToken = (req.cookies as Record<string, string> | undefined)?.mm_session ?? null;
    const token = bearer ?? cookieToken;
    if (!token) throw new UnauthorizedException('Please sign in');

    const verified = await this.sessions.verify(token);
    if (!verified) throw new UnauthorizedException('Your session is invalid or has expired');

    // CSRF: cookie-authenticated unsafe requests must echo the double-submit token.
    if (!bearer && !SAFE.has(req.method)) {
      const header = req.header('x-csrf-token');
      const cookie = (req.cookies as Record<string, string>).mm_csrf;
      if (!header || !cookie || header !== cookie) throw new AppError(403, 'CSRF_FAILED', 'Security check failed. Refresh the page and try again.');
    }

    let userId: string;
    let sessionId: string;
    let activeTenantId: string | null;
    let impersonatorId: string | null = null;
    let impersonationReason: string | null = null;
    let expiresAt: Date;

    if ('sessionId' in verified) {
      const s = await this.db.session.findUnique({ where: { id: verified.sessionId } });
      if (!s || s.revokedAt || s.expiresAt < new Date() || s.userId !== verified.userId) {
        throw new UnauthorizedException('Your session has ended. Please sign in again.');
      }
      userId = s.userId; sessionId = s.id; activeTenantId = s.activeTenantId;
      impersonatorId = s.impersonatorId; impersonationReason = s.impersonationReason; expiresAt = s.expiresAt;
    } else {
      // OIDC bearer token: provision/link the local user record on first sight.
      let u = await this.db.user.findFirst({ where: { OR: [{ oidcSubject: verified.oidcSubject }, { email: verified.email }] } });
      if (!u) u = await this.db.user.create({ data: { email: verified.email, fullName: verified.name, oidcSubject: verified.oidcSubject } });
      else if (!u.oidcSubject) u = await this.db.user.update({ where: { id: u.id }, data: { oidcSubject: verified.oidcSubject } });
      userId = u.id; sessionId = `oidc:${verified.oidcSubject}`;
      activeTenantId = (req.header('x-tenant-id') as string | undefined) ?? null;
      expiresAt = new Date(Date.now() + 3600_000);
    }

    const user = await this.db.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException('This account is deactivated');

    const base: RequestContext = {
      userId, userEmail: user.email, fullName: user.fullName, sessionId, tenantId: null, role: null,
      branchIds: [], permissions: [], isPlatformAdmin: user.isPlatformAdmin, customerId: null,
      impersonatorId, impersonationReason, sessionExpiresAt: expiresAt,
      correlationId: (req as Request & { correlationId?: string }).correlationId ?? '', ip: req.ip ?? null,
    };

    const platformOnly = get<boolean>(PLATFORM_ONLY);
    if (platformOnly) {
      if (!user.isPlatformAdmin) throw forbidden('Platform administrators only');
      if (impersonatorId) throw forbidden('End the support session before using platform tools');
      base.permissions = ROLE_PERMISSIONS.PLATFORM_ADMIN;
      Object.assign(contextStore.getStore()!, base);
      return true;
    }

    if (activeTenantId) {
      const resolved = await this.db.run(async (tx) => {
        const tenant = await tx.tenant.findUnique({ where: { id: activeTenantId! } });
        const m = await tx.tenantMembership.findFirst({ where: { tenantId: activeTenantId!, userId, status: 'ACTIVE' } });
        return { tenant, m };
      }, { tenantId: activeTenantId, userId });

      if (impersonatorId && resolved.tenant) {
        // Support impersonation is read-only and carries the auditor permission set.
        base.tenantId = resolved.tenant.id;
        base.role = 'READ_ONLY_AUDITOR';
        base.permissions = ROLE_PERMISSIONS.READ_ONLY_AUDITOR;
      } else if (resolved.m && resolved.tenant) {
        if (resolved.tenant.status !== 'ACTIVE') {
          throw new AppError(403, 'TENANT_SUSPENDED', 'This business account is currently suspended. Contact support.');
        }
        base.tenantId = resolved.tenant.id;
        base.role = resolved.m.roleKey as RoleKey;
        base.branchIds = TENANT_WIDE_ROLES.includes(base.role) ? [] : resolved.m.branchIds;
        base.customerId = resolved.m.customerId;
        base.permissions = ROLE_PERMISSIONS[base.role] as Permission[];
      } else if (req.header('x-tenant-id')) {
        throw forbidden('You do not have access to that business');
      }
    }

    if (user.isPlatformAdmin && !base.tenantId) base.permissions = ROLE_PERMISSIONS.PLATFORM_ADMIN;
    Object.assign(contextStore.getStore()!, base);

    if (get<boolean>(NO_TENANT)) return true;
    if (!base.tenantId) throw new AppError(403, 'NO_ACTIVE_TENANT', 'Select a business to continue');

    const required = get<Permission[]>(PERMS) ?? [];
    if (impersonatorId && !SAFE.has(req.method)) throw forbidden('Support impersonation sessions are read-only');
    for (const p of required) if (!base.permissions.includes(p)) throw forbidden();

    const feature = get<string>(FEATURE);
    if (feature) await this.entitlements.assertFeature(base.tenantId, feature);
    return true;
  }
}
