/**
 * WagerLens mark: a square aperture with a lens ring. Drawn at a 1px hairline
 * so it sits at the same optical weight as the interface rules around it.
 */
export function Logo({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={className}
      focusable="false"
    >
      <rect x="1.5" y="1.5" width="21" height="21" stroke="currentColor" strokeWidth="1.25" />
      <circle cx="12" cy="12" r="5.25" stroke="currentColor" strokeWidth="1.25" />
      <path d="M12 1.5v3.5M12 19v3.5M1.5 12h3.5M19 12h3.5" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  );
}

/** Wordmark plus mark, used in the header and on the upload screen. */
export function Wordmark({ size = 22 }: { size?: number }) {
  return (
    <span className="flex items-center gap-2.5">
      <Logo size={size} />
      <span className="font-mono text-sm uppercase tracking-[0.2em] text-ink">WagerLens</span>
    </span>
  );
}
