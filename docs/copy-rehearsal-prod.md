# Data copy report (rehearsal)

Generated 2026-11-20T10:00:46.513Z. Took 43 s. Target schema: `public`.

## Checks

- Every count below adds up (old rows = new rows + rows skipped for a stated reason).
- 8 stored keys open correctly and match their public keys.
- 8 of 8 stored accounts exist on mainnet (read only).
- 3 admins, 0 users without a wallet.
- No unfinished orders or jobs carried over, so the new worker has nothing to act on.

## Left out, and why

- 3 × Creator.storageKey: STORAGE key unusable: no account stored
- 7 × TemporalFollow: also a real follow: the real one wins
- 1 × Bounty: prize asset is not BANDCOIN, XLM or USDC: skipped by owner decision
- 1 × BountyParticipant: belongs to a skipped bounty
- 1 × BountySubmission: belongs to a skipped bounty
- 1 × BountyWinner: belongs to a skipped bounty

## Counts

| Old | Rows | New | Rows | Skipped |
|---|---:|---|---:|---:|
| User | 58 | users | 58 | 0 |
| Creator | 8 | organizations | 8 | 0 |
| Subscription | 0 | membership_tiers | 0 | 0 |
| VanitySubscription | 0 | vanity_urls | 0 | 0 |
| CreatorCustomDomain | 0 | custom_domains | 0 | 0 |
| Appearance | 0 | page_layouts | 0 | 0 |
| LayoutTemplate | 0 | page_templates | 0 | 0 |
| LastFMAccount | 0 | lastfm_accounts | 0 | 0 |
| Album | 1 | albums | 1 | 0 |
| User_Asset | 0 | ownerships | 0 | 0 |
| NftToken | 0 | nft_editions | 0 | 0 |
| NftLockedMedia | 0 | locked_contents | 0 | 0 |
| NftUnlockLocationRule | 0 | unlock_rules | 0 | 0 |
| NftUnlockLocationPoint | 0 | unlock_points | 0 | 0 |
| NftContentRedeem | 0 | locked_content_redeems | 0 | 0 |
| NftPurchase | 0 | orders | 0 | 0 |
| PostGroup | 1 | posts | 1 | 0 |
| Media | 0 | post_media | 0 | 0 |
| Post | 100 | post_collectibles | 100 | 0 |
| Like | 1 | post_likes | 1 | 0 |
| Comment | 1 | post_comments | 1 | 0 |
| NotificationObject | 62 | notification_events | 62 | 0 |
| Notification | 62 | notifications | 62 | 0 |
| LocationGroup | 11 | pins | 11 | 0 |
| Location | 51 | pin_spots | 51 | 0 |
| LocationConsumer | 1 | pin_claims | 1 | 0 |
| LocationTag | 7 | pin_tags | 7 | 0 |
| LocationGroupTag | 70 | pin_tag_links | 70 | 0 |
| LocationTagCache | 10 | pin_tag_cache | 10 | 0 |
| GeoCache | 29 | geo_cache | 29 | 0 |
| LocationGroupJob | 1 | pin_batch_jobs | 1 | 0 |
| Bounty | 1 | bounties | 0 | 1 |
| BountyParticipant | 1 | bounty_participants | 0 | 1 |
| BountySubmission | 1 | bounty_submissions | 0 | 1 |
| BountyWinner | 1 | bounty_winners | 0 | 1 |
| BountyMusicConfig | 0 | bounty_music_rules | 0 | 0 |
| BountyTrack | 0 | bounty_tracks | 0 | 0 |
| AgentJob | 14 | agent_jobs | 14 | 0 |
| AgentConversation | 0 | agent_conversations | 0 | 0 |
| AgentMessage | 0 | agent_messages | 0 | 0 |
| AgentAction | 0 | agent_actions | 0 | 0 |
| CreatorPageAsset + external + classic Asset | 5 | classic_tokens | 5 | 0 |
| Asset + Nft + fan tokens | 5 | items | 5 | 0 |
| Follow + TemporalFollow | 27 | follows | 20 | 7 |
