import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseStakeArchive } from './stakeArchive';
import { ArchiveParseError } from '@/types';
import { archiveJson, rawBet } from '@/test/factory';

const SAMPLE = readFileSync(
  fileURLToPath(new URL('../test/fixtures/bet-archive.sample.json', import.meta.url)),
  'utf8',
);

describe('parseStakeArchive: reference archive', () => {
  const result = parseStakeArchive(SAMPLE);

  it('reads every record in the file', () => {
    expect(result.quality.totalRecords).toBe(224);
    expect(result.quality.validRecords + result.quality.excludedRecords).toBe(224);
  });

  it('excludes exactly the three rejected sportsbook records', () => {
    expect(result.quality.excludedRecords).toBe(3);
    expect(result.quality.byReason.rejected).toBe(3);
    expect(result.quality.byReason.cancelled).toBe(0);
    expect(result.quality.byReason.active).toBe(0);
    expect(result.quality.byReason.malformed).toBe(0);
    expect(result.bets).toHaveLength(221);
  });

  it('records why each exclusion happened', () => {
    for (const excluded of result.quality.excluded) {
      expect(excluded.reason).toBe('rejected');
      expect(excluded.status).toBe('rejectedNotFound');
      expect(excluded.detail).toMatch(/stake was returned/);
    }
  });

  it('identifies the games and the single currency', () => {
    expect(result.quality.games).toEqual(['crash', 'mines', 'plinko', 'sportsbook']);
    expect(result.quality.currencies).toEqual(['usdc']);
    expect(result.quality.unrecognisedGames).toEqual([]);
  });

  it('produces finite, non-negative amounts for every bet', () => {
    for (const bet of result.bets) {
      expect(Number.isFinite(bet.stake)).toBe(true);
      expect(Number.isFinite(bet.payout)).toBe(true);
      expect(Number.isFinite(bet.profit)).toBe(true);
      expect(bet.stake).toBeGreaterThanOrEqual(0);
      expect(bet.payout).toBeGreaterThanOrEqual(0);
      expect(bet.profit).toBeCloseTo(bet.payout - bet.stake, 12);
      expect(Number.isNaN(bet.placedAt.getTime())).toBe(false);
    }
  });

  it('sorts bets chronologically', () => {
    for (let i = 1; i < result.bets.length; i += 1) {
      expect(result.bets[i].timestamp).toBeGreaterThanOrEqual(result.bets[i - 1].timestamp);
    }
    expect(result.range).not.toBeNull();
    expect(result.range!.from.toISOString()).toBe('2026-01-28T05:01:32.501Z');
    expect(result.range!.to.toISOString()).toBe('2026-01-28T17:15:47.166Z');
  });

  it('parses sportsbook legs, odds and recorded probabilities', () => {
    const sportsbook = result.bets.filter((b) => b.category === 'sportsbook');
    expect(sportsbook).toHaveLength(26);

    const multi = sportsbook.find((b) => b.sportsbook!.legCount === 10);
    expect(multi).toBeDefined();
    expect(multi!.sportsbook!.legs).toHaveLength(10);
    expect(multi!.sportsbook!.isMulti).toBe(true);
    // potentialMultiplier equals the product of the leg odds.
    const product = multi!.sportsbook!.legs.reduce((acc, leg) => acc * (leg.odds ?? 1), 1);
    expect(multi!.sportsbook!.potentialMultiplier).toBeCloseTo(product, 6);
    expect(multi!.sportsbook!.combinedProbability).not.toBeNull();
  });

  it('parses crash rounds including bust state and cash-out target', () => {
    const crash = result.bets.filter((b) => b.game === 'crash');
    expect(crash).toHaveLength(14);
    expect(crash.filter((b) => b.crash!.busted)).toHaveLength(8);
    expect([...new Set(crash.map((b) => b.crash!.cashoutAt))].sort((a, b) => a! - b!)).toEqual([
      2, 20, 100, 2000,
    ]);
  });

  it('parses plinko risk, rows and path', () => {
    const plinko = result.bets.filter((b) => b.game === 'plinko');
    expect(plinko).toHaveLength(173);
    for (const bet of plinko) {
      expect(bet.plinko).toBeDefined();
      expect(bet.plinko!.path).toHaveLength(bet.plinko!.rows ?? 0);
      expect(['high', 'low']).toContain(bet.plinko!.risk);
    }
  });

  it('parses mines count and selections', () => {
    const mines = result.bets.filter((b) => b.game === 'mines');
    expect(mines).toHaveLength(8);
    for (const bet of mines) {
      expect(bet.mines!.minesCount).toBeGreaterThan(0);
      expect(bet.mines!.selections).toBeGreaterThan(0);
      expect(bet.mines!.minePositions).toHaveLength(bet.mines!.minesCount!);
    }
  });

  it('flags the zero-stake record in the data-quality notes', () => {
    expect(result.quality.notes.some((n) => n.includes('zero stake'))).toBe(true);
  });
});

