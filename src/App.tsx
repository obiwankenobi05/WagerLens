import { Suspense, lazy } from 'react';
import { UploadScreen } from './components/UploadScreen';
import { useArchive } from './hooks/useArchive';
import { useTheme } from './hooks/useTheme';

// The dashboard pulls in the charting library, which the upload screen has no
// use for. Splitting it here keeps the first paint to the parts that matter
// before a file exists.
const Dashboard = lazy(() => import('./components/Dashboard'));

/** Shown for the moment between a successful parse and the dashboard chunk. */
function DashboardFallback() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-paper" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-3">
        <span className="relative h-8 w-8">
          <span className="absolute inset-0 border border-line" />
          <span className="absolute inset-0 animate-tick-spin border-l border-t border-accent" />
        </span>
        <p className="wl-label">Building dashboard</p>
      </div>
    </div>
  );
}

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const archive = useArchive();
  const { state } = archive;

  if (state.status === 'ready') {
    return (
      <Suspense fallback={<DashboardFallback />}>
        <Dashboard
          archive={archive}
          bundle={state.bundle}
          meta={state.meta}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
      </Suspense>
    );
  }

  return (
    <UploadScreen state={state} onFiles={archive.loadFiles} theme={theme} onToggleTheme={toggleTheme} />
  );
}
