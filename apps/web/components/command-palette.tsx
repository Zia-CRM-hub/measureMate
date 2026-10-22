'use client';
import { Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { can, type Me } from '@/lib/me';
import { NAV, QUICK_ACTIONS, SETTINGS_TABS } from '@/lib/nav';

export function CommandPalette({ me, open, setOpen }: { me: Me; open: boolean; setOpen: (v: boolean) => void }) {
  const router = useRouter();
  const [q, setQ] = React.useState('');
  const [active, setActive] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const items = React.useMemo(() => {
    const all = [
      ...QUICK_ACTIONS.filter((a) => !a.perm || can(me, a.perm)).map((a) => ({ ...a, group: 'Create' })),
      ...NAV.filter((n) => !n.perm || can(me, n.perm)).map((n) => ({ href: n.href, label: `Go to ${n.label}`, group: 'Navigate' })),
      ...SETTINGS_TABS.filter((n) => can(me, n.perm)).map((n) => ({ href: n.href, label: `Settings · ${n.label}`, group: 'Settings' })),
    ];
    const t = q.trim().toLowerCase();
    return t ? all.filter((i) => i.label.toLowerCase().includes(t)) : all;
  }, [me, q]);

  React.useEffect(() => { setActive(0); }, [q]);
  React.useEffect(() => { if (open) { setQ(''); setTimeout(() => inputRef.current?.focus(), 0); } }, [open]);

  if (!open) return null;
  const go = (href: string) => { setOpen(false); router.push(href); };
  return (
    <div className="fixed inset-0 z-[65] flex items-start justify-center bg-black/50 p-4 pt-[12vh]" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div role="dialog" aria-modal="true" aria-label="Command palette" className="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="h-4 w-4 text-muted-foreground" aria-hidden />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a command or page name…" aria-label="Search commands"
            className="min-h-12 w-full bg-transparent text-base outline-none"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false);
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              if (e.key === 'Enter' && items[active]) go(items[active].href);
            }} />
        </div>
        <ul role="listbox" className="max-h-80 overflow-y-auto p-1">
          {items.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">Nothing matches “{q}”</li>}
          {items.map((i, idx) => (
            <li key={i.href + i.label} role="option" aria-selected={idx === active}>
              <button onClick={() => go(i.href)} onMouseEnter={() => setActive(idx)}
                className={`flex min-h-11 w-full items-center justify-between rounded-md px-3 text-left text-sm ${idx === active ? 'bg-muted' : ''}`}>
                <span>{i.label}</span><span className="text-xs text-muted-foreground">{i.group}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
