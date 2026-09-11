/**
 * Stake betting-archive parser.
 *
 * Shape of the export (verified against the reference archive):
 *
 *   [
 *     {
 *       id, store_id, user_id,
 *       created_at: "2026-01-28T05:01:32.501Z",
 *       data: {
 *         id, iid, type: "sportsbook" | "crash" | "casino",
 *         gameName: "sportsbook" | "crash" | "plinko" | "mines" | ...,
 *         currency, amount, value, payout, payoutMultiplier,
 *         active, createdAt (epoch ms), updatedAt,
 *         ...game-specific fields
 *       }
 *     },
 *     ...
 *   ]
 *
 * Invariants observed in the reference archive and relied on here:
 *   - `payout === amount * payoutMultiplier` for every record.
 *   - `amount === value`; `amount` is the authoritative stake.
 *   - `createdAt` (epoch ms) agrees with the envelope's ISO `created_at`.
 *
 * Neither invariant is *assumed*: the parser derives the multiplier from
 * stake and payout when the recorded one is missing or inconsistent, and
 * falls back to the envelope timestamp when the inner one is unusable.
 *
 * The parser is deliberately tolerant. A single malformed record is recorded
 * in the data-quality report and skipped; it never aborts the import.
 */

import {
  ArchiveParseError,
  type BetCategory,
  type BetOutcome,
  type BetRecord,
  type CrashDetail,
  type DataQuality,
  type ExcludedRecord,
  type ExclusionReason,
  type MinesDetail,
  type ParseResult,
  type PlinkoDetail,
  type SportsbookDetail,
  type SportsbookLeg,
} from '@/types';

/** Games with a dedicated analytics view. Anything else still parses fine. */
const KNOWN_GAMES = new Set(['sportsbook', 'crash', 'plinko', 'mines']);

/** Reasonable bounds for a bet timestamp, guards against unit confusion. */
const MIN_TIMESTAMP = Date.UTC(2000, 0, 1);
const MAX_TIMESTAMP = Date.UTC(2100, 0, 1);

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Finite-number coercion. Strings are accepted because exports vary. */
function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function str(v: unknown): string | null {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return null;
}

/** Accepts epoch milliseconds, epoch seconds, or an ISO-8601 string. */
function toTimestamp(v: unknown): number | null {
  const n = num(v);
  if (n !== null) {
    // Values below the ms floor are epoch seconds from an older export.
    const ms = n < MIN_TIMESTAMP ? n * 1000 : n;
    return ms >= MIN_TIMESTAMP && ms <= MAX_TIMESTAMP ? ms : null;
  }
  if (typeof v === 'string') {
    const ms = Date.parse(v);
    if (Number.isFinite(ms) && ms >= MIN_TIMESTAMP && ms <= MAX_TIMESTAMP) return ms;
  }
  return null;
}

/**
 * Accounting rule: which records count as completed wagers.
 *
 * Excluded:
 *   - `rejected*` (e.g. `rejectedNotFound`): the bet never stood. The archive
 *     records `payout === amount` on these because the stake was returned, so
 *     counting them would add phantom break-even bets to every metric and
 *     inflate both Total Wagered and Total Returned by the same amount.
 *   - `cancel*` / `void*`: same reasoning, the wager was unwound.
 *   - `active: true`: still open at export time, so the outcome is unknown.
 *     Including it would book a guaranteed loss for a bet that may yet win.
 *
 * Everything else counts, including sportsbook cash-outs (a real settlement at
 * a negotiated multiplier) and every house-game round.
 */
function exclusionFor(status: string | null, active: boolean): ExclusionReason | null {
  if (status) {
    const s = status.toLowerCase();
    if (s.startsWith('reject')) return 'rejected';
    if (s.startsWith('cancel') || s.startsWith('void')) return 'cancelled';
  }
  if (active) return 'active';
  return null;
}

/** Win/loss/push from realised profit. Exact break-even is a push. */
function outcomeFor(profit: number): BetOutcome {
  if (profit > 0) return 'win';
  if (profit < 0) return 'loss';
  return 'push';
}

