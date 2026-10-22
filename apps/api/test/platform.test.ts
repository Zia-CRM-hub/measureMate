import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { as, createApp, registerTenant, Tenant } from './helpers';

process.env.PLATFORM_ADMIN_EMAIL = 'super@measuremate.test';
process.env.PLATFORM_ADMIN_PASSWORD = 'Super-admin-pass-123';

describe('platform administration', () => {
  let app: INestApplication;
  let admin: string;
  let a: Tenant;
  let b: Tenant;

  beforeAll(async () => {
    app = await createApp();
    const login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: 'super@measuremate.test', password: 'Super-admin-pass-123' });
    expect(login.status).toBe(200);
    admin = login.body.token;
    a = await registerTenant(app, 'Alpha Tailors');
    b = await registerTenant(app, 'Beta Boutique');
    await as(app, a.token).post('/customers', { fullName: 'Secret Customer', mobile: '+91 98111 11111' });
  });
  afterAll(async () => { await app.close(); });

  it('is closed to tenant users and anonymous callers', async () => {
    expect((await request(app.getHttpServer()).get('/api/v1/platform/overview')).status).toBe(401);
    expect((await as(app, a.token).get('/platform/overview')).status).toBe(403);
    expect((await as(app, a.token).post(`/platform/tenants/${b.tenantId}/suspend`, { reason: 'try it' })).status).toBe(403);
  });

  it('lists and searches tenants with usage counts but no customer data', async () => {
    const overview = await as(app, admin).get('/platform/overview');
    expect(overview.status).toBe(200);
    expect(overview.body.tenants.ACTIVE).toBeGreaterThanOrEqual(2);
    const byName = await as(app, admin).get('/platform/tenants?q=alpha');
    expect(byName.body.data.map((t: { name: string }) => t.name)).toEqual(['Alpha Tailors']);
    expect(byName.body.data[0]).toMatchObject({ customers: 1, branches: 1, plan: 'PROFESSIONAL' });
    const byOwner = await as(app, admin).get(`/platform/tenants?q=${encodeURIComponent(b.email)}`);
    expect(byOwner.body.data[0].name).toBe('Beta Boutique');
    const detail = await as(app, admin).get(`/platform/tenants/${a.tenantId}`);
    expect(detail.status).toBe(200);
    expect(JSON.stringify(detail.body)).not.toContain('Secret Customer');
    expect(detail.body.usage.customers).toBe(1);
  });

  it('gives no silent access to business data', async () => {
    const r = await as(app, admin).get('/customers');
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('NO_ACTIVE_TENANT');
    const header = await request(app.getHttpServer()).get('/api/v1/customers').set('Authorization', `Bearer ${admin}`).set('x-tenant-id', a.tenantId);
    expect(header.status).toBe(403);
  });

  it('assigns plans and per-tenant entitlement overrides, and audits both', async () => {
    const t = await registerTenant(app, 'Gamma Stitch');
    expect((await as(app, admin).post(`/platform/tenants/${t.tenantId}/plan`, { planKey: 'STARTER' })).status).toBe(200);
    expect((await as(app, t.token).post('/branches', { name: 'Two', code: 'T2' })).status).toBe(402);
    expect((await as(app, admin).put(`/platform/tenants/${t.tenantId}/overrides`, { key: 'max_branches', intValue: 3, note: 'goodwill' })).status).toBe(200);
    expect((await as(app, t.token).post('/branches', { name: 'Two', code: 'T2' })).status).toBe(201);
    expect((await as(app, admin).put(`/platform/tenants/${t.tenantId}/overrides`, { key: 'bogus', intValue: 1 })).status).toBe(400);
    await as(app, admin).del(`/platform/tenants/${t.tenantId}/overrides/max_branches`);
    expect((await as(app, t.token).post('/branches', { name: 'Three', code: 'T3' })).status).toBe(402);
    const events = (await as(app, t.token).get('/audit-events?action=platform.')).body.data.map((e: { action: string }) => e.action);
    expect(events).toEqual(expect.arrayContaining(['platform.plan_changed', 'platform.entitlement_override_set', 'platform.entitlement_override_removed']));
  });

  it('suspends and restores a tenant, requiring a reason', async () => {
    const t = await registerTenant(app, 'Delta Dress');
    expect((await as(app, admin).post(`/platform/tenants/${t.tenantId}/suspend`, { reason: 'no' })).status).toBe(400);
    expect((await as(app, admin).post(`/platform/tenants/${t.tenantId}/suspend`, { reason: 'Unpaid invoice for 60 days' })).status).toBe(200);
    const blocked = await as(app, t.token).get('/branches');
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('TENANT_SUSPENDED');
    expect((await as(app, admin).post(`/platform/tenants/${t.tenantId}/restore`, { reason: 'Payment received' })).status).toBe(200);
    expect((await as(app, t.token).get('/branches')).status).toBe(200);
  });

  it('runs support impersonation that is reasoned, read-only, expiring, visible and audited', async () => {
    expect((await as(app, admin).post(`/platform/tenants/${a.tenantId}/impersonate`, { minutes: 15 })).status).toBe(400);
    const res = await as(app, admin).post(`/platform/tenants/${a.tenantId}/impersonate`, { reason: 'Customer reported missing measurement', minutes: 15 });
    expect(res.status).toBe(200);
    const cookies = res.headers['set-cookie'] as unknown as string[];
    const session = /mm_session=([^;]+)/.exec(cookies.join(';'))![1]!;
    const csrf = /mm_csrf=([^;]+)/.exec(cookies.join(';'))![1]!;
    const sup = as(app, session);
    const me = await sup.get('/auth/me');
    expect(me.body.impersonation.reason).toBe('Customer reported missing measurement');
    expect(me.body.activeTenant.id).toBe(a.tenantId);
    expect((await sup.get('/customers')).body.data[0].fullName).toBe('Secret Customer');
    const write = await sup.post('/customers', { fullName: 'Planted' });
    expect(write.status).toBe(403);
    expect((await sup.get('/platform/overview')).status).toBe(403);
    // The business owner can see that support looked at their account.
    const owner = (await as(app, a.token).get('/audit-events?action=platform.impersonation')).body.data;
    expect(owner[0].action).toBe('platform.impersonation_started');
    expect(owner[0].metadata.reason).toMatch(/missing measurement/);
    // End the session: the support token is revoked and the admin returns to their own session.
    const end = await request(app.getHttpServer()).post('/api/v1/support/end-session').set('Cookie', [`mm_session=${session}`, `mm_csrf=${csrf}`]).set('x-csrf-token', csrf);
    expect(end.status).toBe(200);
    expect((await sup.get('/customers')).status).toBe(401);
    const back = /mm_session=([^;]+)/.exec((end.headers['set-cookie'] as unknown as string[]).join(';'))![1]!;
    expect((await as(app, back).get('/platform/overview')).status).toBe(200);
  });

  it('exports tenant data only with a reason and leaves a tenant-visible record', async () => {
    expect((await as(app, admin).post(`/platform/tenants/${a.tenantId}/export`, {})).status).toBe(400);
    const r = await as(app, admin).post(`/platform/tenants/${a.tenantId}/export`, { reason: 'Owner requested via support ticket 123' });
    expect(r.status).toBe(200);
    expect(r.body.customers).toHaveLength(1);
    expect(JSON.stringify(r.body)).not.toMatch(/passwordHash/);
    const ev = (await as(app, a.token).get('/audit-events?action=platform.tenant_exported')).body.data;
    expect(ev).toHaveLength(1);
  });

  it('manages announcements, feature flags, users and reports system health', async () => {
    const ann = await as(app, admin).post('/platform/announcements', { title: 'Planned maintenance', body: 'Sunday 2am, 10 minutes' });
    expect(ann.status).toBe(201);
    expect((await as(app, a.token).get('/auth/me')).body.announcements.map((x: { title: string }) => x.title)).toContain('Planned maintenance');
    await as(app, admin).patch(`/platform/announcements/${ann.body.id}`, { active: false });
    expect((await as(app, a.token).get('/auth/me')).body.announcements.map((x: { title: string }) => x.title)).not.toContain('Planned maintenance');
    expect((await as(app, admin).put('/platform/feature-flags/new-board', { enabled: true, description: 'Beta kanban' })).status).toBe(200);
    expect((await as(app, admin).get('/platform/feature-flags')).body[0].key).toBe('new-board');
    const h = await as(app, admin).get('/platform/health');
    expect(h.body.database.status).toBe('up');
    expect(h.body.queue.byStatus).toBeDefined();
    const users = await as(app, admin).get(`/platform/users?q=${encodeURIComponent(a.email)}`);
    expect(users.body.data[0].businesses).toBe(1);
    const me = (await as(app, admin).get('/auth/me')).body.user.id;
    expect((await as(app, admin).post(`/platform/users/${me}/status`, { status: 'DEACTIVATED' })).status).toBe(403);
    // Deactivating a user revokes their sessions.
    expect((await as(app, admin).post(`/platform/users/${users.body.data[0].id}/status`, { status: 'DEACTIVATED' })).status).toBe(200);
    expect((await as(app, a.token).get('/auth/me')).status).toBe(401);
    await as(app, admin).post(`/platform/users/${users.body.data[0].id}/status`, { status: 'ACTIVE' });
  });

  it('deletes a tenant only after the owner asks, the grace period passes and the slug is confirmed', async () => {
    const t = await registerTenant(app, 'Epsilon Ends');
    const other = await registerTenant(app, 'Zeta Stays');
    await as(app, t.token).post('/customers', { fullName: 'Doomed Customer', mobile: '+91 98222 22222' });
    await as(app, other.token).post('/customers', { fullName: 'Survivor', mobile: '+91 98333 33333' });
    const slug = (await as(app, admin).get(`/platform/tenants/${t.tenantId}`)).body.slug;

    const early = await as(app, admin).post(`/platform/tenants/${t.tenantId}/purge`, { confirmSlug: slug, reason: 'Owner asked for deletion' });
    expect(early.body.error.code).toBe('NOT_PENDING_DELETION');
    expect((await as(app, t.token).post('/tenant/deletion-request', { confirmName: 'wrong' })).status).toBe(400);
    expect((await as(app, t.token).post('/tenant/deletion-request', { confirmName: 'Epsilon Ends' })).status).toBe(200);
    expect((await as(app, t.token).get('/branches')).body.error.code).toBe('TENANT_SUSPENDED');
    const grace = await as(app, admin).post(`/platform/tenants/${t.tenantId}/purge`, { confirmSlug: slug, reason: 'Owner asked for deletion' });
    expect(grace.body.error.code).toBe('GRACE_PERIOD');
    expect((await as(app, admin).post(`/platform/tenants/${t.tenantId}/purge`, { confirmSlug: 'wrong-slug', reason: 'Owner asked for deletion' })).status).toBe(400);

    process.env.TENANT_DELETION_GRACE_DAYS = '0';
    try {
      const ok = await as(app, admin).post(`/platform/tenants/${t.tenantId}/purge`, { confirmSlug: slug, reason: 'Owner asked for deletion' });
      expect(ok.status).toBe(200);
    } finally { delete process.env.TENANT_DELETION_GRACE_DAYS; }
    expect((await as(app, admin).get(`/platform/tenants/${t.tenantId}`)).status).toBe(404);
    expect((await as(app, admin).get('/platform/tenants?q=Doomed')).body.data).toHaveLength(0);
    expect((await as(app, other.token).get('/customers?q=Survivor')).body.data).toHaveLength(1);
    const ev = (await as(app, admin).get('/platform/audit-events?action=platform.tenant_purged')).body.data;
    expect(ev[0].metadata.slug).toBe(slug);
  });
});
