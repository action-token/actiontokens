import { AppError, ErrorCodes } from "@bandcoin/errors";
import { validatePrice } from "@bandcoin/utils/asset-code";

import type { Context } from "../../context";
import { invalid } from "./items";

/**
 * Membership tiers: "hold at least N of the artist's fan token". Fans aren't
 * subscribed to anything; their holding decides the tier, so there is no
 * billing here. A tier is shown, hidden (inactive) or deleted when nothing uses it.
 */
type ServiceCtx = Pick<Context, "db" | "activity">;
type ArtistRef = { id: string; fanTokenItemId: string | null };

const MAX_PERKS = 10;

export type TierInput = {
  name: string;
  description: string;
  /** Perks, one per line in the form */
  features: string[];
  /** How many fan tokens a fan holds to be in this tier */
  requiredTokens: string;
  color?: string;
  isPopular?: boolean;
};

function checkTier(input: Partial<TierInput>) {
  if (input.name !== undefined && (input.name.trim().length === 0 || input.name.trim().length > 40)) throw invalid("Name the tier.");
  if (input.description !== undefined && input.description.length > 300) throw invalid("Keep the description under 300 characters.");
  if (input.requiredTokens !== undefined) {
    const problem = validatePrice(input.requiredTokens);
    if (problem) throw invalid(problem);
  }
  if (input.color !== undefined && input.color !== "" && !/^#[0-9a-fA-F]{6}$/.test(input.color)) throw invalid("Pick a colour.");
}

const perks = (features: string[]) => {
  const list = features.map((line) => line.trim()).filter(Boolean);
  if (list.length > MAX_PERKS) throw invalid(`Use at most ${MAX_PERKS} perks.`);
  if (list.some((line) => line.length > 80)) throw invalid("Keep each perk under 80 characters.");
  return list;
};

async function ownTier(ctx: ServiceCtx, artist: Pick<ArtistRef, "id">, tierId: string) {
  const tier = await ctx.db.membershipTier.findFirst({ where: { id: tierId, artistId: artist.id }, select: { id: true } });
  if (!tier) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Tier not found" });
  ctx.activity.set({ targetType: "MembershipTier", targetId: tier.id });
  return tier;
}

const duplicate = (error: unknown) => (error as { code?: string } | null)?.code === "P2002";

export async function listTiers(ctx: Pick<ServiceCtx, "db">, artist: Pick<ArtistRef, "id">) {
  const rows = await ctx.db.membershipTier.findMany({
    where: { artistId: artist.id },
    orderBy: [{ requiredTokens: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      description: true,
      features: true,
      color: true,
      isPopular: true,
      isActive: true,
      requiredTokens: true,
      _count: { select: { items: true, posts: true, pins: true } },
    },
  });
  return rows.map(({ _count, requiredTokens, ...row }) => ({ ...row, requiredTokens: requiredTokens.toString(), inUse: _count.items + _count.posts + _count.pins }));
}

export async function createTier(ctx: ServiceCtx, artist: ArtistRef, input: TierInput) {
  if (!artist.fanTokenItemId) throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, { message: "Create your fan token first." });
  checkTier(input);
  try {
    const tier = await ctx.db.membershipTier.create({
      data: {
        artistId: artist.id,
        name: input.name.trim(),
        description: input.description.trim(),
        features: perks(input.features),
        requiredTokens: input.requiredTokens,
        color: input.color || null,
        isPopular: input.isPopular ?? false,
      },
      select: { id: true },
    });
    ctx.activity.set({ targetType: "MembershipTier", targetId: tier.id });
    return { tierId: tier.id };
  } catch (error) {
    if (duplicate(error)) throw new AppError(ErrorCodes.RESOURCE_CONFLICT, { message: "You already have a tier with that name." });
    throw error;
  }
}

export async function updateTier(ctx: ServiceCtx, artist: Pick<ArtistRef, "id">, input: Partial<TierInput> & { tierId: string; isActive?: boolean }) {
  const tier = await ownTier(ctx, artist, input.tierId);
  checkTier(input);
  const data = {
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.description !== undefined ? { description: input.description.trim() } : {}),
    ...(input.features !== undefined ? { features: perks(input.features) } : {}),
    ...(input.requiredTokens !== undefined ? { requiredTokens: input.requiredTokens } : {}),
    ...(input.color !== undefined ? { color: input.color || null } : {}),
    ...(input.isPopular !== undefined ? { isPopular: input.isPopular } : {}),
    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
  };
  try {
    if (Object.keys(data).length > 0) await ctx.db.membershipTier.update({ where: { id: tier.id }, data });
  } catch (error) {
    if (duplicate(error)) throw new AppError(ErrorCodes.RESOURCE_CONFLICT, { message: "You already have a tier with that name." });
    throw error;
  }
  return { tierId: tier.id };
}

export async function removeTier(ctx: ServiceCtx, artist: Pick<ArtistRef, "id">, tierId: string) {
  const tier = await ownTier(ctx, artist, tierId);
  const uses = (await Promise.all([ctx.db.item.count({ where: { tierId } }), ctx.db.post.count({ where: { tierId } }), ctx.db.pin.count({ where: { tierId } })])).reduce((sum, n) => sum + n, 0);
  if (uses > 0) throw new AppError(ErrorCodes.RESOURCE_CONFLICT, { message: `${uses} items, posts or pins use this tier. Hide it instead.` });
  await ctx.db.membershipTier.delete({ where: { id: tier.id } });
  return { tierId: tier.id };
}
