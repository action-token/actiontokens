# 10 · apps/ar build order

Phase 6, started early on 2026-10-29 (the fan-app Wallet/Settings work pauses until AR is done).
Look and feel: Wadzzo AR (phone frame, LUT-tinted 3D Mapbox, boot sequence, arcade feel) in Bandcoin colours.
Map token: Bandcoin's own `NEXT_PUBLIC_MAPBOX_API`.

## Rules (user, 2026-10-29)

- **Collect, then claim.** Walking up to a pin (geofence, server-checked) or scanning its QR only writes a `PinClaim`. "Claim to wallet" comes later.
- **Claim cost.** No platform fee. The fan is the transaction source and pays the network fee, plus the 0.5 XLM trustline reserve if they need one. The platform never fronts it.
- **Reward stock.** Send from the artist's storage account first, then lazy-mint from the artist's issuer, up to the pin's claim limit.
- **Bounties.** Full bounty pages inside AR, built on the same `bounty` router as the fan app. Escrow parity rules still apply.
- **No `/api/mobile`.** AR uses tRPC only.

## Stages (each one: tests, typecheck/lint, Safari check, one commit)

| #   | Stage              | Contents                                                                                                                                                                                              |
| --- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Scaffold           | `apps/ar` (Next 16, port 3002, shared sign-in), `packages/ar-core` (geo, rarity, types), `root-ar.ts`, shell (device frame, status bar, bottom tabs, boot sequence), arcade theme in Bandcoin colours |
| 2   | Map                | Mapbox canvas, pin markers and clusters, search and filters, pin sheet, nearby strip, directions page. API: `pin.list/search/byId/byArtist`                                                           |
| 3   | AR + collect       | Camera permission gate, AR scene (2D + WebGL), photo frame, `pin.collect` (geofence) and `pin.collectByQr`, QR scanner, celebration                                                                   |
| 4   | Collection + claim | `/collection` and its detail view, redeem codes, `claim.forPin/quote/prepare/submit` (custodial countdown or wallet signing), chain builder in `@bandcoin/chain`                                      |
| 5   | Artists + profile  | Artist list and page, follow (the same as the fan app), profile                                                                                                                                       |
| 6   | Bounties           | `/bounty` list and detail inside AR, reusing `bounty` router procedures                                                                                                                               |
| 7   | Extras             | Events + RSVP + comments, announcements, murals + coins (scan, ledger), embeddable map with daily stats                                                                                               |

Pins are created in the artist portal (phase 5). Until then, AR runs on seeded demo pins.
