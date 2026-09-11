/**
 * Core analytics.
 *
 * ACCOUNTING RULES (single source of truth for every headline figure)
 * ------------------------------------------------------------------
 * The parser has already removed rejected, cancelled and still-open records
 * (see `src/parsers/stakeArchive.ts`). Everything reaching this layer is a
 * completed wager, so:
 *
 *   Total Wagered  = Σ stake
 *   Total Returned = Σ payout            (payout is gross — it includes stake)
 *   Net P&L        = Total Returned − Total Wagered
 *   ROI            = Net P&L / Total Wagered × 100
 *
 * Because payout is gross, a bet returning exactly its stake is a push, not a
 * win — so Net P&L is the realised change in balance, not a second helping of
 * the stake.
 *
 * ROI is undefined when nothing was wagered; it is reported as `null` rather
 * than 0 or Infinity so the UI can say "—" instead of a misleading number.
 *
 * Win rate counts wins against wins + losses. Pushes sit outside both, so a run
 * of exact break-even rounds neither helps nor hurts it.
 *
 * All functions here are pure and take an already-filtered, chronologically
 * sorted list of bets.
 */

import type { BetRecord } from '@/types';

/** Headline figures for a set of bets in a single currency. */
export interface Overview {
  currency: string;
  bets: number;
  wagered: number;
  returned: number;
  netPnl: number;
  /** Percentage. `null` when nothing was wagered. */
  roi: number | null;
  wins: number;
  losses: number;
  pushes: number;
  /** Percentage of decided bets that won. `null` when none were decided. */
  winRate: number | null;
  /** Mean stake. `null` when there are no bets. */
  averageStake: number | null;
  medianStake: number | null;
  largestWin: number;
  largestLoss: number;
  largestStake: number;
  /** Positive magnitude of the deepest peak-to-trough fall in cumulative P&L. */
  maxDrawdown: number;
}

/** ROI as a percentage, or `null` when the denominator is zero. */
export function calculateROI(wagered: number, netPnl: number): number | null {
  if (wagered <= 0) return null;
  return (netPnl / wagered) * 100;
}

