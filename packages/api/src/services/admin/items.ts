import type { Prisma } from "@actiontokens/db";
import { AppError, ErrorCodes } from "@actiontokens/errors";

import type { Context } from "../../context";
import { ADMIN_PAGE } from "./pins";

/**
 * Every item for /admin/items (bandfan's "market assets"): who made it, what
 * it is, its price, how many sold. The admin can hide one from fans with a
 * reason, and show it again. Nothing is deleted: items with sales stay.
 */
type ServiceCtx = Pick<Context, "db" | "activity">;

export type ItemFilter = {
  search?: string;
  status?: "listed" | "draft" | "hidden";
  chain?: "CLASSIC_TOKEN" | "CONTRACT_NFT";
  cursor?: string;
};

const STATUS_WHERE: Record<NonNullable<ItemFilter["status"]>, Prisma.ItemWhereInput> = {
  listed: { hiddenAt: null, visibility: { not: "DRAFT" } },
  draft: { hiddenAt: null, visibility: "DRAFT" },
  hidden: { hiddenAt: { not: null } },
};

export async function listItems(ctx: Pick<Context, "db">, input: ItemFilter) {
  const q = input.search?.trim();
  const rows = await ctx.db.item.findMany({
    where: {
      deletedAt: null,
      ...(input.status ? STATUS_WHERE[input.status] : {}),
      ...(input.chain ? { chainType: input.chain } : {}),
      ...(q
        ? {
            OR: [
              { id: q },
              { slug: q },
              { title: { contains: q, mode: "insensitive" } },
              { artist: { name: { contains: q, mode: "insensitive" } } },
              { classicToken: { code: { equals: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: ADMIN_PAGE + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      title: true,
      slug: true,
      type: true,
      chainType: true,
      coverUrl: true,
      supply: true,
      visibility: true,
      hiddenAt: true,
      hiddenReason: true,
      createdAt: true,
      artist: { select: { id: true, name: true, userId: true } },
      classicToken: { select: { code: true } },
      listings: {
        where: { kind: "PRIMARY" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { priceBandcoin: true, priceUsd: true, quantitySold: true, status: true },
      },
    },
  });
  const page = rows.slice(0, ADMIN_PAGE);
  return {
    items: page.map((row) => {
      const listing = row.listings[0];
      return {
        id: row.id,
        title: row.title,
        slug: row.slug,
        type: row.type,
        chain: row.chainType,
        code: row.classicToken?.code ?? null,
        coverUrl: row.coverUrl,
        artist: row.artist,
        price: listing
          ? { bandcoin: listing.priceBandcoin.toString(), usd: listing.priceUsd.toString() }
          : null,
        sold: listing?.quantitySold ?? 0,
        supply: row.supply,
        status: row.hiddenAt
          ? ("hidden" as const)
          : row.visibility === "DRAFT"
            ? ("draft" as const)
            : ("listed" as const),
        hidden: row.hiddenAt ? { at: row.hiddenAt, reason: row.hiddenReason } : null,
        createdAt: row.createdAt,
      };
    }),
    nextCursor: rows.length > ADMIN_PAGE ? (page.at(-1)?.id ?? null) : null,
  };
}

export async function setItemHidden(
  ctx: ServiceCtx,
  input: { itemId: string; hidden: boolean; reason?: string },
) {
  const item = await ctx.db.item.findUnique({
    where: { id: input.itemId },
    select: { id: true, deletedAt: true },
  });
  if (!item || item.deletedAt)
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Item not found" });
  ctx.activity.set({ targetType: "Item", targetId: item.id });
  await ctx.db.item.update({
    where: { id: item.id },
    data: input.hidden
      ? { hiddenAt: new Date(), hiddenReason: input.reason?.trim() || null }
      : { hiddenAt: null, hiddenReason: null },
  });
  return { itemId: item.id, hidden: input.hidden };
}
