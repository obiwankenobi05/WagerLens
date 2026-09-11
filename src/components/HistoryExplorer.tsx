import { Fragment, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Panel } from './ui/Panel';
import { Segmented } from './ui/Segmented';
import { BetCard, BetDetails } from './BetDetails';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import type { BetRecord } from '@/types';
import { cx, formatCount, formatDateTime, formatMultiplier, formatTime } from '@/utils/format';

type SortKey = 'time' | 'stake' | 'payout' | 'profit' | 'multiplier' | 'game';
type SortDirection = 'asc' | 'desc';

const PAGE_SIZES = [25, 50, 100, 250] as const;

const SORT_VALUES: Record<SortKey, (bet: BetRecord) => number | string> = {
  time: (bet) => bet.timestamp,
  stake: (bet) => bet.stake,
  payout: (bet) => bet.payout,
  profit: (bet) => bet.profit,
  // Bets without a multiplier sort below every bet that has one.
  multiplier: (bet) => bet.payoutMultiplier ?? Number.NEGATIVE_INFINITY,
  game: (bet) => bet.gameLabel,
};

const COLUMNS: Array<{
  key: SortKey | 'expand' | 'status';
  header: string;
  align?: 'right';
  hideOnMobile?: boolean;
  sortable?: boolean;
  title?: string;
}> = [
  { key: 'time', header: 'Time', sortable: true },
  { key: 'game', header: 'Game', sortable: true },
  { key: 'stake', header: 'Stake', align: 'right', sortable: true },
  { key: 'payout', header: 'Payout', align: 'right', sortable: true, hideOnMobile: true },
  { key: 'profit', header: 'P&L', align: 'right', sortable: true },
  {
    key: 'multiplier',
    header: 'Mult / odds',
    align: 'right',
    sortable: true,
    hideOnMobile: true,
    title: 'Realised payout multiplier: payout divided by stake',
  },
  { key: 'status', header: 'Result', hideOnMobile: true },
  { key: 'expand', header: '' },
];

/**
 * The full ledger.
 *
 * Paginated rather than virtualised: only a page of rows is ever mounted, which
 * keeps a 50,000-row archive as responsive as a 200-row one while leaving the
 * table semantics (and therefore screen-reader and find-in-page behaviour)
 * intact.
 */
