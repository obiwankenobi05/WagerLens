/**
 * Game-specific analytics.
 *
 * Each calculator reads only fields the parser actually found. Where a field is
 * absent from the archive the corresponding metric is `null` and the UI omits
 * it, rather than inventing a category that the data does not support.
 */

import type { BetRecord } from '@/types';
import { calculateROI, calculateWinRate } from './core';
import {
  DEFAULT_ODDS_BUCKETS,
  DEFAULT_PROBABILITY_BUCKETS,
  type GroupStats,
  groupBy,
  groupByOddsRange,
  groupByProbabilityRange,
  groupByStakeRange,
} from './grouping';

/** Figures shared by every game-specific summary. */
export interface GameSummary {
  bets: number;
  wagered: number;
  returned: number;
  netPnl: number;
  roi: number | null;
  winRate: number | null;
  wins: number;
  losses: number;
  pushes: number;
  averageStake: number | null;
  largestWin: number;
  largestLoss: number;
}

/** Builds the shared summary block from a list of bets. */
export function summarise(bets: BetRecord[]): GameSummary {
  let wagered = 0;
  let returned = 0;
  let wins = 0;
  let losses = 0;
  let pushes = 0;
  let largestWin = 0;
  let largestLoss = 0;

  for (const bet of bets) {
    wagered += bet.stake;
    returned += bet.payout;
    if (bet.outcome === 'win') wins += 1;
    else if (bet.outcome === 'loss') losses += 1;
    else pushes += 1;
    if (bet.profit > largestWin) largestWin = bet.profit;
    if (bet.profit < largestLoss) largestLoss = bet.profit;
  }

  const netPnl = returned - wagered;
  return {
    bets: bets.length,
    wagered,
    returned,
    netPnl,
    roi: calculateROI(wagered, netPnl),
    winRate: calculateWinRate(wins, losses),
    wins,
    losses,
    pushes,
    averageStake: bets.length > 0 ? wagered / bets.length : null,
    largestWin,
    largestLoss,
  };
}

const mean = (xs: number[]): number | null =>
  xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length;

/* ------------------------------------------------------------------ *
 * Sportsbook
 * ------------------------------------------------------------------ */

/** How results in a probability band compare to the probabilities recorded. */
export interface CalibrationRow {
  key: string;
  label: string;
  bets: number;
  /** Mean of the recorded probability field for bets in this band, 0–100. */
  recordedProbability: number;
  /** Share of decided bets in this band that won, 0–100. `null` if none decided. */
  actualWinRate: number | null;
  wins: number;
  losses: number;
  netPnl: number;
  roi: number | null;
}

export interface SportsbookStats extends GameSummary {
  byOdds: GroupStats[];
  byProbability: GroupStats[];
  byStake: GroupStats[];
  byLegCount: GroupStats[];
  calibration: CalibrationRow[];
  singles: GameSummary;
  multis: GameSummary;
  averageOdds: number | null;
  /** Stake-weighted mean of the potential multiplier. */
  weightedAverageOdds: number | null;
  highestOdds: number | null;
  /** Mean of the archive's recorded probability field, 0–1. */
  averageRecordedProbability: number | null;
  cashouts: number;
  distinctFixtures: number;
  /** True when at least one bet carried a recorded probability. */
  hasProbabilityData: boolean;
}

/**
 * Sportsbook analytics.
 *
 * Odds bucketing uses `potentialMultiplier` (the product of the leg odds), so a
 * multi is classified by what it would actually have paid.
 *
 * The calibration table compares the archive's own recorded probability field
 * against realised win rates. That field is reported exactly as recorded —
 * WagerLens makes no claim about how Stake produced it, and small samples in a
 * band make the comparison indicative at best.
 */
