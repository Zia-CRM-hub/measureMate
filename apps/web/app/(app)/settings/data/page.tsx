'use client';
import { useMutation } from '@tanstack/react-query';
import * as React from 'react';
import { useToast } from '@/components/toast';
import { Alert, Button, Card, Dialog, Field, Input, PageHeader } from '@/components/ui';
import { errorText, post } from '@/lib/api';
import { useMe } from '@/lib/me';

export default function DataPage() {
  const toast = useToast();
  const { data: me } = useMe();
  const [open, setOpen] = React.useState(false);
  const [confirm, setConfirm] = React.useState('');
  const exportAll = useMutation({
    mutationFn: () => post<unknown>('/tenant/export'),
    onSuccess: (data) => {
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url; a.download = `measuremate-export-${new Date().toISOString().slice(0, 10)}.json`; a.click();
      URL.revokeObjectURL(url);
      toast('Export downloaded');
    },
    onError: (e) => toast(errorText(e), 'danger'),
  });
  const del = useMutation({
    mutationFn: () => post('/tenant/deletion-request', { confirmName: confirm }),
    onSuccess: () => { toast('Deletion requested'); setOpen(false); location.assign('/login'); },
  });
  const name = me?.activeTenant?.name ?? '';

  return (
    <>
      <PageHeader title="Data & privacy" description="You own your data. Export it any time or ask for it to be deleted." />
      <Card className="mb-4 p-5">
        <h2 className="font-semibold">Export all data</h2>
        <p className="mt-1 text-sm text-muted-foreground">Download customers, measurements, orders, payments and invoices as a JSON file. Password hashes and secrets are never included.</p>
        <Button className="mt-4" variant="secondary" loading={exportAll.isPending} onClick={() => exportAll.mutate()}>Download export</Button>
      </Card>
      {me?.role === 'TENANT_OWNER' && (
        <Card className="border-danger/40 p-5">
          <h2 className="font-semibold text-danger">Delete this business</h2>
          <p className="mt-1 text-sm text-muted-foreground">Access is blocked straight away and your data is permanently erased after the retention grace period. Export first.</p>
          <Button className="mt-4" variant="danger" onClick={() => setOpen(true)}>Request deletion…</Button>
        </Card>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} title="Delete this business?"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button variant="danger" disabled={confirm !== name} loading={del.isPending} onClick={() => del.mutate()}>Request deletion</Button></>}>
        <div className="space-y-4">
          {del.isError && <Alert>{errorText(del.error)}</Alert>}
          <p className="text-sm">This cannot be undone once the grace period ends. Type <strong>{name}</strong> to confirm.</p>
          <Field label="Business name" htmlFor="confirm"><Input id="confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" /></Field>
        </div>
      </Dialog>
    </>
  );
}
