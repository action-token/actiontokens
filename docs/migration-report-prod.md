# Legacy migration: dry-run report

Generated 2026-11-20T09:42:00.198Z from the old Actionverse database (read only). Nothing was written.

**527 rows** in 66 old tables.

## Rows that need attention

| Old table        | What                                                       | Rows | What the migration does                             |
| ---------------- | ---------------------------------------------------------- | ---: | --------------------------------------------------- |
| CreatorPageAsset | Fan tokens without an issuer secret                        |    1 | Imported as external tokens (no issuer key held).   |
| TemporalFollow   | Temporary follows that are also real follows               |    7 | The real follow wins; the temporary one is skipped. |
| Bounty           | Bounties with a prize asset other than ACTION, XLM or USDC |    1 | Needs your decision (see below).                    |

## Every table

### Identity

| Old table         | Rows | New table                                                 | Note                                                                          |
| ----------------- | ---: | --------------------------------------------------------- | ----------------------------------------------------------------------------- |
| User              |   58 | users                                                     | Old id is the Stellar public key; it becomes walletAddress and a new cuid id. |
| ↳ Sign-up method  |      | (none): 28, google: 21, albedo: 5, emailPass: 3, rabet: 1 |                                                                               |
| Admin             |    3 | users.role = ADMIN                                        | Separate table replaced by a role.                                            |
| Account           |    0 | (dropped)                                                 | Unused: sessions are JWTs.                                                    |
| Session           |    0 | (dropped)                                                 | Unused: sessions are JWTs.                                                    |
| VerificationToken |    0 | (dropped)                                                 | Unused.                                                                       |

### Artist

| Old table           |      Rows | New table                                                    | Note                                                              |
| ------------------- | --------: | ------------------------------------------------------------ | ----------------------------------------------------------------- |
| Creator             |         8 | organizations + chain_accounts (storage)                     | Storage secret is re-encrypted into chain_accounts.               |
| ↳ Approval          |           | APPROVED: 5, PENDING: 3                                      |                                                                   |
| CreatorPageAsset    |         4 | items (FAN_TOKEN) + classic_tokens + chain_accounts (issuer) | Plus artists with customPageAssetCodeIssuer (external fan token). |
| CreatorAssetIssuer  | (missing) | chain_accounts (ISSUER)                                      |                                                                   |
| Subscription        |         0 | membership_tiers                                             | price (copies of the fan token to hold) becomes requiredTokens.   |
| Follow              |         9 | follows                                                      |                                                                   |
| TemporalFollow      |        18 | follows (isTemporary)                                        |                                                                   |
| VanitySubscription  |         0 | vanity_urls                                                  |                                                                   |
| VanityPayment       | (missing) | vanity_payments                                              | Old payments were ACTION.                                         |
| CreatorCustomDomain | (missing) | custom_domains                                               |                                                                   |
| Appearance          |         0 | page_layouts                                                 |                                                                   |
| Widget              |         0 | page_widgets                                                 |                                                                   |
| LayoutTemplate      | (missing) | page_templates                                               |                                                                   |
| LastFMAccount       |         0 | lastfm_accounts                                              |                                                                   |

### Catalog

| Old table              |      Rows | New table                                           | Note                                                                                                                           |
| ---------------------- | --------: | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Asset                  |         0 | items (CLASSIC_TOKEN) + classic_tokens + item_media |                                                                                                                                |
| Song                   |         0 | tracks                                              | Song price/priceUSD become the item's primary listing.                                                                         |
| Album                  |         1 | albums                                              |                                                                                                                                |
| Stem                   | (missing) | item_stems                                          |                                                                                                                                |
| Nft                    |         0 | items (CONTRACT_NFT) + contract_nfts                |                                                                                                                                |
| NftToken               |         0 | nft_editions                                        |                                                                                                                                |
| Collection             |         0 | item_collections                                    |                                                                                                                                |
| NftLike                |         0 | item_likes                                          |                                                                                                                                |
| CollectionLike         |         0 | collection_likes                                    |                                                                                                                                |
| NftLockedMedia         |         0 | locked_contents                                     | nftId → the NFT's item; chainIndex copied unchanged (the contract's unlock records use it). OTHER stays OTHER (shown as Link). |
| NftUnlockLocationRule  |         0 | unlock_rules                                        | radius (m) → radiusMeters, rounded.                                                                                            |
| NftUnlockLocationPoint |         0 | unlock_points                                       |                                                                                                                                |

### Market

| Old table         |      Rows | New table                            | Note                                                                                                                                   |
| ----------------- | --------: | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| MarketAsset       |         0 | listings (PRIMARY)                   | price → priceActionToken, priceUSD → priceUsd.                                                                                         |
| SellPageAsset     |         0 | listings (fan token)                 |                                                                                                                                        |
| NftPrice          |         0 | listings (PRIMARY, NFT)              |                                                                                                                                        |
| NftListing        |         0 | listings (RESALE)                    |                                                                                                                                        |
| NftListingPrice   |         0 | listings.priceActionToken / priceUsd |                                                                                                                                        |
| User_Asset        |         0 | ownerships (PURCHASE)                | Merged with Ownership; the chain sync job re-checks balances.                                                                          |
| User_Song         |         0 | ownerships                           | Folded into the song item's ownership.                                                                                                 |
| Ownership         | (missing) | ownerships                           |                                                                                                                                        |
| Order             | (missing) | orders                               |                                                                                                                                        |
| NftPurchase       |         0 | orders                               |                                                                                                                                        |
| Redeem            |         0 | redeem_codes                         |                                                                                                                                        |
| RedeemConsumer    |         0 | redeem_claims                        |                                                                                                                                        |
| NftContentRedeem  | (missing) | locked_content_redeems               | nftTokenId → the copy (nft_editions by tokenId); mediaIndex → the piece with that chainIndex; isRedeemed dropped (redeemedAt says it). |
| RoyaltyReport     | (missing) | royalty_reports                      |                                                                                                                                        |
| RoyaltyPayout     | (missing) | royalty_payouts                      |                                                                                                                                        |
| RoyaltyPayoutLine | (missing) | royalty_payout_lines                 |                                                                                                                                        |
| AdminAsset        |         0 | (waiting for your decision)          | Admin token directory: not in the new schema yet.                                                                                      |

