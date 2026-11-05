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
| `/nft/manage/[id]`, `/smart-contract/manage/[id]` | `/selling`, the Sell panel on `/item/[slug]` | 🟡 | **Built 2026-11-05 (plan 21), both copy kinds, run on testnet.** A holder lists one copy or several, sets a BANDCOIN and a USD price, reprices, takes a copy off sale and sees their sales on Selling; a worker job ends listings whose copy moved. Classic copies sell from a storage account the seller opens once (about 1 XLM). Not done: a signed-in browser check of these screens; card payment for a resold contract NFT is covered by a unit test only; the old on-chain insights view isn't carried over |
| `/artist/[id]` | `/artist/[slug]` | ✅ | Old links by id: see "Old links" below |
| `/[vanityURL]` | `/[vanity]` | ✅ | |
| `/bounty`, `/bounty/[id]` | `/bounties`, `/bounty/[id]` | ✅ | |
| `/creator-feed` | `/feed`, `/feed/[postId]` | ✅ | Facebook-style feed, per-post page |
| `/notification` | `/notifications` | ✅ | |
| `/recharge/*` | `/recharge` | 🟡 | One screen: card, XLM swap, BANDCOIN |
| `/wallet-balance` | `/wallet` | ✅ | |
| `/royalty/[id]` | none | ➖ | You decided to skip it |
| `/pins` (collected pins) | AR `/collection`, `/map` | 🟡 | Moved to the AR app |
| `/about`, `/privacy`, `/support` | same | ✅ | |
| `/api/auth/[...nextauth]`, `/api/xdr` | same | ✅ | |
| `/api/lastfm/*` | same | ✅ | |
| `/api/proxy-image` | AR `/api/proxy-image` | ✅ | |
| `/api/toml`, rewrite `/.well-known/stellar.toml` | `apps/app` `/.well-known/stellar.toml` (rewrite to `/stellar-toml`) | ✅ | **Added today.** The old one was a real gap: wallets read it for token names and images. It must be served from the domain the issuers' home domain points to |
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
| `/api/game/follow`, `unfollow`, `followed_brands`, `getFollowXDR`, `hasTrustOnBrand` | `artist.setFollowing` + `recharge` kind `TOKEN_TRUST` | 🟡 | Follow saves instantly and says whether the artist has a fan token. The fan is then offered it: they pay BANDCOIN for exactly the 0.5 XLM the line locks and the line opens, in one transaction. The old follow never actually charged BANDCOIN (its payment went back to the fan). Run for real on testnet (`pnpm --filter @bandcoin/api testnet:trust`): the fan paid BANDCOIN, got exactly 0.5 XLM, the line opened in one transaction, and a second offer was refused. Since plan 23, Follow and Subscribe are separate: a trustline to the fan token makes a fan a subscriber, and the Subscribe button opens this price dialog |
| `/api/game/bounty/*` | AR `bounty.*` | ✅ | |
| `/api/game/qr/*` (can-user-buy, copies) | none | ➖ | Old QR items; replaced by pins and post QR |
| `/api/game/user/*` (balances, update, delete) | `account.*`, `account.delete` | ✅ | **Delete account added 2026-11-04** (the app stores require it): type DELETE; removes the person and their sign-in. Refuses, in plain words, for admins, artists (support removes them), Studio coins left, a payment in flight, and a Bandcoin-held wallet that still holds funds. Buttons in the app's Settings and the AR profile |
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
| Pin agent (chat on the map) | `agent.*` API, MCP at the portal's `/api/mcp` | 🟡 | Backend built, plus Wadzzo's MCP server (Settings › AI apps makes the token, an AI app uses the agent). The chat screen comes with the Studio frontend |
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
| `/admin/wallet` | none | ➖ | You decided to skip it |
| `/admin/ai` | Studio settings | ⏸ | |
| (new) | `/admin/activity`, `/alerts`, `/jobs`, `/murals`, `/settings` | ✅ | |

## Old links

Decided 2026-11-04: old shared links are not carried over. No redirects are built.

## Route smoke test (2026-11-05, local)

Every route in this list was loaded and none crashed: 25 fan app routes and 40 artist portal routes (signed in), and 12 AR routes plus
7 detail routes (signed out). Two portal paths redirect on purpose (`/` to Pins, `/domain` to Settings), and AR's `/` goes to `/map`.
This only shows the pages load. It doesn't replace clicking through each flow with real data (the first item below).

## Click-through (2026-11-05, local, fan app, test data)

Done with real clicks and no problems found: like and comment on a post (count and comment appeared), comment rule "Subscribers" (button
off with "Subscribe to X to comment."), create a playlist and add a song to it, recharge quote for $9.99 and the Get XLM quote, bounty list
and detail and joining a music bounty (participants 0 to 1), marketplace search, collection and favourites, the contract-NFT buy panel
quote, Selling and the Sell dialog, stories and highlights, Last.fm connect and its return trip. Anything that needs a wallet signature (buy,
list, subscribe, pay by card) was taken as far as the confirm step. Not yet clicked through: the artist portal's create flows and the AR
app's map and collect. Every action took several seconds in dev, which is the dev server compiling, not the app.

## Before cutover

1. Click through every ✅ row on the copied production data (rehearsal) in a browser. This is the real check.
2. Decide the ❓ rows.
3. **Checked 2026-11-04 on mainnet:** 10 of 11 sampled issuers have `home_domain` = `bandcoin.io`, one has `tokens.bandcoin.io`, one issuer account wasn't found. So wallets read `https://bandcoin.io/.well-known/stellar.toml` and `https://tokens.bandcoin.io/.well-known/stellar.toml`. Both domains must reach the fan app, which now serves it (or proxy that one path). Until then wallets show these tokens without names and images.
