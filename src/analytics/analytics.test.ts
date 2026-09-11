import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseStakeArchive } from '@/parsers/stakeArchive';
import { archiveJson, rawBet } from '@/test/factory';
import {
  buildEquityCurve,
  buildStakeBuckets,
  calculateCrashStats,
  calculateDrawdown,
  calculateMinesStats,
  calculateOverview,
  calculatePlinkoStats,
  calculateROI,
  calculateSportsbookStats,
  calculateStreaks,
  calculateTimeStats,
  calculateWinRate,
  groupByDate,
  groupByGame,
  groupByHour,
  groupByOddsRange,
  groupByStakeRange,
  groupByWeekday,
  periodKey,
} from './index';
import type { BetRecord } from '@/types';

const SAMPLE = readFileSync(
  fileURLToPath(new URL('../test/fixtures/bet-archive.sample.json', import.meta.url)),
  'utf8',
);
const sample = parseStakeArchive(SAMPLE);
const bets = sample.bets;

/** Builds normalised bets straight from synthetic archive JSON. */
const build = (records: unknown[]): BetRecord[] => parseStakeArchive(archiveJson(records)).bets;

describe('calculateROI', () => {
  it('computes profit over stake as a percentage', () => {
    expect(calculateROI(100, 25)).toBeCloseTo(25, 12);
    expect(calculateROI(100, -40)).toBeCloseTo(-40, 12);
  });

  it('is null rather than Infinity when nothing was wagered', () => {
    expect(calculateROI(0, 5)).toBeNull();
    expect(calculateROI(0, 0)).toBeNull();
    expect(calculateROI(-1, 5)).toBeNull();
  });
});

describe('calculateWinRate', () => {
  it('counts wins against decided bets', () => {
    expect(calculateWinRate(3, 1)).toBeCloseTo(75, 12);
    expect(calculateWinRate(0, 4)).toBe(0);
  });

  it('is null when no bet was decided', () => {
    expect(calculateWinRate(0, 0)).toBeNull();
  });
});

describe('calculateOverview — reference archive', () => {
  const overview = calculateOverview(bets, 'usdc');

  it('totals wagered, returned and P&L from completed bets only', () => {
    expect(overview.bets).toBe(221);
    expect(overview.wagered).toBeCloseTo(12.71113603, 8);
    expect(overview.returned).toBeCloseTo(8.03817056, 8);
    expect(overview.netPnl).toBeCloseTo(-4.67296547, 8);
  });

  it('derives ROI from those totals', () => {
    expect(overview.roi).toBeCloseTo(-36.762768, 5);
  });

  it('excludes the rejected stakes from both sides of the ledger', () => {
    // The three rejected records carry payout === amount. Counting them would
    // add 0.68641106 to wagered and the same to returned, leaving P&L intact
    // but distorting ROI, bet count, average stake and win rate.
    const rejectedStake = 0.21834304 + 0.25056718 + 0.21750084;
    const withRejected = overview.wagered + rejectedStake;
    expect(withRejected).toBeGreaterThan(overview.wagered);
    expect(overview.roi).not.toBeCloseTo((overview.netPnl / withRejected) * 100, 6);
  });

  it('counts wins, losses and pushes, keeping pushes out of the win rate', () => {
    expect(overview.wins).toBe(60);
    expect(overview.losses).toBe(157);
    expect(overview.pushes).toBe(4);
    expect(overview.wins + overview.losses + overview.pushes).toBe(overview.bets);
    expect(overview.winRate).toBeCloseTo(27.64977, 4);
  });

  it('reports stake sizing and extremes', () => {
    expect(overview.averageStake).toBeCloseTo(12.71113603 / 221, 10);
    expect(overview.largestWin).toBeCloseTo(0.46379047, 8);
    expect(overview.largestLoss).toBeCloseTo(-1.0904953, 7);
    expect(overview.maxDrawdown).toBeCloseTo(5.13688012, 7);
  });

  it('produces no NaN or Infinity anywhere in the result', () => {
    for (const [key, value] of Object.entries(overview)) {
      if (typeof value === 'number') {
        expect(Number.isFinite(value), `${key} is not finite`).toBe(true);
      }
    }
  });
});

