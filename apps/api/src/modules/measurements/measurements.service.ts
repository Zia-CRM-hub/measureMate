import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { fromCanonicalMm, LengthUnit, RevisionInput, TemplateInput, toCanonicalMm } from '@measuremate/validation';
import { AuditService } from '../../common/audit.service';
import { currentContext, currentTenantId } from '../../common/context';
import { badRequest, conflict, forbidden, notFound, unprocessable } from '../../common/errors';
import { PrismaService, Tx } from '../../common/prisma.service';
import { loadSettings } from '../../common/scope';

const templateInclude = {
  sections: { orderBy: { sortOrder: 'asc' as const }, include: { fields: { orderBy: { sortOrder: 'asc' as const } } } },
};

export interface Warning { field: string; label: string; kind: 'MISSING_REQUIRED' | 'BELOW_RANGE' | 'ABOVE_RANGE'; message: string }

@Injectable()
export class MeasurementsService {
  constructor(private readonly db: PrismaService, private readonly audit: AuditService) {}

  // ───── templates ─────
  listTemplates(includeArchived = false) {
    const tenantId = currentTenantId();
    return this.db.run((tx) => tx.measurementTemplate.findMany({
      where: { tenantId, ...(includeArchived ? {} : { archivedAt: null }) }, orderBy: [{ category: 'asc' }, { name: 'asc' }], include: templateInclude,
    }));
  }

  async getTemplate(id: string) {
    const tenantId = currentTenantId();
    const t = await this.db.run((tx) => tx.measurementTemplate.findFirst({ where: { id, tenantId }, include: templateInclude }));
    if (!t) throw notFound('Template');
    return t;
  }

  private async writeSections(tx: Tx, tenantId: string, templateId: string, input: TemplateInput) {
    const keys = input.sections.flatMap((s) => s.fields.map((f) => f.key));
    if (new Set(keys).size !== keys.length) throw badRequest('DUPLICATE_FIELD_KEY', 'Each measurement needs a unique key');
    let so = 0;
    for (const s of input.sections) {
      const section = await tx.measurementTemplateSection.create({ data: { tenantId, templateId, name: s.name, sortOrder: so++ } });
      await tx.measurementTemplateField.createMany({
        data: s.fields.map((f, i) => ({
          tenantId, sectionId: section.id, key: f.key, label: f.label, helpText: f.helpText ?? null, required: f.required, sortOrder: i,
          minWarnMm: f.minWarnCm !== undefined ? toCanonicalMm(f.minWarnCm, 'cm') : null,
          maxWarnMm: f.maxWarnCm !== undefined ? toCanonicalMm(f.maxWarnCm, 'cm') : null,
        })),
      });
    }
  }

  async createTemplate(input: TemplateInput) {
    const tenantId = currentTenantId();
    return this.db.run(async (tx) => {
      if (await tx.measurementTemplate.findFirst({ where: { tenantId, name: input.name } })) throw conflict('TEMPLATE_EXISTS', 'A template with this name already exists');
      const t = await tx.measurementTemplate.create({ data: { tenantId, name: input.name, category: input.category } });
      await this.writeSections(tx, tenantId, t.id, input);
      await this.audit.recordTx(tx, { action: 'measurement.template_created', entityType: 'template', entityId: t.id, metadata: { name: input.name } });
      return tx.measurementTemplate.findUniqueOrThrow({ where: { id: t.id }, include: templateInclude });
    });
  }

  async cloneTemplate(id: string, name?: string) {
    const tenantId = currentTenantId();
    return this.db.run(async (tx) => {
      const src = await tx.measurementTemplate.findFirst({ where: { id, tenantId }, include: templateInclude });
      if (!src) throw notFound('Template');
      let newName = name ?? `${src.name} (copy)`;
      for (let i = 2; await tx.measurementTemplate.findFirst({ where: { tenantId, name: newName } }); i++) newName = `${name ?? src.name + ' (copy)'} ${i}`;
      const t = await tx.measurementTemplate.create({ data: { tenantId, name: newName, category: src.category } });
      for (const s of src.sections) {
        const section = await tx.measurementTemplateSection.create({ data: { tenantId, templateId: t.id, name: s.name, sortOrder: s.sortOrder } });
        await tx.measurementTemplateField.createMany({
          data: s.fields.map((f) => ({ tenantId, sectionId: section.id, key: f.key, label: f.label, helpText: f.helpText, required: f.required, minWarnMm: f.minWarnMm, maxWarnMm: f.maxWarnMm, sortOrder: f.sortOrder })),
        });
      }
      await this.audit.recordTx(tx, { action: 'measurement.template_cloned', entityType: 'template', entityId: t.id, metadata: { from: id } });
      return tx.measurementTemplate.findUniqueOrThrow({ where: { id: t.id }, include: templateInclude });
    });
  }

