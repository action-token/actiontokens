import { z } from "zod";

import { toDisplay, toStroops } from "@bandcoin/chain";
import type { OrderKind, OrderStatus } from "@bandcoin/db";

import { listGifts, prepareGiftClaim, submitGiftClaim } from "../../services/gifts/claim";
import { authedProcedure, createRouter } from "../../trpc";

/** Orders that reached the chain or failed; quotes, unsigned carts and cancellations aren't history. */
const HISTORY_STATUSES: OrderStatus[] = [
  "SUBMITTED",
  "CONFIRMED",
  "DELIVERED",
  "FAILED",
  "REFUNDED",
];
const PAGE = 50;

function orderTitle(kind: OrderKind, quantity: number, itemTitle: string | null) {
  switch (kind) {
    case "ITEM_PURCHASE":
      return `Bought ${quantity > 1 ? `${quantity} × ` : ""}${itemTitle ?? "an item"}`;
    case "GIFT":
      return `Gift: ${itemTitle ?? "an item"}`;
    case "VANITY":
      return "Artist page link";
    case "STUDIO_COINS":
      return "Studio coins";
    case "RECHARGE":
      return "Top-up with card";
    case "XLM_SWAP":
      return "Swap BANDCOIN for 1 XLM";
    case "TOKEN_TRUST":
      return "Hold an artist's fan token";
    case "RESALE_LIST":
      return `Listed ${itemTitle ?? "copies"} for resale`;
    case "RESALE_CANCEL":
      return `Took ${itemTitle ?? "copies"} off sale`;
  }
}

const amountOf = (value: { toString(): string }) => toDisplay(toStroops(value));

export const walletRouter = createRouter({
  /** Gifts an artist left for this fan to claim (they didn't hold the token yet). */
  gifts: authedProcedure.query(({ ctx }) => listGifts(ctx, ctx.session.user)),
  prepareGiftClaim: authedProcedure
    .input(z.object({ balanceId: z.string().regex(/^[0-9a-f]{72}$/) }))
    .mutation(({ ctx, input }) => prepareGiftClaim(ctx, ctx.session.user, input.balanceId)),
  submitGiftClaim: authedProcedure
    .input(z.object({ balanceId: z.string().regex(/^[0-9a-f]{72}$/), xdr: z.string().min(1) }))
    .mutation(({ ctx, input }) => submitGiftClaim(ctx, ctx.session.user, input)),

  /** What went in and out of the fan's wallet through Bandcoin, newest first. */
  history: authedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const network = ctx.chain.config.name === "mainnet" ? "public" : "testnet";
    const explorer = (hash: string | null) =>
      hash ? `https://stellar.expert/explorer/${network}/tx/${hash}` : null;

    const [orders, prizes] = await Promise.all([
      ctx.db.order.findMany({
        where: { buyerId: userId, status: { in: HISTORY_STATUSES } },
        orderBy: { createdAt: "desc" },
        take: PAGE,
        select: {
          id: true,
          kind: true,
          status: true,
          currency: true,
          total: true,
          quantity: true,
          txHash: true,
          createdAt: true,
          item: { select: { title: true } },
        },
      }),
      ctx.db.bountyWinner.findMany({
        where: { userId, claimedAt: { not: null } },
        orderBy: { claimedAt: "desc" },
        take: PAGE,
        select: {
          id: true,
          prizeAmount: true,
          txHash: true,
          claimedAt: true,
          bounty: { select: { title: true, prizeCurrency: true, prizeAssetCode: true } },
        },
      }),
    ]);

    const entries = [
      ...orders.map((order) => ({
        id: order.id,
        title: orderTitle(order.kind, order.quantity, order.item?.title ?? null),
        direction: "paid" as const,
        amount: amountOf(order.total),
        currency: order.currency,
        code: order.currency as string,
        status: order.status,
        at: order.createdAt,
        explorerUrl: explorer(order.txHash),
      })),
      ...prizes.map((prize) => ({
        id: prize.id,
        title: `Bounty prize: ${prize.bounty.title}`,
        direction: "received" as const,
        amount: amountOf(prize.prizeAmount),
        /** Null for a prize in another token, such as an artist's fan token: show `code` */
        currency: prize.bounty.prizeCurrency,
        code: prize.bounty.prizeAssetCode ?? prize.bounty.prizeCurrency ?? "",
        status: "DELIVERED" as const,
        at: prize.claimedAt ?? new Date(0),
        explorerUrl: explorer(prize.txHash),
      })),
    ];
    return entries.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, PAGE);
  }),
});
