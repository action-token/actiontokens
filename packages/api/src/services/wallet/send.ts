import { Account, Asset, StrKey } from "@stellar/stellar-sdk";

import {
  buildTransfer,
  networkFeeXlm,
  type RechargeProblem,
  toAmount,
  toDisplay,
  toStroops,
} from "@bandcoin/chain";
import { QUOTE_TTL_SECONDS } from "@bandcoin/chain/quote";
import { spendableXlm } from "@bandcoin/chain/server";
import { AppError, ErrorCodes, isAppError } from "@bandcoin/errors";

import { type Context, isCustodial, type SessionUser } from "../../context";
import { creditLines, freeOf } from "../artist/storage-withdraw";
import { transitionOrder } from "../order-state";
import { finishPlain } from "../orders/finish";
import { failOrder, ownOrder, userSignature } from "../purchase";

/**
 * Send: XLM or any classic token from the main wallet to a Stellar address or
 * a Bandcoin @username. The sender's wallet is the source and pays everything.
 *
 *   payment  the recipient holds the token (or it's XLM to an existing account)
 *   gift     they can't hold it yet: a claimable balance they accept later (the
 *            sender can take it back until then); it holds 1 XLM of the
 *            sender's reserve, two claimants × 0.5 XLM
 *   create   XLM to an address with no account yet opens it (at least 1 XLM)
 *
 * quote → start (a SEND order + the transaction) → the sender signs → submit.
 */
export type SendInput = { to: string; code: string; issuer: string | null; amount: string };
type ServiceCtx = Pick<Context, "db" | "chain" | "activity">;
type Mode = "payment" | "gift" | "create";
type Recipient = { address: string; username: string | null; name: string | null };

const AMOUNT = /^\d{1,12}(\.\d{1,7})?$/;
const GIFT_RESERVE = toStroops("1");
const ACCOUNT_MINIMUM = toStroops("1");
const unavailable = (message: string): RechargeProblem => ({ code: "UNAVAILABLE", message });

/** `@mira` or `G…`, as a wallet address and, when it's a Bandcoin user, who. */
async function recipientOf(
  ctx: ServiceCtx,
  user: SessionUser,
  to: string,
): Promise<{ recipient: Recipient } | { problem: RechargeProblem }> {
  const text = to.trim();
  const select = { username: true, displayName: true, walletAddress: true } as const;
  if (StrKey.isValidEd25519PublicKey(text)) {
    if (text === user.walletAddress) return { problem: unavailable("That's your own wallet.") };
    const known = await ctx.db.user.findFirst({ where: { walletAddress: text }, select });
    return {
      recipient: {
        address: text,
        username: known?.username ?? null,
        name: known?.displayName ?? null,
      },
    };
  }
  const username = text.replace(/^@/, "").toLowerCase();
  if (!text.startsWith("@") || !/^[a-z0-9_.-]{1,40}$/.test(username))
    return { problem: unavailable("Enter a Stellar address (G…) or a Bandcoin @username.") };
  const found = await ctx.db.user.findUnique({ where: { username }, select });
  if (!found) return { problem: unavailable(`There's no Bandcoin user called @${username}.`) };
  if (!found.walletAddress)
    return { problem: unavailable(`@${username} doesn't have a wallet yet.`) };
  if (found.walletAddress === user.walletAddress)
    return { problem: unavailable("That's your own wallet.") };
  return {
    recipient: { address: found.walletAddress, username: found.username, name: found.displayName },
  };
}

async function prepare(ctx: ServiceCtx, user: SessionUser, input: SendInput) {
  const { chain } = ctx;
  const native = input.issuer === null;
  if (native && input.code !== "XLM")
    throw new AppError(ErrorCodes.VALIDATION_FAILED, { message: "Choose what to send." });
  const text = input.amount.trim();
  const amount = AMOUNT.test(text) ? toStroops(text) : 0n;

  const found = await recipientOf(ctx, user, input.to);
  const recipient = "recipient" in found ? found.recipient : null;
  const [mine, theirs] = await Promise.all([
    chain.loadAccount(user.walletAddress),
    recipient ? chain.loadAccount(recipient.address) : null,
  ]);
  const sameAsset = (line: { asset_code: string; asset_issuer: string }) =>
    line.asset_code === input.code && line.asset_issuer === input.issuer;
  const mode: Mode = native
    ? theirs
      ? "payment"
      : "create"
    : creditLines(theirs).some(sameAsset)
      ? "payment"
      : "gift";

  const fee = toStroops(networkFeeXlm(1, chain.config.network.baseFee));
  const reserve = mode === "gift" ? GIFT_RESERVE : 0n;
  // The XLM leaving the wallet: the fee, a gift's reserve, and the amount itself when it's XLM.
  const total = fee + reserve + (native ? amount : 0n);

  const problems: RechargeProblem[] = [];
  if ("problem" in found) problems.push(found.problem);
  else if (amount <= 0n) problems.push(unavailable("Enter an amount above zero."));
  else if (!mine) problems.push(unavailable("Your wallet needs its first XLM before it can send."));
  else if (mode === "create" && amount < ACCOUNT_MINIMUM)
    problems.push(unavailable("That account needs at least 1 XLM to open."));
  else {
    if (!native) {
      const line = creditLines(mine).find(sameAsset);
      const have = line ? freeOf(line) : 0n;
      if (amount > have)
        problems.push(
          unavailable(
            have > 0n
              ? `Your wallet has only ${toDisplay(have)} ${input.code} to send.`
              : `Your wallet holds no ${input.code}.`,
          ),
        );
    }
    const xlmHave = toStroops(spendableXlm(mine));
    if (problems.length === 0 && xlmHave < total)
      problems.push({
        code: "INSUFFICIENT_FUNDS",
        message: `You need ${toDisplay(total - xlmHave)} more XLM to send this.`,
        shortfall: {
          currency: "XLM",
          need: toDisplay(total),
          have: toDisplay(xlmHave),
          short: toDisplay(total - xlmHave),
        },
      });
  }

  const quote = {
    ok: problems.length === 0,
    problems,
    mode,
    recipient,
    asset: { code: input.code, issuer: input.issuer },
    amount: toAmount(amount),
    /** Every XLM that leaves the wallet */
    total: toAmount(total),
    lines: [
      { key: "send", label: "They get", currency: input.code, amount: toDisplay(amount) },
      ...(reserve > 0n
        ? [
            {
              key: "reserve",
              label: "Held for them until they accept (you get it back)",
              currency: "XLM",
              amount: toDisplay(reserve),
            },
          ]
        : []),
      { key: "networkFee", label: "Network fee", currency: "XLM", amount: toDisplay(fee) },
      {
        key: "total",
        label: "Leaves your wallet in XLM",
        currency: "XLM",
        amount: toDisplay(total),
      },
    ],
    expiresAt: new Date(Date.now() + QUOTE_TTL_SECONDS * 1000).toISOString(),
  };
  return { quote, mine };
}