export function calculateSportsbookStats(allBets: BetRecord[]): SportsbookStats {
  const bets = allBets.filter((b) => b.category === 'sportsbook');
  const summary = summarise(bets);

  const oddsValues = bets
    .map((b) => b.sportsbook?.potentialMultiplier)
    .filter((o): o is number => typeof o === 'number' && o > 0);

  const probabilities = bets
    .map((b) => b.sportsbook?.combinedProbability)
    .filter((p): p is number => typeof p === 'number' && p > 0);

  let weightedOdds: number | null = null;
  const stakeWithOdds = bets.filter(
    (b) => typeof b.sportsbook?.potentialMultiplier === 'number' && b.stake > 0,
  );
  const stakeSum = stakeWithOdds.reduce((s, b) => s + b.stake, 0);
  if (stakeSum > 0) {
    weightedOdds =
      stakeWithOdds.reduce((s, b) => s + b.stake * (b.sportsbook!.potentialMultiplier as number), 0) /
      stakeSum;
  }

  const singles = summarise(bets.filter((b) => b.sportsbook && !b.sportsbook.isMulti));
  const multis = summarise(bets.filter((b) => b.sportsbook?.isMulti));

  // Calibration is built directly rather than via groupBy because it needs the
  // mean recorded probability per band, which the generic aggregate lacks.
  const calibration: CalibrationRow[] = DEFAULT_PROBABILITY_BUCKETS.map((bucket) => {
    const inBucket = bets.filter((b) => {
      const p = b.sportsbook?.combinedProbability;
      if (typeof p !== 'number' || p <= 0) return false;
      return p >= bucket.min && (bucket.max === null || p < bucket.max);
    });
    const wins = inBucket.filter((b) => b.outcome === 'win').length;
    const losses = inBucket.filter((b) => b.outcome === 'loss').length;
    const wagered = inBucket.reduce((s, b) => s + b.stake, 0);
    const netPnl = inBucket.reduce((s, b) => s + b.profit, 0);
    const recorded = mean(inBucket.map((b) => b.sportsbook!.combinedProbability as number)) ?? 0;
    return {
      key: bucket.key,
      label: bucket.label,
      bets: inBucket.length,
      recordedProbability: recorded * 100,
      actualWinRate: calculateWinRate(wins, losses),
      wins,
      losses,
      netPnl,
      roi: calculateROI(wagered, netPnl),
    };
  }).filter((row) => row.bets > 0);

  const fixtures = new Set<string>();
  for (const bet of bets) {
    for (const leg of bet.sportsbook?.legs ?? []) {
      if (leg.fixtureId) fixtures.add(leg.fixtureId);
    }
  }

  return {
    ...summary,
    byOdds: groupByOddsRange(bets, DEFAULT_ODDS_BUCKETS),
    byProbability: groupByProbabilityRange(bets, DEFAULT_PROBABILITY_BUCKETS),
    byStake: groupByStakeRange(bets),
    byLegCount: groupBy(
      bets,
      (b) => (b.sportsbook ? String(b.sportsbook.legCount) : null),
      (k) => (k === '1' ? 'Single' : `${k}-leg multi`),
    ).sort((a, b) => Number(a.key) - Number(b.key)),
    calibration,
    singles,
    multis,
    averageOdds: mean(oddsValues),
    weightedAverageOdds: weightedOdds,
    highestOdds: oddsValues.length > 0 ? Math.max(...oddsValues) : null,
    averageRecordedProbability: mean(probabilities),
    cashouts: bets.filter((b) => (b.status ?? '').toLowerCase() === 'cashout').length,
    distinctFixtures: fixtures.size,
    hasProbabilityData: probabilities.length > 0,
  };
}

/* ------------------------------------------------------------------ *
 * Crash
 * ------------------------------------------------------------------ */

/** Success rate at one auto-cash-out target. */
export interface CashoutTargetRow {
  target: number;
  label: string;
  bets: number;
  /** Rounds that reached the target, as a percentage of rounds at it. */
  successRate: number;
  successes: number;
  wagered: number;
  netPnl: number;
  roi: number | null;
}

