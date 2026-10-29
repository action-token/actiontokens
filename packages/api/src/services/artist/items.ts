import crypto from "node:crypto";

import type { ItemType, MediaType, Visibility } from "@bandcoin/db";
import { AppError, ErrorCodes } from "@bandcoin/errors";
import { isOwnS3Url } from "@bandcoin/storage";
import { normalizeAssetCode, validateAssetCode, validatePrice } from "@bandcoin/utils/asset-code";
import { slugFromName } from "@bandcoin/utils/slug";

import type { Context } from "../../context";

/**
 * The artist's classic collectibles: creating, editing, hiding and deleting.
 * Nothing here touches the chain: a classic item is a code under the artist's
 * own issuer, and copies are minted when a fan buys (services/purchase/sale).
 * After the first sale the supply and code are locked, because buyers hold
 * copies of that exact token.
 */
type ServiceCtx = Pick<Context, "db" | "activity">;
type ArtistRef = { id: string; slug: string; issuerAccountId: string | null };

/** Item types this screen creates. Songs, albums and fan tokens have their own tools. */
export type CollectibleType = Exclude<ItemType, "TRACK" | "FAN_TOKEN">;

/** These types are the file itself, so they can't exist without it. */
const NEEDS_FILE: ItemType[] = ["IMAGE", "VIDEO", "MODEL_3D", "DOCUMENT"];
const MAX_SUPPLY = 100_000;

const invalid = (message: string) => new AppError(ErrorCodes.VALIDATION_FAILED, { message });

function checkSupply(supply: number | null) {
  if (supply !== null && (!Number.isInteger(supply) || supply < 1 || supply > MAX_SUPPLY)) {
    throw invalid(`Use a whole number from 1 to ${MAX_SUPPLY.toLocaleString("en-US")}, or leave it unlimited.`);
  }
}

function checkPrices(prices: { priceBandcoin?: string; priceUsd?: string }) {
  for (const price of [prices.priceBandcoin, prices.priceUsd]) {
    const problem = price === undefined ? null : validatePrice(price);
    if (problem) throw invalid(problem);
  }
}

function checkOwnUrls(urls: { cover?: string; file?: string }) {
  if (urls.cover !== undefined && !isOwnS3Url(urls.cover)) throw invalid("Upload the cover again.");
  if (urls.file !== undefined && !isOwnS3Url(urls.file)) throw invalid("Upload the file again.");
}

function checkRoyalty(percent: string | undefined) {
  const value = Number(percent);
  if (!percent || !(value > 0 && value <= 100)) throw invalid("Enter the share holders split, above 0 and up to 100%.");
}

export type CreateItemInput = {
  type: CollectibleType;
  title: string;
  description?: string;
  coverUrl: string;
  media?: { url: string; mediaType: MediaType };
  /** The Stellar asset code, e.g. NIGHTDRV */
  code: string;
  /** Total copies; null = unlimited */
  supply: number | null;
  priceBandcoin: string;
  priceUsd: string;
  visibility: Extract<Visibility, "DRAFT" | "PUBLIC">;
  royaltyPercent?: string;
};

