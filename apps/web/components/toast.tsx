'use client';
import * as React from 'react';
import { cn } from '@/lib/utils';

interface Toast { id: number; text: string; tone: 'success' | 'danger' }
const Ctx = React.createContext<(text: string, tone?: Toast['tone']) => void>(() => undefined);
export const useToast = () => React.useContext(Ctx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<Toast[]>([]);
  const push = React.useCallback((text: string, tone: Toast['tone'] = 'success') => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, text, tone }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), 5000);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6">
        {items.map((t) => (
          <div key={t.id} className={cn('pointer-events-auto max-w-md rounded-md px-4 py-3 text-sm font-medium shadow-lg',
            t.tone === 'success' ? 'bg-foreground text-background' : 'bg-danger text-white')}>{t.text}</div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
