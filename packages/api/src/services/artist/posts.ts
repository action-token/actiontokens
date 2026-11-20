import type { MediaType, PostAccess, PostAudience } from "@actiontokens/db";
import { AppError, ErrorCodes } from "@actiontokens/errors";
import { isOwnS3Url } from "@actiontokens/storage";

import type { Context } from "../../context";
import { notifyFollowers } from "../notifications/send";
import { invalid } from "./items";

/**
 * Posts: news, media and perks an artist shares with followers. The artist
 * picks who can see, comment on and collect each post (everyone, followers,
 * members of a tier, or nobody for comments and collecting) and how many free
 * copies fans can collect by scanning its QR, one each. Followers get a
 * notification when a post goes up.
 */
type ServiceCtx = Pick<Context, "db" | "activity">;
type ArtistRef = { id: string; userId: string };

export const COLLECTIBLE_COPIES = 100;
export const MAX_COPIES = 10_000;
export const MAX_MEDIA = 10;
const MEDIA_TYPES: MediaType[] = ["IMAGE", "VIDEO", "AUDIO"];

/** `title` names a song (its file name when uploaded) */
export type PostMediaInput = { type: MediaType; url: string; title?: string | null };

export type PostInput = {
  title: string;
  body?: string;
  /** Who can open it; MEMBERS needs `tierId`. Left out: MEMBERS when a tier is given. */
  audience?: PostAudience;
  tierId?: string | null;
  commentAccess?: PostAccess;
  commentTierId?: string | null;
  collectAccess?: PostAccess;
  collectTierId?: string | null;
  /** Free copies fans can collect, 1 to 10,000 */
  copies?: number;
  media?: PostMediaInput[];
};

function check(input: Partial<PostInput>) {
  if (
    input.title !== undefined &&
    (input.title.trim().length === 0 || input.title.trim().length > 120)
  )
    throw invalid("Give the post a title of up to 120 characters.");
  if (input.body !== undefined && input.body.length > 10_000)
    throw invalid("Keep the post under 10,000 characters.");
  if (input.media !== undefined) {
    if (input.media.length > MAX_MEDIA) throw invalid(`Attach at most ${MAX_MEDIA} files.`);
    if (input.media.some((file) => !MEDIA_TYPES.includes(file.type)))
      throw invalid("Posts can have images, video and audio.");
    if (input.media.some((file) => !isOwnS3Url(file.url))) throw invalid("Upload the files again.");
  }
  if (
    input.copies !== undefined &&
    (!Number.isInteger(input.copies) || input.copies < 1 || input.copies > MAX_COPIES)
  )
    throw invalid(`Pick between 1 and ${MAX_COPIES.toLocaleString("en-US")} copies.`);
}

/**
 * The settings as saved: each "members" rule keeps its tier, every other
 * choice clears it. Only the settings the input names are returned.
 */
async function resolveSettings(ctx: ServiceCtx, artist: ArtistRef, input: Partial<PostInput>) {
  const out: {
    audience?: PostAudience;
    tierId?: string | null;
    commentAccess?: PostAccess;
    commentTierId?: string | null;
    collectAccess?: PostAccess;
    collectTierId?: string | null;
  } = {};
  const audience =
    input.audience ??
    (input.tierId === undefined ? undefined : input.tierId ? "MEMBERS" : "EVERYONE");
  if (audience !== undefined) {
    out.audience = audience;
    out.tierId = audience === "MEMBERS" ? await needTier(ctx, artist, input.tierId) : null;
  }
  if (input.commentAccess !== undefined) {
    out.commentAccess = input.commentAccess;
    out.commentTierId =
      input.commentAccess === "MEMBERS" ? await needTier(ctx, artist, input.commentTierId) : null;
  }
  if (input.collectAccess !== undefined) {
    out.collectAccess = input.collectAccess;
    out.collectTierId =
      input.collectAccess === "MEMBERS" ? await needTier(ctx, artist, input.collectTierId) : null;
  }
  return out;
}

