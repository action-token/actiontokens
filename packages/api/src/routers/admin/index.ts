import { z } from "zod";

import { NFT_MAX_PLATFORM_FEE_BPS } from "@bandcoin/chain";

import { ACTIVITY_KINDS, listActivity } from "../../services/admin/activity";
import { listAlerts, listReviewedAlerts, reviewAlert } from "../../services/admin/alerts";
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
import { getArtist } from "../../services/admin/artist-detail";
import {
  approveArtist,
  banArtist,
  listApplications,
  rejectArtist,
  unbanArtist,
} from "../../services/admin/artists";
import {
  addAdmin,
  listUsers,
  setAdmin,
  suspendUser,
  unsuspendUser,
  userCounts,
} from "../../services/admin/users";
import { listBounties, setBountyHidden } from "../../services/admin/bounties";
import { listItems, setItemHidden } from "../../services/admin/items";
import { changeContractFee, readContractFee } from "../../services/admin/contract-fee";
import { getPerson } from "../../services/admin/person";
import { getSettings, updateSettings } from "../../services/admin/settings";
import { decidePins, deletePins, listPins, pinCounts } from "../../services/admin/pins";
import { getMuralSettings } from "../../services/ar/murals";
import { adminProcedure, createRouter } from "../../trpc";

const artistId = z.object({ artistId: z.string().min(1) });
const muralId = z.object({ muralId: z.string().min(1) });
const userId = z.object({ userId: z.string().min(1) });
const pinIds = z.object({ pinIds: z.array(z.string().min(1)).min(1).max(500) });
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
const stellarAccount = z
  .string()
  .trim()
  .regex(/^G[A-Z2-7]{55}$/, "A Stellar account starts with G");
const amount = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,7})?$/, "A number, up to 7 decimals")
  .nullable();
const contractFee = z.object({
  feeBps: z.number().int().min(0).max(NFT_MAX_PLATFORM_FEE_BPS),
  treasury: stellarAccount,
});

/** Admin tools (artist.bandcoin.io/admin). Every procedure here is admin-only. */
export const adminRouter = createRouter({
  artists: createRouter({
    list: adminProcedure
      .input(z.object({ status: z.enum(["PENDING", "APPROVED", "REJECTED", "BANNED"]).optional() }))
      .query(({ ctx, input }) => listApplications(ctx, input)),
    get: adminProcedure.input(artistId).query(({ ctx, input }) => getArtist(ctx, input.artistId)),
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
    unban: adminProcedure
      .input(artistId)
      .mutation(({ ctx, input }) => unbanArtist(ctx, input.artistId)),
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
    addAdmin: adminProcedure
      .input(z.object({ who: z.string().trim().min(3).max(200) }))
      .mutation(({ ctx, input }) => addAdmin(ctx, ctx.session.user, input)),
  }),
  pins: createRouter({
    list: adminProcedure
      .input(z.object({ view: z.enum(["pending", "approved", "rejected"]), search, cursor }))
      .query(({ ctx, input }) => listPins(ctx, { ...input, cursor: input.cursor ?? undefined })),
    counts: adminProcedure.query(({ ctx }) => pinCounts(ctx)),
    decide: adminProcedure
      .input(pinIds.extend({ approval: z.enum(["PENDING", "APPROVED", "REJECTED"]) }))
      .mutation(({ ctx, input }) => decidePins(ctx, input)),
    remove: adminProcedure.input(pinIds).mutation(({ ctx, input }) => deletePins(ctx, input)),
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
  alerts: createRouter({
    list: adminProcedure.query(({ ctx }) => listAlerts(ctx)),
    reviewed: adminProcedure.query(({ ctx }) => listReviewedAlerts(ctx)),
    review: adminProcedure
      .input(
        z.object({
          key: z.string().min(1).max(500),
          kind: z.enum(["failedPayments", "signInFailures", "fastClaims", "largeOrder", "stuck"]),
          note: z.string().max(300).optional(),
        }),
      )
      .mutation(({ ctx, input }) => reviewAlert(ctx, ctx.session.user, input)),
  }),
  settings: createRouter({
    get: adminProcedure.query(({ ctx }) => getSettings(ctx)),
    update: adminProcedure
      .input(
        z.object({
          platformFeeBps: z.number().int().min(0).max(NFT_MAX_PLATFORM_FEE_BPS),
          platformFeeRecipient: stellarAccount.nullable(),
          vanityMonthlyBandcoin: amount,
          vanityMonthlyUsd: amount,
          vanityNameChangeBandcoin: amount,
          vanityNameChangeUsd: amount,
          nearbyPinRadiusMeters: z.number().min(10).max(50_000),
          alertRules: z.object({
            failedPayments: z.number().int().min(1).max(1000),
            signInFailures: z.number().int().min(1).max(10_000),
            claimSpeedKmh: z.number().min(10).max(5000),
            largeOrderUsd: z.number().min(1).max(10_000_000),
            stuckMinutes: z.number().int().min(1).max(10_080),
          }),
        }),
      )
      .mutation(({ ctx, input }) => updateSettings(ctx, input)),
    contractFee: adminProcedure.query(({ ctx }) => readContractFee(ctx)),
    changeContractFee: adminProcedure
      .input(contractFee)
      .mutation(({ ctx, input }) => changeContractFee(ctx, input)),
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
