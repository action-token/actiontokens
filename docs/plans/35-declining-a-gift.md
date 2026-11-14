# 35 · Declining a pending gift

**Status: built 2026-11-13 (not committed; migration not applied).**

A fan can say no to a gift that is waiting for them.

## How bandfan did it (read 2026-11-13)

It effectively had no decline. `declineClaimBalance` (`routers/walletBalance/acc.ts`) existed, but no
button called it: the pending list (`components/wallet-balance/pending-asset.tsx`) showed only "CLAIM
TOKENS". It also used `clawbackClaimableBalance`, which only a token's issuer can run, so a fan's
attempt would always have been refused.

## What Stellar allows

A receiver can't delete a waiting gift. They can leave it or claim it. So declining can't remove
anything from the network.

## Decisions (your answers, 2026-11-13)

| Question                      | Answer                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------- |
| How Decline works             | Hide it: free, the tokens keep waiting, the sender can take them back (plan 34) |
| What the sender sees          | A "Declined" label; Take back stays available; no notification                  |
| Can the fan change their mind | Yes: declined gifts stay listed with Accept until the sender takes them back    |

## What gets built

### Database (`packages/db`)

- New table `declined_gifts`: `userId`, `balanceId`, `createdAt`; one row per fan and gift; indexed
  by `balanceId` so a sender's list can look it up.
- Migration `20261113100000_declined_gifts` (additive). **You run it:**
  `pnpm --filter @bandcoin/db migrate:deploy`.

### API (`packages/api`)

- New `services/gifts/decline.ts`, on the `wallet` router:
  - `declineGift`: the balance must really be waiting for this fan (checked on the network). Saves
    the row. Declining twice is fine.
  - `undoDecline`: removes the row.
- `wallet.gifts` rows carry `declined: boolean`. Accepting a declined gift works as before and
  clears the row.
- `wallet.sentWaiting` and the artist's `gifts.sent` rows carry `declined: boolean` (someone the
  balance is waiting for declined it).
- Every mutation is activity-logged. Errors are `AppError` with an `ErrorCodes` code.
- Rows for gifts that are gone (accepted or taken back) are harmless: lists are built from what is
  on the network, so they never show. Taking a gift back deletes its rows.

### Fan app and portal wallet page (Pending gifts)

- Each waiting gift gets a "Decline" button (ghost style) beside "Accept". Declining needs no
  signature and no toast steps; the row moves straight away.
- The count badge counts only gifts not declined.
- Under the list, a "Declined" group shows declined gifts, muted, each with "Accept" (which works
  as usual) and "Put back" (undo).

### Senders

- Fan app and portal "Sent, waiting": a "Declined" badge on the row.
- Portal Gifts › Sent: "Declined" replaces "Waiting to be accepted"; Take back stays.

## Tests

- API: decline only a gift waiting for you (not your own send, not an unknown balance); declining
  twice; undo; the `declined` flag on all three lists; accept and take-back clear the row.
- `pnpm typecheck && pnpm lint && pnpm test`.

## Not in this plan

- Sending the tokens back on the network when declining.
- A notification to the sender.

## Built (2026-11-13)

- Database: `DeclinedGift` in `schema/market.prisma`; migration `20261113100000_declined_gifts`
  written, **not applied**.
- API: `services/gifts/decline.ts` (`wallet.declineGift`, `wallet.undoDecline`); `declined` on
  `wallet.gifts`, `wallet.sentWaiting` and the artist's `gifts.sent`. Accepting or taking back a gift
  deletes its rows.
- Fan app and portal wallet page: Decline beside Accept, a "Declined" group with Put back and Accept,
  and a "Declined" badge in "Sent, waiting".
- Portal Gifts › Sent: "Declined" in place of "Waiting to be accepted".
- Tests: `gift-decline.test.ts` (5).
- Not checked in a browser. Smart-contract NFT gifts are not part of this: they never wait.
