'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Users } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { useToast } from '@/components/toast';
import { Alert, Badge, Button, Card, Dialog, EmptyState, Field, Input, PageHeader, Select, Skeleton } from '@/components/ui';
import { api, errorText, patch, post } from '@/lib/api';
import { useMe } from '@/lib/me';
import { titleCase } from '@/lib/utils';

interface Member { membershipId: string; userId: string; email: string; fullName: string; role: string; branchIds: string[]; status: string }
interface RoleInfo { key: string; name: string; tenantWide: boolean }
interface Branch { id: string; name: string }
interface Form { fullName: string; email: string; role: string }

function TeamInner() {
  const qc = useQueryClient();
  const toast = useToast();
  const router = useRouter();
  const { data: me } = useMe();
  const params = useSearchParams();
  const [open, setOpen] = React.useState(params.get('new') === '1');
  const [branchIds, setBranchIds] = React.useState<string[]>([]);
  const [invite, setInvite] = React.useState<{ url: string; status: string } | null>(null);
  const team = useQuery({ queryKey: ['employees'], queryFn: () => api<Member[]>('/employees') });
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => api<RoleInfo[]>('/roles') });
  const branches = useQuery({ queryKey: ['branches'], queryFn: () => api<Branch[]>('/branches') });
  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<Form>({ defaultValues: { role: 'RECEPTIONIST' } });
  const role = roles.data?.find((r) => r.key === watch('role'));

  const send = useMutation({
    mutationFn: (v: Form) => post<{ status: string; inviteToken?: string }>('/employees/invite', { ...v, branchIds: role?.tenantWide ? [] : branchIds }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['employees'] });
      reset(); setBranchIds([]); setOpen(false); router.replace('/settings/team');
      if (r.inviteToken) setInvite({ url: `${location.origin}/accept-invite?token=${r.inviteToken}`, status: r.status });
      else toast(r.status === 'ACTIVE' ? 'Added to your team' : 'Invitation sent');
    },
  });
  const update = useMutation({
    mutationFn: (a: { id: string; body: object }) => patch(`/employees/${a.id}`, a.body),
    onSuccess: () => { toast('Team member updated'); void qc.invalidateQueries({ queryKey: ['employees'] }); },
    onError: (e) => toast(errorText(e), 'danger'),
  });
  const branchName = (id: string) => branches.data?.find((b) => b.id === id)?.name ?? 'Branch';

  return (
    <>
      <PageHeader title="Team" description="Invite staff and choose what each person can see and do."
        actions={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" aria-hidden />Invite</Button>} />
      {invite && (
        <div className="mb-4"><Alert tone="success">
          <p className="font-medium">{invite.status === 'ACTIVE' ? 'Added to your team.' : 'Invitation created.'}</p>
          {invite.status === 'INVITED' && <>
            <p className="mt-1">Email delivery is not configured in this environment, so share this one-time link with them:</p>
            <input readOnly value={invite.url} onFocus={(e) => e.currentTarget.select()} aria-label="Invitation link" className="mt-2 w-full rounded border border-input bg-card px-2 py-2 text-xs text-foreground" />
          </>}
          <button className="mt-2 text-xs underline" onClick={() => setInvite(null)}>Dismiss</button>
        </Alert></div>
      )}
      {team.isLoading ? <Skeleton className="h-48" /> : !team.data?.length ? (
        <Card><EmptyState icon={<Users className="h-8 w-8" />} title="Just you for now" body="Invite receptionists, tailors and cashiers." /></Card>
      ) : (
        <Card className="divide-y divide-border">
          {team.data.map((m) => (
            <div key={m.membershipId} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{m.fullName} {m.userId === me?.user.id && <span className="text-xs text-muted-foreground">(you)</span>}</p>
                <p className="truncate text-sm text-muted-foreground">{m.email}</p>
                {m.branchIds.length > 0 && <p className="text-xs text-muted-foreground">{m.branchIds.map(branchName).join(', ')}</p>}
              </div>
              <Badge>{titleCase(m.role)}</Badge>
              <Badge tone={m.status === 'ACTIVE' ? 'success' : m.status === 'INVITED' ? 'warning' : 'danger'}>{titleCase(m.status)}</Badge>
              {m.userId !== me?.user.id && (
                m.status === 'DEACTIVATED'
                  ? <Button size="sm" variant="secondary" onClick={() => update.mutate({ id: m.membershipId, body: { status: 'ACTIVE' } })}>Reactivate</Button>
                  : <Button size="sm" variant="ghost" onClick={() => update.mutate({ id: m.membershipId, body: { status: 'DEACTIVATED' } })}>Deactivate</Button>
              )}
            </div>
          ))}
        </Card>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title="Invite a team member"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button form="invite-form" type="submit" loading={send.isPending}>Send invitation</Button></>}>
        <form id="invite-form" onSubmit={handleSubmit((v) => send.mutate(v))} className="space-y-4" noValidate>
          {send.isError && <Alert>{errorText(send.error)}</Alert>}
          <Field label="Full name" htmlFor="in-name" error={errors.fullName && 'Required'}><Input id="in-name" {...register('fullName', { required: true, minLength: 2 })} /></Field>
          <Field label="Email" htmlFor="in-email" error={errors.email && 'Enter a valid email'}><Input id="in-email" type="email" inputMode="email" {...register('email', { required: true })} /></Field>
          <Field label="Role" htmlFor="in-role">
            <Select id="in-role" {...register('role')}>{roles.data?.filter((r) => r.key !== 'TENANT_OWNER').map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}</Select>
          </Field>
          {role && !role.tenantWide && (
            <fieldset className="space-y-1"><legend className="text-sm font-medium">Branches they can work in</legend>
              {branches.data?.map((b) => (
                <label key={b.id} className="flex min-h-11 items-center gap-3 text-sm">
                  <input type="checkbox" className="h-5 w-5" checked={branchIds.includes(b.id)} onChange={(e) => setBranchIds((s) => e.target.checked ? [...s, b.id] : s.filter((x) => x !== b.id))} />{b.name}
                </label>
              ))}
            </fieldset>
          )}
        </form>
      </Dialog>
    </>
  );
}

export default function TeamPage() { return <React.Suspense fallback={null}><TeamInner /></React.Suspense>; }
