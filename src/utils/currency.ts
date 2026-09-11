/**
 * Currency conversion.
 *
 * PRIVACY NOTE — read before changing anything here.
 *
 * Fetching a live rate is the only outbound request WagerLens ever makes, and
 * it is off until the user turns it on. What leaves the device is a list of
 * currency codes ("what is usdc worth in inr") and nothing else: no stake, no
 * payout, no bet, no identifier, no archive content. The request is a plain
 * GET with no body and no credentials.
 *
 * Conversion is applied as a transformation over normalised bets, so every
 * analytics function keeps working unchanged and the original amounts are
 * never mutated — switching conversion off restores the recorded figures
 * exactly.
 */

import type { BetRecord } from '@/types';

/** Rates expressed as "one unit of this currency is worth N INR". */
export interface RateTable {
  /** Lower-case currency code → value in INR. */
  rates: Record<string, number>;
  fetchedAt: number;
  /** Where the numbers came from, so the UI can say so. */
  source: 'api' | 'manual' | 'mixed';
  /** Human-readable provider label. */
  provider: string;
}

export const INR = 'inr';

/**
 * Stake currency codes mapped to CoinGecko asset ids.
 *
 * Only codes present in an archive are ever requested.
 */
const COINGECKO_IDS: Record<string, string> = {
  btc: 'bitcoin',
  eth: 'ethereum',
  ltc: 'litecoin',
  doge: 'dogecoin',
  bch: 'bitcoin-cash',
  xrp: 'ripple',
  trx: 'tron',
  eos: 'eos',
  bnb: 'binancecoin',
  usdt: 'tether',
  usdc: 'usd-coin',
  dai: 'dai',
  link: 'chainlink',
  sol: 'solana',
  matic: 'matic-network',
  pol: 'polygon-ecosystem-token',
  ada: 'cardano',
  shib: 'shiba-inu',
  xmr: 'monero',
  ape: 'apecoin',
  busd: 'binance-usd',
  crv: 'curve-dao-token',
  uni: 'uniswap',
  avax: 'avalanche-2',
  trump: 'official-trump',
  pepe: 'pepe',
  wif: 'dogwifcoin',
  bonk: 'bonk',
};

/** Fiat codes handled by the fiat endpoint rather than the crypto one. */
const FIAT_CODES = new Set([
  'inr', 'usd', 'eur', 'gbp', 'jpy', 'cad', 'aud', 'nzd', 'brl', 'mxn',
  'ars', 'clp', 'pen', 'zar', 'try', 'rub', 'idr', 'vnd', 'php', 'krw',
  'cny', 'pln', 'sek', 'nok', 'dkk', 'chf', 'czk', 'huf', 'ron', 'ngn',
]);

export const isFiat = (code: string): boolean => FIAT_CODES.has(code.toLowerCase());

/** True when WagerLens knows how to look this currency up. */
export function isConvertible(code: string): boolean {
  const c = code.toLowerCase();
  return c === INR || isFiat(c) || c in COINGECKO_IDS;
}

const CRYPTO_ENDPOINT = 'https://api.coingecko.com/api/v3/simple/price';
const FIAT_ENDPOINT = 'https://open.er-api.com/v6/latest/INR';

async function fetchJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(url, {
    method: 'GET',
    // No cookies, no auth — this request carries nothing about the user.
    credentials: 'omit',
    cache: 'no-store',
    signal,
  });
  if (!response.ok) {
    throw new Error(`Rate service responded ${response.status}.`);
  }
  return response.json();
}

/**
 * Looks up INR rates for the given currency codes.
 *
 * Crypto and fiat come from different providers, so only the endpoints actually
 * needed are called. A failure in one does not discard the other's results —
 * partial rates are better than none, and the UI reports which codes are
 * missing.
 *
 * @throws when no rate at all could be obtained.
 */
