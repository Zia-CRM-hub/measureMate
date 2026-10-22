'use client';
import { useQuery } from '@tanstack/react-query';
import { ScrollText } from 'lucide-react';
import * as React from 'react';
import { Button, Card, EmptyState, Input, PageHeader, Skeleton } from '@/components/ui';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';

interface Event { id: string; action: string; entityType: string | null; entityId: string | null; actorId: string | null; createdAt: string; ip: string | null; metadata: unknown }
interface Page { data: Event[]; meta: { total: number; page: number; pages: number } }

export default function AuditPage() {
  const [page, setPage] = React.useState(1);
  const [action, setAction] = React.useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['audit', page, action],
    queryFn: () => api<Page>(`/audit-events?page=${page}&pageSize=25${action ? `&action=${encodeURIComponent(action)}` : ''}`),
  });
  const [openId, setOpenId] = React.useState<string | null>(null);

  return (
    <>
      <PageHeader title="Audit log" description="A permanent record of sensitive activity in your business." />
      <div className="mb-4 max-w-xs"><Input aria-label="Filter by action prefix" placeholder="Filter, e.g. branch. or auth." value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} /></div>
      {isLoading ? <Skeleton className="h-64" /> : !data?.data.length ? (
        <Card><EmptyState icon={<ScrollText className="h-8 w-8" />} title="No events match" /></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Audit events, newest first</caption>
              <thead className="bg-muted text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-2">When</th><th className="px-4 py-2">Action</th><th className="px-4 py-2">Record</th><th className="px-4 py-2"><span className="sr-only">Details</span></th></tr></thead>
              <tbody className="divide-y divide-border">
                {data.data.map((e) => (
                  <React.Fragment key={e.id}>
                    <tr>
                      <td className="whitespace-nowrap px-4 py-3">{formatDateTime(e.createdAt)}</td>
                      <td className="px-4 py-3 font-medium">{e.action}</td>
                      <td className="px-4 py-3 text-muted-foreground">{e.entityType ?? '—'}</td>
                      <td className="px-4 py-3 text-right"><Button size="sm" variant="ghost" aria-expanded={openId === e.id} onClick={() => setOpenId(openId === e.id ? null : e.id)}>{openId === e.id ? 'Hide' : 'Details'}</Button></td>
                    </tr>
                    {openId === e.id && <tr><td colSpan={4} className="bg-muted/50 px-4 py-3"><pre className="overflow-x-auto whitespace-pre-wrap text-xs">{JSON.stringify({ actorId: e.actorId, entityId: e.entityId, ip: e.ip, metadata: e.metadata }, null, 2)}</pre></td></tr>}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-border p-3 text-sm">
            <span className="text-muted-foreground">Page {data.meta.page} of {data.meta.pages} · {data.meta.total} events</span>
            <div className="flex gap-2"><Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button><Button size="sm" variant="secondary" disabled={page >= data.meta.pages} onClick={() => setPage((p) => p + 1)}>Next</Button></div>
          </div>
        </Card>
      )}
    </>
  );
}
