'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Eye, Pause, Play, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import * as React from 'react';
import { useToast } from '@/components/toast';
import { Alert, Badge, Button, Card, Dialog, Field, Input, Select, Skeleton } from '@/components/ui';
import { api, del, errorText, post } from '@/lib/api';
import { formatDateTime, titleCase } from '@/lib/utils';

interface Detail {
  id: string; name: string; slug: string; status: string; createdAt: string; deletionRequestedAt: string | null;
  settings: { country: string; currency: string; timeZone: string; legalName: string | null } | null;
  subscription: { plan: string; status: string; provider: string; periodEnd: string } | null;
  entitlements: { plan: string; limits: Record<string, number>; features: Record<string, boolean> };
  overrides: { key: string; intValue: number | null; enabled: boolean | null; note: string | null }[];
  usage: { branches: number; staff: number; customers: number; orders: number };
  branches: { id: string; name: string; code: string; city: string | null; archivedAt: string | null }[];
  team: { userId: string; email: string; fullName: string; role: string; status: string; userStatus: string }[];
  recentAudit: { id: string; action: string; createdAt: string; impersonatorId: string | null }[];
}
type Action = 'suspend' | 'restore' | 'impersonate' | 'export' | 'purge' | null;
const LIMITS: Record<string, string> = { max_branches: 'Branches', max_employees: 'Team members', max_customers: 'Customers' };
const FEATURES: Record<string, string> = { inventory: 'Inventory', reports: 'Reports', portal: 'Customer portal', multi_branch: 'Multi-branch', pdf_branding: 'Branded PDFs' };

