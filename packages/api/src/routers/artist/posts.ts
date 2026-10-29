import { z } from "zod";

import { createPost, getPost, listComments, listPosts, removeComment, removePost, updatePost } from "../../services/artist/posts";
import { artistProcedure, createRouter } from "../../trpc";

const media = z.array(z.object({ type: z.enum(["IMAGE", "VIDEO", "AUDIO"]), url: z.string().url() })).max(10);
const postFields = {
  title: z.string().trim().max(160),
  body: z.string().max(12_000).optional(),
  tierId: z.string().nullish(),
  media: media.optional(),
};

/** Posts to followers, with their comments (see services/artist/posts). */
export const postsRouter = createRouter({
  posts: artistProcedure.query(({ ctx }) => listPosts(ctx, ctx.artist)),

  post: artistProcedure.input(z.object({ postId: z.string().min(1) })).query(({ ctx, input }) => getPost(ctx, ctx.artist, input.postId)),

  comments: artistProcedure.input(z.object({ postId: z.string().min(1) })).query(({ ctx, input }) => listComments(ctx, ctx.artist, input.postId)),

  createPost: artistProcedure.input(z.object(postFields)).mutation(({ ctx, input }) => createPost(ctx, ctx.artist, input)),

  updatePost: artistProcedure.input(z.object(postFields).partial().extend({ postId: z.string().min(1) })).mutation(({ ctx, input }) => updatePost(ctx, ctx.artist, input)),

  removePost: artistProcedure.input(z.object({ postId: z.string().min(1) })).mutation(({ ctx, input }) => removePost(ctx, ctx.artist, input.postId)),

  removeComment: artistProcedure.input(z.object({ commentId: z.string().min(1) })).mutation(({ ctx, input }) => removeComment(ctx, ctx.artist, input.commentId)),
});
