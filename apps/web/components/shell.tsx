'use client';
import { useQueryClient } from '@tanstack/react-query';
import { Building2, ChevronDown, LogOut, Moon, Plus, Search, Sun } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';
import { post, errorText } from '@/lib/api';
import { can, type Me } from '@/lib/me';
import { NAV, QUICK_ACTIONS } from '@/lib/nav';
import { cn, titleCase } from '@/lib/utils';
import { CommandPalette } from './command-palette';
import { useToast } from './toast';
import { Alert } from './ui';

function useOutside(ref: React.RefObject<HTMLElement | null>, onOut: () => void) {
  React.useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onOut(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [ref, onOut]);
}

function Menu({ label, icon, children, align = 'left' }: { label: React.ReactNode; icon?: React.ReactNode; children: (close: () => void) => React.ReactNode; align?: 'left' | 'right' }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  useOutside(ref, () => setOpen(false));
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu"
        className="flex min-h-11 items-center gap-2 rounded-md px-2.5 text-sm font-medium hover:bg-muted">{icon}{label}<ChevronDown className="h-4 w-4 opacity-60" aria-hidden /></button>
      {open && (
        <div role="menu" className={cn('absolute z-40 mt-1 min-w-56 rounded-lg border border-border bg-card p-1 shadow-lg', align === 'right' ? 'right-0' : 'left-0')}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

const itemCls = 'flex min-h-11 w-full items-center gap-2 rounded-md px-3 text-left text-sm hover:bg-muted';

export function AppShell({ me, children }: { me: Me; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const [palette, setPalette] = React.useState(false);
  const [dark, setDark] = React.useState(false);

  React.useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
    const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(true); } };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, []);

  const nav = NAV.filter((n) => !n.perm || can(me, n.perm));
  const quick = QUICK_ACTIONS.filter((a) => !a.perm || can(me, a.perm));
  const isActive = (href: string) => pathname === href || (href !== '/dashboard' && pathname.startsWith('/' + href.split('/')[1]));

  async function switchTenant(id: string) {
    try { await post('/auth/switch-tenant', { tenantId: id }); await qc.invalidateQueries(); router.push('/dashboard'); router.refresh(); }
    catch (e) { toast(errorText(e), 'danger'); }
  }
  async function logout() {
    await post('/auth/logout').catch(() => undefined);
    qc.clear();
    router.push('/login');
  }
  function toggleTheme() {
    const next = !dark;
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
    setDark(next);
  }

  return (
    <div className="min-h-screen md:flex">
      <aside className="hidden w-60 shrink-0 border-r border-border bg-card md:flex md:flex-col" aria-label="Primary">
        <div className="flex h-16 items-center gap-2 px-5 text-lg font-semibold">
          <img src="/icon.svg" alt="" className="h-7 w-7" />MeasureMate
        </div>
        <nav className="flex-1 space-y-1 px-3 py-2">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} aria-current={isActive(n.href) ? 'page' : undefined}
              className={cn('flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium hover:bg-muted', isActive(n.href) && 'bg-primary/10 text-primary')}>
              <n.icon className="h-5 w-5" aria-hidden />{n.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-border p-3 text-xs text-muted-foreground">Press <kbd className="rounded border border-border px-1">Ctrl</kbd> + <kbd className="rounded border border-border px-1">K</kbd> for commands</div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {me.impersonation && (
          <div className="flex flex-wrap items-center justify-center gap-3 bg-warning px-4 py-2 text-center text-sm font-semibold text-black">
            <span>Support session (read-only) · Reason: {me.impersonation.reason} · Expires {new Date(me.impersonation.expiresAt).toLocaleTimeString()}</span>
            <button className="min-h-9 rounded-md bg-black px-3 text-white" onClick={async () => { await post('/support/end-session').catch(() => undefined); await qc.invalidateQueries(); router.push('/platform'); }}>End support session</button>
          </div>
        )}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-border bg-background/95 px-3 backdrop-blur md:px-6">
          <Link href="/dashboard" className="mr-1 flex items-center gap-2 font-semibold md:hidden"><img src="/icon.svg" alt="MeasureMate" className="h-8 w-8" /></Link>
          <Menu icon={<Building2 className="h-4 w-4" aria-hidden />} label={<span className="max-w-[9rem] truncate sm:max-w-xs">{me.activeTenant?.name ?? 'Choose business'}</span>}>
            {(close) => (
              <>
                <p className="px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">Your businesses</p>
                {me.tenants.map((t) => (
                  <button key={t.id} role="menuitem" className={itemCls} onClick={() => { close(); if (t.id !== me.activeTenant?.id) void switchTenant(t.id); }}>
                    <span className="flex-1 truncate">{t.name}</span><span className="text-xs text-muted-foreground">{titleCase(t.role)}</span>
                  </button>
                ))}
                <Link href="/register" role="menuitem" className={itemCls} onClick={close}><Plus className="h-4 w-4" aria-hidden />Add another business</Link>
              </>
            )}
          </Menu>
          <div className="flex-1" />
          <button onClick={() => setPalette(true)} className="flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md border border-input px-3 text-sm text-muted-foreground hover:bg-muted" aria-label="Search and commands">
            <Search className="h-4 w-4" aria-hidden /><span className="hidden lg:inline">Search or jump to…</span>
          </button>
          {quick.length > 0 && (
            <Menu align="right" icon={<Plus className="h-4 w-4" aria-hidden />} label={<span className="hidden sm:inline">Quick create</span>}>
              {(close) => quick.map((a) => <Link key={a.href} role="menuitem" href={a.href} className={itemCls} onClick={close}>{a.label}</Link>)}
            </Menu>
          )}
          <button onClick={toggleTheme} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} className="flex h-11 w-11 items-center justify-center rounded-md hover:bg-muted">
            {dark ? <Sun className="h-5 w-5" aria-hidden /> : <Moon className="h-5 w-5" aria-hidden />}
          </button>
          <Menu align="right" label={<span className="hidden max-w-[8rem] truncate sm:inline">{me.user.fullName}</span>}
            icon={<span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground" aria-hidden>{me.user.fullName.slice(0, 1).toUpperCase()}</span>}>
            {() => (
              <>
                <div className="px-3 py-2 text-sm"><p className="font-medium">{me.user.fullName}</p><p className="text-xs text-muted-foreground">{me.user.email}</p>{me.role && <p className="text-xs text-muted-foreground">{titleCase(me.role)}</p>}</div>
                <button role="menuitem" className={itemCls} onClick={logout}><LogOut className="h-4 w-4" aria-hidden />Sign out</button>
              </>
            )}
          </Menu>
        </header>

        {me.announcements[0] && <div className="px-4 pt-3 md:px-6"><Alert tone="warning"><strong>{me.announcements[0].title}</strong> — {me.announcements[0].body}</Alert></div>}
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-28 md:px-6 md:pb-10">{children}</main>
      </div>

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-card md:hidden" aria-label="Primary mobile">
        {nav.map((n) => (
          <Link key={n.href} href={n.href} aria-current={isActive(n.href) ? 'page' : undefined}
            className={cn('flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-xs font-medium', isActive(n.href) ? 'text-primary' : 'text-muted-foreground')}>
            <n.icon className="h-5 w-5" aria-hidden />{n.label}
          </Link>
        ))}
      </nav>
      <CommandPalette me={me} open={palette} setOpen={setPalette} />
    </div>
  );
}
