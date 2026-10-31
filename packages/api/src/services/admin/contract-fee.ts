import { Account, type Transaction, TransactionBuilder } from "@stellar/stellar-sdk";

import {
  buildNftSetPlatformFee,
  type RechargeProblem,
  toAmount,
  toDisplay,
  toStroops,
} from "@bandcoin/chain";
import { QUOTE_TTL_SECONDS } from "@bandcoin/chain/quote";
import { fundsOf } from "@bandcoin/chain/server";
import { AppError, ErrorCodes, isAppError } from "@bandcoin/errors";

import { type Context, isCustodial, type SessionUser } from "../../context";
import { transitionOrder } from "../order-state";
import { failOrder, ownOrder, userSignature } from "../purchase";

/**
 * Admin › Settings › contract-NFT fee (main's platformFee router). The shared
 * nft_oz contract keeps its own fee, which every future NFT sale pays; only
 * the contract's owner may change it, with their own wallet. The admin pays
 * the network fee, sees it before signing, and the change is an order
 * (NFT_PLATFORM_FEE) like any other payment.
 */
type ServiceCtx = Pick<Context, "db" | "chain" | "activity">;
export type ContractFeeInput = { feeBps: number; treasury: string };

/** What the contract enforces now, or why it can't be read. */
export async function readContractFee(ctx: Pick<Context, "chain">) {
  if (!ctx.chain.config.nftContract)
    return { configured: false as const, onChain: null, error: "NFT_CONTRACT isn't set." };
  try {
    return { configured: true as const, onChain: await ctx.chain.nftFeeSettings(), error: null };
  } catch (error) {
    return {
      configured: true as const,
      onChain: null,
      error: isAppError(error) ? error.message : "Couldn't read the contract.",
    };
  }
}

async function prepare(ctx: ServiceCtx, user: SessionUser, input: ContractFeeInput) {
  const { chain } = ctx;
  const unavailable = (message: string) => ({
    problems: [{ code: "UNAVAILABLE", message }] satisfies RechargeProblem[],
    prepared: null,
    fee: 0n,
    funds: null as string | null,
  });
  const contract = await readContractFee(ctx);
  if (!contract.onChain || !chain.config.nftContract)
    return unavailable(contract.error ?? "Couldn't read the contract.");
  const wallet = user.walletAddress;
  if (!wallet || wallet !== contract.onChain.owner)
    return unavailable("Only the contract's owner can change its fee. Sign in with that wallet.");
  if (contract.onChain.feeBps === input.feeBps && contract.onChain.treasury === input.treasury)
    return unavailable("The contract already uses this fee and account.");

  const account = await chain.loadAccount(wallet);
  if (!account) return unavailable("Your wallet needs its first XLM before it can pay.");
  const built = buildNftSetPlatformFee({
    source: new Account(account.accountId(), account.sequenceNumber()),
    network: chain.config.network,
    contract: chain.config.nftContract,
    ...input,
  });
  try {
    const prepared = await chain.prepareContractCall(built.xdr);
    const fee = BigInt(
      (TransactionBuilder.fromXDR(prepared, chain.config.network.passphrase) as Transaction).fee,
    );
    return {
      problems: [] as RechargeProblem[],
      prepared,
      fee,
      funds: fundsOf(account, chain.config.assets).XLM,
    };
  } catch {
    return unavailable("The contract rejected this fee. Check the account and try again.");
  }
}

function price(prepared: Awaited<ReturnType<typeof prepare>>) {
  const problems = [...prepared.problems];
  if (problems.length === 0 && prepared.funds !== null) {
    const have = toStroops(prepared.funds);
    if (have < prepared.fee)
      problems.push({
        code: "INSUFFICIENT_FUNDS",
        message: `You need ${toDisplay(prepared.fee - have)} more XLM to change the fee.`,
        shortfall: {
          currency: "XLM",
          need: toDisplay(prepared.fee),
          have: toDisplay(have),
          short: toDisplay(prepared.fee - have),
        },
      });
  }
  return {
    ok: problems.length === 0,
    problems,
    total: toAmount(prepared.fee),
    lines: [
      { key: "networkFee", label: "Network fee", currency: "XLM", amount: toDisplay(prepared.fee) },
      { key: "total", label: "You pay", currency: "XLM", amount: toDisplay(prepared.fee) },
    ],
    expiresAt: new Date(Date.now() + QUOTE_TTL_SECONDS * 1000).toISOString(),
  };
}

export async function quoteContractFee(
  ctx: ServiceCtx,
  user: SessionUser,
  input: ContractFeeInput,
) {
  return price(await prepare(ctx, user, input));
}

/** Creates the order and the unsigned call. Nothing is signed or sent yet. */
export async function startContractFee(
  ctx: ServiceCtx,
  user: SessionUser,
  input: ContractFeeInput,
) {
  const prepared = await prepare(ctx, user, input);
  const quote = price(prepared);
  if (!quote.ok || !prepared.prepared)
    throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, {
      message: quote.problems[0]?.message ?? "This can't go through right now.",
      details: { problems: quote.problems },
    });
  const order = await ctx.db.order.create({
    data: {
      kind: "NFT_PLATFORM_FEE",
      buyerId: user.id,
      currency: "XLM",
      unitPrice: quote.total,
      platformFee: "0",
      total: quote.total,
      method: "WALLET",
      quoteExpiresAt: new Date(quote.expiresAt),
      breakdown: { ...quote, ...input },
    },
  });
  ctx.activity.set({
    targetType: "Order",
    targetId: order.id,
    amount: quote.total,
    currency: "XLM",
  });
  const hash = Buffer.from(
    (
      TransactionBuilder.fromXDR(
        prepared.prepared,
        ctx.chain.config.network.passphrase,
      ) as Transaction
    ).hash(),
  ).toString("hex");
  // The hash doesn't change when the admin signs, so it pins the exact transaction.
  await transitionOrder(ctx.db, order.id, "AWAITING_SIGNATURE", { txHash: hash });
  return {
    orderId: order.id,
    quote,
    xdr: prepared.prepared,
    signer: isCustodial(user) ? ("custodial" as const) : ("wallet" as const),
  };
}

export async function submitContractFee(
  ctx: ServiceCtx,
  user: SessionUser,
  input: { orderId: string; xdr?: string },
) {
  const { chain, db } = ctx;
  const order = await ownOrder(ctx, user, input.orderId);
  if (order.kind !== "NFT_PLATFORM_FEE")
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Order not found" });
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
  await transitionOrder(db, order.id, "CONFIRMED");
  await transitionOrder(db, order.id, "DELIVERED");
  return { orderId: order.id, status: "DELIVERED" as const };
}
