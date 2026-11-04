import type { Prisma } from "@bandcoin/db";

import type { Context } from "../../context";

type ServiceCtx = Pick<Context, "db">;

/**
 * Artists to browse and follow beside the feed: approved artists with the most
 * followers first. `excludeFollowed` leaves out the viewer's own artist and
 * the ones they already follow (the "to follow" card); without it the list is
 * for browsing, with a follow flag.
 */
export async function suggestedArtists(
  ctx: ServiceCtx,
  viewerId: string | null,
  options: { limit: number; excludeFollowed?: boolean },
) {
  const where: Prisma.ArtistWhereInput = { status: "APPROVED" };
  if (options.excludeFollowed && viewerId) {
    where.userId = { not: viewerId };
    where.followers = { none: { userId: viewerId } };
  }
  const rows = await ctx.db.artist.findMany({
    where,
    orderBy: [{ followers: { _count: "desc" } }, { createdAt: "desc" }],
    take: options.limit,
    select: {
      name: true,
      slug: true,
      avatarUrl: true,
      _count: { select: { followers: true, posts: true } },
      followers: { where: { userId: viewerId ?? "" }, select: { userId: true } },
    },
  });
  return rows.map(({ _count, followers, ...artist }) => ({
    ...artist,
    followers: _count.followers,
    posts: _count.posts,
    following: followers.length > 0,
  }));
}

/** The next events from every approved artist: not over yet, soonest first. */
export async function upcomingEvents(
  ctx: ServiceCtx,
  options: { limit: number },
  now = new Date(),
) {
  return ctx.db.event.findMany({
    where: { endsAt: { gte: now }, artist: { status: "APPROVED" } },
    orderBy: { startsAt: "asc" },
    take: options.limit,
    select: {
      id: true,
      title: true,
      coverUrl: true,
      startsAt: true,
      endsAt: true,
      venueName: true,
      artist: { select: { name: true, slug: true, avatarUrl: true } },
    },
  });
}
