/**
 * Grouping and bucketing analytics.
 *
 * Every grouper returns rows carrying the same shape of aggregate (bets,
 * wagered, returned, P&L, ROI, win rate, average stake) so the UI can render
 * any of them with one table component.
 *
 * ROI and win rate follow the rules documented in `core.ts`: `null` where the
 * denominator is zero, never 0 and never Infinity.
 */

import type { BetRecord } from '@/types';
import { calculateROI, calculateWinRate } from './core';

/** Aggregate figures for any group of bets. */
export interface GroupStats {
  key: string;
  label: string;
  bets: number;
  wagered: number;
  returned: number;
  netPnl: number;
  roi: number | null;
  wins: number;
  losses: number;
  pushes: number;
  winRate: number | null;
  averageStake: number | null;
  largestWin: number;
  largestLoss: number;
  /** Share of the group's wagered volume against the whole set, 0 to 100. */
  shareOfWagered: number;
}

interface Accumulator {
  bets: number;
  wagered: number;
  returned: number;
  wins: number;
  losses: number;
  pushes: number;
  largestWin: number;
  largestLoss: number;
}

const emptyAccumulator = (): Accumulator => ({
  bets: 0,
  wagered: 0,
  returned: 0,
  wins: 0,
  losses: 0,
  pushes: 0,
  largestWin: 0,
  largestLoss: 0,
});

function accumulate(acc: Accumulator, bet: BetRecord): void {
  acc.bets += 1;
  acc.wagered += bet.stake;
  acc.returned += bet.payout;
  if (bet.outcome === 'win') acc.wins += 1;
  else if (bet.outcome === 'loss') acc.losses += 1;
  else acc.pushes += 1;
  if (bet.profit > acc.largestWin) acc.largestWin = bet.profit;
  if (bet.profit < acc.largestLoss) acc.largestLoss = bet.profit;
}

function finalise(key: string, label: string, acc: Accumulator, totalWagered: number): GroupStats {
  const netPnl = acc.returned - acc.wagered;
  return {
    key,
    label,
    bets: acc.bets,
    wagered: acc.wagered,
    returned: acc.returned,
    netPnl,
    roi: calculateROI(acc.wagered, netPnl),
    wins: acc.wins,
    losses: acc.losses,
    pushes: acc.pushes,
    winRate: calculateWinRate(acc.wins, acc.losses),
    averageStake: acc.bets > 0 ? acc.wagered / acc.bets : null,
    largestWin: acc.largestWin,
    largestLoss: acc.largestLoss,
    shareOfWagered: totalWagered > 0 ? (acc.wagered / totalWagered) * 100 : 0,
  };
}

/**
 * Generic grouper. `keyOf` returns `null` to skip a bet entirely, which is how
 * game-specific groupers ignore records lacking the field they bucket on.
 */
export function groupBy(
  bets: BetRecord[],
  keyOf: (bet: BetRecord) => string | null,
  labelOf: (key: string) => string = (k) => k,
): GroupStats[] {
  const groups = new Map<string, Accumulator>();
  let totalWagered = 0;

  for (const bet of bets) {
    const key = keyOf(bet);
    if (key === null) continue;
    let acc = groups.get(key);
    if (!acc) {
      acc = emptyAccumulator();
      groups.set(key, acc);
    }
    accumulate(acc, bet);
    totalWagered += bet.stake;
  }

  return [...groups.entries()]
    .map(([key, acc]) => finalise(key, labelOf(key), acc, totalWagered))
    .sort((a, b) => b.wagered - a.wagered || b.bets - a.bets);
}

/** Performance per game (`sportsbook`, `crash`, `plinko`, `mines`, …). */
export function groupByGame(bets: BetRecord[]): GroupStats[] {
  const labels = new Map(bets.map((b) => [b.game, b.gameLabel]));
  return groupBy(bets, (b) => b.game, (k) => labels.get(k) ?? k);
}

/** Performance per broad category. */
export function groupByCategory(bets: BetRecord[]): GroupStats[] {
  return groupBy(bets, (b) => b.category);
}

