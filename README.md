# WagerLens

**Your betting history, analyzed.**

Upload a Stake betting-history JSON export and WagerLens turns it into an
analytics dashboard: P&L over time, drawdowns, streaks, per-game breakdowns,
sportsbook and casino-specific analysis, and a searchable ledger of every bet.

Everything happens in your browser. There is no server, no account, and nothing
is uploaded.

---

## Privacy model

This is the part that matters most, so it comes first.

- Files are read with the browser's `FileReader` API and parsed in memory.
- **No network request is ever made with your betting data.** There is no
  backend, no analytics script, and no error reporting.
- **One exception, and it is opt-in:** if you turn on INR conversion, the app
  fetches exchange rates. That request sends *currency codes only*, literally
  the strings `usdc`, `usdt`, `inr`. No stake, payout, bet, timestamp or
  identifier is included, and the request carries no cookies or credentials.
  Leave conversion off and the app makes no outbound request at all.
- `localStorage` holds your theme preference and, if you used conversion, the
  cached rate table. The archive itself is never persisted, reload and it is
  gone.
- No web fonts are loaded. Typography uses system font stacks, so the page makes
  zero external requests once it has loaded.
- The build is a static bundle. You can host it yourself, or run it offline.

Stored keys: `wagerlens.theme` (`"light"` or `"dark"`) and, only after you
enable conversion, `wagerlens.rates` (the fetched rate table and its
timestamp).

---

## Features

**Multi-file upload**, Stake exports one JSON per date, so drop the whole set
at once. They merge into a single history, and a per-file panel reports each
one on its own. Click any file to scope the entire dashboard to it.

**De-duplication**, a bet appearing in two overlapping exports, or the same day
downloaded twice, is counted once. Without this, re-downloading a date would
silently inflate every figure on the page.

**INR conversion**, optional. Converts every currency into INR at current
rates so a mixed history becomes one comparable ledger, with the rate, its age
and its source shown. A hand-entered rate is always available if the service is
unreachable or you would rather use your own number.

**Overview**, total wagered, total returned, net P&L, ROI, bet count, win rate,
average and median stake, largest win and loss, maximum drawdown.

**P&L chart**, cumulative P&L per bet on a real time axis, plus daily, weekly
and monthly views.

**Drawdown**, peak, the deepest peak-to-trough fall, when it happened, whether
and how quickly it recovered, and the current distance from peak, with an
underwater plot.

**Streaks**, current run, longest and average winning and losing runs, and a
run-sequence strip. Presented descriptively; runs say nothing about what comes
next.

**Game breakdown**, bets, wagered, returned, P&L, ROI, win rate and average
stake per game, as both a visual comparison and a sortable table.

**Sportsbook**, performance by odds range and by stake size, singles vs multis,
average and stake-weighted odds, cash-outs, distinct fixtures, and a table
comparing the archive's recorded probability field against realised win rates.

**Crash**, bust rate, average cash-out target, average and highest realised
multiplier, and success rate per cash-out target, with rows derived from the
targets actually present in your data.

**Plinko**, performance by risk level and row count, realised multiplier
distribution, and how often a drop returned less than its stake.

**Mines**, performance by mine count and by tiles revealed, average cash-out
multiplier, and busted rounds.

**Time & cadence**, activity by hour and weekday, active days, bets per active
day, median and mean gap between bets, and the busiest date.

**Betting profile**, short descriptive sentences generated from your own data.

**Bet history**, sortable, searchable, filterable, paginated ledger with an
expandable detail drawer per bet and a raw-record view.

**Data quality**, how many records were read, how many were analyzed, how many
were excluded and exactly why.

---

## Stack

| | |
|---|---|
| Framework | React 18 + TypeScript |
| Build | Vite 6 |
| Styling | Tailwind CSS 3, CSS custom properties for theming |
| Charts | Recharts |
| Icons | Lucide |
| Tests | Vitest |

No backend, no state-management library, no component library.

---

## Setup

Requires Node 18+.

```bash
npm install
```

## Commands

