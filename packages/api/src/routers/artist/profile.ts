import { z } from "zod";

import {
  BIO_MAX,
  getProfile,
  NAME_MAX,
  setProfileImage,
  updateProfile,
} from "../../services/artist/profile";
import {
  quoteStorageOpening,
  startStorageOpening,
  submitStorageOpening,
} from "../../services/artist/storage-account";
import {
  MAX_STOCK,
  quoteStock,
  startStock,
  submitStock,
} from "../../services/artist/storage-stock";
import { cancelPurchase } from "../../services/purchase";
import { artistProcedure, createRouter } from "../../trpc";

const stockInput = z.object({
  itemId: z.string().min(1),
  quantity: z.number().int().min(1).max(MAX_STOCK),
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

  /** Opening the storage account, where copies wait (see services/artist/storage-account). */
  storageQuote: artistProcedure.query(({ ctx }) =>
    quoteStorageOpening(ctx, ctx.session.user, ctx.artist),
  ),
  storageStart: artistProcedure.mutation(({ ctx }) =>
    startStorageOpening(ctx, ctx.session.user, ctx.artist),
  ),
  storageSubmit: artistProcedure
    .input(z.object({ orderId: z.string().min(1), xdr: z.string().min(1) }))
    .mutation(({ ctx, input }) => submitStorageOpening(ctx, ctx.session.user, ctx.artist, input)),
  storageCancel: artistProcedure
    .input(z.object({ orderId: z.string().min(1) }))
    .mutation(({ ctx, input }) => cancelPurchase(ctx, ctx.session.user, input.orderId)),

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
});
