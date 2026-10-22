import { INestApplication } from '@nestjs/common';
import { as, createApp, registerTenant, Tenant } from './helpers';

describe('customers, households and search', () => {
  let app: INestApplication;
  let t: Tenant;
  beforeAll(async () => { app = await createApp(); t = await registerTenant(app); });
  afterAll(async () => { await app.close(); });

  const mk = (over: object = {}) => as(app, t.token).post('/customers', { fullName: 'Asha Verma', mobile: '+91 98765 43210', email: 'asha@example.test', city: 'Pune', postalCode: '411001', tags: ['VIP'], ...over });

  it('creates a customer with number, household, SELF member and normalised mobile', async () => {
    const r = await mk();
    expect(r.status).toBe(201);
    expect(r.body.customerNumber).toBe('C-00001');
    expect(r.body.mobile).toBe('+919876543210');
    expect(r.body.members).toHaveLength(1);
    expect(r.body.members[0].relationship).toBe('SELF');
    expect(r.body.tags).toEqual(['VIP']);
  });

  it('detects duplicates by normalised mobile (different formatting) and email, and allows an explicit override', async () => {
    const dup = await mk({ fullName: 'Asha V', mobile: '09876543210', email: undefined });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('DUPLICATE_CUSTOMER');
    expect(dup.body.error.details.candidates[0].customerNumber).toBe('C-00001');
    const byEmail = await mk({ fullName: 'Someone', mobile: undefined, email: 'ASHA@example.test' });
    expect(byEmail.status).toBe(409);
    const forced = await as(app, t.token).post('/customers?force=true', { fullName: 'Asha V', mobile: '09876543210' });
    expect(forced.status).toBe(201);
  });

  it('rejects invalid phone numbers with a helpful message', async () => {
    const r = await as(app, t.token).post('/customers', { fullName: 'Bad Phone', mobile: '12' });
    expect(r.status).toBe(400);
  });

  it('searches by partial name, mobile (any format), email, number, family member, city, postal code, tag and tolerates typos', async () => {
    await as(app, t.token).post('/customers', { fullName: 'Rohan Mehta', mobile: '+91 91234 56789', city: 'Mumbai', postalCode: '400001', tags: ['Wedding'] });
    const rohan = (await as(app, t.token).get('/customers?q=rohan')).body.data[0];
    await as(app, t.token).post(`/customers/${rohan.id}/members`, { fullName: 'Aarav Mehta', relationship: 'CHILD' });
    const search = async (q: string) => (await as(app, t.token).get(`/customers?${q}`)).body.data.map((c: { fullName: string }) => c.fullName);
    expect(await search('q=ash')).toContain('Asha Verma');
    expect(await search('q=98765')).toContain('Asha Verma');
    expect(await search('q=' + encodeURIComponent('+91 91234 56789'))).toEqual(['Rohan Mehta']);
    expect(await search('q=asha@example')).toContain('Asha Verma');
    expect(await search('q=C-00001')).toContain('Asha Verma');
    const fam = (await as(app, t.token).get('/customers?q=aarav')).body.data;
    expect(fam.map((c: { fullName: string }) => c.fullName)).toEqual(['Rohan Mehta']);
    expect(fam[0].matchedMembers[0].fullName).toBe('Aarav Mehta');
    expect(await search('city=mumbai')).toEqual(['Rohan Mehta']);
    expect(await search('postalCode=4110')).toContain('Asha Verma');
    expect(await search('tag=wedding')).toEqual(['Rohan Mehta']);
    expect(await search('q=Rohann')).toContain('Rohan Mehta');
  });

  it('does not leak customers or search results across tenants', async () => {
    const other = await registerTenant(app);
    const theirs = await as(app, other.token).post('/customers', { fullName: 'Zubair Khan', mobile: '+91 90000 11111' });
    expect(theirs.status).toBe(201);
    expect(theirs.body.customerNumber).toBe('C-00001'); // numbering is per tenant
    // Same mobile in another tenant is not a duplicate.
    expect((await as(app, other.token).post('/customers', { fullName: 'Copy', mobile: '+91 98765 43210' })).status).toBe(201);
    const mine = await as(app, t.token).get('/customers?q=zubair');
    expect(mine.body.data).toHaveLength(0);
    expect((await as(app, t.token).get(`/customers/${theirs.body.id}`)).status).toBe(404);
    expect((await as(app, t.token).patch(`/customers/${theirs.body.id}`, { fullName: 'Hacked', version: 1 })).status).toBe(404);
    const member = theirs.body.members[0].id;
    expect((await as(app, t.token).patch(`/members/${member}`, { fullName: 'Hacked' })).status).toBe(404);
    expect((await as(app, t.token).get(`/members/${member}/measurement-profiles`)).status).toBe(404);
  });

  it('uses optimistic concurrency on update', async () => {
    const c = (await mk({ fullName: 'Version Test', mobile: '+91 90909 09090', email: 'v@example.test' })).body;
    const ok = await as(app, t.token).patch(`/customers/${c.id}`, { fullName: 'Version Tested', version: c.version });
    expect(ok.status).toBe(200);
    expect(ok.body.version).toBe(c.version + 1);
    const stale = await as(app, t.token).patch(`/customers/${c.id}`, { city: 'Delhi', version: c.version });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('STALE_VERSION');
    expect((await as(app, t.token).get('/customers?q=Version%20Tested')).body.data).toHaveLength(1);
  });

  it('merges duplicates keeping family members and ledger history, and archives the source', async () => {
    const a = (await as(app, t.token).post('/customers', { fullName: 'Merge Target', mobile: '+91 90111 22222' })).body;
    const b = (await as(app, t.token).post('/customers', { fullName: 'Merge Source', mobile: '+91 90333 44444', email: 'source@example.test' })).body;
    const res = await as(app, t.token).post(`/customers/${a.id}/merge`, { sourceId: b.id });
    expect(res.status).toBe(200);
    expect(res.body.members.map((m: { fullName: string }) => m.fullName).sort()).toEqual(['Merge Source', 'Merge Target']);
    expect(res.body.email).toBe('source@example.test');
    expect((await as(app, t.token).get(`/customers/${b.id}`)).body.status).toBe('MERGED');
    expect((await as(app, t.token).get('/customers?q=Merge%20Source')).body.data.filter((c: { id: string }) => c.id === b.id)).toHaveLength(0);
  });

  it('exports CSV neutralising spreadsheet formulas', async () => {
    await as(app, t.token).post('/customers', { fullName: '=HYPERLINK("http://evil")', mobile: '+91 90555 66666' });
    const r = await as(app, t.token).get('/customers/export');
    expect(r.status).toBe(200);
    expect(r.text).toContain("'=HYPERLINK");
    expect(r.text).not.toMatch(/,=HYPERLINK/);
  });

  it('writes audit events for customer changes', async () => {
    const ev = await as(app, t.token).get('/audit-events?action=customer.');
    expect(ev.body.data.length).toBeGreaterThan(3);
    expect(ev.body.data.every((e: { tenantId: string }) => e.tenantId === t.tenantId)).toBe(true);
  });
});

