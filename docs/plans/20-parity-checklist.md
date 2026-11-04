# 20 · Parity checklist: bandfan → Bandcoin

Written 2026-11-04 from the file lists of both repos. **"Built" means the page or API exists in the
new apps. It does not mean it was clicked through in a browser**: that check is the last column to
fill in before cutover. Studio (AI tools, mixer, music generation) is out of this list for now.

Legend: ✅ built · 🟡 built, different shape (read the note) · ❓ needs your decision · ⛔ not built · ➖ dropped on purpose

## Fan pages (bandfan `src/pages` → `apps/app`)

| Bandfan | New | Status | Note |
|---|---|---|---|
| `/` | `/` | ✅ | |
| `/marketplace` | `/marketplace` | ✅ | |
| `/music`, `/music/album/[id]` | `/music`, `/album/[slug]` | ✅ | |
| `/playlist/[id]` | `/playlist/[id]`, `/playlists` | ✅ | |
| `/my-collection`, `/collections` | `/collection` | ✅ | |
| `/asset/[id]`, `/market-asset/[id]`, `/nft/[id]`, `/smart-contract/[id]` | `/item/[slug]` | 🟡 | One page for every item kind |
| `/nft`, `/smart-contract` (lists) | `/marketplace` | 🟡 | Filters by kind |
| `/nft/manage/[id]`, `/smart-contract/manage/[id]` | `/item/[slug]` (owner actions), `/wallet` | ❓ | Resale and gifting live on the item page; confirm nothing else was on the manage pages |
| `/artist/[id]` | `/artist/[slug]` | ✅ | Old links by id: see "Old links" below |
| `/[vanityURL]` | `/[vanity]` | ✅ | |
| `/bounty`, `/bounty/[id]` | `/bounties`, `/bounty/[id]` | ✅ | |
| `/creator-feed` | `/feed`, `/feed/[postId]` | ✅ | Facebook-style feed, per-post page |
| `/notification` | `/notifications` | ✅ | |
| `/recharge/*` | `/recharge` | 🟡 | One screen: card, XLM swap, BANDCOIN |
| `/wallet-balance` | `/wallet` | ✅ | |
| `/royalty/[id]` | `/item/[slug]` + portal `/royalty` | ❓ | 1,969-line page: check what a fan sees there |
| `/pins` (collected pins) | AR `/collection`, `/map` | 🟡 | Moved to the AR app |
| `/about`, `/privacy`, `/support` | same | ✅ | |
| `/api/auth/[...nextauth]`, `/api/xdr` | same | ✅ | |
| `/api/lastfm/*` | same | ✅ | |
| `/api/proxy-image` | AR `/api/proxy-image` | ✅ | |
| `/api/toml`, rewrite `/.well-known/stellar.toml` | `apps/app` `/.well-known/stellar.toml` | ✅ | **Added today.** The old one was a real gap: wallets read it for token names and images. It must be served from the domain the issuers' home domain points to |
| `/api/internal/keep-alive*` | worker `nft.keep-alive` | ✅ | |
| `/dev/loading-preview`, `/test` | none | ➖ | Dev pages |
| `/ai/*`, `/ai-generation`, `/text-generation`, `/api/generate*` | Studio | ⏸ | Skipped for now |

## In-app map and game (bandfan `/action/*`, `/api/game/*` → `apps/ar`)

| Bandfan | New | Status | Note |
|---|---|---|---|
| `/action`, `/action/home`, `/action/ar` | `/ar`, `/map` | ✅ | |
| `/action/artists` | `/artists`, `/artists/[id]` | ✅ | |
| `/action/actions` (bounties) | `/bounty`, `/bounty/[id]` | ✅ | |
| `/action/collections`, `/collections/post/[id]` | `/collection`, `/collection/post/[id]` | ✅ | Posts collect by QR scan only |
| `/action/qr`, `/action/qr/[id]` | `/scan` | 🟡 | Scan opens pins and posts |
| `/action/profile` | `/profile` | ✅ | |
| `/api/game/locations/*` (consume, view, hide, nearest) | AR `pin.*`, `claim.*` | ✅ | |
| `/api/game/follow`, `unfollow`, `followed_brands`, `getFollowXDR`, `hasTrustOnBrand` | `follow` in app and AR | ❓ | Old follow could add a fan-token trustline. Confirm the new follow does what you want |
| `/api/game/bounty/*` | AR `bounty.*` | ✅ | |
| `/api/game/qr/*` (can-user-buy, copies) | none | ➖ | Old QR items; replaced by pins and post QR |
| `/api/game/user/*` (balances, update, delete) | `account.*` | ❓ | Delete-account: confirm it exists |
| `/api/game/get-signed-url`, `/api/file` (Pinata) | S3 uploads | 🟡 | New files go to the bucket, not IPFS |
| (new) | `/events`, `/announcements`, `/murals`, `/coins`, `/directions`, `/embed` | ✅ | New in Bandcoin |