export default function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const toast = useToast();
  const router = useRouter();
  const [action, setAction] = React.useState<Action>(null);
  const [reason, setReason] = React.useState('');
  const [minutes, setMinutes] = React.useState(30);
  const [slug, setSlug] = React.useState('');
  const [ovKey, setOvKey] = React.useState('max_branches');
  const [ovVal, setOvVal] = React.useState('');
  const d = useQuery({ queryKey: ['p-tenant', id], queryFn: () => api<Detail>(`/platform/tenants/${id}`) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['p-tenant', id] });
  const close = () => { setAction(null); setReason(''); setSlug(''); };

  const setPlan = useMutation({ mutationFn: (planKey: string) => post(`/platform/tenants/${id}/plan`, { planKey }), onSuccess: () => { toast('Plan updated'); void refresh(); }, onError: (e) => toast(errorText(e), 'danger') });
  const setOverride = useMutation({
    mutationFn: () => api(`/platform/tenants/${id}/overrides`, { method: 'PUT', body: ovKey.startsWith('feature.') ? { key: ovKey, enabled: ovVal === 'on' } : { key: ovKey, intValue: Number(ovVal) } }),
    onSuccess: () => { toast('Exception saved'); setOvVal(''); void refresh(); }, onError: (e) => toast(errorText(e), 'danger'),
  });
  const rmOverride = useMutation({ mutationFn: (k: string) => del(`/platform/tenants/${id}/overrides/${k}`), onSuccess: () => { toast('Exception removed'); void refresh(); } });

  const run = useMutation({
    mutationFn: async () => {
      if (action === 'suspend' || action === 'restore') return post(`/platform/tenants/${id}/${action}`, { reason });
      if (action === 'impersonate') return post(`/platform/tenants/${id}/impersonate`, { reason, minutes });
      if (action === 'purge') return post(`/platform/tenants/${id}/purge`, { confirmSlug: slug, reason });
      const data = await post<unknown>(`/platform/tenants/${id}/export`, { reason });
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = `${d.data?.slug}-export.json`; a.click(); URL.revokeObjectURL(url);
      return data;
    },
    onSuccess: async () => {
      const act = action; close();
      if (act === 'impersonate') { await qc.invalidateQueries(); toast('Support session started (read-only)'); router.push('/dashboard'); return; }
      if (act === 'purge') { toast('Business permanently deleted'); router.push('/platform/tenants'); return; }
      toast(act === 'export' ? 'Export downloaded' : 'Done'); void refresh();
    },
  });

  if (d.isLoading) return <Skeleton className="h-96" />;
  if (d.isError || !d.data) return <Alert>{errorText(d.error)}</Alert>;
  const t = d.data;
  const tone = t.status === 'ACTIVE' ? 'success' : t.status === 'SUSPENDED' ? 'danger' : 'warning';
  const needsReason = action !== null;
  const titles: Record<Exclude<Action, null>, string> = { suspend: 'Suspend this business', restore: 'Restore this business', impersonate: 'Start a support session', export: 'Export business data', purge: 'Permanently delete this business' };

  return (
    <>
      <Link href="/platform/tenants" className="text-sm text-muted-foreground hover:underline">← Businesses</Link>
      <div className="mb-5 mt-1 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t.name} <Badge tone={tone}>{titleCase(t.status)}</Badge></h1>
          <p className="text-sm text-muted-foreground">{t.slug} · {t.settings?.country} · {t.settings?.currency} · created {formatDateTime(t.createdAt)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setAction('impersonate')}><Eye className="h-4 w-4" aria-hidden />Support session</Button>
          <Button variant="secondary" onClick={() => setAction('export')}><Download className="h-4 w-4" aria-hidden />Export data</Button>
          {t.status === 'ACTIVE' ? <Button variant="secondary" onClick={() => setAction('suspend')}><Pause className="h-4 w-4" aria-hidden />Suspend</Button>
            : <Button variant="secondary" onClick={() => setAction('restore')}><Play className="h-4 w-4" aria-hidden />{t.status === 'PENDING_DELETION' ? 'Cancel deletion & restore' : 'Restore'}</Button>}
        </div>
      </div>

      {t.status === 'PENDING_DELETION' && (
        <div className="mb-4"><Alert tone="warning">The owner asked to delete this business on {t.deletionRequestedAt && formatDateTime(t.deletionRequestedAt)}. After the grace period you can permanently delete it. <button className="ml-2 font-medium underline" onClick={() => setAction('purge')}>Delete permanently…</button></Alert></div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-1">
          <h2 className="font-semibold">Usage</h2>
          <dl className="mt-2 divide-y divide-border text-sm">
            {([['Branches', t.usage.branches, 'max_branches'], ['Team members', t.usage.staff, 'max_employees'], ['Customers', t.usage.customers, 'max_customers']] as [string, number, string][]).map(([k, v, lk]) => {
              const lim = t.entitlements.limits[lk];
              return <div key={k} className="flex justify-between py-2"><dt>{k}</dt><dd className="font-medium">{v}{lim !== undefined && <span className="font-normal text-muted-foreground"> / {lim < 0 ? '∞' : lim}</span>}</dd></div>;
            })}
            <div className="flex justify-between py-2"><dt>Orders</dt><dd className="font-medium">{t.usage.orders}</dd></div>
          </dl>
        </Card>

        <Card className="p-5 lg:col-span-2">
          <h2 className="font-semibold">Plan</h2>
          <div className="mt-2 flex flex-wrap items-end gap-3">
            <div className="text-sm"><p>Current: <strong>{titleCase(t.subscription?.plan ?? 'none')}</strong> · {titleCase(t.subscription?.status ?? '')}</p>
              {t.subscription && <p className="text-xs text-muted-foreground">Period ends {formatDateTime(t.subscription.periodEnd)} · provider {t.subscription.provider}</p>}</div>
            <div className="ml-auto flex flex-wrap gap-2">
              {['STARTER', 'PROFESSIONAL', 'BUSINESS', 'ENTERPRISE'].map((p) => <Button key={p} size="sm" variant={p === t.subscription?.plan ? 'primary' : 'secondary'} disabled={p === t.subscription?.plan} loading={setPlan.isPending && setPlan.variables === p} onClick={() => setPlan.mutate(p)}>{titleCase(p)}</Button>)}
            </div>
          </div>
        </Card>

        <Card className="p-5 lg:col-span-3">
          <h2 className="font-semibold">Entitlements and exceptions</h2>
          <p className="text-sm text-muted-foreground">What this business can use now (plan plus any exceptions you grant).</p>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <ul className="space-y-1 text-sm">
              {Object.entries(t.entitlements.limits).map(([k, v]) => <li key={k} className="flex justify-between"><span>{LIMITS[k] ?? k}</span><span className="font-medium">{v < 0 ? 'Unlimited' : v}</span></li>)}
              {Object.entries(t.entitlements.features).map(([k, v]) => <li key={k} className="flex justify-between"><span>{FEATURES[k] ?? k}</span><Badge tone={v ? 'success' : 'neutral'}>{v ? 'On' : 'Off'}</Badge></li>)}
            </ul>
            <div>
              {t.overrides.length > 0 && <ul className="mb-3 space-y-1 text-sm">{t.overrides.map((o) => (
                <li key={o.key} className="flex items-center justify-between gap-2 rounded-md bg-warning/10 px-3 py-2"><span>{o.key.startsWith('feature.') ? FEATURES[o.key.slice(8)] : LIMITS[o.key]}: <strong>{o.enabled !== null ? (o.enabled ? 'on' : 'off') : o.intValue}</strong>{o.note && <span className="text-muted-foreground"> · {o.note}</span>}</span><Button size="sm" variant="ghost" onClick={() => rmOverride.mutate(o.key)}>Remove</Button></li>
              ))}</ul>}
              <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); setOverride.mutate(); }}>
                <Field label="Add exception" htmlFor="ovk"><Select id="ovk" value={ovKey} onChange={(e) => { setOvKey(e.target.value); setOvVal(''); }}>
                  {Object.entries(LIMITS).map(([k, l]) => <option key={k} value={k}>{l} limit</option>)}{Object.entries(FEATURES).map(([k, l]) => <option key={k} value={`feature.${k}`}>{l}</option>)}
                </Select></Field>
                {ovKey.startsWith('feature.')
                  ? <Field label="Value" htmlFor="ovv"><Select id="ovv" value={ovVal} onChange={(e) => setOvVal(e.target.value)}><option value="">Choose…</option><option value="on">On</option><option value="off">Off</option></Select></Field>
                  : <Field label="Limit (-1 = unlimited)" htmlFor="ovv"><Input id="ovv" inputMode="numeric" value={ovVal} onChange={(e) => setOvVal(e.target.value)} /></Field>}
                <Button type="submit" variant="secondary" disabled={!ovVal} loading={setOverride.isPending}>Save</Button>
              </form>
            </div>
          </div>
        </Card>

        <Card className="p-5 lg:col-span-2">
          <h2 className="font-semibold">Branches ({t.branches.length})</h2>
          <ul className="mt-2 divide-y divide-border text-sm">
            {t.branches.map((b) => <li key={b.id} className="flex justify-between py-2"><span>{b.name} <span className="text-xs text-muted-foreground">{b.code}{b.city ? ` · ${b.city}` : ''}</span></span>{b.archivedAt && <Badge>Archived</Badge>}</li>)}
          </ul>
          <h2 className="mt-5 font-semibold">Team ({t.team.length})</h2>
          <ul className="mt-2 divide-y divide-border text-sm">
            {t.team.map((m) => <li key={m.userId} className="flex flex-wrap items-center justify-between gap-2 py-2"><span>{m.fullName} <span className="text-xs text-muted-foreground">{m.email}</span></span><span className="flex gap-1"><Badge>{titleCase(m.role)}</Badge><Badge tone={m.status === 'ACTIVE' ? 'success' : 'warning'}>{titleCase(m.status)}</Badge></span></li>)}
          </ul>
        </Card>

        <Card className="p-5">
          <h2 className="font-semibold">Recent activity</h2>
          <ul className="mt-2 space-y-2 text-sm">{t.recentAudit.map((e) => <li key={e.id}><p className="font-medium">{e.action}{e.impersonatorId && <Badge tone="warning">support</Badge>}</p><p className="text-xs text-muted-foreground">{formatDateTime(e.createdAt)}</p></li>)}
            {!t.recentAudit.length && <li className="text-muted-foreground">Nothing yet</li>}</ul>
          <Link href={`/platform/audit?tenantId=${t.id}`} className="mt-3 inline-block text-sm text-primary underline">Full audit trail</Link>
        </Card>
      </div>

      {t.status === 'PENDING_DELETION' && <p className="mt-6 text-xs text-muted-foreground"><Trash2 className="mr-1 inline h-3 w-3" aria-hidden />Permanent deletion removes all of this business’s records and cannot be undone.</p>}

      <Dialog open={needsReason} onClose={close} title={action ? titles[action] : ''}
        footer={<><Button variant="secondary" onClick={close}>Cancel</Button>
          <Button variant={action === 'purge' ? 'danger' : 'primary'} loading={run.isPending} disabled={reason.trim().length < 5 || (action === 'purge' && slug !== t.slug)} onClick={() => run.mutate()}>
            {action === 'impersonate' ? 'Start session' : action === 'purge' ? 'Delete permanently' : action === 'export' ? 'Download export' : 'Confirm'}</Button></>}>
        <div className="space-y-4">
          {run.isError && <Alert>{errorText(run.error)}</Alert>}
          {action === 'impersonate' && <Alert tone="warning">You will see this business’s data in read-only mode. The owner can see this in their audit log, including your reason.</Alert>}
          {action === 'export' && <Alert tone="warning">This downloads all of the business’s records. The owner will see this in their audit log.</Alert>}
          <Field label="Reason (recorded in the audit log)" htmlFor="reason"><Input id="reason" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Support ticket #123: customer cannot find measurements" /></Field>
          {action === 'impersonate' && <Field label="Session length" htmlFor="mins"><Select id="mins" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>{[15, 30, 45, 60].map((m) => <option key={m} value={m}>{m} minutes</option>)}</Select></Field>}
          {action === 'purge' && <Field label={`Type the business slug (${t.slug}) to confirm`} htmlFor="slug"><Input id="slug" value={slug} onChange={(e) => setSlug(e.target.value)} autoComplete="off" /></Field>}
        </div>
      </Dialog>
    </>
  );
}
