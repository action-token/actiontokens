# ActionTokens: fork Bandcoin, add the Actionverse extras

> **Status:** analysis done and owner decisions recorded on 2026-11-20 (§6). Fork (phase F0) is starting. **Backend first, UI/UX later.**
> **Changes the strategy in [PLAN.md](PLAN.md):** instead of writing a new monorepo from scratch, ActionTokens
> starts as a **copy of the Bandcoin monorepo** (`/Volumes/Data/Projects/bandcoin`, commit `430af8b`), gets the
> new ActionTokens UI/UX, and then gains the few features Actionverse has that Bandcoin does not.
> Everything in PLAN.md about data safety (§4), the design system (§12), the homepage (§13), domains and
> cutover still applies. Its schema/API/migration sections are replaced by what Bandcoin already has.

---

## 1. Why fork

Bandcoin and Actionverse come from the same original codebase. Bandcoin has already been rebuilt into
exactly the stack PLAN.md targets (Turborepo + pnpm, Next 16 App Router, React 19, Tailwind 4, tRPC 11,
Prisma 7 split schema, Soroban contracts, a worker instead of Trigger.dev). Most importantly, **its legacy
data migration (`packages/db/scripts/migrate-legacy/`) already understands 66 of Actionverse's 87 tables**,
because Bandcoin's old database had the same shape.

| | Files (ts/tsx) | Notes |
|---|---|---|
| Actionverse (`src/`) | 635 | Next 14 Pages Router, one app, Trigger.dev, one 87-model schema |
| gallery-actiontokens | 107 | Next 14 + three.js / react-three-fiber 8 |
| Bandcoin (`apps/` + `packages/`) | 1,558 | 5 apps, 15 packages, 105 models, tests, worker |

Writing ActionTokens from scratch would mean re-creating most of those 1,558 files. Forking means
**reskinning and extending** them instead.

## 2. Feature comparison

### 2.1 Same feature in both (comes free with the fork)

| Area | Actionverse | Bandcoin equivalent |
|---|---|---|
| Organizations / artists | `Creator`, `Subscription`, `Follow`, `TemporalFollow`, `VanitySubscription`, `Widget`, `Appearance` | `Artist`, `MembershipTier`, `Follow`, `VanityUrl`/`VanityPayment`, `PageLayout`/`PageWidget` (artist portal) |
| Org token | `CreatorPageAsset`, `SellPageAsset` | artist token + hold-token flow |
| Items / NFTs | `Asset`, `Nft*`, `NftToken`, smart-contract NFTs, classic NFTs, non-Stellar items | `Item`, `ClassicToken`, `ContractNft`, `NftEdition`, off-chain items |
| Marketplace | `MarketAsset`, `NftListing`, `NftPurchase`, `User_Asset`, resale, card checkout | `Listing`, `Order`, `Ownership`, resale, card + guest checkout |
| Locked content | `NftLockedMedia`, `NftUnlockLocationRule/Point` | `LockedContent`, `UnlockRule`, `UnlockPoint` |
| NFT collections + likes | `Collection`, `CollectionLike`, `NftLike` | `ItemCollection`, `CollectionLike`, `ItemLike` |
| Bounties (incl. music tracks, Action Cam captures, winners) | `Bounty*` (9 tables) | `bounty.prisma` (9 tables), Action Cam capture |
| Map pins / AR | `Location*`, `Hotspot`, `GeoCache`, pin consume via QR | `Pin*`, `Hotspot`, `GeoCache`, AR app scan/claim, admin pin map |
| Posts / feed | `Post`, `Comment`, `Like`, `Media`, `PostGroup`, `PostCollection` | `Post`, `PostComment`, `PostLike`, `PostMedia`, `PostCollectible` |
| Music | `Song`, `Album`, `User_Song`, Last.fm | `Track`, `Album`, Last.fm |
| Notifications | `Notification`, `NotificationObject` | `NotificationEvent`, `Notification` |
| Redeem codes, gifts | `Redeem`, `RedeemConsumer`, gift page | `RedeemCode`, `RedeemClaim`, gifts |
| Wallet | wallet balance, trustlines, claimable balances, platform asset, recharge | wallet view, trustlines, claimable balances, recharge |
| AI agent (pins, descriptions, tags) | `AgentJob`, `agent.ts`, tag AI | `AgentJob`, artist AI/agent, AI tags |
| Admin | creators, users, bounties, pins, map reports, platform fee, admins | artist portal `/admin/*` (artists, users, bounties, pins, maps, reports, settings, jobs, alerts…) |
| Jobs | Trigger.dev tasks | `apps/worker` (job table + runner + schedule) |

