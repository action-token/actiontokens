import { randomBytes } from "node:crypto";

/** The rules for turning old values into new ones. No database here, so they can be tested. */

export const STELLAR_PUBLIC = /^G[A-Z2-7]{55}$/;
export const STELLAR_SECRET = /^S[A-Z2-7]{55}$/;

export const newId = () =>
  `c${Date.now().toString(36)}${randomBytes(9).toString("hex")}`.slice(0, 25);

/** Money and amounts at Stellar's 7 decimal places. */
export const dec = (value: number | string | null | undefined) => Number(value ?? 0).toFixed(7);

export const json = (value: unknown) =>
  value === null || value === undefined ? null : JSON.stringify(value);

export function slugify(text: string) {
  return (
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "untitled"
  );
}

/** Adds -2, -3… until the slug is free. */
export function uniqueSlug(taken: Set<string>, base: string) {
  const root = slugify(base);
  let slug = root;
  for (let n = 2; taken.has(slug); n++) slug = `${root}-${n}`;
  taken.add(slug);
  return slug;
}

export const itemType = (media: string) =>
  ({ MUSIC: "TRACK", VIDEO: "VIDEO", IMAGE: "IMAGE", THREE_D: "MODEL_3D", DOCUMENT: "DOCUMENT" })[
    media
  ] ?? fail(`media type ${media}`);

export const mediaType = (media: string) =>
  ({ MUSIC: "AUDIO", VIDEO: "VIDEO", IMAGE: "IMAGE", THREE_D: "MODEL_3D", DOCUMENT: "DOCUMENT" })[
    media
  ] ?? fail(`media type ${media}`);

/** Old NFTs store a MIME type. */
export function mimeMedia(mime: string) {
  if (mime.startsWith("image/")) return { item: "IMAGE", media: "IMAGE" };
  if (mime.startsWith("audio/")) return { item: "TRACK", media: "AUDIO" };
  if (mime.startsWith("video/")) return { item: "VIDEO", media: "VIDEO" };
  return fail(`NFT media type ${mime}`);
}

export const visibility = (privacy: string) =>
  ({
    DRAFT: "DRAFT",
    PRIVATE: "DRAFT",
    FOR_SALE: "PUBLIC",
    NOT_FOR_SALE: "PUBLIC",
    PUBLIC: "PUBLIC",
    TIER: "TIER",
    FOLLOWER: "FOLLOWERS",
  })[privacy] ?? fail(`privacy ${privacy}`);

export const artistStatus = (approved: boolean | null) =>
  approved === true ? "APPROVED" : approved === false ? "BANNED" : "PENDING";

export const approval = (approved: boolean | null) =>
  approved === true ? "APPROVED" : approved === false ? "REJECTED" : "PENDING";

/** Old jobs must never start running on the new worker: anything unfinished is canceled. */
export const finishedJobStatus = (status: string) =>
  status === "completed" ? "SUCCEEDED" : status === "failed" ? "FAILED" : "CANCELED";

export const notificationType = (type: string) =>
  ({
    LIKE: "LIKE",
    COMMENT: "COMMENT",
    REPLY: "REPLY",
    FOLLOW: "FOLLOW",
    POST: "POST",
    SUBSCRIPTION: "MEMBERSHIP",
    MEMBER: "MEMBERSHIP",
    SHOP_ASSET: "NEW_ITEM",
    BOUNTY: "BOUNTY",
    BOUNTY_PARTICIPANT: "BOUNTY_JOINED",
    BOUNTY_SUBMISSION: "BOUNTY_SUBMISSION",
    BOUNTY_WINNER: "BOUNTY_WINNER",
    BOUNTY_COMMENT: "BOUNTY_COMMENT",
    BOUNTY_REPLY: "BOUNTY_COMMENT",
    BOUNTY_DOUBT: "BOUNTY_COMMENT",
    BOUNTY_DOUBT_CREATE: "BOUNTY_COMMENT",
    BOUNTY_DOUBT_REPLY: "BOUNTY_COMMENT",
    COMMUNITY_POST: "COMMUNITY_POST",
    COMMUNITY_COMMENT: "COMMUNITY_COMMENT",
    COMMUNITY_REPLY: "COMMUNITY_REPLY",
    COMMUNITY_MEMBER_JOIN: "COMMUNITY_MEMBER_JOIN",
    COMMUNITY_INVITE: "COMMUNITY_INVITE",
    COMMUNITY_REACTION: "COMMUNITY_REACTION",
  })[type] ?? fail(`notification type ${type}`);

/** The old app charged credits at dollar rates, and a coin is a cent (decided 2026-11-04). */
export function prize(code: string, issuer: string | null) {
  const upper = code.toUpperCase();
  if (upper === "BANDCOIN")
    return { prizeCurrency: "BANDCOIN", prizeAssetCode: null, prizeAssetIssuer: null };
  if (upper === "XLM" || upper === "NATIVE")
    return { prizeCurrency: "XLM", prizeAssetCode: null, prizeAssetIssuer: null };
  if (upper === "USDC")
    return { prizeCurrency: "USDC", prizeAssetCode: null, prizeAssetIssuer: null };
  return { prizeCurrency: null, prizeAssetCode: code, prizeAssetIssuer: issuer };
}

/** An NFT's sale: both prices are required now, so a missing one pauses it. */
export function listingStatus(input: {
  bandcoin: number | null;
  usd: number | null;
  soldOut?: boolean;
}) {
  if (input.soldOut) return "SOLD_OUT";
  return (input.bandcoin ?? 0) > 0 && (input.usd ?? 0) > 0 ? "ACTIVE" : "PAUSED";
}

/** Only confirmed purchases count. A pending one must not look like work the order job should do. */
export const orderStatus = (status: string) => (status === "CONFIRMED" ? "DELIVERED" : "FAILED");

export const orderCurrency = (token: string) =>
  ({ asset: "BANDCOIN", usd: "USD", xlm: "XLM", usdc: "USDC" })[token.toLowerCase()] ??
  fail(`payment token ${token}`);

function fail(what: string): never {
  throw new Error(`Unknown ${what}: the mapping needs a rule for it.`);
}
