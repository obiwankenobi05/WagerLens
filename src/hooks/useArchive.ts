/**
 * Archive loading, filtering and derived analytics.
 *
 * Parsing happens in this module and nowhere else. The file is read with the
 * FileReader API and parsed in memory — no network request is made with its
 * contents at any point.
 */

import { useCallback, useMemo, useState } from 'react';
import { parseStakeArchive } from '@/parsers/stakeArchive';
import {
  buildEquityCurve,
  calculateCrashStats,
  calculateDrawdown,
  calculateMinesStats,
  calculateOverview,
  calculatePlinkoStats,
  calculateSportsbookStats,
  calculateStreaks,
  calculateTimeStats,
  generateProfile,
  groupByDate,
  groupByGame,
  groupByHour,
  groupByStakeRange,
  groupByWeekday,
  type TimeBucket,
} from '@/analytics';
import { ArchiveParseError, type BetOutcome, type BetRecord, type ParseResult } from '@/types';
import { makeAmountFormatter } from '@/utils/format';

/** Metadata about the loaded file, shown in the header. */
export interface ArchiveMeta {
  fileName: string;
  fileSize: number;
  loadedAt: Date;
  /** Milliseconds spent parsing — surfaced in the data-quality panel. */
  parseMs: number;
}

export type LoadState =
  | { status: 'idle' }
  | { status: 'loading'; fileName: string }
  | { status: 'error'; message: string; detail?: string }
  | { status: 'ready'; result: ParseResult; meta: ArchiveMeta };

/** Dashboard-wide filters. All of them recompute every metric below. */
export interface Filters {
  games: string[];
  outcomes: BetOutcome[];
  /** Inclusive local-date bounds. */
  from: Date | null;
  to: Date | null;
  /** Free-text match across game, status, id and currency. */
  search: string;
}

export const EMPTY_FILTERS: Filters = {
  games: [],
  outcomes: [],
  from: null,
  to: null,
  search: '',
};

/** Applies the dashboard filters. Pure, so it is trivially memoisable. */
export function applyFilters(bets: BetRecord[], filters: Filters): BetRecord[] {
  const games = new Set(filters.games);
  const outcomes = new Set(filters.outcomes);
  const search = filters.search.trim().toLowerCase();
  // Bounds are widened to whole local days so a range reads inclusively.
  const fromTs = filters.from ? filters.from.getTime() : null;
  const toTs = filters.to
    ? new Date(filters.to.getFullYear(), filters.to.getMonth(), filters.to.getDate() + 1).getTime() - 1
    : null;

  if (
    games.size === 0 &&
    outcomes.size === 0 &&
    fromTs === null &&
    toTs === null &&
    search === ''
  ) {
    return bets;
  }

  return bets.filter((bet) => {
    if (games.size > 0 && !games.has(bet.game)) return false;
    if (outcomes.size > 0 && !outcomes.has(bet.outcome)) return false;
    if (fromTs !== null && bet.timestamp < fromTs) return false;
    if (toTs !== null && bet.timestamp > toTs) return false;
    if (search !== '') {
      const haystack = `${bet.game} ${bet.status ?? ''} ${bet.id} ${bet.betId} ${bet.currency} ${bet.outcome}`;
      if (!haystack.toLowerCase().includes(search)) return false;
    }
    return true;
  });
}

/** Everything the dashboard renders, for one currency. */
export interface DashboardData {
  currency: string;
  bets: BetRecord[];
  overview: ReturnType<typeof calculateOverview>;
  equity: ReturnType<typeof buildEquityCurve>;
  drawdown: ReturnType<typeof calculateDrawdown>;
  streaks: ReturnType<typeof calculateStreaks>;
  byGame: ReturnType<typeof groupByGame>;
  byStake: ReturnType<typeof groupByStakeRange>;
  byHour: ReturnType<typeof groupByHour>;
  byWeekday: ReturnType<typeof groupByWeekday>;
  time: ReturnType<typeof calculateTimeStats>;
  sportsbook: ReturnType<typeof calculateSportsbookStats>;
  crash: ReturnType<typeof calculateCrashStats>;
  plinko: ReturnType<typeof calculatePlinkoStats>;
  mines: ReturnType<typeof calculateMinesStats>;
  profile: ReturnType<typeof generateProfile>;
  /** Shared-precision amount formatter for this currency's scale. */
  formatAmount: (value: number) => string;
}

/**
 * Computes every dashboard metric for one currency's bets.
 *
 * Kept outside the hook so it can be called from tests directly.
 */
