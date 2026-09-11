import { cx } from '@/utils/format';

/**
 * A signed figure for tables and inline prose.
 *
 * Prefixes an explicit + or − and adds a hue, so the sign is readable without
 * colour. `neutral` suppresses both for a magnitude that carries no direction.
 */
export function SignedValue({
  value,
  format,
  className,
  showSign = true,
}: {
  value: number;
  format: (value: number) => string;
  className?: string;
  showSign?: boolean;
}) {
  if (!Number.isFinite(value)) return <span className={cx('tnum text-faint', className)}>-</span>;

  const positive = value > 0;
  const negative = value < 0;
  const body = format(Math.abs(value));

  return (
    <span
      className={cx('tnum font-mono', positive && 'wl-pos', negative && 'wl-neg', className)}
    >
      {showSign && positive && '+'}
      {showSign && negative && '−'}
      {body}
    </span>
  );
}

/** A horizontal magnitude bar used inside table cells. */
export function Bar({
  value,
  max,
  tone = 'neutral',
  label,
}: {
  value: number;
  max: number;
  tone?: 'neutral' | 'auto';
  label?: string;
}) {
  const ratio = max > 0 ? Math.min(1, Math.abs(value) / max) : 0;
  const negative = tone === 'auto' && value < 0;

  return (
    <span
      className="relative block h-1.5 w-full min-w-[36px] bg-line/50"
      role="img"
      aria-label={label}
    >
      <span
        className={cx(
          'absolute inset-y-0 left-0 transition-[width] duration-500 ease-instrument',
          tone === 'neutral' && 'bg-ink/70',
          tone === 'auto' && (negative ? 'bg-neg' : 'bg-pos'),
        )}
        style={{ width: `${ratio * 100}%` }}
      />
    </span>
  );
}
