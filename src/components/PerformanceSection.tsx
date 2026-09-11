import { Panel } from './ui/Panel';
import { Segmented } from './ui/Segmented';
import { Stat } from './ui/Metric';
import { PnlChart, type PnlMode } from '@/charts/PnlChart';
import { DrawdownChart } from '@/charts/DrawdownChart';
import { humaniseDuration, type DrawdownStats, type EquityPoint, type PeriodStats, type StreakStats } from '@/analytics';
import { cx, formatCount, formatDateTime, formatPercent } from '@/utils/format';

const MODES: Array<{ value: PnlMode; label: string; title: string }> = [
  { value: 'cumulative', label: 'Cumulative', title: 'Running P&L, one point per bet' },
  { value: 'day', label: 'Daily', title: 'P&L per calendar day' },
  { value: 'week', label: 'Weekly', title: 'P&L per week, starting Monday' },
  { value: 'month', label: 'Monthly', title: 'P&L per calendar month' },
];

export function PnlSection({
  mode,
  onModeChange,
  equity,
  periods,
  currency,
  formatAmount,
}: {
  mode: PnlMode;
  onModeChange: (mode: PnlMode) => void;
  equity: EquityPoint[];
  periods: PeriodStats[];
  currency: string;
  formatAmount: (value: number) => string;
}) {
  return (
    <Panel
      index="03"
      label="Profit & loss"
      actions={
        <Segmented options={MODES} value={mode} onChange={onModeChange} label="P&L granularity" />
      }
    >
      <PnlChart
        mode={mode}
        equity={equity}
        periods={periods}
        currency={currency}
        formatAmount={formatAmount}
      />
    </Panel>
  );
}

export function DrawdownSection({
  drawdown,
  equity,
  currency,
  formatAmount,
}: {
  drawdown: DrawdownStats;
  equity: EquityPoint[];
  currency: string;
  formatAmount: (value: number) => string;
}) {
  const code = currency.toUpperCase();

  return (
    <Panel
      index="04"
      label="Drawdown"
      note="Distance below the running peak of cumulative P&L, in chronological order."
    >
      <div className="grid min-w-0 gap-4 lg:grid-cols-[1fr_260px]">
        <DrawdownChart equity={equity} currency={currency} formatAmount={formatAmount} />

        <dl className="flex min-w-0 flex-col lg:border-l lg:border-line lg:pl-4">
          <Stat
            label="Peak P&L"
            value={`${formatAmount(drawdown.peak)} ${code}`}
            title="Highest cumulative P&L reached"
          />
          <Stat
            label="Peak reached"
            value={formatDateTime(drawdown.peakAt)}
          />
          <Stat
            label="Max drawdown"
            value={`${formatAmount(drawdown.maxDrawdown)} ${code}`}
            tone={drawdown.maxDrawdown > 0 ? 'neg' : 'neutral'}
          />
          <Stat
            label="Vs. total wagered"
            value={formatPercent(drawdown.maxDrawdownVsWagered)}
            title="The deepest fall as a share of everything staked. Cumulative P&L starts at zero, so the peak is not a capital base and would make a poor denominator."
          />
          <Stat label="Trough at" value={formatDateTime(drawdown.maxDrawdownAt)} />
          <Stat
            label="Recovered"
            value={
              drawdown.recoveredAt
                ? `${formatDateTime(drawdown.recoveredAt)}`
                : 'Not within this archive'
            }
          />
          <Stat
            label="Recovery time"
            value={drawdown.recoveryMs === null ? '-' : humaniseDuration(drawdown.recoveryMs)}
          />
          <Stat
            label="Current drawdown"
            value={
              drawdown.atPeak ? 'At peak' : `${formatAmount(drawdown.currentDrawdown)} ${code}`
            }
            tone={drawdown.atPeak ? 'neutral' : 'neg'}
          />
        </dl>
      </div>
    </Panel>
  );
}

/** Run-length visualisation: one cell per completed run, width by length. */
function RunStrip({ runs }: { runs: StreakStats['runs'] }) {
  if (runs.length === 0) return null;

  return (
    <div>
      <p className="wl-label mb-1.5">Run sequence</p>
      <div
        className="flex h-6 w-full min-w-0 gap-px overflow-hidden"
        role="img"
        aria-label={`${runs.length} runs in sequence, from ${runs[0].type} to ${runs[runs.length - 1].type}`}
      >
        {runs.map((run, index) => (
          <span
            key={`${run.startedAt.getTime()}-${index}`}
            className={cx('min-w-px transition-opacity duration-300', run.type === 'win' ? 'bg-pos' : 'bg-neg/70')}
            style={{ flex: `${run.length} 1 0%` }}
            title={`${run.length} ${run.type === 'win' ? 'win' : 'loss'}${run.length === 1 ? '' : 'es'}, ${formatDateTime(run.startedAt)}`}
          />
        ))}
      </div>
      <p className="wl-meta mt-1.5">
        {formatCount(runs.length)} runs · oldest left, newest right
      </p>
    </div>
  );
}

export function StreakSection({ streaks }: { streaks: StreakStats }) {
  const current = streaks.currentStreak;
  const currentLabel =
    current === 0
      ? 'None'
      : `${Math.abs(current)} ${streaks.currentStreakType === 'win' ? 'win' : 'loss'}${
          Math.abs(current) === 1 ? '' : 'es'
        }`;

  return (
    <Panel
      index="05"
      label="Streaks"
      note="Consecutive runs of wins and losses. Break-even bets neither extend nor break a run. Runs describe the order results happened in. They carry no information about what comes next."
    >
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <dl className="flex min-w-0 flex-col">
          <Stat
            label="Current run"
            value={
              current === 0 ? (
                'None'
              ) : (
                <span className={current > 0 ? 'wl-pos' : 'wl-neg'}>
                  <span aria-hidden>{current > 0 ? '▲ ' : '▼ '}</span>
                  {currentLabel}
                </span>
              )
            }
          />
          <Stat label="Longest winning run" value={`${formatCount(streaks.longestWinStreak)} bets`} />
          <Stat label="Longest losing run" value={`${formatCount(streaks.longestLossStreak)} bets`} />
          <Stat
            label="Average winning run"
            value={
              streaks.averageWinStreak === null ? '-' : `${streaks.averageWinStreak.toFixed(2)} bets`
            }
          />
          <Stat
            label="Average losing run"
            value={
              streaks.averageLossStreak === null
                ? '-'
                : `${streaks.averageLossStreak.toFixed(2)} bets`
            }
          />
          <Stat
            label="Runs recorded"
            value={`${formatCount(streaks.winStreakCount)} winning · ${formatCount(streaks.lossStreakCount)} losing`}
          />
        </dl>

        <div className="flex min-w-0 flex-col justify-center gap-4 sm:border-l sm:border-line sm:pl-4">
          <RunStrip runs={streaks.runs} />
          <p className="text-[11px] leading-relaxed text-faint">
            Historical results do not predict future outcomes.
          </p>
        </div>
      </div>
    </Panel>
  );
}
