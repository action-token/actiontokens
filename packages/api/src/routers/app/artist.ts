import { z } from "zod";

import { AppError, ErrorCodes } from "@bandcoin/errors";

import { draftDesign, publishedDesign } from "../../services/artist/page";
import { itemCardSelect, listedItemWhere, toItemCard } from "../../services/catalog/item-card";
import { authedProcedure, createRouter, publicProcedure } from "../../trpc";

const slugInput = z.object({ slug: z.string().min(1).max(120) });

export const artistRouter = createRouter({
  /**
   * An artist's page: profile, follower count, whether you follow them,
   * popular songs, albums, everything for sale and live bounties.
   */
  bySlug: publicProcedure.input(slugInput).query(async ({ ctx, input }) => {
    const viewerId = ctx.session?.user.id;
    const artist = await ctx.db.artist.findFirst({
      where: { slug: input.slug, status: "APPROVED" },
      select: {
        id: true,
        name: true,
        slug: true,
        bio: true,
        avatarUrl: true,
        coverUrl: true,
        website: true,
        twitter: true,
        instagram: true,
        fanTokenItem: { select: { classicToken: { select: { code: true } } } },
        _count: { select: { followers: true, items: { where: listedItemWhere } } },
      },
    });
    if (!artist)
      throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "This artist doesn't exist." });

    const mine = { ...listedItemWhere, artistId: artist.id };
    const [popular, forSale, albums, bounties, following, tiers, events, design] =
      await Promise.all([
        ctx.db.item.findMany({
          where: { ...mine, type: "TRACK" },
          orderBy: [{ playCount: "desc" }, { createdAt: "desc" }],
          take: 10,
          select: itemCardSelect,
        }),
        ctx.db.item.findMany({
          where: { ...mine, listings: { some: { status: "ACTIVE" } } },
          orderBy: { createdAt: "desc" },
          take: 24,
          select: itemCardSelect,
        }),
        ctx.db.album.findMany({
          where: { artistId: artist.id },
          orderBy: { createdAt: "desc" },
          select: {
            title: true,
            slug: true,
            coverUrl: true,
            createdAt: true,
            _count: { select: { tracks: true } },
          },
        }),
        ctx.db.bounty.findMany({
          where: { artistId: artist.id, status: "RUNNING", fundTxHash: { not: null } },
          orderBy: { createdAt: "desc" },
          take: 4,
          select: {
            id: true,
            title: true,
            summary: true,
            prizeAmount: true,
            prizeCurrency: true,
            _count: { select: { participants: true } },
          },
        }),
        viewerId
          ? ctx.db.follow.findUnique({
              where: { userId_artistId: { userId: viewerId, artistId: artist.id } },
              select: { userId: true },
            })
          : null,
        ctx.db.membershipTier.findMany({
          where: { artistId: artist.id, isActive: true },
          orderBy: [{ requiredTokens: "asc" }, { sortOrder: "asc" }],
          select: {
            id: true,
            name: true,
            description: true,
            features: true,
            color: true,
            isPopular: true,
            requiredTokens: true,
          },
        }),
        ctx.db.event.findMany({
          where: { artistId: artist.id, endsAt: { gte: new Date() } },
          orderBy: { startsAt: "asc" },
          take: 10,
          select: {
            id: true,
            title: true,
            startsAt: true,
            endsAt: true,
            venueName: true,
            address: true,
            coverUrl: true,
          },
        }),
        publishedDesign(ctx, artist.id),
      ]);

    const { _count, id: _id, fanTokenItem, ...profile } = artist;
    return {
      ...profile,
      /** The page the artist designed in the page builder, or null for the standard page */
      design,
      tokenCode: fanTokenItem?.classicToken?.code ?? null,
      tiers: tiers.map((tier) => ({ ...tier, requiredTokens: tier.requiredTokens.toString() })),
      events,
      followers: _count.followers,
      itemCount: _count.items,
      following: Boolean(following),
      popular: popular.map(toItemCard),
      forSale: forSale.map(toItemCard),
      albums: albums.map((album) => ({
        title: album.title,
        slug: album.slug,
        coverUrl: album.coverUrl,
        year: album.createdAt.getFullYear(),
        trackCount: album._count.tracks,
      })),
      bounties: bounties.map((bounty) => ({
        id: bounty.id,
        title: bounty.title,
        summary: bounty.summary,
        prize: { amount: bounty.prizeAmount.toString(), currency: bounty.prizeCurrency },
        participants: bounty._count.participants,
      })),
    };
  }),

  /** The unpublished design, for the artist's own live preview in the page builder. */
  draftDesign: authedProcedure.input(slugInput).query(async ({ ctx, input }) => {
    const artist = await ctx.db.artist.findFirst({
      where: { slug: input.slug },
      select: { id: true, userId: true },
    });
    if (!artist)
      throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "This artist doesn't exist." });
    if (artist.userId !== ctx.session.user.id && ctx.session.user.role !== "ADMIN")
      throw new AppError(ErrorCodes.AUTH_FORBIDDEN, {
        message: "Only the artist can preview their draft.",
      });
    return draftDesign(ctx, artist.id);
  }),

  /** Follow or unfollow an artist (free; holding their token is a separate thing). */
  setFollowing: authedProcedure
    .input(slugInput.extend({ following: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const artist = await ctx.db.artist.findFirst({
        where: { slug: input.slug, status: "APPROVED" },
        select: { id: true },
      });
      if (!artist)
        throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, {
          message: "This artist doesn't exist.",
        });
      ctx.activity.set({ targetType: "Artist", targetId: artist.id });
      const key = { userId_artistId: { userId: ctx.session.user.id, artistId: artist.id } };
      if (input.following) {
        await ctx.db.follow.upsert({
          where: key,
          create: { userId: ctx.session.user.id, artistId: artist.id },
          update: { isTemporary: false },
        });
      } else {
        await ctx.db.follow.deleteMany({
          where: { userId: ctx.session.user.id, artistId: artist.id },
        });
      }
      const followers = await ctx.db.follow.count({ where: { artistId: artist.id } });
      return { following: input.following, followers };
    }),
});
