# 40 · Studio extras 3: your usage numbers

**Status: built 2026-11-13.**

## How bandfan did it (read 2026-11-13)

The AI History page (`components/history/usage-analytics.tsx`, `credit.getUsageStats`) showed three
tiles (generations in the last 30 days, credits used in all time, average cost per generation), a
split of images against videos, and a 7 / 30 / 90 day switch that was drawn but did nothing. The API
also worked out credits bought; the page never showed it.

## Action Tokens today

The Studio Coins page (`apps/studio/src/features/coins`) shows the balance, top-up and a History
list. No totals. The coin ledger records every top-up, bonus, spend and refund with its date, and
every run records its tool.

## Decisions (your answers, 2026-11-13)

| Question  | Answer                                                             |
| --------- | ------------------------------------------------------------------ |
| Tiles     | Coins spent, coins bought (bonus coins beside it), creations       |
| Period    | A working switch: 7 days, 30 days, 90 days, All time; starts on 30 |
| Breakdown | Yes, one row per tool                                              |

## What each number means

Settled from how the ledger works; say if any should differ.

- **Coins spent:** coins charged for runs in the period, minus coins refunded in the period (a
  failed run is refunded). Only settled entries; a run still going isn't counted yet.
- **Coins bought:** coins from top-ups in the period. Beside it, "+N bonus" for bonus coins received.
  Coins carried over from the old Action Tokens credits are neither.
- **Creations:** runs started in the period that finished successfully. A live jam is one creation.
- **By tool:** Images, Video, Music (live jams are Music), Writing, Social, SEO: creations and coins
  spent (after refunds) for each, most coins first. Tools not used in the period aren't listed.
  Spending on a run that was since removed from the Library still counts, under its tool when known
  and "Removed" otherwise.

## What gets built

### API (`packages/api`)

- New `services/studio/usage.ts`: `studioUsage(ctx, userId, { days? })` returns
  `{ spent, bought, bonus, creations, byTool: [{ type, creations, spent }] }`.
- `coins.usage` query on the Studio router, input `days`: 7, 30, 90, or left out for all time.
  Signed-in users only, their own numbers. Read-only.

### Studio Coins page

- New `features/coins/usage.tsx`, a "Your usage" section between Top up and History: the period tabs,
  three `StatCard` tiles, then the by-tool rows (the tool's icon and name, creations, coins).
- With nothing in the period: the tiles show 0 and a line says "Nothing in this period."
- Same section heading, tabs and tiles as the rest of Studio and the admin pages.

## Tests

- API: spends minus refunds; pending and failed entries left out; top-ups, bonuses and carried-over
  coins kept apart; only successful runs counted; the period window; the by-tool rows and their
  order; a removed run's spending.
- `pnpm typecheck && pnpm lint && pnpm test`.

## Not in this plan

- Charts, or average cost per creation.

## Built (2026-11-13)

- `packages/api/src/services/studio/usage.ts` (`studioUsage`), `coins.usage` on the Studio router,
  `__tests__/studio-usage.test.ts` (6).
- `apps/studio/src/features/coins/usage.tsx` (`CoinUsage`), shown on the Coins page between Top up
  and History.
- Correction to "What each number means": a removed run's ledger entry no longer links to it, so its
  spending always shows under "Removed", never under its old tool.
