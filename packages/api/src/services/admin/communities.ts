import type { Prisma } from "@actiontokens/db";
import { AppError, ErrorCodes } from "@actiontokens/errors";

import type { Context } from "../../context";
import { ADMIN_PAGE } from "./pins";

/**
 * Admin › Communities. An admin can hide a community (with a reason the owner can read), show it
 * again, and take down a post or comment or remove a member. Nothing here edits anyone's words.
 */
type ServiceCtx = Pick<Context, "db" | "activity">;

export type CommunityFilter = { search?: string; status?: "active" | "hidden"; cursor?: string };

const missing = (what: string) =>
  new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: `This ${what} doesn't exist.` });

export async function listCommunities(ctx: Pick<Context, "db">, input: CommunityFilter) {
  const q = input.search?.trim();
  const where: Prisma.CommunityWhereInput = {
    ...(input.status === "hidden" ? { hiddenAt: { not: null } } : {}),
    ...(input.status === "active" ? { hiddenAt: null } : {}),
    ...(q
      ? {
          OR: [
            { id: q },
            { title: { contains: q, mode: "insensitive" } },
            { owner: { displayName: { contains: q, mode: "insensitive" } } },
            { owner: { username: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const rows = await ctx.db.community.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: ADMIN_PAGE + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      title: true,
      isTokenGated: true,
      hiddenAt: true,
      hiddenReason: true,
      createdAt: true,
      owner: { select: { id: true, username: true, displayName: true } },
      _count: { select: { members: true, posts: true } },
    },
  });
  const page = rows.slice(0, ADMIN_PAGE);
  return {
    communities: page.map(({ hiddenAt, hiddenReason, ...row }) => ({
      ...row,
      hidden: hiddenAt ? { at: hiddenAt, reason: hiddenReason } : null,
    })),
    nextCursor: rows.length > ADMIN_PAGE ? (page.at(-1)?.id ?? null) : null,
  };
}

/** A community with its latest posts, so an admin can see what a report is about. */
export async function communityDetail(ctx: Pick<Context, "db">, communityId: string) {
  const community = await ctx.db.community.findUnique({
    where: { id: communityId },
    include: {
      owner: { select: { id: true, username: true, displayName: true } },
      requirements: true,
      _count: { select: { members: true, posts: true } },
      posts: {
        orderBy: { createdAt: "desc" },
        take: 20,
        include: {
          author: { select: { id: true, username: true, displayName: true } },
          _count: { select: { comments: true, likes: true } },
        },
      },
    },
  });
  if (!community) throw missing("community");
  return community;
}

export async function setCommunityHidden(
  ctx: ServiceCtx,
  input: { communityId: string; hidden: boolean; reason?: string },
) {
  const community = await ctx.db.community.findUnique({
    where: { id: input.communityId },
    select: { id: true },
  });
  if (!community) throw missing("community");
  ctx.activity.set({ targetType: "Community", targetId: community.id });
  await ctx.db.community.update({
    where: { id: community.id },
    data: input.hidden
      ? { hiddenAt: new Date(), hiddenReason: input.reason?.trim() || null }
      : { hiddenAt: null, hiddenReason: null },
  });
  return { communityId: community.id, hidden: input.hidden };
}

export async function takeDownPost(ctx: ServiceCtx, postId: string) {
  const post = await ctx.db.communityPost.findUnique({
    where: { id: postId },
    select: { id: true },
  });
  if (!post) throw missing("post");
  ctx.activity.set({ targetType: "CommunityPost", targetId: post.id });
  await ctx.db.communityPost.delete({ where: { id: post.id } });
  return { ok: true };
}

export async function takeDownComment(ctx: ServiceCtx, commentId: string) {
  const comment = await ctx.db.communityComment.findUnique({
    where: { id: commentId },
    select: { id: true },
  });
  if (!comment) throw missing("comment");
  ctx.activity.set({ targetType: "CommunityComment", targetId: comment.id });
  await ctx.db.communityComment.delete({ where: { id: comment.id } });
  return { ok: true };
}

/** Removes a member; the owner can't be removed (hide or delete the community instead). */
export async function removeCommunityMember(
  ctx: ServiceCtx,
  input: { communityId: string; userId: string },
) {
  const community = await ctx.db.community.findUnique({
    where: { id: input.communityId },
    select: { ownerId: true },
  });
  if (!community) throw missing("community");
  if (community.ownerId === input.userId)
    throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, {
      message: "The owner can't be removed. Hide the community instead.",
    });
  ctx.activity.set({ targetType: "Community", targetId: input.communityId });
  const { count } = await ctx.db.communityMember.deleteMany({
    where: { communityId: input.communityId, userId: input.userId },
  });
  return { removed: count };
}
