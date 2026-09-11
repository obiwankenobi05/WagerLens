import { Panel } from './ui/Panel';
import { Stat } from './ui/Metric';
import { SignedValue } from './ui/Value';
import { humaniseDuration, type GroupStats, type TimeStats } from '@/analytics';
import { cx, formatCount, formatDate, formatPercent } from '@/utils/format';

/**
 * Activity heat strip.
 *
 * Cell opacity encodes bet volume; a small corner mark flags a losing period so
 * the sign is not carried by shade alone. Each cell also has a title and an
 * accessible label, so the information is available without the visual.
 */
function HeatRow({
  rows,
  label,
  formatAmount,
  currency,
  cellLabel,
}: {
  rows: GroupStats[];
  label: string;
  formatAmount: (value: number) => string;
  currency: string;
  cellLabel: (row: GroupStats) => string;
}) {
  const max = rows.reduce((m, r) => Math.max(m, r.bets), 0);
  const code = currency.toUpperCase();

  return (
    <div>
      <p className="wl-label mb-1.5">{label}</p>
      <ul className="flex w-full gap-px" role="list">
        {rows.map((row) => {
          const intensity = max > 0 ? row.bets / max : 0;
          const losing = row.netPnl < 0;
          return (
            <li
              key={row.key}
              className="relative min-w-0 flex-1"
              title={`${cellLabel(row)} · ${row.bets} bets · ${
                row.netPnl >= 0 ? '+' : '−'
              }${formatAmount(Math.abs(row.netPnl))} ${code}`}
            >
              <span className="sr-only">
                {cellLabel(row)}: {row.bets} bets, P&L {row.netPnl >= 0 ? 'plus' : 'minus'}{' '}
                {formatAmount(Math.abs(row.netPnl))} {code}
              </span>
              <span
                aria-hidden
                className={cx(
                  'block h-8 w-full border transition-opacity duration-300',
                  row.bets === 0 ? 'border-line bg-transparent' : 'border-line-strong/20 bg-ink',
                )}
                style={{ opacity: row.bets === 0 ? 1 : 0.14 + intensity * 0.86 }}
              />
              {losing && row.bets > 0 && (
                // Corner mark: the loss signal that survives greyscale.
                <span
                  aria-hidden
                  className="absolute right-0 top-0 h-0 w-0 border-l-[5px] border-t-[5px] border-l-transparent border-t-neg"
                />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function TimeSection({
  time,
  byHour,
  byWeekday,
  currency,
  formatAmount,
}: {
  time: TimeStats;
  byHour: GroupStats[];
  byWeekday: GroupStats[];
  currency: string;
  formatAmount: (value: number) => string;
}) {
  const code = currency.toUpperCase();
  const busiestHour = byHour.reduce((best, h) => (h.bets > best.bets ? h : best), byHour[0]);

  return (
    <Panel
      index="11"
      label="Time & cadence"
      note="All times are local to this device. Cells are shaded by number of bets; a corner mark flags a period that ended down."
    >
      <div className="grid min-w-0 gap-5 lg:grid-cols-[260px_1fr]">
        <dl className="flex min-w-0 flex-col lg:border-r lg:border-line lg:pr-4">
          <Stat label="First bet" value={formatDate(time.firstBet)} />
          <Stat label="Last bet" value={formatDate(time.lastBet)} />
          <Stat
            label="Span"
            value={`${formatCount(time.spanDays)} ${time.spanDays === 1 ? 'day' : 'days'}`}
          />
          <Stat label="Active days" value={formatCount(time.activeDays)} />
          <Stat
            label="Bets per active day"
            value={time.betsPerActiveDay === null ? '—' : time.betsPerActiveDay.toFixed(1)}
          />
          <Stat
            label="Median gap"
            value={time.medianGapMs === null ? '—' : humaniseDuration(time.medianGapMs)}
            title="Typical time between consecutive bets"
          />
          <Stat
            label="Average gap"
            value={time.averageGapMs === null ? '—' : humaniseDuration(time.averageGapMs)}
          />
          <Stat
            label="Most active hour"
            value={
              time.mostActiveHour === null
                ? '—'
                : `${String(time.mostActiveHour.hour).padStart(2, '0')}:00 · ${time.mostActiveHour.bets} bets`
            }
          />
          <Stat
            label="Most active day"
            value={
              time.mostActiveWeekday === null
                ? '—'
                : `${time.mostActiveWeekday.weekday} · ${time.mostActiveWeekday.bets}`
            }
          />
          {time.busiestDay && (
            <Stat
              label="Busiest date"
              value={
                <span>
                  {time.busiestDay.key}
                  <span className="mx-1 text-faint" aria-hidden>
                    ·
                  </span>
                  <SignedValue value={time.busiestDay.netPnl} format={formatAmount} />
                </span>
              }
            />
          )}
        </dl>

        <div className="flex min-w-0 flex-col gap-5">
          <HeatRow
            rows={byHour}
            label="Bets by hour of day (00 → 23)"
            formatAmount={formatAmount}
            currency={currency}
            cellLabel={(row) => `${row.label}`}
          />

          <div>
            <p className="wl-label mb-1.5">Bets by weekday</p>
            <ul className="grid grid-cols-7 gap-px">
              {byWeekday.map((row) => {
                const max = byWeekday.reduce((m, r) => Math.max(m, r.bets), 0);
                const intensity = max > 0 ? row.bets / max : 0;
                return (
                  <li key={row.key} className="flex min-w-0 flex-col items-center gap-1">
                    <span
                      aria-hidden
                      className={cx(
                        'block h-8 w-full border',
                        row.bets === 0 ? 'border-line' : 'border-line-strong/20 bg-ink',
                      )}
                      style={{ opacity: row.bets === 0 ? 1 : 0.14 + intensity * 0.86 }}
                    />
                    <span className="wl-meta truncate">{row.label.slice(0, 3)}</span>
                    <span className="tnum font-mono text-[10px] text-muted">{row.bets}</span>
                    <span className="sr-only">
                      {row.label}: {row.bets} bets, P&L {row.netPnl >= 0 ? 'plus' : 'minus'}{' '}
                      {formatAmount(Math.abs(row.netPnl))} {code}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          {busiestHour && busiestHour.bets > 0 && (
            <p className="max-w-[72ch] text-[11px] leading-relaxed text-muted">
              The heaviest hour in this archive is {busiestHour.label} with{' '}
              {formatCount(busiestHour.bets)} bets (
              {formatPercent((busiestHour.bets / byHour.reduce((s, h) => s + h.bets, 0)) * 100, 0)} of
              the total). That is a description of when betting happened, not evidence that any hour
              performs differently from another.
            </p>
          )}
        </div>
      </div>
    </Panel>
  );
}
