# Data copy report (rehearsal)

Generated 2026-11-20T14:31:16.047Z. Took 42 s. Target schema: `public`.

## Checks

- Every count below adds up (old rows = new rows + rows skipped for a stated reason).
- 10 stored keys open correctly and match their public keys.
- 0 of 10 stored accounts exist on mainnet (read only). Not found: GA5CYKO4TGXA2YMGF3QBTVLRQENIV255VQTVAUH6X7N3BAS5HTNCY2D4, GBCDEHIRMPXEO52Q5G2M3RWO4PKO6IJHVP2YGZIDZSPYLQNLESHPM33Z, GA4PXEAU2CGBS6OTDPRAIBTSMK5R4WN7RJBEALAQ7TVHRIYWWHADZEEQ, GDS6FOSZCNOKFLBXIR5KKBYB7FISGN5D4FWFRZCGVQBE6XF4SGF4KVYP, GCSQQSHLOH6OIXL5FVX6WWZ7AAMN3INMBAFWYKWOFB5P7BQAWSBRIEA5, GAWAFFFLPO6LCZJSWCCA6Q3XFAJX3K6DP2JRWKKPNFGHRBUP3GT7XMTA, GBLS2VD36BQV2VSH3BLKL5FWLS2RKR2ANITXBCD7BEAC5MITD3MH44XL, GBCOIE5AJ3W2XFBONJKILVZNMZ6W7UWRG4ZLXLNLLYMV63NXT5K5BRP6, GDQQ2O76XWBGZSWZWUYGILIK7KA6S5V4RENJFAPQWRL4GODIU7QPVIGH, GCQDFPW5BSVEZR73NUDA6UEYZPZASKVG7F6QXWQCUOIKSHFWFEAI7QAR.
- 1 admins, 0 users without a wallet.
- No unfinished orders or jobs carried over, so the new worker has nothing to act on.

## Left out, and why

- 1 × Creator.storageKey: STORAGE key unusable: no account stored
- 1 × TemporalFollow: also a real follow: the real one wins
- 11 × NotificationObject: its community was deleted
- 11 × Notification: its community was deleted
- 8 × Bounty: prize asset is not BANDCOIN, XLM or USDC: skipped by owner decision
- 9 × BountyParticipant: belongs to a skipped bounty
- 3 × BountySubmission: belongs to a skipped bounty
- 2 × BountyWinner: belongs to a skipped bounty
- 3 × BountyMusicConfig: belongs to a skipped bounty
- 8 × BountyTrack: belongs to a skipped bounty

## Counts

| Old | Rows | New | Rows | Skipped |
|---|---:|---|---:|---:|
| User | 32 | users | 32 | 0 |
| Creator | 5 | organizations | 5 | 0 |
| Subscription | 1 | membership_tiers | 1 | 0 |
| VanitySubscription | 0 | vanity_urls | 0 | 0 |
| CreatorCustomDomain | 0 | custom_domains | 0 | 0 |
| Appearance | 0 | page_layouts | 0 | 0 |
| LayoutTemplate | 0 | page_templates | 0 | 0 |
| LastFMAccount | 2 | lastfm_accounts | 2 | 0 |
| Album | 0 | albums | 0 | 0 |
| User_Asset | 0 | ownerships | 0 | 0 |
| NftToken | 4 | nft_editions | 4 | 0 |
| NftLockedMedia | 2 | locked_contents | 2 | 0 |
| NftUnlockLocationRule | 1 | unlock_rules | 1 | 0 |
| NftUnlockLocationPoint | 1 | unlock_points | 1 | 0 |
| NftContentRedeem | 0 | locked_content_redeems | 0 | 0 |
| NftPurchase | 2 | orders | 2 | 0 |
| PostGroup | 2 | posts | 2 | 0 |
| Media | 3 | post_media | 3 | 0 |
| Post | 200 | post_collectibles | 200 | 0 |
| Like | 0 | post_likes | 0 | 0 |
| Comment | 0 | post_comments | 0 | 0 |
| NotificationObject | 122 | notification_events | 111 | 11 |
| Notification | 125 | notifications | 114 | 11 |
| LocationGroup | 5 | pins | 5 | 0 |
| Location | 14 | pin_spots | 14 | 0 |
| LocationConsumer | 1 | pin_claims | 1 | 0 |
| LocationTag | 3 | pin_tags | 3 | 0 |
| LocationGroupTag | 0 | pin_tag_links | 0 | 0 |
| LocationTagCache | 2 | pin_tag_cache | 2 | 0 |
| GeoCache | 0 | geo_cache | 0 | 0 |
| LocationGroupJob | 0 | pin_batch_jobs | 0 | 0 |
| Bounty | 10 | bounties | 2 | 8 |
| BountyParticipant | 10 | bounty_participants | 1 | 9 |
| BountySubmission | 4 | bounty_submissions | 1 | 3 |
| BountyWinner | 3 | bounty_winners | 1 | 2 |
| BountyMusicConfig | 3 | bounty_music_rules | 0 | 3 |
| BountyTrack | 8 | bounty_tracks | 0 | 8 |
| Community | 1 | communities | 1 | 0 |
| CommunityTokenRequirement | 2 | community_token_requirements | 2 | 0 |
| CommunityMember | 3 | community_members | 3 | 0 |
| CommunityPost | 11 | community_posts | 11 | 0 |
| CommunityPostMedia | 9 | community_post_media | 9 | 0 |
| CommunityPostLike | 0 | community_post_likes | 0 | 0 |
| CommunityComment | 0 | community_comments | 0 | 0 |
| CommunityActivity | 14 | community_activities | 14 | 0 |
| CommunityNotificationPreference | 3 | community_notification_preferences | 3 | 0 |
| OriginReward | 4 | origin_rewards | 4 | 0 |
| QuarterReward | 1 | quarter_rewards | 1 | 0 |
| OriginBlockedUser | 0 | origin_blocked_users | 0 | 0 |
| QuarterBlockedUser | 0 | quarter_blocked_users | 0 | 0 |
| TelegramConfig | 1 | telegram_config | 1 | 0 |
| AgentJob | 3 | agent_jobs | 3 | 0 |
| AgentConversation | 0 | agent_conversations | 0 | 0 |
| AgentMessage | 0 | agent_messages | 0 | 0 |
| AgentAction | 0 | agent_actions | 0 | 0 |
| CreatorPageAsset + external + classic Asset | 7 | classic_tokens | 7 | 0 |
| Asset + Nft + fan tokens | 8 | items | 8 | 0 |
| Follow + TemporalFollow | 3 | follows | 2 | 1 |
