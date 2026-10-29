# 04 · Transactions

## Rules (from you)

0. **Four ways to pay, wherever possible.** Each payment offers BANDCOIN, XLM, USDC and card when it can technically be done. Where it can't, it offers as many as possible. Card goes through Square and delivers to the buyer's (custodial) wallet.

   | Payment                                            | BANDCOIN                             | XLM | USDC | Card | Why not all four                                                                                                            |
   | -------------------------------------------------- | ------------------------------------ | --- | ---- | ---- | --------------------------------------------------------------------------------------------------------------------------- |
   | Buy item (classic token or NFT), primary or resale | ✓                                    | ✓   | ✓    | ✓    |                                                                                                                             |
   | Artist fan token (tiers)                           | ✓                                    | ✓   | ✓    | ✓    |                                                                                                                             |
   | Vanity URL renewal / name change                   | ✓                                    | ✓   | ✓    | ✓    |                                                                                                                             |
   | Studio coins                                       | ✓                                    | ✓   | ✓    | ✓    |                                                                                                                             |
   | Gift an item to someone                            | ✓                                    | ✓   | ✓    | ✓    |                                                                                                                             |
   | Fund a bounty prize                                | the asset the prize is in            |     |      |      | The escrow contract holds one asset per bounty. The artist picks BANDCOIN, XLM or USDC as the prize asset when creating it. |
   | Royalty payout to holders                          | the payout currency the artist picks |     |      |      | Outgoing payment from the artist, not a purchase.                                                                           |

1. **No automatic conversion.** Today `buy-quote.ts` and `account-validation.ts` swap XLM into Bandcoin, or Bandcoin into XLM, when one is short. That goes. The buyer picks a currency and pays in it. If the balance is short, the buy panel says exactly how much is missing, with an "Add funds" link. It never swaps.
2. **Simple and visible.** Every payment shows a price breakdown before signing.
3. **The user pays every cost, never the platform's mother account** (except bounties). The user is the source of every payment transaction, so they pay the network fee, any trustline reserve and the platform fee. Card orders (decided 2026-10-28): the card pays everything in USD — price, 2.5 % fee, and the XLM reserve and network fee at the live XLM price. The treasury sends that XLM in the same transaction and fee-bumps it, so a buyer with no XLM can pay by card. The seller (and any royalty) is paid instantly in BANDCOIN at the artist's BANDCOIN price, from the treasury. Bounties are the one exception: the platform may pay a claim's network fee.
4. **One issuer per artist** (as in Wadzzo). The artist pays once to open it (`buildIssuerSetup`, 1.5 XLM). Their fan token and every item they create are issued by it. Copies are minted when fans buy (lazy mint) or come from minted stock in the artist's storage first.
5. **Custodial users can cancel.** Email and Google wallets have no signing popup, so they get a countdown toast with a Cancel button before the server signs. Wallet-extension users cancel in their wallet popup.
6. **Platform fee: 2.5 % on top** (decided 2026-10-28), in every currency; admins can change it in AppSetting. Replaces bandfan's flat 6000 BANDCOIN.

## Prices

The artist sets two prices per listing: **BANDCOIN** (fixed) and **USD** (fixed, also the card price). XLM and USDC are computed from the USD price at the live rate when the quote is made and locked for 60 s.

## Built in phase 3

- `@bandcoin/chain`: `buildQuote` (pure, exact bigint stroop math), the classic purchase, issuer and storage setup, transfer/gift, platform payment, royalty batches, `nft_oz` and `bounty_escrow` calls, `verifyTransaction`, the Stellar error mapping, and `server/` (env config, Horizon, live rates, AES-GCM secrets, Soroban prepare with treasury auth signing).
- `@bandcoin/api`: the order state machine, the purchase service (`quote → start → submit / cancel`, plus `confirm` for the worker), the `order` router, and Square card charge and refund.
- The platform fee is `AppSetting.platformFeeBps` (2.5 %), added on top of the price in every currency. On a resale the royalty comes out of the seller's share.
- An order's `txHash` is set when the transaction is built. Signatures don't change the hash, so `submit` only accepts that exact transaction.
- Not yet: contract-NFT checkout (the builders exist; the service comes with the item page in phase 4), gifts, vanity and studio orders (same flow, phase 4/5/7).

