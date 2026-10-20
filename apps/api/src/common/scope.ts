import { currentContext } from './context';
import { forbidden } from './errors';

/** Throws unless the caller may act on this branch (empty branchIds = tenant-wide access). */
export function assertBranchAccess(branchId: string) {
  const c = currentContext();
  if (c.branchIds.length > 0 && !c.branchIds.includes(branchId)) throw forbidden('You do not have access to that branch');
}

/** Prisma `where` fragment restricting a branchId column to the caller's branch scope. */
export function branchFilter(): { branchId?: { in: string[] } } {
  const c = currentContext();
  return c.branchIds.length > 0 ? { branchId: { in: c.branchIds } } : {};
}

/** Pull settings used by most services. */
export async function loadSettings(tx: import('./prisma.service').Tx, tenantId: string) {
  return tx.tenantSettings.findUniqueOrThrow({ where: { tenantId } });
}