export async function createItem(ctx: ServiceCtx, artist: ArtistRef, user: { id: string }, input: CreateItemInput) {
  const { db } = ctx;
  const issuer = artist.issuerAccountId
    ? await db.chainAccount.findUnique({ where: { id: artist.issuerAccountId }, select: { id: true, publicKey: true, activatedAt: true } })
    : null;
  if (!issuer?.activatedAt) throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, { message: "Open your artist account first." });

  const code = normalizeAssetCode(input.code);
  const codeProblem = validateAssetCode(code);
  if (codeProblem) throw invalid(codeProblem);
  checkPrices(input);
  checkSupply(input.supply);
  checkOwnUrls({ cover: input.coverUrl, file: input.media?.url });
  if (NEEDS_FILE.includes(input.type) && !input.media) throw invalid("Add the file people will get.");
  if (input.type === "ROYALTY") checkRoyalty(input.royaltyPercent);

  const taken = await db.classicToken.findUnique({ where: { code_issuer: { code, issuer: issuer.publicKey } }, select: { itemId: true } });
  if (taken) throw new AppError(ErrorCodes.RESOURCE_CONFLICT, { message: "You already use that code for another item." });

  const item = await db.item.create({
    data: {
      type: input.type,
      chainType: "CLASSIC_TOKEN",
      title: input.title.trim(),
      slug: await freeSlug(db, `${artist.slug}-${slugFromName(input.title)}`),
      description: input.description?.trim() || null,
      coverUrl: input.coverUrl,
      visibility: input.visibility,
      supply: input.supply,
      ...(input.type === "ROYALTY" ? { royaltyPercent: input.royaltyPercent } : {}),
      artistId: artist.id,
      createdById: user.id,
      classicToken: { create: { code, issuer: issuer.publicKey, issuerAccountId: issuer.id } },
      ...(input.media ? { media: { create: { mediaType: input.media.mediaType, sourceUrl: input.media.url } } } : {}),
      listings: {
        create: {
          sellerId: user.id,
          kind: "PRIMARY",
          status: input.visibility === "PUBLIC" ? "ACTIVE" : "PAUSED",
          priceBandcoin: input.priceBandcoin,
          priceUsd: input.priceUsd,
        },
      },
    },
    select: { id: true, slug: true },
  });
  ctx.activity.set({ targetType: "Item", targetId: item.id });
  return { itemId: item.id, slug: item.slug };
}

/** `base`, or `base` with a short random ending when someone already has it. */
async function freeSlug(db: ServiceCtx["db"], base: string) {
  const slug = base.slice(0, 80).replace(/-+$/, "");
  if (!(await db.item.findUnique({ where: { slug }, select: { id: true } }))) return slug;
  return `${slug}-${crypto.randomBytes(3).toString("hex").slice(0, 4)}`;
}

export async function listMyItems(ctx: Pick<ServiceCtx, "db">, artist: Pick<ArtistRef, "id">) {
  const rows = await ctx.db.item.findMany({
    where: { artistId: artist.id, deletedAt: null, chainType: "CLASSIC_TOKEN" },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      slug: true,
      title: true,
      type: true,
      coverUrl: true,
      supply: true,
      visibility: true,
      createdAt: true,
      classicToken: { select: { code: true } },
      listings: { where: { kind: "PRIMARY" }, take: 1, select: { id: true, priceBandcoin: true, priceUsd: true, status: true, quantitySold: true } },
    },
  });
  return rows.map((row) => {
    const listing = row.listings[0];
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      type: row.type,
      coverUrl: row.coverUrl,
      code: row.classicToken?.code ?? null,
      supply: row.supply,
      sold: listing?.quantitySold ?? 0,
      priceBandcoin: listing?.priceBandcoin.toString() ?? null,
      priceUsd: listing?.priceUsd.toString() ?? null,
      listingStatus: listing?.status ?? null,
      visibility: row.visibility,
      createdAt: row.createdAt,
    };
  });
}

async function ownItem(ctx: ServiceCtx, artist: Pick<ArtistRef, "id">, itemId: string) {
  const item = await ctx.db.item.findFirst({
    where: { id: itemId, artistId: artist.id, deletedAt: null },
    select: {
      id: true,
      supply: true,
      visibility: true,
      classicToken: { select: { code: true, issuer: true } },
      listings: { where: { kind: "PRIMARY" }, take: 1, select: { id: true, status: true, quantitySold: true } },
    },
  });
  if (!item) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Item not found" });
  ctx.activity.set({ targetType: "Item", targetId: item.id });
  return item;
}

/** One item for the edit form: its details, prices, and whether supply and code can still change. */
export async function getItem(ctx: Pick<ServiceCtx, "db">, artist: Pick<ArtistRef, "id">, itemId: string) {
  const item = await ctx.db.item.findFirst({
    where: { id: itemId, artistId: artist.id, deletedAt: null },
    select: {
      id: true,
      title: true,
      description: true,
      coverUrl: true,
      type: true,
      supply: true,
      visibility: true,
      royaltyPercent: true,
      classicToken: { select: { code: true } },
      media: { select: { mediaType: true, sourceUrl: true } },
      listings: { where: { kind: "PRIMARY" }, take: 1, select: { priceBandcoin: true, priceUsd: true, status: true, quantitySold: true } },
    },
  });
  if (!item) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Item not found" });
  const listing = item.listings[0];
  const sold = listing?.quantitySold ?? 0;
  return {
    id: item.id,
    title: item.title,
    description: item.description ?? "",
    coverUrl: item.coverUrl,
    type: item.type,
    code: item.classicToken?.code ?? null,
    supply: item.supply,
    sold,
    /** After the first sale supply and code are fixed */
    locked: sold > 0,
    visibility: item.visibility,
    royaltyPercent: item.royaltyPercent?.toString() ?? null,
    priceBandcoin: listing?.priceBandcoin.toString() ?? "",
    priceUsd: listing?.priceUsd.toString() ?? "",
    fileUrl: item.media?.sourceUrl ?? null,
    fileType: item.media?.mediaType ?? null,
  };
}

