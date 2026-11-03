import type { Prisma } from "@bandcoin/db";
import { AppError, ErrorCodes } from "@bandcoin/errors";

import type { Context, SessionUser } from "../../context";
import { tokenHeld } from "../catalog/access";
import { postLock } from "./gate";

type ServiceCtx = Pick<Context, "db" | "chain">;

/** Posts per page of the feed. */
export const FEED_PAGE = 10;

const postSelect = (viewerId: string | null) =>
  ({
    id: true,
    title: true,
    body: true,
    createdAt: true,
    artist: {
      select: {
        name: true,
        slug: true,
        avatarUrl: true,
        userId: true,
        fanTokenItem: { select: { classicToken: { select: { code: true, issuer: true } } } },
      },
    },
    tier: { select: { name: true, requiredTokens: true } },
    media: {
      orderBy: { sortOrder: "asc" },
      select: { id: true, type: true, url: true, title: true, thumbnailUrl: true },
    },
    _count: { select: { likes: true, comments: true } },
    likes: { where: { userId: viewerId ?? "" }, select: { userId: true } },
    collectibles: {
      where: { collectorId: viewerId ?? "" },
      select: { id: true },
    },
  }) satisfies Prisma.PostSelect;

type PostRow = Prisma.PostGetPayload<{ select: ReturnType<typeof postSelect> }>;

/**
 * The viewer's fan-token balances for the artists behind tier posts, read
 * once per page. Signed out, or without a wallet on Stellar, they hold none.
 */
async function heldFor(ctx: ServiceCtx, viewer: SessionUser | null, rows: PostRow[]) {
  const gated = rows.some((row) => row.tier && row.artist.userId !== viewer?.id);
  const account = gated && viewer ? await ctx.chain.loadAccount(viewer.walletAddress) : null;
  return (row: PostRow) => {
    const token = row.artist.fanTokenItem?.classicToken ?? null;
    return token ? tokenHeld(account, token) : 0;
  };
}

/** Copies collected so far, per post (each post has a fixed number). */
async function copyCounts(ctx: Pick<Context, "db">, postIds: string[]) {
  if (postIds.length === 0) return new Map<string, { total: number; collected: number }>();
  const [all, collected] = await Promise.all([
    ctx.db.postCollectible.groupBy({
      by: ["postId"],
      where: { postId: { in: postIds } },
      _count: { _all: true },
    }),
    ctx.db.postCollectible.groupBy({
      by: ["postId"],
      where: { postId: { in: postIds }, collectorId: { not: null } },
      _count: { _all: true },
    }),
  ]);
  const taken = new Map(collected.map((row) => [row.postId, row._count._all]));
  return new Map(
    all.map((row) => [
      row.postId,
      { total: row._count._all, collected: taken.get(row.postId) ?? 0 },
    ]),
  );
}

/** What a fan sees of a post: everything when it's open to them, the title and its gate when it isn't. */
async function toCards(ctx: ServiceCtx, viewer: SessionUser | null, rows: PostRow[]) {
  const [held, copies] = await Promise.all([
    heldFor(ctx, viewer, rows),
    copyCounts(
      ctx,
      rows.map((row) => row.id),
    ),
  ]);
  return rows.map((row) => {
    const token = row.artist.fanTokenItem?.classicToken ?? null;
    const lock = postLock({
      tier: row.tier
        ? { name: row.tier.name, requiredTokens: row.tier.requiredTokens.toString() }
        : null,
      token,
      held: held(row),
      isOwner: row.artist.userId === viewer?.id,
    });
    const copy = copies.get(row.id) ?? { total: 0, collected: 0 };
    return {
      id: row.id,
      title: row.title,
      body: lock ? null : row.body,
      media: lock ? [] : row.media,
      createdAt: row.createdAt,
      artist: { name: row.artist.name, slug: row.artist.slug, avatarUrl: row.artist.avatarUrl },
      tierName: row.tier?.name ?? null,
      lock,
      likes: row._count.likes,
      liked: row.likes.length > 0,
      comments: row._count.comments,
      copies: { ...copy, mine: row.collectibles.length > 0 },
    };
  });
}

export type PostCard = Awaited<ReturnType<typeof toCards>>[number];

/**
 * Posts from the artists the fan follows, newest first, a page at a time.
 * `following` lets the page tell "follow someone" from "nothing new yet".
 */
export async function feedPage(ctx: ServiceCtx, viewer: SessionUser, cursor: string | null) {
  const follows = await ctx.db.follow.findMany({
    where: { userId: viewer.id },
    select: { artistId: true },
  });
  if (follows.length === 0) return { posts: [], next: null, following: 0 };

  const rows = await ctx.db.post.findMany({
    where: { artistId: { in: follows.map((follow) => follow.artistId) }, isImportOnly: false },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: FEED_PAGE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: postSelect(viewer.id),
  });
  const page = rows.slice(0, FEED_PAGE);
  return {
    posts: await toCards(ctx, viewer, page),
    next: rows.length > FEED_PAGE ? (page.at(-1)?.id ?? null) : null,
    following: follows.length,
  };
}

/**
 * One post as the viewer sees it, for the actions: they can't comment on or
 * collect a post that is locked to them.
 */
export async function viewPost(ctx: ServiceCtx, viewer: SessionUser | null, postId: string) {
  const row = await ctx.db.post.findFirst({
    where: { id: postId, isImportOnly: false },
    select: postSelect(viewer?.id ?? null),
  });
  if (!row) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Post not found" });
  const [card] = await toCards(ctx, viewer, [row]);
  return { card: card!, artistUserId: row.artist.userId };
}
