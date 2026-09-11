/**
 * Archive loading, filtering and derived analytics.
 *
 * Parsing happens in this module and nowhere else. Files are read with the
 * FileReader API and parsed in memory, no network request is ever made with
 * their contents. (The optional INR conversion does make one request, for
 * currency rates only; see `src/utils/currency.ts`.)
 */

import { useCallback, useMemo, useState } from 'react';
import { parseArchiveBundle, type FileInput } from '@/parsers/bundle';
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
import { useRates } from './useRates';
import { convertBets, INR } from '@/utils/currency';
import type { ArchiveBundle, BetOutcome, BetRecord } from '@/types';
import { makeAmountFormatter } from '@/utils/format';

/** Metadata about the loaded upload, shown in the header. */
export interface ArchiveMeta {
  /** `bet-archive.json` for one file, `4 files` for several. */
  label: string;
  fileCount: number;
  totalSize: number;
  loadedAt: Date;
  parseMs: number;
}

export type LoadState =
  | { status: 'idle' }
  | { status: 'loading'; label: string; total: number; done: number }
  | { status: 'error'; message: string; detail?: string }
  | { status: 'ready'; bundle: ArchiveBundle; meta: ArchiveMeta };

/** Dashboard-wide filters. All of them recompute every metric below. */
export interface Filters {
  games: string[];
  outcomes: BetOutcome[];
  /** Source file ids; empty means every file. */
  files: string[];
  from: Date | null;
  to: Date | null;
  search: string;
}

export const EMPTY_FILTERS: Filters = {
  games: [],
  outcomes: [],
  files: [],
  from: null,
  to: null,
  search: '',
};