/** A half-open bucket `[min, max)`. `max: null` means unbounded. */
export interface Bucket {
  key: string;
  label: string;
  min: number;
  max: number | null;
}

/** Default decimal-odds bands for sportsbook analysis. */
export const DEFAULT_ODDS_BUCKETS: Bucket[] = [
  { key: 'lt150', label: '< 1.50', min: 0, max: 1.5 },
  { key: '150-200', label: '1.50 - 2.00', min: 1.5, max: 2 },
  { key: '200-300', label: '2.00 - 3.00', min: 2, max: 3 },
  { key: 'gte300', label: '3.00+', min: 3, max: null },
];

/** Recorded-probability bands, from long shot to heavy favourite. */
export const DEFAULT_PROBABILITY_BUCKETS: Bucket[] = [
  { key: 'p0-25', label: '0 - 25%', min: 0, max: 0.25 },
  { key: 'p25-50', label: '25 - 50%', min: 0.25, max: 0.5 },
  { key: 'p50-75', label: '50 - 75%', min: 0.5, max: 0.75 },
  { key: 'p75-100', label: '75 - 100%', min: 0.75, max: null },
];

/** Finds the bucket a value falls in, or `null` when it fits none. */
export function bucketFor(value: number, buckets: Bucket[]): Bucket | null {
  for (const bucket of buckets) {
    if (value >= bucket.min && (bucket.max === null || value < bucket.max)) return bucket;
  }
  return null;
}

/**
 * Groups sportsbook bets by the multiplier they would have paid at.
 *
 * Uses `potentialMultiplier` (the product of the leg odds) so a multi is
 * bucketed by what it actually paid at, not by an arbitrary single leg.
 */
export function groupByOddsRange(
  bets: BetRecord[],
  buckets: Bucket[] = DEFAULT_ODDS_BUCKETS,
): GroupStats[] {
  const labels = new Map(buckets.map((b) => [b.key, b.label]));
  const order = new Map(buckets.map((b, i) => [b.key, i]));

  return groupBy(
    bets,
    (bet) => {
      const odds = bet.sportsbook?.potentialMultiplier;
      if (odds === null || odds === undefined || odds <= 0) return null;
      return bucketFor(odds, buckets)?.key ?? null;
    },
    (k) => labels.get(k) ?? k,
  ).sort((a, b) => (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0));
}

/** Groups sportsbook bets by the probability recorded in the archive. */
export function groupByProbabilityRange(
  bets: BetRecord[],
  buckets: Bucket[] = DEFAULT_PROBABILITY_BUCKETS,
): GroupStats[] {
  const labels = new Map(buckets.map((b) => [b.key, b.label]));
  const order = new Map(buckets.map((b, i) => [b.key, i]));

  return groupBy(
    bets,
    (bet) => {
      const p = bet.sportsbook?.combinedProbability;
      if (p === null || p === undefined || p <= 0) return null;
      return bucketFor(p, buckets)?.key ?? null;
    },
    (k) => labels.get(k) ?? k,
  ).sort((a, b) => (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0));
}

/**
 * Builds stake-size buckets from the data rather than from fixed thresholds.
 *
 * Crypto stakes span several orders of magnitude, so any hard-coded ladder
 * would put every bet in one bucket. Quartiles of the observed stakes keep the
 * buckets populated whatever the denomination.
 */