describe('calculateOverview — edge cases', () => {
  it('handles an empty set without dividing by zero', () => {
    const overview = calculateOverview([], 'usdc');
    expect(overview.bets).toBe(0);
    expect(overview.wagered).toBe(0);
    expect(overview.roi).toBeNull();
    expect(overview.winRate).toBeNull();
    expect(overview.averageStake).toBeNull();
    expect(overview.medianStake).toBeNull();
    expect(overview.maxDrawdown).toBe(0);
  });

  it('reports ROI as null when every stake is zero', () => {
    const overview = calculateOverview(build([rawBet({ amount: 0, payout: 0 })]), 'usdc');
    expect(overview.bets).toBe(1);
    expect(overview.roi).toBeNull();
    expect(overview.pushes).toBe(1);
    expect(overview.winRate).toBeNull();
  });

  it('computes an exact ledger for a hand-checked set', () => {
    const overview = calculateOverview(
      build([
        rawBet({ amount: 10, payout: 25 }), // +15
        rawBet({ amount: 10, payout: 0 }), // −10
        rawBet({ amount: 5, payout: 5 }), // push
        rawBet({ amount: 20, payout: 8 }), // −12
      ]),
      'usdc',
    );
    expect(overview.wagered).toBe(45);
    expect(overview.returned).toBe(38);
    expect(overview.netPnl).toBe(-7);
    expect(overview.roi).toBeCloseTo((-7 / 45) * 100, 12);
    expect(overview.wins).toBe(1);
    expect(overview.losses).toBe(2);
    expect(overview.pushes).toBe(1);
    expect(overview.winRate).toBeCloseTo(33.3333333, 6);
    expect(overview.averageStake).toBeCloseTo(11.25, 12);
    expect(overview.medianStake).toBe(10);
  });
});

describe('buildEquityCurve', () => {
  it('accumulates P&L and tracks the running peak', () => {
    const curve = buildEquityCurve(
      build([
        rawBet({ amount: 10, payout: 30 }), // +20 → cum 20, peak 20
        rawBet({ amount: 10, payout: 0 }), // −10 → cum 10, dd 10
        rawBet({ amount: 10, payout: 0 }), // −10 → cum 0,  dd 20
      ]),
    );
    expect(curve.map((p) => p.cumulative)).toEqual([20, 10, 0]);
    expect(curve.map((p) => p.peak)).toEqual([20, 20, 20]);
    expect(curve.map((p) => p.drawdown)).toEqual([0, 10, 20]);
    expect(curve.map((p) => p.wagered)).toEqual([10, 20, 30]);
  });

  it('ends at the same P&L the overview reports', () => {
    const curve = buildEquityCurve(bets);
    expect(curve).toHaveLength(bets.length);
    expect(curve[curve.length - 1].cumulative).toBeCloseTo(calculateOverview(bets, 'usdc').netPnl, 10);
  });
});

