import { useEffect, useId, useRef, useState } from 'react';
import { Info, X } from 'lucide-react';
import type { DataQuality, ExclusionReason } from '@/types';
import { formatCount } from '@/utils/format';

/** Plain-language explanation of each exclusion reason. */
const REASON_COPY: Record<ExclusionReason, { title: string; body: string }> = {
  rejected: {
    title: 'Rejected',
    body:
      'The bet was never accepted, so the stake was returned. The archive records an equal ' +
      'amount and payout on these; counting them would inflate both wagered and returned ' +
      'and add phantom break-even bets to the win rate.',
  },
  cancelled: {
    title: 'Cancelled or voided',
    body: 'The wager was unwound after placement, so it never resolved to a win or a loss.',
  },
  active: {
    title: 'Still open',
    body:
      'The bet had not settled when the archive was exported. Its outcome is unknown, so ' +
      'booking it now would record a loss for a bet that may yet win.',
  },
  malformed: {
    title: 'Unreadable record',
    body: 'The record was not a recognisable bet object and could not be interpreted safely.',
  },
  'unparseable-date': {
    title: 'No usable timestamp',
    body: 'Without a placement time the bet cannot be ordered, so it cannot join any time series.',
  },
  'invalid-amounts': {
    title: 'Invalid amounts',
    body: 'The stake or payout was missing, non-numeric or negative.',
  },
  duplicate: {
    title: 'Already counted',
    body:
      'The bet appeared in more than one uploaded file, either from overlapping date ranges or the ' +
      'same day downloaded twice. It is counted once, in the first file that contained it, so ' +
      'no figure is inflated by a repeated export.',
  },
};

/**
 * Data-quality summary, opened from the header badge.
 *
 * Every excluded record is accounted for by reason, so the headline figures can
 * be reconciled against the raw file.
 */
export function DataQualityPanel({
  quality,
  parseMs,
  onClose,
}: {
  quality: DataQuality;
  parseMs: number;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  // Focus the dialog on open and restore it to the trigger on close, so the
  // panel is operable without a mouse.
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const reasons = (Object.entries(quality.byReason) as Array<[ExclusionReason, number]>).filter(
    ([, count]) => count > 0,
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/30 p-4 animate-fade-in sm:p-8"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="wl-dq-title"
        className="w-full max-w-[620px] border border-line-strong bg-surface animate-rise-in"
      >
        <header className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <h2 id="wl-dq-title" className="wl-label-strong">
            Data quality
          </h2>
          <button ref={closeRef} type="button" className="wl-button wl-button-ghost" onClick={onClose}>
            <X size={12} strokeWidth={2} aria-hidden />
            <span className="sr-only">Close</span>
          </button>
        </header>

        <div className="max-h-[70vh] overflow-y-auto p-4">
          <dl className="grid grid-cols-3 gap-px border border-line bg-line">
            {[
              ['Records read', formatCount(quality.totalRecords)],
              ['Analyzed', formatCount(quality.validRecords)],
              ['Excluded', formatCount(quality.excludedRecords)],
            ].map(([term, value]) => (
              <div key={term} className="bg-surface px-3 py-2.5">
                <dt className="wl-meta">{term}</dt>
                <dd className="tnum mt-1 font-mono text-base text-ink">{value}</dd>
              </div>
            ))}
          </dl>

          <p className="mt-3 text-[11px] leading-relaxed text-muted">
            Parsed in {parseMs.toFixed(0)} ms, entirely in this browser. Excluded records are left
            out of every figure on the dashboard. They are listed here so the totals can be
            reconciled against the original file.
          </p>

          {reasons.length > 0 ? (
            <div className="mt-5">
              <h3 className="wl-label-strong mb-2">Why records were excluded</h3>
              <ul className="border-t border-line">
                {reasons.map(([reason, count]) => (
                  <li key={reason} className="border-b border-line py-2.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-xs text-ink">{REASON_COPY[reason].title}</span>
                      <span className="tnum shrink-0 font-mono text-xs text-accent">
                        {formatCount(count)}
                      </span>
                    </div>
                    <p className="mt-1 max-w-[62ch] text-[11px] leading-relaxed text-muted">
                      {REASON_COPY[reason].body}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-5 border border-dashed border-line px-3 py-4 text-center text-[11px] text-muted">
              Every record in this archive was readable and counted.
            </p>
          )}

          {quality.notes.length > 0 && (
            <div className="mt-5">
              <h3 className="wl-label-strong mb-2">Notes</h3>
              <ul className="flex flex-col gap-1.5">
                {quality.notes.map((note) => (
                  <li key={note} className="flex gap-2 text-[11px] leading-relaxed text-muted">
                    <span aria-hidden className="mt-[5px] h-1 w-1 shrink-0 bg-accent" />
                    {note}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <h3 className="wl-label mb-1.5">Games found</h3>
              <p className="font-mono text-[11px] text-ink">
                {quality.games.length > 0 ? quality.games.join(', ') : '-'}
              </p>
            </div>
            <div>
              <h3 className="wl-label mb-1.5">Currencies found</h3>
              <p className="font-mono text-[11px] uppercase text-ink">
                {quality.currencies.length > 0 ? quality.currencies.join(', ') : '-'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Header badge: `221 analyzed · 3 excluded`. Opens the panel. */
export function DataQualityBadge({ quality, parseMs }: { quality: DataQuality; parseMs: number }) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <>
      <button
        type="button"
        className="wl-button gap-1.5"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-controls={open ? id : undefined}
        // The visible text is just counts; the name has to say what opens.
        aria-label={`Data quality: ${formatCount(quality.validRecords)} records analyzed, ${formatCount(
          quality.excludedRecords,
        )} excluded. Open the explanation.`}
        title="How this archive was read"
      >
        <Info size={11} strokeWidth={2} aria-hidden />
        <span className="tnum">
          {formatCount(quality.validRecords)}
          <span className="hidden sm:inline"> analyzed</span>
          {quality.excludedRecords > 0 && (
            <>
              <span aria-hidden className="mx-1 text-faint">
                ·
              </span>
              <span className="text-accent">{formatCount(quality.excludedRecords)}</span>
              <span className="hidden sm:inline"> excluded</span>
            </>
          )}
        </span>
      </button>
      {open && <DataQualityPanel quality={quality} parseMs={parseMs} onClose={() => setOpen(false)} />}
    </>
  );
}
