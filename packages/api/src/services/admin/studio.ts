import type { Prisma } from "@bandcoin/db";
import { AppError, ErrorCodes } from "@bandcoin/errors";

import type { Context } from "../../context";
import {
  coinsForUsd,
  GENERATION_TYPES,
  loadPricing,
  priceList,
  type StudioPricing,
} from "../studio/pricing";

/**
 * Admin › Settings › Studio: what each tool costs at the AI provider and the
 * platform fee on top (prices follow), and the coin packages. A package is
 * priced in dollars; its coins follow (one coin a cent) and it may add bonus coins.
 */
type ServiceCtx = Pick<Context, "db" | "activity">;

export async function getStudioSettings(ctx: Pick<Context, "db">) {
  const [pricing, packages] = await Promise.all([
    loadPricing(ctx),
    ctx.db.studioPackage.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
  ]);
  return {
    pricing,
    prices: priceList(pricing),
    packages: packages.map((pack) => ({
      id: pack.id,
      name: pack.name,
      description: pack.description,
      priceUsd: Number(pack.priceUsd),
      coins: coinsForUsd(Number(pack.priceUsd)),
      bonusCoins: Number(pack.bonusCoins),
      isPopular: pack.isPopular,
      isActive: pack.isActive,
      sortOrder: pack.sortOrder,
    })),
  };
}

export async function updateStudioPricing(ctx: ServiceCtx, input: StudioPricing) {
  for (const type of GENERATION_TYPES)
    if (!(input.apiCostUsd[type] >= 0 && input.apiCostUsd[type] <= 100))
      throw new AppError(ErrorCodes.VALIDATION_FAILED, {
        message: "Each API cost must be between $0 and $100.",
      });
  ctx.activity.set({ targetType: "AppSetting", targetId: "studioPrices" });
  await ctx.db.appSetting.upsert({
    where: { id: 1 },
    create: { id: 1, studioPrices: input as unknown as Prisma.InputJsonValue },
    update: { studioPrices: input as unknown as Prisma.InputJsonValue },
  });
  return getStudioSettings(ctx);
}

export type StudioPackageInput = {
  name: string;
  description?: string | null;
  priceUsd: number;
  bonusCoins: number;
  isPopular: boolean;
  isActive: boolean;
  sortOrder: number;
};

/** Creates a package, or changes one; one marked popular unmarks the others. */
export async function saveStudioPackage(
  ctx: ServiceCtx,
  input: StudioPackageInput & { packageId?: string | null },
) {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 40)
    throw new AppError(ErrorCodes.VALIDATION_FAILED, { message: "Name it in 2 to 40 characters." });
  const priceUsd = Math.round(input.priceUsd * 100) / 100;
  if (!(priceUsd >= 1 && priceUsd <= 500))
    throw new AppError(ErrorCodes.VALIDATION_FAILED, { message: "Price it between $1 and $500." });
  const bonusCoins = Math.round(input.bonusCoins);
  if (!(bonusCoins >= 0 && bonusCoins <= coinsForUsd(priceUsd)))
    throw new AppError(ErrorCodes.VALIDATION_FAILED, {
      message: "The bonus can't be more than the coins the package buys.",
    });
  const data = {
    name,
    description: input.description?.trim() || null,
    priceUsd,
    // Kept for reference; top-ups use the price (one coin a cent).
    coins: coinsForUsd(priceUsd),
    bonusCoins,
    // No separate BANDCOIN price: it follows the live rate when paid.
    priceBandcoin: 0,
    isPopular: input.isPopular,
    isActive: input.isActive,
    sortOrder: Math.round(input.sortOrder),
  };
  const saved = await ctx.db.$transaction(async (tx) => {
    if (input.isPopular)
      await tx.studioPackage.updateMany({
        where: input.packageId ? { id: { not: input.packageId } } : {},
        data: { isPopular: false },
      });
    if (!input.packageId) return tx.studioPackage.create({ data, select: { id: true } });
    const found = await tx.studioPackage.findUnique({
      where: { id: input.packageId },
      select: { id: true },
    });
    if (!found) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Package not found" });
    return tx.studioPackage.update({ where: { id: found.id }, data, select: { id: true } });
  });
  ctx.activity.set({ targetType: "StudioPackage", targetId: saved.id });
  return getStudioSettings(ctx);
}
