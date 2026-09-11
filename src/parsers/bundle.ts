/**
 * Multi-file archive merging.
 *
 * Stake exports one JSON file per date, so a real history arrives as a handful
 * of files rather than one. This module parses each independently and merges
 * them into a single bundle.
 *
 * De-duplication matters: exports for adjacent dates can overlap (a bet placed
 * near midnight, or a re-download of the same day), and counting one bet twice
 * would inflate every figure on the dashboard. Bets are keyed by their inner
 * bet id, which is stable across exports; the first file to contribute a bet
 * keeps it, and later copies are recorded as duplicates rather than silently
 * dropped.
 */

import { ArchiveParseError, type ArchiveBundle, type ArchiveFile, type BetRecord, type DataQuality, type ExclusionReason } from '@/types';
import { parseStakeArchive } from './stakeArchive';

const EMPTY_REASONS: Record<ExclusionReason, number> = {
  rejected: 0,
  cancelled: 0,
  active: 0,
  malformed: 0,
  'unparseable-date': 0,
  'invalid-amounts': 0,
  duplicate: 0,
};

/** One file's text plus the identity it should carry into the model. */
export interface FileInput {
  id: string;
  name: string;
  size: number;
  text: string;
}

/**
 * Stable identity for a bet across exports.
 *
 * `betId` is the inner archive id and is the same in every export containing
 * that bet. The envelope id can differ between downloads, so it is only a
 * fallback for archives that omit the inner one.
 */
const identityOf = (bet: BetRecord): string => bet.betId || bet.id;

/**
 * Parses and merges many archive files.
 *
 * Files are processed in the order given. A file that fails to parse does not
 * stop the others — it lands in `failed` with its error, so one bad download
 * never blocks the rest of a history.
 */
export function parseArchiveBundle(inputs: FileInput[]): ArchiveBundle {
  const files: ArchiveFile[] = [];
  const failed: ArchiveFile[] = [];
  const merged: BetRecord[] = [];
  const seen = new Set<string>();
  let duplicatesRemoved = 0;

  const totals: Record<ExclusionReason, number> = { ...EMPTY_REASONS };
  let totalRecords = 0;
  let totalExcluded = 0;
  const allNotes: string[] = [];

  for (const input of inputs) {
    const started = performance.now();
    let parsed;
    try {
      parsed = parseStakeArchive(input.text, { id: input.id, name: input.name });
    } catch (err) {
      const failure: ArchiveFile = {
        id: input.id,
        name: input.name,
        size: input.size,
        parseMs: performance.now() - started,
        bets: [],
        quality: {
          totalRecords: 0,
          validRecords: 0,
          excludedRecords: 0,
          byReason: { ...EMPTY_REASONS },
          excluded: [],
          currencies: [],
          games: [],
          unrecognisedGames: [],
          notes: [],
        },
        range: null,
        currencies: [],
        error:
          err instanceof ArchiveParseError
            ? { message: err.message, detail: err.detail }
            : { message: 'This file could not be read.', detail: err instanceof Error ? err.message : undefined },
      };
      failed.push(failure);
      files.push(failure);
      continue;
    }
    const parseMs = performance.now() - started;

    // Keep only bets not already contributed by an earlier file.
    const unique: BetRecord[] = [];
    let fileDuplicates = 0;
    for (const bet of parsed.bets) {
      const key = identityOf(bet);
      if (seen.has(key)) {
        fileDuplicates += 1;
        continue;
      }
      seen.add(key);
      unique.push(bet);
    }
    duplicatesRemoved += fileDuplicates;

    const quality: DataQuality = {
      ...parsed.quality,
      validRecords: unique.length,
      excludedRecords: parsed.quality.excludedRecords + fileDuplicates,
      byReason: { ...parsed.quality.byReason, duplicate: fileDuplicates },
      notes: [...parsed.quality.notes],
    };
    if (fileDuplicates > 0) {
      quality.notes.push(
        `${fileDuplicates} bet(s) in this file were already present in an earlier file and were counted once.`,
      );
    }

    const file: ArchiveFile = {
      id: input.id,
      name: input.name,
      size: input.size,
      parseMs,
      bets: unique,
      quality,
      range:
        unique.length > 0
          ? { from: unique[0].placedAt, to: unique[unique.length - 1].placedAt }
          : parsed.range,
      currencies: [...new Set(unique.map((b) => b.currency))].sort(),
    };
    files.push(file);

    merged.push(...unique);
    totalRecords += parsed.quality.totalRecords;
    totalExcluded += parsed.quality.excludedRecords + fileDuplicates;
    for (const reason of Object.keys(totals) as ExclusionReason[]) {
      totals[reason] += parsed.quality.byReason[reason] ?? 0;
    }
    totals.duplicate += fileDuplicates;
    allNotes.push(...parsed.quality.notes);
  }

  // Order across files is not guaranteed by upload order, and every cumulative
  // metric depends on it.
  merged.sort((a, b) => a.timestamp - b.timestamp);

  const currencies = [...new Set(merged.map((b) => b.currency))].sort();
  const games = [...new Set(merged.map((b) => b.game))].sort();
  const succeeded = files.filter((f) => !f.error);

  const notes = [...new Set(allNotes)];
  if (currencies.length > 1) {
    notes.unshift(
      `These files span ${currencies.length} currencies (${currencies
        .map((c) => c.toUpperCase())
        .join(', ')}). Each is reported separately unless you convert to a single currency.`,
    );
  }
  if (duplicatesRemoved > 0) {
    notes.unshift(
      `${duplicatesRemoved} bet(s) appeared in more than one file — from overlapping date ranges or a repeated download — and were counted once.`,
    );
  }
  if (failed.length > 0) {
    notes.unshift(
      `${failed.length} file(s) could not be read and contributed nothing: ${failed
        .map((f) => f.name)
        .join(', ')}.`,
    );
  }

  const quality: DataQuality = {
    totalRecords,
    validRecords: merged.length,
    excludedRecords: totalExcluded,
    byReason: totals,
    excluded: succeeded.flatMap((f) => f.quality.excluded),
    currencies,
    games,
    unrecognisedGames: [...new Set(succeeded.flatMap((f) => f.quality.unrecognisedGames))].sort(),
    notes,
  };

  return {
    files,
    bets: merged,
    quality,
    range:
      merged.length > 0
        ? { from: merged[0].placedAt, to: merged[merged.length - 1].placedAt }
        : null,
    failed,
    duplicatesRemoved,
  };
}
