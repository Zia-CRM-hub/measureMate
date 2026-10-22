import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { CustomerInput } from '@measuremate/validation';
import { AuditService } from '../../common/audit.service';
import { currentContext, currentTenantId } from '../../common/context';
import { EntitlementsService } from '../../common/entitlements.service';
import { conflict, notFound } from '../../common/errors';
import { digitsOnly, normalizeEmail, normalizePhone } from '../../common/phone';
import { PrismaService, Tx } from '../../common/prisma.service';
import { nextNumber } from '../../common/sequence';
import { loadSettings } from '../../common/scope';

export interface SearchParams {
  q?: string; city?: string; postalCode?: string; tag?: string; status?: string; branchId?: string;
  nearLat?: number; nearLng?: number; radiusKm?: number;
  sort?: string; dir?: 'asc' | 'desc'; page: number; pageSize: number;
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

/** Lower-cased, de-accented blob used for trigram and substring search. */
export function buildSearchText(parts: (string | null | undefined)[], phones: (string | null | undefined)[]): string {
  const phoneTokens: string[] = [];
  for (const p of phones) {
    if (!p) continue;
    const parsed = parsePhoneNumberFromString(p);
    phoneTokens.push(digitsOnly(p));
    if (parsed) phoneTokens.push(parsed.nationalNumber);
  }
  return [...parts, ...phoneTokens].filter(Boolean).join(' ').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

@Injectable()
export class CustomersService {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
    private readonly entitlements: EntitlementsService,
  ) {}

  /** Existing ACTIVE customers sharing a normalized mobile or email. */
  async findDuplicates(tx: Tx, tenantId: string, opts: { mobiles: (string | null)[]; email: string | null; excludeId?: string }) {
    const or: Prisma.CustomerContactWhereInput[] = [];
    const mobiles = opts.mobiles.filter((m): m is string => !!m);
    if (mobiles.length) or.push({ type: 'MOBILE', value: { in: mobiles } });
    if (opts.email) or.push({ type: 'EMAIL', value: opts.email });
    if (!or.length) return [];
    const contacts = await tx.customerContact.findMany({
      where: { tenantId, OR: or, customer: { status: 'ACTIVE', ...(opts.excludeId ? { id: { not: opts.excludeId } } : {}) } },
      include: { customer: { select: { id: true, customerNumber: true, fullName: true, mobile: true, email: true, city: true } } },
    });
    const byId = new Map<string, { customer: (typeof contacts)[number]['customer']; matchedOn: string[] }>();
    for (const c of contacts) {
      const e = byId.get(c.customerId) ?? { customer: c.customer, matchedOn: [] };
      if (!e.matchedOn.includes(c.type.toLowerCase())) e.matchedOn.push(c.type.toLowerCase());
      byId.set(c.customerId, e);
    }
    return [...byId.values()].map((v) => ({ ...v.customer, matchedOn: v.matchedOn }));
  }

  private async refreshSearch(tx: Tx, tenantId: string, customerId: string) {
    const c = await tx.customer.findFirstOrThrow({
      where: { id: customerId, tenantId },
      include: { members: { where: { archivedAt: null } }, tags: { include: { tag: true } } },
    });
    const text = buildSearchText(
      [c.fullName, c.preferredName, c.customerNumber, c.email, c.addressLine1, c.addressLine2, c.landmark, c.city, c.state, c.postalCode,
        ...c.members.map((m) => m.fullName), ...c.tags.map((t) => t.tag.name)],
      [c.mobile, c.alternateMobile],
    );
    await tx.customer.update({ where: { id: customerId }, data: { searchText: text } });
  }

  private async syncContacts(tx: Tx, tenantId: string, customerId: string, mobile: string | null, alt: string | null, email: string | null) {
    await tx.customerContact.deleteMany({ where: { tenantId, customerId } });
    const rows = [
      mobile && { type: 'MOBILE', value: mobile, isPrimary: true },
      alt && alt !== mobile && { type: 'MOBILE', value: alt, isPrimary: false },
      email && { type: 'EMAIL', value: email, isPrimary: true },
    ].filter(Boolean) as { type: string; value: string; isPrimary: boolean }[];
    if (rows.length) await tx.customerContact.createMany({ data: rows.map((r) => ({ ...r, tenantId, customerId })) });
  }

  private async syncTags(tx: Tx, tenantId: string, customerId: string, names: string[]) {
    await tx.customerTag.deleteMany({ where: { tenantId, customerId } });
    for (const raw of [...new Set(names.map((n) => n.trim()).filter(Boolean))]) {
      const tag = await tx.tag.upsert({ where: { tenantId_name: { tenantId, name: raw } }, update: {}, create: { tenantId, name: raw } });
      await tx.customerTag.create({ data: { tenantId, customerId, tagId: tag.id } });
    }
  }

  async create(input: CustomerInput, force: boolean) {
    const tenantId = currentTenantId();
    const actor = currentContext().userId;
    return this.db.run(async (tx) => {
      const settings = await loadSettings(tx, tenantId);
      const country = input.country ?? settings.country;
      const mobile = normalizePhone(input.mobile, country);
      const alt = normalizePhone(input.alternateMobile, country);
      const email = normalizeEmail(input.email);

      const dups = await this.findDuplicates(tx, tenantId, { mobiles: [mobile, alt], email });
      if (dups.length && !force) {
        throw conflict('DUPLICATE_CUSTOMER', 'A customer with the same mobile number or email already exists', { candidates: dups });
      }
      await this.entitlements.assertWithinLimit(tx, tenantId, 'max_customers', await tx.customer.count({ where: { tenantId, status: 'ACTIVE' } }));

      const customerNumber = await nextNumber(tx, tenantId, 'customer', settings.customerPrefix, 5);
      const { tags, marketingConsent, dateOfBirth, anniversary, latitude, longitude, mobile: _m, alternateMobile: _a, email: _e, country: _c, ...rest } = input;
      void _m; void _a; void _e; void _c;
      const customer = await tx.customer.create({
        data: {
          ...rest, tenantId, customerNumber, mobile, alternateMobile: alt, email, country,
          marketingConsent, createdBy: actor, updatedBy: actor, firstVisitAt: new Date(),
          dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined, anniversary: anniversary ? new Date(anniversary) : undefined,
          latitude: latitude ?? undefined, longitude: longitude ?? undefined,
        },
      });
      const household = await tx.household.create({ data: { tenantId, primaryCustomerId: customer.id, name: `${customer.fullName} household` } });
      await tx.householdMember.create({
        data: { tenantId, householdId: household.id, customerId: customer.id, fullName: customer.fullName, relationship: 'SELF', dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined },
      });
      await this.syncContacts(tx, tenantId, customer.id, mobile, alt, email);
      await this.syncTags(tx, tenantId, customer.id, tags);
      if (marketingConsent) {
        await tx.customerConsent.createMany({
          data: (['EMAIL', 'SMS', 'WHATSAPP'] as const).map((channel) => ({ tenantId, customerId: customer.id, channel, purpose: 'MARKETING', granted: true, capturedBy: actor })),
        });
      }
      await this.refreshSearch(tx, tenantId, customer.id);
      await this.audit.recordTx(tx, { action: 'customer.created', entityType: 'customer', entityId: customer.id, metadata: { customerNumber, forcedDuplicate: dups.length > 0 } });
      return this.detail(tx, tenantId, customer.id);
    });
  }

  async detail(tx: Tx, tenantId: string, id: string) {
    const c = await tx.customer.findFirst({
      where: { id, tenantId },
      include: {
        members: { where: { archivedAt: null }, orderBy: { createdAt: 'asc' } },
        tags: { include: { tag: true } },
        consents: { orderBy: { capturedAt: 'desc' } },
      },
    });
    if (!c) throw notFound('Customer');
    const { searchText: _s, tags, consents, ...rest } = c;
    void _s;
    // Latest consent per channel+purpose.
    const latest = new Map<string, (typeof consents)[number]>();
    for (const x of consents) { const k = `${x.channel}:${x.purpose}`; if (!latest.has(k)) latest.set(k, x); }
    return { ...rest, tags: tags.map((t) => t.tag.name), consents: [...latest.values()] };
  }

  get(id: string) {
    const tenantId = currentTenantId();
    return this.db.run((tx) => this.detail(tx, tenantId, id));
  }

  async update(id: string, input: Partial<CustomerInput> & { version: number }) {
    const tenantId = currentTenantId();
    const actor = currentContext().userId;
    return this.db.run(async (tx) => {
      const existing = await tx.customer.findFirst({ where: { id, tenantId } });
      if (!existing) throw notFound('Customer');
      if (existing.version !== input.version) throw conflict('STALE_VERSION', 'Someone else changed this customer. Reload to see the latest details.');
      const settings = await loadSettings(tx, tenantId);
      const country = input.country ?? existing.country ?? settings.country;
      const mobile = input.mobile !== undefined ? normalizePhone(input.mobile, country) : existing.mobile;
      const alt = input.alternateMobile !== undefined ? normalizePhone(input.alternateMobile, country) : existing.alternateMobile;
      const email = input.email !== undefined ? normalizeEmail(input.email) : existing.email;
      const { tags, version: _v, dateOfBirth, anniversary, mobile: _m, alternateMobile: _a, email: _e, latitude, longitude, ...rest } = input;
      void _v; void _m; void _a; void _e;
      const r = await tx.customer.updateMany({
        where: { id, tenantId, version: input.version },
        data: {
          ...rest, mobile, alternateMobile: alt, email, updatedBy: actor, version: { increment: 1 },
          ...(dateOfBirth !== undefined ? { dateOfBirth: new Date(dateOfBirth) } : {}),
          ...(anniversary !== undefined ? { anniversary: new Date(anniversary) } : {}),
          ...(latitude !== undefined ? { latitude } : {}), ...(longitude !== undefined ? { longitude } : {}),
        },
      });
      if (!r.count) throw conflict('STALE_VERSION', 'Someone else changed this customer. Reload to see the latest details.');
      await this.syncContacts(tx, tenantId, id, mobile, alt, email);
      if (tags) await this.syncTags(tx, tenantId, id, tags);
      if (existing.fullName !== (input.fullName ?? existing.fullName)) {
        await tx.householdMember.updateMany({ where: { tenantId, customerId: id, relationship: 'SELF' }, data: { fullName: input.fullName } });
      }
      await this.refreshSearch(tx, tenantId, id);
      await this.audit.recordTx(tx, { action: 'customer.updated', entityType: 'customer', entityId: id, metadata: { fields: Object.keys(input) } });
      const duplicates = await this.findDuplicates(tx, tenantId, { mobiles: [mobile, alt], email, excludeId: id });
      return { ...(await this.detail(tx, tenantId, id)), possibleDuplicates: duplicates };
    });
  }

  async setStatus(id: string, status: 'ACTIVE' | 'ARCHIVED') {
    const tenantId = currentTenantId();
    return this.db.run(async (tx) => {
      const r = await tx.customer.updateMany({
        where: { id, tenantId, status: status === 'ARCHIVED' ? 'ACTIVE' : 'ARCHIVED' },
        data: { status, archivedAt: status === 'ARCHIVED' ? new Date() : null, version: { increment: 1 } },
      });
      if (!r.count) throw notFound('Customer');
      await this.audit.recordTx(tx, { action: status === 'ARCHIVED' ? 'customer.archived' : 'customer.restored', entityType: 'customer', entityId: id });
      return { ok: true };
    });
  }

  async search(p: SearchParams) {
    const tenantId = currentTenantId();
    return this.db.run(async (tx) => {
      const where: Prisma.Sql[] = [Prisma.sql`c."tenantId" = ${tenantId}::uuid`, Prisma.sql`c.status = ${p.status ?? 'ACTIVE'}`];
      let rank = Prisma.sql`0`;
      const q = p.q?.trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
      if (q) {
        const looksLikePhone = /^[\d\s+()-]{3,}$/.test(q) && digitsOnly(q).length >= 3;
        if (looksLikePhone) {
          const d = digitsOnly(q);
          where.push(Prisma.sql`c."searchText" ILIKE ${'%' + escapeLike(d) + '%'}`);
          rank = Prisma.sql`similarity(c."fullName", ${q})`;
        } else {
          const tokens = q.split(/\s+/).filter(Boolean).slice(0, 6);
          const tokenConds = tokens.map((t) => Prisma.sql`c."searchText" ILIKE ${'%' + escapeLike(t) + '%'}`);
          // all tokens present, OR the whole query is a close (typo-tolerant) match for the name
          where.push(Prisma.sql`((${Prisma.join(tokenConds, ' AND ')}) OR word_similarity(${q}, c."fullName") > 0.55)`);
          rank = Prisma.sql`GREATEST(similarity(c."fullName", ${q}), word_similarity(${q}, c."searchText"))`;
        }
      }
      if (p.city) where.push(Prisma.sql`c.city ILIKE ${'%' + escapeLike(p.city) + '%'}`);
      if (p.postalCode) where.push(Prisma.sql`c."postalCode" ILIKE ${escapeLike(p.postalCode) + '%'}`);
      if (p.branchId) where.push(Prisma.sql`c."preferredBranchId" = ${p.branchId}::uuid`);
      if (p.tag) where.push(Prisma.sql`EXISTS (SELECT 1 FROM customer_tags ct JOIN tags t ON t.id = ct."tagId" WHERE ct."customerId" = c.id AND t."tenantId" = c."tenantId" AND lower(t.name) = ${p.tag.toLowerCase()})`);
      if (p.nearLat !== undefined && p.nearLng !== undefined && p.radiusKm) {
        where.push(Prisma.sql`c.latitude IS NOT NULL AND (6371 * acos(LEAST(1, cos(radians(${p.nearLat})) * cos(radians(c.latitude::float)) * cos(radians(c.longitude::float) - radians(${p.nearLng})) + sin(radians(${p.nearLat})) * sin(radians(c.latitude::float))))) <= ${p.radiusKm}`);
      }
      const dir = p.dir === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;
      const order = p.sort === 'name' ? Prisma.sql`c."fullName" ${dir}`
        : p.sort === 'createdAt' ? Prisma.sql`c."createdAt" ${dir}`
        : p.sort === 'lastVisit' ? Prisma.sql`c."lastVisitAt" ${dir} NULLS LAST`
        : q ? Prisma.sql`rank DESC, c."fullName" ASC` : Prisma.sql`c."createdAt" DESC`;

      const rows = await tx.$queryRaw<{ id: string; total: bigint }[]>`
        SELECT c.id, count(*) OVER() AS total, ${rank} AS rank
        FROM customers c WHERE ${Prisma.join(where, ' AND ')}
        ORDER BY ${order} LIMIT ${p.pageSize} OFFSET ${(p.page - 1) * p.pageSize}`;
      const total = rows[0] ? Number(rows[0].total) : 0;
      const ids = rows.map((r) => r.id);
      const customers = ids.length ? await tx.customer.findMany({
        where: { id: { in: ids }, tenantId },
        select: { id: true, customerNumber: true, fullName: true, preferredName: true, mobile: true, email: true, city: true, postalCode: true, status: true, lastVisitAt: true, createdAt: true,
          members: { where: { archivedAt: null }, select: { id: true, fullName: true, relationship: true } }, tags: { select: { tag: { select: { name: true } } } } },
      }) : [];
      const byId = new Map(customers.map((c) => [c.id, c]));
      const tokens = q ? q.split(/\s+/).filter(Boolean) : [];
      const data = ids.map((id) => byId.get(id)!).filter(Boolean).map((c) => ({
        ...c, tags: c.tags.map((t) => t.tag.name),
        matchedMembers: tokens.length ? c.members.filter((m) => m.relationship !== 'SELF' && tokens.some((t) => m.fullName.toLowerCase().includes(t))) : [],
      }));
      return { data, total };
    });
  }

  async recent(limit = 8) {
    const tenantId = currentTenantId();
    return this.db.run((tx) => tx.customer.findMany({
      where: { tenantId, status: 'ACTIVE' }, orderBy: [{ lastVisitAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }], take: limit,
      select: { id: true, customerNumber: true, fullName: true, mobile: true, city: true, lastVisitAt: true },
    }));
  }

  // ───── household members ─────
  async addMember(customerId: string, m: { fullName: string; relationship: string; dateOfBirth?: string; notes?: string }) {
    const tenantId = currentTenantId();
    return this.db.run(async (tx) => {
      const h = await tx.household.findFirst({ where: { tenantId, primaryCustomerId: customerId } });
      if (!h) throw notFound('Customer');
      const member = await tx.householdMember.create({
        data: { tenantId, householdId: h.id, customerId, fullName: m.fullName, relationship: m.relationship, notes: m.notes, dateOfBirth: m.dateOfBirth ? new Date(m.dateOfBirth) : undefined },
      });
      await this.refreshSearch(tx, tenantId, customerId);
      await this.audit.recordTx(tx, { action: 'household.member_added', entityType: 'customer', entityId: customerId, metadata: { memberId: member.id, relationship: m.relationship } });
      return member;
    });
  }

  async updateMember(memberId: string, m: { fullName?: string; relationship?: string; dateOfBirth?: string; notes?: string }) {
    const tenantId = currentTenantId();
    return this.db.run(async (tx) => {
      const existing = await tx.householdMember.findFirst({ where: { id: memberId, tenantId, archivedAt: null } });
      if (!existing) throw notFound('Family member');
      if (existing.relationship === 'SELF' && m.relationship && m.relationship !== 'SELF') throw conflict('SELF_LOCKED', 'The customer themself cannot be re-labelled');
      const updated = await tx.householdMember.update({
        where: { id: memberId },
        data: { fullName: m.fullName, relationship: m.relationship, notes: m.notes, dateOfBirth: m.dateOfBirth ? new Date(m.dateOfBirth) : undefined },
      });
      await this.refreshSearch(tx, tenantId, existing.customerId);
      await this.audit.recordTx(tx, { action: 'household.member_updated', entityType: 'customer', entityId: existing.customerId, metadata: { memberId } });
      return updated;
    });
  }

  async archiveMember(memberId: string) {
    const tenantId = currentTenantId();
    return this.db.run(async (tx) => {
      const existing = await tx.householdMember.findFirst({ where: { id: memberId, tenantId, archivedAt: null } });
      if (!existing) throw notFound('Family member');
      if (existing.relationship === 'SELF') throw conflict('SELF_LOCKED', 'Archive the customer instead of the primary person');
      await tx.householdMember.update({ where: { id: memberId }, data: { archivedAt: new Date() } });
      await this.refreshSearch(tx, tenantId, existing.customerId);
      await this.audit.recordTx(tx, { action: 'household.member_archived', entityType: 'customer', entityId: existing.customerId, metadata: { memberId } });
      return { ok: true };
    });
  }

  // ───── consents ─────
  async setConsent(customerId: string, channel: string, purpose: string, granted: boolean) {
    const tenantId = currentTenantId();
    return this.db.run(async (tx) => {
      if (!(await tx.customer.findFirst({ where: { id: customerId, tenantId } }))) throw notFound('Customer');
      await tx.customerConsent.create({ data: { tenantId, customerId, channel, purpose, granted, capturedBy: currentContext().userId } });
      if (purpose === 'MARKETING') {
        const any = await tx.customerConsent.findMany({ where: { tenantId, customerId, purpose: 'MARKETING' }, orderBy: { capturedAt: 'desc' } });
        const latest = new Map<string, boolean>();
        for (const c of any) if (!latest.has(c.channel)) latest.set(c.channel, c.granted);
        await tx.customer.update({ where: { id: customerId }, data: { marketingConsent: [...latest.values()].some(Boolean) } });
      }
      await this.audit.recordTx(tx, { action: 'customer.consent_changed', entityType: 'customer', entityId: customerId, metadata: { channel, purpose, granted } });
      return { ok: true };
    });
  }

  // ───── merge ─────
  async merge(targetId: string, sourceId: string) {
    const tenantId = currentTenantId();
    if (targetId === sourceId) throw conflict('SAME_CUSTOMER', 'Choose two different customers to merge');
    return this.db.run(async (tx) => {
      const [target, source] = await Promise.all([
        tx.customer.findFirst({ where: { id: targetId, tenantId, status: 'ACTIVE' } }),
        tx.customer.findFirst({ where: { id: sourceId, tenantId, status: 'ACTIVE' } }),
      ]);
      if (!target || !source) throw notFound('Customer');
      const targetHousehold = await tx.household.findFirstOrThrow({ where: { tenantId, primaryCustomerId: targetId } });
      // The source's own person is kept as a separate family member so no measurement history is lost.
      await tx.householdMember.updateMany({ where: { tenantId, customerId: sourceId, relationship: 'SELF' }, data: { relationship: 'OTHER', notes: `Merged from ${source.customerNumber}` } });
      await tx.householdMember.updateMany({ where: { tenantId, customerId: sourceId }, data: { customerId: targetId, householdId: targetHousehold.id } });
      await tx.order.updateMany({ where: { tenantId, customerId: sourceId }, data: { customerId: targetId } });
      await tx.appointment.updateMany({ where: { tenantId, customerId: sourceId }, data: { customerId: targetId } });
      await tx.customerConsent.updateMany({ where: { tenantId, customerId: sourceId }, data: { customerId: targetId } });
      const targetTags = new Set((await tx.customerTag.findMany({ where: { tenantId, customerId: targetId } })).map((t) => t.tagId));
      for (const t of await tx.customerTag.findMany({ where: { tenantId, customerId: sourceId } })) {
        if (!targetTags.has(t.tagId)) await tx.customerTag.create({ data: { tenantId, customerId: targetId, tagId: t.tagId } });
      }
      await tx.customerTag.deleteMany({ where: { tenantId, customerId: sourceId } });
      await this.syncContacts(tx, tenantId, targetId, target.mobile ?? source.mobile, target.alternateMobile ?? (target.mobile ? source.mobile : source.alternateMobile), target.email ?? source.email);
      await tx.customerContact.deleteMany({ where: { tenantId, customerId: sourceId } });
      await tx.customer.update({
        where: { id: sourceId },
        data: { status: 'MERGED', mergedIntoId: targetId, archivedAt: new Date(), searchText: '', mobile: null, alternateMobile: null, email: null },
      });
      await tx.customer.update({
        where: { id: targetId },
        data: {
          mobile: target.mobile ?? source.mobile, email: target.email ?? source.email, version: { increment: 1 },
          firstVisitAt: [target.firstVisitAt, source.firstVisitAt].filter((d): d is Date => !!d).sort((a, b) => +a - +b)[0],
        },
      });
      await this.refreshSearch(tx, tenantId, targetId);
      await this.audit.recordTx(tx, { action: 'customer.merged', entityType: 'customer', entityId: targetId, metadata: { sourceId, sourceNumber: source.customerNumber } });
      return this.detail(tx, tenantId, targetId);
    });
  }

  // ───── timeline ─────
  async timeline(customerId: string) {
    const tenantId = currentTenantId();
    return this.db.run(async (tx) => {
      const c = await tx.customer.findFirst({ where: { id: customerId, tenantId } });
      if (!c) throw notFound('Customer');
      const ids = [customerId, ...(await tx.customer.findMany({ where: { tenantId, mergedIntoId: customerId }, select: { id: true } })).map((x) => x.id)];
      const [orders, history, payments, invoices, appts, revisions, comments] = await Promise.all([
        tx.order.findMany({ where: { tenantId, customerId: { in: ids } }, select: { id: true, orderNumber: true, createdAt: true, total: true, kind: true } }),
        tx.orderStatusHistory.findMany({ where: { tenantId, order: { customerId: { in: ids } } }, select: { id: true, orderId: true, fromStatus: true, toStatus: true, createdAt: true, order: { select: { orderNumber: true } } } }),
        tx.payment.findMany({ where: { tenantId, customerId: { in: ids } }, select: { id: true, receiptNumber: true, amount: true, method: true, kind: true, receivedAt: true } }),
        tx.invoice.findMany({ where: { tenantId, customerId: { in: ids } }, select: { id: true, number: true, total: true, kind: true, status: true, issuedAt: true } }),
        tx.appointment.findMany({ where: { tenantId, customerId: { in: ids } }, select: { id: true, type: true, startsAt: true, status: true } }),
        tx.measurementRevision.findMany({ where: { tenantId, profile: { member: { customerId: { in: ids } } } }, select: { id: true, revisionNo: true, createdAt: true, isDraft: true, profile: { select: { id: true, name: true, member: { select: { fullName: true } } } } } }),
        tx.comment.findMany({ where: { tenantId, entityType: 'customer', entityId: { in: ids } }, select: { id: true, body: true, createdAt: true } }),
      ]);
      const events = [
        { at: c.createdAt, type: 'customer', title: `Customer ${c.customerNumber} created` },
        ...orders.map((o) => ({ at: o.createdAt, type: 'order', title: `Order ${o.orderNumber} created (${o.kind.toLowerCase()})`, ref: o.id, amount: o.total.toString() })),
        ...history.map((h) => ({ at: h.createdAt, type: 'status', title: `Order ${h.order.orderNumber}: ${h.fromStatus ?? 'new'} → ${h.toStatus}`, ref: h.orderId })),
        ...payments.map((p) => ({ at: p.receivedAt, type: 'payment', title: `${p.kind === 'WRITE_OFF' ? 'Write-off' : 'Payment'} ${p.receiptNumber} via ${p.method}`, ref: p.id, amount: p.amount.toString() })),
        ...invoices.map((i) => ({ at: i.issuedAt, type: 'invoice', title: `${i.kind === 'PROFORMA' ? 'Pro forma' : 'Invoice'} ${i.number}${i.status === 'VOID' ? ' (void)' : ''}`, ref: i.id, amount: i.total.toString() })),
        ...appts.map((a) => ({ at: a.startsAt, type: 'appointment', title: `${a.type.toLowerCase().replace(/_/g, ' ')} appointment (${a.status.toLowerCase()})`, ref: a.id })),
        ...revisions.map((r) => ({ at: r.createdAt, type: 'measurement', title: `${r.profile.member.fullName}: ${r.profile.name} revision ${r.revisionNo}${r.isDraft ? ' (draft)' : ''}`, ref: r.profile.id })),
        ...comments.map((m) => ({ at: m.createdAt, type: 'note', title: m.body })),
      ].sort((a, b) => +b.at - +a.at);
      return events;
    });
  }

  // ───── CSV export ─────
  async exportCsv() {
    const tenantId = currentTenantId();
    return this.db.run(async (tx) => {
      const rows = await tx.customer.findMany({ where: { tenantId, status: 'ACTIVE' }, orderBy: { customerNumber: 'asc' }, include: { tags: { include: { tag: true } } } });
      await this.audit.recordTx(tx, { action: 'customer.exported', entityType: 'customer', metadata: { count: rows.length } });
      const head = ['Customer number', 'Name', 'Mobile', 'Email', 'City', 'Postal code', 'Tags', 'Marketing consent', 'Created'];
      const lines = rows.map((c) => [c.customerNumber, c.fullName, c.mobile, c.email, c.city, c.postalCode, c.tags.map((t) => t.tag.name).join('; '), c.marketingConsent ? 'yes' : 'no', c.createdAt.toISOString()]);
      return [head, ...lines].map((l) => l.map(csvCell).join(',')).join('\r\n');
    });
  }
}

/** Escapes CSV and neutralises spreadsheet formula injection (=, +, -, @ prefixes). */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
