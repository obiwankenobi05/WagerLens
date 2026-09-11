import type { ReactNode } from 'react';
import { useCountUp } from '@/hooks/useCountUp';
import { cx } from '@/utils/format';

type Tone = 'neutral' | 'auto' | 'accent';

interface MetricProps {
  label: string;
  /** Numeric value driving the count-up. Omit for a purely textual metric. */
  value?: number;
  /** Renders the eased value. Receives the in-flight number each frame. */
  format: (value: number) => string;
  /** Shown instead of the formatted value when the metric is undefined. */
  placeholder?: string;
  /** Small line under the figure — a unit, a count, a qualifier. */
  sub?: ReactNode;
  /** `auto` colours by sign; `accent` marks the single emphasised figure. */
  tone?: Tone;
  /** Enlarges the figure. Used for the one headline metric per group. */
  emphasis?: boolean;
  /** Screen-reader text replacing the visual value, when it needs more context. */
  srValue?: string;
}

/**
 * A single KPI readout.
 *
 * Sign is carried by a leading glyph as well as colour, so the positive/negative
 * distinction survives a monochrome display or colour-vision deficiency.
 */
export function Metric({
  label,
  value,
  format,
  placeholder = '—',
  sub,
  tone = 'neutral',
  emphasis = false,
  srValue,
}: MetricProps) {
  const defined = typeof value === 'number' && Number.isFinite(value);
  const animated = useCountUp(defined ? value : 0);

  const signed = tone === 'auto' && defined && value !== 0;
  const positive = signed && value > 0;

  // When the glyph carries the sign, the number is formatted unsigned —
  // otherwise a negative figure reads "▼ −4.67", stating the sign twice.
  const display = defined ? format(signed ? Math.abs(animated) : animated) : placeholder;

  // The glyph is decorative, so a signed metric always needs the sign spelled
  // out for assistive technology.
  const spokenValue = srValue ?? (signed ? `${positive ? 'positive' : 'negative'} ${display}` : undefined);

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="wl-label truncate">{label}</span>
      <span
        className={cx(
          'tnum flex items-baseline gap-1.5 font-mono tracking-tight',
          emphasis ? 'text-[clamp(1.35rem,3.4vw,1.9rem)]' : 'text-[clamp(1rem,2.2vw,1.2rem)]',
          tone === 'accent' && 'text-accent',
          signed && (positive ? 'wl-pos' : 'wl-neg'),
        )}
      >
        {signed && (
          // Glyph, not just hue. aria-hidden because srValue/label carry it.
          <span aria-hidden className="text-[0.7em] leading-none opacity-70">
            {positive ? '▲' : '▼'}
          </span>
        )}
        <span className="truncate">
          {spokenValue && <span className="sr-only">{spokenValue}</span>}
          <span aria-hidden={spokenValue ? true : undefined}>{display}</span>
        </span>
      </span>
      {sub && <span className="wl-meta truncate">{sub}</span>}
    </div>
  );
}

/** A compact label/value pair for dense stat lists. */
export function Stat({
  label,
  value,
  tone = 'neutral',
  title,
}: {
  label: string;
  value: ReactNode;
  tone?: 'neutral' | 'pos' | 'neg';
  title?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line/60 py-1.5 last:border-b-0">
      <span className="wl-label truncate" title={title}>
        {label}
      </span>
      <span
        className={cx(
          'tnum shrink-0 font-mono text-xs',
          tone === 'pos' && 'wl-pos',
          tone === 'neg' && 'wl-neg',
        )}
      >
        {value}
      </span>
    </div>
  );
}