### 2.2 Only in Actionverse (must be ported)

| # | Feature | Actionverse source | Tables | Port as |
|---|---|---|---|---|
| E1 | **Communities**: token-gated groups (asset + min balance, AND/OR), members, posts with media and likes, comments, activity feed, per-member notification settings, trending | `routers/community/*` (5 routers), `pages/community/*` | `Community`, `CommunityMember`, `CommunityPost`, `CommunityPostMedia`, `CommunityPostLike`, `CommunityComment`, `CommunityActivity`, `CommunityNotificationPreference`, `CommunityTokenRequirement` | `community.prisma`, `routers/app/community.ts` (+ org/admin moderation), app pages `/crews/*` (the "Crews" of PLAN.md §11) |
| E2 | **3D gallery / museum**: per-org rooms, artwork slot overrides, slot likes, gallery music/title | `gallery-actiontokens` repo (107 files), gallery models | `CreatorGallery`, `MuseumRoom`, `GallerySlotOverride`, `GallerySlotLike` | `gallery.prisma`, `routers/gallery/*`, new `apps/gallery` (gallary.action-tokens.com), port r3f 8 → 9 / React 19 |
| E3 | **Holder rewards**: monthly "origin" rewards and quarterly rewards paid to token holders, block lists, distribution status, retries | `action-token/checker.ts` (17 procedures), `trigger/{distribute,quarter-reward,status}.ts`, `reward-checker` page | `OriginReward`, `QuarterReward`, `OriginBlockedUser`, `QuarterBlockedUser` | `rewards.prisma`, admin pages in the org portal, worker jobs (replace Trigger.dev) |
| E4 | **Telegram broadcast**: admin sets a bot token + channel; events are posted to Telegram | `admin/telegram.ts` | `TelegramConfig` | an admin setting + a worker notifier (secret stays server-side) |
| E5 | **ActionTokens UI/UX** | PLAN.md §11–13, `docs/mockups/home.html` | — | new design system and screens on top of the forked apps |

### 2.3 Dropped (owner decision, 2026-11-19)

- **Beam** (`beam.ts`, `Beam`, `BeamComment`, `BeamReaction`, `/beam/*`).
- **Game** router and seasonal/Christmas content. The game router also powers Actionverse's pin
  collecting (`consumePin`, `getPins`); Bandcoin's AR app (scan/claim) replaces that. See Q3 in §6 about
  `/api/game/*`, which looks like it serves a native mobile app.

### 2.4 Only in Bandcoin (decide per item: §6 Q1)

Music-centric: **Studio app** (AI music/image/video/writing generation, credits), **Stem lab** and stem
mixing, **playlists**, play events, track favourites.
General: **stories**, **events + RSVPs + announcements**, **murals** (AR wall art with scan sessions), **coins**
(AR coin balance/ledger), **royalty reports and payouts**, **custom domains + vanity URLs**, **map embeds**,
**MCP tokens** (AI tools for artists), **Facebook connection**, admin alerts/jobs/activity log.

## 3. Fork procedure

1. **Copy** Bandcoin at `430af8b` into `/Volumes/Data/Projects/actiontokens` (keeping `docs/`). Keep git
   history with Bandcoin as an `upstream` remote so fixes to shared packages can be cherry-picked (Q2).
2. **Rename the workspace**: `@bandcoin/*` → `@actiontokens/*`; app names; README; env keys per PLAN.md App. C.
3. **Rename the domain language** with a codemod, before any other change, so later diffs stay clean:
   Artist → Organization (`artist` → `org` in routes: `/artist/[slug]` → `/org/[slug]`), artist portal →
   org portal. DB: rename models in the new schema (the new database is empty, so no `@@map` needed).
4. **Remove** what §6 Q1 drops (apps, routers, schema files, worker handlers, nav entries, tests).
5. **Apps**: `app` → `web` (app.action-tokens.com), `artist` → `org` (org.action-tokens.com, incl. `/admin`),
   `ar` → `ar` (ar.action-tokens.com), `worker` stays, new `gallery` (gallary.action-tokens.com).
6. **Env**: reuse Actionverse values (PLAN.md §4). The new schema goes into a **new database**; the Actionverse
   database is only ever read (`LEGACY_DATABASE_URL`, read-only session). Guards from PLAN.md §4.3 apply.
7. **Data migration**: point Bandcoin's `migrate-legacy` at the Actionverse database. Diff Actionverse's
   columns/enums against what the scripts expect (same family, but Actionverse has drifted), patch the
   steps, then add steps for E1–E4 tables. Dry run → verify counts → real run into the new database.
