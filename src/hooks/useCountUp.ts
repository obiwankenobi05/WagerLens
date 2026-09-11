import { useEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from './useMediaQuery';

/**
 * Eases a number towards a target for KPI transitions.
 *
 * Returns the target immediately when the user prefers reduced motion, so the
 * figure is never withheld from someone who asked for stillness.
 */
export function useCountUp(target: number, durationMs = 520): number {
  const reduced = usePrefersReducedMotion();
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const frameRef = useRef(0);

  useEffect(() => {
    if (reduced || !Number.isFinite(target)) {
      setValue(target);
      fromRef.current = target;
      return;
    }

    const from = fromRef.current;
    if (from === target) return;

    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // easeOutcubic: fast settle, no overshoot — a readout, not a bounce.
      const eased = 1 - (1 - t) ** 3;
      const next = from + (target - from) * eased;
      setValue(next);
      if (t < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
      }
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [target, durationMs, reduced]);

  return value;
}
