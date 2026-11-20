/**
 * What the dry run looks at: every old table, where its rows go, and the
 * queries that find rows that can't be carried over cleanly. Table names are
 * the old Prisma model names (quoted, case-sensitive).
 */

export type Issue = {
  /** Plain-words description shown in the report */
  label: string;
  /** SELECT count(*) AS n … */
  sql: string;
  /** What the migration does with these rows */
  action: string;
};

export type TableCheck = {
  domain: string;
  oldTable: string;
  newTable: string;
  note?: string;
  issues?: Issue[];
  /** SELECT key AS k, count(*) AS n … GROUP BY 1: a breakdown worth seeing */
  breakdown?: { label: string; sql: string };
};

const t = (name: string) => `"${name}"`;
const n = (from: string, where = "true") => `SELECT count(*) AS n FROM ${from} WHERE ${where}`;

export const CHECKS: TableCheck[] = [
  // ── Identity ───────────────────────────────────────────────────────────
  {
    domain: "Identity",
    oldTable: "User",
    newTable: "users",
    note: "Old id is the Stellar public key; it becomes walletAddress and a new cuid id.",
    issues: [
      {
        label: "Users whose id is not a Stellar public key",
        sql: n(t("User"), `id !~ '^G[A-Z2-7]{55}$'`),
        action: "Kept; walletAddress left empty and flagged for review.",
      },
      {
        label: "Duplicate emails ignoring case",
        sql: `SELECT count(*) AS n FROM (SELECT lower(email) FROM "User" WHERE email IS NOT NULL GROUP BY 1 HAVING count(*) > 1) d`,
        action:
          "First sign-up keeps the email; the others get it cleared and are listed for review.",
      },
    ],
    breakdown: {
      label: "Sign-up method",
      sql: `SELECT coalesce("firstSignUpMethod", '(none)') AS k, count(*) AS n FROM "User" GROUP BY 1 ORDER BY 2 DESC`,
    },
  },
  {
    domain: "Identity",
    oldTable: "Admin",
    newTable: "users.role = ADMIN",
    note: "Separate table replaced by a role.",
  },
  {
    domain: "Identity",
    oldTable: "Account",
    newTable: "(dropped)",
    note: "Unused: sessions are JWTs.",
  },
  {
    domain: "Identity",
    oldTable: "Session",
    newTable: "(dropped)",
    note: "Unused: sessions are JWTs.",
  },
  { domain: "Identity", oldTable: "VerificationToken", newTable: "(dropped)", note: "Unused." },

  // ── Artist ─────────────────────────────────────────────────────────────
  {
    domain: "Artist",
    oldTable: "Creator",
    newTable: "organizations + chain_accounts (storage)",
    note: "Storage secret is re-encrypted into chain_accounts.",
    issues: [
      {
        label: "Artists without a storage secret",
        sql: n(t("Creator"), `"storageSecret" IS NULL OR "storageSecret" = ''`),
        action: "Artist kept without a storage account; flagged.",
      },
      {
        label: "Artists without a name",
        sql: n(t("Creator"), `coalesce(trim(name), '') = ''`),
        action: "Name taken from the user, else 'Artist <id>'.",
      },
    ],
    breakdown: {
      label: "Approval",
      sql: `SELECT CASE WHEN approved IS TRUE THEN 'APPROVED' WHEN approved IS FALSE THEN 'BANNED' ELSE 'PENDING' END AS k, count(*) AS n FROM "Creator" GROUP BY 1`,
    },
  },
  {
    domain: "Artist",
    oldTable: "CreatorPageAsset",
    newTable: "items (FAN_TOKEN) + classic_tokens + chain_accounts (issuer)",
    note: "Plus artists with customPageAssetCodeIssuer (external fan token).",
    issues: [
      {
        label: "Fan tokens without an issuer secret",
        sql: n(t("CreatorPageAsset"), `"issuerPrivate" IS NULL`),
        action: "Imported as external tokens (no issuer key held).",
      },
    ],
  },
  { domain: "Artist", oldTable: "CreatorAssetIssuer", newTable: "chain_accounts (ISSUER)" },
  {
    domain: "Artist",
    oldTable: "Subscription",
    newTable: "membership_tiers",
    note: "price (copies of the fan token to hold) becomes requiredTokens.",
  },
  { domain: "Artist", oldTable: "Follow", newTable: "follows" },
  {
    domain: "Artist",
    oldTable: "TemporalFollow",
    newTable: "follows (isTemporary)",
    issues: [
      {
        label: "Temporary follows that are also real follows",
        sql: `SELECT count(*) AS n FROM "TemporalFollow" t JOIN "Follow" f USING ("userId", "creatorId")`,
        action: "The real follow wins; the temporary one is skipped.",
      },
    ],
  },
  { domain: "Artist", oldTable: "VanitySubscription", newTable: "vanity_urls" },
  {
    domain: "Artist",
    oldTable: "VanityPayment",
    newTable: "vanity_payments",
    note: "Old payments were BANDCOIN.",
  },
  { domain: "Artist", oldTable: "CreatorCustomDomain", newTable: "custom_domains" },
  { domain: "Artist", oldTable: "Appearance", newTable: "page_layouts" },
  { domain: "Artist", oldTable: "Widget", newTable: "page_widgets" },
  { domain: "Artist", oldTable: "LayoutTemplate", newTable: "page_templates" },
  { domain: "Artist", oldTable: "LastFMAccount", newTable: "lastfm_accounts" },

  // ── Catalog ────────────────────────────────────────────────────────────
  {
    domain: "Catalog",
    oldTable: "Asset",
    newTable: "items (CLASSIC_TOKEN) + classic_tokens + item_media",
    issues: [
      {
        label: "Items whose code+issuer is not unique",
        sql: `SELECT count(*) AS n FROM (SELECT code, issuer FROM "Asset" GROUP BY 1, 2 HAVING count(*) > 1) d`,
        action: "Cannot happen (old unique index); checked anyway.",
      },
      {
        label: "Items with a missing cover",
        sql: n(t("Asset"), `coalesce(thumbnail, '') = ''`),
        action: "Placeholder cover; flagged.",
      },
    ],
    breakdown: {
      label: "Type × visibility",
      sql: `SELECT "mediaType" || ' / ' || privacy AS k, count(*) AS n FROM "Asset" GROUP BY 1 ORDER BY 2 DESC`,
    },
  },
  {
    domain: "Catalog",
    oldTable: "Song",
    newTable: "tracks",
    note: "Song price/priceUSD become the item's primary listing.",
  },
  { domain: "Catalog", oldTable: "Album", newTable: "albums" },
  { domain: "Catalog", oldTable: "Stem", newTable: "item_stems" },
  {
    domain: "Catalog",
    oldTable: "Nft",
    newTable: "items (CONTRACT_NFT) + contract_nfts",
    breakdown: {
      label: "Status",
      sql: `SELECT status::text AS k, count(*) AS n FROM "Nft" GROUP BY 1`,
    },
  },
  { domain: "Catalog", oldTable: "NftToken", newTable: "nft_editions" },
  { domain: "Catalog", oldTable: "Collection", newTable: "item_collections" },
  { domain: "Catalog", oldTable: "NftLike", newTable: "item_likes" },
  { domain: "Catalog", oldTable: "CollectionLike", newTable: "collection_likes" },
  {
    domain: "Catalog",
    oldTable: "NftLockedMedia",
    newTable: "locked_contents",
    note: "nftId → the NFT's item; chainIndex copied unchanged (the contract's unlock records use it). OTHER stays OTHER (shown as Link).",
    breakdown: {
      label: "Type",
      sql: `SELECT type::text AS k, count(*) AS n FROM "NftLockedMedia" GROUP BY 1`,
    },
    issues: [
      {
        label: "Locked media without a web link",
        sql: n(t("NftLockedMedia"), `url !~* '^https?://'`),
        action: "Copied as is and flagged: owners couldn't open them on the old app either.",
      },
      {
        label: "Two pieces of one NFT with the same chain index",
        sql: `SELECT count(*) AS n FROM (SELECT "nftId", "chainIndex" FROM "NftLockedMedia" GROUP BY 1, 2 HAVING count(*) > 1) d`,
        action: "Copied; flagged for review (the contract can't tell them apart).",
      },
    ],
  },
  {
    domain: "Catalog",
    oldTable: "NftUnlockLocationRule",
    newTable: "unlock_rules",
    note: "radius (m) → radiusMeters, rounded.",
    issues: [
      {
        label: "Rules with no places",
        sql: `SELECT count(*) AS n FROM "NftUnlockLocationRule" r WHERE NOT EXISTS (SELECT 1 FROM "NftUnlockLocationPoint" p WHERE p."ruleId" = r.id)`,
        action: "Copied; the piece can't be unlocked until the artist re-creates it.",
      },
    ],
  },
  { domain: "Catalog", oldTable: "NftUnlockLocationPoint", newTable: "unlock_points" },

  // ── Market ─────────────────────────────────────────────────────────────
  {
    domain: "Market",
    oldTable: "MarketAsset",
    newTable: "listings (PRIMARY)",
    note: "price → priceBandcoin, priceUSD → priceUsd.",
    issues: [
      {
        label: "Listings with no USD price (card/XLM/USDC impossible)",
        sql: n(t("MarketAsset"), `"priceUSD" IS NULL OR "priceUSD" <= 0`),
        action: "Listed as PAUSED until the artist sets a USD price.",
      },
      {
        label: "Listings with no BANDCOIN price",
        sql: n(t("MarketAsset"), `price IS NULL OR price <= 0`),
        action: "Listed as PAUSED until the artist sets a BANDCOIN price.",
      },
    ],
    breakdown: {
      label: "Type",
      sql: `SELECT type::text AS k, count(*) AS n FROM "MarketAsset" GROUP BY 1`,
    },
  },
  {
    domain: "Market",
    oldTable: "SellPageAsset",
    newTable: "listings (fan token)",
    issues: [
      {
        label: "Already sold",
        sql: n(t("SellPageAsset"), `"isSold"`),
        action: "Imported as CLOSED.",
      },
    ],
  },
  {
    domain: "Market",
    oldTable: "NftPrice",
    newTable: "listings (PRIMARY, NFT)",
    breakdown: {
      label: "Payment token",
      sql: `SELECT "paymentToken" AS k, count(*) AS n FROM "NftPrice" GROUP BY 1`,
    },
    issues: [
      {
        label: "NFTs priced only in BANDCOIN or only in USD",
        sql: `SELECT count(*) AS n FROM (SELECT "nftId" FROM "NftPrice" GROUP BY 1 HAVING count(*) FILTER (WHERE "paymentToken" = 'asset') = 0 OR count(*) FILTER (WHERE "paymentToken" = 'usd') = 0) d`,
        action: "Listed as PAUSED until the missing price is set (both are required now).",
      },
    ],
  },
  { domain: "Market", oldTable: "NftListing", newTable: "listings (RESALE)" },
  { domain: "Market", oldTable: "NftListingPrice", newTable: "listings.priceBandcoin / priceUsd" },
  {
    domain: "Market",
    oldTable: "User_Asset",
    newTable: "ownerships (PURCHASE)",
    note: "Merged with Ownership; the chain sync job re-checks balances.",
  },
  {
    domain: "Market",
    oldTable: "User_Song",
    newTable: "ownerships",
    note: "Folded into the song item's ownership.",
  },
  { domain: "Market", oldTable: "Ownership", newTable: "ownerships" },
  { domain: "Market", oldTable: "Order", newTable: "orders" },
  {
    domain: "Market",
    oldTable: "NftPurchase",
    newTable: "orders",
    breakdown: {
      label: "Status",
      sql: `SELECT status::text AS k, count(*) AS n FROM "NftPurchase" GROUP BY 1`,
    },
  },
  { domain: "Market", oldTable: "Redeem", newTable: "redeem_codes" },
  { domain: "Market", oldTable: "RedeemConsumer", newTable: "redeem_claims" },
  {
    domain: "Market",
    oldTable: "NftContentRedeem",
    newTable: "locked_content_redeems",
    note: "nftTokenId → the copy (nft_editions by tokenId); mediaIndex → the piece with that chainIndex; isRedeemed dropped (redeemedAt says it).",
    issues: [
      {
        label: "Codes whose piece doesn't exist (no locked media with that index)",
        sql: `SELECT count(*) AS n FROM "NftContentRedeem" c JOIN "NftToken" k ON k."tokenId" = c."nftTokenId" WHERE NOT EXISTS (SELECT 1 FROM "NftLockedMedia" m WHERE m."nftId" = k."nftId" AND m."chainIndex" = c."mediaIndex")`,
        action: "Skipped (orphans).",
      },
      {
        label: "Codes marked redeemed without a date",
        sql: n(t("NftContentRedeem"), `"isRedeemed" AND "redeemedAt" IS NULL`),
        action: "redeemedAt set to createdAt so they stay redeemed.",
      },
    ],
  },
  { domain: "Market", oldTable: "RoyaltyReport", newTable: "royalty_reports" },
  { domain: "Market", oldTable: "RoyaltyPayout", newTable: "royalty_payouts" },
  { domain: "Market", oldTable: "RoyaltyPayoutLine", newTable: "royalty_payout_lines" },
  {
    domain: "Market",
    oldTable: "AdminAsset",
    newTable: "(waiting for your decision)",
    note: "Admin token directory: not in the new schema yet.",
  },

  // ── Music & social ─────────────────────────────────────────────────────
  { domain: "Music", oldTable: "Playlist", newTable: "playlists" },
  { domain: "Music", oldTable: "PlaylistSong", newTable: "playlist_tracks" },
  { domain: "Music", oldTable: "SongFavorite", newTable: "track_favorites" },
  { domain: "Music", oldTable: "PlayEvent", newTable: "play_events" },
  { domain: "Music", oldTable: "StemMix", newTable: "stem_mixes" },
  { domain: "Social", oldTable: "PostGroup", newTable: "posts" },
  {
    domain: "Social",
    oldTable: "Media",
    newTable: "post_media",
    issues: [
      {
        label: "Media not attached to a post",
        sql: n(t("Media"), `"postGroupId" IS NULL`),
        action: "Skipped (orphans).",
      },
    ],
  },
  {
    domain: "Social",
    oldTable: "Like",
    newTable: "post_likes",
    issues: [
      {
        label: "Un-liked rows (status = false)",
        sql: n(t("Like"), `status = false`),
        action: "Skipped.",
      },
    ],
  },
  { domain: "Social", oldTable: "Comment", newTable: "post_comments" },
  {
    domain: "Social",
    oldTable: "Post",
    newTable: "post_collectibles",
    note: "Collectible copies of a post.",
  },
  {
    domain: "Social",
    oldTable: "PostCollection",
    newTable: "post_collectibles.collectorId",
    note: "Who collected which copy.",
  },
  {
    domain: "Social",
    oldTable: "NotificationObject",
    newTable: "notification_events",
    breakdown: {
      label: "Type",
      sql: `SELECT "entityType"::text AS k, count(*) AS n FROM "NotificationObject" GROUP BY 1 ORDER BY 2 DESC`,
    },
  },
  { domain: "Social", oldTable: "Notification", newTable: "notifications" },

  // ── AR & map ───────────────────────────────────────────────────────────
  {
    domain: "AR",
    oldTable: "LocationGroup",
    newTable: "pins",
    note: "Unlock groups (unlockForTokenId set) → unlock pins: restrictedToUserId, unlockEditionId (the copy), unlockLockedContentId, unlockItemId and the on-chain unlock fields carried over, so owners keep their progress; claimLimit 0.",
    issues: [
      {
        label: "Unlock groups whose copy or locked media is gone",
        sql: `SELECT count(*) AS n FROM "LocationGroup" g WHERE g."unlockForTokenId" IS NOT NULL AND (NOT EXISTS (SELECT 1 FROM "NftToken" k WHERE k.id = g."unlockForTokenId") OR NOT EXISTS (SELECT 1 FROM "NftLockedMedia" m WHERE m.id = g."unlockForLockedMediaId"))`,
        action: "Skipped (orphans); the new app makes them again when the owner opens the NFT.",
      },
    ],
    breakdown: {
      label: "Approval",
      sql: `SELECT CASE WHEN approved IS TRUE THEN 'APPROVED' WHEN approved IS FALSE THEN 'REJECTED' ELSE 'PENDING' END AS k, count(*) AS n FROM "LocationGroup" GROUP BY 1`,
    },
  },
  {
    domain: "AR",
    oldTable: "Location",
    newTable: "pin_spots",
    issues: [
      {
        label: "Spots without a pin",
        sql: n(t("Location"), `"locationGroupId" IS NULL`),
        action: "Skipped (orphans).",
      },
    ],
  },
  { domain: "AR", oldTable: "LocationConsumer", newTable: "pin_claims" },
  {
    domain: "AR",
    oldTable: "Hotspot",
    newTable: "hotspots",
    note: "QStash schedule ids dropped; the worker schedules drops.",
  },
  { domain: "AR", oldTable: "LocationTag", newTable: "pin_tags" },
  { domain: "AR", oldTable: "LocationGroupTag", newTable: "pin_tag_links" },
  { domain: "AR", oldTable: "LocationTagCache", newTable: "pin_tag_cache" },
  { domain: "AR", oldTable: "GeoCache", newTable: "geo_cache" },
  { domain: "AR", oldTable: "LocationGroupJob", newTable: "pin_batch_jobs" },

  // ── Bounty ─────────────────────────────────────────────────────────────
  {
    domain: "Bounty",
    oldTable: "Bounty",
    newTable: "bounties",
    breakdown: {
      label: "Prize asset",
      sql: `SELECT "prizeAssetCode" AS k, count(*) AS n FROM "Bounty" GROUP BY 1 ORDER BY 2 DESC`,
    },
    issues: [
      {
        label: "Bounties with a prize asset other than BANDCOIN, XLM or USDC",
        sql: n(t("Bounty"), `upper("prizeAssetCode") NOT IN ('BANDCOIN', 'XLM', 'NATIVE', 'USDC')`),
        action: "Needs your decision (see below).",
      },
    ],
  },
  { domain: "Bounty", oldTable: "BountyParticipant", newTable: "bounty_participants" },
  { domain: "Bounty", oldTable: "BountySubmission", newTable: "bounty_submissions" },
  { domain: "Bounty", oldTable: "BountySubmissionMedia", newTable: "submission_attachments" },
  { domain: "Bounty", oldTable: "BountySubmissionCapture", newTable: "submission_captures" },
  { domain: "Bounty", oldTable: "BountyWinner", newTable: "bounty_winners" },
  { domain: "Bounty", oldTable: "BountyMusicConfig", newTable: "bounty_music_rules" },
  { domain: "Bounty", oldTable: "BountyTrack", newTable: "bounty_tracks" },
  {
    domain: "Bounty",
    oldTable: "BountyParticipantTrackProgress",
    newTable: "bounty_track_progress",
  },

  // ── Agent ──────────────────────────────────────────────────────────────
  { domain: "Agent", oldTable: "AgentJob", newTable: "agent_jobs" },
  {
    domain: "Agent",
    oldTable: "AgentConversation",
    newTable: "agent_conversations",
    note: "Agent chat history (in the DB, missing from bandfan's schema file).",
    breakdown: {
      label: "Columns",
      sql: `SELECT column_name || ':' || data_type AS k, ordinal_position AS n FROM information_schema.columns WHERE table_name = 'AgentConversation' ORDER BY ordinal_position`,
    },
  },
  {
    domain: "Agent",
    oldTable: "AgentMessage",
    newTable: "agent_messages",
    breakdown: {
      label: "Columns",
      sql: `SELECT column_name || ':' || data_type AS k, ordinal_position AS n FROM information_schema.columns WHERE table_name = 'AgentMessage' ORDER BY ordinal_position`,
    },
  },
  {
    domain: "Agent",
    oldTable: "AgentAction",
    newTable: "agent_actions",
    breakdown: {
      label: "Columns",
      sql: `SELECT column_name || ':' || data_type AS k, ordinal_position AS n FROM information_schema.columns WHERE table_name = 'AgentAction' ORDER BY ordinal_position`,
    },
  },

  // ── Platform ───────────────────────────────────────────────────────────
  { domain: "Platform", oldTable: "AppConfig", newTable: "app_settings" },
  { domain: "Platform", oldTable: "Upload", newTable: "uploads" },
  {
    domain: "Platform",
    oldTable: "Tag",
    newTable: "(waiting for your decision)",
    note: "Only used by AdminAsset.",
  },
  { domain: "Platform", oldTable: "AdminAssetTag", newTable: "(waiting for your decision)" },
];
