import { Panel } from './ui/Panel';
import { DataTable, type Column } from './ui/DataTable';
import { Bar, SignedValue } from './ui/Value';
import { AlertTriangle, Check, Filter } from 'lucide-react';
import type { useArchive } from '@/hooks/useArchive';
import { cx, formatBytes, formatCount, formatDate, formatPercent } from '@/utils/format';

type FileStat = ReturnType<typeof useArchive>['fileStats'][number];

/**
 * Per-file breakdown.
 *
 * Stake exports one file per date, so this doubles as a per-day summary. Rows
 * are clickable to scope the whole dashboard to a single file, which is what
 * "stats individually per file" means in practice, every metric on the page
 * recomputes rather than this panel showing a second, parallel set of numbers.
 */
export function FilesPanel({
  fileStats,
  currency,
  formatAmount,
  selected,
  onToggleFile,
  onClear,
}: {
  fileStats: FileStat[];
  currency: string;
  formatAmount: (value: number) => string;
  selected: string[];
  onToggleFile: (id: string) => void;
  onClear: () => void;
}) {
  const code = currency.toUpperCase();
  const maxWagered = fileStats.reduce((m, f) => Math.max(m, f.wagered), 0);
  const selectedSet = new Set(selected);

  const columns: Array<Column<FileStat>> = [
    {
      key: 'name',
      header: 'File',
      sortValue: (row) => row.file.name,
      render: (row) => (
        <span className="flex min-w-0 items-center gap-2">
          {row.file.error ? (
            <AlertTriangle size={11} strokeWidth={2} aria-hidden className="shrink-0 text-neg" />
          ) : selectedSet.has(row.file.id) ? (
            <Check size={11} strokeWidth={2.5} aria-hidden className="shrink-0 text-accent" />
          ) : (
            <span aria-hidden className="h-[11px] w-[11px] shrink-0" />
          )}
          <span className="block max-w-[190px] truncate font-mono text-xs text-ink" title={row.file.name}>
            {row.file.name}
          </span>
        </span>
      ),
    },
    {
      key: 'range',
      header: 'Dates',
      hideOnMobile: true,
      sortValue: (row) => row.file.range?.from.getTime() ?? 0,
      render: (row) =>
        row.file.range ? (
          <span className="font-mono text-[11px] text-muted">
            {formatDate(row.file.range.from)}
            {formatDate(row.file.range.from) !== formatDate(row.file.range.to) &&
              ` → ${formatDate(row.file.range.to)}`}
          </span>
        ) : (
          <span className="text-faint">-</span>
        ),
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
          <span className="text-faint">-</span>
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
      render: (row) => <span className="tnum font-mono">{formatPercent(row.winRate)}</span>,
    },
    {
      key: 'share',
      header: 'Share',
      align: 'right',
      hideOnMobile: true,
      sortValue: (row) => row.wagered,
      render: (row) => (
        <span className="ml-auto block w-14">
          <Bar value={row.wagered} max={maxWagered} label={`${row.file.name}: ${formatAmount(row.wagered)} ${code} wagered`} />
        </span>
      ),
    },
  ];

  const failed = fileStats.filter((f) => f.file.error);
  const duplicates = fileStats.reduce((sum, f) => sum + (f.file.quality.byReason.duplicate ?? 0), 0);

  return (
    <Panel
      index="02"
      label={`Files · ${fileStats.length}`}
      actions={
        selected.length > 0 ? (
          <button type="button" className="wl-button" onClick={onClear}>
            Show all
          </button>
        ) : (
          <span className="wl-meta hidden items-center gap-1 sm:flex">
            <Filter size={9} strokeWidth={2} aria-hidden /> select to scope
          </span>
        )
      }
      note={
        duplicates > 0
          ? `${formatCount(duplicates)} bet(s) appeared in more than one file and are counted once, in the first file that contained them.`
          : undefined
      }
    >
      {/* Cards on phones, a seven-column table is unreadable there. */}
      <ul className="flex flex-col gap-1.5 sm:hidden">
        {fileStats.map((row) => {
          const active = selectedSet.has(row.file.id);
          return (
            <li key={row.file.id}>
              <button
                type="button"
                onClick={() => onToggleFile(row.file.id)}
                aria-pressed={active}
                disabled={Boolean(row.file.error)}
                className={cx(
                  'flex w-full min-h-[44px] flex-col gap-1.5 border px-3 py-2.5 text-left transition-all duration-200 ease-instrument',
                  active ? 'border-accent bg-accent/5' : 'border-line hover:border-line-strong',
                  row.file.error && 'opacity-60',
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-xs text-ink">{row.file.name}</span>
                  <span className="tnum shrink-0 font-mono text-xs">
                    <SignedValue value={row.netPnl} format={formatAmount} />
                  </span>
                </span>
                <span className="flex items-center justify-between gap-2">
                  <span className="wl-meta">
                    {row.file.error ? 'Unreadable' : `${formatCount(row.bets)} bets · ${formatBytes(row.file.size)}`}
                  </span>
                  <span className="wl-meta">
                    {row.roi === null ? '-' : `${row.roi > 0 ? '+' : ''}${row.roi.toFixed(1)}% ROI`}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="hidden sm:block">
        <DataTable
          rows={fileStats}
          columns={columns}
          rowKey={(row) => row.file.id}
          defaultSort={{ key: 'range', direction: 'asc' }}
          caption="Per-file breakdown"
          onRowClick={(row) => {
            if (!row.file.error) onToggleFile(row.file.id);
          }}
          rowClassName={(row) =>
            cx(
              selectedSet.has(row.file.id) && 'bg-accent/5',
              row.file.error && 'opacity-60',
            )
          }
        />
      </div>

      {failed.length > 0 && (
        <div className="mt-3 border border-neg/40 bg-neg/5 px-3 py-2">
          <p className="flex items-center gap-1.5 text-[11px] text-ink">
            <AlertTriangle size={11} strokeWidth={2} aria-hidden className="text-neg" />
            {failed.length} file{failed.length === 1 ? '' : 's'} could not be read
          </p>
          <ul className="mt-1.5 flex flex-col gap-1">
            {failed.map((row) => (
              <li key={row.file.id} className="text-[11px] leading-relaxed text-muted">
                <span className="font-mono text-ink">{row.file.name}</span>: {row.file.error?.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}
