# Legacy migration: dry-run report

Generated 2026-10-28T10:52:06.710Z from the old dev database (read only). Nothing was written.

**4,268 rows** in 91 old tables.

## Rows that need attention

None.

## Every table

### Identity

| Old table         | Rows | New table                                   | Note                                                                          |
| ----------------- | ---: | ------------------------------------------- | ----------------------------------------------------------------------------- |
| User              |   48 | users                                       | Old id is the Stellar public key; it becomes walletAddress and a new cuid id. |
| ↳ Sign-up method  |      | seed: 43, email: 2, emailPass: 2, albedo: 1 |                                                                               |
| Admin             |    1 | users.role = ADMIN                          | Separate table replaced by a role.                                            |
| Account           |    0 | (dropped)                                   | Unused: sessions are JWTs.                                                    |
| Session           |    0 | (dropped)                                   | Unused: sessions are JWTs.                                                    |
| VerificationToken |    0 | (dropped)                                   | Unused.                                                                       |

### Artist

| Old table           | Rows | New table                                                    | Note                                                              |
| ------------------- | ---: | ------------------------------------------------------------ | ----------------------------------------------------------------- |
| Creator             |   20 | artists + chain_accounts (storage)                           | Storage secret is re-encrypted into chain_accounts.               |
| ↳ Approval          |      | APPROVED: 20                                                 |                                                                   |
| CreatorPageAsset    |   20 | items (FAN_TOKEN) + classic_tokens + chain_accounts (issuer) | Plus artists with customPageAssetCodeIssuer (external fan token). |
| CreatorAssetIssuer  |    0 | chain_accounts (ISSUER)                                      |                                                                   |
| Subscription        |   39 | membership_tiers                                             | price (copies of the fan token to hold) becomes requiredTokens.   |
| Follow              |   93 | follows                                                      |                                                                   |
| TemporalFollow      |    0 | follows (isTemporary)                                        |                                                                   |
| VanitySubscription  |    8 | vanity_urls                                                  |                                                                   |
| VanityPayment       |    0 | vanity_payments                                              | Old payments were BANDCOIN.                                       |
| CreatorCustomDomain |    0 | custom_domains                                               |                                                                   |
| Appearance          |    1 | page_layouts                                                 |                                                                   |
| Widget              |    0 | page_widgets                                                 |                                                                   |
| LayoutTemplate      |    5 | page_templates                                               |                                                                   |
| LastFMAccount       |    0 | lastfm_accounts                                              |                                                                   |

### Catalog

| Old table              | Rows | New table                                                                                                                                                                | Note                                                   |
| ---------------------- | ---: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| Asset                  |   85 | items (CLASSIC_TOKEN) + classic_tokens + item_media                                                                                                                      |                                                        |
| ↳ Type × visibility    |      | MUSIC / PUBLIC: 50, IMAGE / PUBLIC: 14, MUSIC / TIER: 6, VIDEO / PUBLIC: 5, MUSIC / PRIVATE: 5, IMAGE / TIER: 2, IMAGE / PRIVATE: 1, VIDEO / PRIVATE: 1, VIDEO / TIER: 1 |                                                        |
| Song                   |   45 | tracks                                                                                                                                                                   | Song price/priceUSD become the item's primary listing. |
| Album                  |   20 | albums                                                                                                                                                                   |                                                        |
| Stem                   |    3 | item_stems                                                                                                                                                               |                                                        |
| Nft                    |   20 | items (CONTRACT_NFT) + contract_nfts                                                                                                                                     |                                                        |
| ↳ Status               |      | PENDING: 8, MINTED: 12                                                                                                                                                   |                                                        |
| NftToken               |   12 | nft_editions                                                                                                                                                             |                                                        |
| Collection             |    6 | item_collections                                                                                                                                                         |                                                        |
| NftLike                |    0 | item_likes                                                                                                                                                               |                                                        |
| CollectionLike         |    0 | collection_likes                                                                                                                                                         |                                                        |
| NftLockedMedia         |    0 | locked_contents                                                                                                                                                          |                                                        |
| NftUnlockLocationRule  |    0 | unlock_rules                                                                                                                                                             |                                                        |
| NftUnlockLocationPoint |    0 | unlock_points                                                                                                                                                            |                                                        |

### Market

| Old table         | Rows | New table                                 | Note                                                          |
| ----------------- | ---: | ----------------------------------------- | ------------------------------------------------------------- |
| MarketAsset       |   85 | listings (PRIMARY)                        | price → priceBandcoin, priceUSD → priceUsd.                   |
| ↳ Type            |      | ROYALTY: 20, SONG: 25, ADMIN: 20, FAN: 20 |                                                               |
| SellPageAsset     |    0 | listings (fan token)                      |                                                               |
| NftPrice          |   40 | listings (PRIMARY, NFT)                   |                                                               |
| ↳ Payment token   |      | asset: 20, usd: 20                        |                                                               |
| NftListing        |    0 | listings (RESALE)                         |                                                               |
| NftListingPrice   |    0 | listings.priceBandcoin / priceUsd         |                                                               |
| User_Asset        |   26 | ownerships (PURCHASE)                     | Merged with Ownership; the chain sync job re-checks balances. |
| User_Song         |    0 | ownerships                                | Folded into the song item's ownership.                        |
| Ownership         |   26 | ownerships                                |                                                               |
| Order             |   26 | orders                                    |                                                               |
| NftPurchase       |   12 | orders                                    |                                                               |
| ↳ Status          |      | CONFIRMED: 12                             |                                                               |
| Redeem            |   20 | redeem_codes                              |                                                               |
| RedeemConsumer    |    0 | redeem_claims                             |                                                               |
| NftContentRedeem  |    0 | locked_content_redeems                    |                                                               |
| RoyaltyReport     |    0 | royalty_reports                           |                                                               |
| RoyaltyPayout     |    0 | royalty_payouts                           |                                                               |
| RoyaltyPayoutLine |    0 | royalty_payout_lines                      |                                                               |
| AdminAsset        |    0 | (waiting for your decision)               | Admin token directory: not in the new schema yet.             |