export function buildStakeBuckets(bets: BetRecord[]): Bucket[] {
  const stakes = bets.map((b) => b.stake).filter((s) => s > 0).sort((a, b) => a - b);
  if (stakes.length === 0) return [];

  const quantile = (q: number) => stakes[Math.min(stakes.length - 1, Math.floor(q * stakes.length))];
  const cuts = [...new Set([quantile(0.25), quantile(0.5), quantile(0.75)])].sort((a, b) => a - b);

  // Fewer than three distinct cuts means the stakes are near-uniform; one
  // bucket is then the honest representation.
  if (cuts.length === 0) return [{ key: 'all', label: 'All stakes', min: 0, max: null }];

  const buckets: Bucket[] = [];
  let lower = 0;
  const fmt = (n: number) => (n >= 1 ? n.toFixed(2) : n.toPrecision(2));

  for (let i = 0; i < cuts.length; i += 1) {
    buckets.push({
      key: `q${i}`,
      label: i === 0 ? `≤ ${fmt(cuts[i])}` : `${fmt(lower)} - ${fmt(cuts[i])}`,
      min: lower,
      max: cuts[i],
    });
    lower = cuts[i];
  }
  buckets.push({ key: `q${cuts.length}`, label: `> ${fmt(lower)}`, min: lower, max: null });

  return buckets;
}

/** Groups bets by stake size using data-derived quartile buckets. */
export function groupByStakeRange(bets: BetRecord[], buckets?: Bucket[]): GroupStats[] {
  const resolved = buckets ?? buildStakeBuckets(bets);
  if (resolved.length === 0) return [];
  const labels = new Map(resolved.map((b) => [b.key, b.label]));
  const order = new Map(resolved.map((b, i) => [b.key, i]));

  return groupBy(
    bets,
    (bet) => (bet.stake > 0 ? (bucketFor(bet.stake, resolved)?.key ?? null) : null),
    (k) => labels.get(k) ?? k,
  ).sort((a, b) => (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0));
}

/** Calendar granularity for time series. */
export type TimeBucket = 'day' | 'week' | 'month';

