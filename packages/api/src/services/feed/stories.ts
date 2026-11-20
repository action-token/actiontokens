import type { PostAudience } from "@actiontokens/db";
import { AppError, ErrorCodes } from "@actiontokens/errors";

import type { Context, SessionUser } from "../../context";
import { tokenHeld, tokenTrusted } from "../catalog/access";
import { postLock } from "./gate";

type ServiceCtx = Pick<Context, "db" | "chain">;

/** The most artists the ring row shows. */
const RING_LIMIT = 30;

type StoryArtist = {
  id: string;
  userId: string;
  fanTokenItem: { classicToken: { code: string; issuer: string } | null } | null;
};
type Tiered = {
  audience: PostAudience;
  tier: { name: string; requiredTokens: { toString(): string } } | null;
};

/**
 * Whether each story is open to the viewer, by the posts' rule: everyone's
 * always, followers' once they follow, subscribers' with a trustline to the
 * fan token, members' with enough of the artist's
 * fan token, and the artist's own for the artist. The follow and the wallet are
 * read only when a story asks for them.
 */
async function locksFor(
  ctx: ServiceCtx,
  viewer: SessionUser | null,
  artist: StoryArtist,
  stories: Tiered[],
) {
  const isOwner = viewer?.id === artist.userId;
  const asks = (kind: PostAudience) => stories.some((story) => story.audience === kind);
  const follows =
    viewer && !isOwner && asks("FOLLOWERS")
      ? Boolean(
          await ctx.db.follow.findFirst({
            where: { userId: viewer.id, organizationId: artist.id },
            select: { organizationId: true },
          }),
        )
      : false;
  const token = artist.fanTokenItem?.classicToken ?? null;
  const account =
    viewer && !isOwner && token && (asks("MEMBERS") || asks("SUBSCRIBERS"))
      ? await ctx.chain.loadAccount(viewer.walletAddress).catch(() => null)
      : null;
  const held = token ? tokenHeld(account, token) : 0;
  return (story: Tiered) =>
    postLock({
      audience: story.audience,
      tier: story.tier
        ? { name: story.tier.name, requiredTokens: story.tier.requiredTokens.toString() }
        : null,
      token,
      held,
      trusts: token ? tokenTrusted(account, token) : false,
      follows,
      isOwner,
    });
}

const artistFields = {
  id: true,
  name: true,
  slug: true,
  avatarUrl: true,
  userId: true,
  fanTokenItem: { select: { classicToken: { select: { code: true, issuer: true } } } },
} as const;

/**
 * The row at the top of the feed: artists with a live story, people the viewer
 * follows first, then ones they haven't seen, then the newest.
 */
export async function storyRing(
  ctx: Pick<Context, "db">,
  viewer: SessionUser | null,
  now = new Date(),
) {
  const rows = await ctx.db.story.findMany({
    where: { removedAt: null, expiresAt: { gt: now }, organization: { status: "APPROVED" } },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      id: true,
      createdAt: true,
      organizationId: true,
      organization: { select: { slug: true, name: true, avatarUrl: true } },
      views: { where: { userId: viewer?.id ?? "" }, select: { userId: true } },
    },
  });
  const byArtist = new Map<
    string,
    {
      organizationId: string;
      slug: string;
      name: string;
      avatarUrl: string | null;
      stories: number;
      unseen: number;
      latestAt: Date;
    }
  >();
  for (const row of rows) {
    const entry = byArtist.get(row.organizationId) ?? {
      organizationId: row.organizationId,
      ...row.organization,
      stories: 0,
      unseen: 0,
      latestAt: row.createdAt,
    };
    entry.stories += 1;
    if (row.views.length === 0) entry.unseen += 1;
    if (row.createdAt > entry.latestAt) entry.latestAt = row.createdAt;
    byArtist.set(row.organizationId, entry);
  }
  const followed = new Set<string>();
  if (viewer && byArtist.size > 0) {
    const follows = await ctx.db.follow.findMany({
      where: { userId: viewer.id, organizationId: { in: [...byArtist.keys()] } },
      select: { organizationId: true },
    });
    for (const follow of follows) followed.add(follow.organizationId);
  }
  return [...byArtist.values()]
    .map(({ organizationId, unseen, ...entry }) => ({
      ...entry,
      seen: unseen === 0,
      following: followed.has(organizationId),
    }))
    .sort(
      (a, b) =>
        Number(b.following) - Number(a.following) ||
        Number(a.seen) - Number(b.seen) ||
        b.latestAt.getTime() - a.latestAt.getTime(),
    )
    .slice(0, RING_LIMIT);
}

/**
 * One artist's live stories, oldest first (the order they're watched in). A
 * story the viewer can't open comes back as a lock with no picture or words.
 */