/** Applies the dashboard filters. Pure, so it is trivially memoisable. */
export function applyFilters(bets: BetRecord[], filters: Filters): BetRecord[] {
  const games = new Set(filters.games);
  const outcomes = new Set(filters.outcomes);
  const files = new Set(filters.files);
  const search = filters.search.trim().toLowerCase();
  const fromTs = filters.from ? filters.from.getTime() : null;
  // Widened to the end of the local day so a range reads inclusively.
  const toTs = filters.to
    ? new Date(filters.to.getFullYear(), filters.to.getMonth(), filters.to.getDate() + 1).getTime() - 1
    : null;

  if (
    games.size === 0 &&
    outcomes.size === 0 &&
    files.size === 0 &&
    fromTs === null &&
    toTs === null &&
    search === ''
  ) {
    return bets;
  }

  return bets.filter((bet) => {
    if (games.size > 0 && !games.has(bet.game)) return false;
    if (outcomes.size > 0 && !outcomes.has(bet.outcome)) return false;
    if (files.size > 0 && !files.has(bet.sourceFileId)) return false;
    if (fromTs !== null && bet.timestamp < fromTs) return false;
    if (toTs !== null && bet.timestamp > toTs) return false;
    if (search !== '') {
      const haystack = `${bet.game} ${bet.status ?? ''} ${bet.id} ${bet.betId} ${bet.currency} ${bet.outcome} ${bet.sourceFileName}`;
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
  formatAmount: (value: number) => string;
}

/** Computes every dashboard metric for one currency's bets. */
export function buildDashboardData(bets: BetRecord[], currency: string): DashboardData {
  const overview = calculateOverview(bets, currency);
  const drawdown = calculateDrawdown(bets);
  const streaks = calculateStreaks(bets);
  const byGame = groupByGame(bets);
  const time = calculateTimeStats(bets);

  // One precision for every figure in this currency, so columns align. The
  // extremes of the stake range drive it, so a single pass is enough however
  // large the archive is.
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
    reader.onerror = () => reject(new Error(`${file.name} could not be read from disk.`));
    reader.readAsText(file);
  });
}

export function useArchive() {
  const [state, setState] = useState<LoadState>({ status: 'idle' });
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [currency, setCurrency] = useState<string | null>(null);
  const [periodBucket, setPeriodBucket] = useState<TimeBucket>('day');

  const bundle = state.status === 'ready' ? state.bundle : null;
  const rates = useRates(bundle?.quality.currencies ?? []);

  const loadFiles = useCallback(async (fileList: File[]) => {
    const files = fileList.filter((f) => f.size > 0);
    if (files.length === 0) {
      setState({ status: 'error', message: 'No files were selected.' });
      return;
    }

    const label = files.length === 1 ? files[0].name : `${files.length} files`;
    setState({ status: 'loading', label, total: files.length, done: 0 });

    try {
      const inputs: FileInput[] = [];
      for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        const text = await readFileAsText(file);
        inputs.push({ id: `${i}-${file.name}-${file.size}`, name: file.name, size: file.size, text });
        setState({ status: 'loading', label, total: files.length, done: i + 1 });
        // Yield between files so the progress readout actually paints.
        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      const started = performance.now();
      const parsed = parseArchiveBundle(inputs);
      const parseMs = performance.now() - started;

      if (parsed.bets.length === 0) {
        const firstError = parsed.failed[0]?.error;
        setState({
          status: 'error',
          message:
            parsed.failed.length === files.length
              ? firstError?.message ?? 'None of these files could be read.'
              : 'No usable bets in these files.',
          detail:
            parsed.failed.length === files.length
              ? firstError?.detail
              : `${parsed.quality.totalRecords} record(s) were read and all were excluded: ` +
                Object.entries(parsed.quality.byReason)
                  .filter(([, n]) => n > 0)
                  .map(([reason, n]) => `${n} ${reason}`)
                  .join(', ') +
                '.',
        });
        return;
      }

      setFilters(EMPTY_FILTERS);
      // Open on the currency the history is actually denominated in, not the
      // alphabetically first one, a few INR bets alongside hundreds in USDC
      // should not decide the default view.
      const counts = new Map<string, number>();
      for (const bet of parsed.bets) counts.set(bet.currency, (counts.get(bet.currency) ?? 0) + 1);
      const busiest = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      setCurrency(busiest ?? parsed.quality.currencies[0] ?? null);
      setState({
        status: 'ready',
        bundle: parsed,
        meta: {
          label,
          fileCount: files.length,
          totalSize: files.reduce((sum, f) => sum + f.size, 0),
          loadedAt: new Date(),
          parseMs,
        },
      });
    } catch (err) {
      setState({
        status: 'error',
        message: 'Something went wrong while reading these files.',
        detail: err instanceof Error ? err.message : undefined,
      });
    }
  }, []);

  const reset = useCallback(() => {
    setState({ status: 'idle' });
    setFilters(EMPTY_FILTERS);
    setCurrency(null);
    rates.setEnabled(false);
  }, [rates]);

  /**
   * Bets in the active denomination.
   *
   * With conversion on, every currency is rewritten into INR and the whole
   * archive becomes one ledger. With it off, exactly one recorded currency is
   * shown at a time, denominations are never mixed.
   */
  const { currencyBets, unconvertible } = useMemo(() => {
    if (!bundle) return { currencyBets: [] as BetRecord[], unconvertible: [] as BetRecord[] };
    if (rates.enabled && rates.table) {
      const { converted, unconvertible: skipped } = convertBets(bundle.bets, rates.table);
      return { currencyBets: converted, unconvertible: skipped };
    }
    if (!currency) return { currencyBets: bundle.bets, unconvertible: [] as BetRecord[] };
    return {
      currencyBets: bundle.bets.filter((b) => b.currency === currency),
      unconvertible: [] as BetRecord[],
    };
  }, [bundle, currency, rates.enabled, rates.table]);

  const activeCurrency = rates.enabled && rates.table ? INR : currency;

  const filteredBets = useMemo(() => applyFilters(currencyBets, filters), [currencyBets, filters]);

  const data = useMemo(
    () => (bundle && activeCurrency ? buildDashboardData(filteredBets, activeCurrency) : null),
    [bundle, activeCurrency, filteredBets],
  );

  const periods = useMemo(
    () => (data ? groupByDate(data.bets, periodBucket) : []),
    [data, periodBucket],
  );

  /** Per-currency totals, so a multi-currency archive can be switched between. */
  const currencyTotals = useMemo(() => {
    if (!bundle) return [];
    const map = new Map<string, { bets: number; wagered: number; netPnl: number }>();
    for (const bet of bundle.bets) {
      const entry = map.get(bet.currency) ?? { bets: 0, wagered: 0, netPnl: 0 };
      entry.bets += 1;
      entry.wagered += bet.stake;
      entry.netPnl += bet.profit;
      map.set(bet.currency, entry);
    }
    return [...map.entries()]
      .map(([code, totals]) => ({ currency: code, ...totals }))
      .sort((a, b) => b.bets - a.bets);
  }, [bundle]);

  /** Headline figures per uploaded file, in that file's own currency terms. */
  const fileStats = useMemo(() => {
    if (!bundle) return [];
    return bundle.files.map((file) => {
      const bets = rates.enabled && rates.table ? convertBets(file.bets, rates.table).converted : file.bets;
      const scoped = activeCurrency ? bets.filter((b) => b.currency === activeCurrency) : bets;
      const wagered = scoped.reduce((s, b) => s + b.stake, 0);
      const returned = scoped.reduce((s, b) => s + b.payout, 0);
      const wins = scoped.filter((b) => b.outcome === 'win').length;
      const losses = scoped.filter((b) => b.outcome === 'loss').length;
      return {
        file,
        bets: scoped.length,
        wagered,
        returned,
        netPnl: returned - wagered,
        roi: wagered > 0 ? ((returned - wagered) / wagered) * 100 : null,
        winRate: wins + losses > 0 ? (wins / (wins + losses)) * 100 : null,
      };
    });
  }, [bundle, rates.enabled, rates.table, activeCurrency]);

  const isFiltered = useMemo(
    () =>
      filters.games.length > 0 ||
      filters.outcomes.length > 0 ||
      filters.files.length > 0 ||
      filters.from !== null ||
      filters.to !== null ||
      filters.search.trim() !== '',
    [filters],
  );

  return {
    state,
    loadFiles,
    reset,
    filters,
    setFilters,
    isFiltered,
    clearFilters: useCallback(() => setFilters(EMPTY_FILTERS), []),
    currency: activeCurrency,
    recordedCurrency: currency,
    setCurrency,
    currencyTotals,
    currencyBets,
    unconvertible,
    fileStats,
    rates,
    data,
    periods,
    periodBucket,
    setPeriodBucket,
  };
}