```bash
npm run dev        # development server on http://localhost:5173
npm run build      # typecheck + production build to dist/
npm run preview    # serve the production build locally
npm test           # run the test suite once
npm run test:watch # run tests in watch mode
npm run typecheck  # typecheck without emitting
```

---

## JSON handling

### Expected format

A Stake betting archive is a JSON array of envelope records:

```jsonc
[
  {
    "id": "…",                          // envelope id
    "store_id": "…",
    "user_id": "…",
    "created_at": "2026-01-28T05:01:32.501Z",
    "data": {
      "id": "…",                        // bet id
      "type": "sportsbook",             // sportsbook | crash | casino
      "gameName": "sportsbook",         // sportsbook | crash | plinko | mines | …
      "currency": "usdc",
      "amount": 0.30555608,             // stake
      "payout": 0,                      // gross return, stake included
      "payoutMultiplier": 0,            // payout / amount
      "active": false,
      "createdAt": 1769576492501,       // epoch ms
      "status": "settled"               // sportsbook only
      // …game-specific fields
    }
  }
]
```

An object wrapper (`{ "data": [ … ] }`) is also accepted.

### What the parser does

1. Validates that the file is JSON and that it contains records shaped like
   bets. If not, you get a clear error rather than an empty dashboard.
2. Normalises each record into an internal model, so no UI component ever
   touches raw archive JSON.
3. Handles missing, null and non-numeric fields without throwing.
4. Accepts timestamps as epoch milliseconds, epoch seconds, or ISO-8601.
5. Derives the payout multiplier from stake and payout when the recorded value
   is absent or contradicts them.
6. Sorts chronologically, because every cumulative metric depends on order.
7. Records every skipped record and why, for the data-quality panel.

**A single malformed record never aborts the import.** It is counted, explained,
and skipped.

### Game-specific fields read

| Game | Fields |
|---|---|
| Sportsbook | `outcomes[]` (odds, probabilities, fixtureId, marketId, outcomeId, cancel), `system`, `potentialMultiplier`, `cashoutMultiplier`, `status`, `customBet` |
| Crash | `cashoutAt`, `result`, `roundId` |
| Plinko | `statePlinko` (risk, rows, path, point) |
| Mines | `stateMines` (minesCount, rounds, _mines) |

Games without a dedicated view still appear in every headline metric and in the
ledger; they are simply listed under "unrecognised" in the data-quality panel.

---

## Analytics definitions

### Accounting rules

These are implemented in `src/analytics/core.ts` and restated in the UI under
"How these numbers are calculated".

| Metric | Definition |
|---|---|
| **Total Wagered** | Sum of the stake on every completed bet |
| **Total Returned** | Sum of the payout on those bets. Payout is *gross*, it includes the stake back on a winner |
| **Net P&L** | `Total Returned − Total Wagered` |
| **ROI** | `Net P&L ÷ Total Wagered × 100` |
| **Win rate** | Wins ÷ (wins + losses) × 100 |
| **Max drawdown** | Deepest fall in cumulative P&L below its running peak |

### What is excluded, and why

| Excluded | Reason |
|---|---|
| `rejectedNotFound` and other `rejected*` | The bet never stood. The archive records `payout === amount` because the stake was returned, so counting these would inflate both Total Wagered and Total Returned by the same amount and add phantom break-even bets to the bet count and win rate |
| `cancelled*` / `void*` | The wager was unwound and never resolved |
| `active: true` | Still open at export time. Booking it now would record a loss for a bet that may yet win |
| Malformed, undated, or invalid-amount records | Cannot be interpreted safely |

Sportsbook **cash-outs are included**, a cash-out is a real settlement at a
negotiated multiplier, not a cancellation.

### Wins, losses and pushes

Outcome is derived from realised profit, not from a status string:

- **Win**, `payout > stake`
- **Loss**, `payout < stake`
- **Push**, `payout === stake` exactly

Pushes are excluded from win-rate denominators, so a run of 1.00× rounds neither
helps nor hurts the figure. They also neither extend nor break a streak.

### Undefined values

Any metric with a zero denominator is reported as `null` and rendered as a dash,
never as `0`, `NaN` or `Infinity`. ROI on zero wagered, win rate with no decided
bets, and the payout multiplier of a zero-stake round are all handled this way.

