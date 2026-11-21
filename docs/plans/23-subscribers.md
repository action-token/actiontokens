# 23 · Followers and subscribers

Status: **built 2026-11-05.** The `SUBSCRIBERS` migration (`20261105150000`) is applied to the dev database only.

## The rule (yours)

Following a brand (an artist) is free. If the fan also **trusts the brand's fan-token asset** (has a trustline to it,
whatever the balance), they are a **subscriber**. Without the trustline they are **just a follower**.

## Decided

- **How it's known**: the existing `Follow.isTemporary` flag, which came from the old app's `TemporalFollow` ("followed without a
  trustline yet"). `isTemporary = true` is a follower; `false` is a subscriber. The new app wrote `false` for every follow, so it meant
  nothing; it now means this. (No column rename, so legacy rows keep their meaning.) It is kept true to the chain by:
  checking the fan's own wallet when they follow or open an artist's page, setting it when a "hold the token" order completes, and a
  worker job that lists every holder of a trustline per fan token and fixes the rest.
- **Trust without following**: the fan becomes a follower and a subscriber (the follow is created).
- **Perks**: a new audience **Subscribers** for posts, stories and pins, between "Followers" and a membership tier. It is decided
  from the viewer's wallet (a trustline to the token), not from the saved flag, so it is never out of date.
- **Fan button**: Follow → Following (free, instant). A separate **Subscribe** action opens the existing price dialog (about 0.5 XLM
  of ACTION, which the line locks and the fan gets back if they remove it). Once they trust the token the button reads Subscribed.
- **Artist portal**: follower and subscriber counts.

## Not in scope

Comment and collect rules ("Who can comment / collect a post") first kept their choices, with Subscribers only for who can open. On 2026-11-05 you asked for Subscribers there too: "Who can comment" and "Who can collect" now offer it, meaning followers who trust the fan token (the post's lock still comes first). A fan who isn't one sees "Subscribe to X to comment." Migration `20261105190000_post_access_subscribers`.

## What was built

- **Rule**: `Follow.isTemporary` true = follower, false = subscriber (`services/feed/subscribe.ts`). Set when a fan follows (from their
  wallet), brought in line when they open an artist's page, set when a hold-token order completes (which also follows them), and fixed for
  everyone by the worker job `follows.sync` every 30 minutes (lists who trusts each fan token; follows of artists with no token are
  followers; a list too long to read in full never demotes anyone).
- **Unfollowing**: refused while the wallet still trusts the token (they would be followed again), with a message to remove the line.
- **Audience Subscribers** for posts, stories and pins (portal pickers, lock screens in the fan app, AR pin lock text, rarity "rare").
  Decided from the live wallet trustline, so a fan who just subscribed can open things at once.
- **Fan app**: Follow / Following / Subscribed, a separate Subscribe button that opens the price dialog, follower and subscriber counts.
- **Artist portal**: follower and subscriber counts on the profile header.
- **Not done**: the lists (Suggested artists, the Artists page) still show only Follow / Following; Subscribe is on the artist's page.
  Subscribing was not completed in the browser (it signs a real testnet
  transaction); the price dialog was checked.
