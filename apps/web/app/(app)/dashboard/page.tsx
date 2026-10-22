'use client';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Circle, GitBranch, Layers, Users } from 'lucide-react';
import Link from 'next/link';
import { Badge, Card, PageHeader, Skeleton } from '@/components/ui';
import { api } from '@/lib/api';
import { can, useMe } from '@/lib/me';
import { titleCase } from '@/lib/utils';

interface Branch { id: string; name: string }
interface Employee { status: string }

export default function DashboardPage() {
  const { data: me } = useMe();
  const canTeam = can(me, 'employee.manage');
  const branches = useQuery({ queryKey: ['branches'], queryFn: () => api<Branch[]>('/branches') });
  const team = useQuery({ queryKey: ['employees'], queryFn: () => api<Employee[]>('/employees'), enabled: canTeam });
  if (!me?.activeTenant) return null;
  const t = me.activeTenant;
  const branchCount = branches.data?.length ?? 0;
  const teamCount = team.data?.length ?? 0;

  const steps = [
    { done: true, label: 'Create your business', href: '/settings/business' },
    { done: branchCount > 0, label: 'Add your shop address and branches', href: '/settings/branches', perm: 'branch.manage' },
    { done: teamCount > 1, label: 'Invite your team', href: '/settings/team', perm: 'employee.manage' },
    { done: !!t.settings?.taxLabel, label: 'Review currency, tax and numbering', href: '/settings/business', perm: 'tenant.settings.manage' },
  ].filter((s) => !s.perm || can(me, s.perm));

  return (
    <>
      <PageHeader title={`Hello, ${me.user.fullName.split(' ')[0]}`} description={`${t.name} · ${titleCase(me.role ?? '')}`} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat icon={<GitBranch className="h-5 w-5" />} label="Branches" value={branches.isLoading ? null : branchCount} />
        <Stat icon={<Users className="h-5 w-5" />} label="Team members" value={canTeam ? (team.isLoading ? null : teamCount) : '—'} />
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Layers className="h-5 w-5" aria-hidden />Plan</div>
          <p className="mt-2 text-2xl font-semibold">{titleCase(t.entitlements.plan)}</p>
          <Badge tone={t.entitlements.status === 'ACTIVE' ? 'success' : 'warning'}>{titleCase(t.entitlements.status)}</Badge>
        </Card>
      </div>

      <Card className="mt-6 p-5">
        <h2 className="text-base font-semibold">Getting started</h2>
        <ul className="mt-3 divide-y divide-border">
          {steps.map((s) => (
            <li key={s.label}>
              <Link href={s.href} className="flex min-h-12 items-center gap-3 text-sm hover:text-primary">
                {s.done ? <CheckCircle2 className="h-5 w-5 text-success" aria-label="Done" /> : <Circle className="h-5 w-5 text-muted-foreground" aria-label="To do" />}
                <span className={s.done ? 'text-muted-foreground line-through' : 'font-medium'}>{s.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <p className="mt-6 text-sm text-muted-foreground">Customers, measurements, orders and payments are being added module by module. This workspace is already isolated per business, with role-based access and a full audit trail.</p>
    </>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string | null }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground"><span aria-hidden>{icon}</span>{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value === null ? <Skeleton className="h-8 w-12" /> : value}</div>
    </Card>
  );
}
