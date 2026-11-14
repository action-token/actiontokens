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

export type DirectorySort = "popular" | "newest";
const DIRECTORY_ORDER = {
  popular: [{ followers: { _count: "desc" } }, { createdAt: "desc" }, { id: "desc" }],
  newest: [{ createdAt: "desc" }, { id: "desc" }],
} satisfies Record<DirectorySort, Prisma.ArtistOrderByWithRelationInput[]>;

/**
 * Every approved artist for the Artists page: search by name, most followed or
 * newest first, a page at a time (`next` is the cursor for the page after).
 * Open to anyone; `following` is set when the viewer is signed in.
 */
export async function artistDirectory(
  ctx: ServiceCtx,
  viewerId: string | null,
  options: { limit: number; sort: DirectorySort; search?: string; cursor?: string },
  now = new Date(),
) {
  const search = options.search?.trim();
  const rows = await ctx.db.artist.findMany({
    where: {
      status: "APPROVED",
      ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
    },
    orderBy: DIRECTORY_ORDER[options.sort],
    take: options.limit + 1,
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      name: true,
      slug: true,
      bio: true,
      avatarUrl: true,
      coverUrl: true,
      fanTokenItem: { select: { classicToken: { select: { code: true } } } },
      _count: {
        select: {
          followers: true,
          posts: true,
          items: { where: { deletedAt: null, hiddenAt: null, visibility: { not: "DRAFT" } } },
          stories: { where: { removedAt: null, expiresAt: { gt: now } } },
        },
      },
      followers: {
        where: { userId: viewerId ?? "" },
        select: { userId: true, isTemporary: true },
      },
    },
  });
  const page = rows.slice(0, options.limit);
  return {
    artists: page.map((artist) => ({
      id: artist.id,
      name: artist.name,
      slug: artist.slug,
      bio: artist.bio,
      avatarUrl: artist.avatarUrl,
      coverUrl: artist.coverUrl,
      tokenCode: artist.fanTokenItem?.classicToken?.code ?? null,
      followers: artist._count.followers,
      posts: artist._count.posts,
      songs: artist._count.items,
      liveStories: artist._count.stories,
      following: artist.followers.length > 0,
      /** The viewer also trusts the artist's fan token (a follow that isn't "just a follower") */
      subscribed: artist.followers.some((follow) => !follow.isTemporary),
    })),
    next: rows.length > options.limit ? (page.at(-1)?.id ?? null) : null,
  };
}
