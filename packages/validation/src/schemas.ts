import { z } from 'zod';

export const phoneInput = z.string().trim().min(5).max(24);
export const emailInput = z.string().trim().toLowerCase().email().max(254);
export const moneyString = z.string().regex(/^\d+(\.\d{1,2})?$/, 'Use a decimal amount like 1250.00');

export const registerTenantSchema = z.object({
  businessName: z.string().trim().min(2).max(120),
  ownerName: z.string().trim().min(2).max(120),
  email: emailInput,
  password: z.string().min(10).max(128),
  country: z.string().length(2).toUpperCase().default('IN'),
  currency: z.string().length(3).toUpperCase().default('INR'),
  timeZone: z.string().min(1).default('Asia/Kolkata'),
  measurementUnit: z.enum(['cm', 'in']).default('in'),
});
export type RegisterTenantInput = z.infer<typeof registerTenantSchema>;

export const loginSchema = z.object({ email: emailInput, password: z.string().min(1).max(128) });

export const branchSchema = z.object({
  name: z.string().trim().min(2).max(100),
  code: z.string().trim().min(1).max(12).toUpperCase(),
  phone: z.string().trim().max(24).optional(),
  email: emailInput.optional(),
  addressLine1: z.string().trim().max(200).optional(),
  city: z.string().trim().max(100).optional(),
  postalCode: z.string().trim().max(20).optional(),
});

export const inviteEmployeeSchema = z.object({
  email: emailInput,
  fullName: z.string().trim().min(2).max(120),
  role: z.enum([
    'BRANCH_MANAGER', 'RECEPTIONIST', 'MASTER_TAILOR', 'CUTTER', 'STITCHER', 'QUALITY_CHECKER', 'CASHIER',
    'ACCOUNTANT', 'READ_ONLY_AUDITOR',
  ]),
  branchIds: z.array(z.string().uuid()).default([]),
});

export const customerInputSchema = z.object({
  fullName: z.string().trim().min(1).max(160),
  preferredName: z.string().trim().max(80).optional(),
  mobile: phoneInput.optional(),
  alternateMobile: phoneInput.optional(),
  email: emailInput.optional(),
  addressLine1: z.string().trim().max(200).optional(),
  addressLine2: z.string().trim().max(200).optional(),
  landmark: z.string().trim().max(200).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(100).optional(),
  postalCode: z.string().trim().max(20).optional(),
  country: z.string().length(2).toUpperCase().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  preferredLanguage: z.string().max(10).optional(),
  dateOfBirth: z.string().date().optional(),
  anniversary: z.string().date().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  marketingConsent: z.boolean().default(false),
  notes: z.string().max(4000).optional(),
  acquisitionSource: z.string().max(80).optional(),
  preferredBranchId: z.string().uuid().optional(),
});
export type CustomerInput = z.infer<typeof customerInputSchema>;

export const RELATIONSHIPS = ['SPOUSE', 'CHILD', 'PARENT', 'SIBLING', 'RELATIVE', 'FRIEND', 'OTHER'] as const;
export const householdMemberSchema = z.object({
  fullName: z.string().trim().min(1).max(160),
  relationship: z.enum(RELATIONSHIPS),
  dateOfBirth: z.string().date().optional(),
  notes: z.string().max(1000).optional(),
});

export const templateFieldSchema = z.object({
  key: z.string().trim().regex(/^[a-z][a-z0-9_]{0,40}$/, 'Use lowercase letters, digits and underscores'),
  label: z.string().trim().min(1).max(80),
  helpText: z.string().max(300).optional(),
  required: z.boolean().default(false),
  /** Warning range in centimetres (canonical display unit for ranges). */
  minWarnCm: z.number().nonnegative().optional(),
  maxWarnCm: z.number().positive().optional(),
});
export const templateSchema = z.object({
  name: z.string().trim().min(2).max(100),
  category: z.string().trim().min(2).max(60),
  sections: z
    .array(z.object({ name: z.string().trim().min(1).max(80), fields: z.array(templateFieldSchema).min(1) }))
    .min(1),
});
export type TemplateInput = z.infer<typeof templateSchema>;

export const revisionInputSchema = z.object({
  templateId: z.string().uuid().optional(),
  unit: z.enum(['cm', 'in']),
  values: z.record(z.string(), z.union([z.string(), z.number()])),
  stylePreferences: z.record(z.string(), z.string()).optional(),
  postureNotes: z.string().max(2000).optional(),
  fitNotes: z.string().max(2000).optional(),
  changeReason: z.string().trim().max(500).optional(),
  effectiveDate: z.string().date().optional(),
  isDraft: z.boolean().default(false),
  overrideWarningsReason: z.string().trim().min(3).max(500).optional(),
});
export type RevisionInput = z.infer<typeof revisionInputSchema>;
