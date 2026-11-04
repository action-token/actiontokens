# 19 · Production data copy and cutover

Decided 2026-11-04: `ep-soft-term` (db `fan`) is the main database and keeps its connection
string. Its old-layout data is backed up to `ep-steep-wildflower` (db `fan`), then at cutover
`ep-soft-term` is cleaned and takes the new schema plus the old data in the new layout.
`old-bandcoin` (`ep-icy-wildflower`) is **not** copied.

Backup taken and verified 2026-11-04: 89 tables, 13,110 rows, every row's fingerprint matching,
24 enums, 197 indexes, 119 foreign keys. It is taken again right before the cutover.

## What this data is

- **Mainnet.** Sampled issuer and storage accounts exist on mainnet and not on testnet. The new
  apps run on testnet in dev, so production needs mainnet settings, and rehearsals must never
  send a transaction.
- **Plain-text keys.** 16 artist storage secrets and 10 issuer secrets (9 fan token, 1 asset) are
  stored unencrypted in the old layout, so also in the backup. Anyone with either database
  password can move those funds. The copy encrypts them with `CHAIN_ACCOUNT_KEY`.
- **Files stay put.** 159 links on `bandcoin-object-store`, 22 on Pinata, 1 elsewhere. Links are
  copied unchanged, so production must keep that bucket.
- **Contracts** are the same as bandfan's production ones (NFT `CCL6VMDO…`, escrow `CBTALUV2…`).
  One bounty is RUNNING with a live escrow; it keeps its escrow id.

## Mapping (rows are in the old table)

| Old | Rows | New | Rule |
|---|---:|---|---|
| User | 147 | users | Old id (all 147 are Stellar keys) becomes walletAddress, with a new cuid id. 22 have email. |
| Admin | 8 | users.role = ADMIN | Row dropped, role kept. |
| Creator | 17 | artists + chain_accounts | 10 approved, 7 pending. Secret encrypted. 1 has a junk secret and no valid public key (unapproved, no items): artist kept, no storage account, flagged. |
| Creator facebook* | 1 | facebook_connections | Page id and name kept. Token needs bandfan's Facebook key; without it the artist reconnects. |
| CreatorPageAsset | 10 | items + classic_tokens + chain_accounts | 1 has no issuer secret: imported as an external token. |
| Subscription | 4 | membership_tiers | price → requiredTokens. |
| Follow / TemporalFollow | 4 / 39 | follows | 4 temporary follows that are also real: the real one wins. |
| VanitySubscription | 4 | vanity_urls | All ACTIVE. |
| CreatorCustomDomain, Appearance, LayoutTemplate, LastFMAccount | 2, 3, 5, 5 | custom_domains, page_layouts, page_templates, lastfm_accounts | Direct. |
| Asset | 5 | items + classic_tokens + item_media | 1 issuer secret encrypted. |
| Album | 1 | albums | Direct. |
| Nft, NftToken | 5, 8 | items + contract_nfts, nft_editions | All MINTED. |
| NftLockedMedia, unlock rules/points | 15, 6, 10 | locked_contents, unlock_rules, unlock_points | chainIndex unchanged: the contract uses it. |
| NftContentRedeem | 3 | locked_content_redeems | Direct. |
| MarketAsset, NftPrice, NftListing + prices | 1, 10, 1 + 2 | listings | Paused if a required price is missing. |
| User_Asset | 1 | ownerships | Re-checked against mainnet balances (read only). |
| NftPurchase | 8 | orders | 7 CONFIRMED stay delivered. **1 PENDING with no transaction becomes FAILED**, so the order job can't act on it (no payment retries). |
| PostGroup, Media, Post, PostCollection | 7, 10, 700, 1 | posts, post_media, post_collectibles | 6 media rows have no post: kept in the skipped list. |
| Like, Comment | 19, 4 | post_likes, post_comments | Un-liked rows skipped. |
| NotificationObject, Notification | 212, 198 | notification_events, notifications | MEMBER → MEMBERSHIP, BOUNTY_PARTICIPANT → BOUNTY_JOINED, BOUNTY_DOUBT_* and BOUNTY_REPLY → BOUNTY_COMMENT. |
| LocationGroup, Location, LocationConsumer | 143, 10,105, 11 | pins, pin_spots, pin_claims | **All copied**, including 119 REJECTED pins (10,076 spots), which fans don't see. |
| Tags, GeoCache, LocationGroupJob | 21 + 838 + 21, 340, 3 | pin_tags, pin_tag_links, pin_tag_cache, geo_cache, pin_batch_jobs | Direct. |
| Bounty and related | 2, 2, 1, 1, 1, 5 | bounties and related | Prize ACTION is a classic asset: prizeCurrency null, code and issuer kept. |
| CreditBalance, CreditTransaction | 35, 19 | studio_balances + a MIGRATED ledger entry | One holder, 53.97 credits (see question). History summarised, full rows stay in the backup. |
| CreditPackage | 1 | (see question) | Old prices don't fit 1 coin = $0.01. |
| GenerationJob, AiGeneratedContent | 6, 3 | generations | Finished runs only: nothing to hold or refund. |
| AgentJob, AgentConversation, AgentMessage, AgentAction | 33, 10, 31, 2 | same names | Direct. |

Old tables with no rows are mapped but copy nothing. Every skipped row is listed in the report.

## The tool

`packages/db/scripts/migrate-legacy/`: one file per domain, in dependency order, with an id map so
later steps find new ids.

- **Source** is opened read only and must be `ep-steep`, never the live database.
- **Target** must be named on the command line and match an allowlist: the rehearsal schema, or
  `ep-soft-term` with `--cutover`. It refuses a target that already has rows.
- This replaces today's guard in `legacy-db.ts`, which only allows `old-bandcoin`.
- It never prints secrets, and never talks to Stellar except to read balances.

## Checks after each run

Row counts per table with every difference explained; every old user, artist, item, NFT and pin
findable by its old id; secrets decrypt back to their public keys (without printing them); a
sample of ownerships and editions matches mainnet; the portal, fan app and AR app sign in against
the result. Report goes to `docs/migration-report.md`.

## Rehearsal (safe, repeatable)

In a separate `rehearsal` schema of `ep-steep`, with a throwaway `CHAIN_ACCOUNT_KEY`: run all
migrations, copy, run the checks. The backup in `public` is only read. Dropped afterwards, because
it holds real keys.

## Cutover (one window, with the app switch)

1. New apps deployed with mainnet settings, pointing at `ep-soft-term`, not yet live.
2. Old app put in maintenance, so nothing changes during the copy.
3. Fresh dump of `ep-soft-term` into `ep-steep`, verified as above.
4. **Final go-ahead from you.** Then clean `ep-soft-term` and run the migrations.
5. Copy with `--cutover`, then the checks.
6. Switch the domains to the new apps.

**If it goes wrong:** before step 6, restore the verified dump into `ep-soft-term` and bring the old
app back. Neon's point-in-time restore is a second way back. New sign-ups made after the switch
exist only in the new layout.

## Needs from you before cutover

- Rotate both database passwords (they were pasted in chat, and the data includes live keys).
- A production `CHAIN_ACCOUNT_KEY`, set in the host's settings. Never in chat. Losing it locks every
  artist's account, so keep a safe copy.
- bandfan's Facebook encryption key, if that artist should stay connected.
