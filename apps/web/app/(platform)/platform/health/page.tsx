'use client';
import { useQuery } from '@tanstack/react-query';
import { Badge, Card, PageHeader, Skeleton } from '@/components/ui';
import { api } from '@/lib/api';

interface Health {
  status: string; checkedAt: string; database: { status: string; latencyMs: number };
  queue: { kind: string; byStatus: Record<string, number>; oldestPendingAgeSec: number; failedLast24h: number };
  process: { uptimeSec: number; rssMb: number; heapUsedMb: number; node: string }; dependencies: Record<string, string>;
}

export default function HealthPage() {
  const h = useQuery({ queryKey: ['p-health'], queryFn: () => api<Health>('/platform/health'), refetchInterval: 15000 });
  if (h.isLoading || !h.data) return <Skeleton className="h-64" />;
  const d = h.data;
  const row = (k: string, v: React.ReactNode) => <div className="flex justify-between py-2 text-sm"><dt className="text-muted-foreground">{k}</dt><dd className="font-medium">{v}</dd></div>;
  return (
    <>
      <PageHeader title="System health" description={`Refreshes every 15 seconds · checked ${new Date(d.checkedAt).toLocaleTimeString()}`} actions={<Badge tone={d.status === 'ok' ? 'success' : 'warning'}>{d.status === 'ok' ? 'All systems normal' : 'Degraded'}</Badge>} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5"><h2 className="font-semibold">Database</h2><dl className="divide-y divide-border">{row('Status', d.database.status)}{row('Response time', `${d.database.latencyMs} ms`)}</dl></Card>
        <Card className="p-5"><h2 className="font-semibold">Job queue</h2><p className="text-xs text-muted-foreground">{d.queue.kind}</p>
          <dl className="divide-y divide-border">
            {Object.entries(d.queue.byStatus).map(([k, v]) => <div key={k}>{row(k.toLowerCase(), v)}</div>)}
            {!Object.keys(d.queue.byStatus).length && row('Jobs', 'none yet')}
            {row('Oldest waiting', `${d.queue.oldestPendingAgeSec}s`)}{row('Failed in last 24 h', d.queue.failedLast24h)}
          </dl></Card>
        <Card className="p-5"><h2 className="font-semibold">Server</h2><dl className="divide-y divide-border">{row('Uptime', `${Math.floor(d.process.uptimeSec / 3600)}h ${Math.floor((d.process.uptimeSec % 3600) / 60)}m`)}{row('Memory', `${d.process.rssMb} MB`)}{row('Runtime', d.process.node)}</dl></Card>
        <Card className="p-5"><h2 className="font-semibold">Other services</h2><dl className="divide-y divide-border">{Object.entries(d.dependencies).map(([k, v]) => <div key={k}>{row(k, v)}</div>)}</dl></Card>
      </div>
    </>
  );
}
