import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Metric } from './ui/Metric';
import type { Overview } from '@/analytics';
import { cx, formatCount, formatPercent } from '@/utils/format';

/** The accounting rules, restated for the reader in the same terms as the code. */
function Methodology({ currency, converted }: { currency: string; converted: boolean }) {
  const [open, setOpen] = useState(false);
  const code = currency.toUpperCase();

  return (
    <div className="border-t border-line">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-ink/[0.03] sm:px-4"
      >
        <span className="wl-label">How these numbers are calculated</span>
        <ChevronDown
          size={12}
          strokeWidth={2}
          aria-hidden
          className={cx('shrink-0 text-muted transition-transform duration-200', open && 'rotate-180')}
        />
      </button>

      {/* Grid-rows trick: animates height without measuring the content. */}
      <div
        className={cx(
          'grid transition-[grid-template-rows,opacity,visibility] duration-300 ease-instrument',
          open ? 'visible grid-rows-[1fr] opacity-100' : 'invisible grid-rows-[0fr] opacity-0',
        )}
      >
        <div className="overflow-hidden">
          <div className="space-y-3 px-3 pb-4 text-[11px] leading-relaxed text-muted sm:px-4">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
              {[
                ['Total Wagered', 'Sum of the stake on every completed bet.'],
                [
                  'Total Returned',
                  'Sum of the payout on those same bets. Payout is gross, so it already includes the stake back on a winner.',
                ],
                ['Net P&L', 'Total Returned − Total Wagered. The realised change in balance.'],
                ['ROI', 'Net P&L ÷ Total Wagered × 100. Shown as a dash when nothing was wagered.'],
                [
                  'Win rate',
                  'Bets that returned more than their stake, as a share of bets that were decided. Exact break-even rounds are pushes and sit outside both sides.',
                ],
                [
                  'Max drawdown',
                  'The deepest fall in cumulative P&L below its running peak, measured across bets in chronological order.',
                ],
              ].map(([term, body]) => (
                <div key={term}>
                  <dt className="wl-label-strong mb-0.5">{term}</dt>
                  <dd>{body}</dd>
                </div>
              ))}
            </dl>
            <p className="border-t border-line pt-3">
              <span className="text-ink">Excluded from every figure:</span> rejected bets (the stake
              was returned, so the archive records payout equal to amount), cancelled or voided
              wagers, and any bet still open at export time.
            </p>
            {converted ? (
              <p>
                <span className="text-ink">On conversion:</span> every amount has been multiplied by
                a single current exchange rate, so historical figures are expressed at today's
                price rather than the price at the time of each bet. That makes totals comparable
                across currencies, but it is not what the bets were worth when they were placed.
                Switch conversion off to see the amounts exactly as recorded.
              </p>
            ) : (
              <p>
                All figures are in {code} exactly as recorded. Currencies are never mixed or
                silently converted.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function OverviewSection({
  overview,
  formatAmount,
  filtered,
  converted,
}: {
  overview: Overview;
  formatAmount: (value: number) => string;
  filtered: boolean;
  /** True when every figure has been converted from its recorded currency. */
  converted: boolean;
}) {
  const code = overview.currency.toUpperCase();
  const amount = (value: number) => formatAmount(value);

  return (
    <section className="wl-panel wl-themed" aria-label="Overview">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line px-3 py-2 sm:px-4">
        <div className="flex items-baseline gap-2">
          <span className="wl-meta text-accent">01</span>
          <h2 className="wl-label-strong">Overview</h2>
        </div>
        <span className="wl-meta flex items-center gap-1.5">
          {filtered ? 'Filtered selection' : 'All records'} · {code}
          {converted && <span className="text-accent">converted</span>}
        </span>
      </header>

      {/* Primary row. Net P&L is the one figure given emphasis. */}
      <div className="grid grid-cols-2 gap-px bg-line md:grid-cols-3 lg:grid-cols-5">
        {[
          <Metric
            key="wagered"
            label="Total wagered"
            value={overview.wagered}
            format={amount}
            sub={code}
          />,
          <Metric
            key="returned"
            label="Total returned"
            value={overview.returned}
            format={amount}
            sub={code}
          />,
          <Metric
            key="pnl"
            label="Net P&L"
            value={overview.netPnl}
            format={amount}
            tone="auto"
            emphasis
            sub={code}
            srValue={`${overview.netPnl >= 0 ? 'positive' : 'negative'} ${formatAmount(
              Math.abs(overview.netPnl),
            )} ${code}`}
          />,
          <Metric
            key="roi"
            label="ROI"
            value={overview.roi ?? undefined}
            format={(v) => formatPercent(v)}
            tone="auto"
            emphasis
            sub="net / wagered"
          />,
          <Metric
            key="bets"
            label="Bets"
            value={overview.bets}
            format={formatCount}
            sub={`${formatCount(overview.wins)}W · ${formatCount(overview.losses)}L${
              overview.pushes > 0 ? ` · ${formatCount(overview.pushes)}P` : ''
            }`}
          />,
        ].map((metric, index) => (
          <div
            key={metric.key}
            className={cx('bg-surface px-3 py-3 sm:px-4', index === 4 && 'col-span-2 md:col-span-1')}
          >
            {metric}
          </div>
        ))}
      </div>

      {/* Secondary row. Same grid, lighter weight. */}
      <div className="grid grid-cols-2 gap-px border-t border-line bg-line md:grid-cols-3 lg:grid-cols-5">
        {[
          <Metric
            key="winrate"
            label="Win rate"
            value={overview.winRate ?? undefined}
            format={(v) => formatPercent(v)}
            sub={`${formatCount(overview.wins + overview.losses)} decided`}
          />,
          <Metric
            key="avg"
            label="Average bet"
            value={overview.averageStake ?? undefined}
            format={amount}
            sub={`median ${overview.medianStake === null ? '-' : formatAmount(overview.medianStake)}`}
          />,
          <Metric
            key="win"
            label="Largest win"
            value={overview.largestWin}
            format={amount}
            tone="auto"
            sub={code}
          />,
          <Metric
            key="loss"
            label="Largest loss"
            value={overview.largestLoss}
            format={amount}
            tone="auto"
            sub={code}
          />,
          <Metric
            key="dd"
            label="Max drawdown"
            value={overview.maxDrawdown}
            format={amount}
            sub="peak to trough"
          />,
        ].map((metric, index) => (
          <div
            key={metric.key}
            className={cx('bg-surface px-3 py-3 sm:px-4', index === 4 && 'col-span-2 md:col-span-1')}
          >
            {metric}
          </div>
        ))}
      </div>

      <Methodology currency={overview.currency} converted={converted} />
    </section>
  );
}
