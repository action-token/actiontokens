import { z } from "zod";

import {
  addPostComment,
  collectPost,
  MAX_COMMENT,
  postComments,
  removeOwnComment,
  setPostLike,
} from "../../services/feed/actions";
import { feedPage } from "../../services/feed/feed";
import { authedProcedure, createRouter, publicProcedure } from "../../trpc";

const postId = z.string().min(1);

/** Artists' posts as fans see them: the feed, likes, comments and free copies. */
export const postRouter = createRouter({
  feed: authedProcedure
    .input(z.object({ cursor: z.string().min(1).nullish() }))
    .query(({ ctx, input }) => feedPage(ctx, ctx.session.user, input.cursor ?? null)),

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

  collect: authedProcedure
    .input(z.object({ postId }))
    .mutation(({ ctx, input }) => collectPost(ctx, ctx.session.user, input.postId)),
});
