import type { ReactNode } from 'react';
import { cx } from '@/utils/format';

interface PanelProps {
  /** Short uppercase section label shown on the rail. */
  label: string;
  /** Optional index marker rendered before the label, e.g. `04`. */
  index?: string;
  /** Right-aligned controls on the rail. */
  actions?: ReactNode;
  /** Small note under the rail — usually a definition or a caveat. */
  note?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Renders without the outer border, for panels nested in a bordered parent. */
  bare?: boolean;
  id?: string;
}

/**
 * The standard section container: a hairline box with a label rail across the
 * top. Every dashboard section uses it so the grid reads as one instrument.
 */
export function Panel({ label, index, actions, note, children, className, bare, id }: PanelProps) {
  return (
    <section
      id={id}
      className={cx('wl-themed min-w-0', !bare && 'wl-panel', className)}
      aria-label={label}
    >
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line px-3 py-2 sm:px-4">
        <div className="flex min-w-0 items-baseline gap-2">
          {index && <span className="wl-meta shrink-0 text-accent">{index}</span>}
          <h2 className="wl-label-strong truncate">{label}</h2>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </header>
      {note && (
        <p className="border-b border-line/60 px-3 py-2 text-[11px] leading-relaxed text-muted sm:px-4">
          {note}
        </p>
      )}
      <div className="min-w-0 p-3 sm:p-4">{children}</div>
    </section>
  );
}

/** An empty-state body for a panel whose data is absent. */
export function PanelEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[96px] items-center justify-center border border-dashed border-line px-4 py-6 text-center">
      <p className="max-w-sm text-[11px] leading-relaxed text-muted">{children}</p>
    </div>
  );
}
