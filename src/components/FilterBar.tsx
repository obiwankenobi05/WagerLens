import { useState } from 'react';
import { ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react';
import type { Filters } from '@/hooks/useArchive';
import type { BetOutcome, DataQuality } from '@/types';
import { cx, formatCount, fromDateInputValue, toDateInputValue } from '@/utils/format';

const OUTCOMES: Array<{ value: BetOutcome; label: string }> = [
  { value: 'win', label: 'Wins' },
  { value: 'loss', label: 'Losses' },
  { value: 'push', label: 'Pushes' },
];

/** Chip toggle used for both game and outcome filters. */
function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        'min-h-[32px] border px-2.5 py-1 font-mono text-2xs uppercase tracking-[0.1em]',
        'transition-all duration-200 ease-instrument active:scale-[0.97]',
        active
          ? 'border-line-strong bg-ink text-paper'
          : 'border-line text-muted hover:border-line-strong hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}

/**
 * Global dashboard filters.
 *
 * Every control narrows the same bet array, and every metric on the page is
 * recomputed from it, there is no separate "filtered" pipeline that could
 * drift from the headline figures.
 *
 * On phones the controls collapse behind a single button, because a permanently
 * expanded filter bar costs more vertical space than the chart it sits above.
 */
export function FilterBar({
  filters,
  onChange,
  onClear,
  quality,
  gameLabels,
  range,
  shown,
  total,
  isFiltered,
}: {
  filters: Filters;
  onChange: (filters: Filters) => void;
  onClear: () => void;
  quality: DataQuality;
  gameLabels: Map<string, string>;
  range: { from: Date; to: Date } | null;
  shown: number;
  total: number;
  isFiltered: boolean;
}) {
  const [open, setOpen] = useState(false);

  const activeCount =
    filters.games.length +
    filters.outcomes.length +
    filters.files.length +
    (filters.from ? 1 : 0) +
    (filters.to ? 1 : 0) +
    (filters.search.trim() ? 1 : 0);

  const toggleGame = (game: string) =>
    onChange({
      ...filters,
      games: filters.games.includes(game)
        ? filters.games.filter((g) => g !== game)
        : [...filters.games, game],
    });

  const toggleOutcome = (outcome: BetOutcome) =>
    onChange({
      ...filters,
      outcomes: filters.outcomes.includes(outcome)
        ? filters.outcomes.filter((o) => o !== outcome)
        : [...filters.outcomes, outcome],
    });

  const controls = (
    <>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by game">
        {quality.games.map((game) => (
          <Chip key={game} active={filters.games.includes(game)} onClick={() => toggleGame(game)}>
            {gameLabels.get(game) ?? game}
          </Chip>
        ))}
      </div>

      <span aria-hidden className="hidden h-4 w-px bg-line lg:block" />

      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by outcome">
        {OUTCOMES.map((outcome) => (
          <Chip
            key={outcome.value}
            active={filters.outcomes.includes(outcome.value)}
            onClick={() => toggleOutcome(outcome.value)}
          >
            {outcome.label}
          </Chip>
        ))}
      </div>

      <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-2 lg:justify-end">
        {range && (
          <div className="flex flex-wrap items-center gap-1.5">
            <label className="flex items-center gap-1.5">
              <span className="wl-meta">From</span>
              <input
                type="date"
                className="wl-input min-h-[32px] w-auto py-1 text-base sm:text-[11px]"
                min={toDateInputValue(range.from)}
                max={toDateInputValue(range.to)}
                value={filters.from ? toDateInputValue(filters.from) : ''}
                onChange={(event) => onChange({ ...filters, from: fromDateInputValue(event.target.value) })}
              />
            </label>
            <label className="flex items-center gap-1.5">
              <span className="wl-meta">To</span>
              <input
                type="date"
                className="wl-input min-h-[32px] w-auto py-1 text-base sm:text-[11px]"
                min={toDateInputValue(range.from)}
                max={toDateInputValue(range.to)}
                value={filters.to ? toDateInputValue(filters.to) : ''}
                onChange={(event) => onChange({ ...filters, to: fromDateInputValue(event.target.value) })}
              />
            </label>
          </div>
        )}

        <label className="relative flex min-w-[150px] flex-1 items-center lg:max-w-[220px] lg:flex-none">
          <span className="sr-only">Search bets</span>
          <Search size={12} strokeWidth={2} aria-hidden className="pointer-events-none absolute left-2 text-faint" />
          <input
            type="search"
            className="wl-input min-h-[32px] py-1 pl-7 text-base sm:text-[11px]"
            placeholder="Search game, file, status…"
            value={filters.search}
            onChange={(event) => onChange({ ...filters, search: event.target.value })}
          />
        </label>

        {isFiltered && (
          <button type="button" className="wl-button min-h-[32px]" onClick={onClear}>
            <X size={11} strokeWidth={2} aria-hidden />
            Clear
          </button>
        )}
      </div>
    </>
  );

  return (
    <div className="wl-panel wl-themed sticky top-[49px] z-20 bg-surface">
      {/* Phone: one compact row that expands. */}
      <div className="flex items-center justify-between gap-3 px-3 py-2 lg:hidden">
        <button
          type="button"
          className="wl-button min-h-[36px]"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <SlidersHorizontal size={11} strokeWidth={2} aria-hidden />
          Filters
          {activeCount > 0 && (
            <span className="ml-0.5 bg-accent px-1 text-[10px] text-paper tnum">{activeCount}</span>
          )}
          <ChevronDown
            size={11}
            strokeWidth={2}
            aria-hidden
            className={cx('transition-transform duration-300 ease-instrument', open && 'rotate-180')}
          />
        </button>
        <span className="wl-meta tnum truncate">
          {isFiltered ? `${formatCount(shown)} / ${formatCount(total)}` : `${formatCount(total)} bets`}
        </span>
      </div>

      <div
        className={cx(
          'grid transition-[grid-template-rows,opacity,visibility] duration-300 ease-instrument lg:hidden',
          open ? 'visible grid-rows-[1fr] opacity-100' : 'invisible grid-rows-[0fr] opacity-0',
        )}
      >
        <div className="overflow-hidden">
          <div className="flex flex-col gap-3 border-t border-line px-3 py-3">{controls}</div>
        </div>
      </div>

      {/* Desktop: everything inline. */}
      <div className="hidden flex-wrap items-center gap-x-4 gap-y-2.5 px-4 py-2.5 lg:flex">
        <div className="flex items-center gap-2">
          <span className="wl-meta text-accent">00</span>
          <span className="wl-label-strong">Filters</span>
        </div>
        {controls}
      </div>

      {isFiltered && (
        <p
          className="hidden border-t border-line px-4 py-1.5 font-mono text-[11px] text-muted lg:block"
          role="status"
          aria-live="polite"
        >
          Showing <span className="tnum text-ink">{formatCount(shown)}</span> of{' '}
          <span className="tnum">{formatCount(total)}</span> bets. Every figure below reflects this
          selection.
        </p>
      )}
    </div>
  );
}