### Drawdown

Drawdown is measured against the running peak of cumulative P&L, with the peak
floored at zero. It is reported as an absolute amount and as a share of **total
wagered**, deliberately *not* as a share of the peak: cumulative P&L starts at
zero, so the peak is not a capital base, and a small peak produces a
meaningless four-figure percentage.

### Odds and probability

Sportsbook bets are bucketed by `potentialMultiplier` (the product of the leg
odds), so a multi is classified by what it would actually have paid.

The probability column reports the archive's own `probabilities` field **exactly
as recorded**. WagerLens makes no claim about how that number was produced, and
the table shows the sample size in each band alongside it, because a band with
four bets will diverge from any recorded probability through sample size alone.

### Stake buckets

Stake-size buckets are quartiles of the stakes in the current selection rather
than fixed thresholds. Crypto stakes span several orders of magnitude, so a
hard-coded ladder would put every bet in one bucket.

---

## Currency handling

By default, amounts are shown in the currency recorded in the archive and
**nothing is converted**. Where several currencies are present, commonly one
file in INR and others in USDC or USDT, the dashboard reports one at a time and
opens on whichever has the most bets. Figures from different currencies are
never added together.

### Optional INR conversion

Turning on conversion multiplies every amount by a current exchange rate and
combines the whole archive into one INR ledger. Rates come from CoinGecko
(crypto) and open.er-api.com (fiat), are cached for 12 hours, and are shown in
the currency panel with their age and source so any figure can be checked.

Three things worth knowing:

- **It converts at today's rate, not the rate at the time of each bet.** That
  makes totals comparable across currencies, but a bet placed months ago is
  being valued at today's price. The dashboard says so wherever conversion is
  active.
- **A currency with no rate is excluded, not assumed.** Leaving it in at face
  value would mix denominations inside one total, precisely the error this app
  refuses to make. Excluded bets are counted and reported.
- **Conversion is a display layer.** The recorded amounts are never mutated;
  switching it off restores them exactly.

If the rate service is unreachable, blocked, or rate-limiting, the panel offers
a manual rate per currency. That path is also the right one if you want to value
your history at the rate you actually deposited at.

Display precision is derived from both ends of the observed range, enough
decimals that the largest total is not noisy, and enough that the smallest
non-zero stake does not round to zero.

---

## Architecture

```
src/
  analytics/     pure metric functions (core, grouping, games, profile)
  charts/        Recharts wrappers and chart chrome
  components/    UI, organised by section
    games/       per-game panels
    ui/          primitives (Panel, Metric, DataTable, ThemeToggle, …)
  hooks/         archive state, theme, media queries, count-up
  parsers/       raw Stake JSON → normalised model, and multi-file merging
  styles/        design tokens and component classes
  test/          fixtures and factories
  types/         the internal data model
  utils/         formatting
```

Three layers, in one direction:

**Parser** → raw archive JSON becomes `BetRecord[]`, one file at a time, then
`bundle.ts` merges the files and removes cross-file duplicates. Raw shapes never
escape `src/parsers/`.

**Analytics** → `BetRecord[]` becomes metrics. Every function is pure and takes
an already-filtered, chronologically sorted array. No React, no DOM.

**Presentation** → metrics become components. No dashboard component computes a
statistic.

### Accessibility

- Semantic HTML with labelled sections and table captions.
- The upload target is a real `<input type="file">` inside a label, so it is
  keyboard-operable and announced correctly.
- Visible focus rings throughout; the data-quality dialog traps initial focus
  and closes on `Escape`.
- Wins and losses are marked with a glyph (▲ / ▼ or an explicit sign) as well
  as a colour, and every signed figure has a spoken equivalent.
- Sortable columns expose `aria-sort`; expandable rows expose `aria-expanded`.
- All motion respects `prefers-reduced-motion`, including the KPI count-up.

### Performance

- Analytics are memoised per filter change; filtering is a single pass.
- The bet ledger is paginated, so only one page of rows is ever mounted.
- The dashboard (and with it the charting library) is code-split, so the upload
  screen does not pay for it.
- Charts are keyed off memoised arrays to avoid re-render churn.

