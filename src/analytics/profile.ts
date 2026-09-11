/**
 * Betting-profile generator.
 *
 * Turns computed metrics into short descriptive sentences.
 *
 * LANGUAGE RULES — enforced by construction, not by review:
 *   - Every statement is an observation about the uploaded archive. Sentences
 *     are anchored with "In this archive", "Historically", "The data shows".
 *   - No advice, no recommendation, no forecast, no claim that a pattern will
 *     continue or that any category is "good" to bet on.
 *   - A statement is only emitted when the underlying sample supports it;
 *     `MIN_SAMPLE_FOR_COMPARISON` gates every cross-category comparison.
 *   - Superlatives are stated as historical facts about the data
 *     ("the strongest ROI in this archive"), never as properties of a game.
 */

import type { BetRecord } from '@/types';
import type { DrawdownStats, Overview, StreakStats } from './core';
import type { GroupStats, TimeStats } from './grouping';

/** A single profile statement. */
export interface ProfileInsight {
  id: string;
  /** Short uppercase label shown in the margin. */
  label: string;
  /** The sentence itself. Plain descriptive prose. */
  text: string;
  /** Emphasised fragment, rendered in the accent colour. */
  highlight?: string;
  tone: 'neutral' | 'positive' | 'negative';
}

/**
 * Below this many bets a per-group ROI or win rate is too noisy to compare
 * against another group, so comparative statements are suppressed.
 */
const MIN_SAMPLE_FOR_COMPARISON = 10;

interface ProfileInput {
  bets: BetRecord[];
  overview: Overview;
  byGame: GroupStats[];
  drawdown: DrawdownStats;
  streaks: StreakStats;
  time: TimeStats;
  currency: string;
  formatAmount: (value: number) => string;
}

const pct = (value: number | null, digits = 1): string => {
  if (value === null || !Number.isFinite(value)) return '—';
  // U+2212, matching every other figure in the interface rather than the
  // hyphen-minus toFixed produces.
  return `${value < 0 ? '−' : ''}${Math.abs(value).toFixed(digits)}%`;
};

/** "3 days", "5 hours", "12 minutes" — the largest sensible unit. */
export function humaniseDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const minutes = ms / 60_000;
  if (minutes < 1) return 'under a minute';
  if (minutes < 60) {
    const v = Math.round(minutes);
    return `${v} minute${v === 1 ? '' : 's'}`;
  }
  const hours = minutes / 60;
  if (hours < 24) {
    const v = Math.round(hours * 10) / 10;
    return `${v} hour${v === 1 ? '' : 's'}`;
  }
  const days = Math.round((hours / 24) * 10) / 10;
  return `${days} day${days === 1 ? '' : 's'}`;
}

/**
 * Generates the betting profile.
 *
 * Returns an empty list when there is nothing defensible to say.
 */
