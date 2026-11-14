import { z } from "zod";

import { createLayer, deleteLayer, listLayers, updateLayer } from "../../services/artist/layers";
import { actingArtistProcedure, createRouter } from "../../trpc";

const fields = {
  name: z.string().trim().min(2).max(32),
  icon: z.string().min(1).max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
};

/** An artist's map layers (see services/artist/layers). */
export const layersRouter = createRouter({
  list: actingArtistProcedure.query(({ ctx }) => listLayers(ctx, ctx.artist)),
  create: actingArtistProcedure
    .input(z.object(fields))
    .mutation(({ ctx, input }) => createLayer(ctx, ctx.artist, input)),
  update: actingArtistProcedure
    .input(z.object({ ...fields, id: z.string().min(1) }))
    .mutation(({ ctx, input }) => updateLayer(ctx, ctx.artist, input)),
  delete: actingArtistProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(({ ctx, input }) => deleteLayer(ctx, ctx.artist, input.id)),
});
