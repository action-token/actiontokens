# 23 · Followers and subscribers

Status: **decided 2026-11-05, building.**

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
  of BANDCOIN, which the line locks and the fan gets back if they remove it). Once they trust the token the button reads Subscribed.
- **Artist portal**: follower and subscriber counts.

## Not in scope

Comment and collect rules ("Who can comment / collect a post") keep their choices; Subscribers is for who can open.
