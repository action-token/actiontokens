# 34 · Gift take-back

**Status: built 2026-11-13 (not committed).**

A gift to someone who can't hold the token yet waits on Stellar until they accept it. This plan adds
the button to take a waiting gift back.

## How bandfan did it (read 2026-11-13)

It had no take-back. A waiting gift was a claimable balance with the fan as its only claimant
(`lib/stellar/fan/send_gift.ts`, `lib/stellar/walletBalance/acc.ts`), so it could never come back.

## Action Tokens today

A waiting gift has two claimants, the receiver and the sender, so either can claim it at any time
(`packages/chain/src/classic/transfer.ts`). There is no button for the sender. Plan 15 lists it as
"Not yet".

| Sent by                               | Second claimant              | Locked until claimed      |
| ------------------------------------- | ---------------------------- | ------------------------- |
| Artist: fan-token gift from storage   | The artist's storage account | 1 XLM, paid by the artist |
| Fan or artist: token sent from wallet | The sender's wallet          | 1 XLM of the sender's own |

NFT copy gifts go straight to the receiver and are not affected.

Two gaps in what is shown:

- A sender's own waiting send appears in their "Pending gifts" as a gift from themselves with an
  "Accept" button (`services/gifts/claim.ts` lists every balance the wallet can claim).
- The artist's "Sent gifts" list doesn't say which gifts are still waiting.

## Decisions (your answers, 2026-11-13)

| Question                           | Answer                                                           |
| ---------------------------------- | ---------------------------------------------------------------- |
| Who gets Take back                 | Artists (storage gifts) and fans (wallet sends)                  |
| The artist's 1 XLM                 | Paid back to the artist's wallet in the same transaction         |
| Fan wallet                         | A separate "Sent, waiting" list; own sends leave "Pending gifts" |
| Notify the person it was meant for | No                                                               |

Following from how the network already works, not new decisions: a gift can be taken back at any
time until it is accepted, and whoever takes it back pays the network fee from their wallet, as they
do for every other action.

## What gets built

### Chain (`packages/chain`)

- `claimableFor` also returns each balance's claimants, so "sent by me" (I made it) and "for me"
  (someone else made it) can be told apart, and the receiver named.
- `buildStorageTakeBack`: the artist's wallet is the source and pays the fee; storage claims the
  balance and pays the 1 XLM to the artist's wallet; storage co-signs.
- A wallet sender's take-back reuses `buildClaimGift` (it re-opens the trustline first if the sender
  closed it, 0.5 XLM of their reserve, shown before confirming).

### API (`packages/api`)

- `services/gifts/claim.ts`: `listGifts` leaves out balances the viewer made themselves.
- New `services/gifts/take-back.ts` (wallet sends), on the `wallet` router, so it serves the fan app
  and the portal's wallet page:
  - `sentWaiting`: who it is for, the amount, and what taking back costs.
  - `prepareTakeBack` / `submitTakeBack`: the same shape as accepting a gift. The balance is looked
    up on the network, never trusted from the request, and the transaction must be exactly the claim
    that was prepared. No ownership rows change, because sending didn't change any.
  - The matching SEND order is marked taken back, so wallet history says so.
- New `services/artist/gift-take-back.ts`, on the `gifts` router:
  - `sent` gains a state per token gift: `waiting`, `takenBack`, or neither (delivered).
    A waiting gift is matched to storage's balances by token, amount and receiver. Two identical
    waiting gifts are interchangeable, so they pair newest first.
  - `prepareTakeBack` / `submitTakeBack` by order id. Before the platform signs for storage, the
    transaction must be exactly: storage claims that balance, storage pays 1 XLM to the artist's
    wallet, nothing else. The order's gift details are marked taken back with the transaction hash.
- Every mutation is activity-logged. Errors are `AppError` with an `ErrorCodes` code.
- No database migration: the mark lives in the order's existing `breakdown` JSON.

### Fan app and portal wallet page

- New `sent-waiting.tsx` next to `gifts-to-claim.tsx` in both apps: a "Sent, waiting" panel in the
  same `WalletPanel` style, one row per send ("To @name · 25 LUNA"), with a "Take back" button. Hidden
  when there is nothing waiting.
- The usual toast: a countdown with Cancel for email/Google/Apple accounts, "Confirm in your wallet"
  for wallet extensions. The summary shows the cost first.

### Artist portal, Gifts › Sent

- A waiting row shows a "Waiting to be accepted" label and a "Take back" button; a taken-back row
  shows "Taken back". Other rows are unchanged.
- Take back runs through `useWalletPayment`-style steps with the summary "Take back 25 LUNA from
  Name. 1 XLM returns to your wallet."

## Tests

- Chain: `buildStorageTakeBack` operations and signers; `claimableFor` claimants.
- API: own sends hidden from Pending gifts; wallet take-back happy path, a balance already accepted,
  a tampered transaction, the re-opened trustline cost; artist take-back happy path, wrong artist,
  not waiting, a tampered transaction never signed by storage, identical gifts pairing, the order
  mark.
- `pnpm typecheck && pnpm lint && pnpm test`.

## Not in this plan

- Declining a pending gift (the receiver's side): the next item on the gap list.
- A time limit before a gift can be taken back.

## Built (2026-11-13)

- Chain: `claimableFor` returns `claimants`; `buildStorageTakeBack` in `classic/transfer.ts`.
- API: `services/gifts/take-back.ts` (`wallet.sentWaiting`, `prepareTakeBack`, `submitTakeBack`);
  `services/artist/gift-take-back.ts` (`gifts.prepareTakeBack`, `submitTakeBack`); `gifts.sent` rows
  carry `state`. `services/gifts/claim.ts` no longer lists or accepts the viewer's own sends as gifts
  (accepting one used to add an ownership row it shouldn't have).
- Fan app and portal wallet page: `sent-waiting.tsx`; the toast steps shared by accepting and taking
  back moved to `use-claim-flow.tsx`. A new send refreshes the list.
- Portal Gifts › Sent: "Waiting to be accepted" with Take back, and "Taken back".
- Wallet history: "Sent to … as a gift, then taken back".
- Tests: `gift-take-back.test.ts` (11), one more in chain `builders.test.ts`.
- Not run against testnet. Nothing was checked in a browser.