describe('calculateDrawdown', () => {
  it('finds the deepest peak-to-trough fall and its recovery', () => {
    const dd = calculateDrawdown(
      build([
        rawBet({ amount: 10, payout: 30 }), // +20  cum 20 (peak)
        rawBet({ amount: 10, payout: 0 }), // −10  cum 10
        rawBet({ amount: 10, payout: 0 }), // −10  cum 0   (trough, dd 20)
        rawBet({ amount: 10, payout: 40 }), // +30  cum 30  (recovered)
      ]),
    );
    expect(dd.peak).toBe(30);
    expect(dd.maxDrawdown).toBe(20);
    // 40 staked across the four bets, so a 20 fall is half of it.
    expect(dd.maxDrawdownVsWagered).toBeCloseTo(50, 12);
    expect(dd.maxDrawdownAt).not.toBeNull();
    expect(dd.recoveredAt).not.toBeNull();
    expect(dd.recoveryMs).toBeGreaterThan(0);
    expect(dd.atPeak).toBe(true);
    expect(dd.currentDrawdown).toBe(0);
  });

  it('reports no recovery when the curve never regains its peak', () => {
    const dd = calculateDrawdown(
      build([
        rawBet({ amount: 10, payout: 30 }), // cum 20
        rawBet({ amount: 10, payout: 0 }), // cum 10
      ]),
    );
    expect(dd.maxDrawdown).toBe(10);
    expect(dd.recoveredAt).toBeNull();
    expect(dd.recoveryMs).toBeNull();
    expect(dd.atPeak).toBe(false);
    expect(dd.currentDrawdown).toBe(10);
  });

  it('measures from zero for an account never in profit', () => {
    const dd = calculateDrawdown(build([rawBet({ amount: 10, payout: 0 }), rawBet({ amount: 5, payout: 0 })]));
    expect(dd.peak).toBe(0);
    expect(dd.maxDrawdown).toBe(15);
    // Measured against wagered, not against the (zero) peak — so it stays a
    // real number instead of dividing by zero.
    expect(dd.maxDrawdownVsWagered).toBeCloseTo(100, 12);
  });

  it('returns a neutral result for an empty set', () => {
    const dd = calculateDrawdown([]);
    expect(dd.maxDrawdown).toBe(0);
    expect(dd.peakAt).toBeNull();
    expect(dd.atPeak).toBe(true);
  });

  it('reports drawdown against wagered rather than against a near-zero peak', () => {
    // The reference archive peaks at +0.46 then falls 5.14. Against the peak
    // that would read 1107%, which is arithmetically true and useless; against
    // the 12.71 wagered it reads 40.4%, which is a figure with a meaning.
    const dd = calculateDrawdown(bets);
    expect(dd.maxDrawdownVsWagered).toBeCloseTo(40.4, 1);
  });

  it('matches the reference archive', () => {
    const dd = calculateDrawdown(bets);
    expect(dd.peak).toBeCloseTo(0.46391465, 7);
    expect(dd.maxDrawdown).toBeCloseTo(5.13688012, 7);
    expect(dd.atPeak).toBe(false);
  });
});

describe('calculateStreaks', () => {
  it('finds the longest runs and the run in progress', () => {
    const streaks = calculateStreaks(
      build([
        rawBet({ amount: 1, payout: 2 }), // W
        rawBet({ amount: 1, payout: 2 }), // W
        rawBet({ amount: 1, payout: 0 }), // L
        rawBet({ amount: 1, payout: 0 }), // L
        rawBet({ amount: 1, payout: 0 }), // L
        rawBet({ amount: 1, payout: 2 }), // W
      ]),
    );
    expect(streaks.longestWinStreak).toBe(2);
    expect(streaks.longestLossStreak).toBe(3);
    expect(streaks.currentStreak).toBe(1);
    expect(streaks.currentStreakType).toBe('win');
    expect(streaks.winStreakCount).toBe(2);
    expect(streaks.lossStreakCount).toBe(1);
    expect(streaks.averageWinStreak).toBeCloseTo(1.5, 12);
    expect(streaks.averageLossStreak).toBe(3);
  });

  it('treats a push as transparent — it neither breaks nor extends a run', () => {
    const streaks = calculateStreaks(
      build([
        rawBet({ amount: 1, payout: 0 }), // L
        rawBet({ amount: 1, payout: 1 }), // push
        rawBet({ amount: 1, payout: 0 }), // L
      ]),
    );
    expect(streaks.longestLossStreak).toBe(2);
    expect(streaks.runs).toHaveLength(1);
  });

  it('reports a losing run in progress with a negative sign', () => {
    const streaks = calculateStreaks(build([rawBet({ amount: 1, payout: 2 }), rawBet({ amount: 1, payout: 0 }), rawBet({ amount: 1, payout: 0 })]));
    expect(streaks.currentStreak).toBe(-2);
    expect(streaks.currentStreakType).toBe('loss');
  });

  it('handles an empty set', () => {
    const streaks = calculateStreaks([]);
    expect(streaks.currentStreak).toBe(0);
    expect(streaks.currentStreakType).toBe('none');
    expect(streaks.longestWinStreak).toBe(0);
    expect(streaks.averageWinStreak).toBeNull();
  });

  it('matches the reference archive', () => {
    const streaks = calculateStreaks(bets);
    expect(streaks.longestWinStreak).toBe(3);
    expect(streaks.longestLossStreak).toBe(25);
    expect(streaks.currentStreak).toBe(-4);
  });
});

