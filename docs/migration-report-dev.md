# Legacy migration: dry-run report

Generated 2026-11-20T09:41:26.212Z from the old Actionverse database (read only). Nothing was written.

**593 rows** in 66 old tables.

## Rows that need attention

| Old table        | What                                                       | Rows | What the migration does                             |
| ---------------- | ---------------------------------------------------------- | ---: | --------------------------------------------------- |
| CreatorPageAsset | Fan tokens without an issuer secret                        |    1 | Imported as external tokens (no issuer key held).   |
| TemporalFollow   | Temporary follows that are also real follows               |    1 | The real follow wins; the temporary one is skipped. |
| Bounty           | Bounties with a prize asset other than ACTION, XLM or USDC |    8 | Needs your decision (see below).                    |

## Every table

### Identity

| Old table         | Rows | New table                                                              | Note                                                                          |
| ----------------- | ---: | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| User              |   32 | users                                                                  | Old id is the Stellar public key; it becomes walletAddress and a new cuid id. |
| ↳ Sign-up method  |      | (none): 13, google: 9, albedo: 5, frieghter: 2, emailPass: 2, apple: 1 |                                                                               |
| Admin             |    1 | users.role = ADMIN                                                     | Separate table replaced by a role.                                            |
| Account           |    0 | (dropped)                                                              | Unused: sessions are JWTs.                                                    |
| Session           |    0 | (dropped)                                                              | Unused: sessions are JWTs.                                                    |
| VerificationToken |    0 | (dropped)                                                              | Unused.                                                                       |

### Artist

| Old table           |      Rows | New table                                                    | Note                                                              |
| ------------------- | --------: | ------------------------------------------------------------ | ----------------------------------------------------------------- |
| Creator             |         5 | organizations + chain_accounts (storage)                     | Storage secret is re-encrypted into chain_accounts.               |
| ↳ Approval          |           | APPROVED: 4, PENDING: 1                                      |                                                                   |
| CreatorPageAsset    |         4 | items (FAN_TOKEN) + classic_tokens + chain_accounts (issuer) | Plus artists with customPageAssetCodeIssuer (external fan token). |
| CreatorAssetIssuer  | (missing) | chain_accounts (ISSUER)                                      |                                                                   |
| Subscription        |         1 | membership_tiers                                             | price (copies of the fan token to hold) becomes requiredTokens.   |
| Follow              |         1 | follows                                                      |                                                                   |
| TemporalFollow      |         2 | follows (isTemporary)                                        |                                                                   |
| VanitySubscription  |         0 | vanity_urls                                                  |                                                                   |
| VanityPayment       | (missing) | vanity_payments                                              | Old payments were ACTION.                                         |
| CreatorCustomDomain | (missing) | custom_domains                                               |                                                                   |
| Appearance          |         0 | page_layouts                                                 |                                                                   |
| Widget              |         0 | page_widgets                                                 |                                                                   |
| LayoutTemplate      | (missing) | page_templates                                               |                                                                   |
| LastFMAccount       |         2 | lastfm_accounts                                              |                                                                   |

### Catalog

| Old table              |      Rows | New table                                           | Note                                                                                                                           |
| ---------------------- | --------: | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Asset                  |         3 | items (CLASSIC_TOKEN) + classic_tokens + item_media |                                                                                                                                |
| ↳ Type × visibility    |           | IMAGE / PUBLIC: 2, MUSIC / PUBLIC: 1                |                                                                                                                                |
| Song                   |         0 | tracks                                              | Song price/priceUSD become the item's primary listing.                                                                         |
| Album                  |         0 | albums                                              |                                                                                                                                |
| Stem                   | (missing) | item_stems                                          |                                                                                                                                |
| Nft                    |         1 | items (CONTRACT_NFT) + contract_nfts                |                                                                                                                                |
| ↳ Status               |           | MINTED: 1                                           |                                                                                                                                |
| NftToken               |         4 | nft_editions                                        |                                                                                                                                |
| Collection             |         2 | item_collections                                    |                                                                                                                                |
| NftLike                |         0 | item_likes                                          |                                                                                                                                |
| CollectionLike         |         0 | collection_likes                                    |                                                                                                                                |
| NftLockedMedia         |         2 | locked_contents                                     | nftId → the NFT's item; chainIndex copied unchanged (the contract's unlock records use it). OTHER stays OTHER (shown as Link). |
| ↳ Type                 |           | OTHER: 1, SONG: 1                                   |                                                                                                                                |
| NftUnlockLocationRule  |         1 | unlock_rules                                        | radius (m) → radiusMeters, rounded.                                                                                            |
| NftUnlockLocationPoint |         1 | unlock_points                                       |                                                                                                                                |

### Market

