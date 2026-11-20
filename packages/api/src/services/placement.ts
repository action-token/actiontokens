import type { Placement } from "@actiontokens/storage";

/** Where a file made for this artist (or, with no artist profile, this user) lives in the bucket. */
export const ownerPlacement = (
  owner: { organizationId?: string | null; userId: string },
  kind: string,
): Placement =>
  owner.organizationId
    ? { owner: "artists", ownerId: owner.organizationId, kind }
    : { owner: "users", ownerId: owner.userId, kind };