/** Local-time key for a timestamp at the requested granularity. */
export function periodKey(timestamp: number, bucket: TimeBucket): string {
  const d = new Date(timestamp);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  if (bucket === 'month') return `${y}-${m}`;
  if (bucket === 'week') {
    // Week starts Monday; key by that Monday's date.
    const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const offset = (monday.getDay() + 6) % 7;
    monday.setDate(monday.getDate() - offset);
    return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(
      monday.getDate(),
    ).padStart(2, '0')}`;
  }
  return `${y}-${m}-${String(d.getDate()).padStart(2, '0')}`;
}

/** One calendar period of betting activity. */
export interface PeriodStats extends GroupStats {
  /** Start of the period, in local time. */
  periodStart: number;
  /** Cumulative P&L at the end of this period. */
  cumulative: number;
}

/**
 * Buckets bets into calendar periods and carries a running cumulative P&L.
 * Periods with no activity are not synthesised, gaps are real information.
 */
export function groupByDate(bets: BetRecord[], bucket: TimeBucket = 'day'): PeriodStats[] {
  const groups = new Map<string, { acc: Accumulator; start: number }>();
  let totalWagered = 0;

  for (const bet of bets) {
    const key = periodKey(bet.timestamp, bucket);
    let entry = groups.get(key);
    if (!entry) {
      entry = { acc: emptyAccumulator(), start: bet.timestamp };
      groups.set(key, entry);
    }
    if (bet.timestamp < entry.start) entry.start = bet.timestamp;
    accumulate(entry.acc, bet);
    totalWagered += bet.stake;
  }

  let cumulative = 0;
  return [...groups.entries()]
    .sort((a, b) => a[1].start - b[1].start)
    .map(([key, { acc, start }]) => {
      const stats = finalise(key, key, acc, totalWagered);
      cumulative += stats.netPnl;
      return { ...stats, periodStart: start, cumulative };
    });
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Activity and P&L by hour of day (local time), 0 to 23. Always 24 rows. */
export function groupByHour(bets: BetRecord[]): GroupStats[] {
  const rows = groupBy(
    bets,
    (b) => String(new Date(b.timestamp).getHours()),
    (k) => `${k.padStart(2, '0')}:00`,
  );
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const totalWagered = bets.reduce((sum, b) => sum + b.stake, 0);

  return Array.from({ length: 24 }, (_, hour) => {
    const existing = byKey.get(String(hour));
    if (existing) return existing;
    return finalise(String(hour), `${String(hour).padStart(2, '0')}:00`, emptyAccumulator(), totalWagered);
  });
}

/** Activity and P&L by weekday (local time). Always 7 rows, Monday first. */
export function groupByWeekday(bets: BetRecord[]): GroupStats[] {
  const rows = groupBy(
    bets,
    (b) => String(new Date(b.timestamp).getDay()),
    (k) => WEEKDAYS[Number(k)] ?? k,
  );
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const totalWagered = bets.reduce((sum, b) => sum + b.stake, 0);

  // Monday-first ordering matches the heatmap layout.
  return [1, 2, 3, 4, 5, 6, 0].map((day) => {
    const existing = byKey.get(String(day));
    if (existing) return existing;
    return finalise(String(day), WEEKDAYS[day], emptyAccumulator(), totalWagered);
  });
}

/** Session and cadence statistics derived from bet timestamps. */
export interface TimeStats {
  firstBet: Date | null;
  lastBet: Date | null;
  /** Calendar days between the first and last bet, inclusive. */
  spanDays: number;
  /** Distinct calendar days with at least one bet. */
  activeDays: number;
  /** Mean bets per active day. */
  betsPerActiveDay: number | null;
  busiestDay: { key: string; bets: number; netPnl: number } | null;
  /** Mean gap between consecutive bets, in milliseconds. */
  averageGapMs: number | null;
  medianGapMs: number | null;
  mostActiveHour: { hour: number; bets: number } | null;
  mostActiveWeekday: { weekday: string; bets: number } | null;
}

/** Computes cadence statistics over a chronologically sorted list of bets. */
export function calculateTimeStats(bets: BetRecord[]): TimeStats {
  if (bets.length === 0) {
    return {
      firstBet: null,
      lastBet: null,
      spanDays: 0,
      activeDays: 0,
      betsPerActiveDay: null,
      busiestDay: null,
      averageGapMs: null,
      medianGapMs: null,
      mostActiveHour: null,
      mostActiveWeekday: null,
    };
  }

  const first = bets[0];
  const last = bets[bets.length - 1];

  const days = groupByDate(bets, 'day');
  const busiest = days.reduce((best, d) => (best === null || d.bets > best.bets ? d : best), days[0] ?? null);

  const gaps: number[] = [];
  for (let i = 1; i < bets.length; i += 1) {
    const gap = bets[i].timestamp - bets[i - 1].timestamp;
    if (gap >= 0) gaps.push(gap);
  }
  const sortedGaps = [...gaps].sort((a, b) => a - b);
  const medianGap =
    sortedGaps.length === 0
      ? null
      : sortedGaps.length % 2 === 0
        ? (sortedGaps[sortedGaps.length / 2 - 1] + sortedGaps[sortedGaps.length / 2]) / 2
        : sortedGaps[Math.floor(sortedGaps.length / 2)];

  const hours = groupByHour(bets);
  const topHour = hours.reduce((best, h) => (h.bets > best.bets ? h : best), hours[0]);
  const weekdays = groupByWeekday(bets);
  const topWeekday = weekdays.reduce((best, w) => (w.bets > best.bets ? w : best), weekdays[0]);

  const startOfDay = (t: number) => {
    const d = new Date(t);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  };
  const spanDays =
    Math.round((startOfDay(last.timestamp) - startOfDay(first.timestamp)) / 86_400_000) + 1;

  return {
    firstBet: first.placedAt,
    lastBet: last.placedAt,
    spanDays,
    activeDays: days.length,
    betsPerActiveDay: days.length > 0 ? bets.length / days.length : null,
    busiestDay: busiest ? { key: busiest.key, bets: busiest.bets, netPnl: busiest.netPnl } : null,
    averageGapMs: gaps.length > 0 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null,
    medianGapMs: medianGap,
    mostActiveHour: topHour.bets > 0 ? { hour: Number(topHour.key), bets: topHour.bets } : null,
    mostActiveWeekday: topWeekday.bets > 0 ? { weekday: topWeekday.label, bets: topWeekday.bets } : null,
  };
}
