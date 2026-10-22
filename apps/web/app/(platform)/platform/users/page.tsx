'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { useToast } from '@/components/toast';
import { Badge, Button, Card, Input, PageHeader, Skeleton } from '@/components/ui';
import { api, errorText, post } from '@/lib/api';
import { useDebounced } from '@/lib/hooks';
import type { Paged } from '@/lib/types';

interface U { id: string; email: string; fullName: string; status: string; isPlatformAdmin: boolean; lockedUntil: string | null; businesses: number }

export default function UsersPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [q, setQ] = React.useState('');
  const [page, setPage] = React.useState(1);
  const dq = useDebounced(q);
  const list = useQuery({ queryKey: ['p-users', dq, page], queryFn: () => api<Paged<U>>(`/platform/users?page=${page}&pageSize=25${dq ? `&q=${encodeURIComponent(dq)}` : ''}`), placeholderData: (p) => p });
  const act = useMutation({
    mutationFn: (a: { id: string; kind: 'ACTIVE' | 'DEACTIVATED' | 'unlock' }) => a.kind === 'unlock' ? post(`/platform/users/${a.id}/unlock`) : post(`/platform/users/${a.id}/status`, { status: a.kind }),
    onSuccess: () => { toast('Updated'); void qc.invalidateQueries({ queryKey: ['p-users'] }); }, onError: (e) => toast(errorText(e), 'danger'),
  });
  return (
    <>
      <PageHeader title="Users" description="All accounts. Deactivating a user signs them out everywhere." />
      <div className="mb-4 max-w-md"><Input type="search" aria-label="Search users" placeholder="Search name or email…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
      {list.isLoading ? <Skeleton className="h-64" /> : (
        <Card className="divide-y divide-border">
          {list.data?.data.map((u) => {
            const locked = u.lockedUntil && new Date(u.lockedUntil) > new Date();
            return (
              <div key={u.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1"><p className="truncate font-medium">{u.fullName} {u.isPlatformAdmin && <Badge tone="warning">Platform admin</Badge>}</p><p className="truncate text-sm text-muted-foreground">{u.email} · {u.businesses} business{u.businesses === 1 ? '' : 'es'}</p></div>
                <Badge tone={u.status === 'ACTIVE' ? 'success' : 'danger'}>{u.status === 'ACTIVE' ? 'Active' : 'Deactivated'}</Badge>
                {locked && <Button size="sm" variant="secondary" onClick={() => act.mutate({ id: u.id, kind: 'unlock' })}>Unlock</Button>}
                {u.status === 'ACTIVE' ? <Button size="sm" variant="ghost" onClick={() => act.mutate({ id: u.id, kind: 'DEACTIVATED' })}>Deactivate</Button> : <Button size="sm" variant="secondary" onClick={() => act.mutate({ id: u.id, kind: 'ACTIVE' })}>Reactivate</Button>}
              </div>
            );
          })}
          {list.data && list.data.meta.pages > 1 && <div className="flex justify-between p-3 text-sm"><span className="text-muted-foreground">Page {list.data.meta.page} of {list.data.meta.pages}</span><div className="flex gap-2"><Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button><Button size="sm" variant="secondary" disabled={page >= list.data.meta.pages} onClick={() => setPage((p) => p + 1)}>Next</Button></div></div>}
        </Card>
      )}
    </>
  );
}
