# 21 · Resale: holders list their own copies

Status: **answered 2026-11-05, building** (both halves together).

Progress: classic copies, backend done (`e36b299`, with a testnet run script) and now the fan screens (item page
"Sell your copies", `/selling` with listings, change price, take back, and sold history). **Still to build:** NFT editions
(list, cancel and reprice through the contract, my listings and sold history for them, the worker check that a listed
edition is still owned by the seller), then a testnet run and a signed-in browser check of both.

## Why

The old manage pages (`/nft/manage/[id]`, `/smart-contract/manage/[id]`) let a holder list one or
several copies for sale, set a BANDCOIN and a USD price, change it, cancel it, and see what happened
on chain. The new apps can **buy** a resale copy (item page: pick a seller, quote with the royalty
out of the seller's share, 2.5% platform fee on top) but a holder can't **list** one.

Rules already decided (resale decisions, 2026-10-29): both copy kinds; any BANDCOIN and any USD price,
no floor or cap, several copies at once; XLM and USDC follow the USD price at the live rate; fees
unchanged (buyer pays 2.5% on top, the artist's royalty comes out of the seller's share); the seller
sees their net before listing; only copies you actually hold can be listed; selling and buying look
and work the same as a primary sale.

## Correction (2026-11-05): NFT resale needs a buy side too

The paragraph below said the new apps can already buy a resale NFT copy. They cannot: `loadNftSale` refuses any
listing that is not `PRIMARY`, and nothing calls `buildNftBuyListed`. Only classic copies can be bought from a
resale listing. So NFT edition resale is two pieces, not one: **list / cancel / reprice** (seller) and **buy a listed
copy** (`buy` / `buy_batch` with the treasury co-signing, royalty and fee as the contract pays them, the copy and its
unlocks moving to the buyer in the database, card path as for a primary NFT sale). The builders for all of these exist
in `@bandcoin/chain`; the services, router, screens and a testnet run do not.

## What already exists

- Buying a resale NFT edition and a resale classic copy (quote, order, signatures).
- `Listing` rows of kind `RESALE` (an NFT edition's listing has `editionId`).
- The contract builders `buildNftList`, `buildNftCancelListing`, `buildNftTransfer`. The contract is
  never changed.

## Phase A: NFT editions (the contract does the selling)

1. **Quote the net**: given an edition and the prices, show the seller what they get after the
   artist's royalty (the buyer's 2.5% is on top, so it doesn't reduce the seller).
2. **List** one or several editions (`list` on the contract, batch like the old app): a transaction
   the seller signs, then a `RESALE` listing row per edition. The order flow is the same as every
   other order: quote, sign (wallet, or the custodial countdown), submit, finish; no payment retries.
3. **Change the price / cancel**: cancel on the contract, then list again at the new price (the contract
   has no edit; the old app did the same).
4. **My listings** and **sold history** (who bought, for how much, the tx), on the item page for
   holders and in the wallet.
5. **Keep the database true**: the worker re-checks a listing's edition is still owned by the seller
   (a transfer or sale outside Bandcoin ends the listing).
6. Tests per step, a real testnet run (`testnet:resale`), a browser check.

## Phase B: classic token copies (needs a place to keep them for sale)

A classic copy is a plain token in the seller's wallet; a sale has to pay the seller and move one copy
from them, and the buyer's transaction can't take a copy out of the seller's wallet without the
seller signing. The old app solved this with a **fan storage account**: the seller moves copies
into a storage account Bandcoin holds the key for (about 1 XLM to open, once), and sales are paid out
of it, exactly like an artist's storage. So:

1. Open a fan storage account (the seller pays the XLM once, same flow as an artist's storage).
2. **List**: move N copies into storage and create the listing (one signed transaction).
3. **Sell** from storage (the existing "from stock" delivery), pay the seller out of the proceeds.
4. **Cancel / change price**: move the unsold copies back to the seller, then relist.
5. My listings and sold history as in phase A.

This is the larger half: a new account type, new money movements, and refunds if a step fails.

## Questions for you

1. **Order**: build NFT editions first (smaller, the contract already does the work) and classic copies
   after? Recommended: yes.
2. **Fan storage for classic copies**: the seller pays ~1 XLM once to open storage, as in the old app.
   Is that still what you want?
3. **Anything new**: a seller fee? (The decision says no. Keep fees as they are?)

## Your answers (2026-11-05)

1. **Order**: both together (NFT editions and classic copies in one build).
2. **Fan storage for classic copies**: the seller pays the ~1 XLM once, shown in the price breakdown before they
   confirm. (Artists differ: the platform opens their storage at approval, plan 15.)
3. **Fees**: unchanged. No seller fee; the buyer pays 2.5% on top; the royalty comes out of the seller's share.

## What the NFT contract does (read 2026-11-05, contract unchanged)

Read from `contracts/nft_oz/src/lib.rs` in the old repo. **The contract is not changed.**

- **List**: `list(seller, token_id, prices)` and `list_batch` (up to 20 tokens, one price grid). Only the seller
  signs. The prices are a list of `(payment token, price)`: 1 to a small maximum, each above zero, no repeats. Nothing
  else is required of them, so the seller may offer any tokens. **Listing does not lock the copy**: the seller keeps it
  and can still transfer it.
- **Cancel**: `cancel_listing(seller, token_id)`, seller signs. There is no edit: changing a price is cancel, then list.
- **Buy**: `buy` / `buy_batch` (up to 20 tokens, one payment token). The **buyer signs and the treasury co-signs**; the
  seller does not sign at sale time. It refuses a buyer who is the seller (`SelfPurchase`) and a stale listing, where the
  seller no longer owns the copy (`ListingStale`).
- **Who gets what** (`compute_breakdown`): the buyer pays the listed price. Out of that, the platform fee goes to the
  treasury and the artist's royalty to the creator (none if the seller is the creator); **the seller gets the rest**.
  On top of the price the buyer pays the treasury the network fee. So the platform fee comes out of the **seller's
  share**, not on top of the buyer's price. This is how a primary NFT sale already works in the new app
  ("the contract takes the platform fee out of the creator's share; the buyer doesn't pay it").
- **Preview**: `sale_breakdown(token_id, payment_token)` returns the exact split, so the quote can read it from the
  contract instead of recomputing it.
- **Edition and token**: one token is one copy with one owner, and each token has its own listing. In the database a
  resale listing is one row per `NftEdition` (`Listing.editionId` is unique), one copy each.

### What this means for the build

1. **Fees differ from classic copies.** Classic resale: the buyer pays 2.5% on top. NFT resale with this contract:
   the seller gets the price less the platform fee and the royalty, and the buyer pays only the price (and the network fee).
2. **One on-chain price per payment token.** The seller's BANDCOIN price goes on chain. The USD (card) price stays in
   the database and is only the card charge; the treasury sends the BANDCOIN first, as in a primary card sale.
3. **Stale listings are normal**, since a listed copy isn't locked. The worker must end a listing when the seller no
   longer owns the copy, and the buy must handle `ListingStale` with a plain message.
4. **Moving a copy** (database): ownership, the copy's locked-content unlocks and any unlock pins move to the buyer,
   as `moveUnlockPins` does for a gift.
