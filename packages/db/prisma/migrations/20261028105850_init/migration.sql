-- CreateEnum
CREATE TYPE "MuralStatus" AS ENUM ('DISCOVERED', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "MuralRejectReason" AS ENUM ('NOT_A_MURAL', 'FRAUD');

-- CreateEnum
CREATE TYPE "CoinReason" AS ENUM ('MURAL_SCAN', 'MURAL_DISCOVERY', 'MURAL_REVOKE', 'ADMIN_ADJUST');

-- CreateEnum
CREATE TYPE "EmbedTheme" AS ENUM ('AUTO', 'LIGHT', 'DARK');

-- CreateEnum
CREATE TYPE "EmbedPinSource" AS ENUM ('ALL', 'ARTIST');

-- CreateEnum
CREATE TYPE "EmbedGesture" AS ENUM ('COOPERATIVE', 'GREEDY');

-- CreateEnum
CREATE TYPE "PinType" AS ENUM ('EVENT', 'BOUNTY', 'EXPERIENCE', 'LAUNCH', 'LANDMARK', 'OTHER');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ArtistStatus" AS ENUM ('PENDING', 'APPROVED', 'BANNED');

-- CreateEnum
CREATE TYPE "VanityStatus" AS ENUM ('TRIAL', 'ACTIVE', 'GRACE', 'LAPSED');

-- CreateEnum
CREATE TYPE "VanityPaymentKind" AS ENUM ('FREE_TRIAL', 'RENEWAL', 'NAME_CHANGE');

-- CreateEnum
CREATE TYPE "LayoutStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "BountyStatus" AS ENUM ('RUNNING', 'PAUSED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CaptureType" AS ENUM ('PHOTO', 'VIDEO');

-- CreateEnum
CREATE TYPE "BountyMusicMode" AS ENUM ('MUSIC_ONLY', 'HYBRID');

-- CreateEnum
CREATE TYPE "BountyRuleType" AS ENUM ('ALL', 'ANY_N', 'TOTAL_PLAYS');

-- CreateEnum
CREATE TYPE "ItemType" AS ENUM ('TRACK', 'VIDEO', 'IMAGE', 'MODEL_3D', 'DOCUMENT', 'ROYALTY', 'TICKET', 'MERCH', 'FAN_TOKEN');

-- CreateEnum
CREATE TYPE "ChainType" AS ENUM ('CLASSIC_TOKEN', 'CONTRACT_NFT');

-- CreateEnum
CREATE TYPE "NftMintStatus" AS ENUM ('PENDING', 'MINTED');

-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('LEGACY', 'PENDING', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "LockedContentType" AS ENUM ('SONG', 'IMAGE', 'VIDEO', 'OTHER');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('FAN', 'ARTIST', 'ADMIN');

-- CreateEnum
CREATE TYPE "ChainAccountKind" AS ENUM ('STORAGE', 'ISSUER', 'PLATFORM');

-- CreateEnum
CREATE TYPE "ListingKind" AS ENUM ('PRIMARY', 'RESALE');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('ACTIVE', 'PAUSED', 'SOLD_OUT', 'CLOSED');

-- CreateEnum
CREATE TYPE "PayMethod" AS ENUM ('WALLET', 'CARD');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('QUOTED', 'AWAITING_SIGNATURE', 'SUBMITTED', 'CONFIRMED', 'DELIVERED', 'CANCELED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "OrderKind" AS ENUM ('ITEM_PURCHASE', 'GIFT', 'VANITY', 'STUDIO_COINS');

-- CreateEnum
CREATE TYPE "OwnershipSource" AS ENUM ('PURCHASE', 'GIFT', 'TRANSFER', 'CREATOR', 'REDEEM', 'PIN_CLAIM', 'BOUNTY', 'SYNC');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('DRAFT', 'SUBMITTING', 'PARTIAL', 'COMPLETE', 'FAILED');

-- CreateEnum
CREATE TYPE "PayoutLineStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('LIKE', 'COMMENT', 'REPLY', 'FOLLOW', 'MEMBERSHIP', 'POST', 'NEW_ITEM', 'PURCHASE', 'BOUNTY', 'BOUNTY_JOINED', 'BOUNTY_SUBMISSION', 'BOUNTY_WINNER', 'BOUNTY_COMMENT');

-- CreateEnum
CREATE TYPE "ActorRole" AS ENUM ('GUEST', 'FAN', 'ARTIST', 'ADMIN', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ActivityStatus" AS ENUM ('SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('BANDCOIN', 'XLM', 'USDC', 'USD');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('AUDIO', 'VIDEO', 'IMAGE', 'MODEL_3D', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('DRAFT', 'PUBLIC', 'FOLLOWERS', 'MEMBERS', 'TIER');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "StudioLedgerKind" AS ENUM ('DEPOSIT', 'SPEND', 'REFUND', 'WITHDRAW', 'BONUS', 'MIGRATED');

-- CreateEnum
CREATE TYPE "LedgerStatus" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED');

-- CreateEnum
CREATE TYPE "GenerationType" AS ENUM ('TEXT', 'IMAGE', 'MUSIC', 'VIDEO', 'SEO', 'SOCIAL');

-- CreateTable
CREATE TABLE "murals" (
    "id" TEXT NOT NULL,
    "autoTitle" TEXT NOT NULL,
    "title" TEXT,
    "artistName" TEXT,
    "namedById" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "coverUrl" TEXT NOT NULL,
    "status" "MuralStatus" NOT NULL DEFAULT 'DISCOVERED',
    "rejectReason" "MuralRejectReason",
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "distinctScanners" INTEGER NOT NULL DEFAULT 0,
    "scanCount" INTEGER NOT NULL DEFAULT 0,
    "discovererId" TEXT NOT NULL,
    "mergedIntoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "murals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mural_embeddings" (
    "id" TEXT NOT NULL,
    "muralId" TEXT NOT NULL,
    "vector" DOUBLE PRECISION[],
    "scanId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mural_embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mural_scans" (
    "id" TEXT NOT NULL,
    "muralId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "accuracyM" DOUBLE PRECISION NOT NULL,
    "timeZone" TEXT NOT NULL,
    "localDay" TEXT NOT NULL,
    "keyframes" TEXT[],
    "vision" JSONB NOT NULL,
    "platform" TEXT NOT NULL,
    "discoveryRank" INTEGER,
    "coinsAwarded" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mural_scans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mural_scan_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "accuracyM" DOUBLE PRECISION NOT NULL,
    "frameKeys" TEXT[],
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "outcome" TEXT,
    "scanId" TEXT,
    "costUnits" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "mural_scan_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mural_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "coinsPerScan" INTEGER NOT NULL DEFAULT 10,
    "discoveryBonus" INTEGER NOT NULL DEFAULT 50,
    "dailyScansPerMural" INTEGER NOT NULL DEFAULT 3,
    "confirmationsNeeded" INTEGER NOT NULL DEFAULT 3,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mural_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coin_balances" (
    "userId" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coin_balances_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "coin_ledger_entries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" "CoinReason" NOT NULL,
    "muralId" TEXT,
    "scanId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coin_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "coverUrl" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "venueName" TEXT,
    "address" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "link" TEXT,
    "linkLabel" TEXT,
    "capacity" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_rsvps" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_rsvps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_comments" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcements" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "ctaLabel" TEXT,
    "ctaUrl" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcement_comments" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcement_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "map_embeds" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "centerLat" DOUBLE PRECISION NOT NULL,
    "centerLng" DOUBLE PRECISION NOT NULL,
    "zoom" DOUBLE PRECISION NOT NULL DEFAULT 12,
    "showUserLocation" BOOLEAN NOT NULL DEFAULT false,
    "gestureMode" "EmbedGesture" NOT NULL DEFAULT 'COOPERATIVE',
    "theme" "EmbedTheme" NOT NULL DEFAULT 'AUTO',
    "accentColor" TEXT NOT NULL DEFAULT '#dbdc2c',
    "pinSource" "EmbedPinSource" NOT NULL DEFAULT 'ALL',
    "pinTypes" "PinType"[] DEFAULT ARRAY[]::"PinType"[],
    "showFilterChips" BOOLEAN NOT NULL DEFAULT false,
    "showSearch" BOOLEAN NOT NULL DEFAULT true,
    "showNearby" BOOLEAN NOT NULL DEFAULT true,
    "showMurals" BOOLEAN NOT NULL DEFAULT true,
    "eventsLabel" TEXT NOT NULL DEFAULT 'Find events',
    "eventsUrl" TEXT,
    "bountiesLabel" TEXT NOT NULL DEFAULT 'View bounties',
    "bountiesUrl" TEXT,
    "allowedDomains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "map_embeds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "map_embed_daily_stats" (
    "embedId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "pinTaps" INTEGER NOT NULL DEFAULT 0,
    "openClicks" INTEGER NOT NULL DEFAULT 0,
    "eventsClicks" INTEGER NOT NULL DEFAULT 0,
    "bountiesClicks" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "map_embed_daily_stats_pkey" PRIMARY KEY ("embedId","day")
);

-- CreateTable
CREATE TABLE "pins" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "type" "PinType" NOT NULL DEFAULT 'OTHER',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "link" TEXT,
    "visibility" "Visibility" NOT NULL DEFAULT 'PUBLIC',
    "tierId" TEXT,
    "rewardItemId" TEXT,
    "rewardsFanToken" BOOLEAN NOT NULL DEFAULT false,
    "claimLimit" INTEGER NOT NULL DEFAULT 0,
    "claimsLeft" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "radiusMeters" DOUBLE PRECISION NOT NULL,
    "isMultiSpot" BOOLEAN NOT NULL DEFAULT false,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "approval" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "aiUrlDescriptions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "hotspotId" TEXT,
    "restrictedToUserId" TEXT,
    "unlockItemId" TEXT,
    "unlockEditionId" TEXT,
    "unlockLockedContentId" TEXT,
    "onChainUnlockedAt" TIMESTAMP(3),
    "onChainUnlockTxHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "eventId" TEXT,

    CONSTRAINT "pins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pin_spots" (
    "id" TEXT NOT NULL,
    "pinId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "autoCollect" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "pin_spots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pin_claims" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "spotId" TEXT NOT NULL,
    "redeemCode" TEXT NOT NULL,
    "isRedeemed" BOOLEAN NOT NULL DEFAULT false,
    "redeemedAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),
    "tokenClaimedAt" TIMESTAMP(3),
    "viewedAt" TIMESTAMP(3),
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pin_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hotspots" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "dropEveryDays" INTEGER NOT NULL,
    "pinDurationDays" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "autoCollect" BOOLEAN NOT NULL DEFAULT false,
    "isMultiSpot" BOOLEAN NOT NULL DEFAULT false,
    "shape" TEXT NOT NULL,
    "geoJson" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "nextDropAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hotspots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pin_tags" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "pin_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pin_tag_links" (
    "pinId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "pin_tag_links_pkey" PRIMARY KEY ("pinId","tagId")
);

-- CreateTable
CREATE TABLE "pin_tag_cache" (
    "title" TEXT NOT NULL,
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pin_tag_cache_pkey" PRIMARY KEY ("title")
);

-- CreateTable
CREATE TABLE "geo_cache" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "geo_cache_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "pin_batch_jobs" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "total" INTEGER NOT NULL DEFAULT 0,
    "completed" INTEGER NOT NULL DEFAULT 0,
    "payload" JSONB NOT NULL,
    "redeemMode" TEXT NOT NULL DEFAULT 'separate',
    "log" JSONB NOT NULL DEFAULT '[]',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pin_batch_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artists" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "bio" TEXT,
    "avatarUrl" TEXT,
    "coverUrl" TEXT,
    "coverHeights" JSONB,
    "sectionLayouts" JSONB,
    "backgroundSvg" TEXT,
    "showBackgroundSvg" BOOLEAN NOT NULL DEFAULT false,
    "website" TEXT,
    "twitter" TEXT,
    "instagram" TEXT,
    "status" "ArtistStatus" NOT NULL DEFAULT 'PENDING',
    "storageAccountId" TEXT,
    "fanTokenItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "artists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_tiers" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "features" TEXT[],
    "color" TEXT,
    "isPopular" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "requiredTokens" DECIMAL(20,7) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membership_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follows" (
    "userId" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "isTemporary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follows_pkey" PRIMARY KEY ("userId","artistId")
);

-- CreateTable
CREATE TABLE "vanity_urls" (
    "artistId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "VanityStatus" NOT NULL DEFAULT 'TRIAL',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidUntil" TIMESTAMP(3) NOT NULL,
    "graceEndsAt" TIMESTAMP(3),
    "reservedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vanity_urls_pkey" PRIMARY KEY ("artistId")
);

-- CreateTable
CREATE TABLE "vanity_payments" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "kind" "VanityPaymentKind" NOT NULL,
    "currency" "Currency" NOT NULL,
    "amount" DECIMAL(20,7) NOT NULL,
    "orderId" TEXT,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vanity_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_domains" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custom_domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "page_layouts" (
    "id" TEXT NOT NULL,
    "artistId" TEXT,
    "name" TEXT NOT NULL,
    "templateKey" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "status" "LayoutStatus" NOT NULL DEFAULT 'DRAFT',
    "theme" JSONB,
    "draftBlocks" JSONB,
    "publishedBlocks" JSONB,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "page_layouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "page_widgets" (
    "id" TEXT NOT NULL,
    "layoutId" TEXT NOT NULL,
    "widgetType" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "groupId" TEXT,
    "customWidth" DOUBLE PRECISION,
    "settings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "page_widgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "page_templates" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "previewImageUrl" TEXT,
    "isSeedDefault" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "blocks" JSONB NOT NULL,
    "theme" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "page_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facebook_connections" (
    "artistId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "pageName" TEXT NOT NULL,
    "pageTokenEncrypted" TEXT NOT NULL,
    "autoPublish" BOOLEAN NOT NULL DEFAULT false,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "facebook_connections_pkey" PRIMARY KEY ("artistId")
);

-- CreateTable
CREATE TABLE "lastfm_accounts" (
    "userId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "realName" TEXT,
    "country" TEXT,
    "sessionKey" TEXT,
    "profileUrl" TEXT NOT NULL,
    "imageUrl" TEXT,
    "playCount" INTEGER NOT NULL DEFAULT 0,
    "isConnected" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "lastfm_accounts_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "bounties" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "instructions" TEXT[],
    "prizeCurrency" "Currency" NOT NULL,
    "prizeAmount" DECIMAL(20,7) NOT NULL,
    "rewardNote" TEXT,
    "maxWinners" INTEGER NOT NULL DEFAULT 1,
    "status" "BountyStatus" NOT NULL DEFAULT 'RUNNING',
    "escrowContractId" TEXT NOT NULL,
    "fundTxHash" TEXT,
    "fundedFromStorage" BOOLEAN NOT NULL DEFAULT false,
    "requiresActionCam" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "eventId" TEXT,

    CONSTRAINT "bounties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bounty_participants" (
    "id" TEXT NOT NULL,
    "bountyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bounty_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bounty_submissions" (
    "id" TEXT NOT NULL,
    "bountyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bounty_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submission_attachments" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "type" "MediaType" NOT NULL,
    "fileName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submission_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submission_captures" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "type" "CaptureType" NOT NULL,
    "originalHash" TEXT NOT NULL,
    "sealedHash" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "capturedAt" TIMESTAMP(3),
    "walletAddress" TEXT,
    "signature" TEXT,
    "sealedAt" TIMESTAMP(3),
    "storageUrl" TEXT NOT NULL,
    "previewUrl" TEXT,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "submission_captures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bounty_winners" (
    "id" TEXT NOT NULL,
    "bountyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "prizeAmount" DECIMAL(20,7) NOT NULL,
    "txHash" TEXT,
    "claimedAt" TIMESTAMP(3),
    "selectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bounty_winners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bounty_music_rules" (
    "bountyId" TEXT NOT NULL,
    "mode" "BountyMusicMode" NOT NULL DEFAULT 'HYBRID',
    "ruleType" "BountyRuleType" NOT NULL DEFAULT 'ANY_N',
    "requiredTracks" INTEGER,
    "totalPlays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bounty_music_rules_pkey" PRIMARY KEY ("bountyId")
);

-- CreateTable
CREATE TABLE "bounty_tracks" (
    "id" TEXT NOT NULL,
    "bountyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artistName" TEXT NOT NULL,
    "albumName" TEXT,
    "albumArtUrl" TEXT,
    "durationSec" INTEGER NOT NULL DEFAULT 180,
    "targetPlays" INTEGER NOT NULL DEFAULT 1,
    "lastFmUrl" TEXT NOT NULL,
    "spotifyUrl" TEXT,
    "youtubeUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bounty_tracks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bounty_track_progress" (
    "participantId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "currentPlays" INTEGER NOT NULL DEFAULT 0,
    "targetPlays" INTEGER NOT NULL DEFAULT 1,
    "baselinePlays" INTEGER NOT NULL DEFAULT 0,
    "isSatisfied" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bounty_track_progress_pkey" PRIMARY KEY ("participantId","trackId")
);

-- CreateTable
CREATE TABLE "items" (
    "id" TEXT NOT NULL,
    "type" "ItemType" NOT NULL,
    "chainType" "ChainType" NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "coverUrl" TEXT NOT NULL,
    "accentColor" TEXT,
    "visibility" "Visibility" NOT NULL DEFAULT 'PUBLIC',
    "tierId" TEXT,
    "supply" INTEGER,
    "royaltyPercent" DECIMAL(7,4),
    "releaseAt" TIMESTAMP(3),
    "saleEndsAt" TIMESTAMP(3),
    "playCount" INTEGER NOT NULL DEFAULT 0,
    "artistId" TEXT,
    "createdById" TEXT NOT NULL,
    "collectionId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classic_tokens" (
    "itemId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "issuerAccountId" TEXT,
    "isExternal" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "classic_tokens_pkey" PRIMARY KEY ("itemId")
);

-- CreateTable
CREATE TABLE "contract_nfts" (
    "itemId" TEXT NOT NULL,
    "contractAddress" TEXT,
    "onChainEditionId" TEXT,
    "royaltyBps" INTEGER NOT NULL DEFAULT 0,
    "mintedCount" INTEGER NOT NULL DEFAULT 0,
    "status" "NftMintStatus" NOT NULL DEFAULT 'PENDING',
    "mintTxHash" TEXT,

    CONSTRAINT "contract_nfts_pkey" PRIMARY KEY ("itemId")
);

-- CreateTable
CREATE TABLE "nft_editions" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nft_editions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_media" (
    "itemId" TEXT NOT NULL,
    "mediaType" "MediaType" NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "demoUrl" TEXT,
    "status" "MediaStatus" NOT NULL DEFAULT 'LEGACY',
    "streamKey" TEXT,
    "previewKey" TEXT,
    "waveformKey" TEXT,
    "previewStartSec" INTEGER NOT NULL DEFAULT 0,
    "durationSec" INTEGER,

    CONSTRAINT "item_media_pkey" PRIMARY KEY ("itemId")
);

-- CreateTable
CREATE TABLE "tracks" (
    "itemId" TEXT NOT NULL,
    "albumId" TEXT,
    "artistName" TEXT NOT NULL,
    "trackNumber" INTEGER,

    CONSTRAINT "tracks_pkey" PRIMARY KEY ("itemId")
);

-- CreateTable
CREATE TABLE "albums" (
    "id" TEXT NOT NULL,
    "artistId" TEXT,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "coverUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "albums_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_stems" (
    "id" TEXT NOT NULL,
    "itemId" TEXT,
    "postMediaId" TEXT,
    "name" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "streamKey" TEXT,
    "color" TEXT NOT NULL DEFAULT '#dbdc2c',
    "trackIndex" INTEGER NOT NULL DEFAULT 0,
    "startSec" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "endSec" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "trimStartSec" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "trimEndSec" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "volume" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "isMuted" BOOLEAN NOT NULL DEFAULT false,
    "isSoloed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "item_stems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_collections" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "coverUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "item_collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_likes" (
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "item_likes_pkey" PRIMARY KEY ("userId","itemId")
);

-- CreateTable
CREATE TABLE "collection_likes" (
    "userId" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collection_likes_pkey" PRIMARY KEY ("userId","collectionId")
);

-- CreateTable
CREATE TABLE "locked_contents" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "type" "LockedContentType" NOT NULL,
    "label" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "chainIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "locked_contents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unlock_rules" (
    "id" TEXT NOT NULL,
    "lockedContentId" TEXT NOT NULL,
    "radiusMeters" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unlock_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unlock_points" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "label" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "unlock_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT,
    "email" TEXT,
    "emailVerifiedAt" TIMESTAMP(3),
    "username" TEXT,
    "usernameChangedAt" TIMESTAMP(3),
    "displayName" TEXT,
    "bio" TEXT,
    "avatarUrl" TEXT,
    "coverUrl" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'FAN',
    "signUpMethod" TEXT,
    "signedUpFromApp" BOOLEAN NOT NULL DEFAULT false,
    "showCollection" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chain_accounts" (
    "id" TEXT NOT NULL,
    "kind" "ChainAccountKind" NOT NULL,
    "publicKey" TEXT NOT NULL,
    "secretEncrypted" TEXT NOT NULL,
    "ownerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chain_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listings" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "editionId" TEXT,
    "kind" "ListingKind" NOT NULL DEFAULT 'PRIMARY',
    "status" "ListingStatus" NOT NULL DEFAULT 'ACTIVE',
    "priceBandcoin" DECIMAL(20,7) NOT NULL,
    "priceUsd" DECIMAL(20,7) NOT NULL,
    "quantity" INTEGER,
    "quantitySold" INTEGER NOT NULL DEFAULT 0,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "kind" "OrderKind" NOT NULL DEFAULT 'ITEM_PURCHASE',
    "buyerId" TEXT,
    "guestEmail" TEXT,
    "listingId" TEXT,
    "itemId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "currency" "Currency" NOT NULL,
    "unitPrice" DECIMAL(20,7) NOT NULL,
    "platformFee" DECIMAL(20,7) NOT NULL,
    "total" DECIMAL(20,7) NOT NULL,
    "method" "PayMethod" NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'QUOTED',
    "quoteExpiresAt" TIMESTAMP(3),
    "txHash" TEXT,
    "cardPaymentId" TEXT,
    "failureCode" TEXT,
    "firstTokenId" TEXT,
    "lastTokenId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ownerships" (
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DECIMAL(20,7) NOT NULL,
    "source" "OwnershipSource" NOT NULL,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "syncedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ownerships_pkey" PRIMARY KEY ("userId","itemId")
);

-- CreateTable
CREATE TABLE "redeem_codes" (
    "code" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "maxClaims" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "redeem_codes_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "redeem_claims" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "redeem_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locked_content_redeems" (
    "code" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "lockedContentId" TEXT NOT NULL,
    "redeemedAt" TIMESTAMP(3),
    "redeemedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "locked_content_redeems_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "royalty_reports" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "fileType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "royalty_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "royalty_payouts" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "reportId" TEXT,
    "currency" "Currency" NOT NULL,
    "totalAmount" DECIMAL(20,7) NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "royalty_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "royalty_payout_lines" (
    "id" TEXT NOT NULL,
    "payoutId" TEXT NOT NULL,
    "holderAddress" TEXT NOT NULL,
    "balance" DECIMAL(20,7) NOT NULL,
    "amount" DECIMAL(20,7) NOT NULL,
    "batchNo" INTEGER NOT NULL,
    "txHash" TEXT,
    "status" "PayoutLineStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "royalty_payout_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "playlists" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "coverUrl" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "playlists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "playlist_tracks" (
    "playlistId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "playlist_tracks_pkey" PRIMARY KEY ("playlistId","itemId")
);

-- CreateTable
CREATE TABLE "track_favorites" (
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "track_favorites_pkey" PRIMARY KEY ("userId","itemId")
);

-- CreateTable
CREATE TABLE "play_events" (
    "id" BIGSERIAL NOT NULL,
    "itemId" TEXT NOT NULL,
    "userId" TEXT,
    "sessionId" TEXT NOT NULL,
    "isPreview" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "play_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stem_mixes" (
    "userId" TEXT NOT NULL,
    "targetKey" TEXT NOT NULL,
    "settings" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stem_mixes_pkey" PRIMARY KEY ("userId","targetKey")
);

-- CreateTable
CREATE TABLE "posts" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "summary" TEXT,
    "tierId" TEXT,
    "facebookPostId" TEXT,
    "isImportOnly" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_media" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "type" "MediaType" NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "artistName" TEXT,
    "albumName" TEXT,
    "thumbnailUrl" TEXT,
    "durationSec" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "post_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_likes" (
    "userId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_likes_pkey" PRIMARY KEY ("userId","postId")
);

-- CreateTable
CREATE TABLE "post_comments" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "parentId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_collectibles" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "collectorId" TEXT,
    "collectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_collectibles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_events" (
    "id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "actorId" TEXT NOT NULL,
    "entityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "isForArtist" BOOLEAN NOT NULL DEFAULT false,
    "seenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "nearbyPinRadiusMeters" DOUBLE PRECISION NOT NULL DEFAULT 500,
    "platformFeeBps" INTEGER NOT NULL DEFAULT 250,
    "platformFeeRecipient" TEXT,
    "vanityMonthlyBandcoin" DECIMAL(20,7),
    "vanityMonthlyUsd" DECIMAL(20,7),
    "vanityNameChangeBandcoin" DECIMAL(20,7),
    "vanityNameChangeUsd" DECIMAL(20,7),
    "studioPrices" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uploads" (
    "key" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uploads_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" BIGSERIAL NOT NULL,
    "actorId" TEXT,
    "actorRole" "ActorRole" NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "input" JSONB,
    "status" "ActivityStatus" NOT NULL,
    "errorCode" TEXT,
    "txHash" TEXT,
    "amount" DECIMAL(20,7),
    "currency" "Currency",
    "app" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "requestId" TEXT,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "lastError" TEXT,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legacy_id_map" (
    "legacyTable" TEXT NOT NULL,
    "legacyId" TEXT NOT NULL,
    "newId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legacy_id_map_pkey" PRIMARY KEY ("legacyTable","legacyId")
);

-- CreateTable
CREATE TABLE "studio_balances" (
    "userId" TEXT NOT NULL,
    "balance" DECIMAL(20,7) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "studio_balances_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "studio_ledger_entries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "StudioLedgerKind" NOT NULL,
    "status" "LedgerStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(20,7) NOT NULL,
    "txHash" TEXT,
    "generationId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "studio_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_packages" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "coins" DECIMAL(20,7) NOT NULL,
    "bonusCoins" DECIMAL(20,7) NOT NULL DEFAULT 0,
    "priceBandcoin" DECIMAL(20,7) NOT NULL,
    "priceUsd" DECIMAL(20,7) NOT NULL,
    "isPopular" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "studio_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "artistId" TEXT,
    "type" "GenerationType" NOT NULL,
    "prompt" TEXT NOT NULL,
    "model" TEXT,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "progress" INTEGER,
    "message" TEXT,
    "cost" DECIMAL(20,7) NOT NULL DEFAULT 0,
    "tokensUsed" INTEGER,
    "outputs" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "generations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_jobs" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "payload" JSONB NOT NULL,
    "result" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stem_projects" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stem_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_conversations" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "blocks" JSONB,
    "steps" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_actions" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "murals_status_idx" ON "murals"("status");

-- CreateIndex
CREATE INDEX "murals_latitude_longitude_idx" ON "murals"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "mural_embeddings_muralId_idx" ON "mural_embeddings"("muralId");

-- CreateIndex
CREATE INDEX "mural_scans_userId_muralId_localDay_idx" ON "mural_scans"("userId", "muralId", "localDay");

-- CreateIndex
CREATE INDEX "mural_scans_muralId_idx" ON "mural_scans"("muralId");

-- CreateIndex
CREATE UNIQUE INDEX "mural_scan_sessions_scanId_key" ON "mural_scan_sessions"("scanId");

-- CreateIndex
CREATE INDEX "mural_scan_sessions_userId_startedAt_idx" ON "mural_scan_sessions"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "coin_ledger_entries_userId_createdAt_idx" ON "coin_ledger_entries"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "coin_ledger_entries_muralId_idx" ON "coin_ledger_entries"("muralId");

-- CreateIndex
CREATE INDEX "events_artistId_idx" ON "events"("artistId");

-- CreateIndex
CREATE INDEX "events_startsAt_idx" ON "events"("startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "event_rsvps_eventId_userId_key" ON "event_rsvps"("eventId", "userId");

-- CreateIndex
CREATE INDEX "event_comments_eventId_createdAt_idx" ON "event_comments"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "announcements_artistId_idx" ON "announcements"("artistId");

-- CreateIndex
CREATE INDEX "announcements_createdAt_idx" ON "announcements"("createdAt");

-- CreateIndex
CREATE INDEX "announcement_comments_announcementId_createdAt_idx" ON "announcement_comments"("announcementId", "createdAt");

-- CreateIndex
CREATE INDEX "map_embeds_artistId_idx" ON "map_embeds"("artistId");

-- CreateIndex
CREATE INDEX "pins_artistId_createdAt_idx" ON "pins"("artistId", "createdAt");

-- CreateIndex
CREATE INDEX "pins_approval_endsAt_idx" ON "pins"("approval", "endsAt");

-- CreateIndex
CREATE INDEX "pins_latitude_longitude_idx" ON "pins"("latitude", "longitude");

-- CreateIndex
CREATE UNIQUE INDEX "pins_unlockEditionId_unlockLockedContentId_key" ON "pins"("unlockEditionId", "unlockLockedContentId");

-- CreateIndex
CREATE INDEX "pin_spots_pinId_idx" ON "pin_spots"("pinId");

-- CreateIndex
CREATE UNIQUE INDEX "pin_claims_redeemCode_key" ON "pin_claims"("redeemCode");

-- CreateIndex
CREATE INDEX "pin_claims_userId_createdAt_idx" ON "pin_claims"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "pin_claims_spotId_idx" ON "pin_claims"("spotId");

-- CreateIndex
CREATE INDEX "hotspots_isActive_nextDropAt_idx" ON "hotspots"("isActive", "nextDropAt");

-- CreateIndex
CREATE UNIQUE INDEX "pin_tags_name_key" ON "pin_tags"("name");

-- CreateIndex
CREATE INDEX "pin_batch_jobs_artistId_createdAt_idx" ON "pin_batch_jobs"("artistId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "artists_userId_key" ON "artists"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "artists_slug_key" ON "artists"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "artists_storageAccountId_key" ON "artists"("storageAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "artists_fanTokenItemId_key" ON "artists"("fanTokenItemId");

-- CreateIndex
CREATE INDEX "artists_status_createdAt_idx" ON "artists"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "membership_tiers_artistId_name_key" ON "membership_tiers"("artistId", "name");

-- CreateIndex
CREATE INDEX "follows_artistId_idx" ON "follows"("artistId");

-- CreateIndex
CREATE UNIQUE INDEX "vanity_urls_name_key" ON "vanity_urls"("name");

-- CreateIndex
CREATE UNIQUE INDEX "vanity_payments_orderId_key" ON "vanity_payments"("orderId");

-- CreateIndex
CREATE INDEX "vanity_payments_artistId_createdAt_idx" ON "vanity_payments"("artistId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "custom_domains_artistId_key" ON "custom_domains"("artistId");

-- CreateIndex
CREATE UNIQUE INDEX "custom_domains_domain_key" ON "custom_domains"("domain");

-- CreateIndex
CREATE INDEX "page_layouts_artistId_isActive_idx" ON "page_layouts"("artistId", "isActive");

-- CreateIndex
CREATE INDEX "page_widgets_layoutId_idx" ON "page_widgets"("layoutId");

-- CreateIndex
CREATE UNIQUE INDEX "page_templates_key_key" ON "page_templates"("key");

-- CreateIndex
CREATE UNIQUE INDEX "lastfm_accounts_sessionKey_key" ON "lastfm_accounts"("sessionKey");

-- CreateIndex
CREATE INDEX "bounties_artistId_idx" ON "bounties"("artistId");

-- CreateIndex
CREATE INDEX "bounties_status_createdAt_idx" ON "bounties"("status", "createdAt");

-- CreateIndex
CREATE INDEX "bounty_participants_userId_idx" ON "bounty_participants"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "bounty_participants_bountyId_userId_key" ON "bounty_participants"("bountyId", "userId");

-- CreateIndex
CREATE INDEX "bounty_submissions_bountyId_createdAt_idx" ON "bounty_submissions"("bountyId", "createdAt");

-- CreateIndex
CREATE INDEX "bounty_submissions_userId_idx" ON "bounty_submissions"("userId");

-- CreateIndex
CREATE INDEX "submission_attachments_submissionId_idx" ON "submission_attachments"("submissionId");

-- CreateIndex
CREATE INDEX "submission_captures_submissionId_idx" ON "submission_captures"("submissionId");

-- CreateIndex
CREATE INDEX "submission_captures_status_idx" ON "submission_captures"("status");

-- CreateIndex
CREATE INDEX "bounty_winners_userId_idx" ON "bounty_winners"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "bounty_winners_bountyId_userId_key" ON "bounty_winners"("bountyId", "userId");

-- CreateIndex
CREATE INDEX "bounty_tracks_bountyId_idx" ON "bounty_tracks"("bountyId");

-- CreateIndex
CREATE UNIQUE INDEX "items_slug_key" ON "items"("slug");

-- CreateIndex
CREATE INDEX "items_artistId_createdAt_idx" ON "items"("artistId", "createdAt");

-- CreateIndex
CREATE INDEX "items_type_visibility_createdAt_idx" ON "items"("type", "visibility", "createdAt");

-- CreateIndex
CREATE INDEX "items_collectionId_idx" ON "items"("collectionId");

-- CreateIndex
CREATE UNIQUE INDEX "classic_tokens_code_issuer_key" ON "classic_tokens"("code", "issuer");

-- CreateIndex
CREATE UNIQUE INDEX "nft_editions_tokenId_key" ON "nft_editions"("tokenId");

-- CreateIndex
CREATE INDEX "nft_editions_itemId_idx" ON "nft_editions"("itemId");

-- CreateIndex
CREATE INDEX "nft_editions_ownerId_idx" ON "nft_editions"("ownerId");

-- CreateIndex
CREATE INDEX "tracks_albumId_idx" ON "tracks"("albumId");

-- CreateIndex
CREATE UNIQUE INDEX "albums_slug_key" ON "albums"("slug");

-- CreateIndex
CREATE INDEX "albums_artistId_idx" ON "albums"("artistId");

-- CreateIndex
CREATE INDEX "item_stems_itemId_idx" ON "item_stems"("itemId");

-- CreateIndex
CREATE INDEX "item_stems_postMediaId_idx" ON "item_stems"("postMediaId");

-- CreateIndex
CREATE UNIQUE INDEX "item_collections_ownerId_name_key" ON "item_collections"("ownerId", "name");

-- CreateIndex
CREATE INDEX "item_likes_itemId_idx" ON "item_likes"("itemId");

-- CreateIndex
CREATE INDEX "locked_contents_itemId_idx" ON "locked_contents"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "unlock_rules_lockedContentId_key" ON "unlock_rules"("lockedContentId");

-- CreateIndex
CREATE INDEX "unlock_points_ruleId_idx" ON "unlock_points"("ruleId");

-- CreateIndex
CREATE UNIQUE INDEX "users_walletAddress_key" ON "users"("walletAddress");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "chain_accounts_publicKey_key" ON "chain_accounts"("publicKey");

-- CreateIndex
CREATE INDEX "chain_accounts_ownerId_kind_idx" ON "chain_accounts"("ownerId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "listings_editionId_key" ON "listings"("editionId");

-- CreateIndex
CREATE INDEX "listings_status_createdAt_idx" ON "listings"("status", "createdAt");

-- CreateIndex
CREATE INDEX "listings_itemId_status_idx" ON "listings"("itemId", "status");

-- CreateIndex
CREATE INDEX "listings_sellerId_idx" ON "listings"("sellerId");

-- CreateIndex
CREATE UNIQUE INDEX "orders_txHash_key" ON "orders"("txHash");

-- CreateIndex
CREATE UNIQUE INDEX "orders_cardPaymentId_key" ON "orders"("cardPaymentId");

-- CreateIndex
CREATE INDEX "orders_buyerId_createdAt_idx" ON "orders"("buyerId", "createdAt");

-- CreateIndex
CREATE INDEX "orders_itemId_createdAt_idx" ON "orders"("itemId", "createdAt");

-- CreateIndex
CREATE INDEX "orders_status_updatedAt_idx" ON "orders"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "ownerships_itemId_idx" ON "ownerships"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "redeem_claims_userId_code_key" ON "redeem_claims"("userId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "locked_content_redeems_editionId_lockedContentId_key" ON "locked_content_redeems"("editionId", "lockedContentId");

-- CreateIndex
CREATE INDEX "royalty_payouts_itemId_idx" ON "royalty_payouts"("itemId");

-- CreateIndex
CREATE INDEX "royalty_payouts_artistId_idx" ON "royalty_payouts"("artistId");

-- CreateIndex
CREATE INDEX "royalty_payout_lines_payoutId_idx" ON "royalty_payout_lines"("payoutId");

-- CreateIndex
CREATE INDEX "royalty_payout_lines_holderAddress_idx" ON "royalty_payout_lines"("holderAddress");

-- CreateIndex
CREATE UNIQUE INDEX "playlists_ownerId_name_key" ON "playlists"("ownerId", "name");

-- CreateIndex
CREATE INDEX "playlist_tracks_playlistId_sortOrder_idx" ON "playlist_tracks"("playlistId", "sortOrder");

-- CreateIndex
CREATE INDEX "play_events_itemId_createdAt_idx" ON "play_events"("itemId", "createdAt");

-- CreateIndex
CREATE INDEX "play_events_sessionId_itemId_createdAt_idx" ON "play_events"("sessionId", "itemId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "posts_facebookPostId_key" ON "posts"("facebookPostId");

-- CreateIndex
CREATE INDEX "posts_artistId_createdAt_idx" ON "posts"("artistId", "createdAt");

-- CreateIndex
CREATE INDEX "post_media_postId_idx" ON "post_media"("postId");

-- CreateIndex
CREATE INDEX "post_likes_postId_idx" ON "post_likes"("postId");

-- CreateIndex
CREATE INDEX "post_comments_postId_createdAt_idx" ON "post_comments"("postId", "createdAt");

-- CreateIndex
CREATE INDEX "post_collectibles_postId_collectedAt_idx" ON "post_collectibles"("postId", "collectedAt");

-- CreateIndex
CREATE UNIQUE INDEX "post_collectibles_postId_collectorId_key" ON "post_collectibles"("postId", "collectorId");

-- CreateIndex
CREATE INDEX "notification_events_actorId_createdAt_idx" ON "notification_events"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_recipientId_isForArtist_createdAt_idx" ON "notifications"("recipientId", "isForArtist", "createdAt");

-- CreateIndex
CREATE INDEX "uploads_userId_createdAt_idx" ON "uploads"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "activity_logs_actorId_createdAt_idx" ON "activity_logs"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "activity_logs_targetType_targetId_idx" ON "activity_logs"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "activity_logs_action_createdAt_idx" ON "activity_logs"("action", "createdAt");

-- CreateIndex
CREATE INDEX "activity_logs_status_createdAt_idx" ON "activity_logs"("status", "createdAt");

-- CreateIndex
CREATE INDEX "jobs_status_runAt_idx" ON "jobs"("status", "runAt");

-- CreateIndex
CREATE INDEX "jobs_type_createdAt_idx" ON "jobs"("type", "createdAt");

-- CreateIndex
CREATE INDEX "legacy_id_map_newId_idx" ON "legacy_id_map"("newId");

-- CreateIndex
CREATE UNIQUE INDEX "studio_ledger_entries_txHash_key" ON "studio_ledger_entries"("txHash");

-- CreateIndex
CREATE INDEX "studio_ledger_entries_userId_createdAt_idx" ON "studio_ledger_entries"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "generations_userId_createdAt_idx" ON "generations"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "agent_jobs_artistId_createdAt_idx" ON "agent_jobs"("artistId", "createdAt");

-- CreateIndex
CREATE INDEX "stem_projects_ownerId_updatedAt_idx" ON "stem_projects"("ownerId", "updatedAt");

-- CreateIndex
CREATE INDEX "agent_conversations_artistId_updatedAt_idx" ON "agent_conversations"("artistId", "updatedAt");

-- CreateIndex
CREATE INDEX "agent_messages_conversationId_createdAt_idx" ON "agent_messages"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "agent_actions_conversationId_idx" ON "agent_actions"("conversationId");

-- AddForeignKey
ALTER TABLE "murals" ADD CONSTRAINT "murals_discovererId_fkey" FOREIGN KEY ("discovererId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "murals" ADD CONSTRAINT "murals_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "murals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mural_embeddings" ADD CONSTRAINT "mural_embeddings_muralId_fkey" FOREIGN KEY ("muralId") REFERENCES "murals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mural_scans" ADD CONSTRAINT "mural_scans_muralId_fkey" FOREIGN KEY ("muralId") REFERENCES "murals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mural_scans" ADD CONSTRAINT "mural_scans_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mural_scan_sessions" ADD CONSTRAINT "mural_scan_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coin_balances" ADD CONSTRAINT "coin_balances_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coin_ledger_entries" ADD CONSTRAINT "coin_ledger_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coin_ledger_entries" ADD CONSTRAINT "coin_ledger_entries_muralId_fkey" FOREIGN KEY ("muralId") REFERENCES "murals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_rsvps" ADD CONSTRAINT "event_rsvps_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_rsvps" ADD CONSTRAINT "event_rsvps_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_comments" ADD CONSTRAINT "event_comments_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_comments" ADD CONSTRAINT "event_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_comments" ADD CONSTRAINT "announcement_comments_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_comments" ADD CONSTRAINT "announcement_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "map_embeds" ADD CONSTRAINT "map_embeds_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "map_embed_daily_stats" ADD CONSTRAINT "map_embed_daily_stats_embedId_fkey" FOREIGN KEY ("embedId") REFERENCES "map_embeds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pins" ADD CONSTRAINT "pins_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pins" ADD CONSTRAINT "pins_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "membership_tiers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pins" ADD CONSTRAINT "pins_rewardItemId_fkey" FOREIGN KEY ("rewardItemId") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pins" ADD CONSTRAINT "pins_hotspotId_fkey" FOREIGN KEY ("hotspotId") REFERENCES "hotspots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pins" ADD CONSTRAINT "pins_restrictedToUserId_fkey" FOREIGN KEY ("restrictedToUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pins" ADD CONSTRAINT "pins_unlockItemId_fkey" FOREIGN KEY ("unlockItemId") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pins" ADD CONSTRAINT "pins_unlockEditionId_fkey" FOREIGN KEY ("unlockEditionId") REFERENCES "nft_editions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pins" ADD CONSTRAINT "pins_unlockLockedContentId_fkey" FOREIGN KEY ("unlockLockedContentId") REFERENCES "locked_contents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pins" ADD CONSTRAINT "pins_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pin_spots" ADD CONSTRAINT "pin_spots_pinId_fkey" FOREIGN KEY ("pinId") REFERENCES "pins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pin_claims" ADD CONSTRAINT "pin_claims_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pin_claims" ADD CONSTRAINT "pin_claims_spotId_fkey" FOREIGN KEY ("spotId") REFERENCES "pin_spots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotspots" ADD CONSTRAINT "hotspots_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pin_tags" ADD CONSTRAINT "pin_tags_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pin_tag_links" ADD CONSTRAINT "pin_tag_links_pinId_fkey" FOREIGN KEY ("pinId") REFERENCES "pins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pin_tag_links" ADD CONSTRAINT "pin_tag_links_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "pin_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pin_batch_jobs" ADD CONSTRAINT "pin_batch_jobs_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artists" ADD CONSTRAINT "artists_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artists" ADD CONSTRAINT "artists_storageAccountId_fkey" FOREIGN KEY ("storageAccountId") REFERENCES "chain_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artists" ADD CONSTRAINT "artists_fanTokenItemId_fkey" FOREIGN KEY ("fanTokenItemId") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_tiers" ADD CONSTRAINT "membership_tiers_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follows" ADD CONSTRAINT "follows_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follows" ADD CONSTRAINT "follows_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vanity_urls" ADD CONSTRAINT "vanity_urls_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vanity_payments" ADD CONSTRAINT "vanity_payments_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vanity_payments" ADD CONSTRAINT "vanity_payments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_domains" ADD CONSTRAINT "custom_domains_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_layouts" ADD CONSTRAINT "page_layouts_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_widgets" ADD CONSTRAINT "page_widgets_layoutId_fkey" FOREIGN KEY ("layoutId") REFERENCES "page_layouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facebook_connections" ADD CONSTRAINT "facebook_connections_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lastfm_accounts" ADD CONSTRAINT "lastfm_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bounties" ADD CONSTRAINT "bounties_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bounties" ADD CONSTRAINT "bounties_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bounty_participants" ADD CONSTRAINT "bounty_participants_bountyId_fkey" FOREIGN KEY ("bountyId") REFERENCES "bounties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bounty_participants" ADD CONSTRAINT "bounty_participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bounty_submissions" ADD CONSTRAINT "bounty_submissions_bountyId_fkey" FOREIGN KEY ("bountyId") REFERENCES "bounties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bounty_submissions" ADD CONSTRAINT "bounty_submissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_attachments" ADD CONSTRAINT "submission_attachments_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "bounty_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_captures" ADD CONSTRAINT "submission_captures_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "bounty_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bounty_winners" ADD CONSTRAINT "bounty_winners_bountyId_fkey" FOREIGN KEY ("bountyId") REFERENCES "bounties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bounty_winners" ADD CONSTRAINT "bounty_winners_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bounty_music_rules" ADD CONSTRAINT "bounty_music_rules_bountyId_fkey" FOREIGN KEY ("bountyId") REFERENCES "bounties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bounty_tracks" ADD CONSTRAINT "bounty_tracks_bountyId_fkey" FOREIGN KEY ("bountyId") REFERENCES "bounty_music_rules"("bountyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bounty_track_progress" ADD CONSTRAINT "bounty_track_progress_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "bounty_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bounty_track_progress" ADD CONSTRAINT "bounty_track_progress_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "bounty_tracks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "membership_tiers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "item_collections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classic_tokens" ADD CONSTRAINT "classic_tokens_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classic_tokens" ADD CONSTRAINT "classic_tokens_issuerAccountId_fkey" FOREIGN KEY ("issuerAccountId") REFERENCES "chain_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_nfts" ADD CONSTRAINT "contract_nfts_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nft_editions" ADD CONSTRAINT "nft_editions_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nft_editions" ADD CONSTRAINT "nft_editions_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_media" ADD CONSTRAINT "item_media_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracks" ADD CONSTRAINT "tracks_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracks" ADD CONSTRAINT "tracks_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "albums"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "albums" ADD CONSTRAINT "albums_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "artists"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_stems" ADD CONSTRAINT "item_stems_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_stems" ADD CONSTRAINT "item_stems_postMediaId_fkey" FOREIGN KEY ("postMediaId") REFERENCES "post_media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_collections" ADD CONSTRAINT "item_collections_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_likes" ADD CONSTRAINT "item_likes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_likes" ADD CONSTRAINT "item_likes_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_likes" ADD CONSTRAINT "collection_likes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_likes" ADD CONSTRAINT "collection_likes_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "item_collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locked_contents" ADD CONSTRAINT "locked_contents_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unlock_rules" ADD CONSTRAINT "unlock_rules_lockedContentId_fkey" FOREIGN KEY ("lockedContentId") REFERENCES "locked_contents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unlock_points" ADD CONSTRAINT "unlock_points_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "unlock_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chain_accounts" ADD CONSTRAINT "chain_accounts_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "nft_editions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ownerships" ADD CONSTRAINT "ownerships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ownerships" ADD CONSTRAINT "ownerships_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redeem_codes" ADD CONSTRAINT "redeem_codes_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redeem_claims" ADD CONSTRAINT "redeem_claims_code_fkey" FOREIGN KEY ("code") REFERENCES "redeem_codes"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redeem_claims" ADD CONSTRAINT "redeem_claims_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locked_content_redeems" ADD CONSTRAINT "locked_content_redeems_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "nft_editions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locked_content_redeems" ADD CONSTRAINT "locked_content_redeems_lockedContentId_fkey" FOREIGN KEY ("lockedContentId") REFERENCES "locked_contents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "royalty_reports" ADD CONSTRAINT "royalty_reports_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "royalty_payouts" ADD CONSTRAINT "royalty_payouts_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "royalty_payouts" ADD CONSTRAINT "royalty_payouts_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "royalty_payouts" ADD CONSTRAINT "royalty_payouts_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "royalty_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "royalty_payout_lines" ADD CONSTRAINT "royalty_payout_lines_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "royalty_payouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playlists" ADD CONSTRAINT "playlists_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playlist_tracks" ADD CONSTRAINT "playlist_tracks_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "playlists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playlist_tracks" ADD CONSTRAINT "playlist_tracks_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "track_favorites" ADD CONSTRAINT "track_favorites_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "track_favorites" ADD CONSTRAINT "track_favorites_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "play_events" ADD CONSTRAINT "play_events_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stem_mixes" ADD CONSTRAINT "stem_mixes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "membership_tiers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_media" ADD CONSTRAINT "post_media_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "post_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_collectibles" ADD CONSTRAINT "post_collectibles_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_collectibles" ADD CONSTRAINT "post_collectibles_collectorId_fkey" FOREIGN KEY ("collectorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_events" ADD CONSTRAINT "notification_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "notification_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_balances" ADD CONSTRAINT "studio_balances_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_ledger_entries" ADD CONSTRAINT "studio_ledger_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_ledger_entries" ADD CONSTRAINT "studio_ledger_entries_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "generations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generations" ADD CONSTRAINT "generations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generations" ADD CONSTRAINT "generations_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "artists"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_jobs" ADD CONSTRAINT "agent_jobs_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stem_projects" ADD CONSTRAINT "stem_projects_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_conversations" ADD CONSTRAINT "agent_conversations_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "agent_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "agent_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
