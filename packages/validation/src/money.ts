/**
 * Exact money arithmetic on integer minor units (bigint). Never uses floating point.
 * Amounts cross the API as decimal strings ("1234.50") and are stored as NUMERIC(14,2).
 */
export function parseMoney(v: string | number): bigint {
  const s = typeof v === 'number' ? v.toFixed(2) : v.trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) throw new Error(`Invalid money amount: ${s}`);
  const neg = s.startsWith('-');
  const [i = '0', f = ''] = s.replace('-', '').split('.');
  const n = BigInt(i) * 100n + BigInt((f + '00').slice(0, 2));
  return neg ? -n : n;
}

export function formatMoney(n: bigint): string {
  const neg = n < 0n;
  const abs = neg ? -n : n;
  const s = abs.toString().padStart(3, '0');
  return `${neg ? '-' : ''}${s.slice(0, -2)}.${s.slice(-2)}`;
}

function percentScaled(percent: string): bigint {
  if (!/^\d+(\.\d{1,4})?$/.test(percent)) throw new Error(`Invalid percent: ${percent}`);
  const [i = '0', f = ''] = percent.split('.');
  return BigInt(i) * 10_000n + BigInt((f + '0000').slice(0, 4)); // percent x 1e4
}

/** amount * percent / 100, rounded half away from zero. `percent` is a decimal string such as "18" or "12.5". */
export function percentOf(amount: bigint, percent: string): bigint {
  const num = amount * percentScaled(percent);
  const den = 1_000_000n;
  const abs = num < 0n ? -num : num;
  const r = (abs + den / 2n) / den;
  return num < 0n ? -r : r;
}

export interface LineInput { unitPrice: string; quantity: number; discount?: string; taxPercent?: string }
export interface LineResult { net: string; tax: string; total: string }

/** Line amounts. Exclusive: tax added on top of the discounted net. Inclusive: tax extracted from the gross. */
export function computeLine(l: LineInput, taxInclusive = false): LineResult {
  if (!Number.isInteger(l.quantity) || l.quantity <= 0) throw new Error('Quantity must be a positive integer');
  const gross = parseMoney(l.unitPrice) * BigInt(l.quantity) - parseMoney(l.discount ?? '0');
  if (gross < 0n) throw new Error('Discount exceeds line amount');
  const pct = l.taxPercent ?? '0';
  if (taxInclusive) {
    const scaled = percentScaled(pct);
    const denom = 1_000_000n + scaled;
    const tax = (gross * scaled * 2n + denom) / (denom * 2n);
    return { net: formatMoney(gross - tax), tax: formatMoney(tax), total: formatMoney(gross) };
  }
  const tax = percentOf(gross, pct);
  return { net: formatMoney(gross), tax: formatMoney(tax), total: formatMoney(gross + tax) };
}
