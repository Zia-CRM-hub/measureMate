import { Tx } from '../../common/prisma.service';

/** Full tenant data export. Must run inside a transaction scoped to the tenant (RLS) — never includes credentials. */
export async function buildTenantExport(tx: Tx, tenantId: string) {
  return {
    exportedAt: new Date().toISOString(), tenantId,
    customers: await tx.customer.findMany({ include: { members: true, contacts: true, consents: true } }),
    measurementProfiles: await tx.measurementProfile.findMany({ include: { revisions: { include: { values: true, styles: true } } } }),
    orders: await tx.order.findMany({ include: { items: true, history: true } }),
    payments: await tx.payment.findMany({ include: { allocations: true, refunds: true } }),
    invoices: await tx.invoice.findMany({ include: { items: true, creditNotes: true } }),
    inventoryItems: await tx.inventoryItem.findMany(),
    appointments: await tx.appointment.findMany(),
    branches: await tx.branch.findMany(),
  };
}
