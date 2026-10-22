'use client';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import * as React from 'react';
import { Button, Card, Input, PageHeader, Skeleton } from '@/components/ui';
import { api } from '@/lib/api';
import type { Paged } from '@/lib/types';
import { formatDateTime } from '@/lib/utils';

interface E { id: string; tenantId: string | null; action: string; entityType: string | null; actorId: string | null; impersonatorId: string | null; createdAt: string; metadata: unknown }

function Inner() {
  const tenantId = useSearchParams().get('tenantId') ?? '';
  const [action, setAction] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [open, setOpen] = React.useState<string | null>(null);
  const qs = new URLSearchParams({ page: String(page), pageSize: '30' });
  if (tenantId) qs.set('tenantId', tenantId);
  if (action) qs.set('action', action);
  const list = useQuery({ queryKey: ['p-audit', qs.toString()], queryFn: () => api<Paged<E>>(`/platform/audit-events?${qs}`), placeholderData: (p) => p });
  return (
    <>
      <PageHeader title="Audit review" description={tenantId ? `Filtered to one business (${tenantId.slice(0, 8)}…)` : 'Sensitive activity across the platform.'} />
      <div className="mb-4 max-w-sm"><Input aria-label="Filter by action" placeholder="Filter, e.g. platform. or auth.login" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} /></div>
      {list.isLoading ? <Skeleton className="h-64" /> : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm"><caption className="sr-only">Audit events</caption>
            <thead className="bg-muted text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-2">When</th><th className="px-4 py-2">Action</th><th className="px-4 py-2">Business</th><th className="px-4 py-2" /></tr></thead>
            <tbody className="divide-y divide-border">
              {list.data?.data.map((e) => (
                <React.Fragment key={e.id}>
                  <tr><td className="whitespace-nowrap px-4 py-3">{formatDateTime(e.createdAt)}</td><td className="px-4 py-3 font-medium">{e.action}{e.impersonatorId && <span className="ml-2 rounded bg-warning/15 px-1.5 text-xs text-warning">support session</span>}</td>
                    <td className="px-4 py-3 text-muted-foreground">{e.tenantId ? e.tenantId.slice(0, 8) : '—'}</td><td className="px-4 py-3 text-right"><Button size="sm" variant="ghost" aria-expanded={open === e.id} onClick={() => setOpen(open === e.id ? null : e.id)}>{open === e.id ? 'Hide' : 'Details'}</Button></td></tr>
                  {open === e.id && <tr><td colSpan={4} className="bg-muted/50 px-4 py-3"><pre className="overflow-x-auto whitespace-pre-wrap text-xs">{JSON.stringify({ actorId: e.actorId, entityType: e.entityType, tenantId: e.tenantId, metadata: e.metadata }, null, 2)}</pre></td></tr>}
                </React.Fragment>
              ))}
            </tbody>
          </table>
          {list.data && <div className="flex items-center justify-between border-t border-border p-3 text-sm"><span className="text-muted-foreground">{list.data.meta.total} events · page {list.data.meta.page} of {list.data.meta.pages}</span><div className="flex gap-2"><Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button><Button size="sm" variant="secondary" disabled={page >= list.data.meta.pages} onClick={() => setPage((p) => p + 1)}>Next</Button></div></div>}
        </Card>
      )}
    </>
  );
}
export default function AuditPage() { return <React.Suspense fallback={null}><Inner /></React.Suspense>; }
