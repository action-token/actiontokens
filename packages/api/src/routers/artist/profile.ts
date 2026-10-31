import { z } from "zod";

import {
  BIO_MAX,
  getProfile,
  NAME_MAX,
  setProfileImage,
  updateProfile,
} from "../../services/artist/profile";
import { openStorage } from "../../services/artist/storage-account";
import {
  quoteDeposit,
  startDeposit,
  submitDeposit,
  walletContents,
} from "../../services/artist/storage-deposit";
import {
  MAX_STOCK,
  quoteStock,
  startStock,
  submitStock,
} from "../../services/artist/storage-stock";
import {
  quoteWithdraw,
  startWithdraw,
  storageContents,
  submitWithdraw,
} from "../../services/artist/storage-withdraw";
import { cancelPurchase } from "../../services/purchase";
import { artistProcedure, createRouter } from "../../trpc";

const stockInput = z.object({
  itemId: z.string().min(1),
  quantity: z.number().int().min(1).max(MAX_STOCK),
});

const withdrawInput = z.object({
  code: z.string().min(1).max(12),
  issuer: z.string().length(56).nullable(),
  amount: z.string().max(24),
});

/** The artist's own profile, as the Settings page shows and edits it. */
export const profileRouter = createRouter({
  overview: artistProcedure.query(({ ctx }) => getProfile(ctx, ctx.artist)),

  update: artistProcedure
    .input(
      z.object({
        name: z.string().max(NAME_MAX + 20),
        bio: z.string().max(BIO_MAX + 20),
        website: z.string().max(300),
        twitter: z.string().max(120),
        instagram: z.string().max(120),
      }),
    )
    .mutation(({ ctx, input }) => updateProfile(ctx, ctx.artist, input)),

  setImage: artistProcedure
    .input(
      z.object({ kind: z.enum(["avatar", "cover"]), url: z.string().url().max(2048).nullable() }),
    )
    .mutation(({ ctx, input }) => setProfileImage(ctx, ctx.artist, input)),

  /** Opening the storage account, paid by the platform (see services/artist/storage-account). */
  openStorage: artistProcedure.mutation(({ ctx }) => openStorage(ctx, ctx.artist)),

  /** Adding copies of an item to storage (see services/artist/storage-stock). */
  stockQuote: artistProcedure
    .input(stockInput)
    .query(({ ctx, input }) => quoteStock(ctx, ctx.session.user, ctx.artist, input)),
  stockStart: artistProcedure
    .input(stockInput)
    .mutation(({ ctx, input }) => startStock(ctx, ctx.session.user, ctx.artist, input)),
  stockSubmit: artistProcedure
    .input(z.object({ orderId: z.string().min(1), xdr: z.string().min(1) }))
    .mutation(({ ctx, input }) => submitStock(ctx, ctx.session.user, ctx.artist, input)),
  stockCancel: artistProcedure
    .input(z.object({ orderId: z.string().min(1) }))
    .mutation(({ ctx, input }) => cancelPurchase(ctx, ctx.session.user, input.orderId)),

  /** What storage holds, and taking some back into the wallet (see services/artist/storage-withdraw). */
  storageContents: artistProcedure.query(({ ctx }) => storageContents(ctx, ctx.artist)),
  withdrawQuote: artistProcedure
    .input(withdrawInput)
    .query(({ ctx, input }) => quoteWithdraw(ctx, ctx.session.user, ctx.artist, input)),
  withdrawStart: artistProcedure
    .input(withdrawInput)
    .mutation(({ ctx, input }) => startWithdraw(ctx, ctx.session.user, ctx.artist, input)),
  withdrawSubmit: artistProcedure
    .input(z.object({ orderId: z.string().min(1), xdr: z.string().min(1) }))
    .mutation(({ ctx, input }) => submitWithdraw(ctx, ctx.session.user, ctx.artist, input)),
  withdrawCancel: artistProcedure
    .input(z.object({ orderId: z.string().min(1) }))
    .mutation(({ ctx, input }) => cancelPurchase(ctx, ctx.session.user, input.orderId)),

  /** The wallet next to storage, and moving some into storage (see services/artist/storage-deposit). */
  walletContents: artistProcedure.query(({ ctx }) =>
    walletContents(ctx, ctx.session.user, ctx.artist),
  ),
  depositQuote: artistProcedure
    .input(withdrawInput)
    .query(({ ctx, input }) => quoteDeposit(ctx, ctx.session.user, ctx.artist, input)),
  depositStart: artistProcedure
    .input(withdrawInput)
    .mutation(({ ctx, input }) => startDeposit(ctx, ctx.session.user, ctx.artist, input)),
  depositSubmit: artistProcedure
    .input(z.object({ orderId: z.string().min(1), xdr: z.string().min(1) }))
    .mutation(({ ctx, input }) => submitDeposit(ctx, ctx.session.user, ctx.artist, input)),
  depositCancel: artistProcedure
    .input(z.object({ orderId: z.string().min(1) }))
    .mutation(({ ctx, input }) => cancelPurchase(ctx, ctx.session.user, input.orderId)),
});
