import { describe, expect, it } from 'vitest';
import {
  formatAmount,
  formatCount,
  formatMultiplier,
  formatPercent,
  formatSigned,
  formatSignedPercent,
  fromDateInputValue,
  makeAmountFormatter,
  toDateInputValue,
} from './format';

describe('makeAmountFormatter', () => {
  it('keeps the smallest non-zero stake legible alongside the largest total', () => {
    // The reference archive spans 0.00010879 to 12.71 USDC.
    const format = makeAmountFormatter([12.71113603, 8.03817056, -4.67296547, 0.00010879]);
    expect(format(12.71113603)).toBe('12.71114');
    // Five decimals, so the smallest stake survives at two significant digits
    // instead of rounding to 0.0000.
    expect(format(0.00010879)).toBe('0.00011');
  });

  it('uses one precision across the set so columns align', () => {
    const format = makeAmountFormatter([100, 0.5]);
    const widths = [format(100), format(0.5), format(12.25)].map((s) => s.split('.')[1].length);
    expect(new Set(widths).size).toBe(1);
  });

  it('never exceeds eight decimals however wide the range', () => {
    const format = makeAmountFormatter([1000, 0.000000001]);
    expect(format(1).split('.')[1].length).toBeLessThanOrEqual(8);
  });

  it('handles an all-zero and an empty set without producing NaN', () => {
    expect(makeAmountFormatter([])(0)).toBe('0.00');
    expect(makeAmountFormatter([0, 0])(0)).toBe('0.00');
    expect(makeAmountFormatter([1])(Number.NaN)).toBe('—');
    expect(makeAmountFormatter([1])(Number.POSITIVE_INFINITY)).toBe('—');
  });
});

describe('scalar formatters', () => {
  it('formats signed amounts with an explicit sign', () => {
    expect(formatSigned(1.5, (v) => v.toFixed(2))).toBe('+1.50');
    expect(formatSigned(-1.5, (v) => v.toFixed(2))).toBe('−1.50');
    expect(formatSigned(0, (v) => v.toFixed(2))).toBe('0.00');
  });

  it('renders null and non-finite values as an em dash rather than NaN', () => {
    expect(formatPercent(null)).toBe('—');
    expect(formatSignedPercent(null)).toBe('—');
    expect(formatMultiplier(null)).toBe('—');
    expect(formatMultiplier(undefined)).toBe('—');
    expect(formatPercent(Number.NaN)).toBe('—');
    expect(formatAmount(Number.POSITIVE_INFINITY)).toBe('—');
    expect(formatCount(Number.NaN)).toBe('—');
  });

  it('formats percentages and multipliers', () => {
    expect(formatPercent(27.6497, 2)).toBe('27.65%');
    expect(formatSignedPercent(-36.7627)).toBe('−36.8%');
    expect(formatSignedPercent(12.3)).toBe('+12.3%');
    expect(formatMultiplier(2)).toBe('2.00×');
  });
});

describe('date input round-trip', () => {
  it('converts a local date to an input value and back', () => {
    const date = new Date(2026, 0, 28);
    expect(toDateInputValue(date)).toBe('2026-01-28');
    expect(fromDateInputValue('2026-01-28')?.getTime()).toBe(date.getTime());
  });

  it('rejects values that are not yyyy-mm-dd', () => {
    expect(fromDateInputValue('')).toBeNull();
    expect(fromDateInputValue('28/01/2026')).toBeNull();
    expect(fromDateInputValue('not-a-date')).toBeNull();
    expect(fromDateInputValue('2026-01')).toBeNull();
  });
});
