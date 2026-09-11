import { describe, expect, it } from 'vitest';
import {
  convertBets,
  formatInr,
  isConvertible,
  missingRates,
  relativeAge,
  withManualRate,
  type RateTable,
} from './currency';
import { parseArchiveBundle } from '@/parsers/bundle';
import { archiveJson, rawBet } from '@/test/factory';
import { calculateOverview } from '@/analytics';

const table = (rates: Record<string, number>): RateTable => ({
  rates: { inr: 1, ...rates },
  fetchedAt: Date.now(),
  source: 'api',
  provider: 'test',
});

const bets = (records: unknown[]) =>
  parseArchiveBundle([{ id: 'f', name: 'f.json', size: 1, text: archiveJson(records) }]).bets;

describe('convertBets', () => {
  const rates = table({ usdc: 88, usdt: 87 });

  it('scales stake and payout by the rate', () => {
    const [bet] = convertBets(bets([rawBet({ amount: 2, payout: 5, currency: 'usdc' })]), rates).converted;
    expect(bet.stake).toBeCloseTo(176, 10);
    expect(bet.payout).toBeCloseTo(440, 10);
    expect(bet.currency).toBe('inr');
  });

  it('keeps profit exactly payout minus stake after conversion', () => {
    const converted = convertBets(
      bets([
        rawBet({ amount: 2, payout: 5, currency: 'usdc' }),
        rawBet({ amount: 3, payout: 0, currency: 'usdt' }),
      ]),
      rates,
    ).converted;
    for (const bet of converted) {
      expect(bet.profit).toBeCloseTo(bet.payout - bet.stake, 10);
    }
  });

  it('leaves the payout multiplier untouched, since a ratio is currency-free', () => {
    const source = bets([rawBet({ amount: 2, payout: 5, currency: 'usdc' })]);
    const [converted] = convertBets(source, rates).converted;
    expect(converted.payoutMultiplier).toBe(source[0].payoutMultiplier);
    expect(converted.payoutMultiplier).toBeCloseTo(2.5, 10);
  });

  it('preserves outcome classification through conversion', () => {
    const source = bets([
      rawBet({ amount: 1, payout: 3, currency: 'usdc' }),
      rawBet({ amount: 1, payout: 0, currency: 'usdc' }),
      rawBet({ amount: 1, payout: 1, currency: 'usdc' }),
    ]);
    const converted = convertBets(source, rates).converted;
    expect(converted.map((b) => b.outcome)).toEqual(source.map((b) => b.outcome));
    expect(converted.map((b) => b.outcome)).toEqual(['win', 'loss', 'push']);
  });

  it('passes INR bets through at face value', () => {
    const [bet] = convertBets(bets([rawBet({ amount: 500, payout: 750, currency: 'inr' })]), rates).converted;
    expect(bet.stake).toBe(500);
    expect(bet.payout).toBe(750);
  });

  it('combines several currencies into one comparable ledger', () => {
    const source = bets([
      rawBet({ id: 'a', amount: 100, payout: 150, currency: 'inr' }), // +50 INR
      rawBet({ id: 'b', amount: 1, payout: 3, currency: 'usdc' }), //   +176 INR
      rawBet({ id: 'c', amount: 1, payout: 0, currency: 'usdt' }), //   −87 INR
    ]);
    const { converted } = convertBets(source, rates);
    const overview = calculateOverview(converted, 'inr');

    expect(converted).toHaveLength(3);
    expect(overview.wagered).toBeCloseTo(100 + 88 + 87, 8);
    expect(overview.netPnl).toBeCloseTo(50 + 176 - 87, 8);
  });

  it('drops a currency with no rate rather than mixing it in at face value', () => {
    const source = bets([
      rawBet({ id: 'a', amount: 1, payout: 2, currency: 'usdc' }),
      rawBet({ id: 'b', amount: 1, payout: 2, currency: 'doge' }),
    ]);
    const { converted, unconvertible } = convertBets(source, rates);

    expect(converted).toHaveLength(1);
    expect(unconvertible).toHaveLength(1);
    expect(unconvertible[0].currency).toBe('doge');
    // The unpriced bet contributes nothing rather than adding 1 DOGE as 1 INR.
    expect(calculateOverview(converted, 'inr').wagered).toBeCloseTo(88, 10);
  });

  it('treats a zero, negative or non-finite rate as no rate at all', () => {
    const broken = table({ usdc: 0, usdt: -5, btc: Number.NaN });
    const source = bets([
      rawBet({ id: 'a', amount: 1, payout: 2, currency: 'usdc' }),
      rawBet({ id: 'b', amount: 1, payout: 2, currency: 'usdt' }),
      rawBet({ id: 'c', amount: 1, payout: 2, currency: 'btc' }),
    ]);
    const { converted, unconvertible } = convertBets(source, broken);
    expect(converted).toHaveLength(0);
    expect(unconvertible).toHaveLength(3);
  });

  it('does not mutate the source bets, so switching conversion off restores them', () => {
    const source = bets([rawBet({ amount: 2, payout: 5, currency: 'usdc' })]);
    const before = { ...source[0] };
    convertBets(source, rates);
    expect(source[0].stake).toBe(before.stake);
    expect(source[0].payout).toBe(before.payout);
    expect(source[0].currency).toBe('usdc');
  });

  it('keeps provenance so a converted view can still be split by file', () => {
    const source = bets([rawBet({ amount: 1, payout: 2, currency: 'usdc' })]);
    const [converted] = convertBets(source, rates).converted;
    expect(converted.sourceFileName).toBe('f.json');
    expect(converted.raw).toBe(source[0].raw);
  });
});

