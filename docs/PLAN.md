# ActionTokens: master plan (A to Z)

> **Status:** plan approved for drafting on 2026-11-19. Phase 0 has not started; this file is the only thing in the repo.
> **Owner decisions** are in §2 and the **decision log** in §20. **Progress** is tracked in §19.
> **New session?** Start at §0.
> **Strategy change (2026-11-20):** ActionTokens will be a **fork of the Bandcoin monorepo** plus the
> Actionverse-only features, not a from-scratch build. Read **[FORK-PLAN.md](FORK-PLAN.md)** first; it overrides
> this file's schema, API, migration and phase sections. Data safety, design system, homepage and cutover here still apply.

---

## Table of contents

0. [Session handoff: read this first](#0-session-handoff-read-this-first)
1. [What ActionTokens is](#1-what-actiontokens-is)
2. [Decisions](#2-decisions)
3. [Source codebases (legacy)](#3-source-codebases-legacy)
4. [Environment and data safety](#4-environment-and-data-safety)
5. [Stack](#5-stack)
6. [Monorepo layout and rules](#6-monorepo-layout-and-rules)
7. [Domain language](#7-domain-language)
8. [Database schema](#8-database-schema)
9. [Data migration](#9-data-migration)
10. [API](#10-api)
11. [Product UX: the ActionTokens identity](#11-product-ux-the-actiontokens-identity)
12. [Design system: neon-green phonk](#12-design-system-neon-green-phonk)
13. [Homepage: scroll-driven 3D video hero](#13-homepage-scroll-driven-3d-video-hero)
14. [Apps in detail](#14-apps-in-detail)
15. [Chain and contracts](#15-chain-and-contracts)
16. [Quality, CI and delivery](#16-quality-ci-and-delivery)
17. [Phases with task checklists](#17-phases-with-task-checklists)
18. [Cutover](#18-cutover)
19. [Progress tracker](#19-progress-tracker)
20. [Decision log and open questions](#20-decision-log-and-open-questions)
21. [Appendix A: legacy → new route map](#appendix-a-legacy--new-route-map)
22. [Appendix B: legacy code → new location map](#appendix-b-legacy-code--new-location-map)
23. [Appendix C: env key map](#appendix-c-env-key-map)

---

## 0. Session handoff: read this first

A new session continuing this work should:

1. Read this whole file. It is the source of truth; the chat history is not needed.
2. Read §19 (progress) to find the current phase, and the phase's checklist in §17.
3. Read `docs/plans/NN-*.md` for the current phase if it exists. Each phase writes its own detailed plan before work starts (§17 explains when).
4. Look at the reference repos only for what the checklist points to:
   - `/Volumes/Data/Projects/actionverse`: legacy main app (feature source of truth).
   - `/Volumes/Data/Projects/gallery-actiontokens`: legacy 3D museum (fork of actionverse).
   - `/Volumes/Data/Projects/bandcoin`: **engineering** reference only (monorepo setup, package boundaries, migration script pattern, worker pattern). Not a UI reference (§11).
5. Never write to a legacy database (§4). Never edit the legacy repos.
6. When a task is done, tick it in §17, update §19, and add any new decision to §20. Commit with a clear message.
7. Ask the owner before anything in §20 "Open questions" that blocks the current task.

### Hard rules (non-negotiable)

- **Production data is never erased or altered.** The legacy databases are read-only sources (§4.3).
- **ActionTokens has its own UI and UX.** Do not copy bandcoin screens, shell or components (§11).
- Secrets never go in git. Only `*.example` env files are committed.
- No file over 1000 lines. No `throw new Error` (use `AppError`). All transactions are built in `packages/chain`.

---

## 1. What ActionTokens is

A Stellar-based platform where **organizations** (brands, causes, artists, venues) issue **action tokens**, NFTs and rewards, and people **earn them by taking actions**: completing bounties, collecting pins in the real world through AR, joining communities, buying drops, and visiting 3D galleries.

It replaces three legacy codebases with one monorepo of five apps:

| App       | Domain                      | For                                                     |
| --------- | --------------------------- | ------------------------------------------------------- |
| `web`     | `app.action-tokens.com`     | Everyone: homepage, marketplace, bounties, communities, organizations, wallet |
| `org`     | `org.action-tokens.com`     | Organizations: their command center, plus `/admin` for platform admins |
| `ar`      | `ar.action-tokens.com`      | The real-world layer: map, pins, AR collect, QR, action-cam |
| `gallery` | `gallary.action-tokens.com` | 3D walkable museum per organization                     |
| `worker`  | internal                    | Background jobs                                         |

Bare `action-tokens.com` 301-redirects to `app.action-tokens.com`.

---

## 2. Decisions

All decided by the owner on 2026-11-19.

| Topic        | Decision |
| ------------ | -------- |
| Repo         | New repo at `/Volumes/Data/Projects/actiontokens`, fresh git history. Legacy repos untouched. |
| Structure    | Turborepo + pnpm workspaces with a version catalog, like bandcoin. |
| Organization | "Creator" is renamed **Organization** everywhere: code, DB, URLs, copy. |
| Data         | **Migrate all data** into a new, renamed schema. Production data is never erased (§4). |
| Env          | **Reuse actionverse's env values** for development and production for now. The owner replaces them later. The only exception is the database URL, where the new schema gets its own database (§4.2). |
| Dropped      | Christmas/seasonal assets, Beam (cards, reactions, comments, AR beam gallery), `/api/game`. |
| Kept         | Everything else, including music, Last.fm music bounties, Telegram, reward checker, action-cam, vibe-studio AI, agent, Square payments. |
| Gallery      | Its own app (`apps/gallery`); 3D engine in `packages/gallery-core`. |
| Look         | Neon-green phonk (§12). |
| UI/UX        | Unique to ActionTokens (§11). Bandcoin is the engineering reference only. |
| Domains      | `app.` / `org.` / `ar.` / `gallary.` `.action-tokens.com`. Auth cookie on `.action-tokens.com`. |

---

## 3. Source codebases (legacy)

### 3.1 `actionverse` (`/Volumes/Data/Projects/actionverse`)

- Next 14 **Pages Router**, React 18, tRPC 10, Prisma 5 (`db push`, no migrations), Tailwind 3 + shadcn, Zustand, Trigger.dev 3, QStash, Upstash Redis.
- About 146k lines of TS/TSX. **532 tRPC procedures** in `src/server/api/routers`. **90 Prisma models/enums** in `prisma/schema.prisma` (1829 lines).
- Oversized files to split: `pages/bounty/[id].tsx` (2563), `routers/nft.ts` (2478), `pages/organization/new-profile` (2192), `routers/bounty/bounty.ts` (2094), `components/widget/cover-profile-widget.tsx` (1827), `routers/maps/pin.ts` (1748), `pages/organization/create` (1702).
- Submodules: `package/connect_wallet` (wallet connect), `package/express-wadzzo` (Express task server: agent pipeline + pin creation, PM2).
- Contracts: `contracts/nft_oz` (1510-line lib.rs), `contracts/bounty_escrow` (405), with test snapshots.
- Jobs: `src/trigger/distribute.ts`, `quarter-reward.ts`, `status.ts`.
- Videos: `public/videos/Hand.mp4` (homepage master) and `theme-video.mp4` (near-identical encode).
- About 900 uncommitted changes in the working tree. Ask the owner to commit them before Phase 5 uses this repo as the reference.

### 3.2 `gallery-actiontokens` (`/Volumes/Data/Projects/gallery-actiontokens`)

- A trimmed fork of actionverse (same stack, a subset of the schema, same database). It adds:
  - `src/pages/museum/[id].tsx`, the museum page (dynamic import, no SSR).
  - `src/components/exhibition/`: `MuseumHallway.tsx` (1039 lines, R3F), `Painting.tsx`, `FramePreview.tsx`, `PhotoDescriptionPanel.tsx`, `PhotoDescEditor.tsx`, `CreatorInfoPanel.tsx`, `MusicController.tsx`.
  - `src/server/api/routers/gallery.ts` (551 lines).
  - `src/pages/settings.tsx` (1934 lines): the gallery editor.
  - Models: `CreatorGallery`, `GallerySlotOverride`, `GallerySlotLike`, `MuseumRoom`.

### 3.3 `bandcoin` (`/Volumes/Data/Projects/bandcoin`): engineering reference

Use these files as **patterns**, never as UI:
- Root: `package.json`, `pnpm-workspace.yaml` (catalog), `turbo.json`, `tooling/*`.
- `packages/db` (multi-file Prisma schema, `prisma.config.ts`, `scripts/migrate-legacy/`).
- `packages/api` (context, procedures, activity log, services, one root router per app).
- `packages/chain`, `packages/wallet`, `packages/auth`, `packages/errors`, `packages/storage`.
- `apps/worker` (runner, schedule, handlers, health, Dockerfile).
- `docs/plans/01-monorepo-layout.md`, `02-schema.md`, `03-data-migration.md`, `13-worker.md`.

---

## 4. Environment and data safety

### 4.1 Reuse actionverse env values (for now)

- Development values come from `actionverse/.env.development`, production values from `actionverse/.env.production`.
- `scripts/env-from-legacy.ts` (Phase 0) reads those two files and writes each app's git-ignored `.env.local` / `.env.production`, renaming keys per Appendix C. It never prints values.
- The owner will replace values later; the app `.env.example` files document every key.
- Per-app overrides: `NEXTAUTH_URL` and `NEXT_PUBLIC_URL` differ per app (domains in §1; localhost ports 3000 to 3003 in dev).
- **Leaked-public secrets** are moved server-side: `NEXT_PUBLIC_NODEMAILER_PASS` → `SMTP_PASS`, `NEXT_PUBLIC_LASTFM_API_SECRET` → `LASTFM_API_SECRET`. The values are the same for now; the owner should rotate them later.

### 4.2 Two databases per environment

The new schema renames and restructures tables, so it **cannot** run on the legacy database without altering production data. So:

| Variable              | Development                                         | Production                                                  |
| --------------------- | --------------------------------------------------- | ----------------------------------------------------------- |
| `LEGACY_DATABASE_URL` | actionverse dev DB (Neon, `neondb`), **read-only**   | actionverse prod DB (`actiontokens` on the existing Postgres host), **read-only** |
| `DATABASE_URL`        | a **new** database `action_tokens_dev` in the same Neon project | a **new** database `action_tokens` on the same Postgres host (or a new Neon project; owner chooses) |

Creating the new production database needs the owner's go-ahead (open question Q2).

### 4.3 Guardrails that make data loss impossible

1. **Read-only legacy connection:** every legacy client is created with `options=-c default_transaction_read_only=on`, plus a `SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY` check at startup. Any write throws.
2. **Target guard:** `packages/db/scripts/assert-safe-target.ts` runs before every `prisma migrate`, `migrate deploy`, seed and migration step. It refuses to run if:
   - `DATABASE_URL` points at the same host + database as `LEGACY_DATABASE_URL`;
   - the target database contains legacy tables (`Creator`, `User_Asset`, `MarketAsset`);
   - the command is `migrate reset`, `db push --accept-data-loss` or `--force-reset`;
   - the seed is run with `NEXT_PUBLIC_STAGE=prod`.
3. `db push` is banned (lint rule on package scripts). Schema changes go through `prisma migrate` only.
4. **Backup first:** before the first production migration run and again at cutover, `pg_dump` of the legacy production DB to S3 (a read-only operation). Restore is tested on a scratch database once.
5. Legacy actionverse keeps running on its own database until cutover. The new apps never write to it.
6. Migration is **copy, not move**: the legacy rows stay where they are.

### 4.4 Rejected alternative

Pointing the new apps at the legacy tables through Prisma `@@map` (a "compatibility mode") was rejected. The planned fixes (cuid user ids, Decimal money, encrypted secrets, gallery relations) all need `ALTER`s on production tables.

---

## 5. Stack

From one pnpm `catalog:` (start from bandcoin's catalog versions, then prune):

- Next 16 App Router, React 19, TypeScript strict, Tailwind 4, tRPC 11 + TanStack Query 5, Prisma 7 with `@prisma/adapter-pg`, NextAuth 4, Zod 4, Stellar SDK 17, Vitest, Playwright, Turborepo, pnpm 12, Node ≥ 20.19.
- 3D and motion: three, `@react-three/fiber` 9, `@react-three/drei` 10, `@react-three/postprocessing`, `gsap` (ScrollTrigger), `lenis`, `framer-motion`.
- Maps: `mapbox-gl`, `react-map-gl`.
- Payments: Square (`square`, `react-square-web-payments-sdk`).
- Jobs: built-in worker (Trigger.dev is retired). `@upstash/qstash` only for incoming webhook signatures if still needed; `@upstash/redis` for rate limits and cache.
- AI: `openai`, `@google/genai`, `@huggingface/transformers` (depth maps at build time).
- **Removed:** `sass`, `daisyui`, `react-quill`, `tinymce`, `@tinymce/*`, `@syncfusion/*`, `lottie-react`, `@headlessui/react`, `uploadthing`, `next-nprogress-bar`, `react-h5-audio-player` (replaced by one audio component), Trigger.dev.

---

## 6. Monorepo layout and rules

```
actiontokens/
├─ apps/
│  ├─ web/        @actiontokens/web      app.action-tokens.com      :3000
│  ├─ org/        @actiontokens/org      org.action-tokens.com      :3001  (+ /admin)
│  ├─ ar/         @actiontokens/ar       ar.action-tokens.com       :3002
│  ├─ gallery/    @actiontokens/gallery  gallary.action-tokens.com  :3003
│  └─ worker/     @actiontokens/worker   internal                   :3010 (health)
├─ packages/
│  ├─ db/            Prisma schema (one file per domain), client, migrate-legacy, safety guard
│  ├─ api/           tRPC context, procedures, activity log, services, root router per app
│  ├─ chain/         every Stellar/Soroban transaction + quotes
│  ├─ contracts/     Soroban sources + TS bindings
│  ├─ wallet/        wallet connect + signing (Freighter, Albedo, xBull, Hot, WalletConnect, custodial)
│  ├─ auth/          NextAuth options, credential → user, shared cookie
│  ├─ storage/       S3 uploads, presigned URLs, media proxy rules
│  ├─ stellar/       Horizon reads, balances, prices
│  ├─ ar-core/       pin/rarity/distance/unlock-rule maths (pure)
│  ├─ gallery-core/  museum model + R3F hallway components
│  ├─ map/           Mapbox styles, layers, shared types
│  ├─ geo/           geographic helpers
│  ├─ ui/            ActionTokens design system (§12)
│  ├─ motion/        frame-sequence scrubber, Lenis, reveal/glitch/stamp primitives
│  ├─ env/           shared Zod env schemas per app
│  ├─ errors/        AppError + codes
│  └─ utils/         framework-free helpers
├─ tooling/          eslint · prettier · typescript · vitest
├─ scripts/          env-from-legacy.ts, build-hero-frames.ts
└─ docs/             PLAN.md · ARCHITECTURE.md · DEPLOYMENT.md · plans/NN-*.md · migration-report.md
```

Package scope: `@actiontokens/*`.

### Inside an app

```
apps/<app>/src/
├─ app/                  routes only: page, layout, loading, error (thin)
├─ features/<feature>/   components/, hooks/, lib/, index.ts (public surface)
├─ hud/                  the app frame (§11.3)
└─ trpc/                 client provider
```

A `page.tsx` only loads data and composes features. Public pages (item, organization, bounty, community) are Server Components for SEO.

### Rules (lint-enforced in CI)

- Apps never import each other; packages never import apps.
- Business logic lives only in `packages/api/src/services`. Routers validate input and call a service. Every mutation writes `ActivityLog`.
- All transactions are built in `@actiontokens/chain`. The user is the transaction source and pays the fee. A full price breakdown is shown before signing. Custodial wallets get a 5-second countdown with Cancel.
- `@actiontokens/db/server` and `@actiontokens/chain/server` are never imported in client components (`server-only`).
- No file over 1000 lines (`max-lines`). No `throw new Error`. No dependency outside the catalog. No `db push`.
- kebab-case files, PascalCase components, verb-first functions, `is/has/can` booleans.
- Legacy misspellings never come back: `wallate`, `steller`, `wallete`, `aprovalSend`, `Left-sidebar`.

---

## 7. Domain language

| Legacy                                              | Code / DB name            | UI copy (§11.2) |
| --------------------------------------------------- | ------------------------- | --------------- |
| Creator                                             | `Organization`            | Organization / "Org" |
| CreatorPageAsset, `customPageAssetCodeIssuer`       | `OrgToken`                | Action token ($CODE) |
| Subscription                                        | `MembershipTier`          | Pass |
| Asset, Nft, SellPageAsset, non-stellar item         | `Item` (`chainType: CLASSIC_TOKEN \| CONTRACT_NFT \| OFF_CHAIN`) | Drop |
| MarketAsset, NftListing                             | `Listing` (`kind: PRIMARY \| RESALE`) | Listing |
| User_Asset, User_Song, NftToken.owner               | `Ownership`               | Stash |
| NftPurchase                                         | `Order`                   | Order |
| Location / LocationGroup / LocationConsumer         | `Pin` / `PinDrop` / `PinClaim` | Pin / Drop zone / Claim |
| Redeem / RedeemConsumer                             | `RedeemCode` / `RedeemClaim` | Code |
| OriginReward / QuarterReward (+ blocked users)      | `RewardPeriod` / `RewardPayout` / `RewardBlockedUser` | Rewards |
| Community                                           | `Community`               | Crew |
| Bounty                                              | `Bounty`                  | Bounty ("WANTED") |
| CreatorGallery / MuseumRoom / GallerySlotOverride / GallerySlotLike | `Gallery` / `GalleryRoom` / `GalleryArtwork` / `GalleryArtworkLike` | Gallery / Room / Piece |
| Admin table                                         | `User.role = ADMIN`       | Admin |
| User profile                                        | `User`                    | Rep card |

---

## 8. Database schema

Location: `packages/db/prisma/schema/*.prisma`, with `prisma.config.ts` pointing at the folder.

### 8.1 Goals

- One name per idea; singular PascalCase models mapped to snake_case plural tables (`model PinClaim` → `@@map("pin_claims")`).
- Real FKs everywhere (no ids stored as strings without a relation).
- Money as `Decimal @db.Decimal(20, 7)` (there are 34 `Float` columns today).
- `createdAt` / `updatedAt` on every table; `deletedAt` for soft-deletable content.
- An index for every list query (organization, status, createdAt).
- Prisma Migrate from the first commit.

### 8.2 Structural fixes

1. `User.id` is a cuid; `User.walletAddress` is unique and nullable (custodial users get one on activation). Every FK that held a public key is remapped.
2. Secrets leave domain tables: `Creator.storageSecret`, issuer secrets → `ChainAccount { kind: STORAGE | ISSUER | DISTRIBUTOR, publicKey, secretCipher, ownerId }`, AES-256-GCM with `CHAIN_SECRET_KEY` per environment.
3. `Creator.approved: Boolean?` + `aprovalSend` → `Organization.status: DRAFT | PENDING | APPROVED | BANNED`.
4. Gallery: `GalleryArtwork` belongs to `GalleryRoom` (FK) with `gridCell`; likes reference `artworkId` (no more `slotId` + `roomIndex` string keys).
5. One `Item` catalog with 1:1 side tables `ClassicToken` / `ContractNft`; one `Listing` + `ListingPrice` (multi-currency); one `Order` state machine (`CREATED → QUOTED → SUBMITTED → DELIVERED | FAILED | REFUNDED`); one `Ownership`.
6. `ActivityLog` (actor, action, target, payload JSON) for every mutation.
7. `LegacyIdMap (table, oldId, newId)` for the migration.

### 8.3 Files and models

| File                  | Models |
| --------------------- | ------ |
| `identity.prisma`     | User, AuthAccount, AuthSession, VerificationToken, ChainAccount, Follow (`isTemporary` replaces TemporalFollow) |
| `organization.prisma` | Organization, OrgToken, MembershipTier, VanityUrl (+ VanitySubscription data), PageLayout, PageWidget (Appearance, Widget) |
| `catalog.prisma`      | Item, ClassicToken, ContractNft, NftEdition, ItemMedia, ItemCollection, ItemCollectionLike, ItemLike, LockedContent, UnlockRule, UnlockPoint, Tag, ItemTag |
| `market.prisma`       | Listing, ListingPrice, Order, Ownership, RedeemCode, RedeemClaim, PlatformFee |
| `music.prisma`        | Album, Track (1:1 with Item), LastFmAccount |
| `map.prisma`          | Pin, PinDrop, PinClaim, Hotspot, LocationTag, PinDropTag, GeoCache, PinBatchJob (LocationGroupJob), LocationTagCache |
| `bounty.prisma`       | Bounty, BountyParticipant, BountyMusicRule, BountyTrack, BountyTrackProgress, BountySubmission, BountySubmissionMedia, BountyCapture, BountyWinner |
| `community.prisma`    | Community, CommunityTokenRequirement, CommunityMember, CommunityPost, CommunityPostMedia, CommunityPostLike, CommunityComment, CommunityActivity, CommunityNotificationPreference |
| `social.prisma`       | Post (PostGroup), PostMedia, PostLike, PostComment, PostCollectible, PostCollect, NotificationEvent, Notification |
| `gallery.prisma`      | Gallery, GalleryRoom, GalleryArtwork, GalleryArtworkLike |
| `rewards.prisma`      | RewardPeriod, RewardPayout, RewardBlockedUser |
| `platform.prisma`     | PlatformAsset (AdminAsset), PlatformAssetTag, PlatformSetting (AppConfig), TelegramConfig, AgentJob, Job (worker queue), ActivityLog, LegacyIdMap |

Dropped: `Beam`, `BeamReaction`, `BeamComment`, enums `BeamType`, `StyleCategory`. Their rows are counted in the migration report, never deleted from the legacy DB.

Phase 1 writes `docs/plans/01-schema.md` with a column-by-column map for every model before the first migration.

---

## 9. Data migration

`packages/db/scripts/migrate-legacy/`, one file per domain, run in order:

```
01-users → 02-organizations → 03-chain-accounts → 04-items → 05-listings → 06-orders-ownership
→ 07-music → 08-social → 09-communities → 10-pins → 11-bounties → 12-galleries → 13-rewards → 14-platform
```

- **Source:** `LEGACY_DATABASE_URL` (read-only, §4.3). **Target:** `DATABASE_URL` (new DB), checked by `assert-safe-target`.
- **Re-runnable and incremental:** upsert through `LegacyIdMap`. `--since <timestamp>` copies only rows changed since the last run (by `updatedAt`, or by id for tables without it), which makes the cutover delta fast.
- Float → Decimal (7 dp). Secrets decrypted with the legacy scheme, re-encrypted with `CHAIN_SECRET_KEY`. Wallet-key ids → cuids.
- Gallery rows: `GallerySlotOverride (creatorId, roomIndex, slotId)` → `GalleryArtwork` under the `GalleryRoom` for `(creatorId, roomIndex)`, creating rooms that exist only implicitly.
- `--dry-run` prints per-table counts plus every orphan or broken reference, and writes nothing.
- **Checks after each run:** row counts per domain; ownership re-checked against Horizon for a 200-user sample; each organization's token, items, followers, pins and gallery match; totals of money columns match to 7 dp. Results go to `docs/migration-report.md`.
- Order: run on dev (Neon) until clean, then a dry-run against production (read-only), then the real production run into the new prod DB (Phase 12).

---

## 10. API

- `packages/api/src/`: `context.ts`, `trpc.ts` (public, protected, org, admin procedures), `activity/`, `services/<domain>/`, `routers/<app>/`, `root-web.ts`, `root-org.ts`, `root-ar.ts`, `root-gallery.ts`.
- Each app mounts only its root router.
- Routers are domain nouns, procedures verb + noun: `item.getBySlug`, `listing.create`, `order.submit`, `pin.claim`, `bounty.join`, `gallery.updateArtwork`.
- Rate limits on public mutations through Upstash Redis.

### Legacy router → new router

| Legacy (`src/server/api/routers`)                       | New |
| ------------------------------------------------------- | --- |
| `fan/asset, creator, membership, post, notification, user, dashboard, music, trx` | `item`, `organization`, `membership`, `post`, `notification`, `user`, `orgDashboard`, `track`, `order` |
| `marketplace/marketplace, pay, steller, trade`          | `listing`, `order`, `quote` |
| `nft.ts`, `collection.ts`                               | `item`, `nftEdition`, `collection`, `lockedContent` |
| `music/album, song, steller`                            | `album`, `track` |
| `maps/pin, trx`                                         | `pin`, `pinDrop`, `hotspot` |
| `bounty/bounty`                                         | `bounty`, `bountySubmission`, `bountyWinner` |
| `community/*`                                           | `community`, `communityPost`, `communityMember`, `communityActivity` |
| `wallate/*`, `walletBalance/*`                          | `wallet`, `platformAsset` |
| `action-token/checker`, `trigger.ts`                    | `reward` |
| `admin/creator, platformFee, telegram, users`           | `admin.organization`, `admin.platformFee`, `admin.telegram`, `admin.user` |
| `auth/trx`                                              | `account` (activation, trustlines) |
| `agent.ts`, `pages/api/vibe-studio-ai/*`                | `agent`, `studio` (work runs in the worker) |
| `action-cam-storage`, `qr`, `s3`, `tags`                | `actionCam`, `qr`, `upload`, `tag` |
| gallery fork `gallery.ts`                               | `gallery`, `galleryRoom`, `galleryArtwork` |
| `beam.ts`, `game.ts`                                    | dropped |

### REST endpoints kept (route handlers)

`/api/auth/*` (NextAuth), `/.well-known/stellar.toml` (from `api/toml`), `/api/media/{image,audio,video}` (signed proxies, replacing `proxy-*`), `/api/lastfm/{auth,callback}`, `/api/telegram/webhook`, `/api/xdr` (only if an external caller needs it; otherwise tRPC). `api/internal/keep-alive*` moves to the worker health check.

---

## 11. Product UX: the ActionTokens identity

Bandcoin is a music store with a sidebar, a contextual right panel and a player bar. **ActionTokens is not that.** It is a game-like action network: you discover something to do, do it, prove it, earn, and show it off. Everything below is designed for that loop.

### 11.1 The core loop

```
DISCOVER  →  ACT  →  PROVE  →  EARN  →  FLEX
(drops,      (join a    (action-cam,  (tokens, NFTs,  (rep card,
 bounties,    bounty,    QR, pin       payouts)        stash, gallery,
 pins, crews) go to pin) claim, buy)                   leaderboards)
```

Every screen answers "what can I do next?" and shows a primary **ACT** affordance.

### 11.2 Vocabulary (UI copy only; code names in §7)

Drops (items/NFTs), Bounties ("WANTED" posters), Crews (communities), Pins and Drop zones (map), Stash (your collection + balances), Rep card (profile), Passes (memberships), Command Center (org portal).

### 11.3 Navigation: HUD + dock that becomes a sidebar

Approved in the homepage mockup (`docs/mockups/home.html`, 2026-11-19).

- **Header = notch / Dynamic Island:** a black island hanging from the top center (rounded bottom corners, curved "ears" flaring into the top edge; no full-width bar). It holds logo · ⌘K search · stash balance · notifications · avatar with rep ring. **Live activity:** every ~9 s the island springs taller to show one live event (avatar · "drift.king won Shoot the Drift Edit" · `+2,000 ACTION` pill) for ~3.4 s, then shrinks back. With the sidebar visible, the island re-centers over the content area.
- **No bottom nav / dock anywhere** (removed by the owner on 2026-11-19). The header island carries a neon **ACT** pill that opens the ACT sheet right below the island.
- **Homepage on desktop:** during the hero only the header island shows. As the hero docks into the first section, a **left sidebar slides in**. Content below the hero is laid out for the sidebar from the start, so nothing reflows.
- **Every other page on desktop (≥ 1024px):** the sidebar is always visible. It is a **floating panel** (248px wide, 12px from the edges, 22px radius), not a full-height bar:
  - **Type:** section labels in **Faster One** (neon green), nav labels and the user's name in **Bungee**, the level number in **Bungee Shade**, and counts in JetBrains Mono.
  - **Rep card on top:** avatar, name, XP, a big level number on the right, an XP bar, "590 XP to LVL 13" and a 5-day streak.
  - **Explore:** list rows, the same as the other sections: Home, Drops (128), Bounties (pulsing red "24 live"), Crews (3). Each row has an icon, a label and a count. The active row (scroll-spy or current page) fills neon with diagonal stripes. The 2×2 tile grid was rejected by the owner.
  - **World:** compact rows for Organizations (312), Gallery ↗ and AR Map (3 near). **You:** Stash (balance) and Joined (2).
  - **Crews:** a row of avatar tiles with unread dots, plus a "+" to find a crew.
  - **Footer:** a striped neon **ACT** button (Bungee Shade + an `A` key badge) next to a collapse button.
  - **Collapsed:** a 72px floating rail of single icons (remembered per browser).
  - Highlights the current section as you scroll.
- **Phones and tablets (< 1024px):** a menu button at the left of the header island opens the sidebar as a slide-in **drawer** over a dimmed backdrop (it closes on a link tap, a backdrop tap or Esc). The island shows only the logo mark below 600px. On phones the hero headline sits above the hand, in the dark top area.
- **Boot loader** (first load of the homepage, while hero frames load). Fonts chosen by the owner from `docs/mockups/fonts.html` on 2026-11-19:
  - **One line: `ACTIONTOKENS`** in **Bungee Shade** (#27, 3D shaded), full screen width along the bottom. The 12 letters spring up one by one (60 ms stagger), Maggie-style (maggie-app.com). A two-line version (ACTION in Bungee Shade + TOKENS in Faster One) was tried and replaced by the owner.
  - The line is sized with JS to fill the screen width (capped at 60% of the height) and fills neon green from the bottom as frames actually load.
  - **Spread background letters:** all 12 letters of ACTIONTOKENS also sit behind the loader as giant, faint Bungee Shade shapes (34–82vh tall, rotated −20° to +18°), mostly **cropped by the screen edges** (an A bleeding off the top-left, C/K/T cut off at the bottom, O and S off the right). They fade and scale in one by one, drift slowly, grow brighter with progress and flash at 100%. The middle band stays calm so the main word reads clearly.
  - **Glimmer + glyph:** once the letters land, a bright chrome shine band sweeps across the word left to right, repeating every 2.6 s (each letter offset by 70 ms so it reads as one sweep). As the band passes a letter, that letter briefly flips into a glowing **pixel glyph** of itself (**Silkscreen** 700, white with a green glow), then snaps back to Bungee Shade. Built as an overlay per letter, so nothing shifts. The shine keeps running over the full green gradient at 100%.
  - No logo in the loader (removed at the owner's request).
  - Mono % counter, status line (Loading frames → Charging particles → Warming the tires → Ready), top progress line and a green floor glow that grows with progress.
  - **At 100%:** the word turns into a glowing green gradient with a glitch hit.
  - **Exit is one continuous move:** the panel slides up (0.85 s) while the hero video auto-plays from frame 0 to 22 underneath, so the page never lands on the black first frame.
  - Minimum 1.9 s; scroll is locked until the exit.
- **ACT sheet:** Scan QR · Claim a pin nearby · Submit proof for a joined bounty · Redeem a code. It opens from the header ACT pill (drops below the island), the sidebar ACT button (opens beside it) or the `A` key. Context-aware: on a bounty page it opens straight to "Submit proof".
- **⌘K command palette:** jump to any org, drop, bounty or crew, plus actions ("buy $CODE", "open stash").
- Content is centered at max 1360px next to the sidebar, with full-bleed heroes.
- The **Command Center** (`org.`) has a different frame on purpose: a left mission rail (Overview, Drops, Bounties, Pins, Crews, Gallery, Token, Money, Settings), a top status bar showing the org token price and live counts, and wide data views.

### 11.4 Signature screens

| Screen | UX |
| ------ | -- |
| **Homepage** | Scroll-scrubbed 3D hero (§13), then live sections. |
| **Drop page** (item) | Full-bleed art with a 3D tilt card, edition counter ("#12 / 100"), sticky buy bar, price breakdown sheet, provenance timeline (mint → sales → current owner), "seen in gallery" link, locked-content preview with an unlock requirement. |
| **Bounty board** | Grid of WANTED posters: prize in escrow (with a Stellar explorer link), deadline countdown, slots left, difficulty, rule chips (action-cam, location, music). Filters as chips, not a sidebar. |
| **Bounty page** | Poster header → rules as a checklist that ticks as you progress → "Submit proof" flow (action-cam / media upload / link) → live participants and winners. The org's judge view lives in the Command Center. |
| **Crew page** | Banner + token-gate pill ("Hold 10 $CODE: you have 3 · Buy"), feed, members wall, activity ticker, crew bounties. |
| **Organization card** | Grid: **4 per row** on desktop (3 below 1360px, 2 below 1060px, 1 on phones). Cover banner with category pills, overlapping chrome monogram logo (64px, 18px radius), name + verified badge + tagline, token box (symbol, price, % change, sparkline green/red), 3 stat tiles (Drops · Live bounties in red · Crew), actions: Follow + "Buy $TOKEN". Hover: lifts 4px, cover zooms, neon border. |
| **Organization page** (`/org/[slug]`) | Chrome-logo header, action token price + chart, tabs: Drops · Bounties · Pins · Crew · Gallery · Music · About. Keeps the org's custom widgets (PageLayout). |
| **Stash** | Everything owned: tokens with value, NFTs as a grid you can flip into a 3D shelf, claimed pins, won bounties. |
| **Rep card** | A shareable profile card (OG image generated): level, XP, badges, top pieces, crews. |
| **Map (AR app)** | Full-screen map, pins as glowing markers by rarity, bottom sheet with the nearest pins, "Navigate" and "Collect in AR". |

### 11.5 Feedback and micro-interactions

- **STAMP** animation on success (CLAIMED / COLLECTED / WON / JOINED): a rubber-stamp hit with a short glitch. One shared component in `packages/motion`.
- Optional sound (off by default): a phonk cowbell hit on STAMP.
- Optimistic UI for likes, follows and joins; pending state on the button itself; skeletons shaped like content (no page spinners).
- Transaction sheet: breakdown → sign → "Submitting…" → STAMP. Custodial wallets get a 5-second countdown with Cancel.
- Empty states always offer the next action ("No drops yet · Browse bounties").

### 11.6 Rep and XP (new feature: needs owner approval, Q4)

XP for real actions only (claim a pin, win a bounty, buy a drop, post in a crew, visit a gallery). Levels show on the rep ring and rep card. It needs `ReputationEvent` + `UserReputation` tables, written by services through the activity log. It is planned for Phase 11 and is not required for parity.

### 11.7 Accessibility

WCAG AA contrast, full keyboard support (dock and ACT sheet reachable by keyboard), `prefers-reduced-motion` turns off scrubbing, glitch and parallax, and all neon glows have non-colour equivalents (icons, labels).

---

## 12. Design system: neon-green phonk

`packages/ui`. **Approval gate:** Phase 2 publishes `apps/web/src/app/design/page.tsx` with every token, component and effect at desktop and phone width. The owner approves before features use it.

### 12.1 Mood

A phonk drift-night underground: near-black, one neon green, chrome lettering, cassette/VHS texture, smoke, wanted posters. Loud in heroes, calm in data views.

### 12.2 Tokens (Tailwind 4 `@theme`)

| Token | Value |
| ----- | ----- |
| `--bg` | `#050605` |
| `--surface` / `--surface-raised` / `--surface-sunken` | `#0c0f0c` / `#131813` / `#020302` |
| `--border` / `--border-strong` | `#1f2a1f` / `#2f402f` |
| `--fg` / `--fg-muted` / `--fg-subtle` | `#e9f5e9` / `#8fa38f` / `#5b6b5b` |
| `--accent` | `#39ff14` (placeholder; final hex sampled from the video's logo in Phase 2) |
| `--accent-fg` | `#031003` (text on accent) |
| `--accent-glow` | `color-mix(in oklab, var(--accent) 40%, transparent)` |
| `--chrome` | `linear-gradient(180deg,#fdfdfd 0%,#a7a7a7 45%,#ffffff 52%,#4d4d4d 100%)` for display type |
| `--danger` / `--warning` / `--info` | `#ff3b5c` / `#ffb020` / `#3aa0ff` (status only) |
| Radius | 4 / 10 / 20 px (sharp by default, posters have 2 px) |
| Motion | 120 / 220 / 480 ms; easing `cubic-bezier(.2,.8,.2,1)`; "hit" spring for STAMP |

Dark only for v1. Spacing is a 4px scale.

### 12.3 Type

- Display: `Anton` (condensed heavy) for posters and headlines, plus `Unbounded` 800 for wide titles; chrome gradient and slight italic skew on heroes.
- Blackletter accent: `UnifrakturCook`, only for stamps and poster labels (WANTED, DROP, CLAIMED).
- Body: `Onest`. Numbers: `JetBrains Mono` (prices, countdowns, editions).
- Self-hosted with `next/font`.

### 12.4 Effects (GPU-light; all off under reduced motion)

VHS grain overlay (one tiled noise PNG, animated offset), scanlines (hero only), RGB-split glitch on hover (CSS, 150 ms), neon edge glow on interactive cards, smoke gradient mesh behind section headers, marquee tickers.

### 12.5 Components

- **Primitives:** Button (solid neon / chrome outline / ghost), IconButton, Input, Select, Textarea, Switch, Checkbox, Tabs, Dialog, Sheet, Drawer, Popover, Tooltip, Badge, Avatar, Skeleton, Toast.
- **HUD:** `HeaderIsland` (+ live activity, ACT pill, phone menu button), `Sidebar` (+ collapsed rail, scroll-spy, phone drawer), `ActSheet`, `CommandPalette`, `RepRing`, `BootLoader`.
- **Marketplace:** `DropCard` (tilt + glitch, rarity, mono price), `EditionCounter`, `DropCountdown`, `PriceBreakdown`, `BuySheet`, `ProvenanceTimeline`, `RarityBadge`, `OwnerStack`, `ListingTable`.
- **Bounty:** `WantedPoster`, `RuleChecklist`, `ProofUploader`, `EscrowBadge`, `WinnerReveal`, `SubmissionCard`.
- **Crew:** `CrewCard`, `TokenGate`, `FeedPost`, `Composer`, `ActivityTicker`, `LeaderboardRow`.
- **Feedback:** `Stamp`, `TxSheet` (countdown + cancel), `EmptyState`, `ErrorState`.

### 12.6 Performance rules (learned from the mockup)

- No `shadowBlur` or CSS `filter` drawn every frame: pre-render glow sprites once and `drawImage` them.
- Draw hero frames at their source size (1280×720) and scale with CSS `object-fit: cover`, never at device-pixel-ratio size.
- Run hero work only while the hero is on screen; write DOM/styles only when a value changes; animate only `transform`/`opacity`.
- No `backdrop-filter` over moving canvases. Pause offscreen CSS animations. Paint generated art lazily.
- Smooth scroll with Lenis sharing the single rAF loop. `history.scrollRestoration = 'manual'` on the homepage.
- Target: ≥ 120 fps on a 120 Hz Mac and ≥ 60 fps on a mid-range phone. The mockup measures about 142 fps.
- **Command Center:** `MissionRail`, `StatTile`, `DataTable`, `FormCard`, `Dropzone`, `ChartCard`.

---

## 13. Homepage: scroll-driven 3D video hero

### 13.1 Source

`actionverse/public/videos/Hand.mp4`: 1920×1080, 24 fps, 7.29 s, about **175 frames**. A hand rises on black, the neon "A / ACTION" logo materialises with blue and orange particles, then locks. Copy it to `apps/web/assets-src/hero/Hand.mp4` (git LFS, or S3 only).

### 13.2 Build pipeline: `scripts/build-hero-frames.ts`

1. `ffmpeg -i Hand.mp4 -vf fps=24 frames/%04d.png` gives 175 lossless frames.
2. Three sizes: 1920w, 1280w, 720w. Encode AVIF (q≈50) plus a WebP fallback. Target 25 to 60 KB per frame (desktop ≈ 6 to 9 MB total, phone ≈ 2 to 3 MB).
3. **Depth maps:** Depth Anything V2 via `@huggingface/transformers` (Node, CPU) on each frame → 512w grayscale WebP (~8 KB each).
4. **Logo mask:** a key on the green channel → 512w alpha WebP, so the logo gets bloom and glitch separately.
5. Upload to S3 under `hero/v1/` (immutable cache headers) and write `apps/web/src/features/home/hero-manifest.json` (frame count, sizes, URLs, keyframes, sampled accent colour).
6. The script is idempotent and run by hand; outputs are not committed (only the manifest).

### 13.3 Player: `packages/motion`

- `useFrameSequence(manifest, size)` loads **progressively**: frame 0 (also the LCP poster) → every 8th frame → fills gaps. It decodes with `createImageBitmap` and keeps a ring buffer on phones.
- `ScrollScrub`: Lenis smooth scroll + GSAP ScrollTrigger pins the hero for about 400vh and maps progress to a frame index. Missing frames show the nearest loaded one.
- `HeroCanvas` (R3F, lazy-loaded after first paint):
  - a full-screen plane with a custom shader: colour + depth → parallax displacement from mouse (desktop) or gyroscope (phone, permission prompt on iOS), giving the camera-moving-around-the-hand feel;
  - the logo mask routed into bloom (`@react-three/postprocessing`) plus an RGB-split hit at frame ≈ 100;
  - a GPU particle field (blue and orange, like the video) in real 3D in front of and behind the plane, with the same parallax;
  - grain and vignette passes.
- Adaptive quality: 30 fps cap and no depth on low-power devices (`hardwareConcurrency ≤ 4` or `deviceMemory ≤ 4`), and 720w frames under Save-Data.

### 13.4 Storyboard

| Scroll | Frames | On screen |
| ------ | ------ | --------- |
| 0 to 15 % | 0–30 | Black + grain. The hand rises. Chrome headline types in: **TAKE ACTION.** |
| 15 to 45 % | 30–100 | The logo forms from particles. The headline swaps to **EARN TOKENS.** A live stats ticker fades in (orgs, bounties paid, drops collected, pins claimed). |
| 45 to 70 % | 100–150 | The logo locks with a glitch hit and STAMP sound (if on). The camera pushes in (parallax grows). CTAs: **Explore Drops** · **Hunt Bounties**. |
| 70 to 100 % | 150–175 | The hand closes and the frame darkens. The plane shrinks into a card that docks into the "Live drops" section below (hand-off transition). |

### 13.5 Sections below the hero

Each section is a scroll-reveal; data comes from Server Components with streaming and Suspense skeletons.

1. **Live drops**: horizontal DropCard rail, countdowns, marquee ticker.
2. **Bounty board**: WANTED posters, total prize in escrow.
3. **Organizations**: chrome logo wall, follow, token prices.
4. **Crews**: active crews, activity feed, top collectors leaderboard.
5. **Enter the gallery**: a short looping R3F hallway teaser → `gallary.action-tokens.com`.
6. **Go out there**: phone mockup + mini map of nearby pins → `ar.action-tokens.com`.
7. **Footer**.

### 13.6 Fallbacks and budgets

- Reduced motion or no WebGL: poster frame + static sections, no pinning.
- LCP < 2.5 s on 4G (poster preloaded); hero JS < 120 KB gzipped before three.js loads; 60 fps on a 2021 MacBook Air, ≥ 30 fps on a mid-range Android; CLS < 0.05.
- If phones still struggle: fall back to a short H.264 clip scrubbed via `video.currentTime`.

---

## 14. Apps in detail

Full route map: Appendix A.

### 14.1 `apps/web` (`app.action-tokens.com`)

Features: `home`, `drops` (marketplace, item, collection, resale), `bounties` (board, page, joined, submit proof), `crews`, `org-page` (public organization page + widgets), `music` (albums, tracks, player), `stash`, `rep-card`, `wallet` (balances, recharge, send), `notifications`, `settings`, `rewards` (checker), `info` (about, privacy, support).

### 14.2 `apps/org` (`org.action-tokens.com`): Command Center + `/admin`

- **Onboarding wizard** (replaces the 2,192-line `new-profile` and 1,702-line `create`): profile → action token (issue or link) → storage account → first drop.
- Overview dashboard; Drops (classic token, contract NFT, off-chain item, sell-page assets, locked content, unlock rules); Passes (memberships); Music; Posts; Pins (single, batch via the worker, hotspots, map, collection reports); QR; Redeem codes; Gifts; Bounties (create, edit, judge submissions, pick winners, escrow); Crews (settings, moderation, token requirements); **Gallery editor** (rooms, doors, upload artworks, placement grid, descriptions, music; live 3D preview from `gallery-core`); Page builder (widgets/appearance); Token & money (OrgToken, platform fee, payouts); Studio (vibe-studio AI, agent); Settings (vanity URL, Last.fm, team).
- **`/admin`** (role ADMIN): users, organizations (approve/ban), admins, bounties, pins, map collection reports, organization reports, platform wallet/assets, reward checker + reward periods, Telegram config, job dead letters.

### 14.3 `apps/ar` (`ar.action-tokens.com`)

Map (Mapbox via `packages/map`), nearby pins sheet, navigate, **AR collect** (location-based AR from `lib/augmented-reality`), QR scan (`html5-qrcode` / `jsqr`), **action-cam** capture with sealing + HMAC validation (`lib/action-cam`, `ACTION_CAM_HMAC_SECRET`), collection, an embeddable pin map (`/embed`).

### 14.4 `apps/gallery` (`gallary.action-tokens.com`)

- `/` lists organizations with galleries; `/[orgSlug]` is the museum walk-through; `/[orgSlug]/[artworkId]` deep-links to a piece.
- `packages/gallery-core` splits `MuseumHallway.tsx` into `Hallway`, `Room`, `Door`, `Painting`, `FramePreview`, `controls/` (WASD + pointer lock on desktop, virtual joystick on touch), `use-room-grid.ts`, `layout.ts` (pure grid maths, unit-tested).
- Phonk restyle: dark concrete, neon strip lighting, chrome frames, bloom, fog.
- Each piece can link to a Drop ("Collect this"), so the gallery doubles as a storefront. Likes, info panel and background music are kept.
- Visitors only; editing happens in the Command Center using the same components.

### 14.5 `apps/worker`

An always-on Node process (Docker; Railway/Fly/EC2 + PM2), using `@actiontokens/api` services so a job does exactly what the app would. A `Job` table holds the queue (status, attempts, backoff, runAt, lastError); dead letters show in `/admin`.

| Job | Schedule | Replaces |
| --- | -------- | -------- |
| `reward.distribute` | on demand / scheduled | `trigger/distribute.ts` |
| `reward.quarterly` | quarterly | `trigger/quarter-reward.ts` |
| `reward.syncStatus` | every 5 min | `trigger/status.ts` |
| `order.reconcile` | every minute | new: re-checks SUBMITTED orders on Horizon |
| `agent.run` | queued | `express-wadzzo` agent pipeline (`lib/express/taskClient-sdk.ts`) |
| `pin.batchCreate`, `hotspot.drop` | queued / scheduled | `express-wadzzo` pin creation (`hotspotClient-sdk.ts`) |
| `studio.generate` | queued | `api/vibe-studio-ai/*` |
| `media.process` | queued | `server/image-optimizer.ts` + video posters |
| `telegram.dispatch` | queued | `lib/telegram` |
| health | `GET /health` | `api/internal/keep-alive*` |

Cutover rule: in-flight Trigger.dev runs must finish before the worker takes over rewards.

---

## 15. Chain and contracts

- `packages/contracts`: `nft_oz` and `bounty_escrow` copied as-is with test snapshots and bindings. Turbo tasks `contracts:test`, `contracts:build`, `contracts:bindings`.
- `packages/chain`: every XDR builder from `routers/marketplace/steller.ts`, `routers/music/steller.ts`, `routers/maps/trx.ts`, `routers/fan/trx.ts`, `routers/auth/trx.ts`, `pages/api/xdr.ts`, and `lib/stellar/*` (action-token, auth, bounty, fan, map, marketplace, music, oz, walletBalance, `uni_create_asset.ts`). One `quote()` returns the breakdown the UI shows. Server signing (`MOTHER_SECRET`, `TREASURY_SECRET`, `STORAGE_SECRET`, `RUBY_ACCOUNTS_SECRET`) lives in `chain/server` only.
- Network: `NEXT_PUBLIC_STELLAR_PUBNET` (legacy) → `NEXT_PUBLIC_STELLAR_NETWORK=testnet|mainnet`; dev uses the values from the actionverse dev env.
- Platform asset: `NEXT_PUBLIC_ASSET_CODE` / `NEXT_PUBLIC_ASSET_ISSUER`, unchanged.
- `lib/stellar/beam.ts` is dropped.

---

## 16. Quality, CI and delivery

- CI (GitHub Actions): `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` with turbo cache; contracts job runs `cargo test`.
- Unit tests: every service, `chain` quote maths, `ar-core`, `gallery-core` layout, migration mappers, `assert-safe-target`.
- E2E (Playwright, testnet): sign in with a test wallet; buy a drop; join a bounty and submit proof; claim a pin (mocked geolocation); walk a gallery room; homepage scroll visual snapshots at 0/25/50/75/100 %.
- Env validation per app with `packages/env` (Zod), so missing keys fail the build.
- Observability: pino JSON logs, `ActivityLog`, Sentry for apps and worker.
- Deploy: web/org/ar/gallery on Vercel (one project per app, root `apps/<app>`), worker on Docker. `docs/DEPLOYMENT.md` documents DNS for the four subdomains.
- Performance: Lighthouse ≥ 90 performance on `web` home and drop pages (mobile).

---

## 17. Phases with task checklists

Rule: before starting a phase, write `docs/plans/NN-<name>.md` with its detailed design and get the owner's OK on anything that changes §2. Tick items here as they land.

### Phase 0: Scaffold

- [ ] `git init`, `.gitignore` (env files, `.next`, `.turbo`, `node_modules`, hero frames), `.nvmrc` (20.19+), `README.md`.
- [ ] Root `package.json` (scripts: dev, dev:web/org/ar/gallery/worker, build, lint, typecheck, test, format, db:*), `pnpm-workspace.yaml` with catalog, `turbo.json`.
- [ ] `tooling/{eslint,prettier,typescript,vitest}` incl. `max-lines`, no-cross-app imports, `server-only` boundaries, banned `throw new Error`.
- [ ] Empty `apps/web|org|ar|gallery` (Next 16) that boot on ports 3000 to 3003; `apps/worker` with `/health`.
- [ ] `packages/errors`, `utils`, `env` skeletons.
- [ ] `scripts/env-from-legacy.ts` → writes app env files from actionverse envs (Appendix C), never printing values.
- [ ] CI workflow green.
- **Done when:** `pnpm dev` runs all five apps and CI passes.

### Phase 1: Schema

- [ ] `docs/plans/01-schema.md`: a column-by-column map from legacy to new for all models.
- [ ] `packages/db`: `prisma.config.ts`, the 12 schema files (§8.3), client export (`/server`), `assert-safe-target.ts`.
- [ ] Create the new dev database `action_tokens_dev` (Neon). First migration.
- [ ] Seed script (dev only) with demo orgs, drops, bounties, pins and a gallery.
- **Done when:** `prisma migrate dev` is clean, the guard tests pass, and the owner has reviewed the schema doc.

### Phase 2: Design system + preview

- [ ] Sample the final accent from video frames; lock tokens.
- [ ] `packages/ui`: tokens, fonts, primitives, HUD, feedback components (§12.5).
- [ ] `packages/motion`: Lenis provider, reveal, glitch, `Stamp`.
- [ ] `/design` preview page (desktop + phone).
- **Done when:** the owner approves the look.

### Phase 3: Homepage hero

- [ ] `scripts/build-hero-frames.ts` (frames, sizes, AVIF/WebP, depth, logo mask, manifest, S3 upload).
- [ ] `useFrameSequence`, `ScrollScrub`, `HeroCanvas` (shader, particles, post-processing), adaptive quality, fallbacks.
- [ ] Storyboard copy and CTAs; sections 1 to 7 with mock data.
- **Done when:** the budgets in §13.6 are met and the owner approves.

### Phase 4: Core packages

- [ ] `auth` (NextAuth on `.action-tokens.com`, wallet signature, Firebase custodial, email).
- [ ] `wallet` (port `package/connect_wallet` + legacy providers).
- [ ] `storage`, `stellar`, `chain` (all builders + `quote()`), `contracts` (copy + bindings), `geo`, `map`, `ar-core`.
- [ ] `api` skeleton: context, procedures, activity log, root routers.
- **Done when:** sign-in works with every wallet type on testnet and the chain tests pass.

### Phase 5: Data migration

- [ ] Owner commits or stashes the legacy uncommitted changes.
- [ ] `migrate-legacy` steps 01 to 14, `LegacyIdMap`, `--dry-run`, `--since`.
- [ ] Dry run against legacy dev → fix orphans → full run into `action_tokens_dev`.
- [ ] Checks + `docs/migration-report.md`.
- **Done when:** the report's counts and money totals match.

### Phase 6: Web app

- [ ] HUD shell, dock, ACT sheet, ⌘K.
- [ ] Drops (marketplace, drop page, collections, resale, buy flow with TxSheet).
- [ ] Bounties (board, page, join, submit proof, joined list).
- [ ] Crews; organization page with widgets; music; stash; rep card; wallet/recharge; notifications; settings; rewards; info pages.
- [ ] Homepage wired to real data.
- **Done when:** every web route in Appendix A has parity.

### Phase 7: Command Center + admin

- [ ] Onboarding wizard; all org modules in §14.2; `/admin`.
- **Done when:** every org/admin route in Appendix A has parity.

### Phase 8: AR app

- [ ] Map, nearby sheet, AR collect, QR, action-cam, collection, embed.
- **Done when:** a pin can be claimed end to end on a real phone (testnet).

### Phase 9: Gallery app

- [ ] `gallery-core` port + split; gallery app routes; phonk restyle; "Collect this" links.
- [ ] Gallery editor in the Command Center.
- **Done when:** every migrated gallery renders with the same rooms and pieces.

### Phase 10: Worker

- [ ] Job table + runner + schedule; every job in §14.5; dead-letter view in `/admin`.
- **Done when:** jobs run on staging for 7 days with no dead letters.

### Phase 11: Hardening (+ Rep/XP if approved)

- [ ] E2E suite, security review (auth, upload rules, signing paths), accessibility pass, Lighthouse.
- [ ] Rep/XP feature (§11.6), only if Q4 is approved.
- **Done when:** CI is green and Lighthouse ≥ 90.

### Phase 12: Cutover

- [ ] Follow §18.

---

## 18. Cutover

1. `pg_dump` the legacy production DB to S3 and verify the restore (read-only on the source).
2. Create the new production DB (Q2) and run `prisma migrate deploy` (with the guard).
3. Full `migrate-legacy` from legacy prod (read-only) → new prod. Review the report.
4. Announce a maintenance window. Put legacy actionverse and gallery into **read-only mode** (a maintenance banner; writes disabled in the app; no data is changed).
5. Delta run `migrate-legacy --since <step 3 start>`. Review the report again.
6. Point DNS: `app.`, `org.`, `ar.`, `gallary.` `.action-tokens.com`; bare domain → `app.`.
7. 301 redirects from legacy paths (Appendix A).
8. Keep the legacy DB untouched for at least 30 days. The owner decides when to archive it; it is never dropped by this project.
9. Owner rotates the secrets carried over from the legacy env files.

---

## 19. Progress tracker

| Phase | Status | Notes |
| ----- | ------ | ----- |
| Plan  | done (2026-11-19) | this file |
| Homepage mockup | in review (2026-11-19) | `docs/mockups/home.html`; serve with `python3 -m http.server 4173` in `docs/mockups`; `?hold` keeps the boot loader on screen |
| 0 Scaffold | not started | |
| 1 Schema | not started | |
| 2 Design system | not started | |
| 3 Homepage hero | not started | |
| 4 Core packages | not started | |
| 5 Data migration | not started | |
| 6 Web app | not started | |
| 7 Command Center + admin | not started | |
| 8 AR app | not started | |
| 9 Gallery app | not started | |
| 10 Worker | not started | |
| 11 Hardening | not started | |
| 12 Cutover | not started | |

---

## 20. Decision log and open questions

### Log

| Date | Decision |
| ---- | -------- |
| 2026-11-19 | New repo `actiontokens`; legacy repos untouched. |
| 2026-11-19 | Migrate all data; production data is never erased. |
| 2026-11-19 | Drop Christmas/seasonal and Beam + game; keep everything else. |
| 2026-11-19 | Gallery is its own app. |
| 2026-11-19 | Neon-green phonk look; UI/UX unique to ActionTokens (bandcoin is the engineering reference only). |
| 2026-11-19 | Domains `app.` / `org.` / `ar.` / `gallary.` `.action-tokens.com`. |
| 2026-11-19 | Reuse actionverse env values for dev and prod for now; the owner replaces them later. |
| 2026-11-19 | New schema lives in a new database next to the legacy one (§4.2), because renaming tables in place would alter production data. |
| 2026-11-19 | Homepage mockup `docs/mockups/home.html` reviewed. Sidebar appears after the hero on desktop; dock on phones; Maggie-style boot loader (§11.3). Performance rules in §12.6. |
| 2026-11-19 | Sidebar restyled with the phonk fonts (Faster One sections, Bungee labels, Bungee Shade level/ACT) Explore as list rows (a tile grid was tried and rejected); organizations show 4 per row. |
| 2026-11-19 | Bottom nav (dock) removed: ACT moves into the header island; phones get a sidebar drawer from a header menu button. |
| 2026-11-19 | Second mockup round: header becomes a notch / Dynamic Island with live activity; sidebar redesigned as a floating panel with rep card and icon tiles; loader font picked: Bungee Shade, one line ACTIONTOKENS, no logo; glimmer sweep with a Silkscreen pixel-glyph flash added (rejected: custom glyphs with an O face, Grenze Gotisch + pin logo); richer organization cards (§11.3, §11.4). |

### Open questions (ask the owner when the phase needs them)

- **Q1 (Phase 0):** Is `gallary.action-tokens.com` spelled as intended, or should it be `gallery.`?
- **Q2 (Phase 1 dev, Phase 12 prod):** OK to create a new database next to the legacy one: `action_tokens_dev` in the Neon project, and `action_tokens` on the existing production Postgres host (or a new Neon project)?
- **Q3 (Phase 2):** Final font choice after the preview (Anton/Unbounded/UnifrakturCook/Onest).
- **Q4 (Phase 11):** Build the Rep/XP feature (§11.6)?
- **Q5 (Phase 14.5):** Where should the worker run: Railway, Fly, or the existing EC2 + PM2 that runs express-wadzzo?

---

### 2026-11-20: fork Bandcoin instead of building from scratch

Owner asked to compare features and fork Bandcoin with a new UI/UX plus the extra Actionverse features, to avoid
re-writing most files. Analysis: Bandcoin's legacy migration already covers 66 of 87 Actionverse tables; extras
are Communities, the 3D gallery, holder rewards and Telegram broadcast. Details and phases: FORK-PLAN.md.

## Appendix A: legacy → new route map

| Legacy (actionverse / gallery) | New | 301 |
| ------------------------------ | --- | --- |
| `/` | `app./` | – |
| `/marketplace` | `app./drops` | yes |
| `/asset/[id]`, `/market-asset/[id]`, `/nft/[id]` | `app./drops/[slug]` | yes |
| `/nft/manage` | `org./drops` | yes |
| `/action/collections`, `/action/collections/[id]` | `app./drops/collections/[slug]` | yes |
| `/bounty`, `/bounty/[id]`, `/bounty/joined` | `app./bounties`, `/bounties/[id]`, `/bounties/joined` | yes |
| `/bounty/create`, `/bounty/edit/*` | `org./bounties/new`, `/bounties/[id]/edit` | yes |
| `/community`, `/community/[id]`, `/community/activity` | `app./crews`, `/crews/[slug]`, `/crews/activity` | yes |
| `/organization/[id]`, vanity URLs | `app./org/[slug]` (vanity kept as `app./[vanity]`) | yes |
| `/action/organizations` | `app./orgs` | yes |
| `/music`, `/music/album/*` | `app./music`, `/music/album/[id]` | yes |
| `/my-collection` | `app./stash` | yes |
| `/wallet-balance`, `/recharge` | `app./wallet`, `/wallet/recharge` | yes |
| `/notification`, `/settings` | `app./notifications`, `/settings` | yes |
| `/reward-checker`, `/action/home`, `/action/profile` | `app./rewards`, `/me` (rep card) | yes |
| `/about`, `/privacy`, `/support` | same on `app.` | – |
| `/pins`, `/action/ar`, `/action/qr/*`, `/action/actions/*` | `ar./map`, `ar./collect`, `ar./scan`, `ar./actions/[id]` | yes |
| `/organization/home`, `/profile`, `/new-profile`, `/create` | `org./`, `org./settings/profile`, `org./onboarding` | yes |
| `/organization/{classic-nft,non-stellar-item,smart-contract,sell-page-asset,store}/*` | `org./drops/*` | yes |
| `/organization/{map,map/collection-report,qr,redeem,gift,post,music,settings}` | `org./pins`, `/pins/reports`, `/qr`, `/codes`, `/gifts`, `/posts`, `/music`, `/settings` | yes |
| `/smart-contract/*` | `org./drops/contract/*` | yes |
| `/admin/*` | `org./admin/*` | yes |
| gallery `/museum/[id]` | `gallary./[orgSlug]` | yes |
| gallery `/settings` | `org./gallery` | yes |
| `/beam/*`, `/api/game/*`, `/test`, `/albedo` | removed (`/albedo` callback moves into `packages/wallet` if still required) | 410 |

## Appendix B: legacy code → new location map

| Legacy | New |
| ------ | --- |
| `src/server/db.ts`, `prisma/` | `packages/db` |
| `src/server/auth.ts`, `pages/api/auth` | `packages/auth` + each app's `app/api/auth/[...nextauth]/route.ts` |
| `src/server/s3.ts`, `lib/s3-upload.service.ts`, `routers/s3.ts`, `pages/api/file.ts` | `packages/storage` |
| `src/server/image-optimizer.ts` | `packages/storage` + worker `media.process` |
| `src/server/api-cors.ts` | per-route CORS helper in `packages/api` |
| `src/server/services/lastfm.ts`, `pages/api/lastfm` | `packages/api/services/lastfm` + `web` route handlers |
| `src/server/api/routers/*` | `packages/api/src/{routers,services}` (§10) |
| `src/lib/stellar/*` | `packages/chain` (builders) + `packages/stellar` (reads) |
| `src/lib/augmented-reality/*` | `packages/ar-core` + `apps/ar/features/ar` |
| `src/lib/action-cam/*` | `packages/ar-core/action-cam` (validation) + `apps/ar/features/action-cam` |
| `src/lib/bounty/*`, `lib/state/bounty-create-store.ts` | `apps/web/features/bounties`, `apps/org/features/bounties` |
| `src/lib/state/*` (Zustand) | feature-local stores, or replaced by tRPC/React Query state |
| `src/lib/express/*` | `apps/worker` jobs (`agent.run`, `pin.batchCreate`, `hotspot.drop`) |
| `src/lib/telegram/*` | `packages/api/services/telegram` + worker |
| `src/lib/qstash.ts` | worker queue (QStash only for webhook verification if needed) |
| `src/lib/usdc.ts`, `lib/defaults.ts`, `lib/common.ts`, `lib/utils.ts`, `lib/helper` | `packages/utils` / `packages/chain` |
| `src/trigger/*` | `apps/worker` |
| `src/components/shadcn/*` | rebuilt in `packages/ui` (new design, not copied) |
| `src/components/layout/*` | replaced by the HUD (web) and Mission rail (org); not ported |
| `src/components/{bounty,community,creator,nft,nft-create,music,player,post,store,widget,map,ar,action-cam,agent,recharge,reward-checker,payment,notification,wallet-balance,upload,3d-model,smart-contract,modal}` | feature folders in the matching app (Appendix A), split under 1000 lines |
| `src/components/{christmas,beam}` | dropped |
| `src/components/common/home-video-player.tsx` | replaced by the hero (§13) |
| `package/connect_wallet` | `packages/wallet` |
| `package/express-wadzzo` | `apps/worker` |
| `contracts/*` | `packages/contracts` |
| gallery `components/exhibition/*` | `packages/gallery-core` |
| gallery `routers/gallery.ts` | `packages/api` `gallery*` routers |
| gallery `pages/settings.tsx` | `apps/org/features/gallery-editor` |

## Appendix C: env key map

Values are copied from actionverse's `.env.development` (dev) and `.env.production` (prod) by `scripts/env-from-legacy.ts`. Never commit them.

| Legacy key | New key | Used by |
| ---------- | ------- | ------- |
| `DATABASE_URL` | `LEGACY_DATABASE_URL` (read-only) | db scripts |
| new | `DATABASE_URL` (new database, §4.2) | all apps, worker |
| `NEXTAUTH_SECRET` | `NEXTAUTH_SECRET` (shared) | web, org, ar, gallery |
| `NEXTAUTH_URL` | `NEXTAUTH_URL` (per app) | each app |
| `NEXT_PUBLIC_URL`, `NEXT_PUBLIC_HOME_DOMAIN` | `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_ORG_URL`, `NEXT_PUBLIC_AR_URL`, `NEXT_PUBLIC_GALLERY_URL`, `NEXT_PUBLIC_HOME_DOMAIN` | all |
| `NEXT_PUBLIC_TITLE`, `_SITE`, `_KEYWORD`, `_DESC`, `_ICON`, `_PLATFORM_CREATOR_TERM` | same, except `PLATFORM_CREATOR_TERM` defaults to "Organization" | all |
| `NEXT_PUBLIC_STELLAR_PUBNET`, `NEXT_PUBLIC_STAGE` | `NEXT_PUBLIC_STELLAR_NETWORK`, `NEXT_PUBLIC_STAGE` | all |
| `STORAGE_SECRET`, `MOTHER_SECRET`, `TREASURY_SECRET`, `RUBY_ACCOUNTS_SECRET` | same | chain/server (web, org, worker) |
| new | `CHAIN_SECRET_KEY` (AES key for `ChainAccount`) | db migration, chain/server |
| `NEXT_PUBLIC_ASSET_CODE`, `NEXT_PUBLIC_ASSET_ISSUER` | same | all |
| `NEXT_PUBLIC_NFT_MARKETPLACE_CONTRACT_ID` | same | web, org |
| `PINATA_JWT` | same | org, worker |
| `SQUARE_ACCESS_TOKEN`, `SQUARE_ENVIRONMENT`, `NEXT_PUBLIC_SQUARE_APP_ID`, `NEXT_PUBLIC_SQUARE_LOCATION` | same | web, worker |
| `NEXT_PUBLIC_AUTH_*` (Firebase client) | `NEXT_PUBLIC_FIREBASE_*` | all web apps |
| `FIREBASE_ADMIN_PRIVATE_KEY`, `FIREBASE_ADMIN_CLIENT_EMAIL` | same | auth |
| `TRIGGER_SECRET_KEY` | dropped after Phase 10 | – |
| `NEXT_PUBLIC_GOOGLE_MAP_API_KEY`, `NEXT_PUBLIC_MAPBOX_API` | `NEXT_PUBLIC_GOOGLE_MAPS_KEY`, `NEXT_PUBLIC_MAPBOX_TOKEN` | ar, org, web |
| `NEXT_PUBLIC_NODEMAILER_USER`, `NEXT_PUBLIC_NODEMAILER_PASS` | `SMTP_USER`, `SMTP_PASS` (server-only) | api, worker |
| `NEXT_AWS_BUCKET_NAME`, `_BUCKET_REGION`, `_ACCESS_KEY`, `_SECRET_ACCESS_KEY` | `AWS_S3_BUCKET`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | storage |
| `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY` | same (only if webhooks remain) | worker |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | api |
| `OPENAI_API_KEY`, `GEMINI_API_KEY` | same | worker, org |
| `ACTION_CAM_HMAC_SECRET` | same | ar, api |
| `NEXT_PUBLIC_LASTFM_API_KEY`, `NEXT_PUBLIC_LASTFM_API_SECRET`, `NEXT_PUBLIC_LASTFM_CALLBACK_URL` | `NEXT_PUBLIC_LASTFM_API_KEY`, `LASTFM_API_SECRET` (server-only), `LASTFM_CALLBACK_URL` | web, api |
| `UPLOADTHING_SECRET`, `UPLOADTHING_APP_ID`, `PRISMA_CLI_BINARY_TARGETS`, `NEXT_PUBLIC_LOG_ENABLE` | dropped (`LOG_LEVEL` replaces the last) | – |
