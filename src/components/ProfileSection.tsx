import { Panel } from './ui/Panel';
import type { ProfileInsight } from '@/analytics';
import { cx } from '@/utils/format';

/**
 * The generated betting profile.
 *
 * Every sentence is produced from the archive by `generateProfile`, which only
 * emits a statement when the sample supports it. Nothing here is advice or a
 * forecast.
 */
export function ProfileSection({ insights }: { insights: ProfileInsight[] }) {
  if (insights.length === 0) return null;

  return (
    <Panel index="12" label="Your betting profile">
      <ul className="wl-stagger flex flex-col">
        {insights.map((insight) => (
          <li
            key={insight.id}
            className="grid grid-cols-1 gap-x-4 gap-y-1 border-b border-line py-3 last:border-b-0 sm:grid-cols-[88px_1fr]"
          >
            <span
              className={cx(
                'wl-label pt-0.5',
                insight.tone === 'positive' && 'text-pos',
                insight.tone === 'negative' && 'text-neg',
              )}
            >
              {insight.label}
            </span>
            <p className="max-w-[78ch] text-[13px] leading-relaxed text-ink">{insight.text}</p>
          </li>
        ))}
      </ul>

      <p className="mt-4 border-t border-line pt-3 text-[11px] leading-relaxed text-faint">
        These statements describe the uploaded archive only. Historical results do not predict
        future outcomes, and nothing here is betting advice.
      </p>
    </Panel>
  );
}
