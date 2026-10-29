import { z } from "zod";

import { listActivity } from "../../services/admin/activity";
import {
  decideMural,
  editMural,
  getMural,
  listMurals,
  mergeMurals,
  muralCounts,
  revokePreview,
  updateMuralSettings,
} from "../../services/admin/murals";
import {
  approveArtist,
  banArtist,
  listApplications,
  rejectArtist,
} from "../../services/admin/artists";
import { getMuralSettings } from "../../services/ar/murals";
import { adminProcedure, createRouter } from "../../trpc";

const artistId = z.object({ artistId: z.string().min(1) });
const muralId = z.object({ muralId: z.string().min(1) });
const nullableName = z.string().max(120).nullable();

/** Admin tools (artist.bandcoin.io/admin). Every procedure here is admin-only. */
export const adminRouter = createRouter({
  artists: createRouter({
    list: adminProcedure
      .input(z.object({ status: z.enum(["PENDING", "APPROVED", "REJECTED", "BANNED"]).optional() }))
      .query(({ ctx, input }) => listApplications(ctx, input)),
    approve: adminProcedure
      .input(artistId)
      .mutation(({ ctx, input }) => approveArtist(ctx, input.artistId)),
    reject: adminProcedure
      .input(
        artistId.extend({
          reason: z.string().trim().min(3, "Tell them why, in a few words").max(300),
        }),
      )
      .mutation(({ ctx, input }) => rejectArtist(ctx, input)),
    ban: adminProcedure
      .input(artistId)
      .mutation(({ ctx, input }) => banArtist(ctx, input.artistId)),
  }),
  murals: createRouter({
    counts: adminProcedure.query(({ ctx }) => muralCounts(ctx)),
    list: adminProcedure
      .input(z.object({ status: z.enum(["DISCOVERED", "PENDING", "APPROVED", "REJECTED"]) }))
      .query(({ ctx, input }) => listMurals(ctx, input.status)),
    get: adminProcedure.input(muralId).query(({ ctx, input }) => getMural(ctx, input.muralId)),
    revokePreview: adminProcedure
      .input(muralId)
      .query(({ ctx, input }) => revokePreview(ctx, input.muralId)),
    decide: adminProcedure
      .input(
        muralId.extend({
          status: z.enum(["PENDING", "APPROVED", "REJECTED"]),
          reason: z.enum(["NOT_A_MURAL", "FRAUD"]).optional(),
        }),
      )
      .mutation(({ ctx, input }) => decideMural({ ...ctx, adminId: ctx.session.user.id }, input)),
    edit: adminProcedure
      .input(
        muralId.extend({
          title: nullableName,
          artistName: nullableName,
          coverUrl: z.string().url().optional(),
        }),
      )
      .mutation(({ ctx, input }) => editMural(ctx, input)),
    merge: adminProcedure
      .input(z.object({ fromId: z.string().min(1), intoId: z.string().min(1) }))
      .mutation(({ ctx, input }) => mergeMurals(ctx, input)),
    settings: adminProcedure.query(({ ctx }) => getMuralSettings(ctx.db)),
    updateSettings: adminProcedure
      .input(
        z.object({
          coinsPerScan: z.number(),
          discoveryBonus: z.number(),
          dailyScansPerMural: z.number(),
          confirmationsNeeded: z.number(),
        }),
      )
      .mutation(({ ctx, input }) =>
        updateMuralSettings({ ...ctx, adminId: ctx.session.user.id }, input),
      ),
  }),
  activity: createRouter({
    list: adminProcedure
      .input(
        z.object({
          limit: z.number().int().min(1).max(100).default(50),
          cursor: z.string().regex(/^\d+$/).optional(),
          failedOnly: z.boolean().optional(),
        }),
      )
      .query(({ ctx, input }) => listActivity(ctx, input)),
  }),
});
