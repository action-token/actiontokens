/**
 * Where the copy may read and write. The source must be the backup, never the
 * live database. The target must be the rehearsal schema inside the backup
 * database, or the main database with --cutover. Anything else is refused, so
 * a wrong URL in the environment can't write to the wrong place.
 */
const BACKUP = { hostPrefix: "ep-steep-wildflower-", database: "fan" };
const MAIN = { hostPrefix: "ep-soft-term-", database: "fan" };
export const REHEARSAL_SCHEMA = "rehearsal";

const parts = (url: string) => {
  const { hostname, pathname } = new URL(url);
  return { hostname, database: pathname.replace(/^\//, "") };
};
const isDb = (url: string, db: typeof BACKUP) => {
  const { hostname, database } = parts(url);
  return hostname.startsWith(db.hostPrefix) && database === db.database;
};

export type Target = { schema: string; cutover: boolean };

export function checkTargets(input: {
  sourceUrl: string | undefined;
  targetUrl: string | undefined;
  cutover: boolean;
}): Target {
  const { sourceUrl, targetUrl, cutover } = input;
  if (!sourceUrl || !targetUrl)
    throw new Error("Set LEGACY_SOURCE_URL (the backup) and LEGACY_TARGET_URL.");
  if (!isDb(sourceUrl, BACKUP))
    throw new Error(`Refusing source ${parts(sourceUrl).hostname}: only the backup may be read.`);
  if (cutover) {
    if (!isDb(targetUrl, MAIN))
      throw new Error(`Refusing --cutover target ${parts(targetUrl).hostname}.`);
    return { schema: "public", cutover: true };
  }
  if (!isDb(targetUrl, BACKUP))
    throw new Error(
      `Refusing rehearsal target ${parts(targetUrl).hostname}: rehearsals stay in the backup database.`,
    );
  return { schema: REHEARSAL_SCHEMA, cutover: false };
}

/** Old tables this tool doesn't copy. They're empty today; rows appearing later must stop it. */
export const MUST_BE_EMPTY = [
  "AdminAsset",
  "AdminAssetTag",
  "AppConfig",
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
