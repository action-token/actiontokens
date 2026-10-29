import { z } from "zod";

import {
  applyTemplate,
  discardDraft,
  getEditor,
  publishPage,
  saveDraft,
  unpublishPage,
} from "../../services/artist/page";
import { artistProcedure, createRouter } from "../../trpc";

/** The artist's page builder (see services/artist/page). The blocks and theme are checked and repaired on save, so the input is only loosely typed. */
export const pageRouter = createRouter({
  editor: artistProcedure.query(({ ctx }) => getEditor(ctx, ctx.artist)),

  saveDraft: artistProcedure
    .input(z.object({ blocks: z.array(z.unknown()).max(60), theme: z.unknown() }))
    .mutation(({ ctx, input }) => saveDraft(ctx, ctx.artist, input)),

  publish: artistProcedure.mutation(({ ctx }) => publishPage(ctx, ctx.artist)),

  unpublish: artistProcedure.mutation(({ ctx }) => unpublishPage(ctx, ctx.artist)),

  discard: artistProcedure.mutation(({ ctx }) => discardDraft(ctx, ctx.artist)),

  applyTemplate: artistProcedure
    .input(z.object({ key: z.string().min(1).max(40) }))
    .mutation(({ ctx, input }) => applyTemplate(ctx, ctx.artist, input.key)),
});
