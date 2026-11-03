/** A tier-only post the viewer can't open yet, and what opens it. */
export type PostLock = {
  tierName: string;
  /** Fan tokens to hold */
  needed: string;
  /** The artist's fan token code; null while their setup is incomplete */
  code: string | null;
  /** What the viewer holds now */
  have: string;
};

/**
 * Whether a post is open to the viewer: public posts always are, tier posts
 * for fans holding the tier's fan tokens, and the artist's own posts for the
 * artist. Locked posts show their title and what unlocks them, not their
 * text or media.
 */
export function postLock(input: {
  tier: { name: string; requiredTokens: string } | null;
  token: { code: string } | null;
  /** Fan tokens the viewer holds (0 when signed out or without a trustline) */
  held: number;
  isOwner: boolean;
}): PostLock | null {
  const { tier, token, held, isOwner } = input;
  if (!tier || isOwner) return null;
  if (token && held >= Number(tier.requiredTokens)) return null;
  return {
    tierName: tier.name,
    needed: tier.requiredTokens,
    code: token?.code ?? null,
    have: String(held),
  };
}