  async updateTemplate(id: string, input: TemplateInput) {
    const tenantId = currentTenantId();
    return this.db.run(async (tx) => {
      const t = await tx.measurementTemplate.findFirst({ where: { id, tenantId } });
      if (!t) throw notFound('Template');
      if (t.isSystem) throw conflict('SYSTEM_TEMPLATE', 'Built-in templates cannot be edited. Clone it first, then edit your copy.');
      const clash = await tx.measurementTemplate.findFirst({ where: { tenantId, name: input.name, id: { not: id } } });
      if (clash) throw conflict('TEMPLATE_EXISTS', 'A template with this name already exists');
      await tx.measurementTemplateSection.deleteMany({ where: { tenantId, templateId: id } });
      await tx.measurementTemplate.update({ where: { id }, data: { name: input.name, category: input.category } });
      await this.writeSections(tx, tenantId, id, input);
      await this.audit.recordTx(tx, { action: 'measurement.template_updated', entityType: 'template', entityId: id });
      return tx.measurementTemplate.findUniqueOrThrow({ where: { id }, include: templateInclude });
    });
  }

  async archiveTemplate(id: string) {
    const tenantId = currentTenantId();
    return this.db.run(async (tx) => {
      const r = await tx.measurementTemplate.updateMany({ where: { id, tenantId, archivedAt: null }, data: { archivedAt: new Date() } });
      if (!r.count) throw notFound('Template');
      await this.audit.recordTx(tx, { action: 'measurement.template_archived', entityType: 'template', entityId: id });
      return { ok: true };
    });
  }

  // ───── profiles ─────
  async createProfile(memberId: string, input: { templateId: string; name?: string; copyFromProfileId?: string }) {
    const tenantId = currentTenantId();
    return this.db.run(async (tx) => {
      const member = await tx.householdMember.findFirst({ where: { id: memberId, tenantId, archivedAt: null } });
      if (!member) throw notFound('Family member');
      const tpl = await tx.measurementTemplate.findFirst({ where: { id: input.templateId, tenantId, archivedAt: null } });
      if (!tpl) throw notFound('Template');
      const profile = await tx.measurementProfile.create({
        data: { tenantId, memberId, templateId: tpl.id, name: input.name?.trim() || tpl.name, createdBy: currentContext().userId },
      });
      await this.audit.recordTx(tx, { action: 'measurement.profile_created', entityType: 'measurement_profile', entityId: profile.id, metadata: { memberId, template: tpl.name } });
      if (input.copyFromProfileId) {
        const src = await tx.measurementProfile.findFirst({ where: { id: input.copyFromProfileId, tenantId } });
        if (!src) throw notFound('Source measurement profile');
        const srcRev = await this.latestRevision(tx, tenantId, src.id, true);
        if (srcRev) {
          const fields = await this.templateFields(tx, tenantId, tpl.id);
          const values: Record<string, string> = {};
          for (const v of srcRev.values) if (fields.has(v.fieldKey)) values[v.fieldKey] = fromCanonicalMm(v.valueMm.toFixed(3), 'cm', 3);
          if (Object.keys(values).length) {
            await this.writeRevision(tx, tenantId, profile.id, {
              unit: 'cm', values, isDraft: false, changeReason: `Copied from previous measurements (revision ${srcRev.revisionNo})`, overrideWarningsReason: 'Copied from earlier record',
            }, { skipWarningCheck: true });
          }
        }
      }
      return this.profileDetail(tx, tenantId, profile.id);
    });
  }

