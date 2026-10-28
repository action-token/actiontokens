# 05 · API (tRPC)

`packages/api/src/`
```
context.ts         session, db, ip, requestId
procedures.ts      publicProcedure, authedProcedure, artistProcedure, adminProcedure
access/            canViewItem, canStreamFull, tierStatus (one place for all gating rules)
services/          business logic, used by routers and worker: purchase, ownership, playback, pin-claim, bounty, royalty, vanity, studio-ledger, notification
routers/
  shared/          item, artist, music, user, notification, upload (used by several apps)
  app/             market, order, collection, playlist, profile, bounty (fan side)
  artist/          catalog, store, membership, pin, hotspot, bounty-admin, post, page-builder, domain, royalty, settings
  admin/           artists, users, pins, bounties, fees, settings
  ar/              nearby, claim, collection
  studio/          balance, generate, agent, stem-project
root-app.ts · root-artist.ts · root-ar.ts · root-studio.ts   one router per app (each app only gets what it uses)
```

## Rules

- Procedures are named verb + noun: `item.getBySlug`, `order.create`, `order.confirm`, `pin.claim`, `generation.start`.
- Reads that public pages need are `publicProcedure` (browsing and previews work without login). Everything that changes data needs sign-in.
- Every list is paginated by cursor (`limit` ≤ 50).
- Inputs are Zod schemas from `@bandcoin/schemas`, so forms use the same ones.
- Gating is always decided on the server (`access/`). The full media URL is only signed for owners.
- **Activity logging:** every `mutation` passes through an `activityLog` middleware that writes an `ActivityLog` row after it finishes, whether it succeeded or failed, with redacted input. Services can attach `target`, `txHash` and `amount` through `ctx.activity.set(...)`. Worker jobs log as `SYSTEM`. A test fails if any mutation procedure skips the middleware.
- Webhooks (Square, Facebook) and file routes are Next route handlers in the app that owns them, and they call services.
