import { AppError, ErrorCodes } from "@actiontokens/errors";

import type { Context } from "../../context";

const invalid = (message: string) => new AppError(ErrorCodes.VALIDATION_FAILED, { message });

/**
 * Who can buy an item, as the item forms choose it (main's "Public", "Only
 * Members" or one tier). Members and tiers count the artist's fan token, so
 * both need one, and members need at least one active tier to measure by.
 */
export type ItemAccessInput = { kind: "PUBLIC" | "MEMBERS" | "TIER"; tierId?: string | null };

export async function resolveItemAccess(
  ctx: Pick<Context, "db">,
  organization: { id: string },
  access: ItemAccessInput | undefined,
) {
  if (!access) return {};
  if (access.kind === "PUBLIC") return { membersOnly: false, tierId: null };

  const owner = await ctx.db.organization.findUnique({
    where: { id: organization.id },
    select: {
      fanTokenItemId: true,
      tiers: { where: { isActive: true }, select: { id: true } },
    },
  });
  if (!owner?.fanTokenItemId)
    throw invalid("Set up your fan token first: members are counted by it.");
  if (access.kind === "MEMBERS") {
    if (owner.tiers.length === 0) throw invalid("Add a membership tier first.");
    return { membersOnly: true, tierId: null };
  }
  if (!access.tierId || !owner.tiers.some((tier) => tier.id === access.tierId))
    throw invalid("Pick one of your active membership tiers.");
  return { membersOnly: false, tierId: access.tierId };
}

/** How the form shows a saved item's access. */
export const accessKindOf = (item: { membersOnly: boolean; tierId: string | null }) =>
  item.tierId ? ("TIER" as const) : item.membersOnly ? ("MEMBERS" as const) : ("PUBLIC" as const);
