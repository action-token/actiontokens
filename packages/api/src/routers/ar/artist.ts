import { z } from "zod";

import { setFollowing } from "../../services/feed/follow";
import { syncViewerSubscription } from "../../services/feed/subscribe";

import type { ArArtist } from "@actiontokens/ar-core/ar/types";
import { site } from "@actiontokens/ar-core/site";
import type { Db, Prisma } from "@actiontokens/db";
import { AppError, ErrorCodes } from "@actiontokens/errors";

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
  fanTokenItem: { select: { classicToken: { select: { code: true, issuer: true } } } },
} satisfies Prisma.OrganizationSelect;

type ArtistRow = Prisma.OrganizationGetPayload<{ select: typeof artistSelect }>;

type Standing = { following: boolean; subscribed: boolean };
const STRANGER: Standing = { following: false, subscribed: false };

function toArArtist(
  row: ArtistRow,
  standing: Standing,
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
    followed: standing.following,
    subscribed: standing.subscribed,
    fanToken: row.fanTokenItem?.classicToken?.code ?? null,
    followers: row._count.followers,
    pinCount,
    categories,
    region: null,
  };
}

/** Live pin counts and tag labels per artist, by the same "live" the map uses. */
async function pinFacets(db: Db, organizationIds: string[], viewerId: string | null) {
  const live = {
    ...livePinWhere(viewerId),
    organizationId: { in: organizationIds },
  } satisfies Prisma.PinWhereInput;
  const [counts, tags] = await Promise.all([
    db.pin.groupBy({ by: ["organizationId"], where: live, _count: true }),
    db.pinTagLink.findMany({
      where: { pin: live },
      select: { pin: { select: { organizationId: true } }, tag: { select: { label: true } } },
    }),
  ]);
  const categories = new Map<string, Set<string>>();
  for (const { pin, tag } of tags)
    categories.set(pin.organizationId, (categories.get(pin.organizationId) ?? new Set()).add(tag.label));
  return {
    pinCount: (id: string) => counts.find((row) => row.organizationId === id)?._count ?? 0,
    categoriesOf: (id: string) => [...(categories.get(id) ?? [])].sort(),
  };
}

/** Who the viewer follows, and which of those they subscribe to (the saved flag). */
async function standingsOf(db: Db, userId: string | null, organizationIds: string[]) {
  if (!userId) return new Map<string, Standing>();
  const rows = await db.follow.findMany({
    where: { userId, organizationId: { in: organizationIds } },
    select: { organizationId: true, isTemporary: true },
  });
  return new Map(
    rows.map((row) => [row.organizationId, { following: true, subscribed: !row.isTemporary }]),
  );
}

export const artistRouter = createRouter({
  /** Approved artists, with live pin counts and whether the viewer follows them. */
  list: publicProcedure.query(async ({ ctx }): Promise<ArArtist[]> => {
    const viewerId = ctx.session?.user.id ?? null;
    const artists = await ctx.db.organization.findMany({
      where: { status: "APPROVED" },
      select: artistSelect,
      orderBy: { createdAt: "desc" },
    });
    const ids = artists.map((artist) => artist.id);
    const [facets, standings] = await Promise.all([
      pinFacets(ctx.db, ids, viewerId),
      standingsOf(ctx.db, viewerId, ids),
    ]);
    return artists.map((artist) =>
      toArArtist(
        artist,
        standings.get(artist.id) ?? STRANGER,
        facets.pinCount(artist.id),
        facets.categoriesOf(artist.id),
      ),
    );
  }),

  /** One artist, for their page or a shared link. Subscribed is read from the wallet, as in the fan app. */
  byId: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }): Promise<ArArtist> => {
      const viewerId = ctx.session?.user.id ?? null;
      const artist = await ctx.db.organization.findFirst({
        where: { id: input.id, status: "APPROVED" },
        select: artistSelect,
      });
      if (!artist)
        throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, {
          message: "This artist doesn't exist.",
        });
      const user = ctx.session?.user;
      const [facets, standing] = await Promise.all([
        pinFacets(ctx.db, [artist.id], viewerId),
        user ? syncViewerSubscription(ctx, user, artist) : STRANGER,
      ]);
      return toArArtist(
        artist,
        standing,
        facets.pinCount(artist.id),
        facets.categoriesOf(artist.id),
      );
    }),

  /**
   * Follow or unfollow, free, the same as the fan app's `artist.setFollowing`. Following opens the artist's
   * follower pins; holding their token (members and tier pins) is separate.
   */
  setFollowing: authedProcedure
    .input(z.object({ organizationId: z.string().min(1), following: z.boolean() }))
    .mutation(({ ctx, input }) =>
      setFollowing(ctx, ctx.session.user, { id: input.organizationId }, input.following),
    ),
});
