import { z } from "zod";

import { AppError, ErrorCodes } from "@bandcoin/errors";

import { remainingCopies } from "../../services/purchase/sale";
import { createRouter, publicProcedure } from "../../trpc";

export const itemRouter = createRouter({
  /**
   * Everything the item page shows: the item, its artist and media, the open
   * listings (the artist's own sale first, then resales by price), and how
   * many copies the viewer owns.
   */
  bySlug: publicProcedure
    .input(z.object({ slug: z.string().min(1).max(200) }))
    .query(async ({ ctx, input }) => {
      const viewerId = ctx.session?.user.id;
      const item = await ctx.db.item.findFirst({
        where: { slug: input.slug, deletedAt: null, visibility: { not: "DRAFT" } },
        select: {
          id: true,
          type: true,
          chainType: true,
          title: true,
          slug: true,
          description: true,
          coverUrl: true,
          accentColor: true,
          supply: true,
          royaltyPercent: true,
          releaseAt: true,
          saleEndsAt: true,
          playCount: true,
          artist: { select: { name: true, slug: true, avatarUrl: true, bio: true } },
          classicToken: { select: { code: true, issuer: true } },
          contractNft: { select: { contractAddress: true, mintedCount: true, royaltyBps: true } },
          track: { select: { artistName: true, album: { select: { title: true, slug: true } } } },
          media: { select: { mediaType: true, previewStartSec: true, durationSec: true } },
          tier: { select: { name: true } },
          listings: {
            where: { status: "ACTIVE" },
            orderBy: [{ kind: "asc" }, { priceBandcoin: "asc" }],
            select: {
              id: true,
              kind: true,
              priceBandcoin: true,
              priceUsd: true,
              quantity: true,
              quantitySold: true,
              seller: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
            },
          },
          _count: { select: { ownerships: true, likes: true } },
        },
      });
      if (!item)
        throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "This item doesn't exist." });

      const [owned, recentSales] = await Promise.all([
        viewerId
          ? ctx.db.ownership.findUnique({
              where: { userId_itemId: { userId: viewerId, itemId: item.id } },
              select: { quantity: true },
            })
          : null,
        ctx.db.order.findMany({
          where: { itemId: item.id, status: "DELIVERED" },
          orderBy: { createdAt: "desc" },
          take: 8,
          select: {
            id: true,
            quantity: true,
            total: true,
            currency: true,
            txHash: true,
            createdAt: true,
            buyer: { select: { username: true, displayName: true } },
          },
        }),
      ]);

      const { listings, _count, ...rest } = item;
      return {
        ...rest,
        royaltyPercent: item.royaltyPercent?.toString() ?? null,
        holders: _count.ownerships,
        likes: _count.likes,
        ownedQuantity: owned ? Number(owned.quantity) : 0,
        /** Copies the artist has sold (primary sales) */
        sold: listings
          .filter((listing) => listing.kind === "PRIMARY")
          .reduce((sum, listing) => sum + listing.quantitySold, 0),
        network: ctx.chain.config.name,
        recentSales: recentSales.map((sale) => ({
          id: sale.id,
          quantity: sale.quantity,
          total: sale.total.toString(),
          currency: sale.currency,
          txHash: sale.txHash,
          at: sale.createdAt,
          buyer: sale.buyer?.displayName ?? sale.buyer?.username ?? "A fan",
        })),
        listings: listings.map((listing) => ({
          id: listing.id,
          kind: listing.kind,
          priceBandcoin: listing.priceBandcoin.toString(),
          priceUsd: listing.priceUsd.toString(),
          remaining: remainingCopies(listing, item.supply),
          seller: listing.seller,
          isOwn: listing.seller.id === viewerId,
        })),
      };
    }),
});
