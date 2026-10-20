/** Subscription plans and entitlements. -1 = unlimited. Prices are illustrative assumptions (see docs/business-plan.md). */
export interface PlanDef {
  key: string;
  name: string;
  priceMonthly: string;
  limits: Record<string, number>;
  features: Record<string, boolean>;
}

export const PLANS: PlanDef[] = [
  {
    key: 'STARTER', name: 'Starter', priceMonthly: '9.00',
    limits: { max_branches: 1, max_employees: 3, max_customers: 300 },
    features: { inventory: false, reports: false, portal: false, multi_branch: false, pdf_branding: false },
  },
  {
    key: 'PROFESSIONAL', name: 'Professional', priceMonthly: '29.00',
    limits: { max_branches: 3, max_employees: 15, max_customers: 5000 },
    features: { inventory: true, reports: true, portal: true, multi_branch: true, pdf_branding: true },
  },
  {
    key: 'BUSINESS', name: 'Business', priceMonthly: '79.00',
    limits: { max_branches: 10, max_employees: 50, max_customers: 50000 },
    features: { inventory: true, reports: true, portal: true, multi_branch: true, pdf_branding: true },
  },
  {
    key: 'ENTERPRISE', name: 'Enterprise', priceMonthly: '199.00',
    limits: { max_branches: -1, max_employees: -1, max_customers: -1 },
    features: { inventory: true, reports: true, portal: true, multi_branch: true, pdf_branding: true },
  },
];
