import { AppError, ErrorCodes } from "@actiontokens/errors";

import type { Context, SessionUser } from "../../context";
import * as classic from "./classic";
import * as nft from "./nft";

/**
 * One resale API for both kinds of copy. Classic copies (plain tokens) and
 * smart-contract NFTs (numbered editions) list, take back and reprice in
 * different ways underneath; the screens and the router don't care. The item
 * (or the order, or the listing) says which kind it is.
 */
type ServiceCtx = Pick<Context, "db" | "chain" | "activity">;

export type ListInput = classic.ListInput & { listingIds?: string[] };

export { MAX_LISTED, myListings, soldHistory } from "./classic";

const resaleOf = async (ctx: Pick<ServiceCtx, "db">, orderId: string) => {
  const order = await ctx.db.order.findUnique({
    where: { id: orderId },
    select: { breakdown: true },
  });
  return (order?.breakdown as { resale?: { nft?: boolean } } | null)?.resale ?? null;
};

const isNftListing = async (ctx: Pick<ServiceCtx, "db">, listingId: string) =>
  Boolean(
    await ctx.db.listing.findFirst({
      where: { id: listingId, kind: "RESALE", editionId: { not: null } },
      select: { id: true },
    }),
  );

export async function quoteList(ctx: ServiceCtx, user: SessionUser, input: ListInput) {
  if (await nft.isNftItem(ctx, input.itemId)) return nft.quoteListNft(ctx, user, input);
  return classic.quoteList(ctx, user, input);
}

export async function startList(ctx: ServiceCtx, user: SessionUser, input: ListInput) {
  if (await nft.isNftItem(ctx, input.itemId)) return nft.startListNft(ctx, user, input);
  return classic.startList(ctx, user, input);
}

export async function submitList(
  ctx: ServiceCtx,
  user: SessionUser,
  input: { orderId: string; xdr: string },
) {
  return (await resaleOf(ctx, input.orderId))?.nft
    ? nft.submitListNft(ctx, user, input)
    : classic.submitList(ctx, user, input);
}

/** A classic listing's price changes at once; an NFT's is a new `list` call, so it goes through listing again. */
export async function setListingPrice(
  ctx: ServiceCtx,
  user: SessionUser,
  input: { listingId: string; priceActionToken: string; priceUsd: string },
) {
  if (await isNftListing(ctx, input.listingId))
    throw new AppError(ErrorCodes.VALIDATION_FAILED, {
      message:
        "A smart-contract NFT's price is changed on the network. List it again at the new price.",
    });
  return classic.setListingPrice(ctx, user, input);
}

export async function quoteCancel(
  ctx: ServiceCtx,
  user: SessionUser,
  input: { listingId: string },
) {
  return (await isNftListing(ctx, input.listingId))
    ? nft.quoteCancelNft(ctx, user, input)
    : classic.quoteCancel(ctx, user, input);
}

export async function startCancel(
  ctx: ServiceCtx,
  user: SessionUser,
  input: { listingId: string },
) {
  return (await isNftListing(ctx, input.listingId))
    ? nft.startCancelNft(ctx, user, input)
    : classic.startCancel(ctx, user, input);
}

export async function submitCancel(
  ctx: ServiceCtx,
  user: SessionUser,
  input: { orderId: string; xdr: string },
) {
  return (await resaleOf(ctx, input.orderId))?.nft
    ? nft.submitCancelNft(ctx, user, input)
    : classic.submitCancel(ctx, user, input);
}