export function generateProfile(input: ProfileInput): ProfileInsight[] {
  const { overview, byGame, drawdown, streaks, time, currency, formatAmount } = input;
  const insights: ProfileInsight[] = [];
  if (overview.bets === 0) return insights;

  const code = currency.toUpperCase();
  const amount = (v: number) => `${formatAmount(Math.abs(v))} ${code}`;

  /* Volume ------------------------------------------------------------- */
  const gameCount = byGame.length;
  insights.push({
    id: 'volume',
    label: 'Volume',
    tone: 'neutral',
    text:
      `This archive contains ${overview.bets.toLocaleString()} completed ${
        overview.bets === 1 ? 'bet' : 'bets'
      } across ${gameCount} ${gameCount === 1 ? 'game' : 'games'}, ` +
      `staking ${amount(overview.wagered)} in total.`,
    highlight: `${overview.bets.toLocaleString()} bets`,
  });

  /* Concentration ------------------------------------------------------ */
  const leader = byGame[0];
  if (leader && leader.shareOfWagered > 0) {
    insights.push({
      id: 'concentration',
      label: 'Mix',
      tone: 'neutral',
      text:
        `${leader.label} accounts for ${pct(leader.shareOfWagered, 0)} of wagered volume ` +
        `(${leader.bets.toLocaleString()} ${leader.bets === 1 ? 'bet' : 'bets'}), the largest share in this dataset.`,
      highlight: `${pct(leader.shareOfWagered, 0)} of volume`,
    });
  }

  /* Result ------------------------------------------------------------- */
  const down = overview.netPnl < 0;
  insights.push({
    id: 'result',
    label: 'Result',
    tone: down ? 'negative' : overview.netPnl > 0 ? 'positive' : 'neutral',
    text:
      overview.netPnl === 0
        ? `Across this archive the stakes and returns are exactly level at ${amount(overview.wagered)}.`
        : `Across this archive, ${amount(overview.wagered)} staked returned ${amount(
            overview.returned,
          )} — a net ${down ? 'loss' : 'gain'} of ${amount(overview.netPnl)} at ${pct(overview.roi)} ROI.`,
    highlight: overview.netPnl === 0 ? undefined : `${down ? '−' : '+'}${amount(overview.netPnl)}`,
  });

  /* Strongest / weakest category, gated on sample size ------------------ */
  const comparable = byGame.filter((g) => g.bets >= MIN_SAMPLE_FOR_COMPARISON && g.roi !== null);
  if (comparable.length >= 2) {
    const sorted = [...comparable].sort((a, b) => (b.roi ?? 0) - (a.roi ?? 0));
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    insights.push({
      id: 'best-category',
      label: 'Range',
      tone: 'neutral',
      text:
        `Historically, ${best.label} carries the strongest ROI in this archive at ${pct(best.roi)}, ` +
        `and ${worst.label} the weakest at ${pct(worst.roi)}. ` +
        `Both are descriptions of past results in this file, not a ranking of the games.`,
      highlight: `${best.label} ${pct(best.roi)}`,
    });
  } else if (comparable.length === 1) {
    const only = comparable[0];
    insights.push({
      id: 'only-category',
      label: 'Range',
      tone: 'neutral',
      text:
        `${only.label} is the only game with enough bets here (${only.bets}) to quote an ROI, ` +
        `which stands at ${pct(only.roi)} in this dataset.`,
      highlight: pct(only.roi),
    });
  }

  /* Win rate ----------------------------------------------------------- */
  if (overview.winRate !== null) {
    const decided = overview.wins + overview.losses;
    insights.push({
      id: 'win-rate',
      label: 'Hit rate',
      tone: 'neutral',
      text:
        `${overview.wins.toLocaleString()} of ${decided.toLocaleString()} decided bets returned more than their stake ` +
        `(${pct(overview.winRate)})` +
        (overview.pushes > 0
          ? `; ${overview.pushes} broke even exactly and sit outside that rate.`
          : '.'),
      highlight: pct(overview.winRate),
    });
  }

  /* Drawdown ----------------------------------------------------------- */
  if (drawdown.maxDrawdown > 0) {
    const recovered =
      drawdown.recoveredAt !== null && drawdown.recoveryMs !== null
        ? ` It was recovered ${humaniseDuration(drawdown.recoveryMs)} later.`
        : drawdown.atPeak
          ? ''
          : ` The balance has not returned to that peak within this archive.`;
    insights.push({
      id: 'drawdown',
      label: 'Drawdown',
      tone: 'negative',
      text: `The deepest peak-to-trough fall recorded here is ${amount(drawdown.maxDrawdown)}.${recovered}`,
      highlight: amount(drawdown.maxDrawdown),
    });
  }

  /* Streaks ------------------------------------------------------------ */
  if (streaks.longestLossStreak > 1 || streaks.longestWinStreak > 1) {
    insights.push({
      id: 'streaks',
      label: 'Runs',
      tone: 'neutral',
      text:
        `The longest losing run in this archive is ${streaks.longestLossStreak} ` +
        `${streaks.longestLossStreak === 1 ? 'bet' : 'bets'}; the longest winning run is ` +
        `${streaks.longestWinStreak}. Runs are a description of sequence, not a signal about what follows.`,
      highlight: `${streaks.longestLossStreak} straight losses`,
    });
  }

  /* Cadence ------------------------------------------------------------ */
  if (time.medianGapMs !== null && time.activeDays > 0) {
    const hourText =
      time.mostActiveHour !== null
        ? ` The busiest hour is ${String(time.mostActiveHour.hour).padStart(2, '0')}:00 with ${
            time.mostActiveHour.bets
          } ${time.mostActiveHour.bets === 1 ? 'bet' : 'bets'}.`
        : '';
    insights.push({
      id: 'cadence',
      label: 'Cadence',
      tone: 'neutral',
      text:
        `Betting spans ${time.activeDays} active ${time.activeDays === 1 ? 'day' : 'days'}, ` +
        `with a typical gap of ${humaniseDuration(time.medianGapMs)} between bets.${hourText}`,
      highlight: humaniseDuration(time.medianGapMs),
    });
  }

  /* Stake sizing ------------------------------------------------------- */
  if (overview.averageStake !== null && overview.medianStake !== null && overview.largestStake > 0) {
    const skew = overview.medianStake > 0 ? overview.largestStake / overview.medianStake : null;
    insights.push({
      id: 'sizing',
      label: 'Sizing',
      tone: 'neutral',
      text:
        `The typical stake is ${amount(overview.medianStake)} (mean ${amount(overview.averageStake)}), ` +
        `and the largest single stake is ${amount(overview.largestStake)}` +
        (skew !== null && skew >= 2 ? ` — ${skew.toFixed(1)}× the median.` : '.'),
      highlight: amount(overview.medianStake),
    });
  }

  return insights;
}