export function buildDashboardData(bets: BetRecord[], currency: string): DashboardData {
  const overview = calculateOverview(bets, currency);
  const drawdown = calculateDrawdown(bets);
  const streaks = calculateStreaks(bets);
  const byGame = groupByGame(bets);
  const time = calculateTimeStats(bets);

  // One precision for every figure in this currency, so columns align. The
  // extremes of the stake range drive it, so a single pass over the bets is
  // enough however large the archive is.
  let smallestStake = Number.POSITIVE_INFINITY;
  for (const bet of bets) {
    if (bet.stake > 0 && bet.stake < smallestStake) smallestStake = bet.stake;
  }
  const formatAmount = makeAmountFormatter([
    overview.wagered,
    overview.returned,
    overview.netPnl,
    overview.largestWin,
    overview.largestLoss,
    Number.isFinite(smallestStake) ? smallestStake : 0,
  ]);

  return {
    currency,
    bets,
    overview,
    equity: buildEquityCurve(bets),
    drawdown,
    streaks,
    byGame,
    byStake: groupByStakeRange(bets),
    byHour: groupByHour(bets),
    byWeekday: groupByWeekday(bets),
    time,
    sportsbook: calculateSportsbookStats(bets),
    crash: calculateCrashStats(bets),
    plinko: calculatePlinkoStats(bets),
    mines: calculateMinesStats(bets),
    profile: generateProfile({
      bets,
      overview,
      byGame,
      drawdown,
      streaks,
      time,
      currency,
      formatAmount,
    }),
    formatAmount,
  };
}

/** Reads a File as text without ever putting it on the network. */
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('The file could not be read from disk.'));
    reader.readAsText(file);
  });
}

export function useArchive() {
  const [state, setState] = useState<LoadState>({ status: 'idle' });
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [currency, setCurrency] = useState<string | null>(null);
  const [periodBucket, setPeriodBucket] = useState<TimeBucket>('day');

  const loadFile = useCallback(async (file: File) => {
    setState({ status: 'loading', fileName: file.name });
    // Yield a frame so the loading state paints before the parse blocks.
    await new Promise((resolve) => setTimeout(resolve, 120));

    try {
      const text = await readFileAsText(file);
      const started = performance.now();
      const result = parseStakeArchive(text);
      const parseMs = performance.now() - started;

      if (result.bets.length === 0) {
        setState({
          status: 'error',
          message: 'No usable bets in this archive.',
          detail:
            `All ${result.quality.totalRecords} record(s) were excluded. ` +
            Object.entries(result.quality.byReason)
              .filter(([, n]) => n > 0)
              .map(([reason, n]) => `${n} ${reason}`)
              .join(', ') +
            '.',
        });
        return;
      }

      setFilters(EMPTY_FILTERS);
      setCurrency(result.quality.currencies[0] ?? null);
      setState({
        status: 'ready',
        result,
        meta: { fileName: file.name, fileSize: file.size, loadedAt: new Date(), parseMs },
      });
    } catch (err) {
      if (err instanceof ArchiveParseError) {
        setState({ status: 'error', message: err.message, detail: err.detail });
      } else {
        setState({
          status: 'error',
          message: 'Something went wrong while reading this file.',
          detail: err instanceof Error ? err.message : undefined,
        });
      }
    }
  }, []);

  const reset = useCallback(() => {
    setState({ status: 'idle' });
    setFilters(EMPTY_FILTERS);
    setCurrency(null);
  }, []);

  const parsed = state.status === 'ready' ? state.result : null;

  /** Bets in the selected currency, before dashboard filters. */
  const currencyBets = useMemo(() => {
    if (!parsed) return [];
    if (!currency) return parsed.bets;
    return parsed.bets.filter((b) => b.currency === currency);
  }, [parsed, currency]);

  const filteredBets = useMemo(
    () => applyFilters(currencyBets, filters),
    [currencyBets, filters],
  );

  const data = useMemo(
    () => (parsed && currency ? buildDashboardData(filteredBets, currency) : null),
    [parsed, currency, filteredBets],
  );

  const periods = useMemo(
    () => (data ? groupByDate(data.bets, periodBucket) : []),
    [data, periodBucket],
  );

  /** Per-currency totals, so multi-currency archives can be switched between. */
  const currencyTotals = useMemo(() => {
    if (!parsed) return [];
    const map = new Map<string, { bets: number; wagered: number; netPnl: number }>();
    for (const bet of parsed.bets) {
      const entry = map.get(bet.currency) ?? { bets: 0, wagered: 0, netPnl: 0 };
      entry.bets += 1;
      entry.wagered += bet.stake;
      entry.netPnl += bet.profit;
      map.set(bet.currency, entry);
    }
    return [...map.entries()]
      .map(([code, totals]) => ({ currency: code, ...totals }))
      .sort((a, b) => b.bets - a.bets);
  }, [parsed]);

  const isFiltered = useMemo(
    () =>
      filters.games.length > 0 ||
      filters.outcomes.length > 0 ||
      filters.from !== null ||
      filters.to !== null ||
      filters.search.trim() !== '',
    [filters],
  );

  return {
    state,
    loadFile,
    reset,
    filters,
    setFilters,
    isFiltered,
    clearFilters: useCallback(() => setFilters(EMPTY_FILTERS), []),
    currency,
    setCurrency,
    currencyTotals,
    currencyBets,
    data,
    periods,
    periodBucket,
    setPeriodBucket,
  };
}
