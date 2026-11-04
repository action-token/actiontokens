# Data copy report (CUTOVER)

Generated 2026-11-04T11:10:26.157Z. Took 133 s. Target schema: `public`.

## Checks

- Every count below adds up (old rows = new rows + rows skipped for a stated reason).
- 26 stored keys open correctly and match their public keys.
- 26 of 26 stored accounts exist on mainnet (read only).
- 8 admins, 0 users without a wallet, 5397 coins in balances.
- No unfinished orders or jobs carried over, so the new worker has nothing to act on.

## Left out, and why

- 1 × Creator.facebook: Facebook token is sealed with the old app's key: the artist reconnects
- 1 × Creator.storageKey: STORAGE key unusable: no account stored
- 4 × TemporalFollow: also a real follow: the real one wins
- 6 × Media: not attached to a post

## Counts

| Old | Rows | New | Rows | Skipped |
|---|---:|---|---:|---:|
| User | 147 | users | 147 | 0 |
| Creator | 17 | artists | 17 | 0 |
| Subscription | 4 | membership_tiers | 4 | 0 |
| VanitySubscription | 4 | vanity_urls | 4 | 0 |
| CreatorCustomDomain | 2 | custom_domains | 2 | 0 |
| Appearance | 3 | page_layouts | 3 | 0 |
| LayoutTemplate | 5 | page_templates | 5 | 0 |
| LastFMAccount | 5 | lastfm_accounts | 5 | 0 |
| Album | 1 | albums | 1 | 0 |
| User_Asset | 1 | ownerships | 1 | 0 |
| NftToken | 8 | nft_editions | 8 | 0 |
| NftLockedMedia | 15 | locked_contents | 15 | 0 |
| NftUnlockLocationRule | 6 | unlock_rules | 6 | 0 |
| NftUnlockLocationPoint | 10 | unlock_points | 10 | 0 |
| NftContentRedeem | 3 | locked_content_redeems | 3 | 0 |
| NftPurchase | 8 | orders | 8 | 0 |
| PostGroup | 7 | posts | 7 | 0 |
| Media | 10 | post_media | 4 | 6 |
| Post | 700 | post_collectibles | 700 | 0 |
| Like | 19 | post_likes | 19 | 0 |
| Comment | 4 | post_comments | 4 | 0 |
| NotificationObject | 212 | notification_events | 212 | 0 |
| Notification | 198 | notifications | 198 | 0 |
| LocationGroup | 143 | pins | 143 | 0 |
| Location | 10105 | pin_spots | 10105 | 0 |
| LocationConsumer | 11 | pin_claims | 11 | 0 |
| LocationTag | 21 | pin_tags | 21 | 0 |
| LocationGroupTag | 838 | pin_tag_links | 838 | 0 |
| LocationTagCache | 21 | pin_tag_cache | 21 | 0 |
| GeoCache | 340 | geo_cache | 340 | 0 |
| LocationGroupJob | 3 | pin_batch_jobs | 3 | 0 |
| Bounty | 2 | bounties | 2 | 0 |
| BountyParticipant | 2 | bounty_participants | 2 | 0 |
| BountySubmission | 1 | bounty_submissions | 1 | 0 |
| BountyWinner | 1 | bounty_winners | 1 | 0 |
| BountyMusicConfig | 1 | bounty_music_rules | 1 | 0 |
| BountyTrack | 5 | bounty_tracks | 5 | 0 |
| CreditBalance | 35 | studio_balances | 35 | 0 |
| AgentJob | 33 | agent_jobs | 33 | 0 |
| AgentConversation | 10 | agent_conversations | 10 | 0 |
| AgentMessage | 31 | agent_messages | 31 | 0 |
| AgentAction | 2 | agent_actions | 2 | 0 |
| CreatorPageAsset + external + classic Asset | 12 | classic_tokens | 12 | 0 |
| Asset + Nft + fan tokens | 21 | items | 21 | 0 |
| Follow + TemporalFollow | 43 | follows | 39 | 4 |
| GenerationJob + AiGeneratedContent | 9 | generations | 9 | 0 |
