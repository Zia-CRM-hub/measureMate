import { toCanonicalMm, fromCanonicalMm, describeConversion } from './units';
import { computeLine, parseMoney, formatMoney, percentOf } from './money';
import { canTransition } from './workflow';

describe('units', () => {
  it('converts inches to canonical mm exactly', () => {
    expect(toCanonicalMm('1', 'in')).toBe('25.400');
    expect(toCanonicalMm('15.5', 'in')).toBe('393.700');
    expect(toCanonicalMm('40', 'cm')).toBe('400.000');
  });
  it('round-trips display values', () => {
    expect(fromCanonicalMm('393.700', 'in')).toBe('15.50');
    expect(fromCanonicalMm('400.000', 'cm', 1)).toBe('40.0');
  });
  it('describes the conversion visibly', () => {
    expect(describeConversion('2', 'in')).toContain('50.800 mm');
  });
  it('rejects invalid input', () => {
    expect(() => toCanonicalMm('abc', 'cm')).toThrow();
  });
});

describe('money', () => {
  it('has no float drift', () => {
    expect(formatMoney(parseMoney('0.10') + parseMoney('0.20'))).toBe('0.30');
  });
  it('computes exclusive tax lines with half-up rounding', () => {
    expect(computeLine({ unitPrice: '1000.00', quantity: 2, discount: '100.00', taxPercent: '5' })).toEqual({
      net: '1900.00', tax: '95.00', total: '1995.00',
    });
    expect(percentOf(parseMoney('0.50'), '5')).toBe(3n);
  });
  it('extracts inclusive tax', () => {
    expect(computeLine({ unitPrice: '118.00', quantity: 1, taxPercent: '18' }, true)).toEqual({
      net: '100.00', tax: '18.00', total: '118.00',
    });
  });
});

describe('workflow', () => {
  it('blocks illegal transitions', () => {
    expect(canTransition('DRAFT', 'CUTTING')).toBe(false);
    expect(canTransition('CANCELLED', 'CONFIRMED')).toBe(false);
    expect(canTransition('CUTTING', 'STITCHING')).toBe(true);
  });
});