8. **Port E1–E4** (§2.2), each as schema file + router + pages + tests.
9. **New UI/UX** (E5): replace Bandcoin's theme tokens/fonts with the neon-green phonk system, the notch
   header, floating sidebar, homepage hero and loader from PLAN.md §11–13. Reuse component logic; restyle.
10. Quality gates and cutover as in PLAN.md §16–18.

## 4. Phases (backend first, UI/UX last)

| Phase | Work | Done when |
|---|---|---|
| F0 | Clone Bandcoin with history into `actiontokens` (`upstream` remote), keep `docs/`, install, build, tests green | `pnpm build && pnpm test` pass with unchanged Bandcoin behaviour |
| F1 | Drop the features in §6 Q1 (AI studio app and studio credits); rename workspace `@bandcoin/*` → `@actiontokens/*`; domain rename Artist → Organization in schema, API and routes (codemod) | typecheck/tests green; no studio code left |
| F2 | New database + env + safety guards (PLAN.md §4); `migrate-legacy` dry run against Actionverse (read-only) | dry-run report with counts per table; no writes to legacy |
| F3 | E1 Communities: schema, routers, token-gate check, worker notifications, tests | create/join/post in a token-gated community via the API |
| F4 | E3 holder rewards + E4 Telegram: schema, admin routers, worker jobs replacing Trigger.dev | a dry-run distribution on testnet; Telegram test message |
| F5 | E2 gallery backend: schema, routers (rooms, slots, likes, music), data migration steps | gallery data for a migrated org readable via the API |
| F6 | Real data migration into the new database, verification, QA | per-table counts match; PLAN.md §9 checks pass |
| F7 | **UI/UX (later):** design system, shell, homepage, loader, key screens; gallery app port (r3f 8 → 9 / React 19) | design review against the mockups |
| F8 | Cutover | PLAN.md §18 checklist |

### Progress

