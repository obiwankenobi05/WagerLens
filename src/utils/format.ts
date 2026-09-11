/**
 * Formatting helpers.
 *
 * Crypto archives span many orders of magnitude (0.00010879 to 1.09 USDC in
 * the reference file), so a fixed two-decimal format would erase most of the
 * data. Precision is therefore derived from the magnitudes actually present,
 * and held constant across a column so figures stay vertically aligned.
 */

/** Never render more than this many decimals, however small the values get. */
const MAX_DECIMALS = 8;

/** Chooses a decimal count that keeps the largest values from being noisy. */
export function decimalsForScale(maxAbs: number): number {
  if (!Number.isFinite(maxAbs) || maxAbs <= 0) return 2;
  if (maxAbs >= 1000) return 2;
  if (maxAbs >= 100) return 3;
  if (maxAbs >= 1) return 4;
  if (maxAbs >= 0.01) return 6;
  return MAX_DECIMALS;
}

/** Decimals needed to show `value` to two significant digits. */
function decimalsForSignificance(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.max(0, Math.min(MAX_DECIMALS, 1 - Math.floor(Math.log10(value))));
}

/**
 * The most decimals worth showing at a given magnitude.
 *
 * Once the largest figure runs to five digits, a four-decimal tail is both
 * unreadable and false precision, the sub-rupee remainder of a ₹46,132 total
 * carries no information. This caps what the small-value rule below can ask
 * for.
 */
function maxDecimalsForScale(maxAbs: number): number {
  if (!Number.isFinite(maxAbs) || maxAbs <= 0) return 2;
  if (maxAbs >= 10_000) return 2;
  if (maxAbs >= 1000) return 3;
  if (maxAbs >= 100) return 4;
  if (maxAbs >= 1) return 6;
  return MAX_DECIMALS;
}

/**
 * Builds a fixed-precision amount formatter for a set of values.
 *
 * Precision is driven from both ends of the range: enough decimals that the
 * largest figure is not noisy, and enough that the smallest non-zero one does
 * not collapse to 0.00. A crypto archive spanning 0.0001 to 12.7 needs five
 * decimals for both to stay readable; choosing from the maximum alone would
 * round every small stake away.
 *
 * Every figure rendered against the same scale uses the same decimal count,
 * which is what makes a column of tabular numerals line up.
 */
export function makeAmountFormatter(values: number[]): (value: number) => string {
  let maxAbs = 0;
  let minNonZero = Number.POSITIVE_INFINITY;
  for (const value of values) {
    if (!Number.isFinite(value)) continue;
    const abs = Math.abs(value);
    if (abs > maxAbs) maxAbs = abs;
    if (abs > 0 && abs < minNonZero) minNonZero = abs;
  }

  const decimals = Math.min(
    MAX_DECIMALS,
    maxDecimalsForScale(maxAbs),
    Math.max(
      decimalsForScale(maxAbs),
      Number.isFinite(minNonZero) ? decimalsForSignificance(minNonZero) : 0,
    ),
  );

  const nf = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return (value: number) => (Number.isFinite(value) ? nf.format(value) : '-');
}

/** One-off amount format when no shared scale is available. */
export function formatAmount(value: number): string {
  if (!Number.isFinite(value)) return '-';
  const decimals = decimalsForScale(Math.abs(value));
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** Amount with an explicit sign. Used wherever a figure is a delta. */
export function formatSigned(value: number, format: (v: number) => string = formatAmount): string {
  if (!Number.isFinite(value)) return '-';
  if (value === 0) return format(0);
  return `${value > 0 ? '+' : '−'}${format(Math.abs(value))}`;
}

/** Percentage with a fixed precision. `null` renders as an em dash. */
export function formatPercent(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return '-';
  return `${value.toFixed(digits)}%`;
}

/** Signed percentage, for ROI and similar deltas. */
export function formatSignedPercent(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return '-';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${Math.abs(value).toFixed(digits)}%`;
}

/** Integer with thousands separators. */
export function formatCount(value: number): string {
  return Number.isFinite(value) ? Math.round(value).toLocaleString('en-US') : '-';
}

/** Decimal multiplier, e.g. `2.00×`. */
export function formatMultiplier(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  return `${value.toFixed(digits)}×`;
}

const DATE_TIME = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const DATE_ONLY = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const TIME_ONLY = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

export function formatDateTime(date: Date | number | null): string {
  if (date === null) return '-';
  const d = typeof date === 'number' ? new Date(date) : date;
  return Number.isNaN(d.getTime()) ? '-' : DATE_TIME.format(d);
}

export function formatDate(date: Date | number | null): string {
  if (date === null) return '-';
  const d = typeof date === 'number' ? new Date(date) : date;
  return Number.isNaN(d.getTime()) ? '-' : DATE_ONLY.format(d);
}

export function formatTime(date: Date | number | null): string {
  if (date === null) return '-';
  const d = typeof date === 'number' ? new Date(date) : date;
  return Number.isNaN(d.getTime()) ? '-' : TIME_ONLY.format(d);
}

/** `2026-01-28` in local time, used for date-range inputs and period keys. */
export function toDateInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Parses a `yyyy-mm-dd` input into local midnight, or `null` if unusable. */
export function fromDateInputValue(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** `1.2 MB`, `840 KB`, for the uploaded file's size. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Joins class names, dropping falsy entries. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