export interface CrashStats extends GameSummary {
  busts: number;
  /** Percentage of rounds that busted. */
  bustRate: number | null;
  /** Mean auto-cash-out target across rounds that recorded one. */
  averageCashoutTarget: number | null;
  /** Mean realised multiplier across all rounds, busts included (as zeros). */
  averagePayoutMultiplier: number | null;
  /** Mean realised multiplier across rounds that paid out. */
  averageWinningMultiplier: number | null;
  highestMultiplier: number | null;
  byTarget: CashoutTargetRow[];
  /** Counts of the archive's raw `result` strings. */
  resultBreakdown: Array<{ result: string; count: number }>;
}

/**
 * Crash analytics.
 *
 * Cash-out targets are taken from the values actually present in the archive,
 * not from a fixed ladder — a player who only ever sets 2.00x should see one
 * row, not five mostly-empty ones.
 *
 * A round "succeeds" when it returned more than its stake. That covers both a
 * target reached automatically and a manual stop above 1.00x.
 */
export function calculateCrashStats(allBets: BetRecord[]): CrashStats {
  const bets = allBets.filter((b) => b.game === 'crash');
  const summary = summarise(bets);

  const busts = bets.filter((b) => b.crash?.busted).length;
  const targets = bets
    .map((b) => b.crash?.cashoutAt)
    .filter((t): t is number => typeof t === 'number' && t > 0);

  const multipliers = bets
    .map((b) => b.payoutMultiplier)
    .filter((m): m is number => typeof m === 'number');
  const winningMultipliers = multipliers.filter((m) => m > 1);

  // One row per distinct target that appears in the data.
  const targetGroups = new Map<number, BetRecord[]>();
  for (const bet of bets) {
    const target = bet.crash?.cashoutAt;
    if (typeof target !== 'number' || target <= 0) continue;
    const list = targetGroups.get(target);
    if (list) list.push(bet);
    else targetGroups.set(target, [bet]);
  }

  const byTarget: CashoutTargetRow[] = [...targetGroups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([target, rounds]) => {
      const successes = rounds.filter((b) => b.profit > 0).length;
      const wagered = rounds.reduce((s, b) => s + b.stake, 0);
      const netPnl = rounds.reduce((s, b) => s + b.profit, 0);
      return {
        target,
        label: `${target}×`,
        bets: rounds.length,
        successes,
        successRate: rounds.length > 0 ? (successes / rounds.length) * 100 : 0,
        wagered,
        netPnl,
        roi: calculateROI(wagered, netPnl),
      };
    });

  const resultCounts = new Map<string, number>();
  for (const bet of bets) {
    const result = bet.crash?.result;
    if (!result) continue;
    resultCounts.set(result, (resultCounts.get(result) ?? 0) + 1);
  }

  return {
    ...summary,
    busts,
    bustRate: bets.length > 0 ? (busts / bets.length) * 100 : null,
    averageCashoutTarget: mean(targets),
    averagePayoutMultiplier: mean(multipliers),
    averageWinningMultiplier: mean(winningMultipliers),
    highestMultiplier: multipliers.length > 0 ? Math.max(...multipliers) : null,
    byTarget,
    resultBreakdown: [...resultCounts.entries()]
      .map(([result, count]) => ({ result, count }))
      .sort((a, b) => b.count - a.count),
  };
}

/* ------------------------------------------------------------------ *
 * Plinko
 * ------------------------------------------------------------------ */

/** One realised payout multiplier and how often it landed. */
export interface MultiplierBin {
  multiplier: number;
  count: number;
  /** Share of all drops, 0–100. */
  share: number;
  netPnl: number;
}

export interface PlinkoStats extends GameSummary {
  byRisk: GroupStats[];
  byRows: GroupStats[];
  averagePayoutMultiplier: number | null;
  highestMultiplier: number | null;
  /** Distribution of realised multipliers, highest first. */
  multiplierDistribution: MultiplierBin[];
  /** Share of drops that returned less than the stake, 0–100. */
  belowStakeRate: number | null;
}

/**
 * Plinko analytics.
 *
 * The recorded ball path is preserved for the detail view but is not analysed
 * for patterns: each drop is independent, and a path breakdown would only
 * invite a reading the data cannot support.
 */
