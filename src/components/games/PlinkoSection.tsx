import { Panel, PanelEmpty } from '../ui/Panel';
import { Stat } from '../ui/Metric';
import { Bar, SignedValue } from '../ui/Value';
import { GroupStatsTable, RoiStrip } from '../GroupStatsTable';
import type { MultiplierBin, PlinkoStats } from '@/analytics';
import { formatCount, formatMultiplier, formatPercent } from '@/utils/format';

/** Realised multiplier distribution — how often each payout band landed. */
function MultiplierDistribution({
  bins,
  formatAmount,
  currency,
}: {
  bins: MultiplierBin[];
  formatAmount: (value: number) => string;
  currency: string;
}) {
  const code = currency.toUpperCase();
  const max = bins.reduce((m, b) => Math.max(m, b.count), 0);

  return (
    <ul className="flex flex-col gap-1.5">
      {bins.map((bin) => (
        <li
          key={bin.multiplier}
          className="grid grid-cols-[52px_1fr_auto] items-center gap-3 sm:grid-cols-[60px_1fr_auto_auto]"
        >
          <span className="tnum font-mono text-[11px] text-ink">
            {formatMultiplier(bin.multiplier, bin.multiplier < 1 ? 2 : bin.multiplier % 1 === 0 ? 0 : 1)}
          </span>
          <Bar
            value={bin.count}
            max={max}
            label={`${formatMultiplier(bin.multiplier)}: ${bin.count} drops, ${formatPercent(bin.share, 1)} of the total`}
          />
          <span className="tnum shrink-0 font-mono text-[11px] text-muted">
            {formatCount(bin.count)}
            <span className="hidden sm:inline"> · {formatPercent(bin.share, 1)}</span>
          </span>
          <span className="tnum hidden shrink-0 font-mono text-[11px] sm:block sm:w-20 sm:text-right">
            <SignedValue value={bin.netPnl} format={formatAmount} />
            <span className="sr-only"> {code}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function PlinkoSection({
  stats,
  currency,
  formatAmount,
}: {
  stats: PlinkoStats;
  currency: string;
  formatAmount: (value: number) => string;
}) {
  const code = currency.toUpperCase();

  if (stats.bets === 0) {
    return (
      <Panel index="09" label="Plinko">
        <PanelEmpty>No Plinko drops in the current selection.</PanelEmpty>
      </Panel>
    );
  }

  return (
    <Panel
      index="09"
      label="Plinko"
      actions={<span className="wl-meta">{formatCount(stats.bets)} drops</span>}
    >
      <div className="grid min-w-0 gap-4 lg:grid-cols-[260px_1fr]">
        <dl className="flex min-w-0 flex-col lg:border-r lg:border-line lg:pr-4">
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
            label="Below stake"
            value={formatPercent(stats.belowStakeRate)}
            title="Drops that returned less than the stake"
          />
          <Stat label="Average multiplier" value={formatMultiplier(stats.averagePayoutMultiplier)} />
          <Stat label="Highest multiplier" value={formatMultiplier(stats.highestMultiplier)} />
          <Stat
            label="Average stake"
            value={stats.averageStake === null ? '—' : `${formatAmount(stats.averageStake)} ${code}`}
          />
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
          {stats.byRisk.length > 0 && (
            <div>
              <h3 className="wl-label-strong mb-2">By risk level</h3>
              <div className="mb-3 border-b border-line pb-3">
                <RoiStrip rows={stats.byRisk} />
              </div>
              <GroupStatsTable
                rows={stats.byRisk}
                headerLabel="Risk"
                formatAmount={formatAmount}
                currency={currency}
                showShare={false}
                caption="Plinko performance by risk level"
              />
            </div>
          )}

          {stats.byRows.length > 0 && (
            <div>
              <h3 className="wl-label-strong mb-2">By row count</h3>
              <GroupStatsTable
                rows={stats.byRows}
                headerLabel="Rows"
                formatAmount={formatAmount}
                currency={currency}
                defaultSortKey="label"
                showShare={false}
                caption="Plinko performance by number of rows"
              />
            </div>
          )}

          <div>
            <h3 className="wl-label-strong mb-2">Multiplier distribution</h3>
            <MultiplierDistribution
              bins={stats.multiplierDistribution}
              formatAmount={formatAmount}
              currency={currency}
            />
            <p className="wl-meta mt-2.5 max-w-[70ch] normal-case tracking-normal">
              Each drop is independent of the last, so the recorded ball paths are kept in the bet
              details but are not analysed for patterns.
            </p>
          </div>
        </div>
      </div>
    </Panel>
  );
}
