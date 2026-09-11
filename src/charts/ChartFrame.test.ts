import { describe, expect, it } from 'vitest';
import { axisWidthFor, evenTimeTicks, makeAxisFormatter, makeTimeTickFormatter } from './ChartFrame';

describe('makeAxisFormatter', () => {
  it('compacts large values so labels fit the gutter', () => {
    const f = makeAxisFormatter([46132, -27025, 0]);
    expect(f(28500)).toBe('28.5k');
    expect(f(-28500)).toBe('−28.5k');
    expect(f(0)).toBe('0');
    expect(f(2_400_000)).toBe('2.4M');
  });

  it('keeps small crypto amounts readable', () => {
    const f = makeAxisFormatter([4.6, -5.1]);
    expect(f(2)).toBe('2.00');
    expect(f(-2)).toBe('−2.00');
  });

  it('gives tiny values enough decimals to be distinguishable', () => {
    const f = makeAxisFormatter([0.004, -0.002]);
    expect(f(0.002)).toBe('0.00200');
  });

  it('renders nothing for a non-finite tick rather than NaN', () => {
    expect(makeAxisFormatter([1])(Number.NaN)).toBe('');
  });
});

describe('axisWidthFor', () => {
  it('widens the gutter for longer labels', () => {
    const small = makeAxisFormatter([4.6]);
    const large = makeAxisFormatter([2_400_000]);
    const narrow = axisWidthFor([4.6, -5.1], small);
    const wide = axisWidthFor([2_400_000, -2_400_000], large);
    expect(wide).toBeGreaterThanOrEqual(narrow);
    expect(narrow).toBeGreaterThanOrEqual(44);
    expect(wide).toBeLessThanOrEqual(96);
  });

  it('leaves room for a negative compact label, which was previously clipped', () => {
    // '−28.5k' measures ~59px of text; a gutter narrower than that ate the
    // leading minus sign.
    const format = makeAxisFormatter([-28496, 9500]);
    expect(format(-28500)).toBe('−28.5k');
    expect(axisWidthFor([-28496, 9500], format)).toBeGreaterThanOrEqual(59);
  });

  it('allows a character of headroom for ticks rounded past the data', () => {
    // 9.8k of data can produce a 10.0k tick — one character longer.
    const format = makeAxisFormatter([9800]);
    const width = axisWidthFor([9800], format);
    expect(width).toBeGreaterThan(format(9800).length * 10);
  });
});

describe('makeTimeTickFormatter', () => {
  it('shows clock time for a short span and dates for a long one', () => {
    const t = Date.UTC(2026, 0, 28, 14, 30);
    expect(makeTimeTickFormatter(6 * 3600_000)(t)).toMatch(/^\d{2}:\d{2}$/);
    expect(makeTimeTickFormatter(30 * 86_400_000)(t)).toMatch(/Jan/);
    expect(makeTimeTickFormatter(800 * 86_400_000)(t)).toMatch(/26/);
  });
});

describe('evenTimeTicks', () => {
  it('spaces ticks evenly across the domain', () => {
    const ticks = evenTimeTicks(0, 1000, 6);
    expect(ticks).toEqual([0, 200, 400, 600, 800, 1000]);
  });

  it('returns a single tick when every point shares a timestamp', () => {
    expect(evenTimeTicks(500, 500)).toEqual([500]);
  });

  it('is independent of how the data clusters', () => {
    // The bug this guards: hundreds of bets inside one minute previously
    // produced one tick per bet, all drawn on top of each other.
    const start = Date.UTC(2026, 0, 28, 5, 0);
    const end = Date.UTC(2026, 0, 28, 17, 0);
    expect(evenTimeTicks(start, end, 6)).toHaveLength(6);
    expect(evenTimeTicks(start, end, 6)[0]).toBe(start);
    expect(evenTimeTicks(start, end, 6)[5]).toBe(end);
  });

  it('never returns fewer than two ticks for a real range', () => {
    expect(evenTimeTicks(0, 10, 1)).toHaveLength(2);
  });

  it('ignores a non-finite domain rather than emitting NaN ticks', () => {
    expect(evenTimeTicks(Number.NaN, 10)).toEqual([]);
    expect(evenTimeTicks(0, Number.POSITIVE_INFINITY)).toEqual([]);
  });
});
