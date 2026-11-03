import type { MediaType } from "@bandcoin/db";
import { AppError, ErrorCodes } from "@bandcoin/errors";
import { isOwnS3Url } from "@bandcoin/storage";

import type { Context } from "../../context";
import { invalid } from "./items";

/**
 * Posts: news, media and perks an artist shares with followers, public or for
 * one membership tier. Each post has 100 collectible copies fans can pick up
 * (one per fan). Followers get a notification when a post goes up.
 */
type ServiceCtx = Pick<Context, "db" | "activity">;
type ArtistRef = { id: string; userId: string };

export const COLLECTIBLE_COPIES = 100;
export const MAX_MEDIA = 10;
const MEDIA_TYPES: MediaType[] = ["IMAGE", "VIDEO", "AUDIO"];

/** `title` names a song (its file name when uploaded) */
export type PostMediaInput = { type: MediaType; url: string; title?: string | null };

export type PostInput = {
  title: string;
  body?: string;
  /** Members of this tier only; null = public */
  tierId?: string | null;
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
}

async function resolveTier(ctx: ServiceCtx, artist: ArtistRef, tierId: string | null | undefined) {
  if (!tierId) return null;
  const tier = await ctx.db.membershipTier.findFirst({
    where: { id: tierId, artistId: artist.id, isActive: true },
    select: { id: true },
  });
  if (!tier) throw invalid("Pick one of your active membership tiers.");
  return tier.id;
}

async function ownPost(ctx: ServiceCtx, artist: ArtistRef, postId: string) {
  const post = await ctx.db.post.findFirst({
    where: { id: postId, artistId: artist.id },
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
  tierId: true,
  createdAt: true,
  updatedAt: true,
  tier: { select: { name: true } },
  media: {
    orderBy: { sortOrder: "asc" as const },
    select: { id: true, type: true, url: true, title: true },
  },
  _count: counts,
};

/** How many copies of a post fans collected. */
async function collectedCounts(ctx: Pick<ServiceCtx, "db">, postIds: string[]) {
  if (postIds.length === 0) return new Map<string, number>();
  const rows = await ctx.db.postCollectible.groupBy({
    by: ["postId"],
    where: { postId: { in: postIds }, collectorId: { not: null } },
    _count: { _all: true },
  });
  return new Map(rows.map((row) => [row.postId, row._count._all]));
}

export async function listPosts(ctx: Pick<ServiceCtx, "db">, artist: Pick<ArtistRef, "id">) {
  const rows = await ctx.db.post.findMany({
    where: { artistId: artist.id, isImportOnly: false },
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
    collected: collected.get(row.id) ?? 0,
  }));
}

export async function getPost(
  ctx: Pick<ServiceCtx, "db">,
  artist: Pick<ArtistRef, "id">,
  postId: string,
) {
  const post = await ctx.db.post.findFirst({
    where: { id: postId, artistId: artist.id },
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
    collected: collected.get(post.id) ?? 0,
  };
}

export async function createPost(ctx: ServiceCtx, artist: ArtistRef, input: PostInput) {
  check(input);
  const tierId = await resolveTier(ctx, artist, input.tierId);
  const post = await ctx.db.post.create({
    data: {
      artistId: artist.id,
      title: input.title.trim(),
      body: input.body?.trim() ?? "",
      tierId,
      media:
        input.media && input.media.length > 0
          ? { createMany: { data: mediaRows(input.media) } }
          : undefined,
      collectibles: {
        createMany: { data: Array.from({ length: COLLECTIBLE_COPIES }, () => ({})) },
      },
    },
    select: { id: true },
  });
  ctx.activity.set({ targetType: "Post", targetId: post.id });
  await notifyFollowers(ctx, artist, post.id);
  return { postId: post.id };
}

/** A failed notification must not undo a published post, so it is reported but not thrown. */
async function notifyFollowers(ctx: ServiceCtx, artist: ArtistRef, postId: string) {
  try {
    const followers = await ctx.db.follow.findMany({
      where: { artistId: artist.id },
      select: { userId: true },
    });
    if (followers.length === 0) return;
    await ctx.db.notificationEvent.create({
      data: {
        type: "POST",
        actorId: artist.userId,
        entityId: postId,
        notifications: {
          createMany: { data: followers.map((follower) => ({ recipientId: follower.userId })) },
        },
      },
    });
  } catch (error) {
    console.error("[posts] couldn't notify followers", error);
  }
}

export async function updatePost(
  ctx: ServiceCtx,
  artist: ArtistRef,
  input: Partial<PostInput> & { postId: string },
) {
  const post = await ownPost(ctx, artist, input.postId);
  check(input);
  const tierId =
    input.tierId === undefined ? undefined : await resolveTier(ctx, artist, input.tierId);
  const data = {
    ...(input.title !== undefined ? { title: input.title.trim() } : {}),
    ...(input.body !== undefined ? { body: input.body.trim() } : {}),
    ...(tierId !== undefined ? { tierId } : {}),
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
    where: { id: postId, artistId: artist.id },
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
    where: { id: commentId, post: { artistId: artist.id } },
    select: { id: true, postId: true },
  });
  if (!comment) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Comment not found" });
  ctx.activity.set({ targetType: "Post", targetId: comment.postId });
  await ctx.db.postComment.delete({ where: { id: comment.id } });
  return { commentId: comment.id };
}
