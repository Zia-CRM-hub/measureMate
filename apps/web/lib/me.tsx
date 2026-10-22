'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export interface Me {
  user: { id: string; email: string; fullName: string; isPlatformAdmin: boolean };
  activeTenant: null | {
    id: string; name: string; slug: string; status: string;
    settings: { currency: string; country: string; timeZone: string; measurementUnit: 'cm' | 'in'; taxLabel: string; brandColor: string; locale: string; dateFormat: string; taxInclusive: boolean } | null;
    entitlements: { plan: string; status: string; limits: Record<string, number>; features: Record<string, boolean> };
  };
  role: string | null;
  branchIds: string[];
  permissions: string[];
  tenants: { id: string; name: string; role: string }[];
  impersonation: null | { reason: string; expiresAt: string };
  announcements: { id: string; title: string; body: string }[];
}

export function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/auth/me'), retry: false, staleTime: 30_000 });
}

export const can = (me: Me | undefined, ...perms: string[]) => !!me && perms.every((p) => me.permissions.includes(p));
