import { Keypair } from "@stellar/stellar-sdk";

import { decryptSecret } from "../../../chain/src/server/secrets";
import type { Copier } from "./copier";

/** Old rows that must equal new rows plus rows skipped for a stated reason. */
const PAIRS: [old: string, next: string][] = [
  ["User", "users"],
  ["Creator", "organizations"],
  ["Subscription", "membership_tiers"],
  ["VanitySubscription", "vanity_urls"],
  ["CreatorCustomDomain", "custom_domains"],
  ["Appearance", "page_layouts"],
  ["LayoutTemplate", "page_templates"],
  ["LastFMAccount", "lastfm_accounts"],
  ["Album", "albums"],
  ["User_Asset", "ownerships"],
  ["NftToken", "nft_editions"],
  ["NftLockedMedia", "locked_contents"],
  ["NftUnlockLocationRule", "unlock_rules"],
  ["NftUnlockLocationPoint", "unlock_points"],
  ["NftContentRedeem", "locked_content_redeems"],
  ["NftPurchase", "orders"],
  ["PostGroup", "posts"],
  ["Media", "post_media"],
  ["Post", "post_collectibles"],
  ["Like", "post_likes"],
  ["Comment", "post_comments"],
  ["NotificationObject", "notification_events"],
  ["Notification", "notifications"],
  ["LocationGroup", "pins"],
  ["Location", "pin_spots"],
  ["LocationConsumer", "pin_claims"],
  ["LocationTag", "pin_tags"],
  ["LocationGroupTag", "pin_tag_links"],
  ["LocationTagCache", "pin_tag_cache"],
  ["GeoCache", "geo_cache"],
  ["LocationGroupJob", "pin_batch_jobs"],
  ["Bounty", "bounties"],
  ["BountyParticipant", "bounty_participants"],
  ["BountySubmission", "bounty_submissions"],
  ["BountyWinner", "bounty_winners"],
  ["BountyMusicConfig", "bounty_music_rules"],
  ["BountyTrack", "bounty_tracks"],
  ["Community", "communities"],
  ["CommunityTokenRequirement", "community_token_requirements"],
  ["CommunityMember", "community_members"],
  ["CommunityPost", "community_posts"],
  ["CommunityPostMedia", "community_post_media"],
  ["CommunityPostLike", "community_post_likes"],
  ["CommunityComment", "community_comments"],
  ["CommunityActivity", "community_activities"],
  ["CommunityNotificationPreference", "community_notification_preferences"],
  ["OriginReward", "origin_rewards"],
  ["QuarterReward", "quarter_rewards"],
  ["OriginBlockedUser", "origin_blocked_users"],
  ["QuarterBlockedUser", "quarter_blocked_users"],
  ["TelegramConfig", "telegram_config"],
  ["CreatorGallery", "creator_galleries"],
  ["MuseumRoom", "museum_rooms"],
  ["GallerySlotOverride", "gallery_slot_overrides"],
  ["GallerySlotLike", "gallery_slot_likes"],
  ["AgentJob", "agent_jobs"],
  ["AgentConversation", "agent_conversations"],
  ["AgentMessage", "agent_messages"],
  ["AgentAction", "agent_actions"],
];

export type CheckLine = {
  old: string;
  next: string;
  oldRows: number;
  newRows: number;
  skipped: number;
};

/** Row count; a table the old database never had (42P01) counts as empty. */
const count = async (client: Copier["source"], table: string) => {
  try {
    return Number((await client.query(`SELECT count(*) AS n FROM "${table}"`)).rows[0].n);
  } catch (error) {
    if ((error as { code?: string }).code === "42P01") return 0;
    throw error;
  }
};