async function needTier(ctx: ServiceCtx, artist: ArtistRef, tierId: string | null | undefined) {
  const tier = await resolveTier(ctx, artist, tierId);
  if (!tier) throw invalid("Pick one of your active membership tiers.");
  return tier;
}

/**
 * Sets how many copies a post has. More can always be added; fewer only
 * while nobody has collected one.
 */
async function setCopies(ctx: ServiceCtx, postId: string, copies: number) {
  const [total, collected] = await Promise.all([
    ctx.db.postCollectible.count({ where: { postId } }),
    ctx.db.postCollectible.count({ where: { postId, collectorId: { not: null } } }),
  ]);
  if (copies > total)
    await ctx.db.postCollectible.createMany({
      data: Array.from({ length: copies - total }, () => ({ postId })),
    });
  else if (copies < total) {
    if (collected > 0)
      throw invalid(
        `Fans have collected ${collected} cop${collected === 1 ? "y" : "ies"} already, so the number can only go up.`,
      );
    const extra = await ctx.db.postCollectible.findMany({
      where: { postId, collectorId: null },
      take: total - copies,
      select: { id: true },
    });
    await ctx.db.postCollectible.deleteMany({ where: { id: { in: extra.map((row) => row.id) } } });
  }
}

async function resolveTier(ctx: ServiceCtx, artist: ArtistRef, tierId: string | null | undefined) {
  if (!tierId) return null;
  const tier = await ctx.db.membershipTier.findFirst({
    where: { id: tierId, organizationId: artist.id, isActive: true },
    select: { id: true },
  });
  if (!tier) throw invalid("Pick one of your active membership tiers.");
  return tier.id;
}

async function ownPost(ctx: ServiceCtx, artist: ArtistRef, postId: string) {
  const post = await ctx.db.post.findFirst({
    where: { id: postId, organizationId: artist.id },
    select: { id: true },
  });
  if (!post) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Post not found" });
  ctx.activity.set({ targetType: "Post", targetId: post.id });
  return post;
}

const mediaRows = (media: PostMediaInput[]) =>
  media.map((file, sortOrder) => ({
    type: file.type,
    url: file.url,
    title: file.title?.trim().slice(0, 120) || null,
    sortOrder,
  }));

const counts = { select: { likes: true, comments: true } } as const;
const postSelect = {
  id: true,
  title: true,
  body: true,
  audience: true,
  tierId: true,
  commentAccess: true,
  commentTierId: true,
  collectAccess: true,
  collectTierId: true,
  createdAt: true,
  updatedAt: true,
  tier: { select: { name: true } },
  media: {
    orderBy: { sortOrder: "asc" as const },
    select: { id: true, type: true, url: true, title: true },
  },
  _count: counts,
};

