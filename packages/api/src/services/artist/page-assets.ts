import { toAmount, toStroops } from "@bandcoin/chain";
import { AppError, ErrorCodes } from "@bandcoin/errors";
import { validatePrice } from "@bandcoin/utils/asset-code";

import type { Context } from "../../context";
import { invalid } from "./items";
import { creditLines, freeOf, openedStorage } from "./storage-withdraw";

/**
 * Sell Page Assets, as on the old Bandcoin: the artist offers a bundle of
 * their fan token (say 1,000) from their storage account, with a description
 * and three prices (BANDCOIN, USD and a fixed XLM price). One sale sells the
 * whole bundle: the fan pays and the tokens move from storage to them in the
 * same transaction (services/purchase), then the offer is sold. The artist
 * can have several offers; storage must hold enough for all of them.
 */
type ServiceCtx = Pick<Context, "db" | "chain" | "activity">;
type ArtistRef = { id: string; fanTokenItemId: string | null; storageAccountId: string | null };

const AMOUNT = /^\d{1,12}(\.\d{1,7})?$/;
const MAX_NOTE = 500;

export type PageAssetInput = {
  amount: string;
  priceBandcoin: string;
  priceUsd: string;
  priceXlm: string;
  note?: string;
};

async function fanTokenOf(ctx: ServiceCtx, artist: ArtistRef) {
  if (!artist.fanTokenItemId) return null;
  return ctx.db.item.findUnique({
    where: { id: artist.fanTokenItemId },
    select: { id: true, title: true, classicToken: { select: { code: true, issuer: true } } },
  });
}

/** Fan tokens storage can still offer: what it holds, less what open offers already promise. */
async function available(
  ctx: ServiceCtx,
  artist: ArtistRef,
  token: { code: string; issuer: string },
) {
  const storage = await openedStorage(ctx, artist);
  if (!storage) return null;
  const [account, open] = await Promise.all([
    ctx.chain.loadAccount(storage.publicKey),
    ctx.db.listing.findMany({
      where: { itemId: artist.fanTokenItemId!, kind: "BUNDLE", status: "ACTIVE" },
      select: { bundleAmount: true },
    }),
  ]);
  const line = creditLines(account).find(
    (entry) => entry.asset_code === token.code && entry.asset_issuer === token.issuer,
  );
  const held = line ? freeOf(line) : 0n;
  const promised = open.reduce(
    (sum, row) => sum + toStroops(row.bundleAmount?.toString() ?? "0"),
    0n,
  );
  return { held, promised, free: held > promised ? held - promised : 0n };
}

/** The page: the fan token, what storage can still offer, and every offer (newest first). */
export async function pageAssetOverview(ctx: ServiceCtx, artist: ArtistRef) {
  const token = await fanTokenOf(ctx, artist);
  const code = token?.classicToken ?? null;
  const storageOpen = Boolean(code && (await openedStorage(ctx, artist)));
  // A failed network read shows as "couldn't read" on the page, not an error.
  const stock = code && storageOpen ? await available(ctx, artist, code).catch(() => null) : null;
  const offers = token
    ? await ctx.db.listing.findMany({
        where: { itemId: token.id, kind: "BUNDLE", status: { not: "CLOSED" } },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          status: true,
          bundleAmount: true,
          priceBandcoin: true,
          priceUsd: true,
          priceXlm: true,
          note: true,
          createdAt: true,
        },
      })
    : [];
  return {
    fanToken: code ? { code: code.code } : null,
    storageOpen,
    held: stock ? toAmount(stock.held) : null,
    free: stock ? toAmount(stock.free) : null,
    offers: offers.map((offer) => ({
      id: offer.id,
      sold: offer.status === "SOLD_OUT",
      amount: offer.bundleAmount?.toString() ?? "0",
      priceBandcoin: offer.priceBandcoin.toString(),
      priceUsd: offer.priceUsd.toString(),
      priceXlm: offer.priceXlm?.toString() ?? null,
      note: offer.note,
      createdAt: offer.createdAt,
    })),
  };
}

export async function createPageAssetOffer(
  ctx: ServiceCtx,
  artist: ArtistRef,
  user: { id: string },
  input: PageAssetInput,
) {
  const token = await fanTokenOf(ctx, artist);
  if (!token?.classicToken) throw invalid("Create your fan token first.");
  const amount = input.amount.trim();
  if (!AMOUNT.test(amount) || toStroops(amount) <= 0n)
    throw invalid("Enter how many tokens the offer sells, above zero.");
  for (const price of [input.priceBandcoin, input.priceUsd, input.priceXlm]) {
    const problem = validatePrice(price);
    if (problem) throw invalid(problem);
  }
  const note = input.note?.trim() ?? "";
  if (note.length > MAX_NOTE) throw invalid(`Keep the description to ${MAX_NOTE} characters.`);

  const stock = await available(ctx, artist, token.classicToken);
  if (!stock)
    throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, {
      message: "Open your storage account first (Settings › Accounts), then move tokens into it.",
    });
  if (toStroops(amount) > stock.free)
    throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, {
      message: `Storage can offer ${toAmount(stock.free).replace(/\.?0+$/, "")} ${token.classicToken.code} more. Move more into it under Settings › Balances.`,
    });

  const offer = await ctx.db.listing.create({
    data: {
      itemId: token.id,
      sellerId: user.id,
      kind: "BUNDLE",
      status: "ACTIVE",
      quantity: 1,
      bundleAmount: toAmount(toStroops(amount)),
      priceBandcoin: input.priceBandcoin,
      priceUsd: input.priceUsd,
      priceXlm: input.priceXlm,
      note: note || null,
    },
    select: { id: true },
  });
  ctx.activity.set({ targetType: "Listing", targetId: offer.id, amount });
  return { offerId: offer.id };
}

/** Takes an unsold offer off the page; a sold one stays as a record. */
export async function closePageAssetOffer(ctx: ServiceCtx, artist: ArtistRef, offerId: string) {
  ctx.activity.set({ targetType: "Listing", targetId: offerId });
  const { count } = await ctx.db.listing.updateMany({
    where: {
      id: offerId,
      kind: "BUNDLE",
      status: "ACTIVE",
      item: { id: artist.fanTokenItemId ?? "", artistId: artist.id },
    },
    data: { status: "CLOSED" },
  });
  if (count === 0)
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, {
      message: "That offer is already sold or gone.",
    });
  return { offerId };
}
