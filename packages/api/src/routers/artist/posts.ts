import { z } from "zod";

import {
  createPost,
  getPost,
  listComments,
  listPosts,
  removeComment,
  removePost,
  updatePost,
} from "../../services/artist/posts";
import { artistProcedure, createRouter } from "../../trpc";

const media = z
  .array(
    z.object({
      type: z.enum(["IMAGE", "VIDEO", "AUDIO"]),
      url: z.string().url(),
      title: z.string().max(200).nullish(),
    }),
  )
  .max(10);
const access = z.enum(["VIEWERS", "FOLLOWERS", "MEMBERS", "NOBODY"]);
const postFields = {
  title: z.string().trim().max(160),
  body: z.string().max(12_000).optional(),
  audience: z.enum(["EVERYONE", "FOLLOWERS", "SUBSCRIBERS", "MEMBERS"]).optional(),
  tierId: z.string().nullish(),
  commentAccess: access.optional(),
  commentTierId: z.string().nullish(),
  collectAccess: access.optional(),
  collectTierId: z.string().nullish(),
  copies: z.number().int().min(1).max(10_000).optional(),
  media: media.optional(),
};

/** Posts to followers, with their comments (see services/artist/posts). */
export const postsRouter = createRouter({
  posts: artistProcedure.query(({ ctx }) => listPosts(ctx, ctx.artist)),

  post: artistProcedure
    .input(z.object({ postId: z.string().min(1) }))
    .query(({ ctx, input }) => getPost(ctx, ctx.artist, input.postId)),

  comments: artistProcedure
    .input(z.object({ postId: z.string().min(1) }))
    .query(({ ctx, input }) => listComments(ctx, ctx.artist, input.postId)),

  createPost: artistProcedure
    .input(z.object(postFields))
    .mutation(({ ctx, input }) => createPost(ctx, ctx.artist, input)),

  updatePost: artistProcedure
    .input(
      z
        .object(postFields)
        .partial()
        .extend({ postId: z.string().min(1) }),
    )
    .mutation(({ ctx, input }) => updatePost(ctx, ctx.artist, input)),

  removePost: artistProcedure
    .input(z.object({ postId: z.string().min(1) }))
    .mutation(({ ctx, input }) => removePost(ctx, ctx.artist, input.postId)),

  removeComment: artistProcedure
    .input(z.object({ commentId: z.string().min(1) }))
    .mutation(({ ctx, input }) => removeComment(ctx, ctx.artist, input.commentId)),
});
