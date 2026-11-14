# 33 · Short link and Subscribe: every way to pay

**Status: built 2026-11-09 (not committed).**

Plan 04 says every payment offers BANDCOIN, XLM, USDC and card where it can. Two don't yet:
the artist's **short link** (no card) and **Subscribe** (BANDCOIN only).

## How bandfan did it (read 2026-11-09)

- **Short link**: BANDCOIN only, a one-time fee (300 to set, 750 to change, `server/vanity/pricing.ts`). The
  artist signed a payment to the mother account, the server checked it on-chain, then saved the name.
- **Follow / subscribe** (`fan/trx.ts` `followCreatorTRX`, `follow_creator.ts`): a trustline to the fan token
  plus a BANDCOIN payment that went back to the fan's own account, so it never charged anything.
- **Card (Square)** was only used for items and NFTs (also as a guest), recharge and activation; never
  for these two.

## Bandcoin today

- Short link: BANDCOIN, XLM or USDC, no platform fee (`services/artist/vanity.ts`). The monthly and
  name-change prices already have a USD value in Admin › Settings.
- Subscribe (`recharge` kind `TOKEN_TRUST`): BANDCOIN pays for 0.5 XLM at today's price + a 2% cushion.
  The treasury's mother account sends the 0.5 XLM and the fan's line opens in the same transaction.
- A card form exists in the fan app, the artist portal and Studio; the AR app has none.
- Card recharge already has the fan **sign first and charges the card after**, so declining in a wallet
  costs nothing. The card is refunded only if the network then refuses.

## Decisions (your answers, 2026-11-09)

| Question                        | Answer                                                                                        |
| ------------------------------- | --------------------------------------------------------------------------------------------- |
| Short link by card              | **Yes**                                                                                       |
| Short link fee                  | **The platform fee on every currency** (BANDCOIN, XLM, USDC and card)                         |
| Subscribe                       | **All four**: BANDCOIN, XLM, USDC and card                                                    |
| Subscribe fee                   | **The platform fee on all four**                                                              |
| The fee's rate                  | **Admin › Settings' platform fee** (`platformFeeBps`, 2.5% today), the same as item purchases |
| Subscribe by card price         | **At least $1.00.** What's above the cost reaches the fan as BANDCOIN                         |
| No BANDCOIN line for that extra | **Open it in the same transaction**; the treasury covers the 0.5 XLM it locks, out of the $1  |
| Where Subscribe by card shows   | **Fan app and AR** (AR gets the card form)                                                    |
| Fan gifting an NFT they own     | **Not built** (2026-11-10): only artists gift, as in bandfan and plan 17                      |
| The 2% cushion (BANDCOIN, USDC) | **Kept, with the platform fee on top**                                                        |

## 1. Short link (`services/artist/vanity.ts`, portal Pay panel)

- `currency` gains `USD` (card). The quote uses `platformFeeBps` from settings instead of `0`, and the
  fee line is no longer hidden: "Platform fee 2.5 %".
- Crypto: one payment to the treasury for price + fee, as now.
- Card: `start` returns `signer: "card"` and no transaction; `submit` charges price + fee in USD
  (idempotent by order id), then delivers. If delivery fails the card is refunded (`failOrder`), as Studio
  top-ups do. The name is re-checked **before** the card is charged.