| Phase | State |
|---|---|
| F0 | **Done 2026-11-20.** `/Volumes/Data/Projects/actiontokens` is a clone of Bandcoin `430af8b` with full history. Remote `upstream` = Bandcoin (push disabled); no `origin` yet. `pnpm install`, `db:generate`, `typecheck` (19/19) and `test` (20/20, 1,241 API tests) all green. |
| F1 | **Step 1 done 2026-11-20: AI studio removed.** Deleted `apps/studio`, studio routers/services/tests/scripts, `studio.prisma` (kept the agent models in `agent.prisma`), the `STUDIO_COINS` order kind, studio admin pages, alerts, overview/person stats, worker `studio.*` jobs and the live-music relay (and the `ws` dependency). `migrate-legacy` now copies only the agent tables (`steps-bounty.ts`, `copyAgent`). Typecheck 18/18, lint 0 errors, tests green (API 1,138). **Left for F2:** the init migration still creates the studio tables, so regenerate it for the new database. **Step 2 done: workspace scope renamed `@bandcoin/*` → `@actiontokens/*` (911 files, root package `actiontokens`; brand text and emails untouched until the UI phase). Typecheck, lint and all tests green.** **Artist → Organization, step 1 done: `apps/artist` → `apps/org` (`@actiontokens/org`), sign-in app name `"org"`, env `NEXT_PUBLIC_ORG_URL` / `ORG_APP_ORIGINS`, `dev:org`, `site.urls.orgPortal`. Hostnames (still `artist.bandcoin.io` defaults) change at deploy time. Green.** **Step 2 done: database model `Artist` → `Organization`** (`organizations` table, `organizationId` columns, `ArtistStatus` → `OrganizationStatus`, relation fields `artist` → `organization`; `artist.prisma` → `organization.prisma`), with raw SQL and the `migrate-legacy` scripts updated. The 42 Bandcoin migrations were **collapsed into one fresh init migration** (`20261120000000_init`, 100 tables) since ActionTokens has its own database; later upstream migrations must be re-diffed, not copied. Kept on purpose for the UI phase: the `artist.*` tRPC routers and hand-built API output keys named `artist`, `artistName` (a song's credited artist), the S3 key owner `"artists"` (existing media paths) and visible wording. Green. **Next:** F2 (see below). |
| F2 | **Started 2026-11-20.** Done: local Postgres 17 in Docker (`pnpm db:up`, `127.0.0.1:55432`, db `actiontokens_dev`); the init migration applies cleanly and `prisma migrate diff` shows no drift; the demo seed runs end to end (9 users, 4 organizations, 14 items). **Safety guard** `packages/db/scripts/guard.ts` replaces every hard-coded Bandcoin host check (seed scripts, testnet scripts, e2e, legacy copy): destructive scripts run only on a local database or a host listed in `ALLOW_DESTRUCTIVE_HOSTS`, never on `PROTECTED_HOSTS`; the legacy DB is opened read-only and never when it equals `DATABASE_URL`; `--cutover` needs `CUTOVER_ALLOWED_HOSTS` + `CUTOVER_CONFIRM=<host>`. **Env done 2026-11-20:** `node scripts/import-actionverse-env.mjs <actionverse repo>` builds root `.env.development` / `.env.production` (every variable the apps expect; values from Actionverse, missing ones empty) plus per-app `.env.development.local` / `.env.production.local` and `packages/db/.env`. Values are never printed; all files are gitignored. The Actionverse DBs are only `LEGACY_*_DATABASE_URL` (read only) and in `PROTECTED_HOSTS`; development `DATABASE_URL` is the local Docker DB and production `DATABASE_URL` is empty until the new production DB exists. **Actionverse databases (checked read-only 2026-11-20):** two Neon databases (hosts and credentials live only in the gitignored `packages/db/.env.legacy`). *Dev* (`ep-crimson-sea`): 88 tables, 32 users, 5 creators, 1 community, 14 locations, 18 migrations. *Prod* (`ep-floral-sky`): 88 tables, 58 users, 8 creators, 1 community, 51 locations, 19 migrations. Note: Actionverse's own `.env.production` points at a different server (a raw IP), so the Neon URL supplied by the owner is the one used; all three hosts are in `PROTECTED_HOSTS`. **Separation from Bandcoin:** no Bandcoin env value was copied, but Actionverse already shared Firebase, `NEXTAUTH_SECRET`, Square, `RUBY_ACCOUNTS_SECRET` and the Stellar treasury key with Bandcoin, so ActionTokens inherits that; Bandcoin hostnames, emails, stellar.toml and social links in the source were replaced with the `action-tokens.com` ones Actionverse uses (`app.`, `org.`, `ar.` subdomains; `support@` etc.; Facebook/Instagram `actiontokens`; issuer home domain `app.action-tokens.com`). **Dry run:** connects read-only to the Actionverse dev DB but stops at the first check that assumes Bandcoin's old schema (`column "deletedAt" does not exist`): the `migrate-legacy` checks and copy steps must be adapted to Actionverse's real tables (next task). **Still open:** the real new-production-database host, and `NFT_CONTRACT` / `ESCROW_CONTRACT` (Actionverse's Soroban contract differs from Bandcoin's). **Known gap:** `MUST_BE_EMPTY` and the copy steps were written for Bandcoin's old `bandfan` schema and have not been checked against Actionverse's; the dry run will show the differences. |
| F2–F8 | Not started. |

## 5. What this saves

- Schema, API, worker, auth, wallet, chain, contracts, storage, AR, map and most admin: reused as is.
- Data migration: ~76% of tables already scripted.
- New code limited to: E1–E4 (≈ 4 schema files, ~6 routers, ~25 pages), the gallery app port, and the UI layer.

## 6. Owner decisions (2026-11-20)

- **Q1 Bandcoin-only features.**
  - **Keep:** events + RSVPs + announcements, stories; custom domains, vanity URLs, map embeds; murals and AR coins.
  - **Keep (music basics):** songs, albums, playlists, favourites, play events.
  - **Drop:** the AI **Studio** app and its credits ("studio coins"), generation jobs, packages.
  - **Dependency check (F0, 2026-11-20) corrected my first assumption:**
    - **Keep the pin/hotspot AI agent** (`AgentJob`, `AgentConversation`, `AgentMessage`, `AgentAction`, `services/agent`,
      artist agent UI, worker agent handler). It is the Actionverse `agent.ts` equivalent, not the AI studio.
    - **Keep the fan stem lab** (`ItemStem`, `apps/app` stem-lab, player stem mode, worker transcode): it is part of songs/player.
    - **Drop with the studio:** `apps/studio`, `routers/studio/*`, `root-studio.ts`, `services/studio/*`, `StemProject`,
      `Generation`, `StudioBalance`, `StudioLedgerEntry`, `StudioPackage`, studio pricing/earnings in the admin,
      the studio top-up in `platform-payment`/wallet, worker generation handlers, studio tests and scripts.
    - **Keep unrelated "studio" names:** the pin *shape studio* in the org portal (`pins/studio`, `shapes`) is a drawing tool.
    - *Royalty reports and payouts*, *MCP tokens* and the *Facebook connection* stay until the owner says otherwise.
- **Q2 Git:** fork **with history**; `bandcoin` stays as an `upstream` remote.
- **Q3 `/api/game/*`:** **dropped**; the AR app replaces it.
- **Q4 Order:** **backend first**, UI/UX later (phases above).
