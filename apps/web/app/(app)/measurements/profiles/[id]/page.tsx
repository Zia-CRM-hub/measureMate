'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { describeConversion, fromCanonicalMm } from '@measuremate/validation';
import { FileDown, History, Plus, RotateCcw, X } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import * as React from 'react';
import { useToast } from '@/components/toast';
import { Alert, Badge, Button, Card, Dialog, Field, Input, Select, Skeleton } from '@/components/ui';
import { api, ApiError, errorText, post } from '@/lib/api';
import { can, useMe } from '@/lib/me';
import type { ProfileDetail } from '@/lib/types';
import { formatDateTime } from '@/lib/utils';

type Tab = 'record' | 'history';
interface Compare { unit: string; from: { revisionNo: number }; to: { revisionNo: number }; rows: { key: string; label: string; from: string | null; to: string | null; delta: string | null; changed: boolean }[]; styleRows: { key: string; from: string | null; to: string | null; changed: boolean }[] }
interface WarningItem { field: string; label: string; message: string }

export default function ProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { data: me } = useMe();
  const [unit, setUnit] = React.useState<'cm' | 'in' | null>(null);
  const [tab, setTab] = React.useState<Tab>('record');
  const p = useQuery({ queryKey: ['profile', id, unit], queryFn: () => api<ProfileDetail>(`/measurement-profiles/${id}${unit ? `?unit=${unit}` : ''}`) });

  if (p.isLoading) return <Skeleton className="h-96" />;
  if (p.isError || !p.data) return <Alert>{errorText(p.error)}</Alert>;
  const d = p.data;
  const u = unit ?? d.unit;
  const hasHistory = d.revisions.length > 0;
  const canWrite = hasHistory ? can(me, 'measurement.revise') : can(me, 'measurement.create');

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/customers/${d.member.customerId}`} className="text-sm text-muted-foreground hover:underline">← {d.member.fullName}</Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{d.name}</h1>
          <p className="text-sm text-muted-foreground">{d.member.fullName} · {d.currentRevisionNo ? `Revision ${d.currentRevisionNo}` : 'No saved revision yet'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Display unit" className="flex overflow-hidden rounded-md border border-input">
            {(['in', 'cm'] as const).map((x) => (
              <button key={x} aria-pressed={u === x} onClick={() => setUnit(x)} className={`min-h-11 px-4 text-sm font-medium ${u === x ? 'bg-primary text-primary-foreground' : 'bg-card'}`}>{x === 'in' ? 'Inches' : 'cm'}</button>
            ))}
          </div>
          {hasHistory && <a href={`/api/v1/measurement-profiles/${id}/sheet.pdf?unit=${u}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-md border border-input bg-card px-4 text-sm font-medium hover:bg-muted"><FileDown className="h-4 w-4" aria-hidden />Print sheet</a>}
        </div>
      </div>

      <div role="tablist" className="mb-5 flex gap-1 border-b border-border">
        <button role="tab" aria-selected={tab === 'record'} onClick={() => setTab('record')} className={`min-h-11 border-b-2 px-3 text-sm font-medium ${tab === 'record' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}>{hasHistory ? 'Update measurements' : 'Record measurements'}</button>
        <button role="tab" aria-selected={tab === 'history'} onClick={() => setTab('history')} className={`min-h-11 border-b-2 px-3 text-sm font-medium ${tab === 'history' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}>History ({d.revisions.length})</button>
      </div>

      {tab === 'record' ? (canWrite ? <RecordForm profile={d} unit={u} /> : <Alert tone="warning">Your role can view these measurements but not change them.</Alert>) : <HistoryTab profile={d} unit={u} canRestore={can(me, 'measurement.restore')} />}
    </>
  );
}

