'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { useToast } from '@/components/toast';
import { Button, Card, EmptyState, Field, Input, PageHeader } from '@/components/ui';
import { api, del, errorText, post } from '@/lib/api';

interface Flag { key: string; enabled: boolean; description: string | null }

export default function FlagsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [key, setKey] = React.useState('');
  const [desc, setDesc] = React.useState('');
  const list = useQuery({ queryKey: ['p-flags'], queryFn: () => api<Flag[]>('/platform/feature-flags') });
  const refresh = () => qc.invalidateQueries({ queryKey: ['p-flags'] });
  const set = useMutation({
    mutationFn: (f: { key: string; enabled: boolean; description?: string }) => api(`/platform/feature-flags/${encodeURIComponent(f.key)}`, { method: 'PUT', body: { enabled: f.enabled, description: f.description } }),
    onSuccess: () => { void refresh(); setKey(''); setDesc(''); }, onError: (e) => toast(errorText(e), 'danger'),
  });
  const remove = useMutation({ mutationFn: (k: string) => del(`/platform/feature-flags/${encodeURIComponent(k)}`), onSuccess: () => void refresh() });
  return (
    <>
      <PageHeader title="Feature flags" description="Switches for rolling out new features gradually. Every change is audited." />
      <Card className="mb-5 p-5">
        <form onSubmit={(e) => { e.preventDefault(); set.mutate({ key, enabled: false, description: desc || undefined }); }} className="flex flex-wrap items-end gap-3">
          <Field label="Flag name" htmlFor="fk" hint="Lowercase letters, digits, - . _"><Input id="fk" value={key} onChange={(e) => setKey(e.target.value)} /></Field>
          <Field label="What it does" htmlFor="fd"><Input id="fd" value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
          <Button type="submit" disabled={key.trim().length < 2} loading={set.isPending}>Add (off)</Button>
        </form>
      </Card>
      {!list.data?.length ? <Card><EmptyState title="No flags yet" /></Card> : (
        <Card className="divide-y divide-border">{list.data.map((f) => (
          <div key={f.key} className="flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1"><p className="font-mono text-sm font-medium">{f.key}</p><p className="text-sm text-muted-foreground">{f.description ?? '—'}</p></div>
            <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" role="switch" className="h-5 w-5" checked={f.enabled} onChange={(e) => set.mutate({ key: f.key, enabled: e.target.checked, description: f.description ?? undefined })} />{f.enabled ? 'On' : 'Off'}</label>
            <Button size="sm" variant="ghost" onClick={() => remove.mutate(f.key)}>Delete</Button>
          </div>))}
        </Card>
      )}
    </>
  );
}
