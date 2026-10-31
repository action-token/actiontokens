import { Account, Keypair, type Transaction, TransactionBuilder } from "@stellar/stellar-sdk";

import {
  buildIssuerSetup,
  networkFeeXlm,
  quoteIssuerSetup,
  type RechargeProblem,
} from "@bandcoin/chain";
import { QUOTE_TTL_SECONDS } from "@bandcoin/chain/quote";
import { encryptSecret, fundsOf } from "@bandcoin/chain/server";
import { AppError, ErrorCodes, isAppError } from "@bandcoin/errors";
import { isOwnS3Url } from "@bandcoin/storage";
import { normalizeAssetCode, validateAssetCode } from "@bandcoin/utils/asset-code";
import { slugFromName, validateSlug } from "@bandcoin/utils/slug";

import { type Context, isCustodial, type SessionUser } from "../../context";
import { checkExistingToken, type TokenCheck } from "./fan-token";
import { checkOwnUrls, invalid } from "./items";
import { transitionOrder } from "../order-state";
import { deliverOrder, failOrder, ownOrder, userSignature } from "../purchase";

/**
 * Becoming an artist, in two steps the artist does and one an admin does:
 *
 *   apply   → photos, name, fan token choice and page address (the wizard,
 *             like Wadzzo's); creates the application (PENDING). The fan
 *             token is only saved here and created when an admin approves.
 *   pay     → the artist pays 1.5 XLM + the network fee to open their issuer
 *             account (quote → start → submit, like any wallet payment)
 *   approve → an admin reviews it (services/admin/artists)
 *
 * The issuer's key is generated here and kept encrypted by the platform, so
 * the artist never has to look after it. The artist is linked to it only once
 * the payment is on the network, which is what "paid" means everywhere else.
 */
type ServiceCtx = Pick<Context, "db" | "chain" | "activity">;

/** The fan token chosen while applying: a new code under their own account, or one already on Stellar. */
export type PendingFanToken =
  | { mode: "NEW"; code: string; coverUrl: string }
  | { mode: "EXISTING"; code: string; issuer: string; coverUrl: string };

export type ApplicationInput = {
  name: string;
  slug?: string;
  bio?: string;
  avatarUrl?: string;
  coverUrl?: string;
  fanToken?: PendingFanToken;
};

/** Is this page address free for this person? For the live check while they type. */
export async function checkSlug(
  ctx: Pick<Context, "db">,
  user: SessionUser,
  slug: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const problem = validateSlug(slug);
  if (problem) return { ok: false, message: problem };
  const [taken, oldName] = await Promise.all([
    ctx.db.artist.findUnique({ where: { slug }, select: { userId: true } }),
    ctx.db.artistSlugHistory.findUnique({ where: { slug }, select: { artistId: true } }),
  ]);
  if ((taken && taken.userId !== user.id) || oldName)
    return { ok: false, message: "That page address is taken" };
  return { ok: true };
}

/** Is this existing Stellar asset usable as their fan token? For the live check in the wizard. */
export async function checkToken(
  ctx: Pick<Context, "db" | "chain">,
  user: SessionUser,
  input: { code: string; issuer: string },
): Promise<TokenCheck> {
  const artist = await ctx.db.artist.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });
  return checkExistingToken(ctx, { id: artist?.id ?? "" }, input);
}

async function checkFanToken(
  ctx: Pick<Context, "db" | "chain">,
  user: SessionUser,
  token: PendingFanToken,
) {
  checkOwnUrls({ cover: token.coverUrl });
  const code = normalizeAssetCode(token.code);
  const problem = validateAssetCode(code);
  if (problem) throw invalid(problem);
  if (code.length < 4) throw invalid("Use 4 to 12 letters or numbers");
  if (token.mode === "NEW") return { mode: "NEW" as const, code, coverUrl: token.coverUrl };
  const check = await checkToken(ctx, user, { code, issuer: token.issuer });
  if (check.status !== "OK")
    throw check.status === "USED"
      ? new AppError(ErrorCodes.RESOURCE_CONFLICT, { message: check.message })
      : invalid(check.message);
  return { mode: "EXISTING" as const, code, issuer: token.issuer, coverUrl: token.coverUrl };
}

