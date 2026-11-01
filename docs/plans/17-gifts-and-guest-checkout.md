# 17 — Collectible gifts and guest checkout

These come from the old app's `main` branch: the artist "Collectible" gift
(commit 0c43cbc0) and guest card checkout (commit 364ecd0a).

## Decisions (asked 2026-11-01)

| Question                         | Answer                                                                                                         |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Who can gift an NFT copy         | Artists only, from the Gifts page, as before                                                                   |
| Gift to an email with no account | Create the account (Firebase + custodial wallet) when the artist sends, as before                              |
| Email the recipient              | Yes, through SMTP (nodemailer). If the SMTP settings are missing, the gift still goes through without an email |
| Guest checkout scope             | Every card purchase: classic items, music, page asset bundles and contract NFTs                                |

## Shared: an account for an email

- `resolveAccountForEmail(email)` in packages/wallet/server and packages/auth:
  1. Find the Firebase user by email, or create one.
  2. Get its custodial key the same way sign-in does (`custodialPublicKey`).
  3. Create or find the user row (`findOrCreateUser`).
- `lookupAccountForEmail(email)` only reads the local database. Quotes and
  previews use it, because asking the key service can open an account as a
  side effect.
- Only two things call `resolveAccountForEmail`: sending a gift, and a guest
  order after its card has been charged.

## Part A — Collectible gifts (artist)

- **Chain:** add a `transfer(from, to, token_id)` builder to
  packages/chain/src/nft/calls.ts (nft_oz has it; the old app used it).
- **Schema:** add `OrderKind.NFT_GIFT` (migration), so every gift is an
  order: logged, priced first and reconciled by the worker.
- **New file services/artist/collectible-gifts.ts:**
  - `giftableCopies`: copies of contract NFTs the artist's own account owns,
    grouped by NFT. Each shows its unlock progress, and listed copies are
    marked.
  - `quote`, `start`, `submit` work like token gifts:
    - The recipient is a username, email or wallet (reuse `findRecipient`).
      An unknown email shows "We'll make an account for this email when you
      send", and `start` creates that account.
    - The artist pays the network fee in XLM, and the price is shown first.
    - Custodial artists get the 5-second countdown; wallet artists sign in
      their wallet.
  - `start` refuses some copies:
    - one listed for resale: "Take this copy off sale before gifting it."
    - a copy the artist no longer owns
    - a gift from the artist to themselves
  - `finish` (on confirm, and from the worker's reconcile) does three things:
    - sets the edition's owner to the recipient
    - moves the copy's unlock pins to the recipient (`moveUnlockPins`,
      already written)
    - leaves the door codes alone, since they already belong to the copy
- **UI:** the artist Gifts page gets a "Tokens / Collectible" choice; Tokens
  is today's form. The Collectible form has:
  - a copy picker
  - the recipient field
  - the price breakdown
  - one Send button
- **Email:** new services/email:
  - nodemailer, with `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and
    `MAIL_FROM`. I'll add the names only to `.env.example`; you fill in the
    values.
  - The gift email has the item, the sender, the copy's first door code,
    unlock progress and a sign-in link. A new account also gets "Sign in
    with Google/Apple, or use 'Forgot password' to set one."
  - It is sent once after the gift confirms. A failed send is logged and
    never retried.

## Part B — Guest checkout (every card purchase)

`Order.guestEmail` already exists, and `buyerId` is already optional.

- **Quote** (`order.guestQuote`, public): takes the item and quantity plus
  the email.
  - Priced from the local lookup only.
  - An email with no account, or one whose account isn't open on Stellar yet,
    is priced as a new account, with the opening cost shown as its own line.
- **Start** (`order.guestStart`, public, rate-limited): creates the order:
  - `buyerId` null, `guestEmail` set, `method` CARD
  - status QUOTED, with no transaction yet
- **Pay** (`order.guestPay`, public, rate-limited), in this order:
  1. Check the order is a guest order for that email, still QUOTED, and its
     quote hasn't expired.
  2. Charge the card.
  3. `resolveAccountForEmail` and set `buyerId`.
  4. Build the transaction for that account, sign it as custodial plus the
     platform keys, wrap it in a treasury fee bump, and submit. This is the
     same code as a signed-in card buyer, moved into shared helpers so it
     doesn't exist twice.
  5. Deliver.
  - If anything after the charge fails before submit (account, building,
    the price no longer matching), the order becomes FAILED and the card is
    refunded (`failOrder`). No retries.
  - For contract NFTs, the two steps (top-up, then buy) work the same as for
    signed-in card buyers. If the buy step fails, the BANDCOIN stays in the
    new account, as decided in plan 16.
- **UI:**
  - The buy panel for signed-out visitors shows "Pay by card" with an email
    field (other currencies still say "Sign in to pay with …").
  - The price is shown first, then the Square card form.
  - The success screen says "It's in the Bandcoin account for you@…: sign in
    with Google or Apple using that email, or use 'Forgot password' to set a
    password."
  - Pages that show the buy panel: item, NFT, music and artist page bundles.

## Steps

1. Account for an email: the resolve and lookup helpers, with tests.
2. Collectible gift server: transfer builder, NFT_GIFT migration, service,
   router, worker reconcile, tests and e2e.
3. Collectible gift UI on the artist Gifts page; check in Safari.
4. Gift email: services/email, the template, `.env.example` names, tests.
5. Guest checkout server: shared card-submit helpers, guest quote, start and
   pay for classic and NFT orders, rate limits, tests and e2e.
6. Guest checkout UI: the signed-out buy panel and the success screen; check
   in Safari.

## Risks

- **Money first, account second:** a guest's card is charged before their
  account exists. Every failure after that point must refund. The tests cover
  each one.
- **Accounts for strangers:** a gift or a paid guest order can create a
  Firebase account for any email. That only happens on a real gift or a
  charged card, never on a quote.
- **Abuse:** the guest endpoints are public, so they get rate limits
  (per IP and per email).
- **Not run here:** none of this has run on testnet.
