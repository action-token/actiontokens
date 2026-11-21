import { Account, type Horizon, type Transaction, TransactionBuilder } from "@stellar/stellar-sdk";

import {
  buildStockStorage,
  networkFeeXlm,
  type RechargeProblem,
  toAmount,
  toDisplay,
  toStroops,
} from "@actiontokens/chain";
import { QUOTE_TTL_SECONDS, TRUSTLINE_RESERVE_XLM } from "@actiontokens/chain/quote";
import { fundsOf } from "@actiontokens/chain/server";
import { AppError, ErrorCodes, isAppError } from "@actiontokens/errors";

import { type Context, isCustodial, type SessionUser } from "../../context";
import { transitionOrder } from "../order-state";
import { finishPlain } from "../orders/finish";
import { failOrder, ownOrder, userSignature } from "../purchase";
import { minterOf } from "../purchase/sale";

/**
 * Adding copies to storage, as bandfan kept them: the artist's issuer mints
 * copies of one of their tokens into their storage account, where sales, pin
 * claims and gifts take from before minting more. The artist's wallet is the
 * source and pays the network fee, plus the 0.5 XLM reserve the first time
 * storage holds that token. Copies never go past the item's supply: what is
 * already out on the network counts.
 */
type ServiceCtx = Pick<Context, "db" | "chain" | "activity">;
type ArtistRef = { id: string; storageAccountId: string | null; issuerAccountId: string | null };
type StockInput = { itemId: string; quantity: number };
export type StockBreakdown = { itemId: string; code: string; quantity: number };

export const MAX_STOCK = 1_000_000;
const unavailable = (message: string): RechargeProblem => ({ code: "UNAVAILABLE", message });

const balanceIn = (account: Horizon.AccountResponse | null, code: string, issuer: string) => {
  const line = account?.balances.find(
    (balance) =>
      "asset_code" in balance && balance.asset_code === code && balance.asset_issuer === issuer,
  );
  return line ? line.balance : null;
};

async function loadToken(ctx: ServiceCtx, artist: ArtistRef, itemId: string) {
  const item = await ctx.db.item.findFirst({
    where: { id: itemId, organizationId: artist.id, deletedAt: null },
    select: {
      id: true,
      supply: true,
      classicToken: {
        select: {
          code: true,
          issuer: true,
          isExternal: true,
          issuerAccount: { select: { publicKey: true } },
        },
      },
      organization: {
        select: { issuerAccount: { select: { publicKey: true, activatedAt: true } } },
      },
    },
  });
  if (!item) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Item not found" });
  return item;
}

/** Copies on the network now, or null when there are too many holders to count. */
async function issuedSoFar(ctx: ServiceCtx, code: string, issuer: string) {
  const { holders, complete } = await ctx.chain.assetHolders(code, issuer);
  if (!complete) return null;
  return holders.reduce((total, holder) => total + toStroops(holder.balance), 0n);
}

async function prepare(ctx: ServiceCtx, user: SessionUser, artist: ArtistRef, input: StockInput) {
  const { chain, db } = ctx;
  const item = await loadToken(ctx, artist, input.itemId);
  const token = item.classicToken;
  const problems: RechargeProblem[] = [];

  const storage = artist.storageAccountId
    ? await db.chainAccount.findUnique({
        where: { id: artist.storageAccountId },
        select: { publicKey: true, activatedAt: true },
      })
    : null;
  const minter =
    token && !token.isExternal ? minterOf(token, item.organization?.issuerAccount ?? null) : null;

  if (!storage?.activatedAt)
    problems.push(unavailable("Open your storage account first (Settings › Accounts)."));
  else if (!token)
    problems.push(unavailable("Only items sold as Stellar tokens can be kept in storage."));
  else if (!minter)
    problems.push(
      unavailable(
        "This token wasn't issued by your Action Tokens account, so copies can't be added.",
      ),
    );

  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > MAX_STOCK)
    problems.push(
      unavailable(`Add a whole number of copies, from 1 to ${MAX_STOCK.toLocaleString("en-US")}.`),
    );

  const [account, storageAccount, issued] = await Promise.all([
    chain.loadAccount(user.walletAddress),
    storage?.activatedAt ? chain.loadAccount(storage.publicKey) : null,
    token && item.supply !== null ? issuedSoFar(ctx, token.code, token.issuer) : null,
  ]);
  if (!account)
    problems.push(
      unavailable("Your wallet needs its first XLM before it can pay the network fee."),
    );

  const inStorage = token ? balanceIn(storageAccount, token.code, token.issuer) : null;
  const openTrustline = inStorage === null;
  /** Copies that can still be made: null = no limit */
  const mintable =
    item.supply === null ? null : issued === null ? 0n : toStroops(String(item.supply)) - issued;
  if (item.supply !== null && issued === null)
    problems.push(unavailable("This token has too many holders to count what's left right now."));
  else if (mintable !== null && toStroops(String(input.quantity)) > mintable)
    problems.push(
      unavailable(
        mintable > 0n
          ? `Only ${toDisplay(mintable)} more ${mintable === toStroops("1") ? "copy" : "copies"} can be made (supply ${item.supply}).`
          : "Every copy of this item has already been made.",
      ),
    );

  const fee = toStroops(networkFeeXlm(openTrustline ? 3 : 1, chain.config.network.baseFee));
  const reserve = openTrustline ? toStroops(TRUSTLINE_RESERVE_XLM) : 0n;
  const xlm = fundsOf(account, chain.config.assets).XLM;
  if (problems.length === 0 && xlm !== null && toStroops(xlm) < fee + reserve) {
    const have = toStroops(xlm);
    problems.push({
      code: "INSUFFICIENT_FUNDS",
      message: `You need ${toDisplay(fee + reserve - have)} more XLM to add these copies.`,
      shortfall: {
        currency: "XLM",
        need: toDisplay(fee + reserve),
        have: toDisplay(have),
        short: toDisplay(fee + reserve - have),
      },
    });
  }
  return {
    item,
    token,
    storage,
    minter,
    account,
    inStorage,
    mintable,
    openTrustline,
    fee,
    reserve,
    problems,
  };
}

