'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { useToast } from '@/components/toast';
import { Badge, Button, Card, PageHeader, Skeleton } from '@/components/ui';
import { api, errorText, post } from '@/lib/api';
import { useMe } from '@/lib/me';

interface Plan { key: string; name: string; priceMonthly: string; limits: Record<string, number>; features: Record<string, boolean> }
const FEATURE_LABELS: Record<string, string> = { inventory: 'Inventory & suppliers', reports: 'Reports & exports', portal: 'Customer portal', multi_branch: 'Multi-branch', pdf_branding: 'Branded PDFs' };
const LIMIT_LABELS: Record<string, string> = { max_branches: 'branches', max_employees: 'team members', max_customers: 'customers' };

export default function PlanPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: me } = useMe();
  const plans = useQuery({ queryKey: ['plans'], queryFn: () => api<Plan[]>('/tenant/plans') });
  const change = useMutation({
    mutationFn: (planKey: string) => post('/tenant/subscription', { planKey }),
    onSuccess: () => { toast('Plan updated'); void qc.invalidateQueries({ queryKey: ['me'] }); },
    onError: (e) => toast(errorText(e), 'danger'),
  });
  const current = me?.activeTenant?.entitlements.plan;

  return (
    <>
      <PageHeader title="Plan & billing" description="Billing here uses a built-in mock provider; plans switch instantly. Prices are illustrative." />
      {plans.isLoading ? <Skeleton className="h-72" /> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {plans.data?.map((p) => (
            <Card key={p.key} className={`flex flex-col p-5 ${p.key === current ? 'ring-2 ring-primary' : ''}`}>
              <div className="flex items-center justify-between"><h2 className="font-semibold">{p.name}</h2>{p.key === current && <Badge tone="success">Current</Badge>}</div>
              <p className="mt-2 text-2xl font-semibold">${p.priceMonthly}<span className="text-sm font-normal text-muted-foreground"> / month</span></p>
              <ul className="mt-4 flex-1 space-y-2 text-sm">
                {Object.entries(p.limits).map(([k, v]) => <li key={k}>{v < 0 ? 'Unlimited' : `Up to ${v}`} {LIMIT_LABELS[k] ?? k}</li>)}
                {Object.entries(p.features).map(([k, on]) => (
                  <li key={k} className={`flex items-center gap-2 ${on ? '' : 'text-muted-foreground'}`}>
                    {on ? <Check className="h-4 w-4 text-success" aria-label="Included" /> : <X className="h-4 w-4" aria-label="Not included" />}{FEATURE_LABELS[k] ?? k}
                  </li>
                ))}
              </ul>
              <Button className="mt-5" variant={p.key === current ? 'secondary' : 'primary'} disabled={p.key === current} loading={change.isPending && change.variables === p.key} onClick={() => change.mutate(p.key)}>
                {p.key === current ? 'Your plan' : 'Switch to this plan'}
              </Button>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
