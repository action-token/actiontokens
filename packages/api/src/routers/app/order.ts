import { z } from "zod";

import { CURRENCIES } from "@actiontokens/chain";

import {
  cancelPurchase,
  quotePurchase,
  startPurchase,
  submitPurchase,
} from "../../services/purchase";
import {
  payGuestPurchase,
  quoteGuestPurchase,
  startGuestPurchase,
} from "../../services/purchase/guest";
import {
  isNftListing,
  quoteNftPurchase,
  startNftPurchase,
  submitNftPurchase,
} from "../../services/purchase/nft";
import { authedProcedure, createRouter, publicProcedure } from "../../trpc";

/** Most copies one purchase can include. */
const MAX_QUANTITY = 50;

const purchaseInput = z.object({
  listingId: z.string().min(1),
  quantity: z.number().int().min(1).max(MAX_QUANTITY),
  currency: z.enum(CURRENCIES),
});

const guestInput = z.object({
  listingId: z.string().min(1),
  quantity: z.number().int().min(1).max(MAX_QUANTITY),
  email: z.string().trim().email().max(254),
});
const cardInput = z.object({
  sourceId: z.string().min(1),
  verificationToken: z.string().optional(),
});

export const orderRouter = createRouter({
  /** Guest card checkout (no sign-in): the price for this email, read from the database only. */
  guestQuote: publicProcedure
    .input(guestInput)
    .query(({ ctx, input }) => quoteGuestPurchase(ctx, input)),

  /** Guest checkout: the order, before the card. Limited per email and per IP. */
  guestStart: publicProcedure
    .input(guestInput)
    .mutation(({ ctx, input }) => startGuestPurchase(ctx, input)),

  /** Guest checkout: charge the card, then the account and the purchase (services/purchase/guest). */
  guestPay: publicProcedure
    .input(
      z.object({
        orderId: z.string().min(1),
        email: z.string().trim().email().max(254),
        card: cardInput,
      }),
    )
    .mutation(({ ctx, input }) => payGuestPurchase(ctx, input)),

  /** The price breakdown for the buy panel. Works signed out (shows "Sign in to pay"). */
  quote: publicProcedure.input(purchaseInput).query(async ({ ctx, input }) => {
    const user = ctx.session?.user ?? null;
    // Contract NFTs are bought from the contract (services/purchase/nft); everything else is classic.
    if (await isNftListing(ctx.db, input.listingId)) return quoteNftPurchase(ctx, user, input);
    const { quote } = await quotePurchase(ctx, user, input);
    return quote;
  }),

  start: authedProcedure
    .input(purchaseInput)
    .mutation(async ({ ctx, input }) =>
      (await isNftListing(ctx.db, input.listingId))
        ? startNftPurchase(ctx, ctx.session.user, input)
        : startPurchase(ctx, ctx.session.user, input),
    ),

  submit: authedProcedure
    .input(
      z.object({
        orderId: z.string().min(1),
        xdr: z.string().min(1),
        card: z
          .object({ sourceId: z.string().min(1), verificationToken: z.string().optional() })
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const order = await ctx.db.order.findFirst({
        where: { id: input.orderId, buyerId: ctx.session.user.id },
        select: { kind: true },
      });
      return order?.kind === "NFT_PURCHASE"
        ? submitNftPurchase(ctx, ctx.session.user, input)
        : submitPurchase(ctx, ctx.session.user, input);
    }),

  cancel: authedProcedure
    .input(z.object({ orderId: z.string().min(1) }))
    .mutation(({ ctx, input }) => cancelPurchase(ctx, ctx.session.user, input.orderId)),

  status: authedProcedure
    .input(z.object({ orderId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const order = await ctx.db.order.findFirst({
        where: { id: input.orderId, buyerId: ctx.session.user.id },
        select: {
          id: true,
          status: true,
          failureCode: true,
          txHash: true,
          quantity: true,
          itemId: true,
        },
      });
      return order;
    }),
});
