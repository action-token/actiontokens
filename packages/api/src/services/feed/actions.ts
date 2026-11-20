import { AppError, ErrorCodes } from "@actiontokens/errors";

import type { Context, SessionUser } from "../../context";
import { viewPost } from "./feed";
import { notifyAboutPost } from "./notify";
import { commentAuthor, commentAuthorSelect } from "./authors";

type ServiceCtx = Pick<Context, "db" | "chain" | "activity">;

/** Longest comment, in characters. */
export const MAX_COMMENT = 1000;

/** Refuses with the rule's own words ("Follow DJ Tamsin to comment."). */
const refused = (gate: { open: boolean; message: string | null }) =>
  new AppError(ErrorCodes.AUTH_FORBIDDEN, { message: gate.message ?? "You can't do that here." });

/** Likes or un-likes a post; the wanted state is passed, so a double click can't flip it back. */
export async function setPostLike(
  ctx: ServiceCtx,
  user: SessionUser,
  input: { postId: string; on: boolean },
) {
  const { artistUserId } = await viewPost(ctx, user, input.postId);
  ctx.activity.set({ targetType: "Post", targetId: input.postId });
  if (!input.on) {
    await ctx.db.postLike.deleteMany({ where: { postId: input.postId, userId: user.id } });
    return { liked: false };
  }
  const { count } = await ctx.db.postLike.createMany({
    data: [{ postId: input.postId, userId: user.id }],
    skipDuplicates: true,
  });
  if (count > 0)
    await notifyAboutPost(ctx, {
      type: "LIKE",
      actorId: user.id,
      postId: input.postId,
      recipients: [{ id: artistUserId, isForArtist: true }],
    });
  return { liked: true };
}

/** A post's comments, oldest first, with who wrote them; the page nests replies. */
export async function postComments(ctx: Pick<Context, "db">, postId: string) {
  const rows = await ctx.db.postComment.findMany({
    where: { postId, post: { isImportOnly: false } },
    orderBy: { createdAt: "asc" },
    take: 300,
    select: {
      id: true,
      parentId: true,
      body: true,
      createdAt: true,
      author: { select: commentAuthorSelect },
    },
  });
  return rows.map(({ author, ...row }) => ({ ...row, author: commentAuthor(author) }));
}

/**
 * Adds a comment, or a reply to one (replies stay one level deep). The artist
 * hears about comments in the portal; the person replied to hears in the app.
 */
export async function addPostComment(
  ctx: ServiceCtx,
  user: SessionUser,
  input: { postId: string; body: string; parentId?: string | null },
) {
  const body = input.body.trim();
  if (body.length === 0 || body.length > MAX_COMMENT)
    throw new AppError(ErrorCodes.VALIDATION_FAILED, {
      message: `Write a comment of up to ${MAX_COMMENT} characters.`,
    });
  const { card, artistUserId } = await viewPost(ctx, user, input.postId);
  if (!card.comment.open) throw refused(card.comment);

  const parent = input.parentId
    ? await ctx.db.postComment.findFirst({
        where: { id: input.parentId, postId: input.postId },
        select: { id: true, parentId: true, authorId: true },
      })
    : null;
  if (input.parentId && !parent)
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "That comment is gone." });

  const comment = await ctx.db.postComment.create({
    data: {
      postId: input.postId,
      authorId: user.id,
      // A reply to a reply joins the same thread.
      parentId: parent ? (parent.parentId ?? parent.id) : null,
      body,
    },
    select: { id: true },
  });
  ctx.activity.set({ targetType: "Post", targetId: input.postId });

  await notifyAboutPost(ctx, {
    type: "COMMENT",
    actorId: user.id,
    postId: input.postId,
    recipients: [{ id: artistUserId, isForArtist: true }],
  });
  if (parent && parent.authorId !== artistUserId)
    await notifyAboutPost(ctx, {
      type: "REPLY",
      actorId: user.id,
      postId: input.postId,
      recipients: [{ id: parent.authorId, isForArtist: false }],
    });
  return { commentId: comment.id };
}

/** Fans can remove their own comments (and the replies under them). */
export async function removeOwnComment(ctx: ServiceCtx, user: SessionUser, commentId: string) {
  const comment = await ctx.db.postComment.findFirst({
    where: { id: commentId, authorId: user.id },
    select: { id: true, postId: true },
  });
  if (!comment) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Comment not found" });
  ctx.activity.set({ targetType: "Post", targetId: comment.postId });
  await ctx.db.postComment.delete({ where: { id: comment.id } });
  return { commentId: comment.id };
}

/** How many times to try for a free copy when other fans take one at the same moment. */
const COLLECT_TRIES = 3;

/**
 * Takes one of the post's free copies for the fan: one each, while they last.
 * `already` tells the scanner the fan had one, so it can say so and open it.
 */
export async function collectPost(ctx: ServiceCtx, user: SessionUser, postId: string) {
  const { card } = await viewPost(ctx, user, postId);
  if (card.copies.mine) return { collected: true, already: true };
  if (!card.collect.open) throw refused(card.collect);
  ctx.activity.set({ targetType: "Post", targetId: postId });

  for (let attempt = 0; attempt < COLLECT_TRIES; attempt++) {
    const free = await ctx.db.postCollectible.findFirst({
      where: { postId, collectorId: null },
      select: { id: true },
    });
    if (!free) break;
    // Only takes the copy if nobody took it since it was read.
    const { count } = await ctx.db.postCollectible.updateMany({
      where: { id: free.id, collectorId: null },
      data: { collectorId: user.id, collectedAt: new Date() },
    });
    if (count === 1) return { collected: true, already: false };
  }
  throw new AppError(ErrorCodes.ITEM_NOT_AVAILABLE, {
    message: "Every copy of this post has been collected.",
  });
}
