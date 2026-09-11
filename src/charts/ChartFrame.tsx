import type { ReactNode } from 'react';

/**
 * Shared chart chrome.
 *
 * Charts inherit `currentColor` from this wrapper, which is what makes every
 * Recharts stroke follow the theme without a re-render on switch: the SVG
 * attributes stay `currentColor` and CSS resolves them.
 */
export function ChartFrame({
  height,
  children,
  className,
}: {
  height: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`w-full text-ink ${className ?? ''}`} style={{ height }}>
      {children}
    </div>
  );
}

/** Tooltip shell — a hairline box matching the panel language. */
export function TooltipBox({ title, rows }: { title: string; rows: Array<[string, ReactNode]> }) {
  return (
    <div className="border border-line-strong bg-raised px-2.5 py-2 shadow-sm">
      <p className="wl-meta mb-1.5 text-ink">{title}</p>
      <dl className="flex flex-col gap-1">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-4">
            <dt className="wl-meta">{label}</dt>
            <dd className="tnum font-mono text-[11px] text-ink">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Shown in place of a chart when there is too little data to plot. */
export function ChartEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-[120px] items-center justify-center border border-dashed border-line">
      <p className="max-w-xs px-4 text-center text-[11px] leading-relaxed text-muted">{children}</p>
    </div>
  );
}

/**
 * Builds a time-axis tick formatter suited to the span being shown.
 *
 * A twelve-hour archive and a two-year one need different labels; picking from
 * the span avoids both unreadable repetition and useless precision.
 */
export function makeTimeTickFormatter(spanMs: number): (value: number) => string {
  if (spanMs <= 36 * 3600_000) {
    const f = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
    return (value) => f.format(new Date(value));
  }
  if (spanMs <= 180 * 86_400_000) {
    const f = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' });
    return (value) => f.format(new Date(value));
  }
  const f = new Intl.DateTimeFormat('en-GB', { month: 'short', year: '2-digit' });
  return (value) => f.format(new Date(value));
}

/**
 * Axis formatter that keeps both tiny crypto amounts and five-figure fiat
 * amounts legible in a narrow gutter.
 *
 * Above ten thousand it switches to a compact suffix, because "−28500" does
 * not fit where "−28.5k" does, and an axis label only needs to convey scale.
 */
export function makeAxisFormatter(values: number[]): (value: number) => string {
  const maxAbs = values.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

  if (maxAbs >= 10_000) {
    return (value: number) => {
      if (!Number.isFinite(value)) return '';
      if (value === 0) return '0';
      const sign = value < 0 ? '−' : '';
      const abs = Math.abs(value);
      if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
      return `${sign}${(abs / 1000).toFixed(abs >= 100_000 ? 0 : 1)}k`;
    };
  }

  const decimals = maxAbs >= 100 ? 0 : maxAbs >= 1 ? 2 : maxAbs >= 0.01 ? 3 : 5;
  return (value: number) => {
    if (!Number.isFinite(value)) return '';
    if (value === 0) return '0';
    const sign = value < 0 ? '−' : '';
    return `${sign}${Math.abs(value).toFixed(decimals)}`;
  };
}

/**
 * Evenly spaced tick positions across a time domain.
 *
 * Left to itself, Recharts emits a tick per data point when timestamps cluster
 * — an archive with many bets in the same minute, or several files whose
 * ranges coincide — and `minTickGap` does not cull them because they sit at
 * nearly the same pixel. Supplying the ticks makes the axis independent of how
 * the data happens to be distributed.
 */
export function evenTimeTicks(min: number, max: number, count = 6): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (max <= min) return [min];
  const n = Math.max(2, count);
  const step = (max - min) / (n - 1);
  return Array.from({ length: n }, (_, i) => Math.round(min + step * i));
}

/**
 * Advance width of one character in the axis font, in pixels.
 *
 * Measured from the rendered SVG rather than assumed: the axis text is 10px
 * but the fallback monospace face renders at ~9.8–10.2px per glyph. Estimating
 * this too low silently clips the leading minus sign off negative labels.
 */
const AXIS_CHAR_PX = 10;

/**
 * Gutter wide enough for the longest label the formatter will produce.
 *
 * Sized from the data extremes plus one character of headroom, because the
 * ticks Recharts generates are rounded outward from the data and can be a
 * character longer than any real value (9.8k of data → a 10.0k tick).
 */
export function axisWidthFor(values: number[], format: (v: number) => string): number {
  const longest = values.reduce((m, v) => Math.max(m, format(v).length), 1);
  return Math.min(96, Math.max(44, (longest + 1) * AXIS_CHAR_PX + 8));
}
