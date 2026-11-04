# 21 · Resale: holders list their own copies

Status: **plan, waiting for your answers** (2026-11-05). Not built.

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
