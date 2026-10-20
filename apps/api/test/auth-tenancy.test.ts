import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { as, createApp, registerTenant } from './helpers';

describe('auth, tenancy and RLS', () => {
  let app: INestApplication;
  beforeAll(async () => { app = await createApp(); });
  afterAll(async () => { await app.close(); });

  it('registers a tenant with a default branch and returns identity context', async () => {
    const t = await registerTenant(app);
    const me = await as(app, t.token).get('/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.role).toBe('TENANT_OWNER');
    expect(me.body.activeTenant.id).toBe(t.tenantId);
    expect(me.body.permissions).toContain('customer.create');
    const branches = await as(app, t.token).get('/branches');
    expect(branches.body).toHaveLength(1);
  });

  it('rejects unauthenticated access and does not reveal which credential was wrong', async () => {
    expect((await request(app.getHttpServer()).get('/api/v1/branches')).status).toBe(401);
    const t = await registerTenant(app);
    const bad = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: t.email, password: 'wrong-password-1' });
    const unknown = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: 'nobody@example.test', password: 'wrong-password-1' });
    expect(bad.status).toBe(401);
    expect(bad.body.error.message).toBe(unknown.body.error.message);
  });

  it('locks the account after repeated failures', async () => {
    const t = await registerTenant(app);
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: t.email, password: 'nope-nope-nope' });
    }
    const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: t.email, password: t.password });
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('ACCOUNT_LOCKED');
  });

  it('revokes sessions on logout', async () => {
    const t = await registerTenant(app);
    const login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: t.email, password: t.password });
    const token = login.body.token;
    expect((await as(app, token).get('/auth/me')).status).toBe(200);
    await as(app, token).post('/auth/logout');
    expect((await as(app, token).get('/auth/me')).status).toBe(401);
  });

  it('enforces CSRF for cookie-authenticated writes', async () => {
    const t = await registerTenant(app);
    const login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: t.email, password: t.password });
    const cookies = login.headers['set-cookie'] as unknown as string[];
    const csrf = /mm_csrf=([^;]+)/.exec(cookies.join(';'))![1]!;
    const noHeader = await request(app.getHttpServer()).post('/api/v1/branches').set('Cookie', cookies).send({ name: 'B2', code: 'B2' });
    expect(noHeader.status).toBe(403);
    expect(noHeader.body.error.code).toBe('CSRF_FAILED');
    const ok = await request(app.getHttpServer()).post('/api/v1/branches').set('Cookie', cookies).set('x-csrf-token', csrf).send({ name: 'B2', code: 'B2' });
    expect(ok.status).toBe(201);
  });

  it('cannot touch another tenant\'s branch by id', async () => {
    const a = await registerTenant(app);
    const b = await registerTenant(app);
    const branchB = (await as(app, b.token).get('/branches')).body[0];
    expect((await as(app, a.token).patch(`/branches/${branchB.id}`, { name: 'Hacked' })).status).toBe(404);
    const listA = (await as(app, a.token).get('/branches')).body;
    expect(listA.find((x: { id: string }) => x.id === branchB.id)).toBeUndefined();
  });

  it('refuses tenant switching to a business the user does not belong to', async () => {
    const a = await registerTenant(app);
    const b = await registerTenant(app);
    expect((await as(app, a.token).post('/auth/switch-tenant', { tenantId: b.tenantId })).status).toBe(403);
    // A browser-supplied tenant header is ignored for local sessions: still only tenant A's data.
    const header = await request(app.getHttpServer()).get('/api/v1/branches').set('Authorization', `Bearer ${a.token}`).set('x-tenant-id', b.tenantId);
    expect(header.status).toBe(200);
    const bBranch = (await as(app, b.token).get('/branches')).body[0].id;
    expect(header.body.map((x: { id: string }) => x.id)).not.toContain(bBranch);
  });

  it('lets one person belong to several tenants with a separate role in each', async () => {
    const a = await registerTenant(app);
    const b = await registerTenant(app);
    const bBranch = (await as(app, b.token).get('/branches')).body[0].id;
    const inv = await as(app, b.token).post('/employees/invite', { email: a.email, fullName: 'Test Owner', role: 'RECEPTIONIST', branchIds: [bBranch] });
    expect(inv.status).toBe(201);
    expect(inv.body.status).toBe('ACTIVE');
    expect((await as(app, a.token).get('/auth/me')).body.tenants).toHaveLength(2);
    expect((await as(app, a.token).post('/auth/switch-tenant', { tenantId: b.tenantId })).status).toBe(200);
    const me = await as(app, a.token).get('/auth/me');
    expect(me.body.role).toBe('RECEPTIONIST');
    expect(me.body.permissions).not.toContain('tenant.settings.manage');
    expect((await as(app, a.token).get('/tenant/settings')).status).toBe(403);
  });

  it('enforces plan entitlements (Starter: one branch)', async () => {
    const t = await registerTenant(app);
    expect((await as(app, t.token).post('/tenant/subscription', { planKey: 'STARTER' })).status).toBe(200);
    const second = await as(app, t.token).post('/branches', { name: 'Second', code: 'S2' });
    expect(second.status).toBe(402);
    expect(second.body.error.code).toBe('PLAN_LIMIT_REACHED');
  });

  it('database RLS fails closed even if application code forgets tenant filters', async () => {
    const a = await registerTenant(app);
    const b = await registerTenant(app);
    const c = new Client({ connectionString: process.env.DATABASE_URL });
    await c.connect();
    expect((await c.query('SELECT count(*)::int AS n FROM branches')).rows[0].n).toBe(0);
    await c.query('BEGIN');
    await c.query("SELECT set_config('app.tenant_id', $1, true)", [a.tenantId]);
    expect((await c.query('SELECT DISTINCT "tenantId" FROM branches')).rows).toEqual([{ tenantId: a.tenantId }]);
    await expect(
      c.query(`INSERT INTO branches (id,"tenantId",name,code,"updatedAt") VALUES (gen_random_uuid(), $1, 'x','X', now())`, [b.tenantId]),
    ).rejects.toThrow(/row-level security/);
    await c.query('ROLLBACK');
    await c.end();
  });
});
