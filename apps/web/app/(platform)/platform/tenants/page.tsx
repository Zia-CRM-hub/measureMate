'use client';
import { useQuery } from '@tanstack/react-query';
import { Building2, Search } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import * as React from 'react';
import { Badge, Button, Card, EmptyState, Input, PageHeader, Select, Skeleton } from '@/components/ui';
import { api } from '@/lib/api';
import { useDebounced } from '@/lib/hooks';
import type { Paged } from '@/lib/types';
import { titleCase } from '@/lib/utils';

interface Row {
  id: string; name: string; slug: string; status: string; createdAt: string; country?: string; plan: string | null; subscriptionStatus: string | null;
  branches: number; customers: number; orders: number; staff: number; owner: { email: string; fullName: string } | null;
}
const tone = (s: string) => (s === 'ACTIVE' ? 'success' : s === 'SUSPENDED' ? 'danger' : 'warning') as 'success' | 'danger' | 'warning';

function Inner() {
  const params = useSearchParams();
  const [q, setQ] = React.useState('');
  const [status, setStatus] = React.useState(params.get('status') ?? '');
  const [plan, setPlan] = React.useState('');
  const [page, setPage] = React.useState(1);
  const dq = useDebounced(q);
  const qs = new URLSearchParams({ page: String(page), pageSize: '20' });
  if (dq) qs.set('q', dq);
  if (status) qs.set('status', status);
  if (plan) qs.set('plan', plan);
  const list = useQuery({ queryKey: ['p-tenants', qs.toString()], queryFn: () => api<Paged<Row>>(`/platform/tenants?${qs}`), placeholderData: (p) => p });

  return (
    <>
      <PageHeader title="Businesses" description="Every tailor, boutique and shop group using MeasureMate." />
      <div className="relative mb-3"><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" aria-hidden />
        <Input className="pl-9" type="search" aria-label="Search businesses" placeholder="Search business name, slug or owner email…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:max-w-md">
        <Select aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">Any status</option><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option><option value="PENDING_DELETION">Pending deletion</option></Select>
        <Select aria-label="Plan" value={plan} onChange={(e) => { setPlan(e.target.value); setPage(1); }}><option value="">Any plan</option>{['STARTER', 'PROFESSIONAL', 'BUSINESS', 'ENTERPRISE'].map((p) => <option key={p} value={p}>{titleCase(p)}</option>)}</Select>
      </div>
      {list.isLoading ? <Skeleton className="h-64" /> : !list.data?.data.length ? <Card><EmptyState icon={<Building2 className="h-8 w-8" />} title="No businesses match" body="Try a different search or clear the filters." /></Card> : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <caption className="sr-only">Businesses</caption>
            <thead className="bg-muted text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-2">Business</th><th className="px-4 py-2">Owner</th><th className="px-4 py-2">Plan</th><th className="px-4 py-2">Status</th><th className="px-4 py-2 text-right">Branches</th><th className="px-4 py-2 text-right">Staff</th><th className="px-4 py-2 text-right">Customers</th><th className="px-4 py-2 text-right">Orders</th></tr></thead>
            <tbody className="divide-y divide-border">
              {list.data.data.map((t) => (
                <tr key={t.id} className="hover:bg-muted/50">
                  <td className="px-4 py-3"><Link href={`/platform/tenants/${t.id}`} className="font-medium text-primary hover:underline">{t.name}</Link><p className="text-xs text-muted-foreground">{t.slug}</p></td>
                  <td className="px-4 py-3">{t.owner?.email ?? '—'}</td>
                  <td className="px-4 py-3">{t.plan ? titleCase(t.plan) : '—'}<p className="text-xs text-muted-foreground">{t.subscriptionStatus && titleCase(t.subscriptionStatus)}</p></td>
                  <td className="px-4 py-3"><Badge tone={tone(t.status)}>{titleCase(t.status)}</Badge></td>
                  <td className="px-4 py-3 text-right">{t.branches}</td><td className="px-4 py-3 text-right">{t.staff}</td><td className="px-4 py-3 text-right">{t.customers}</td><td className="px-4 py-3 text-right">{t.orders}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between border-t border-border p-3 text-sm">
            <span className="text-muted-foreground">{list.data.meta.total} businesses · page {list.data.meta.page} of {list.data.meta.pages}</span>
            <div className="flex gap-2"><Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button><Button size="sm" variant="secondary" disabled={page >= list.data.meta.pages} onClick={() => setPage((p) => p + 1)}>Next</Button></div>
          </div>
        </Card>
      )}
    </>
  );
}
export default function TenantsPage() { return <React.Suspense fallback={null}><Inner /></React.Suspense>; }