export async function quoteSend(ctx: ServiceCtx, user: SessionUser, input: SendInput) {
  return (await prepare(ctx, user, input)).quote;
}

/** Creates the SEND order and the unsigned transaction. Nothing is signed or sent yet. */
export async function startSend(ctx: ServiceCtx, user: SessionUser, input: SendInput) {
  const { quote, mine } = await prepare(ctx, user, input);
  if (!quote.ok || !mine || !quote.recipient)
    throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, {
      message: quote.problems[0]?.message ?? "This can't go through right now.",
      details: { problems: quote.problems },
    });

  const sendDetails = {
    to: quote.recipient.address,
    username: quote.recipient.username,
    code: input.code,
    issuer: input.issuer,
    amount: quote.amount,
    mode: quote.mode,
  };
  const order = await ctx.db.order.create({
    data: {
      kind: "SEND",
      buyerId: user.id,
      currency: "XLM",
      unitPrice: quote.total,
      platformFee: "0",
      total: quote.total,
      method: "WALLET",
      quoteExpiresAt: new Date(quote.expiresAt),
      breakdown: { ...quote, sendDetails },
    },
  });
  ctx.activity.set({
    targetType: "Order",
    targetId: order.id,
    amount: quote.total,
    currency: "XLM",
  });

  const built = buildTransfer({
    sender: new Account(mine.accountId(), mine.sequenceNumber()),
    network: ctx.chain.config.network,
    to: quote.recipient.address,
    asset: input.issuer ? new Asset(input.code, input.issuer) : Asset.native(),
    amount: quote.amount,
    receiverTrusts: quote.mode === "payment",
    receiverExists: quote.mode !== "create",
    memo: order.id,
  });
  // The hash doesn't change when signatures are added, so it pins the exact transaction.
  await transitionOrder(ctx.db, order.id, "AWAITING_SIGNATURE", { txHash: built.hash });
  return {
    orderId: order.id,
    quote,
    xdr: built.xdr,
    /** Custodial accounts get the cancellable countdown; wallet users sign in their wallet */
    signer: isCustodial(user) ? ("custodial" as const) : ("wallet" as const),
  };
}

/** The viewer's send order, or "not found". */
export async function ownSendOrder(ctx: ServiceCtx, user: SessionUser, orderId: string) {
  const order = await ownOrder(ctx, user, orderId);
  if (order.kind !== "SEND")
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Order not found" });
  return order;
}

/** Sends it with the sender's signature (the server signs for custodial accounts only now). */
export async function submitSend(
  ctx: ServiceCtx,
  user: SessionUser,
  input: { orderId: string; xdr: string },
) {
  const { chain, db } = ctx;
  const order = await ownSendOrder(ctx, user, input.orderId);
  ctx.activity.set({
    targetType: "Order",
    targetId: order.id,
    amount: order.total.toString(),
    currency: order.currency,
  });
  if (order.status !== "AWAITING_SIGNATURE" || !order.txHash)
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, {
      message: `This order is already ${order.status.toLowerCase()}.`,
    });
  if (order.quoteExpiresAt && order.quoteExpiresAt < new Date()) {
    await transitionOrder(db, order.id, "FAILED", {
      failureCode: ErrorCodes.STELLAR_QUOTE_EXPIRED,
    });
    throw new AppError(ErrorCodes.STELLAR_QUOTE_EXPIRED);
  }

  const xdr = await userSignature(ctx, user, order.txHash, input.xdr);
  await transitionOrder(db, order.id, "SUBMITTED");
  try {
    const { hash } = await chain.submit(xdr);
    ctx.activity.set({ txHash: hash });
  } catch (error) {
    // A lost response may still have landed: leave it SUBMITTED for the worker to re-check.
    if (isAppError(error) && error.code === ErrorCodes.STELLAR_TX_SUBMIT_FAILED) throw error;
    await failOrder(ctx, order.id, error, null);
    throw error;
  }
  return finishPlain(ctx, order.id);
}
