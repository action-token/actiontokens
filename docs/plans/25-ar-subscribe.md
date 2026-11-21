# 25 — Subscribe in the AR app

A subscriber is a follower whose wallet trusts the artist's fan token
(plan 23). The fan app has a Subscribe button and price dialog; the AR app only
had Follow, and a locked subscriber pin said "Subscribe to X to unlock" with no
way to do it. This brings the same Subscribe into AR.

## Decisions (2026-11-05)

- **Where:** next to Follow on the AR artist page, and on a locked subscriber
  pin's sheet on the map.
- **Follow first**, as in the fan app: Subscribe shows only once the fan
  follows. On a locked subscriber pin the sheet offers Follow first, then
  Subscribe.
- **Not enough ACTION:** an "Add ACTION" button opens the fan app's
  Recharge page. Recharge stays in the fan app.
- **Server:** a small AR `subscribe` router that only takes the fan-token
  order (`TOKEN_TRUST`). AR can't start card top-ups or XLM swaps.

## How it works

The fan-token order already exists (`services/recharge`): the quote prices the
0.5 XLM the line locks in ACTION, `start` builds the transaction, the fan
signs it (email/Google/Apple accounts get the usual countdown and the server
signs), `submit` co-signs and sends it, and the completed order marks the fan
a subscriber (`setSubscribed`).

### Server

- `routers/ar/subscribe.ts`: `quote`, `start`, `submit`, `cancel`, each for
  one `artistId`. `submit` and `cancel` refuse any order that isn't the
  viewer's `TOKEN_TRUST` order. No card input.
- `ArArtist` gains `subscribed` and `fanToken` (its code, or null). The list
  reads the saved flag; one artist's page checks the wallet
  (`syncViewerSubscription`), as the fan app's artist page does.
- `ArPin` gains `subscribe`: set on a pin locked only by the Subscribers rule,
  for a signed-in fan, when the artist has a fan token, with whether the fan
  follows them yet.

### AR app

- `SubscribeSheet` (bottom sheet): what subscribing means, the price lines,
  Subscribe / Not now, "Add ACTION" when short. Uses `useSignedTransaction`
  with the transaction toast.
- Artist page: a Subscribe button beside Following, "Subscribed" once done.
- Pin sheet: Follow (if not following) or Subscribe under the lock text. On
  success the pins reload and the pin unlocks.

## Tests

- AR subscribe router: only `TOKEN_TRUST`; refuses another kind of order on
  submit and cancel.
- AR artist: `subscribed` and `fanToken` on list and page.
- AR pins: `subscribe` set only for a locked subscriber pin, with `following`.

## Browser check (2026-11-05, dev, testnet)

AR artist page, Mira Okafor: Follow → Subscribe appeared → the sheet priced
0.5 XLM as 36.97 ACTION (with the 2% cushion and network fee) → Albedo
approved → "Subscribed. You now hold MIRA." → the page shows Subscribed and
the order is `DELIVERED`. The pin-sheet path wasn't clicked: dev has no
subscriber pins.
