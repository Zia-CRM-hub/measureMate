import { AsyncLocalStorage } from 'node:async_hooks';
import type { Permission, RoleKey } from '@measuremate/validation';

export interface RequestContext {
  userId: string;
  userEmail: string;
  fullName: string;
  sessionId: string;
  tenantId: string | null;
  role: RoleKey | null;
  /** Empty array means "all branches" (tenant-wide role). */
  branchIds: string[];
  permissions: Permission[];
  isPlatformAdmin: boolean;
  customerId: string | null; // portal users
  impersonatorId: string | null;
  impersonationReason: string | null;
  sessionExpiresAt: Date;
  correlationId: string;
  ip: string | null;
}

export const contextStore = new AsyncLocalStorage<Partial<RequestContext> & { correlationId: string; ip: string | null }>();

export function currentContext(): RequestContext {
  const c = contextStore.getStore() as RequestContext | undefined;
  if (!c || !c.userId) throw new Error('No authenticated request context');
  return c;
}

export function currentTenantId(): string {
  const c = currentContext();
  if (!c.tenantId) throw new Error('No active tenant in context');
  return c.tenantId;
}

export function maybeContext(): (Partial<RequestContext> & { correlationId: string }) | undefined {
  return contextStore.getStore();
}