  private async templateFields(tx: Tx, tenantId: string, templateId: string) {
    const secs = await tx.measurementTemplateSection.findMany({ where: { tenantId, templateId }, include: { fields: true } });
    return new Map(secs.flatMap((s) => s.fields).map((f) => [f.key, f]));
  }

  private latestRevision(tx: Tx, tenantId: string, profileId: string, nonDraftOnly = false) {
    return tx.measurementRevision.findFirst({
      where: { tenantId, profileId, ...(nonDraftOnly ? { isDraft: false } : {}) }, orderBy: { revisionNo: 'desc' }, include: { values: true, styles: true },
    });
  }

  async listProfiles(memberId: string) {
    const tenantId = currentTenantId();
    return this.db.run(async (tx) => {
      if (!(await tx.householdMember.findFirst({ where: { id: memberId, tenantId } }))) throw notFound('Family member');
      return tx.measurementProfile.findMany({ where: { tenantId, memberId, archivedAt: null }, orderBy: { createdAt: 'asc' } });
    });
  }

  async getProfile(id: string, unit?: LengthUnit) {
    const tenantId = currentTenantId();
    return this.db.run((tx) => this.profileDetail(tx, tenantId, id, unit));
  }

  private async profileDetail(tx: Tx, tenantId: string, id: string, unit?: LengthUnit) {
    const p = await tx.measurementProfile.findFirst({
      where: { id, tenantId }, include: { member: { select: { id: true, fullName: true, relationship: true, customerId: true } } },
    });
    if (!p) throw notFound('Measurement profile');
    const settings = await loadSettings(tx, tenantId);
    const u = unit ?? (settings.measurementUnit as LengthUnit);
    const [template, revisions, latest] = await Promise.all([
      tx.measurementTemplate.findFirst({ where: { id: p.templateId }, include: templateInclude }),
      tx.measurementRevision.findMany({
        where: { tenantId, profileId: id }, orderBy: { revisionNo: 'desc' },
        select: { id: true, revisionNo: true, effectiveDate: true, changeReason: true, isDraft: true, changedBy: true, createdAt: true, enteredUnit: true, restoredFromRevisionNo: true, warningOverrideReason: true },
      }),
      this.latestRevision(tx, tenantId, id),
    ]);
    return { ...p, unit: u, template, revisions, latest: latest ? this.presentRevision(latest, u) : null };
  }

  private presentRevision(r: Prisma.MeasurementRevisionGetPayload<{ include: { values: true; styles: true } }>, unit: LengthUnit) {
    return {
      id: r.id, revisionNo: r.revisionNo, effectiveDate: r.effectiveDate, isDraft: r.isDraft, changeReason: r.changeReason, enteredUnit: r.enteredUnit,
      postureNotes: r.postureNotes, fitNotes: r.fitNotes, warnings: r.warnings, warningOverrideReason: r.warningOverrideReason, createdAt: r.createdAt, changedBy: r.changedBy,
      values: Object.fromEntries(r.values.map((v) => [v.fieldKey, {
        display: fromCanonicalMm(v.valueMm.toFixed(3), unit), unit, canonicalMm: v.valueMm.toFixed(3),
        entered: `${v.enteredValue.toString()} ${v.enteredUnit}`,
      }])),
      styles: Object.fromEntries(r.styles.map((s) => [s.key, s.value])),
      changedFields: r.changedFields,
    };
  }

  // ───── revisions ─────
  async createRevision(profileId: string, input: RevisionInput) {
    const tenantId = currentTenantId();
    const ctx = currentContext();
    return this.db.run(async (tx) => {
      const profile = await tx.measurementProfile.findFirst({ where: { id: profileId, tenantId, archivedAt: null } });
      if (!profile) throw notFound('Measurement profile');
      const hasHistory = (await tx.measurementRevision.count({ where: { tenantId, profileId } })) > 0;
      if (hasHistory && !ctx.permissions.includes('measurement.revise')) throw forbidden('You can record first measurements but not revise existing ones');
      const rev = await this.writeRevision(tx, tenantId, profileId, input, {});
      return rev;
    });
  }

