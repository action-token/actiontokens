# 14 — Catalog and bounty parity with bandfan `main`

The creation flows the client accepted in bandfan `main`, brought into the
artist portal. Same deployed contracts (`nft_oz`, `bounty_escrow`, same ids as
main's `common.ts`); no contract change. Screens follow the portal's existing
form style (FormPage / FormSection, Wadzzo layouts), fields and flows follow main.

## Decisions (asked 2026-10-31)

| Topic         | Decision                                                                                                                                       |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Classic items | **Keep the new way**: one issuer per artist, free to create, minted at purchase or from stock (plan 04). Not main's issuer-per-item paid mint. |
| Contract NFTs | **Main's way**: free, live at once, the platform registers the edition at the first sale; locked content; edit page; fan checkout.             |
| Also add      | Tier on items, Non Stellar Items, bounty extras, Sell Page Assets.                                                                             |

## 1. Bounty extras (smallest, first)

- **Pick the type first**: "New bounty ▾" offers _General bounty_ (any task,
  manual submissions) and _Music bounty_ (Last.fm listening), like main's
  menu; `/bounties/new?type=music` opens the form with the music challenge on.
  The switch inside the form stays.
- **Target duration per track** (seconds, default 30) next to plays needed,
  stored on each bounty track and used by the listening check, as in main.
- **Any held asset as the prize**: the currency list becomes the assets the
  artist actually holds in the chosen source (wallet or storage), with
  balances: ACTION, XLM, USDC, their fan token and any other classic asset.
  The escrow takes a token address, so a classic asset is passed as its
  Stellar Asset Contract. If that contract isn't deployed yet for the asset,
  the funding transaction deploys it first (a standard network operation, not
  a contract change); the artist pays its fee, shown in the breakdown.

## 2. Tier on items

Main's three choices on every item form: **Public**, **Private** (only the
artist sees it), or **a membership tier** (fans who hold enough of the fan
token). Uses the existing `Item.tierId`. Fans see a tiered item with "Hold N,
you have M" and can't buy it until they qualify (product rule from 2026-09-28).

## 3. Non Stellar Items

Main's "Non Stellar Item": no asset code, nothing on Stellar. Fields as main:
name, description, supply limit, price in ACTION and USD, tier, thumbnail,
media type + file. Schema: `ChainType` gets `OFF_CHAIN` (migration on the dev
database only). Buying one is a plain payment to the artist (ACTION, XLM,
USDC or card) through the existing order flow; ownership is recorded in the
database and stock is the limit minus copies sold, as in main.

## 4. Contract NFTs, main's way

> Moved to [plan 16](16-contract-nfts-and-locked-content.md), with the full
> locked content feature.

- **Create** is a database save: nothing to sign or pay, live at once. Fields
  as main: name (≤128), description (≤2,000), thumbnail, creator royalty
  (0–90%), supply (1–100,000), price in ACTION and USD (both required).
- **Locked content**, required (at least one): songs, images, videos or links
  hidden until a copy is bought; each can have an unlock rule (visit these
  places, radius in metres). Uses the existing `LockedContent` / `UnlockRule`
  tables; after a purchase the buyer's unlock pins appear on the AR map, as in
  main.
- **Registration at the first sale**: the platform registers the edition with
  `register_edition` (treasury as price authority, from the same data), then
  the buyer's `buy_edition` runs. Later sales skip registration. NFTs already
  registered by the current draft flow keep working.
- **Edit page** as main: text and prices editable; on-chain fields
  (supply, royalty) locked once registered, using `update_edition` where main did.
- **Fan checkout** for contract NFTs (wallet, custodial with the 5 s
  countdown, card), price breakdown first, quantity like other items. Opens
  `NFT_CHECKOUT_OPEN`. Resale stays in its own later plan.
- The artist-pays-to-register step and its toast go away.

## 5. Sell Page Assets

Main's "Sell Page Assets": the artist offers an amount of their fan token
from their storage account, with a description and prices (ACTION, USD,
XLM). One sale sells the whole amount: the buyer pays, the tokens move from
storage to the buyer in the same transaction, the listing is marked sold.
Needs a storage account holding the tokens; without one the page says how to
open and stock it. Listed on the artist's store page in the fan app.

## Order of work

1. Bounty extras.
2. Tier on items (form + fan gating).
3. Non Stellar Items (schema, form, purchase).
4. Contract NFTs: create + locked content + edit; then registration at first
   sale + fan checkout; then unlock pins.
5. Sell Page Assets (portal page + fan purchase).

Each step: API tests first, the form checked in Safari, every mutation logged,
committed separately.

## Risks

- **Money:** registration and purchase run in one order; the platform's
  registration must never happen without a paid sale, and a failed sale must
  not leave a half-registered edition (registration is idempotent by
  `edition_ref`, which main relied on).
- **Asset contracts for bounty prizes:** deploying a Stellar Asset Contract
  costs a fee and fails for assets with auth flags; the form says so plainly.
- **Storage accounts:** Sell Page Assets and storage-funded bounties need one;
  the test artist doesn't have one yet.
