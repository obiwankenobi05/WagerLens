import { useState } from 'react';
import { Header } from './Header';
import { FilterBar } from './FilterBar';
import { OverviewSection } from './OverviewSection';
import { DrawdownSection, PnlSection, StreakSection } from './PerformanceSection';
import { GameBreakdown } from './GameBreakdown';
import { SportsbookSection } from './games/SportsbookSection';
import { CrashSection } from './games/CrashSection';
import { PlinkoSection } from './games/PlinkoSection';
import { MinesSection } from './games/MinesSection';
import { TimeSection } from './TimeSection';
import { ProfileSection } from './ProfileSection';
import { HistoryExplorer } from './HistoryExplorer';
import type { PnlMode } from '@/charts/PnlChart';
import type { Theme } from '@/hooks/useTheme';
import type { useArchive } from '@/hooks/useArchive';
import type { ArchiveMeta } from '@/hooks/useArchive';
import type { ParseResult } from '@/types';
import { formatCount } from '@/utils/format';

type Archive = ReturnType<typeof useArchive>;

interface DashboardProps {
  archive: Archive;
  result: ParseResult;
  meta: ArchiveMeta;
  theme: Theme;
  onToggleTheme: () => void;
}

function Dashboard({ archive, result, meta, theme, onToggleTheme }: DashboardProps) {
  const [pnlMode, setPnlMode] = useState<PnlMode>('cumulative');
  const { data, currency, currencyBets, periods, periodBucket, setPeriodBucket } = archive;

  if (!data || !currency) return null;

  const gameLabels = new Map(result.bets.map((bet) => [bet.game, bet.gameLabel]));
  const gamesPresent = new Set(data.bets.map((bet) => bet.game));

  // Period granularity is driven by the chart's own mode switch.
  const onModeChange = (mode: PnlMode) => {
    setPnlMode(mode);
    if (mode !== 'cumulative' && mode !== periodBucket) setPeriodBucket(mode);
  };

  return (
    <div className="min-h-dvh bg-paper">
      <Header
        meta={meta}
        quality={result.quality}
        theme={theme}
        onToggleTheme={onToggleTheme}
        onReset={archive.reset}
        currencies={archive.currencyTotals}
        currency={currency}
        onCurrencyChange={archive.setCurrency}
      />

      <main className="mx-auto flex max-w-[1440px] flex-col gap-4 px-4 py-4 sm:px-6 sm:py-5">
        <FilterBar
          filters={archive.filters}
          onChange={archive.setFilters}
          onClear={archive.clearFilters}
          quality={result.quality}
          gameLabels={gameLabels}
          range={result.range}
          shown={data.bets.length}
          total={currencyBets.length}
          isFiltered={archive.isFiltered}
        />

        {data.bets.length === 0 ? (
          <div className="wl-panel px-4 py-12 text-center">
            <p className="text-sm text-ink">No bets match the current filters.</p>
            <p className="mx-auto mt-2 max-w-[46ch] text-[11px] leading-relaxed text-muted">
              {formatCount(currencyBets.length)} bets are available in{' '}
              {currency.toUpperCase()}. Widen the date range or clear a game filter to bring them
              back.
            </p>
            <button type="button" className="wl-button mt-4" onClick={archive.clearFilters}>
              Clear filters
            </button>
          </div>
        ) : (
          <div className="flex min-w-0 flex-col gap-4">
            <OverviewSection
              overview={data.overview}
              formatAmount={data.formatAmount}
              filtered={archive.isFiltered}
            />

            <PnlSection
              mode={pnlMode}
              onModeChange={onModeChange}
              equity={data.equity}
              periods={periods}
              currency={currency}
              formatAmount={data.formatAmount}
            />

            <div className="grid min-w-0 gap-4 xl:grid-cols-2">
              <DrawdownSection
                drawdown={data.drawdown}
                equity={data.equity}
                currency={currency}
                formatAmount={data.formatAmount}
              />
              <StreakSection streaks={data.streaks} />
            </div>

            <GameBreakdown
              rows={data.byGame}
              currency={currency}
              formatAmount={data.formatAmount}
            />

            <ProfileSection insights={data.profile} />

            {/* Game panels render only for games present in the selection, so
                the page never fills with empty sections. */}
            {gamesPresent.has('sportsbook') && (
              <SportsbookSection
                stats={data.sportsbook}
                currency={currency}
                formatAmount={data.formatAmount}
              />
            )}
            {gamesPresent.has('crash') && (
              <CrashSection stats={data.crash} currency={currency} formatAmount={data.formatAmount} />
            )}
            {gamesPresent.has('plinko') && (
              <PlinkoSection
                stats={data.plinko}
                currency={currency}
                formatAmount={data.formatAmount}
              />
            )}
            {gamesPresent.has('mines') && (
              <MinesSection stats={data.mines} currency={currency} formatAmount={data.formatAmount} />
            )}

            <TimeSection
              time={data.time}
              byHour={data.byHour}
              byWeekday={data.byWeekday}
              currency={currency}
              formatAmount={data.formatAmount}
            />

            <HistoryExplorer
              bets={data.bets}
              currency={currency}
              formatAmount={data.formatAmount}
              totalBets={currencyBets.length}
            />
          </div>
        )}

        <footer className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 pb-2">
          <p className="wl-meta">WagerLens · parsed locally · nothing uploaded</p>
          <p className="max-w-[60ch] text-[11px] leading-relaxed text-faint">
            An analytics tool, not betting advice. Historical results do not predict future
            outcomes.
          </p>
        </footer>
      </main>
    </div>
  );
}

export default Dashboard;
