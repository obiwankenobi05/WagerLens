import { useCallback, useState } from 'react';
import { Header } from './Header';
import { FilterBar } from './FilterBar';
import { FilesPanel } from './FilesPanel';
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
import type { ArchiveMeta, useArchive } from '@/hooks/useArchive';
import type { ArchiveBundle } from '@/types';
import { formatCount } from '@/utils/format';

type Archive = ReturnType<typeof useArchive>;

interface DashboardProps {
  archive: Archive;
  bundle: ArchiveBundle;
  meta: ArchiveMeta;
  theme: Theme;
  onToggleTheme: () => void;
}

/** Wraps each section so it fades in as the dashboard assembles. */
function Section({ children, index }: { children: React.ReactNode; index: number }) {
  return (
    <div
      className="animate-rise-in"
      // Capped so a long dashboard does not take a second to finish appearing.
      style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
    >
      {children}
    </div>
  );
}

function Dashboard({ archive, bundle, meta, theme, onToggleTheme }: DashboardProps) {
  const [pnlMode, setPnlMode] = useState<PnlMode>('cumulative');
  const { data, currency, currencyBets, periods, periodBucket, setPeriodBucket, filters, setFilters } = archive;

  const toggleFile = useCallback(
    (id: string) =>
      setFilters((current) => ({
        ...current,
        files: current.files.includes(id)
          ? current.files.filter((f) => f !== id)
          : [...current.files, id],
      })),
    [setFilters],
  );

  const clearFiles = useCallback(
    () => setFilters((current) => ({ ...current, files: [] })),
    [setFilters],
  );

  if (!data || !currency) return null;

  const gameLabels = new Map(bundle.bets.map((bet) => [bet.game, bet.gameLabel]));
  const gamesPresent = new Set(data.bets.map((bet) => bet.game));

  const onModeChange = (mode: PnlMode) => {
    setPnlMode(mode);
    if (mode !== 'cumulative' && mode !== periodBucket) setPeriodBucket(mode);
  };

  let index = 0;
  const next = () => index++;

  return (
    <div className="min-h-dvh bg-paper">
      <Header
        meta={meta}
        quality={bundle.quality}
        theme={theme}
        onToggleTheme={onToggleTheme}
        onReset={archive.reset}
        currencies={archive.currencyTotals}
        currency={currency}
        onCurrencyChange={archive.setCurrency}
        rates={archive.rates}
        unconvertibleCount={archive.unconvertible.length}
      />

      <main className="wl-shell flex flex-col gap-3 py-3 sm:gap-4 sm:py-4">
        <FilterBar
          filters={filters}
          onChange={setFilters}
          onClear={archive.clearFilters}
          quality={bundle.quality}
          gameLabels={gameLabels}
          range={bundle.range}
          shown={data.bets.length}
          total={currencyBets.length}
          isFiltered={archive.isFiltered}
        />

        {data.bets.length === 0 ? (
          <div className="wl-panel animate-rise-in px-4 py-12 text-center">
            <p className="text-sm text-ink">No bets match the current filters.</p>
            <p className="mx-auto mt-2 max-w-[46ch] text-[11px] leading-relaxed text-muted">
              {formatCount(currencyBets.length)} bets are available in {currency.toUpperCase()}.
              Widen the date range or clear a filter to bring them back.
            </p>
            <button type="button" className="wl-button mt-4 min-h-[40px]" onClick={archive.clearFilters}>
              Clear filters
            </button>
          </div>
        ) : (
          <div className="flex min-w-0 flex-col gap-3 sm:gap-4">
            <Section index={next()}>
              <OverviewSection
                overview={data.overview}
                formatAmount={data.formatAmount}
                filtered={archive.isFiltered}
                converted={archive.rates.enabled && archive.rates.table !== null}
              />
            </Section>

            {/* Only worth a panel when there is more than one file to compare. */}
            {bundle.files.length > 1 && (
              <Section index={next()}>
                <FilesPanel
                  fileStats={archive.fileStats}
                  currency={currency}
                  formatAmount={data.formatAmount}
                  selected={filters.files}
                  onToggleFile={toggleFile}
                  onClear={clearFiles}
                />
              </Section>
            )}

            <Section index={next()}>
              <PnlSection
                mode={pnlMode}
                onModeChange={onModeChange}
                equity={data.equity}
                periods={periods}
                currency={currency}
                formatAmount={data.formatAmount}
              />
            </Section>

            <Section index={next()}>
              <div className="grid min-w-0 gap-3 sm:gap-4 xl:grid-cols-2">
                <DrawdownSection
                  drawdown={data.drawdown}
                  equity={data.equity}
                  currency={currency}
                  formatAmount={data.formatAmount}
                />
                <StreakSection streaks={data.streaks} />
              </div>
            </Section>

            <Section index={next()}>
              <GameBreakdown rows={data.byGame} currency={currency} formatAmount={data.formatAmount} />
            </Section>

            <Section index={next()}>
              <ProfileSection insights={data.profile} />
            </Section>

            {/* Game panels render only for games present in the selection. */}
            {gamesPresent.has('sportsbook') && (
              <Section index={next()}>
                <SportsbookSection stats={data.sportsbook} currency={currency} formatAmount={data.formatAmount} />
              </Section>
            )}
            {gamesPresent.has('crash') && (
              <Section index={next()}>
                <CrashSection stats={data.crash} currency={currency} formatAmount={data.formatAmount} />
              </Section>
            )}
            {gamesPresent.has('plinko') && (
              <Section index={next()}>
                <PlinkoSection stats={data.plinko} currency={currency} formatAmount={data.formatAmount} />
              </Section>
            )}
            {gamesPresent.has('mines') && (
              <Section index={next()}>
                <MinesSection stats={data.mines} currency={currency} formatAmount={data.formatAmount} />
              </Section>
            )}

            <Section index={next()}>
              <TimeSection
                time={data.time}
                byHour={data.byHour}
                byWeekday={data.byWeekday}
                currency={currency}
                formatAmount={data.formatAmount}
              />
            </Section>

            <Section index={next()}>
              <HistoryExplorer
                bets={data.bets}
                currency={currency}
                formatAmount={data.formatAmount}
                totalBets={currencyBets.length}
              />
            </Section>
          </div>
        )}

        <footer className="mt-1 flex flex-wrap items-center justify-between gap-3 border-t border-line pb-3 pt-4">
          <p className="wl-meta">WagerLens · parsed locally · nothing uploaded</p>
          <p className="max-w-[60ch] text-[11px] leading-relaxed text-faint">
            An analytics tool, not betting advice. Historical results do not predict future outcomes.
          </p>
        </footer>
      </main>
    </div>
  );
}

export default Dashboard;
