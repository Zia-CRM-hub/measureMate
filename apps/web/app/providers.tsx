'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import { ToastProvider } from '@/components/toast';

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: false, retry: (n, e) => n < 1 && !(e instanceof Error && 'status' in e && [401, 403, 404].includes((e as { status: number }).status)) } },
  }));
  React.useEffect(() => {
    if (localStorage.getItem('theme') === 'dark') document.documentElement.classList.add('dark');
  }, []);
  return <QueryClientProvider client={client}><ToastProvider>{children}</ToastProvider></QueryClientProvider>;
}