describe('groupByGame', () => {
  const groups = groupByGame(bets);

  it('splits the reference archive into its four games', () => {
    expect(groups.map((g) => g.key)).toEqual(['sportsbook', 'crash', 'mines', 'plinko']);
  });

  it('reconciles each group back to the archive totals', () => {
    const overview = calculateOverview(bets, 'usdc');
    expect(groups.reduce((s, g) => s + g.bets, 0)).toBe(overview.bets);
    expect(groups.reduce((s, g) => s + g.wagered, 0)).toBeCloseTo(overview.wagered, 10);
    expect(groups.reduce((s, g) => s + g.netPnl, 0)).toBeCloseTo(overview.netPnl, 10);
    expect(groups.reduce((s, g) => s + g.shareOfWagered, 0)).toBeCloseTo(100, 8);
  });

  it('computes per-game figures correctly', () => {
    const sportsbook = groups.find((g) => g.key === 'sportsbook')!;
    expect(sportsbook.bets).toBe(26);
    expect(sportsbook.wagered).toBeCloseTo(10.62275218, 8);
    expect(sportsbook.netPnl).toBeCloseTo(-4.9800453, 7);
    expect(sportsbook.roi).toBeCloseTo(-46.881, 3);

    const crash = groups.find((g) => g.key === 'crash')!;
    expect(crash.bets).toBe(14);
    expect(crash.roi).toBeCloseTo(23.997, 3);
  });

  it('labels groups for display', () => {
    expect(groups.find((g) => g.key === 'plinko')!.label).toBe('Plinko');
  });
});

describe('groupByOddsRange', () => {
  it('buckets sportsbook bets by the multiplier they would pay at', () => {
    const rows = groupByOddsRange(bets);
    expect(rows.map((r) => r.key)).toEqual(['lt150', '150-200', '200-300', 'gte300']);
    expect(rows.reduce((s, r) => s + r.bets, 0)).toBe(26);
    for (const row of rows) {
      expect(row.wins + row.losses + row.pushes).toBe(row.bets);
      if (row.wagered > 0) expect(Number.isFinite(row.roi!)).toBe(true);
    }
  });

  it('places bets at the documented bucket boundaries', () => {
    const leg = (odds: number) => ({
      gameName: 'sportsbook',
      extra: {
        potentialMultiplier: odds,
        system: 1,
        outcomes: [{ odds, probabilities: 1 / odds, cancel: false }],
      },
    });
    const rows = groupByOddsRange(
      build([
        rawBet({ amount: 1, payout: 0, status: 'settled', ...leg(1.49) }),
        rawBet({ amount: 1, payout: 0, status: 'settled', ...leg(1.5) }),
        rawBet({ amount: 1, payout: 0, status: 'settled', ...leg(2.0) }),
        rawBet({ amount: 1, payout: 0, status: 'settled', ...leg(3.0) }),
      ]),
    );
    expect(Object.fromEntries(rows.map((r) => [r.key, r.bets]))).toEqual({
      lt150: 1,
      '150-200': 1,
      '200-300': 1,
      gte300: 1,
    });
  });

  it('ignores bets with no odds rather than bucketing them at zero', () => {
    expect(groupByOddsRange(build([rawBet({ amount: 1, payout: 0, gameName: 'plinko' })]))).toEqual([]);
  });
});

describe('groupByStakeRange', () => {
  it('derives buckets from the observed stakes', () => {
    const buckets = buildStakeBuckets(bets);
    expect(buckets.length).toBeGreaterThan(1);
    const rows = groupByStakeRange(bets);
    // Every non-zero-stake bet lands in exactly one bucket.
    expect(rows.reduce((s, r) => s + r.bets, 0)).toBe(bets.filter((b) => b.stake > 0).length);
  });

  it('returns nothing when there are no positive stakes', () => {
    expect(buildStakeBuckets([])).toEqual([]);
    expect(groupByStakeRange([])).toEqual([]);
  });
});

