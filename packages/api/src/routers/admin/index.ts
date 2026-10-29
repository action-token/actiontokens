import { z } from "zod";

import { listActivity } from "../../services/admin/activity";
import { approveArtist, banArtist, listApplications, rejectArtist } from "../../services/admin/artists";
import { adminProcedure, createRouter } from "../../trpc";

const artistId = z.object({ artistId: z.string().min(1) });

/** Admin tools (artist.bandcoin.io/admin). Every procedure here is admin-only. */
export const adminRouter = createRouter({
  artists: createRouter({
    list: adminProcedure
      .input(z.object({ status: z.enum(["PENDING", "APPROVED", "REJECTED", "BANNED"]).optional() }))
      .query(({ ctx, input }) => listApplications(ctx, input)),
    approve: adminProcedure.input(artistId).mutation(({ ctx, input }) => approveArtist(ctx, input.artistId)),
    reject: adminProcedure
      .input(artistId.extend({ reason: z.string().trim().min(3, "Tell them why, in a few words").max(300) }))
      .mutation(({ ctx, input }) => rejectArtist(ctx, input)),
    ban: adminProcedure.input(artistId).mutation(({ ctx, input }) => banArtist(ctx, input.artistId)),
  }),
  activity: createRouter({
    list: adminProcedure
      .input(z.object({ limit: z.number().int().min(1).max(100).default(50), cursor: z.string().regex(/^\d+$/).optional(), failedOnly: z.boolean().optional() }))
      .query(({ ctx, input }) => listActivity(ctx, input)),
  }),
});
