# 02 · New database schema

Goals: one name per idea, real relations (no "id stored as a string"), `Decimal` for money instead of `Float`, timestamps everywhere, and indexes for every list query. Models are singular PascalCase and are mapped to snake_case plural tables.

## Big changes

1. **One `Item` catalog.** `Asset`, `Nft`, `Song`'s commerce fields and `SellPageAsset` all become an `Item`. Its `chainType` is `CLASSIC_TOKEN` or `CONTRACT_NFT`, with chain details in a 1:1 side table.
2. **One `Listing`, one `Order`, one `Ownership`.** `MarketAsset`, `NftListing` and `SellPageAsset` become `Listing` (primary sale by the artist, or resale by a fan). `User_Asset`, `User_Song`, `NftToken.owner` and `NftPurchase` all go into `Ownership` and `Order`.
3. **User id ≠ wallet key.** Today `User.id` _is_ the Stellar public key. New: `User.id` is a cuid and `User.walletAddress` is unique. This lets an account change or add a wallet later, and keeps keys out of URLs. The migration remaps every foreign key.
4. **Secrets kept separately and encrypted.** Issuer and storage private keys move out of `Creator` and `Asset` into `ChainAccount` (AES-GCM, one key per environment).
5. **Roles on `User`.** `role: FAN | ARTIST | ADMIN` replaces the separate `Admin` table check.

## Tables by domain (old → new)

### Identity

| New                                               | Old                                                                | Notes                                                                                  |
| ------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `User`                                            | User                                                               | + `walletAddress`, `role`, `username` (unique), `displayName`, `avatarUrl`, `coverUrl` |
| `AuthAccount`, `AuthSession`, `VerificationToken` | Account, Session, VerificationToken                                | NextAuth tables, renamed                                                               |
| `ChainAccount`                                    | Creator.storagePub/Secret, CreatorAssetIssuer, Asset.issuerPrivate | `kind: STORAGE                                                                         | ISSUER | STUDIO`, encrypted secret, owner |

### Artist