## Artist side (bandfan `/artist/*` → `apps/artist` portal)

| Bandfan | New | Status | Note |
|---|---|---|---|
| `/artist/create` | portal first run (application + payment) | ✅ | |
| `/artist/profile`, `/artist/profile/edit` | `/settings`, `/page` | ✅ | |
| `/artist/settings` | `/settings` | ✅ | |
| `/artist/store`, `/artist/store/[id]` | `/wallet`, `/items` | ✅ | Storage account stock and withdraw |
| `/artist/classic-nft/create`, `/non-stellar-item/create`, `/sell-page-asset/create`, `/smart-contract/create` + edit | `/items/new`, `/items/[id]` | ✅ | One form, kind chosen |
| `/artist/music/*` (create, album, new song, royalty) | `/music/*`, `/royalty` | ✅ | |
| `/artist/post/*` | `/posts/*` | ✅ | |
| `/artist/bounty/*` | `/bounties/*` | ✅ | |
| `/artist/memberships/*` | `/memberships/*` | ✅ | |
| `/artist/domain` | `/domain` | ✅ | The 2 copied domains need re-verifying |
| `/artist/gift` | `/gifts` | ✅ | |
| `/artist/redeem` | `/redeem` | ✅ | |
| `/artist/map`, `/map/collection-report/*` | `/pins/*`, `/hotspots/*`, `/reports/*` | ✅ | |
| (new) | `/events`, `/embeds`, `/notifications` | ✅ | |
| `/artist/studio` | Studio | ⏸ | |
| Pin agent (chat on the map) | `agent.*` API | 🟡 | Backend built; the chat screen comes with the Studio frontend |
| Facebook sync (`/api/social/facebook/*`, `/api/webhooks/facebook`) | none yet | ⛔ | Stage 8, needs your Facebook app id and secret |

## Admin (bandfan `/admin/*` → portal `/admin/*`)

| Bandfan | New | Status | Note |
|---|---|---|---|
| `/admin`, `/admin/admins` | `/admin`, `/admin/admins` | ✅ | |
| `/admin/creators` | `/admin/artists`, `/admin/artists/[id]` | ✅ | |
| `/admin/users` | `/admin/users`, `/admin/users/[id]` | ✅ | |
| `/admin/pins`, `/admin/map` | `/admin/pins`, `/admin/pins/map` | ✅ | |
| `/admin/bounty` | `/admin/bounties` | ✅ | |
| `/admin/collection-report/*` | `/admin/reports/*` | ✅ | |
| `/admin/market-assets` | `/admin/items` | ✅ | |
| `/admin/wallet` | `/admin/users/[id]`? | ❓ | Old page listed wallets: confirm what you used it for |
| `/admin/ai` | Studio settings | ⏸ | |
| (new) | `/admin/activity`, `/alerts`, `/jobs`, `/murals`, `/settings` | ✅ | |

## Old links that must keep working

- `/artist/[id]` was an artist's **user id** (a Stellar key). New pages use a slug. Needs redirects from the old id: not built yet (the copy keeps the old id in `legacy_id_map`, so it can be done).
- `/asset/[id]` (numeric), `/market-asset/[id]`, `/nft/[id]`, `/smart-contract/[id]`, `/bounty/[id]`: ids are mapped in `legacy_id_map` too (NFT and bounty ids were kept as they were). A redirect handler per kind is not built yet.
- Shared pin and QR links: pin ids were kept.

## Before cutover

1. Click through every ✅ row on the copied production data (rehearsal) in a browser. This is the real check.
2. Decide the ❓ rows.
3. Build the old-link redirects.
4. Serve `/.well-known/stellar.toml` on the domain the on-chain issuers use as home domain (check one issuer's `home_domain` on mainnet).
