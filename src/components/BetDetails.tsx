import { useState } from 'react';
import type { BetRecord } from '@/types';
import { formatAmount as fmt, formatDateTime, formatMultiplier, formatPercent } from '@/utils/format';

/** A labelled field inside the detail drawer. */
function Field({ label, value, mono = true }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="wl-meta mb-0.5">{label}</dt>
      <dd className={`truncate text-[11px] text-ink ${mono ? 'font-mono' : ''}`} title={typeof value === 'string' ? value : undefined}>
        {value}
      </dd>
    </div>
  );
}

/**
 * Expanded view of one bet.
 *
 * Shows the normalised fields that matter for that game rather than dumping the
 * record. The raw JSON is available behind a toggle for anyone who wants to
 * check the parse against the source.
 */
export function BetDetails({
  bet,
  formatAmount,
}: {
  bet: BetRecord;
  formatAmount: (value: number) => string;
}) {
  const [showRaw, setShowRaw] = useState(false);
  const code = bet.currency.toUpperCase();

  return (
    <div className="border-l-2 border-accent bg-raised/60 px-3 py-3 sm:px-4">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4 lg:grid-cols-6">
        <Field label="Placed" value={formatDateTime(bet.placedAt)} />
        <Field label="Settled" value={formatDateTime(bet.updatedAt)} />
        <Field label="Game" value={bet.gameLabel} />
        <Field label="Category" value={bet.category} />
        <Field label="Stake" value={`${formatAmount(bet.stake)} ${code}`} />
        <Field label="Payout" value={`${formatAmount(bet.payout)} ${code}`} />
        <Field
          label="Profit"
          value={
            <span className={bet.profit > 0 ? 'wl-pos' : bet.profit < 0 ? 'wl-neg' : undefined}>
              {bet.profit > 0 ? '+' : bet.profit < 0 ? '−' : ''}
              {formatAmount(Math.abs(bet.profit))} {code}
            </span>
          }
        />
        <Field label="Multiplier" value={formatMultiplier(bet.payoutMultiplier)} />
        <Field label="Outcome" value={bet.outcome} />
        <Field label="Status" value={bet.status ?? '-'} />
        <Field label="Placed on" value={bet.placedOnMobile ? 'Mobile' : 'Desktop'} />
        <Field label="Bet id" value={bet.betId} />
      </dl>

      {bet.sportsbook && (
        <div className="mt-4 border-t border-line pt-3">
          <h4 className="wl-label-strong mb-2">
            Sportsbook · {bet.sportsbook.legCount} {bet.sportsbook.legCount === 1 ? 'leg' : 'legs'}
          </h4>
          <dl className="mb-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            <Field label="Potential multiplier" value={formatMultiplier(bet.sportsbook.potentialMultiplier)} />
            <Field
              label="Combined recorded probability"
              value={
                bet.sportsbook.combinedProbability === null
                  ? '-'
                  : formatPercent(bet.sportsbook.combinedProbability * 100, 2)
              }
            />
            <Field label="Cash-out multiplier" value={formatMultiplier(bet.sportsbook.cashoutMultiplier)} />
            <Field label="Custom bet" value={bet.sportsbook.customBet ? 'Yes' : 'No'} />
          </dl>

          <div className="-mx-3 overflow-x-auto sm:mx-0">
            <table className="wl-table">
              <caption className="sr-only">Legs on this bet</caption>
              <thead>
                <tr>
                  <th scope="col">Leg</th>
                  <th scope="col" className="text-right">
                    Odds
                  </th>
                  <th scope="col" className="text-right">
                    Recorded probability
                  </th>
                  <th scope="col" className="hidden sm:table-cell">
                    Fixture
                  </th>
                  <th scope="col" className="hidden lg:table-cell">
                    Market
                  </th>
                  <th scope="col">State</th>
                </tr>
              </thead>
              <tbody>
                {bet.sportsbook.legs.map((leg, index) => (
                  <tr key={leg.outcomeId ?? index}>
                    <td className="tnum font-mono text-muted">{index + 1}</td>
                    <td className="tnum text-right font-mono">{formatMultiplier(leg.odds)}</td>
                    <td className="tnum text-right font-mono">
                      {leg.probability === null ? '-' : formatPercent(leg.probability * 100, 2)}
                    </td>
                    <td className="hidden max-w-[140px] truncate font-mono text-[10px] text-faint sm:table-cell">
                      {leg.fixtureId ?? '-'}
                    </td>
                    <td className="hidden max-w-[140px] truncate font-mono text-[10px] text-faint lg:table-cell">
                      {leg.marketId ?? '-'}
                    </td>
                    <td className="font-mono text-[11px]">{leg.cancelled ? 'Cancelled' : 'Active'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {bet.crash && (
        <div className="mt-4 border-t border-line pt-3">
          <h4 className="wl-label-strong mb-2">Crash</h4>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            <Field label="Cash-out target" value={formatMultiplier(bet.crash.cashoutAt)} />
            <Field label="Result" value={bet.crash.result ?? '-'} />
            <Field label="Busted" value={bet.crash.busted ? 'Yes' : 'No'} />
            <Field label="Round id" value={bet.crash.roundId ?? '-'} />
          </dl>
        </div>
      )}

      {bet.plinko && (
        <div className="mt-4 border-t border-line pt-3">
          <h4 className="wl-label-strong mb-2">Plinko</h4>
          <dl className="mb-2 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            <Field label="Risk" value={bet.plinko.risk ?? '-'} />
            <Field label="Rows" value={bet.plinko.rows ?? '-'} />
            <Field
              label="Landing point"
              value={bet.plinko.point === null ? '-' : bet.plinko.point.toFixed(2)}
            />
            <Field label="Path length" value={bet.plinko.path.length} />
          </dl>
          {bet.plinko.path.length > 0 && (
            <>
              <p className="wl-meta mb-1">Path</p>
              <p className="break-all font-mono text-[11px] tracking-[0.2em] text-muted">
                {bet.plinko.path.join('')}
              </p>
            </>
          )}
        </div>
      )}

      {bet.mines && (
        <div className="mt-4 border-t border-line pt-3">
          <h4 className="wl-label-strong mb-2">Mines</h4>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            <Field label="Mines" value={bet.mines.minesCount ?? '-'} />
            <Field label="Tiles revealed" value={bet.mines.selections} />
            <Field
              label="Mine positions"
              value={bet.mines.minePositions.length > 0 ? bet.mines.minePositions.join(', ') : '-'}
            />
          </dl>
        </div>
      )}

      <div className="mt-4 border-t border-line pt-3">
        <button
          type="button"
          className="wl-button"
          onClick={() => setShowRaw((v) => !v)}
          aria-expanded={showRaw}
        >
          {showRaw ? 'Hide' : 'Show'} raw record
        </button>
        {showRaw && (
          <pre className="mt-2 max-h-64 overflow-auto border border-line bg-paper p-3 font-mono text-[10px] leading-relaxed text-muted">
            {JSON.stringify(bet.raw, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

/** Compact card used instead of a table row on narrow screens. */
export function BetCard({
  bet,
  formatAmount,
  expanded,
  onToggle,
}: {
  bet: BetRecord;
  formatAmount: (value: number) => string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const code = bet.currency.toUpperCase();

  return (
    <li className="border-b border-line">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-ink/[0.03]"
      >
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="flex items-center gap-2">
            <span className="font-mono text-xs text-ink">{bet.gameLabel}</span>
            <span className="wl-meta">{formatDateTime(bet.placedAt)}</span>
          </span>
          <span className="wl-meta">
            {formatAmount(bet.stake)} {code} · {formatMultiplier(bet.payoutMultiplier)}
          </span>
        </span>
        <span
          className={`tnum shrink-0 font-mono text-xs ${
            bet.profit > 0 ? 'wl-pos' : bet.profit < 0 ? 'wl-neg' : 'text-muted'
          }`}
        >
          <span aria-hidden>{bet.profit > 0 ? '▲ ' : bet.profit < 0 ? '▼ ' : ''}</span>
          {formatAmount(Math.abs(bet.profit))}
        </span>
      </button>
      {expanded && <BetDetails bet={bet} formatAmount={formatAmount} />}
    </li>
  );
}

/** Fallback used when a formatter is not supplied. */
export const defaultAmountFormatter = fmt;