export type UpdateItemInput = {
  itemId: string;
  title?: string;
  description?: string;
  coverUrl?: string;
  priceBandcoin?: string;
  priceUsd?: string;
  /** Only before the first sale */
  supply?: number | null;
  /** Only before the first sale */
  code?: string;
  visibility?: Extract<Visibility, "DRAFT" | "PUBLIC">;
};

export async function updateItem(ctx: ServiceCtx, artist: Pick<ArtistRef, "id">, input: UpdateItemInput) {
  const item = await ownItem(ctx, artist, input.itemId);
  const listing = item.listings[0];
  const sold = (listing?.quantitySold ?? 0) > 0;

  checkPrices(input);
  checkOwnUrls({ cover: input.coverUrl });
  if (input.supply !== undefined) checkSupply(input.supply);
  if ((input.supply !== undefined || input.code !== undefined) && sold) {
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, { message: "Supply and code can't change after the first sale." });
  }

  const code = input.code === undefined ? undefined : normalizeAssetCode(input.code);
  if (code !== undefined && item.classicToken) {
    const problem = validateAssetCode(code);
    if (problem) throw invalid(problem);
    const taken = await ctx.db.classicToken.findUnique({ where: { code_issuer: { code, issuer: item.classicToken.issuer } }, select: { itemId: true } });
    if (taken && taken.itemId !== item.id) {
      throw new AppError(ErrorCodes.RESOURCE_CONFLICT, { message: "You already use that code for another item." });
    }
  }

  const itemData = {
    ...(input.title !== undefined ? { title: input.title.trim() } : {}),
    ...(input.description !== undefined ? { description: input.description.trim() || null } : {}),
    ...(input.coverUrl !== undefined ? { coverUrl: input.coverUrl } : {}),
    ...(input.supply !== undefined ? { supply: input.supply } : {}),
    ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
  };
  // A sold-out listing stays sold out; everything else follows the item's visibility.
  const listingData = {
    ...(input.priceBandcoin !== undefined ? { priceBandcoin: input.priceBandcoin } : {}),
    ...(input.priceUsd !== undefined ? { priceUsd: input.priceUsd } : {}),
    ...(input.visibility !== undefined && listing?.status !== "SOLD_OUT" ? { status: input.visibility === "PUBLIC" ? ("ACTIVE" as const) : ("PAUSED" as const) } : {}),
  };

  await ctx.db.$transaction(async (tx) => {
    if (Object.keys(itemData).length > 0) await tx.item.update({ where: { id: item.id }, data: itemData });
    if (code !== undefined) await tx.classicToken.update({ where: { itemId: item.id }, data: { code } });
    if (listing && Object.keys(listingData).length > 0) await tx.listing.update({ where: { id: listing.id }, data: listingData });
  });
  return { itemId: item.id };
}

/** Deletes an item nobody bought. One with sales stays (buyers own it): hide it instead. */
export async function removeItem(ctx: ServiceCtx, artist: Pick<ArtistRef, "id">, itemId: string) {
  const item = await ownItem(ctx, artist, itemId);
  const listing = item.listings[0];
  if ((listing?.quantitySold ?? 0) > 0) {
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, { message: "This item has sales, so it can't be deleted. Hide it instead." });
  }
  await ctx.db.$transaction(async (tx) => {
    await tx.item.update({ where: { id: item.id }, data: { deletedAt: new Date() } });
    if (listing) await tx.listing.update({ where: { id: listing.id }, data: { status: "CLOSED" } });
  });
  return { itemId: item.id };
}
