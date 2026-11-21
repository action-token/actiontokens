# 37 · Subscribe in artist lists

**Status: built 2026-11-13 (not committed).**

Subscribe is only on an artist's own page. This puts it on the artist lists too.

## How bandfan did it (read 2026-11-13)

Only the AR artists page (`pages/action/artists/index.tsx`) had it: every row showed Follow (free)
and a member button (the paid subscribe, which opened the fan-token trustline). The web lists
(`post/trending-sidebar.tsx`, `post/followed-creator.tsx`) had Follow or Unfollow only.

## Action Tokens today

| Where                                  | Follow | Subscribe            |
| -------------------------------------- | ------ | -------------------- |
| Fan app, artist page                   | Yes    | Yes, after following |
| Fan app, Artists page cards            | Yes    | No                   |
| Fan app, feed "suggested artists" rows | Yes    | No                   |
| AR app, artist page                    | Yes    | Yes, after following |
| AR app, Artists list                   | Yes    | No                   |

Subscribing means opening a trustline to the artist's fan token, paid in ACTION, XLM, USDC or by
card (plan 33). A follow row records it (`Follow.isTemporary = false`).

## Decisions (your answers, 2026-11-13)

| Question             | Answer                                                     |
| -------------------- | ---------------------------------------------------------- |
| Which lists          | The AR Artists list and the fan app's Artists page cards   |
| When Subscribe shows | After following, and only for artists who have a fan token |

The feed's "suggested artists" rows stay Follow only.

## What gets built

### API (`packages/api`)

- `artist.directory` (the fan Artists page) also returns, per artist, `id` and `subscribed` (the
  viewer's follow row is a subscriber's). It already returns `tokenCode` and `following`.
- The AR list needs nothing: `artist.list` already returns `followed`, `subscribed` and `fanToken`.

### Fan app, Artists page cards

- `FollowButton` in its compact form can also show Subscribe: a small button beside Follow, in the
  card's button row, when the fan follows, isn't subscribed, and the artist has a fan token.
- It opens the same price dialog as the artist page (`HoldTokenDialog`): the four ways to pay, the
  breakdown, the usual toast. Afterwards the card's button reads "Subscribed".
- Callers that don't pass the token (the feed's suggested rows) keep Follow only.

### AR app, Artists list

- Each row gets a Subscribe button under the same rule as the AR artist page. It opens the existing
  `SubscribeSheet` for that artist. A subscribed row's button reads "Subscribed", as on the page.
- Signed out, the button asks to sign in first, like Follow.

## Tests

- API: the directory returns `id` and `subscribed` for a follower, a subscriber and a signed-out
  viewer.
- `pnpm typecheck && pnpm lint && pnpm test`.

## Not in this plan

- Subscribe in the feed's suggested-artists rows.
- Cancelling a subscription from a list.

## Built (2026-11-13)

- API: `artistDirectory` (`services/feed/sidebar.ts`) returns `id` and `subscribed`.
- Fan app: `FollowButton` shows a compact Subscribe when it's given the token; `ArtistCard` passes it.
- AR app: `artists/page.tsx` rows show Subscribe under Follow and open `SubscribeSheet`.
- Tests: `feed-sidebar.test.ts` covers a follower and a subscriber.
- Not checked in a browser or on a phone.
