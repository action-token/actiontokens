import { z } from "zod";

import { AppError, ErrorCodes } from "@bandcoin/errors";

import { itemCardSelect, toItemCard } from "../../services/catalog/item-card";
import { createRouter, publicProcedure } from "../../trpc";

export const profileRouter = createRouter({
  /**
   * A fan's public page: who they are, what they collect (if they keep it
   * public), their public playlists and the artists they follow.
   */
  byUsername: publicProcedure
    .input(z.object({ username: z.string().min(1).max(40) }))
    .query(async ({ ctx, input }) => {
      const user = await ctx.db.user.findFirst({
        where: { username: { equals: input.username, mode: "insensitive" } },
        select: {
          id: true,
          username: true,
          displayName: true,
          bio: true,
          avatarUrl: true,
          coverUrl: true,
          createdAt: true,
          showCollection: true,
          artist: { select: { slug: true, status: true } },
        },
      });
      if (!user)
        throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, {
          message: "This profile doesn't exist.",
        });

      const isSelf = ctx.session?.user.id === user.id;
      const showCollection = user.showCollection || isSelf;
      const [owned, ownedCount, playlists, follows] = await Promise.all([
        showCollection
          ? ctx.db.ownership.findMany({
              where: {
                userId: user.id,
                quantity: { gt: 0 },
                item: { deletedAt: null, visibility: { not: "DRAFT" } },
              },
              orderBy: { acquiredAt: "desc" },
              take: 24,
              select: { quantity: true, item: { select: itemCardSelect } },
            })
          : [],
        ctx.db.ownership.count({ where: { userId: user.id, quantity: { gt: 0 } } }),
        ctx.db.playlist.findMany({
          where: { ownerId: user.id, ...(isSelf ? {} : { isPublic: true }) },
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            name: true,
            coverUrl: true,
            tracks: {
              orderBy: { sortOrder: "asc" },
              take: 4,
              select: { item: { select: { coverUrl: true } } },
            },
            _count: { select: { tracks: true } },
          },
        }),
        ctx.db.follow.findMany({
          where: { userId: user.id, artist: { status: "APPROVED" } },
          orderBy: { createdAt: "desc" },
          take: 20,
          select: { artist: { select: { name: true, slug: true, avatarUrl: true } } },
        }),
      ]);

      const { id: _id, artist, ...profile } = user;
      return {
        ...profile,
        isSelf,
        artistSlug: artist?.status === "APPROVED" ? artist.slug : null,
        stats: { owned: ownedCount, playlists: playlists.length, following: follows.length },
        collection: showCollection
          ? owned.map((row) => ({ ...toItemCard(row.item), quantity: Number(row.quantity) }))
          : null,
        playlists: playlists.map((playlist) => ({
          id: playlist.id,
          name: playlist.name,
          covers: playlist.coverUrl
            ? [playlist.coverUrl]
            : playlist.tracks.map((track) => track.item.coverUrl),
          trackCount: playlist._count.tracks,
        })),
        following: follows.map((follow) => follow.artist),
      };
    }),
});
