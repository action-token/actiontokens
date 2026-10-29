import { z } from "zod";

import { pinReport } from "../../services/artist/reports";
import { artistProcedure, createRouter } from "../../trpc";

/** How the artist's pins are being collected (see services/artist/reports). */
export const reportsRouter = createRouter({
  pin: artistProcedure.input(z.object({ pinId: z.string().min(1) })).query(({ ctx, input }) => pinReport(ctx, ctx.artist, input.pinId)),
});