export async function applyAsArtist(
  ctx: Pick<Context, "db" | "chain" | "activity">,
  user: SessionUser,
  input: ApplicationInput,
) {
  const name = input.name.trim();
  const slug = input.slug ?? slugFromName(name);
  const problem = validateSlug(slug);
  if (problem) throw new AppError(ErrorCodes.VALIDATION_FAILED, { message: problem });
  if (input.avatarUrl !== undefined && !isOwnS3Url(input.avatarUrl))
    throw invalid("Upload your profile picture again.");
  if (input.coverUrl !== undefined && !isOwnS3Url(input.coverUrl))
    throw invalid("Upload the cover again.");

  const existing = await ctx.db.artist.findUnique({
    where: { userId: user.id },
    select: { id: true, status: true, issuerAccountId: true },
  });
  // A rejected artist applies again on the same row, and so does one who went back
  // to change something before paying; everyone else has one page.
  const canChange =
    existing &&
    (existing.status === "REJECTED" ||
      (existing.status === "PENDING" && !existing.issuerAccountId));
  if (existing && !canChange) {
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, {
      message: "You already have an artist page.",
    });
  }
  const taken = await ctx.db.artist.findUnique({ where: { slug }, select: { id: true } });
  if (taken && taken.id !== existing?.id) {
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, { message: "That page address is taken" });
  }
  const fanToken = input.fanToken ? await checkFanToken(ctx, user, input.fanToken) : undefined;

  const details = {
    name,
    slug,
    bio: input.bio?.trim() || null,
    ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
    ...(input.coverUrl !== undefined ? { coverUrl: input.coverUrl } : {}),
    ...(fanToken ? { pendingFanToken: fanToken } : {}),
  };
  const artist = existing
    ? await ctx.db.artist.update({
        where: { id: existing.id },
        data: { ...details, status: "PENDING", rejectionReason: null },
      })
    : await ctx.db.artist.create({ data: { ...details, userId: user.id } });
  ctx.activity.set({ targetType: "Artist", targetId: artist.id });
  return { artistId: artist.id, slug };
}

async function priceOpening(ctx: ServiceCtx, user: SessionUser) {
  const { chain, db } = ctx;
  const [account, artist] = await Promise.all([
    chain.loadAccount(user.walletAddress),
    db.artist.findUnique({
      where: { userId: user.id },
      select: { id: true, status: true, issuerAccountId: true },
    }),
  ]);
  const quote = quoteIssuerSetup({
    xlmFunds: fundsOf(account, chain.config.assets).XLM,
    // one operation, paid by the artist's wallet
    networkFeeXlm: networkFeeXlm(1, chain.config.network.baseFee),
  });

  const extra: RechargeProblem[] = [];
  if (!artist || artist.status === "REJECTED") {
    extra.push({
      code: "UNAVAILABLE",
      message: "Apply first, then you can open your artist account.",
    });
  } else if (artist.issuerAccountId) {
    extra.push({ code: "UNAVAILABLE", message: "Your artist account is already open." });
  } else if (artist.status === "BANNED") {
    extra.push({ code: "UNAVAILABLE", message: "Your artist account is suspended." });
  } else if (!account) {
    extra.push({
      code: "UNAVAILABLE",
      message: "Your wallet needs its first XLM before it can pay.",
    });
  }
  // "You need 1.5 more XLM" is noise next to "apply first"
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

  const unused = await ctx.db.chainAccount.findFirst({
    where: { ownerId: user.id, kind: "ISSUER", activatedAt: null },
  });
  const issuer =
    unused ??
    (await (async () => {
      const keys = Keypair.random();
      return ctx.db.chainAccount.create({
        data: {
          kind: "ISSUER",
          publicKey: keys.publicKey(),
          secretEncrypted: encryptSecret(keys.secret()),
          ownerId: user.id,
        },
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
  ctx.activity.set({
    targetType: "Order",
    targetId: order.id,
    amount: quote.total,
    currency: "XLM",
  });

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
export async function submitIssuerOpening(
  ctx: ServiceCtx,
  user: SessionUser,
  input: { orderId: string; xdr: string },
) {
  const { chain, db } = ctx;
  const order = await ownOrder(ctx, user, input.orderId);
  if (order.kind !== "ISSUER_SETUP")
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Order not found" });
  ctx.activity.set({
    targetType: "Order",
    targetId: order.id,
    amount: order.total.toString(),
    currency: order.currency,
  });

  if (order.status !== "AWAITING_SIGNATURE" || !order.txHash) {
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, {
      message: `This order is already ${order.status.toLowerCase()}.`,
    });
  }
  if (order.quoteExpiresAt && order.quoteExpiresAt < new Date()) {
    await transitionOrder(db, order.id, "FAILED", {
      failureCode: ErrorCodes.STELLAR_QUOTE_EXPIRED,
    });
    throw new AppError(ErrorCodes.STELLAR_QUOTE_EXPIRED);
  }

  let xdr = await userSignature(ctx, user, order.txHash, input.xdr);
  // The hash matched, so the one createAccount in it is the issuer `start` made.
  const created = (TransactionBuilder.fromXDR(xdr, chain.config.network.passphrase) as Transaction)
    .operations[0];
  const issuerKey = created?.type === "createAccount" ? created.destination : null;
  const issuer = issuerKey
    ? await db.chainAccount.findUnique({ where: { publicKey: issuerKey } })
    : null;
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

  const artist = await db.artist.findUniqueOrThrow({
    where: { userId: user.id },
    select: { id: true },
  });
  await db.$transaction(async (tx) => {
    await tx.chainAccount.update({ where: { id: issuer.id }, data: { activatedAt: new Date() } });
    await tx.artist.update({ where: { id: artist.id }, data: { issuerAccountId: issuer.id } });
  });
  return deliverOrder(ctx, order.id);
}
