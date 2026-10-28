# Bandcoin monorepo: restructure plan

**Status: waiting for your approval. No code is written until you confirm.**

Bandcoin is a music NFT platform. Fans buy and sell music and collectibles, collect rewards by walking to AR pins, and complete bounties. Artists run their page, items, pins and memberships from an artist portal, and use AI tools in Studio, paid with studio coins.

This plan rebuilds `bandfan` (one Next 14 Pages Router app, about 150k lines, 88 tables) as a new Turborepo at `/Volumes/Data/Projects/bandcoin`. It is shaped like `wadzzo`, keeps every core feature, and uses a clean schema, clear names, separate transaction code and a new design.

## Decisions you made

| Topic | Decision |
|---|---|
| Repo | New standalone repo `/Volumes/Data/Projects/bandcoin`. Wadzzo's shared packages are copied in as `@bandcoin/*`, with no runtime link to wadzzo. |
| Apps | `app` (fans), `artist` (artist portal plus `/admin`), `ar` (pin collecting), `studio` (AI tools), `worker` (background jobs) |
| Database | Clean new schema in the **new** Neon dev DB. A one-time script copies data from the old dev DB (`old-bandcoin`, read only). Production is not touched. |
| Items | One catalog with two chain types: classic Stellar tokens and Soroban `nft_oz` NFTs are both an **Item**, with one marketplace, one Order and one Ownership. |
| Studio | AI text, image, music and video generation, the pin/hotspot AI agent and the stem audio editor |
| Studio coin | A real Stellar token. The artist **tops up** once on-chain; each generation deducts instantly from a ledgered deposit; failed jobs are refunded; unused balance can be withdrawn on-chain. Bought by Bandcoin swap, USDC/XLM, card, or on the Stellar DEX. |
| Kept extras | Artist page builder, custom domains, Facebook post sync, Last.fm music bounties |
| Mobile | No mobile app depends on `/api/game`, so it is dropped. AR uses tRPC. |
| Jobs | Everything runs in `apps/worker` (moved into the repo instead of a submodule). Trigger.dev and QStash are removed. |
| Transactions | **No automatic conversion.** You pay with the asset you choose. If it's short, we show exactly how much is missing. A clear price breakdown always. Custodial users get a **cancellable countdown toast** before anything is signed. |
| Activity log | Every user and artist mutation (plus sign-ins) is logged automatically, with secrets redacted. Admins monitor it at `/admin/activity`, see a timeline per person, and get alerts for suspicious patterns. |
| Theme | New music-first theme, dark first, with light mode. **One preview page goes to you for approval before it's used anywhere.** |
| Rules carried over | Everything in `bandfan/docs/plans` 00–17 that you confirmed (preview gating, playlists, quantity buy, guest card checkout, tiers, vanity billing, royalty payouts, SEO, no file over 1000 lines, tests with every change) |

## Plan files

| # | File | What it covers |
|---|---|---|
| 01 | [01-monorepo-layout.md](01-monorepo-layout.md) | Apps, packages, folder rules, naming conventions, stack versions |
| 02 | [02-schema.md](02-schema.md) | The new database: every table, its old name, and why it changed |
| 03 | [03-data-migration.md](03-data-migration.md) | Copying the old dev DB into the new one, with checks |
| 04 | [04-transactions.md](04-transactions.md) | `@bandcoin/chain`, the order flow, price breakdown, the cancel toast, no conversion |
| 05 | [05-api.md](05-api.md) | tRPC layout, procedure naming, services, access rules |
| 06 | [06-design-system.md](06-design-system.md) | Theme, fonts, boot screen, loading, motion, components |
| 07 | [07-apps.md](07-apps.md) | Route maps for app, artist (+admin), ar, studio, worker |
| 08 | [08-studio-coin.md](08-studio-coin.md) | Studio coin token, top-up, ledger, pricing per generation |
| 09 | [09-quality-and-delivery.md](09-quality-and-delivery.md) | Tests, CI, env files, deploys, cutover |

## Phases

Each phase ends with something you can open and check. Phases marked ✋ stop until you approve.

| Phase | Work | You check |
|---|---|---|
| 0 ✅ | Scaffold the Turborepo, tooling and copied packages (`@bandcoin/wallet`, `stellar`, `auth`, `storage`, `errors`, `utils`, `ui`) | `pnpm typecheck` and `pnpm test` green |
| 1 ✅ | Design system plus **one preview page** (colors, fonts, buttons, cards, item card, player bar, buy panel, toasts, boot screen, skeletons) in dark and light | You approve the look |
| 2 ✅ | New Prisma schema in the new dev DB, plus the migration script with a dry-run report | You approve the schema and counts |
| 3 ✅ | `@bandcoin/chain` (transaction builders) and `@bandcoin/api` foundation (context, procedures, services) | Tests for every builder and the order state machine |
| 4 | `apps/app` (home, music, marketplace, item page, buy, collections, playlists, profiles, bounties, artist pages) | Click-through in Safari, desktop and 390px, both themes |
| 5 | `apps/artist` (dashboard, items, music, store, memberships, pins and map, bounties, posts, page builder, domains, royalty, settings, `/admin`) | Same |
| 6 | `apps/ar` (map, nearby pins, AR camera, claim, collection) | On a phone |
| 7 | `apps/studio` (studio coin top-up, generators, pin agent, stem editor) | Same |
| 8 | `apps/worker` (transcode, AI jobs, hotspot drops, royalty batches, reconciliation) | Jobs run against dev |
| 9 | Feature parity checklist against bandfan, then a cutover plan for production (separate approval) | Checklist all ✓ |

## Still open (I'll ask when we get there)

1. Domains for the five apps (placeholders: `bandcoin.io`, `artist.`, `ar.`, `studio.`, `worker.`).
2. Studio coin code, issuer and supply, and price per generation type (see 08).
4. How long the cancel toast counts down before sending (default 5 s).
