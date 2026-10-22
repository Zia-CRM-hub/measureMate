'use client';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { AppShell } from '@/components/shell';
import { Alert, Skeleton } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useMe } from '@/lib/me';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { data: me, error, isLoading } = useMe();
  const router = useRouter();
  const unauth = error instanceof ApiError && error.status === 401;

  React.useEffect(() => { if (unauth) router.replace('/login'); }, [unauth, router]);
  const toPlatform = !!me && me.user.isPlatformAdmin && !me.activeTenant;
  React.useEffect(() => { if (toPlatform) router.replace('/platform'); }, [toPlatform, router]);

  if (isLoading || unauth || toPlatform) {
    return <div className="mx-auto max-w-3xl space-y-4 p-6"><Skeleton className="h-10 w-1/3" /><Skeleton className="h-40" /><Skeleton className="h-40" /></div>;
  }
  if (error || !me) return <div className="mx-auto max-w-lg p-6"><Alert>We could not load your account. Please refresh the page.</Alert></div>;
  if (!me.activeTenant) {
    return <div className="mx-auto max-w-lg p-6"><Alert tone="warning">Your account is not linked to a business yet. Ask your manager for an invitation, or <a className="underline" href="/register">register a business</a>.</Alert></div>;
  }
  return <AppShell me={me}>{children}</AppShell>;
}
