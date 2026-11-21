# 41 · Studio extras 4: admin Studio totals

**Status: built 2026-11-13.**

## How bandfan did it (read 2026-11-13)

The admin AI page (`pages/admin/ai`, `components/common/ai-system.stats.tsx`,
`credit.adminGetSystemStats`) showed five cards: total users, credits in circulation (every
balance added up), revenue in ACTION, revenue in USDC, and total transactions. A route listing
each user's credit balance (`credit.adminGetUserBalances`) existed but no page used it.

## Action Tokens today

Admin › Studio earnings shows money in, coins spent on runs, the platform's share and bonus coins
for a period. Nothing shows the coins people hold right now, or how many hold any. A person's admin
page shows pins collected, codes redeemed, items owned and following, but nothing about Studio.

## Decisions (your answers, 2026-11-13)

| Question     | Answer                                                                      |
| ------------ | --------------------------------------------------------------------------- |
| Where        | Admin Overview                                                              |
| Totals       | Coins held, people holding coins, coins carried over                        |
| Carried over | Every coin ever carried over from the old credits (spent since or not)      |
| Layout       | A new "Studio coins" row under Totals, each tile linking to Studio earnings |
| Person page  | Studio coin balance, plus coins spent and coins bought over all time        |
| Holders list | No                                                                          |

## What each number means

- **Coins held:** every person's Studio balance added up, now. The hint under it gives the dollar
  value at a cent a coin.
- **People with coins:** people whose balance is above zero.
- **Carried over:** coins carried over from the old Action Tokens credits, all time (settled entries).
- **Person › Coins spent / Coins bought:** the same meaning as on the Studio Coins page (plan 40),
  over all time: spent is charges minus refunds; bought is top-ups, with "+N bonus" beside it.

## What gets built

### API (`packages/api`)

- `services/admin/overview.ts`: `getOverview` adds `studio: { coinsHeld, holders, carriedOver }`.
  Read-only.
- `services/admin/person.ts`: the person adds `studio: { coins, spent, bought, bonus }`, reusing
  `studioUsage` from plan 40 (all time) and the balance row.

### Artist portal (admin)

- `features/admin/overview-view.tsx`: a "Studio coins" tile row under Totals (Coins held with its
  dollar value, People with coins, Carried over), linking to `/admin/studio-earnings`.
- `features/admin/person-view.tsx`: three more tiles beside the existing four: Studio coins,
  Coins spent, Coins bought (with "+N bonus").

## Tests

- Overview: coins held and holders (zero balances left out), carried over counts settled entries only.
- Person: the Studio numbers come back for that person.
- `pnpm typecheck && pnpm lint && pnpm test`.

## Not in this plan

- A list of top holders; revenue split by how people paid.

## Built (2026-11-13)

- API: `getOverview` returns `studio: { coinsHeld, holders, carriedOver }`; `getPerson` returns
  `studio: { coins, spent, bought, bonus }` (via `studioUsage`). Tests in `admin-overview.test.ts`
  and `admin-person.test.ts` (one new test each).
- Admin Overview: "Studio coins" row under Totals. Person page: Studio coins, Coins spent and Coins
  bought tiles after Following.