/** Compares counts and checks the keys inside the open transaction; any problem undoes the copy. */
export async function verify(copy: Copier) {
  const lines: CheckLine[] = [];
  const skippedIn = (table: string) => copy.skipped.filter((row) => row.table === table).length;
  for (const [old, next] of PAIRS)
    lines.push({
      old,
      next,
      oldRows: await count(copy.source, old),
      newRows: await count(copy.target, next),
      skipped: skippedIn(old),
    });

  // Tables filled from more than one old table.
  const sum = async (tables: string[]) => {
    let total = 0;
    for (const table of tables) total += await count(copy.source, table);
    return total;
  };
  const fanTokens = await count(copy.target, "classic_tokens");
  const classicAssets = Number(
    (await copy.source.query(`SELECT count(*) n FROM "Asset" WHERE kind = 'STELLAR_CLASSIC'`))
      .rows[0].n,
  );
  const externalOnly = Number(
    (
      await copy.source.query(
        `SELECT count(*) n FROM "Creator" c WHERE "customPageAssetCodeIssuer" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "CreatorPageAsset" p WHERE p."creatorId" = c.id)`,
      )
    ).rows[0].n,
  );
  const pageAssets = await count(copy.source, "CreatorPageAsset");
  lines.push({
    old: "CreatorPageAsset + external + classic Asset",
    next: "classic_tokens",
    oldRows: pageAssets + externalOnly + classicAssets,
    newRows: fanTokens,
    skipped: skippedIn("Creator.customPageAsset"),
  });
  lines.push({
    old: "Asset + Nft + fan tokens",
    next: "items",
    oldRows: (await sum(["Asset", "Nft"])) + pageAssets + externalOnly,
    newRows: await count(copy.target, "items"),
    skipped: skippedIn("Creator.customPageAsset"),
  });
  lines.push({
    old: "Follow + TemporalFollow",
    next: "follows",
    oldRows: await sum(["Follow", "TemporalFollow"]),
    newRows: await count(copy.target, "follows"),
    skipped: skippedIn("TemporalFollow"),
  });
  const wrong = lines.filter((line) => line.oldRows !== line.newRows + line.skipped);
  if (wrong.length > 0)
    throw new Error(
      `Counts don't add up: ${wrong.map((l) => `${l.old} ${l.oldRows} → ${l.next} ${l.newRows} + ${l.skipped} skipped`).join("; ")}`,
    );

  // Every stored key must open with the key we hold and produce its own public key.
  const accounts = (
    await copy.target.query(`SELECT "publicKey", "secretEncrypted" FROM chain_accounts`)
  ).rows as { publicKey: string; secretEncrypted: string }[];
  for (const account of accounts)
    if (
      Keypair.fromSecret(decryptSecret(account.secretEncrypted, copy.chainKey)).publicKey() !==
      account.publicKey
    )
      throw new Error(`Stored key for ${account.publicKey} doesn't open correctly.`);

  // Facts that must survive: admins, purchases' on-chain proof.
  const facts = {
    admins: (await copy.target.query(`SELECT count(*) n FROM users WHERE role = 'ADMIN'`)).rows[0]
      .n,
    walletless: (
      await copy.target.query(`SELECT count(*) n FROM users WHERE "walletAddress" IS NULL`)
    ).rows[0].n,
    openOrders: (
      await copy.target.query(
        `SELECT count(*) n FROM orders WHERE status NOT IN ('DELIVERED', 'FAILED')`,
      )
    ).rows[0].n,
    queuedJobs: (
      await copy.target.query(
        `SELECT (SELECT count(*) FROM agent_jobs WHERE status IN ('QUEUED','RUNNING')) + (SELECT count(*) FROM pin_batch_jobs WHERE status IN ('QUEUED','RUNNING')) n`,
      )
    ).rows[0].n,
  };
  if (Number(facts.openOrders) !== 0 || Number(facts.queuedJobs) !== 0)
    throw new Error(
      "Unfinished orders or jobs were carried over: the new worker would act on them.",
    );
  return { lines, keysChecked: accounts.length, facts };
}

/** Read only: do the stored accounts exist on mainnet? Reported, not fatal. */
export async function accountsOnMainnet(publicKeys: string[]) {
  let found = 0;
  const missing: string[] = [];
  for (const key of publicKeys) {
    const response = await fetch(`https://horizon.stellar.org/accounts/${key}`);
    if (response.status === 200) found += 1;
    else missing.push(key);
  }
  return { found, missing };
}
