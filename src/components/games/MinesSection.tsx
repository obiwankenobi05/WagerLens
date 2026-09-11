import { Panel, PanelEmpty } from '../ui/Panel';
import { Stat } from '../ui/Metric';
import { SignedValue } from '../ui/Value';
import { GroupStatsTable, RoiStrip } from '../GroupStatsTable';
import type { MinesStats } from '@/analytics';
import { formatCount, formatMultiplier, formatPercent } from '@/utils/format';

export function MinesSection({
  stats,
  currency,
  formatAmount,
}: {
  stats: MinesStats;
  currency: string;
  formatAmount: (value: number) => string;
}) {
  const code = currency.toUpperCase();

  if (stats.bets === 0) {
    return (
      <Panel index="10" label="Mines">
        <PanelEmpty>No Mines rounds in the current selection.</PanelEmpty>
      </Panel>
    );
  }

  return (
    <Panel
      index="10"
      label="Mines"
      actions={<span className="wl-meta">{formatCount(stats.bets)} rounds</span>}
      note={
        stats.bets < 10
          ? `Only ${stats.bets} Mines rounds in this selection — the figures below describe those rounds and little more.`
          : undefined
      }
    >
      <div className="grid min-w-0 gap-4 lg:grid-cols-[240px_1fr] xl:grid-cols-[260px_1fr]">
        <dl className="grid min-w-0 grid-cols-2 gap-x-4 sm:grid-cols-3 lg:grid-cols-1 lg:border-r lg:border-line lg:pr-4">
          <Stat label="Wagered" value={`${formatAmount(stats.wagered)} ${code}`} />
          <Stat label="P&L" value={<SignedValue value={stats.netPnl} format={formatAmount} />} />
          <Stat
            label="ROI"
            value={
              stats.roi === null ? (
                '—'
              ) : (
                <SignedValue value={stats.roi} format={(v) => `${v.toFixed(2)}%`} />
              )
            }
          />
          <Stat label="Win rate" value={formatPercent(stats.winRate)} />
          <Stat
            label="Rounds lost"
            value={`${formatCount(stats.bustedRounds)} of ${formatCount(stats.bets)}`}
            title="Rounds that returned nothing"
          />
          <Stat label="Average mines" value={stats.averageMineCount?.toFixed(2) ?? '—'} />
          <Stat
            label="Average tiles revealed"
            value={stats.averageSelections?.toFixed(2) ?? '—'}
            title="Mean number of safe tiles opened per round"
          />
          <Stat
            label="Average cash-out"
            value={formatMultiplier(stats.averageCashoutMultiplier)}
            title="Mean multiplier across rounds that paid out"
          />
          <Stat label="Highest multiplier" value={formatMultiplier(stats.highestMultiplier)} />
          <Stat
            label="Largest win"
            value={<SignedValue value={stats.largestWin} format={formatAmount} />}
          />
          <Stat
            label="Largest loss"
            value={<SignedValue value={stats.largestLoss} format={formatAmount} />}
          />
        </dl>

        <div className="flex min-w-0 flex-col gap-5">
          {stats.byMineCount.length > 0 && (
            <div>
              <h3 className="wl-label-strong mb-2">By mine count</h3>
              <div className="mb-3 border-b border-line pb-3">
                <RoiStrip rows={stats.byMineCount} />
              </div>
              <GroupStatsTable
                rows={stats.byMineCount}
                headerLabel="Mines"
                formatAmount={formatAmount}
                currency={currency}
                defaultSortKey="label"
                showShare={false}
                caption="Mines performance by number of mines"
              />
            </div>
          )}

          {stats.bySelections.length > 0 && (
            <div>
              <h3 className="wl-label-strong mb-2">By tiles revealed</h3>
              <GroupStatsTable
                rows={stats.bySelections}
                headerLabel="Tiles"
                formatAmount={formatAmount}
                currency={currency}
                defaultSortKey="label"
                showShare={false}
                caption="Mines performance by number of tiles revealed"
              />
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}
