import { parsePhoneNumberFromString, CountryCode } from 'libphonenumber-js';
import { badRequest } from './errors';

/** Normalize to E.164 using the tenant's country as the default region. */
export function normalizePhone(raw: string | undefined | null, defaultCountry = 'IN'): string | null {
  if (!raw) return null;
  const p = parsePhoneNumberFromString(raw.trim(), defaultCountry as CountryCode);
  if (!p || !p.isPossible()) throw badRequest('INVALID_PHONE', `"${raw}" is not a valid mobile number`);
  return p.number;
}

export const digitsOnly = (s: string) => s.replace(/\D/g, '');
export const normalizeEmail = (e?: string | null) => (e ? e.trim().toLowerCase() : null);
