import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, IndianRupee, RefreshCw, X } from 'lucide-react';
import type { useRates } from '@/hooks/useRates';
import { relativeAge } from '@/utils/currency';
import { cx, formatCount } from '@/utils/format';

type Rates = ReturnType<typeof useRates>;

/**
 * Currency selector and INR conversion switch.
 *
 * Conversion is off by default. The panel states plainly what a fetch sends
 * (currency codes, nothing else) before the user turns it on, shows the rate
 * and its age once active, and offers a hand-entered rate so the feature still
 * works when the rate service is unreachable or the user wants their own
 * number.
 */
export function CurrencyControl({
  rates,
  currencies,
  currency,
  onCurrencyChange,
  unconvertibleCount,
}: {
  rates: Rates;
  currencies: Array<{ currency: string; bets: number }>;
  currency: string | null;
  onCurrencyChange: (code: string) => void;
  unconvertibleCount: number;
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close on outside click or Escape, like any other popover.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target as Node) &&
        !buttonRef.current?.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const converting = rates.enabled && rates.status === 'ready' && rates.table !== null;
  const label = converting ? 'INR' : (currency ?? '-').toUpperCase();

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        className={cx('wl-button min-h-[34px] gap-1.5', converting && 'border-accent text-accent')}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Currency: ${label}. Open currency and conversion settings.`}
      >
        {converting ? <IndianRupee size={11} strokeWidth={2.5} aria-hidden /> : null}
        <span className="tnum">{label}</span>
        {rates.status === 'loading' && (
          <RefreshCw size={10} strokeWidth={2} aria-hidden className="animate-tick-spin" />
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Currency settings"
          className="absolute right-0 z-50 mt-1.5 w-[min(320px,calc(100vw-2rem))] origin-top-right border border-line-strong bg-raised shadow-lg animate-pop-in"
        >
          <header className="flex items-center justify-between border-b border-line px-3 py-2">
            <h3 className="wl-label-strong">Currency</h3>
            <button
              type="button"
              className="flex min-h-[32px] min-w-[32px] items-center justify-center text-muted transition-colors hover:text-ink"
              onClick={() => setOpen(false)}
              aria-label="Close"
            >
              <X size={12} strokeWidth={2} aria-hidden />
            </button>
          </header>

          <div className="p-3">
            {/* Recorded currencies, always available, never converted. */}
            <p className="wl-label mb-1.5">Show as recorded</p>
            <div className="flex flex-wrap gap-1.5">
              {currencies.map((entry) => (
                <button
                  key={entry.currency}
                  type="button"
                  disabled={rates.enabled}
                  onClick={() => onCurrencyChange(entry.currency)}
                  aria-pressed={!rates.enabled && currency === entry.currency}
                  className={cx(
                    'min-h-[32px] border px-2 py-1 font-mono text-2xs uppercase tracking-[0.1em] transition-colors duration-200',
                    !rates.enabled && currency === entry.currency
                      ? 'border-line-strong bg-ink text-paper'
                      : 'border-line text-muted hover:border-line-strong hover:text-ink',
                    rates.enabled && 'opacity-40',
                  )}
                >
                  {entry.currency.toUpperCase()}
                  <span className="ml-1 opacity-60">{formatCount(entry.bets)}</span>
                </button>
              ))}
            </div>
            {currencies.length > 1 && !rates.enabled && (
              <p className="mt-2 text-[11px] leading-relaxed text-muted">
                {currencies.length} currencies found. They are never added together. Convert to
                INR below to see one combined total.
              </p>
            )}

            <div className="my-3 h-px bg-line" />

            {/* Conversion switch. */}
            <label className="flex min-h-[44px] cursor-pointer items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="block text-xs text-ink">Convert everything to INR</span>
                <span className="mt-0.5 block text-[11px] leading-relaxed text-muted">
                  Combines every currency into one ledger.
                </span>
              </span>
              <span className="relative shrink-0">
                <input
                  type="checkbox"
                  className="peer sr-only"
                  // Without this the name would also swallow the helper
                  // sentence below it, which reads poorly aloud.
                  aria-label="Convert everything to INR"
                  checked={rates.enabled}
                  onChange={(event) => rates.setEnabled(event.target.checked)}
                />
                <span
                  aria-hidden
                  className="block h-6 w-11 border border-line bg-surface transition-colors duration-200 peer-checked:border-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2"
                />
                <span
                  aria-hidden
                  className="pointer-events-none absolute left-[3px] top-[3px] h-[18px] w-[18px] bg-ink transition-transform duration-300 ease-instrument peer-checked:translate-x-[20px] peer-checked:bg-accent"
                />
              </span>
            </label>

            {/* The privacy disclosure sits before the action, not after it. */}
            <p className="mt-2 border-l-2 border-line py-1 pl-2.5 text-[11px] leading-relaxed text-muted">
              This is the only request WagerLens makes. It sends currency codes
              {' '}
              <span className="text-ink">only</span>. No stakes, payouts, bets or identifiers. Your
              archive still never leaves this device.
            </p>

            {rates.enabled && (
              <div className="mt-3 border-t border-line pt-3">
                {rates.status === 'loading' && (
                  <p className="flex items-center gap-2 text-[11px] text-muted">
                    <RefreshCw size={11} strokeWidth={2} aria-hidden className="animate-tick-spin" />
                    Fetching rates…
                  </p>
                )}

                {rates.status === 'ready' && rates.table && (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <p className="flex items-center gap-1.5 text-[11px] text-pos">
                        <Check size={11} strokeWidth={2.5} aria-hidden />
                        Rates {relativeAge(rates.table.fetchedAt)}
                      </p>
                      <button
                        type="button"
                        className="wl-button px-2 py-1"
                        onClick={rates.refresh}
                        aria-label="Refresh exchange rates"
                      >
                        <RefreshCw size={10} strokeWidth={2} aria-hidden />
                      </button>
                    </div>
                    <dl className="mt-2 flex flex-col gap-1">
                      {Object.entries(rates.table.rates)
                        .filter(([code]) => code !== 'inr')
                        .map(([code, rate]) => (
                          <div key={code} className="flex items-baseline justify-between gap-2">
                            <dt className="wl-meta">1 {code.toUpperCase()}</dt>
                            <dd className="tnum font-mono text-[11px] text-ink">
                              ₹{rate.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                            </dd>
                          </div>
                        ))}
                    </dl>
                    <p className="wl-meta mt-1.5 normal-case tracking-normal">
                      Source: {rates.table.provider}
                    </p>
                  </>
                )}

                {rates.status === 'error' && (
                  <div className="flex gap-2 border border-neg/40 bg-neg/5 p-2">
                    <AlertTriangle size={12} strokeWidth={2} aria-hidden className="mt-0.5 shrink-0 text-neg" />
                    <div className="min-w-0">
                      <p className="text-[11px] leading-relaxed text-ink">
                        Rates could not be fetched.
                      </p>
                      <p className="mt-0.5 break-words font-mono text-[10px] leading-relaxed text-muted">
                        {rates.error}
                      </p>
                    </div>
                  </div>
                )}

                {/* Manual entry: always available, and the whole fallback when
                    the service is blocked, offline or rate-limiting. */}
                {rates.missing.length > 0 && (
                  <div className="mt-3">
                    <p className="wl-label mb-1.5">Enter a rate by hand</p>
                    {rates.missing.map((code) => (
                      <ManualRateInput
                        key={code}
                        code={code}
                        onSubmit={(value) => rates.setManualRate(code, value)}
                      />
                    ))}
                  </div>
                )}

                {unconvertibleCount > 0 && (
                  <p className="mt-2 text-[11px] leading-relaxed text-muted">
                    {formatCount(unconvertibleCount)} bet(s) are in a currency with no rate and are
                    left out of the converted view rather than being mixed in at face value.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** One hand-entered rate for a currency the service could not price. */
function ManualRateInput({ code, onSubmit }: { code: string; onSubmit: (value: number) => void }) {
  const [value, setValue] = useState('');
  const parsed = Number(value);
  const valid = value.trim() !== '' && Number.isFinite(parsed) && parsed > 0;

  return (
    <form
      className="mb-1.5 flex items-center gap-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) onSubmit(parsed);
      }}
    >
      <label className="wl-meta w-14 shrink-0" htmlFor={`rate-${code}`}>
        1 {code.toUpperCase()}
      </label>
      <span className="text-[11px] text-muted">=</span>
      <input
        id={`rate-${code}`}
        type="number"
        inputMode="decimal"
        step="any"
        min="0"
        placeholder="₹ per unit"
        className="wl-input min-h-[32px] flex-1 py-1 text-base sm:text-[11px]"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <button type="submit" className="wl-button px-2 py-1" disabled={!valid}>
        Set
      </button>
    </form>
  );
}
