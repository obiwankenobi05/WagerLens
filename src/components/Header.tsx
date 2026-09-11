import { useState } from 'react';
import { Files, RotateCcw } from 'lucide-react';
import { Wordmark } from './Logo';
import { ThemeToggle } from './ui/ThemeToggle';
import { DataQualityBadge } from './DataQualityPanel';
import { CurrencyControl } from './CurrencyControl';
import type { Theme } from '@/hooks/useTheme';
import type { ArchiveMeta } from '@/hooks/useArchive';
import type { useRates } from '@/hooks/useRates';
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
  rates: ReturnType<typeof useRates>;
  unconvertibleCount: number;
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
  rates,
  unconvertibleCount,
}: HeaderProps) {
  const [confirmingReset, setConfirmingReset] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper">
      <div className="wl-shell flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
        <Wordmark size={20} />

        <span aria-hidden className="hidden h-4 w-px bg-line sm:block" />

        {/* Source identity. Truncates hard — it is metadata, not a title. */}
        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          <span className="wl-meta hidden shrink-0 sm:inline">
            {meta.fileCount > 1 ? <Files size={10} strokeWidth={2} aria-hidden className="inline" /> : 'File'}
          </span>
          <span className="truncate font-mono text-[11px] text-ink" title={meta.label}>
            {meta.label}
          </span>
          <span className="wl-meta hidden shrink-0 lg:inline">{formatBytes(meta.totalSize)}</span>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <span className="hidden items-baseline gap-1.5 xl:flex">
            <span className="tnum font-mono text-[11px] text-ink">
              {formatCount(quality.validRecords)}
            </span>
            <span className="wl-meta">bets</span>
          </span>

          <DataQualityBadge quality={quality} parseMs={meta.parseMs} />

          <CurrencyControl
            rates={rates}
            currencies={currencies}
            currency={currency}
            onCurrencyChange={onCurrencyChange}
            unconvertibleCount={unconvertibleCount}
          />

          <ThemeToggle theme={theme} onToggle={onToggleTheme} />

          {/* Two-step: discarding the archive means re-uploading the files. */}
          <button
            type="button"
            className="wl-button min-h-[34px]"
            onClick={() => {
              if (confirmingReset) onReset();
              else setConfirmingReset(true);
            }}
            onBlur={() => setConfirmingReset(false)}
            aria-label={confirmingReset ? 'Confirm — discard this archive' : 'Load other files'}
          >
            <RotateCcw size={11} strokeWidth={2} aria-hidden />
            <span className="hidden md:inline">{confirmingReset ? 'Confirm' : 'New'}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
