import { z } from "zod";

import { toDisplay, toStroops } from "@bandcoin/chain";
import type { OrderKind, OrderStatus } from "@bandcoin/db";

import { listGifts, prepareGiftClaim, submitGiftClaim } from "../../services/gifts/claim";
import { declineGift, undoDecline } from "../../services/gifts/decline";
import { listSentWaiting, prepareTakeBack, submitTakeBack } from "../../services/gifts/take-back";
import { cancelPurchase } from "../../services/purchase";
import { walletAssets } from "../../services/wallet/assets";
import { ownSendOrder, quoteSend, startSend, submitSend } from "../../services/wallet/send";
import { ownSwapOrder, quoteSwap, startSwap, submitSwap } from "../../services/wallet/swap";
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

type SendDetails = {
  to: string;
  username: string | null;
  code: string;
  amount: string;
  mode: "payment" | "gift" | "create";
  /** A gift nobody accepted, claimed back by the sender */
  takenBack?: { txHash: string };
};
type Breakdown = { sendDetails?: SendDetails; receive?: { currency: string; amount: string } };

const short = (address: string) => `${address.slice(0, 5)}…${address.slice(-5)}`;
const MAIN_CURRENCIES = ["BANDCOIN", "XLM", "USDC"] as const;

function orderTitle(
  kind: OrderKind,
  quantity: number,
  itemTitle: string | null,
  breakdown: Breakdown | null,
) {
  switch (kind) {
    case "ITEM_PURCHASE":
      return `Bought ${quantity > 1 ? `${quantity} × ` : ""}${itemTitle ?? "an item"}`;
    case "GIFT":
      return `Gift: ${itemTitle ?? "an item"}`;
    case "VANITY":
      return "Artist page link";
    case "RECHARGE":
      return "Top-up with card";
    case "XLM_SWAP":
    case "BANDCOIN_SWAP": {
      const receive = breakdown?.receive;
      return receive
        ? `Swapped for ${toDisplay(toStroops(receive.amount))} ${receive.currency}`
        : kind === "XLM_SWAP"
          ? "Swapped BANDCOIN for XLM"
          : "Swapped XLM for BANDCOIN";
    }
    case "SEND": {
      const send = breakdown?.sendDetails;
      if (!send) return "Sent";
      const to = send.username ? `@${send.username}` : short(send.to);
      if (send.takenBack) return `Sent to ${to} as a gift, then taken back`;
      return `Sent to ${to}${send.mode === "gift" ? " as a gift" : ""}`;
    }
    case "TOKEN_TRUST":
      return "Hold an artist's fan token";
    case "RESALE_LIST":
      return `Listed ${itemTitle ?? "copies"} for resale`;
    case "RESALE_CANCEL":
      return `Took ${itemTitle ?? "copies"} off sale`;
  }
}

const amountOf = (value: { toString(): string }) => toDisplay(toStroops(value));

const orderInput = z.object({ orderId: z.string().min(1) });
const balanceInput = z.object({ balanceId: z.string().regex(/^[0-9a-f]{72}$/) });
const amount = z.string().trim().min(1).max(24);
const sendInput = z.object({
  to: z.string().trim().min(1).max(80),
  code: z.string().regex(/^[A-Za-z0-9]{1,12}$/),
  issuer: z.string().length(56).nullable(),
  amount,
});
const swapInput = z.object({ direction: z.enum(["TO_XLM", "TO_BANDCOIN"]), amount });

/** Send XLM or a token to an address or a Bandcoin @username (services/wallet/send). */
const sendRouter = createRouter({
  quote: authedProcedure
    .input(sendInput)
    .query(({ ctx, input }) => quoteSend(ctx, ctx.session.user, input)),
  start: authedProcedure
    .input(sendInput)
    .mutation(({ ctx, input }) => startSend(ctx, ctx.session.user, input)),
  submit: authedProcedure
    .input(orderInput.extend({ xdr: z.string().min(1) }))
    .mutation(({ ctx, input }) => submitSend(ctx, ctx.session.user, input)),
  cancel: authedProcedure.input(orderInput).mutation(async ({ ctx, input }) => {
    await ownSendOrder(ctx, ctx.session.user, input.orderId);
    return cancelPurchase(ctx, ctx.session.user, input.orderId);
  }),
});