  /** Validates, diffs against the previous snapshot and appends one immutable revision. */
  private async writeRevision(tx: Tx, tenantId: string, profileId: string, input: RevisionInput & { restoredFromRevisionNo?: number }, opts: { skipWarningCheck?: boolean }) {
    // Serialise concurrent revisions on the same profile.
    await tx.$queryRaw`SELECT id FROM measurement_profiles WHERE id = ${profileId}::uuid AND "tenantId" = ${tenantId}::uuid FOR UPDATE`;
    const profile = await tx.measurementProfile.findFirstOrThrow({ where: { id: profileId, tenantId } });
    const fields = await this.templateFields(tx, tenantId, profile.templateId);
    const prev = await this.latestRevision(tx, tenantId, profileId);

    // 1. Convert entered values deterministically; reject unknown keys and impossible numbers.
    const entered = new Map<string, { mm: string; value: string; unit: LengthUnit }>();
    for (const [key, raw] of Object.entries(input.values)) {
      if (!fields.has(key)) throw badRequest('UNKNOWN_FIELD', `"${key}" is not part of this template`);
      if (raw === '' || raw === null) continue;
      let mm: string;
      try { mm = toCanonicalMm(raw, input.unit); } catch { throw badRequest('INVALID_MEASUREMENT', `"${fields.get(key)!.label}" must be a number`); }
      if (Number(mm) <= 0) throw badRequest('INVALID_MEASUREMENT', `"${fields.get(key)!.label}" must be greater than zero`);
      entered.set(key, { mm, value: String(raw), unit: input.unit });
    }

    // 2. Snapshot = previous values overlaid with submitted values.
    const prevValues = new Map((prev?.values ?? []).map((v) => [v.fieldKey, v]));
    const snapshot = new Map<string, { mm: string; entered: string; unit: string }>();
    for (const [k, v] of prevValues) snapshot.set(k, { mm: v.valueMm.toFixed(3), entered: v.enteredValue.toString(), unit: v.enteredUnit });
    for (const [k, v] of entered) snapshot.set(k, { mm: v.mm, entered: v.value, unit: v.unit });

    // 3. Rule-based checks (deterministic range and completeness rules — not AI).
    const warnings: Warning[] = [];
    for (const [key, f] of fields) {
      const cur = snapshot.get(key);
      if (!cur) { if (f.required) warnings.push({ field: key, label: f.label, kind: 'MISSING_REQUIRED', message: `${f.label} is required` }); continue; }
      if (!entered.has(key)) continue; // only judge values entered in this revision
      const mm = Number(cur.mm);
      if (f.minWarnMm && mm < Number(f.minWarnMm)) warnings.push({ field: key, label: f.label, kind: 'BELOW_RANGE', message: `${f.label} looks small (below ${fromCanonicalMm(f.minWarnMm.toString(), input.unit, 1)} ${input.unit})` });
      if (f.maxWarnMm && mm > Number(f.maxWarnMm)) warnings.push({ field: key, label: f.label, kind: 'ABOVE_RANGE', message: `${f.label} looks large (above ${fromCanonicalMm(f.maxWarnMm.toString(), input.unit, 1)} ${input.unit})` });
    }
    const blocking = input.isDraft ? [] : warnings;
    if (!opts.skipWarningCheck && blocking.length && !input.overrideWarningsReason) {
      throw unprocessable('MEASUREMENT_WARNINGS', 'Please check these measurements, or confirm them with a reason', { warnings: blocking, checkType: 'rule-based range and completeness checks' });
    }

    // 4. Diff.
    const changedFields: Record<string, { from: string | null; to: string | null }> = {};
    for (const [k, v] of snapshot) {
      const before = prevValues.get(k)?.valueMm.toFixed(3) ?? null;
      if (before === null || Number(before) !== Number(v.mm)) changedFields[k] = { from: before, to: v.mm };
    }
    const prevStyles = new Map((prev?.styles ?? []).map((s) => [s.key, s.value]));
    const styles = new Map(prevStyles);
    for (const [k, v] of Object.entries(input.stylePreferences ?? {})) { if (v === '') styles.delete(k); else styles.set(k, v); }
    const styleChanged = [...new Set([...styles.keys(), ...prevStyles.keys()])].some((k) => styles.get(k) !== prevStyles.get(k));
    for (const k of new Set([...styles.keys(), ...prevStyles.keys()])) {
      if (styles.get(k) !== prevStyles.get(k)) changedFields[`style:${k}`] = { from: prevStyles.get(k) ?? null, to: styles.get(k) ?? null };
    }
    const notesChanged = (input.postureNotes ?? prev?.postureNotes ?? null) !== (prev?.postureNotes ?? null) || (input.fitNotes ?? prev?.fitNotes ?? null) !== (prev?.fitNotes ?? null);
    if (!Object.keys(changedFields).length && !notesChanged && !input.restoredFromRevisionNo && prev) throw badRequest('NO_CHANGES', 'Nothing has changed since the last revision');
    void styleChanged;

    // 5. Append.
    const revisionNo = (prev?.revisionNo ?? 0) + 1;
    const revision = await tx.measurementRevision.create({
      data: {
        tenantId, profileId, revisionNo, effectiveDate: input.effectiveDate ? new Date(input.effectiveDate) : new Date(),
        enteredUnit: input.unit, changeReason: input.changeReason ?? (revisionNo === 1 ? 'Initial measurements' : null),
        changedFields: changedFields as Prisma.InputJsonValue,
        postureNotes: input.postureNotes ?? prev?.postureNotes ?? null, fitNotes: input.fitNotes ?? prev?.fitNotes ?? null,
        warnings: warnings.length ? (warnings as unknown as Prisma.InputJsonValue) : undefined,
        warningOverrideReason: warnings.length && input.overrideWarningsReason ? input.overrideWarningsReason : null,
        isDraft: !!input.isDraft, restoredFromRevisionNo: input.restoredFromRevisionNo ?? null, changedBy: currentContext().userId,
      },
    });
    await tx.measurementValue.createMany({
      data: [...snapshot].map(([fieldKey, v]) => ({ tenantId, revisionId: revision.id, fieldKey, valueMm: v.mm, enteredValue: v.entered, enteredUnit: v.unit })),
    });
    if (styles.size) await tx.stylePreference.createMany({ data: [...styles].map(([key, value]) => ({ tenantId, revisionId: revision.id, key, value })) });
    if (!input.isDraft) await tx.measurementProfile.update({ where: { id: profileId }, data: { currentRevisionNo: revisionNo } });
    await this.audit.recordTx(tx, {
      action: input.restoredFromRevisionNo ? 'measurement.restored' : 'measurement.revised', entityType: 'measurement_profile', entityId: profileId,
      metadata: { revisionNo, changed: Object.keys(changedFields), draft: !!input.isDraft, overrideReason: input.overrideWarningsReason },
    });
    const full = await tx.measurementRevision.findUniqueOrThrow({ where: { id: revision.id }, include: { values: true, styles: true } });
    return { ...this.presentRevision(full, input.unit), warnings };
  }

