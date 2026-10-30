import { z } from "zod";

import { ACTIVITY_KINDS, listActivity } from "../../services/admin/activity";
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
import {
  listUsers,
  setAdmin,
  suspendUser,
  unsuspendUser,
  userCounts,
} from "../../services/admin/users";
import { listBounties, setBountyHidden } from "../../services/admin/bounties";
import { listItems, setItemHidden } from "../../services/admin/items";
import { getPerson } from "../../services/admin/person";
import { deletePin, listPins, setPinHidden } from "../../services/admin/pins";
import { getMuralSettings } from "../../services/ar/murals";
import { adminProcedure, createRouter } from "../../trpc";

const artistId = z.object({ artistId: z.string().min(1) });
const muralId = z.object({ muralId: z.string().min(1) });
const userId = z.object({ userId: z.string().min(1) });
const pinId = z.object({ pinId: z.string().min(1) });
const search = z.string().max(120).optional();
const cursor = z.string().nullish();
/** Hiding needs a reason the log (and later the artist) can read; showing again doesn't. */
const hideInput = z.discriminatedUnion("hidden", [
  z.object({
    hidden: z.literal(true),
    reason: z.string().trim().min(3, "Say why, in a few words").max(300),
  }),
  z.object({ hidden: z.literal(false) }),
]);
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
  users: createRouter({
    list: adminProcedure
      .input(
        z.object({
          search: z.string().max(120).optional(),
          role: z.enum(["FAN", "ARTIST", "ADMIN"]).optional(),
          status: z.enum(["active", "suspended"]).optional(),
          cursor: z.string().nullish(),
        }),
      )
      .query(({ ctx, input }) => listUsers(ctx, { ...input, cursor: input.cursor ?? undefined })),
    counts: adminProcedure.query(({ ctx }) => userCounts(ctx)),
    get: adminProcedure.input(userId).query(({ ctx, input }) => getPerson(ctx, input.userId)),
    suspend: adminProcedure
      .input(
        userId.extend({
          reason: z.string().trim().min(3, "Say why, in a few words").max(300),
        }),
      )
      .mutation(({ ctx, input }) => suspendUser(ctx, ctx.session.user, input)),
    unsuspend: adminProcedure.input(userId).mutation(({ ctx, input }) => unsuspendUser(ctx, input)),
    setAdmin: adminProcedure
      .input(userId.extend({ admin: z.boolean() }))
      .mutation(({ ctx, input }) => setAdmin(ctx, ctx.session.user, input)),
  }),
  pins: createRouter({
    list: adminProcedure
      .input(
        z.object({
          search,
          status: z.enum(["live", "hidden", "ended", "upcoming"]).optional(),
          cursor,
        }),
      )
      .query(({ ctx, input }) => listPins(ctx, { ...input, cursor: input.cursor ?? undefined })),
    setHidden: adminProcedure
      .input(pinId.extend({ hidden: z.boolean() }))
      .mutation(({ ctx, input }) => setPinHidden(ctx, input)),
    remove: adminProcedure.input(pinId).mutation(({ ctx, input }) => deletePin(ctx, input)),
  }),
  bounties: createRouter({
    list: adminProcedure
      .input(
        z.object({
          search,
          status: z.enum(["draft", "running", "paused", "completed", "hidden"]).optional(),
          cursor,
        }),
      )
      .query(({ ctx, input }) =>
        listBounties(ctx, { ...input, cursor: input.cursor ?? undefined }),
      ),
    setHidden: adminProcedure
      .input(z.object({ bountyId: z.string().min(1) }).and(hideInput))
      .mutation(({ ctx, input }) => setBountyHidden(ctx, input)),
  }),
  items: createRouter({
    list: adminProcedure
      .input(
        z.object({
          search,
          status: z.enum(["listed", "draft", "hidden"]).optional(),
          chain: z.enum(["CLASSIC_TOKEN", "CONTRACT_NFT"]).optional(),
          cursor,
        }),
      )
      .query(({ ctx, input }) => listItems(ctx, { ...input, cursor: input.cursor ?? undefined })),
    setHidden: adminProcedure
      .input(z.object({ itemId: z.string().min(1) }).and(hideInput))
      .mutation(({ ctx, input }) => setItemHidden(ctx, input)),
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
          actorId: z.string().min(1).optional(),
          kind: z.enum(ACTIVITY_KINDS).optional(),
        }),
      )
      .query(({ ctx, input }) => listActivity(ctx, input)),
  }),
});
