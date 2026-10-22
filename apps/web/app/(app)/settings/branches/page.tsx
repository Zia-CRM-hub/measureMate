'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GitBranch, Plus } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { useToast } from '@/components/toast';
import { Alert, Button, Card, Dialog, EmptyState, Field, Input, PageHeader, Skeleton } from '@/components/ui';
import { api, del, errorText, post } from '@/lib/api';

interface Branch { id: string; name: string; code: string; city: string | null; phone: string | null }
interface Form { name: string; code: string; city: string; phone: string }

function BranchesInner() {
  const qc = useQueryClient();
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const [open, setOpen] = React.useState(params.get('new') === '1');
  const [archiveId, setArchiveId] = React.useState<string | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ['branches'], queryFn: () => api<Branch[]>('/branches') });
  const { register, handleSubmit, reset, formState: { errors } } = useForm<Form>();

  const create = useMutation({
    mutationFn: (v: Form) => post('/branches', { name: v.name, code: v.code.toUpperCase(), city: v.city || undefined, phone: v.phone || undefined }),
    onSuccess: () => { toast('Branch added'); setOpen(false); reset(); void qc.invalidateQueries({ queryKey: ['branches'] }); router.replace('/settings/branches'); },
  });
  const archive = useMutation({
    mutationFn: (id: string) => del(`/branches/${id}`),
    onSuccess: () => { toast('Branch archived'); setArchiveId(null); void qc.invalidateQueries({ queryKey: ['branches'] }); },
    onError: (e) => { toast(errorText(e), 'danger'); setArchiveId(null); },
  });

  return (
    <>
      <PageHeader title="Branches" description="Each branch has its own orders, appointments and stock."
        actions={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" aria-hidden />Add branch</Button>} />
      {isLoading ? <Skeleton className="h-40" /> : !data?.length ? (
        <Card><EmptyState icon={<GitBranch className="h-8 w-8" />} title="No branches yet" body="Add your first shop or workshop location." /></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {data.map((b) => (
            <Card key={b.id} className="flex items-start justify-between gap-3 p-4">
              <div>
                <p className="font-medium">{b.name} <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{b.code}</span></p>
                <p className="text-sm text-muted-foreground">{[b.city, b.phone].filter(Boolean).join(' · ') || 'No address yet'}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setArchiveId(b.id)}>Archive</Button>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title="Add a branch"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button form="branch-form" type="submit" loading={create.isPending}>Add branch</Button></>}>
        <form id="branch-form" onSubmit={handleSubmit((v) => create.mutate(v))} className="space-y-4" noValidate>
          {create.isError && <Alert>{errorText(create.error)}</Alert>}
          <Field label="Branch name" htmlFor="bn" error={errors.name && 'Required'}><Input id="bn" {...register('name', { required: true, minLength: 2 })} /></Field>
          <Field label="Short code" htmlFor="bc" hint="Used in numbering, e.g. CTR" error={errors.code && 'Required'}><Input id="bc" maxLength={12} className="uppercase" {...register('code', { required: true })} /></Field>
          <Field label="City" htmlFor="bcity"><Input id="bcity" {...register('city')} /></Field>
          <Field label="Phone" htmlFor="bph"><Input id="bph" type="tel" {...register('phone')} /></Field>
        </form>
      </Dialog>

      <Dialog open={!!archiveId} onClose={() => setArchiveId(null)} title="Archive this branch?"
        footer={<><Button variant="secondary" onClick={() => setArchiveId(null)}>Keep it</Button><Button variant="danger" loading={archive.isPending} onClick={() => archiveId && archive.mutate(archiveId)}>Archive branch</Button></>}>
        <p className="text-sm text-muted-foreground">The branch is hidden from new work. History is kept. Branches with open orders cannot be archived.</p>
      </Dialog>
    </>
  );
}

export default function BranchesPage() { return <React.Suspense fallback={null}><BranchesInner /></React.Suspense>; }