export function calculatePlinkoStats(allBets: BetRecord[]): PlinkoStats {
  const bets = allBets.filter((b) => b.game === 'plinko');
  const summary = summarise(bets);

  const multipliers = bets
    .map((b) => b.payoutMultiplier)
    .filter((m): m is number => typeof m === 'number');

  const bins = new Map<number, { count: number; netPnl: number }>();
  for (const bet of bets) {
    const m = bet.payoutMultiplier;
    if (typeof m !== 'number') continue;
    const bin = bins.get(m);
    if (bin) {
      bin.count += 1;
      bin.netPnl += bet.profit;
    } else {
      bins.set(m, { count: 1, netPnl: bet.profit });
    }
  }

  const belowStake = bets.filter((b) => b.profit < 0).length;

  return {
    ...summary,
    byRisk: groupBy(
      bets,
      (b) => b.plinko?.risk ?? null,
      (k) => k.charAt(0).toUpperCase() + k.slice(1),
    ),
    byRows: groupBy(
      bets,
      (b) => (typeof b.plinko?.rows === 'number' ? String(b.plinko.rows) : null),
      (k) => `${k} rows`,
    ).sort((a, b) => Number(a.key) - Number(b.key)),
    averagePayoutMultiplier: mean(multipliers),
    highestMultiplier: multipliers.length > 0 ? Math.max(...multipliers) : null,
    multiplierDistribution: [...bins.entries()]
      .map(([multiplier, { count, netPnl }]) => ({
        multiplier,
        count,
        share: bets.length > 0 ? (count / bets.length) * 100 : 0,
        netPnl,
      }))
      .sort((a, b) => b.multiplier - a.multiplier),
    belowStakeRate: bets.length > 0 ? (belowStake / bets.length) * 100 : null,
  };
}

/* ------------------------------------------------------------------ *
 * Mines
 * ------------------------------------------------------------------ */

export interface MinesStats extends GameSummary {
  byMineCount: GroupStats[];
  bySelections: GroupStats[];
  averageMineCount: number | null;
  averageSelections: number | null;
  averageCashoutMultiplier: number | null;
  highestMultiplier: number | null;
  /** Rounds ended by hitting a mine (no payout). */
  bustedRounds: number;
}

/**
 * Mines analytics.
 *
 * "Selections" is the number of safe tiles revealed, read from the length of
 * the recorded `rounds` array. A round with no payout is treated as busted —
 * the archive records the revealed tiles but not an explicit bust flag.
 */
export function calculateMinesStats(allBets: BetRecord[]): MinesStats {
  const bets = allBets.filter((b) => b.game === 'mines');
  const summary = summarise(bets);

  const mineCounts = bets
    .map((b) => b.mines?.minesCount)
    .filter((m): m is number => typeof m === 'number');
  const selections = bets.map((b) => b.mines?.selections).filter((s): s is number => typeof s === 'number');
  const cashoutMultipliers = bets
    .filter((b) => b.payout > 0)
    .map((b) => b.payoutMultiplier)
    .filter((m): m is number => typeof m === 'number');
  const allMultipliers = bets
    .map((b) => b.payoutMultiplier)
    .filter((m): m is number => typeof m === 'number');

  return {
    ...summary,
    byMineCount: groupBy(
      bets,
      (b) => (typeof b.mines?.minesCount === 'number' ? String(b.mines.minesCount) : null),
      (k) => `${k} ${Number(k) === 1 ? 'mine' : 'mines'}`,
    ).sort((a, b) => Number(a.key) - Number(b.key)),
    bySelections: groupBy(
      bets,
      (b) => (typeof b.mines?.selections === 'number' ? String(b.mines.selections) : null),
      (k) => `${k} ${Number(k) === 1 ? 'tile' : 'tiles'}`,
    ).sort((a, b) => Number(a.key) - Number(b.key)),
    averageMineCount: mean(mineCounts),
    averageSelections: mean(selections),
    averageCashoutMultiplier: mean(cashoutMultipliers),
    highestMultiplier: allMultipliers.length > 0 ? Math.max(...allMultipliers) : null,
    bustedRounds: bets.filter((b) => b.payout === 0).length,
  };
}