- `vanityPayment` records the currency (`USD` for card) and the total paid.
- Portal Pay panel: a fourth choice "Card". It shows the portal's existing `SquareCard` form after the
  breakdown (the same one the portal's recharge uses), then the usual toast.

## 2. Subscribe (`@bandcoin/chain` recharge, `services/recharge`, fan app, AR)

`recharge.quote/start/submit` for `TOKEN_TRUST` take `currency: BANDCOIN | XLM | USDC | USD`.

| Currency | The fan pays                                                                                                               | One transaction (the fan is the source)                                                                                                               |
| -------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| BANDCOIN | 0.5 XLM at today's price + the 2% cushion + fee                                                                            | BANDCOIN to the mother account, the fee to the treasury, 0.5 XLM back to the fan, open the fan-token line                                             |
| USDC     | the same in USDC                                                                                                           | as BANDCOIN, in USDC                                                                                                                                  |
| XLM      | the fee in XLM; the 0.5 XLM reserve is locked from their own XLM                                                           | the fee to the treasury, open the line                                                                                                                |
| Card     | `max($1.00, cost + fee)`, cost = 0.5 XLM (+0.5 XLM if a BANDCOIN line is needed) and the network fee, at today's XLM price | the mother sends the XLM, opens the BANDCOIN line if needed, opens the fan-token line, sends the rest of the $1 as BANDCOIN; fee-bumped by the mother |

- Card order of steps, as card recharge: the fan signs (wallet popup, or custodial countdown) → the card
  is charged → submit. A refusal from the network refunds the card. No retries.
- The breakdown shows every line: the fan-token line reserve, the BANDCOIN line reserve (when needed), the
  network fee, the platform fee, "Card minimum: the rest as BANDCOIN" with the amount, and the total.
  A shortfall says exactly how much is missing (no automatic conversion).
- New chain builders, with tests: `buildTrustWithPayment` (BANDCOIN/USDC/XLM, with the fee output) and
  `buildTrustByCard`. The quote maths is pure and tested to the stroop (amounts are bigint, as now).
- Fan app `HoldTokenDialog` and AR `SubscribeSheet`: a currency picker like the other payment screens
  (same pieces as the buy panel), and card shows `SquareCard`. AR gets a copy of the fan app's
  `square-card.tsx` in AR's styles (apps can't import each other), with `NEXT_PUBLIC_SQUARE_*` added to
  AR's `.env.example`.
- Subscribing still means the same thing: a trustline to the fan token (`follows.sync` and the live
  check are unchanged).

## Tests

- Quote maths: fee on every currency, the $1 minimum, BANDCOIN extra with and without a BANDCOIN line,
  shortfalls.
- Builders: the operations and their sources for each currency; the card one fee-bumped.
- Services: the short-link card is charged once, refunded when delivery fails, and a taken name stops it
  before charging; Subscribe card signs before charging, refunds on a network refusal, and a declined
  wallet charges nothing.
- A testnet run script (`testnet:trust` extended) for XLM and USDC; card stays on Square's sandbox.

## Needs from you

- Square sandbox keys in AR's env when you want to try card Subscribe there.

## Built (2026-11-09)

- **Chain** (`packages/chain`): `recharge/fan-token.ts` has `quoteFanTokenTrust` (all four currencies, the fee,
  the $1 card minimum, the BANDCOIN extra and its line). `classic/recharge.ts` has `buildTrustWithPayment` and
  `buildTrustByCard`. The old BANDCOIN-only `quoteXlmSwap`/`buildTrustWithSwap` are gone.
- **Short link** (`services/artist/vanity.ts`): `USD` currency, the platform fee from settings on every
  currency. A card order has no transaction; `submit` re-checks the name, charges once (idempotent by order),
  delivers, and refunds through `failOrder` if delivery fails.
- **Subscribe** (`services/recharge`): `TOKEN_TRUST` takes `currency`. The platform signs only when it sends
  something (an XLM subscribe needs no platform signature); card is fee-bumped and charged after the fan
  signs, as card top-ups are.
- **Routers**: `recharge.*`, `subscribe.*` (AR) and `vanity.*` take the currency; vanity `submit` takes a card.
- **Portal**: the Pay panel has a "Card" choice with the portal's Square form. The shared
  `useWalletPayment` gained an optional `charge` step for orders with nothing to sign.
- **Fan app**: the "Pay with" tiles moved out of the buy panel into `features/buy/currency-picker.tsx`, used by
  the buy panel and the Subscribe dialog. The dialog shows the card form when Card is picked.
- **AR**: `SubscribeSheet` has a currency switch (`SegmentedTabs`) and the card form
  (`lib/ar/useSquareCard.ts`, a copy of the fan app's). AR's `.env.example` already had `NEXT_PUBLIC_SQUARE_*`.
- **Testnet script**: `TRUST_CURRENCY=XLM pnpm --filter @bandcoin/api testnet:trust` runs the XLM way;
  the default is BANDCOIN. USDC isn't in the script (the throwaway fan would need testnet USDC).
- **Tests**: chain quote and builders; API: Subscribe in each currency, the XLM path skipping the platform's
  signature, card with and without a BANDCOIN line, a declined card charging nothing and a network refusal
  refunding; short link: the fee, the card charged once, the name checked before charging, the refund.
