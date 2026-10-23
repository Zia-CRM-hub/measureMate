import { LayoutDashboard, Ruler, Settings, Users, type LucideIcon } from 'lucide-react';
import { can, type Me } from './me';

export interface NavItem { href: string; label: string; icon: LucideIcon; perm?: string }
export interface QuickAction { href: string; label: string; perm?: string }

/** Only modules that are implemented end to end appear here; new modules add their entry when they land. */
export const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/customers', label: 'Customers', icon: Users, perm: 'customer.view' },
  { href: '/measurements', label: 'Measurements', icon: Ruler, perm: 'measurement.view' },
  { href: '/settings/business', label: 'Settings', icon: Settings },
];

export const QUICK_ACTIONS: QuickAction[] = [
  { href: '/customers/new', label: 'New customer', perm: 'customer.create' },
  { href: '/settings/branches?new=1', label: 'Add a branch', perm: 'branch.manage' },
  { href: '/settings/team?new=1', label: 'Invite a team member', perm: 'employee.manage' },
];

export const SETTINGS_TABS = [
  { href: '/settings/business', label: 'Business', perm: 'tenant.settings.manage' },
  { href: '/settings/branches', label: 'Branches', perm: 'branch.manage' },
  { href: '/settings/team', label: 'Team', perm: 'employee.manage' },
  { href: '/settings/plan', label: 'Plan', perm: 'subscription.manage' },
  { href: '/settings/audit', label: 'Audit log', perm: 'audit.view' },
  { href: '/settings/data', label: 'Data & privacy', perm: 'tenant.settings.manage' },
];

/** Nav items the user may see. Settings is shown to anyone who can use at least one settings tab and links to the first allowed one. */
export function resolveNav(me: Me | undefined): NavItem[] {
  if (!me) return [];
  const firstTab = SETTINGS_TABS.find((t) => can(me, t.perm));
  return NAV.flatMap((n) => {
    if (n.label === 'Settings') return firstTab ? [{ ...n, href: firstTab.href }] : [];
    return !n.perm || can(me, n.perm) ? [n] : [];
  });
}
