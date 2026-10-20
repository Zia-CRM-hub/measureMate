/**
 * Deterministic measurement unit conversion using exact integer arithmetic.
 * Canonical storage unit is millimetres (decimal string, 3 dp). 1 cm = 10 mm and 1 in = 25.4 mm exactly.
 */
export type LengthUnit = 'cm' | 'in';

/** micro-millimetres (mm x 1e6) per one display unit */
const MICRO_MM_PER_UNIT: Record<LengthUnit, bigint> = { cm: 10_000_000n, in: 25_400_000n };

/** Parse a non-negative-or-negative decimal into an integer scaled by 1e6. */
function toScaled(value: string | number): bigint {
  const s = typeof value === 'number' ? value.toString() : value.trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new Error(`Invalid decimal: ${s}`);
  const neg = s.startsWith('-');
  const [i = '0', f = ''] = s.replace('-', '').split('.');
  const n = BigInt(i) * 1_000_000n + BigInt((f + '000000').slice(0, 6));
  return neg ? -n : n;
}

/** Render a 1e6-scaled integer with `decimals` places, rounding half away from zero. */
function fromScaled(n: bigint, decimals: number): string {
  const neg = n < 0n;
  let abs = neg ? -n : n;
  const div = 10n ** BigInt(6 - decimals);
  abs = (abs + div / 2n) / div;
  const s = abs.toString().padStart(decimals + 1, '0');
  const out = decimals ? `${s.slice(0, -decimals)}.${s.slice(-decimals)}` : s;
  return neg && abs !== 0n ? `-${out}` : out;
}

/** Convert an entered value to canonical millimetres (3 dp). */
export function toCanonicalMm(value: string | number, unit: LengthUnit): string {
  const mmX1e6 = (toScaled(value) * MICRO_MM_PER_UNIT[unit]) / 1_000_000n;
  return fromScaled(mmX1e6, 3);
}

/** Convert canonical millimetres to a display unit (default 2 dp). */
export function fromCanonicalMm(mm: string | number, unit: LengthUnit, decimals = 2): string {
  const out = (toScaled(mm) * 1_000_000n) / MICRO_MM_PER_UNIT[unit];
  return fromScaled(out, decimals);
}

/** Visible statement of how a value was converted, for UI and audit. */
export function describeConversion(value: string | number, unit: LengthUnit): string {
  return `${value} ${unit} = ${toCanonicalMm(value, unit)} mm (1 in = 25.4 mm, 1 cm = 10 mm)`;
}
