import { Panel, PanelEmpty } from '../ui/Panel';
import { Stat } from '../ui/Metric';
import { Bar, SignedValue } from '../ui/Value';
import { DataTable, type Column } from '../ui/DataTable';
import type { CashoutTargetRow, CrashStats } from '@/analytics';
import { formatCount, formatMultiplier, formatPercent } from '@/utils/format';

/**
 * Success rate per cash-out target.
 *
 * Rows come from the targets present in the archive rather than a fixed ladder,
 * so a player who only ever sets 2.00× sees one row instead of five empty ones.
 */
function TargetTable({
  rows,
  formatAmount,
  currency,
}: {
  rows: CashoutTargetRow[];
  formatAmount: (value: number) => string;
  currency: string;
}) {
  const code = currency.toUpperCase();
  const columns: Array<Column<CashoutTargetRow>> = [
    {
      key: 'target',
      header: 'Cash-out target',
      sortValue: (row) => row.target,
      render: (row) => <span className="font-mono text-xs text-ink">{row.label}</span>,
    },
    {
      key: 'bets',
      header: 'Rounds',
      align: 'right',
      sortValue: (row) => row.bets,
      render: (row) => <span className="tnum font-mono">{formatCount(row.bets)}</span>,
    },
    {
      key: 'rate',
      header: 'Success rate',
      align: 'right',
      sortValue: (row) => row.successRate,
      title: 'Rounds that returned above stake, as a share of rounds at this target',
      render: (row) => (
        <span className="flex items-center justify-end gap-2">
          <span className="tnum font-mono">{formatPercent(row.successRate)}</span>
          <span className="hidden w-14 sm:block">
            <Bar
              value={row.successRate}
              max={100}
              label={`${row.label}: ${formatPercent(row.successRate)} of ${row.bets} rounds reached the target`}
            />
          </span>
        </span>
      ),
    },
    {
      key: 'successes',
      header: 'Reached',
      align: 'right',
      hideOnMobile: true,
      sortValue: (row) => row.successes,
      render: (row) => (
        <span className="tnum font-mono text-muted">
          {formatCount(row.successes)}/{formatCount(row.bets)}
        </span>
      ),
    },
    {
      key: 'wagered',
      header: `Wagered ${code}`,
      align: 'right',
      hideOnMobile: true,
      sortValue: (row) => row.wagered,
      render: (row) => <span className="tnum font-mono">{formatAmount(row.wagered)}</span>,
    },
    {
      key: 'pnl',
      header: `P&L ${code}`,
      align: 'right',
      sortValue: (row) => row.netPnl,
      render: (row) => <SignedValue value={row.netPnl} format={formatAmount} />,
    },
    {
      key: 'roi',
      header: 'ROI',
      align: 'right',
      sortValue: (row) => row.roi ?? Number.NEGATIVE_INFINITY,
      render: (row) =>
        row.roi === null ? (
          <span className="text-faint">—</span>
        ) : (
          <SignedValue value={row.roi} format={(v) => `${v.toFixed(1)}%`} />
        ),
    },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(row) => String(row.target)}
      defaultSort={{ key: 'target', direction: 'asc' }}
      caption="Crash performance by cash-out target"
    />
  );
}

export function CrashSection({
  stats,
  currency,
  formatAmount,
}: {
  stats: CrashStats;
  currency: string;
  formatAmount: (value: number) => string;
}) {
  const code = currency.toUpperCase();

  if (stats.bets === 0) {
    return (
      <Panel index="08" label="Crash">
        <PanelEmpty>No Crash rounds in the current selection.</PanelEmpty>
      </Panel>
    );
  }

  return (
    <Panel
      index="08"
      label="Crash"
      actions={<span className="wl-meta">{formatCount(stats.bets)} rounds</span>}
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
            label="Bust rate"
            value={formatPercent(stats.bustRate)}
            tone={stats.bustRate !== null && stats.bustRate > 50 ? 'neg' : 'neutral'}
            title="Rounds that crashed before any cash-out"
          />
          <Stat label="Busts" value={`${formatCount(stats.busts)} of ${formatCount(stats.bets)}`} />
          <Stat
            label="Average target"
            value={formatMultiplier(stats.averageCashoutTarget)}
            title="Mean auto-cash-out target across rounds that recorded one"
          />
          <Stat
            label="Average multiplier"
            value={formatMultiplier(stats.averagePayoutMultiplier)}
            title="Mean realised multiplier across all rounds, busts counted as zero"
          />
          <Stat
            label="Average when paid"
            value={formatMultiplier(stats.averageWinningMultiplier)}
            title="Mean realised multiplier across rounds that returned above stake"
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
          <div>
            <h3 className="wl-label-strong mb-2">Cash-out target vs success rate</h3>
            <TargetTable rows={stats.byTarget} formatAmount={formatAmount} currency={currency} />
          </div>

          {stats.resultBreakdown.length > 0 && (
            <div>
              <h3 className="wl-label-strong mb-2">Round outcomes</h3>
              <ul className="flex flex-col gap-2">
                {stats.resultBreakdown.map((entry) => (
                  <li
                    key={entry.result}
                    className="grid grid-cols-[minmax(76px,110px)_1fr_auto] items-center gap-3"
                  >
                    <span className="wl-label truncate">{entry.result}</span>
                    <Bar
                      value={entry.count}
                      max={stats.bets}
                      label={`${entry.result}: ${entry.count} of ${stats.bets} rounds`}
                    />
                    <span className="tnum shrink-0 font-mono text-[11px] text-muted">
                      {formatCount(entry.count)} · {formatPercent((entry.count / stats.bets) * 100, 0)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="wl-meta mt-2">Labels are the archive's own result values.</p>
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}
