'use client';
import { useQueryClient } from '@tanstack/react-query';
import { Activity, Building2, Flag, LayoutDashboard, LogOut, Megaphone, ScrollText, ShieldCheck, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';
import { Alert, Skeleton } from '@/components/ui';
import { ApiError, post } from '@/lib/api';
import { useMe } from '@/lib/me';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/platform', label: 'Overview', icon: LayoutDashboard },
  { href: '/platform/tenants', label: 'Businesses', icon: Building2 },
  { href: '/platform/users', label: 'Users', icon: Users },
  { href: '/platform/announcements', label: 'Announcements', icon: Megaphone },
  { href: '/platform/flags', label: 'Feature flags', icon: Flag },
  { href: '/platform/audit', label: 'Audit', icon: ScrollText },
];

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  const { data: me, error, isLoading } = useMe();
  const router = useRouter();
  const qc = useQueryClient();
  const pathname = usePathname();
  const unauth = error instanceof ApiError && error.status === 401;
  const blocked = !!me && (!me.user.isPlatformAdmin || !!me.impersonation);

  React.useEffect(() => { if (unauth) router.replace('/login'); }, [unauth, router]);
  React.useEffect(() => { if (me && !me.user.isPlatformAdmin) router.replace('/dashboard'); }, [me, router]);

  if (isLoading || unauth || !me) return <div className="mx-auto max-w-3xl space-y-4 p-6"><Skeleton className="h-10 w-1/3" /><Skeleton className="h-40" /></div>;
  if (blocked) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <Alert tone="warning">{me.impersonation ? 'A support session is active. End it to return to platform tools.' : 'Platform administrators only.'}</Alert>
        {me.impersonation && <button className="mt-3 underline" onClick={async () => { await post('/support/end-session'); await qc.invalidateQueries(); router.push('/platform'); }}>End support session</button>}
      </div>
    );
  }
  const active = (h: string) => (h === '/platform' ? pathname === h : pathname.startsWith(h));
  return (
    <div className="min-h-screen md:flex">
      <aside className="hidden w-60 shrink-0 border-r border-border bg-card md:flex md:flex-col" aria-label="Platform navigation">
        <div className="flex h-16 items-center gap-2 px-5 font-semibold"><ShieldCheck className="h-6 w-6 text-primary" aria-hidden />Platform admin</div>
        <nav className="flex-1 space-y-1 px-3 py-2">
          {NAV.map((n) => <Link key={n.href} href={n.href} aria-current={active(n.href) ? 'page' : undefined} className={cn('flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium hover:bg-muted', active(n.href) && 'bg-primary/10 text-primary')}><n.icon className="h-5 w-5" aria-hidden />{n.label}</Link>)}
          <Link href="/platform/health" aria-current={active('/platform/health') ? 'page' : undefined} className={cn('flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium hover:bg-muted', active('/platform/health') && 'bg-primary/10 text-primary')}><Activity className="h-5 w-5" aria-hidden />System health</Link>
        </nav>
        <div className="border-t border-border p-3 text-xs text-muted-foreground">{me.user.email}</div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur">
          <span className="flex items-center gap-2 font-semibold md:hidden"><ShieldCheck className="h-5 w-5 text-primary" aria-hidden />Platform</span>
          <span className="hidden text-sm text-muted-foreground md:inline">Signed in as {me.user.fullName}</span>
          <button className="flex min-h-11 items-center gap-2 rounded-md px-3 text-sm hover:bg-muted" onClick={async () => { await post('/auth/logout').catch(() => undefined); qc.clear(); router.push('/login'); }}><LogOut className="h-4 w-4" aria-hidden />Sign out</button>
        </header>
        <nav className="flex gap-1 overflow-x-auto border-b border-border px-2 md:hidden" aria-label="Platform sections">
          {[...NAV, { href: '/platform/health', label: 'Health', icon: Activity }].map((n) => <Link key={n.href} href={n.href} className={cn('flex min-h-11 shrink-0 items-center border-b-2 px-3 text-sm font-medium', active(n.href) ? 'border-primary text-primary' : 'border-transparent text-muted-foreground')}>{n.label}</Link>)}
        </nav>
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-6">{children}</main>
      </div>
    </div>
  );
}