### Music

| Old table    | Rows | New table       | Note |
| ------------ | ---: | --------------- | ---- |
| Playlist     |   40 | playlists       |      |
| PlaylistSong |  160 | playlist_tracks |      |
| SongFavorite |   40 | track_favorites |      |
| PlayEvent    |    2 | play_events     |      |
| StemMix      |    0 | stem_mixes      |      |

### Social

| Old table          |  Rows | New table                          | Note                          |
| ------------------ | ----: | ---------------------------------- | ----------------------------- |
| PostGroup          |    25 | posts                              |                               |
| Media              |    16 | post_media                         |                               |
| Like               |   125 | post_likes                         |                               |
| Comment            |    25 | post_comments                      |                               |
| Post               | 2,500 | post_collectibles                  | Collectible copies of a post. |
| PostCollection     |     0 | post_collectibles.collectorId      | Who collected which copy.     |
| NotificationObject |   243 | notification_events                |                               |
| ↳ Type             |       | LIKE: 125, MEMBER: 93, COMMENT: 25 |                               |
| Notification       |   293 | notifications                      |                               |

### AR

| Old table        | Rows | New table      | Note                                                     |
| ---------------- | ---: | -------------- | -------------------------------------------------------- |
| LocationGroup    |   20 | pins           |                                                          |
| ↳ Approval       |      | PENDING: 20    |                                                          |
| Location         |   39 | pin_spots      |                                                          |
| LocationConsumer |    0 | pin_claims     |                                                          |
| Hotspot          |    0 | hotspots       | QStash schedule ids dropped; the worker schedules drops. |
| LocationTag      |    0 | pin_tags       |                                                          |
| LocationGroupTag |    0 | pin_tag_links  |                                                          |
| LocationTagCache |    0 | pin_tag_cache  |                                                          |
| GeoCache         |    7 | geo_cache      |                                                          |
| LocationGroupJob |    0 | pin_batch_jobs |                                                          |

### Bounty

| Old table                      | Rows | New table              | Note |
| ------------------------------ | ---: | ---------------------- | ---- |
| Bounty                         |   20 | bounties               |      |
| ↳ Prize asset                  |      | XLM: 20                |      |
| BountyParticipant              |    0 | bounty_participants    |      |
| BountySubmission               |    0 | bounty_submissions     |      |
| BountySubmissionMedia          |    0 | submission_attachments |      |
| BountySubmissionCapture        |    0 | submission_captures    |      |
| BountyWinner                   |    0 | bounty_winners         |      |
| BountyMusicConfig              |    0 | bounty_music_rules     |      |
| BountyTrack                    |    0 | bounty_tracks          |      |
| BountyParticipantTrackProgress |    0 | bounty_track_progress  |      |

### Studio

| Old table          | Rows | New table                                                                                                                                                                                                  | Note                                                                 |
| ------------------ | ---: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| CreditBalance      |    4 | studio_balances + studio_ledger_entries (MIGRATED)                                                                                                                                                         | Old database credits become deposited studio coins 1:1 (to confirm). |
| ↳ Total credits    |      | sum: 0                                                                                                                                                                                                     |                                                                      |
| CreditTransaction  |    0 | (history kept in the report only)                                                                                                                                                                          | Old history is summarised into one MIGRATED entry per user.          |
| CreditPackage      |    0 | studio_packages                                                                                                                                                                                            | Old priceBand/priceUSDC become priceBandcoin/priceUsd.               |
| GenerationJob      |    0 | generations                                                                                                                                                                                                |                                                                      |
| AiGeneratedContent |    0 | generations                                                                                                                                                                                                |                                                                      |
| AgentJob           |    0 | agent_jobs                                                                                                                                                                                                 |                                                                      |
| AgentConversation  |    9 | agent_conversations                                                                                                                                                                                        | Agent chat history (in the DB, missing from bandfan's schema file).  |
| ↳ Columns          |      | id:text: 1, creatorId:text: 2, userId:text: 3, title:text: 4, createdAt:timestamp without time zone: 5, updatedAt:timestamp without time zone: 6                                                           |                                                                      |
| AgentMessage       |   34 | agent_messages                                                                                                                                                                                             |                                                                      |
| ↳ Columns          |      | id:text: 1, conversationId:text: 2, role:text: 3, text:text: 4, blocks:jsonb: 5, steps:jsonb: 6, createdAt:timestamp without time zone: 7                                                                  |                                                                      |
| AgentAction        |    5 | agent_actions                                                                                                                                                                                              |                                                                      |
| ↳ Columns          |      | id:text: 1, conversationId:text: 2, creatorId:text: 3, type:text: 4, payload:jsonb: 5, status:text: 6, result:jsonb: 7, createdAt:timestamp without time zone: 8, updatedAt:timestamp without time zone: 9 |                                                                      |

### Platform

| Old table     | Rows | New table                   | Note                     |
| ------------- | ---: | --------------------------- | ------------------------ |
| AppConfig     |    0 | app_settings                |                          |
| Upload        |    0 | uploads                     |                          |
| Tag           |    0 | (waiting for your decision) | Only used by AdminAsset. |
| AdminAssetTag |    0 | (waiting for your decision) |                          |
