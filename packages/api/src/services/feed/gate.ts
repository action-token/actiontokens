import type { PostAccess, PostAudience } from "@bandcoin/db";

type Tier = { name: string; requiredTokens: string } | null;

/** What the rules need to know about the viewer and the artist's fan token. */
type Viewer = {
  /** The artist's fan token; null while their setup is incomplete */
  token: { code: string } | null;
  /** Fan tokens the viewer holds (0 when signed out or without a trustline) */
  held: number;
  /** The viewer's wallet has a trustline to the fan token (they are a subscriber) */
  trusts: boolean;
  /** The viewer follows the artist */
  follows: boolean;
  isOwner: boolean;
};

/** Holding a tier: enough of the artist's fan token. Null when the tier is met. */
function tierShortfall(tier: Exclude<Tier, null>, viewer: Viewer) {
  if (viewer.token && viewer.held >= Number(tier.requiredTokens)) return null;
  return {
    tierName: tier.name,
    needed: tier.requiredTokens,
    code: viewer.token?.code ?? null,
    have: String(viewer.held),
  };
}

/** A post the viewer can't open yet, and what opens it. */
export type PostLock =
  | { kind: "FOLLOW" }
  /** Needs the trustline to the artist's fan token (code is null while they have no token) */
  | { kind: "SUBSCRIBE"; code: string | null }
  | ({ kind: "TIER" } & NonNullable<ReturnType<typeof tierShortfall>>);

/**
 * Whether a post is open to the viewer: everyone's posts always are,
 * followers' posts once they follow, subscribers' posts once they trust the
 * fan token, members' posts for fans holding the
 * tier's fan tokens, and the artist's own posts for the artist. Locked posts
 * show their title and what opens them, not their text or media.
 */
export function postLock(input: { audience: PostAudience; tier: Tier } & Viewer): PostLock | null {
  if (input.isOwner) return null;
  if (input.audience === "FOLLOWERS") return input.follows ? null : { kind: "FOLLOW" };
  if (input.audience === "SUBSCRIBERS")
    return input.token && input.trusts ? null : { kind: "SUBSCRIBE", code: input.token?.code ?? null };
  if (input.audience === "MEMBERS" && input.tier) {
    const short = tierShortfall(input.tier, input);
    return short ? { kind: "TIER", ...short } : null;
  }
  return null;
}

/** Whether the viewer may comment on, or collect, a post, and if not, why. */
export type PostGate =
  | { open: true }
  | { open: false; reason: "OFF" | "LOCKED" | "FOLLOW" }
  | ({ open: false; reason: "TIER" } & NonNullable<ReturnType<typeof tierShortfall>>);

/**
 * Commenting and collecting each have their own rule: everyone who can open
 * the post, followers, members of a tier, or nobody. "Nobody" holds for the
 * artist too; otherwise the artist always may.
 */
export function postGate(
  input: { access: PostAccess; tier: Tier; viewLocked: boolean } & Viewer,
): PostGate {
  if (input.access === "NOBODY") return { open: false, reason: "OFF" };
  if (input.isOwner) return { open: true };
  if (input.viewLocked) return { open: false, reason: "LOCKED" };
  if (input.access === "FOLLOWERS")
    return input.follows ? { open: true } : { open: false, reason: "FOLLOW" };
  if (input.access === "MEMBERS" && input.tier) {
    const short = tierShortfall(input.tier, input);
    return short ? { open: false, reason: "TIER", ...short } : { open: true };
  }
  return { open: true };
}

/** What a fan reads when a rule stops them, e.g. "Follow DJ Tamsin to comment." */
export function gateMessage(gate: PostGate, action: "comment" | "collect", artistName: string) {
  if (gate.open) return null;
  const doing = action === "comment" ? "comment" : "collect this post";
  switch (gate.reason) {
    case "OFF":
      return action === "comment"
        ? "Comments are off for this post."
        : "This post can't be collected.";
    case "LOCKED":
      return `Open this post first to ${doing}.`;
    case "FOLLOW":
      return `Follow ${artistName} to ${doing}.`;
    case "TIER":
      return gate.code
        ? `Hold ${Number(gate.needed).toLocaleString("en-US")} ${gate.code} (${gate.tierName}) to ${doing}.`
        : `${gate.tierName} members can ${doing} once ${artistName}'s membership opens.`;
  }
}
