import type { Placement } from "@bandcoin/storage";

/** Where a file made for this artist (or, with no artist profile, this user) lives in the bucket. */
export const ownerPlacement = (
  owner: { artistId?: string | null; userId: string },
  kind: string,
): Placement =>
  owner.artistId
    ? { owner: "artists", ownerId: owner.artistId, kind }
    : { owner: "users", ownerId: owner.userId, kind };
