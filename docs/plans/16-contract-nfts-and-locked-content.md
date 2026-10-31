# Plan 16 — Contract NFTs and locked content, the old way

Replaces plan 14 step 4 and carries all of it (create as a database save,
registration at the first sale, edit page, fan checkout), and adds bandfan's
full locked content feature (main: `artist/smart-contract/create`,
`smart-contract/[id]`, `locked-media-*`, `unlock-*`, `nft.unlockStatus`,
`game.consumePin` → `unlock_item_for`).

## Decisions

| Question | Answer |
| --- | --- |
| Order | One plan: contract NFT buying and locked content together, in steps. |
| Editing locked content | As bandfan: fixed once created; the edit page shows it read-only. |
| On-chain unlock fee | The platform (treasury, the contract's unlock authority) signs and pays, as before. The fan signs nothing. |
| Unlock radius | The artist chooses per locked item, 10–1000 m, 50 m by default. |

## What bandcoin has today

- Tables: `LockedContent`, `UnlockRule`, `UnlockPoint`, `LockedContentRedeem`,
  and on `Pin`: `restrictedToUserId`, `unlockEditionId`,
  `unlockLockedContentId`, `onChainUnlockedAt`, `onChainUnlockTxHash`.
- The AR app already hides and refuses a pin restricted to someone else, and
  checks distance on the server (bandfan didn't).
- Chain builders for `register_edition`, `buy_edition`, `update_edition`.
- Missing: everything else below. `NFT_CHECKOUT_OPEN` is false; nothing buys
  a contract NFT yet.

## 1. Create with locked content (artist)

- The contract NFT form gets a **Locked content** section (open, like every
  form): up to 20 items, each Song / Image / Video / Link, a label (≤80), a
  file upload or a link, and an optional **unlock condition**: places on a
  map (click, search, or paste "lat, lng"; up to 20) and a radius.
- At least one item is required (as main). Saving is blocked while an item
  with the condition on has no places.
- Saved with each item's `chainIndex` (its first position, never changed).
- The edit page lists the items and their places read-only.
- Create stays a database save; the artist-pays-to-register step goes away.

## 2. Fan checkout for contract NFTs

- Wallet, custodial (5-second countdown) and card, price breakdown first,
  quantity as other items. The first sale registers the edition
  (`register_edition`, treasury as price authority), then the buyer's
  `buy_edition`. Opens `NFT_CHECKOUT_OPEN`.
- Each copy bought is recorded as an `NftEdition` owned by the buyer.
- No retries on any payment step.

## 3. Unlock pins per copy

- After a purchase, for each copy × each item with a condition: one private
  pin (`restrictedToUserId` = owner, `unlockEditionId`,
  `unlockLockedContentId`, one spot per place, collect each spot separately,
  the item's radius, approved, five years long). Missing ones are made on
  demand when the owner opens the item (as main's self-heal).
- A gift or resale moves the pins to the new owner; progress stays with the
  copy (as main).

## 4. What owners see (fan app)

- The item page shows, before buying, what's locked and where the places are
  (never the links).
- Owners see each copy's progress ("2 of 3 places visited") and the content
  once unlocked: songs in the player, images and videos in a viewer, links
  opened. Items without a condition are open to every owner at once.
- Links come only from one owner-only endpoint; nothing else returns them.
- A "locked content" list in browse (main's `listGated`).

## 5. Unlocking on the blockchain

- When an owner collects the last place of an item, the server calls
  `unlock_item_for(token, chainIndex)` signed by the treasury and records the
  hash. A failure is logged and leaves the content unlocked in the app (as
  main); the worker tries again later, since this isn't a payment.
- The worker keeps unlock records alive (`keep_unlocked_alive`), as main's
  keep-alive job.
- The owner sees "Recorded on Stellar" with the transaction link.

## 6. Redeem codes

- Each copy × each item gets a door code, shown to the owner only once the
  item is unlocked; it stays with the copy when it changes hands.
- The artist redeem page looks up and redeems these codes, and refuses a code
  whose item is still locked.

## 7. Bringing bandfan's data over

- The legacy migration copies locked media, unlock rules and places, content
  codes and the unlock pin groups, so existing owners keep their progress.

## Order of work

1 → 2 → 3 → 4 → 5 → 6 → 7, then plan 14 step 3 (Non Stellar Items) and
step 5 (Sell Page Assets). Each step: tests first, Safari check, every
mutation logged, committed separately.

## Risks

- **Links must never leak:** one owner-only endpoint; tests that every other
  item query leaves `url` out.
- **Treasury signs unlocks:** the server only ever signs `unlock_item_for`
  for a copy whose owner really collected every place, checked in the
  database first.
- **Testnet first:** registration, buying and unlocking run on testnet before
  anything else.
