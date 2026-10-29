import { Account, Keypair, type Transaction, TransactionBuilder } from "@stellar/stellar-sdk";

import { buildIssuerSetup, networkFeeXlm, quoteIssuerSetup, type RechargeProblem } from "@bandcoin/chain";
import { QUOTE_TTL_SECONDS } from "@bandcoin/chain/quote";
import { encryptSecret, fundsOf } from "@bandcoin/chain/server";
import { AppError, ErrorCodes, isAppError } from "@bandcoin/errors";
import { slugFromName, validateSlug } from "@bandcoin/utils/slug";

import { type Context, isCustodial, type SessionUser } from "../../context";
import { transitionOrder } from "../order-state";
import { deliverOrder, failOrder, ownOrder, userSignature } from "../purchase";

/**
 * Becoming an artist, in two steps the artist does and one an admin does:
 *
 *   apply   → name and page address; creates the application (PENDING)
 *   pay     → the artist pays 1.5 XLM + the network fee to open their issuer
 *             account (quote → start → submit, like any wallet payment)
 *   approve → an admin reviews it (services/admin/artists)
 *
 * The issuer's key is generated here and kept encrypted by the platform, so
 * the artist never has to look after it. The artist is linked to it only once
 * the payment is on the network, which is what "paid" means everywhere else.
 */
type ServiceCtx = Pick<Context, "db" | "chain" | "activity">;

export async function applyAsArtist(
  ctx: Pick<Context, "db" | "activity">,
  user: SessionUser,
  input: { name: string; slug?: string; bio?: string },
) {
  const name = input.name.trim();
  const slug = input.slug ?? slugFromName(name);
  const problem = validateSlug(slug);
  if (problem) throw new AppError(ErrorCodes.VALIDATION_FAILED, { message: problem });

  const existing = await ctx.db.artist.findUnique({ where: { userId: user.id }, select: { id: true, status: true } });
  // A rejected artist applies again on the same row; everyone else has one page.
  if (existing && existing.status !== "REJECTED") {
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, { message: "You already have an artist page." });
  }
  const taken = await ctx.db.artist.findUnique({ where: { slug }, select: { id: true } });
  if (taken && taken.id !== existing?.id) {
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, { message: "That page address is taken" });
  }

  const details = { name, slug, bio: input.bio?.trim() || null };
  const artist = existing
    ? await ctx.db.artist.update({ where: { id: existing.id }, data: { ...details, status: "PENDING", rejectionReason: null } })
    : await ctx.db.artist.create({ data: { ...details, userId: user.id } });
  ctx.activity.set({ targetType: "Artist", targetId: artist.id });
  return { artistId: artist.id, slug };
}

async function priceOpening(ctx: ServiceCtx, user: SessionUser) {
  const { chain, db } = ctx;
  const [account, artist] = await Promise.all([
    chain.loadAccount(user.walletAddress),
    db.artist.findUnique({ where: { userId: user.id }, select: { id: true, status: true, issuerAccountId: true } }),
  ]);
  const quote = quoteIssuerSetup({
    xlmFunds: fundsOf(account, chain.config.assets).XLM,
    // one operation, paid by the artist's wallet
    networkFeeXlm: networkFeeXlm(1, chain.config.network.baseFee),
  });

  const extra: RechargeProblem[] = [];
  if (!artist || artist.status === "REJECTED") {
    extra.push({ code: "UNAVAILABLE", message: "Apply first, then you can open your artist account." });
  } else if (artist.status !== "PENDING" || artist.issuerAccountId) {
    extra.push({ code: "UNAVAILABLE", message: "Your artist account is already open." });
  } else if (!account) {
    extra.push({ code: "UNAVAILABLE", message: "Your wallet needs its first XLM before it can pay." });
  }
  // "You need 1.5 more XLM" is noise next to "apply first"
  const problems = extra.length > 0 ? extra : quote.problems;
  return {
    quote: { ...quote, problems, ok: problems.length === 0, expiresAt: new Date(Date.now() + QUOTE_TTL_SECONDS * 1000).toISOString() },
    account,
  };
}

