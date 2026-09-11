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

/** Compact axis formatter that keeps small crypto amounts legible. */
export function makeAxisFormatter(values: number[]): (value: number) => string {
  const maxAbs = values.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  const decimals = maxAbs >= 100 ? 0 : maxAbs >= 1 ? 2 : maxAbs >= 0.01 ? 3 : 5;
  return (value: number) => {
    if (!Number.isFinite(value)) return '';
    if (value === 0) return '0';
    const sign = value < 0 ? '−' : '';
    return `${sign}${Math.abs(value).toFixed(decimals)}`;
  };
}
