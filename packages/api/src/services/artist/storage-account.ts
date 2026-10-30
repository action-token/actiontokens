import { Account, Keypair, type Transaction, TransactionBuilder } from "@stellar/stellar-sdk";

import {
  buildStorageSetup,
  networkFeeXlm,
  quoteStorageSetup,
  type RechargeProblem,
} from "@bandcoin/chain";
import { QUOTE_TTL_SECONDS } from "@bandcoin/chain/quote";
import { encryptSecret, fundsOf } from "@bandcoin/chain/server";
import { AppError, ErrorCodes, isAppError } from "@bandcoin/errors";

import { type Context, isCustodial, type SessionUser } from "../../context";
import { transitionOrder } from "../order-state";
import { deliverOrder, failOrder, ownOrder, userSignature } from "../purchase";

/**
 * Opening an artist's storage account: an optional balance, separate from
 * their wallet, that can pay bounty prizes. The artist pays the 2.5 XLM it
 * starts with and the network fee (quote → start → submit, like the issuer).
 * The key is made here and kept encrypted by the platform. The artist is
 * linked to it only once the payment is on the network.
 */
type ServiceCtx = Pick<Context, "db" | "chain" | "activity">;
type ArtistRef = { id: string; status: string; storageAccountId: string | null };

/** createAccount plus a trustline for BANDCOIN and one for USDC. */
const OPERATIONS = 3;

async function priceStorage(ctx: ServiceCtx, user: SessionUser, artist: ArtistRef) {
  const account = await ctx.chain.loadAccount(user.walletAddress);
  const quote = quoteStorageSetup({
    xlmFunds: fundsOf(account, ctx.chain.config.assets).XLM,
    networkFeeXlm: networkFeeXlm(OPERATIONS, ctx.chain.config.network.baseFee),
  });

  const extra: RechargeProblem[] = [];
  if (artist.storageAccountId)
    extra.push({ code: "UNAVAILABLE", message: "Your storage account is already open." });
  else if (artist.status !== "APPROVED")
    extra.push({
      code: "UNAVAILABLE",
      message: "You can open storage once your artist page is approved.",
    });
  else if (!account)
    extra.push({
      code: "UNAVAILABLE",
      message: "Your wallet needs its first XLM before it can pay.",
    });
  const problems = extra.length > 0 ? extra : quote.problems;
  return {
    quote: {
      ...quote,
      problems,
      ok: problems.length === 0,
      expiresAt: new Date(Date.now() + QUOTE_TTL_SECONDS * 1000).toISOString(),
    },
    account,
  };
}

export async function quoteStorageOpening(ctx: ServiceCtx, user: SessionUser, artist: ArtistRef) {
  return (await priceStorage(ctx, user, artist)).quote;
}

/** Creates the order and the unsigned payment; reuses a key from a payment that never went through. */
export async function startStorageOpening(ctx: ServiceCtx, user: SessionUser, artist: ArtistRef) {
  const { quote, account } = await priceStorage(ctx, user, artist);
  if (!quote.ok || !account) {
    throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, {
      message: quote.problems[0]?.message ?? "This can't go through right now.",
      details: { problems: quote.problems },
    });
  }

  const storage =
    (await ctx.db.chainAccount.findFirst({
      where: { ownerId: user.id, kind: "STORAGE", activatedAt: null },
    })) ??
    (await (async () => {
      const keys = Keypair.random();
      return ctx.db.chainAccount.create({
        data: {
          kind: "STORAGE",
          publicKey: keys.publicKey(),
          secretEncrypted: encryptSecret(keys.secret()),
          ownerId: user.id,
        },
      });
    })());

  const order = await ctx.db.order.create({
    data: {
      kind: "STORAGE_SETUP",
      buyerId: user.id,
      currency: "XLM",
      unitPrice: quote.total,
      platformFee: "0",
      total: quote.total,
      method: "WALLET",
      quoteExpiresAt: new Date(quote.expiresAt),
      breakdown: quote,
    },
  });
  ctx.activity.set({
    targetType: "Order",
    targetId: order.id,
    amount: quote.total,
    currency: "XLM",
  });

  const { bandcoin, usdc } = ctx.chain.config.assets;
  const built = buildStorageSetup({
    artist: new Account(account.accountId(), account.sequenceNumber()),
    network: ctx.chain.config.network,
    storage: storage.publicKey,
    trust: [bandcoin, usdc],
  });
  // The hash doesn't change when signatures are added, so it pins the exact transaction.
  await transitionOrder(ctx.db, order.id, "AWAITING_SIGNATURE", { txHash: built.hash });
  return {
    orderId: order.id,
    quote,
    xdr: built.xdr,
    signer: isCustodial(user) ? ("custodial" as const) : ("wallet" as const),
  };
}

/**
 * Sends the payment: the artist's signature (or the server's, for a custodial
 * account after the countdown), then storage's own, which its trustlines need.
 */
export async function submitStorageOpening(
  ctx: ServiceCtx,
  user: SessionUser,
  artist: ArtistRef,
  input: { orderId: string; xdr: string },
) {
  const { chain, db } = ctx;
  const order = await ownOrder(ctx, user, input.orderId);
  if (order.kind !== "STORAGE_SETUP")
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

  let xdr = await userSignature(ctx, user, order.txHash, input.xdr);
  // The hash matched, so the one createAccount in it is the storage `start` made.
  const created = (TransactionBuilder.fromXDR(xdr, chain.config.network.passphrase) as Transaction)
    .operations[0];
  const key = created?.type === "createAccount" ? created.destination : null;
  const storage = key ? await db.chainAccount.findUnique({ where: { publicKey: key } }) : null;
  if (!storage || storage.ownerId !== user.id || storage.kind !== "STORAGE" || storage.activatedAt)
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Order not found" });
  xdr = await chain.signWithServerKeys(xdr, [storage.publicKey]);

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

  await db.$transaction(async (tx) => {
    await tx.chainAccount.update({ where: { id: storage.id }, data: { activatedAt: new Date() } });
    await tx.artist.update({ where: { id: artist.id }, data: { storageAccountId: storage.id } });
  });
  return deliverOrder(ctx, order.id);
}