/** Win rate as a percentage of decided bets (pushes excluded). */
export function calculateWinRate(wins: number, losses: number): number | null {
  const decided = wins + losses;
  if (decided <= 0) return null;
  return (wins / decided) * 100;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Computes the headline metrics.
 *
 * @param bets Completed wagers, all in one currency, sorted oldest first.
 * @param currency Currency label these bets are denominated in.
 */
export function calculateOverview(bets: BetRecord[], currency: string): Overview {
  let wagered = 0;
  let returned = 0;
  let wins = 0;
  let losses = 0;
  let pushes = 0;
  let largestWin = 0;
  let largestLoss = 0;
  let largestStake = 0;
  const stakes: number[] = [];

  // Drawdown is tracked in the same pass: the bets are already in chronological
  // order, so a second traversal would buy nothing.
  let cumulative = 0;
  let peak = 0;
  let maxDrawdown = 0;

  for (const bet of bets) {
    wagered += bet.stake;
    returned += bet.payout;
    stakes.push(bet.stake);
    if (bet.stake > largestStake) largestStake = bet.stake;

    if (bet.outcome === 'win') wins += 1;
    else if (bet.outcome === 'loss') losses += 1;
    else pushes += 1;

    if (bet.profit > largestWin) largestWin = bet.profit;
    if (bet.profit < largestLoss) largestLoss = bet.profit;

    cumulative += bet.profit;
    if (cumulative > peak) peak = cumulative;
    const drawdown = peak - cumulative;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  const netPnl = returned - wagered;

  return {
    currency,
    bets: bets.length,
    wagered,
    returned,
    netPnl,
    roi: calculateROI(wagered, netPnl),
    wins,
    losses,
    pushes,
    winRate: calculateWinRate(wins, losses),
    averageStake: bets.length > 0 ? wagered / bets.length : null,
    medianStake: median(stakes),
    largestWin,
    largestLoss,
    largestStake,
    maxDrawdown,
  };
}

/** One point on the cumulative P&L curve. */
export interface EquityPoint {
  timestamp: number;
  /** Cumulative realised P&L after this bet. */
  cumulative: number;
  /** Cumulative amount staked up to and including this bet. */
  wagered: number;
  /** This bet's own profit. */
  profit: number;
  /** Running peak of `cumulative`. */
  peak: number;
  /** `peak − cumulative`, always ≥ 0. */
  drawdown: number;
  index: number;
}

/** Builds the cumulative P&L / drawdown series, one point per bet. */
export function buildEquityCurve(bets: BetRecord[]): EquityPoint[] {
  const points: EquityPoint[] = [];
  let cumulative = 0;
  let wagered = 0;
  let peak = 0;

  for (let i = 0; i < bets.length; i += 1) {
    const bet = bets[i];
    cumulative += bet.profit;
    wagered += bet.stake;
    if (cumulative > peak) peak = cumulative;
    points.push({
      timestamp: bet.timestamp,
      cumulative,
      wagered,
      profit: bet.profit,
      peak,
      drawdown: peak - cumulative,
      index: i,
    });
  }

  return points;
}

/** Peak-to-trough analysis of the cumulative P&L curve. */
export interface DrawdownStats {
  /** Highest cumulative P&L reached, and when. Zero if never above water. */
  peak: number;
  peakAt: Date | null;
  /** Deepest fall below a prior peak, as a positive magnitude. */
  maxDrawdown: number;
  /**
   * The deepest fall as a share of everything staked, 0–100.
   *
   * Deliberately *not* measured against the peak: cumulative P&L starts at
   * zero, so the peak is not a capital base and a small peak produces a
   * meaningless four-figure percentage. Total wagered is a denominator the
   * archive genuinely supports. `null` when nothing was wagered.
   */
  maxDrawdownVsWagered: number | null;
  /** When the deepest point was reached. */
  maxDrawdownAt: Date | null;
  /** When the peak that preceded the deepest fall was set. */
  maxDrawdownFrom: Date | null;
  /** When the curve first climbed back to that peak, if it ever did. */
  recoveredAt: Date | null;
  /** Milliseconds from the deepest point to recovery. */
  recoveryMs: number | null;
  /** How far below the all-time peak the curve currently sits. */
  currentDrawdown: number;
  /** True while the curve is at its all-time peak. */
  atPeak: boolean;
}

/**
 * Computes drawdown statistics.
 *
 * Drawdown is measured against the running peak of cumulative P&L, with the
 * peak floored at zero — an account that has never been in profit is
 * considered to be drawn down from its starting point, which is what a bettor
 * means by "how far down am I from my best".
 */
export function calculateDrawdown(bets: BetRecord[]): DrawdownStats {
  const empty: DrawdownStats = {
    peak: 0,
    peakAt: null,
    maxDrawdown: 0,
    maxDrawdownVsWagered: null,
    maxDrawdownAt: null,
    maxDrawdownFrom: null,
    recoveredAt: null,
    recoveryMs: null,
    currentDrawdown: 0,
    atPeak: true,
  };
  if (bets.length === 0) return empty;

  let cumulative = 0;
  let peak = 0;
  let peakAt: number | null = null;
  // Timestamp of the peak the *current* decline started from.
  let currentPeakAt: number | null = null;

  let maxDrawdown = 0;
  let maxDrawdownAt: number | null = null;
  let maxDrawdownFrom: number | null = null;
  let maxDrawdownPeak = 0;
  let wagered = 0;

  for (const bet of bets) {
    wagered += bet.stake;
    cumulative += bet.profit;
    if (cumulative > peak) {
      peak = cumulative;
      peakAt = bet.timestamp;
      currentPeakAt = bet.timestamp;
    }
    const drawdown = peak - cumulative;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
      maxDrawdownAt = bet.timestamp;
      maxDrawdownFrom = currentPeakAt;
      maxDrawdownPeak = peak;
    }
  }

  // Recovery: the first bet after the trough where cumulative P&L regains the
  // peak the decline started from.
  let recoveredAt: number | null = null;
  if (maxDrawdownAt !== null) {
    let running = 0;
    for (const bet of bets) {
      running += bet.profit;
      if (bet.timestamp > maxDrawdownAt && running >= maxDrawdownPeak) {
        recoveredAt = bet.timestamp;
        break;
      }
    }
  }

  const currentDrawdown = peak - cumulative;

  return {
    peak,
    peakAt: peakAt === null ? null : new Date(peakAt),
    maxDrawdown,
    maxDrawdownVsWagered: wagered > 0 ? (maxDrawdown / wagered) * 100 : null,
    maxDrawdownAt: maxDrawdownAt === null ? null : new Date(maxDrawdownAt),
    maxDrawdownFrom: maxDrawdownFrom === null ? null : new Date(maxDrawdownFrom),
    recoveredAt: recoveredAt === null ? null : new Date(recoveredAt),
    recoveryMs: recoveredAt !== null && maxDrawdownAt !== null ? recoveredAt - maxDrawdownAt : null,
    currentDrawdown,
    atPeak: currentDrawdown <= 0,
  };
}

/** Win/loss run statistics. Descriptive only — runs carry no predictive weight. */
export interface StreakStats {
  /** Signed run length in progress: +3 = three wins, −3 = three losses. */
  currentStreak: number;
  currentStreakType: 'win' | 'loss' | 'none';
  longestWinStreak: number;
  longestLossStreak: number;
  averageWinStreak: number | null;
  averageLossStreak: number | null;
  winStreakCount: number;
  lossStreakCount: number;
  /** Every completed run, oldest first — used by the streak visualisation. */
  runs: Array<{ type: 'win' | 'loss'; length: number; startedAt: Date; endedAt: Date }>;
}

/**
 * Computes win/loss runs.
 *
 * Pushes are transparent: they neither extend nor break a run, since a
 * break-even round says nothing about whether the bettor is winning or losing.
 */
export function calculateStreaks(bets: BetRecord[]): StreakStats {
  const runs: StreakStats['runs'] = [];
  let type: 'win' | 'loss' | null = null;
  let length = 0;
  let startedAt = 0;
  let endedAt = 0;

  const flush = () => {
    if (type !== null && length > 0) {
      runs.push({ type, length, startedAt: new Date(startedAt), endedAt: new Date(endedAt) });
    }
  };

  for (const bet of bets) {
    if (bet.outcome === 'push') continue;
    const betType = bet.outcome;
    if (betType === type) {
      length += 1;
      endedAt = bet.timestamp;
    } else {
      flush();
      type = betType;
      length = 1;
      startedAt = bet.timestamp;
      endedAt = bet.timestamp;
    }
  }
  flush();

  const winRuns = runs.filter((r) => r.type === 'win');
  const lossRuns = runs.filter((r) => r.type === 'loss');
  const mean = (xs: number[]) => (xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length);

  const last = runs[runs.length - 1];

  return {
    currentStreak: last ? (last.type === 'win' ? last.length : -last.length) : 0,
    currentStreakType: last ? last.type : 'none',
    longestWinStreak: winRuns.reduce((m, r) => Math.max(m, r.length), 0),
    longestLossStreak: lossRuns.reduce((m, r) => Math.max(m, r.length), 0),
    averageWinStreak: mean(winRuns.map((r) => r.length)),
    averageLossStreak: mean(lossRuns.map((r) => r.length)),
    winStreakCount: winRuns.length,
    lossStreakCount: lossRuns.length,
    runs,
  };
}