  async listRevisions(profileId: string) {
    const tenantId = currentTenantId();
    return this.db.run(async (tx) => {
      if (!(await tx.measurementProfile.findFirst({ where: { id: profileId, tenantId } }))) throw notFound('Measurement profile');
      return tx.measurementRevision.findMany({ where: { tenantId, profileId }, orderBy: { revisionNo: 'desc' } });
    });
  }

  async getRevision(profileId: string, revisionNo: number, unit?: LengthUnit) {
    const tenantId = currentTenantId();
    return this.db.run(async (tx) => {
      const r = await tx.measurementRevision.findFirst({ where: { tenantId, profileId, revisionNo }, include: { values: true, styles: true } });
      if (!r) throw notFound('Revision');
      const u = unit ?? ((await loadSettings(tx, tenantId)).measurementUnit as LengthUnit);
      return this.presentRevision(r, u);
    });
  }

  async compare(profileId: string, from: number, to: number, unit?: LengthUnit) {
    const tenantId = currentTenantId();
    return this.db.run(async (tx) => {
      const profile = await tx.measurementProfile.findFirst({ where: { id: profileId, tenantId } });
      if (!profile) throw notFound('Measurement profile');
      const [a, b] = await Promise.all([from, to].map((n) => tx.measurementRevision.findFirst({ where: { tenantId, profileId, revisionNo: n }, include: { values: true, styles: true } })));
      if (!a || !b) throw notFound('Revision');
      const u = unit ?? ((await loadSettings(tx, tenantId)).measurementUnit as LengthUnit);
      const fields = await this.templateFields(tx, tenantId, profile.templateId);
      const av = new Map(a.values.map((v) => [v.fieldKey, v.valueMm.toFixed(3)]));
      const bv = new Map(b.values.map((v) => [v.fieldKey, v.valueMm.toFixed(3)]));
      const rows = [...new Set([...av.keys(), ...bv.keys()])].map((key) => {
        const x = av.get(key); const y = bv.get(key);
        // Delta of the two displayed (2 dp) values, computed on integer hundredths so there is no float drift.
        const hundredths = (s: string) => Math.round(parseFloat(s) * 100);
        const delta = x !== undefined && y !== undefined
          ? ((hundredths(fromCanonicalMm(y, u)) - hundredths(fromCanonicalMm(x, u))) / 100).toFixed(2) : null;
        return { key, label: fields.get(key)?.label ?? key, from: x !== undefined ? fromCanonicalMm(x, u) : null, to: y !== undefined ? fromCanonicalMm(y, u) : null, delta, changed: x !== y && (x === undefined || y === undefined || Number(x) !== Number(y)) };
      });
      const as = new Map(a.styles.map((s) => [s.key, s.value])); const bs = new Map(b.styles.map((s) => [s.key, s.value]));
      const styleRows = [...new Set([...as.keys(), ...bs.keys()])].map((key) => ({ key, from: as.get(key) ?? null, to: bs.get(key) ?? null, changed: as.get(key) !== bs.get(key) }));
      return { unit: u, from: { revisionNo: a.revisionNo, effectiveDate: a.effectiveDate }, to: { revisionNo: b.revisionNo, effectiveDate: b.effectiveDate }, rows, styleRows };
    });
  }