export async function quoteIssuerOpening(ctx: ServiceCtx, user: SessionUser) {
  return (await priceOpening(ctx, user)).quote;
}

/** Creates the order and the unsigned payment. The issuer key is made (or reused from a payment that never went through). */
export async function startIssuerOpening(ctx: ServiceCtx, user: SessionUser) {
  const { quote, account } = await priceOpening(ctx, user);
  if (!quote.ok || !account) {
    throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, {
      message: quote.problems[0]?.message ?? "This can't go through right now.",
      details: { problems: quote.problems },
    });
  }

  const unused = await ctx.db.chainAccount.findFirst({ where: { ownerId: user.id, kind: "ISSUER", activatedAt: null } });
  const issuer =
    unused ??
    (await (async () => {
      const keys = Keypair.random();
      return ctx.db.chainAccount.create({
        data: { kind: "ISSUER", publicKey: keys.publicKey(), secretEncrypted: encryptSecret(keys.secret()), ownerId: user.id },
      });
    })());

  const order = await ctx.db.order.create({
    data: {
      kind: "ISSUER_SETUP",
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
  ctx.activity.set({ targetType: "Order", targetId: order.id, amount: quote.total, currency: "XLM" });

  const built = buildIssuerSetup({
    artist: new Account(account.accountId(), account.sequenceNumber()),
    network: ctx.chain.config.network,
    issuer: issuer.publicKey,
  });
  // The hash doesn't change when signatures are added, so it pins the exact transaction.
  await transitionOrder(ctx.db, order.id, "AWAITING_SIGNATURE", { txHash: built.hash });
  return {
    orderId: order.id,
    quote,
    xdr: built.xdr,
    /** Custodial artists get the cancellable countdown; wallet users sign in their wallet */
    signer: isCustodial(user) ? ("custodial" as const) : ("wallet" as const),
  };
}

/**
 * Sends the payment. `xdr` is the transaction from `start`, signed by the
 * wallet (or unsigned for a custodial account, which the server signs after the
 * countdown). The platform adds the issuer's signature, which the new account
 * must give to be created.
 */
export async function submitIssuerOpening(ctx: ServiceCtx, user: SessionUser, input: { orderId: string; xdr: string }) {
  const { chain, db } = ctx;
  const order = await ownOrder(ctx, user, input.orderId);
  if (order.kind !== "ISSUER_SETUP") throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Order not found" });
  ctx.activity.set({ targetType: "Order", targetId: order.id, amount: order.total.toString(), currency: order.currency });

  if (order.status !== "AWAITING_SIGNATURE" || !order.txHash) {
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, { message: `This order is already ${order.status.toLowerCase()}.` });
  }
  if (order.quoteExpiresAt && order.quoteExpiresAt < new Date()) {
    await transitionOrder(db, order.id, "FAILED", { failureCode: ErrorCodes.STELLAR_QUOTE_EXPIRED });
    throw new AppError(ErrorCodes.STELLAR_QUOTE_EXPIRED);
  }

  let xdr = await userSignature(ctx, user, order.txHash, input.xdr);
  // The hash matched, so the one createAccount in it is the issuer `start` made.
  const created = (TransactionBuilder.fromXDR(xdr, chain.config.network.passphrase) as Transaction).operations[0];
  const issuerKey = created?.type === "createAccount" ? created.destination : null;
  const issuer = issuerKey ? await db.chainAccount.findUnique({ where: { publicKey: issuerKey } }) : null;
  if (!issuer || issuer.ownerId !== user.id || issuer.kind !== "ISSUER" || issuer.activatedAt) {
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Order not found" });
  }
  xdr = await chain.signWithServerKeys(xdr, [issuer.publicKey]);

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

  const artist = await db.artist.findUniqueOrThrow({ where: { userId: user.id }, select: { id: true } });
  await db.$transaction(async (tx) => {
    await tx.chainAccount.update({ where: { id: issuer.id }, data: { activatedAt: new Date() } });
    await tx.artist.update({ where: { id: artist.id }, data: { issuerAccountId: issuer.id } });
  });
  return deliverOrder(ctx, order.id);
}