describe('groupByDate', () => {
  it('buckets by calendar period and carries a running cumulative P&L', () => {
    const rows = groupByDate(bets, 'day');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.reduce((s, r) => s + r.bets, 0)).toBe(bets.length);
    expect(rows[rows.length - 1].cumulative).toBeCloseTo(calculateOverview(bets, 'usdc').netPnl, 10);
  });

  it('produces coarser buckets at week and month granularity', () => {
    const days = groupByDate(bets, 'day').length;
    expect(groupByDate(bets, 'week').length).toBeLessThanOrEqual(days);
    expect(groupByDate(bets, 'month').length).toBeLessThanOrEqual(days);
  });

  it('keys weeks to the preceding Monday', () => {
    // 2026-01-28 is a Wednesday; its week key is Monday 2026-01-26.
    const wednesday = new Date(2026, 0, 28, 15, 0, 0).getTime();
    expect(periodKey(wednesday, 'week')).toBe('2026-01-26');
    expect(periodKey(wednesday, 'day')).toBe('2026-01-28');
    expect(periodKey(wednesday, 'month')).toBe('2026-01');
  });
});

describe('time analytics', () => {
  it('returns a full 24-hour and 7-day grid even where there is no activity', () => {
    expect(groupByHour(bets)).toHaveLength(24);
    expect(groupByWeekday(bets)).toHaveLength(7);
    expect(groupByHour(bets).reduce((s, h) => s + h.bets, 0)).toBe(bets.length);
    expect(groupByWeekday(bets).reduce((s, d) => s + d.bets, 0)).toBe(bets.length);
  });

  it('starts the weekday grid on Monday', () => {
    expect(groupByWeekday(bets)[0].label).toBe('Monday');
    expect(groupByWeekday(bets)[6].label).toBe('Sunday');
  });

  it('summarises cadence', () => {
    const stats = calculateTimeStats(bets);
    expect(stats.activeDays).toBeGreaterThan(0);
    expect(stats.spanDays).toBeGreaterThanOrEqual(stats.activeDays);
    expect(stats.averageGapMs).toBeGreaterThan(0);
    expect(stats.medianGapMs).toBeGreaterThan(0);
    expect(stats.mostActiveHour).not.toBeNull();
    expect(stats.betsPerActiveDay).toBeGreaterThan(0);
  });

  it('handles an empty set', () => {
    const stats = calculateTimeStats([]);
    expect(stats.activeDays).toBe(0);
    expect(stats.averageGapMs).toBeNull();
    expect(stats.mostActiveHour).toBeNull();
  });
});

describe('calculateSportsbookStats', () => {
  const stats = calculateSportsbookStats(bets);

  it('summarises only sportsbook bets', () => {
    expect(stats.bets).toBe(26);
    expect(stats.wagered).toBeCloseTo(10.62275218, 8);
    expect(stats.roi).toBeCloseTo(-46.881, 3);
  });

  it('separates singles from multis', () => {
    expect(stats.singles.bets + stats.multis.bets).toBe(stats.bets);
    expect(stats.multis.bets).toBe(2);
    expect(stats.byLegCount.map((r) => r.key)).toEqual(['1', '8', '10']);
  });

  it('reports odds statistics from the recorded multipliers', () => {
    expect(stats.averageOdds).toBeGreaterThan(1);
    expect(stats.highestOdds).toBeCloseTo(11, 6);
    expect(stats.weightedAverageOdds).toBeGreaterThan(1);
  });

  it('builds a calibration table from the recorded probability field', () => {
    expect(stats.hasProbabilityData).toBe(true);
    expect(stats.calibration.length).toBeGreaterThan(0);
    for (const row of stats.calibration) {
      expect(row.bets).toBeGreaterThan(0);
      expect(row.recordedProbability).toBeGreaterThanOrEqual(0);
      expect(row.recordedProbability).toBeLessThanOrEqual(100);
      if (row.actualWinRate !== null) {
        expect(row.actualWinRate).toBeGreaterThanOrEqual(0);
        expect(row.actualWinRate).toBeLessThanOrEqual(100);
      }
    }
    expect(stats.calibration.reduce((s, r) => s + r.bets, 0)).toBe(26);
  });

  it('counts cash-outs and distinct fixtures', () => {
    expect(stats.cashouts).toBe(1);
    expect(stats.distinctFixtures).toBeGreaterThan(0);
  });

  it('returns an empty summary when there are no sportsbook bets', () => {
    const empty = calculateSportsbookStats(bets.filter((b) => b.game === 'plinko'));
    expect(empty.bets).toBe(0);
    expect(empty.roi).toBeNull();
    expect(empty.averageOdds).toBeNull();
    expect(empty.hasProbabilityData).toBe(false);
  });
});

