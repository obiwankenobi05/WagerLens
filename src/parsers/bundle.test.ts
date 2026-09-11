import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArchiveBundle, type FileInput } from './bundle';
import { archiveJson, rawBet } from '@/test/factory';
import { calculateOverview } from '@/analytics';

const SAMPLE = readFileSync(
  fileURLToPath(new URL('../test/fixtures/bet-archive.sample.json', import.meta.url)),
  'utf8',
);

const file = (name: string, text: string, id = name): FileInput => ({
  id,
  name,
  size: text.length,
  text,
});

describe('parseArchiveBundle: merging daily exports', () => {
  it('merges several files into one chronological history', () => {
    const day1 = archiveJson([
      rawBet({ id: 'a', amount: 10, payout: 25, createdAt: Date.UTC(2026, 1, 27, 10) }),
      rawBet({ id: 'b', amount: 10, payout: 0, createdAt: Date.UTC(2026, 1, 27, 12) }),
    ]);
    const day2 = archiveJson([
      rawBet({ id: 'c', amount: 5, payout: 15, createdAt: Date.UTC(2026, 1, 28, 9) }),
    ]);

    const bundle = parseArchiveBundle([file('27feb.json', day1), file('28feb.json', day2)]);

    expect(bundle.files).toHaveLength(2);
    expect(bundle.bets).toHaveLength(3);
    expect(bundle.failed).toHaveLength(0);
    // Sorted across files, not merely concatenated.
    for (let i = 1; i < bundle.bets.length; i += 1) {
      expect(bundle.bets[i].timestamp).toBeGreaterThanOrEqual(bundle.bets[i - 1].timestamp);
    }
  });

  it('stamps each bet with the file it came from', () => {
    const bundle = parseArchiveBundle([
      file('27feb.json', archiveJson([rawBet({ id: 'a', amount: 1, payout: 2 })])),
      file('28feb.json', archiveJson([rawBet({ id: 'b', amount: 1, payout: 0 })])),
    ]);
    expect(bundle.bets.map((b) => b.sourceFileName).sort()).toEqual(['27feb.json', '28feb.json']);
    expect(new Set(bundle.bets.map((b) => b.sourceFileId)).size).toBe(2);
  });

  it('reports figures per file that reconcile to the merged total', () => {
    const bundle = parseArchiveBundle([
      file('a.json', archiveJson([rawBet({ id: 'a', amount: 10, payout: 25 })])),
      file('b.json', archiveJson([rawBet({ id: 'b', amount: 40, payout: 0 })])),
    ]);
    const perFile = bundle.files.map((f) => f.bets.reduce((s, b) => s + b.stake, 0));
    expect(perFile).toEqual([10, 40]);
    expect(calculateOverview(bundle.bets, 'usdc').wagered).toBe(50);
  });
});

describe('parseArchiveBundle: de-duplication', () => {
  it('counts a bet present in two overlapping exports only once', () => {
    const shared = rawBet({ id: 'overlap', amount: 10, payout: 30, createdAt: Date.UTC(2026, 1, 27, 23, 50) });
    const day1 = archiveJson([rawBet({ id: 'only-1', amount: 5, payout: 0 }), shared]);
    const day2 = archiveJson([shared, rawBet({ id: 'only-2', amount: 7, payout: 0 })]);

    const bundle = parseArchiveBundle([file('27feb.json', day1), file('28feb.json', day2)]);

    expect(bundle.bets).toHaveLength(3);
    expect(bundle.duplicatesRemoved).toBe(1);
    expect(bundle.quality.byReason.duplicate).toBe(1);
    // Counted once means wagered is 5 + 10 + 7, not 5 + 10 + 10 + 7.
    expect(calculateOverview(bundle.bets, 'usdc').wagered).toBe(22);
  });

  it('attributes a duplicated bet to the first file that contained it', () => {
    const shared = rawBet({ id: 'overlap', amount: 10, payout: 30 });
    const bundle = parseArchiveBundle([
      file('first.json', archiveJson([shared])),
      file('second.json', archiveJson([shared])),
    ]);
    expect(bundle.bets).toHaveLength(1);
    expect(bundle.bets[0].sourceFileName).toBe('first.json');
    expect(bundle.files[1].bets).toHaveLength(0);
  });

  it('survives the same file being uploaded twice', () => {
    const bundle = parseArchiveBundle([file('same.json', SAMPLE, 'x1'), file('same.json', SAMPLE, 'x2')]);
    // Identical to a single upload of that file.
    expect(bundle.bets).toHaveLength(221);
    expect(bundle.duplicatesRemoved).toBe(221);
    expect(calculateOverview(bundle.bets, 'usdc').wagered).toBeCloseTo(12.71113603, 8);
  });

  it('explains de-duplication in the data-quality notes', () => {
    const shared = rawBet({ id: 'overlap', amount: 1, payout: 2 });
    const bundle = parseArchiveBundle([
      file('a.json', archiveJson([shared])),
      file('b.json', archiveJson([shared])),
    ]);
    expect(bundle.quality.notes.some((n) => n.includes('more than one file'))).toBe(true);
  });
});

