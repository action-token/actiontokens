import { z } from "zod";

import {
  addPostComment,
  MAX_COMMENT,
  postComments,
  removeOwnComment,
  setPostLike,
} from "../../services/feed/actions";
import { feedPage, viewPost } from "../../services/feed/feed";
import { authedProcedure, createRouter, publicProcedure } from "../../trpc";

const postId = z.string().min(1);

/** Artists' posts as fans see them: the feed, likes and comments. Copies are collected in the AR app. */
export const postRouter = createRouter({
  /** For you ("all") is open to anyone; Following needs a session. */
  feed: publicProcedure
    .input(
      z.object({
        cursor: z.string().min(1).nullish(),
        scope: z.enum(["all", "following"]).default("all"),
      }),
    )
    .query(({ ctx, input }) =>
      feedPage(ctx, ctx.session?.user ?? null, input.cursor ?? null, input.scope),
    ),

  /** One post on its own page; anyone can open it, locked parts stay hidden. */
  byId: publicProcedure
    .input(z.object({ postId }))
    .query(
      async ({ ctx, input }) => (await viewPost(ctx, ctx.session?.user ?? null, input.postId)).card,
    ),

  comments: publicProcedure
    .input(z.object({ postId }))
    .query(({ ctx, input }) => postComments(ctx, input.postId)),

  setLike: authedProcedure
    .input(z.object({ postId, on: z.boolean() }))
    .mutation(({ ctx, input }) => setPostLike(ctx, ctx.session.user, input)),

  addComment: authedProcedure
    .input(
      z.object({
        postId,
        body: z.string().max(MAX_COMMENT * 2),
        parentId: z.string().min(1).nullish(),
      }),
    )
    .mutation(({ ctx, input }) => addPostComment(ctx, ctx.session.user, input)),

  removeComment: authedProcedure
    .input(z.object({ commentId: z.string().min(1) }))
    .mutation(({ ctx, input }) => removeOwnComment(ctx, ctx.session.user, input.commentId)),
});
