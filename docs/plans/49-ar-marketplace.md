# 49 · AR marketplace tab

**Status: built 2026-11-13. No migration.**

Eighth of the map and AR upgrades that follow wadzzo. Queue after: 50 phone bottom tab bar.

## How wadzzo did it (read 2026-11-13: `lib/market.ts`, `MarketCard.tsx`, `marketplace/page.tsx`, `marketplace/[id]/page.tsx`)

- A **Marketplace** tab in the AR bottom bar (it replaced Bounty). It is read-only: AR shows items but
  does not sell. Buying happens in the marketplace app, which has the wallet and checkout.
- **List screen:** header ("Buy & collect / Marketplace"), a search box, All / Drops / Resale tabs, a
  two-column grid, "Load more", and an "Open the full marketplace" link.
- **Card:** square art with a media-type badge, a corner tag (Resale, Sold out, "N left"), the name,
  the creator, the price (with a dollar figure) and a **Go to Marketplace** button that opens the item
  in the marketplace app. The art and name open the item's page inside AR.
- **Item page:** the item, who made it and a Go to Marketplace button, plus related items.
- `lib/market.ts` builds the links to the marketplace app and formats prices (compact above 100,000).

## Bandcoin today

- The fan app has `/marketplace` (type chips: All, Music, Artwork, Video, Tickets, Fan tokens, Merch,
  Royalties, Locked content; search; sort) over the public `catalog.browse`, and `/item/[slug]` over
  the public `item.bySlug`. Prices are BANDCOIN and USD, from the cheapest open listing.
- AR has no marketplace. Its tab bar is Map, Collection, [AR], Bounty, Artists; its API (`arRouter`)
  has no catalog or item routers. `NEXT_PUBLIC_APP_URL` (the fan app) already exists for links out.

## Decisions (your answers, 2026-11-13)

| Question | Answer                                                                    |
| -------- | ------------------------------------------------------------------------- |
| Scope    | Grid and an item page in AR (no Resale tab; no public resale list exists) |
| Tab      | Replaces Bounty: Map, Collection, [AR], Marketplace, Artists              |
| Types    | The same type chips as the fan app marketplace                            |

Bounty stays reachable from the map's Bounty pill (plan 46) and the profile. Plan 50 may rearrange the
bar again.

## What gets built

### API (`packages/api`)

- `root-ar.ts` adds the fan app's `catalog` and `item` routers (both already public for browsing and
  the item page; the same way `account` and `bounty` are shared). No new procedures, nothing
  signed-in-only is exposed beyond what the fan app already offers.

### AR (`apps/ar`)

- `lib/market.ts`: `marketItemUrl(slug)` and `marketplaceUrl` from `NEXT_PUBLIC_APP_URL`, the type
  chips (same list and order as the fan app), `formatPrice`, `formatUsd`.
- `components/market/MarketCard.tsx`: the card (art, type badge, artist, BANDCOIN price with the dollar
  figure, "Sold out" when nothing is open, Go to Marketplace button that opens the fan app in the same
  window as other links out of AR).
- `app/(shell)/marketplace/page.tsx`: header, search (deferred, 80 characters), type chips as a
  scrolling row (`SegmentedTabs` has too few slots for nine), a two-column grid with skeletons, an
  empty and an error state, Load more, "Open the full marketplace".
- `app/(shell)/marketplace/[slug]/page.tsx`: the item page: cover, title, type, artist (opens the
  AR artist page when AR has it), description, copies (supply and sold), the cheapest price per open
  listing, and one **Go to Marketplace** button. No buying, no wallet, no gated content here.
- `components/shell/BottomTabBar.tsx`: Marketplace (shopping bag icon) replaces Bounty; the bell/dot
  prop stays unused as today.

## Tests

- `market.test.ts`: item and marketplace links (trailing slash, missing env), price formatting
  (compact above 100,000, two decimals), the type chips match the fan app's list.
- `MarketCard.test.tsx` (rendered to markup): price and dollar figure, sold-out state, link to the
  item page and to the fan app.
- `BottomTabBar` test: Marketplace is in, Bounty is out, both sides keep two tabs.
- API: a test that `arRouter` exposes `catalog.browse` and `item.bySlug` to a signed-out caller.
- `pnpm typecheck && pnpm lint && pnpm test`.

## Not in this plan

- Resale (a Resale tab and a public list of fan listings), buying in AR, sorting, the Locked content
  detail view, the phone tab bar redesign (50).

## Built (2026-11-13)

- API: `arRouter` gained the fan app's `catalog` and `item` routers (no new procedures).
- AR: `lib/market.ts`, `MarketCard`, `/marketplace` (search, type chips as a scrolling row, grid, Load
  more, empty and error states) and `/marketplace/[slug]` (one Go to Marketplace button); the tab bar
  shows "Market" in Bounty's place.
- Tests: `market.test.ts`, `MarketCard.test.tsx`, `BottomTabBar.test.ts`, API `ar-marketplace.test.ts`.
- Not tried in a browser. Needs `NEXT_PUBLIC_APP_URL` set in AR's environment for the links to open the
  fan app; the item page doesn't link to the artist (AR's artist pages use a different id).
