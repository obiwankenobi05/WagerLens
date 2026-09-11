import { Search, X } from 'lucide-react';
import type { Filters } from '@/hooks/useArchive';
import type { BetOutcome, DataQuality } from '@/types';
import { cx, formatCount, fromDateInputValue, toDateInputValue } from '@/utils/format';

const OUTCOMES: Array<{ value: BetOutcome; label: string }> = [
  { value: 'win', label: 'Wins' },
  { value: 'loss', label: 'Losses' },
  { value: 'push', label: 'Pushes' },
];

/**
 * Global dashboard filters.
 *
 * Every control here narrows the same bet array, and every metric on the page
 * is recomputed from that array — there is no separate "filtered" pipeline to
 * fall out of step with the headline figures.
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
  const toggleGame = (game: string) => {
    const games = filters.games.includes(game)
      ? filters.games.filter((g) => g !== game)
      : [...filters.games, game];
    onChange({ ...filters, games });
  };

  const toggleOutcome = (outcome: BetOutcome) => {
    const outcomes = filters.outcomes.includes(outcome)
      ? filters.outcomes.filter((o) => o !== outcome)
      : [...filters.outcomes, outcome];
    onChange({ ...filters, outcomes });
  };

  return (
    <div className="wl-panel wl-themed sticky top-[52px] z-20 bg-surface">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 px-3 py-2.5 sm:px-4">
        <div className="flex items-center gap-2">
          <span className="wl-meta text-accent">00</span>
          <span className="wl-label-strong">Filters</span>
        </div>

        {/* Game chips */}
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by game">
          {quality.games.map((game) => {
            const active = filters.games.includes(game);
            return (
              <button
                key={game}
                type="button"
                aria-pressed={active}
                onClick={() => toggleGame(game)}
                className={cx(
                  'border px-2 py-1 font-mono text-2xs uppercase tracking-[0.1em] transition-colors duration-150',
                  active
                    ? 'border-line-strong bg-ink text-paper'
                    : 'border-line text-muted hover:border-line-strong hover:text-ink',
                )}
              >
                {gameLabels.get(game) ?? game}
              </button>
            );
          })}
        </div>

        <span aria-hidden className="hidden h-4 w-px bg-line sm:block" />

        {/* Outcome chips */}
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by outcome">
          {OUTCOMES.map((outcome) => {
            const active = filters.outcomes.includes(outcome.value);
            return (
              <button
                key={outcome.value}
                type="button"
                aria-pressed={active}
                onClick={() => toggleOutcome(outcome.value)}
                className={cx(
                  'border px-2 py-1 font-mono text-2xs uppercase tracking-[0.1em] transition-colors duration-150',
                  active
                    ? 'border-line-strong bg-ink text-paper'
                    : 'border-line text-muted hover:border-line-strong hover:text-ink',
                )}
              >
                {outcome.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-1 flex-wrap items-center justify-end gap-x-3 gap-y-2">
          {/* Date range */}
          {range && (
            <div className="flex items-center gap-1.5">
              <label className="flex items-center gap-1.5">
                <span className="wl-meta">From</span>
                <input
                  type="date"
                  className="wl-input w-auto py-1 text-[11px]"
                  min={toDateInputValue(range.from)}
                  max={toDateInputValue(range.to)}
                  value={filters.from ? toDateInputValue(filters.from) : ''}
                  onChange={(event) =>
                    onChange({ ...filters, from: fromDateInputValue(event.target.value) })
                  }
                />
              </label>
              <label className="flex items-center gap-1.5">
                <span className="wl-meta">To</span>
                <input
                  type="date"
                  className="wl-input w-auto py-1 text-[11px]"
                  min={toDateInputValue(range.from)}
                  max={toDateInputValue(range.to)}
                  value={filters.to ? toDateInputValue(filters.to) : ''}
                  onChange={(event) =>
                    onChange({ ...filters, to: fromDateInputValue(event.target.value) })
                  }
                />
              </label>
            </div>
          )}

          {/* Search */}
          <label className="relative flex min-w-[150px] flex-1 items-center sm:max-w-[220px] sm:flex-none">
            <span className="sr-only">Search bets</span>
            <Search
              size={12}
              strokeWidth={2}
              aria-hidden
              className="pointer-events-none absolute left-2 text-faint"
            />
            <input
              type="search"
              className="wl-input py-1 pl-7 text-[11px]"
              placeholder="Search game, status, id…"
              value={filters.search}
              onChange={(event) => onChange({ ...filters, search: event.target.value })}
            />
          </label>

          {isFiltered && (
            <button type="button" className="wl-button" onClick={onClear}>
              <X size={11} strokeWidth={2} aria-hidden />
              Clear
            </button>
          )}
        </div>
      </div>

      {isFiltered && (
        <p
          className="border-t border-line px-3 py-1.5 font-mono text-[11px] text-muted sm:px-4"
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