| Old table         |      Rows | New table                            | Note                                                                                                                                   |
| ----------------- | --------: | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| MarketAsset       |         3 | listings (PRIMARY)                   | price → priceActionToken, priceUSD → priceUsd.                                                                                         |
| ↳ Type            |           | FAN: 3                               |                                                                                                                                        |
| SellPageAsset     |         0 | listings (fan token)                 |                                                                                                                                        |
| NftPrice          |         2 | listings (PRIMARY, NFT)              |                                                                                                                                        |
| ↳ Payment token   |           | asset: 1, usd: 1                     |                                                                                                                                        |
| NftListing        |         0 | listings (RESALE)                    |                                                                                                                                        |
| NftListingPrice   |         0 | listings.priceActionToken / priceUsd |                                                                                                                                        |
| User_Asset        |         0 | ownerships (PURCHASE)                | Merged with Ownership; the chain sync job re-checks balances.                                                                          |
| User_Song         |         0 | ownerships                           | Folded into the song item's ownership.                                                                                                 |
| Ownership         | (missing) | ownerships                           |                                                                                                                                        |
| Order             | (missing) | orders                               |                                                                                                                                        |
| NftPurchase       |         2 | orders                               |                                                                                                                                        |
| ↳ Status          |           | CONFIRMED: 2                         |                                                                                                                                        |
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

| Old table          | Rows | New table                                                                                                                                                                                                                   | Note                          |
| ------------------ | ---: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| PostGroup          |    2 | posts                                                                                                                                                                                                                       |                               |
| Media              |    3 | post_media                                                                                                                                                                                                                  |                               |
| Like               |    0 | post_likes                                                                                                                                                                                                                  |                               |
| Comment            |    0 | post_comments                                                                                                                                                                                                               |                               |
| Post               |  200 | post_collectibles                                                                                                                                                                                                           | Collectible copies of a post. |
| PostCollection     |    0 | post_collectibles.collectorId                                                                                                                                                                                               | Who collected which copy.     |
| NotificationObject |  122 | notification_events                                                                                                                                                                                                         |                               |
| ↳ Type             |      | BOUNTY_PARTICIPANT: 37, BOUNTY_WINNER: 24, BOUNTY_SUBMISSION: 19, COMMUNITY_POST: 13, BOUNTY: 10, COMMUNITY_MEMBER_JOIN: 7, POST: 6, COMMUNITY_INVITE: 2, FOLLOW: 1, COMMUNITY_COMMENT: 1, COMMUNITY_REACTION: 1, MEMBER: 1 |                               |
| Notification       |  125 | notifications                                                                                                                                                                                                               |                               |

### AR

| Old table        | Rows | New table      | Note                                                                                                                                                                                                                              |
| ---------------- | ---: | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LocationGroup    |    5 | pins           | Unlock groups (unlockForTokenId set) → unlock pins: restrictedToUserId, unlockEditionId (the copy), unlockLockedContentId, unlockItemId and the on-chain unlock fields carried over, so owners keep their progress; claimLimit 0. |
| ↳ Approval       |      | APPROVED: 5    |                                                                                                                                                                                                                                   |
| Location         |   14 | pin_spots      |                                                                                                                                                                                                                                   |
| LocationConsumer |    1 | pin_claims     |                                                                                                                                                                                                                                   |
| Hotspot          |    0 | hotspots       | QStash schedule ids dropped; the worker schedules drops.                                                                                                                                                                          |
| LocationTag      |    3 | pin_tags       |                                                                                                                                                                                                                                   |
| LocationGroupTag |    0 | pin_tag_links  |                                                                                                                                                                                                                                   |
| LocationTagCache |    2 | pin_tag_cache  |                                                                                                                                                                                                                                   |
| GeoCache         |    0 | geo_cache      |                                                                                                                                                                                                                                   |
| LocationGroupJob |    0 | pin_batch_jobs |                                                                                                                                                                                                                                   |

### Bounty

| Old table                      | Rows | New table                                                                   | Note |
| ------------------------------ | ---: | --------------------------------------------------------------------------- | ---- |
| Bounty                         |   10 | bounties                                                                    |      |
| ↳ Prize asset                  |      | Wadzzo: 3, Action Tokens: 2, Action: 2, BeamUS: 1, fyronalias: 1, CHANGE: 1 |      |
| BountyParticipant              |   10 | bounty_participants                                                         |      |
| BountySubmission               |    4 | bounty_submissions                                                          |      |
| BountySubmissionMedia          |    1 | submission_attachments                                                      |      |
| BountySubmissionCapture        |    2 | submission_captures                                                         |      |
| BountyWinner                   |    3 | bounty_winners                                                              |      |
| BountyMusicConfig              |    3 | bounty_music_rules                                                          |      |
| BountyTrack                    |    8 | bounty_tracks                                                               |      |
| BountyParticipantTrackProgress |    2 | bounty_track_progress                                                       |      |

### Agent

| Old table         |      Rows | New table           | Note                                                                |
| ----------------- | --------: | ------------------- | ------------------------------------------------------------------- |
| AgentJob          |         3 | agent_jobs          |                                                                     |
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

- Beam
- BeamReaction
- BeamComment
- CommunityPostLike
- CommunityComment
- Community
- CommunityTokenRequirement
- CommunityMember
- CommunityPost
- CommunityPostMedia
- CommunityActivity
- CommunityNotificationPreference
- GallerySlotOverride
- MuseumRoom
- TelegramConfig
- CreatorGallery
- OriginBlockedUser
- OriginReward
- QuarterReward
- QuarterBlockedUser
- GallerySlotLike
