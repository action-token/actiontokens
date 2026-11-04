import { z } from "zod";

import {
  connectPage,
  disconnectFacebook,
  facebookStatus,
  pendingPages,
  setAutoPublish,
} from "../../services/facebook/connect";
import { artistProcedure, createRouter } from "../../trpc";

/**
 * Facebook page sync (Settings › Facebook). Signing in with Facebook happens
 * on the app's own routes, which keep the person's token in a sealed cookie and
 * pass it here when listing or choosing a page.
 */
export const facebookRouter = createRouter({
  status: artistProcedure.query(({ ctx }) => facebookStatus(ctx, ctx.artist)),

  pages: artistProcedure
    .input(z.object({ sealedUserToken: z.string().min(1).max(2000) }))
    .query(({ input }) => pendingPages(input.sealedUserToken)),

  connect: artistProcedure
    .input(
      z.object({
        sealedUserToken: z.string().min(1).max(2000),
        pageId: z.string().min(1).max(100),
      }),
    )
    .mutation(({ ctx, input }) => connectPage(ctx, ctx.artist, input)),

  setAutoPublish: artistProcedure
    .input(z.object({ value: z.boolean() }))
    .mutation(({ ctx, input }) => setAutoPublish(ctx, ctx.artist, input.value)),

  disconnect: artistProcedure.mutation(({ ctx }) => disconnectFacebook(ctx, ctx.artist)),
});
