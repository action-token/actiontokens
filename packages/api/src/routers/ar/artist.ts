import { z } from "zod";

import type { ArArtist } from "@bandcoin/ar-core/ar/types";
import { site } from "@bandcoin/ar-core/site";
import type { Db, Prisma } from "@bandcoin/db";
import { AppError, ErrorCodes } from "@bandcoin/errors";

import { livePinWhere } from "../../services/ar/pins";
import { authedProcedure, createRouter, publicProcedure } from "../../trpc";

const artistSelect = {
  id: true,
  name: true,
  slug: true,
  bio: true,
  avatarUrl: true,
  coverUrl: true,
  status: true,
  _count: { select: { followers: true } },
} satisfies Prisma.ArtistSelect;

type ArtistRow = Prisma.ArtistGetPayload<{ select: typeof artistSelect }>;

function toArArtist(
  row: ArtistRow,
  followed: boolean,
  pinCount: number,
  categories: string[],
): ArArtist {
  return {
    id: row.id,
    name: row.name,
    handle: row.slug,
    tagline: null,
    bio: row.bio ?? "",
    avatarUrl: row.avatarUrl ?? site.assets.mark,
    coverUrl: row.coverUrl,
    verified: row.status === "APPROVED",
    followed,
    followers: row._count.followers,
    pinCount,
    categories,
    region: null,
  };
}

/** Live pin counts and tag labels per artist, by the same "live" the map uses. */
async function pinFacets(db: Db, artistIds: string[], viewerId: string | null) {
  const live = {
    ...livePinWhere(viewerId),
    artistId: { in: artistIds },
  } satisfies Prisma.PinWhereInput;
  const [counts, tags] = await Promise.all([
    db.pin.groupBy({ by: ["artistId"], where: live, _count: true }),
    db.pinTagLink.findMany({
      where: { pin: live },
      select: { pin: { select: { artistId: true } }, tag: { select: { label: true } } },
    }),
  ]);
  const categories = new Map<string, Set<string>>();
  for (const { pin, tag } of tags)
    categories.set(pin.artistId, (categories.get(pin.artistId) ?? new Set()).add(tag.label));
  return {
    pinCount: (id: string) => counts.find((row) => row.artistId === id)?._count ?? 0,
    categoriesOf: (id: string) => [...(categories.get(id) ?? [])].sort(),
  };
}

async function followedIds(db: Db, userId: string | null, artistIds: string[]) {
  if (!userId) return new Set<string>();
  const rows = await db.follow.findMany({
    where: { userId, artistId: { in: artistIds } },
    select: { artistId: true },
  });
  return new Set(rows.map((row) => row.artistId));
}

export const artistRouter = createRouter({
  /** Approved artists, with live pin counts and whether the viewer follows them. */
  list: publicProcedure.query(async ({ ctx }): Promise<ArArtist[]> => {
    const viewerId = ctx.session?.user.id ?? null;
    const artists = await ctx.db.artist.findMany({
      where: { status: "APPROVED" },
      select: artistSelect,
      orderBy: { createdAt: "desc" },
    });
    const ids = artists.map((artist) => artist.id);
    const [facets, followed] = await Promise.all([
      pinFacets(ctx.db, ids, viewerId),
      followedIds(ctx.db, viewerId, ids),
    ]);
    return artists.map((artist) =>
      toArArtist(
        artist,
        followed.has(artist.id),
        facets.pinCount(artist.id),
        facets.categoriesOf(artist.id),
      ),
    );
  }),

  /** One artist, for their page or a shared link. */
  byId: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }): Promise<ArArtist> => {
      const viewerId = ctx.session?.user.id ?? null;
      const artist = await ctx.db.artist.findFirst({
        where: { id: input.id, status: "APPROVED" },
        select: artistSelect,
      });
      if (!artist)
        throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, {
          message: "This artist doesn't exist.",
        });
      const [facets, followed] = await Promise.all([
        pinFacets(ctx.db, [artist.id], viewerId),
        followedIds(ctx.db, viewerId, [artist.id]),
      ]);
      return toArArtist(
        artist,
        followed.has(artist.id),
        facets.pinCount(artist.id),
        facets.categoriesOf(artist.id),
      );
    }),

  /**
   * Follow or unfollow, free, the same as the fan app's `artist.setFollowing`. Following opens the artist's
   * follower pins; holding their token (members and tier pins) is separate.
   */
  setFollowing: authedProcedure
    .input(z.object({ artistId: z.string().min(1), following: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const artist = await ctx.db.artist.findFirst({
        where: { id: input.artistId, status: "APPROVED" },
        select: { id: true },
      });
      if (!artist)
        throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, {
          message: "This artist doesn't exist.",
        });
      ctx.activity.set({ targetType: "Artist", targetId: artist.id });
      const key = { userId, artistId: artist.id };
      if (input.following) {
        await ctx.db.follow.upsert({
          where: { userId_artistId: key },
          create: key,
          update: { isTemporary: false },
        });
      } else {
        await ctx.db.follow.deleteMany({ where: key });
      }
      const followers = await ctx.db.follow.count({ where: { artistId: artist.id } });
      return { following: input.following, followers };
    }),
});