export async function artistStories(
  ctx: ServiceCtx,
  viewer: SessionUser | null,
  slug: string,
  now = new Date(),
) {
  const artist = await ctx.db.organization.findFirst({
    where: { slug, status: "APPROVED" },
    select: artistFields,
  });
  if (!artist) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Artist not found" });
  const rows = await ctx.db.story.findMany({
    where: { organizationId: artist.id, removedAt: null, expiresAt: { gt: now } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      type: true,
      url: true,
      thumbnailUrl: true,
      caption: true,
      audience: true,
      tier: { select: { name: true, requiredTokens: true } },
      createdAt: true,
      expiresAt: true,
      views: { where: { userId: viewer?.id ?? "" }, select: { userId: true } },
    },
  });
  const lockOf = await locksFor(ctx, viewer, artist, rows);
  return {
    organization: { name: artist.name, slug: artist.slug, avatarUrl: artist.avatarUrl },
    stories: rows.map((row) => {
      const lock = lockOf(row);
      return {
        id: row.id,
        type: row.type,
        createdAt: row.createdAt,
        expiresAt: row.expiresAt,
        url: lock ? null : row.url,
        thumbnailUrl: lock ? null : row.thumbnailUrl,
        caption: lock ? null : row.caption,
        seen: row.views.length > 0,
        lock,
      };
    }),
  };
}

/** How many ended stories one page of an artist's archive shows. */
const ARCHIVE_PAGE = 24;

/**
 * An artist's past stories (ended, never taken down), newest first, a page at a
 * time. Each keeps the audience it was shared with: one the viewer can't open
 * comes back as a lock with no picture or words, as in the live ring. Live
 * stories aren't repeated here.
 */
export async function storyArchive(
  ctx: ServiceCtx,
  viewer: SessionUser | null,
  input: { slug: string; cursor?: string },
  now = new Date(),
) {
  const artist = await ctx.db.organization.findFirst({
    where: { slug: input.slug, status: "APPROVED" },
    select: artistFields,
  });
  if (!artist) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Artist not found" });
  const rows = await ctx.db.story.findMany({
    where: { organizationId: artist.id, removedAt: null, expiresAt: { lte: now } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: ARCHIVE_PAGE + 1,
    ...(input.cursor ? { cursor: { id: input.cursor } } : {}),
    select: {
      id: true,
      type: true,
      url: true,
      thumbnailUrl: true,
      caption: true,
      audience: true,
      tier: { select: { name: true, requiredTokens: true } },
      createdAt: true,
      expiresAt: true,
    },
  });
  const page = rows.slice(0, ARCHIVE_PAGE);
  const lockOf = await locksFor(ctx, viewer, artist, page);
  return {
    organization: { name: artist.name, slug: artist.slug, avatarUrl: artist.avatarUrl },
    stories: page.map((row) => {
      const lock = lockOf(row);
      return {
        id: row.id,
        type: row.type,
        createdAt: row.createdAt,
        url: lock ? null : row.url,
        thumbnailUrl: lock ? null : row.thumbnailUrl,
        caption: lock ? null : row.caption,
        lock,
      };
    }),
    nextCursor: rows.length > ARCHIVE_PAGE ? (rows[ARCHIVE_PAGE]?.id ?? null) : null,
  };
}

/** Records that the viewer watched a story (once each; not the artist, not a story they can't open). */
export async function markStoryViewed(
  ctx: ServiceCtx,
  viewer: SessionUser,
  storyId: string,
  now = new Date(),
) {
  const story = await ctx.db.story.findFirst({
    where: {
      id: storyId,
      removedAt: null,
      expiresAt: { gt: now },
      organization: { status: "APPROVED" },
    },
    select: {
      id: true,
      audience: true,
      tier: { select: { name: true, requiredTokens: true } },
      organization: { select: artistFields },
    },
  });
  if (!story) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Story not found" });
  if (story.organization.userId === viewer.id) return { recorded: false };
  const lockOf = await locksFor(ctx, viewer, story.organization, [story]);
  if (lockOf(story)) return { recorded: false };
  await ctx.db.storyView.createMany({
    data: [{ storyId: story.id, userId: viewer.id }],
    skipDuplicates: true,
  });
  return { recorded: true };
}

/** How long a taken-down story's row is kept before the worker clears it. */
export const STORY_KEEP_MS = 24 * 60 * 60_000;

/**
 * The worker's cleanup: stories taken down more than a day ago. Stories that
 * simply ended are kept, they are the artist's archive.
 */
export async function sweepStories(ctx: Pick<Context, "db">, now = new Date()) {
  const before = new Date(now.getTime() - STORY_KEEP_MS);
  const { count } = await ctx.db.story.deleteMany({ where: { removedAt: { lt: before } } });
  return { deleted: count };
}
