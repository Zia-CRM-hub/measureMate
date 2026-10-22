'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, GitMerge, Plus, Ruler, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { useToast } from '@/components/toast';
import { Alert, Badge, Button, Card, Dialog, EmptyState, Field, Input, Select, Skeleton } from '@/components/ui';
import { api, ApiError, errorText, post, patch, del } from '@/lib/api';
import { useDebounced } from '@/lib/hooks';
import { can, useMe } from '@/lib/me';
import type { CustomerDetail, CustomerRow, Member, Paged, ProfileSummary, Template, TimelineEvent } from '@/lib/types';
import { formatDateTime, titleCase } from '@/lib/utils';

const RELATIONSHIPS = ['SPOUSE', 'CHILD', 'PARENT', 'SIBLING', 'RELATIVE', 'FRIEND', 'OTHER'];
type Tab = 'people' | 'details' | 'timeline';

export default function CustomerPage() {
  const { id } = useParams<{ id: string }>();
  const { data: me } = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = React.useState<Tab>('people');
  const [editOpen, setEditOpen] = React.useState(false);
  const [mergeOpen, setMergeOpen] = React.useState(false);
  const c = useQuery({ queryKey: ['customer', id], queryFn: () => api<CustomerDetail>(`/customers/${id}`) });
  const archive = useMutation({
    mutationFn: (restore: boolean) => post(`/customers/${id}/${restore ? 'restore' : 'archive'}`),
    onSuccess: () => { toast('Updated'); void qc.invalidateQueries({ queryKey: ['customer', id] }); void qc.invalidateQueries({ queryKey: ['customers'] }); },
    onError: (e) => toast(errorText(e), 'danger'),
  });

  if (c.isLoading) return <Skeleton className="h-64" />;
  if (c.isError || !c.data) return <Alert>{errorText(c.error)}</Alert>;
  const d = c.data;
  const archived = d.status !== 'ACTIVE';

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/customers" className="text-sm text-muted-foreground hover:underline">← Customers</Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{d.fullName} {archived && <Badge tone="warning">{titleCase(d.status)}</Badge>}</h1>
          <p className="text-sm text-muted-foreground">{d.customerNumber}{d.mobile && <> · <a className="underline" href={`tel:${d.mobile}`}>{d.mobile}</a></>}{d.email && <> · {d.email}</>}</p>
          <div className="mt-2 flex flex-wrap gap-1">{d.tags.map((t) => <Badge key={t}>{t}</Badge>)}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {can(me, 'customer.update') && !archived && <Button variant="secondary" onClick={() => setEditOpen(true)}>Edit</Button>}
          {can(me, 'customer.merge') && !archived && <Button variant="ghost" onClick={() => setMergeOpen(true)}><GitMerge className="h-4 w-4" aria-hidden />Merge</Button>}
          {can(me, 'customer.archive') && <Button variant="ghost" loading={archive.isPending} onClick={() => archive.mutate(archived)}><Archive className="h-4 w-4" aria-hidden />{archived ? 'Restore' : 'Archive'}</Button>}
        </div>
      </div>

      <div role="tablist" aria-label="Customer sections" className="mb-5 flex gap-1 border-b border-border">
        {([['people', 'People & measurements'], ['details', 'Details'], ['timeline', 'Timeline']] as [Tab, string][]).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`min-h-11 border-b-2 px-3 text-sm font-medium ${tab === k ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}>{label}</button>
        ))}
      </div>

      {tab === 'people' && <People customer={d} canEdit={can(me, 'customer.update') && !archived} canMeasure={can(me, 'measurement.create') && !archived} />}
      {tab === 'details' && <Details customer={d} canEdit={can(me, 'customer.update')} />}
      {tab === 'timeline' && <Timeline id={id} />}
      {editOpen && <EditDialog customer={d} onClose={() => setEditOpen(false)} />}
      {mergeOpen && <MergeDialog customer={d} onClose={() => setMergeOpen(false)} />}
    </>
  );
}

function People({ customer, canEdit, canMeasure }: { customer: CustomerDetail; canEdit: boolean; canMeasure: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [addOpen, setAddOpen] = React.useState(false);
  const { register, handleSubmit, reset } = useForm<{ fullName: string; relationship: string }>({ defaultValues: { relationship: 'CHILD' } });
  const add = useMutation({
    mutationFn: (v: { fullName: string; relationship: string }) => post(`/customers/${customer.id}/members`, v),
    onSuccess: () => { toast('Family member added'); setAddOpen(false); reset(); void qc.invalidateQueries({ queryKey: ['customer', customer.id] }); },
  });
  const remove = useMutation({
    mutationFn: (id: string) => del(`/members/${id}`),
    onSuccess: () => { toast('Removed'); void qc.invalidateQueries({ queryKey: ['customer', customer.id] }); },
    onError: (e) => toast(errorText(e), 'danger'),
  });
  return (
    <div className="space-y-4">
      {customer.members.map((m) => <MemberCard key={m.id} member={m} canMeasure={canMeasure} canEdit={canEdit} onRemove={() => remove.mutate(m.id)} />)}
      {canEdit && <Button variant="secondary" onClick={() => setAddOpen(true)}><UserPlus className="h-4 w-4" aria-hidden />Add family member</Button>}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} title="Add a family member"
        footer={<><Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button><Button form="member-form" type="submit" loading={add.isPending}>Add</Button></>}>
        <form id="member-form" onSubmit={handleSubmit((v) => add.mutate(v))} className="space-y-4">
          {add.isError && <Alert>{errorText(add.error)}</Alert>}
          <Field label="Full name" htmlFor="mname"><Input id="mname" required {...register('fullName', { required: true })} /></Field>
          <Field label="Relationship" htmlFor="mrel"><Select id="mrel" {...register('relationship')}>{RELATIONSHIPS.map((r) => <option key={r} value={r}>{titleCase(r)}</option>)}</Select></Field>
        </form>
      </Dialog>
    </div>
  );
}

function MemberCard({ member, canMeasure, canEdit, onRemove }: { member: Member; canMeasure: boolean; canEdit: boolean; onRemove: () => void }) {
  const [open, setOpen] = React.useState(false);
  const profiles = useQuery({ queryKey: ['profiles', member.id], queryFn: () => api<ProfileSummary[]>(`/members/${member.id}/measurement-profiles`) });
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><p className="font-medium">{member.fullName}</p><p className="text-xs text-muted-foreground">{member.relationship === 'SELF' ? 'Customer' : titleCase(member.relationship)}</p></div>
        <div className="flex gap-2">
          {canMeasure && <Button size="sm" variant="secondary" onClick={() => setOpen(true)}><Plus className="h-4 w-4" aria-hidden />Measurement profile</Button>}
          {canEdit && member.relationship !== 'SELF' && <Button size="sm" variant="ghost" onClick={onRemove}>Remove</Button>}
        </div>
      </div>
      <div className="mt-3">
        {profiles.isLoading ? <Skeleton className="h-8" /> : !profiles.data?.length ? <p className="text-sm text-muted-foreground">No measurements recorded yet.</p> : (
          <ul className="divide-y divide-border">
            {profiles.data.map((p) => (
              <li key={p.id}><Link href={`/measurements/profiles/${p.id}`} className="flex min-h-11 items-center justify-between text-sm hover:text-primary"><span className="flex items-center gap-2"><Ruler className="h-4 w-4" aria-hidden />{p.name}</span><span className="text-xs text-muted-foreground">{p.currentRevisionNo ? `Revision ${p.currentRevisionNo}` : 'Draft only'}</span></Link></li>
            ))}
          </ul>
        )}
      </div>
      {open && <NewProfileDialog memberId={member.id} existing={profiles.data ?? []} onClose={() => setOpen(false)} />}
    </Card>
  );
}

function NewProfileDialog({ memberId, existing, onClose }: { memberId: string; existing: ProfileSummary[]; onClose: () => void }) {
  const qc = useQueryClient();
  const router = React.useMemo(() => ({ push: (u: string) => { window.location.assign(u); } }), []);
  const templates = useQuery({ queryKey: ['templates'], queryFn: () => api<Template[]>('/measurement-templates') });
  const [templateId, setTemplateId] = React.useState('');
  const [copyFrom, setCopyFrom] = React.useState('');
  const create = useMutation({
    mutationFn: () => post<{ id: string }>(`/members/${memberId}/measurement-profiles`, { templateId, copyFromProfileId: copyFrom || undefined }),
    onSuccess: (p) => { void qc.invalidateQueries({ queryKey: ['profiles', memberId] }); router.push(`/measurements/profiles/${p.id}`); },
  });
  return (
    <Dialog open onClose={onClose} title="New measurement profile"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!templateId} loading={create.isPending} onClick={() => create.mutate()}>Create & record</Button></>}>
      <div className="space-y-4">
        {create.isError && <Alert>{errorText(create.error)}</Alert>}
        <Field label="Garment type" htmlFor="tpl">
          <Select id="tpl" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">Choose…</option>{templates.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>
        {existing.length > 0 && (
          <Field label="Copy previous measurements from (optional)" htmlFor="copy" hint="Saves typing; you can adjust afterwards.">
            <Select id="copy" value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}><option value="">Start blank</option>{existing.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
          </Field>
        )}
      </div>
    </Dialog>
  );
}

function Details({ customer, canEdit }: { customer: CustomerDetail; canEdit: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const consent = useMutation({
    mutationFn: (a: { channel: string; granted: boolean }) => api(`/customers/${customer.id}/consents`, { method: 'PUT', body: { channel: a.channel, purpose: 'MARKETING', granted: a.granted } }),
    onSuccess: () => { toast('Preference saved'); void qc.invalidateQueries({ queryKey: ['customer', customer.id] }); },
    onError: (e) => toast(errorText(e), 'danger'),
  });
  const rows: [string, string | null][] = [
    ['Mobile', customer.mobile], ['Alternate mobile', customer.alternateMobile], ['Email', customer.email],
    ['Address', [customer.addressLine1, customer.addressLine2, customer.landmark].filter(Boolean).join(', ') || null],
    ['City', customer.city], ['State', customer.state], ['Postal code', customer.postalCode], ['Source', customer.acquisitionSource], ['Notes', customer.notes],
  ];
  const granted = (ch: string) => customer.consents.find((x) => x.channel === ch && x.purpose === 'MARKETING')?.granted ?? false;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-5"><dl className="divide-y divide-border">{rows.map(([k, v]) => <div key={k} className="flex justify-between gap-4 py-2 text-sm"><dt className="text-muted-foreground">{k}</dt><dd className="text-right">{v || '—'}</dd></div>)}</dl></Card>
      <Card className="p-5">
        <h2 className="font-semibold">Offers and greetings</h2>
        <p className="mb-2 text-sm text-muted-foreground">Only message this customer with offers where they have agreed. Order updates are always allowed.</p>
        {['EMAIL', 'SMS', 'WHATSAPP'].map((ch) => (
          <label key={ch} className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="h-5 w-5" disabled={!canEdit} checked={granted(ch)} onChange={(e) => consent.mutate({ channel: ch, granted: e.target.checked })} />{titleCase(ch)}</label>
        ))}
      </Card>
    </div>
  );
}

function Timeline({ id }: { id: string }) {
  const t = useQuery({ queryKey: ['timeline', id], queryFn: () => api<TimelineEvent[]>(`/customers/${id}/timeline`) });
  if (t.isLoading) return <Skeleton className="h-40" />;
  if (!t.data?.length) return <Card><EmptyState title="Nothing here yet" /></Card>;
  return (
    <ol className="space-y-3 border-l-2 border-border pl-4">
      {t.data.map((e, i) => (
        <li key={i} className="relative"><span className="absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full bg-primary" aria-hidden />
          <p className="text-sm font-medium">{e.title}{e.amount && <span className="ml-2 text-muted-foreground">{e.amount}</span>}</p>
          <p className="text-xs text-muted-foreground">{formatDateTime(e.at)} · {titleCase(e.type)}</p></li>
      ))}
    </ol>
  );
}

function EditDialog({ customer, onClose }: { customer: CustomerDetail; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { register, handleSubmit } = useForm({ defaultValues: {
    fullName: customer.fullName, mobile: customer.mobile ?? '', alternateMobile: customer.alternateMobile ?? '', email: customer.email ?? '', city: customer.city ?? '',
    postalCode: customer.postalCode ?? '', addressLine1: customer.addressLine1 ?? '', tags: customer.tags.join(', '), notes: customer.notes ?? '',
  } });
  const save = useMutation({
    mutationFn: (v: Record<string, string>) => patch(`/customers/${customer.id}`, {
      version: customer.version, fullName: v.fullName, mobile: v.mobile || undefined, alternateMobile: v.alternateMobile || undefined, email: v.email || undefined,
      city: v.city || undefined, postalCode: v.postalCode || undefined, addressLine1: v.addressLine1 || undefined, notes: v.notes || undefined,
      tags: v.tags.split(',').map((t) => t.trim()).filter(Boolean),
    }),
    onSuccess: () => { toast('Customer updated'); void qc.invalidateQueries({ queryKey: ['customer', customer.id] }); void qc.invalidateQueries({ queryKey: ['customers'] }); onClose(); },
  });
  return (
    <Dialog open onClose={onClose} title="Edit customer" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button form="edit-form" type="submit" loading={save.isPending}>Save</Button></>}>
      <form id="edit-form" onSubmit={handleSubmit((v) => save.mutate(v as Record<string, string>))} className="space-y-4">
        {save.isError && <Alert>{save.error instanceof ApiError && save.error.code === 'STALE_VERSION' ? 'Someone else changed this customer. Close this window and reopen to see the latest.' : errorText(save.error)}</Alert>}
        <Field label="Full name" htmlFor="e-name"><Input id="e-name" {...register('fullName')} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Mobile" htmlFor="e-mob"><Input id="e-mob" type="tel" {...register('mobile')} /></Field>
          <Field label="Alternate mobile" htmlFor="e-alt"><Input id="e-alt" type="tel" {...register('alternateMobile')} /></Field>
          <Field label="Email" htmlFor="e-email"><Input id="e-email" type="email" {...register('email')} /></Field>
          <Field label="City" htmlFor="e-city"><Input id="e-city" {...register('city')} /></Field>
          <Field label="Postal code" htmlFor="e-pc"><Input id="e-pc" {...register('postalCode')} /></Field>
          <Field label="Address" htmlFor="e-addr"><Input id="e-addr" {...register('addressLine1')} /></Field>
        </div>
        <Field label="Tags (comma separated)" htmlFor="e-tags"><Input id="e-tags" {...register('tags')} /></Field>
        <Field label="Notes" htmlFor="e-notes"><textarea id="e-notes" rows={3} className="w-full rounded-md border border-input bg-card px-3 py-2 text-base sm:text-sm" {...register('notes')} /></Field>
      </form>
    </Dialog>
  );
}

function MergeDialog({ customer, onClose }: { customer: CustomerDetail; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [q, setQ] = React.useState('');
  const dq = useDebounced(q);
  const [picked, setPicked] = React.useState<CustomerRow | null>(null);
  const res = useQuery({ queryKey: ['merge-search', dq], enabled: dq.length > 1, queryFn: () => api<Paged<CustomerRow>>(`/customers?q=${encodeURIComponent(dq)}&pageSize=6`) });
  const merge = useMutation({
    mutationFn: () => post(`/customers/${customer.id}/merge`, { sourceId: picked!.id }),
    onSuccess: () => { toast('Customers merged'); void qc.invalidateQueries(); onClose(); },
  });
  return (
    <Dialog open onClose={onClose} title="Merge a duplicate into this customer"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="danger" disabled={!picked} loading={merge.isPending} onClick={() => merge.mutate()}>Merge into {customer.fullName}</Button></>}>
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">The duplicate’s people, measurements, orders and notes move to <strong>{customer.fullName}</strong>. The duplicate is then archived. Payment and invoice records stay as issued.</p>
        {merge.isError && <Alert>{errorText(merge.error)}</Alert>}
        <Input aria-label="Find the duplicate" placeholder="Search for the duplicate customer…" value={q} onChange={(e) => { setQ(e.target.value); setPicked(null); }} />
        <ul className="space-y-1">
          {res.data?.data.filter((r) => r.id !== customer.id).map((r) => (
            <li key={r.id}><button onClick={() => setPicked(r)} className={`flex min-h-11 w-full items-center justify-between rounded-md border px-3 text-left text-sm ${picked?.id === r.id ? 'border-primary bg-primary/10' : 'border-border'}`}><span>{r.fullName} <span className="text-muted-foreground">{r.customerNumber}</span></span><span className="text-xs text-muted-foreground">{r.mobile}</span></button></li>
          ))}
        </ul>
      </div>
    </Dialog>
  );
}