describe('parseStakeArchive: malformed input', () => {
  it('rejects non-JSON', () => {
    expect(() => parseStakeArchive('not json at all')).toThrow(ArchiveParseError);
    expect(() => parseStakeArchive('not json at all')).toThrow(/isn't valid JSON/);
  });

  it('rejects JSON that is not a bet archive', () => {
    expect(() => parseStakeArchive('{"hello":"world"}')).toThrow(
      /WagerLens-compatible Stake betting archive/,
    );
    expect(() => parseStakeArchive('[{"foo":1},{"bar":2}]')).toThrow(
      /WagerLens-compatible Stake betting archive/,
    );
  });

  it('rejects an empty archive', () => {
    expect(() => parseStakeArchive('[]')).toThrow(/empty/);
  });

  it('accepts an object wrapper around the array', () => {
    const wrapped = JSON.stringify({ data: [JSON.parse(archiveJson([rawBet()]))[0]] });
    expect(parseStakeArchive(wrapped).bets).toHaveLength(1);
  });

  it('keeps good records when one record is malformed', () => {
    const json = archiveJson([
      rawBet({ amount: 1, payout: 2 }),
      null,
      'nonsense',
      { id: 'x', data: { gameName: 'plinko', amount: 'abc', payout: null, createdAt: 1 } },
      rawBet({ amount: 1, payout: 0 }),
    ]);
    const result = parseStakeArchive(json);
    expect(result.bets).toHaveLength(2);
    expect(result.quality.excludedRecords).toBe(3);
    expect(result.quality.byReason.malformed).toBe(2);
  });

  it('drops records without a usable timestamp', () => {
    const json = archiveJson([
      rawBet({ amount: 1, payout: 2 }),
      { id: 'no-date', created_at: 'not-a-date', data: { id: 'x', gameName: 'plinko', amount: 1, payout: 0, createdAt: 'nope' } },
    ]);
    const result = parseStakeArchive(json);
    expect(result.quality.byReason['unparseable-date']).toBe(1);
    expect(result.bets).toHaveLength(1);
  });

  it('drops negative amounts as invalid rather than booking them', () => {
    const json = archiveJson([rawBet({ amount: 1, payout: 2 }), rawBet({ amount: -5, payout: 0 })]);
    const result = parseStakeArchive(json);
    expect(result.quality.byReason['invalid-amounts']).toBe(1);
    expect(result.bets).toHaveLength(1);
  });

  it('excludes still-open bets', () => {
    const json = archiveJson([
      rawBet({ amount: 1, payout: 2 }),
      rawBet({ amount: 5, payout: 0, active: true }),
    ]);
    const result = parseStakeArchive(json);
    expect(result.quality.byReason.active).toBe(1);
    expect(result.bets).toHaveLength(1);
  });

  it('excludes cancelled and voided records alongside rejected ones', () => {
    const json = archiveJson([
      rawBet({ amount: 1, payout: 2 }),
      rawBet({ amount: 1, payout: 1, status: 'cancelled', gameName: 'sportsbook' }),
      rawBet({ amount: 1, payout: 1, status: 'voided', gameName: 'sportsbook' }),
      rawBet({ amount: 1, payout: 1, status: 'rejectedNotFound', gameName: 'sportsbook' }),
    ]);
    const result = parseStakeArchive(json);
    expect(result.quality.byReason.cancelled).toBe(2);
    expect(result.quality.byReason.rejected).toBe(1);
    expect(result.bets).toHaveLength(1);
  });

  it('recomputes the payout multiplier when the recorded one contradicts the amounts', () => {
    const json = archiveJson([
      rawBet({ amount: 2, payout: 5, payoutMultiplier: 99 }),
      rawBet({ amount: 0, payout: 0, payoutMultiplier: 0 }),
    ]);
    const [derived, zeroStake] = parseStakeArchive(json).bets;
    expect(derived.payoutMultiplier).toBeCloseTo(2.5, 12);
    // 0/0 is undefined, so the recorded multiplier is kept as-is rather than
    // becoming NaN. The reference archive has exactly one such record.
    expect(zeroStake.payoutMultiplier).toBe(0);
  });

  it('leaves the multiplier null when a zero-stake record records none either', () => {
    const json = archiveJson([
      { id: 'e', created_at: '2026-01-01T00:00:00.000Z', data: { id: 'b', type: 'casino', gameName: 'plinko', currency: 'usdc', amount: 0, payout: 0, active: false, createdAt: Date.UTC(2026, 0, 1) } },
    ]);
    const [bet] = parseStakeArchive(json).bets;
    expect(bet.payoutMultiplier).toBeNull();
  });

  it('accepts epoch seconds and ISO strings as timestamps', () => {
    const seconds = Math.floor(Date.UTC(2026, 2, 3, 9, 30) / 1000);
    const json = archiveJson([
      rawBet({ amount: 1, payout: 0, createdAt: seconds }),
      { id: 'iso', created_at: '2026-03-04T10:00:00.000Z', data: { id: 'iso', gameName: 'plinko', type: 'casino', amount: 1, payout: 0, createdAt: '2026-03-04T10:00:00.000Z' } },
    ]);
    const bets = parseStakeArchive(json).bets;
    expect(bets).toHaveLength(2);
    expect(bets[0].placedAt.toISOString()).toBe('2026-03-03T09:30:00.000Z');
    expect(bets[1].placedAt.toISOString()).toBe('2026-03-04T10:00:00.000Z');
  });

  it('classifies outcomes by realised profit, treating break-even as a push', () => {
    const json = archiveJson([
      rawBet({ amount: 1, payout: 3 }),
      rawBet({ amount: 1, payout: 0 }),
      rawBet({ amount: 1, payout: 1 }),
    ]);
    expect(parseStakeArchive(json).bets.map((b) => b.outcome)).toEqual(['win', 'loss', 'push']);
  });

  it('notes multiple currencies without combining them', () => {
    const json = archiveJson([
      rawBet({ amount: 1, payout: 2, currency: 'usdc' }),
      rawBet({ amount: 1, payout: 0, currency: 'btc' }),
    ]);
    const result = parseStakeArchive(json);
    expect(result.quality.currencies).toEqual(['btc', 'usdc']);
    expect(result.quality.notes.some((n) => n.includes('never converted'))).toBe(true);
  });

  it('parses unknown game types without losing them', () => {
    const json = archiveJson([rawBet({ amount: 1, payout: 2, gameName: 'dice' })]);
    const result = parseStakeArchive(json);
    expect(result.bets).toHaveLength(1);
    expect(result.bets[0].game).toBe('dice');
    expect(result.bets[0].gameLabel).toBe('Dice');
    expect(result.quality.unrecognisedGames).toEqual(['dice']);
  });
});
