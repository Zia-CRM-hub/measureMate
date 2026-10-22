import { LayoutDashboard, Settings, type LucideIcon } from 'lucide-react';

export interface NavItem { href: string; label: string; icon: LucideIcon; perm?: string }
export interface QuickAction { href: string; label: string; perm?: string }

/** Only modules that are implemented end to end appear here; new modules add their entry when they land. */
export const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/settings/business', label: 'Settings', icon: Settings, perm: 'tenant.settings.manage' },
];

export const QUICK_ACTIONS: QuickAction[] = [
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
