import { Asset } from "@stellar/stellar-sdk";

import type { Db } from "@bandcoin/db";
import { AppError, ErrorCodes } from "@bandcoin/errors";
import { toAmount, toStroops } from "@bandcoin/chain";

/** A listing with everything a purchase needs to price, build and deliver it. */
export async function loadSale(db: Db, listingId: string) {
  const listing = await db.listing.findUnique({
    where: { id: listingId },
    include: {
      seller: {
        select: {
          id: true,
          walletAddress: true,
          chainAccounts: { where: { kind: "STORAGE" }, select: { publicKey: true }, take: 1 },
        },
      },
      item: {
        include: {
          classicToken: { include: { issuerAccount: { select: { publicKey: true } } } },
          artist: {
            select: {
              id: true,
              user: { select: { walletAddress: true } },
              issuerAccount: { select: { publicKey: true, activatedAt: true } },
              storageAccount: { select: { publicKey: true } },
            },
          },
        },
      },
    },
  });
  if (!listing || listing.item.deletedAt) {
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "This listing doesn't exist." });
  }
  if (listing.status !== "ACTIVE") {
    throw new AppError(ErrorCodes.ITEM_NOT_AVAILABLE, { message: "This item isn't for sale right now." });
  }
  const { item } = listing;
  if (item.chainType !== "CLASSIC_TOKEN" || !item.classicToken) {
    throw new AppError(ErrorCodes.ITEM_NOT_AVAILABLE, {
      message: "Checkout for contract NFTs isn't open yet.",
      details: { chainType: item.chainType },
    });
  }
  if (!listing.seller.walletAddress) {
    throw new AppError(ErrorCodes.ITEM_NOT_AVAILABLE, { message: "The seller has no wallet to be paid in." });
  }

  const token = item.classicToken;
  return {
    listing,
    item,
    asset: new Asset(token.code, token.issuer),
    seller: listing.seller.walletAddress,
    /** The artist's wallet, paid the royalty on resales */
    creator: item.artist?.user.walletAddress ?? null,
    /** The key that can mint more copies: the artist's one issuer, or the token's own legacy issuer */
    minter: minterOf(token, item.artist?.issuerAccount ?? null),
    /** Copies already minted and waiting: the artist's storage (primary) or the seller's (resale) */
    stockAccount:
      listing.kind === "PRIMARY"
        ? (item.artist?.storageAccount?.publicKey ?? null)
        : (listing.seller.chainAccounts[0]?.publicKey ?? null),
    remaining: remainingCopies(listing, item.supply),
  };
}

export type Sale = Awaited<ReturnType<typeof loadSale>>;

function minterOf(
  token: { issuer: string; issuerAccount: { publicKey: string } | null },
  artistIssuer: { publicKey: string; activatedAt: Date | null } | null,
) {
  if (artistIssuer?.publicKey === token.issuer) return artistIssuer.activatedAt ? token.issuer : null;
  return token.issuerAccount?.publicKey === token.issuer ? token.issuer : null;
}

/** Copies still for sale on this listing (null = no limit). */
export function remainingCopies(listing: { quantity: number | null; quantitySold: number }, supply: number | null) {
  const cap = listing.quantity ?? supply;
  return cap === null ? null : Math.max(0, cap - listing.quantitySold);
}

/**
 * Where the copies come from. Primary sales use minted stock in the artist's
 * storage first and mint the rest with the artist's issuer (lazy mint).
 * Resales of classic tokens come from the seller's storage, where listing put
 * them.
 */
export function planDelivery(input: {
  kind: "PRIMARY" | "RESALE";
  quantity: number;
  stockAccount: string | null;
  stockBalance: string;
  minter: string | null;
}): { fromStock?: { account: string; amount: string }; mint?: { issuer: string; amount: string } } {
  const wanted = toStroops(input.quantity);
  const stock = input.stockAccount ? toStroops(input.stockBalance) : 0n;
  const fromStock = stock < wanted ? stock : wanted;
  const toMint = wanted - fromStock;

  if (toMint > 0n && (input.kind === "RESALE" || !input.minter)) {
    throw new AppError(ErrorCodes.ITEM_NOT_AVAILABLE, { message: "Not enough copies are left to deliver." });
  }
  return {
    ...(fromStock > 0n && input.stockAccount ? { fromStock: { account: input.stockAccount, amount: toAmount(fromStock) } } : {}),
    ...(toMint > 0n && input.minter ? { mint: { issuer: input.minter, amount: toAmount(toMint) } } : {}),
  };
}
