import { DataTable, type Column } from './ui/DataTable';
import { Bar, SignedValue } from './ui/Value';
import type { GroupStats } from '@/analytics';
import { formatCount, formatPercent, formatSignedPercent } from '@/utils/format';

/**
 * The standard aggregate table.
 *
 * Every grouped view — by game, by odds band, by risk level, by hour — renders
 * through this, so a row means the same thing wherever it appears.
 */
export function GroupStatsTable({
  rows,
  headerLabel,
  formatAmount,
  currency,
  defaultSortKey = 'wagered',
  showShare = true,
  showBar = true,
  caption,
}: {
  rows: GroupStats[];
  headerLabel: string;
  formatAmount: (value: number) => string;
  currency: string;
  defaultSortKey?: string;
  showShare?: boolean;
  showBar?: boolean;
  caption?: string;
}) {
  const code = currency.toUpperCase();
  const maxWagered = rows.reduce((m, r) => Math.max(m, r.wagered), 0);

  const columns: Array<Column<GroupStats>> = [
    {
      key: 'label',
      header: headerLabel,
      sortValue: (row) => row.label,
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
      key: 'wagered',
      header: `Wagered ${code}`,
      align: 'right',
      sortValue: (row) => row.wagered,
      render: (row) => <span className="tnum font-mono">{formatAmount(row.wagered)}</span>,
    },
    {
      key: 'returned',
      header: `Returned ${code}`,
      align: 'right',
      hideOnMobile: true,
      sortValue: (row) => row.returned,
      render: (row) => <span className="tnum font-mono">{formatAmount(row.returned)}</span>,
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
      title: 'Net P&L divided by amount wagered',
      render: (row) =>
        row.roi === null ? (
          <span className="text-faint">—</span>
        ) : (
          <SignedValue value={row.roi} format={(v) => `${v.toFixed(1)}%`} />
        ),
    },
    {
      key: 'winRate',
      header: 'Win rate',
      align: 'right',
      hideOnMobile: true,
      sortValue: (row) => row.winRate ?? -1,
      title: 'Wins as a share of decided bets; pushes excluded',
      render: (row) => <span className="tnum font-mono">{formatPercent(row.winRate)}</span>,
    },
    {
      key: 'avg',
      header: `Avg bet ${code}`,
      align: 'right',
      hideOnMobile: true,
      sortValue: (row) => row.averageStake ?? 0,
      render: (row) => (
        <span className="tnum font-mono">
          {row.averageStake === null ? '—' : formatAmount(row.averageStake)}
        </span>
      ),
    },
  ];

  if (showShare) {
    columns.push({
      key: 'share',
      header: 'Share',
      align: 'right',
      hideOnMobile: true,
      sortValue: (row) => row.shareOfWagered,
      title: 'Share of wagered volume in this view',
      render: (row) => (
        <span className="flex items-center justify-end gap-2">
          <span className="tnum font-mono text-muted">{formatPercent(row.shareOfWagered, 0)}</span>
          {showBar && (
            <span className="hidden w-14 lg:block">
              <Bar
                value={row.wagered}
                max={maxWagered}
                label={`${row.label}: ${formatPercent(row.shareOfWagered, 0)} of wagered volume`}
              />
            </span>
          )}
        </span>
      ),
    });
  }

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(row) => row.key}
      defaultSort={{ key: defaultSortKey, direction: 'desc' }}
      caption={caption}
      emptyMessage="No rows for this grouping in the current selection."
    />
  );
}

/** Compact horizontal comparison used above the tables. */
export function GroupBars({
  rows,
  formatAmount,
  currency,
  metric = 'wagered',
}: {
  rows: GroupStats[];
  formatAmount: (value: number) => string;
  currency: string;
  metric?: 'wagered' | 'pnl';
}) {
  const code = currency.toUpperCase();
  const max = rows.reduce(
    (m, r) => Math.max(m, metric === 'wagered' ? r.wagered : Math.abs(r.netPnl)),
    0,
  );

  if (rows.length === 0) return null;

  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((row) => {
        const value = metric === 'wagered' ? row.wagered : row.netPnl;
        return (
          <li key={row.key} className="grid grid-cols-[minmax(64px,88px)_1fr_auto] items-center gap-3">
            <span className="wl-label truncate" title={row.label}>
              {row.label}
            </span>
            <Bar
              value={value}
              max={max}
              tone={metric === 'pnl' ? 'auto' : 'neutral'}
              label={`${row.label}: ${formatAmount(value)} ${code}`}
            />
            <span className="tnum shrink-0 font-mono text-[11px]">
              {metric === 'pnl' ? (
                <SignedValue value={value} format={formatAmount} />
              ) : (
                <span className="text-muted">{formatAmount(value)}</span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Small ROI strip used inside game panels. */
export function RoiStrip({ rows }: { rows: GroupStats[] }) {
  if (rows.length === 0) return null;
  const max = rows.reduce((m, r) => Math.max(m, Math.abs(r.roi ?? 0)), 0);

  return (
    <ul className="flex flex-col gap-2">
      {rows.map((row) => (
        <li key={row.key} className="grid grid-cols-[minmax(56px,80px)_1fr_auto] items-center gap-3">
          <span className="wl-label truncate">{row.label}</span>
          <Bar
            value={row.roi ?? 0}
            max={max}
            tone="auto"
            label={`${row.label}: ${formatSignedPercent(row.roi)} ROI over ${row.bets} bets`}
          />
          <span className="tnum shrink-0 font-mono text-[11px]">
            {row.roi === null ? (
              <span className="text-faint">—</span>
            ) : (
              <SignedValue value={row.roi} format={(v) => `${v.toFixed(1)}%`} />
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