describe('parseArchiveBundle: partial failure', () => {
  it('keeps good files when one is unreadable', () => {
    const bundle = parseArchiveBundle([
      file('good.json', archiveJson([rawBet({ amount: 1, payout: 2 })])),
      file('broken.json', '{not json'),
      file('alsogood.json', archiveJson([rawBet({ amount: 1, payout: 0 })])),
    ]);

    expect(bundle.bets).toHaveLength(2);
    expect(bundle.failed).toHaveLength(1);
    expect(bundle.failed[0].name).toBe('broken.json');
    expect(bundle.failed[0].error?.message).toMatch(/isn't valid JSON/);
    expect(bundle.quality.notes.some((n) => n.includes('could not be read'))).toBe(true);
  });

  it('reports an unrelated JSON file as failed rather than as empty data', () => {
    const bundle = parseArchiveBundle([
      file('good.json', archiveJson([rawBet({ amount: 1, payout: 2 })])),
      file('shopping-list.json', '{"milk":2}'),
    ]);
    expect(bundle.failed).toHaveLength(1);
    expect(bundle.failed[0].error?.message).toMatch(/Stake betting archive/);
    expect(bundle.bets).toHaveLength(1);
  });

  it('returns an empty bundle when every file fails', () => {
    const bundle = parseArchiveBundle([file('a.json', 'nope'), file('b.json', 'also nope')]);
    expect(bundle.bets).toHaveLength(0);
    expect(bundle.failed).toHaveLength(2);
    expect(bundle.range).toBeNull();
  });
});

describe('parseArchiveBundle: mixed currencies across files', () => {
  const bundle = parseArchiveBundle([
    file('inr-day.json', archiveJson([
      rawBet({ id: 'i1', amount: 100, payout: 250, currency: 'inr' }),
      rawBet({ id: 'i2', amount: 100, payout: 0, currency: 'inr' }),
    ])),
    file('usdc-day.json', archiveJson([
      rawBet({ id: 'u1', amount: 2, payout: 6, currency: 'usdc' }),
    ])),
    file('usdt-day.json', archiveJson([
      rawBet({ id: 't1', amount: 3, payout: 0, currency: 'usdt' }),
    ])),
  ]);

  it('collects every currency across the files', () => {
    expect(bundle.quality.currencies).toEqual(['inr', 'usdc', 'usdt']);
    expect(bundle.bets).toHaveLength(4);
  });

  it('flags the mix in the notes rather than combining silently', () => {
    expect(bundle.quality.notes.some((n) => n.includes('3 currencies'))).toBe(true);
  });

  it('keeps each currency a separate ledger when read per currency', () => {
    const inr = calculateOverview(bundle.bets.filter((b) => b.currency === 'inr'), 'inr');
    const usdc = calculateOverview(bundle.bets.filter((b) => b.currency === 'usdc'), 'usdc');
    const usdt = calculateOverview(bundle.bets.filter((b) => b.currency === 'usdt'), 'usdt');

    expect(inr.wagered).toBe(200);
    expect(inr.netPnl).toBe(50);
    expect(usdc.wagered).toBe(2);
    expect(usdc.netPnl).toBe(4);
    expect(usdt.wagered).toBe(3);
    expect(usdt.netPnl).toBe(-3);
    // Three ledgers, never one sum of incompatible units.
    expect(inr.wagered + usdc.wagered + usdt.wagered).not.toBe(inr.wagered);
  });

  it('handles one file carrying two currencies', () => {
    const mixed = parseArchiveBundle([
      file('mixed.json', archiveJson([
        rawBet({ id: 'm1', amount: 1, payout: 2, currency: 'usdc' }),
        rawBet({ id: 'm2', amount: 500, payout: 0, currency: 'inr' }),
      ])),
    ]);
    expect(mixed.files[0].currencies).toEqual(['inr', 'usdc']);
    expect(mixed.quality.currencies).toEqual(['inr', 'usdc']);
  });
});

describe('default currency selection', () => {
  it('is decided by bet count, not alphabetical order', () => {
    // 'inr' sorts before 'usdc', but the history is overwhelmingly USDC.
    const bundle = parseArchiveBundle([
      file('a.json', archiveJson([
        ...Array.from({ length: 20 }, (_, i) =>
          rawBet({ id: `u${i}`, amount: 1, payout: 0, currency: 'usdc' })),
        rawBet({ id: 'i1', amount: 100, payout: 0, currency: 'inr' }),
      ])),
    ]);

    const counts = new Map<string, number>();
    for (const bet of bundle.bets) counts.set(bet.currency, (counts.get(bet.currency) ?? 0) + 1);
    const busiest = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];

    expect(bundle.quality.currencies[0]).toBe('inr');
    expect(busiest).toBe('usdc');
  });
});