describe('measurements: templates, revisions, conversion, restore', () => {
  let app: INestApplication;
  let t: Tenant;
  let memberId: string;
  let shirtTemplate: { id: string };
  beforeAll(async () => {
    app = await createApp();
    t = await registerTenant(app);
    const c = (await as(app, t.token).post('/customers', { fullName: 'Meera Rao', mobile: '+91 98000 12345' })).body;
    memberId = c.members[0].id;
    shirtTemplate = (await as(app, t.token).get('/measurement-templates')).body.find((x: { name: string }) => x.name === "Men's Shirt");
  });
  afterAll(async () => { await app.close(); });

  it('seeds all 15 system templates per tenant', async () => {
    const list = (await as(app, t.token).get('/measurement-templates')).body;
    expect(list).toHaveLength(15);
    expect(list.every((x: { isSystem: boolean }) => x.isSystem)).toBe(true);
  });

  it('creates a profile and revision 1, storing canonical mm and the originally entered unit', async () => {
    const p = await as(app, t.token).post(`/members/${memberId}/measurement-profiles`, { templateId: shirtTemplate.id });
    expect(p.status).toBe(201);
    const rev = await as(app, t.token).post(`/measurement-profiles/${p.body.id}/revisions`, {
      unit: 'in', values: { chest: '40', waist: '34', shoulder: '18', sleeve_length: '25', shirt_length: '29.5' }, stylePreferences: { collar: 'Spread' },
    });
    expect(rev.status).toBe(201);
    expect(rev.body.revisionNo).toBe(1);
    expect(rev.body.values.chest.canonicalMm).toBe('1016.000');
    expect(rev.body.values.chest.entered).toBe('40 in');
    expect(rev.body.values.chest.display).toBe('40.00');
    const cm = await as(app, t.token).get(`/measurement-profiles/${p.body.id}?unit=cm`);
    expect(cm.body.latest.values.chest.display).toBe('101.60');
  });

  it('creates immutable revisions with changed fields, and shows a side-by-side comparison', async () => {
    const p = (await as(app, t.token).post(`/members/${memberId}/measurement-profiles`, { templateId: shirtTemplate.id, name: 'Work shirts' })).body;
    await as(app, t.token).post(`/measurement-profiles/${p.id}/revisions`, { unit: 'in', values: { chest: '40', waist: '34', shoulder: '18', sleeve_length: '25', shirt_length: '29' } });
    const r2 = await as(app, t.token).post(`/measurement-profiles/${p.id}/revisions`, { unit: 'in', values: { waist: '35' }, changeReason: 'Gained weight' });
    expect(r2.status).toBe(201);
    expect(r2.body.revisionNo).toBe(2);
    expect(Object.keys(r2.body.changedFields)).toEqual(['waist']);
    expect(r2.body.changedFields.waist).toEqual({ from: '863.600', to: '889.000' });
    expect(r2.body.values.chest.display).toBe('40.00'); // carried forward
    const cmp = await as(app, t.token).get(`/measurement-profiles/${p.id}/compare?from=1&to=2`);
    const waist = cmp.body.rows.find((x: { key: string }) => x.key === 'waist');
    expect(waist).toMatchObject({ from: '34.00', to: '35.00', delta: '1.00', changed: true });
    expect(cmp.body.rows.find((x: { key: string }) => x.key === 'chest').changed).toBe(false);
    const nochange = await as(app, t.token).post(`/measurement-profiles/${p.id}/revisions`, { unit: 'in', values: { waist: '35' } });
    expect(nochange.status).toBe(400);
    expect(nochange.body.error.code).toBe('NO_CHANGES');
  });

  it('restoring an earlier revision creates a new revision rather than overwriting history', async () => {
    const p = (await as(app, t.token).post(`/members/${memberId}/measurement-profiles`, { templateId: shirtTemplate.id })).body;
    await as(app, t.token).post(`/measurement-profiles/${p.id}/revisions`, { unit: 'in', values: { chest: '40', waist: '34', shoulder: '18', sleeve_length: '25', shirt_length: '29' } });
    await as(app, t.token).post(`/measurement-profiles/${p.id}/revisions`, { unit: 'in', values: { chest: '42' } });
    const restored = await as(app, t.token).post(`/measurement-profiles/${p.id}/restore`, { revisionNo: 1, reason: 'Customer prefers earlier fit' });
    expect(restored.status).toBe(200);
    expect(restored.body.revisionNo).toBe(3);
    expect(restored.body.values.chest.display).toBe('40.00');
    const revs = await as(app, t.token).get(`/measurement-profiles/${p.id}/revisions`);
    expect(revs.body.map((r: { revisionNo: number }) => r.revisionNo)).toEqual([3, 2, 1]);
    const old = await as(app, t.token).get(`/measurement-profiles/${p.id}/revisions/2`);
    expect(old.body.values.chest.display).toBe('42.00'); // untouched
  });

  it('warns about suspicious values and allows an override with a reason', async () => {
    const p = (await as(app, t.token).post(`/members/${memberId}/measurement-profiles`, { templateId: shirtTemplate.id })).body;
    const body = { unit: 'in', values: { chest: '400', waist: '34', shoulder: '18', sleeve_length: '25', shirt_length: '29' } };
    const blocked = await as(app, t.token).post(`/measurement-profiles/${p.id}/revisions`, body);
    expect(blocked.status).toBe(422);
    expect(blocked.body.error.code).toBe('MEASUREMENT_WARNINGS');
    expect(blocked.body.error.details.warnings[0].kind).toBe('ABOVE_RANGE');
    expect(blocked.body.error.details.checkType).toMatch(/rule-based/);
    const missing = await as(app, t.token).post(`/measurement-profiles/${p.id}/revisions`, { unit: 'in', values: { chest: '40' } });
    expect(missing.status).toBe(422);
    const ok = await as(app, t.token).post(`/measurement-profiles/${p.id}/revisions`, { ...body, overrideWarningsReason: 'Customer is very tall, double-checked' });
    expect(ok.status).toBe(201);
    expect(ok.body.warnings.length).toBeGreaterThan(0);
    const draft = (await as(app, t.token).post(`/members/${memberId}/measurement-profiles`, { templateId: shirtTemplate.id })).body;
    const d = await as(app, t.token).post(`/measurement-profiles/${draft.id}/revisions`, { unit: 'in', values: { chest: '40' }, isDraft: true });
    expect(d.status).toBe(201);
    expect(d.body.isDraft).toBe(true);
    expect((await as(app, t.token).get(`/measurement-profiles/${draft.id}`)).body.currentRevisionNo).toBe(0);
  });

  it('rejects non-numeric, zero and unknown-field values', async () => {
    const p = (await as(app, t.token).post(`/members/${memberId}/measurement-profiles`, { templateId: shirtTemplate.id })).body;
    const post = (values: object) => as(app, t.token).post(`/measurement-profiles/${p.id}/revisions`, { unit: 'cm', values, isDraft: true });
    expect((await post({ chest: 'abc' })).body.error.code).toBe('INVALID_MEASUREMENT');
    expect((await post({ chest: '0' })).body.error.code).toBe('INVALID_MEASUREMENT');
    expect((await post({ nonsense: '10' })).body.error.code).toBe('UNKNOWN_FIELD');
  });

  it('copies previous measurements into a new profile', async () => {
    const src = (await as(app, t.token).post(`/members/${memberId}/measurement-profiles`, { templateId: shirtTemplate.id })).body;
    await as(app, t.token).post(`/measurement-profiles/${src.id}/revisions`, { unit: 'in', values: { chest: '38', waist: '32', shoulder: '17', sleeve_length: '24', shirt_length: '28' } });
    const copy = await as(app, t.token).post(`/members/${memberId}/measurement-profiles`, { templateId: shirtTemplate.id, name: 'Copy', copyFromProfileId: src.id });
    expect(copy.status).toBe(201);
    expect(copy.body.latest.values.chest.display).toBe('38.00');
    expect(copy.body.latest.changeReason).toMatch(/Copied/);
  });

  it('protects system templates, supports clone then edit, and blocks cross-tenant template use', async () => {
    const edit = await as(app, t.token).put(`/measurement-templates/${shirtTemplate.id}`, { name: 'XX', category: 'Shirt', sections: [{ name: 'S', fields: [{ key: 'a', label: 'A' }] }] });
    expect(edit.status).toBe(409);
    const clone = await as(app, t.token).post(`/measurement-templates/${shirtTemplate.id}/clone`, { name: 'My shirt' });
    expect(clone.status).toBe(201);
    const upd = await as(app, t.token).put(`/measurement-templates/${clone.body.id}`, {
      name: 'My shirt', category: 'Shirt', sections: [{ name: 'Body', fields: [{ key: 'chest', label: 'Chest', required: true, minWarnCm: 60, maxWarnCm: 160 }, { key: 'cuff_style', label: 'Cuff', helpText: 'Type', required: false }] }],
    });
    expect(upd.status).toBe(200);
    expect(upd.body.sections[0].fields).toHaveLength(2);
    const other = await registerTenant(app);
    const otherMember = (await as(app, other.token).post('/customers', { fullName: 'Other', mobile: '+91 97000 00001' })).body.members[0].id;
    expect((await as(app, other.token).post(`/members/${otherMember}/measurement-profiles`, { templateId: shirtTemplate.id })).status).toBe(404);
  });

  it('the database refuses to modify or delete measurement history', async () => {
    const { Client } = await import('pg');
    const c = new Client({ connectionString: process.env.OWNER_DATABASE_URL });
    await c.connect();
    await expect(c.query(`UPDATE measurement_values SET "valueMm" = 1`)).rejects.toThrow(/append-only/);
    await expect(c.query(`DELETE FROM measurement_revisions`)).rejects.toThrow(/append-only/);
    await c.end();
  });

  it('exports a PDF measurement sheet', async () => {
    const p = (await as(app, t.token).post(`/members/${memberId}/measurement-profiles`, { templateId: shirtTemplate.id })).body;
    await as(app, t.token).post(`/measurement-profiles/${p.id}/revisions`, { unit: 'in', values: { chest: '40', waist: '34', shoulder: '18', sleeve_length: '25', shirt_length: '29' } });
    const r = await as(app, t.token).get(`/measurement-profiles/${p.id}/sheet.pdf`).buffer(true).parse((res, cb) => { const d: Buffer[] = []; res.on('data', (x: Buffer) => d.push(x)); res.on('end', () => cb(null, Buffer.concat(d))); });
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toBe('application/pdf');
    expect((r.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
  });
});