describe('rate table helpers', () => {
  it('knows which currencies it can price', () => {
    expect(isConvertible('usdc')).toBe(true);
    expect(isConvertible('USDT')).toBe(true);
    expect(isConvertible('inr')).toBe(true);
    expect(isConvertible('btc')).toBe(true);
    expect(isConvertible('usd')).toBe(true);
    expect(isConvertible('notacoin')).toBe(false);
  });

  it('lists codes a table cannot convert', () => {
    expect(missingRates(['usdc', 'doge', 'inr'], table({ usdc: 88 }))).toEqual(['doge']);
    expect(missingRates(['usdc'], null)).toEqual(['usdc']);
    // INR needs no rate against itself.
    expect(missingRates(['inr'], null)).toEqual([]);
  });

  it('lets a hand-entered rate stand in for a missing one', () => {
    const manual = withManualRate(null, 'usdc', 88.5);
    expect(manual.rates.usdc).toBe(88.5);
    expect(manual.rates.inr).toBe(1);
    expect(manual.source).toBe('manual');
    expect(missingRates(['usdc'], manual)).toEqual([]);
  });

  it('marks a table as mixed once a manual rate joins fetched ones', () => {
    const merged = withManualRate(table({ usdc: 88 }), 'doge', 12);
    expect(merged.source).toBe('mixed');
    expect(merged.rates.usdc).toBe(88);
    expect(merged.rates.doge).toBe(12);
  });
});

describe('presentation helpers', () => {
  it('formats INR with the rupee symbol and Indian grouping', () => {
    // 12,34,567.89 — lakh/crore grouping, not thousands.
    expect(formatInr(1234567.89)).toBe('₹12,34,567.89');
    expect(formatInr(1000)).toBe('₹1,000.00');
    expect(formatInr(Number.NaN)).toBe('—');
  });

  it('describes rate freshness in plain words', () => {
    const now = Date.UTC(2026, 0, 1, 12, 0, 0);
    expect(relativeAge(now - 30_000, now)).toBe('just now');
    expect(relativeAge(now - 5 * 60_000, now)).toBe('5 minutes ago');
    expect(relativeAge(now - 3 * 3600_000, now)).toBe('3 hours ago');
    expect(relativeAge(now - 2 * 86_400_000, now)).toBe('2 days ago');
  });
});