describe('calculateCrashStats', () => {
  const stats = calculateCrashStats(bets);

  it('summarises crash rounds', () => {
    expect(stats.bets).toBe(14);
    expect(stats.wagered).toBeCloseTo(1.12032331, 8);
    expect(stats.roi).toBeCloseTo(23.997, 3);
  });

  it('counts busts and derives the bust rate', () => {
    expect(stats.busts).toBe(8);
    expect(stats.bustRate).toBeCloseTo((8 / 14) * 100, 8);
  });

  it('builds one row per cash-out target actually present in the data', () => {
    expect(stats.byTarget.map((r) => r.target)).toEqual([2, 20, 100, 2000]);
    for (const row of stats.byTarget) {
      expect(row.successes).toBeLessThanOrEqual(row.bets);
      expect(row.successRate).toBeGreaterThanOrEqual(0);
      expect(row.successRate).toBeLessThanOrEqual(100);
    }
    // Ten rounds were set to 2×; six of them returned above stake (five
    // auto-cash-outs plus one manual stop at 1.56×).
    const twoX = stats.byTarget.find((r) => r.target === 2)!;
    expect(twoX.bets).toBe(10);
    expect(twoX.successes).toBe(6);
  });

  it('reports multiplier statistics and the raw result breakdown', () => {
    expect(stats.highestMultiplier).toBe(2);
    expect(stats.averagePayoutMultiplier).toBeGreaterThan(0);
    expect(stats.averageWinningMultiplier).toBeGreaterThan(1);
    expect(stats.resultBreakdown.map((r) => r.result).sort()).toEqual([
      'autocashout',
      'busted',
      'stopped',
    ]);
    expect(stats.resultBreakdown.reduce((s, r) => s + r.count, 0)).toBe(14);
  });

  it('returns an empty summary when there are no crash rounds', () => {
    const empty = calculateCrashStats(bets.filter((b) => b.game === 'plinko'));
    expect(empty.bets).toBe(0);
    expect(empty.bustRate).toBeNull();
    expect(empty.byTarget).toEqual([]);
  });
});

describe('calculatePlinkoStats', () => {
  const stats = calculatePlinkoStats(bets);

  it('summarises plinko drops', () => {
    expect(stats.bets).toBe(173);
    expect(stats.roi).toBeCloseTo(-0.08, 2);
  });

  it('groups by risk and by row count', () => {
    expect(stats.byRisk.map((r) => r.key).sort()).toEqual(['high', 'low']);
    expect(stats.byRisk.reduce((s, r) => s + r.bets, 0)).toBe(173);
    expect(stats.byRows.map((r) => r.key)).toEqual(['16']);
  });

  it('builds a multiplier distribution that accounts for every drop', () => {
    expect(stats.multiplierDistribution.reduce((s, b) => s + b.count, 0)).toBe(173);
    expect(stats.multiplierDistribution.reduce((s, b) => s + b.share, 0)).toBeCloseTo(100, 8);
    // Sorted highest multiplier first.
    for (let i = 1; i < stats.multiplierDistribution.length; i += 1) {
      expect(stats.multiplierDistribution[i].multiplier).toBeLessThan(
        stats.multiplierDistribution[i - 1].multiplier,
      );
    }
    expect(stats.highestMultiplier).toBe(9);
  });

  it('reports how often a drop returned less than its stake', () => {
    expect(stats.belowStakeRate).toBeGreaterThan(0);
    expect(stats.belowStakeRate).toBeLessThanOrEqual(100);
  });
});

