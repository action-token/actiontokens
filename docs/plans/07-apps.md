# 07 · Apps and routes

## apps/app (fans), `action-tokens.io`

| Route                                    | Page                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------- |
| `/`                                      | Home: hero carousel, trending, new music, top artists, live bounties            |
| `/music`                                 | Music: carousel, genres, "Your items" tab (created + owned, sortable, Play all) |
| `/album/[slug]`                          | Album                                                                           |
| `/marketplace`                           | Every item: tabs by type, search, sort, filters                                 |
| `/item/[slug]`                           | Item page: media, BuyPanel, tier gate, owner actions, other copies for resale   |
| `/artist/[slug]` and `/@vanity`          | Artist page (rendered from their page-builder layout)                           |
| `/u/[username]`                          | Fan profile                                                                     |
| `/collection`                            | Everything I own (bought, received, gifted)                                     |
| `/playlists`, `/playlist/[id]`           | Playlists                                                                       |
| `/bounties`, `/bounty/[id]`              | Bounties: join, submit, track music progress                                    |
| `/feed`                                  | Posts from artists I follow                                                     |
| `/notifications`, `/wallet`, `/settings` | Account                                                                         |
| `/checkout/[orderId]`                    | Guest card checkout result                                                      |

Custom domains are resolved in `proxy.ts` to `/artist/[slug]`.

## apps/artist (artist portal + admin), `artist.action-tokens.io`

| Route                                       | Page                                                                                                                                                                     |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/`                                         | Dashboard: sales, plays, followers, payouts due                                                                                                                          |
| `/onboarding`                               | Become an artist (create page + token)                                                                                                                                   |
| `/catalog`, `/catalog/new`, `/catalog/[id]` | Items (all types, classic or NFT) with one create wizard                                                                                                                 |
| `/music`, `/music/albums/[id]`              | Albums and tracks, stems, preview start point                                                                                                                            |
| `/memberships`                              | Tiers                                                                                                                                                                    |
| `/pins`, `/pins/map`, `/hotspots`           | Pins and hotspots on a map, batch create                                                                                                                                 |
| `/bounties`                                 | Create, fund (escrow), review submissions, pick winners                                                                                                                  |
| `/posts`                                    | Posts and collectible posts, Facebook sync                                                                                                                               |
| `/page`                                     | Page builder (templates, blocks, theme)                                                                                                                                  |
| `/domain`                                   | Vanity URL billing and custom domain                                                                                                                                     |
| `/royalty`                                  | Royalty items, reports, payouts                                                                                                                                          |
| `/gifts`, `/redeem`                         | Gift items, redeem codes                                                                                                                                                 |
| `/settings`                                 | Profile, socials, Last.fm, wallet                                                                                                                                        |
| `/admin/*`                                  | Admins only: artists (approve/ban), users, pins, bounties, fees and settings                                                                                             |
| `/admin/activity`                           | Live activity feed of all user and artist actions: filter by person, role, action, app, status, date; search by tx hash; export CSV                                      |
| `/admin/users/[id]`, `/admin/artists/[id]`  | Person page with an **activity timeline** (sign-ins, purchases, uploads, pin claims, bounty submissions, failed actions) next to their profile, wallet, items and orders |
| `/admin/alerts`                             | Flags worth a look: many failed payments, unusually fast pin claims (location spoofing), many sign-in failures, large transfers                                          |

## apps/ar (pin collecting), `ar.action-tokens.io`

`/` map with nearby pins → `/pin/[id]` details and directions → `/ar/[id]` camera view (3D model, photo, video, audio frames) → claim → `/collection` (claimed rewards, redeem codes) → `/bounties` (location bounties, Action Cam submissions). It uses the boot screen and is mobile-first and installable as a PWA.

## apps/studio (AI tools), `studio.action-tokens.io`

| Route                                 | Page                                                                               |
| ------------------------------------- | ---------------------------------------------------------------------------------- |
| `/`                                   | Studio home: coin balance, recent generations, tools                               |
| `/coins`                              | Top up (Action Tokens swap, USDC/XLM, card, DEX link), ledger, withdraw            |
| `/text`, `/image`, `/music`, `/video` | Generators: prompt, cost shown before running, history                             |
| `/agent`                              | Pin and hotspot AI agent (creates drafts the artist confirms in the artist portal) |
| `/stems`                              | Stem editor (multitrack): load your stems, mix, export a new track to the catalog  |
| `/library`                            | Everything generated: reuse in posts, items, covers                                |

## apps/worker (background jobs)

Express (health and webhooks) plus a DB-backed job queue (`Job` table with `FOR UPDATE SKIP LOCKED`, retries with backoff) and a cron runner.

| Job                                                                       | Was                              |
| ------------------------------------------------------------------------- | -------------------------------- |
| `media.transcode` (AAC stream, 30 s preview, waveform, stems)             | express-wadzzo                   |
| `generation.run` (calls AI providers, uploads output, refunds on failure) | Next API routes `/api/generate*` |
| `agent.run`, `pin.batchCreate`                                            | express agent, LocationGroupJob  |
| `hotspot.drop` (cron)                                                     | QStash                           |
| `studio.reconcileDeposits`, `order.reconcile` (cron)                      | (new)                            |
| `royalty.payoutBatch`                                                     | royalty router                   |
| `vanity.expire` (cron: grace → lapse)                                     | (new)                            |
| `facebook.sync`                                                           | webhook route                    |
| `account.recharge`, `token.swap`                                          | Trigger.dev                      |
