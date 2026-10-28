import { z } from "zod";

import { AppError, ErrorCodes } from "@bandcoin/errors";

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
        _count: { select: { followers: true, items: { where: listedItemWhere } } },
      },
    });
    if (!artist)
      throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "This artist doesn't exist." });

    const mine = { ...listedItemWhere, artistId: artist.id };
    const [popular, forSale, albums, bounties, following] = await Promise.all([
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
        where: { artistId: artist.id, status: "RUNNING" },
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
    ]);

    const { _count, id: _id, ...profile } = artist;
    return {
      ...profile,
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
