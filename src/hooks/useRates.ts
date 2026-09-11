/**
 * Exchange-rate state.
 *
 * Conversion is opt-in and starts off, so the default experience makes no
 * network request at all. Turning it on fetches rates for the currency codes
 * present in the archive and nothing more, see the note at the top of
 * `src/utils/currency.ts` for exactly what leaves the device.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clearCachedRates,
  fetchRates,
  loadCachedRates,
  missingRates,
  saveCachedRates,
  withManualRate,
  type RateTable,
} from '@/utils/currency';

export type RateStatus = 'idle' | 'loading' | 'ready' | 'error';

export function useRates(codes: string[]) {
  const [enabled, setEnabled] = useState(false);
  const [table, setTable] = useState<RateTable | null>(null);
  const [status, setStatus] = useState<RateStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Codes arrive as a new array each render; join them so the effect below
  // depends on the contents rather than the identity.
  const key = [...new Set(codes.map((c) => c.toLowerCase()))].sort().join(',');

  const load = useCallback(
    async (wanted: string[]) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setStatus('loading');
      setError(null);
      try {
        const fetched = await fetchRates(wanted, controller.signal);
        if (controller.signal.aborted) return;
        setTable((current) => {
          // Hand-entered rates outrank a fetched one for the same code.
          const merged =
            current && current.source !== 'api'
              ? { ...fetched, rates: { ...fetched.rates, ...current.rates }, source: 'mixed' as const }
              : fetched;
          saveCachedRates(merged);
          return merged;
        });
        setStatus('ready');
      } catch (err) {
        if (controller.signal.aborted) return;
        setStatus('error');
        setError(
          err instanceof Error
            ? err.message
            : 'The rate service could not be reached.',
        );
      }
    },
    [],
  );

  // Fetch on enable, preferring a cached table that already covers every code.
  useEffect(() => {
    if (!enabled) return;
    const wanted = key ? key.split(',') : [];
    if (wanted.length === 0) return;

    const cached = loadCachedRates();
    if (cached && missingRates(wanted, cached).length === 0) {
      setTable(cached);
      setStatus('ready');
      return;
    }
    void load(wanted);
  }, [enabled, key, load]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const refresh = useCallback(() => {
    clearCachedRates();
    void load(key ? key.split(',') : []);
  }, [key, load]);

  const setManualRate = useCallback((code: string, inrPerUnit: number) => {
    setTable((current) => {
      const next = withManualRate(current, code, inrPerUnit);
      saveCachedRates(next);
      return next;
    });
    setStatus('ready');
    setError(null);
  }, []);

  return {
    enabled,
    setEnabled,
    table,
    status,
    error,
    refresh,
    setManualRate,
    missing: missingRates(key ? key.split(',') : [], table),
  };
}