function priceOf(prepared: Awaited<ReturnType<typeof prepare>>) {
  const { token, inStorage, mintable, openTrustline, fee, reserve, problems } = prepared;
  const code = token?.code ?? "";
  return {
    ok: problems.length === 0,
    problems,
    total: toAmount(fee + reserve),
    lines: [
      ...(openTrustline
        ? [
            {
              key: "reserve",
              label: `Let storage hold ${code}`,
              currency: "XLM" as const,
              amount: toDisplay(reserve),
            },
          ]
        : []),
      { key: "networkFee", label: "Network fee", currency: "XLM" as const, amount: toDisplay(fee) },
      {
        key: "total",
        label: "You pay",
        currency: "XLM" as const,
        amount: toDisplay(fee + reserve),
      },
    ],
    /** What storage holds now and how many more copies can be made (null = no limit) */
    stock: {
      code: token?.code ?? null,
      inStorage: inStorage ?? "0",
      mintable: mintable === null ? null : toDisplay(mintable > 0n ? mintable : 0n),
    },
    expiresAt: new Date(Date.now() + QUOTE_TTL_SECONDS * 1000).toISOString(),
  };
}

export async function quoteStock(
  ctx: ServiceCtx,
  user: SessionUser,
  artist: ArtistRef,
  input: StockInput,
) {
  return priceOf(await prepare(ctx, user, artist, input));
}

/** Creates the order and the unsigned transaction. Nothing is signed or sent yet. */
export async function startStock(
  ctx: ServiceCtx,
  user: SessionUser,
  artist: ArtistRef,
  input: StockInput,
) {
  const prepared = await prepare(ctx, user, artist, input);
  const quote = priceOf(prepared);
  const { item, token, storage, minter, account, openTrustline } = prepared;
  if (!quote.ok || !token || !storage || !minter || !account) {
    throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, {
      message: quote.problems[0]?.message ?? "This can't go through right now.",
      details: { problems: quote.problems },
    });
  }

  const stock: StockBreakdown = { itemId: item.id, code: token.code, quantity: input.quantity };
  const order = await ctx.db.order.create({
    data: {
      kind: "STORAGE_STOCK",
      buyerId: user.id,
      itemId: item.id,
      quantity: input.quantity,
      currency: "XLM",
      unitPrice: quote.total,
      platformFee: "0",
      total: quote.total,
      method: "WALLET",
      quoteExpiresAt: new Date(quote.expiresAt),
      breakdown: { ...quote, stockDetails: stock },
    },
  });
  ctx.activity.set({
    targetType: "Order",
    targetId: order.id,
    amount: quote.total,
    currency: "XLM",
  });

  const built = buildStockStorage({
    artist: new Account(account.accountId(), account.sequenceNumber()),
    network: ctx.chain.config.network,
    storage: storage.publicKey,
    issuer: minter,
    asset: { code: token.code, issuer: token.issuer },
    amount: toAmount(toStroops(String(input.quantity))),
    openTrustline,
    memo: order.id,
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

/** Sends it: the artist's signature (wallet, or the server's after the countdown), then the issuer's and storage's. */
export async function submitStock(
  ctx: ServiceCtx,
  user: SessionUser,
  artist: ArtistRef,
  input: { orderId: string; xdr: string },
) {
  const { chain, db } = ctx;
  const order = await ownOrder(ctx, user, input.orderId);
  if (order.kind !== "STORAGE_STOCK")
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
  const stock = (order.breakdown as { stockDetails?: StockBreakdown } | null)?.stockDetails;
  if (!stock) throw new AppError(ErrorCodes.INTERNAL, { message: "This order has no copies." });

  // The keys that co-sign are looked up here, never taken from the request.
  const item = await loadToken(ctx, artist, stock.itemId);
  const minter = item.classicToken
    ? minterOf(item.classicToken, item.organization?.issuerAccount ?? null)
    : null;
  const storage = artist.storageAccountId
    ? await db.chainAccount.findUnique({
        where: { id: artist.storageAccountId },
        select: { publicKey: true },
      })
    : null;
  if (!minter || !storage)
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Order not found" });

  let xdr = await userSignature(ctx, user, order.txHash, input.xdr);
  // Storage signs only for its new trustline: Stellar refuses a signature it doesn't need.
  const opensTrustline = (
    TransactionBuilder.fromXDR(xdr, chain.config.network.passphrase) as Transaction
  ).operations.some((op) => op.type === "changeTrust");
  xdr = await chain.signWithServerKeys(
    xdr,
    opensTrustline ? [minter, storage.publicKey] : [minter],
  );

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
