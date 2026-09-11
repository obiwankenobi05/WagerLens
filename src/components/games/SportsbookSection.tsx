import { Panel, PanelEmpty } from '../ui/Panel';
import { Stat } from '../ui/Metric';
import { Bar, SignedValue } from '../ui/Value';
import { GroupStatsTable } from '../GroupStatsTable';
import { DataTable, type Column } from '../ui/DataTable';
import type { CalibrationRow, SportsbookStats } from '@/analytics';
import { formatCount, formatMultiplier, formatPercent } from '@/utils/format';

/**
 * Recorded probability against realised win rate.
 *
 * The probability column is the archive's own `probabilities` field, reported
 * as recorded. WagerLens does not claim how it was produced, and a band with
 * few bets says very little, the sample column is shown alongside for exactly
 * that reason.
 */
function CalibrationTable({ rows }: { rows: CalibrationRow[] }) {
  const columns: Array<Column<CalibrationRow>> = [
    {
      key: 'label',
      header: 'Recorded probability',
      render: (row) => <span className="font-mono text-xs text-ink">{row.label}</span>,
    },
    {
      key: 'bets',
      header: 'Bets',
      align: 'right',
      sortValue: (row) => row.bets,
      render: (row) => <span className="tnum font-mono">{formatCount(row.bets)}</span>,
    },
    {
      key: 'recorded',
      header: 'Mean recorded',
      align: 'right',
      sortValue: (row) => row.recordedProbability,
      title: "Mean of the archive's own probability field for bets in this band",
      render: (row) => <span className="tnum font-mono">{formatPercent(row.recordedProbability)}</span>,
    },
    {
      key: 'actual',
      header: 'Actual win rate',
      align: 'right',
      sortValue: (row) => row.actualWinRate ?? -1,
      render: (row) => (
        <span className="flex items-center justify-end gap-2">
          <span className="tnum font-mono">{formatPercent(row.actualWinRate)}</span>
          <span className="hidden w-12 sm:block">
            <Bar
              value={row.actualWinRate ?? 0}
              max={100}
              label={`${row.label}: ${formatPercent(row.actualWinRate)} actual win rate`}
            />
          </span>
        </span>
      ),
    },
    {
      key: 'delta',
      header: 'Difference',
      align: 'right',
      hideOnMobile: true,
      sortValue: (row) => (row.actualWinRate ?? 0) - row.recordedProbability,
      title: 'Actual win rate minus mean recorded probability, in percentage points',
      render: (row) =>
        row.actualWinRate === null ? (
          <span className="text-faint">-</span>
        ) : (
          <SignedValue
            value={row.actualWinRate - row.recordedProbability}
            format={(v) => `${v.toFixed(1)} pp`}
          />
        ),
    },
    {
      key: 'roi',
      header: 'ROI',
      align: 'right',
      sortValue: (row) => row.roi ?? Number.NEGATIVE_INFINITY,
      render: (row) =>
        row.roi === null ? (
          <span className="text-faint">-</span>
        ) : (
          <SignedValue value={row.roi} format={(v) => `${v.toFixed(1)}%`} />
        ),
    },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(row) => row.key}
      caption="Recorded probability compared with realised win rate"
    />
  );
}

export function SportsbookSection({
  stats,
  currency,
  formatAmount,
}: {
  stats: SportsbookStats;
  currency: string;
  formatAmount: (value: number) => string;
}) {
  const code = currency.toUpperCase();

  if (stats.bets === 0) {
    return (
      <Panel index="07" label="Sportsbook">
        <PanelEmpty>No sportsbook bets in the current selection.</PanelEmpty>
      </Panel>
    );
  }

  return (
    <Panel
      index="07"
      label="Sportsbook"
      actions={<span className="wl-meta">{formatCount(stats.bets)} bets</span>}
    >
      <div className="grid min-w-0 gap-4 lg:grid-cols-[240px_1fr] xl:grid-cols-[260px_1fr]">
        <dl className="grid min-w-0 grid-cols-2 gap-x-4 sm:grid-cols-3 lg:grid-cols-1 lg:border-r lg:border-line lg:pr-4">
          <Stat label="Wagered" value={`${formatAmount(stats.wagered)} ${code}`} />
          <Stat label="P&L" value={<SignedValue value={stats.netPnl} format={formatAmount} />} />
          <Stat
            label="ROI"
            value={
              stats.roi === null ? (
                '-'
              ) : (
                <SignedValue value={stats.roi} format={(v) => `${v.toFixed(2)}%`} />
              )
            }
          />
          <Stat label="Win rate" value={formatPercent(stats.winRate)} />
          <Stat
            label="Average odds"
            value={formatMultiplier(stats.averageOdds)}
            title="Mean of the potential multiplier, the product of the leg odds"
          />
          <Stat
            label="Stake-weighted odds"
            value={formatMultiplier(stats.weightedAverageOdds)}
            title="Potential multiplier weighted by stake"
          />
          <Stat label="Highest odds" value={formatMultiplier(stats.highestOdds)} />
          <Stat
            label="Singles / multis"
            value={`${formatCount(stats.singles.bets)} / ${formatCount(stats.multis.bets)}`}
          />
          <Stat label="Cash-outs" value={formatCount(stats.cashouts)} />
          <Stat label="Distinct fixtures" value={formatCount(stats.distinctFixtures)} />
        </dl>

        <div className="flex min-w-0 flex-col gap-5">
          <div>
            <h3 className="wl-label-strong mb-2">Performance by odds range</h3>
            <GroupStatsTable
              rows={stats.byOdds}
              headerLabel="Odds"
              formatAmount={formatAmount}
              currency={currency}
              defaultSortKey="label"
              showShare={false}
              caption="Sportsbook performance grouped by decimal odds"
            />
          </div>

          <div>
            <h3 className="wl-label-strong mb-2">Performance by stake size</h3>
            <p className="mb-2 text-[11px] leading-relaxed text-muted">
              Buckets are quartiles of the stakes in this selection, so they adapt to the
              denomination rather than assuming a fixed ladder.
            </p>
            <GroupStatsTable
              rows={stats.byStake}
              headerLabel={`Stake ${code}`}
              formatAmount={formatAmount}
              currency={currency}
              defaultSortKey="label"
              showShare={false}
              caption="Sportsbook performance grouped by stake size"
            />
          </div>

          {stats.byLegCount.length > 1 && (
            <div>
              <h3 className="wl-label-strong mb-2">Singles vs multis</h3>
              <GroupStatsTable
                rows={stats.byLegCount}
                headerLabel="Bet type"
                formatAmount={formatAmount}
                currency={currency}
                defaultSortKey="label"
                showShare={false}
                caption="Sportsbook performance by number of legs"
              />
            </div>
          )}

          <div>
            <h3 className="wl-label-strong mb-2">Recorded probability vs actual results</h3>
            {stats.hasProbabilityData && stats.calibration.length > 0 ? (
              <>
                <p className="mb-2 max-w-[70ch] text-[11px] leading-relaxed text-muted">
                  The archive stores a probability alongside each selection. This table reports that
                  field exactly as recorded and sets it next to what actually happened. Bands with
                  few bets will differ from the recorded figure through sample size alone. Read the
                  bets column before the difference column.
                </p>
                <CalibrationTable rows={stats.calibration} />
              </>
            ) : (
              <PanelEmpty>
                No probability field was recorded on these bets, so there is nothing to compare.
              </PanelEmpty>
            )}
          </div>
        </div>
      </div>
    </Panel>
  );
}