/** How many copies of a post there are, and how many fans collected. */
async function collectedCounts(ctx: Pick<ServiceCtx, "db">, postIds: string[]) {
  if (postIds.length === 0) return new Map<string, { copies: number; collected: number }>();
  const [all, taken] = await Promise.all([
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
  const collected = new Map(taken.map((row) => [row.postId, row._count._all]));
  return new Map(
    all.map((row) => [
      row.postId,
      { copies: row._count._all, collected: collected.get(row.postId) ?? 0 },
    ]),
  );
}
const NO_COPIES = { copies: 0, collected: 0 };

export async function listPosts(ctx: Pick<ServiceCtx, "db">, artist: Pick<ArtistRef, "id">) {
  const rows = await ctx.db.post.findMany({
    where: { organizationId: artist.id, isImportOnly: false },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: postSelect,
  });
  const collected = await collectedCounts(
    ctx,
    rows.map((row) => row.id),
  );
  return rows.map(({ _count, tier, ...row }) => ({
    ...row,
    tierName: tier?.name ?? null,
    likes: _count.likes,
    comments: _count.comments,
    ...(collected.get(row.id) ?? NO_COPIES),
  }));
}

export async function getPost(
  ctx: Pick<ServiceCtx, "db">,
  artist: Pick<ArtistRef, "id">,
  postId: string,
) {
  const post = await ctx.db.post.findFirst({
    where: { id: postId, organizationId: artist.id },
    select: postSelect,
  });
  if (!post) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Post not found" });
  const collected = await collectedCounts(ctx, [post.id]);
  const { _count, tier, ...rest } = post;
  return {
    ...rest,
    tierName: tier?.name ?? null,
    likes: _count.likes,
    comments: _count.comments,
    ...(collected.get(post.id) ?? NO_COPIES),
  };
}

export async function createPost(ctx: ServiceCtx, artist: ArtistRef, input: PostInput) {
  check(input);
  const settings = await resolveSettings(ctx, artist, input);
  const post = await ctx.db.post.create({
    data: {
      organizationId: artist.id,
      title: input.title.trim(),
      body: input.body?.trim() ?? "",
      ...settings,
      media:
        input.media && input.media.length > 0
          ? { createMany: { data: mediaRows(input.media) } }
          : undefined,
      collectibles: {
        createMany: {
          data: Array.from({ length: input.copies ?? COLLECTIBLE_COPIES }, () => ({})),
        },
      },
    },
    select: { id: true },
  });
  ctx.activity.set({ targetType: "Post", targetId: post.id });
  await notifyFollowers(ctx, { type: "POST", organization: artist, entityId: post.id });
  return { postId: post.id };
}

export async function updatePost(
  ctx: ServiceCtx,
  artist: ArtistRef,
  input: Partial<PostInput> & { postId: string },
) {
  const post = await ownPost(ctx, artist, input.postId);
  check(input);
  const settings = await resolveSettings(ctx, artist, input);
  if (input.copies !== undefined) await setCopies(ctx, post.id, input.copies);
  const data = {
    ...(input.title !== undefined ? { title: input.title.trim() } : {}),
    ...(input.body !== undefined ? { body: input.body.trim() } : {}),
    ...settings,
  };
  const media = input.media;
  if (media === undefined) {
    if (Object.keys(data).length > 0) await ctx.db.post.update({ where: { id: post.id }, data });
  } else {
    // The media list is replaced as a whole, together with the other edits.
    await ctx.db.$transaction([
      ctx.db.postMedia.deleteMany({ where: { postId: post.id } }),
      ctx.db.post.update({
        where: { id: post.id },
        data: { ...data, media: { createMany: { data: mediaRows(media) } } },
      }),
    ]);
  }
  return { postId: post.id };
}

/** Fans who collected a copy keep a record of it, so a post with collectors can't be deleted. */
export async function removePost(ctx: ServiceCtx, artist: ArtistRef, postId: string) {
  const post = await ownPost(ctx, artist, postId);
  const collected = await ctx.db.postCollectible.count({
    where: { postId: post.id, collectorId: { not: null } },
  });
  if (collected > 0)
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, {
      message: `${collected} fan${collected === 1 ? " has" : "s have"} collected this post, so it can't be deleted.`,
    });
  await ctx.db.post.delete({ where: { id: post.id } });
  return { postId: post.id };
}

export async function listComments(
  ctx: Pick<ServiceCtx, "db">,
  artist: Pick<ArtistRef, "id">,
  postId: string,
) {
  const post = await ctx.db.post.findFirst({
    where: { id: postId, organizationId: artist.id },
    select: { id: true },
  });
  if (!post) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Post not found" });
  const rows = await ctx.db.postComment.findMany({
    where: { postId: post.id },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      parentId: true,
      body: true,
      createdAt: true,
      author: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
    },
  });
  return rows.map(({ author, ...row }) => ({
    ...row,
    author: { id: author.id, name: author.displayName ?? author.username, image: author.avatarUrl },
  }));
}

/** The artist can remove any comment on their own posts (its replies go with it). */
export async function removeComment(ctx: ServiceCtx, artist: ArtistRef, commentId: string) {
  const comment = await ctx.db.postComment.findFirst({
    where: { id: commentId, post: { organizationId: artist.id } },
    select: { id: true, postId: true },
  });
  if (!comment) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Comment not found" });
  ctx.activity.set({ targetType: "Post", targetId: comment.postId });
  await ctx.db.postComment.delete({ where: { id: comment.id } });
  return { commentId: comment.id };
}