describe('calculateMinesStats', () => {
  const stats = calculateMinesStats(bets);

  it('summarises mines rounds', () => {
    expect(stats.bets).toBe(8);
    expect(stats.wagered).toBeCloseTo(0.61944239, 8);
    expect(stats.roi).toBeCloseTo(6.218, 3);
  });

  it('groups by mine count and by tiles revealed', () => {
    expect(stats.byMineCount.map((r) => r.key)).toEqual(['1', '3']);
    expect(stats.byMineCount.reduce((s, r) => s + r.bets, 0)).toBe(8);
    expect(stats.bySelections.map((r) => r.key)).toEqual(['3', '4', '5']);
  });

  it('reports averages and busts', () => {
    expect(stats.averageMineCount).toBeGreaterThan(0);
    expect(stats.averageSelections).toBeGreaterThan(0);
    expect(stats.averageCashoutMultiplier).toBeGreaterThan(1);
    expect(stats.bustedRounds).toBe(3);
    expect(stats.highestMultiplier).toBeCloseTo(1.71203, 5);
  });
});

describe('multi-currency handling', () => {
  const mixed = build([
    rawBet({ amount: 10, payout: 25, currency: 'usdc' }),
    rawBet({ amount: 10, payout: 0, currency: 'usdc' }),
    rawBet({ amount: 1, payout: 0, currency: 'btc' }),
    rawBet({ amount: 2, payout: 6, currency: 'btc' }),
  ]);

  it('keeps each currency in its own ledger', () => {
    const usdc = calculateOverview(mixed.filter((b) => b.currency === 'usdc'), 'usdc');
    const btc = calculateOverview(mixed.filter((b) => b.currency === 'btc'), 'btc');

    expect(usdc.wagered).toBe(20);
    expect(usdc.netPnl).toBe(5);
    expect(btc.wagered).toBe(3);
    expect(btc.netPnl).toBe(3);
    // The two ledgers are never combined into one figure.
    expect(usdc.currency).not.toBe(btc.currency);
  });
});

describe('mixed and missing fields', () => {
  it('summarises games whose extra state is missing without crashing', () => {
    const partial = build([
      rawBet({ amount: 1, payout: 2, gameName: 'plinko' }), // no statePlinko
      rawBet({ amount: 1, payout: 0, gameName: 'mines' }), // no stateMines
      rawBet({ amount: 1, payout: 0, gameName: 'crash' }), // no cashoutAt/result
      rawBet({ amount: 1, payout: 3, gameName: 'sportsbook', status: 'settled' }), // no outcomes
    ]);

    const plinko = calculatePlinkoStats(partial);
    expect(plinko.bets).toBe(1);
    expect(plinko.byRisk).toEqual([]);
    expect(plinko.byRows).toEqual([]);

    const mines = calculateMinesStats(partial);
    expect(mines.bets).toBe(1);
    expect(mines.byMineCount).toEqual([]);
    expect(mines.averageMineCount).toBeNull();

    const crash = calculateCrashStats(partial);
    expect(crash.bets).toBe(1);
    expect(crash.byTarget).toEqual([]);
    expect(crash.averageCashoutTarget).toBeNull();
    expect(crash.busts).toBe(0);

    const sportsbook = calculateSportsbookStats(partial);
    expect(sportsbook.bets).toBe(1);
    expect(sportsbook.averageOdds).toBeNull();
    expect(sportsbook.calibration).toEqual([]);
    expect(sportsbook.hasProbabilityData).toBe(false);
  });

  it('never yields NaN or Infinity across the whole reference archive', () => {
    const walk = (value: unknown, path: string): void => {
      if (typeof value === 'number') {
        expect(Number.isFinite(value), `${path} = ${value}`).toBe(true);
      } else if (Array.isArray(value)) {
        value.forEach((v, i) => walk(v, `${path}[${i}]`));
      } else if (value && typeof value === 'object' && !(value instanceof Date)) {
        for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`);
      }
    };

    walk(calculateOverview(bets, 'usdc'), 'overview');
    walk(calculateDrawdown(bets), 'drawdown');
    walk(calculateStreaks(bets), 'streaks');
    walk(groupByGame(bets), 'byGame');
    walk(groupByOddsRange(bets), 'byOdds');
    walk(groupByStakeRange(bets), 'byStake');
    walk(groupByDate(bets, 'day'), 'byDate');
    walk(groupByHour(bets), 'byHour');
    walk(groupByWeekday(bets), 'byWeekday');
    walk(calculateSportsbookStats(bets), 'sportsbook');
    walk(calculateCrashStats(bets), 'crash');
    walk(calculatePlinkoStats(bets), 'plinko');
    walk(calculateMinesStats(bets), 'mines');
  });
});