function RecordForm({ profile, unit }: { profile: ProfileDetail; unit: 'cm' | 'in' }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [styles, setStyles] = React.useState<{ k: string; v: string }[]>(() => Object.entries(profile.latest?.styles ?? {}).map(([k, v]) => ({ k, v })));
  const [reason, setReason] = React.useState('');
  const [posture, setPosture] = React.useState(profile.latest?.postureNotes ?? '');
  const [fit, setFit] = React.useState(profile.latest?.fitNotes ?? '');
  const [draft, setDraft] = React.useState(false);
  const [warnings, setWarnings] = React.useState<WarningItem[] | null>(null);
  const [override, setOverride] = React.useState('');
  const [error, setError] = React.useState('');

  const typed = Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim() !== ''));
  const styleMap = Object.fromEntries(styles.filter((s) => s.k.trim()).map((s) => [s.k.trim(), s.v.trim()]));
  const prevStyles = profile.latest?.styles ?? {};
  const removedStyles = Object.fromEntries(Object.keys(prevStyles).filter((k) => !(k in styleMap)).map((k) => [k, '']));

  const save = useMutation({
    mutationFn: (overrideReason?: string) => post(`/measurement-profiles/${profile.id}/revisions`, {
      unit, values: typed, stylePreferences: { ...removedStyles, ...styleMap }, changeReason: reason || undefined, postureNotes: posture || undefined,
      fitNotes: fit || undefined, isDraft: draft, overrideWarningsReason: overrideReason,
    }),
    onSuccess: () => {
      toast(draft ? 'Draft saved' : 'Measurements saved'); setValues({}); setWarnings(null); setOverride(''); setError(''); setReason('');
      void qc.invalidateQueries({ queryKey: ['profile', profile.id] }); void qc.invalidateQueries({ queryKey: ['profiles'] }); void qc.invalidateQueries({ queryKey: ['timeline'] });
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'MEASUREMENT_WARNINGS') setWarnings((e.details as { warnings: WarningItem[] }).warnings);
      else { setWarnings(null); setError(errorText(e)); }
    },
  });

  const fieldCount = profile.template?.sections.reduce((n, s) => n + s.fields.length, 0) ?? 0;
  return (
    <form onSubmit={(e) => { e.preventDefault(); setError(''); save.mutate(undefined); }} className="space-y-5">
      {error && <Alert>{error}</Alert>}
      <p className="text-sm text-muted-foreground">Enter values in <strong>{unit === 'in' ? 'inches' : 'centimetres'}</strong>. Leave a box empty to keep the previous value. Each save creates a new revision; earlier ones are never overwritten.</p>
      {profile.template?.sections.map((s) => (
        <Card key={s.id} className="p-5">
          <h2 className="mb-3 font-semibold">{s.name}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {s.fields.map((f) => {
              const prev = profile.latest?.values[f.key];
              const entered = values[f.key]?.trim();
              let conv = '';
              if (entered) { try { conv = describeConversion(entered, unit); } catch { conv = 'Enter a number'; } }
              return (
                <Field key={f.key} label={`${f.label}${f.required ? ' *' : ''}`} htmlFor={`f-${f.key}`} hint={entered ? conv : f.helpText ?? undefined}>
                  <div className="relative">
                    <Input id={`f-${f.key}`} inputMode="decimal" autoComplete="off" value={values[f.key] ?? ''} onChange={(e) => setValues((x) => ({ ...x, [f.key]: e.target.value }))}
                      placeholder={prev ? fromCanonicalMm(prev.canonicalMm, unit) : ''} aria-describedby={`h-${f.key}`} className="pr-10" />
                    <span className="pointer-events-none absolute right-3 top-3 text-xs text-muted-foreground" aria-hidden>{unit}</span>
                  </div>
                  {prev && <p id={`h-${f.key}`} className="text-xs text-muted-foreground">Current: {fromCanonicalMm(prev.canonicalMm, unit)} {unit}</p>}
                </Field>
              );
            })}
          </div>
        </Card>
      ))}
      {fieldCount === 0 && <Alert tone="warning">This template has no measurement fields.</Alert>}

      <Card className="space-y-3 p-5">
        <h2 className="font-semibold">Style preferences</h2>
        {styles.map((s, i) => (
          <div key={i} className="flex gap-2">
            <Input aria-label="Style option" placeholder="e.g. Collar" value={s.k} onChange={(e) => setStyles((x) => x.map((y, j) => j === i ? { ...y, k: e.target.value } : y))} />
            <Input aria-label="Choice" placeholder="e.g. Spread" value={s.v} onChange={(e) => setStyles((x) => x.map((y, j) => j === i ? { ...y, v: e.target.value } : y))} />
            <Button type="button" variant="ghost" aria-label="Remove style option" onClick={() => setStyles((x) => x.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>
          </div>
        ))}
        <Button type="button" variant="secondary" size="sm" onClick={() => setStyles((x) => [...x, { k: '', v: '' }])}><Plus className="h-4 w-4" aria-hidden />Add style option</Button>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Posture notes" htmlFor="posture"><textarea id="posture" rows={2} className="w-full rounded-md border border-input bg-card px-3 py-2 text-base sm:text-sm" value={posture} onChange={(e) => setPosture(e.target.value)} /></Field>
          <Field label="Fit notes" htmlFor="fit"><textarea id="fit" rows={2} className="w-full rounded-md border border-input bg-card px-3 py-2 text-base sm:text-sm" value={fit} onChange={(e) => setFit(e.target.value)} /></Field>
        </div>
        {profile.revisions.length > 0 && <Field label="Why are you changing these?" htmlFor="reason" hint="Optional, but helpful later."><Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Lost weight, customer asked for a looser fit" /></Field>}
      </Card>

      <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end">
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={draft} onChange={(e) => setDraft(e.target.checked)} />Save as draft</label>
        <Button type="submit" loading={save.isPending && !warnings} disabled={!Object.keys(typed).length && !Object.keys(styleMap).length && !Object.keys(removedStyles).length && posture === (profile.latest?.postureNotes ?? '') && fit === (profile.latest?.fitNotes ?? '')}>{draft ? 'Save draft' : 'Save measurements'}</Button>
      </div>

      <Dialog open={!!warnings} onClose={() => setWarnings(null)} title="Please double-check"
        footer={<><Button variant="secondary" onClick={() => setWarnings(null)}>Go back and fix</Button><Button disabled={override.trim().length < 3} loading={save.isPending} onClick={() => save.mutate(override.trim())}>Save anyway</Button></>}>
        <div className="space-y-3">
          <ul className="list-disc space-y-1 pl-5 text-sm">{warnings?.map((w) => <li key={w.field + w.message}>{w.message}</li>)}</ul>
          <p className="text-xs text-muted-foreground">These are simple range and completeness checks, not a judgement by AI. If the numbers are right, say why and save.</p>
          <Field label="Reason for saving anyway" htmlFor="override"><Input id="override" value={override} onChange={(e) => setOverride(e.target.value)} placeholder="e.g. Customer is very tall, measured twice" /></Field>
        </div>
      </Dialog>
    </form>
  );
}

function HistoryTab({ profile, unit, canRestore }: { profile: ProfileDetail; unit: 'cm' | 'in'; canRestore: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [sel, setSel] = React.useState<number[]>([]);
  const [restoreNo, setRestoreNo] = React.useState<number | null>(null);
  const [reason, setReason] = React.useState('');
  const [from, to] = sel.length === 2 ? [Math.min(...sel), Math.max(...sel)] : [0, 0];
  const cmp = useQuery({ queryKey: ['compare', profile.id, from, to, unit], enabled: sel.length === 2, queryFn: () => api<Compare>(`/measurement-profiles/${profile.id}/compare?from=${from}&to=${to}&unit=${unit}`) });
  const restore = useMutation({
    mutationFn: () => post(`/measurement-profiles/${profile.id}/restore`, { revisionNo: restoreNo, reason }),
    onSuccess: () => { toast('Restored as a new revision'); setRestoreNo(null); setReason(''); void qc.invalidateQueries({ queryKey: ['profile', profile.id] }); },
  });
  if (!profile.revisions.length) return <Card className="p-6 text-sm text-muted-foreground">No revisions yet.</Card>;
  const toggle = (n: number) => setSel((s) => s.includes(n) ? s.filter((x) => x !== n) : s.length >= 2 ? [s[1]!, n] : [...s, n]);

  return (
    <div className="space-y-5">
      <Card className="divide-y divide-border">
        {profile.revisions.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-3 p-4">
            <label className="flex items-center gap-2"><input type="checkbox" className="h-5 w-5" checked={sel.includes(r.revisionNo)} onChange={() => toggle(r.revisionNo)} aria-label={`Select revision ${r.revisionNo} to compare`} /></label>
            <div className="min-w-0 flex-1">
              <p className="font-medium">Revision {r.revisionNo} {r.isDraft && <Badge tone="warning">Draft</Badge>} {r.revisionNo === profile.currentRevisionNo && <Badge tone="success">Current</Badge>}</p>
              <p className="text-sm text-muted-foreground">{formatDateTime(r.createdAt)} · entered in {r.enteredUnit}{r.changeReason ? ` · ${r.changeReason}` : ''}</p>
              {r.warningOverrideReason && <p className="text-xs text-warning">Saved despite warnings: {r.warningOverrideReason}</p>}
            </div>
            {canRestore && !r.isDraft && r.revisionNo !== profile.currentRevisionNo && <Button size="sm" variant="secondary" onClick={() => setRestoreNo(r.revisionNo)}><RotateCcw className="h-4 w-4" aria-hidden />Restore</Button>}
          </div>
        ))}
      </Card>
      <p className="flex items-center gap-2 text-sm text-muted-foreground"><History className="h-4 w-4" aria-hidden />Tick two revisions to compare them side by side.</p>

      {cmp.data && (
        <Card className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="p-4 text-left font-semibold">Revision {cmp.data.from.revisionNo} vs revision {cmp.data.to.revisionNo} ({unit})</caption>
            <thead className="bg-muted text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-2">Measurement</th><th className="px-4 py-2">Before</th><th className="px-4 py-2">After</th><th className="px-4 py-2">Change</th></tr></thead>
            <tbody className="divide-y divide-border">
              {cmp.data.rows.map((r) => (
                <tr key={r.key} className={r.changed ? 'bg-warning/10' : ''}>
                  <td className="px-4 py-2 font-medium">{r.label}</td><td className="px-4 py-2">{r.from ?? '—'}</td><td className="px-4 py-2">{r.to ?? '—'}</td>
                  <td className="px-4 py-2">{r.changed ? <span className="font-medium">{r.delta ? (Number(r.delta) > 0 ? '+' : '') + r.delta : 'new'}</span> : <span className="text-muted-foreground">same</span>}</td>
                </tr>
              ))}
              {cmp.data.styleRows.filter((r) => r.changed).map((r) => <tr key={r.key} className="bg-warning/10"><td className="px-4 py-2 font-medium">Style: {r.key}</td><td className="px-4 py-2">{r.from ?? '—'}</td><td className="px-4 py-2">{r.to ?? '—'}</td><td className="px-4 py-2 font-medium">changed</td></tr>)}
            </tbody>
          </table>
        </Card>
      )}

      <Dialog open={restoreNo !== null} onClose={() => setRestoreNo(null)} title={`Restore revision ${restoreNo}?`}
        footer={<><Button variant="secondary" onClick={() => setRestoreNo(null)}>Cancel</Button><Button disabled={reason.trim().length < 3} loading={restore.isPending} onClick={() => restore.mutate()}>Restore as new revision</Button></>}>
        <div className="space-y-3">
          {restore.isError && <Alert>{errorText(restore.error)}</Alert>}
          <p className="text-sm text-muted-foreground">This adds a new revision with the old values. Nothing is overwritten or deleted.</p>
          <Field label="Reason" htmlFor="rreason"><Input id="rreason" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        </div>
      </Dialog>
    </div>
  );
}
