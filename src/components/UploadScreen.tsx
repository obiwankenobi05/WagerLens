import { useCallback, useRef, useState } from 'react';
import { AlertTriangle, FileJson, Lock, Upload } from 'lucide-react';
import { Wordmark } from './Logo';
import { ThemeToggle } from './ui/ThemeToggle';
import type { Theme } from '@/hooks/useTheme';
import type { LoadState } from '@/hooks/useArchive';

/** Parse-stage readout shown while the archive is being read. */
function ParsingIndicator({ fileName }: { fileName: string }) {
  return (
    <div className="flex flex-col items-center gap-4 py-10" role="status" aria-live="polite">
      <div className="relative h-8 w-8">
        <span className="absolute inset-0 border border-line" />
        <span className="absolute inset-0 origin-center animate-tick-spin border-l border-t border-accent" />
      </div>
      <div className="text-center">
        <p className="wl-label-strong">Parsing archive</p>
        <p className="wl-meta mt-1 max-w-[240px] truncate">{fileName}</p>
      </div>
    </div>
  );
}

const SPEC_ROWS: Array<[string, string]> = [
  ['Format', 'Stake betting archive · JSON'],
  ['Processing', 'In-browser, single pass'],
  ['Network', 'None — nothing is uploaded'],
  ['Retention', 'Cleared when you close the tab'],
];

export function UploadScreen({
  state,
  onFile,
  theme,
  onToggleTheme,
}: {
  state: LoadState;
  onFile: (file: File) => void;
  theme: Theme;
  onToggleTheme: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const loading = state.status === 'loading';

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (file) onFile(file);
    },
    [onFile],
  );

  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <header className="flex items-center justify-between border-b border-line px-4 py-3 sm:px-6">
        <Wordmark />
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-[640px] animate-rise-in">
          <div className="mb-8 sm:mb-10">
            <p className="wl-meta mb-3 text-accent">Local analytics instrument</p>
            <h1 className="text-[clamp(1.75rem,6vw,2.5rem)] font-semibold leading-[1.05] tracking-tight text-ink">
              Your betting history,
              <br />
              analyzed.
            </h1>
            <p className="mt-4 max-w-[42ch] text-sm leading-relaxed text-muted">
              Upload a Stake betting archive to see where the money went — P&amp;L over time,
              drawdowns, game breakdowns and the full ledger behind them.
            </p>
          </div>

          {state.status === 'error' && (
            <div
              role="alert"
              className="mb-5 flex gap-3 border border-neg/50 bg-neg/5 px-4 py-3"
            >
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

          {/* The drop target is a label wrapping a real file input: the whole
              panel is clickable, and the control stays keyboard-operable and
              announced as a file input. */}
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
              className="sr-only"
              disabled={loading}
              onChange={(event) => {
                handleFiles(event.target.files);
                // Reset so re-selecting the same file fires a change event.
                event.target.value = '';
              }}
            />

            {/* Corner registration marks — the instrument detail. */}
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
              <ParsingIndicator fileName={state.fileName} />
            ) : (
              <div className="flex flex-col items-center gap-5 px-5 py-10 text-center sm:py-12">
                <span className="flex h-11 w-11 items-center justify-center border border-line-strong">
                  {dragging ? (
                    <FileJson size={18} strokeWidth={1.5} className="text-accent" aria-hidden />
                  ) : (
                    <Upload size={18} strokeWidth={1.5} className="text-ink" aria-hidden />
                  )}
                </span>
                <div>
                  <p className="text-sm text-ink">Drop your Stake JSON here</p>
                  <p className="wl-meta mt-1.5">or</p>
                </div>
                <span className="wl-button wl-button-primary">Choose JSON file</span>
              </div>
            )}
          </label>

          <p className="mt-4 flex items-start gap-2 text-[11px] leading-relaxed text-muted">
            <Lock size={12} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden />
            <span>
              Parsed locally. Your betting history never leaves this device — there is no server,
              no account and no upload.
            </span>
          </p>

          {/* Spec plate: the technical footnote, laid out like a device label. */}
          <dl className="mt-8 grid grid-cols-1 border-t border-line sm:grid-cols-2">
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
            advice — historical results do not predict future outcomes.
          </p>
        </div>
      </main>
    </div>
  );
}
