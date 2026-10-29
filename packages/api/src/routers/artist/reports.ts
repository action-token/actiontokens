import { z } from "zod";

import { collectionSummary, exportCollections, pinReport } from "../../services/artist/reports";
import { artistProcedure, createRouter } from "../../trpc";

const period = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() });

/** How the artist's pins are being collected (see services/artist/reports). */
export const reportsRouter = createRouter({
  summary: artistProcedure.input(period).query(({ ctx, input }) => collectionSummary(ctx, ctx.artist, input)),

  /** A mutation so the button can fetch it on demand; it only reads. */
  exportCollections: artistProcedure.input(period.extend({ pinId: z.string().min(1).optional() })).mutation(({ ctx, input }) => exportCollections(ctx, ctx.artist, input, input.pinId)),

  pin: artistProcedure.input(z.object({ pinId: z.string().min(1) })).query(({ ctx, input }) => pinReport(ctx, ctx.artist, input.pinId)),
});
