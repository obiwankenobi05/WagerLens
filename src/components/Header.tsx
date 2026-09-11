import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { Wordmark } from './Logo';
import { ThemeToggle } from './ui/ThemeToggle';
import { DataQualityBadge } from './DataQualityPanel';
import type { Theme } from '@/hooks/useTheme';
import type { ArchiveMeta } from '@/hooks/useArchive';
import type { DataQuality } from '@/types';
import { formatBytes, formatCount } from '@/utils/format';

interface HeaderProps {
  meta: ArchiveMeta;
  quality: DataQuality;
  theme: Theme;
  onToggleTheme: () => void;
  onReset: () => void;
  currencies: Array<{ currency: string; bets: number }>;
  currency: string | null;
  onCurrencyChange: (currency: string) => void;
}

export function Header({
  meta,
  quality,
  theme,
  onToggleTheme,
  onReset,
  currencies,
  currency,
  onCurrencyChange,
}: HeaderProps) {
  const [confirmingReset, setConfirmingReset] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6">
        <Wordmark size={20} />

        <span aria-hidden className="hidden h-4 w-px bg-line sm:block" />

        {/* File identity. Truncates hard — the filename is metadata, not a title. */}
        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          <span className="wl-meta shrink-0">File</span>
          <span className="truncate font-mono text-[11px] text-ink" title={meta.fileName}>
            {meta.fileName}
          </span>
          <span className="wl-meta hidden shrink-0 sm:inline">{formatBytes(meta.fileSize)}</span>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <span className="hidden items-baseline gap-1.5 md:flex">
            <span className="tnum font-mono text-[11px] text-ink">
              {formatCount(quality.validRecords)}
            </span>
            <span className="wl-meta">records</span>
          </span>

          <DataQualityBadge quality={quality} parseMs={meta.parseMs} />

          {currencies.length > 1 && currency && (
            <label className="flex items-center gap-1.5">
              <span className="sr-only">Currency</span>
              <select
                className="wl-select w-auto py-1 text-[11px] uppercase"
                value={currency}
                onChange={(event) => onCurrencyChange(event.target.value)}
              >
                {currencies.map((entry) => (
                  <option key={entry.currency} value={entry.currency}>
                    {entry.currency.toUpperCase()} ({entry.bets})
                  </option>
                ))}
              </select>
            </label>
          )}

          <ThemeToggle theme={theme} onToggle={onToggleTheme} />

          {/* Two-step reset: discarding the archive means re-uploading the file. */}
          <button
            type="button"
            className="wl-button"
            onClick={() => {
              if (confirmingReset) onReset();
              else setConfirmingReset(true);
            }}
            onBlur={() => setConfirmingReset(false)}
            aria-label={confirmingReset ? 'Confirm — discard this archive' : 'Load another archive'}
          >
            <RotateCcw size={11} strokeWidth={2} aria-hidden />
            <span className="hidden sm:inline">{confirmingReset ? 'Confirm' : 'New file'}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