---

## Testing

```bash
npm test
```

142 tests covering the parser, the multi-file merge, currency conversion,
formatting and the full analytics layer, run against a real sample archive plus
synthetic fixtures.

The committed fixture (`src/test/fixtures/bet-archive.sample.json`) is a genuine
export with the IP addresses and account identifiers replaced by placeholders.
Those fields are not read by the parser or any test, so every figure the suite
asserts is unchanged. Coverage includes:

- total wagered, total returned, P&L and ROI against hand-verified figures
- rejected, cancelled and still-open records being excluded correctly
- win rate, including push handling
- drawdown, recovery, and the never-in-profit case
- streak calculation, including pushes being transparent
- grouping by game, odds range, stake range, date, hour and weekday
- every game-specific calculator
- mixed, missing and malformed fields
- multiple currencies being kept apart
- no `NaN` or `Infinity` anywhere in any computed result
- merging several daily exports into one history
- de-duplicating a bet present in two overlapping files
- a bad file not blocking the good ones in the same upload
- currency conversion arithmetic, including profit staying exactly
  `payout − stake` and multipliers surviving untouched
- an unpriced currency being excluded rather than mixed in at face value
- display precision adapting to both ends of a range without overflowing

---

## Limitations

- WagerLens reads what is in the file. It cannot see bets the export omits.
- Bets still open at export time are excluded, so a dashboard built from an
  archive taken mid-session will not match an account balance.
- Converted figures use one current rate for the whole history, so they are
  today's value of past bets, not their value at the time. Leave conversion off
  for the amounts exactly as recorded.
- Rate lookups depend on a third-party service. If it is down or blocked, enter
  a rate by hand.
- The recorded probability field is reported as recorded. Its provenance is not
  something the archive establishes.
- Per-game and per-band figures over small samples are descriptions of a handful
  of bets, not stable rates. Sample sizes are shown alongside.
- Sportsbook cash-outs are booked at the amount actually returned.

---

## Deployment

The build output in `dist/` is a static site with no server requirement. The
Vite `base` is relative, so it works from a domain root or a sub-path.

```bash
npm run build
```

**Vercel**, framework preset *Vite*; build `npm run build`; output `dist`.
Nothing else to configure: Vercel exposes `VERCEL_PROJECT_PRODUCTION_URL` at
build time and the link-preview tags pick it up automatically.

**Netlify**, build `npm run build`; publish directory `dist`.

**Cloudflare Pages**, framework preset *Vite*; build `npm run build`; output
`dist`.

**GitHub Pages**, push `dist/` to a `gh-pages` branch, or upload it as a Pages
artifact. The relative base means no extra configuration is needed.

**Anywhere else**, serve `dist/` as static files, or open it locally.

### Link previews

Sharing the URL on WhatsApp, Slack, iMessage or Twitter shows a preview card
built from `public/og-image.png` (1200x630, 59 KB).

Unfurlers ignore a relative `og:image`, so the absolute origin is baked in at
build time. It resolves in this order:

1. `VITE_SITE_URL`, which you set for a custom domain:
   `VITE_SITE_URL=https://wagerlens.example npm run build`
2. `VERCEL_PROJECT_PRODUCTION_URL`, which Vercel sets for you.
3. Neither, in which case the tags fall back to relative URLs. The site works
   exactly the same; only the preview thumbnail is lost.

**On a custom domain, set `VITE_SITE_URL` in the Vercel project's environment
variables and redeploy**, otherwise the card points at the `.vercel.app` host.

To regenerate the image after a design change, re-render
`public/og-image.png` at 1200x630.

---

## A note on what this is

WagerLens is an analytics and visualisation tool. **It is not betting advice.**

It describes what happened in a file you already have. It does not recommend
bets, rank games by expected value, identify strategies, or suggest that any
pattern will repeat. Streaks and hot runs are presented as descriptions of
sequence and nothing more.

**Historical results do not predict future outcomes.**

If gambling is causing you harm, support is available, in the UK,
[GamCare](https://www.gamcare.org.uk) (0808 8020 133); in the US,
[1-800-GAMBLER](https://www.1800gamblerhelp.org).
