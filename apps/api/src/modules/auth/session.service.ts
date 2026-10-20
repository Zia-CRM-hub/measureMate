import { Injectable } from '@nestjs/common';
import { SignJWT, jwtVerify, createRemoteJWKSet } from 'jose';
import { randomBytes, createHash } from 'node:crypto';
import { loadConfig } from '../../common/config';
import { PrismaService } from '../../common/prisma.service';

export interface TokenClaims { sid: string; sub: string; kind: 'session' | 'invite' }

@Injectable()
export class SessionService {
  private readonly cfg = loadConfig();
  private readonly key = new TextEncoder().encode(this.cfg.sessionSecret);
  private readonly jwks = this.cfg.OIDC_ISSUER
    ? createRemoteJWKSet(new URL(`${this.cfg.OIDC_ISSUER.replace(/\/$/, '')}/protocol/openid-connect/certs`))
    : null;

  constructor(private readonly db: PrismaService) {}

  async create(userId: string, opts: { tenantId?: string | null; impersonatorId?: string; reason?: string; hours?: number } = {}) {
    const hours = opts.hours ?? this.cfg.SESSION_TTL_HOURS;
    const expiresAt = new Date(Date.now() + hours * 3600_000);
    const s = await this.db.session.create({
      data: {
        userId, activeTenantId: opts.tenantId ?? null, impersonatorId: opts.impersonatorId,
        impersonationReason: opts.reason, expiresAt,
      },
    });
    const token = await new SignJWT({ sid: s.id, kind: 'session' })
      .setProtectedHeader({ alg: 'HS256' }).setSubject(userId).setIssuedAt().setExpirationTime(expiresAt).sign(this.key);
    return { session: s, token };
  }

  async signInvite(userId: string, tenantId: string) {
    return new SignJWT({ tenantId, kind: 'invite' })
      .setProtectedHeader({ alg: 'HS256' }).setSubject(userId).setIssuedAt().setExpirationTime('7d').sign(this.key);
  }

  async verifyInvite(token: string): Promise<{ userId: string; tenantId: string } | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, { algorithms: ['HS256'] });
      if (payload.kind !== 'invite' || !payload.sub) return null;
      return { userId: payload.sub, tenantId: String(payload.tenantId) };
    } catch { return null; }
  }

  /** Verify a locally issued token, or (when OIDC is configured) an IdP-issued access token. */
  async verify(token: string): Promise<{ sessionId: string; userId: string } | { oidcSubject: string; email: string; name: string } | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, { algorithms: ['HS256'] });
      if (payload.kind !== 'session' || !payload.sid || !payload.sub) return null;
      return { sessionId: String(payload.sid), userId: payload.sub };
    } catch { /* fall through to OIDC */ }
    if (!this.jwks) return null;
    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        issuer: this.cfg.OIDC_ISSUER, audience: this.cfg.OIDC_AUDIENCE || undefined,
      });
      if (!payload.sub || typeof payload.email !== 'string') return null;
      return { oidcSubject: payload.sub, email: payload.email.toLowerCase(), name: String(payload.name ?? payload.email) };
    } catch { return null; }
  }

  async revoke(sessionId: string) {
    await this.db.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
  }
  async revokeAllForUser(userId: string) {
    await this.db.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  csrfToken() { return randomBytes(24).toString('hex'); }
  hash(s: string) { return createHash('sha256').update(s).digest('hex'); }
}