### Music

| Old table    |      Rows | New table       | Note |
| ------------ | --------: | --------------- | ---- |
| Playlist     | (missing) | playlists       |      |
| PlaylistSong | (missing) | playlist_tracks |      |
| SongFavorite | (missing) | track_favorites |      |
| PlayEvent    | (missing) | play_events     |      |
| StemMix      | (missing) | stem_mixes      |      |

### Social

| Old table          | Rows | New table                                                                                                           | Note                          |
| ------------------ | ---: | ------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| PostGroup          |    1 | posts                                                                                                               |                               |
| Media              |    0 | post_media                                                                                                          |                               |
| Like               |    1 | post_likes                                                                                                          |                               |
| Comment            |    1 | post_comments                                                                                                       |                               |
| Post               |  100 | post_collectibles                                                                                                   | Collectible copies of a post. |
| PostCollection     |    0 | post_collectibles.collectorId                                                                                       | Who collected which copy.     |
| NotificationObject |   62 | notification_events                                                                                                 |                               |
| ↳ Type             |      | FOLLOW: 35, MEMBER: 11, POST: 9, LIKE: 3, BOUNTY_PARTICIPANT: 1, BOUNTY_WINNER: 1, BOUNTY_SUBMISSION: 1, COMMENT: 1 |                               |
| Notification       |   62 | notifications                                                                                                       |                               |

### AR

| Old table        | Rows | New table      | Note                                                                                                                                                                                                                              |
| ---------------- | ---: | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LocationGroup    |   11 | pins           | Unlock groups (unlockForTokenId set) → unlock pins: restrictedToUserId, unlockEditionId (the copy), unlockLockedContentId, unlockItemId and the on-chain unlock fields carried over, so owners keep their progress; claimLimit 0. |
| ↳ Approval       |      | APPROVED: 11   |                                                                                                                                                                                                                                   |
| Location         |   51 | pin_spots      |                                                                                                                                                                                                                                   |
| LocationConsumer |    1 | pin_claims     |                                                                                                                                                                                                                                   |
| Hotspot          |    0 | hotspots       | QStash schedule ids dropped; the worker schedules drops.                                                                                                                                                                          |
| LocationTag      |    7 | pin_tags       |                                                                                                                                                                                                                                   |
| LocationGroupTag |   70 | pin_tag_links  |                                                                                                                                                                                                                                   |
| LocationTagCache |   10 | pin_tag_cache  |                                                                                                                                                                                                                                   |
| GeoCache         |   29 | geo_cache      |                                                                                                                                                                                                                                   |
| LocationGroupJob |    1 | pin_batch_jobs |                                                                                                                                                                                                                                   |

### Bounty

| Old table                      | Rows | New table              | Note |
| ------------------------------ | ---: | ---------------------- | ---- |
| Bounty                         |    1 | bounties               |      |
| ↳ Prize asset                  |      | BEAM: 1                |      |
| BountyParticipant              |    1 | bounty_participants    |      |
| BountySubmission               |    1 | bounty_submissions     |      |
| BountySubmissionMedia          |    0 | submission_attachments |      |
| BountySubmissionCapture        |    0 | submission_captures    |      |
| BountyWinner                   |    1 | bounty_winners         |      |
| BountyMusicConfig              |    0 | bounty_music_rules     |      |
| BountyTrack                    |    0 | bounty_tracks          |      |
| BountyParticipantTrackProgress |    0 | bounty_track_progress  |      |

### Agent

| Old table         |      Rows | New table           | Note                                                                |
| ----------------- | --------: | ------------------- | ------------------------------------------------------------------- |
| AgentJob          |        14 | agent_jobs          |                                                                     |
| AgentConversation | (missing) | agent_conversations | Agent chat history (in the DB, missing from bandfan's schema file). |
| AgentMessage      | (missing) | agent_messages      |                                                                     |
| AgentAction       | (missing) | agent_actions       |                                                                     |

### Platform

| Old table     |      Rows | New table                   | Note                     |
| ------------- | --------: | --------------------------- | ------------------------ |
| AppConfig     |         1 | app_settings                |                          |
| Upload        | (missing) | uploads                     |                          |
| Tag           |         0 | (waiting for your decision) | Only used by AdminAsset. |
| AdminAssetTag |         0 | (waiting for your decision) |                          |

## Old tables the plan doesn't cover

- CommunityMember
- CommunityPost
- CommunityPostMedia
- CommunityPostLike
- CommunityTokenRequirement
- OriginBlockedUser
- QuarterReward
- OriginReward
- QuarterBlockedUser
- CommunityComment
- CommunityActivity
- Beam
- BeamReaction
- BeamComment
- Community
- CommunityNotificationPreference
- CreatorGallery
- GallerySlotOverride
- GallerySlotLike
- TelegramConfig
- MuseumRoom
