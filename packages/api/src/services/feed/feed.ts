import type { Prisma } from "@actiontokens/db";
import { AppError, ErrorCodes } from "@actiontokens/errors";

import type { Context, SessionUser } from "../../context";
import { tokenHeld, tokenTrusted } from "../catalog/access";
import { commentAuthor, commentAuthorSelect } from "./authors";
import { gateMessage, postGate, postLock } from "./gate";

type ServiceCtx = Pick<Context, "db" | "chain">;

/** Posts per page of the feed. */
export const FEED_PAGE = 10;

const postSelect = (viewerId: string | null) =>
  ({
    id: true,
    title: true,
    body: true,
    createdAt: true,
    audience: true,
    commentAccess: true,
    collectAccess: true,
    commentTier: { select: { name: true, requiredTokens: true } },
    collectTier: { select: { name: true, requiredTokens: true } },
    organization: {
      select: {
        id: true,
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
    /** The newest comment, shown under the post in the feed. */
    comments: {
      orderBy: { createdAt: "desc" },
      take: 1,
      select: {
        id: true,
        parentId: true,
        body: true,
        createdAt: true,
        author: { select: commentAuthorSelect },
      },
    },
    likes: { where: { userId: viewerId ?? "" }, select: { userId: true } },
    collectibles: {
      where: { collectorId: viewerId ?? "" },
      select: { id: true },
    },
  }) satisfies Prisma.PostSelect;

type PostRow = Prisma.PostGetPayload<{ select: ReturnType<typeof postSelect> }>;

const tierRule = (tier: { name: string; requiredTokens: { toString(): string } } | null) =>
  tier ? { name: tier.name, requiredTokens: tier.requiredTokens.toString() } : null;

/** Whether any of a post's rules asks for a tier or a follow. */
const needs = (row: PostRow, kind: "MEMBERS" | "FOLLOWERS" | "SUBSCRIBERS") =>
  row.audience === kind || row.commentAccess === kind || row.collectAccess === kind;

/**
 * The viewer's fan-token balances for the artists behind members' rules, read
 * once per page. Signed out, or without a wallet on Stellar, they hold none.
 */
async function heldFor(ctx: ServiceCtx, viewer: SessionUser | null, rows: PostRow[]) {
  const gated = rows.some(
    (row) =>
      (needs(row, "MEMBERS") || needs(row, "SUBSCRIBERS")) && row.organization.userId !== viewer?.id,
  );
  const account =
    gated && viewer ? await ctx.chain.loadAccount(viewer.walletAddress).catch(() => null) : null;
  return (row: PostRow) => {
    const token = row.organization.fanTokenItem?.classicToken ?? null;
    return {
      held: token ? tokenHeld(account, token) : 0,
      trusts: token ? tokenTrusted(account, token) : false,
    };
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

/** The artists among `rows` the viewer follows, read only when a rule asks. */
async function followedIn(ctx: ServiceCtx, viewer: SessionUser | null, rows: PostRow[]) {
  const asks = rows.filter((row) => needs(row, "FOLLOWERS"));
  if (!viewer || asks.length === 0) return new Set<string>();
  const follows = await ctx.db.follow.findMany({
    where: { userId: viewer.id, organizationId: { in: [...new Set(asks.map((row) => row.organization.id))] } },
    select: { organizationId: true },
  });
  return new Set(follows.map((follow) => follow.organizationId));
}

/**
 * What a fan sees of a post: everything when it's open to them, the title and
 * its lock when it isn't, and whether they may comment on and collect it.
 */
async function toCards(ctx: ServiceCtx, viewer: SessionUser | null, rows: PostRow[]) {
  const [wallet, followed, copies] = await Promise.all([
    heldFor(ctx, viewer, rows),
    followedIn(ctx, viewer, rows),
    copyCounts(
      ctx,
      rows.map((row) => row.id),
    ),
  ]);
  return rows.map((row) => {
    const who = {
      token: row.organization.fanTokenItem?.classicToken ?? null,
      ...wallet(row),
      follows: followed.has(row.organization.id),
      isOwner: row.organization.userId === viewer?.id,
    };
    const lock = postLock({ audience: row.audience, tier: tierRule(row.tier), ...who });
    const gate = (
      action: "comment" | "collect",
      access: typeof row.commentAccess,
      tier: Parameters<typeof tierRule>[0],
    ) => {
      const result = postGate({ access, tier: tierRule(tier), viewLocked: lock !== null, ...who });
      return { ...result, message: gateMessage(result, action, row.organization.name) };
    };
    const copy = copies.get(row.id) ?? { total: 0, collected: 0 };
    return {
      id: row.id,
      title: row.title,
      body: lock ? null : row.body,
      media: lock ? [] : row.media,
      createdAt: row.createdAt,
      organization: { name: row.organization.name, slug: row.organization.slug, avatarUrl: row.organization.avatarUrl },
      audience: row.audience,
      tierName: row.audience === "MEMBERS" ? (row.tier?.name ?? null) : null,
      lock,
      likes: row._count.likes,
      liked: row.likes.length > 0,
      comments: row._count.comments,
      latestComment: lock
        ? null
        : (row.comments.map(({ author, ...comment }) => ({
            ...comment,
            author: commentAuthor(author),
          }))[0] ?? null),
      copies: { ...copy, mine: row.collectibles.length > 0 },
      comment: gate("comment", row.commentAccess, row.commentTier),
      // Only posts with a photo, video or song can be collected.
      collect: gate(
        "collect",
        row.media.length > 0 ? row.collectAccess : "NOBODY",
        row.collectTier,
      ),
    };
  });
}

export type PostCard = Awaited<ReturnType<typeof toCards>>[number];

export type FeedScope = "all" | "following";

/**
 * The feed, newest first, a page at a time. "all" (For you) is every approved
 * artist's posts and is open to anyone, signed in or not; posts the viewer
 * can't open come back as a lock. "following" is the artists the fan follows,
 * plus their own posts if they are an artist, and needs a session: its
 * `following` count lets the page tell "follow someone" from "nothing new yet".
 */
export async function feedPage(
  ctx: ServiceCtx,
  viewer: SessionUser | null,
  cursor: string | null,
  scope: FeedScope = "following",
) {
  let where: Prisma.PostWhereInput = { isImportOnly: false, organization: { status: "APPROVED" } };
  let following: number | null = null;
  if (scope === "following") {
    if (!viewer) throw new AppError(ErrorCodes.AUTH_REQUIRED);
    const [follows, own] = await Promise.all([
      ctx.db.follow.findMany({ where: { userId: viewer.id }, select: { organizationId: true } }),
      ctx.db.organization.findFirst({ where: { userId: viewer.id }, select: { id: true } }),
    ]);
    const organizationIds = [
      ...new Set([...follows.map((follow) => follow.organizationId), ...(own ? [own.id] : [])]),
    ];
    if (organizationIds.length === 0) return { posts: [], next: null, following: 0 };
    where = { organizationId: { in: organizationIds }, isImportOnly: false };
    following = follows.length;
  }

  const rows = await ctx.db.post.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: FEED_PAGE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: postSelect(viewer?.id ?? null),
  });
  const page = rows.slice(0, FEED_PAGE);
  return {
    posts: await toCards(ctx, viewer, page),
    next: rows.length > FEED_PAGE ? (page.at(-1)?.id ?? null) : null,
    following,
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
  return { card: card!, artistUserId: row.organization.userId };
}
