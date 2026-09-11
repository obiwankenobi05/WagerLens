/**
 * Synthetic record builders for tests.
 *
 * These produce raw *archive-shaped* JSON so the tests exercise the parser
 * rather than hand-constructing already-normalised records.
 */

export interface RawOptions {
  id?: string;
  type?: string;
  gameName?: string;
  amount?: number;
  payout?: number;
  payoutMultiplier?: number;
  currency?: string;
  createdAt?: number;
  status?: string | null;
  active?: boolean;
  extra?: Record<string, unknown>;
}

let seq = 0;

/** Builds one envelope-wrapped archive record. */
export function rawBet(options: RawOptions = {}): Record<string, unknown> {
  seq += 1;
  const amount = options.amount ?? 1;
  const multiplier = options.payoutMultiplier ?? (options.payout !== undefined ? options.payout / (amount || 1) : 0);
  const payout = options.payout ?? amount * multiplier;
  const createdAt = options.createdAt ?? Date.UTC(2026, 0, 1, 12, 0, 0) + seq * 60_000;
  const gameName = options.gameName ?? 'plinko';

  const data: Record<string, unknown> = {
    id: options.id ?? `bet-${seq}`,
    type: options.type ?? (gameName === 'sportsbook' ? 'sportsbook' : gameName === 'crash' ? 'crash' : 'casino'),
    gameName,
    currency: options.currency ?? 'usdc',
    amount,
    value: amount,
    payout,
    payoutMultiplier: multiplier,
    active: options.active ?? false,
    createdAt,
    updatedAt: createdAt,
    mobile: false,
    ...(options.extra ?? {}),
  };
  if (options.status !== undefined && options.status !== null) data.status = options.status;

  return {
    id: `envelope-${seq}`,
    store_id: 'store',
    user_id: 'user',
    data,
    created_at: new Date(createdAt).toISOString(),
  };
}

/** Serialises records the way an export file would. */
export const archiveJson = (records: unknown[]): string => JSON.stringify(records);

/** Resets the id sequence so ids are stable within a test file. */
export const resetSequence = (): void => {
  seq = 0;
};