/** Swap BANDCOIN and XLM with the treasury, any amount, either way (services/wallet/swap). */
const swapRouter = createRouter({
  quote: authedProcedure
    .input(swapInput)
    .query(({ ctx, input }) => quoteSwap(ctx, ctx.session.user, input)),
  start: authedProcedure
    .input(swapInput)
    .mutation(({ ctx, input }) => startSwap(ctx, ctx.session.user, input)),
  submit: authedProcedure
    .input(orderInput.extend({ xdr: z.string().min(1) }))
    .mutation(({ ctx, input }) => submitSwap(ctx, ctx.session.user, input)),
  cancel: authedProcedure.input(orderInput).mutation(async ({ ctx, input }) => {
    await ownSwapOrder(ctx, ctx.session.user, input.orderId);
    return cancelPurchase(ctx, ctx.session.user, input.orderId);
  }),
});

export const walletRouter = createRouter({
  /** XLM (spendable and reserved) and every token in the main wallet. */
  assets: authedProcedure.query(({ ctx }) => walletAssets(ctx, ctx.session.user)),
  send: sendRouter,
  swap: swapRouter,

  /** Gifts an artist left for this fan to claim (they didn't hold the token yet). */
  gifts: authedProcedure.query(({ ctx }) => listGifts(ctx, ctx.session.user)),
  prepareGiftClaim: authedProcedure
    .input(z.object({ balanceId: z.string().regex(/^[0-9a-f]{72}$/) }))
    .mutation(({ ctx, input }) => prepareGiftClaim(ctx, ctx.session.user, input.balanceId)),
  submitGiftClaim: authedProcedure
    .input(z.object({ balanceId: z.string().regex(/^[0-9a-f]{72}$/), xdr: z.string().min(1) }))
    .mutation(({ ctx, input }) => submitGiftClaim(ctx, ctx.session.user, input)),

  /** Say no to a waiting gift: it's hidden here and the sender sees "Declined" (services/gifts/decline). */
  declineGift: authedProcedure
    .input(balanceInput)
    .mutation(({ ctx, input }) => declineGift(ctx, ctx.session.user, input.balanceId)),
  undoDecline: authedProcedure
    .input(balanceInput)
    .mutation(({ ctx, input }) => undoDecline(ctx, ctx.session.user, input.balanceId)),

  /** Tokens this user sent that nobody accepted yet: they can take them back (services/gifts/take-back). */
  sentWaiting: authedProcedure.query(({ ctx }) => listSentWaiting(ctx, ctx.session.user)),
  prepareTakeBack: authedProcedure
    .input(balanceInput)
    .mutation(({ ctx, input }) => prepareTakeBack(ctx, ctx.session.user, input.balanceId)),
  submitTakeBack: authedProcedure
    .input(balanceInput.extend({ xdr: z.string().min(1) }))
    .mutation(({ ctx, input }) => submitTakeBack(ctx, ctx.session.user, input)),

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
          breakdown: true,
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
      ...orders.map((order) => {
        const breakdown = order.breakdown as Breakdown | null;
        // A send shows what was sent (a token or XLM), not what it cost in fees.
        const sent = order.kind === "SEND" ? breakdown?.sendDetails : undefined;
        const main = sent && MAIN_CURRENCIES.find((currency) => currency === sent.code);
        return {
          id: order.id,
          title: orderTitle(order.kind, order.quantity, order.item?.title ?? null, breakdown),
          direction: "paid" as const,
          amount: amountOf(sent ? sent.amount : order.total),
          /** Null for any other token: show `code` */
          currency: sent ? (main ?? null) : order.currency,
          code: sent ? sent.code : (order.currency as string),
          status: order.status,
          at: order.createdAt,
          explorerUrl: explorer(order.txHash),
        };
      }),
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
