'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { useToast } from '@/components/toast';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, PageHeader } from '@/components/ui';
import { api, del, errorText, patch, post } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';

interface A { id: string; title: string; body: string; active: boolean; createdAt: string }

export default function AnnouncementsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [title, setTitle] = React.useState('');
  const [body, setBody] = React.useState('');
  const list = useQuery({ queryKey: ['p-ann'], queryFn: () => api<A[]>('/platform/announcements') });
  const refresh = () => qc.invalidateQueries({ queryKey: ['p-ann'] });
  const create = useMutation({ mutationFn: () => post('/platform/announcements', { title, body }), onSuccess: () => { toast('Announcement published'); setTitle(''); setBody(''); void refresh(); } });
  const toggle = useMutation({ mutationFn: (a: A) => patch(`/platform/announcements/${a.id}`, { active: !a.active }), onSuccess: () => void refresh(), onError: (e) => toast(errorText(e), 'danger') });
  const remove = useMutation({ mutationFn: (id: string) => del(`/platform/announcements/${id}`), onSuccess: () => { toast('Deleted'); void refresh(); } });
  return (
    <>
      <PageHeader title="Announcements" description="Shown as a banner to every business while active." />
      <Card className="mb-5 p-5">
        <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="space-y-3">
          {create.isError && <Alert>{errorText(create.error)}</Alert>}
          <Field label="Title" htmlFor="at"><Input id="at" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label="Message" htmlFor="ab"><Input id="ab" value={body} onChange={(e) => setBody(e.target.value)} /></Field>
          <Button type="submit" loading={create.isPending} disabled={title.trim().length < 3 || body.trim().length < 3}>Publish</Button>
        </form>
      </Card>
      {!list.data?.length ? <Card><EmptyState title="No announcements yet" /></Card> : (
        <Card className="divide-y divide-border">{list.data.map((a) => (
          <div key={a.id} className="flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1"><p className="font-medium">{a.title} <Badge tone={a.active ? 'success' : 'neutral'}>{a.active ? 'Live' : 'Hidden'}</Badge></p><p className="text-sm text-muted-foreground">{a.body}</p><p className="text-xs text-muted-foreground">{formatDateTime(a.createdAt)}</p></div>
            <Button size="sm" variant="secondary" onClick={() => toggle.mutate(a)}>{a.active ? 'Hide' : 'Show'}</Button>
            <Button size="sm" variant="ghost" onClick={() => remove.mutate(a.id)}>Delete</Button>
          </div>))}
        </Card>
      )}
    </>
  );
}
