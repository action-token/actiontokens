import { assertLegacySource, assertWritable, dbParts } from "../guard";

/**
 * Where the copy may read and write. The source is the legacy Actionverse database
 * (LEGACY_DATABASE_URL, read only); the target is the new database (DATABASE_URL). A rehearsal
 * writes only to a local database (or a host in ALLOW_DESTRUCTIVE_HOSTS). A --cutover write
 * additionally needs the target host in CUTOVER_ALLOWED_HOSTS and CUTOVER_CONFIRM set to that
 * host name, so a wrong URL in the environment can't write to the wrong place.
 */
export type Target = { schema: string; cutover: boolean };

export function checkTargets(
  input: { sourceUrl: string | undefined; targetUrl: string | undefined; cutover: boolean },
  env: Record<string, string | undefined> = process.env,
): Target {
  const { sourceUrl, targetUrl, cutover } = input;
  if (!sourceUrl || !targetUrl)
    throw new Error("Set LEGACY_DATABASE_URL (read only) and DATABASE_URL (the new database).");
  assertLegacySource(sourceUrl, targetUrl);
  const { hostname } = dbParts(targetUrl);
  if (!cutover) {
    assertWritable(targetUrl, "copy legacy data", env);
    return { schema: "public", cutover: false };
  }
  const allowed = (env.CUTOVER_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  if (!allowed.includes(hostname.toLowerCase()))
    throw new Error(`Refusing --cutover to ${hostname}: not listed in CUTOVER_ALLOWED_HOSTS.`);
  if (env.CUTOVER_CONFIRM !== hostname)
    throw new Error(`Set CUTOVER_CONFIRM=${hostname} to write to that database.`);
  if (
    (env.PROTECTED_HOSTS ?? "")
      .toLowerCase()
      .split(",")
      .map((h) => h.trim())
      .includes(hostname.toLowerCase())
  )
    throw new Error(`Refusing --cutover to ${hostname}: it is listed in PROTECTED_HOSTS.`);
  return { schema: "public", cutover: true };
}

/** Old tables this tool doesn't copy. They're empty today; rows appearing later must stop it. */
export const MUST_BE_EMPTY = [
  "AdminAsset",
  "AdminAssetTag",
  "BountyParticipantTrackProgress",
  "BountySubmissionCapture",
  "BountySubmissionMedia",
  "Collection",
  "CollectionLike",
  "CreatorAssetIssuer",
  "Hotspot",
  "NftLike",
  "Order",
  "Ownership",
  "PlayEvent",
  "Playlist",
  "PlaylistSong",
  "Redeem",
  "RedeemConsumer",
  "RoyaltyPayout",
  "RoyaltyPayoutLine",
  "RoyaltyReport",
  "SellPageAsset",
  "Song",
  "SongFavorite",
  "Stem",
  "User_Song",
  "VanityPayment",
  "Widget",
];