## Price breakdown (one `PriceBreakdown` component, used everywhere money moves)

```
Item price        2 × 10 BANDCOIN        20.00 BANDCOIN
Platform fee      2.5 %                   0.50 BANDCOIN
Trustline         first time only         0.50 XLM   (reserve, refundable)
Network fee                               0.00001 XLM
─────────────────────────────────────────────────────
You pay                                  20.50 BANDCOIN + 0.50001 XLM
Your balance                             34.20 BANDCOIN ✓   1.20 XLM ✓
```

If short: `Your balance 12.00 BANDCOIN — 8.50 short` in the error color, and the Buy button becomes "Add funds".

The server computes the quote (`quote.forPurchase`) and the client only displays it. The same quote id is signed, so the price can't change between showing and paying (the quote expires after 60 s).

## `@bandcoin/chain`: all transaction code in one package

```
packages/chain/src/
├─ network.ts          one Horizon/RPC client, passphrase, fees
├─ accounts/           load balances, trustline checks, create/fund account
├─ classic/            build classic-token XDRs: issue artist token, mint item, purchase, gift, transfer
├─ nft/                nft_oz contract calls: mint edition, buy, list, delist, transfer, unlock
├─ escrow/             bounty_escrow: fund, pay winner, refund
├─ studio-coin/        top-up, withdraw, swap Bandcoin → studio coin
├─ royalty/            batched payouts (≤100 ops per tx)
├─ quote/              price breakdown math (pure, fully unit-tested)
└─ server/             signing with platform/custodial keys, submit, wait for result
```

- Builders are pure: `buildItemPurchaseXdr(input) → { xdr, quote }`. They don't touch the database.
- Routers never build transactions themselves. They call a **service** (`purchaseService.start`, `purchaseService.confirm`), which uses `chain` plus `db`.
- Each Stellar error is mapped to an `AppError` code (`STELLAR_UNDERFUNDED`, `STELLAR_TRUSTLINE_MISSING`…) so the UI shows a plain message.

## Order state machine (one flow for every purchase)

```
QUOTED → AWAITING_SIGNATURE → SUBMITTED → CONFIRMED → DELIVERED
                ↘ CANCELED      ↘ FAILED
```

- `txHash` is unique, so the same transaction can't be counted twice.
- `confirm` verifies the transaction on Horizon (amounts, destination, memo = order id) before writing `Ownership`.
- The worker re-checks any `SUBMITTED` orders older than 2 minutes (reconciliation).
- Card checkout (Square) follows the same states, with `paymentId` in place of `txHash`.

## The sign flow, in the UI (`useTransaction` hook + toast)

| Step | Wallet user                                                             | Custodial user                                                       |
| ---- | ----------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1    | Buy panel shows the breakdown, then the user presses **Pay**            | same                                                                 |
| 2    | Toast: "Confirm in Freighter…"                                          | Toast: "Sending 20.50 BANDCOIN in 5… **Cancel**" with a progress bar |
| 3    | Wallet popup (Cancel there = order `CANCELED`)                          | Cancel within 5 s = order `CANCELED`, nothing signed                 |
| 4    | Toast: "Submitting…"                                                    | same                                                                 |
| 5    | Toast: "Done: you own 2 × Song name" with **View** and an explorer link | same                                                                 |
| ✗    | Toast in plain words + **Try again**                                    | same                                                                 |

One toast stays and updates through all steps (no stacks of toasts). The same hook covers every money action: buy, list, gift, bounty fund, vanity renewal, studio top-up and royalty payout.