export function HistoryExplorer({
  bets,
  currency,
  formatAmount,
  totalBets,
}: {
  bets: BetRecord[];
  currency: string;
  formatAmount: (value: number) => string;
  totalBets: number;
}) {
  const [sortKey, setSortKey] = useState<SortKey>('time');
  const [direction, setDirection] = useState<SortDirection>('desc');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(25);
  const [expanded, setExpanded] = useState<string | null>(null);
  const compact = useMediaQuery('(max-width: 640px)');
  const code = currency.toUpperCase();

  const sorted = useMemo(() => {
    const read = SORT_VALUES[sortKey];
    const sign = direction === 'asc' ? 1 : -1;
    return [...bets].sort((a, b) => {
      const av = read(a);
      const bv = read(b);
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * sign;
      return String(av).localeCompare(String(bv)) * sign;
    });
  }, [bets, sortKey, direction]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));

  // A filter change can leave the viewer past the end of the new result set.
  useEffect(() => {
    if (page > pageCount - 1) setPage(0);
  }, [page, pageCount]);

  const pageRows = useMemo(
    () => sorted.slice(page * pageSize, page * pageSize + pageSize),
    [sorted, page, pageSize],
  );

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setDirection('desc');
    }
    setPage(0);
  };

  const start = sorted.length === 0 ? 0 : page * pageSize + 1;
  const end = Math.min(sorted.length, (page + 1) * pageSize);

  return (
    <Panel
      index="13"
      label="Bet history"
      actions={
        <>
          <span className="wl-meta hidden sm:inline">
            {formatCount(bets.length)}
            {bets.length !== totalBets && ` of ${formatCount(totalBets)}`} bets
          </span>
          <Segmented
            label="Rows per page"
            value={String(pageSize)}
            onChange={(value) => {
              setPageSize(Number(value) as (typeof PAGE_SIZES)[number]);
              setPage(0);
            }}
            options={PAGE_SIZES.map((size) => ({ value: String(size), label: String(size) }))}
          />
        </>
      }
      note="Select a row to expand the full record, including the raw archive entry."
    >
      {sorted.length === 0 ? (
        <div className="border border-dashed border-line px-4 py-8 text-center text-[11px] text-muted">
          No bets match the current filters. Clear a filter above to see the ledger.
        </div>
      ) : compact ? (
        <ul className="-mx-3 border-t border-line">
          {pageRows.map((bet) => (
            <BetCard
              key={bet.id}
              bet={bet}
              formatAmount={formatAmount}
              expanded={expanded === bet.id}
              onToggle={() => setExpanded((id) => (id === bet.id ? null : bet.id))}
            />
          ))}
        </ul>
      ) : (
        <div className="-mx-3 overflow-x-auto sm:mx-0">
          <table className="wl-table">
            <caption className="sr-only">
              Bet history, {formatCount(sorted.length)} rows, showing {start} to {end}
            </caption>
            <thead>
              <tr>
                {COLUMNS.map((column) => {
                  const active = column.sortable && sortKey === column.key;
                  return (
                    <th
                      key={column.key}
                      scope="col"
                      title={column.title}
                      aria-sort={
                        active ? (direction === 'asc' ? 'ascending' : 'descending') : undefined
                      }
                      className={cx(
                        column.align === 'right' && 'text-right',
                        column.hideOnMobile && 'hidden md:table-cell',
                      )}
                    >
                      {column.sortable ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(column.key as SortKey)}
                          className={cx(
                            'wl-sortable font-mono uppercase tracking-[0.12em]',
                            active && 'text-ink',
                          )}
                        >
                          {column.header}
                          {active && <span aria-hidden> {direction === 'asc' ? '↑' : '↓'}</span>}
                        </button>
                      ) : (
                        <span className={column.key === 'expand' ? 'sr-only' : undefined}>
                          {column.key === 'expand' ? 'Details' : column.header}
                        </span>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((bet) => {
                const open = expanded === bet.id;
                return (
                  <Fragment key={bet.id}>
                    <tr
                      className={cx('cursor-pointer', open && 'bg-ink/[0.04]')}
                      onClick={() => setExpanded((id) => (id === bet.id ? null : bet.id))}
                    >
                      <td className="text-muted">
                        <span className="hidden lg:inline">{formatDateTime(bet.placedAt)}</span>
                        <span className="lg:hidden">{formatTime(bet.placedAt)}</span>
                      </td>
                      <td className="font-mono text-ink">{bet.gameLabel}</td>
                      <td className="tnum text-right font-mono">{formatAmount(bet.stake)}</td>
                      <td className="tnum hidden text-right font-mono md:table-cell">
                        {formatAmount(bet.payout)}
                      </td>
                      <td
                        className={cx(
                          'tnum text-right font-mono',
                          bet.profit > 0 && 'wl-pos',
                          bet.profit < 0 && 'wl-neg',
                        )}
                      >
                        <span aria-hidden>{bet.profit > 0 ? '+' : bet.profit < 0 ? '−' : ''}</span>
                        {formatAmount(Math.abs(bet.profit))}
                      </td>
                      <td className="tnum hidden text-right font-mono text-muted md:table-cell">
                        {formatMultiplier(bet.payoutMultiplier)}
                      </td>
                      <td className="hidden md:table-cell">
                        <span
                          className={cx(
                            'font-mono text-[11px] uppercase tracking-[0.08em]',
                            bet.outcome === 'win' && 'wl-pos',
                            bet.outcome === 'loss' && 'text-muted',
                            bet.outcome === 'push' && 'text-faint',
                          )}
                        >
                          {bet.status ?? bet.outcome}
                        </span>
                      </td>
                      <td className="w-8 text-right">
                        <button
                          type="button"
                          aria-expanded={open}
                          aria-label={`${open ? 'Hide' : 'Show'} details for the ${bet.gameLabel} bet at ${formatDateTime(bet.placedAt)}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setExpanded((id) => (id === bet.id ? null : bet.id));
                          }}
                          className="flex min-h-[32px] min-w-[32px] items-center justify-center text-muted transition-colors hover:text-ink"
                        >
                          <ChevronDown
                            size={12}
                            strokeWidth={2}
                            aria-hidden
                            className={cx('transition-transform duration-200', open && 'rotate-180')}
                          />
                        </button>
                      </td>
                    </tr>
                    {open && (
                      <tr>
                        <td colSpan={COLUMNS.length} className="p-0">
                          <BetDetails bet={bet} formatAmount={formatAmount} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {sorted.length > 0 && (
        <nav
          className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3"
          aria-label="Bet history pagination"
        >
          <p className="wl-meta" role="status" aria-live="polite">
            {formatCount(start)}-{formatCount(end)} of {formatCount(sorted.length)} · {code}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="wl-button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              <ChevronLeft size={11} strokeWidth={2} aria-hidden />
              <span className="sr-only sm:not-sr-only">Previous</span>
            </button>
            <span className="wl-meta tnum">
              {page + 1} / {pageCount}
            </span>
            <button
              type="button"
              className="wl-button"
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={page >= pageCount - 1}
            >
              <span className="sr-only sm:not-sr-only">Next</span>
              <ChevronRight size={11} strokeWidth={2} aria-hidden />
            </button>
          </div>
        </nav>
      )}
    </Panel>
  );
}
