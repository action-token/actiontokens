import { z } from "zod";

import { collectPost } from "../../services/feed/actions";
import { collectedPost, collectedPosts } from "../../services/feed/collected";
import { authedProcedure, createRouter } from "../../trpc";

const postId = z.string().min(1).max(64);

/**
 * Artist posts fans collect by scanning the QR on the post (as in bandfan):
 * one free copy each while they last. They live only in the AR collection.
 */
export const arPostRouter = createRouter({
  collect: authedProcedure
    .input(z.object({ postId }))
    .mutation(({ ctx, input }) => collectPost(ctx, ctx.session.user, input.postId)),

  collected: authedProcedure
    .input(z.object({ cursor: z.string().min(1).nullish() }))
    .query(({ ctx, input }) => collectedPosts(ctx, ctx.session.user, input.cursor ?? null)),

  collectedOne: authedProcedure
    .input(z.object({ postId }))
    .query(({ ctx, input }) => collectedPost(ctx, ctx.session.user, input.postId)),
});
