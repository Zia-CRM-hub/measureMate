'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Card, PageHeader, Skeleton } from '@/components/ui';
import { api } from '@/lib/api';
import { titleCase } from '@/lib/utils';

interface Overview { tenants: Record<string, number>; byPlan: Record<string, number>; trialing: number; pastDue: number; users: number; customers: number; orders: number; newTenants30d: number }

function Stat({ label, value, href }: { label: string; value: number | string; href?: string }) {
  const inner = <Card className="p-4"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></Card>;
  return href ? <Link href={href} className="block hover:opacity-90">{inner}</Link> : inner;
}

export default function PlatformOverview() {
  const o = useQuery({ queryKey: ['p-overview'], queryFn: () => api<Overview>('/platform/overview') });
  if (o.isLoading || !o.data) return <Skeleton className="h-64" />;
  const d = o.data;
  const total = Object.values(d.tenants).reduce((a, b) => a + b, 0);
  return (
    <>
      <PageHeader title="Platform overview" description="All businesses on MeasureMate. Counts only; business records stay private unless a reasoned support session is opened." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Businesses" value={total} href="/platform/tenants" />
        <Stat label="Active" value={d.tenants.ACTIVE ?? 0} href="/platform/tenants?status=ACTIVE" />
        <Stat label="Suspended" value={d.tenants.SUSPENDED ?? 0} href="/platform/tenants?status=SUSPENDED" />
        <Stat label="Pending deletion" value={d.tenants.PENDING_DELETION ?? 0} href="/platform/tenants?status=PENDING_DELETION" />
        <Stat label="New in 30 days" value={d.newTenants30d} />
        <Stat label="On trial" value={d.trialing} />
        <Stat label="Payment overdue" value={d.pastDue} />
        <Stat label="User accounts" value={d.users} href="/platform/users" />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-semibold">Businesses by plan</h2>
          <table className="mt-3 w-full text-sm"><caption className="sr-only">Number of businesses on each plan</caption><tbody className="divide-y divide-border">
            {Object.entries(d.byPlan).map(([k, v]) => <tr key={k}><th scope="row" className="py-2 text-left font-normal">{titleCase(k)}</th><td className="py-2 text-right font-medium">{v}</td></tr>)}
            {!Object.keys(d.byPlan).length && <tr><td className="py-2 text-muted-foreground">No subscriptions yet</td></tr>}
          </tbody></table>
        </Card>
        <Card className="p-5">
          <h2 className="font-semibold">Usage</h2>
          <dl className="mt-3 divide-y divide-border text-sm">
            <div className="flex justify-between py-2"><dt>Customer records</dt><dd className="font-medium">{d.customers}</dd></div>
            <div className="flex justify-between py-2"><dt>Orders</dt><dd className="font-medium">{d.orders}</dd></div>
          </dl>
        </Card>
      </div>
    </>
  );
}