function categoryFor(type: string | null, game: string): BetCategory {
  const t = (type ?? '').toLowerCase();
  if (t === 'sportsbook' || game === 'sportsbook') return 'sportsbook';
  if (t === 'crash' || game === 'crash') return 'crash';
  if (t === 'casino') return 'casino';
  return 'unknown';
}

/** `plinko` -> `Plinko`, `sportsbook` -> `Sportsbook`, `dice roll` -> `Dice Roll`. */
function labelFor(game: string): string {
  if (!game) return 'Unknown';
  return game
    .split(/[\s_-]+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function parseSportsbook(d: Json): SportsbookDetail {
  const rawLegs = Array.isArray(d.outcomes) ? d.outcomes : [];
  const legs: SportsbookLeg[] = rawLegs.filter(isObject).map((o) => ({
    outcomeId: str(o.outcomeId),
    marketId: str(o.marketId),
    fixtureId: str(o.fixtureId),
    odds: num(o.odds),
    probability: num(o.probabilities),
    cancelled: o.cancel === true,
    provider: str(o.provider),
  }));

  // The archive's `potentialMultiplier` equals the product of the leg odds.
  // Recompute it when absent so multis are still comparable.
  let potential = num(d.potentialMultiplier);
  if (potential === null && legs.length > 0 && legs.every((l) => l.odds !== null)) {
    potential = legs.reduce((acc, l) => acc * (l.odds as number), 1);
  }

  // Combined probability is only meaningful when every leg reported one.
  const combinedProbability =
    legs.length > 0 && legs.every((l) => l.probability !== null)
      ? legs.reduce((acc, l) => acc * (l.probability as number), 1)
      : null;

  const legCount = num(d.system) ?? legs.length;

  return {
    legs,
    legCount: legs.length || legCount,
    potentialMultiplier: potential,
    cashoutMultiplier: num(d.cashoutMultiplier),
    combinedProbability,
    isMulti: legs.length > 1,
    customBet: d.customBet === true,
  };
}

function parseCrash(d: Json): CrashDetail {
  const result = str(d.result);
  return {
    cashoutAt: num(d.cashoutAt),
    result,
    // `busted` is authoritative from the result string; the zero multiplier
    // that accompanies it is a consequence, not the signal.
    busted: (result ?? '').toLowerCase() === 'busted',
    roundId: str(d.roundId),
  };
}

function parsePlinko(d: Json): PlinkoDetail | null {
  const s = isObject(d.statePlinko) ? d.statePlinko : null;
  if (!s) return null;
  const path = Array.isArray(s.path) ? s.path.filter((p): p is string => typeof p === 'string') : [];
  return {
    risk: str(s.risk),
    rows: num(s.rows),
    path,
    point: num(s.point),
  };
}

function parseMines(d: Json): MinesDetail | null {
  const s = isObject(d.stateMines) ? d.stateMines : null;
  if (!s) return null;
  const rounds = Array.isArray(s.rounds) ? s.rounds : [];
  const mines = Array.isArray(s._mines)
    ? s._mines.map(num).filter((n): n is number => n !== null)
    : [];
  return {
    minesCount: num(s.minesCount) ?? (mines.length || null),
    // Each entry in `rounds` is one revealed safe tile.
    selections: rounds.length,
    minePositions: mines,
  };
}

/** Normalises one envelope row. Returns either a bet or the reason it was dropped. */
function parseRecord(
  entry: unknown,
  index: number,
  source: { id: string; name: string },
): { bet: BetRecord } | { excluded: ExcludedRecord } {
  const drop = (
    reason: ExclusionReason,
    detail: string,
    id: string | null = null,
    game: string | null = null,
    status: string | null = null,
  ) => ({ excluded: { index, id, reason, detail, game, status } });

  if (!isObject(entry)) return drop('malformed', 'Record is not an object.');

  // Tolerate both the wrapped export and a pre-flattened array of bets.
  const d: Json = isObject(entry.data) ? entry.data : entry;

  const betId = str(d.id);
  const envelopeId = str(entry.id) ?? betId;
  if (!envelopeId) return drop('malformed', 'Record has no id.');

  const game = (str(d.gameName) ?? str(d.game) ?? '').toLowerCase().trim();
  const status = str(d.status);

  const timestamp = toTimestamp(d.createdAt) ?? toTimestamp(entry.created_at);
  if (timestamp === null) {
    return drop('unparseable-date', 'No readable timestamp on the record.', envelopeId, game || null, status);
  }

  // `amount` is the stake; `value` is the same number in every observed record
  // and is used only as a fallback.
  const stake = num(d.amount) ?? num(d.value);
  const payout = num(d.payout);
  if (stake === null || payout === null) {
    return drop('invalid-amounts', 'Stake or payout is missing or not a number.', envelopeId, game || null, status);
  }
  if (stake < 0 || payout < 0) {
    return drop('invalid-amounts', 'Stake or payout is negative.', envelopeId, game || null, status);
  }

  const active = d.active === true;
  const exclusion = exclusionFor(status, active);
  if (exclusion) {
    const detail =
      exclusion === 'active'
        ? 'Bet was still open when the archive was exported.'
        : exclusion === 'rejected'
          ? `Bet was rejected (${status}); the stake was returned.`
          : `Bet was cancelled or voided (${status}).`;
    return drop(exclusion, detail, envelopeId, game || null, status);
  }

  // Prefer the recorded multiplier, but recompute when it is absent or
  // contradicts stake/payout. A zero stake makes payout/stake undefined, so
  // the recorded value is kept when there is one and the field stays null when
  // there is not, either way it never becomes NaN or Infinity.
  const recordedMultiplier = num(d.payoutMultiplier);
  const derivedMultiplier = stake > 0 ? payout / stake : null;
  const payoutMultiplier =
    recordedMultiplier !== null &&
    (derivedMultiplier === null || Math.abs(recordedMultiplier - derivedMultiplier) <= 1e-6 * Math.max(1, derivedMultiplier))
      ? recordedMultiplier
      : derivedMultiplier;

  const profit = payout - stake;
  const category = categoryFor(str(d.type), game);

  const bet: BetRecord = {
    id: envelopeId,
    betId: betId ?? envelopeId,
    placedAt: new Date(timestamp),
    timestamp,
    updatedAt: (() => {
      const u = toTimestamp(d.updatedAt);
      return u === null ? null : new Date(u);
    })(),
    game: game || 'unknown',
    gameLabel: labelFor(game),
    category,
    currency: (str(d.currency) ?? 'unknown').toLowerCase(),
    stake,
    payout,
    profit,
    payoutMultiplier,
    outcome: outcomeFor(profit),
    status,
    active,
    placedOnMobile: d.mobile === true,
    sourceFileId: source.id,
    sourceFileName: source.name,
    raw: entry,
  };

  if (category === 'sportsbook') bet.sportsbook = parseSportsbook(d);
  if (game === 'crash') bet.crash = parseCrash(d);
  if (game === 'plinko') {
    const p = parsePlinko(d);
    if (p) bet.plinko = p;
  }
  if (game === 'mines') {
    const m = parseMines(d);
    if (m) bet.mines = m;
  }

  return { bet };
}

const EMPTY_REASONS: Record<ExclusionReason, number> = {
  rejected: 0,
  cancelled: 0,
  active: 0,
  malformed: 0,
  'unparseable-date': 0,
  'invalid-amounts': 0,
  duplicate: 0,
};

/**
 * Locates the bet array inside a parsed archive.
 *
 * Accepts the bare array Stake exports, plus a few defensive wrappings
 * (`{ data: [...] }`, `{ bets: [...] }`) seen in hand-edited files.
 */
function locateRecords(root: unknown): unknown[] {
  if (Array.isArray(root)) return root;
  if (isObject(root)) {
    for (const key of ['data', 'bets', 'records', 'results', 'items']) {
      const v = root[key];
      if (Array.isArray(v)) return v;
    }
  }
  throw new ArchiveParseError(
    "This doesn't look like a valid WagerLens-compatible Stake betting archive.",
    'The file should contain a JSON array of bet records, or an object with a "data" array.',
  );
}

/** True when a row looks like a Stake bet record rather than arbitrary JSON. */
function looksLikeBet(entry: unknown): boolean {
  if (!isObject(entry)) return false;
  const d: Json = isObject(entry.data) ? entry.data : entry;
  const hasMoney = 'amount' in d || 'value' in d || 'payout' in d;
  const hasIdentity = 'gameName' in d || 'game' in d || 'type' in d;
  const hasTime = 'createdAt' in d || 'created_at' in entry;
  return hasMoney && hasIdentity && hasTime;
}

/**
 * Parses a Stake betting archive into the WagerLens model.
 *
 * @throws {ArchiveParseError} when the file is not JSON, or is JSON that
 * carries nothing recognisable as a bet archive. Individual bad records never
 * throw, they land in `quality.excluded`.
 */
export function parseStakeArchive(
  rawJson: string,
  source: { id: string; name: string } = { id: 'archive', name: 'archive.json' },
): ParseResult {
  let root: unknown;
  try {
    root = JSON.parse(rawJson);
  } catch (err) {
    throw new ArchiveParseError(
      "This file isn't valid JSON.",
      err instanceof Error ? err.message : undefined,
    );
  }

  const records = locateRecords(root);

  if (records.length === 0) {
    throw new ArchiveParseError(
      'This archive is empty.',
      'The file parsed correctly but contains no records.',
    );
  }

  // Sample the head of the file rather than scanning all of it: enough to tell
  // a bet archive from an unrelated JSON array without a second full pass.
  const sample = records.slice(0, 25);
  if (!sample.some(looksLikeBet)) {
    throw new ArchiveParseError(
      "This doesn't look like a valid WagerLens-compatible Stake betting archive.",
      'No records with the expected bet fields (amount, payout, gameName, createdAt) were found.',
    );
  }

  const bets: BetRecord[] = [];
  const excluded: ExcludedRecord[] = [];
  const byReason: Record<ExclusionReason, number> = { ...EMPTY_REASONS };

  for (let i = 0; i < records.length; i += 1) {
    const result = parseRecord(records[i], i, source);
    if ('bet' in result) {
      bets.push(result.bet);
    } else {
      excluded.push(result.excluded);
      byReason[result.excluded.reason] += 1;
    }
  }

  // Archives arrive in chronological order, but nothing guarantees it and every
  // cumulative metric depends on it.
  bets.sort((a, b) => a.timestamp - b.timestamp);

  const currencies = [...new Set(bets.map((b) => b.currency))].sort();
  const games = [...new Set(bets.map((b) => b.game))].sort();
  const unrecognisedGames = games.filter((g) => !KNOWN_GAMES.has(g));

  const notes: string[] = [];
  if (currencies.length > 1) {
    notes.push(
      `Archive spans ${currencies.length} currencies (${currencies
        .map((c) => c.toUpperCase())
        .join(', ')}). Figures are reported per currency and never converted.`,
    );
  }
  if (unrecognisedGames.length > 0) {
    notes.push(
      `${unrecognisedGames.length} game type(s) without a dedicated view: ${unrecognisedGames
        .map(labelFor)
        .join(', ')}. They are still included in every headline metric.`,
    );
  }
  const zeroStake = bets.filter((b) => b.stake === 0).length;
  if (zeroStake > 0) {
    notes.push(
      `${zeroStake} record(s) have a zero stake. They are counted as bets but contribute nothing to wagered, returned or win rate.`,
    );
  }
  const missingMultiplier = bets.filter((b) => b.payoutMultiplier === null).length;
  if (missingMultiplier > 0) {
    notes.push(`${missingMultiplier} record(s) have no derivable payout multiplier.`);
  }

  const quality: DataQuality = {
    totalRecords: records.length,
    validRecords: bets.length,
    excludedRecords: excluded.length,
    byReason,
    excluded,
    currencies,
    games,
    unrecognisedGames,
    notes,
  };

  const range =
    bets.length > 0
      ? { from: bets[0].placedAt, to: bets[bets.length - 1].placedAt }
      : null;

  return { bets, quality, range };
}
