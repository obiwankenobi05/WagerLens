import { useCallback, useRef, useState } from 'react';
import { AlertTriangle, ChevronDown, FileJson, Lock, Upload } from 'lucide-react';
import { Wordmark } from './Logo';
import { ThemeToggle } from './ui/ThemeToggle';
import type { Theme } from '@/hooks/useTheme';
import type { LoadState } from '@/hooks/useArchive';
import { cx } from '@/utils/format';

/** Parse-stage readout, with per-file progress when several were dropped. */
function ParsingIndicator({ label, total, done }: { label: string; total: number; done: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex flex-col items-center gap-4 px-5 py-10" role="status" aria-live="polite">
      <div className="relative h-8 w-8">
        <span className="absolute inset-0 border border-line" />
        <span className="absolute inset-0 origin-center animate-tick-spin border-l border-t border-accent" />
      </div>
      <div className="w-full max-w-[260px] text-center">
        <p className="wl-label-strong">Reading {total === 1 ? 'archive' : `${total} archives`}</p>
        <p className="wl-meta mt-1 truncate">{label}</p>
        {total > 1 && (
          <div className="mt-3">
            <div className="h-px w-full bg-line">
              <div
                className="h-px bg-accent transition-[width] duration-300 ease-instrument"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="wl-meta mt-1.5 tnum">
              {done} / {total}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

const STEPS: Array<{ n: string; text: string; hint?: string }> = [
  { n: '1', text: 'Open your Stake account menu.' },
  { n: '2', text: 'Go to My Bets.' },
  { n: '3', text: 'Open the Archive tab.' },
  {
    n: '4',
    text: 'Download the JSON for each date you want to analyse.',
    hint: 'Stake exports one file per day. There is no way to cover a range in a single file.',
  },
  {
    n: '5',
    text: 'Drop all of those files here together.',
    hint: 'WagerLens merges them into one history and also reports each file on its own.',
  },
];

/** Collapsible walkthrough for getting the export out of Stake. */
function ExportGuide() {
  const [open, setOpen] = useState(false);

  return (
    <div className="wl-panel mt-5 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-[44px] w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors duration-200 hover:bg-ink/[0.03] sm:px-4"
      >
        <span className="flex items-center gap-2">
          <span className="wl-meta text-accent">?</span>
          <span className="wl-label-strong">Where do I get the JSON files</span>
        </span>
        <ChevronDown
          size={13}
          strokeWidth={2}
          aria-hidden
          className={cx('shrink-0 text-muted transition-transform duration-300 ease-instrument', open && 'rotate-180')}
        />
      </button>

      {/* Animates height without measuring the content. */}
      <div
        className={cx(
          'grid transition-[grid-template-rows,opacity,visibility] duration-300 ease-instrument',
          open ? 'visible grid-rows-[1fr] opacity-100' : 'invisible grid-rows-[0fr] opacity-0',
        )}
      >
        <div className="overflow-hidden">
          <ol className="border-t border-line px-3 py-3 sm:px-4">
            {STEPS.map((step, index) => (
              <li
                key={step.n}
                className="relative flex gap-3 pb-3 last:pb-0"
                style={open ? { animation: `rise-in 320ms cubic-bezier(0.2,0.9,0.25,1) ${index * 50}ms both` } : undefined}
              >
                {/* Connector rail between the step markers. */}
                {index < STEPS.length - 1 && (
                  <span aria-hidden className="absolute bottom-0 left-[9px] top-5 w-px bg-line" />
                )}
                <span
                  aria-hidden
                  className="relative z-10 flex h-[19px] w-[19px] shrink-0 items-center justify-center border border-line-strong bg-surface font-mono text-[10px] text-ink"
                >
                  {step.n}
                </span>
                <span className="min-w-0 pt-0.5">
                  <span className="block text-[13px] leading-snug text-ink">{step.text}</span>
                  {step.hint && (
                    <span className="mt-1 block text-[11px] leading-relaxed text-muted">{step.hint}</span>
                  )}
                </span>
              </li>
            ))}
          </ol>
          <p className="border-t border-line px-3 py-2.5 text-[11px] leading-relaxed text-muted sm:px-4">
            Files whose dates overlap are fine. A bet appearing in two exports is counted once.
          </p>
        </div>
      </div>
    </div>
  );
}

const SPEC_ROWS: Array<[string, string]> = [
  ['Format', 'Stake archive · JSON'],
  ['Files', 'One per date · drop many'],
  ['Processing', 'In-browser, single pass'],
  ['Retention', 'Cleared when you close the tab'],
];

export function UploadScreen({
  state,
  onFiles,
  theme,
  onToggleTheme,
}: {
  state: LoadState;
  onFiles: (files: File[]) => void;
  theme: Theme;
  onToggleTheme: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const loading = state.status === 'loading';

  const handleFiles = useCallback(
    (list: FileList | null) => {
      if (!list || list.length === 0) return;
      onFiles(Array.from(list));
    },
    [onFiles],
  );

  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <header className="flex items-center justify-between border-b border-line px-4 py-3 sm:px-6">
        <Wordmark />
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-8 sm:px-6 sm:py-10">
        <div className="w-full max-w-[660px] animate-rise-in">
          <div className="mb-7 sm:mb-9">
            <p className="wl-meta mb-3 text-accent">Local analytics instrument</p>
            <h1 className="text-[clamp(1.6rem,7vw,2.5rem)] font-semibold leading-[1.05] tracking-tight text-ink">
              Your betting history,
              <br />
              analyzed.
            </h1>
            <p className="mt-4 max-w-[44ch] text-[13px] leading-relaxed text-muted sm:text-sm">
              Upload your Stake betting archives to see where the money went: P&amp;L over time,
              drawdowns, game breakdowns and the full ledger behind them.
            </p>
          </div>

          {state.status === 'error' && (
            <div role="alert" className="mb-5 flex gap-3 border border-neg/50 bg-neg/5 px-4 py-3 animate-rise-in">
              <AlertTriangle size={15} strokeWidth={1.75} className="mt-0.5 shrink-0 text-neg" aria-hidden />
              <div className="min-w-0">
                <p className="text-xs font-medium text-ink">{state.message}</p>
                {state.detail && (
                  <p className="mt-1 break-words font-mono text-[11px] leading-relaxed text-muted">
                    {state.detail}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* A label wrapping a real file input: the whole panel is clickable,
              and the control stays keyboard-operable and correctly announced. */}
          <label
            className="wl-drop block cursor-pointer focus-within:ring-2 focus-within:ring-accent focus-within:ring-offset-2"
            data-dragging={dragging}
            onDragOver={(event) => {
              event.preventDefault();
              if (!loading) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              if (!loading) handleFiles(event.dataTransfer.files);
            }}
          >
            <input
              ref={inputRef}
              type="file"
              accept="application/json,.json"
              multiple
              className="sr-only"
              disabled={loading}
              onChange={(event) => {
                handleFiles(event.target.files);
                // Reset so re-selecting the same files fires a change event.
                event.target.value = '';
              }}
            />

            <span aria-hidden className="pointer-events-none absolute inset-0">
              {[
                'left-0 top-0 border-l border-t',
                'right-0 top-0 border-r border-t',
                'left-0 bottom-0 border-l border-b',
                'right-0 bottom-0 border-r border-b',
              ].map((position) => (
                <span key={position} className={`absolute h-2.5 w-2.5 border-line-strong ${position}`} />
              ))}
            </span>

            {loading ? (
              <ParsingIndicator label={state.label} total={state.total} done={state.done} />
            ) : (
              <div className="flex flex-col items-center gap-5 px-5 py-9 text-center sm:py-12">
                <span
                  className={cx(
                    'flex h-11 w-11 items-center justify-center border transition-all duration-300 ease-instrument',
                    dragging ? 'scale-110 border-accent' : 'border-line-strong',
                  )}
                >
                  {dragging ? (
                    <FileJson size={18} strokeWidth={1.5} className="text-accent" aria-hidden />
                  ) : (
                    <Upload size={18} strokeWidth={1.5} className="text-ink" aria-hidden />
                  )}
                </span>
                <div>
                  <p className="text-sm text-ink">Drop your Stake JSON files here</p>
                  <p className="mt-1.5 text-[11px] text-muted">One file per date. Add as many as you like</p>
                </div>
                <span className="wl-button wl-button-primary min-h-[44px] px-4">Choose JSON files</span>
              </div>
            )}
          </label>

          <p className="mt-4 flex items-start gap-2 text-[11px] leading-relaxed text-muted">
            <Lock size={12} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden />
            <span>
              Parsed locally. Your betting history never leaves this device. There is no server,
              no account and no upload.
            </span>
          </p>

          <ExportGuide />

          <dl className="mt-7 grid grid-cols-1 border-t border-line sm:grid-cols-2">
            {SPEC_ROWS.map(([term, value]) => (
              <div
                key={term}
                className="flex items-baseline justify-between gap-3 border-b border-line px-0.5 py-2 sm:odd:border-r sm:odd:pr-4 sm:even:pl-4"
              >
                <dt className="wl-meta">{term}</dt>
                <dd className="font-mono text-[11px] text-muted">{value}</dd>
              </div>
            ))}
          </dl>

          <p className="mt-6 text-[11px] leading-relaxed text-faint">
            WagerLens describes what is in your archive. It is an analytics tool, not betting
            advice. Historical results do not predict future outcomes.
          </p>
        </div>
      </main>
    </div>
  );
}
