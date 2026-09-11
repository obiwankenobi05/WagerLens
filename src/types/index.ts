/**
 * WagerLens internal data model.
 *
 * The UI and the analytics layer talk exclusively in these types. Raw Stake
 * archive shapes never escape `src/parsers/` — that boundary is what lets the
 * rest of the app assume every number is finite and every date is valid.
 */

/** Broad family a record belongs to, derived from `data.type`. */
export type BetCategory = 'sportsbook' | 'crash' | 'casino' | 'unknown';

/**
 * Settlement outcome of a bet, derived from realised profit.
 *
 * `push` covers exact break-even rounds (a 1.00x Plinko drop, a zero-stake
 * round). They are neither wins nor losses and are excluded from win-rate
 * denominators so a run of 1.00x multipliers cannot depress the number.
 */
export type BetOutcome = 'win' | 'loss' | 'push';

/** Sportsbook leg. One per selection; a multi has several. */
export interface SportsbookLeg {
  outcomeId: string | null;
  marketId: string | null;
  fixtureId: string | null;
  /** Decimal odds recorded for this leg at placement time. */
  odds: number | null;
  /**
   * Probability recorded alongside the leg in the archive. This is the
   * archive's own `probabilities` field — WagerLens reports it as recorded and
   * makes no claim about how it was produced.
   */
  probability: number | null;
  cancelled: boolean;
  provider: string | null;
}

/** Sportsbook-specific detail, present when `category === 'sportsbook'`. */
export interface SportsbookDetail {
  legs: SportsbookLeg[];
  /** Number of legs (the archive's `system` field agrees with `legs.length`). */
  legCount: number;
  /** Product of the leg odds — what the bet would have returned per unit staked. */
  potentialMultiplier: number | null;
  /** Cash-out multiplier offered/taken, when the archive recorded one. */
  cashoutMultiplier: number | null;
  /** Combined recorded probability across legs (product), when every leg has one. */
  combinedProbability: number | null;
  isMulti: boolean;
  customBet: boolean;
}

/** Crash-specific detail, present when `game === 'crash'`. */
export interface CrashDetail {
  /** Target multiplier the round was set to auto-cash-out at. */
  cashoutAt: number | null;
  /** Raw `result` string: `autocashout`, `busted`, `stopped`, … */
  result: string | null;
  /** True when the round ended before reaching any cash-out. */
  busted: boolean;
  roundId: string | null;
}

/** Plinko-specific detail, present when `game === 'plinko'`. */
export interface PlinkoDetail {
  risk: string | null;
  rows: number | null;
  /** Ball path as recorded (`L`/`R` per row). Kept for the detail drawer. */
  path: string[];
  /** Landing position recorded by the archive. */
  point: number | null;
}

/** Mines-specific detail, present when `game === 'mines'`. */
export interface MinesDetail {
  minesCount: number | null;
  /** Number of safe tiles revealed before cashing out or hitting a mine. */
  selections: number;
  /** Mine positions as recorded. */
  minePositions: number[];
}

/**
 * A single normalised bet.
 *
 * Every numeric field is guaranteed finite; `stake` and `payout` are
 * guaranteed non-negative. `profit` is always `payout - stake`.
 */
export interface BetRecord {
  /** Archive record id (the envelope id, unique per row). */
  id: string;
  /** Inner bet id — stable across the archive, used for raw lookups. */
  betId: string;
  placedAt: Date;
  /** Epoch milliseconds; carried alongside `placedAt` for cheap sorting. */
  timestamp: number;
  updatedAt: Date | null;
  /** Lower-case game name as recorded: `sportsbook`, `crash`, `plinko`, … */
  game: string;
  /** Display-cased game name. */
  gameLabel: string;
  category: BetCategory;
  /** Lower-case currency code exactly as recorded. Never converted. */
  currency: string;
  stake: number;
  payout: number;
  /** `payout - stake`. Negative for a losing bet. */
  profit: number;
  /** `payout / stake`, i.e. the archive's `payoutMultiplier`. */
  payoutMultiplier: number | null;
  outcome: BetOutcome;
  /** Raw status string where the archive has one (sportsbook only). */
  status: string | null;
  /** Whether the bet was still open/unsettled at export time. */
  active: boolean;
  placedOnMobile: boolean;
  sportsbook?: SportsbookDetail;
  crash?: CrashDetail;
  plinko?: PlinkoDetail;
  mines?: MinesDetail;
  /** Id of the uploaded file this bet came from. */
  sourceFileId: string;
  /** Name of that file, for display. */
  sourceFileName: string;
  /** Untouched archive record, for the raw-record view. */
  raw: unknown;
}

/** Why a record was dropped from the wagering metrics. */
export type ExclusionReason =
  | 'rejected'
  | 'cancelled'
  | 'active'
  | 'malformed'
  | 'unparseable-date'
  | 'invalid-amounts'
  | 'duplicate';

/** One dropped record, retained so the data-quality panel can explain itself. */
export interface ExcludedRecord {
  /** Index in the source array — the only reliable handle for a malformed row. */
  index: number;
  id: string | null;
  reason: ExclusionReason;
  detail: string;
  game: string | null;
  status: string | null;
}

/** Counts and notes describing how faithfully the archive was read. */
export interface DataQuality {
  totalRecords: number;
  validRecords: number;
  excludedRecords: number;
  byReason: Record<ExclusionReason, number>;
  excluded: ExcludedRecord[];
  currencies: string[];
  games: string[];
  /** Games whose extra fields WagerLens has no dedicated view for. */
  unrecognisedGames: string[];
  /** Non-fatal observations, e.g. records missing an expected field. */
  notes: string[];
}

/** Result of parsing an uploaded archive. */
export interface ParseResult {
  bets: BetRecord[];
  quality: DataQuality;
  /** Earliest and latest bet timestamps, or null when there are no bets. */
  range: { from: Date; to: Date } | null;
}

/** One uploaded file and what came out of it. */
export interface ArchiveFile {
  id: string;
  name: string;
  size: number;
  /** Milliseconds spent parsing this file. */
  parseMs: number;
  /** Bets contributed after cross-file de-duplication. */
  bets: BetRecord[];
  quality: DataQuality;
  range: { from: Date; to: Date } | null;
  /** Currencies present in this file. */
  currencies: string[];
  /** Set when the file could not be read at all. */
  error?: { message: string; detail?: string };
}

/** The merged archive across every successfully parsed file. */
export interface ArchiveBundle {
  files: ArchiveFile[];
  /** Every bet from every file, de-duplicated and sorted oldest first. */
  bets: BetRecord[];
  quality: DataQuality;
  range: { from: Date; to: Date } | null;
  /** Files that failed outright. */
  failed: ArchiveFile[];
  /** Bets dropped because an earlier file already contained them. */
  duplicatesRemoved: number;
}

/** A parse failure the user needs to see, with a remedy where one exists. */
export class ArchiveParseError extends Error {
  readonly detail: string | undefined;
  constructor(message: string, detail?: string) {
    super(message);
    this.name = 'ArchiveParseError';
    this.detail = detail;
  }
}