export async function fetchRates(codes: string[], signal?: AbortSignal): Promise<RateTable> {
  const wanted = [...new Set(codes.map((c) => c.toLowerCase()))];
  const rates: Record<string, number> = { [INR]: 1 };

  const cryptoCodes = wanted.filter((c) => c !== INR && c in COINGECKO_IDS);
  const fiatCodes = wanted.filter((c) => c !== INR && isFiat(c));

  const providers: string[] = [];
  const errors: string[] = [];

  if (cryptoCodes.length > 0) {
    try {
      const ids = cryptoCodes.map((c) => COINGECKO_IDS[c]).join(',');
      const data = (await fetchJson(
        `${CRYPTO_ENDPOINT}?ids=${encodeURIComponent(ids)}&vs_currencies=inr`,
        signal,
      )) as Record<string, { inr?: number }>;
      for (const code of cryptoCodes) {
        const value = data?.[COINGECKO_IDS[code]]?.inr;
        if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
          rates[code] = value;
        }
      }
      providers.push('CoinGecko');
    } catch (err) {
      errors.push(err instanceof Error ? err.message : 'crypto rates unavailable');
    }
  }

  if (fiatCodes.length > 0) {
    try {
      // The endpoint is based on INR, so its rates are INR → X. Invert them.
      const data = (await fetchJson(FIAT_ENDPOINT, signal)) as { rates?: Record<string, number> };
      for (const code of fiatCodes) {
        const perInr = data?.rates?.[code.toUpperCase()];
        if (typeof perInr === 'number' && Number.isFinite(perInr) && perInr > 0) {
          rates[code] = 1 / perInr;
        }
      }
      providers.push('open.er-api.com');
    } catch (err) {
      errors.push(err instanceof Error ? err.message : 'fiat rates unavailable');
    }
  }

  const resolved = wanted.filter((c) => c in rates);
  if (resolved.length === 0) {
    throw new Error(
      errors.length > 0 ? errors.join('; ') : 'No rates could be retrieved for these currencies.',
    );
  }

  return {
    rates,
    fetchedAt: Date.now(),
    source: 'api',
    provider: providers.join(' + ') || 'manual',
  };
}

/** Currency codes in `codes` that the table cannot convert. */
export function missingRates(codes: string[], table: RateTable | null): string[] {
  if (!table) return codes.filter((c) => c.toLowerCase() !== INR);
  return codes.filter((c) => {
    const code = c.toLowerCase();
    return code !== INR && !(code in table.rates);
  });
}

/**
 * Rewrites bets into INR.
 *
 * Returns a new array; the input is never mutated, and `raw` still points at
 * the original archive record. Bets in a currency with no rate are dropped and
 * reported separately, because silently leaving them at face value would mix
 * denominations inside one total — the exact error this app refuses to make.
 */
export function convertBets(
  bets: BetRecord[],
  table: RateTable,
): { converted: BetRecord[]; unconvertible: BetRecord[] } {
  const converted: BetRecord[] = [];
  const unconvertible: BetRecord[] = [];

  for (const bet of bets) {
    const rate = bet.currency === INR ? 1 : table.rates[bet.currency];
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
      unconvertible.push(bet);
      continue;
    }
    const stake = bet.stake * rate;
    const payout = bet.payout * rate;
    converted.push({
      ...bet,
      currency: INR,
      stake,
      payout,
      // Recomputed rather than scaled, so profit stays exactly payout − stake.
      profit: payout - stake,
      // The multiplier is a ratio, so conversion leaves it untouched.
    });
  }

  return { converted, unconvertible };
}

const STORAGE_KEY = 'wagerlens.rates';

/** Reads a cached table, ignoring anything malformed or older than `maxAgeMs`. */
export function loadCachedRates(maxAgeMs = 12 * 3600_000): RateTable | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RateTable;
    if (
      !parsed ||
      typeof parsed.fetchedAt !== 'number' ||
      typeof parsed.rates !== 'object' ||
      Date.now() - parsed.fetchedAt > maxAgeMs
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveCachedRates(table: RateTable): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(table));
  } catch {
    // Storage unavailable — the rate simply will not survive a reload.
  }
}

export function clearCachedRates(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to clear */
  }
}

/** Merges a hand-entered rate into a table. */
export function withManualRate(
  table: RateTable | null,
  code: string,
  inrPerUnit: number,
): RateTable {
  const base: RateTable = table ?? {
    rates: { [INR]: 1 },
    fetchedAt: Date.now(),
    source: 'manual',
    provider: 'Entered by hand',
  };
  return {
    ...base,
    rates: { ...base.rates, [code.toLowerCase()]: inrPerUnit },
    fetchedAt: Date.now(),
    source: base.source === 'api' ? 'mixed' : 'manual',
    provider: base.source === 'api' ? `${base.provider} + manual` : 'Entered by hand',
  };
}

/** "2 hours ago", for the rate freshness readout. */
export function relativeAge(timestamp: number, now = Date.now()): string {
  const ms = Math.max(0, now - timestamp);
  const minutes = ms / 60_000;
  if (minutes < 1) return 'just now';
  if (minutes < 60) {
    const v = Math.round(minutes);
    return `${v} minute${v === 1 ? '' : 's'} ago`;
  }
  const hours = minutes / 60;
  if (hours < 24) {
    const v = Math.round(hours);
    return `${v} hour${v === 1 ? '' : 's'} ago`;
  }
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/** Formats an INR amount with the ₹ symbol and Indian digit grouping. */
export function formatInr(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return '—';
  return `₹${new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)}`;
}