| New                                        | Old                                                                     |
| ------------------------------------------ | ----------------------------------------------------------------------- |
| `Artist`                                   | Creator (`approved`/`aprovalSend` → `status: PENDING                    | APPROVED | BANNED`) |
| `ArtistToken`                              | CreatorPageAsset + `customPageAssetCodeIssuer` (the artist's fan token) |
| `MembershipTier`                           | Subscription (`requiredTokens` = hold N of the artist token)            |
| `Follow`                                   | Follow + TemporalFollow (`isTemporary` flag)                            |
| `VanityUrl`, `VanityPayment`               | VanitySubscription, VanityPayment                                       |
| `CustomDomain`                             | CreatorCustomDomain                                                     |
| `PageLayout`, `PageWidget`, `PageTemplate` | Appearance, Widget, LayoutTemplate                                      |
| `FacebookConnection`                       | Creator.facebook* fields                                                |
| `LastFmAccount`                            | LastFMAccount                                                           |

### Catalog

| New                                          | Old                                                                                                                                                                                                               |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Item`                                       | Asset, Nft, SellPageAsset: `type` (TRACK, VIDEO, IMAGE, MODEL_3D, DOCUMENT, ROYALTY, TICKET, MERCH), `chainType`, `visibility` (DRAFT, PUBLIC, FOLLOWERS, MEMBERS, TIER), `tierId`, `supply`, `slug`, `deletedAt` |
| `ClassicToken`                               | Asset.code/issuer (1:1 with Item)                                                                                                                                                                                 |
| `ContractNft`                                | Nft.contractAddress/onChainEditionId/royaltyBps (1:1)                                                                                                                                                             |
| `NftEdition`                                 | NftToken (one numbered token)                                                                                                                                                                                     |
| `ItemMedia`                                  | Asset.mediaUrl/demoMediaUrl/streamKey/previewKey/waveformKey, Media                                                                                                                                               |
| `ItemStem`                                   | Stem (`steamUrl` → `sourceUrl`)                                                                                                                                                                                   |
| `Album`, `Track`                             | Album, Song (Track = music metadata, 1:1 with Item)                                                                                                                                                               |
| `ItemCollection`                             | Collection                                                                                                                                                                                                        |
| `LockedContent`, `UnlockRule`, `UnlockPoint` | NftLockedMedia, NftUnlockLocationRule, NftUnlockLocationPoint                                                                                                                                                     |
| `ItemLike`                                   | NftLike, CollectionLike (`targetType`)                                                                                                                                                                            |

### Market

| New                                                   | Old                                                                                                             |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `Listing`                                             | MarketAsset, NftListing, SellPageAsset: `sellerId`, `itemId`, `editionId?`, `quantity`, `kind: PRIMARY          | RESALE` |
| `ListingPrice`                                        | NftPrice, NftListingPrice, the price/priceUSD columns: `currency` (BANDCOIN, XLM, USDC, USD) + `amount Decimal` |
| `Order`                                               | Order + NftPurchase: state machine (see 04)                                                                     |
| `Ownership`                                           | User_Asset, User_Song, Ownership, NftToken.owner                                                                |
| `RedeemCode`, `RedeemClaim`                           | Redeem, RedeemConsumer, NftContentRedeem                                                                        |
| `RoyaltyReport`, `RoyaltyPayout`, `RoyaltyPayoutLine` | same, with Decimal amounts                                                                                      |

### Music

`Playlist`, `PlaylistTrack`, `TrackFavorite` (SongFavorite), `PlayEvent`, `StemMix`, all keyed to `Track`/`Item`.

### Social

| New                                 | Old                              |
| ----------------------------------- | -------------------------------- |
| `Post`                              | PostGroup                        |
| `PostMedia`                         | Media (post part)                |
| `PostLike`, `PostComment`           | Like, Comment                    |
| `PostCollectible`, `PostCollect`    | Post, PostCollection             |
| `NotificationEvent`, `Notification` | NotificationObject, Notification |

### AR and map

| New                       | Old                                                                           |
| ------------------------- | ----------------------------------------------------------------------------- |
| `Pin`                     | LocationGroup (a reward drop: title, reward item, limit, dates, radius, type) |
| `PinSpot`                 | Location (one coordinate of a pin)                                            |
| `PinClaim`                | LocationConsumer                                                              |
| `Hotspot`                 | Hotspot (scheduled pin drops in an area)                                      |
| `PinTag`, `PinTagLink`    | LocationTag, LocationGroupTag                                                 |
| `PinBatchJob`             | LocationGroupJob                                                              |
| `GeoCache`, `PinTagCache` | GeoCache, LocationTagCache                                                    |

### Bounty

`Bounty`, `BountyParticipant`, `BountySubmission`, `SubmissionAttachment` (BountySubmissionMedia), `SubmissionCapture`, `BountyWinner`, `BountyMusicRule` (BountyMusicConfig), `BountyTrack`, `BountyTrackProgress`.

### Studio

| New                        | Old                                                                                      |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| `StudioBalance`            | CreditBalance (deposited studio coins per user, Decimal)                                 |
| `StudioLedgerEntry`        | CreditTransaction: `kind: DEPOSIT                                                        | SPEND | REFUND | WITHDRAW | BONUS`, `txHash` unique when on-chain |
| `StudioPackage`            | CreditPackage (prices per currency)                                                      |
| `Generation`               | GenerationJob + AiGeneratedContent (one row: type, prompt, model, cost, status, outputs) |
| `AgentSession`, `AgentJob` | AgentJob + agent chat history                                                            |
| `StemProject`              | (new) saved stem editor sessions                                                         |

### Platform

`AppSetting` (AppConfig: fees, radius, vanity prices, studio prices), `Upload`, `Job` (new: worker queue, see 07).

### Activity log (new: admins monitor every user and artist action)

`ActivityLog`: one row per mutation, written automatically by tRPC middleware (see 05), so no action can be forgotten.

| Field                                                            | Meaning                                                                             |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `actorId`, `actorRole`                                           | who did it (FAN / ARTIST / ADMIN / SYSTEM for worker jobs)                          |
| `action`                                                         | procedure name, e.g. `order.create`, `pin.claim`, `item.update`, `admin.artist.ban` |
| `targetType`, `targetId`                                         | what it touched (Item, Order, Pin, Bounty, Artist…)                                 |
| `input`                                                          | request input, **redacted** (passwords, secrets, signed XDR, tokens, emails masked) |
| `status`, `errorCode`                                            | SUCCESS or FAILED, plus the AppError code                                           |
| `txHash`, `amount`, `currency`                                   | filled for money actions                                                            |
| `ip`, `userAgent`, `app`, `requestId`, `durationMs`, `createdAt` | context                                                                             |

Indexes: `(actorId, createdAt)`, `(targetType, targetId)`, `(action, createdAt)`, `(status, createdAt)`. Rows are append-only: no update or delete procedures exist. Retention: 1 year (worker job `activity.prune`), with money actions kept forever.

Sign-ins, sign-outs and failed sign-ins are logged too (from the NextAuth events).

## Changes made while building it (2026-10-28)

- **Fan token is an Item** (`type: FAN_TOKEN`) instead of a separate `ArtistToken` table, so buying, listing and owning it use the same code as every other item. `Artist.fanTokenItemId` points at it.
- **Two prices per listing** (`priceBandcoin`, `priceUsd`), replacing `ListingPrice`. XLM and USDC are computed live from USD.
- **Session tables dropped:** sessions are JWTs, and the old Account/Session/VerificationToken tables are empty.
- **ItemLike and CollectionLike** stay two small tables with real foreign keys, instead of one polymorphic table.
- **Agent chat** (`AgentConversation`, `AgentMessage`, `AgentAction`) added. These tables exist in the old database but were missing from bandfan's schema file.
- **AR extras from Wadzzo AR** (`ar-extras.prisma`): murals fans scan for coins (`Mural`, `MuralScan`, `MuralScanSession`, `MuralEmbedding`, `MuralSettings`, `CoinBalance`, `CoinLedgerEntry`), events with RSVPs and comments, announcements, and the embeddable map with daily stats. Pins and bounties can link to an event.
- **Token directory dropped** (`AdminAsset`, `Tag`): it was empty.
- **New dev DB gets a fresh demo seed** (`pnpm --filter @bandcoin/db seed:reset`), not a copy of the old test data. The copy script stays for the production move.
- **Schema is a folder:** `packages/db/prisma/schema/*.prisma`, one file per domain.

- **One issuer per artist** (2026-10-28, phase 3): `Artist.issuerAccountId` points at a `ChainAccount` of kind ISSUER. `ChainAccount.activatedAt` is set once the account is on-chain. `ClassicToken.issuerAccountId` is kept only for per-asset issuers copied from bandfan.
- **Order keeps the quote** the buyer saw: `breakdown` (JSON), `rateUsd`, `sellerAmount`, `royaltyAmount`.

## Dropped

`Tag`/`AdminAsset`/`AdminAssetTag`, `Admin` (replaced by `role`), `User_Song` (folded into Ownership), the duplicated price columns.