  async restore(profileId: string, revisionNo: number, reason: string) {
    const tenantId = currentTenantId();
    return this.db.run(async (tx) => {
      const profile = await tx.measurementProfile.findFirst({ where: { id: profileId, tenantId } });
      if (!profile) throw notFound('Measurement profile');
      const target = await tx.measurementRevision.findFirst({ where: { tenantId, profileId, revisionNo }, include: { values: true, styles: true } });
      if (!target) throw notFound('Revision');
      const values: Record<string, string> = {};
      for (const v of target.values) values[v.fieldKey] = v.enteredUnit === target.enteredUnit ? v.enteredValue.toString() : fromCanonicalMm(v.valueMm.toFixed(3), target.enteredUnit as LengthUnit, 3);
      const styles: Record<string, string> = Object.fromEntries(target.styles.map((s) => [s.key, s.value]));
      // Remove style keys that the restored revision did not have.
      const cur = await this.latestRevision(tx, tenantId, profileId);
      for (const s of cur?.styles ?? []) if (!(s.key in styles)) styles[s.key] = '';
      return this.writeRevision(tx, tenantId, profileId, {
        unit: target.enteredUnit as LengthUnit, values, stylePreferences: styles, changeReason: `Restored revision ${revisionNo}: ${reason}`,
        postureNotes: target.postureNotes ?? undefined, fitNotes: target.fitNotes ?? undefined, isDraft: false, restoredFromRevisionNo: revisionNo, overrideWarningsReason: 'Restoration of earlier recorded values',
      }, { skipWarningCheck: true });
    });
  }

  /** Data for the printable measurement sheet. */
  async sheetData(profileId: string, unit?: LengthUnit) {
    const tenantId = currentTenantId();
    return this.db.run(async (tx) => {
      const detail = await this.profileDetail(tx, tenantId, profileId, unit);
      const customer = await tx.customer.findFirstOrThrow({ where: { id: detail.member.customerId, tenantId }, select: { customerNumber: true, fullName: true, mobile: true } });
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, include: { settings: true } });
      await this.audit.recordTx(tx, { action: 'measurement.sheet_exported', entityType: 'measurement_profile', entityId: profileId });
      return { detail, customer, tenant };
    });
  }
}
