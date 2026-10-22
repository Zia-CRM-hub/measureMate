'use client';
import { useQuery } from '@tanstack/react-query';
import { Download, Plus, Search, Users } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { Badge, Button, Card, EmptyState, Input, PageHeader, Skeleton } from '@/components/ui';
import { api } from '@/lib/api';
import { useDebounced } from '@/lib/hooks';
import { can, useMe } from '@/lib/me';
import type { CustomerRow, Paged } from '@/lib/types';
import { titleCase } from '@/lib/utils';

export default function CustomersPage() {
  const { data: me } = useMe();
  const [q, setQ] = React.useState('');
  const [city, setCity] = React.useState('');
  const [tag, setTag] = React.useState('');
  const [status, setStatus] = React.useState('ACTIVE');
  const [sort, setSort] = React.useState('');
  const [page, setPage] = React.useState(1);
  const dq = useDebounced(q);
  const dcity = useDebounced(city);
  const dtag = useDebounced(tag);

  const params = new URLSearchParams({ page: String(page), pageSize: '20', status });
  if (dq) params.set('q', dq);
  if (dcity) params.set('city', dcity);
  if (dtag) params.set('tag', dtag);
  if (sort) { params.set('sort', sort); params.set('dir', sort === 'name' ? 'asc' : 'desc'); }
  const list = useQuery({ queryKey: ['customers', params.toString()], queryFn: () => api<Paged<CustomerRow>>(`/customers?${params}`), placeholderData: (p) => p });
  const recent = useQuery({ queryKey: ['customers-recent'], queryFn: () => api<{ id: string; fullName: string; customerNumber: string; mobile: string | null }[]>('/customers/recent') });
  const filtered = !!(dq || dcity || dtag);

  return (
    <>
      <PageHeader title="Customers" description="Find a customer or family member by name, mobile, email or number."
        actions={<>
          {can(me, 'customer.export') && <a href="/api/v1/customers/export" className="inline-flex min-h-11 items-center gap-2 rounded-md border border-input bg-card px-4 text-sm font-medium hover:bg-muted"><Download className="h-4 w-4" aria-hidden />Export</a>}
          {can(me, 'customer.create') && <Link href="/customers/new" className="inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"><Plus className="h-4 w-4" aria-hidden />New customer</Link>}
        </>} />

      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" aria-hidden />
        <Input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} className="pl-9" type="search" inputMode="search"
          aria-label="Search customers" placeholder="Search name, mobile, email, C-00012, family member…" />
      </div>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Input aria-label="Filter by city" placeholder="City" value={city} onChange={(e) => { setCity(e.target.value); setPage(1); }} />
        <Input aria-label="Filter by tag" placeholder="Tag, e.g. VIP" value={tag} onChange={(e) => { setTag(e.target.value); setPage(1); }} />
        <select aria-label="Status" className="min-h-11 rounded-md border border-input bg-card px-3 text-sm" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="ACTIVE">Active</option><option value="ARCHIVED">Archived</option>
        </select>
        <select aria-label="Sort by" className="min-h-11 rounded-md border border-input bg-card px-3 text-sm" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="">Best match / newest</option><option value="name">Name A–Z</option><option value="lastVisit">Last visit</option><option value="createdAt">Recently added</option>
        </select>
      </div>

      {!filtered && recent.data && recent.data.length > 0 && (
        <section aria-label="Recent customers" className="mb-5">
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Recent</h2>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {recent.data.map((r) => (
              <Link key={r.id} href={`/customers/${r.id}`} className="min-w-40 shrink-0 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-muted">
                <p className="truncate font-medium">{r.fullName}</p><p className="text-xs text-muted-foreground">{r.customerNumber}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {list.isLoading ? <div className="space-y-2"><Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
        : !list.data?.data.length ? (
          <Card><EmptyState icon={<Users className="h-8 w-8" />} title={filtered ? 'No customers match' : 'No customers yet'}
            body={filtered ? 'Try fewer words, a different spelling or a shorter part of the mobile number.' : 'Add your first customer to start recording measurements and orders.'}
            action={!filtered && can(me, 'customer.create') ? <Link href="/customers/new" className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">Add a customer</Link> : undefined} /></Card>
        ) : (
          <ul className="space-y-2">
            {list.data.data.map((c) => (
              <li key={c.id}>
                <Link href={`/customers/${c.id}`} className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-4 hover:bg-muted/50">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary" aria-hidden>{c.fullName.slice(0, 1).toUpperCase()}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{c.fullName} <span className="text-xs font-normal text-muted-foreground">{c.customerNumber}</span></span>
                    <span className="block truncate text-sm text-muted-foreground">{[c.mobile, c.email, c.city].filter(Boolean).join(' · ') || 'No contact details'}</span>
                    {c.matchedMembers.length > 0 && <span className="block text-xs text-primary">Matched family: {c.matchedMembers.map((m) => `${m.fullName} (${titleCase(m.relationship)})`).join(', ')}</span>}
                  </span>
                  <span className="flex flex-wrap gap-1">{c.members.length > 1 && <Badge>{c.members.length} people</Badge>}{c.tags.slice(0, 2).map((t) => <Badge key={t}>{t}</Badge>)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}

      {list.data && list.data.meta.pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Page {list.data.meta.page} of {list.data.meta.pages} · {list.data.meta.total} customers</span>
          <div className="flex gap-2"><Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button><Button size="sm" variant="secondary" disabled={page >= list.data.meta.pages} onClick={() => setPage((p) => p + 1)}>Next</Button></div>
        </div>
      )}
    </>
  );
}
