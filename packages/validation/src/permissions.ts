export const PERMISSIONS = [
  'customer.view', 'customer.create', 'customer.update', 'customer.archive', 'customer.export', 'customer.merge',
  'measurement.view', 'measurement.create', 'measurement.revise', 'measurement.restore', 'measurement.template.manage',
  'order.view', 'order.create', 'order.assign', 'order.update', 'order.cancel', 'order.deliver', 'order.status',
  'payment.view', 'payment.record', 'payment.refund', 'payment.reconcile', 'payment.export', 'payment.writeoff',
  'invoice.view', 'invoice.create', 'invoice.void', 'invoice.download',
  'inventory.view', 'inventory.manage',
  'employee.manage', 'branch.manage',
  'report.view', 'report.export',
  'tenant.settings.manage', 'subscription.manage',
  'audit.view',
  'appointment.view', 'appointment.manage',
  'portal.access',
  'platform.admin',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_KEYS = [
  'PLATFORM_ADMIN', 'TENANT_OWNER', 'BRANCH_MANAGER', 'RECEPTIONIST', 'MASTER_TAILOR', 'CUTTER',
  'STITCHER', 'QUALITY_CHECKER', 'CASHIER', 'ACCOUNTANT', 'READ_ONLY_AUDITOR', 'CUSTOMER_PORTAL_USER',
] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

export const ROLE_LABELS: Record<RoleKey, string> = {
  PLATFORM_ADMIN: 'Platform Administrator', TENANT_OWNER: 'Tenant Owner', BRANCH_MANAGER: 'Branch Manager',
  RECEPTIONIST: 'Receptionist', MASTER_TAILOR: 'Master Tailor', CUTTER: 'Cutter', STITCHER: 'Stitcher',
  QUALITY_CHECKER: 'Quality Checker', CASHIER: 'Cashier', ACCOUNTANT: 'Accountant',
  READ_ONLY_AUDITOR: 'Read-Only Auditor', CUSTOMER_PORTAL_USER: 'Customer Portal User',
};

/** Roles that see all branches in a tenant; every other role is limited to its assigned branches. */
export const TENANT_WIDE_ROLES: RoleKey[] = ['TENANT_OWNER', 'ACCOUNTANT', 'READ_ONLY_AUDITOR'];

const view: Permission[] = ['customer.view', 'measurement.view', 'order.view', 'appointment.view'];
const production: Permission[] = [...view, 'order.status', 'measurement.create'];
const nonPlatform = PERMISSIONS.filter((p) => p !== 'platform.admin' && p !== 'portal.access');

export const ROLE_PERMISSIONS: Record<RoleKey, Permission[]> = {
  PLATFORM_ADMIN: ['platform.admin', 'audit.view'],
  TENANT_OWNER: [...nonPlatform],
  BRANCH_MANAGER: nonPlatform.filter(
    (p) => !['subscription.manage', 'tenant.settings.manage', 'payment.writeoff'].includes(p),
  ),
  RECEPTIONIST: [
    ...view, 'customer.create', 'customer.update', 'measurement.create', 'order.create', 'order.update',
    'appointment.manage', 'payment.record', 'payment.view', 'invoice.view', 'invoice.download',
  ],
  MASTER_TAILOR: [...production, 'measurement.revise', 'measurement.template.manage', 'order.assign', 'order.update'],
  CUTTER: [...production],
  STITCHER: [...production],
  QUALITY_CHECKER: [...production],
  CASHIER: [...view, 'payment.view', 'payment.record', 'invoice.view', 'invoice.create', 'invoice.download'],
  ACCOUNTANT: [
    'customer.view', 'order.view', 'payment.view', 'payment.export', 'payment.reconcile', 'payment.refund',
    'payment.writeoff', 'invoice.view', 'invoice.create', 'invoice.void', 'invoice.download', 'report.view',
    'report.export', 'audit.view',
  ],
  READ_ONLY_AUDITOR: [
    'customer.view', 'measurement.view', 'order.view', 'payment.view', 'invoice.view', 'inventory.view',
    'report.view', 'audit.view', 'appointment.view',
  ],
  CUSTOMER_PORTAL_USER: ['portal.access'],
};
