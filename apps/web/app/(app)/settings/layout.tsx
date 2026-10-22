'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SETTINGS_TABS } from '@/lib/nav';
import { can, useMe } from '@/lib/me';
import { cn } from '@/lib/utils';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { data: me } = useMe();
  const pathname = usePathname();
  const tabs = SETTINGS_TABS.filter((t) => can(me, t.perm));
  return (
    <>
      <h1 className="sr-only">Settings</h1>
      <nav aria-label="Settings sections" className="-mx-4 mb-6 flex gap-1 overflow-x-auto border-b border-border px-4 md:mx-0 md:px-0">
        {tabs.map((t) => (
          <Link key={t.href} href={t.href} aria-current={pathname === t.href ? 'page' : undefined}
            className={cn('flex min-h-11 shrink-0 items-center border-b-2 px-3 text-sm font-medium', pathname === t.href ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            {t.label}
          </Link>
        ))}
      </nav>
      {children}
    </>
  );
}
